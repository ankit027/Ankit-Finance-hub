/* ═══════════════════════════════════════════════════════════════════
   ANKIT FINANCE HUB — FRONTEND (FINAL FIX)
   ═══════════════════════════════════════════════════════════════════ */

const API_URL = "https://script.google.com/macros/s/AKfycbyBzmIaPUtD0UGyjDWOU_1J9W14hL8Lk_VEQPEs_OA5dPPDVR78Wyxd__LclEi11CSJ3w/exec";
const LIVE_REFRESH_MS = 30000;

let DB = {};
let charts = {};
let lastSyncTime = 0;
let syncInProgress = false;
let refreshTimer = null;

const $ = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const monthNow = () => new Date().toISOString().slice(0, 7);
const num = (v) => Number(v || 0);

const fmt = (v) => "₹" + num(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const val = (id) => ($(id)?.value || "").trim();
const displayDate = (v) => { if (!v) return ""; const s = String(v); return s.includes("T") ? s.slice(0, 10) : s.slice(0, 10); };
const monthOf = (v) => String(v || "").slice(0, 7);
const unique = (a) => [...new Set(a.filter(Boolean))];


/* ═══════════════ 1. NAVIGATION & SEARCH (GLOBAL) ═══════════════ */

window.gotoPage = function(page) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll("[data-page]").forEach((b) => b.classList.remove("active"));
  
  const target = $(page);
  if (target) target.classList.add("active");
  
  const btn = document.querySelector(`[data-page="${page}"]`);
  if (btn) btn.classList.add("active");
  
  $("sidebar").classList.remove("open"); 
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.openSearch = function() { 
  $("searchOverlay").classList.add("show"); 
  setTimeout(() => $("globalSearch").focus(), 50); 
};

window.closeSearch = function() { 
  $("searchOverlay").classList.remove("show"); 
  $("globalSearch").value = ""; 
  $("searchResults").innerHTML = ""; 
};

function performSearch(query) {
  const q = query.toLowerCase().trim(), el = $("searchResults");
  if (!q) { el.innerHTML = ""; return; }
  const results = [];
  (DB.passbook || []).forEach((x) => { if (`${x.Category} ${x.Remarks} ${x.Date} ${x.Account}`.toLowerCase().includes(q)) results.push({ icon: "📒", title: x.Category, sub: x.Date, page: "passbook" }); });
  if (!results.length) el.innerHTML = emptyState("🔍", `No results`);
  else el.innerHTML = results.map((r) => `<div class="item" onclick="closeSearch(); gotoPage('${r.page}');"><div><b>${r.icon} ${esc(r.title)}</b><small>${esc(r.sub)}</small></div></div>`).join("");
}


/* ═══════════════ 2. DROPDOWNS ═══════════════ */

const DEFAULT_CATEGORIES = ["Food", "Petrol / Fuel", "Shopping", "Bills", "Festival", "Health", "Investment", "Insurance", "Donation", "Misc", "Entertainment", "Rent", "Salary", "Income", "Other"];
const DEFAULT_ACCOUNTS = ["Cash", "HDFC Bank", "Kotak", "Jio Payments Bank", "Amazon Pay", "Paytm", "Credit Card", "Vehicle Tracker"];

function populateCategoryDropdown() {
  const el = $("pbCat"); if (!el) return;
  const used = (DB.passbook || []).map((x) => x.Category).filter(Boolean);
  const custom = JSON.parse(localStorage.getItem("afh-custom-cats") || "[]");
  const all = unique([...DEFAULT_CATEGORIES, ...custom, ...used]).sort();
  el.innerHTML = `<option value="">Select Category</option>` + all.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("") + `<option value="__new__">+ Add new category…</option>`;
}

window.handleCategoryChange = function() {
  const el = $("pbCat"); if (!el) return;
  if (el.value === "__new__") {
    const name = prompt("Enter new category:");
    if (name && name.trim()) {
      const clean = name.trim();
      const custom = JSON.parse(localStorage.getItem("afh-custom-cats") || "[]");
      if (!custom.includes(clean)) { custom.push(clean); localStorage.setItem("afh-custom-cats", JSON.stringify(custom)); }
      populateCategoryDropdown(); el.value = clean;
    } else { el.value = ""; }
  }
};

function populateAccountDropdown() {
  const el = $("pbAccount"); if (!el) return;
  const used = (DB.passbook || []).map((x) => x.Account).filter(Boolean);
  const custom = JSON.parse(localStorage.getItem("afh-custom-accs") || "[]");
  const all = unique([...DEFAULT_ACCOUNTS, ...custom, ...used]).sort();
  el.innerHTML = `<option value="">Select Account</option>` + all.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("") + `<option value="__new__">+ Add new account…</option>`;
}

window.handleAccountChange = function() {
  const el = $("pbAccount"); if (!el) return;
  if (el.value === "__new__") {
    const name = prompt("Enter new account:");
    if (name && name.trim()) {
      const clean = name.trim();
      const custom = JSON.parse(localStorage.getItem("afh-custom-accs") || "[]");
      if (!custom.includes(clean)) { custom.push(clean); localStorage.setItem("afh-custom-accs", JSON.stringify(custom)); }
      populateAccountDropdown(); el.value = clean;
    } else { el.value = ""; }
  }
};


/* ═══════════════ 3. API & DATA ═══════════════ */

async function api(action, payload = {}, retries = 2) {
  const attempts = retries + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const timeout = attempt === 1 ? 60000 : 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(API_URL, {
        method: "POST", mode: "cors", redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...payload }),
        signal: controller.signal,
      });

      const text = await response.text();
      let json;
      try { json = JSON.parse(text); } catch (err) { throw new Error("Invalid data."); }
      if (!json.success) throw new Error(json.error || "Cloud request failed");
      return json;
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        const s = $("status"); if (s) s.textContent = `☁️ Retry ${attempt}/${retries}`;
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally { clearTimeout(timer); }
  }

  if (lastError?.name === "AbortError") throw new Error("Apps Script warming up.");
  throw lastError;
}

async function loadAll(showToast = false) {
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    if ($("status")) $("status").textContent = "☁️ Syncing...";
    const response = await api("loadAll", {}, 2);
    DB = response.data || {};
    ["transactions", "salary", "loans", "emi", "passbook", "people", "vehicles", "fuel", "maintenance", "budgets"].forEach((k) => {
      if (!Array.isArray(DB[k])) DB[k] = [];
    });

    renderAll();
    lastSyncTime = Date.now();
    if ($("status")) $("status").textContent = "☁️ Synced";
    if (showToast) toast("✓ Cloud data synced");
  } catch (e) {
    console.error("Load failed:", e);
    if ($("status")) $("status").textContent = "⚠️ Offline";
    if (showToast) toast("Sync failed");
    if (Object.keys(DB).length) renderAll();
  } finally { syncInProgress = false; }
}

function startLiveRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { if (!document.hidden && !syncInProgress) loadAll(false); }, LIVE_REFRESH_MS);
}

async function save(table, data) {
  const r = await api("save", { table, data });
  const rec = r.data.record;
  DB[table] = DB[table] || [];
  const i = DB[table].findIndex((x) => String(x.ID) === String(rec.ID));
  if (i >= 0) DB[table][i] = rec; else DB[table].push(rec);
  lastSyncTime = Date.now();
  return rec;
}

async function del(table, id, opts = {}) {
  const doDelete = async () => {
    try {
      await api("delete", { table, id });
      DB[table] = (DB[table] || []).filter((x) => String(x.ID) !== String(id));
      renderAll(); toast("Deleted");
    } catch (e) { toast(e.message); }
  };
  if (opts.skipConfirm) { await doDelete(); return; }
  showConfirm(`Delete?`, doDelete, "Delete?");
}


/* ═══════════════ 4. UI HELPERS ═══════════════ */

function toast(msg, ms = 2500) {
  const t = $("toast"); if (!t) return;
  t.textContent = msg; t.classList.add("show");
  clearTimeout(window._toast);
  window._toast = setTimeout(() => t.classList.remove("show"), ms);
}

function showSuccess(message, title = "Saved!") {
  const modal = $("successModal"); if (!modal) { toast("✅ " + message); return; }
  $("successTitle").textContent = title;
  $("successMessage").textContent = message;
  modal.classList.add("show");
  const close = () => modal.classList.remove("show");
  $("successOkBtn").onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
}

function showConfirm(message, onConfirm, title = "Are you sure?") {
  const modal = $("confirmModal"); if (!modal) { if (confirm(message)) onConfirm(); return; }
  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  modal.classList.add("show");
  const close = () => modal.classList.remove("show");
  $("confirmCancelBtn").onclick = close;
  $("confirmOkBtn").onclick = () => { close(); onConfirm(); };
  modal.onclick = (e) => { if (e.target === modal) close(); };
}

function card(label, value) { return `<div class="stat-card"><small>${esc(label)}</small><b>${value}</b></div>`; }
function emptyState(icon, title) { return `<div class="empty-state"><div class="empty-icon">${icon}</div><p><b>${esc(title)}</b></p></div>`; }

function opt(el, arr, textFn = (x) => x, valueFn = (x) => x, placeholder = "Select") {
  if (!el) return;
  const current = el.value;
  el.innerHTML = `<option value="">${placeholder}</option>` + arr.map((x) => `<option value="${esc(valueFn(x))}">${esc(textFn(x))}</option>`).join("");
  if (arr.some((x) => String(valueFn(x)) === String(current))) el.value = current;
}

function recentRecords(arr, limit = 10) { return [...arr].sort((a, b) => String(b.Date || "").localeCompare(String(a.Date || ""))).slice(0, limit); }

function renderAll() {
  renderDashboard();
  renderPassbook();
  renderSalary();
  renderLoans();
  renderGive();
  renderVehicles();
  fillLists();
}

function chart(id, type, data, options = {}) {
  if (!window.Chart) return;
  if (charts[id]) charts[id].destroy();
  const el = $(id); if (!el) return;
  charts[id] = new Chart(el, { type, data, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, ...options } });
}


/* ═══════════════ 5. RENDERERS ═══════════════ */

function renderDashboard() {
  const m = val("dashMonth") || monthNow();
  const pbThis = (DB.passbook || []).filter((x) => monthOf(x.Date) === m);
  const income = pbThis.filter((x) => x.Type === "Income").reduce((s, x) => s + num(x.Amount), 0);
  const expense = pbThis.filter((x) => x.Type === "Expense").reduce((s, x) => s + num(x.Amount), 0);

  if ($("heroIncome")) $("heroIncome").textContent = fmt(income);
  if ($("heroExpense")) $("heroExpense").textContent = fmt(expense);
  if ($("heroSavings")) $("heroSavings").textContent = fmt(income - expense);

  renderQuickMonths(); renderMonthlyBudgetWidget(m, expense); renderRecentActivity(); renderDashCharts(m);
}

function renderQuickMonths() {
  const el = $("quickMonths"); if (!el) return;
  const months = []; const now = new Date();
  for (let i = 0; i < 6; i++) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1).toISOString().slice(0, 7));

  el.innerHTML = months.map((mm) => {
    const [y, m] = mm.split("-");
    const label = new Date(y, m - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    return `<button class="${(val("dashMonth") || monthNow()) === mm ? "active" : ""}" onclick="setDashMonth('${mm}')">${label}</button>`;
  }).join("");
}

window.setDashMonth = function(mm) { $("dashMonth").value = mm; renderDashboard(); };

function getBudgetForMonth(m) { const b = (DB.budgets || []).find((x) => x.Month === m); return b ? num(b.Amount) : 0; }

window.saveMonthlyBudget = function() {
  const m = val("dashMonth") || monthNow();
  const inputVal = num($("monthlyBudgetInput").value);
  if (inputVal <= 0) return toast("Enter a valid amount");
  const existing = (DB.budgets || []).find((x) => x.Month === m);
  save("budgets", { ID: existing ? existing.ID : "", Month: m, Amount: inputVal, Category: "Total" }).then(() => { renderDashboard(); showSuccess(`Budget set to ${fmt(inputVal)}`, "Saved!"); }).catch(e => toast(e.message));
}

function renderMonthlyBudgetWidget(m, currentExpense) {
  const budget = getBudgetForMonth(m);
  if ($("monthlyBudgetInput")) $("monthlyBudgetInput").value = budget > 0 ? budget : "";
  const box = $("budgetProgressBox"); if (!box) return;
  if (budget <= 0) { box.innerHTML = emptyState("🎯", "No budget set."); return; }

  const pct = Math.min(100, (currentExpense / budget) * 100);
  const rawPct = (currentExpense / budget) * 100;
  const leftover = budget - currentExpense;
  const color = rawPct >= 100 ? "var(--danger)" : rawPct >= 80 ? "var(--warning)" : "var(--success)";

  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; margin-bottom:8px;"><span>Spent: <b>${fmt(currentExpense)}</b></span><span>Limit: <b>${fmt(budget)}</b></span></div>
    <div class="progress-bar" style="height:12px; background:var(--line); border-radius:8px; overflow:hidden;"><div style="width:${pct}%; background:${color}; height:100%; transition:width 0.3s;"></div></div>
    <div style="margin-top:8px; font-size:13px; color:${color}; font-weight:600;">${leftover >= 0 ? `${fmt(leftover)} Left` : `Over by ${fmt(Math.abs(leftover))}`} (${rawPct.toFixed(0)}% used)</div>
  `;
}

function renderDashCharts(m) {
  const months = []; const now = new Date();
  for (let i = 5; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1).toISOString().slice(0, 7));
  const inc = months.map((mm) => (DB.passbook || []).filter((x) => monthOf(x.Date) === mm && x.Type === "Income").reduce((s, x) => s + num(x.Amount), 0));
  const exp = months.map((mm) => (DB.passbook || []).filter((x) => monthOf(x.Date) === mm && x.Type === "Expense").reduce((s, x) => s + num(x.Amount), 0));
  const labels = months.map((mm) => { const [y, m] = mm.split("-"); return new Date(y, m - 1).toLocaleDateString("en-IN", { month: "short" }); });

  chart("mainChart", "bar", { labels, datasets: [{ label: "Income", data: inc, backgroundColor: "#16a34a" }, { label: "Expense", data: exp, backgroundColor: "#dc2626" }] });

  const cats = unique((DB.passbook || []).filter((x) => monthOf(x.Date) === m && x.Type === "Expense").map((x) => x.Category || "Other"));
  const catValues = cats.map((cat) => (DB.passbook || []).filter((x) => monthOf(x.Date) === m && x.Type === "Expense" && (x.Category || "Other") === cat).reduce((s, x) => s + num(x.Amount), 0));
  chart("expenseChart", "doughnut", { labels: cats.length ? cats : ["No data"], datasets: [{ data: cats.length ? catValues : [1], backgroundColor: cats.length ? ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"] : ["#e5e7eb"], borderWidth: 0 }] });
}

function renderRecentActivity() {
  const el = $("recentActivity"); if (!el) return;
  const recent = [...(DB.passbook || [])].sort((a, b) => String(b.Date).localeCompare(String(a.Date))).slice(0, 6);
  if (!recent.length) { el.innerHTML = emptyState("📭", "No transactions yet"); return; }
  el.innerHTML = recent.map((x) => `<div class="recent-item"><div class="recent-main"><div class="recent-title">${esc(x.Category || "Uncategorized")}</div><div class="recent-sub">${esc(x.Date)}</div></div><div class="recent-amount ${x.Type === "Expense" ? "expense" : "income"}">${x.Type === "Expense" ? "−" : "+"}${fmt(x.Amount)}</div></div>`).join("");
}


/* ═══════════════ 6. PASSBOOK & OTHERS ═══════════════ */

window.togglePassbookForm = function() {
  const form = $("pbForm");
  if (form.classList.contains("hidden")) {
    form.classList.remove("hidden"); $("pbDate").value = today(); populateCategoryDropdown(); populateAccountDropdown(); $("pbCat").focus();
  } else { cancelPassbookForm(); }
};

window.cancelPassbookForm = function() {
  $("pbForm").classList.add("hidden");
  ["pbEditId", "pbCat", "pbAmt", "pbAccount", "pbRemarks"].forEach((id) => { if ($(id)) $(id).value = ""; });
  $("pbDate").value = today(); $("pbType").value = "Expense"; $("pbForm").classList.remove("editing");
};

window.editPassbook = function(id) {
  const x = (DB.passbook || []).find((r) => String(r.ID) === String(id)); if (!x) return;
  populateCategoryDropdown(); populateAccountDropdown();
  $("pbForm").classList.remove("hidden");
  $("pbEditId").value = x.ID || ""; $("pbDate").value = displayDate(x.Date); $("pbType").value = x.Type || "Expense";
  $("pbCat").value = x.Category || ""; $("pbAmt").value = x.Amount || ""; $("pbAccount").value = x.Account || ""; $("pbRemarks").value = x.Remarks || "";
  $("pbForm").classList.add("editing"); window.scrollTo({ top: 0, behavior: "smooth" });
};

window.addPassbook = async function() {
  if (!val("pbDate") || !val("pbCat") || !num(val("pbAmt"))) return toast("Date, category and amount required");
  if (!val("pbAccount")) return toast("Please select an account");
  const editing = !!val("pbEditId");
  try {
    await save("passbook", { ID: val("pbEditId"), Date: val("pbDate"), Type: val("pbType"), Category: val("pbCat"), Amount: num(val("pbAmt")), Account: val("pbAccount"), Remarks: val("pbRemarks") });
    cancelPassbookForm(); renderAll(); showSuccess(`Saved!`, editing ? "Updated!" : "Saved!");
  } catch (e) { toast(e.message); }
};

window.resetPassbookFilters = function() { ["pbFromDate", "pbToDate", "pbFilterCategory", "pbFilterType"].forEach((id) => { if ($(id)) $(id).value = ""; }); renderPassbook(); };

function renderPassbook() {
  const from = val("pbFromDate"), to = val("pbToDate"), cat = val("pbFilterCategory"), type = val("pbFilterType");
  const rows = (DB.passbook || []).filter((x) => {
    if (from && x.Date < from) return false; if (to && x.Date > to) return false; if (cat && x.Category !== cat) return false; if (type && x.Type !== type) return false; return true;
  }).sort((a, b) => String(b.Date).localeCompare(String(a.Date)));

  const income = rows.filter((x) => x.Type === "Income").reduce((s, x) => s + num(x.Amount), 0);
  const expense = rows.filter((x) => x.Type === "Expense").reduce((s, x) => s + num(x.Amount), 0);
  if ($("passbookDash")) $("passbookDash").innerHTML = card("Income", fmt(income)) + card("Expense", fmt(expense)) + card("Balance", fmt(income - expense));

  const el = $("pbList"); if (!el) return;
  if (!rows.length) { el.innerHTML = emptyState("📒", "No entries found"); return; }

  el.innerHTML = rows.map((x) => `
    <div class="item"><div><b>${esc(x.Category || "Uncategorized")} • ${esc(x.Type)}</b><small>${esc(x.Date)} · ${esc(x.Account || "—")}${x.Remarks ? " · " + esc(x.Remarks) : ""}</small></div>
    <div><span class="item-amount" style="color:${x.Type === "Expense" ? "var(--danger)" : "var(--success)"}">${x.Type === "Expense" ? "−" : "+"}${fmt(x.Amount)}</span><div class="item-actions"><button class="success small" onclick="editPassbook('${x.ID}')">Edit</button><button class="danger small" onclick="del('passbook','${x.ID}')">Delete</button></div></div></div>
  `).join("");
}

// SALARY
window.toggleSalaryForm = function() { const f = $("salaryForm"); if (f.classList.contains("hidden")) { f.classList.remove("hidden"); $("salMonth").value = monthNow(); $("salCompany").focus(); } else { cancelSalaryForm(); } };
window.cancelSalaryForm = function() { $("salaryForm").classList.add("hidden"); ["salCompany", "salAmount", "salRemarks"].forEach((id) => $(id).value = ""); };
window.addSalary = async function() {
  if (!val("salMonth") || !num(val("salAmount"))) return toast("Month and amount required");
  try { await save("salary", { Month: val("salMonth") + "-01", Company: val("salCompany") || "Salary", Amount: num(val("salAmount")), Remarks: val("salRemarks") }); cancelSalaryForm(); renderAll(); showSuccess(`Saved!`); } catch (e) { toast(e.message); }
};
function renderSalary() {
  const rows = (DB.salary || []).sort((a, b) => String(b.Month).localeCompare(String(a.Month)));
  if ($("salaryDash")) $("salaryDash").innerHTML = card("Total", fmt(rows.reduce((s, x) => s + num(x.Amount), 0)));
  const list = $("salaryList");
  if (list) { if (!rows.length) list.innerHTML = emptyState("💰", "No records"); else list.innerHTML = rows.map((x) => `<div class="item"><div><b>${esc(x.Company)}</b></div><div><span class="item-amount">+${fmt(x.Amount)}</span><button class="danger small" onclick="del('salary','${x.ID}')">Delete</button></div></div>`).join(""); }
  if ($("salaryChart")) chart("salaryChart", "line", { labels: rows.slice().reverse().map((x) => String(x.Month).slice(0, 7)), datasets: [{ label: "Salary", data: rows.slice().reverse().map((x) => num(x.Amount)), borderColor: "#2563eb" }] });
}

// LOANS, GIVE, VEHICLES (condensed for brevity, logic identical to previous working version)
window.addLoan = async function() { if (!val("loanName") || !num(val("loanInitial"))) return toast("Required"); try { await save("loans", { "Loan Name": val("loanName"), "Initial Amount": num(val("loanInitial")), Remarks: val("loanRemarks") }); ["loanName", "loanInitial", "loanRemarks"].forEach((id) => ($(id).value = "")); renderAll(); showSuccess(`Saved!`); } catch (e) { toast(e.message); } };
window.addEmi = async function() { if (!val("emiLoan") || !val("emiMonth") || !num(val("emiAmount"))) return toast("Required"); try { await save("emi", { "Loan ID": val("emiLoan"), Month: val("emiMonth") + "-01", Amount: num(val("emiAmount")), Remarks: val("emiRemarks") }); $("emiAmount").value = ""; $("emiRemarks").value = ""; renderAll(); showSuccess(`Saved!`); } catch (e) { toast(e.message); } };
function renderLoans() { const loans = DB.loans || [], emi = DB.emi || []; if ($("loanDash")) $("loanDash").innerHTML = card("Total Loan", fmt(loans.reduce((s, x) => s + num(x["Initial Amount"]), 0))); const el = $("loanList"); if (!el) return; if (!loans.length) { el.innerHTML = emptyState("🏛️", "No loans"); return; } el.innerHTML = loans.map((l) => { const p = emi.filter((e) => String(e["Loan ID"]) === String(l.ID)).reduce((s, e) => s + num(e.Amount), 0); return `<div class="item"><div><b>${esc(l["Loan Name"])}</b></div><div><span class="item-amount">${fmt(num(l["Initial Amount"]) - p)}</span><button class="danger small" onclick="del('loans','${l.ID}')">Delete</button></div></div>`; }).join(""); }

window.addGive = async function() { if (!val("gtPerson") || !num(val("gtAmount"))) return toast("Required"); try { await save("transactions", { Person: val("gtPerson"), Type: val("gtType"), Amount: num(val("gtAmount")), Date: val("gtDate") || today(), Purpose: val("gtPurpose"), Notes: val("gtNotes") }); ["gtPerson", "gtAmount", "gtPurpose", "gtNotes"].forEach((id) => ($(id).value = "")); renderAll(); showSuccess(`Saved!`); } catch (e) { toast(e.message); } };
window.resetGiveFilters = function() { ["gtFilterType", "gtFilterPerson"].forEach((id) => { if ($(id)) $(id).value = ""; }); renderGive(); };
function renderGive() {
  const rows = (DB.transactions || []).filter((x) => { if (val("gtFilterType") && x.Type !== val("gtFilterType")) return false; if (val("gtFilterPerson") && x.Person !== val("gtFilterPerson")) return false; return true; });
  let r = 0, p = 0; rows.forEach((x) => { const a = num(x.Amount); if (x.Type === "Pending to Take") r += a; if (x.Type === "Received") r -= a; if (x.Type === "Pending to Pay") p += a; if (x.Type === "Paid") p -= a; });
  if ($("giveDash")) $("giveDash").innerHTML = card("📥 To Receive", fmt(Math.max(0, r))) + card("📤 To Pay", fmt(Math.max(0, p)));
  const el = $("gtList"); if (!el) return; if (!rows.length) { el.innerHTML = emptyState("🤝", "No records"); return; }
  el.innerHTML = rows.map((x) => `<div class="item"><div><b>${esc(x.Person)}</b></div><div><span class="item-amount">${fmt(x.Amount)}</span><button class="danger small" onclick="del('transactions','${x.ID}')">Delete</button></div></div>`).join("");
  opt($("gtFilterPerson"), unique((DB.transactions || []).map((x) => x.Person)), (x) => x, (x) => x, "All");
}

function renderVehicles() {
  const vehicles = DB.vehicles || []; const type = val("vehicleTypeFilter"), vid = val("vehicleFilter");
  opt($("vehicleFilter"), vehicles.filter((v) => !type || v["Vehicle Type"] === type), (v) => v["Vehicle Name"], (v) => v.ID, "All");
  ["fuelVehicle", "maintVehicle"].forEach((id) => opt($(id), vehicles, (v) => v["Vehicle Name"], (v) => v.ID, "Select vehicle"));
  const fuels = (DB.fuel || []).filter((x) => !vid || String(x["Vehicle ID"]) === String(vid));
  const maint = (DB.maintenance || []).filter((x) => !vid || String(x["Vehicle ID"]) === String(vid));
  const fcost = fuels.reduce((s, x) => s + num(x.Amount), 0), mcost = maint.reduce((s, x) => s + num(x.Amount), 0);
  if ($("vehicleDash")) $("vehicleDash").innerHTML = card("Fuel Cost", fmt(fcost)) + card("Maintenance", fmt(mcost)) + card("Total", fmt(fcost + mcost));
  const fl = $("fuelList"); if (fl) { const rf = recentRecords(fuels, 10); fl.innerHTML = rf.length ? rf.map((x) => `<div class="item"><div><b>${esc((DB.vehicles||[]).find(v=>v.ID===x["Vehicle ID"])?.["Vehicle Name"]||"Vehicle")}</b></div><div><span class="item-amount">${fmt(x.Amount)}</span><button class="danger small" onclick="del('fuel','${x.ID}')">Delete</button></div></div>`).join("") : emptyState("⛽", "No records"); }
  const ml = $("maintenanceList"); if (ml) { const rm = recentRecords(maint, 10); ml.innerHTML = rm.length ? rm.map((x) => `<div class="item"><div><b>${esc(x.Category)}</b></div><div><span class="item-amount">${fmt(x.Amount)}</span><button class="danger small" onclick="del('maintenance','${x.ID}')">Delete</button></div></div>`).join("") : emptyState("🔧", "No records"); }
}
window.resetVehicleFilters = function() { $("vehicleTypeFilter").value = ""; $("vehicleFilter").value = ""; renderVehicles(); };
window.updateFuelPreviousOdometer = function() { const r = (DB.fuel || []).filter(x=>x["Vehicle ID"]===val("fuelVehicle")).sort((a,b)=>a.Date.localeCompare(b.Date)); $("fuelLastOdo").value = r.length ? num(r[r.length-1].Odometer) : ""; $("fuelOdo").value = ""; };
window.addVehicle = async function() { if (!val("vehicleName")) return toast("Required"); try { await save("vehicles", { "Vehicle Name": val("vehicleName"), "Vehicle Type": val("vehicleType") || "Car", "Number Plate": val("vehiclePlate") }); ["vehicleName", "vehiclePlate"].forEach((id) => ($(id).value = "")); renderAll(); showSuccess("Saved!"); } catch (e) { toast(e.message); } };
window.addFuel = async function() { if (!val("fuelVehicle") || !num(val("fuelAmount"))) return toast("Required"); try { await save("fuel", { "Vehicle ID": val("fuelVehicle"), Date: val("fuelDate") || today(), Odometer: num(val("fuelOdo")), Amount: num(val("fuelAmount")), "Fuel Type": val("fuelType"), Notes: val("fuelNotes") }); ["fuelLastOdo", "fuelOdo", "fuelDistance", "fuelAmount", "fuelNotes"].forEach((id) => ($(id).value = "")); renderAll(); showSuccess(`Saved!`); } catch (e) { toast(e.message); } };
window.addMaintenance = async function() { if (!val("maintVehicle") || !num(val("maintAmount"))) return toast("Required"); try { await save("maintenance", { "Vehicle ID": val("maintVehicle"), Date: val("maintDate") || today(), Category: val("maintCategory"), Amount: num(val("maintAmount")), Odometer: num(val("maintOdo")), "Next Target KM": num(val("maintTargetKm")), Remarks: val("maintRemarks") }); ["maintAmount", "maintOdo", "maintTargetKm", "maintRemarks"].forEach((id) => ($(id).value = "")); renderAll(); showSuccess(`Saved!`); } catch (e) { toast(e.message); } };


/* ═══════════════ 7. LISTS & APP STARTUP ═══════════════ */

function fillLists() {
  const cats = unique((DB.passbook || []).map((x) => x.Category));
  opt($("pbFilterCategory"), cats, (x) => x, (x) => x, "All");
  function dl(id, arr) { const e = $(id); if (e) e.innerHTML = unique(arr).map((x) => `<option value="${esc(x)}"></option>`).join(""); }
  dl("remarksList", (DB.passbook || []).map((x) => x.Remarks));
  dl("companyList", (DB.salary || []).map((x) => x.Company));
  dl("salaryRemarksList", (DB.salary || []).map((x) => x.Remarks));
  dl("personList", (DB.transactions || []).map((x) => x.Person));
  opt($("emiLoan"), DB.loans || [], (x) => x["Loan Name"], (x) => x.ID, "Select loan");
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("afh-theme");
  if (saved === "dark") document.body.classList.add("dark");

  $("themeBtn").onclick = () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("afh-theme", document.body.classList.contains("dark") ? "dark" : "light");
    $("themeBtn").textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
  };
  $("themeBtn").textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";

  $("menuBtn").onclick = () => $("sidebar").classList.toggle("open");
  document.querySelectorAll("[data-page]").forEach((b) => b.onclick = () => gotoPage(b.dataset.page));

  $("searchBtn").onclick = openSearch;
  $("closeSearch").onclick = closeSearch;
  $("globalSearch").addEventListener("input", (e) => performSearch(e.target.value));
  $("searchOverlay").onclick = (e) => { if (e.target.id === "searchOverlay") closeSearch(); };

  ["pbFromDate", "pbToDate", "pbFilterCategory", "pbFilterType"].forEach((id) => $(id)?.addEventListener("change", renderPassbook));
  ["gtFilterType", "gtFilterPerson"].forEach((id) => $(id)?.addEventListener("change", renderGive));
  $("vehicleTypeFilter")?.addEventListener("change", () => { $("vehicleFilter").value = ""; renderVehicles(); });
  $("vehicleFilter")?.addEventListener("change", renderVehicles);
  $("fuelVehicle")?.addEventListener("change", updateFuelPreviousOdometer);

  ["pbDate", "gtDate", "fuelDate", "maintDate"].forEach((id) => { if ($(id)) $(id).value = today(); });
  ["salMonth", "emiMonth", "budgetMonth", "dashMonth"].forEach((id) => { if ($(id)) $(id).value = monthNow(); });

  loadAll(false);
  startLiveRefresh();
});
