const API_URL =
  "https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";

let DB = {};
let charts = {};

// =================================================
// BASIC HELPERS
// =================================================

const $ = id => document.getElementById(id);

const today = () => new Date().toISOString().slice(0, 10);

const monthNow = () => new Date().toISOString().slice(0, 7);

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = v =>
  "₹" + num(v).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });

const esc = v =>
  String(v ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));

const val = id => ($(id)?.value || "").trim();

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function monthOf(v) {
  return String(v || "").slice(0, 7);
}

function displayDate(v) {
  if (!v) return "";

  const s = String(v);

  if (s.includes("T")) {
    return s.slice(0, 10);
  }

  return s;
}


// =================================================
// TOAST / STATUS
// =================================================

function toast(msg, ms = 3000) {

  const t = $("toast");

  if (!t) return;

  t.textContent = msg;

  t.classList.add("show");

  clearTimeout(window._toast);

  window._toast = setTimeout(() => {
    t.classList.remove("show");
  }, ms);
}


function setStatus(text) {

  const el = $("status");

  if (el) {
    el.textContent = text;
  }
}


// =================================================
// API
// =================================================

function apiReady() {

  return (
    API_URL &&
    API_URL.startsWith("https://script.google.com/")
  );
}


async function fetchWithTimeout(url, options = {}, timeout = 25000) {

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {

    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    return response;

  } finally {

    clearTimeout(timer);

  }
}


async function api(action, payload = {}) {

  if (!apiReady()) {

    throw new Error(
      "Google Apps Script Web App URL is missing or invalid"
    );

  }


  const response = await fetchWithTimeout(
    API_URL,
    {
      method: "POST",

      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },

      body: JSON.stringify({
        action,
        ...payload
      })
    }
  );


  if (!response.ok) {

    throw new Error(
      "Cloud server error: " + response.status
    );

  }


  const text = await response.text();

  let data;

  try {

    data = JSON.parse(text);

  } catch (err) {

    console.error("Invalid API response:", text);

    throw new Error(
      "Invalid response from Google Apps Script"
    );

  }


  if (!data.success) {

    throw new Error(
      data.error || "Cloud request failed"
    );

  }


  return data;
}


// =================================================
// LOAD CLOUD DATA
// =================================================

async function loadAll() {

  if (!apiReady()) {

    setStatus("⚠️ API URL required");

    toast("Check API URL in app.js");

    renderAll();

    return;
  }


  try {

    setStatus("☁️ Syncing...");


    const response = await fetchWithTimeout(
      API_URL + "?action=loadAll&_=" + Date.now(),
      {
        method: "GET",
        cache: "no-store"
      },
      25000
    );


    if (!response.ok) {

      throw new Error(
        "Cloud server error: " + response.status
      );

    }


    const text = await response.text();

    let result;

    try {

      result = JSON.parse(text);

    } catch (err) {

      console.error(text);

      throw new Error(
        "Invalid response from Google Apps Script"
      );

    }


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
    ].forEach(key => {

      if (!Array.isArray(DB[key])) {
        DB[key] = [];
      }

    });


    setStatus("☁️ Synced");


    renderAll();


  } catch (err) {

    console.error("LOAD ERROR:", err);

    setStatus("⚠️ Sync failed");

    toast(err.message || "Cloud connection failed");

    renderAll();

  }

}


// =================================================
// SAVE / DELETE
// =================================================

async function save(table, data) {

  const result = await api(
    "save",
    {
      table,
      data
    }
  );


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

  if (!confirm("Delete this record?")) {
    return;
  }


  try {

    await api(
      "delete",
      {
        table,
        id
      }
    );


    DB[table] =
      (DB[table] || []).filter(
        x => String(x.ID) !== String(id)
      );


    renderAll();

    toast("Deleted successfully");


  } catch (err) {

    console.error(err);

    toast(err.message);

  }

}


// =================================================
// GENERAL UI HELPERS
// =================================================

function card(label, value) {

  return `
    <div>
      <small>${esc(label)}</small>
      <b>${value}</b>
    </div>
  `;
}


function opt(
  el,
  arr,
  textFn = x => x,
  valueFn = x => x,
  placeholder = "Select"
) {

  if (!el) return;


  const current = el.value;


  el.innerHTML =
    `<option value="">${esc(placeholder)}</option>` +
    arr.map(x => `
      <option value="${esc(valueFn(x))}">
        ${esc(textFn(x))}
      </option>
    `).join("");


  const exists = arr.some(
    x => String(valueFn(x)) === String(current)
  );


  if (exists) {

    el.value = current;

  }

}


// =================================================
// CHART
// =================================================

function chart(id, type, data, options = {}) {

  if (!window.Chart) return;


  const el = $(id);

  if (!el) return;


  if (charts[id]) {

    charts[id].destroy();

  }


  charts[id] = new Chart(
    el,
    {
      type,
      data,

      options: {
        responsive: true,
        maintainAspectRatio: false,
        ...options
      }
    }
  );

}


// =================================================
// RENDER ALL
// =================================================

function renderAll() {

  renderDashboard();

  renderPassbook();

  renderSalary();

  renderLoans();

  renderGive();

  renderSplitter();

  renderInvestments();

  fillLists();

  renderVehicles();

}


// =================================================
// DASHBOARD
// =================================================

function renderDashboard() {

  const m = val("dashMonth");

  const c = val("dashCategory");


  const pb =
    (DB.passbook || []).filter(x =>
      (!m || monthOf(x.Date) === m) &&
      (!c || x.Category === c)
    );


  const income =
    pb
      .filter(x => x.Type === "Income")
      .reduce(
        (s, x) => s + num(x.Amount),
        0
      );


  const expense =
    pb
      .filter(x => x.Type === "Expense")
      .reduce(
        (s, x) => s + num(x.Amount),
        0
      );


  const salary =
    (DB.salary || [])
      .filter(
        x => !m || String(x.Month) === m
      )
      .reduce(
        (s, x) => s + num(x.Amount),
        0
      );


  const emi =
    (DB.emi || [])
      .filter(
        x => !m || String(x.Month) === m
      )
      .reduce(
        (s, x) => s + num(x.Amount),
        0
      );


  let toReceive = 0;

  let toPay = 0;


  (DB.transactions || []).forEach(x => {

    if (x.Type === "Pending to Take") {
      toReceive += num(x.Amount);
    }

    if (x.Type === "Received") {
      toReceive -= num(x.Amount);
    }

    if (x.Type === "Pending to Pay") {
      toPay += num(x.Amount);
    }

    if (x.Type === "Paid") {
      toPay -= num(x.Amount);
    }

  });


  $("dash").innerHTML = [

    card("💰 Salary", fmt(salary)),

    card("📈 Total Income", fmt(income)),

    card("💸 Expense", fmt(expense)),

    card("🏦 EMI Paid", fmt(emi)),

    card("📉 SIP Paid", "₹0"),

    card(
      "🤝 To Receive",
      fmt(Math.max(0, toReceive))
    ),

    card(
      "🤝 To Pay",
      fmt(Math.max(0, toPay))
    ),

    card(
      "💳 Net",
      fmt(income - expense - emi)
    )

  ].join("");


  const months =
    unique(
      (DB.passbook || [])
        .map(x => monthOf(x.Date))
    ).sort();


  const inc =
    months.map(mm =>
      (DB.passbook || [])
        .filter(
          x =>
            monthOf(x.Date) === mm &&
            x.Type === "Income"
        )
        .reduce(
          (s, x) => s + num(x.Amount),
          0
        )
    );


  const exp =
    months.map(mm =>
      (DB.passbook || [])
        .filter(
          x =>
            monthOf(x.Date) === mm &&
            x.Type === "Expense"
        )
        .reduce(
          (s, x) => s + num(x.Amount),
          0
        )
    );


  chart(
    "mainChart",
    "bar",
    {
      labels: months,

      datasets: [
        {
          label: "Income",
          data: inc
        },
        {
          label: "Expense",
          data: exp
        }
      ]
    }
  );


  const cats =
    unique(
      pb
        .filter(
          x => x.Type === "Expense"
        )
        .map(
          x => x.Category || "Other"
        )
    );


  chart(
    "expenseChart",
    "doughnut",
    {
      labels: cats,

      datasets: [
        {
          data:
            cats.map(cat =>
              pb
                .filter(
                  x =>
                    x.Type === "Expense" &&
                    (x.Category || "Other") === cat
                )
                .reduce(
                  (s, x) => s + num(x.Amount),
                  0
                )
            )
        }
      ]
    }
  );

}


function resetDashFilters() {

  $("dashMonth").value = "";

  $("dashCategory").value = "";

  renderDashboard();

}


// =================================================
// PASSBOOK
// =================================================

function renderPassbook() {

  const month = val("pbFilterMonth");

  const cat = val("pbFilterCategory");


  const rows =
    (DB.passbook || [])
      .filter(x =>
        (!month || monthOf(x.Date) === month) &&
        (!cat || x.Category === cat)
      )
      .sort(
        (a, b) =>
          String(b.Date)
            .localeCompare(String(a.Date))
      );


  const income =
    rows
      .filter(x => x.Type === "Income")
      .reduce(
        (s, x) => s + num(x.Amount),
        0
      );


  const expense =
    rows
      .filter(x => x.Type === "Expense")
      .reduce(
        (s, x) => s + num(x.Amount),
        0
      );


  $("passbookDash").innerHTML =
    card("Income", fmt(income)) +
    card("Expense", fmt(expense)) +
    card("Balance", fmt(income - expense));


  $("pbList").innerHTML =
    rows.map(x => `
      <div class="item">

        <div>

          <b>
            ${esc(x.Category || "Uncategorized")}
            •
            ${esc(x.Type)}
          </b>

          <br>

          <small>
            ${esc(displayDate(x.Date))}
            •
            ${esc(x.Account || "")}
            ${
              x.Remarks
                ? " • " + esc(x.Remarks)
                : ""
            }
          </small>

        </div>

        <div>

          <b>${fmt(x.Amount)}</b>

          <br>

          <button
            class="danger"
            onclick="del('passbook','${x.ID}')"
          >
            Delete
          </button>

        </div>

      </div>
    `).join("")
    ||
    "<p class='muted'>No entries</p>";


  const cats =
    unique(
      rows.map(
        x => x.Category || "Other"
      )
    );


  chart(
    "passbookChart",
    "bar",
    {
      labels: cats,

      datasets: [
        {
          label: "Amount",

          data:
            cats.map(c =>
              rows
                .filter(
                  x =>
                    (x.Category || "Other") === c
                )
                .reduce(
                  (s, x) => s + num(x.Amount),
                  0
                )
            )
        }
      ]
    }
  );

}


async function addPassbook() {

  if (
    !val("pbDate") ||
    !val("pbCat") ||
    !num(val("pbAmt"))
  ) {

    return toast(
      "Date, category and amount are required"
    );

  }


  try {

    await save(
      "passbook",
      {
        ID: val("pbEditId"),

        Date: val("pbDate"),

        Type: val("pbType"),

        Category: val("pbCat"),

        Amount: num(val("pbAmt")),

        Account: val("pbAccount"),

        Remarks: val("pbRemarks")
      }
    );


    clearPassbook();

    renderAll();

    toast("Saved to cloud");


  } catch (err) {

    toast(err.message);

  }

}


function clearPassbook() {

  [
    "pbEditId",
    "pbCat",
    "pbAmt",
    "pbAccount",
    "pbRemarks"
  ].forEach(id => {

    $(id).value = "";

  });


  $("pbDate").value = today();

  $("pbType").value = "Expense";

}


function resetPassbookFilters() {

  $("pbFilterMonth").value = "";

  $("pbFilterCategory").value = "";

  renderPassbook();

}


// =================================================
// SALARY
// =================================================

function renderSalary() {

  const rows =
    (DB.salary || [])
      .slice()
      .sort(
        (a, b) =>
          String(b.Month)
            .localeCompare(String(a.Month))
      );


  $("salaryDash").innerHTML =
    card(
      "Total Salary",
      fmt(
        rows.reduce(
          (s, x) => s + num(x.Amount),
          0
        )
      )
    ) +
    card(
      "Latest",
      fmt(rows[0]?.Amount || 0)
    );


  $("salaryList").innerHTML =
    rows.map(x => `
      <div class="item">

        <div>

          <b>
            ${esc(x.Company || "Salary")}
          </b>

          <br>

          <small>
            ${esc(x.Month)}
            ${
              x.Remarks
                ? " • " + esc(x.Remarks)
                : ""
            }
          </small>

        </div>

        <div>

          <b>${fmt(x.Amount)}</b>

          <br>

          <button
            class="danger"
            onclick="del('salary','${x.ID}')"
          >
            Delete
          </button>

        </div>

      </div>
    `).join("")
    ||
    "<p class='muted'>No salary records</p>";


  chart(
    "salaryChart",
    "line",
    {
      labels:
        rows
          .slice()
          .reverse()
          .map(x => x.Month),

      datasets: [
        {
          label: "Salary",

          data:
            rows
              .slice()
              .reverse()
              .map(
                x => num(x.Amount)
              )
        }
      ]
    }
  );

}


async function addSalary() {

  if (
    !val("salMonth") ||
    !num(val("salAmount"))
  ) {

    return toast(
      "Month and amount required"
    );

  }


  try {

    await save(
      "salary",
      {
        Month: val("salMonth"),

        Company: val("salCompany"),

        Amount: num(val("salAmount")),

        Remarks: val("salRemarks")
      }
    );


    [
      "salCompany",
      "salAmount",
      "salRemarks"
    ].forEach(
      id => $(id).value = ""
    );


    renderAll();

    toast("Salary saved");


  } catch (err) {

    toast(err.message);

  }

}


// =================================================
// LOANS
// =================================================

function renderLoans() {

  const loans = DB.loans || [];

  const emi = DB.emi || [];


  const total =
    loans.reduce(
      (s, x) =>
        s + num(x["Initial Amount"]),
      0
    );


  const paid =
    emi.reduce(
      (s, x) => s + num(x.Amount),
      0
    );


  $("loanDash").innerHTML =
    card("Total Loan", fmt(total)) +
    card("EMI Paid", fmt(paid)) +
    card(
      "Remaining",
      fmt(Math.max(0, total - paid))
    );


  $("loanList").innerHTML =
    loans.map(l => {

      const p =
        emi
          .filter(
            e =>
              String(e["Loan ID"]) ===
              String(l.ID)
          )
          .reduce(
            (s, e) =>
              s + num(e.Amount),
            0
          );


      return `
        <div class="item">

          <div>

            <b>
              ${esc(l["Loan Name"])}
            </b>

            <br>

            <small>
              ${esc(l.Remarks || "")}
            </small>

          </div>

          <div>

            Initial:
            <b>
              ${fmt(l["Initial Amount"])}
            </b>

            <br>

            Paid:
            ${fmt(p)}

            <br>

            <button
              class="danger"
              onclick="del('loans','${l.ID}')"
            >
              Delete
            </button>

          </div>

        </div>
      `;

    }).join("")
    ||
    "<p class='muted'>No loans</p>";


  chart(
    "loanChart",
    "bar",
    {
      labels:
        loans.map(
          x => x["Loan Name"]
        ),

      datasets: [
        {
          label: "Initial Amount",

          data:
            loans.map(
              x =>
                num(x["Initial Amount"])
            )
        },
        {
          label: "Paid",

          data:
            loans.map(l =>
              emi
                .filter(
                  e =>
                    String(e["Loan ID"]) ===
                    String(l.ID)
                )
                .reduce(
                  (s, e) =>
                    s + num(e.Amount),
                  0
                )
            )
        }
      ]
    }
  );

}


async function addLoan() {

  if (
    !val("loanName") ||
    !num(val("loanInitial"))
  ) {

    return toast(
      "Loan name and amount required"
    );

  }


  try {

    await save(
      "loans",
      {
        "Loan Name": val("loanName"),

        "Initial Amount":
          num(val("loanInitial")),

        Remarks:
          val("loanRemarks")
      }
    );


    [
      "loanName",
      "loanInitial",
      "loanRemarks"
    ].forEach(
      id => $(id).value = ""
    );


    renderAll();

    toast("Loan added");


  } catch (err) {

    toast(err.message);

  }

}


async function addEmi() {

  if (
    !val("emiLoan") ||
    !val("emiMonth") ||
    !num(val("emiAmount"))
  ) {

    return toast(
      "Select loan, month and amount"
    );

  }


  try {

    await save(
      "emi",
      {
        "Loan ID":
          val("emiLoan"),

        Month:
          val("emiMonth"),

        Amount:
          num(val("emiAmount")),

        Remarks:
          val("emiRemarks")
      }
    );


    $("emiAmount").value = "";

    $("emiRemarks").value = "";


    renderAll();

    toast("EMI saved");


  } catch (err) {

    toast(err.message);

  }

}


// =================================================
// GIVE & TAKE
// =================================================

function renderGive() {

  const rows =
    DB.transactions || [];


  let toReceive = 0;

  let toPay = 0;


  rows.forEach(x => {

    const amount =
      num(x.Amount);


    if (x.Type === "Pending to Take") {
      toReceive += amount;
    }

    if (x.Type === "Received") {
      toReceive -= amount;
    }

    if (x.Type === "Pending to Pay") {
      toPay += amount;
    }

    if (x.Type === "Paid") {
      toPay -= amount;
    }

  });


  $("giveDash").innerHTML =
    card(
      "📥 To Receive",
      fmt(Math.max(0, toReceive))
    ) +
    card(
      "📤 To Pay",
      fmt(Math.max(0, toPay))
    );


  const persons =
    unique(
      rows.map(x => x.Person)
    );


  const receiveData =
    persons.map(person => {

      let balance = 0;


      rows
        .filter(
          x => x.Person === person
        )
        .forEach(x => {

          if (
            x.Type ===
            "Pending to Take"
          ) {

            balance +=
              num(x.Amount);

          }

          if (
            x.Type ===
            "Received"
          ) {

            balance -=
              num(x.Amount);

          }

        });


      return Math.max(0, balance);

    });


  const payData =
    persons.map(person => {

      let balance = 0;


      rows
        .filter(
          x => x.Person === person
        )
        .forEach(x => {

          if (
            x.Type ===
            "Pending to Pay"
          ) {

            balance +=
              num(x.Amount);

          }

          if (
            x.Type ===
            "Paid"
          ) {

            balance -=
              num(x.Amount);

          }

        });


      return Math.max(0, balance);

    });


  $("gtList").innerHTML =
    rows
      .slice()
      .sort(
        (a, b) =>
          String(b.Date)
            .localeCompare(String(a.Date))
      )
      .slice(0, 10)
      .map(x => `
        <div class="item">

          <div>

            <b>
              ${esc(x.Person)}
              •
              ${esc(x.Type)}
            </b>

            <br>

            <small>
              ${esc(displayDate(x.Date))}
              •
              ${esc(x.Purpose || "")}
              ${
                x.Notes
                  ? " • " + esc(x.Notes)
                  : ""
              }
            </small>

          </div>

          <div>

            <b>${fmt(x.Amount)}</b>

            <br>

            <button
              class="danger"
              onclick="del('transactions','${x.ID}')"
            >
              Delete
            </button>

          </div>

        </div>
      `).join("")
      ||
      "<p class='muted'>No records</p>";


  chart(
    "giveChart",
    "bar",
    {
      labels: persons,

      datasets: [
        {
          label: "To Receive",
          data: receiveData
        },
        {
          label: "To Pay",
          data: payData
        }
      ]
    }
  );

}


async function addGive() {

  if (
    !val("gtPerson") ||
    !num(val("gtAmount"))
  ) {

    return toast(
      "Person and amount required"
    );

  }


  try {

    await save(
      "transactions",
      {
        Person:
          val("gtPerson"),

        Type:
          val("gtType"),

        Amount:
          num(val("gtAmount")),

        Date:
          val("gtDate") || today(),

        Purpose:
          val("gtPurpose"),

        Notes:
          val("gtNotes")
      }
    );


    [
      "gtPerson",
      "gtAmount",
      "gtPurpose",
      "gtNotes"
    ].forEach(
      id => $(id).value = ""
    );


    renderAll();

    toast("Saved");


  } catch (err) {

    toast(err.message);

  }

}


// =================================================
// MONEY SPLITTER
// =================================================

function parseJSON(v, fallback = []) {

  try {

    return typeof v === "string"
      ? JSON.parse(v)
      : v || fallback;

  } catch (err) {

    return fallback;

  }

}


function groupById(id) {

  return (DB.splitGroups || [])
    .find(
      x =>
        String(x.ID) ===
        String(id)
    );

}


function renderSplitter() {

  const groups =
    DB.splitGroups || [];


  [
    "spGroupSel",
    "spGroupExpense"
  ].forEach(id =>
    opt(
      $(id),
      groups,
      g => g["Group Name"],
      g => g.ID,
      "Select group"
    )
  );


  const gid =
    val("spGroupSel") ||
    val("spGroupExpense");


  const g =
    groupById(gid);


  const members =
    g
      ? parseJSON(
          g["Members JSON"],
          []
        )
      : [];


  opt(
    $("spPaidBy"),
    members,
    x => x,
    x => x,
    "Paid by"
  );


  $("memberChips").innerHTML =
    members.map(m => `
      <span class="chip">
        ${esc(m)}
      </span>
    `).join("");


  const exps =
    (DB.splitExpenses || [])
      .filter(
        x =>
          !gid ||
          String(x["Group ID"]) ===
          String(gid)
      );


  $("splitExpenseList").innerHTML =
    exps.map(x => `
      <div class="item">

        <div>

          <b>${esc(x.Title)}</b>

          <br>

          <small>
            ${esc(displayDate(x.Date))}
            • Paid by
            ${esc(x["Paid By"])}
          </small>

        </div>

        <div>

          <b>${fmt(x.Amount)}</b>

          <br>

          <button
            class="danger"
            onclick="del('splitExpenses','${x.ID}')"
          >
            Delete
          </button>

        </div>

      </div>
    `).join("")
    ||
    "<p class='muted'>No expenses</p>";


  const balances = {};


  members.forEach(
    m => balances[m] = 0
  );


  exps.forEach(x => {

    const participants =
      parseJSON(
        x["Members JSON"],
        members
      );


    const custom =
      parseJSON(
        x["Custom Shares JSON"],
        {}
      );


    balances[x["Paid By"]] =
      (balances[x["Paid By"]] || 0) +
      num(x.Amount);


    participants.forEach(m => {

      balances[m] =
        (balances[m] || 0) -
        (
          num(custom[m]) ||
          num(x.Amount) /
            Math.max(
              1,
              participants.length
            )
        );

    });

  });


  $("splitSummary").innerHTML =
    Object.entries(balances)
      .map(
        ([m, b]) =>
          card(
            m,
            fmt(b)
          )
      )
      .join("");


  $("settlementList").innerHTML =
    Object.entries(balances)
      .filter(
        ([, b]) =>
          Math.abs(b) > 0.01
      )
      .map(
        ([m, b]) => `
          <div class="item">

            <b>${esc(m)}</b>

            <span>
              ${
                b > 0
                  ? "Should receive "
                  : "Should pay "
              }
              ${fmt(Math.abs(b))}
            </span>

          </div>
        `
      )
      .join("")
      ||
      "<p class='muted'>Select a group</p>";


  $("splitList").innerHTML =
    groups.map(x => `
      <div class="item">

        <div>

          <b>
            ${esc(x["Group Name"])}
          </b>

          <br>

          <small>
            ${esc(x.Category)}
            •
            ${
              parseJSON(
                x["Members JSON"],
                []
              )
              .map(esc)
              .join(", ")
            }
          </small>

        </div>

        <button
          class="danger"
          onclick="del('splitGroups','${x.ID}')"
        >
          Delete
        </button>

      </div>
    `).join("");

}


async function addGroup() {

  const name =
    val("spGroup");


  const members =
    unique(
      val("spMembers")
        .split(",")
        .map(
          x => x.trim()
        )
    );


  if (!name) {

    return toast(
      "Group name required"
    );

  }


  try {

    await save(
      "splitGroups",
      {
        "Group Name":
          name,

        Category:
          val("spCat"),

        "Members JSON":
          JSON.stringify(members)
      }
    );


    $("spGroup").value = "";

    $("spMembers").value = "";


    renderAll();

    toast("Group created");


  } catch (err) {

    toast(err.message);

  }

}


async function addMember() {

  const g =
    groupById(
      val("spGroupSel")
    );


  const m =
    val("newMember");


  if (!g || !m) {

    return toast(
      "Select group and member"
    );

  }


  const members =
    unique([
      ...parseJSON(
        g["Members JSON"],
        []
      ),
      m
    ]);


  try {

    await save(
      "splitGroups",
      {
        ...g,

        "Members JSON":
          JSON.stringify(members)
      }
    );


    $("newMember").value = "";


    renderAll();

    toast("Member added");


  } catch (err) {

    toast(err.message);

  }

}


async function renameGroup() {

  const g =
    groupById(
      val("spGroupSel")
    );


  if (!g) {

    return toast(
      "Select group"
    );

  }


  const n =
    prompt(
      "New group name",
      g["Group Name"]
    );


  if (!n) return;


  try {

    await save(
      "splitGroups",
      {
        ...g,

        "Group Name":
          n
      }
    );


    renderAll();

    toast("Renamed");


  } catch (err) {

    toast(err.message);

  }

}


async function saveSplitExpense() {

  const gid =
    val("spGroupExpense");


  const g =
    groupById(gid);


  const amount =
    num(val("spAmount"));


  if (
    !g ||
    !val("spTitle") ||
    !amount ||
    !val("spPaidBy")
  ) {

    return toast(
      "Complete all required fields"
    );

  }


  const all =
    parseJSON(
      g["Members JSON"],
      []
    );


  const participants =
    unique(
      val("spMembersSel")
        .split(",")
        .map(
          x => x.trim()
        )
        .filter(Boolean)
    );


  try {

    await save(
      "splitExpenses",
      {
        "Group ID":
          gid,

        Title:
          val("spTitle"),

        Amount:
          amount,

        "Paid By":
          val("spPaidBy"),

        "Members JSON":
          JSON.stringify(
            participants.length
              ? participants
              : all
          ),

        "Custom Shares JSON":
          "{}",

        Date:
          val("spDate") ||
          today()
      }
    );


    [
      "spTitle",
      "spAmount",
      "spMembersSel"
    ].forEach(
      id => $(id).value = ""
    );


    renderAll();

    toast("Expense saved");


  } catch (err) {

    toast(err.message);

  }

}


// =================================================
// INVESTMENTS
// =================================================

function renderInvestments() {

  const baskets =
    DB.baskets || [];


  const assets =
    DB.assets || [];


  opt(
    $("assetBasket"),
    baskets,
    b => b["Basket Name"],
    b => b.ID,
    "Select basket"
  );


  const total =
    assets.reduce(
      (s, x) =>
        s +
        num(x["Monthly Amount"]),
      0
    );


  $("investmentDash").innerHTML =
    card(
      "Monthly SIP",
      fmt(total)
    ) +
    card(
      "Assets",
      assets.length
    ) +
    card(
      "Baskets",
      baskets.length
    );


  $("basketList").innerHTML =
    baskets.map(b => {

      const aa =
        assets.filter(
          a =>
            String(a["Basket ID"]) ===
            String(b.ID)
        );


      return `
        <div class="item">

          <div>

            <b>
              ${esc(b["Basket Name"])}
            </b>

            <br>

            <small>
              ${
                aa
                  .map(
                    a =>
                      esc(a["Asset Name"]) +
                      " " +
                      fmt(
                        a["Monthly Amount"]
                      )
                  )
                  .join(" • ")
                ||
                "No assets"
              }
            </small>

          </div>

          <button
            class="danger"
            onclick="del('baskets','${b.ID}')"
          >
            Delete
          </button>

        </div>
      `;

    }).join("")
    ||
    "<p class='muted'>No baskets</p>";


  chart(
    "investmentChart",
    "doughnut",
    {
      labels:
        assets.map(
          x => x["Asset Name"]
        ),

      datasets: [
        {
          data:
            assets.map(
              x =>
                num(
                  x["Monthly Amount"]
                )
            )
        }
      ]
    }
  );

}


async function addBasket() {

  const person =
    val("sipPerson");


  const name =
    val("sipBasket");


  if (!name) {

    return toast(
      "Basket name required"
    );

  }


  try {

    let p =
      (DB.people || [])
        .find(
          x =>
            String(x.Name)
              .toLowerCase() ===
            person.toLowerCase()
        );


    if (person && !p) {

      p =
        await save(
          "people",
          {
            Name: person
          }
        );

    }


    await save(
      "baskets",
      {
        "Person ID":
          p?.ID || "",

        "Basket Name":
          name
      }
    );


    $("sipBasket").value = "";


    renderAll();

    toast("Basket created");


  } catch (err) {

    toast(err.message);

  }

}


async function addAsset() {

  if (
    !val("assetBasket") ||
    !val("assetName") ||
    !num(val("assetAmount"))
  ) {

    return toast(
      "Select basket, asset and amount"
    );

  }


  try {

    await save(
      "assets",
      {
        "Basket ID":
          val("assetBasket"),

        "Asset Name":
          val("assetName"),

        "Asset Type":
          val("assetType"),

        "Monthly Amount":
          num(val("assetAmount"))
      }
    );


    [
      "assetName",
      "assetAmount"
    ].forEach(
      id => $(id).value = ""
    );


    renderAll();

    toast("Asset saved");


  } catch (err) {

    toast(err.message);

  }

}


// =================================================
// VEHICLE HELPERS
// =================================================

function vehicleName(id) {

  return (
    (DB.vehicles || [])
      .find(
        v =>
          String(v.ID) ===
          String(id)
      )
      ?.["Vehicle Name"]
    ||
    "Vehicle"
  );

}


function vehicleTypeById(id) {

  return (
    (DB.vehicles || [])
      .find(
        v =>
          String(v.ID) ===
          String(id)
      )
      ?.["Vehicle Type"]
    ||
    ""
  );

}


function recentRecords(arr, limit = 5) {

  return [...arr]
    .sort(
      (a, b) =>
        String(b.Date || "")
          .localeCompare(
            String(a.Date || "")
          )
    )
    .slice(0, limit);

}


// IMPORTANT:
// Previous odometer should be based on
// the latest actual fuel record by date.

function latestFuelRecord(vehicleId) {

  const records =
    (DB.fuel || [])
      .filter(
        x =>
          String(x["Vehicle ID"]) ===
          String(vehicleId)
      )
      .sort(
        (a, b) => {

          const dateCompare =
            String(b.Date || "")
              .localeCompare(
                String(a.Date || "")
              );

          if (dateCompare !== 0) {
            return dateCompare;
          }

          return (
            num(b.Odometer) -
            num(a.Odometer)
          );

        }
      );


  return records[0] || null;

}


function latestFuelOdometer(vehicleId) {

  const record =
    latestFuelRecord(vehicleId);


  return record
    ? num(record.Odometer)
    : 0;

}


function getFuelDistance(vehicleId, currentOdo) {

  const previous =
    latestFuelOdometer(vehicleId);


  const current =
    num(currentOdo);


  if (
    !previous ||
    !current
  ) {

    return 0;

  }


  const distance =
    current - previous;


  return distance > 0
    ? distance
    : 0;

}


function calculateFuelAverageKM(vehicleId) {

  const records =
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


  if (records.length < 2) {

    return {
      totalDistance: 0,
      intervals: 0,
      averageKM: 0,
      averageMileage: 0
    };

  }


  let totalDistance = 0;

  let totalFuel = 0;

  let intervals = 0;


  for (
    let i = 1;
    i < records.length;
    i++
  ) {

    const previous =
      num(records[i - 1].Odometer);


    const current =
      num(records[i].Odometer);


    const distance =
      current - previous;


    if (distance > 0) {

      totalDistance += distance;

      totalFuel +=
        num(records[i].Quantity);

      intervals++;

    }

  }


  return {

    totalDistance,

    intervals,

    averageKM:
      intervals
        ? totalDistance / intervals
        : 0,

    averageMileage:
      totalFuel
        ? totalDistance / totalFuel
        : 0

  };

}


// =================================================
// VEHICLE PERFORMANCE CARD
// =================================================

function vehiclePerformanceCard(vehicle) {

  const vehicleId =
    vehicle.ID;


  const fuelRecords =
    (DB.fuel || [])
      .filter(
        x =>
          String(x["Vehicle ID"]) ===
          String(vehicleId)
      );


  const stats =
    calculateFuelAverageKM(vehicleId);


  const totalFuelCost =
    fuelRecords.reduce(
      (s, x) =>
        s + num(x.Amount),
      0
    );


  const totalLitres =
    fuelRecords.reduce(
      (s, x) =>
        s + num(x.Quantity),
      0
    );


  const latest =
    latestFuelRecord(vehicleId);


  return `
    <div class="maintenance-card">

      <h3>
        ${
          String(
            vehicle["Vehicle Type"] || ""
          ).toLowerCase()
          .includes("bike")
            ? "🏍️"
            : "🚗"
        }

        ${esc(vehicle["Vehicle Name"])}
      </h3>


      <div class="maint-row">

        <span>
          Current Odometer
        </span>

        <b>
          ${
            latest
              ? num(latest.Odometer)
                  .toLocaleString("en-IN") +
                " km"
              : "—"
          }
        </b>

      </div>


      <div class="maint-row">

        <span>
          Fuel Entries
        </span>

        <b>
          ${fuelRecords.length}
        </b>

      </div>


      <div class="maint-row">

        <span>
          Average Distance / Fill
        </span>

        <b>
          ${
            stats.averageKM
              ? stats.averageKM
                  .toLocaleString(
                    "en-IN",
                    {
                      maximumFractionDigits: 1
                    }
                  ) +
                " km"
              : "—"
          }
        </b>

      </div>


      <div class="maint-row">

        <span>
          Average Mileage
        </span>

        <b>
          ${
            stats.averageMileage
              ? stats.averageMileage
                  .toLocaleString(
                    "en-IN",
                    {
                      maximumFractionDigits: 1
                    }
                  ) +
                " km/L"
              : "—"
          }
        </b>

      </div>


      <div class="maint-row">

        <span>
          Total Fuel Cost
        </span>

        <b>
          ${fmt(totalFuelCost)}
        </b>

      </div>


      <div class="maint-row">

        <span>
          Total Fuel Quantity
        </span>

        <b>
          ${
            totalLitres
              ? totalLitres
                  .toLocaleString(
                    "en-IN",
                    {
                      maximumFractionDigits: 2
                    }
                  ) +
                " L"
              : "—"
          }
        </b>

      </div>

    </div>
  `;

}


// =================================================
// MAINTENANCE HELPERS
// =================================================

function getMaintenanceRecord(
  vehicleId,
  type
) {

  const keywords =
    type === "oil"
      ? ["oil"]
      : ["service"];


  const records =
    (DB.maintenance || [])
      .filter(x => {

        if (
          String(x["Vehicle ID"]) !==
          String(vehicleId)
        ) {

          return false;

        }


        const category =
          String(
            x.Category || ""
          ).toLowerCase();


        return keywords.some(
          k =>
            category.includes(k)
        );

      })
      .sort(
        (a, b) => {

          const kmDiff =
            num(b.Odometer) -
            num(a.Odometer);


          if (kmDiff !== 0) {

            return kmDiff;

          }


          return String(b.Date || "")
            .localeCompare(
              String(a.Date || "")
            );

        }
      );


  return records[0] || null;

}


function getServiceInterval(vehicle) {

  const type =
    String(
      vehicle["Vehicle Type"] || ""
    ).toLowerCase();


  if (
    type.includes("bike") ||
    type.includes("motorcycle") ||
    type.includes("scooter")
  ) {

    return 3000;

  }


  return 10000;

}


function maintenanceCard(vehicle) {

  const vehicleId =
    vehicle.ID;


  const interval =
    getServiceInterval(vehicle);


  const currentKM =
    latestFuelOdometer(vehicleId);


  const lastOil =
    getMaintenanceRecord(
      vehicleId,
      "oil"
    );


  const lastService =
    getMaintenanceRecord(
      vehicleId,
      "service"
    );


  const lastOilKM =
    lastOil
      ? num(lastOil.Odometer)
      : 0;


  const lastServiceKM =
    lastService
      ? num(lastService.Odometer)
      : 0;


  const nextOilTarget =
    lastOil
      ? (
          num(lastOil["Next Target KM"]) ||
          lastOilKM + interval
        )
      : 0;


  const nextServiceTarget =
    lastService
      ? (
          num(
            lastService["Next Target KM"]
          ) ||
          lastServiceKM + interval
        )
      : 0;


  const oilRemaining =
    nextOilTarget
      ? nextOilTarget - currentKM
      : 0;


  const serviceRemaining =
    nextServiceTarget
      ? nextServiceTarget - currentKM
      : 0;


  const oilClass =
    oilRemaining <= 0 &&
    nextOilTarget > 0
      ? "danger-km"
      : oilRemaining < 500
        ? "warning-km"
        : "good-km";


  const serviceClass =
    serviceRemaining <= 0 &&
    nextServiceTarget > 0
      ? "danger-km"
      : serviceRemaining < 500
        ? "warning-km"
        : "good-km";


  return `
    <div class="maintenance-card">

      <h3>
        ${
          String(
            vehicle["Vehicle Type"] || ""
          ).toLowerCase()
          .includes("bike")
            ? "🏍️"
            : "🚗"
        }

        ${esc(vehicle["Vehicle Name"])}
      </h3>


      <div class="maint-row">

        <span>
          Current Odometer
        </span>

        <b>
          ${
            currentKM
              ? currentKM
                  .toLocaleString("en-IN") +
                " km"
              : "—"
          }
        </b>

      </div>


      <hr>


      <div class="maint-section-title">
        🛢️ Oil Change
      </div>


      <div class="maint-row">

        <span>
          Last Oil Change
        </span>

        <b>
          ${
            lastOil
              ? displayDate(lastOil.Date) +
                " · " +
                lastOilKM
                  .toLocaleString("en-IN") +
                " km"
              : "No record"
          }
        </b>

      </div>


      <div class="maint-row">

        <span>
          Next Oil Target
        </span>

        <b>
          ${
            nextOilTarget
              ? nextOilTarget
                  .toLocaleString("en-IN") +
                " km"
              : "—"
          }
        </b>

      </div>


      <div class="maint-row">

        <span>
          KM Remaining
        </span>

        <b class="${oilClass}">

          ${
            nextOilTarget
              ? (
                  oilRemaining >= 0
                    ? oilRemaining
                        .toLocaleString("en-IN") +
                      " km"
                    : Math.abs(oilRemaining)
                        .toLocaleString("en-IN") +
                      " km overdue"
                )
              : "—"
          }

        </b>

      </div>


      <hr>


      <div class="maint-section-title">
        🔧 Service
      </div>


      <div class="maint-row">

        <span>
          Last Service
        </span>

        <b>
          ${
            lastService
              ? displayDate(lastService.Date) +
                " · " +
                lastServiceKM
                  .toLocaleString("en-IN") +
                " km"
              : "No record"
          }
        </b>

      </div>


      <div class="maint-row">

        <span>
          Next Service Target
        </span>

        <b>
          ${
            nextServiceTarget
              ? nextServiceTarget
                  .toLocaleString("en-IN") +
                " km"
              : "—"
          }
        </b>

      </div>


      <div class="maint-row">

        <span>
          KM Remaining
        </span>

        <b class="${serviceClass}">

          ${
            nextServiceTarget
              ? (
                  serviceRemaining >= 0
                    ? serviceRemaining
                        .toLocaleString("en-IN") +
                      " km"
                    : Math.abs(serviceRemaining)
                        .toLocaleString("en-IN") +
                      " km overdue"
                )
              : "—"
          }

        </b>

      </div>


      <div class="maintenance-interval">

        ${
          String(
            vehicle["Vehicle Type"] || ""
          ).toLowerCase()
          .includes("bike")
            ? "Oil Change & Service default interval: 3,000 km"
            : "Oil Change & Service default interval: 10,000 km"
        }

      </div>

    </div>
  `;

}


// =================================================
// VEHICLE PREVIOUS ODOMETER
// =================================================

function updateFuelPreviousOdometer() {

  const vehicleId =
    val("fuelVehicle");


  const previous =
    latestFuelOdometer(vehicleId);


  if ($("fuelLastOdo")) {

    $("fuelLastOdo").value =
      previous || "";

  }


  updateFuelDistance();

}


function updateFuelDistance() {

  const previous =
    num(val("fuelLastOdo"));


  const current =
    num(val("fuelOdo"));


  let distance = 0;


  if (
    previous &&
    current &&
    current >= previous
  ) {

    distance =
      current - previous;

  }


  if ($("fuelDistance")) {

    $("fuelDistance").value =
      distance || "";

  }

}


// =================================================
// VEHICLE RENDER
// =================================================

function renderVehicles() {

  const vehicles =
    DB.vehicles || [];


  const type =
    val("vehicleTypeFilter");


  const vid =
    val("vehicleFilter");


  opt(
    $("vehicleFilter"),

    vehicles.filter(
      v =>
        !type ||
        v["Vehicle Type"] === type
    ),

    v => v["Vehicle Name"],

    v => v.ID,

    "All Vehicles"
  );


  [
    "fuelVehicle",
    "maintVehicle"
  ].forEach(id =>
    opt(
      $(id),

      vehicles,

      v => v["Vehicle Name"],

      v => v.ID,

      "Select vehicle"
    )
  );


  const fuels =
    (DB.fuel || [])
      .filter(
        x =>
          !vid ||
          String(
            x["Vehicle ID"]
          ) ===
          String(vid)
      );


  const maint =
    (DB.maintenance || [])
      .filter(
        x =>
          !vid ||
          String(
            x["Vehicle ID"]
          ) ===
          String(vid)
      );


  const fcost =
    fuels.reduce(
      (s, x) =>
        s + num(x.Amount),
      0
    );


  const mcost =
    maint.reduce(
      (s, x) =>
        s + num(x.Amount),
      0
    );


  const selectedVehicles =
    vehicles.filter(
      v =>
        (!type ||
          v["Vehicle Type"] === type) &&
        (!vid ||
          String(v.ID) ===
          String(vid))
    );


  const performanceVehicles =
    selectedVehicles.length
      ? selectedVehicles
      : vehicles;


  const allStats =
    performanceVehicles.map(v =>
      calculateFuelAverageKM(v.ID)
    );


  const avgDistance =
    allStats.length
      ? (
          allStats.reduce(
            (s, x) =>
              s + x.averageKM,
            0
          ) /
          Math.max(
            1,
            allStats.filter(
              x => x.averageKM > 0
            ).length
          )
        )
      : 0;


  $("vehicleDash").innerHTML =
    card(
      "⛽ Fuel Cost",
      fmt(fcost)
    ) +
    card(
      "🔧 Maintenance Cost",
      fmt(mcost)
    ) +
    card(
      "💰 Total Cost",
      fmt(fcost + mcost)
    ) +
    card(
      "📏 Avg KM / Fuel Fill",
      avgDistance
        ? avgDistance
            .toLocaleString(
              "en-IN",
              {
                maximumFractionDigits: 1
              }
            ) +
          " km"
        : "—"
    );


  $("vehiclePerformanceDashboard").innerHTML =
    performanceVehicles
      .map(
        vehiclePerformanceCard
      )
      .join("")
    ||
    "<p class='muted'>No vehicles available</p>";


  $("vehicleMaintenanceSummary").innerHTML =
    performanceVehicles
      .map(
        maintenanceCard
      )
      .join("")
    ||
    "<p class='muted'>No vehicles available</p>";


  // ONLY 5 RECENT FUEL RECORDS

  const recentFuel =
    recentRecords(
      fuels,
      5
    );


  $("fuelList").innerHTML =
    recentFuel.map(x => {

      const previous =
        getPreviousFuelForRecord(
          x
        );


      const distance =
        previous
          ? num(x.Odometer) -
            num(previous.Odometer)
          : 0;


      return `
        <div class="item">

          <div>

            <b>
              ${esc(
                vehicleName(
                  x["Vehicle ID"]
                )
              )}
            </b>

            <br>

            <small>

              ${displayDate(x.Date)}

              •
              ${num(x.Odometer)
                .toLocaleString("en-IN")} km

              ${
                distance > 0
                  ? " • Distance: " +
                    distance
                      .toLocaleString("en-IN") +
                    " km"
                  : ""
              }

              •
              ${num(x.Quantity)} L

            </small>

          </div>


          <div>

            <b>
              ${fmt(x.Amount)}
            </b>

            <br>

            <button
              class="danger"
              onclick="del('fuel','${x.ID}')"
            >
              Delete
            </button>

          </div>

        </div>
      `;

    }).join("")
    ||
    "<p class='muted'>No recent fuel entries</p>";


  // ONLY 5 RECENT MAINTENANCE RECORDS

  const recentMaintenance =
    recentRecords(
      maint,
      5
    );


  $("maintenanceList").innerHTML =
    recentMaintenance.map(x => `
      <div class="item">

        <div>

          <b>
            ${esc(
              vehicleName(
                x["Vehicle ID"]
              )
            )}

            •

            ${esc(x.Category)}
          </b>

          <br>

          <small>

            ${displayDate(x.Date)}

            •
            ${num(x.Odometer)
              .toLocaleString("en-IN")} km

            ${
              x.Remarks
                ? " • " +
                  esc(x.Remarks)
                : ""
            }

          </small>

        </div>


        <div>

          <b>
            ${fmt(x.Amount)}
          </b>

          <br>

          <button
            class="danger"
            onclick="del('maintenance','${x.ID}')"
          >
            Delete
          </button>

        </div>

      </div>
    `).join("")
    ||
    "<p class='muted'>No recent maintenance entries</p>";


  const chartVehicles =
    performanceVehicles;


  const labels =
    chartVehicles.map(
      v =>
        v["Vehicle Name"]
    );


  chart(
    "fuelChart",
    "bar",
    {
      labels,

      datasets: [
        {
          label: "Fuel Cost",

          data:
            chartVehicles.map(v =>
              (DB.fuel || [])
                .filter(
                  x =>
                    String(
                      x["Vehicle ID"]
                    ) ===
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
    }
  );


  chart(
    "maintenanceChart",
    "bar",
    {
      labels,

      datasets: [
        {
          label: "Maintenance Cost",

          data:
            chartVehicles.map(v =>
              (DB.maintenance || [])
                .filter(
                  x =>
                    String(
                      x["Vehicle ID"]
                    ) ===
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
    }
  );


  updateFuelPreviousOdometer();

}


// =================================================
// FIND PREVIOUS FUEL FOR A SPECIFIC RECORD
// =================================================

function getPreviousFuelForRecord(record) {

  const records =
    (DB.fuel || [])
      .filter(
        x =>
          String(
            x["Vehicle ID"]
          ) ===
          String(
            record["Vehicle ID"]
          )
      )
      .sort(
        (a, b) =>
          num(a.Odometer) -
          num(b.Odometer)
      );


  const index =
    records.findIndex(
      x =>
        String(x.ID) ===
        String(record.ID)
    );


  if (index <= 0) {
    return null;
  }


  return records[index - 1];

}


// =================================================
// VEHICLE SAVE FUNCTIONS
// =================================================

async function addVehicle() {

  const name =
    val("vehicleName");


  if (!name) {

    return toast(
      "Vehicle name required"
    );

  }


  try {

    await save(
      "vehicles",
      {
        "Vehicle Name":
          name,

        "Vehicle Type":
          val("vehicleType") ||
          "Car",

        "Number Plate":
          val("vehiclePlate")
      }
    );


    [
      "vehicleName",
      "vehiclePlate"
    ].forEach(
      id => $(id).value = ""
    );


    renderAll();

    toast("Vehicle added");


  } catch (err) {

    console.error(err);

    toast(err.message);

  }

}


async function addFuel() {

  const vehicleId =
    val("fuelVehicle");


  const amount =
    num(val("fuelAmount"));


  const currentOdo =
    num(val("fuelOdo"));


  const previousOdo =
    latestFuelOdometer(vehicleId);


  if (!vehicleId) {

    return toast(
      "Please select a vehicle"
    );

  }


  if (!amount) {

    return toast(
      "Fuel amount is required"
    );

  }


  if (!currentOdo) {

    return toast(
      "Current odometer is required"
    );

  }


  if (
    previousOdo &&
    currentOdo <= previousOdo
  ) {

    return toast(
      "Current odometer must be greater than previous odometer"
    );

  }


  try {

    await save(
      "fuel",
      {
        "Vehicle ID":
          vehicleId,

        Date:
          val("fuelDate") ||
          today(),

        Odometer:
          currentOdo,

        Quantity:
          num(val("fuelQty")),

        Amount:
          amount,

        "Fuel Type":
          val("fuelType"),

        Notes:
          val("fuelNotes")
      }
    );


    [
      "fuelOdo",
      "fuelLastOdo",
      "fuelDistance",
      "fuelQty",
      "fuelAmount",
      "fuelNotes"
    ].forEach(
      id => $(id).value = ""
    );


    renderAll();

    toast("Fuel saved successfully");


  } catch (err) {

    console.error(err);

    toast(err.message);

  }

}


async function addMaintenance() {

  const vehicleId =
    val("maintVehicle");


  const amount =
    num(val("maintAmount"));


  if (
    !vehicleId ||
    !amount
  ) {

    return toast(
      "Vehicle and maintenance amount are required"
    );

  }


  try {

    await save(
      "maintenance",
      {
        "Vehicle ID":
          vehicleId,

        Date:
          val("maintDate") ||
          today(),

        Category:
          val("maintCategory") ||
          "Service",

        Amount:
          amount,

        Odometer:
          num(val("maintOdo")),

        "Next Target KM":
          num(
            val("maintTargetKm")
          ),

        Remarks:
          val("maintRemarks")
      }
    );


    [
      "maintAmount",
      "maintOdo",
      "maintTargetKm",
      "maintRemarks"
    ].forEach(
      id => $(id).value = ""
    );


    renderAll();

    toast("Maintenance saved");


  } catch (err) {

    console.error(err);

    toast(err.message);

  }

}


function resetVehicleFilters() {

  $("vehicleTypeFilter").value = "";

  $("vehicleFilter").value = "";

  renderVehicles();

}


// =================================================
// DROPDOWNS / LISTS
// =================================================

function fillLists() {

  const cats =
    unique(
      (DB.passbook || [])
        .map(
          x => x.Category
        )
    );


  opt(
    $("dashCategory"),
    cats,
    x => x,
    x => x,
    "All Categories"
  );


  opt(
    $("pbFilterCategory"),
    cats,
    x => x,
    x => x,
    "All Categories"
  );


  function dl(id, arr) {

    const e =
      $(id);


    if (!e) return;


    e.innerHTML =
      unique(arr)
        .map(
          x =>
            `<option value="${esc(x)}"></option>`
        )
        .join("");

  }


  dl(
    "categoryList",
    cats
  );


  dl(
    "accountList",
    (DB.passbook || [])
      .map(
        x => x.Account
      )
  );


  dl(
    "remarksList",
    (DB.passbook || [])
      .map(
        x => x.Remarks
      )
  );


  dl(
    "companyList",
    (DB.salary || [])
      .map(
        x => x.Company
      )
  );


  dl(
    "salaryRemarksList",
    (DB.salary || [])
      .map(
        x => x.Remarks
      )
  );


  dl(
    "personList",
    (DB.transactions || [])
      .map(
        x => x.Person
      )
  );


  opt(
    $("emiLoan"),
    DB.loans || [],
    x => x["Loan Name"],
    x => x.ID,
    "Select loan"
  );

}


// =================================================
// APP STARTUP
// =================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const saved =
      localStorage.getItem(
        "afh-theme"
      );


    if (saved === "dark") {

      document.body.classList.add(
        "dark"
      );

    }


    $("themeBtn").onclick = () => {

      document.body.classList.toggle(
        "dark"
      );


      localStorage.setItem(
        "afh-theme",

        document.body.classList.contains(
          "dark"
        )
          ? "dark"
          : "light"
      );


      $("themeBtn").textContent =
        document.body.classList.contains(
          "dark"
        )
          ? "☀️ Light"
          : "🌙 Dark";

    };


    $("themeBtn").textContent =
      document.body.classList.contains(
        "dark"
      )
        ? "☀️ Light"
        : "🌙 Dark";


    $("menuBtn").onclick =
      () =>
        $("sidebar")
          .classList
          .toggle("open");


    document
      .querySelectorAll(
        "[data-page]"
      )
      .forEach(button => {

        button.onclick = () => {

          document
            .querySelectorAll(
              ".page"
            )
            .forEach(page =>
              page.classList.remove(
                "active"
              )
            );


          const target =
            $(button.dataset.page);


          if (target) {

            target.classList.add(
              "active"
            );

          }


          $("sidebar")
            .classList
            .remove("open");

        };

      });


    [
      "dashMonth",
      "dashCategory"
    ].forEach(id => {

      $(id)?.addEventListener(
        "change",
        renderDashboard
      );

    });


    [
      "pbFilterMonth",
      "pbFilterCategory"
    ].forEach(id => {

      $(id)?.addEventListener(
        "change",
        renderPassbook
      );

    });


    $("vehicleTypeFilter")
      ?.addEventListener(
        "change",
        () => {

          $("vehicleFilter").value = "";

          renderVehicles();

        }
      );


    $("vehicleFilter")
      ?.addEventListener(
        "change",
        renderVehicles
      );


    $("fuelVehicle")
      ?.addEventListener(
        "change",
        updateFuelPreviousOdometer
      );


    $("fuelOdo")
      ?.addEventListener(
        "input",
        updateFuelDistance
      );


    $("spGroupSel")
      ?.addEventListener(
        "change",
        renderSplitter
      );


    $("spGroupExpense")
      ?.addEventListener(
        "change",
        renderSplitter
      );


    [
      "pbDate",
      "gtDate",
      "spDate",
      "fuelDate",
      "maintDate"
    ].forEach(id => {

      if ($(id)) {

        $(id).value =
          today();

      }

    });


    [
      "salMonth",
      "emiMonth"
    ].forEach(id => {

      if ($(id)) {

        $(id).value =
          monthNow();

      }

    });


    loadAll();

  }
);
