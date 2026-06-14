/**
 * Slack.gs - Slack users.list fetching and cache refresh.
 */

function refreshSlackUsers_() {
  const ss = openManagementSpreadsheet_();
  const users = fetchSlackUsers_();
  writeSlackUsers_(users);
  setLastRun_(LAST_RUN_SLACK_REFRESH, 'success', 'Slackユーザー一覧を更新しました。', users.length);
  appendLog_('info', LAST_RUN_SLACK_REFRESH, 'Slackユーザー一覧を更新しました。', { count: users.length });

  return {
    spreadsheetUrl: ss.getUrl(),
    slackUserCount: users.length,
    lastSlackRefresh: getLastRun_(LAST_RUN_SLACK_REFRESH),
  };
}

function fetchSlackUsers_() {
  const token = requireScriptProperty_(PROP_SLACK_BOT_TOKEN);
  const updatedAt = nowIso_();
  const users = [];
  let cursor = '';

  do {
    const page = fetchSlackUsersPage_(token, cursor);
    (page.members || []).forEach(function (member) {
      users.push(toSlackUserRecord_(member, updatedAt));
    });
    cursor = (page.response_metadata && page.response_metadata.next_cursor) || '';
  } while (cursor);

  users.sort(function (a, b) {
    const aLabel = a.normalized_display_name || a.normalized_real_name || a.display_name || a.real_name || a.name;
    const bLabel = b.normalized_display_name || b.normalized_real_name || b.display_name || b.real_name || b.name;
    return aLabel.localeCompare(bLabel, 'ja');
  });

  return users;
}

function fetchSlackUsersPage_(token, cursor) {
  let url = SLACK_API_BASE + '/users.list?limit=' + SLACK_USERS_PAGE_LIMIT;
  if (cursor) {
    url += '&cursor=' + encodeURIComponent(cursor);
  }

  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + token,
    },
    muteHttpExceptions: true,
  });

  const status = res.getResponseCode();
  const body = res.getContentText();
  let json;

  try {
    json = JSON.parse(body);
  } catch (err) {
    throw new Error('Slack APIの応答を読み取れませんでした。HTTP ' + status);
  }

  if (!json.ok) {
    throw new Error('Slack users.list に失敗しました: ' + (json.error || 'unknown_error'));
  }

  return json;
}

function toSlackUserRecord_(member, updatedAt) {
  const profile = member.profile || {};
  const displayName = profile.display_name || '';
  const realName = profile.real_name || member.real_name || '';

  return {
    user_id: member.id || '',
    display_name: displayName,
    real_name: realName,
    name: member.name || '',
    normalized_display_name: normalizeSlackName_(displayName),
    normalized_real_name: normalizeSlackName_(realName),
    image_url: profile.image_48 || profile.image_72 || '',
    is_deleted: Boolean(member.deleted),
    is_bot: Boolean(member.is_bot) || member.id === 'USLACKBOT',
    updated_at: updatedAt,
  };
}

function isSlackOAuthConfigured_() {
  return Boolean(getScriptProperty_(PROP_SLACK_CLIENT_ID) && getScriptProperty_(PROP_SLACK_CLIENT_SECRET));
}

function buildSlackOAuthUrl_(googleUser) {
  const clientId = requireScriptProperty_(PROP_SLACK_CLIENT_ID);
  const state = createSlackOAuthState_(googleUser);
  const params = {
    client_id: clientId,
    scope: SLACK_OAUTH_BOT_SCOPES.join(','),
    state: state,
    redirect_uri: getSlackRedirectUri_(),
  };

  return SLACK_OAUTH_AUTHORIZE_URL + '?' + toQueryString_(params);
}

function createSlackOAuthState_(googleUser) {
  const state = Utilities.getUuid();
  setScriptProperty_(
    PROP_SLACK_OAUTH_STATE_PREFIX + state,
    JSON.stringify({
      googleUser: googleUser,
      createdAt: nowIso_(),
    })
  );
  return state;
}

function consumeSlackOAuthState_(state) {
  const key = PROP_SLACK_OAUTH_STATE_PREFIX + state;
  const raw = getScriptProperty_(key);
  if (!raw) {
    throw new Error('Slack連携の確認情報が見つかりません。もう一度連携してください。');
  }

  PropertiesService.getScriptProperties().deleteProperty(key);

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error('Slack連携の確認情報を読み取れません。もう一度連携してください。');
  }

  const createdAt = new Date(data.createdAt || 0).getTime();
  if (!createdAt || Date.now() - createdAt > SLACK_OAUTH_STATE_TTL_MS) {
    throw new Error('Slack連携の有効期限が切れました。もう一度連携してください。');
  }

  if (!data.googleUser) {
    throw new Error('Slack連携するGoogleユーザーを特定できませんでした。');
  }

  return data;
}

function completeSlackOAuth_(code, state) {
  const stateData = consumeSlackOAuthState_(state);
  const json = exchangeSlackOAuthCode_(code);
  const slackUserId = json.authed_user && json.authed_user.id;
  const teamId = json.team && json.team.id;

  if (!slackUserId) {
    throw new Error('Slack連携に成功しましたが、SlackユーザーIDを取得できませんでした。');
  }

  if (!hasScriptProperty_(PROP_SLACK_BOT_TOKEN) && json.access_token) {
    setScriptProperty_(PROP_SLACK_BOT_TOKEN, json.access_token);
  }

  const cached = findCachedSlackUserById_(slackUserId);
  const displayName = cached
    ? (cached.display_name || cached.real_name || cached.name || slackUserId)
    : slackUserId;

  upsertUserMap_({
    google_user: stateData.googleUser,
    slack_user_id: slackUserId,
    slack_team_id: teamId || '',
    slack_display_name: displayName,
    connected_at: nowIso_(),
    last_used_at: nowIso_(),
  });

  appendLog_('info', 'slack_oauth', 'Slack連携が完了しました。', {
    googleUser: stateData.googleUser,
    slackUserId: slackUserId,
    slackTeamId: teamId || '',
  });

  return {
    slackUserId: slackUserId,
    slackTeamId: teamId || '',
    slackDisplayName: displayName,
  };
}

function exchangeSlackOAuthCode_(code) {
  const clientId = requireScriptProperty_(PROP_SLACK_CLIENT_ID);
  const clientSecret = requireScriptProperty_(PROP_SLACK_CLIENT_SECRET);
  const res = UrlFetchApp.fetch(SLACK_API_BASE + '/oauth.v2.access', {
    method: 'post',
    headers: {
      Authorization: 'Basic ' + Utilities.base64Encode(clientId + ':' + clientSecret),
    },
    payload: {
      code: code,
      redirect_uri: getSlackRedirectUri_(),
    },
    muteHttpExceptions: true,
  });

  return parseSlackResponse_(res, 'Slack OAuth');
}

function sendMentionDraftToSelf(mentionText) {
  const googleUser = getCurrentGoogleUserKey_();
  const userMap = getUserMapByGoogleUser_(googleUser);
  const text = normalizeMentionDraftText_(mentionText);

  if (!userMap || !userMap.slack_user_id) {
    throw new Error('Slack連携が必要です。');
  }

  if (!text) {
    throw new Error('送信できるメンション対象者がいません。');
  }

  try {
    const dm = callSlackApi_('/conversations.open', {
      users: userMap.slack_user_id,
    });
    const channelId = dm.channel && dm.channel.id;
    if (!channelId) {
      throw new Error('Slack DMチャンネルを取得できませんでした。');
    }

    callSlackApi_('/chat.postMessage', {
      channel: channelId,
      text: text,
      unfurl_links: false,
      unfurl_media: false,
    });

    touchUserMapLastUsed_(googleUser);
    appendLog_('info', 'send_mention_draft', 'Slack DMへメンション下書きを送信しました。', {
      googleUser: googleUser,
      slackUserId: userMap.slack_user_id,
      mentionCount: text.split(/\s+/).length,
    });

    return {
      sent: true,
      slackUserId: userMap.slack_user_id,
      slackDisplayName: userMap.slack_display_name || userMap.slack_user_id,
    };
  } catch (err) {
    throw new Error(toSlackSendFailureMessage_(err));
  }
}

function callSlackApi_(path, payload) {
  const token = requireScriptProperty_(PROP_SLACK_BOT_TOKEN);
  const res = UrlFetchApp.fetch(SLACK_API_BASE + path, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: {
      Authorization: 'Bearer ' + token,
    },
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true,
  });

  return parseSlackResponse_(res, 'Slack API');
}

function parseSlackResponse_(res, label) {
  const status = res.getResponseCode();
  const body = res.getContentText();
  let json;

  try {
    json = JSON.parse(body);
  } catch (err) {
    throw new Error(label + 'の応答を読み取れませんでした。HTTP ' + status);
  }

  if (!json.ok) {
    const error = json.error || 'unknown_error';
    const e = new Error(label + 'に失敗しました: ' + error);
    e.slackError = error;
    e.httpStatus = status;
    throw e;
  }

  return json;
}

function normalizeMentionDraftText_(mentionText) {
  const raw = String(mentionText || '').trim();
  if (!raw) return '';

  const tokens = raw.split(/\s+/).filter(Boolean);
  const invalid = tokens.some(function (token) {
    return !/^<@[A-Z0-9]+>$/.test(token);
  });

  if (invalid) {
    throw new Error('送信本文はSlackユーザーIDメンションの羅列だけにしてください。');
  }

  return tokens.join(' ');
}

function toSlackSendFailureMessage_(err) {
  const code = err && err.slackError ? err.slackError : '';
  const authErrors = ['invalid_auth', 'token_revoked', 'token_expired', 'account_inactive', 'team_access_not_granted'];
  const scopeErrors = ['missing_scope', 'not_allowed_token_type', 'no_permission', 'method_not_supported_for_channel_type'];

  if (authErrors.indexOf(code) !== -1) {
    return 'Slack DMへの送信に失敗しました。\nSlack連携が切れている可能性があります。再連携してください。';
  }

  if (scopeErrors.indexOf(code) !== -1) {
    return 'Slack DMへの送信に失敗しました。\nSlack Appの権限設定を確認してください。';
  }

  return 'Slack DMへの送信に失敗しました。\n' + toSafeMessage_(err);
}

function getSlackRedirectUri_() {
  return getScriptProperty_(PROP_SLACK_REDIRECT_URI) || ScriptApp.getService().getUrl();
}

function toQueryString_(params) {
  return Object.keys(params)
    .filter(function (key) {
      return params[key] !== null && typeof params[key] !== 'undefined' && params[key] !== '';
    })
    .map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    })
    .join('&');
}
