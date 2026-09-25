// VaultOne — Google Sheets Web App Backend
// ─────────────────────────────────────────
// SETUP (one-time):
//   1. Open your VaultOne Google Sheet
//   2. Extensions → Apps Script → paste this entire file → Save (Ctrl+S)
//   3. Run  setupSheets()  once  (Run menu → Run function → setupSheets)
//      This creates all required tabs with header rows.
//   4. Deploy → New deployment → Web App
//      Execute as: Me  |  Who has access: Anyone
//   5. Copy the /exec URL → paste in VaultOne Settings → Web App URL field
//
// After any Code.gs change:
//   Deploy → Manage deployments → pencil icon → New version → Deploy
//   (The /exec URL stays the same.)

// ── Sheet tab names ───────────────────────────────────────────────────────────
// Tab order in the spreadsheet matches this object's key order.
// Meta / settings sheets are placed last so data sheets are immediately visible.
var S = {
  // iVault stores
  INCOME:       'Income',
  EXPENSES:     'Expenses',
  BUDGETS:      'Budgets',
  INVESTMENTS:  'Investments',
  LOANS:        'Loans',
  CASH_WALLETS: 'CashWallets',

  // FamilyVault stores
  PERSONS:      'Persons',
  HOUSEHOLDS:   'Households',
  VEHICLES:     'Vehicles',
  DOCUMENTS:    'Documents',

  // PasswordVault stores
  PASSWORDS:    'Passwords',

  // Shared across all apps
  REMINDERS:    'Reminders',
  NOTES:        'Notes',
  ACTIVITY:     'ActivityLog',

  // Per-app settings (one row per key) — kept last
  META_IVAULT:    '_Meta_iVault',
  META_FAMILY:    '_Meta_FamilyVault',
  META_PASSWORD:  '_Meta_PasswordVault',
};

// ── Column definitions ───────────────────────────────────────────────────────
// Rules:
//   1. Column order matches the logical reading order for a human in the sheet.
//   2. Identity / audit columns (id, createdAt, updatedAt / modifiedAt) are
//      always first and last respectively.
//   3. Every field name must exactly match the key used in the JS putOne() call.
//   4. JSON-serialised array/object columns are listed in _JSON_COLS below.
var COLS = {

  // ── iVault ────────────────────────────────────────────────────────────────

  // Income transactions
  INCOME: [
    'id',
    'date',        // YYYY-MM-DD
    'type',        // Salary | Shift Allowance | Interest | Dividend | Other Income
    'amount',
    'note',
    'createdAt',
    'updatedAt'    // set on edit
  ],

  // Expense transactions
  EXPENSES: [
    'id',
    'date',        // YYYY-MM-DD
    'category',    // BUDGET_CATS value
    'subcategory',
    'amount',
    'note',
    'walletId',    // linked cash-wallet id (optional)
    'createdAt'
  ],

  // Monthly budgets — one row per YYYY-MM
  BUDGETS: [
    'id',
    'month',       // YYYY-MM
    'categories',  // JSON object { "Household": 5000, "Household.Rent": 3000, … }
    'createdAt',
    'updatedAt'
  ],

  // Investments — covers FD, RD, PPF, SSA, NPS, Demat, Gold, Insurance, Other Saving
  INVESTMENTS: [
    'id',
    'type',              // FD | RD | PPF | SSA | NPS | Demat | Gold | Insurance | Other Saving
    'name',
    'provider',          // bank / insurer / broker name
    'bankName',          // alias kept for legacy records
    'accountNumber',     // policy / account / folio number
    'holderName',        // account holder (NPS)
    'tier',              // NPS tier: Tier I | Tier II
    'currentValue',
    'investedValue',     // Demat: total amount invested
    'purchaseValue',     // Gold / Demat: purchase cost
    'interestRate',
    'startDate',
    'maturityDate',
    'monthlyInstalment', // RD monthly deposit amount
    'grams',             // Gold: weight in grams
    'goldType',          // Gold: Coin | Jewellery
    'goldRate',          // Gold: purchase price per gram
    'makingCharge',      // Gold: making charge
    'gstRate',           // Gold: GST %
    'premiumAmount',     // Insurance: premium amount
    'premiumFrequency',  // Insurance: Monthly | Quarterly | Half-Yearly | Yearly
    'premiumDueDate',    // Insurance: next due date YYYY-MM-DD
    'notes',
    'payments',          // JSON array — premium payments / top-ups / EMIs
    'contributions',     // JSON array — NPS contribution entries
    'valueUpdates',      // JSON array — NPS corpus value snapshots
    'createdAt',
    'updatedAt'
  ],

  // Loans
  LOANS: [
    'id',
    'loanType',      // Personal Loan | Home Loan | Vehicle Loan | Gold Loan | Education Loan | Other
    'name',          // lender / loan label
    'principal',
    'interestRate',
    'outstanding',   // current outstanding balance
    'emi',           // monthly EMI amount
    'dueDate',       // next EMI due date YYYY-MM-DD
    'status',        // Active | Settled
    'notes',
    'payments',      // JSON array — EMI payment history
    'createdAt',
    'updatedAt'
  ],

  // Cash wallets — petty-cash / purpose wallets
  // movements is a JSON array of { id, type, amount, purpose, date, createdAt }
  CASH_WALLETS: [
    'id',
    'name',
    'category',
    'subcategory',
    'balance',
    'movements',   // JSON array
    'createdAt'
  ],

  // ── FamilyVault ───────────────────────────────────────────────────────────

  // Family members
  PERSONS: [
    'id',
    'name',
    'relation',      // Member | Spouse | Child | Parent …
    'householdId',
    'householdName',
    'dob',           // YYYY-MM-DD
    'gender',        // Male | Female | Other
    'status',        // Active | Inactive
    'createdAt',
    'modifiedAt'
  ],

  // Households
  HOUSEHOLDS: [
    'id',
    'name',
    'description',
    'address',
    'createdAt',
    'modifiedAt'
  ],

  // Vehicles
  VEHICLES: [
    'id',
    'type',               // Car | Bike | Scooter | Commercial | Other
    'name',               // nickname
    'registrationNumber',
    'make',
    'model',
    'year',
    'ownerPersonId',
    'ownerPersonName',
    'notes',
    'createdAt',
    'modifiedAt'
  ],

  // Documents — fileBlob / fileBytes stripped by FamilyVault.js before putOne
  // ownerType: Person | Household | Vehicle
  DOCUMENTS: [
    'id',
    'title',
    'type',           // Aadhaar | PAN | Passport | Driving Licence | …
    'ownerType',      // Person | Household | Vehicle
    'personId',
    'personName',
    'householdId',
    'householdName',
    'vehicleId',
    'vehicleName',
    'documentNumber',
    'issueDate',
    'expiryDate',
    'notes',
    'createdAt',
    'modifiedAt'
  ],

  // ── PasswordVault ─────────────────────────────────────────────────────────

  // AES-GCM 256-bit encrypted entries — { id, salt, iv, cipher }
  PASSWORDS: [
    'id',
    'salt',
    'iv',
    'cipher',
    'createdAt',
    'updatedAt'
  ],

  // ── Shared ────────────────────────────────────────────────────────────────

  // Reminders (manual + auto-generated)
  REMINDERS: [
    'id',
    'title',
    'date',          // YYYY-MM-DD
    'time',          // HH:MM
    'priority',      // Normal | Medium | High
    'description',
    'completed',     // boolean
    'repeat',        // yearly (birthday reminders)
    'source',        // birthday | loan | insurance | password
    'loanId',
    'investmentId',
    'personId',
    'passwordId',
    'createdAt'
  ],

  // Notes
  NOTES: [
    'id',
    'title',
    'body',
    'format',        // text | checklist | table
    'createdAt',
    'updatedAt'
  ],

  // Activity log
  ACTIVITY: [
    'id',
    'type',
    'text',
    'createdAt'
  ],

  // ── Per-app settings (one row per key) — kept last ──────────────────────────
  META_IVAULT:   ['id', 'key', 'value'],
  META_FAMILY:   ['id', 'key', 'value'],
  META_PASSWORD: ['id', 'key', 'value'],

};

// ── Store-name → COLS key lookup ──────────────────────────────────────────────
// Handles every name the JS files and migrate tool might send.
// Keys are always lowercase for case-insensitive matching.
var _ALIAS = {
  // meta variants
  'meta':                  'META_IVAULT',
  '_meta':                 'META_IVAULT',
  '_meta_ivault':          'META_IVAULT',
  '_meta_familyvault':     'META_FAMILY',
  '_meta_passwordvault':   'META_PASSWORD',
  'meta_ivault':           'META_IVAULT',
  'meta_familyvault':      'META_FAMILY',
  'meta_passwordvault':    'META_PASSWORD',

  // iVault
  'income':        'INCOME',
  'expenses':      'EXPENSES',
  'budgets':       'BUDGETS',
  'investments':   'INVESTMENTS',
  'loans':         'LOANS',
  'cashwallets':   'CASH_WALLETS',  // JS uses camelCase 'cashWallets'
  'cash_wallets':  'CASH_WALLETS',

  // FamilyVault
  'persons':       'PERSONS',
  'households':    'HOUSEHOLDS',
  'vehicles':      'VEHICLES',
  'documents':     'DOCUMENTS',

  // PasswordVault
  'passwords':     'PASSWORDS',

  // Shared
  'reminders':     'REMINDERS',
  'notes':         'NOTES',
  'activity':      'ACTIVITY',
  'activitylog':   'ACTIVITY',
};

// ── Columns whose values are serialised as JSON strings in the sheet ──────────
var _JSON_COLS = {
  'categories':   true,
  'payments':     true,
  'contributions':true,
  'valueUpdates': true,
  'movements':    true,
};

// ── Spreadsheet accessor ──────────────────────────────────────────────────────
function _ss() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  throw new Error(
    'No spreadsheet linked.\n' +
    'Open your VaultOne Google Sheet → Extensions → Apps Script → paste code → Run setupSheets().\n' +
    'Do NOT run from script.google.com directly.'
  );
}

// ── Nuclear reset — deletes ALL known sheets and rebuilds from scratch ────────
// WARNING: This permanently deletes all data in the spreadsheet.
// Use only for a fresh start. Run once from Apps Script editor.
function resetAndRebuildSheets() {
  var ss = _ss();
  var allSheets = ss.getSheets();

  // Must keep at least one sheet — insert a temp sheet first
  var temp = ss.insertSheet('_temp_');

  // Delete every existing sheet
  allSheets.forEach(function(sh) {
    try { ss.deleteSheet(sh); } catch(e) {}
  });

  // Rebuild all sheets in S order
  Object.keys(S).forEach(function(key) {
    var name = S[key];
    var cols = COLS[key];
    var sh = ss.insertSheet(name);
    sh.appendRow(cols);
    sh.getRange(1, 1, 1, cols.length)
      .setBackground('#6d28d9')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, cols.length);
  });

  // Remove the temp sheet
  try { ss.deleteSheet(ss.getSheetByName('_temp_')); } catch(e) {}

  Logger.log('resetAndRebuildSheets complete. ' + Object.keys(S).length + ' sheets created.');
  Logger.log('Sheet order: ' + Object.keys(S).map(function(k) { return S[k]; }).join(', '));
  Logger.log('Next step: Deploy → Manage deployments → New version → Deploy');
}

// ── One-time setup ────────────────────────────────────────────────────────────
function setupSheets() {
  var ss = _ss();
  var created = [], existing = [];

  Object.keys(S).forEach(function(key) {
    var name = S[key];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      created.push(name);
    } else {
      existing.push(name);
    }
    // Write header only if sheet is empty
    if (sh.getLastRow() === 0) {
      var cols = COLS[key];
      sh.appendRow(cols);
      sh.getRange(1, 1, 1, cols.length)
        .setBackground('#6d28d9')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
      sh.setFrozenRows(1);
      sh.autoResizeColumns(1, cols.length);
    }
  });

  // Remove the default blank Sheet1 if it exists and is empty
  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() <= 1) {
    try { ss.deleteSheet(def); } catch(e) {}
  }

  // Patch any existing sheets whose headers are missing new columns
  _patchSheetHeaders();

  Logger.log('setupSheets complete.');
  Logger.log('Created: ' + (created.length ? created.join(', ') : 'none'));
  Logger.log('Already existed: ' + (existing.length ? existing.join(', ') : 'none'));
  Logger.log('Total sheets: ' + Object.keys(S).length);
  Logger.log('Next step: Deploy → New deployment → Web App (Execute as: Me, Access: Anyone)');
}

// Reorders columns in existing sheets to match COLS definition order.
// Also adds any missing columns. Safe to run on sheets with data.
function reorderSheetColumns() {
  var ss = _ss();
  var report = [];
  Object.keys(S).forEach(function(key) {
    var name = S[key];
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() === 0) return;
    var expected = COLS[key];
    if (!expected || !expected.length) return;

    var lastCol = sh.getLastColumn();
    var lastRow = sh.getLastRow();

    // Read entire sheet (header + data)
    var allData = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var currentHeader = allData[0].map(function(v) { return String(v).trim(); });

    // Build a map: colName → column index (0-based) in current sheet
    var colIndex = {};
    currentHeader.forEach(function(col, i) { if (col) colIndex[col] = i; });

    // Determine final column list: expected cols first, then any extra cols not in expected
    var extraCols = currentHeader.filter(function(col) {
      return col && expected.indexOf(col) === -1;
    });
    var finalCols = expected.concat(extraCols);

    // Check if already in correct order (skip if nothing to do)
    var alreadyOrdered = finalCols.every(function(col, i) {
      return currentHeader[i] === col;
    }) && finalCols.length === currentHeader.filter(function(c) { return c; }).length;
    if (alreadyOrdered) return;

    // Build new data array with columns in finalCols order
    var newData = allData.map(function(row, rowIdx) {
      return finalCols.map(function(col, colIdx) {
        if (rowIdx === 0) return col; // header row
        var srcIdx = colIndex[col];
        return (srcIdx !== undefined) ? row[srcIdx] : '';
      });
    });

    // Clear sheet and rewrite
    sh.clearContents();
    sh.getRange(1, 1, newData.length, finalCols.length).setValues(newData);

    // Reapply header styling
    sh.getRange(1, 1, 1, finalCols.length)
      .setBackground('#6d28d9')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, finalCols.length);

    report.push(name + ' (' + finalCols.length + ' cols)');
  });

  Logger.log('reorderSheetColumns complete.');
  Logger.log(report.length ? 'Reordered: ' + report.join(', ') : 'All sheets already in correct order.');
}

// Adds any missing columns to existing sheet headers without touching data rows.
function _patchSheetHeaders() {
  var ss = _ss();
  Object.keys(S).forEach(function(key) {
    var name = S[key];
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() === 0) return;
    var expected = COLS[key];
    if (!expected) return;
    var headerRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var existing = headerRow.map(function(v) { return String(v).trim(); });
    var toAdd = [];
    expected.forEach(function(col) {
      if (existing.indexOf(col) === -1) toAdd.push(col);
    });
    if (!toAdd.length) return;
    var startCol = sh.getLastColumn() + 1;
    toAdd.forEach(function(col, i) {
      var cell = sh.getRange(1, startCol + i);
      cell.setValue(col);
      cell.setBackground('#6d28d9').setFontColor('#ffffff').setFontWeight('bold');
    });
    Logger.log('Patched ' + name + ': added columns ' + toAdd.join(', '));
  });
}

// ── Web App entry points ──────────────────────────────────────────────────────
function doGet(e)  { return _handle(e); }
function doPost(e) { return _handle(e); }

function _handle(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var body = {};

    if (params.p) {
      try { body = JSON.parse(params.p); } catch(err) { body = {}; }
    } else if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch(err) { body = {}; }
    }

    var action = body.action || params.action || '';
    var store  = body.store  || params.store  || '';

    switch (action) {
      case 'ping':       return _ok({ pong: true, ts: new Date().toISOString() });
      case 'getAll':     return _ok(_getAll(store));
      case 'getOne':     return _ok(_getOne(store, body.id));
      case 'putOne':     return _ok(_putOne(store, body.record));
      case 'delOne':     return _ok(_delOne(store, body.id));
      case 'clearStore': return _ok(_clearStore(store));
      case 'bulkPut':    return _ok(_bulkPut(store, body.records));
      default:
        return _ok({ error: 'Unknown action: ' + action });
    }
  } catch(err) {
    return _ok({ error: err.message });
  }
}

function _ok(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

// Resolve store name → COLS key
function _key(store) {
  if (!store) throw new Error('store name is required');
  var k = _ALIAS[store] || _ALIAS[store.toLowerCase()];
  if (!k) throw new Error('Unknown store: "' + store + '". Check _ALIAS in Code.gs.');
  return k;
}

// Get the sheet for a store (throws if missing — run setupSheets first)
function _sh(store) {
  var key  = _key(store);
  var name = S[key];
  if (!name) throw new Error('No sheet name for key: ' + key);
  var sh = _ss().getSheetByName(name);
  if (!sh) throw new Error(
    'Sheet "' + name + '" not found. Run setupSheets() first.'
  );
  return sh;
}

function _cols(store) {
  return COLS[_key(store)] || [];
}

// Sheet row → JS object
function _toObj(cols, row) {
  var obj = {};
  cols.forEach(function(col, i) {
    var v = row[i];
    // Apps Script returns Date objects for date-formatted cells
    if (v instanceof Date) {
      v = Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    }
    // Deserialise JSON columns
    if (_JSON_COLS[col]) {
      if (typeof v === 'string' && v.trim()) {
        try { v = JSON.parse(v); } catch(e) {
          v = (col === 'categories') ? {} : [];
        }
      } else {
        v = (col === 'categories') ? {} : [];
      }
    }
    // Normalise boolean
    if (col === 'completed') {
      v = (v === true || v === 'true' || v === 1 || v === '1');
    }
    obj[col] = (v === null || v === undefined) ? '' : v;
  });
  return obj;
}

// JS object → sheet row
function _toRow(cols, obj) {
  return cols.map(function(col) {
    var v = obj[col];
    if (v === undefined || v === null) v = '';
    if (_JSON_COLS[col]) {
      // Always serialise JSON columns; default empty value depends on type
      if (typeof v !== 'string') {
        v = JSON.stringify(v !== undefined ? v : (col === 'categories' ? {} : []));
      }
    }
    return v;
  });
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function _getAll(store) {
  var sh   = _sh(store);
  var cols = _cols(store);
  var last = sh.getLastRow();
  if (last <= 1) return [];
  // Read actual header to handle sheets that have fewer columns than COLS definition
  var sheetCols = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function(v) { return String(v).trim(); });
  return sh.getRange(2, 1, last - 1, sheetCols.length)
    .getValues()
    .map(function(row) { return _toObjByHeader(sheetCols, cols, row); })
    .filter(function(obj) { return String(obj.id || '') !== ''; });
}

// Map a sheet row using actual header columns, filling missing cols with ''
function _toObjByHeader(sheetCols, expectedCols, row) {
  var obj = {};
  // First populate from sheet columns
  sheetCols.forEach(function(col, i) {
    if (!col) return;
    var v = row[i];
    if (v instanceof Date) {
      v = Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    }
    if (_JSON_COLS[col]) {
      if (typeof v === 'string' && v.trim()) {
        try { v = JSON.parse(v); } catch(e) { v = (col === 'categories') ? {} : []; }
      } else {
        v = (col === 'categories') ? {} : [];
      }
    }
    if (col === 'completed') v = (v === true || v === 'true' || v === 1 || v === '1');
    // Strip date-suffix from columns that store plain strings Sheets may auto-parse as dates
    if ((col === 'month' || col === 'dob' || col === 'date' || col === 'issueDate' ||
         col === 'expiryDate' || col === 'startDate' || col === 'maturityDate' ||
         col === 'dueDate' || col === 'premiumDueDate') && typeof v === 'string') {
      v = v.replace(/T\d{2}:\d{2}:\d{2}Z?$/, '');
      // For month field keep only YYYY-MM
      if (col === 'month') v = v.slice(0, 7);
    }
    obj[col] = (v === null || v === undefined) ? '' : v;
  });
  // Fill any expected cols missing from sheet with default empty values
  expectedCols.forEach(function(col) {
    if (!(col in obj)) obj[col] = _JSON_COLS[col] ? (col === 'categories' ? {} : []) : '';
  });
  return obj;
}

function _getOne(store, id) {
  var rows = _getAll(store);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) return rows[i];
  }
  return null;
}

function _putOne(store, record) {
  if (!record || !record.id) throw new Error('Record must have an id field');
  var sh   = _sh(store);
  var last = sh.getLastRow();
  // Always use actual sheet header for column order
  var sheetCols = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function(v) { return String(v).trim(); });
  var row = _toRowByHeader(sheetCols, record);
  if (last > 1) {
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(record.id)) {
        sh.getRange(i + 2, 1, 1, sheetCols.length).setValues([row]);
        return { ok: true, action: 'updated' };
      }
    }
  }
  sh.appendRow(row);
  return { ok: true, action: 'inserted' };
}

// Build a sheet row using the actual sheet header column order
function _toRowByHeader(sheetCols, obj) {
  return sheetCols.map(function(col) {
    if (!col) return '';
    var v = obj[col];
    if (v === undefined || v === null) v = '';
    if (_JSON_COLS[col]) {
      if (typeof v !== 'string') {
        v = JSON.stringify(v !== undefined ? v : (col === 'categories' ? {} : []));
      }
    }
    return v;
  });
}

function _delOne(store, id) {
  var sh   = _sh(store);
  var last = sh.getLastRow();
  if (last <= 1) return { ok: true };
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sh.deleteRow(i + 2);
      return { ok: true };
    }
  }
  return { ok: true }; // not found — treat as success (idempotent)
}

function _clearStore(store) {
  var sh   = _sh(store);
  var last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);
  return { ok: true };
}

function _bulkPut(store, records) {
  if (!records || !records.length) return { ok: true, count: 0 };
  var sh   = _sh(store);
  var last = sh.getLastRow();
  // Use actual sheet header for column order
  var sheetCols = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function(v) { return String(v).trim(); });
  var existingIds = {};
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function(r, i) {
      existingIds[String(r[0])] = i + 2;
    });
  }
  var toAppend = [];
  records.forEach(function(record) {
    if (!record || !record.id) return;
    var row = _toRowByHeader(sheetCols, record);
    var rowNum = existingIds[String(record.id)];
    if (rowNum) {
      sh.getRange(rowNum, 1, 1, sheetCols.length).setValues([row]);
    } else {
      toAppend.push(row);
    }
  });
  if (toAppend.length) {
    sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, sheetCols.length).setValues(toAppend);
  }
  return { ok: true, count: records.length };
}
