// ============================================================
// ANKIT FINANCE HUB
// APP.JS
// ============================================================

const API_URL =
  "https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";

let DB = {};

// ============================================================
// BASIC HELPERS
// ============================================================

const $ = id => document.getElementById(id);

const val = id => {
  const el = $(id);
  return el ? el.value : "";
};

const num = v => Number(v || 0);

const today = () => new Date().toISOString().slice(0, 10);

const unique = arr =>
  [...new Set(
    (arr || [])
      .filter(v => v !== "" && v !== null && v !== undefined)
      .map(String)
  )];

const money = value =>
  "₹" +
  num(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0
  });

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

// ============================================================
// TOAST
// ============================================================

function toast(message) {
  const t = $("toast");

  if (!t) {
    alert(message);
    return;
  }

  t.textContent = message;
  t.classList.add("show");

  setTimeout(() => {
    t.classList.remove("show");
  }, 2600);
}

// ============================================================
// STATUS
// ============================================================

function setStatus(status) {
  const el = $("syncStatus");
  if (el) el.textContent = status;
}

function apiReady() {
  return API_URL && !API_URL.includes("PASTE_YOUR");
}

// ============================================================
// API
// ============================================================

async function api(action, payload = {}) {

  if (!apiReady()) {
    throw new Error(
      "Paste your Google Apps Script Web App URL in app.js"
    );
  }

  const response = await fetch(API_URL, {
    method: "POST",
    mode: "cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      ...payload
    })
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(
      result.error || "Cloud request failed"
    );
  }

  return result;
}

// ============================================================
// LOAD ALL DATA
// ============================================================

async function loadAll() {

  if (!apiReady()) {
    setStatus("⚠️ API URL required");
    toast("Paste Apps Script Web App URL in app.js");
    return;
  }

  try {

    setStatus("☁️ Connecting...");

    const response = await fetch(
      API_URL + "?action=loadAll&_=" + Date.now(),
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        "Server error: " + response.status
      );
    }

    const result =
      JSON.parse(await response.text());

    if (!result.success) {
      throw new Error(
        result.error || "Cloud load failed"
      );
    }

    DB = result.data || {};

    [
      "transactions",
      "salary",
      "loans",
      "emi",
      "passbook",
      "people",
      "baskets",
      "assets",
      "sipPayments",
      "splitGroups",
      "splitExpenses",
      "splitSettlements",
      "vehicles",
      "fuel",
      "maintenance"
    ].forEach(table => {
      DB[table] = DB[table] || [];
    });

    setStatus("☁️ Synced");

    renderAll();

  } catch (error) {

    console.error(error);

    setStatus("⚠️ Sync failed");

    toast(
      error.message ||
      "Unable to connect"
    );
  }
}

// ============================================================
// SAVE
// ============================================================

async function save(table, data) {

  const result = await api("save", {
    table,
    data
  });

  const record = result.data.record;

  DB[table] = DB[table] || [];

  const index =
    DB[table].findIndex(
      x => String(x.ID) === String(record.ID)
    );

  if (index >= 0) {
    DB[table][index] = record;
  } else {
    DB[table].push(record);
  }

  return record;
}

// ============================================================
// DELETE
// ============================================================

async function del(table, id) {

  const record =
    (DB[table] || []).find(
      x => String(x.ID) === String(id)
    );

  if (!record) return;

  if (!confirm("Delete this record?")) {
    return;
  }

  try {

    // ------------------------------------------
    // DELETE LINKED PASSBOOK ENTRY
    // ------------------------------------------

    if (
      table === "fuel" ||
      table === "maintenance"
    ) {

      const passbookId =
        record["Passbook ID"];

      const linked =
        (DB.passbook || []).filter(p =>
          String(p.ID) === String(passbookId) ||
          String(p["Source ID"]) === String(id)
        );

      for (const p of linked) {

        await api("delete", {
          table: "passbook",
          id: p.ID
        });
      }

      DB.passbook =
        (DB.passbook || []).filter(p =>
          !linked.some(
            q => String(q.ID) === String(p.ID)
          )
        );
    }

    // ------------------------------------------
    // DELETE MAIN RECORD
    // ------------------------------------------

    await api("delete", {
      table,
      id
    });

    DB[table] =
      (DB[table] || []).filter(
        x => String(x.ID) !== String(id)
      );

    renderAll();

    toast("Deleted successfully");

  } catch (error) {

    toast(
      error.message ||
      "Delete failed"
    );
  }
}

// ============================================================
// SELECT OPTIONS
// ============================================================

function opt(
  element,
  array,
  valueFunction,
  labelFunction,
  placeholder
) {

  if (!element) return;

  const oldValue = element.value;

  element.innerHTML =
    `<option value="">${esc(
      placeholder || "Select"
    )}</option>` +

    (array || [])
      .map(item =>
        `<option value="${esc(
          valueFunction(item)
        )}">
          ${esc(labelFunction(item))}
        </option>`
      )
      .join("");

  if (
    [...element.options].some(
      option => option.value === oldValue
    )
  ) {
    element.value = oldValue;
  }
}

// ============================================================
// VEHICLE NAME
// ============================================================

function vehicleName(vehicleId) {

  const vehicle =
    (DB.vehicles || []).find(
      x =>
        String(x.ID) ===
        String(vehicleId)
    );

  return vehicle
    ? vehicle["Vehicle Name"]
    : "Vehicle";
}

// ============================================================
// PAYMENT MODES
// FROM PASSBOOK ACCOUNT COLUMN
// ============================================================

function fillVehiclePaymentModes() {

  const accounts =
    unique(
      (DB.passbook || [])
        .map(x => x.Account)
    );

  [
    "fuelAccount",
    "maintAccountSelect"
  ].forEach(id => {

    const element = $(id);

    if (!element) return;

    const oldValue =
      element.value;

    element.innerHTML =
      `<option value="">
        Payment Mode / Account
      </option>` +

      accounts
        .map(account =>
          `<option value="${esc(account)}">
            ${esc(account)}
          </option>`
        )
        .join("");

    if (
      [...element.options]
        .some(
          option =>
            option.value === oldValue
        )
    ) {
      element.value = oldValue;
    }
  });
}

// ============================================================
// FILL ALL DROPDOWNS
// ============================================================

function fillLists() {

  // ------------------------------------------
  // VEHICLES
  // ------------------------------------------

  const vehicles =
    DB.vehicles || [];

  opt(
    $("fuelVehicle"),
    vehicles,
    x => x.ID,
    x => x["Vehicle Name"],
    "Select Vehicle"
  );

  opt(
    $("maintVehicle"),
    vehicles,
    x => x.ID,
    x => x["Vehicle Name"],
    "Select Vehicle"
  );

  // ------------------------------------------
  // PAYMENT MODES
  // ------------------------------------------

  fillVehiclePaymentModes();

  // ------------------------------------------
  // INVESTMENT PEOPLE
  // ------------------------------------------

  const people =
    DB.people || [];

  opt(
    $("basketPerson"),
    people,
    x => x.ID,
    x => x.Name,
    "Select Person"
  );

  // ------------------------------------------
  // SPLITTER GROUPS
  // ------------------------------------------

  const groups =
    DB.splitGroups || [];

  opt(
    $("spGroup"),
    groups,
    x => x.ID,
    x => x["Group Name"],
    "Select Group"
  );

  // ------------------------------------------
  // PASSBOOK CATEGORIES
  // ------------------------------------------

  const categories =
    unique(
      (DB.passbook || [])
        .map(x => x.Category)
    );

  opt(
    $("dashCategory"),
    categories,
    x => x,
    x => x,
    "All Categories"
  );

  opt(
    $("pbFilterCategory"),
    categories,
    x => x,
    x => x,
    "All Categories"
  );

  // ------------------------------------------
  // DEFAULT DATES
  // ------------------------------------------

  if (
    $("fuelDate") &&
    !$("fuelDate").value
  ) {
    $("fuelDate").value = today();
  }

  if (
    $("maintDate") &&
    !$("maintDate").value
  ) {
    $("maintDate").value = today();
  }
}

// ============================================================
// RENDER ALL
// ============================================================

function renderAll() {

  fillLists();

  renderDashboard();

  renderPassbook();

  renderSalary();

  renderLoans();

  renderGive();

  renderSplitter();

  renderInvestments();

  renderVehicles();
}

// ============================================================
// PAGE NAVIGATION
// ============================================================

function showPage(page) {

  document
    .querySelectorAll(".page")
    .forEach(pageElement => {
      pageElement.classList.remove("active");
    });

  const pageElement =
    $("page-" + page);

  if (pageElement) {
    pageElement.classList.add("active");
  }

  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === page
      );

    });
}

// ============================================================
// VEHICLE - LAST FUEL
// ============================================================

function lastFuel(vehicleId) {

  return (DB.fuel || [])
    .filter(
      x =>
        String(x["Vehicle ID"]) ===
        String(vehicleId)
    )
    .sort(
      (a, b) =>
        num(b.Odometer) -
        num(a.Odometer) ||

        String(b.Date)
          .localeCompare(
            String(a.Date)
          )
    )[0] || null;
}

// ============================================================
// LATEST ODOMETER
// ============================================================

function latestOdo(vehicleId) {

  return num(
    lastFuel(vehicleId)?.Odometer
  );
}

// ============================================================
// UPDATE PREVIOUS ODOMETER
// ============================================================

function updateFuelPreviousOdometer() {

  const previous =
    latestOdo(
      val("fuelVehicle")
    );

  if ($("fuelLastOdo")) {
    $("fuelLastOdo").value =
      previous || "";
  }

  if ($("fuelOdo")) {
    $("fuelOdo").value = "";
  }

  if ($("fuelDistance")) {
    $("fuelDistance").value = "";
  }
}

// ============================================================
// CALCULATE DISTANCE
// ============================================================

function calculateFuelDistance() {

  const previous =
    num(val("fuelLastOdo"));

  const current =
    num(val("fuelOdo"));

  if (!previous || !current) {

    if ($("fuelDistance")) {
      $("fuelDistance").value = "";
    }

    return;
  }

  const distance =
    current - previous;

  if (distance < 0) {

    $("fuelDistance").value = "";

    toast(
      "Current odometer cannot be less than previous odometer"
    );

    return;
  }

  $("fuelDistance").value =
    distance;
}

// ============================================================
// ADD VEHICLE
// ============================================================

async function addVehicle() {

  const name =
    val("vehicleName");

  const type =
    val("vehicleType");

  const plate =
    val("vehiclePlate");

  if (!name) {
    return toast(
      "Enter vehicle name"
    );
  }

  try {

    await save(
      "vehicles",
      {
        "Vehicle Name": name,
        "Vehicle Type": type,
        "Number Plate": plate
      }
    );

    [
      "vehicleName",
      "vehiclePlate"
    ].forEach(id => {

      if ($(id)) {
        $(id).value = "";
      }

    });

    renderAll();

    toast(
      "Vehicle saved"
    );

  } catch (error) {

    toast(
      error.message ||
      "Unable to save vehicle"
    );
  }
}

// ============================================================
// ADD FUEL
// ============================================================

async function addFuel() {

  const vehicle =
    val("fuelVehicle");

  const amount =
    num(val("fuelAmount"));

  const quantity =
    num(val("fuelQty"));

  const odometer =
    num(val("fuelOdo"));

  const previousOdometer =
    num(val("fuelLastOdo"));

  const account =
    val("fuelAccount");

  // ------------------------------------------
  // VALIDATION
  // ------------------------------------------

  if (!vehicle) {
    return toast(
      "Select vehicle"
    );
  }

  if (
    amount <= 0 ||
    quantity <= 0
  ) {
    return toast(
      "Enter valid fuel amount and quantity"
    );
  }

  if (odometer <= 0) {
    return toast(
      "Enter current odometer"
    );
  }

  if (
    previousOdometer &&
    odometer <= previousOdometer
  ) {
    return toast(
      "Current odometer must be greater than previous odometer"
    );
  }

  if (!account) {
    return toast(
      "Select payment mode / account"
    );
  }

  try {

    // ----------------------------------------
    // SAVE FUEL RECORD
    // ----------------------------------------

    const fuelRecord =
      await save(
        "fuel",
        {
          "Vehicle ID": vehicle,
          Date:
            val("fuelDate") ||
            today(),
          Odometer: odometer,
          Quantity: quantity,
          Amount: amount,
          "Fuel Type":
            val("fuelType"),
          Notes:
            val("fuelNotes"),
          "Passbook ID": ""
        }
      );

    // ----------------------------------------
    // CREATE PASSBOOK EXPENSE
    // ----------------------------------------

    const passbookRecord =
      await save(
        "passbook",
        {
          Date:
            fuelRecord.Date,

          Type:
            "Expense",

          Category:
            "Petrol / Fuel",

          Amount:
            amount,

          Account:
            account,

          Remarks:
            `${vehicleName(vehicle)} • ` +
            `${fuelRecord["Fuel Type"] || "Fuel"}` +
            (
              previousOdometer
                ? ` • ${odometer - previousOdometer} km`
                : ""
            ),

          "Source ID":
            fuelRecord.ID
        }
      );

    // ----------------------------------------
    // SAVE PASSBOOK ID BACK TO FUEL
    // ----------------------------------------

    await save(
      "fuel",
      {
        ...fuelRecord,
        "Passbook ID":
          passbookRecord.ID
      }
    );

    // ----------------------------------------
    // CLEAR FORM
    // ----------------------------------------

    [
      "fuelOdo",
      "fuelLastOdo",
      "fuelDistance",
      "fuelQty",
      "fuelAmount",
      "fuelNotes"
    ].forEach(id => {

      if ($(id)) {
        $(id).value = "";
      }

    });

    renderAll();

    toast(
      "✓ Fuel saved + added to Passbook"
    );

  } catch (error) {

    console.error(error);

    toast(
      error.message ||
      "Unable to save fuel"
    );
  }
}

// ============================================================
// ADD MAINTENANCE
// ============================================================

async function addMaintenance() {

  const vehicle =
    val("maintVehicle");

  const amount =
    num(val("maintAmount"));

  const account =
    val("maintAccountSelect");

  if (!vehicle) {
    return toast(
      "Select vehicle"
    );
  }

  if (amount <= 0) {
    return toast(
      "Enter valid maintenance amount"
    );
  }

  if (!account) {
    return toast(
      "Select payment mode / account"
    );
  }

  try {

    // ----------------------------------------
    // SAVE MAINTENANCE
    // ----------------------------------------

    const maintenanceRecord =
      await save(
        "maintenance",
        {
          "Vehicle ID":
            vehicle,

          Date:
            val("maintDate") ||
            today(),

          Category:
            val("maintCategory"),

          Amount:
            amount,

          Odometer:
            num(val("maintOdo")),

          "Next Target KM":
            num(val("maintTargetKm")),

          Remarks:
            val("maintRemarks"),

          "Passbook ID":
            ""
        }
      );

    // ----------------------------------------
    // CREATE PASSBOOK EXPENSE
    // ----------------------------------------

    const passbookRecord =
      await save(
        "passbook",
        {
          Date:
            maintenanceRecord.Date,

          Type:
            "Expense",

          Category:
            "Vehicle Maintenance",

          Amount:
            amount,

          Account:
            account,

          Remarks:
            `${vehicleName(vehicle)} • ` +
            `${maintenanceRecord.Category || "Service"}`,

          "Source ID":
            maintenanceRecord.ID
        }
      );

    // ----------------------------------------
    // SAVE PASSBOOK ID
    // ----------------------------------------

    await save(
      "maintenance",
      {
        ...maintenanceRecord,
        "Passbook ID":
          passbookRecord.ID
      }
    );

    // ----------------------------------------
    // CLEAR FORM
    // ----------------------------------------

    [
      "maintAmount",
      "maintOdo",
      "maintTargetKm",
      "maintRemarks"
    ].forEach(id => {

      if ($(id)) {
        $(id).value = "";
      }

    });

    renderAll();

    toast(
      "✓ Maintenance saved + added to Passbook"
    );

  } catch (error) {

    console.error(error);

    toast(
      error.message ||
      "Unable to save maintenance"
    );
  }
}

// ============================================================
// FUEL AVERAGE
// ============================================================

function calculateFuelAverageKM(vehicleId) {

  const rows =
    (DB.fuel || [])
      .filter(
        x =>
          String(x["Vehicle ID"]) ===
          String(vehicleId)
      )
      .sort(
        (a, b) =>
          num(a.Odometer) -
          num(b.Odometer)
      );

  if (rows.length < 2) {
    return 0;
  }

  let distance = 0;

  let quantity = 0;

  for (
    let i = 1;
    i < rows.length;
    i++
  ) {

    distance +=
      Math.max(
        0,
        num(rows[i].Odometer) -
        num(rows[i - 1].Odometer)
      );

    quantity +=
      num(rows[i].Quantity);
  }

  return quantity
    ? distance / quantity
    : 0;
}

// ================================
