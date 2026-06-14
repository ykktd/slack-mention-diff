/**
 * Matcher.gs - list parsing, normalization, and safe Slack matching.
 */

function runMentionDiff_(payload, slackUsers) {
  const targets = parseNameLines_(payload.targetText || '');
  const completed = parseNameLines_(payload.completedText || '');
  const completedSet = new Set(completed.map(function (item) { return item.normalizedName; }));
  const targetGroups = groupByNormalizedName_(targets);
  const mentionable = [];
  const needsReview = [];
  const unmatched = [];

  Object.keys(targetGroups).forEach(function (normalizedName) {
    const group = targetGroups[normalizedName];

    if (group.length > 1) {
      const candidates = findSlackCandidates_(normalizedName, slackUsers);
      needsReview.push(makeReviewItem_('duplicate_target', normalizedName, group, candidates));
      return;
    }

    if (completedSet.has(normalizedName)) {
      return;
    }

    const target = group[0];
    const candidates = findSlackCandidates_(normalizedName, slackUsers);
    const exactCandidates = candidates.filter(function (candidate) {
      return candidate.matchStrength === 'exact';
    });

    if (exactCandidates.length === 1) {
      mentionable.push({
        key: 'mentionable:' + normalizedName + ':' + target.lineNumber,
        originalName: target.name,
        normalizedName: normalizedName,
        user: exactCandidates[0],
      });
      return;
    }

    if (candidates.length > 0) {
      needsReview.push(makeReviewItem_('candidate_review', normalizedName, group, candidates));
      return;
    }

    unmatched.push({
      key: 'unmatched:' + normalizedName + ':' + target.lineNumber,
      originalName: target.name,
      normalizedName: normalizedName,
    });
  });

  const mentionText = mentionable
    .map(function (item) {
      return '<@' + item.user.userId + '>';
    })
    .join(' ');

  return {
    summary: {
      targetCount: targets.length,
      completedCount: completed.length,
      incompleteCount: mentionable.length + needsReview.length + unmatched.length,
      mentionableCount: mentionable.length,
      needsReviewCount: needsReview.length,
      unmatchedCount: unmatched.length,
      slackUserCount: slackUsers.length,
    },
    mentionable: mentionable,
    needsReview: needsReview,
    unmatched: unmatched,
    mentionText: mentionText,
  };
}

function parseNameLines_(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(function (line, index) {
      const name = extractNameFromLine_(line);
      return {
        lineNumber: index + 1,
        rawLine: line,
        name: name,
        normalizedName: normalizePersonName_(name),
      };
    })
    .filter(function (item) {
      return item.name && item.normalizedName;
    });
}

function extractNameFromLine_(line) {
  const trimmed = String(line || '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) return '';

  const delimiter = trimmed.indexOf('\t') !== -1 ? /\t/ : /,/;
  const parts = trimmed.split(delimiter);
  for (let i = 0; i < parts.length; i += 1) {
    const value = String(parts[i] || '').trim().replace(/^"|"$/g, '');
    if (value) return value;
  }

  return '';
}

function groupByNormalizedName_(items) {
  return items.reduce(function (groups, item) {
    if (!groups[item.normalizedName]) groups[item.normalizedName] = [];
    groups[item.normalizedName].push(item);
    return groups;
  }, {});
}

function normalizePersonName_(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .trim()
    .replace(/[\s\u3000]+/g, '');
}

function normalizeSlackName_(value) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '');
  const japaneseParts = normalized.match(/[一-龯々〆ヶぁ-んァ-ンー]+/g);
  return japaneseParts ? japaneseParts.join('') : '';
}

function findSlackCandidates_(normalizedName, slackUsers) {
  const candidatesById = {};

  (slackUsers || []).forEach(function (user) {
    if (!isMatchableSlackUser_(user)) return;

    const display = user.normalized_display_name || normalizeSlackName_(user.display_name);
    const real = user.normalized_real_name || normalizeSlackName_(user.real_name);
    const exactDisplay = display && display === normalizedName;
    const exactReal = real && real === normalizedName;

    if (exactDisplay || exactReal) {
      addCandidate_(candidatesById, user, exactDisplay ? 'display_name完全一致' : 'real_name完全一致', 'exact', 100);
      return;
    }

    const contains = (display && display.indexOf(normalizedName) !== -1) ||
      (real && real.indexOf(normalizedName) !== -1) ||
      (display && normalizedName.indexOf(display) !== -1 && display.length >= 2) ||
      (real && normalizedName.indexOf(real) !== -1 && real.length >= 2);

    if (contains) {
      addCandidate_(candidatesById, user, '部分一致', 'weak', 70);
      return;
    }

    const distance = Math.min(
      display ? levenshteinDistance_(normalizedName, display) : 99,
      real ? levenshteinDistance_(normalizedName, real) : 99
    );
    const allowsSimilar = normalizedName.length >= 3 && distance <= 1;
    const allowsLongSimilar = normalizedName.length >= 4 && distance <= 2;

    if (allowsSimilar || allowsLongSimilar) {
      addCandidate_(candidatesById, user, '類似候補', 'weak', 50 - distance);
    }
  });

  return Object.keys(candidatesById)
    .map(function (userId) { return candidatesById[userId]; })
    .sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.label.localeCompare(b.label, 'ja');
    })
    .slice(0, 6);
}

function addCandidate_(candidatesById, user, matchLabel, matchStrength, score) {
  const userId = user.user_id || user.userId || '';
  if (!userId) return;

  const current = candidatesById[userId];
  if (current && current.score >= score) return;

  candidatesById[userId] = {
    userId: userId,
    displayName: user.display_name || '',
    realName: user.real_name || '',
    name: user.name || '',
    imageUrl: user.image_url || '',
    label: user.display_name || user.real_name || user.name || userId,
    matchLabel: matchLabel,
    matchStrength: matchStrength,
    score: score,
  };
}

function makeReviewItem_(reason, normalizedName, group, candidates) {
  return {
    key: 'review:' + reason + ':' + normalizedName,
    reason: reason,
    originalName: group[0].name,
    originalNames: group.map(function (item) { return item.name; }),
    normalizedName: normalizedName,
    candidates: candidates,
  };
}

function isMatchableSlackUser_(user) {
  const userId = user.user_id || user.userId || '';
  return Boolean(userId) && userId !== 'USLACKBOT' && !user.is_deleted && !user.is_bot;
}

function levenshteinDistance_(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const rows = s.length + 1;
  const cols = t.length + 1;
  const dp = [];

  for (let i = 0; i < rows; i += 1) {
    dp[i] = [i];
  }
  for (let j = 1; j < cols; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[s.length][t.length];
}
