/**
 * Code.gs - Web app entrypoints and frontend API functions.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('メンション抽出')
    .addItem('① 初回セットアップ', 'setupFromMenu')
    .addItem('② Slackユーザー一覧を更新', 'refreshSlackUsersFromMenu')
    .addSeparator()
    .addItem('セットアップ状況を確認', 'showSetupStatus')
    .addItem('Slack Token設定手順を見る', 'showSlackTokenGuide')
    .addItem('Webアプリのデプロイ手順を見る', 'showDeployGuide')
    .addToUi();
}

function doGet(e) {
  if (isSlackOAuthCallback_(e)) {
    return renderSlackOAuthCallback_(e);
  }

  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_TITLE)
    .setFaviconUrl(APP_FAVICON_URL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function doPost(e) {
  return handleSlackLinkCommand_(e);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setup() {
  const ss = ensureBoundManagementSpreadsheet_();
  ensureDailyTrigger_();
  upsertSetting_('setup_completed_at', nowIso_());
  upsertSetting_('spreadsheet_id', ss.getId());
  appendLog_('info', 'setup', 'バインド先スプレッドシートへの初回セットアップが完了しました。', {
    spreadsheetId: ss.getId(),
  });

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    message: 'セットアップが完了しました。Slackユーザー一覧を更新してからWebアプリを開いてください。',
  };
}

function setupFromMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    const result = setup();
    ui.alert(
      'セットアップ完了',
        'このスプレッドシートを管理用データ置き場として設定しました。\n\n' +
        '次にやること：\n' +
        '1. 必要なら「Slack Token設定手順を見る」で設定場所を確認\n' +
        '2. メニュー「メンション抽出」→「② Slackユーザー一覧を更新」\n' +
        '3. WebアプリをデプロイしてURLを共有\n\n' +
        '管理用スプレッドシートID:\n' +
        result.spreadsheetId,
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert('セットアップに失敗しました', toSafeMessage_(err), ui.ButtonSet.OK);
  }
}

function refreshSlackUsersFromMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    const result = refreshSlackUsers_();
    ui.alert(
      'Slackユーザー一覧を更新しました',
        '取得したユーザー数: ' + result.slackUserCount + '人\n\n' +
        'Webアプリを開いて、対象者リストと完了者リストを照合できます。',
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert(
      'Slackユーザー一覧を更新できませんでした',
      toSafeMessage_(err) + '\n\n' +
        'SLACK_BOT_TOKEN が設定されているか、Slack Appに users:read scope があるか確認してください。',
      ui.ButtonSet.OK
    );
  }
}

function showSetupStatus() {
  const ui = SpreadsheetApp.getUi();
  const active = SpreadsheetApp.getActiveSpreadsheet();
  const activeId = active ? active.getId() : '取得できませんでした';
  const storedId = getScriptProperty_(PROP_SPREADSHEET_ID) || '未設定';
  const tokenStatus = hasScriptProperty_(PROP_SLACK_BOT_TOKEN) ? '設定済み' : '未設定';
  const oauthStatus = isSlackOAuthConfigured_() ? '設定済み' : '未設定';
  let lastRefresh = '未更新';
  let userCount = 0;

  try {
    if (hasScriptProperty_(PROP_SPREADSHEET_ID)) {
      const last = getLastRun_(LAST_RUN_SLACK_REFRESH);
      lastRefresh = last && last.updatedAt ? last.updatedAt : '未更新';
      userCount = countSlackUsers_();
    }
  } catch (err) {
    lastRefresh = '確認できませんでした: ' + toSafeMessage_(err);
  }

  ui.alert(
    'セットアップ状況',
    'バインド先スプレッドシートID:\n' + activeId + '\n\n' +
      'Script Properties の SPREADSHEET_ID:\n' + storedId + '\n\n' +
      'SLACK_BOT_TOKEN: ' + tokenStatus + '\n' +
      'Slack OAuth: ' + oauthStatus + '\n' +
      'Slackユーザー一覧: ' + userCount + '人\n' +
      '最終更新: ' + lastRefresh,
    ui.ButtonSet.OK
  );
}

function showSlackTokenGuide() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Slack Token設定手順',
    '1. スプレッドシート上部「拡張機能」→「Apps Script」を開く\n' +
      '2. 左側の歯車アイコン「プロジェクトの設定」を開く\n' +
      '3. 「スクリプト プロパティ」で「スクリプト プロパティを追加」を押す\n' +
      '4. プロパティ: SLACK_BOT_TOKEN\n' +
      '5. 値: Slack AppのBot User OAuth Token（xoxb-...）\n\n' +
      'OAuth連携も使う場合は SLACK_CLIENT_ID / SLACK_CLIENT_SECRET / SLACK_REDIRECT_URI も設定します。\n' +
      'Slash Commandも使う場合は SLACK_VERIFICATION_TOKEN も設定します。\n' +
      'Slack App側では Bot Token Scopes に users:read, chat:write, im:write, commands が必要です。',
    ui.ButtonSet.OK
  );
}

function showDeployGuide() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Webアプリのデプロイ手順',
    'claspを使う場合:\n' +
      '1. clasp push\n' +
      '2. clasp version "Update Slack Mention Diff"\n' +
      '3. clasp deployments\n' +
      '4. clasp deploy -i <deploymentId> -V <versionNumber> -d "Update Slack Mention Diff"\n\n' +
      'Webアプリ設定:\n' +
      '次のユーザーとして実行: 自分\n' +
      'アクセスできるユーザー: 全員（匿名ユーザーを含む）\n\n' +
      '既存URLを維持する場合は、既存WebアプリのdeploymentIdを指定してください。',
    ui.ButtonSet.OK
  );
}

function handleSlackLinkCommand_(e) {
  const params = (e && e.parameter) || {};

  try {
    validateSlackLinkCommandRequest_(params);
    postSlackCommandResponse_(params.response_url, {
      response_type: 'ephemeral',
      text: buildSlackLinkCommandText_(getSlackRedirectUri_()),
      unfurl_links: false,
      unfurl_media: false,
    });
  } catch (err) {
    console.error('handleSlackLinkCommand_ failed: ' + ((err && err.stack) || err));
    try {
      if (params.response_url) {
        postSlackCommandResponse_(params.response_url, {
          response_type: 'ephemeral',
          text:
            'このコマンドを実行できませんでした。\n' +
            '管理者にSlash CommandのRequest URL、Verification Token、Team ID設定を確認してもらってください。',
        });
      }
    } catch (postErr) {
      console.error('postSlackCommandResponse_ failed: ' + ((postErr && postErr.stack) || postErr));
    }
  }

  return createSlackEmptyCommandResponse_();
}

function validateSlackLinkCommandRequest_(params) {
  // GAS doPost does not expose Slack request-signing headers, so use the legacy token plus optional team ID.
  const expectedCommand = getSlackLinkCommand_();
  const expectedToken = getScriptProperty_(PROP_SLACK_VERIFICATION_TOKEN);
  const expectedTeamId = getScriptProperty_(PROP_SLACK_TEAM_ID);

  if (!expectedToken) {
    throw new Error('Script Properties に ' + PROP_SLACK_VERIFICATION_TOKEN + ' が設定されていません。');
  }

  if (!params.command || params.command !== expectedCommand) {
    throw new Error('想定外のSlackコマンドです: ' + (params.command || '(empty)'));
  }

  if (!params.token || params.token !== expectedToken) {
    throw new Error('Slack Slash Commandの検証に失敗しました。');
  }

  if (!params.response_url) {
    throw new Error('Slack response_url がありません。');
  }

  if (expectedTeamId && params.team_id !== expectedTeamId) {
    throw new Error('許可されていないSlackワークスペースです: ' + (params.team_id || '(empty)'));
  }
}

function getSlackLinkCommand_() {
  return getScriptProperty_(PROP_SLACK_LINK_COMMAND) || DEFAULT_SLACK_LINK_COMMAND;
}

function buildSlackLinkCommandText_(appUrl) {
  return (
    '*' + APP_TITLE + '*\n' +
    '下のリンクから開いてください。\n' +
    '対象者リストと完了者リストを照合し、未完了メンバーのSlackメンション下書きを自分のDMへ送れます。\n' +
    '<' + appUrl + '|ツールを開く>'
  );
}

function postSlackCommandResponse_(responseUrl, payload) {
  const url = String(responseUrl || '');
  if (!/^https:\/\/hooks\.slack\.com\/commands\//.test(url)) {
    throw new Error('Slack response_url が不正です。');
  }

  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

function createSlackEmptyCommandResponse_() {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

function refreshSlackUsersDaily() {
  try {
    return refreshSlackUsers_();
  } catch (err) {
    try {
      setLastRun_(LAST_RUN_SLACK_REFRESH, 'error', toSafeMessage_(err), 0);
      appendLog_('error', LAST_RUN_SLACK_REFRESH, toSafeMessage_(err), {});
    } catch (logErr) {
      console.error(logErr);
    }
    throw err;
  }
}

function apiBootstrap() {
  return guardApi_('apiBootstrap', function () {
    const spreadsheetId = getScriptProperty_(PROP_SPREADSHEET_ID);
    const slackTokenConfigured = hasScriptProperty_(PROP_SLACK_BOT_TOKEN);
    const slackOAuthConfigured = isSlackOAuthConfigured_();
    const currentGoogleUser = getCurrentGoogleUserKeySafely_();
    const rosterUrl = getScriptProperty_(PROP_ROSTER_URL) || '';

    if (!spreadsheetId) {
      return {
        ok: true,
        setupComplete: false,
        slackTokenConfigured: slackTokenConfigured,
        slackOAuthConfigured: slackOAuthConfigured,
        slackConnected: false,
        currentGoogleUser: currentGoogleUser,
        slackUserCount: 0,
        lastSlackRefresh: null,
        rosterUrl: rosterUrl,
      };
    }

    const ss = openManagementSpreadsheet_();
    ensureSheets_(ss);
    const lastSlackRefresh = getLastRun_(LAST_RUN_SLACK_REFRESH);
    const userMap = currentGoogleUser ? getUserMapByGoogleUser_(currentGoogleUser) : null;
    const expectedTeamId = getScriptProperty_(PROP_SLACK_TEAM_ID);
    const slackConnected = Boolean(
      userMap && userMap.slack_user_id && expectedTeamId && userMap.slack_team_id === expectedTeamId
    );

    return {
      ok: true,
      setupComplete: true,
      spreadsheetId: spreadsheetId,
      spreadsheetUrl: ss.getUrl(),
      slackTokenConfigured: slackTokenConfigured,
      slackOAuthConfigured: slackOAuthConfigured,
      slackConnected: slackConnected,
      slackDisplayName: slackConnected ? userMap.slack_display_name : '',
      currentGoogleUser: currentGoogleUser,
      // 名簿件数はログイン済みのときだけ返す（未ログインへ情報量を絞る）。
      slackUserCount: slackConnected ? countSlackUsers_() : 0,
      lastSlackRefresh: slackConnected ? lastSlackRefresh : null,
      rosterUrl: rosterUrl,
    };
  });
}

function apiRefreshSlackUsers() {
  return guardApi_('apiRefreshSlackUsers', function () {
    requireSlackMember_();
    const result = refreshSlackUsers_();
    return Object.assign({ ok: true }, result);
  });
}

function apiRunMatch(payload) {
  return guardApi_('apiRunMatch', function () {
    requireSlackMember_();
    const users = readSlackUsers_();
    const result = runMentionDiff_(payload || {}, users);
    setLastRun_(
      LAST_RUN_MATCH,
      'success',
      '照合を実行しました。',
      result.summary ? result.summary.incompleteCount : 0
    );
    appendLog_('info', LAST_RUN_MATCH, '照合を実行しました。', result.summary || {});
    return { ok: true, result: result };
  });
}

function apiStartSlackOAuth() {
  return guardApi_('apiStartSlackOAuth', function () {
    const googleUser = getCurrentGoogleUserKey_();
    if (!hasScriptProperty_(PROP_SPREADSHEET_ID)) {
      throw new Error('初回セットアップが未完了です。');
    }
    if (!isSlackOAuthConfigured_()) {
      throw new Error('Slack OAuth設定が未完了です。SLACK_CLIENT_ID と SLACK_CLIENT_SECRET を設定してください。');
    }

    return {
      ok: true,
      url: buildSlackOAuthUrl_(googleUser),
    };
  });
}

function apiSendMentionDraftToSelf(payload) {
  return guardApi_('apiSendMentionDraftToSelf', function () {
    const result = sendMentionDraftToSelf(payload && payload.mentionText);
    return Object.assign({ ok: true }, result);
  });
}

function guardApi_(label, fn) {
  try {
    return fn();
  } catch (err) {
    console.error(label + ' failed: ' + ((err && err.stack) || err));
    throw new Error(toSafeMessage_(err));
  }
}

function isSlackOAuthCallback_(e) {
  const params = (e && e.parameter) || {};
  return Boolean(params.code || params.state || params.error);
}

function renderSlackOAuthCallback_(e) {
  const params = (e && e.parameter) || {};
  let title = 'Slackログインが完了しました';
  let message = '画面に戻ると、未完了メンバーの確認とメンション作成を使えます。';
  let ok = true;

  try {
    if (params.error) {
      throw new Error('Slackログインがキャンセルまたは拒否されました: ' + params.error);
    }
    completeSlackOAuth_(params.code, params.state);
  } catch (err) {
    ok = false;
    title = 'Slackログインに失敗しました';
    message = toSafeMessage_(err);
  }

  const appUrl = ScriptApp.getService().getUrl();
  const html =
    '<!doctype html><html lang="ja"><head><base target="_top">' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + escapeHtml_(title) + '</title>' +
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f0ede8;color:#1a1a1a;font-family:sans-serif}' +
    '.box{max-width:520px;margin:24px;padding:24px;border:1px solid #e0dbd2;border-radius:12px;background:#fff}' +
    'h1{margin:0 0 8px;color:' + (ok ? '#3d6b52' : '#c0392b') + ';font-size:22px}p{margin:0 0 16px;color:#777;white-space:pre-line}' +
    'a{color:#3d6b52;font-weight:700}</style></head><body><main class="box">' +
    '<h1>' + escapeHtml_(title) + '</h1>' +
    '<p>' + escapeHtml_(message) + '</p>' +
    '<a target="_blank" rel="noopener" href="' + escapeHtml_(appUrl) + '">アプリを開く</a>' +
    '</main></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getCurrentGoogleUserKey_() {
  const email = Session.getActiveUser().getEmail();
  if (email) return email;

  const temporaryKey = Session.getTemporaryActiveUserKey();
  if (temporaryKey) return 'temp:' + temporaryKey;

  throw new Error('Googleユーザーを識別できませんでした。GoogleアカウントでWebアプリを開いてください。');
}

function getCurrentGoogleUserKeySafely_() {
  try {
    return getCurrentGoogleUserKey_();
  } catch (err) {
    return '';
  }
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
