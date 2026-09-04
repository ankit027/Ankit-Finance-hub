const APP_NAME = "Ankit Finance Hub";

const SHEETS = {
  transactions: {name:"Transactions", headers:["ID","Person","Type","Amount","Date","Purpose","Notes","Revisions","Created At","Updated At"]},
  salary: {name:"Salary", headers:["ID","Month","Company","Amount","Remarks"]},
  loans: {name:"Loans", headers:["ID","Loan Name","Initial Amount","Remarks"]},
  emi: {name:"EMI", headers:["ID","Loan ID","Month","Amount","Remarks"]},
  passbook: {name:"Passbook", headers:["ID","Date","Type","Category","Amount","Account","Remarks","Created At","Updated At"]},
  people: {name:"Investment People", headers:["ID","Name","Created At"]},
  baskets: {name:"SIP Baskets", headers:["ID","Person ID","Basket Name","Created At","Updated At"]},
  assets: {name:"SIP Assets", headers:["ID","Basket ID","Asset Name","Asset Type","Monthly Amount","Created At","Updated At"]},
  sipPayments: {name:"SIP Payments", headers:["ID","Basket ID","Month","Amount","Paid At"]},
  splitGroups: {name:"Split Groups", headers:["ID","Group Name","Category","Members JSON","Created At","Updated At"]},
  splitExpenses: {name:"Split Expenses", headers:["ID","Group ID","Title","Amount","Paid By","Members JSON","Date","Created At","Updated At"]}
};

// IMPORTANT: This is the JSON API used by the GitHub app.
function doGet(e) {
  return json_({success:true, message:APP_NAME+" API running"});
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    const result = api_(body.action, body);
    return json_({success:true, ...result});
  } catch (err) {
    return json_({success:false, error:String(err.message || err)});
  }
}

function api_(action, payload) {
  action = String(action || "").toLowerCase();

  if (action === "loadall") {
    setup_();
    const data = {};
    Object.keys(SHEETS).forEach(key => data[key] = getAll_(key));
    return {data:data};
  }

  if (action === "save") {
    const table = payload.table;
    if (!SHEETS[table]) throw new Error("Invalid table: " + table);
    const record = save_(table, payload.data || {});
    return {record:record};
  }

  if (action === "delete") {
    const table = payload.table;
    if (!SHEETS[table]) throw new Error("Invalid table: " + table);
    delete_(table, payload.id);
    return {};
  }

  throw new Error("Unknown action: " + action);
}

function setup_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(key => {
    const d = SHEETS[key];
    let sh = ss.getSheetByName(d.name);
    if (!sh) {
      sh = ss.insertSheet(d.name);
      sh.getRange(1,1,1,d.headers.length).setValues([d.headers]);
      sh.getRange(1,1,1,d.headers.length).setFontWeight("bold");
      sh.setFrozenRows(1);
    }
  });
}

function getAll_(key) {
  const d = SHEETS[key];
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(d.name);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const rows = sh.getRange(2,1,lastRow-1,d.headers.length).getValues();
  return rows
    .filter(r => String(r[0] || "") !== "")
    .map(r => rowToObject_(d.headers, r));
}

function rowToObject_(headers, row) {
  const out = {};
  headers.forEach((h,i) => out[h] = serialize_(row[i]));
  return out;
}

function save_(key, obj) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    setup_();

    const d = SHEETS[key];
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(d.name);
    const id = String(obj.ID || obj.id || Utilities.getUuid());
    const now = new Date().toISOString();
    const lastRow = sh.getLastRow();

    let rowNumber = 0;
    let existing = null;

    if (lastRow >= 2) {
      const ids = sh.getRange(2,1,lastRow-1,1).getValues().flat().map(String);
      const index = ids.indexOf(id);
      if (index >= 0) {
        rowNumber = index + 2;
        existing = sh.getRange(rowNumber,1,1,d.headers.length).getValues()[0];
      }
    }

    const values = d.headers.map((header, i) => {
      if (header === "ID") return id;

      if (header === "Created At") {
        return obj[header] || obj.createdAt ||
          (existing && existing[i] ? existing[i] : now);
      }

      if (header === "Updated At") return now;

      // Exact header names are preferred. This fixes names such as "Group Name".
      if (Object.prototype.hasOwnProperty.call(obj, header)) return obj[header];

      const camel = camel_(header);
      if (Object.prototype.hasOwnProperty.call(obj, camel)) return obj[camel];

      return "";
    });

    if (rowNumber) {
      sh.getRange(rowNumber,1,1,values.length).setValues([values]);
    } else {
      sh.getRange(lastRow + 1,1,1,values.length).setValues([values]);
    }

    SpreadsheetApp.flush();
    return rowToObject_(d.headers, values);
  } finally {
    lock.releaseLock();
  }
}

function delete_(key, id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    setup_();
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS[key].name);
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;

    const ids = sh.getRange(2,1,lastRow-1,1).getValues().flat().map(String);
    const index = ids.indexOf(String(id));
    if (index >= 0) sh.deleteRow(index + 2);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function camel_(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase());
}

function serialize_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
    );
  }
  return value;
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}