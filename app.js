/* ═══════════════════════════════════════════════════════════════════
   ANKIT FINANCE HUB — FRONTEND v3
   ═══════════════════════════════════════════════════════════════════ */

const API_URL =
  "https://script.google.com/macros/s/AKfycbyBzmIaPUtD0UGyjDWOU_1J9W14hL8Lk_VEQPEs_OA5dPPDVR78Wyxd__LclEi11CSJ3w/exec";

const LIVE_REFRESH_MS = 30000;

let DB = {};
let charts = {};
let lastSyncTime = 0;
let syncInProgress = false;
let refreshTimer = null;
let currentQuickMonth = "";
let undoStack = [];

const $ = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const monthNow = () => new Date().toISOString().slice(0, 7);
const num = (v) => Number(v || 0);

const fmt = (v) =>
  "₹" + num(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const fmtShort = (v) => {
  const n = num(v);
  if (Math.abs(n) >= 10000000) return "₹" + (n / 10000000).toFixed(2) + " Cr";
  if (Math.abs(n) >= 100000) return "₹" + (n / 100000).toFixed(2) + " L";
  if (Math.abs(n) >= 1000) return "₹" + (n / 1000).toFixed(1) + "K";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));

const val = (id) => ($(id)?.value || "").trim();

const displayDate = (v) => {
  if (!v) return "";
  const s = String(v);
  return s.includes("T") ? s.slice(0, 10) : s.slice(0, 10);
};

const monthOf = (v) => String(v || "").slice(0, 7);

const unique = (a) => [...new Set(a.filter(Boolean))];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);


/* ═══════════════ TOAST ═══════════════ */

function toast(msg, ms = 2500) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window._toast);
  window._toast = setTimeout(() => t.classList.remove("show"), ms);
}


/* ═══════════════ STATUS ═══════════════ */

function setStatus(text) {
  const el = $("status");
  if (el) el.textContent = text;
}

function updateSyncLabel() {
  if (!lastSyncTime) { setStatus("☁️"); return; }
  const secs = Math.floor((Date.now() - lastSyncTime) / 1000);
  if (secs < 5) setStatus("☁️ Synced");
  else if (secs < 60) setStatus(`☁️ ${secs}s`);
  else if (secs < 3600) setStatus(`☁️ ${Math.floor(secs / 60)}m`);
  else setStatus("☁️ Synced");
}


/* ═══════════════ SUCCESS MODAL ═══════════════ */

function showSuccess(message = "Saved successfully.", title = "Saved!") {
  const modal = $("successModal");
  if (!modal) { toast("✅ " + message); return; }
  $("successTitle").textContent = title;
  $("successMessage").textContent = message;
  modal.classList.add("show");
  setTimeout(() => $("successOkBtn")?.focus(), 50);
  const close = () => modal.classList.remove("show");
  $("successOkBtn").onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  document.addEventListener("keydown", function h(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", h); }
  });
}


/* ═══════════════ CONFIRM MODAL ═══════════════ */

function showConfirm(message, onConfirm, title = "Are you sure?") {
  const modal = $("confirmModal");
  if (!modal) { if (confirm(message)) onConfirm(); return; }
  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  modal.classList.add("show");
  const close = () => modal.classList.remove("show");
  $("confirmCancelBtn").onclick = close;
  $("confirmOkBtn").onclick = () => { close(); onConfirm(); };
  modal.onclick = (e) => { if (e.target === modal) close(); };
}


/* ═══════════════ API ═══════════════ */

async function api(action, payload = {}, retries = 2) {
  const attempts = retries + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const timeout = attempt === 1 ? 60000 : 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

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
      try { json = JSON.parse(text); }
      catch (err) { throw new Error("Server returned invalid data."); }

      if (!json.success) throw new Error(json.error || "Cloud request failed");
      return json;

    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        setStatus(`☁️ Retry ${attempt}/${retries}`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError?.name === "AbortError") {
    throw new Error("Apps Script warming up. Please retry in a moment.");
  }
  throw lastError;
}


/* ═══════════════ LOAD ═══════════════ */

async function loadAll(showToast = false) {
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    setStatus("☁️ Syncing...");
    const response = await api("loadAll", {}, 2);
    DB = response.data || {};

    [
      "transactions", "salary", "loans", "emi", "passbook",
      "people", "vehicles", "fuel", "maintenance",
      "accounts", "monthlyOpenings", "transfers", "budgets"
    ].forEach((k) => {
      if (!Array.isArray(DB[k])) DB[k] = [];
    });

    renderAll();
    lastSyncTime = Date.now();
    setStatus("☁️ Synced");

    if (showToast) toast("✓ Cloud data synced");

  } catch (e) {
    console.error("Load failed:", e);
    if (Object.keys(DB).length && DB.passbook?.length) {
      setStatus("☁️ Offline");
      if (showToast) toast("Showing cached data");
    } else {
      setStatus("⚠️ Failed");
      if (showToast) toast("Sync failed — tap 🔄");
    }
    if (Object.keys(DB).length) renderAll();
  } finally {
    syncInProgress = false;
  }
}


/* ═══════════════ LIVE REFRESH ═══════════════ */

function startLiveRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    updateSyncLabel();
    if (!document.hidden && !syncInProgress) loadAll(false);
  }, LIVE_REFRESH_MS);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !syncInProgress && Date.now() - lastSyncTime > 5000) {
    loadAll(false);
  }
});


/* ═══════════════ SAVE / DELETE ═══════════════ */

async function save(table, data) {
  const r = await api("save", { table, data });
  const rec = r.data.record;
  DB[table] = DB[table] || [];
  const i = DB[table].findIndex((x) => String(x.ID) === String(rec.ID));
  if (i >= 0) DB[table][i] = rec;
  else DB[table].push(rec);
  lastSyncTime = Date.now();
  return rec;
}

async function del(table, id, opts = {}) {
  const label = opts.label || "this record";
  const doDelete = async () => {
    try {
      await api("delete", { table, id });
      DB[table] = (DB[table] || []).filter((x) => String(x.ID) !== String(id));
      renderAll();
      toast("Deleted");
    } catch (e) {
      toast(e.message);
    }
  };

  if (opts.skipConfirm) { await doDelete(); return; }

  showConfirm(`Delete ${label}?`, doDelete, "Delete?");
}


/* ═══════════════ HELPERS ═══════════════ */

function card(label, value) {
  return `<div class="stat-card"><small>${esc(label)}</small><b>${value}</b></div>`;
}

function emptyState(icon, title, hint = "") {
  return `<div class="empty-state">
    <div class="empty-icon">${icon}</div>
    <p><b>${esc(title)}</b></p>
    ${hint ? `<p class="small-text">${esc(hint)}</p>` : ""}
  </div>`;
}

function opt(el, arr, textFn = (x) => x, valueFn = (x) => x, placeholder = "Select") {
  if (!el) return;
  const current = el.value;
  el.innerHTML =
    `<option value="">${placeholder}</option>` +
    arr.map((x) => `<option value="${esc(valueFn(x))}">${esc(textFn(x))}</option>`).join("");
  if (arr.some((x) => String(valueFn(x)) === String(current))) el.value = current;
}

function recentRecords(arr, limit = 10) {
  return [...arr]
    .sort((a, b) => String(b.Date || "").localeCompare(String(a.Date || "")))
    .slice(0, limit);
}


function renderAll() {
  renderDashboard();
  renderAccounts();
  renderPassbook();
  renderBudgets();
  renderBudgetHero();    // ← ADD THIS
  renderSalary();
  renderLoans();
  renderGive();
  renderVehicles();
  fillLists();
}


/* ═══════════════ CHART ═══════════════ */

function chart(id, type, data, options = {}) {
  if (!window.Chart) return;
  if (charts[id]) charts[id].destroy();
  const el = $(id);
  if (!el) return;
  charts[id] = new Chart(el, {
    type, data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 10 } } },
      ...options,
    },
  });
/* ═══════════════ ACCOUNT HELPERS ═══════════════ */

function accountName(id) {
  return (DB.accounts || []).find((a) => String(a.ID) === String(id))?.["Account Name"] || "—";
}

function accountOpening(id) {
  const a = (DB.accounts || []).find((x) => String(x.ID) === String(id));
  return a ? num(a["Opening Balance"]) : 0;
}

function accountBalance(accountId) {
  const accountNameValue = accountName(accountId);
  const opening = accountOpening(accountId);

  let balance = opening;

  (DB.passbook || []).forEach((x) => {
    if (String(x.Account || "").trim() !== String(accountNameValue).trim()) return;
    if (x.Type === "Income") balance += num(x.Amount);
    if (x.Type === "Expense") balance -= num(x.Amount);
  });

  (DB.transfers || []).forEach((t) => {
    if (String(t["From Account"] || "") === String(accountNameValue)) balance -= num(t.Amount);
    if (String(t["To Account"] || "") === String(accountNameValue)) balance += num(t.Amount);
  });

  return balance;
}

function totalNetWorth() {
  return (DB.accounts || []).reduce((sum, a) => sum + accountBalance(a.ID), 0);
}


/* ═══════════════ DASHBOARD ═══════════════ */

function renderDashboard() {
  const m = val("dashMonth") || monthNow();
  const pbThis = (DB.passbook || []).filter((x) => monthOf(x.Date) === m);

  const income = pbThis.filter((x) => x.Type === "Income").reduce((s, x) => s + num(x.Amount), 0);
  const expense = pbThis.filter((x) => x.Type === "Expense").reduce((s, x) => s + num(x.Amount), 0);
  const netWorth = totalNetWorth();

  $("heroNetWorth").textContent = fmt(netWorth);
  $("heroNetSub").textContent = `${(DB.accounts || []).length} accounts`;

  $("heroIncome").textContent = fmt(income);
  $("heroIncomeSub").textContent = `${pbThis.filter((x) => x.Type === "Income").length} entries`;

  $("heroExpense").textContent = fmt(expense);
  $("heroExpenseSub").textContent = `${pbThis.filter((x) => x.Type === "Expense").length} entries`;

  const savings = income - expense;
  $("heroSavings").textContent = fmt(savings);
  $("heroSavingsSub").textContent = income > 0
    ? `${((savings / income) * 100).toFixed(0)}% of income`
    : "This month";

  renderQuickMonths();
  renderDashBudgetHero();
  renderRecentActivity();
  renderDashStats(m);
  renderDashCharts(m);
}

function renderQuickMonths() {
  const el = $("quickMonths");
  if (!el) return;

  const months = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    months.push(key);
  }

  el.innerHTML = months.map((mm) => {
    const [y, m] = mm.split("-");
    const label = new Date(y, m - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    const active = (val("dashMonth") || monthNow()) === mm ? "active" : "";
    return `<button class="${active}" onclick="setDashMonth('${mm}')">${label}</button>`;
  }).join("");
}

function setDashMonth(mm) {
  $("dashMonth").value = mm;
  currentQuickMonth = mm;
  renderDashboard();
}

function renderDashCharts(m) {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }

  const inc = months.map((mm) =>
    (DB.passbook || []).filter((x) => monthOf(x.Date) === mm && x.Type === "Income")
      .reduce((s, x) => s + num(x.Amount), 0));

  const exp = months.map((mm) =>
    (DB.passbook || []).filter((x) => monthOf(x.Date) === mm && x.Type === "Expense")
      .reduce((s, x) => s + num(x.Amount), 0));

  const labels = months.map((mm) => {
    const [y, m] = mm.split("-");
    return new Date(y, m - 1).toLocaleDateString("en-IN", { month: "short" });
  });

  chart("mainChart", "bar", {
    labels,
    datasets: [
      { label: "Income", data: inc, backgroundColor: "#16a34a", borderRadius: 6 },
      { label: "Expense", data: exp, backgroundColor: "#dc2626", borderRadius: 6 },
    ],
  });

  const cats = unique(
    (DB.passbook || [])
      .filter((x) => monthOf(x.Date) === m && x.Type === "Expense")
      .map((x) => x.Category || "Other")
  );

  const catValues = cats.map((cat) =>
    (DB.passbook || [])
      .filter((x) => monthOf(x.Date) === m && x.Type === "Expense" && (x.Category || "Other") === cat)
      .reduce((s, x) => s + num(x.Amount), 0)
  );

  const colors = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

  chart("expenseChart", "doughnut", {
    labels: cats.length ? cats : ["No data"],
    datasets: [{
      data: cats.length ? catValues : [1],
      backgroundColor: cats.length ? colors.slice(0, cats.length) : ["#e5e7eb"],
      borderWidth: 0,
    }],
  });
}

function renderDashBudgets(m) {
  const el = $("dashBudgets");
  if (!el) return;

  const budgets = (DB.budgets || []).filter((b) => !b.Month || b.Month === m);

  if (!budgets.length) {
    el.innerHTML = emptyState("🎯", "No budgets set", "Tap Manage to set monthly limits");
    return;
  }

  const rows = budgets.slice(0, 5).map((b) => {
    const spent = (DB.passbook || [])
      .filter((x) => monthOf(x.Date) === m && x.Type === "Expense" && x.Category === b.Category)
      .reduce((s, x) => s + num(x.Amount), 0);

    const limit = num(b.Amount);
    const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
    const color = pct >= 100 ? "#dc2626" : pct >= 80 ? "#f59e0b" : "#16a34a";

    return `<div class="mini-budget">
      <div class="mini-budget-header">
        <span>${esc(b.Category)}</span>
        <span>${fmt(spent)} / ${fmt(limit)}</span>
      </div>
      <div class="progress-bar">
        <div style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
  }).join("");

  el.innerHTML = rows;
}

function renderRecentActivity() {
  const el = $("recentActivity");
  if (!el) return;

  const recent = [...(DB.passbook || [])]
    .sort((a, b) => String(b.Date).localeCompare(String(a.Date)))
    .slice(0, 6);

  if (!recent.length) {
    el.innerHTML = emptyState("📭", "No transactions yet", "Add your first entry");
    return;
  }

  el.innerHTML = recent.map((x) => `
    <div class="recent-item">
      <div class="recent-main">
        <div class="recent-title">${esc(x.Category || "Uncategorized")}</div>
        <div class="recent-sub">${esc(x.Date)} · ${esc(x.Account || "—")}${x.Remarks ? " · " + esc(x.Remarks) : ""}</div>
      </div>
      <div class="recent-amount ${x.Type === "Expense" ? "expense" : "income"}">
        ${x.Type === "Expense" ? "−" : "+"}${fmt(x.Amount)}
      </div>
    </div>
  `).join("");
}

function renderDashStats(m) {
  const el = $("dashStats");
  if (!el) return;

  const salary = (DB.salary || []).filter((x) => String(x.Month).startsWith(m)).reduce((s, x) => s + num(x.Amount), 0);
  const emi = (DB.emi || []).filter((x) => String(x.Month).startsWith(m)).reduce((s, x) => s + num(x.Amount), 0);

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

  const totalDebt = (DB.loans || []).reduce((s, x) => s + num(x["Initial Amount"]), 0) -
    (DB.emi || []).reduce((s, x) => s + num(x.Amount), 0);

  el.innerHTML = [
    card("💰 Salary", fmt(salary)),
    card("🏛️ EMI Paid", fmt(emi)),
    card("🤝 To Receive", fmt(Math.max(0, toReceive))),
    card("🤝 To Pay", fmt(Math.max(0, toPay))),
    card("📉 Loan Remaining", fmt(Math.max(0, totalDebt))),
  ].join("");
}


/* ═══════════════ ACCOUNTS ═══════════════ */

function toggleAccountForm() {
  const form = $("accountForm");
  if (form.classList.contains("hidden")) {
    form.classList.remove("hidden");
    $("accName").focus();
  } else {
    cancelAccountForm();
  }
}

function cancelAccountForm() {
  $("accountForm").classList.add("hidden");
  ["accEditId", "accName", "accOpening", "accNotes"].forEach((id) => $(id).value = "");
  $("accType").value = "Bank";
  $("accColor").value = "#2563eb";
  $("accountForm").classList.remove("editing");
}

async function saveAccount() {
  const name = val("accName");
  if (!name) return toast("Account name required");

  const editing = !!val("accEditId");

  try {
    await save("accounts", {
      ID: val("accEditId"),
      "Account Name": name,
      "Account Type": val("accType"),
      "Opening Balance": num(val("accOpening")),
      "Color": val("accColor"),
      "Notes": val("accNotes"),
    });

    cancelAccountForm();
    renderAll();
    showSuccess(`Account "${name}" ${editing ? "updated" : "added"}.`, editing ? "Updated!" : "Saved!");
  } catch (e) {
    toast(e.message);
  }
}

function editAccount(id) {
  const a = (DB.accounts || []).find((x) => String(x.ID) === String(id));
  if (!a) return;
  $("accEditId").value = a.ID || "";
  $("accName").value = a["Account Name"] || "";
  $("accType").value = a["Account Type"] || "Bank";
  $("accOpening").value = a["Opening Balance"] || "";
  $("accColor").value = a.Color || "#2563eb";
  $("accNotes").value = a.Notes || "";
  $("accountForm").classList.remove("hidden");
  $("accountForm").classList.add("editing");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderAccounts() {
  const el = $("accountsList");
  if (!el) return;

  const accounts = DB.accounts || [];

  $("accountsNetWorth").textContent = fmt(totalNetWorth());

  if (!accounts.length) {
    el.innerHTML = emptyState("🏦", "No accounts yet", "Tap + Add Account to get started");
  } else {
    const icons = { Bank: "🏦", Cash: "💵", Wallet: "📱", Credit: "💳" };
    el.innerHTML = accounts.map((a) => {
      const bal = accountBalance(a.ID);
      const opening = num(a["Opening Balance"]);
      const delta = bal - opening;
      const deltaColor = delta > 0 ? "#16a34a" : delta < 0 ? "#dc2626" : "#687386";
      const deltaSign = delta > 0 ? "+" : "";

      return `<div class="account-card">
        <div class="acc-color-bar" style="background:${esc(a.Color || "#2563eb")}"></div>
        <div class="acc-name">
          ${icons[a["Account Type"]] || "🏦"} ${esc(a["Account Name"])}
        </div>
        <div class="acc-type">${esc(a["Account Type"] || "Account")}</div>
        <div class="acc-balance">${fmt(bal)}</div>
        <div class="acc-opening">
          Opening: ${fmt(opening)}
          ${delta !== 0 ? ` · <span style="color:${deltaColor};font-weight:600">${deltaSign}${fmt(delta)}</span>` : ""}
        </div>
        <div class="acc-actions">
          <button class="secondary small" onclick="editAccount('${a.ID}')">Edit</button>
          <button class="danger small" onclick="deleteAccount('${a.ID}')">Delete</button>
        </div>
      </div>`;
    }).join("");
  }

  opt($("pbAccount"), accounts, (a) => a["Account Name"], (a) => a["Account Name"], "Select account");
  opt($("tfFrom"), accounts, (a) => a["Account Name"], (a) => a["Account Name"], "From");
  opt($("tfTo"), accounts, (a) => a["Account Name"], (a) => a["Account Name"], "To");

  const cats = unique((DB.passbook || []).map((x) => x.Account));
  opt($("pbFilterAccount"), cats, (x) => x, (x) => x, "All");
}

function deleteAccount(id) {
  const a = (DB.accounts || []).find((x) => String(x.ID) === String(id));
  if (!a) return;
  showConfirm(`Delete "${a["Account Name"]}"?`, async () => {
    await del("accounts", id, { skipConfirm: true, label: a["Account Name"] });
    renderAll();
  });
}

async function addTransfer() {
  const from = val("tfFrom");
  const to = val("tfTo");
  const amount = num(val("tfAmount"));

  if (!from) return toast("Select source account");
  if (!to) return toast("Select destination account");
  if (from === to) return toast("Cannot transfer to same account");
  if (!amount) return toast("Enter amount");

  try {
    await save("transfers", {
      "From Account": from,
      "To Account": to,
      Amount: amount,
      Date: val("tfDate") || today(),
      Notes: val("tfNotes"),
    });

    ["tfAmount", "tfNotes"].forEach((id) => ($(id).value = ""));
    renderAll();
    showSuccess(`${fmt(amount)} transferred from ${from} → ${to}`, "Transferred!");
  } catch (e) {
    toast(e.message);
  }
}

function loadMonthlyOpenings() {
  const m = val("moMonth") || monthNow();
  const el = $("monthlyOpenings");
  const accounts = DB.accounts || [];

  if (!accounts.length) {
    el.innerHTML = emptyState("📅", "Add accounts first");
    return;
  }

  el.innerHTML = accounts.map((a) => {
    const stored = (DB.monthlyOpenings || []).find(
      (x) => x.Month === m && String(x["Account ID"]) === String(a.ID)
    );

    const autoOpen = computeAutoOpening(a.ID, m);
    const value = stored ? num(stored["Opening Balance"]) : autoOpen;
    const isOverridden = !!stored;

    return `<div class="item">
      <div>
        <b>${esc(a["Account Name"])}</b>
        <small>${isOverridden ? "✏️ Overridden" : "🔄 Auto-rolled from previous month"}</small>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" value="${value}" style="width:140px"
          onchange="setMonthlyOpening('${a.ID}','${m}',this.value)">
        ${isOverridden ? `<button class="secondary small" onclick="resetMonthlyOpening('${a.ID}','${m}')">Reset</button>` : ""}
      </div>
    </div>`;
  }).join("");
}

function computeAutoOpening(accountId, month) {
  // Compute closing balance of previous month
  const [y, m] = month.split("-").map(Number);
  const prev = new Date(y, m - 2, 1);
  const prevMonth = prev.toISOString().slice(0, 7);

  const accountNameValue = accountName(accountId);
  let balance = accountOpening(accountId);

  (DB.passbook || []).forEach((x) => {
    if (String(x.Account || "").trim() !== String(accountNameValue).trim()) return;
    if (monthOf(x.Date) > prevMonth) return;
    if (x.Type === "Income") balance += num(x.Amount);
    if (x.Type === "Expense") balance -= num(x.Amount);
  });

  (DB.transfers || []).forEach((t) => {
    if (monthOf(t.Date) > prevMonth) return;
    if (String(t["From Account"]) === String(accountNameValue)) balance -= num(t.Amount);
    if (String(t["To Account"]) === String(accountNameValue)) balance += num(t.Amount);
  });

  return Math.round(balance * 100) / 100;
}

async function setMonthlyOpening(accountId, month, value) {
  try {
    const existing = (DB.monthlyOpenings || []).find(
      (x) => x.Month === month && String(x["Account ID"]) === String(accountId)
    );

    await save("monthlyOpenings", {
      ID: existing ? existing.ID : "",
      "Account ID": accountId,
      Month: month,
      "Opening Balance": num(value),
    });

    renderAll();
    loadMonthlyOpenings();
    toast("✓ Opening updated");
  } catch (e) {
    toast(e.message);
  }
}

async function resetMonthlyOpening(accountId, month) {
  const existing = (DB.monthlyOpenings || []).find(
    (x) => x.Month === month && String(x["Account ID"]) === String(accountId)
  );
  if (!existing) return;

  await del("monthlyOpenings", existing.ID, { skipConfirm: true });
  renderAll();
  loadMonthlyOpenings();
  toast("✓ Reset to auto");
}


/* ═══════════════ PASSBOOK ═══════════════ */

function togglePassbookForm() {
  const form = $("pbForm");
  if (form.classList.contains("hidden")) {
    form.classList.remove("hidden");
    $("pbDate").value = today();
    $("pbCat").focus();
  } else {
    cancelPassbookForm();
  }
}

function cancelPassbookForm() {
  $("pbForm").classList.add("hidden");
  ["pbEditId", "pbCat", "pbAmt", "pbRemarks"].forEach((id) => { if ($(id)) $(id).value = ""; });
  $("pbDate").value = today();
  $("pbType").value = "Expense";
  $("pbForm").classList.remove("editing");
}

function editPassbook(id) {
  const x = (DB.passbook || []).find((r) => String(r.ID) === String(id));
  if (!x) return;
  $("pbForm").classList.remove("hidden");
  $("pbEditId").value = x.ID || "";
  $("pbDate").value = displayDate(x.Date);
  $("pbType").value = x.Type || "Expense";
  $("pbCat").value = x.Category || "";
  $("pbAmt").value = x.Amount || "";
  $("pbAccount").value = x.Account || "";
  $("pbRemarks").value = x.Remarks || "";
  $("pbForm").classList.add("editing");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function addPassbook() {
  if (!val("pbDate") || !val("pbCat") || !num(val("pbAmt")))
    return toast("Date, category and amount are required");

  const editing = !!val("pbEditId");
  const savedCat = val("pbCat");
  const savedAmt = num(val("pbAmt"));
  const savedAcc = val("pbAccount");

  try {
    await save("passbook", {
      ID: val("pbEditId"),
      Date: val("pbDate"),
      Type: val("pbType"),
      Category: val("pbCat"),
      Amount: savedAmt,
      Account: savedAcc,
      Remarks: val("pbRemarks"),
    });

    cancelPassbookForm();
    renderAll();

    showSuccess(
      `${savedCat} · ${fmt(savedAmt)}${savedAcc ? " · " + savedAcc : ""}`,
      editing ? "Updated!" : "Saved!"
    );
  } catch (e) {
    toast(e.message);
  }
}

function resetPassbookFilters() {
  ["pbFromDate", "pbToDate", "pbFilterCategory", "pbFilterAccount", "pbFilterType"]
    .forEach((id) => { if ($(id)) $(id).value = ""; });
  renderPassbook();
}

function renderPassbook() {
  const from = val("pbFromDate");
  const to = val("pbToDate");
  const cat = val("pbFilterCategory");
  const acc = val("pbFilterAccount");
  const type = val("pbFilterType");

  const rows = (DB.passbook || [])
    .filter((x) => {
      const d = monthOf(x.Date);
      if (from && x.Date < from) return false;
      if (to && x.Date > to) return false;
      if (cat && x.Category !== cat) return false;
      if (acc && x.Account !== acc) return false;
      if (type && x.Type !== type) return false;
      return true;
    })
    .sort((a, b) => String(b.Date).localeCompare(String(a.Date)));

  const income = rows.filter((x) => x.Type === "Income").reduce((s, x) => s + num(x.Amount), 0);
  const expense = rows.filter((x) => x.Type === "Expense").reduce((s, x) => s + num(x.Amount), 0);

  $("passbookDash").innerHTML =
    card("Income", fmt(income)) +
    card("Expense", fmt(expense)) +
    card("Balance", fmt(income - expense)) +
    card("Entries", rows.length);

  const el = $("pbList");

  if (!rows.length) {
    el.innerHTML = emptyState("📒", "No entries found", "Try clearing filters or add a new entry");
    return;
  }

  el.innerHTML = rows.slice(0, 200).map((x) => `
    <div class="item">
      <div>
        <b>${esc(x.Category || "Uncategorized")} • ${esc(x.Type)}</b>
        <small>${esc(x.Date)} · ${esc(x.Account || "—")}${x.Remarks ? " · " + esc(x.Remarks) : ""}</small>
      </div>
      <div>
        <span class="item-amount ${x.Type === "Expense" ? "expense" : "income"}"
          style="color:${x.Type === "Expense" ? "var(--danger)" : "var(--success)"}">
          ${x.Type === "Expense" ? "−" : "+"}${fmt(x.Amount)}
        </span>
        <div class="item-actions">
          <button class="success small" onclick="editPassbook('${x.ID}')">Edit</button>
          <button class="danger small" onclick="del('passbook','${x.ID}',{label:'${esc(x.Category)}'})">Delete</button>
        </div>
      </div>
    </div>
  `).join("");
}


/* ═══════════════ BUDGETS ═══════════════ */

function toggleBudgetForm() {
  const form = $("budgetForm");
  if (form.classList.contains("hidden")) {
    form.classList.remove("hidden");
    $("bgCategory").focus();
  } else {
    cancelBudgetForm();
  }
}

function cancelBudgetForm() {
  $("budgetForm").classList.add("hidden");
  ["bgEditId", "bgCategory", "bgAmount", "bgNotes"].forEach((id) => $(id).value = "");
  $("budgetForm").classList.remove("editing");
}

async function saveBudget() {
  const cat = val("bgCategory");
  const amount = num(val("bgAmount"));

  if (!cat) return toast("Category required");
  if (!amount) return toast("Amount required");

  const editing = !!val("bgEditId");

  try {
    await save("budgets", {
      ID: val("bgEditId"),
      Category: cat,
      Amount: amount,
      Notes: val("bgNotes"),
    });

    cancelBudgetForm();
    renderAll();
    showSuccess(`Budget "${cat}" set to ${fmt(amount)}/month.`, editing ? "Updated!" : "Saved!");
  } catch (e) {
    toast(e.message);
  }
}

function editBudget(id) {
  const b = (DB.budgets || []).find((x) => String(x.ID) === String(id));
  if (!b) return;
  $("budgetForm").classList.remove("hidden");
  $("bgEditId").value = b.ID || "";
  $("bgCategory").value = b.Category || "";
  $("bgAmount").value = b.Amount || "";
  $("bgNotes").value = b.Notes || "";
  $("budgetForm").classList.add("editing");
}
/* ═══════════════ BUDGET HERO SUMMARY ═══════════════ */

function renderBudgetHero() {
  const el = $("budgetHero");
  if (!el) return;

  const m = val("budgetMonth") || monthNow();

  // Get all budgets (recurring, so apply to every month unless Month is set)
  const budgets = (DB.budgets || []).filter((b) => !b.Month || b.Month === m);

  // Empty state
  if (!budgets.length) {
    el.className = "budget-hero";
    el.innerHTML = `
      <div class="budget-hero-empty">
        <span class="big-icon">🎯</span>
        <p><b>No budgets set for this month</b></p>
        <p class="small-text">Tap "+ Set Budget" above to start tracking your spending limits.</p>
      </div>
    `;
    return;
  }

  // Total budget
  const totalBudget = budgets.reduce((s, b) => s + num(b.Amount), 0);

  // Total spent = sum of all expense transactions that match a budgeted category
  const budgetedCategories = budgets.map((b) => b.Category);
  const spent = (DB.passbook || [])
    .filter((x) => monthOf(x.Date) === m && x.Type === "Expense" && budgetedCategories.includes(x.Category))
    .reduce((s, x) => s + num(x.Amount), 0);

  // Leftover
  const leftover = totalBudget - spent;
  const pct = totalBudget > 0 ? Math.min(100, (spent / totalBudget) * 100) : 0;
  const rawPct = totalBudget > 0 ? (spent / totalBudget) * 100 : 0;

  // Status class
  let statusClass = "hero-ok";
  if (rawPct >= 100) statusClass = "hero-over";
  else if (rawPct >= 70) statusClass = "hero-warn";

  el.className = "budget-hero " + statusClass;

  // Days remaining in month
  const [y, mm] = m.split("-").map(Number);
  const lastDay = new Date(y, mm, 0).getDate();
  const now = new Date();
  let daysLeft = 0;
  if (now.getFullYear() === y && now.getMonth() + 1 === mm) {
    daysLeft = lastDay - now.getDate();
  }

  // Status message
  let statusMsg = "";
  if (rawPct >= 100) {
    statusMsg = `🔴 Over budget by ${fmt(Math.abs(leftover))}`;
  } else if (rawPct >= 70) {
    statusMsg = `🟡 Watch out — using ${rawPct.toFixed(0)}% of budget`;
  } else {
    statusMsg = `🟢 On track · ${rawPct.toFixed(0)}% used`;
  }

  const daysMsg = daysLeft > 0
    ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left this month`
    : "End of month";

  const leftClass = leftover < 0 ? "negative" : "";

  el.innerHTML = `
    <div class="budget-hero-title">
      <span>🎯 Monthly Budget Summary — ${esc(formatMonthLabel(m))}</span>
      <span>${esc(statusMsg)}</span>
    </div>

    <div class="budget-hero-grid">
      <div class="budget-hero-cell">
        <small>Total Budget</small>
        <b>${fmt(totalBudget)}</b>
      </div>

      <div class="budget-hero-cell spent">
        <small>Spent</small>
        <b>${fmt(spent)}</b>
      </div>

      <div class="budget-hero-cell left ${leftClass}">
        <small>${leftover >= 0 ? "Leftover" : "Over Budget"}</small>
        <b>${fmt(Math.abs(leftover))}</b>
      </div>
    </div>

    <div class="budget-hero-progress">
      <div style="width:${pct}%"></div>
    </div>

    <div class="budget-hero-footer">
      <span><strong>${pct.toFixed(0)}%</strong> of monthly budget used</span>
      <span>${esc(daysMsg)}</span>
    </div>
  `;
}


/* Helper — format "2026-10" as "October 2026" */
function formatMonthLabel(m) {
  if (!m) return "";
  const [y, mm] = m.split("-").map(Number);
  return new Date(y, mm - 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function renderBudgets() {
   renderBudgetHero(); 
  const el = $("budgetsList");
  if (!el) return;

  const m = val("budgetMonth") || monthNow();
  const budgets = DB.budgets || [];

  if (!budgets.length) {
    el.innerHTML = emptyState("🎯", "No budgets set", "Set monthly limits to track spending");
    return;
  }

  el.innerHTML = budgets.map((b) => {
    const spent = (DB.passbook || [])
      .filter((x) => monthOf(x.Date) === m && x.Type === "Expense" && x.Category === b.Category)
      .reduce((s, x) => s + num(x.Amount), 0);

    const limit = num(b.Amount);
    const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
    const over = spent > limit;
    const warning = !over && pct >= 80;
    const color = over ? "var(--danger)" : warning ? "var(--warning)" : "var(--success)";
    const remaining = limit - spent;

    return `<div class="budget-card">
      <div class="budget-header">
        <div class="budget-name">${esc(b.Category)}</div>
      </div>
      <div class="budget-amounts">
        <b style="color:${color}">${fmt(spent)}</b>
        <span class="muted">of ${fmt(limit)}</span>
      </div>
      <div class="progress-bar">
        <div style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="budget-status budget-${over ? "over" : warning ? "warn" : "ok"}">
        ${over ? `⚠️ Over by ${fmt(Math.abs(remaining))}` :
          remaining > 0 ? `${fmt(remaining)} remaining (${(100 - pct).toFixed(0)}%)` :
          "Budget exhausted"}
      </div>
      <div class="item-actions">
        <button class="secondary small" onclick="editBudget('${b.ID}')">Edit</button>
        <button class="danger small" onclick="del('budgets','${b.ID}',{label:'${esc(b.Category)} budget'})">Delete</button>
      </div>
    </div>`;
  }).join("");
}


/* ═══════════════ SALARY ═══════════════ */

function toggleSalaryForm() {
  const form = $("salaryForm");
  if (form.classList.contains("hidden")) {
    form.classList.remove("hidden");
    $("salMonth").value = monthNow();
    $("salCompany").focus();
  } else {
    cancelSalaryForm();
  }
}

function cancelSalaryForm() {
  $("salaryForm").classList.add("hidden");
  ["salCompany", "salAmount", "salRemarks"].forEach((id) => $(id).value = "");
}

async function addSalary() {
  if (!val("salMonth") || !num(val("salAmount")))
    return toast("Month and amount required");

  const company = val("salCompany") || "Salary";
  const amt = num(val("salAmount"));

  try {
    await save("salary", {
      Month: val("salMonth") + "-01",
      Company: company,
      Amount: amt,
      Remarks: val("salRemarks"),
    });

    cancelSalaryForm();
    renderAll();
    showSuccess(`${company} · ${fmt(amt)}`, "Saved!");
  } catch (e) {
    toast(e.message);
  }
}

function renderSalary() {
  const rows = (DB.salary || []).sort((a, b) => String(b.Month).localeCompare(String(a.Month)));

  $("salaryDash").innerHTML =
    card("Total", fmt(rows.reduce((s, x) => s + num(x.Amount), 0))) +
    card("Latest", fmt(rows[0]?.Amount || 0)) +
    card("Entries", rows.length);

  const el = $("salaryList");
  if (!rows.length) {
    el.innerHTML = emptyState("💰", "No salary records");
    return;
  }

  el.innerHTML = rows.map((x) => `
    <div class="item">
      <div>
        <b>${esc(x.Company || "Salary")}</b>
        <small>${esc(String(x.Month).slice(0, 7))}${x.Remarks ? " · " + esc(x.Remarks) : ""}</small>
      </div>
      <div>
        <span class="item-amount" style="color:var(--success)">+${fmt(x.Amount)}</span>
        <div class="item-actions">
          <button class="danger small" onclick="del('salary','${x.ID}',{label:'${esc(x.Company)} salary'})">Delete</button>
        </div>
      </div>
    </div>
  `).join("");

  const rev = rows.slice().reverse();
  chart("salaryChart", "line", {
    labels: rev.map((x) => String(x.Month).slice(0, 7)),
    datasets: [{
      label: "Salary",
      data: rev.map((x) => num(x.Amount)),
      borderColor: "#2563eb",
      backgroundColor: "rgba(37,99,235,0.1)",
      tension: 0.3,
      fill: true,
    }],
  });
}


/* ═══════════════ LOANS ═══════════════ */

async function addLoan() {
  if (!val("loanName") || !num(val("loanInitial")))
    return toast("Loan name and amount required");

  const name = val("loanName");
  const amt = num(val("loanInitial"));

  try {
    await save("loans", {
      "Loan Name": name,
      "Initial Amount": amt,
      Remarks: val("loanRemarks"),
    });
    ["loanName", "loanInitial", "loanRemarks"].forEach((id) => ($(id).value = ""));
    renderAll();
    showSuccess(`${name} · ${fmt(amt)}`, "Saved!");
  } catch (e) {
    toast(e.message);
  }
}

async function addEmi() {
  if (!val("emiLoan") || !val("emiMonth") || !num(val("emiAmount")))
    return toast("Select loan, month and amount");

  const amt = num(val("emiAmount"));
  const month = val("emiMonth");

  try {
    await save("emi", {
      "Loan ID": val("emiLoan"),
      Month: month + "-01",
      Amount: amt,
      Remarks: val("emiRemarks"),
    });
    $("emiAmount").value = "";
    $("emiRemarks").value = "";
    renderAll();
    showSuccess(`EMI ${fmt(amt)} · ${month}`, "Saved!");
  } catch (e) {
    toast(e.message);
  }
}

function renderLoans() {
  const loans = DB.loans || [], emi = DB.emi || [];
  const total = loans.reduce((s, x) => s + num(x["Initial Amount"]), 0);
  const paid = emi.reduce((s, x) => s + num(x.Amount), 0);
  const remaining = Math.max(0, total - paid);

  $("loanDash").innerHTML =
    card("Total Loan", fmt(total)) +
    card("EMI Paid", fmt(paid)) +
    card("Remaining", fmt(remaining)) +
    card("Progress", total > 0 ? ((paid / total) * 100).toFixed(0) + "%" : "—");

  const el = $("loanList");
  if (!loans.length) {
    el.innerHTML = emptyState("🏛️", "No loans tracked");
    return;
  }

  el.innerHTML = loans.map((l) => {
    const p = emi.filter((e) => String(e["Loan ID"]) === String(l.ID))
      .reduce((s, e) => s + num(e.Amount), 0);
    const rem = Math.max(0, num(l["Initial Amount"]) - p);
    const pct = num(l["Initial Amount"]) > 0 ? (p / num(l["Initial Amount"])) * 100 : 0;

    return `<div class="item">
      <div>
        <b>${esc(l["Loan Name"])}</b>
        <small>${esc(l.Remarks || "")}</small>
        <div class="progress-bar" style="margin-top:8px;max-width:300px">
          <div style="width:${Math.min(100, pct)}%;background:var(--primary)"></div>
        </div>
      </div>
      <div>
        <span class="item-amount">${fmt(rem)}</span>
        <small>paid ${fmt(p)} / ${fmt(l["Initial Amount"])}</small>
        <div class="item-actions">
          <button class="danger small" onclick="del('loans','${l.ID}',{label:'${esc(l["Loan Name"])}'})">Delete</button>
        </div>
      </div>
    </div>`;
  }).join("");

  chart("loanChart", "bar", {
    labels: loans.map((x) => x["Loan Name"]),
    datasets: [
      { label: "Initial", data: loans.map((x) => num(x["Initial Amount"])), backgroundColor: "#94a3b8", borderRadius: 6 },
      {
        label: "Paid",
        data: loans.map((l) => emi.filter((e) => String(e["Loan ID"]) === String(l.ID))
          .reduce((s, e) => s + num(e.Amount), 0)),
        backgroundColor: "#16a34a", borderRadius: 6,
      },
    ],
  });
}


/* ═══════════════ GIVE & TAKE ═══════════════ */

async function addGive() {
  if (!val("gtPerson") || !num(val("gtAmount")))
    return toast("Person and amount required");

  const person = val("gtPerson");
  const amt = num(val("gtAmount"));

  try {
    await save("transactions", {
      Person: person,
      Type: val("gtType"),
      Amount: amt,
      Date: val("gtDate") || today(),
      Purpose: val("gtPurpose"),
      Notes: val("gtNotes"),
    });
    ["gtPerson", "gtAmount", "gtPurpose", "gtNotes"].forEach((id) => ($(id).value = ""));
    renderAll();
    showSuccess(`${person} · ${fmt(amt)}`, "Saved!");
  } catch (e) {
    toast(e.message);
  }
}

function resetGiveFilters() {
  ["gtFilterType", "gtFilterPerson"].forEach((id) => { if ($(id)) $(id).value = ""; });
  renderGive();
}

function renderGive() {
  const rows = (DB.transactions || []).filter((x) => {
    if (val("gtFilterType") && x.Type !== val("gtFilterType")) return false;
    if (val("gtFilterPerson") && x.Person !== val("gtFilterPerson")) return false;
    return true;
  });

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
    card("📤 To Pay", fmt(Math.max(0, toPay))) +
    card("Records", rows.length);

  const el = $("gtList");
  if (!rows.length) {
    el.innerHTML = emptyState("🤝", "No records");
    return;
  }

  el.innerHTML = rows.slice()
    .sort((a, b) => String(b.Date).localeCompare(String(a.Date)))
    .map((x) => `
    <div class="item">
      <div>
        <b>${esc(x.Person)} • ${esc(x.Type)}</b>
        <small>${esc(x.Date)} · ${esc(x.Purpose || "")}${x.Notes ? " · " + esc(x.Notes) : ""}</small>
      </div>
      <div>
        <span class="item-amount">${fmt(x.Amount)}</span>
        <div class="item-actions">
          <button class="danger small" onclick="del('transactions','${x.ID}',{label:'${esc(x.Person)} record'})">Delete</button>
        </div>
      </div>
    </div>`).join("");

  const allPersons = unique((DB.transactions || []).map((x) => x.Person));
  opt($("gtFilterPerson"), allPersons, (x) => x, (x) => x, "All");

  const persons = unique(rows.map((x) => x.Person));
  const receiveData = persons.map((p) => {
    let bal = 0;
    rows.filter((x) => x.Person === p).forEach((x) => {
      if (x.Type === "Pending to Take") bal += num(x.Amount);
      if (x.Type === "Received") bal -= num(x.Amount);
    });
    return Math.max(0, bal);
  });
  const payData = persons.map((p) => {
    let bal = 0;
    rows.filter((x) => x.Person === p).forEach((x) => {
      if (x.Type === "Pending to Pay") bal += num(x.Amount);
      if (x.Type === "Paid") bal -= num(x.Amount);
    });
    return Math.max(0, bal);
  });

  chart("giveChart", "bar", {
    labels: persons,
    datasets: [
      { label: "To Receive", data: receiveData, backgroundColor: "#16a34a", borderRadius: 6 },
      { label: "To Pay", data: payData, backgroundColor: "#dc2626", borderRadius: 6 },
    ],
  });
}


/* ═══════════════ VEHICLES ═══════════════ */

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
  records.forEach((r, i) => {
    if (i === 0) return;
    const d = num(r.Odometer) - num(records[i - 1].Odometer);
    if (d > 0) { totalDistance += d; distances.push(d); }
  });

  const totalCost = records.reduce((s, x) => s + num(x.Amount), 0);
  const avgKMPerFill = distances.length ? totalDistance / distances.length : 0;
  const last = records.length ? records[records.length - 1] : null;

  return {
    records, currentKM, totalDistance, totalCost,
    fuelEntries: records.length, avgKMPerFill,
    lastDate: last ? displayDate(last.Date) : "",
  };
}

function vehiclePerformanceCard(vehicle) {
  const s = vehicleStats(vehicle);
  const icon = String(vehicle["Vehicle Type"] || "").toLowerCase().includes("bike") ? "🏍️" : "🚗";

  return `<div class="maintenance-card">
    <h3>${icon} ${esc(vehicle["Vehicle Name"])}</h3>
    <div class="maint-row"><span>Current Odometer</span>
      <b>${s.currentKM ? s.currentKM.toLocaleString("en-IN") + " km" : "—"}</b></div>
    <div class="maint-row"><span>Fuel Entries</span><b>${s.fuelEntries}</b></div>
    <hr>
    <div class="maint-section-title">📏 Distance</div>
    <div class="maint-row"><span>Total KM Travelled</span>
      <b>${s.totalDistance.toLocaleString("en-IN")} km</b></div>
    <div class="maint-row"><span>Avg KM / Fill</span>
      <b>${s.avgKMPerFill ? s.avgKMPerFill.toFixed(1) + " km" : "—"}</b></div>
    <hr>
    <div class="maint-section-title">💰 Cost</div>
    <div class="maint-row"><span>Total Fuel Cost</span><b>${fmt(s.totalCost)}</b></div>
    <div class="maint-row"><span>Last Fuel</span><b>${s.lastDate || "—"}</b></div>
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
  const kmFmt = (v) => v >= 0 ? v.toLocaleString("en-IN") + " km" : Math.abs(v).toLocaleString("en-IN") + " km overdue";

  return `<div class="maintenance-card">
    <h3>${icon} ${esc(vehicle["Vehicle Name"])}</h3>
    <div class="maint-row"><span>Current Odometer</span>
      <b>${currentKM ? currentKM.toLocaleString("en-IN") + " km" : "—"}</b></div>
    <hr>
    <div class="maint-section-title">🛢️ Oil Change</div>
    <div class="maint-row"><span>Last Oil</span>
      <b>${lastOil ? displayDate(lastOil.Date) + " · " + lastOilKM.toLocaleString("en-IN") + " km" : "No record"}</b></div>
    <div class="maint-row"><span>Next Target</span>
      <b>${nextOilTarget ? nextOilTarget.toLocaleString("en-IN") + " km" : "—"}</b></div>
    <div class="maint-row"><span>Remaining</span>
      <b class="${oilClass}">${nextOilTarget ? kmFmt(oilRemaining) : "—"}</b></div>
    <hr>
    <div class="maint-section-title">🔧 Service</div>
    <div class="maint-row"><span>Last Service</span>
      <b>${lastService ? displayDate(lastService.Date) + " · " + lastServiceKM.toLocaleString("en-IN") + " km" : "No record"}</b></div>
    <div class="maint-row"><span>Next Target</span>
      <b>${nextServiceTarget ? nextServiceTarget.toLocaleString("en-IN") + " km" : "—"}</b></div>
    <div class="maint-row"><span>Remaining</span>
      <b class="${serviceClass}">${nextServiceTarget ? kmFmt(serviceRemaining) : "—"}</b></div>
    <div class="maintenance-interval">${String(vehicle["Vehicle Type"] || "").toLowerCase().includes("bike")
      ? "Every 3,000 km" : "Every 10,000 km"}</div>
  </div>`;
}

function renderVehicles() {
  const vehicles = DB.vehicles || [];
  const type = val("vehicleTypeFilter");
  const vid = val("vehicleFilter");

  opt($("vehicleFilter"), vehicles.filter((v) => !type || v["Vehicle Type"] === type),
    (v) => v["Vehicle Name"], (v) => v.ID, "All");

  ["fuelVehicle", "maintVehicle"].forEach((id) =>
    opt($(id), vehicles, (v) => v["Vehicle Name"], (v) => v.ID, "Select vehicle"));

  const fuels = (DB.fuel || []).filter((x) => !vid || String(x["Vehicle ID"]) === String(vid));
  const maint = (DB.maintenance || []).filter((x) => !vid || String(x["Vehicle ID"]) === String(vid));

  const fcost = fuels.reduce((s, x) => s + num(x.Amount), 0);
  const mcost = maint.reduce((s, x) => s + num(x.Amount), 0);

  $("vehicleDash").innerHTML =
    card("Fuel Cost", fmt(fcost)) +
    card("Maintenance", fmt(mcost)) +
    card("Total", fmt(fcost + mcost)) +
    card("Vehicles", vehicles.length);

  const selected = vehicles.filter((v) => !vid || String(v.ID) === String(vid));
  $("vehiclePerformanceDashboard").innerHTML = selected.map(vehiclePerformanceCard).join("");
  $("vehicleMaintenanceSummary").innerHTML = selected.map(maintenanceCard).join("");

  const fuelList = $("fuelList");
  const rf = recentRecords(fuels, 10);
  fuelList.innerHTML = rf.length ? rf.map((x) => `
    <div class="item">
      <div>
        <b>${esc(vehicleName(x["Vehicle ID"]))}</b>
        <small>${displayDate(x.Date)} · ${num(x.Odometer).toLocaleString("en-IN")} km${x.Notes ? " · " + esc(x.Notes) : ""}</small>
      </div>
      <div>
        <span class="item-amount" style="color:var(--danger)">−${fmt(x.Amount)}</span>
        <div class="item-actions">
          <button class="danger small" onclick="del('fuel','${x.ID}',{label:'fuel entry'})">Delete</button>
        </div>
      </div>
    </div>`).join("") : emptyState("⛽", "No fuel entries");

  const maintList = $("maintenanceList");
  const rm = recentRecords(maint, 10);
  maintList.innerHTML = rm.length ? rm.map((x) => `
    <div class="item">
      <div>
        <b>${esc(vehicleName(x["Vehicle ID"]))} • ${esc(x.Category)}</b>
        <small>${displayDate(x.Date)} · ${num(x.Odometer).toLocaleString("en-IN")} km${x.Remarks ? " · " + esc(x.Remarks) : ""}</small>
      </div>
      <div>
        <span class="item-amount" style="color:var(--danger)">−${fmt(x.Amount)}</span>
        <div class="item-actions">
          <button class="danger small" onclick="del('maintenance','${x.ID}',{label:'maintenance entry'})">Delete</button>
        </div>
      </div>
    </div>`).join("") : emptyState("🔧", "No maintenance entries");

  const cv = selected.length ? selected : vehicles;
  const labels = cv.map((v) => v["Vehicle Name"]);

  chart("fuelChart", "bar", {
    labels,
    datasets: [{
      label: "Fuel Cost",
      data: cv.map((v) => (DB.fuel || []).filter((x) => String(x["Vehicle ID"]) === String(v.ID))
        .reduce((s, x) => s + num(x.Amount), 0)),
      backgroundColor: "#2563eb", borderRadius: 6,
    }],
  });

  chart("maintenanceChart", "bar", {
    labels,
    datasets: [{
      label: "Maintenance Cost",
      data: cv.map((v) => (DB.maintenance || []).filter((x) => String(x["Vehicle ID"]) === String(v.ID))
        .reduce((s, x) => s + num(x.Amount), 0)),
      backgroundColor: "#f59e0b", borderRadius: 6,
    }],
  });
}

function resetVehicleFilters() {
  $("vehicleTypeFilter").value = "";
  $("vehicleFilter").value = "";
  renderVehicles();
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
  const d = current - previous;
  if (d < 0) { $("fuelDistance").value = ""; return; }
  $("fuelDistance").value = d;
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
    showSuccess(`Vehicle "${name}" added.`, "Saved!");
  } catch (e) {
    toast(e.message);
  }
}

async function addFuel() {
  const vehicleId = val("fuelVehicle");
  const amount = num(val("fuelAmount"));
  const currentOdo = num(val("fuelOdo"));
  const previousOdo = num(val("fuelLastOdo"));

  if (!vehicleId || !amount || !currentOdo)
    return toast("Vehicle, odometer and amount required");

  if (previousOdo && currentOdo <= previousOdo)
    return toast("Current odometer must be greater than previous");

  const vName = vehicleName(vehicleId);

  try {
    await save("fuel", {
      "Vehicle ID": vehicleId,
      Date: val("fuelDate") || today(),
      Odometer: currentOdo,
      Amount: amount,
      "Fuel Type": val("fuelType"),
      Notes: val("fuelNotes"),
    });

    ["fuelLastOdo", "fuelOdo", "fuelDistance", "fuelAmount", "fuelNotes"]
      .forEach((id) => ($(id).value = ""));

    renderAll();
    updateFuelPreviousOdometer();
    showSuccess(`${vName} · ${currentOdo.toLocaleString("en-IN")} km · ${fmt(amount)}`, "Saved!");
  } catch (e) {
    toast(e.message);
  }
}

async function addMaintenance() {
  const vehicleId = val("maintVehicle");
  const amount = num(val("maintAmount"));

  if (!vehicleId || !amount) return toast("Vehicle and amount required");

  const vName = vehicleName(vehicleId);
  const cat = val("maintCategory") || "Service";

  try {
    await save("maintenance", {
      "Vehicle ID": vehicleId,
      Date: val("maintDate") || today(),
      Category: cat,
      Amount: amount,
      Odometer: num(val("maintOdo")),
      "Next Target KM": num(val("maintTargetKm")),
      Remarks: val("maintRemarks"),
    });

    ["maintAmount", "maintOdo", "maintTargetKm", "maintRemarks"]
      .forEach((id) => ($(id).value = ""));

    renderAll();
    showSuccess(`${vName} · ${cat} · ${fmt(amount)}`, "Saved!");
  } catch (e) {
    toast(e.message);
  }
}


/* ═══════════════ LISTS / DROPDOWNS ═══════════════ */

function fillLists() {
  const cats = unique((DB.passbook || []).map((x) => x.Category));
  opt($("pbFilterCategory"), cats, (x) => x, (x) => x, "All");

  function dl(id, arr) {
    const e = $(id);
    if (!e) return;
    e.innerHTML = unique(arr).map((x) => `<option value="${esc(x)}"></option>`).join("");
  }

  dl("categoryList", cats);
  dl("remarksList", (DB.passbook || []).map((x) => x.Remarks));
  dl("companyList", (DB.salary || []).map((x) => x.Company));
  dl("salaryRemarksList", (DB.salary || []).map((x) => x.Remarks));
  dl("personList", (DB.transactions || []).map((x) => x.Person));
  dl("budgetCategoryList", cats);

  opt($("emiLoan"), DB.loans || [], (x) => x["Loan Name"], (x) => x.ID, "Select loan");
}


/* ═══════════════ SEARCH ═══════════════ */

function openSearch() {
  $("searchOverlay").classList.add("show");
  setTimeout(() => $("globalSearch").focus(), 50);
}

function closeSearch() {
  $("searchOverlay").classList.remove("show");
  $("globalSearch").value = "";
  $("searchResults").innerHTML = "";
}

function performSearch(query) {
  const q = query.toLowerCase().trim();
  const el = $("searchResults");

  if (!q) { el.innerHTML = ""; return; }

  const results = [];

  (DB.passbook || []).forEach((x) => {
    const hay = `${x.Category} ${x.Remarks} ${x.Account} ${x.Date} ${x.Amount}`.toLowerCase();
    if (hay.includes(q)) results.push({
      icon: x.Type === "Expense" ? "💸" : "💰",
      title: `${x.Category || "Uncategorized"} · ${x.Type}`,
      sub: `${x.Date} · ${x.Account || ""}${x.Remarks ? " · " + x.Remarks : ""}`,
      amount: `${x.Type === "Expense" ? "−" : "+"}${fmt(x.Amount)}`,
      amountColor: x.Type === "Expense" ? "var(--danger)" : "var(--success)",
      page: "passbook",
    });
  });

  (DB.transactions || []).forEach((x) => {
    const hay = `${x.Person} ${x.Type} ${x.Purpose} ${x.Notes} ${x.Amount}`.toLowerCase();
    if (hay.includes(q)) results.push({
      icon: "🤝", title: `${x.Person} · ${x.Type}`,
      sub: `${x.Date} · ${x.Purpose || ""}`,
      amount: fmt(x.Amount), amountColor: "var(--text)",
      page: "give",
    });
  });

  (DB.vehicles || []).forEach((x) => {
    const hay = `${x["Vehicle Name"]} ${x["Vehicle Type"]} ${x["Number Plate"]}`.toLowerCase();
    if (hay.includes(q)) results.push({
      icon: "🚗", title: x["Vehicle Name"],
      sub: `${x["Vehicle Type"]} · ${x["Number Plate"] || ""}`,
      amount: "", amountColor: "", page: "vehicles",
    });
  });

  (DB.salary || []).forEach((x) => {
    const hay = `${x.Company} ${x.Remarks} ${x.Month} ${x.Amount}`.toLowerCase();
    if (hay.includes(q)) results.push({
      icon: "💰", title: x.Company || "Salary",
      sub: `${String(x.Month).slice(0, 7)}${x.Remarks ? " · " + x.Remarks : ""}`,
      amount: "+" + fmt(x.Amount), amountColor: "var(--success)",
      page: "salary",
    });
  });

  if (!results.length) {
    el.innerHTML = emptyState("🔍", `No results for "${query}"`);
    return;
  }

  el.innerHTML = results.slice(0, 30).map((r) => `
    <div class="item" onclick="closeSearch(); gotoPage('${r.page}');">
      <div>
        <b>${r.icon} ${esc(r.title)}</b>
        <small>${esc(r.sub)}</small>
      </div>
      ${r.amount ? `<div><span class="item-amount" style="color:${r.amountColor}">${r.amount}</span></div>` : ""}
    </div>
  `).join("");
}


/* ═══════════════ NAVIGATION ═══════════════ */

function gotoPage(page) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll("[data-page]").forEach((b) => b.classList.remove("active"));
  $(page)?.classList.add("active");
  document.querySelector(`[data-page="${page}"]`)?.classList.add("active");
  $("sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}


/* ═══════════════ APP STARTUP ═══════════════ */

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

  document.querySelectorAll("[data-page]").forEach((b) => {
    b.onclick = () => gotoPage(b.dataset.page);
  });

  // Search
  $("searchBtn").onclick = openSearch;
  $("closeSearch").onclick = closeSearch;
  $("globalSearch").addEventListener("input", (e) => performSearch(e.target.value));
  $("searchOverlay").onclick = (e) => { if (e.target.id === "searchOverlay") closeSearch(); };

  // Global keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "/") { e.preventDefault(); openSearch(); }
  });

  // Filters
  ["pbFromDate", "pbToDate", "pbFilterCategory", "pbFilterAccount", "pbFilterType"]
    .forEach((id) => $(id)?.addEventListener("change", renderPassbook));
  ["gtFilterType", "gtFilterPerson"]
    .forEach((id) => $(id)?.addEventListener("change", renderGive));
  $("vehicleTypeFilter")?.addEventListener("change", () => { $("vehicleFilter").value = ""; renderVehicles(); });
  $("vehicleFilter")?.addEventListener("change", renderVehicles);
  $("fuelVehicle")?.addEventListener("change", updateFuelPreviousOdometer);
  $("fuelOdo")?.addEventListener("input", calculateFuelDistance);
  $("budgetMonth")?.addEventListener("change", () => {
    renderBudgets();
    renderBudgetHero();
  });

  // Defaults
  ["pbDate", "gtDate", "fuelDate", "maintDate", "tfDate"].forEach((id) => {
    if ($(id)) $(id).value = today();
  });
  ["salMonth", "emiMonth", "moMonth", "budgetMonth"].forEach((id) => {
    if ($(id)) $(id).value = monthNow();
  });
  $("dashMonth").value = monthNow();

  loadAll(false);
  startLiveRefresh();
  loadMonthlyOpenings();

  // Pre-warm Apps Script
  fetch(API_URL, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "__ping" }),
  }).catch(() => {});

  // Register service worker for PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
});

window.addEventListener("load", () => {
  const mo = $("moMonth");
  if (mo) mo.addEventListener("change", loadMonthlyOpenings);
});
