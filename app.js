/* ============================================================
   ANKIT FINANCE HUB - COMPLETE CLOUD APP.JS
   Google Apps Script + Google Sheets backend
   ============================================================ */

const API_URL =
  "https://script.google.com/macros/s/AKfycbyBzmIaPUtD0UGyjDWOU_1J9W14hL8Lk_VEQPEs_OA5dPPDVR78Wyxd__LclEi11CSJ3w/exec";

let DB = {};
let charts = {};

const $ = id => document.getElementById(id);
const val = id => $(id)?.value ?? "";
const num = v => Number(v || 0);
const today = () => new Date().toISOString().slice(0, 10);
const monthNow = () => new Date().toISOString().slice(0, 7);

function money(v) {
  return "₹" + num(v).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));
}

function unique(arr) {
  return [...new Set(
    (arr || [])
      .filter(v => v !== "" && v != null)
      .map(String)
  )];
}

function toast(message) {
  const t = $("toast");
  if (!t) {
    alert(message);
    return;
  }
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(
    () => t.classList.remove("show"),
    2600
  );
}

function setStatus(text) {
  // IMPORTANT: HTML uses id="status", not syncStatus.
  const el = $("status");
  if (el) el.textContent = text;
}

function apiReady() {
  return API_URL &&
    API_URL.indexOf("PASTE_YOUR") === -1;
}

/* ============================================================
   CLOUD API
   ============================================================ */

async function api(action, payload = {}) {
  if (!apiReady()) {
    throw new Error("Apps Script Web App URL is missing.");
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

  const text = await response.text();

  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    throw new Error(
      "Apps Script returned a non-JSON response."
    );
  }

  if (!result.success) {
    throw new Error(
      result.error || "Cloud request failed."
    );
  }

  return result;
}

async function loadAll() {
  if (!apiReady()) {
    setStatus("⚠️ API URL required");
    toast("Apps Script Web App URL is missing.");
    return;
  }

  try {
    setStatus("☁️ Connecting...");

    const response = await fetch(
      API_URL + "?action=loadAll&_=" + Date.now(),
      {
        method: "GET",
        mode: "cors",
        cache: "no-store"
      }
    );

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        "Server error: HTTP " + response.status
      );
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      throw new Error(
        "Web App did not return JSON. Check Apps Script deployment/access."
      );
    }

    if (!result.success) {
      throw new Error(
        result.error || "Cloud load failed."
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
    ].forEach(k => {
      DB[k] = DB[k] || [];
    });

    setStatus("☁️ Synced");
    renderAll();

  } catch (error) {
    console.error(error);
    setStatus("⚠️ Sync failed");
    toast(error.message || "Unable to connect.");
  }
}

async function save(table, data) {
  const result = await api("save", {
    table,
    data
  });

  const record = result.data.record;

  DB[table] = DB[table] || [];

  const index = DB[table].findIndex(
    x => String(x.ID) === String(record.ID)
  );

  if (index >= 0) {
    DB[table][index] = record;
  } else {
    DB[table].push(record);
  }

  return record;
}

async function del(table, id) {
  if (!confirm("Delete this record?")) return;

  const record = (DB[table] || []).find(
    x => String(x.ID) === String(id)
  );

  try {
    // Vehicle records have linked source transactions.
    if (table === "fuel" || table === "maintenance") {
      const linked = (DB.passbook || []).filter(
        p =>
          String(p["Source ID"]) === String(id) ||
          String(p.ID) === String(record?.["Passbook ID"])
      );

      for (const p of linked) {
        await api("delete", {
          table: "passbook",
          id: p.ID
        });
      }

      DB.passbook = (DB.passbook || []).filter(
        p => !linked.some(
          q => String(q.ID) === String(p.ID)
        )
      );
    }

    await api("delete", {
      table,
      id
    });

    DB[table] = (DB[table] || []).filter(
      x => String(x.ID) !== String(id)
    );

    renderAll();
    toast("Deleted successfully.");

  } catch (error) {
    toast(error.message || "Delete failed.");
  }
}

/* ============================================================
   GENERAL UI
   ============================================================ */

function showPage(page) {
  document
    .querySelectorAll(".page")
    .forEach(p => p.classList.remove("active"));

  const target = $(page);
  if (target) target.classList.add("active");

  document
    .querySelectorAll("#sidebar button[data-page]")
    .forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.page === page
      );
    });

  $("sidebar")?.classList.remove("open");
}

function initUI() {
  document
    .querySelectorAll("#sidebar button[data-page]")
    .forEach(btn => {
      btn.addEventListener(
        "click",
        () => showPage(btn.dataset.page)
      );
    });

  $("menuBtn")?.addEventListener("click", () => {
    $("sidebar")?.classList.toggle("open");
  });

  $("themeBtn")?.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const dark = document.body.classList.contains("dark");
    $("themeBtn").textContent =
      dark ? "☀️ Light" : "🌙 Dark";
    localStorage.setItem(
      "ankitFinanceTheme",
      dark ? "dark" : "light"
    );
  });

  if (
    localStorage.getItem("ankitFinanceTheme") === "dark"
  ) {
    document.body.classList.add("dark");
    if ($("themeBtn")) {
      $("themeBtn").textContent = "☀️ Light";
    }
  }

  $("dashMonth")?.addEventListener(
    "change",
    renderDashboard
  );

  $("dashCategory")?.addEventListener(
    "change",
    renderDashboard
  );

  $("pbFilterMonth")?.addEventListener(
    "change",
    renderPassbook
  );

  $("pbFilterCategory")?.addEventListener(
    "change",
    renderPassbook
  );

  $("vehicleTypeFilter")?.addEventListener(
    "change",
    () => {
      populateVehicleFilter();
      renderVehicles();
    }
  );

  $("vehicleFilter")?.addEventListener(
    "change",
    renderVehicles
  );

  $("fuelVehicle")?.addEventListener(
    "change",
    updateFuelPreviousOdometer
  );

  $("fuelOdo")?.addEventListener(
    "input",
    calculateFuelDistance
  );

  $("spGroupSel")?.addEventListener(
    "change",
    () => {
      renderGroupMembers();
      fillSplitExpenseGroup();
    }
  );

  $("spGroupExpense")?.addEventListener(
    "change",
    () => {
      renderPaidBy();
      renderCustomShares();
    }
  );

  $("spSplitType")?.addEventListener(
    "change",
    renderCustomShares
  );

  $("spMembersSel")?.addEventListener(
    "input",
    renderCustomShares
  );
}

function initDefaults() {
  if ($("dashMonth")) $("dashMonth").value = monthNow();
  if ($("salMonth")) $("salMonth").value = monthNow();
  if ($("emiMonth")) $("emiMonth").value = monthNow();

  [
    "pbDate",
    "gtDate",
    "spDate",
    "fuelDate",
    "maintDate"
  ].forEach(id => {
    if ($(id) && !$(id).value) {
      $(id).value = today();
    }
  });
}

function opt(el, arr, valueFn, labelFn, placeholder) {
  if (!el) return;

  const old = el.value;

  el.innerHTML =
    `<option value="">${esc(
      placeholder || "Select"
    )}</option>` +
    (arr || []).map(x =>
      `<option value="${esc(valueFn(x))}">
        ${esc(labelFn(x))}
      </option>`
    ).join("");

  if (
    [...el.options].some(
      o => o.value === old
    )
  ) {
    el.value = old;
  }
}

/* ============================================================
   LIST POPULATION
   ============================================================ */

function fillLists() {
  const vehicles = DB.vehicles || [];

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

  populateVehicleFilter();

  const categories = unique(
    (DB.passbook || []).map(
      x => x.Category
    )
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

  fillDatalists();

  fillVehiclePaymentModes();

  fillLoanList();

  fillInvestmentLists();

  fillSplitterLists();

  if ($("fuelDate") && !$("fuelDate").value)
    $("fuelDate").value = today();

  if ($("maintDate") && !$("maintDate").value)
    $("maintDate").value = today();
}

function fillDatalists() {
  const categories = unique(
    (DB.passbook || []).map(
      x => x.Category
    )
  );

  const accounts = unique(
    (DB.passbook || []).map(
      x => x.Account
    )
  );

  const remarks = unique(
    (DB.passbook || []).map(
      x => x.Remarks
    )
  );

  const companies = unique(
    (DB.salary || []).map(
      x => x.Company
    )
  );

  const salaryRemarks = unique(
    (DB.salary || []).map(
      x => x.Remarks
    )
  );

  const people = unique(
    (DB.transactions || []).map(
      x => x.Person
    )
  );

  const vehicleNames = unique(
    (DB.vehicles || []).map(
      x => x["Vehicle Name"]
    )
  );

  setDatalist("categoryList", categories);
  setDatalist("accountList", accounts);
  setDatalist("remarksList", remarks);
  setDatalist("companyList", companies);
  setDatalist("salaryRemarksList", salaryRemarks);
  setDatalist("personList", people);
  setDatalist("vehicleNameList", vehicleNames);
}

function setDatalist(id, values) {
  const el = $(id);
  if (!el) return;

  el.innerHTML = values
    .map(v =>
      `<option value="${esc(v)}"></option>`
    )
    .join("");
}

function fillVehiclePaymentModes() {
  const accounts = unique(
    (DB.passbook || []).map(
      x => x.Account
    )
  );

  [
    "fuelAccount",
    "maintAccountSelect"
  ].forEach(id => {
    const el = $(id);
    if (!el) return;

    const old = el.value;

    el.innerHTML =
      `<option value="">
        Payment Mode / Account
      </option>` +
      accounts.map(a =>
        `<option value="${esc(a)}">
          ${esc(a)}
        </option>`
      ).join("");

    if (
      [...el.options].some(
        o => o.value === old
      )
    ) {
      el.value = old;
    }
  });
}

function fillLoanList() {
  const loans = DB.loans || [];

  opt(
    $("emiLoan"),
    loans,
    x => x.ID,
    x => x["Loan Name"],
    "Select Loan"
  );
}

function fillInvestmentLists() {
  const baskets = DB.baskets || [];

  opt(
    $("assetBasket"),
    baskets,
    x => x.ID,
    x => {
      const person = (DB.people || [])
        .find(
          p =>
            String(p.ID) ===
            String(x["Person ID"])
        );

      return person
        ? `${x["Basket Name"]} • ${person.Name}`
        : x["Basket Name"];
    },
    "Select Basket"
  );
}

function fillSplitterLists() {
  const groups = DB.splitGroups || [];

  opt(
    $("spGroupSel"),
    groups,
    x => x.ID,
    x => x["Group Name"],
    "Select Group"
  );

  opt(
    $("spGroupExpense"),
    groups,
    x => x.ID,
    x => x["Group Name"],
    "Select Group"
  );

  renderGroupMembers();
  renderPaidBy();
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function filteredPassbook() {
  const month = val("dashMonth");
  const category = val("dashCategory");

  return (DB.passbook || []).filter(x => {
    const monthOK =
      !month ||
      String(x.Date || "").slice(0, 7) === month;

    const catOK =
      !category ||
      String(x.Category || "") === category;

    return monthOK && catOK;
  });
}

function renderDashboard() {
  const rows = filteredPassbook();

  const income = rows
    .filter(x => x.Type === "Income")
    .reduce(
      (s, x) => s + num(x.Amount),
      0
    );

  const expense = rows
    .filter(x => x.Type === "Expense")
    .reduce(
      (s, x) => s + num(x.Amount),
      0
    );

  const balance = income - expense;

  const fuel = (DB.fuel || [])
    .reduce(
      (s, x) => s + num(x.Amount),
      0
    );

  const maintenance = (DB.maintenance || [])
    .reduce(
      (s, x) => s + num(x.Amount),
      0
    );

  const dash = $("dash");

  if (dash) {
    dash.innerHTML = [
      dashboardCard(
        "Income",
        money(income),
        "positive"
      ),
      dashboardCard(
        "Expense",
        money(expense),
        "negative"
      ),
      dashboardCard(
        "Balance",
        money(balance),
        balance >= 0
          ? "positive"
          : "negative"
      ),
      dashboardCard(
        "Transactions",
        rows.length,
        ""
      ),
      dashboardCard(
        "Vehicle Cost",
        money(fuel + maintenance),
        ""
      )
    ].join("");
  }

  const labels = [];
  const incomeData = [];
  const expenseData = [];

  const baseMonth =
    val("dashMonth") || monthNow();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(
      baseMonth + "-01T00:00:00"
    );

    d.setMonth(
      d.getMonth() - i
    );

    const m =
      d.toISOString().slice(0, 7);

    labels.push(m);

    const r =
      (DB.passbook || []).filter(
        x =>
          String(x.Date || "")
            .slice(0, 7) === m
      );

    incomeData.push(
      r
        .filter(x => x.Type === "Income")
        .reduce(
          (s, x) => s + num(x.Amount),
          0
        )
    );

    expenseData.push(
      r
        .filter(x => x.Type === "Expense")
        .reduce(
          (s, x) => s + num(x.Amount),
          0
        )
    );
  }

  makeChart(
    "mainChart",
    "bar",
    labels,
    [
      {
        label: "Income",
        data: incomeData
      },
      {
        label: "Expense",
        data: expenseData
      }
    ]
  );

  makeChart(
    "expenseChart",
    "doughnut",
    ["Income", "Expense"],
    [
      {
        label: "Amount",
        data: [income, expense]
      }
    ]
  );
}

function dashboardCard(title, value, cls) {
  return `
    <div class="card ${cls || ""}">
      <small>${esc(title)}</small>
      <strong>${esc(value)}</strong>
    </div>
  `;
}

function makeChart(id, type, labels, datasets) {
  const canvas = $(id);

  if (!canvas ||
      typeof Chart === "undefined") {
    return;
  }

  if (charts[id]) {
    charts[id].destroy();
  }

  charts[id] = new Chart(
    canvas.getContext("2d"),
    {
      type,
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    }
  );
}

function resetDashFilters() {
  if ($("dashMonth"))
    $("dashMonth").value = "";

  if ($("dashCategory"))
    $("dashCategory").value = "";

  renderDashboard();
}

/* ============================================================
   PASSBOOK
   ============================================================ */

async function addPassbook() {
  const id = val("pbEditId");

  const date =
    val("pbDate") || today();

  const type =
    val("pbType") || "Expense";

  const category =
    val("pbCat").trim();

  const amount =
    num(val("pbAmt"));

  const account =
    val("pbAccount").trim();

  const remarks =
    val("pbRemarks").trim();

  if (!category)
    return toast("Enter category.");

  if (amount <= 0)
    return toast("Enter valid amount.");

  try {
    await save(
      "passbook",
      {
        ...(id ? { ID: id } : {}),
        Date: date,
        Type: type,
        Category: category,
        Amount: amount,
        Account: account,
        Remarks: remarks
      }
    );

    clearPassbook();
    renderAll();

    toast("Passbook saved.");

  } catch (error) {
    toast(error.message);
  }
}

function clearPassbook() {
  if ($("pbEditId"))
    $("pbEditId").value = "";

  if ($("pbDate"))
    $("pbDate").value = today();

  if ($("pbType"))
    $("pbType").value = "Expense";

  [
    "pbCat",
    "pbAmt",
    "pbAccount",
    "pbRemarks"
  ].forEach(id => {
    if ($(id)) $(id).value = "";
  });

  if ($("pbSaveBtn"))
    $("pbSaveBtn").textContent = "Save";
}

function resetPassbookFilters() {
  if ($("pbFilterMonth"))
    $("pbFilterMonth").value = "";

  if ($("pbFilterCategory"))
    $("pbFilterCategory").value = "";

  renderPassbook();
}

function renderPassbook() {
  const month =
    val("pbFilterMonth");

  const category =
    val("pbFilterCategory");

  let rows =
    (DB.passbook || []).filter(x => {

      const monthOK =
        !month ||
        String(x.Date || "")
          .slice(0, 7) === month;

      const catOK =
        !category ||
        String(x.Category || "") ===
        category;

      return monthOK && catOK;
    });

  const income = rows
    .filter(x => x.Type === "Income")
    .reduce(
      (s, x) => s + num(x.Amount),
      0
    );

  const expense = rows
    .filter(x => x.Type === "Expense")
    .reduce(
      (s, x) => s + num(x.Amount),
      0
    );

  if ($("passbookDash")) {
    $("passbookDash").innerHTML = [
      dashboardCard(
        "Income",
        money(income),
        "positive"
      ),
      dashboardCard(
        "Expense",
        money(expense),
        "negative"
      ),
      dashboardCard(
        "Balance",
        money(income - expense),
        income >= expense
          ? "positive"
          : "negative"
      )
    ].join("");
  }

  makeChart(
    "passbookChart",
    "doughnut",
    ["Income", "Expense"],
    [
      {
        label: "Passbook",
        data: [income, expense]
      }
    ]
  );

  const box = $("pbList");
  if (!box) return;

  rows = rows
    .slice()
    .sort(
      (a, b) =>
        String(b.Date)
          .localeCompare(String(a.Date))
    );

  box.innerHTML =
    rows.map(x => `
      <div class="list-row">

        <div>
          <b>
            ${esc(x.Category)}
          </b>

          <small>
            ${esc(x.Date)}
            •
            ${esc(x.Account || "")}
            ${x.Remarks
              ? " • " + esc(x.Remarks)
              : ""}
          </small>
        </div>

        <strong>
          ${x.Type === "Income" ? "+" : "-"}
          ${money(x.Amount)}
        </strong>

        <button
          class="danger"
          onclick="del('passbook','${esc(x.ID)}')"
        >
          Delete
        </button>

      </div>
    `).join("") ||
    `<div class="empty">
      No passbook entries found.
    </div>`;
}

/* ============================================================
   SALARY
   ============================================================ */

async function addSalary() {
  const month =
    val("salMonth") || monthNow();

  const company =
    val("salCompany").trim();

  const amount =
    num(val("salAmount"));

  const remarks =
    val("salRemarks").trim();

  if (!company)
    return toast("Enter company.");

  if (amount <= 0)
    return toast("Enter salary amount.");

  try {
    await save(
      "salary",
      {
        Month: month,
        Company: company,
        Amount: amount,
        Remarks: remarks
      }
    );

    await save(
      "passbook",
      {
        Date: month + "-01",
        Type: "Income",
        Category: "Salary",
        Amount: amount,
        Account: company,
        Remarks: remarks
      }
    );

    [
      "salCompany",
      "salAmount",
      "salRemarks"
    ].forEach(id => {
      if ($(id)) $(id).value = "";
    });

    renderAll();

    toast(
      "Salary saved + added to Passbook."
    );

  } catch (error) {
    toast(error.message);
  }
}

function renderSalary() {
  const rows =
    (DB.salary || [])
      .slice()
      .sort(
        (a, b) =>
          String(b.Month)
            .localeCompare(String(a.Month))
      );

  const income =
    rows.reduce(
      (s, x) => s + num(x.Amount),
      0
    );

  if ($("salaryDash")) {
    $("salaryDash").innerHTML =
      dashboardCard(
        "Total Salary",
        money(income),
        "positive"
      );
  }

  const labels =
    rows.slice(0, 12)
      .reverse()
      .map(x => x.Month);

  const values =
    rows.slice(0, 12)
      .reverse()
      .map(x => num(x.Amount));

  makeChart(
    "salaryChart",
    "bar",
    labels,
    [
      {
        label: "Salary",
        data: values
      }
    ]
  );

  const list = $("salaryList");
  if (!list) return;

  list.innerHTML =
    rows.map(x => `
      <div class="list-row">
        <div>
          <b>${esc(x.Company)}</b>
          <small>
            ${esc(x.Month)}
            • ${esc(x.Remarks || "")}
          </small>
        </div>
        <strong>${money(x.Amount)}</strong>
        <button
          class="danger"
          onclick="del('salary','${esc(x.ID)}')"
        >
          Delete
        </button>
      </div>
    `).join("") ||
    "<div class='empty'>No salary records.</div>";
}

/* ============================================================
   LOANS + EMI
   ============================================================ */

async function addLoan() {
  const name =
    val("loanName").trim();

  const initial =
    num(val("loanInitial"));

  const remarks =
    val("loanRemarks").trim();

  if (!name)
    return toast("Enter loan name.");

  if (initial <= 0)
    return toast("Enter loan amount.");

  try {
    await save(
      "loans",
      {
        "Loan Name": name,
        "Initial Amount": initial,
        Remarks: remarks
      }
    );

    [
      "loanName",
      "loanInitial",
      "loanRemarks"
    ].forEach(id => {
      if ($(id)) $(id).value = "";
    });

    renderAll();
    toast("Loan saved.");

  } catch (error) {
    toast(error.message);
  }
}

async function addEmi() {
  const loanId =
    val("emiLoan");

  const month =
    val("emiMonth") || monthNow();

  const amount =
    num(val("emiAmount"));

  const remarks =
    val("emiRemarks").trim();

  if (!loanId)
    return toast("Select loan.");

  if (amount <= 0)
    return toast("Enter EMI amount.");

  try {
    const emi =
      await save(
        "emi",
        {
          "Loan ID": loanId,
          Month: month,
          Amount: amount,
          Remarks: remarks
        }
      );

    const loan =
      (DB.loans || []).find(
        x =>
          String(x.ID) ===
          String(loanId)
      );

    await save(
      "passbook",
      {
        Date: month + "-01",
        Type: "Expense",
        Category: "EMI",
        Amount: amount,
        Account:
          loan?.["Loan Name"] ||
          "Loan",
        Remarks: remarks,
        "Source ID": emi.ID
      }
    );

    if ($("emiAmount"))
      $("emiAmount").value = "";

    if ($("emiRemarks"))
      $("emiRemarks").value = "";

    renderAll();

    toast(
      "EMI saved + added to Passbook."
    );

  } catch (error) {
    toast(error.message);
  }
}

function renderLoans() {
  const loans =
    DB.loans || [];

  const total =
    loans.reduce(
      (s, x) =>
        s + num(x["Initial Amount"]),
      0
    );

  const paid =
    (DB.emi || []).reduce(
      (s, x) =>
        s + num(x.Amount),
      0
    );

  if ($("loanDash")) {
    $("loanDash").innerHTML = [
      dashboardCard(
        "Initial Loans",
        money(total),
        ""
      ),
      dashboardCard(
        "EMI Paid",
        money(paid),
        "negative"
      ),
      dashboardCard(
        "Remaining",
        money(
          Math.max(
            0,
            total - paid
          )
        ),
        ""
      )
    ].join("");
  }

  makeChart(
    "loanChart",
    "bar",
    loans.map(
      x => x["Loan Name"]
    ),
    [
      {
        label: "Initial Amount",
        data: loans.map(
          x => num(x["Initial Amount"])
        )
      }
    ]
  );

  const list = $("loanList");
  if (!list) return;

  list.innerHTML =
    loans.map(loan => {

      const paidForLoan =
        (DB.emi || [])
          .filter(
            e =>
              String(e["Loan ID"]) ===
              String(loan.ID)
          )
          .reduce(
            (s, e) =>
              s + num(e.Amount),
            0
          );

      return `
        <div class="list-row">
          <div>
            <b>${esc(loan["Loan Name"])}</b>
            <small>
              ${esc(loan.Remarks || "")}
            </small>
          </div>

          <strong>
            ${money(
              loan["Initial Amount"]
            )}
          </strong>

          <small>
            EMI paid:
            ${money(paidForLoan)}
          </small>

          <button
            class="danger"
            onclick="del('loans','${esc(loan.ID)}')"
          >
            Delete
          </button>
        </div>
      `;
    }).join("") ||
    "<div class='empty'>No loans.</div>";
}

/* ============================================================
   GIVE & TAKE
   ============================================================ */

async function addGive() {
  const person =
    val("gtPerson").trim();

  const type =
    val("gtType");

  const amount =
    num(val("gtAmount"));

  const date =
    val("gtDate") || today();

  const purpose =
    val("gtPurpose").trim();

  const notes =
    val("gtNotes").trim();

  if (!person)
    return toast("Enter person.");

  if (amount <= 0)
    return toast("Enter amount.");

  try {
    await save(
      "transactions",
      {
        Person: person,
        Type: type,
        Amount: amount,
        Date: date,
        Purpose: purpose,
        Notes: notes
      }
    );

    [
      "gtPerson",
      "gtAmount",
      "gtPurpose",
      "gtNotes"
    ].forEach(id => {
      if ($(id)) $(id).value = "";
    });

    renderAll();
    toast("Give/Take saved.");

  } catch (error) {
    toast(error.message);
  }
}

function renderGive() {
  const rows =
    DB.transactions || [];

  const give =
    rows
      .filter(
        x =>
          x.Type === "Give" ||
          x.Type === "Pay"
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  const receive =
    rows
      .filter(
        x =>
          x.Type === "Receive" ||
          x.Type === "Take"
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  if ($("giveDash")) {
    $("giveDash").innerHTML = [
      dashboardCard(
        "Given / Paid",
        money(give),
        "negative"
      ),
      dashboardCard(
        "Received / Taken",
        money(receive),
        "positive"
      ),
      dashboardCard(
        "Net",
        money(receive - give),
        receive >= give
          ? "positive"
          : "negative"
      )
    ].join("");
  }

  if ($("gtDashboard")) {
    $("gtDashboard").innerHTML = "";
  }

  makeChart(
    "giveChart",
    "doughnut",
    ["Given / Paid", "Received / Taken"],
    [
      {
        label: "Amount",
        data: [give, receive]
      }
    ]
  );

  const list = $("gtList");
  if (!list) return;

  list.innerHTML =
    rows
      .slice()
      .reverse()
      .map(x => `
        <div class="list-row">
          <div>
            <b>
              ${esc(x.Person)}
            </b>
            <small>
              ${esc(x.Type)}
              • ${esc(x.Date)}
              • ${esc(x.Purpose || "")}
            </small>
          </div>
          <strong>${money(x.Amount)}</strong>
          <button
            class="danger"
            onclick="del('transactions','${esc(x.ID)}')"
          >
            Delete
          </button>
        </div>
      `).join("") ||
    "<div class='empty'>No Give/Take records.</div>";
}

/* ============================================================
   INVESTMENTS / SIP
   ============================================================ */

async function addBasket() {
  const personName =
    val("sipPerson").trim();

  const basketName =
    val("sipBasket").trim();

  if (!personName)
    return toast("Enter person.");

  if (!basketName)
    return toast("Enter basket name.");

  try {
    let person =
      (DB.people || []).find(
        p =>
          String(p.Name).toLowerCase() ===
          personName.toLowerCase()
      );

    if (!person) {
      person =
        await save(
          "people",
          {
            Name: personName
          }
        );
    }

    await save(
      "baskets",
      {
        "Person ID": person.ID,
        "Basket Name": basketName
      }
    );

    if ($("sipPerson"))
      $("sipPerson").value = "";

    if ($("sipBasket"))
      $("sipBasket").value = "";

    renderAll();

    toast("SIP basket created.");

  } catch (error) {
    toast(error.message);
  }
}

async function addAsset() {
  const basketId =
    val("assetBasket");

  const name =
    val("assetName").trim();

  const type =
    val("assetType");

  const amount =
    num(val("assetAmount"));

  if (!basketId)
    return toast("Select basket.");

  if (!name)
    return toast("Enter asset.");

  if (amount <= 0)
    return toast("Enter monthly amount.");

  try {
    await save(
      "assets",
      {
        "Basket ID": basketId,
        "Asset Name": name,
        "Asset Type": type,
        "Monthly Amount": amount
      }
    );

    [
      "assetName",
      "assetAmount"
    ].forEach(id => {
      if ($(id)) $(id).value = "";
    });

    renderAll();
    toast("Asset added.");

  } catch (error) {
    toast(error.message);
  }
}

function renderInvestments() {
  const baskets =
    DB.baskets || [];

  const assets =
    DB.assets || [];

  const monthly =
    assets.reduce(
      (s, x) =>
        s + num(x["Monthly Amount"]),
      0
    );

  if ($("investmentDash")) {
    $("investmentDash").innerHTML = [
      dashboardCard(
        "Baskets",
        baskets.length,
        ""
      ),
      dashboardCard(
        "Assets",
        assets.length,
        ""
      ),
      dashboardCard(
        "Monthly SIP",
        money(monthly),
        "positive"
      )
    ].join("");
  }

  const byType = {};

  assets.forEach(x => {
    const type =
      x["Asset Type"] ||
      "Other";

    byType[type] =
      (byType[type] || 0) +
      num(x["Monthly Amount"]);
  });

  makeChart(
    "investmentChart",
    "doughnut",
    Object.keys(byType),
    [
      {
        label: "Monthly SIP",
        data: Object.values(byType)
      }
    ]
  );

  const list =
    $("basketList");

  if (!list) return;

  list.innerHTML =
    baskets.map(basket => {

      const person =
        (DB.people || []).find(
          p =>
            String(p.ID) ===
            String(basket["Person ID"])
        );

      const basketAssets =
        assets.filter(
          a =>
            String(a["Basket ID"]) ===
            String(basket.ID)
        );

      const total =
        basketAssets.reduce(
          (s, x) =>
            s + num(x["Monthly Amount"]),
          0
        );

      return `
        <div class="list-row">
          <div>
            <b>
              ${esc(basket["Basket Name"])}
            </b>
            <small>
              ${esc(person?.Name || "")}
              • ${basketAssets.length} assets
            </small>
          </div>

          <strong>
            ${money(total)}/month
          </strong>

          <button
            class="danger"
            onclick="del('baskets','${esc(basket.ID)}')"
          >
            Delete
          </button>
        </div>

        ${basketAssets.map(asset => `
          <div class="list-row nested">
            <div>
              ${esc(asset["Asset Name"])}
              <small>
                ${esc(asset["Asset Type"])}
              </small>
            </div>

            <strong>
              ${money(
                asset["Monthly Amount"]
              )}
            </strong>

            <button
              class="danger"
              onclick="del('assets','${esc(asset.ID)}')"
            >
              Delete
            </button>
          </div>
        `).join("")}
      `;
    }).join("") ||
    "<div class='empty'>No SIP baskets.</div>";
}

/* ============================================================
   SPLITTER
   ============================================================ */

function groupMembers(groupId) {
  const group =
    (DB.splitGroups || []).find(
      x =>
        String(x.ID) ===
        String(groupId)
    );

  if (!group) return [];

  try {
    const parsed =
      JSON.parse(
        group["Members JSON"] || "[]"
      );

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch (e) {
    return [];
  }
}

async function addGroup() {
  const name =
    val("spGroup").trim();

  const category =
    val("spCat");

  const membersText =
    val("spMembers").trim();

  if (!name)
    return toast("Enter group name.");

  const members =
    unique(
      membersText
        ? membersText
            .split(",")
            .map(x => x.trim())
            .filter(Boolean)
        : []
    );

  try {
    await save(
      "splitGroups",
      {
        "Group Name": name,
        Category: category,
        "Members JSON":
          JSON.stringify(members)
      }
    );

    [
      "spGroup",
      "spMembers"
    ].forEach(id => {
      if ($(id)) $(id).value = "";
    });

    renderAll();

    toast("Group created.");

  } catch (error) {
    toast(error.message);
  }
}

async function addMember() {
  const groupId =
    val("spGroupSel");

  const member =
    val("newMember").trim();

  if (!groupId)
    return toast("Select group.");

  if (!member)
    return toast("Enter member.");

  const members =
    groupMembers(groupId);

  if (
    members.some(
      x =>
        String(x).toLowerCase() ===
        member.toLowerCase()
    )
  ) {
    return toast("Member already exists.");
  }

  try {
    const group =
      (DB.splitGroups || []).find(
        x =>
          String(x.ID) ===
          String(groupId)
      );

    await save(
      "splitGroups",
      {
        ...group,
        "Members JSON":
          JSON.stringify([
            ...members,
            member
          ])
      }
    );

    $("newMember").value = "";

    renderAll();
    toast("Member added.");

  } catch (error) {
    toast(error.message);
  }
}

async function renameGroup() {
  const groupId =
    val("spGroupSel");

  if (!groupId)
    return toast("Select group.");

  const group =
    (DB.splitGroups || []).find(
      x =>
        String(x.ID) ===
        String(groupId)
    );

  if (!group) return;

  const name =
    prompt(
      "New group name:",
      group["Group Name"]
    );

  if (!name || !name.trim())
    return;

  try {
    await save(
      "splitGroups",
      {
        ...group,
        "Group Name":
          name.trim()
      }
    );

    renderAll();
    toast("Group renamed.");

  } catch (error) {
    toast(error.message);
  }
}

function renderGroupMembers() {
  const box =
    $("memberChips");

  if (!box) return;

  const members =
    groupMembers(
      val("spGroupSel")
    );

  box.innerHTML =
    members.map(m => `
      <span class="chip">
        ${esc(m)}
      </span>
    `).join("") ||
    "<span class='muted'>No members.</span>";
}

function fillSplitExpenseGroup() {
  const groupId =
    val("spGroupExpense");

  renderPaidBy();

  const members =
    groupMembers(groupId);

  if (
    $("spMembersSel") &&
    !val("spMembersSel")
  ) {
    $("spMembersSel").placeholder =
      members.length
        ? "Participants blank = all"
        : "No members";
  }

  renderCustomShares();
}

function renderPaidBy() {
  const groupId =
    val("spGroupExpense");

  const members =
    groupMembers(groupId);

  opt(
    $("spPaidBy"),
    members,
    x => x,
    x => x,
    "Paid by"
  );
}

function selectedSplitMembers() {
  const groupId =
    val("spGroupExpense");

  const all =
    groupMembers(groupId);

  const text =
    val("spMembersSel").trim();

  if (!text) return all;

  const wanted =
    text
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

  return all.filter(
    m =>
      wanted.some(
        w =>
          w.toLowerCase() ===
          m.toLowerCase()
      )
  );
}

function renderCustomShares() {
  const box =
    $("customShares");

  if (!box) return;

  if (
    val("spSplitType") !==
    "custom"
  ) {
    box.innerHTML = "";
    return;
  }

  const members =
    selectedSplitMembers();

  box.innerHTML =
    members.map(m => `
      <label>
        ${esc(m)}
        <input
          class="custom-share"
          data-member="${esc(m)}"
          type="number"
          min="0"
          step="0.01"
          placeholder="${esc(m)} amount"
        >
      </label>
    `).join("");
}

async function saveSplitExpense() {
  const id =
    val("splitEditId");

  const groupId =
    val("spGroupExpense");

  const title =
    val("spTitle").trim();

  const amount =
    num(val("spAmount"));

  const paidBy =
    val("spPaidBy");

  const date =
    val("spDate") || today();

  const splitType =
    val("spSplitType");

  const members =
    selectedSplitMembers();

  if (!groupId)
    return toast("Select group.");

  if (!title)
    return toast("Enter expense title.");

  if (amount <= 0)
    return toast("Enter amount.");

  if (!paidBy)
    return toast("Select who paid.");

  if (!members.length)
    return toast("Select participants.");

  let customShares = {};

  if (splitType === "custom") {
    document
      .querySelectorAll(".custom-share")
      .forEach(input => {
        customShares[
          input.dataset.member
        ] = num(input.value);
      });

    const total =
      Object.values(customShares)
        .reduce(
          (s, x) => s + num(x),
          0
        );

    if (
      Math.abs(total - amount) >
      0.01
    ) {
      return toast(
        "Custom shares must equal the expense amount."
      );
    }
  }

  try {
    await save(
      "splitExpenses",
      {
        ...(id ? { ID: id } : {}),
        "Group ID": groupId,
        Title: title,
        Amount: amount,
        "Paid By": paidBy,
        "Members JSON":
          JSON.stringify(members),
        "Custom Shares JSON":
          JSON.stringify(customShares),
        Date: date
      }
    );

    clearSplit();
    renderAll();

    toast("Expense saved.");

  } catch (error) {
    toast(error.message);
  }
}

function clearSplit() {
  [
    "splitEditId",
    "spTitle",
    "spAmount",
    "spMembersSel"
  ].forEach(id => {
    if ($(id)) $(id).value = "";
  });

  if ($("spSplitType"))
    $("spSplitType").value = "equal";

  if ($("spDate"))
    $("spDate").value = today();

  if ($("customShares"))
    $("customShares").innerHTML = "";
}

function expenseShare(expense, member) {
  const members =
    JSON.parse(
      expense["Members JSON"] || "[]"
    );

  const custom =
    JSON.parse(
      expense["Custom Shares JSON"] ||
      "{}"
    );

  if (
    custom &&
    Object.keys(custom).length
  ) {
    return num(
      custom[member]
    );
  }

  return members.length
    ? num(expense.Amount) /
      members.length
    : 0;
}

function calculateGroupBalances(groupId) {
  const members =
    groupMembers(groupId);

  const balances = {};

  members.forEach(
    m => balances[m] = 0
  );

  const expenses =
    (DB.splitExpenses || [])
      .filter(
        x =>
          String(x["Group ID"]) ===
          String(groupId)
      );

  expenses.forEach(expense => {
    const paidBy =
      expense["Paid By"];

    if (!(paidBy in balances)) {
      balances[paidBy] = 0;
    }

    balances[paidBy] +=
      num(expense.Amount);

    const participants =
      JSON.parse(
        expense["Members JSON"] || "[]"
      );

    participants.forEach(member => {
      if (!(member in balances)) {
        balances[member] = 0;
      }

      balances[member] -=
        expenseShare(
          expense,
          member
        );
    });
  });

  return balances;
}

function settlementPairs(balances) {
  const debtors = [];
  const creditors = [];

  Object.entries(balances)
    .forEach(([person, amount]) => {
      if (amount < -0.01) {
        debtors.push({
          person,
          amount: -amount
        });
      }

      if (amount > 0.01) {
        creditors.push({
          person,
          amount
        });
      }
    });

  const result = [];

  let d = 0;
  let c = 0;

  while (
    d < debtors.length &&
    c < creditors.length
  ) {
    const amount =
      Math.min(
        debtors[d].amount,
        creditors[c].amount
      );

    result.push({
      from: debtors[d].person,
      to: creditors[c].person,
      amount
    });

    debtors[d].amount -= amount;
    creditors[c].amount -= amount;

    if (
      debtors[d].amount < 0.01
    ) d++;

    if (
      creditors[c].amount < 0.01
    ) c++;
  }

  return result;
}

function renderSplitter() {
  const groups =
    DB.splitGroups || [];

  const selectedGroup =
    val("spGroupSel");

  if ($("splitSummary")) {

    const balances =
      selectedGroup
        ? calculateGroupBalances(
            selectedGroup
          )
        : {};

    $("splitSummary").innerHTML =
      Object.entries(balances)
        .map(
          ([person, amount]) =>
            dashboardCard(
              person,
              money(amount),
              amount >= 0
                ? "positive"
                : "negative"
            )
        )
        .join("") ||
      "<div class='empty'>Select a group.</div>";
  }

  const settlements =
    selectedGroup
      ? settlementPairs(
          calculateGroupBalances(
            selectedGroup
          )
        )
      : [];

  if ($("settlementList")) {
    $("settlementList").innerHTML =
      settlements.map(x => `
        <div class="list-row">
          <div>
            <b>${esc(x.from)}</b>
            <small>pays ${esc(x.to)}</small>
          </div>
          <strong>${money(x.amount)}</strong>
        </div>
      `).join("") ||
      "<div class='empty'>No settlement required.</div>";
  }

  const expenses =
    (DB.splitExpenses || [])
      .filter(
        x =>
          !selectedGroup ||
          String(x["Group ID"]) ===
          String(selectedGroup)
      )
      .slice()
      .reverse();

  if ($("splitExpenseList")) {
    $("splitExpenseList").innerHTML =
      expenses.map(x => `
        <div class="list-row">
          <div>
            <b>${esc(x.Title)}</b>
            <small>
              ${esc(x.Date)}
              • Paid by ${esc(x["Paid By"])}
            </small>
          </div>
          <strong>${money(x.Amount)}</strong>
          <button
            class="danger"
            onclick="del('splitExpenses','${esc(x.ID)}')"
          >
            Delete
          </button>
        </div>
      `).join("") ||
      "<div class='empty'>No expenses.</div>";
  }

  if ($("splitSettlementHistory")) {
    const history =
      (DB.splitSettlements || [])
        .filter(
          x =>
            !selectedGroup ||
            String(x["Group ID"]) ===
            String(selectedGroup)
        )
        .slice()
        .reverse();

    $("splitSettlementHistory").innerHTML =
      history.map(x => `
        <div class="list-row">
          <div>
            <b>
              ${esc(x.From)}
              → ${esc(x.To)}
            </b>
            <small>
              ${esc(x.Date)}
              • ${esc(x.Notes || "")}
            </small>
          </div>
          <strong>${money(x.Amount)}</strong>
          <button
            class="danger"
            onclick="del('splitSettlements','${esc(x.ID)}')"
          >
            Delete
          </button>
        </div>
      `).join("") ||
      "<div class='empty'>No settlements.</div>";
  }

  if ($("splitList")) {
    $("splitList").innerHTML =
      groups.map(g => `
        <div class="list-row">
          <div>
            <b>${esc(g["Group Name"])}</b>
            <small>
              ${esc(g.Category || "")}
              • ${groupMembers(g.ID).length} members
            </small>
          </div>
          <button
            class="danger"
            onclick="del('splitGroups','${esc(g.ID)}')"
          >
            Delete
          </button>
        </div>
      `).join("") ||
      "<div class='empty'>No groups.</div>";
  }

  const chartGroup =
    selectedGroup
      ? calculateGroupBalances(
          selectedGroup
        )
      : {};

  makeChart(
    "splitChart",
    "bar",
    Object.keys(chartGroup),
    [
      {
        label: "Balance",
        data: Object.values(chartGroup)
      }
    ]
  );
}

/* ============================================================
   VEHICLES
   ============================================================ */

function vehicleName(id) {
  const v =
    (DB.vehicles || []).find(
      x =>
        String(x.ID) ===
        String(id)
    );

  return v
    ? v["Vehicle Name"]
    : "Vehicle";
}

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

function latestOdo(vehicleId) {
  return num(
    lastFuel(vehicleId)?.Odometer
  );
}

function updateFuelPreviousOdometer() {
  const previous =
    latestOdo(
      val("fuelVehicle")
    );

  if ($("fuelLastOdo"))
    $("fuelLastOdo").value =
      previous || "";

  if ($("fuelOdo"))
    $("fuelOdo").value = "";

  if ($("fuelDistance"))
    $("fuelDistance").value = "";
}

function calculateFuelDistance() {
  const previous =
    num(val("fuelLastOdo"));

  const current =
    num(val("fuelOdo"));

  if (!previous || !current) {
    if ($("fuelDistance"))
      $("fuelDistance").value = "";
    return;
  }

  const distance =
    current - previous;

  if (distance < 0) {
    $("fuelDistance").value = "";
    toast(
      "Current odometer cannot be less than previous odometer."
    );
    return;
  }

  $("fuelDistance").value =
    distance;
}

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

  if (rows.length < 2)
    return 0;

  let distance = 0;
  let quantity = 0;

  for (
    let i = 1;
    i < rows.length;
    i++
  ) {
    distance += Math.max(
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

async function addVehicle() {
  const name =
    val("vehicleName").trim();

  const type =
    val("vehicleType");

  const plate =
    val("vehiclePlate").trim();

  if (!name)
    return toast("Enter vehicle name.");

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
      if ($(id)) $(id).value = "";
    });

    renderAll();

    toast("Vehicle saved.");

  } catch (error) {
    toast(error.message);
  }
}

async function addFuel() {
  const vehicle =
    val("fuelVehicle");

  const amount =
    num(val("fuelAmount"));

  const quantity =
    num(val("fuelQty"));

  const odometer =
    num(val("fuelOdo"));

  const previous =
    num(val("fuelLastOdo"));

  const account =
    val("fuelAccount");

  if (!vehicle)
    return toast("Select vehicle.");

  if (amount <= 0 || quantity <= 0)
    return toast(
      "Enter valid fuel amount and litres."
    );

  if (odometer <= 0)
    return toast(
      "Enter current odometer."
    );

  if (
    previous &&
    odometer <= previous
  ) {
    return toast(
      "Current odometer must be greater than previous odometer."
    );
  }

  if (!account)
    return toast(
      "Select payment mode / account."
    );

  try {
    const fuel =
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

    const passbook =
      await save(
        "passbook",
        {
          Date: fuel.Date,
          Type: "Expense",
          Category: "Petrol / Fuel",
          Amount: amount,
          Account: account,
          Remarks:
            `${vehicleName(vehicle)} • ` +
            `${fuel["Fuel Type"] || "Fuel"}` +
            (
              previous
                ? ` • ${odometer - previous} km`
                : ""
            ),
          "Source ID": fuel.ID
        }
      );

    await save(
      "fuel",
      {
        ...fuel,
        "Passbook ID":
          passbook.ID
      }
    );

    [
      "fuelOdo",
      "fuelLastOdo",
      "fuelDistance",
      "fuelQty",
      "fuelAmount",
      "fuelNotes"
    ].forEach(id => {
      if ($(id)) $(id).value = "";
    });

    renderAll();

    toast(
      "✓ Fuel saved + added to Passbook."
    );

  } catch (error) {
    toast(error.message);
  }
}

async function addMaintenance() {
  const vehicle =
    val("maintVehicle");

  const amount =
    num(val("maintAmount"));

  const account =
    val("maintAccountSelect");

  if (!vehicle)
    return toast("Select vehicle.");

  if (amount <= 0)
    return toast(
      "Enter valid maintenance amount."
    );

  if (!account)
    return toast(
      "Select payment mode / account."
    );

  try {
    const maintenance =
      await save(
        "maintenance",
        {
          "Vehicle ID": vehicle,
          Date:
            val("maintDate") ||
            today(),
          Category:
            val("maintCategory"),
          Amount: amount,
          Odometer:
            num(val("maintOdo")),
          "Next Target KM":
            num(val("maintTargetKm")),
          Remarks:
            val("maintRemarks"),
          "Passbook ID": ""
        }
      );

    const passbook =
      await save(
        "passbook",
        {
          Date:
            maintenance.Date,
          Type: "Expense",
          Category:
            "Vehicle Maintenance",
          Amount: amount,
          Account: account,
          Remarks:
            `${vehicleName(vehicle)} • ` +
            `${maintenance.Category || "Service"}`,
          "Source ID":
            maintenance.ID
        }
      );

    await save(
      "maintenance",
      {
        ...maintenance,
        "Passbook ID":
          passbook.ID
      }
    );

    [
      "maintAmount",
      "maintOdo",
      "maintTargetKm",
      "maintRemarks"
    ].forEach(id => {
      if ($(id)) $(id).value = "";
    });

    renderAll();

    toast(
      "✓ Maintenance saved + added to Passbook."
    );

  } catch (error) {
    toast(error.message);
  }
}

function populateVehicleFilter() {
  const type =
    val("vehicleTypeFilter");

  const vehicles =
    (DB.vehicles || [])
      .filter(
        x =>
          !type ||
          String(x["Vehicle Type"]) ===
          type
      );

  opt(
    $("vehicleFilter"),
    vehicles,
    x => x.ID,
    x => x["Vehicle Name"],
    "All Vehicles"
  );
}

function resetVehicleFilters() {
  if ($("vehicleTypeFilter"))
    $("vehicleTypeFilter").value = "";

  populateVehicleFilter();

  if ($("vehicleFilter"))
    $("vehicleFilter").value = "";

  renderVehicles();
}

function renderVehicles() {
  const type =
    val("vehicleTypeFilter");

  const selected =
    val("vehicleFilter");

  const vehicles =
    (DB.vehicles || []).filter(v => {

      const typeOK =
        !type ||
        String(v["Vehicle Type"]) === type;

      const vehicleOK =
        !selected ||
        String(v.ID) === selected;

      return typeOK && vehicleOK;
    });

  const fuelAll =
    DB.fuel || [];

  const maintenanceAll =
    DB.maintenance || [];

  const fuelCost =
    fuelAll.reduce(
      (s, x) => s + num(x.Amount),
      0
    );

  const maintenanceCost =
    maintenanceAll.reduce(
      (s, x) => s + num(x.Amount),
      0
    );

  if ($("vehicleDash")) {
    $("vehicleDash").innerHTML = [
      dashboardCard(
        "Vehicles",
        vehicles.length,
        ""
      ),
      dashboardCard(
        "Fuel Cost",
        money(fuelCost),
        ""
      ),
      dashboardCard(
        "Maintenance Cost",
        money(maintenanceCost),
        ""
      ),
      dashboardCard(
        "Total Vehicle Cost",
        money(
          fuelCost +
          maintenanceCost
        ),
        "negative"
      )
    ].join("");
  }

  if ($("vehiclePerformanceDashboard")) {
    $("vehiclePerformanceDashboard").innerHTML =
      vehicles.map(v => {

        const fuel =
          fuelAll.filter(
            x =>
              String(x["Vehicle ID"]) ===
              String(v.ID)
          );

        const cost =
          fuel.reduce(
            (s, x) =>
              s + num(x.Amount),
            0
          );

        const litres =
          fuel.reduce(
            (s, x) =>
              s + num(x.Quantity),
            0
          );

        const avg =
          calculateFuelAverageKM(v.ID);

        return `
          <div class="summary-card">
            <b>
              ${esc(v["Vehicle Name"])}
            </b>
            <span>
              Fuel Cost:
              ${money(cost)}
            </span>
            <span>
              Total Fuel:
              ${litres.toFixed(2)} L
            </span>
            <span>
              Average:
              ${avg ? avg.toFixed(2) : "—"} KM/L
            </span>
          </div>
        `;
      }).join("") ||
      "<div class='empty'>No vehicles.</div>";
  }

  if ($("vehicleMaintenanceSummary")) {
    $("vehicleMaintenanceSummary").innerHTML =
      vehicles.map(v => {

        const rows =
          maintenanceAll
            .filter(
              x =>
                String(x["Vehicle ID"]) ===
                String(v.ID)
            )
            .sort(
              (a, b) =>
                String(b.Date)
                  .localeCompare(
                    String(a.Date)
                  )
            );

        const last =
          rows[0];

        const current =
          latestOdo(v.ID);

        const target =
          num(
            last?.["Next Target KM"]
          );

        const remaining =
          target && current
            ? target - current
            : 0;

        return `
          <div class="summary-card">
            <b>
              ${esc(v["Vehicle Name"])}
            </b>
            <span>
              Current KM:
              ${current || "—"}
            </span>
            <span>
              Last Maintenance:
              ${last
                ? esc(last.Date)
                : "—"}
            </span>
            <span>
              Next Target:
              ${target || "—"}
            </span>
            <span>
              KM Remaining:
              ${target
                ? remaining
                : "—"}
            </span>
          </div>
        `;
      }).join("") ||
      "<div class='empty'>No maintenance data.</div>";
  }

  makeChart(
    "fuelChart",
    "bar",
    vehicles.map(
      x => x["Vehicle Name"]
    ),
    [
      {
        label: "Fuel Cost",
        data: vehicles.map(v =>
          fuelAll
            .filter(
              x =>
                String(x["Vehicle ID"]) ===
                String(v.ID)
            )
            .reduce(
              (s, x) =>
                s + num(x.Amount),
              0
            )
        )
      }
    ]
  );

  makeChart(
    "maintenanceChart",
    "bar",
    vehicles.map(
      x => x["Vehicle Name"]
    ),
    [
      {
        label: "Maintenance Cost",
        data: vehicles.map(v =>
          maintenanceAll
            .filter(
              x =>
                String(x["Vehicle ID"]) ===
                String(v.ID)
            )
            .reduce(
              (s, x) =>
                s + num(x.Amount),
              0
            )
        )
      }
    ]
  );

  renderVehicleHistory(
    vehicles
  );
}

function renderVehicleHistory(vehicles) {
  const ids =
    new Set(
      vehicles.map(
        x => String(x.ID)
      )
    );

  const fuel =
    (DB.fuel || [])
      .filter(
        x =>
          !ids.size ||
          ids.has(
            String(x["Vehicle ID"])
          )
      )
      .slice()
      .sort(
        (a, b) =>
          String(b.Date)
            .localeCompare(String(a.Date))
      )
      .slice(0, 5);

  const maintenance =
    (DB.maintenance || [])
      .filter(
        x =>
          !ids.size ||
          ids.has(
            String(x["Vehicle ID"])
          )
      )
      .slice()
      .sort(
        (a, b) =>
          String(b.Date)
            .localeCompare(String(a.Date))
      )
      .slice(0, 5);

  if ($("fuelList")) {
    $("fuelList").innerHTML =
      fuel.map(x => `
        <div class="list-row">
          <div>
            <b>
              ${esc(
                vehicleName(
                  x["Vehicle ID"]
                )
              )}
            </b>
            <small>
              ${esc(x.Date)}
              • ${esc(x.Odometer)} km
              • ${esc(x.Quantity)} L
              • ${esc(x["Fuel Type"] || "")}
            </small>
          </div>

          <strong>
            ${money(x.Amount)}
          </strong>

          <button
            class="danger"
            onclick="del('fuel','${esc(x.ID)}')"
          >
            Delete
          </button>
        </div>
      `).join("") ||
      "<div class='empty'>No fuel history.</div>";
  }

  if ($("maintenanceList")) {
    $("maintenanceList").innerHTML =
      maintenance.map(x => `
        <div class="list-row">
          <div>
            <b>
              ${esc(
                vehicleName(
                  x["Vehicle ID"]
                )
              )}
            </b>
            <small>
              ${esc(x.Date)}
              • ${esc(x.Category || "")}
              • ${esc(x.Odometer || "")} km
            </small>
          </div>

          <strong>
            ${money(x.Amount)}
          </strong>

          <button
            class="danger"
            onclick="del('maintenance','${esc(x.ID)}')"
          >
            Delete
          </button>
        </div>
      `).join("") ||
      "<div class='empty'>No maintenance history.</div>";
  }
}

/* ============================================================
   MASTER RENDER
   ============================================================ */

function renderAll() {
  fillLists();
  renderDashboard();
  renderPassbook();
  renderSalary();
  renderLoans();
  renderGive();
  // Investments & Money Splitter tabs removed from the UI.
  renderVehicles();
}

/* ============================================================
   START
   ============================================================ */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    initDefaults();
    initUI();
    loadAll();
  }
);
