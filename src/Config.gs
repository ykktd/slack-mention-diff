/**
 * Config.gs - shared constants and Script Properties helpers.
 */

const APP_TITLE = '未完了メンバー確認・Slackメンション作成';
const MANAGEMENT_SPREADSHEET_NAME = 'Slack Mention Diff 管理用データ';

// ブラウザタブのファビコン。setFaviconUrl はURLのパスが画像拡張子(.png等)で
// 終わることを要求するため、パスが .png で終わる公開直リンク（実体: assets/app_icon.png）を使う。
const APP_FAVICON_URL = 'https://raw.githubusercontent.com/ykktd/slack-mention-diff/main/assets/app_icon.png';

const PROP_SPREADSHEET_ID = 'SPREADSHEET_ID';
const PROP_SLACK_BOT_TOKEN = 'SLACK_BOT_TOKEN';
const PROP_SLACK_CLIENT_ID = 'SLACK_CLIENT_ID';
const PROP_SLACK_CLIENT_SECRET = 'SLACK_CLIENT_SECRET';
const PROP_SLACK_REDIRECT_URI = 'SLACK_REDIRECT_URI';
const PROP_SLACK_VERIFICATION_TOKEN = 'SLACK_VERIFICATION_TOKEN';
const PROP_SLACK_TEAM_ID = 'SLACK_TEAM_ID';
const PROP_SLACK_LINK_COMMAND = 'SLACK_LINK_COMMAND';
const PROP_SLACK_OAUTH_STATE_PREFIX = 'SLACK_OAUTH_STATE_';
const PROP_SLACK_OAUTH_DONE_PREFIX = 'SLACK_OAUTH_DONE_';

const SLACK_API_BASE = 'https://slack.com/api';
// メンバー本人ログインは Sign in with Slack（OpenID Connect）を使う。
const SLACK_OIDC_AUTHORIZE_URL = 'https://slack.com/openid/connect/authorize';
const SLACK_OIDC_TOKEN_URL = 'https://slack.com/api/openid.connect.token';
const SLACK_OIDC_SCOPES = ['openid'];
// Bot 導入（管理者が一度だけ手動で行う）用の scope。文書・参照用に残す。
const SLACK_OAUTH_BOT_SCOPES = ['users:read', 'chat:write', 'im:write', 'commands'];
const SLACK_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SLACK_USERS_PAGE_LIMIT = 200;
const DEFAULT_SLACK_LINK_COMMAND = '/mention-diff';
const DAILY_TRIGGER_FUNCTION = 'refreshSlackUsersDaily';

const SHEET_SETTINGS = 'Settings';
const SHEET_SLACK_USERS = 'SlackUsers';
const SHEET_NAME_MAP = 'NameMap';
const SHEET_USER_MAP = 'UserMap';
const SHEET_LAST_RUN = 'LastRun';
const SHEET_LOGS = 'Logs';

const LAST_RUN_SLACK_REFRESH = 'slack_users_refresh';
const LAST_RUN_MATCH = 'match';

const SHEET_HEADERS = {
  Settings: ['key', 'value', 'updated_at'],
  SlackUsers: [
    'user_id',
    'display_name',
    'real_name',
    'name',
    'normalized_display_name',
    'normalized_real_name',
    'image_url',
    'is_deleted',
    'is_bot',
    'updated_at',
  ],
  NameMap: [
    'list_name',
    'normalized_name',
    'slack_user_id',
    'slack_display_name',
    'confirmed_by',
    'confirmed_at',
    'note',
  ],
  UserMap: [
    'google_user',
    'slack_user_id',
    'slack_team_id',
    'slack_display_name',
    'connected_at',
    'last_used_at',
  ],
  LastRun: ['name', 'status', 'message', 'count', 'updated_at'],
  Logs: ['timestamp', 'level', 'event', 'message', 'details'],
};

function getScriptProperty_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setScriptProperty_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

function hasScriptProperty_(key) {
  return Boolean(getScriptProperty_(key));
}

function requireScriptProperty_(key) {
  const value = getScriptProperty_(key);
  if (!value) {
    throw new Error('Script Properties に ' + key + ' が設定されていません。');
  }
  return value;
}

function nowIso_() {
  return new Date().toISOString();
}

function toSafeMessage_(err) {
  return err && err.message ? String(err.message) : String(err);
}
