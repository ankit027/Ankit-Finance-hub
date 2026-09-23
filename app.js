/* =================================================================
   ANKIT FINANCE HUB — FRONTEND WITH LIVE AUTO-REFRESH
   ================================================================= */

const API_URL =
  "https://script.google.com/macros/s/AKfycbyBzmIaPUtD0UGyjDWOU_1J9W14hL8Lk_VEQPEs_OA5dPPDVR78Wyxd__LclEi11CSJ3w/exec";

/* Auto-refresh interval (in milliseconds).
   30000 = 30 seconds. Change as you like. */
const LIVE_REFRESH_MS = 30000;

let DB = {}, charts = {};
let lastSyncTime = 0;
let syncInProgress = false;
let refreshTimer = null;

const $ = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const monthNow = () => new Date().toISOString().slice(0, 7);
const num = (v) => Number(v || 0);

const fmt = (v) =>
  "₹" + num(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));

const val = (id) => ($(id)?.value || "").trim();

/* ================= TOAST ================= */
function toast(msg, ms = 2500) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window._toast);
  window._toast = setTimeout(() => t.classList.remove("show"), ms);
}

function setStatus(text) {
  const el = $("status");
  if (el) el.textContent = text;
}

/* ================= API ================= */
async function api(action, payload = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });

    const text = await response.text();
    let json;

    try {
      json = JSON.parse(text);
    } catch (err) {
      console.error("API response:", text);
      throw new Error("Invalid API response. Check Apps Script deployment access.");
    }

    if (!json.success) throw new Error(json.error || "Cloud request failed");
    return json;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Connection timed out.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* ================= LOAD ================= */
async function loadAll(showToast = false) {
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    setStatus("☁️ Syncing...");

    const response = await api("loadAll");
    DB = response.data || {};

    [
      "transactions", "salary", "loans", "emi", "passbook",
      "people", "vehicles", "fuel", "maintenance"
    ].forEach((k) => {
      if (!Array.isArray(DB[k])) DB[k] = [];
    });

    renderAll();

    lastSyncTime = Date.now();
    updateSyncLabel();

    if (showToast) toast("✓ Cloud data synced");
  } catch (e) {
    console.error("Load error:", e);
    setStatus("⚠️ Sync failed");
    if (showToast) toast(e.message || "Unable to connect");
    renderAll();
  } finally {
    syncInProgress = false;
  }
}

function updateSyncLabel() {
  const secs = Math.floor((Date.now() - lastSyncTime) / 1000);

  if (secs < 5) setStatus("☁️ Synced just now");
  else if (secs < 60) setStatus(`☁️ Synced ${secs}s ago`);
  else if (secs < 3600) setStatus(`☁️ Synced ${Math.floor(secs / 60)}m ago`);
  else setStatus("☁️ Synced");
}

/* ================= LIVE REFRESH ================= */
function startLiveRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);

  refreshTimer = setInterval(() => {
    updateSyncLabel();
    if (!document.hidden && !syncInProgress) {
      loadAll(false);
    }
  }, LIVE_REFRESH_MS);
}

/* Refresh immediately when user comes back to the tab */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !syncInProgress && Date.now() - lastSyncTime > 5000) {
    loadAll(false);
  }
});

/* ================= SAVE / DELETE ================= */
async function save(table, data) {
  const r = await api("save", { table, data });
  const rec = r.data.record;

  DB[table] = DB[table] || [];
  const i = DB[table].findIndex((x) => String(x.ID) === String(rec.ID));
  if (i >= 0) DB[table][i] = rec;
  else DB[table].push(rec);

  lastSyncTime = Date.now();
  updateSyncLabel();
  return rec;
}

async function del(table, id) {
  if (!confirm("Delete this record?")) return;

  try {
    await api("delete", { table, id });
    DB[table] = (DB[table] || []).filter((x) => String(x.ID) !== String(id));
    lastSyncTime = Date.now();
    updateSyncLabel();
    renderAll();
    toast("Deleted");
  } catch (e) {
    toast(e.message);
  }
}

/* ================= HELPERS ================= */
const card = (label, value) => `<div><small>${esc(label)}</small><b>${value}</b></div>`;
const monthOf = (v) => String(v || "").slice(0, 7);
const unique = (a) => [...new Set(a.filter(Boolean))];

function opt(el, arr, textFn = (x) => x, valueFn = (x) => x, placeholder = "Select") {
  if (!el) return;
  const current = el.value;
  el.innerHTML =
    `<option value="">${placeholder}</option>` +
    arr.map((x) => `<option value="${esc(valueFn(x))}">${esc(textFn(x))}</option>`).join("");
  if (arr.some((x) => String(valueFn(x)) === String(current))) el.value = current;
}

const displayDate = (v) => {
  if (!v) return "";
  const s = String(v);
  return s.includes("T") ? s.slice(0, 10) : s;
};

function recentRecords(arr, limit = 10) {
  return [...arr]
    .sort((a, b) => String(b.Date || "").localeCompare(String(a.Date || "")))
    .slice(0, limit);
}

/* ================= RENDER ALL ================= */
function renderAll() {
  renderDashboard();
  renderPassbook();
  renderSalary();
  renderLoans();
  renderGive();
  renderVehicles();
  fillLists();
}

/* ================= CHART ================= */
function chart(id, type, data, options = {}) {
  if (!window.Chart) return;
  if (charts[id]) charts[id].destroy();
  const el = $(id);
  if (!el) return;

  charts[id] = new Chart(el, {
    type,
    data,
    options: { responsive: true, maintainAspectRatio: false, ...options },
  });
}

/* ================= DASHBOARD ================= */
function renderDashboard() {
  const m = val("dashMonth"), c = val("dashCategory");

  const pb = (DB.passbook || []).filter(
    (x) => (!m || monthOf(x.Date) === m) && (!c || x.Category === c)
  );

  const income = pb.filter((x) => x.Type === "Income").reduce((s, x) => s + num(x.Amount), 0);
  const expense = pb.filter((x) => x.Type === "Expense").reduce((s, x) => s + num(x.Amount), 0);
  const salary = (DB.salary || []).filter((x) => !m || String(x.Month) === m).reduce((s, x) => s + num(x.Amount), 0);
  const emi = (DB.emi || []).filter((x) => !m || String(x.Month) === m).reduce((s, x) => s + num(x.Amount), 0);

  const toReceive = (DB.transactions || []).reduce((s, x) => {
    if (x.Type === "Pending to Take") return s + num(x.Amount);
    if (x.Type === "Received") return s - num(x.Amount);
    return s;
  }, 0);

  const toPay = (DB.transactions || []).reduce((s, x) => {
    if (x.Type === "Pending to Pay") return s + num(x.Amount);
    if (x.Type === "Paid") return s - num(x.Amount);
    return s;
  }, 0);

  $("dash").innerHTML = [
    card("💰 Salary", fmt(salary)),
    card("📈 Total Income", fmt(income)),
    card("💸 Expense", fmt(expense)),
    card("🏦 EMI Paid", fmt(emi)),
    card("🤝 To Receive", fmt(Math.max(0, toReceive))),
    card("🤝 To Pay", fmt(Math.max(0, toPay))),
    card("💳 Net", fmt(income - expense - emi)),
  ].join("");

  const months = unique((DB.passbook || []).map((x) => monthOf(x.Date))).sort();

  const inc = months.map((mm) =>
    (DB.passbook || []).filter((x) => monthOf(x.Date) === mm && x.Type === "Income")
      .reduce((s, x) => s + num(x.Amount), 0)
  );

  const exp = months.map((mm) =>
    (DB.passbook || []).filter((x) => monthOf(x.Date) === mm && x.Type === "Expense")
      .reduce((s, x) => s + num(x.Amount), 0)
  );

  chart("mainChart", "bar", {
    labels: months,
    datasets: [
      { label: "Income", data: inc },
      { label: "Expense", data: exp },
    ],
  });

  const cats = unique(pb.filter((x) => x.Type === "Expense").map((x) => x.Category || "Other"));

  chart("expenseChart", "doughnut", {
    labels: cats,
    datasets: [
      {
        data: cats.map((cat) =>
          pb.filter((x) => x.Type === "Expense" && (x.Category || "Other") === cat)
            .reduce((s, x) => s + num(x.Amount), 0)
        ),
      },
    ],
  });
}

/* ================= PASSBOOK ================= */
function renderPassbook() {
  const month = val("pbFilterMonth"), cat = val("pbFilterCategory");

  const rows = (DB.passbook || [])
    .filter((x) => (!month || monthOf(x.Date) === month) && (!cat || x.Category === cat))
    .sort((a, b) => String(b.Date).localeCompare(String(a.Date)));

  const income = rows.filter((x) => x.Type === "Income").reduce((s, x) => s + num(x.Amount), 0);
  const expense = rows.filter((x) => x.Type === "Expense").reduce((s, x) => s + num(x.Amount), 0);

  $("passbookDash").innerHTML =
    card("Income", fmt(income)) +
    card("Expense", fmt(expense)) +
    card("Balance", fmt(income - expense));

  $("pbList").innerHTML =
    rows.map((x) => `
    <div class="item">
      <div>
        <b>${esc(x.Category || "Uncategorized")} • ${esc(x.Type)}</b><br>
        <small>${esc(x.Date)} • ${esc(x.Account || "")}${x.Remarks ? " • " + esc(x.Remarks) : ""}</small>
      </div>
      <div>
        <b>${fmt(x.Amount)}</b><br>
        <button class="success" onclick="editPassbook('${x.ID}')">Edit</button>
        <button class="danger" onclick="del('passbook','${x.ID}')">Delete</button>
      </div>
    </div>`).join("") || "<p class='muted'>No entries</p>";

  const cats = unique(rows.map((x) => x.Category || "Other"));

  chart("passbookChart", "bar", {
    labels: cats,
    datasets: [
      {
        label: "Amount",
        data: cats.map((c) =>
          rows.filter((x) => (x.Category || "Other") === c).reduce((s, x) => s + num(x.Amount), 0)
        ),
      },
    ],
  });
}

function editPassbook(id) {
  const x = (DB.passbook || []).find((r) => String(r.ID) === String(id));
  if (!x) return;

  $("pbEditId").value = x.ID || "";
  $("pbDate").value = displayDate(x.Date);
  $("pbType").value = x.Type || "Expense";
  $("pbCat").value = x.Category || "";
  $("pbAmt").value = x.Amount || "";
  $("pbAccount").value = x.Account || "";
  $("pbRemarks").value = x.Remarks || "";

  $("pbSaveBtn").textContent = "Update";
  $("pbForm").classList.add("editing");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function addPassbook() {
  if (!val("pbDate") || !val("pbCat") || !num(val("pbAmt")))
    return toast("Date, category and amount are required");

  const editing = !!val("pbEditId");

  try {
    await save("passbook", {
      ID: val("pbEditId"),
      Date: val("pbDate"),
      Type: val("pbType"),
      Category: val("pbCat"),
      Amount: num(val("pbAmt")),
      Account: val("pbAccount"),
      Remarks: val("pbRemarks"),
    });

    clearPassbook();
    renderAll();
    toast(editing ? "Updated" : "Saved to cloud");
  } catch (e) {
    toast(e.message);
  }
}

function clearPassbook() {
  ["pbEditId", "pbCat", "pbAmt", "pbAccount", "pbRemarks"].forEach((id) => {
    if ($(id)) $(id).value = "";
  });
  $("pbDate").value = today();
  $("pbType").value = "Expense";
  $("pbSaveBtn").textContent = "Save";
  $("pbForm")?.classList.remove("editing");
}

function resetPassbookFilters() {
  $("pbFilterMonth").value = "";
  $("pbFilterCategory").value = "";
  renderPassbook();
}

function resetDashFilters() {
  $("dashMonth").value = "";
  $("dashCategory").value = "";
  renderDashboard();
}

/* ================= SALARY ================= */
function renderSalary() {
  const rows = (DB.salary || []).sort((a, b) => String(b.Month).localeCompare(String(a.Month)));

  $("salaryDash").innerHTML =
    card("Total Salary", fmt(rows.reduce((s, x) => s + num(x.Amount), 0))) +
    card("Latest", fmt(rows[0]?.Amount || 0));

  $("salaryList").innerHTML =
    rows.map((x) => `
    <div class="item">
      <div>
        <b>${esc(x.Company || "Salary")}</b><br>
        <small>${esc(x.Month)}${x.Remarks ? " • " + esc(x.Remarks) : ""}</small>
      </div>
      <div>
        <b>${fmt(x.Amount)}</b><br>
        <button class="danger" onclick="del('salary','${x.ID}')">Delete</button>
      </div>
    </div>`).join("") || "<p class='muted'>No salary records</p>";

  const rev = rows.slice().reverse();

  chart("salaryChart", "line", {
    labels: rev.map((x) => x.Month),
    datasets: [{ label: "Salary", data: rev.map((x) => num(x.Amount)) }],
  });
}

async function addSalary() {
  if (!val("salMonth") || !num(val("salAmount")))
    return toast("Month and amount required");

  try {
    await save("salary", {
      Month: val("salMonth"),
      Company: val("salCompany"),
      Amount: num(val("salAmount")),
      Remarks: val("salRemarks"),
    });

    ["salCompany", "salAmount", "salRemarks"].forEach((id) => ($(id).value = ""));
    renderAll();
    toast("Salary saved");
  } catch (e) {
    toast(e.message);
  }
}

/* ================= LOANS ================= */
function renderLoans() {
  const loans = DB.loans || [], emi = DB.emi || [];
  const total = loans.reduce((s, x) => s + num(x["Initial Amount"]), 0);
  const paid = emi.reduce((s, x) => s + num(x.Amount), 0);

  $("loanDash").innerHTML =
    card("Total Loan", fmt(total)) +
    card("EMI Paid", fmt(paid)) +
    card("Remaining", fmt(Math.max(0, total - paid)));

  $("loanList").innerHTML =
    loans.map((l) => {
      const p = emi.filter((e) => String(e["Loan ID"]) === String(l.ID))
        .reduce((s, e) => s + num(e.Amount), 0);

      return `<div class="item">
        <div><b>${esc(l["Loan Name"])}</b><br><small>${esc(l.Remarks || "")}</small></div>
        <div>Initial: <b>${fmt(l["Initial Amount"])}</b><br>Paid: ${fmt(p)}<br>
        <button class="danger" onclick="del('loans','${l.ID}')">Delete</button></div>
      </div>`;
    }).join("") || "<p class='muted'>No loans</p>";

  chart("loanChart", "bar", {
    labels: loans.map((x) => x["Loan Name"]),
    datasets: [
      { label: "Initial Amount", data: loans.map((x) => num(x["Initial Amount"])) },
      {
        label: "Paid",
        data: loans.map((l) =>
          emi.filter((e) => String(e["Loan ID"]) === String(l.ID))
            .reduce((s, e) => s + num(e.Amount), 0)
        ),
      },
    ],
  });
}

async function addLoan() {
  if (!val("loanName") || !num(val("loanInitial")))
    return toast("Loan name and amount required");

  try {
    await save("loans", {
      "Loan Name": val("loanName"),
      "Initial Amount": num(val("loanInitial")),
      Remarks: val("loanRemarks"),
    });

    ["loanName", "loanInitial", "loanRemarks"].forEach((id) => ($(id).value = ""));
    renderAll();
    toast("Loan added");
  } catch (e) {
    toast(e.message);
  }
}

async function addEmi() {
  if (!val("emiLoan") || !val("emiMonth") || !num(val("emiAmount")))
    return toast("Select loan, month and amount");

  try {
    await save("emi", {
      "Loan ID": val("emiLoan"),
      Month: val("emiMonth"),
      Amount: num(val("emiAmount")),
      Remarks: val("emiRemarks"),
    });

    $("emiAmount").value = "";
    $("emiRemarks").value = "";
    renderAll();
    toast("EMI saved");
  } catch (e) {
    toast(e.message);
  }
}

/* ================= GIVE & TAKE ================= */
function renderGive() {
  const rows = DB.transactions || [];

  let toReceive = 0, toPay = 0;

  rows.forEach((x) => {
    const amt = num(x.Amount);
    if (x.Type === "Pending to Take") toReceive += amt;
    if (x.Type === "Received") toReceive -= amt;
    if (x.Type === "Pending to Pay") toPay += amt;
    if (x.Type === "Paid") toPay -= amt;
  });

  $("giveDash").innerHTML =
    card("📥 To Receive", fmt(Math.max(0, toReceive))) +
    card("📤 To Pay", fmt(Math.max(0, toPay)));

  const persons = unique(rows.map((x) => x.Person));

  const receiveData = persons.map((person) => {
    let balance = 0;
    rows.filter((x) => x.Person === person).forEach((x) => {
      if (x.Type === "Pending to Take") balance += num(x.Amount);
      if (x.Type === "Received") balance -= num(x.Amount);
    });
    return Math.max(0, balance);
  });

  const payData = persons.map((person) => {
    let balance = 0;
    rows.filter((x) => x.Person === person).forEach((x) => {
      if (x.Type === "Pending to Pay") balance += num(x.Amount);
      if (x.Type === "Paid") balance -= num(x.Amount);
    });
    return Math.max(0, balance);
  });

  $("gtList").innerHTML =
    rows.slice()
      .sort((a, b) => String(b.Date).localeCompare(String(a.Date)))
      .slice(0, 10)
      .map((x) => `
    <div class="item">
      <div>
        <b>${esc(x.Person)} • ${esc(x.Type)}</b><br>
        <small>${esc(x.Date)} • ${esc(x.Purpose || "")}${x.Notes ? " • " + esc(x.Notes) : ""}</small>
      </div>
      <div>
        <b>${fmt(x.Amount)}</b><br>
        <button class="danger" onclick="del('transactions','${x.ID}')">Delete</button>
      </div>
    </div>`).join("") || "<p class='muted'>No records</p>";

  chart("giveChart", "bar", {
    labels: persons,
    datasets: [
      { label: "To Receive", data: receiveData },
      { label: "To Pay", data: payData },
    ],
  });
}

async function addGive() {
  if (!val("gtPerson") || !num(val("gtAmount")))
    return toast("Person and amount required");

  try {
    await save("transactions", {
      Person: val("gtPerson"),
      Type: val("gtType"),
      Amount: num(val("gtAmount")),
      Date: val("gtDate") || today(),
      Purpose: val("gtPurpose"),
      Notes: val("gtNotes"),
    });

    ["gtPerson", "gtAmount", "gtPurpose", "gtNotes"].forEach((id) => ($(id).value = ""));
    renderAll();
    toast("Saved");
  } catch (e) {
    toast(e.message);
  }
}

/* ================= VEHICLES ================= */
function vehicleName(id) {
  return (DB.vehicles || []).find((v) => String(v.ID) === String(id))?.["Vehicle Name"] || "Vehicle";
}

function fuelRecords(vehicleId) {
  return (DB.fuel || [])
    .filter((x) => String(x["Vehicle ID"]) === String(vehicleId))
    .sort((a, b) => {
      const dc = String(a.Date || "").localeCompare(String(b.Date || ""));
      if (dc !== 0) return dc;
      return num(a.Odometer) - num(b.Odometer);
    });
}

function latestFuelOdometer(vehicleId) {
  const records = fuelRecords(vehicleId);
  if (!records.length) return 0;
  return Math.max(...records.map((x) => num(x.Odometer)));
}

function lastFuelRecord(vehicleId) {
  const records = fuelRecords(vehicleId);
  return records.length ? records[records.length - 1] : null;
}

function vehicleStats(vehicle) {
  const records = fuelRecords(vehicle.ID);
  const currentKM = records.length ? Math.max(...records.map((x) => num(x.Odometer))) : 0;

  let totalDistance = 0;
  const distances = [];

  records.forEach((record, index) => {
    if (index === 0) return;
    const prev = records[index - 1];
    const d = num(record.Odometer) - num(prev.Odometer);
    if (d > 0) { totalDistance += d; distances.push(d); }
  });

  const validFuel = records.slice(1);
  const totalFuel = validFuel.reduce((s, x) => s + num(x.Quantity), 0);
  const totalCost = records.reduce((s, x) => s + num(x.Amount), 0);

  const avgKMPerFill = distances.length ? totalDistance / distances.length : 0;
  const mileage = totalFuel > 0 ? totalDistance / totalFuel : 0;
  const last = records.length ? records[records.length - 1] : null;

  return {
    records, currentKM, totalDistance, totalFuel, totalCost,
    fuelEntries: records.length, intervals: distances.length, avgKMPerFill, mileage,
    lastDate: last ? displayDate(last.Date) : "",
  };
}

function vehiclePerformanceCard(vehicle) {
  const s = vehicleStats(vehicle);
  const icon = String(vehicle["Vehicle Type"] || "").toLowerCase().includes("bike") ? "🏍️" : "🚗";

  return `
    <div class="maintenance-card">
      <h3>${icon} ${esc(vehicle["Vehicle Name"])}</h3>
      <div class="maint-row"><span>Current Odometer</span>
        <b>${s.currentKM ? s.currentKM.toLocaleString("en-IN") + " km" : "—"}</b></div>
      <div class="maint-row"><span>Fuel Entries</span><b>${s.fuelEntries}</b></div>
      <hr>
      <div class="maint-section-title">📏 Distance</div>
      <div class="maint-row"><span>Total KM Travelled</span>
        <b>${s.totalDistance.toLocaleString("en-IN")} km</b></div>
      <div class="maint-row"><span>Avg KM / Fuel Fill</span>
        <b>${s.avgKMPerFill ? s.avgKMPerFill.toFixed(1) + " km" : "—"}</b></div>
      <hr>
      <div class="maint-section-title">⛽ Fuel Performance</div>
      <div class="maint-row"><span>Fuel Used</span>
        <b>${s.totalFuel.toFixed(2)} L</b></div>
      <div class="maint-row"><span>Average Mileage</span>
        <b class="good-km">${s.mileage ? s.mileage.toFixed(2) + " km/L" : "—"}</b></div>
      <hr>
      <div class="maint-row"><span>Total Fuel Cost</span><b>${fmt(s.totalCost)}</b></div>
      <div class="maint-row"><span>Last Fuel Date</span><b>${s.lastDate || "—"}</b></div>
    </div>`;
}

function getMaintenanceRecord(vehicleId, type) {
  const keywords = type === "oil" ? ["oil", "oil change"] : ["service", "servicing"];

  const records = (DB.maintenance || [])
    .filter((x) => {
      if (String(x["Vehicle ID"]) !== String(vehicleId)) return false;
      const cat = String(x.Category || "").toLowerCase();
      return keywords.some((k) => cat.includes(k));
    })
    .sort((a, b) => {
      const kd = num(b.Odometer) - num(a.Odometer);
      if (kd !== 0) return kd;
      return String(b.Date || "").localeCompare(String(a.Date || ""));
    });

  return records[0] || null;
}

function getServiceInterval(vehicle) {
  const t = String(vehicle["Vehicle Type"] || "").toLowerCase();
  if (t.includes("bike") || t.includes("motorcycle") || t.includes("scooter")) return 3000;
  return 10000;
}

function maintenanceCard(vehicle) {
  const vehicleId = vehicle.ID;
  const interval = getServiceInterval(vehicle);
  const currentKM = latestFuelOdometer(vehicleId);
  const lastOil = getMaintenanceRecord(vehicleId, "oil");
  const lastService = getMaintenanceRecord(vehicleId, "service");

  const lastOilKM = lastOil ? num(lastOil.Odometer) : 0;
  const lastServiceKM = lastService ? num(lastService.Odometer) : 0;

  const nextOilTarget = lastOilKM > 0 ? lastOilKM + interval : 0;
  const nextServiceTarget = lastServiceKM > 0 ? lastServiceKM + interval : 0;

  const oilRemaining = nextOilTarget > 0 ? nextOilTarget - currentKM : 0;
  const serviceRemaining = nextServiceTarget > 0 ? nextServiceTarget - currentKM : 0;

  const oilClass = oilRemaining <= 0 && nextOilTarget > 0 ? "danger-km" : oilRemaining < 500 ? "warning-km" : "good-km";
  const serviceClass = serviceRemaining <= 0 && nextServiceTarget > 0 ? "danger-km" : serviceRemaining < 500 ? "warning-km" : "good-km";

  const icon = String(vehicle["Vehicle Type"] || "").toLowerCase().includes("bike") ? "🏍️" : "🚗";

  const kmFmt = (v) =>
    v >= 0 ? v.toLocaleString("en-IN") + " km" : Math.abs(v).toLocaleString("en-IN") + " km overdue";

  return `
    <div class="maintenance-card">
      <h3>${icon} ${esc(vehicle["Vehicle Name"])}</h3>
      <div class="maint-row"><span>Current Odometer</span>
        <b>${currentKM ? currentKM.toLocaleString("en-IN") + " km" : "—"}</b></div>
      <hr>
      <div class="maint-section-title">🛢️ Oil Change</div>
      <div class="maint-row"><span>Last Oil Change</span>
        <b>${lastOil ? displayDate(lastOil.Date) + " · " + lastOilKM.toLocaleString("en-IN") + " km" : "No record"}</b></div>
      <div class="maint-row"><span>Next Oil Target</span>
        <b>${nextOilTarget ? nextOilTarget.toLocaleString("en-IN") + " km" : "—"}</b></div>
      <div class="maint-row"><span>KM Remaining</span>
        <b class="${oilClass}">${nextOilTarget ? kmFmt(oilRemaining) : "—"}</b></div>
      <hr>
      <div class="maint-section-title">🔧 Service</div>
      <div class="maint-row"><span>Last Service</span>
        <b>${lastService ? displayDate(lastService.Date) + " · " + lastServiceKM.toLocaleString("en-IN") + " km" : "No record"}</b></div>
      <div class="maint-row"><span>Next Service Target</span>
        <b>${nextServiceTarget ? nextServiceTarget.toLocaleString("en-IN") + " km" : "—"}</b></div>
      <div class="maint-row"><span>KM Remaining</span>
        <b class="${serviceClass}">${nextServiceTarget ? kmFmt(serviceRemaining) : "—"}</b></div>
      <div class="maintenance-interval">${String(vehicle["Vehicle Type"] || "").toLowerCase().includes("bike")
        ? "Oil Change & Service every 3,000 km"
        : "Oil Change & Service every 10,000 km"}</div>
    </div>`;
}

function renderVehicles() {
  const vehicles = DB.vehicles || [];
  const type = val("vehicleTypeFilter");
  const vid = val("vehicleFilter");

  opt($("vehicleFilter"),
    vehicles.filter((v) => !type || v["Vehicle Type"] === type),
    (v) => v["Vehicle Name"], (v) => v.ID, "All Vehicles");

  ["fuelVehicle", "maintVehicle"].forEach((id) =>
    opt($(id), vehicles, (v) => v["Vehicle Name"], (v) => v.ID, "Select vehicle"));

  const fuels = (DB.fuel || []).filter((x) => !vid || String(x["Vehicle ID"]) === String(vid));
  const maint = (DB.maintenance || []).filter((x) => !vid || String(x["Vehicle ID"]) === String(vid));

  const fcost = fuels.reduce((s, x) => s + num(x.Amount), 0);
  const mcost = maint.reduce((s, x) => s + num(x.Amount), 0);

  $("vehicleDash").innerHTML =
    card("Fuel Cost", fmt(fcost)) +
    card("Maintenance Cost", fmt(mcost)) +
    card("Total Cost", fmt(fcost + mcost));

  const selected = vehicles.filter((v) => !vid || String(v.ID) === String(vid));

  $("vehiclePerformanceDashboard").innerHTML = selected.map(vehiclePerformanceCard).join("");
  $("vehicleMaintenanceSummary").innerHTML = selected.map(maintenanceCard).join("");

  const recentFuel = recentRecords(fuels, 5);

  $("fuelList").innerHTML =
    recentFuel.map((x) => `
    <div class="item">
      <div>
        <b>${esc(vehicleName(x["Vehicle ID"]))}</b><br>
        <small>${displayDate(x.Date)} • ${num(x.Odometer).toLocaleString("en-IN")} km • ${num(x.Quantity)} L</small>
      </div>
      <div>
        <b>${fmt(x.Amount)}</b><br>
        <button class="danger" onclick="del('fuel','${x.ID}')">Delete</button>
      </div>
    </div>`).join("") || "<p class='muted'>No recent fuel entries</p>";

  const recentMaint = recentRecords(maint, 10);

  $("maintenanceList").innerHTML =
    recentMaint.map((x) => `
    <div class="item">
      <div>
        <b>${esc(vehicleName(x["Vehicle ID"]))} • ${esc(x.Category)}</b><br>
        <small>${displayDate(x.Date)} • ${num(x.Odometer).toLocaleString("en-IN")} km${x.Remarks ? " • " + esc(x.Remarks) : ""}</small>
      </div>
      <div>
        <b>${fmt(x.Amount)}</b><br>
        <button class="danger" onclick="del('maintenance','${x.ID}')">Delete</button>
      </div>
    </div>`).join("") || "<p class='muted'>No recent maintenance entries</p>";

  const chartVehicles = selected.length ? selected : vehicles;
  const labels = chartVehicles.map((v) => v["Vehicle Name"]);

  chart("fuelChart", "bar", {
    labels,
    datasets: [{
      label: "Fuel Cost",
      data: chartVehicles.map((v) =>
        (DB.fuel || []).filter((x) => String(x["Vehicle ID"]) === String(v.ID))
          .reduce((s, x) => s + num(x.Amount), 0)
      ),
    }],
  });

  chart("maintenanceChart", "bar", {
    labels,
    datasets: [{
      label: "Maintenance Cost",
      data: chartVehicles.map((v) =>
        (DB.maintenance || []).filter((x) => String(x["Vehicle ID"]) === String(v.ID))
          .reduce((s, x) => s + num(x.Amount), 0)
      ),
    }],
  });
}

function updateFuelPreviousOdometer() {
  const vehicleId = val("fuelVehicle");
  const previous = lastFuelRecord(vehicleId);
  $("fuelLastOdo").value = previous ? num(previous.Odometer) : "";
  $("fuelOdo").value = "";
  $("fuelDistance").value = "";
}

function calculateFuelDistance() {
  const previous = num(val("fuelLastOdo"));
  const current = num(val("fuelOdo"));

  if (!current || !previous) { $("fuelDistance").value = ""; return; }

  const distance = current - previous;

  if (distance < 0) {
    $("fuelDistance").value = "";
    toast("Current odometer cannot be less than previous odometer");
    return;
  }

  $("fuelDistance").value = distance;
}

async function addVehicle() {
  const name = val("vehicleName");
  if (!name) return toast("Vehicle name required");

  try {
    await save("vehicles", {
      "Vehicle Name": name,
      "Vehicle Type": val("vehicleType") || "Car",
      "Number Plate": val("vehiclePlate"),
    });

    ["vehicleName", "vehiclePlate"].forEach((id) => ($(id).value = ""));
    renderAll();
    toast("Vehicle added");
  } catch (e) {
    console.error(e);
    toast(e.message);
  }
}

async function addFuel() {
  const vehicleId = val("fuelVehicle");
  const amount = num(val("fuelAmount"));
  const currentOdo = num(val("fuelOdo"));
  const previousOdo = num(val("fuelLastOdo"));

  if (!vehicleId || !amount || !currentOdo)
    return toast("Vehicle, current odometer and fuel amount are required");

  if (previousOdo && currentOdo <= previousOdo)
    return toast("Current odometer must be greater than previous odometer");

  try {
    await save("fuel", {
      "Vehicle ID": vehicleId,
      Date: val("fuelDate") || today(),
      Odometer: currentOdo,
      Quantity: num(val("fuelQty")),
      Amount: amount,
      "Fuel Type": val("fuelType"),
      Notes: val("fuelNotes"),
    });

    ["fuelLastOdo", "fuelOdo", "fuelDistance", "fuelQty", "fuelAmount", "fuelNotes"]
      .forEach((id) => ($(id).value = ""));

    renderAll();
    updateFuelPreviousOdometer();
    toast("Fuel saved");
  } catch (e) {
    console.error(e);
    toast(e.message);
  }
}

async function addMaintenance() {
  const vehicleId = val("maintVehicle");
  const amount = num(val("maintAmount"));

  if (!vehicleId || !amount)
    return toast("Vehicle and maintenance amount are required");

  try {
    await save("maintenance", {
      "Vehicle ID": vehicleId,
      Date: val("maintDate") || today(),
      Category: val("maintCategory") || "Service",
      Amount: amount,
      Odometer: num(val("maintOdo")),
      "Next Target KM": num(val("maintTargetKm")),
      Remarks: val("maintRemarks"),
    });

    ["maintAmount", "maintOdo", "maintTargetKm", "maintRemarks"]
      .forEach((id) => ($(id).value = ""));

    renderAll();
    toast("Maintenance saved");
  } catch (e) {
    console.error(e);
    toast(e.message);
  }
}

function resetVehicleFilters() {
  $("vehicleTypeFilter").value = "";
  $("vehicleFilter").value = "";
  renderVehicles();
}

/* ================= LISTS / DROPDOWNS ================= */
function fillLists() {
  const cats = unique((DB.passbook || []).map((x) => x.Category));

  opt($("dashCategory"), cats, (x) => x, (x) => x, "All Categories");
  opt($("pbFilterCategory"), cats, (x) => x, (x) => x, "All Categories");

  function dl(id, arr) {
    const e = $(id);
    if (!e) return;
    e.innerHTML = unique(arr).map((x) => `<option value="${esc(x)}"></option>`).join("");
  }

  dl("categoryList", cats);
  dl("accountList", (DB.passbook || []).map((x) => x.Account));
  dl("remarksList", (DB.passbook || []).map((x) => x.Remarks));
  dl("companyList", (DB.salary || []).map((x) => x.Company));
  dl("salaryRemarksList", (DB.salary || []).map((x) => x.Remarks));
  dl("personList", (DB.transactions || []).map((x) => x.Person));

  opt($("emiLoan"), DB.loans || [], (x) => x["Loan Name"], (x) => x.ID, "Select loan");
}

/* ================= APP STARTUP ================= */
document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("afh-theme");
  if (saved === "dark") document.body.classList.add("dark");

  $("themeBtn").onclick = () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("afh-theme", document.body.classList.contains("dark") ? "dark" : "light");
    $("themeBtn").textContent = document.body.classList.contains("dark") ? "☀️ Light" : "🌙 Dark";
  };

  $("themeBtn").textContent = document.body.classList.contains("dark") ? "☀️ Light" : "🌙 Dark";

  $("menuBtn").onclick = () => $("sidebar").classList.toggle("open");

  document.querySelectorAll("[data-page]").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
      $(b.dataset.page).classList.add("active");
      $("sidebar").classList.remove("open");
    };
  });

  ["dashMonth", "dashCategory"].forEach((id) =>
    $(id)?.addEventListener("change", renderDashboard));

  ["pbFilterMonth", "pbFilterCategory"].forEach((id) =>
    $(id)?.addEventListener("change", renderPassbook));

  $("vehicleTypeFilter")?.addEventListener("change", () => {
    $("vehicleFilter").value = "";
    renderVehicles();
  });

  $("vehicleFilter")?.addEventListener("change", renderVehicles);
  $("fuelVehicle")?.addEventListener("change", updateFuelPreviousOdometer);
  $("fuelOdo")?.addEventListener("input", calculateFuelDistance);

  ["pbDate", "gtDate", "fuelDate", "maintDate"].forEach((id) => {
    if ($(id)) $(id).value = today();
  });

  ["salMonth", "emiMonth"].forEach((id) => {
    if ($(id)) $(id).value = monthNow();
  });

  loadAll(false);
  startLiveRefresh();
});
