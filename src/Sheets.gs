/**
 * Sheets.gs - bound spreadsheet setup and persistence.
 */

function ensureBoundManagementSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error(
      'バインド先スプレッドシートを取得できませんでした。スプレッドシートからApps Scriptを開いて実行してください。'
    );
  }

  setScriptProperty_(PROP_SPREADSHEET_ID, ss.getId());
  ensureSheets_(ss);
  return ss;
}

function openManagementSpreadsheet_() {
  const spreadsheetId = requireScriptProperty_(PROP_SPREADSHEET_ID);
  const ss = SpreadsheetApp.openById(spreadsheetId);
  ensureSheets_(ss);
  return ss;
}

function ensureSheets_(ss) {
  Object.keys(SHEET_HEADERS).forEach(function (sheetName) {
    ensureSheetWithHeaders_(ss, sheetName, SHEET_HEADERS[sheetName]);
  });
}

function ensureSheetWithHeaders_(ss, sheetName, headers) {
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  const width = headers.length;
  const current = sheet.getRange(1, 1, 1, width).getValues()[0];
  const needsHeader = current.join('\u0001') !== headers.join('\u0001');

  if (needsHeader) {
    sheet.getRange(1, 1, 1, width).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function getSheet_(sheetName) {
  return openManagementSpreadsheet_().getSheetByName(sheetName);
}

function upsertSetting_(key, value) {
  const sheet = getSheet_(SHEET_SETTINGS);
  const rows = sheet.getDataRange().getValues();
  const updatedAt = nowIso_();

  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i][0] === key) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([[String(value), updatedAt]]);
      return;
    }
  }

  sheet.appendRow([key, String(value), updatedAt]);
}

function writeSlackUsers_(users) {
  const sheet = getSheet_(SHEET_SLACK_USERS);
  const headers = SHEET_HEADERS[SHEET_SLACK_USERS];
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);

  if (users.length > 0) {
    const rows = users.map(function (u) {
      return [
        u.user_id,
        u.display_name,
        u.real_name,
        u.name,
        u.normalized_display_name,
        u.normalized_real_name,
        u.image_url,
        u.is_deleted,
        u.is_bot,
        u.updated_at,
      ];
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function readSlackUsers_() {
  const sheet = getSheet_(SHEET_SLACK_USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, SHEET_HEADERS[SHEET_SLACK_USERS].length).getValues();
  return values
    .filter(function (row) {
      return row[0];
    })
    .map(function (row) {
      return {
        user_id: String(row[0] || ''),
        display_name: String(row[1] || ''),
        real_name: String(row[2] || ''),
        name: String(row[3] || ''),
        normalized_display_name: String(row[4] || ''),
        normalized_real_name: String(row[5] || ''),
        image_url: String(row[6] || ''),
        is_deleted: isTruthy_(row[7]),
        is_bot: isTruthy_(row[8]),
        updated_at: String(row[9] || ''),
      };
    });
}

function countSlackUsers_() {
  const sheet = getSheet_(SHEET_SLACK_USERS);
  return Math.max(0, sheet.getLastRow() - 1);
}

function getUserMapByGoogleUser_(googleUser) {
  const sheet = getSheet_(SHEET_USER_MAP);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i += 1) {
    if (String(rows[i][0] || '') === googleUser) {
      return {
        google_user: String(rows[i][0] || ''),
        slack_user_id: String(rows[i][1] || ''),
        slack_team_id: String(rows[i][2] || ''),
        slack_display_name: String(rows[i][3] || ''),
        connected_at: String(rows[i][4] || ''),
        last_used_at: String(rows[i][5] || ''),
      };
    }
  }

  return null;
}

function upsertUserMap_(record) {
  const sheet = getSheet_(SHEET_USER_MAP);
  const rows = sheet.getDataRange().getValues();
  const now = nowIso_();
  const rowData = [
    record.google_user,
    record.slack_user_id,
    record.slack_team_id || '',
    record.slack_display_name || record.slack_user_id,
    record.connected_at || now,
    record.last_used_at || now,
  ];

  for (let i = 1; i < rows.length; i += 1) {
    if (String(rows[i][0] || '') === record.google_user) {
      rowData[4] = String(rows[i][4] || '') || rowData[4];
      sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
      return;
    }
  }

  sheet.appendRow(rowData);
}

function touchUserMapLastUsed_(googleUser) {
  const sheet = getSheet_(SHEET_USER_MAP);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i += 1) {
    if (String(rows[i][0] || '') === googleUser) {
      sheet.getRange(i + 1, 6).setValue(nowIso_());
      return;
    }
  }
}

function findCachedSlackUserById_(slackUserId) {
  return readSlackUsers_().find(function (user) {
    return user.user_id === slackUserId;
  }) || null;
}

function setLastRun_(name, status, message, count) {
  const sheet = getSheet_(SHEET_LAST_RUN);
  const rows = sheet.getDataRange().getValues();
  const updatedAt = nowIso_();
  const rowData = [name, status, message, count, updatedAt];

  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i][0] === name) {
      sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
      return;
    }
  }

  sheet.appendRow(rowData);
}

function getLastRun_(name) {
  const sheet = getSheet_(SHEET_LAST_RUN);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i][0] === name) {
      return {
        name: String(rows[i][0] || ''),
        status: String(rows[i][1] || ''),
        message: String(rows[i][2] || ''),
        count: Number(rows[i][3] || 0),
        updatedAt: String(rows[i][4] || ''),
      };
    }
  }

  return null;
}

function appendLog_(level, event, message, details) {
  const sheet = getSheet_(SHEET_LOGS);
  sheet.appendRow([nowIso_(), level, event, message, JSON.stringify(details || {})]);
}

function ensureDailyTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === DAILY_TRIGGER_FUNCTION;
  });

  if (exists) return;

  ScriptApp.newTrigger(DAILY_TRIGGER_FUNCTION)
    .timeBased()
    .everyDays(1)
    .atHour(5)
    .create();
}

function isTruthy_(value) {
  return value === true || String(value).toLowerCase() === 'true';
}
