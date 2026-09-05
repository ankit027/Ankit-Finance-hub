// =========================================================
// ANKIT FINANCE HUB - FIXED CLOUD APP
// Google Sheets + Apps Script version
// =========================================================

const API_URL = "https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";
const LOCAL_KEY = "ankit_finance_hub_cloud_v4";

let DB = {};
let charts = {};
let syncInProgress = false;

const $ = id => document.getElementById(id);
const uid = () => Date.now() + "-" + Math.random().toString(36).slice(2);
const num = v => Number(v || 0) || 0;
const money = v => "₹" + num(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const ym = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

function arr(key) {
  return Array.isArray(DB[key]) ? DB[key] : [];
}

function toast(message) {
  const el = $("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(window.__toastTimer);

  window.__toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2500);
}

function setStatus(message) {
  const el = $("status");
  if (el) el.textContent = message;
}

function persist() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(DB));
  } catch (e) {}
}

function restore() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

// =========================================================
// API
// =========================================================

async function api(action, payload = {}) {

  const response = await fetch(API_URL, {
    method: "POST",

    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },

    body: JSON.stringify({
      action,
      ...payload
    })
  });

  const text = await response.text();

  let json;

  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(
      "Invalid API response. Check Apps Script deployment URL and access."
    );
  }

  if (!json.success) {
    throw new Error(json.error || "API error");
  }

  return json;
}

// =========================================================
// LOAD ALL
// =========================================================

async function loadAll(silent = false) {

  if (syncInProgress) return;

  syncInProgress = true;

  try {

    if (!silent) {
      setStatus("☁️ Syncing...");
    }

    const response = await api("loadAll");

    DB = response.data || {};

    persist();

    render();

    setStatus("☁️ Synced");

  } catch (e) {

    setStatus(
      Object.keys(DB).length
        ? "💾 Offline Cache"
        : "⚠️ Sync Error"
    );

    if (!silent) {
      toast(e.message);
    }

  } finally {

    syncInProgress = false;

  }
}

// =========================================================
// SAVE
// =========================================================

async function save(table, data) {

  setStatus("☁️ Saving...");

  try {

    const response = await api("save", {
      table,
      data
    });

    // Apps Script returns:
    // { success:true, data:{ record: record } }

    const record =
      response?.data?.record ||
      response?.record ||
      data;

    DB[table] = arr(table).slice();

    const index = DB[table].findIndex(
      x => String(x.ID) === String(record.ID)
    );

    if (index >= 0) {
      DB[table][index] = record;
    } else {
      DB[table].push(record);
    }

    persist();

    render();

    setStatus("☁️ Synced");

    toast("✓ Saved successfully");

    return record;

  } catch (e) {

    setStatus("⚠️ Save Failed");

    toast(e.message);

    throw e;
  }
}

// =========================================================
// DELETE
// =========================================================

async function del(table, id) {

  if (!confirm("Delete this record?")) return;

  try {

    await api("delete", {
      table,
      id
    });

    DB[table] = arr(table).filter(
      x => String(x.ID) !== String(id)
    );

    persist();

    render();

    toast("Deleted successfully");

  } catch (e) {

    toast(e.message);

  }
}

// =========================================================
// UI HELPERS
// =========================================================

function card(title, value) {

  return `
    <div>
      <small>${title}</small>
      <b>${value}</b>
    </div>
  `;
}

function item(left, right, action = "") {

  return `
    <div class="item">

      <span>
        ${left}
      </span>

      <span>
        ${right}
        ${action}
      </span>

    </div>
  `;
}

function chart(id, type, labels, data, label) {

  const canvas = $(id);

  if (!canvas || typeof Chart === "undefined") return;

  if (charts[id]) {
    charts[id].destroy();
  }

  charts[id] = new Chart(canvas, {

    type,

    data: {

      labels,

      datasets: [
        {
          label,
          data
        }
      ]

    },

    options: {
      responsive: true,
      maintainAspectRatio: false
    }

  });
}

// =========================================================
// NAVIGATION + THEME
// =========================================================

function initUI() {

  document
    .querySelectorAll("[data-page]")
    .forEach(button => {

      button.onclick = () => {

        document
          .querySelectorAll(".page")
          .forEach(page => {
            page.classList.remove("active");
          });

        const page = $(button.dataset.page);

        if (page) {
          page.classList.add("active");
        }

        $("sidebar")?.classList.remove("open");

      };

    });

  $("menuBtn")?.addEventListener("click", () => {

    $("sidebar")?.classList.toggle("open");

  });

  if (
    localStorage.getItem("financeTheme") === "dark"
  ) {
    document.body.classList.add("dark");
  }

  updateThemeButton();

  $("themeBtn")?.addEventListener("click", () => {

    document.body.classList.toggle("dark");

    localStorage.setItem(
      "financeTheme",
      document.body.classList.contains("dark")
        ? "dark"
        : "light"
    );

    updateThemeButton();

  });

  [
    "dashMonth",
    "dashCategory",
    "pbFilterMonth",
    "pbFilterCategory"
  ].forEach(id => {

    $(id)?.addEventListener("change", render);

  });

  $("vehicleTypeFilter")?.addEventListener(
    "change",
    () => {

      populateVehicleFilters();

      render();

    }
  );

  $("vehicleFilter")?.addEventListener(
    "change",
    render
  );

  $("spGroupSel")?.addEventListener(
    "change",
    () => {

      if ($("spGroupExpense")) {
        $("spGroupExpense").value =
          $("spGroupSel").value;
      }

      renderSplit();

    }
  );

  $("spGroupExpense")?.addEventListener(
    "change",
    () => {

      if ($("spGroupSel")) {
        $("spGroupSel").value =
          $("spGroupExpense").value;
      }

      renderSplit();

    }
  );

  $("spSplitType")?.addEventListener(
    "change",
    renderCustomShares
  );

}

function updateThemeButton() {

  const btn = $("themeBtn");

  if (!btn) return;

  btn.textContent =
    document.body.classList.contains("dark")
      ? "☀️ Light"
      : "🌙 Dark";
}

// =========================================================
// DEFAULT VALUES
// =========================================================

function initDefaults() {

  if (
    $("dashMonth") &&
    !$("dashMonth").value
  ) {
    $("dashMonth").value = ym();
  }

  if (
    $("pbFilterMonth") &&
    !$("pbFilterMonth").value
  ) {
    $("pbFilterMonth").value = ym();
  }

  if (
    $("salMonth") &&
    !$("salMonth").value
  ) {
    $("salMonth").value = ym();
  }

  if (
    $("emiMonth") &&
    !$("emiMonth").value
  ) {
    $("emiMonth").value = ym();
  }

  [
    "pbDate",
    "gtDate",
    "spDate",
    "fuelDate",
    "maintDate"
  ].forEach(id => {

    if (
      $(id) &&
      !$(id).value
    ) {
      $(id).value = today();
    }

  });

}

// =========================================================
// LISTS / FILTERS
// =========================================================

function fillDatalist(id, values) {

  const el = $(id);

  if (!el) return;

  el.innerHTML = [
    ...new Set(
      values.filter(Boolean)
    )
  ]
    .map(x =>
      `<option value="${String(x).replace(/"/g, "&quot;")}"></option>`
    )
    .join("");

}

function populateLists() {

  const passbook = arr("passbook");

  const salary = arr("salary");

  const transactions = arr("transactions");

  const categories = [
    ...new Set(
      passbook
        .map(x => x.Category)
        .filter(Boolean)
    )
  ].sort();

  fillDatalist(
    "categoryList",
    passbook.map(x => x.Category)
  );

  fillDatalist(
    "accountList",
    passbook.map(x => x.Account)
  );

  fillDatalist(
    "remarksList",
    passbook.map(x => x.Remarks)
  );

  fillDatalist(
    "companyList",
    salary.map(x => x.Company)
  );

  fillDatalist(
    "salaryRemarksList",
    salary.map(x => x.Remarks)
  );

  fillDatalist(
    "personList",
    transactions.map(x => x.Person)
  );

  fillDatalist(
    "vehicleNameList",
    arr("vehicles").map(
      x => x["Vehicle Name"]
    )
  );

  [
    "dashCategory",
    "pbFilterCategory"
  ].forEach(id => {

    const el = $(id);

    if (!el) return;

    const previous = el.value;

    el.innerHTML =
      '<option value="">All Categories</option>' +
      categories
        .map(
          x =>
            `<option value="${x}">${x}</option>`
        )
        .join("");

    if (
      categories.includes(previous)
    ) {
      el.value = previous;
    }

  });

  const loans = arr("loans");

  if ($("emiLoan")) {

    const previous = $("emiLoan").value;

    $("emiLoan").innerHTML =
      '<option value="">Select Loan</option>' +
      loans
        .map(
          x =>
            `<option value="${x.ID}">${x["Loan Name"]}</option>`
        )
        .join("");

    if (
      loans.some(
        x => x.ID === previous
      )
    ) {
      $("emiLoan").value = previous;
    }

  }

  const baskets = arr("baskets");

  const people = arr("people");

  if ($("assetBasket")) {

    const previous =
      $("assetBasket").value;

    $("assetBasket").innerHTML =
      '<option value="">Select Basket</option>' +
      baskets
        .map(b => {

          const p = people.find(
            x => x.ID === b["Person ID"]
          );

          return `
            <option value="${b.ID}">
              ${p?.Name || ""} — ${b["Basket Name"]}
            </option>
          `;

        })
        .join("");

    if (
      baskets.some(
        x => x.ID === previous
      )
    ) {
      $("assetBasket").value = previous;
    }

  }

  populateVehicleSelects();

  populateSplitGroups();

}

function populateVehicleSelects() {

  const vehicles = arr("vehicles");

  [
    "fuelVehicle",
    "maintVehicle"
  ].forEach(id => {

    const el = $(id);

    if (!el) return;

    const previous = el.value;

    el.innerHTML =
      '<option value="">Select Vehicle</option>' +
      vehicles
        .map(
          v =>
            `<option value="${v.ID}">
              ${v["Vehicle Name"]} • ${v["Vehicle Type"]}
            </option>`
        )
        .join("");

    if (
      vehicles.some(
        v => v.ID === previous
      )
    ) {
      el.value = previous;
    }

  });

}

function populateVehicleFilters() {

  const type =
    $("vehicleTypeFilter")?.value || "";

  const filter =
    $("vehicleFilter");

  if (!filter) return;

  const previous = filter.value;

  const vehicles =
    arr("vehicles").filter(
      v =>
        !type ||
        v["Vehicle Type"] === type
    );

  filter.innerHTML =
    '<option value="">All Vehicles</option>' +
    vehicles
      .map(
        v =>
          `<option value="${v.ID}">
            ${v["Vehicle Name"]}
          </option>`
      )
      .join("");

  if (
    vehicles.some(
      v => v.ID === previous
    )
  ) {
    filter.value = previous;
  }

}

function populateSplitGroups() {

  const groups =
    arr("splitGroups");

  [
    "spGroupSel",
    "spGroupExpense"
  ].forEach(id => {

    const el = $(id);

    if (!el) return;

    const previous = el.value;

    el.innerHTML =
      '<option value="">Select Group</option>' +
      groups
        .map(
          g =>
            `<option value="${g.ID}">
              ${g["Group Name"]}
            </option>`
        )
        .join("");

    if (
      groups.some(
        g => g.ID === previous
      )
    ) {
      el.value = previous;
    }

  });

}

// =========================================================
// DASHBOARD
// =========================================================

function filterPassbook(
  rows,
  month,
  category
) {

  return rows.filter(
    x =>
      (
        !month ||
        String(x.Date || "")
          .slice(0, 7) === month
      ) &&
      (
        !category ||
        String(x.Category || "") === category
      )
  );

}

function giveBalances() {

  const out = {};

  arr("transactions").forEach(x => {

    const person =
      String(
        x.Person || "Unknown"
      ).trim();

    if (!out[person]) {

      out[person] = {
        person,
        balance: 0,
        given: 0,
        received: 0,
        taken: 0,
        paid: 0
      };

    }

    const a = num(x.Amount);

    const type =
      String(
        x.Type || ""
      ).toLowerCase();

    const p = out[person];

    if (type === "give") {

      p.balance += a;
      p.given += a;

    } else if (type === "receive") {

      p.balance -= a;
      p.received += a;

    } else if (type === "take") {

      p.balance -= a;
      p.taken += a;

    } else if (type === "pay") {

      p.balance += a;
      p.paid += a;

    }

  });

  return out;

}

function renderDashboard() {

  const month =
    $("dashMonth")?.value || ym();

  const category =
    $("dashCategory")?.value || "";

  const p = filterPassbook(
    arr("passbook"),
    month,
    category
  );

  const income = p
    .filter(
      x =>
        String(x.Type)
          .toLowerCase() === "income"
    )
    .reduce(
      (s, x) =>
        s + num(x.Amount),
      0
    );

  const expense = p
    .filter(
      x =>
        String(x.Type)
          .toLowerCase() === "expense"
    )
    .reduce(
      (s, x) =>
        s + num(x.Amount),
      0
    );

  const salary =
    arr("salary")
      .filter(
        x =>
          String(x.Month) === month
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  const emi =
    arr("emi")
      .filter(
        x =>
          String(x.Month) === month
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  const sip =
    arr("sipPayments")
      .filter(
        x =>
          String(x.Month) === month
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  const balances =
    Object.values(
      giveBalances()
    );

  const receive =
    balances
      .filter(
        x => x.balance > 0
      )
      .reduce(
        (s, x) =>
          s + x.balance,
        0
      );

  const pay =
    balances
      .filter(
        x => x.balance < 0
      )
      .reduce(
        (s, x) =>
          s + Math.abs(x.balance),
        0
      );

  $("dash").innerHTML = [

    ["💰 Salary", salary],

    ["📈 Total Income", salary + income],

    ["💸 Expense", expense],

    ["🏦 EMI Paid", emi],

    ["📉 SIP Paid", sip],

    ["🤝 To Receive", receive],

    ["🤝 To Pay", pay],

    [
      "💳 Net",
      salary +
      income -
      expense -
      emi -
      sip
    ]

  ]
    .map(
      x => card(
        x[0],
        money(x[1])
      )
    )
    .join("");

  const monthly = {};

  arr("passbook").forEach(x => {

    const m =
      String(
        x.Date || ""
      ).slice(0, 7);

    if (!m) return;

    if (!monthly[m]) {
      monthly[m] = {
        income: 0,
        expense: 0
      };
    }

    if (
      String(x.Type)
        .toLowerCase() === "income"
    ) {
      monthly[m].income +=
        num(x.Amount);
    } else {
      monthly[m].expense +=
        num(x.Amount);
    }

  });

  const labels =
    Object.keys(monthly)
      .sort()
      .slice(-12);

  if ($("mainChart")) {

    if (charts.mainChart) {
      charts.mainChart.destroy();
    }

    charts.mainChart =
      new Chart(
        $("mainChart"),
        {

          type: "bar",

          data: {

            labels,

            datasets: [

              {
                label: "Income",

                data:
                  labels.map(
                    m =>
                      monthly[m].income
                  )
              },

              {
                label: "Expense",

                data:
                  labels.map(
                    m =>
                      monthly[m].expense
                  )
              }

            ]

          },

          options: {
            responsive: true,
            maintainAspectRatio: false
          }

        }
      );

  }

  const cats = {};

  p
    .filter(
      x =>
        String(x.Type)
          .toLowerCase() === "expense"
    )
    .forEach(x => {

      const c =
        x.Category || "Other";

      cats[c] =
        (cats[c] || 0) +
        num(x.Amount);

    });

  chart(
    "expenseChart",
    "doughnut",
    Object.keys(cats),
    Object.values(cats),
    "Expense"
  );

}

function resetDashFilters() {

  if ($("dashMonth")) {
    $("dashMonth").value = ym();
  }

  if ($("dashCategory")) {
    $("dashCategory").value = "";
  }

  render();

}

// =========================================================
// PASSBOOK
// =========================================================

async function addPassbook() {

  const amount =
    num($("pbAmt").value);

  if (amount <= 0) {
    return toast(
      "Enter valid amount"
    );
  }

  const record =
    await save(
      "passbook",
      {

        ID:
          $("pbEditId").value ||
          uid(),

        Date:
          $("pbDate").value ||
          today(),

        Type:
          $("pbType").value,

        Category:
          $("pbCat").value.trim() ||
          "Other",

        Amount:
          amount,

        Account:
          $("pbAccount").value.trim(),

        Remarks:
          $("pbRemarks").value.trim()

      }
    );

  clearPassbook();

  return record;

}

function editPassbook(id) {

  const x =
    arr("passbook").find(
      x => x.ID === id
    );

  if (!x) return;

  $("pbEditId").value =
    x.ID;

  $("pbDate").value =
    x.Date || today();

  $("pbType").value =
    x.Type || "Expense";

  $("pbCat").value =
    x.Category || "";

  $("pbAmt").value =
    x.Amount || "";

  $("pbAccount").value =
    x.Account || "";

  $("pbRemarks").value =
    x.Remarks || "";

  $("pbSaveBtn").textContent =
    "Update";

}

function clearPassbook() {

  $("pbEditId").value = "";

  $("pbDate").value =
    today();

  $("pbType").value =
    "Expense";

  $("pbCat").value = "";

  $("pbAmt").value = "";

  $("pbAccount").value = "";

  $("pbRemarks").value = "";

  $("pbSaveBtn").textContent =
    "Save";

}

function renderPassbook() {

  const month =
    $("pbFilterMonth")?.value ||
    "";

  const category =
    $("pbFilterCategory")?.value ||
    "";

  const rows =
    filterPassbook(
      arr("passbook"),
      month,
      category
    )
      .slice()
      .sort(
        (a, b) =>
          String(b.Date)
            .localeCompare(
              String(a.Date)
            )
      );

  const income =
    rows
      .filter(
        x =>
          String(x.Type)
            .toLowerCase() === "income"
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  const expense =
    rows
      .filter(
        x =>
          String(x.Type)
            .toLowerCase() === "expense"
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  $("passbookDash").innerHTML = [

    ["Income", money(income)],

    ["Expense", money(expense)],

    ["Balance", money(income - expense)],

    ["Entries", rows.length]

  ]
    .map(
      x => card(
        x[0],
        x[1]
      )
    )
    .join("");

  $("pbList").innerHTML =
    rows
      .map(
        x => `
          <div class="item">

            <span>

              <b>
                ${x.Category || "Other"}
              </b>

              <br>

              <small>

                ${x.Date || ""}

                •

                ${x.Type || ""}

                ${
                  x.Account
                    ? " • " + x.Account
                    : ""
                }

                <br>

                ${x.Remarks || ""}

              </small>

            </span>

            <span>

              <b>
                ${money(x.Amount)}
              </b>

              <button
                class="secondary"
                onclick="editPassbook('${x.ID}')"
              >
                Edit
              </button>

              <button
                class="danger"
                onclick="del('passbook','${x.ID}')"
              >
                Delete
              </button>

            </span>

          </div>
        `
      )
      .join("") ||
    "<p>No records</p>";

  const cats = {};

  rows.forEach(x => {

    const c =
      x.Category ||
      "Other";

    cats[c] =
      (cats[c] || 0) +
      num(x.Amount);

  });

  chart(
    "passbookChart",
    "doughnut",
    Object.keys(cats),
    Object.values(cats),
    "Amount"
  );

}

function resetPassbookFilters() {

  if ($("pbFilterMonth")) {
    $("pbFilterMonth").value = "";
  }

  if ($("pbFilterCategory")) {
    $("pbFilterCategory").value = "";
  }

  render();

}
// =========================================================
// SALARY
// =========================================================

async function addSalary() {

  const amount =
    num($("salAmount").value);

  if (amount <= 0) {
    return toast(
      "Enter salary amount"
    );
  }

  await save(
    "salary",
    {

      ID:
        uid(),

      Month:
        $("salMonth").value ||
        ym(),

      Company:
        $("salCompany").value.trim() ||
        "Company",

      Amount:
        amount,

      Remarks:
        $("salRemarks").value.trim()

    }
  );

  $("salAmount").value = "";

  $("salRemarks").value = "";

}

function renderSalary() {

  const rows =
    arr("salary")
      .slice()
      .sort(
        (a, b) =>
          String(b.Month)
            .localeCompare(
              String(a.Month)
            )
      );

  const total =
    rows.reduce(
      (s, x) =>
        s + num(x.Amount),
      0
    );

  const current =
    rows
      .filter(
        x => x.Month === ym()
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  $("salaryDash").innerHTML = [

    ["This Month", money(current)],

    ["Total Salary", money(total)],

    ["Entries", rows.length],

    [
      "Companies",
      new Set(
        rows
          .map(x => x.Company)
          .filter(Boolean)
      ).size
    ]

  ]
    .map(
      x => card(
        x[0],
        x[1]
      )
    )
    .join("");

  $("salaryList").innerHTML =
    rows
      .map(
        x =>
          item(
            `${x.Month} • <b>${x.Company}</b><br><small>${x.Remarks || ""}</small>`,

            money(x.Amount),

            `
              <button
                class="danger"
                onclick="del('salary','${x.ID}')"
              >
                Delete
              </button>
            `
          )
      )
      .join("") ||
    "<p>No salary records</p>";

  const map = {};

  rows.forEach(x => {

    map[x.Month] =
      (map[x.Month] || 0) +
      num(x.Amount);

  });

  const labels =
    Object.keys(map).sort();

  chart(
    "salaryChart",
    "line",
    labels,
    labels.map(
      k => map[k]
    ),
    "Salary"
  );

}

// =========================================================
// LOANS + EMI
// =========================================================

async function addLoan() {

  const name =
    $("loanName").value.trim();

  const amount =
    num($("loanInitial").value);

  if (
    !name ||
    amount <= 0
  ) {
    return toast(
      "Enter loan details"
    );
  }

  await save(
    "loans",
    {

      ID:
        uid(),

      "Loan Name":
        name,

      "Initial Amount":
        amount,

      Remarks:
        $("loanRemarks").value.trim()

    }
  );

  $("loanName").value = "";

  $("loanInitial").value = "";

  $("loanRemarks").value = "";

}

async function addEmi() {

  if (
    !$("emiLoan").value
  ) {
    return toast(
      "Select loan"
    );
  }

  const amount =
    num($("emiAmount").value);

  if (amount <= 0) {
    return toast(
      "Enter EMI amount"
    );
  }

  await save(
    "emi",
    {

      ID:
        uid(),

      "Loan ID":
        $("emiLoan").value,

      Month:
        $("emiMonth").value ||
        ym(),

      Amount:
        amount,

      Remarks:
        $("emiRemarks").value.trim()

    }
  );

  $("emiAmount").value = "";

  $("emiRemarks").value = "";

}

function renderLoans() {

  const loans =
    arr("loans");

  const emi =
    arr("emi");

  const initial =
    loans.reduce(
      (s, x) =>
        s +
        num(
          x["Initial Amount"]
        ),
      0
    );

  const paid =
    emi.reduce(
      (s, x) =>
        s + num(x.Amount),
      0
    );

  const paidMonth =
    emi
      .filter(
        x =>
          x.Month === ym()
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  $("loanDash").innerHTML = [

    ["Total Loan", money(initial)],

    ["EMI This Month", money(paidMonth)],

    ["Total EMI Paid", money(paid)],

    [
      "Outstanding",
      money(
        Math.max(
          0,
          initial - paid
        )
      )
    ]

  ]
    .map(
      x => card(
        x[0],
        x[1]
      )
    )
    .join("");

  $("loanList").innerHTML =
    loans
      .map(x => {

        const paidLoan =
          emi
            .filter(
              e =>
                e["Loan ID"] === x.ID
            )
            .reduce(
              (s, e) =>
                s + num(e.Amount),
              0
            );

        return item(

          `
            <b>
              ${x["Loan Name"]}
            </b>

            <br>

            <small>

              Initial
              ${money(x["Initial Amount"])}

              •

              Paid
              ${money(paidLoan)}

              •

              Balance
              ${money(
                Math.max(
                  0,
                  num(x["Initial Amount"]) -
                  paidLoan
                )
              )}

            </small>
          `,

          "",

          `
            <button
              class="danger"
              onclick="del('loans','${x.ID}')"
            >
              Delete
            </button>
          `

        );

      })
      .join("") ||
    "<p>No loans</p>";

  chart(
    "loanChart",
    "doughnut",
    [
      "Initial Loan",
      "EMI Paid"
    ],
    [
      initial,
      paid
    ],
    "Amount"
  );

}

// =========================================================
// GIVE & TAKE
// =========================================================

async function addGive() {

  const person =
    $("gtPerson").value.trim();

  const amount =
    num($("gtAmount").value);

  if (
    !person ||
    amount <= 0
  ) {
    return toast(
      "Enter person and amount"
    );
  }

  await save(
    "transactions",
    {

      ID:
        uid(),

      Person:
        person,

      Type:
        $("gtType").value,

      Amount:
        amount,

      Date:
        $("gtDate").value ||
        today(),

      Purpose:
        $("gtPurpose").value.trim(),

      Notes:
        $("gtNotes").value.trim(),

      Revisions:
        "[]"

    }
  );

  [
    "gtPerson",
    "gtAmount",
    "gtPurpose",
    "gtNotes"
  ].forEach(id => {

    $(id).value = "";

  });

}

function renderGiveTake() {

  const balances =
    Object.values(
      giveBalances()
    );

  const receive =
    balances
      .filter(
        x =>
          x.balance > 0
      )
      .reduce(
        (s, x) =>
          s + x.balance,
        0
      );

  const pay =
    balances
      .filter(
        x =>
          x.balance < 0
      )
      .reduce(
        (s, x) =>
          s +
          Math.abs(
            x.balance
          ),
        0
      );

  $("giveDash").innerHTML = [

    [
      "To Receive",
      money(receive)
    ],

    [
      "To Pay",
      money(pay)
    ],

    [
      "Net",
      money(receive - pay)
    ],

    [
      "People",
      balances.length
    ]

  ]
    .map(
      x =>
        card(
          x[0],
          x[1]
        )
    )
    .join("");

  $("gtDashboard").innerHTML =
    balances
      .map(x =>
        card(
          `
            ${x.person}
            •
            ${
              x.balance > 0
                ? "To Receive"
                : x.balance < 0
                  ? "To Pay"
                  : "Settled"
            }
          `,

          money(
            Math.abs(
              x.balance
            )
          )
        )
      )
      .join("");

  $("gtList").innerHTML =
    arr("transactions")
      .slice()
      .sort(
        (a, b) =>
          String(b.Date)
            .localeCompare(
              String(a.Date)
            )
      )
      .map(x =>
        item(

          `
            <b>
              ${x.Person}
            </b>

            •

            ${x.Type}

            <br>

            <small>
              ${x.Date || ""}
              •
              ${x.Purpose || ""}
            </small>
          `,

          money(x.Amount),

          `
            <button
              class="danger"
              onclick="del('transactions','${x.ID}')"
            >
              Delete
            </button>
          `

        )
      )
      .join("") ||
    "<p>No records</p>";

  chart(
    "giveChart",
    "bar",

    balances.map(
      x => x.person
    ),

    balances.map(
      x =>
        Math.abs(
          x.balance
        )
    ),

    "Outstanding"
  );

}

// =========================================================
// INVESTMENTS & SIP
// =========================================================

async function addBasket() {

  const name =
    $("sipPerson").value.trim();

  const basket =
    $("sipBasket").value.trim();

  if (
    !name ||
    !basket
  ) {
    return toast(
      "Enter person and basket"
    );
  }

  let person =
    arr("people").find(
      x =>
        String(x.Name)
          .toLowerCase() ===
        name.toLowerCase()
    );

  if (!person) {

    person =
      await save(
        "people",
        {
          ID: uid(),
          Name: name
        }
      );

  }

  await save(
    "baskets",
    {

      ID:
        uid(),

      "Person ID":
        person.ID,

      "Basket Name":
        basket

    }
  );

  $("sipBasket").value = "";

}

async function addAsset() {

  const basketId =
    $("assetBasket").value;

  const name =
    $("assetName").value.trim();

  const amount =
    num(
      $("assetAmount").value
    );

  if (
    !basketId ||
    !name ||
    amount <= 0
  ) {
    return toast(
      "Complete asset details"
    );
  }

  await save(
    "assets",
    {

      ID:
        uid(),

      "Basket ID":
        basketId,

      "Asset Name":
        name,

      "Asset Type":
        $("assetType").value,

      "Monthly Amount":
        amount

    }
  );

  $("assetName").value = "";

  $("assetAmount").value = "";

}

async function markBasket(
  id,
  total
) {

  const already =
    arr("sipPayments").some(
      x =>
        x["Basket ID"] === id &&
        x.Month === ym()
    );

  if (already) {
    return toast(
      "This basket is already marked paid"
    );
  }

  await save(
    "sipPayments",
    {

      ID:
        uid(),

      "Basket ID":
        id,

      Month:
        ym(),

      Amount:
        total,

      "Paid At":
        new Date()
          .toISOString()

    }
  );

}

function renderInvestments() {

  const baskets =
    arr("baskets");

  const people =
    arr("people");

  const assets =
    arr("assets");

  const payments =
    arr("sipPayments");

  const plan =
    assets.reduce(
      (s, x) =>
        s +
        num(
          x["Monthly Amount"]
        ),
      0
    );

  const paid =
    payments
      .filter(
        x =>
          x.Month === ym()
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  $("investmentDash").innerHTML = [

    [
      "Monthly Planned",
      money(plan)
    ],

    [
      "Paid This Month",
      money(paid)
    ],

    [
      "Pending",
      money(
        Math.max(
          0,
          plan - paid
        )
      )
    ],

    [
      "Baskets",
      baskets.length
    ]

  ]
    .map(
      x =>
        card(
          x[0],
          x[1]
        )
    )
    .join("");

  $("basketList").innerHTML =
    baskets
      .map(b => {

        const person =
          people.find(
            x =>
              x.ID ===
              b["Person ID"]
          );

        const basketAssets =
          assets.filter(
            x =>
              x["Basket ID"] ===
              b.ID
          );

        const total =
          basketAssets.reduce(
            (s, x) =>
              s +
              num(
                x["Monthly Amount"]
              ),
            0
          );

        const paidThisMonth =
          payments.some(
            x =>
              x["Basket ID"] === b.ID &&
              x.Month === ym()
          );

        return `
          <div class="box">

            <h3>
              ${person?.Name || ""}
              —
              ${b["Basket Name"]}
            </h3>

            <b>
              ${money(total)}
              / month
            </b>

            ${basketAssets
              .map(a => `
                <div class="item">

                  <span>

                    <b>
                      ${a["Asset Name"]}
                    </b>

                    <br>

                    <small>
                      ${a["Asset Type"]}
                    </small>

                  </span>

                  <span>

                    ${money(
                      a["Monthly Amount"]
                    )}

                    <button
                      class="danger"
                      onclick="del('assets','${a.ID}')"
                    >
                      Delete
                    </button>

                  </span>

                </div>
              `)
              .join("")
            }

            <div
              style="margin-top:10px"
            >

              ${
                paidThisMonth
                  ? "✓ PAID THIS MONTH"
                  : `
                    <button
                      onclick="markBasket('${b.ID}',${total})"
                    >
                      Mark Paid
                    </button>
                  `
              }

              <button
                class="danger"
                onclick="deleteBasket('${b.ID}')"
              >
                Delete Basket
              </button>

            </div>

          </div>
        `;

      })
      .join("") ||
    "<p>No baskets</p>";

  const byType = {};

  assets.forEach(a => {

    const type =
      a["Asset Type"] ||
      "Other";

    byType[type] =
      (byType[type] || 0) +
      num(
        a["Monthly Amount"]
      );

  });

  chart(
    "investmentChart",
    "doughnut",
    Object.keys(byType),
    Object.values(byType),
    "Monthly SIP"
  );

}

async function deleteBasket(id) {

  if (
    !confirm(
      "Delete this basket and its assets?"
    )
  ) {
    return;
  }

  const assets =
    arr("assets").filter(
      x =>
        x["Basket ID"] === id
    );

  for (
    const asset of assets
  ) {

    await api(
      "delete",
      {
        table: "assets",
        id: asset.ID
      }
    );

  }

  const payments =
    arr("sipPayments").filter(
      x =>
        x["Basket ID"] === id
    );

  for (
    const payment of payments
  ) {

    await api(
      "delete",
      {
        table: "sipPayments",
        id: payment.ID
      }
    );

  }

  await api(
    "delete",
    {
      table: "baskets",
      id
    }
  );

  DB.assets =
    arr("assets").filter(
      x =>
        x["Basket ID"] !== id
    );

  DB.sipPayments =
    arr("sipPayments").filter(
      x =>
        x["Basket ID"] !== id
    );

  DB.baskets =
    arr("baskets").filter(
      x =>
        x.ID !== id
    );

  persist();

  render();

  toast(
    "Basket deleted"
  );

}
// =========================================================
// SALARY
// =========================================================

async function addSalary() {

  const amount =
    num($("salAmount").value);

  if (amount <= 0) {
    return toast(
      "Enter salary amount"
    );
  }

  await save(
    "salary",
    {

      ID:
        uid(),

      Month:
        $("salMonth").value ||
        ym(),

      Company:
        $("salCompany").value.trim() ||
        "Company",

      Amount:
        amount,

      Remarks:
        $("salRemarks").value.trim()

    }
  );

  $("salAmount").value = "";

  $("salRemarks").value = "";

}

function renderSalary() {

  const rows =
    arr("salary")
      .slice()
      .sort(
        (a, b) =>
          String(b.Month)
            .localeCompare(
              String(a.Month)
            )
      );

  const total =
    rows.reduce(
      (s, x) =>
        s + num(x.Amount),
      0
    );

  const current =
    rows
      .filter(
        x => x.Month === ym()
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  $("salaryDash").innerHTML = [

    ["This Month", money(current)],

    ["Total Salary", money(total)],

    ["Entries", rows.length],

    [
      "Companies",
      new Set(
        rows
          .map(x => x.Company)
          .filter(Boolean)
      ).size
    ]

  ]
    .map(
      x => card(
        x[0],
        x[1]
      )
    )
    .join("");

  $("salaryList").innerHTML =
    rows
      .map(
        x =>
          item(
            `${x.Month} • <b>${x.Company}</b><br><small>${x.Remarks || ""}</small>`,

            money(x.Amount),

            `
              <button
                class="danger"
                onclick="del('salary','${x.ID}')"
              >
                Delete
              </button>
            `
          )
      )
      .join("") ||
    "<p>No salary records</p>";

  const map = {};

  rows.forEach(x => {

    map[x.Month] =
      (map[x.Month] || 0) +
      num(x.Amount);

  });

  const labels =
    Object.keys(map).sort();

  chart(
    "salaryChart",
    "line",
    labels,
    labels.map(
      k => map[k]
    ),
    "Salary"
  );

}

// =========================================================
// LOANS + EMI
// =========================================================

async function addLoan() {

  const name =
    $("loanName").value.trim();

  const amount =
    num($("loanInitial").value);

  if (
    !name ||
    amount <= 0
  ) {
    return toast(
      "Enter loan details"
    );
  }

  await save(
    "loans",
    {

      ID:
        uid(),

      "Loan Name":
        name,

      "Initial Amount":
        amount,

      Remarks:
        $("loanRemarks").value.trim()

    }
  );

  $("loanName").value = "";

  $("loanInitial").value = "";

  $("loanRemarks").value = "";

}

async function addEmi() {

  if (
    !$("emiLoan").value
  ) {
    return toast(
      "Select loan"
    );
  }

  const amount =
    num($("emiAmount").value);

  if (amount <= 0) {
    return toast(
      "Enter EMI amount"
    );
  }

  await save(
    "emi",
    {

      ID:
        uid(),

      "Loan ID":
        $("emiLoan").value,

      Month:
        $("emiMonth").value ||
        ym(),

      Amount:
        amount,

      Remarks:
        $("emiRemarks").value.trim()

    }
  );

  $("emiAmount").value = "";

  $("emiRemarks").value = "";

}

function renderLoans() {

  const loans =
    arr("loans");

  const emi =
    arr("emi");

  const initial =
    loans.reduce(
      (s, x) =>
        s +
        num(
          x["Initial Amount"]
        ),
      0
    );

  const paid =
    emi.reduce(
      (s, x) =>
        s + num(x.Amount),
      0
    );

  const paidMonth =
    emi
      .filter(
        x =>
          x.Month === ym()
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  $("loanDash").innerHTML = [

    ["Total Loan", money(initial)],

    ["EMI This Month", money(paidMonth)],

    ["Total EMI Paid", money(paid)],

    [
      "Outstanding",
      money(
        Math.max(
          0,
          initial - paid
        )
      )
    ]

  ]
    .map(
      x => card(
        x[0],
        x[1]
      )
    )
    .join("");

  $("loanList").innerHTML =
    loans
      .map(x => {

        const paidLoan =
          emi
            .filter(
              e =>
                e["Loan ID"] === x.ID
            )
            .reduce(
              (s, e) =>
                s + num(e.Amount),
              0
            );

        return item(

          `
            <b>
              ${x["Loan Name"]}
            </b>

            <br>

            <small>

              Initial
              ${money(x["Initial Amount"])}

              •

              Paid
              ${money(paidLoan)}

              •

              Balance
              ${money(
                Math.max(
                  0,
                  num(x["Initial Amount"]) -
                  paidLoan
                )
              )}

            </small>
          `,

          "",

          `
            <button
              class="danger"
              onclick="del('loans','${x.ID}')"
            >
              Delete
            </button>
          `

        );

      })
      .join("") ||
    "<p>No loans</p>";

  chart(
    "loanChart",
    "doughnut",
    [
      "Initial Loan",
      "EMI Paid"
    ],
    [
      initial,
      paid
    ],
    "Amount"
  );

}

// =========================================================
// GIVE & TAKE
// =========================================================

async function addGive() {

  const person =
    $("gtPerson").value.trim();

  const amount =
    num($("gtAmount").value);

  if (
    !person ||
    amount <= 0
  ) {
    return toast(
      "Enter person and amount"
    );
  }

  await save(
    "transactions",
    {

      ID:
        uid(),

      Person:
        person,

      Type:
        $("gtType").value,

      Amount:
        amount,

      Date:
        $("gtDate").value ||
        today(),

      Purpose:
        $("gtPurpose").value.trim(),

      Notes:
        $("gtNotes").value.trim(),

      Revisions:
        "[]"

    }
  );

  [
    "gtPerson",
    "gtAmount",
    "gtPurpose",
    "gtNotes"
  ].forEach(id => {

    $(id).value = "";

  });

}

function renderGiveTake() {

  const balances =
    Object.values(
      giveBalances()
    );

  const receive =
    balances
      .filter(
        x =>
          x.balance > 0
      )
      .reduce(
        (s, x) =>
          s + x.balance,
        0
      );

  const pay =
    balances
      .filter(
        x =>
          x.balance < 0
      )
      .reduce(
        (s, x) =>
          s +
          Math.abs(
            x.balance
          ),
        0
      );

  $("giveDash").innerHTML = [

    [
      "To Receive",
      money(receive)
    ],

    [
      "To Pay",
      money(pay)
    ],

    [
      "Net",
      money(receive - pay)
    ],

    [
      "People",
      balances.length
    ]

  ]
    .map(
      x =>
        card(
          x[0],
          x[1]
        )
    )
    .join("");

  $("gtDashboard").innerHTML =
    balances
      .map(x =>
        card(
          `
            ${x.person}
            •
            ${
              x.balance > 0
                ? "To Receive"
                : x.balance < 0
                  ? "To Pay"
                  : "Settled"
            }
          `,

          money(
            Math.abs(
              x.balance
            )
          )
        )
      )
      .join("");

  $("gtList").innerHTML =
    arr("transactions")
      .slice()
      .sort(
        (a, b) =>
          String(b.Date)
            .localeCompare(
              String(a.Date)
            )
      )
      .map(x =>
        item(

          `
            <b>
              ${x.Person}
            </b>

            •

            ${x.Type}

            <br>

            <small>
              ${x.Date || ""}
              •
              ${x.Purpose || ""}
            </small>
          `,

          money(x.Amount),

          `
            <button
              class="danger"
              onclick="del('transactions','${x.ID}')"
            >
              Delete
            </button>
          `

        )
      )
      .join("") ||
    "<p>No records</p>";

  chart(
    "giveChart",
    "bar",

    balances.map(
      x => x.person
    ),

    balances.map(
      x =>
        Math.abs(
          x.balance
        )
    ),

    "Outstanding"
  );

}

// =========================================================
// INVESTMENTS & SIP
// =========================================================

async function addBasket() {

  const name =
    $("sipPerson").value.trim();

  const basket =
    $("sipBasket").value.trim();

  if (
    !name ||
    !basket
  ) {
    return toast(
      "Enter person and basket"
    );
  }

  let person =
    arr("people").find(
      x =>
        String(x.Name)
          .toLowerCase() ===
        name.toLowerCase()
    );

  if (!person) {

    person =
      await save(
        "people",
        {
          ID: uid(),
          Name: name
        }
      );

  }

  await save(
    "baskets",
    {

      ID:
        uid(),

      "Person ID":
        person.ID,

      "Basket Name":
        basket

    }
  );

  $("sipBasket").value = "";

}

async function addAsset() {

  const basketId =
    $("assetBasket").value;

  const name =
    $("assetName").value.trim();

  const amount =
    num(
      $("assetAmount").value
    );

  if (
    !basketId ||
    !name ||
    amount <= 0
  ) {
    return toast(
      "Complete asset details"
    );
  }

  await save(
    "assets",
    {

      ID:
        uid(),

      "Basket ID":
        basketId,

      "Asset Name":
        name,

      "Asset Type":
        $("assetType").value,

      "Monthly Amount":
        amount

    }
  );

  $("assetName").value = "";

  $("assetAmount").value = "";

}

async function markBasket(
  id,
  total
) {

  const already =
    arr("sipPayments").some(
      x =>
        x["Basket ID"] === id &&
        x.Month === ym()
    );

  if (already) {
    return toast(
      "This basket is already marked paid"
    );
  }

  await save(
    "sipPayments",
    {

      ID:
        uid(),

      "Basket ID":
        id,

      Month:
        ym(),

      Amount:
        total,

      "Paid At":
        new Date()
          .toISOString()

    }
  );

}

function renderInvestments() {

  const baskets =
    arr("baskets");

  const people =
    arr("people");

  const assets =
    arr("assets");

  const payments =
    arr("sipPayments");

  const plan =
    assets.reduce(
      (s, x) =>
        s +
        num(
          x["Monthly Amount"]
        ),
      0
    );

  const paid =
    payments
      .filter(
        x =>
          x.Month === ym()
      )
      .reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      );

  $("investmentDash").innerHTML = [

    [
      "Monthly Planned",
      money(plan)
    ],

    [
      "Paid This Month",
      money(paid)
    ],

    [
      "Pending",
      money(
        Math.max(
          0,
          plan - paid
        )
      )
    ],

    [
      "Baskets",
      baskets.length
    ]

  ]
    .map(
      x =>
        card(
          x[0],
          x[1]
        )
    )
    .join("");

  $("basketList").innerHTML =
    baskets
      .map(b => {

        const person =
          people.find(
            x =>
              x.ID ===
              b["Person ID"]
          );

        const basketAssets =
          assets.filter(
            x =>
              x["Basket ID"] ===
              b.ID
          );

        const total =
          basketAssets.reduce(
            (s, x) =>
              s +
              num(
                x["Monthly Amount"]
              ),
            0
          );

        const paidThisMonth =
          payments.some(
            x =>
              x["Basket ID"] === b.ID &&
              x.Month === ym()
          );

        return `
          <div class="box">

            <h3>
              ${person?.Name || ""}
              —
              ${b["Basket Name"]}
            </h3>

            <b>
              ${money(total)}
              / month
            </b>

            ${basketAssets
              .map(a => `
                <div class="item">

                  <span>

                    <b>
                      ${a["Asset Name"]}
                    </b>

                    <br>

                    <small>
                      ${a["Asset Type"]}
                    </small>

                  </span>

                  <span>

                    ${money(
                      a["Monthly Amount"]
                    )}

                    <button
                      class="danger"
                      onclick="del('assets','${a.ID}')"
                    >
                      Delete
                    </button>

                  </span>

                </div>
              `)
              .join("")
            }

            <div
              style="margin-top:10px"
            >

              ${
                paidThisMonth
                  ? "✓ PAID THIS MONTH"
                  : `
                    <button
                      onclick="markBasket('${b.ID}',${total})"
                    >
                      Mark Paid
                    </button>
                  `
              }

              <button
                class="danger"
                onclick="deleteBasket('${b.ID}')"
              >
                Delete Basket
              </button>

            </div>

          </div>
        `;

      })
      .join("") ||
    "<p>No baskets</p>";

  const byType = {};

  assets.forEach(a => {

    const type =
      a["Asset Type"] ||
      "Other";

    byType[type] =
      (byType[type] || 0) +
      num(
        a["Monthly Amount"]
      );

  });

  chart(
    "investmentChart",
    "doughnut",
    Object.keys(byType),
    Object.values(byType),
    "Monthly SIP"
  );

}

async function deleteBasket(id) {

  if (
    !confirm(
      "Delete this basket and its assets?"
    )
  ) {
    return;
  }

  const assets =
    arr("assets").filter(
      x =>
        x["Basket ID"] === id
    );

  for (
    const asset of assets
  ) {

    await api(
      "delete",
      {
        table: "assets",
        id: asset.ID
      }
    );

  }

  const payments =
    arr("sipPayments").filter(
      x =>
        x["Basket ID"] === id
    );

  for (
    const payment of payments
  ) {

    await api(
      "delete",
      {
        table: "sipPayments",
        id: payment.ID
      }
    );

  }

  await api(
    "delete",
    {
      table: "baskets",
      id
    }
  );

  DB.assets =
    arr("assets").filter(
      x =>
        x["Basket ID"] !== id
    );

  DB.sipPayments =
    arr("sipPayments").filter(
      x =>
        x["Basket ID"] !== id
    );

  DB.baskets =
    arr("baskets").filter(
      x =>
        x.ID !== id
    );

  persist();

  render();

  toast(
    "Basket deleted"
  );

}
// =========================================================
// MONEY SPLITTER
// =========================================================

function members(group) {

  try {

    return JSON.parse(
      group["Members JSON"] ||
      "[]"
    );

  } catch (e) {

    return [];

  }

}

function jsonValue(
  value,
  fallback
) {

  try {

    return JSON.parse(
      value || ""
    );

  } catch (e) {

    return fallback;

  }

}

async function addGroup() {

  const name =
    $("spGroup").value.trim();

  const groupMembers =
    $("spMembers").value
      .split(",")
      .map(
        x => x.trim()
      )
      .filter(Boolean);

  if (
    !name ||
    groupMembers.length < 2
  ) {
    return toast(
      "Enter group and minimum 2 members"
    );
  }

  const record =
    await save(
      "splitGroups",
      {

        ID:
          uid(),

        "Group Name":
          name,

        Category:
          $("spCat").value,

        "Members JSON":
          JSON.stringify(
            [
              ...new Set(
                groupMembers
              )
            ]
          )

      }
    );

  $("spGroup").value = "";

  $("spMembers").value = "";

  if ($("spGroupSel")) {
    $("spGroupSel").value =
      record.ID;
  }

  if ($("spGroupExpense")) {
    $("spGroupExpense").value =
      record.ID;
  }

  render();

}

async function addMember() {

  const group =
    arr("splitGroups").find(
      x =>
        x.ID ===
        $("spGroupSel").value
    );

  const member =
    $("newMember").value.trim();

  if (
    !group ||
    !member
  ) {
    return toast(
      "Select group and enter member"
    );
  }

  const list =
    members(group);

  if (
    list.includes(member)
  ) {
    return toast(
      "Member already exists"
    );
  }

  await save(
    "splitGroups",
    {

      ...group,

      "Members JSON":
        JSON.stringify(
          [
            ...list,
            member
          ]
        )

    }
  );

  $("newMember").value = "";

}

async function renameGroup() {

  const group =
    arr("splitGroups").find(
      x =>
        x.ID ===
        $("spGroupSel").value
    );

  if (!group) return;

  const name =
    prompt(
      "New group name",
      group["Group Name"]
    );

  if (!name?.trim()) return;

  await save(
    "splitGroups",
    {

      ...group,

      "Group Name":
        name.trim()

    }
  );

}

function renderCustomShares() {

  const container =
    $("customShares");

  if (!container) return;

  if (
    $("spSplitType").value !==
    "custom"
  ) {

    container.innerHTML = "";

    return;

  }

  const group =
    arr("splitGroups").find(
      x =>
        x.ID ===
        $("spGroupExpense").value
    );

  if (!group) return;

  let participants =
    $("spMembersSel").value
      .split(",")
      .map(
        x => x.trim()
      )
      .filter(Boolean);

  if (!participants.length) {

    participants =
      members(group);

  }

  container.innerHTML =
    participants
      .map(
        name => `
          <div class="share">

            <span>
              ${name}
            </span>

            <input
              class="customShare"
              data-member="${name}"
              type="number"
              placeholder="Amount"
            >

          </div>
        `
      )
      .join("");

}

function calculateGroup(group) {

  const groupMembers =
    members(group);

  const stats = {};

  groupMembers.forEach(name => {

    stats[name] = {

      name,

      paid: 0,

      share: 0,

      settledOut: 0,

      settledIn: 0,

      net: 0

    };

  });

  const expenses =
    arr("splitExpenses")
      .filter(
        x =>
          x["Group ID"] ===
          group.ID
      );

  expenses.forEach(expense => {

    const amount =
      num(expense.Amount);

    const payer =
      expense["Paid By"];

    if (!stats[payer]) {

      stats[payer] = {

        name: payer,

        paid: 0,

        share: 0,

        settledOut: 0,

        settledIn: 0,

        net: 0

      };

    }

    stats[payer].paid +=
      amount;

    let participants =
      jsonValue(
        expense["Members JSON"],
        []
      );

    if (!participants.length) {

      participants =
        groupMembers;

    }

    const custom =
      jsonValue(
        expense[
          "Custom Shares JSON"
        ],
        null
      );

    participants.forEach(name => {

      if (!stats[name]) {

        stats[name] = {

          name,

          paid: 0,

          share: 0,

          settledOut: 0,

          settledIn: 0,

          net: 0

        };

      }

      stats[name].share +=
        custom
          ? num(custom[name])
          : (
              participants.length
                ? amount /
                  participants.length
                : 0
            );

    });

  });

  arr("splitSettlements")
    .filter(
      x =>
        x["Group ID"] ===
        group.ID
    )
    .forEach(s => {

      if (stats[s.From]) {

        stats[s.From]
          .settledOut +=
          num(s.Amount);

      }

      if (stats[s.To]) {

        stats[s.To]
          .settledIn +=
          num(s.Amount);

      }

    });

  Object
    .values(stats)
    .forEach(x => {

      x.net =
        x.paid -
        x.share +
        x.settledOut -
        x.settledIn;

    });

  return {

    expenses,

    stats:
      Object.values(stats),

    total:
      expenses.reduce(
        (s, x) =>
          s + num(x.Amount),
        0
      )

  };

}

function settlements(stats) {

  const creditors =
    stats
      .filter(
        x =>
          x.net > 0.01
      )
      .map(
        x => ({
          name: x.name,
          amount: x.net
        })
      );

  const debtors =
    stats
      .filter(
        x =>
          x.net < -0.01
      )
      .map(
        x => ({
          name: x.name,
          amount: -x.net
        })
      );

  const result = [];

  let i = 0;

  let j = 0;

  while (
    i < debtors.length &&
    j < creditors.length
  ) {

    const amount =
      Math.min(
        debtors[i].amount,
        creditors[j].amount
      );

    result.push({

      from:
        debtors[i].name,

      to:
        creditors[j].name,

      amount

    });

    debtors[i].amount -=
      amount;

    creditors[j].amount -=
      amount;

    if (
      debtors[i].amount < 0.01
    ) {
      i++;
    }

    if (
      creditors[j].amount < 0.01
    ) {
      j++;
    }

  }

  return result;

}

async function saveSplitExpense() {

  const group =
    arr("splitGroups").find(
      x =>
        x.ID ===
        $("spGroupExpense").value
    );

  const amount =
    num(
      $("spAmount").value
    );

  const payer =
    $("spPaidBy").value;

  if (
    !group ||
    amount <= 0 ||
    !payer
  ) {

    return toast(
      "Select group, payer and amount"
    );

  }

  let participants =
    $("spMembersSel").value
      .split(",")
      .map(
        x => x.trim()
      )
      .filter(Boolean);

  if (!participants.length) {

    participants =
      members(group);

  }

  let customShares = "";

  if (
    $("spSplitType").value ===
    "custom"
  ) {

    const custom = {};

    document
      .querySelectorAll(
        ".customShare"
      )
      .forEach(input => {

        custom[
          input.dataset.member
        ] =
          num(
            input.value
          );

      });

    const total =
      Object
        .values(custom)
        .reduce(
          (s, x) =>
            s + num(x),
          0
        );

    if (
      Math.abs(
        total - amount
      ) > 0.01
    ) {

      return toast(
        "Custom shares total must equal expense amount"
      );

    }

    customShares =
      JSON.stringify(
        custom
      );

  }

  await save(
    "splitExpenses",
    {

      ID:
        $("splitEditId").value ||
        uid(),

      "Group ID":
        group.ID,

      Title:
        $("spTitle").value.trim() ||
        "Expense",

      Amount:
        amount,

      "Paid By":
        payer,

      "Members JSON":
        JSON.stringify(
          participants
        ),

      "Custom Shares JSON":
        customShares,

      Date:
        $("spDate").value ||
        today()

    }
  );

  clearSplit();

}

function editExpense(id) {

  const expense =
    arr("splitExpenses").find(
      x =>
        x.ID === id
    );

  if (!expense) return;

  $("splitEditId").value =
    expense.ID;

  $("spGroupExpense").value =
    expense["Group ID"];

  $("spGroupSel").value =
    expense["Group ID"];

  $("spTitle").value =
    expense.Title;

  $("spAmount").value =
    expense.Amount;

  $("spPaidBy").value =
    expense["Paid By"];

  $("spDate").value =
    expense.Date;

  $("spMembersSel").value =
    jsonValue(
      expense["Members JSON"],
      []
    ).join(", ");

  const custom =
    jsonValue(
      expense[
        "Custom Shares JSON"
      ],
      null
    );

  $("spSplitType").value =
    custom
      ? "custom"
      : "equal";

  renderCustomShares();

  if (custom) {

    document
      .querySelectorAll(
        ".customShare"
      )
      .forEach(input => {

        input.value =
          num(
            custom[
              input.dataset.member
            ]
          );

      });

  }

}

function clearSplit() {

  $("splitEditId").value = "";

  $("spTitle").value = "";

  $("spAmount").value = "";

  $("spMembersSel").value = "";

  $("spDate").value =
    today();

  $("spSplitType").value =
    "equal";

  $("customShares").innerHTML =
    "";

}

async function settleNow(
  groupId,
  from,
  to,
  amount
) {

  if (
    !confirm(
      `${from} paid ${money(amount)} to ${to}?`
    )
  ) {
    return;
  }

  await save(
    "splitSettlements",
    {

      ID:
        uid(),

      "Group ID":
        groupId,

      From:
        from,

      To:
        to,

      Amount:
        amount,

      Date:
        today(),

      Notes:
        "Settlement"

    }
  );

}
