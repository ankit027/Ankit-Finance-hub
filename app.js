/*
  IMPORTANT:
  Paste ONLY the Google Apps Script Web App URL below.
*/

const API_URL =
  "https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";


let DB = {};
let charts = {};


/* =================================================
   BASIC HELPERS
================================================= */

const $ = id => document.getElementById(id);

const today = () =>
  new Date().toISOString().slice(0, 10);

const monthNow = () =>
  new Date().toISOString().slice(0, 7);

const num = value =>
  Number(value || 0);

const fmt = value =>
  "₹" + num(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });

const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));

const val = id =>
  ($(id)?.value || "").trim();


function toast(message, ms = 2500) {

  const element = $("toast");

  if (!element) {
    return;
  }

  element.textContent = message;

  element.classList.add("show");

  clearTimeout(window._toast);

  window._toast = setTimeout(() => {
    element.classList.remove("show");
  }, ms);

}


function setStatus(text) {

  const element = $("status");

  if (element) {
    element.textContent = text;
  }

}


function apiReady() {

  return (
    API_URL &&
    !API_URL.includes("PASTE_YOUR")
  );

}


/* =================================================
   API
================================================= */

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

  const json = await response.json();

  if (!json.success) {
    throw new Error(
      json.error || "Cloud request failed"
    );
  }

  return json;

}


/* =================================================
   LOAD ALL DATA
================================================= */

async function loadAll() {

  if (!apiReady()) {

    setStatus("⚠️ API URL required");

    toast(
      "Paste Apps Script Web App URL in app.js"
    );

    renderAll();

    return;
  }

  try {

    setStatus("☁️ Syncing...");

    const response = await fetch(
      API_URL + "?action=loadAll",
      {
        cache: "no-store"
      }
    );

    const json = await response.json();

    if (!json.success) {
      throw new Error(
        json.error || "Load failed"
      );
    }

    DB = json.data || {};


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

      DB[key] = DB[key] || [];

    });


    setStatus("☁️ Synced");

    renderAll();

  } catch (error) {

    console.error(error);

    setStatus("⚠️ Sync failed");

    toast(error.message);

    renderAll();

  }

}


/* =================================================
   SAVE
================================================= */

async function save(table, data) {

  const response = await api(
    "save",
    {
      table,
      data
    }
  );

  const record =
    response.data.record;

  DB[table] =
    DB[table] || [];

  const index =
    DB[table].findIndex(
      item =>
        String(item.ID) ===
        String(record.ID)
    );

  if (index >= 0) {

    DB[table][index] =
      record;

  } else {

    DB[table].push(record);

  }

  return record;

}


/* =================================================
   DELETE
================================================= */

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
        item =>
          String(item.ID) !==
          String(id)
      );

    renderAll();

    toast("Deleted");

  } catch (error) {

    console.error(error);

    toast(error.message);

  }

}


/* =================================================
   COMMON UI HELPERS
================================================= */

function card(label, value) {

  return `
    <div>
      <small>${esc(label)}</small>
      <b>${value}</b>
    </div>
  `;

}


function monthOf(value) {

  return String(value || "")
    .slice(0, 7);

}


function unique(array) {

  return [
    ...new Set(
      array.filter(Boolean)
    )
  ];

}


function opt(
  element,
  array,
  textFn = x => x,
  valueFn = x => x,
  placeholder = "Select"
) {

  if (!element) {
    return;
  }

  const current =
    element.value;

  element.innerHTML =
    `<option value="">${placeholder}</option>` +
    array.map(item => `
      <option value="${esc(valueFn(item))}">
        ${esc(textFn(item))}
      </option>
    `).join("");

  element.value =
    current;

}


/* =================================================
   RENDER ALL
================================================= */

function renderAll() {

  renderDashboard();
  renderPassbook();
  renderSalary();
  renderLoans();
  renderGive();
  renderSplitter();
  renderInvestments();
  renderVehicles();
  fillLists();

}


/* =================================================
   CHART
================================================= */

function chart(
  id,
  type,
  data,
  options = {}
) {

  if (!window.Chart) {
    return;
  }

  if (charts[id]) {
    charts[id].destroy();
  }

  const element =
    $(id);

  if (!element) {
    return;
  }

  charts[id] =
    new Chart(
      element,
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


/* =================================================
   DASHBOARD
================================================= */

function renderDashboard() {

  const month =
    val("dashMonth");

  const category =
    val("dashCategory");


  const passbook =
    (DB.passbook || []).filter(item =>
      (!month ||
        monthOf(item.Date) === month) &&
      (!category ||
        item.Category === category)
    );


  const income =
    passbook
      .filter(item =>
        item.Type === "Income"
      )
      .reduce(
        (sum, item) =>
          sum + num(item.Amount),
        0
      );


  const expense =
    passbook
      .filter(item =>
        item.Type === "Expense"
      )
      .reduce(
        (sum, item) =>
          sum + num(item.Amount),
        0
      );


  const salary =
    (DB.salary || [])
      .filter(item =>
        !month ||
        String(item.Month) === month
      )
      .reduce(
        (sum, item) =>
          sum + num(item.Amount),
        0
      );


  const emi =
    (DB.emi || [])
      .filter(item =>
        !month ||
        String(item.Month) === month
      )
      .reduce(
        (sum, item) =>
          sum + num(item.Amount),
        0
      );


  let toReceive = 0;
  let toPay = 0;


  (DB.transactions || [])
    .forEach(item => {

      if (
        item.Type ===
        "Pending to Take"
      ) {
        toReceive +=
          num(item.Amount);
      }

      if (
        item.Type ===
        "Received"
      ) {
        toReceive -=
          num(item.Amount);
      }

      if (
        item.Type ===
        "Pending to Pay"
      ) {
        toPay +=
          num(item.Amount);
      }

      if (
        item.Type ===
        "Paid"
      ) {
        toPay -=
          num(item.Amount);
      }

    });


  if ($("dash")) {

    $("dash").innerHTML = [

      card(
        "💰 Salary",
        fmt(salary)
      ),

      card(
        "📈 Total Income",
        fmt(income)
      ),

      card(
        "💸 Expense",
        fmt(expense)
      ),

      card(
        "🏦 EMI Paid",
        fmt(emi)
      ),

      card(
        "📉 SIP Paid",
        "₹0"
      ),

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

  }


  const months =
    unique(
      (DB.passbook || [])
        .map(item =>
          monthOf(item.Date)
        )
    ).sort();


  const incomeData =
    months.map(monthValue =>
      (DB.passbook || [])
        .filter(item =>
          monthOf(item.Date) === monthValue &&
          item.Type === "Income"
        )
        .reduce(
          (sum, item) =>
            sum + num(item.Amount),
          0
        )
    );


  const expenseData =
    months.map(monthValue =>
      (DB.passbook || [])
        .filter(item =>
          monthOf(item.Date) === monthValue &&
          item.Type === "Expense"
        )
        .reduce(
          (sum, item) =>
            sum + num(item.Amount),
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
          data: incomeData
        },
        {
          label: "Expense",
          data: expenseData
        }
      ]
    }
  );


  const categories =
    unique(
      passbook
        .filter(item =>
          item.Type === "Expense"
        )
        .map(item =>
          item.Category || "Other"
        )
    );


  chart(
    "expenseChart",
    "doughnut",
    {
      labels: categories,
      datasets: [
        {
          data:
            categories.map(categoryValue =>
              passbook
                .filter(item =>
                  item.Type === "Expense" &&
                  (item.Category || "Other") === categoryValue
                )
                .reduce(
                  (sum, item) =>
                    sum + num(item.Amount),
                  0
                )
            )
        }
      ]
    }
  );

}


/* =================================================
   PASSBOOK
================================================= */

function renderPassbook() {

  const month =
    val("pbFilterMonth");

  const category =
    val("pbFilterCategory");


  const rows =
    (DB.passbook || [])
      .filter(item =>
        (!month ||
          monthOf(item.Date) === month) &&
        (!category ||
          item.Category === category)
      )
      .sort(
        (a, b) =>
          String(b.Date)
            .localeCompare(
              String(a.Date)
            )
      );


  const income =
    rows
      .filter(item =>
        item.Type === "Income"
      )
      .reduce(
        (sum, item) =>
          sum + num(item.Amount),
        0
      );


  const expense =
    rows
      .filter(item =>
        item.Type === "Expense"
      )
      .reduce(
        (sum, item) =>
          sum + num(item.Amount),
        0
      );


  if ($("passbookDash")) {

    $("passbookDash").innerHTML =
      card("Income", fmt(income)) +
      card("Expense", fmt(expense)) +
      card(
        "Balance",
        fmt(income - expense)
      );

  }


  if ($("pbList")) {

    $("pbList").innerHTML =
      rows.map(item => `
        <div class="item">

          <div>

            <b>
              ${esc(item.Category || "Uncategorized")}
              •
              ${esc(item.Type)}
            </b>

            <br>

            <small>
              ${esc(item.Date)}
              •
              ${esc(item.Account || "")}

              ${
                item.Remarks
                  ? " • " +
                    esc(item.Remarks)
                  : ""
              }
            </small>

          </div>

          <div>

            <b>
              ${fmt(item.Amount)}
            </b>

            <br>

            <button
              class="danger"
              onclick="del('passbook','${item.ID}')"
            >
              Delete
            </button>

          </div>

        </div>
      `).join("")
      ||
      "<p class='muted'>No entries</p>";

  }


  const categories =
    unique(
      rows.map(item =>
        item.Category || "Other"
      )
    );


  chart(
    "passbookChart",
    "bar",
    {
      labels: categories,
      datasets: [
        {
          label: "Amount",
          data:
            categories.map(categoryValue =>
              rows
                .filter(item =>
                  (item.Category || "Other") ===
                  categoryValue
                )
                .reduce(
                  (sum, item) =>
                    sum + num(item.Amount),
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

  } catch (error) {

    toast(error.message);

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

    if ($(id)) {
      $(id).value = "";
    }

  });

  if ($("pbDate")) {
    $("pbDate").value = today();
  }

  if ($("pbType")) {
    $("pbType").value =
      "Expense";
  }

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


/* =================================================
   SALARY
================================================= */

function renderSalary() {

  const rows =
    (DB.salary || [])
      .sort(
        (a, b) =>
          String(b.Month)
            .localeCompare(
              String(a.Month)
            )
      );


  if ($("salaryDash")) {

    $("salaryDash").innerHTML =
      card(
        "Total Salary",
        fmt(
          rows.reduce(
            (sum, item) =>
              sum + num(item.Amount),
            0
          )
        )
      ) +
      card(
        "Latest",
        fmt(rows[0]?.Amount || 0)
      );

  }


  if ($("salaryList")) {

    $("salaryList").innerHTML =
      rows.map(item => `
        <div class="item">

          <div>

            <b>
              ${esc(
                item.Company || "Salary"
              )}
            </b>

            <br>

            <small>
              ${esc(item.Month)}

              ${
                item.Remarks
                  ? " • " +
                    esc(item.Remarks)
                  : ""
              }
            </small>

          </div>

          <div>

            <b>
              ${fmt(item.Amount)}
            </b>

            <br>

            <button
              class="danger"
              onclick="del('salary','${item.ID}')"
            >
              Delete
            </button>

          </div>

        </div>
      `).join("")
      ||
      "<p class='muted'>No salary records</p>";

  }


  const reversed =
    rows.slice().reverse();


  chart(
    "salaryChart",
    "line",
    {
      labels:
        reversed.map(
          item => item.Month
        ),

      datasets: [
        {
          label: "Salary",
          data:
            reversed.map(
              item =>
                num(item.Amount)
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
    ].forEach(id => {

      if ($(id)) {
        $(id).value = "";
      }

    });

    renderAll();

    toast("Salary saved");

  } catch (error) {

    toast(error.message);

  }

}


/* =================================================
   LOANS
================================================= */

function renderLoans() {

  const loans =
    DB.loans || [];

  const emi =
    DB.emi || [];


  const total =
    loans.reduce(
      (sum, item) =>
        sum +
        num(item["Initial Amount"]),
      0
    );


  const paid =
    emi.reduce(
      (sum, item) =>
        sum + num(item.Amount),
      0
    );


  if ($("loanDash")) {

    $("loanDash").innerHTML =
      card(
        "Total Loan",
        fmt(total)
      ) +
      card(
        "EMI Paid",
        fmt(paid)
      ) +
      card(
        "Remaining",
        fmt(
          Math.max(
            0,
            total - paid
          )
        )
      );

  }


  if ($("loanList")) {

    $("loanList").innerHTML =
      loans.map(loan => {

        const loanPaid =
          emi
            .filter(item =>
              String(
                item["Loan ID"]
              ) ===
              String(loan.ID)
            )
            .reduce(
              (sum, item) =>
                sum + num(item.Amount),
              0
            );

        return `
          <div class="item">

            <div>

              <b>
                ${esc(
                  loan["Loan Name"]
                )}
              </b>

              <br>

              <small>
                ${esc(
                  loan.Remarks || ""
                )}
              </small>

            </div>

            <div>

              Initial:
              <b>
                ${fmt(
                  loan["Initial Amount"]
                )}
              </b>

              <br>

              Paid:
              ${fmt(loanPaid)}

              <br>

              <button
                class="danger"
                onclick="del('loans','${loan.ID}')"
              >
                Delete
              </button>

            </div>

          </div>
        `;

      }).join("")
      ||
      "<p class='muted'>No loans</p>";

  }


  chart(
    "loanChart",
    "bar",
    {
      labels:
        loans.map(
          item =>
            item["Loan Name"]
        ),

      datasets: [
        {
          label: "Initial Amount",

          data:
            loans.map(
              item =>
                num(
                  item["Initial Amount"]
                )
            )
        },

        {
          label: "Paid",

          data:
            loans.map(loan =>
              emi
                .filter(item =>
                  String(
                    item["Loan ID"]
                  ) ===
                  String(loan.ID)
                )
                .reduce(
                  (sum, item) =>
                    sum + num(item.Amount),
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
        "Loan Name":
          val("loanName"),

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
    ].forEach(id => {

      if ($(id)) {
        $(id).value = "";
      }

    });

    renderAll();

    toast("Loan added");

  } catch (error) {

    toast(error.message);

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

    if ($("emiAmount")) {
      $("emiAmount").value = "";
    }

    if ($("emiRemarks")) {
      $("emiRemarks").value = "";
    }

    renderAll();

    toast("EMI saved");

  } catch (error) {

    toast(error.message);

  }

}


/* =================================================
   GIVE / TAKE
================================================= */

function renderGive() {

  const rows =
    DB.transactions || [];

  let toReceive = 0;
  let toPay = 0;


  rows.forEach(item => {

    const amount =
      num(item.Amount);

    if (
      item.Type ===
      "Pending to Take"
    ) {
      toReceive += amount;
    }

    if (
      item.Type ===
      "Received"
    ) {
      toReceive -= amount;
    }

    if (
      item.Type ===
      "Pending to Pay"
    ) {
      toPay += amount;
    }

    if (
      item.Type ===
      "Paid"
    ) {
      toPay -= amount;
    }

  });


  if ($("giveDash")) {

    $("giveDash").innerHTML =
      card(
        "📥 To Receive",
        fmt(
          Math.max(
            0,
            toReceive
          )
        )
      ) +
      card(
        "📤 To Pay",
        fmt(
          Math.max(
            0,
            toPay
          )
        )
      );

  }


  const persons =
    unique(
      rows.map(
        item =>
          item.Person
      )
    );


  const receiveData =
    persons.map(person => {

      let balance = 0;

      rows
        .filter(item =>
          item.Person === person
        )
        .forEach(item => {

          if (
            item.Type ===
            "Pending to Take"
          ) {
            balance +=
              num(item.Amount);
          }

          if (
            item.Type ===
            "Received"
          ) {
            balance -=
              num(item.Amount);
          }

        });

      return Math.max(
        0,
        balance
      );

    });


  const payData =
    persons.map(person => {

      let balance = 0;

      rows
        .filter(item =>
          item.Person === person
        )
        .forEach(item => {

          if (
            item.Type ===
            "Pending to Pay"
          ) {
            balance +=
              num(item.Amount);
          }

          if (
            item.Type ===
            "Paid"
          ) {
            balance -=
              num(item.Amount);
          }

        });

      return Math.max(
        0,
        balance
      );

    });


  if ($("gtList")) {

    $("gtList").innerHTML =
      rows
        .slice()
        .sort(
          (a, b) =>
            String(b.Date)
              .localeCompare(
                String(a.Date)
              )
        )
        .slice(0, 10)
        .map(item => `
          <div class="item">

            <div>

              <b>
                ${esc(item.Person)}
                •
                ${esc(item.Type)}
              </b>

              <br>

              <small>
                ${esc(item.Date)}
                •
                ${esc(item.Purpose || "")}

                ${
                  item.Notes
                    ? " • " +
                      esc(item.Notes)
                    : ""
                }
              </small>

            </div>

            <div>

              <b>
                ${fmt(item.Amount)}
              </b>

              <br>

              <button
                class="danger"
                onclick="del('transactions','${item.ID}')"
              >
                Delete
              </button>

            </div>

          </div>
        `).join("")
        ||
        "<p class='muted'>No records</p>";

  }


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
          val("gtDate") ||
          today(),

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
    ].forEach(id => {

      if ($(id)) {
        $(id).value = "";
      }

    });

    renderAll();

    toast("Saved");

  } catch (error) {

    toast(error.message);

  }

}


/* =================================================
   SPLITTER HELPERS
================================================= */

function parseJSON(
  value,
  fallback = []
) {

  try {

    return typeof value === "string"
      ? JSON.parse(value)
      : value || fallback;

  } catch (error) {

    return fallback;

  }

}


function groupById(id) {

  return (
    DB.splitGroups || []
  ).find(
    item =>
      String(item.ID) ===
      String(id)
  );

}


/* =================================================
   SPLITTER
================================================= */

function renderSplitter() {

  const groups =
    DB.splitGroups || [];


  [
    "spGroupSel",
    "spGroupExpense"
  ].forEach(id => {

    opt(
      $(id),
      groups,
      group =>
        group["Group Name"],
      group =>
        group.ID,
      "Select group"
    );

  });


  const groupId =
    val("spGroupSel") ||
    val("spGroupExpense");


  const group =
    groupById(groupId);


  const members =
    group
      ? parseJSON(
          group["Members JSON"],
          []
        )
      : [];


  opt(
    $("spPaidBy"),
    members,
    member => member,
    member => member,
    "Paid by"
  );


  if ($("memberChips")) {

    $("memberChips").innerHTML =
      members
        .map(member => `
          <span class="chip">
            ${esc(member)}
          </span>
        `)
        .join("");

  }


  const expenses =
    (DB.splitExpenses || [])
      .filter(item =>
        !groupId ||
        String(
          item["Group ID"]
        ) ===
        String(groupId)
      );


  if ($("splitExpenseList")) {

    $("splitExpenseList").innerHTML =
      expenses
        .map(item => `
          <div class="item">

            <div>

              <b>
                ${esc(item.Title)}
              </b>

              <br>

              <small>
                ${esc(item.Date)}
                • Paid by
                ${esc(item["Paid By"])}
              </small>

            </div>

            <div>

              <b>
                ${fmt(item.Amount)}
              </b>

              <br>

              <button
                class="danger"
                onclick="del('splitExpenses','${item.ID}')"
              >
                Delete
              </button>

            </div>

          </div>
        `)
        .join("")
        ||
        "<p class='muted'>No expenses</p>";

  }


  const balances = {};

  members.forEach(member => {

    balances[member] = 0;

  });


  expenses.forEach(expense => {

    const participants =
      parseJSON(
        expense["Members JSON"],
        members
      );


    const custom =
      parseJSON(
        expense["Custom Shares JSON"],
        {}
      );


    balances[
      expense["Paid By"]
    ] =
      (
        balances[
          expense["Paid By"]
        ] || 0
      ) +
      num(expense.Amount);


    participants.forEach(member => {

      balances[member] =
        (
          balances[member] || 0
        ) -
        (
          num(custom[member]) ||
          num(expense.Amount) /
          Math.max(
            1,
            participants.length
          )
        );

    });

  });


  if ($("splitSummary")) {

    $("splitSummary").innerHTML =
      Object.entries(balances)
        .map(
          ([member, balance]) =>
            card(
              member,
              fmt(balance)
            )
        )
        .join("");

  }


  if ($("settlementList")) {

    $("settlementList").innerHTML =
      Object.entries(balances)
        .filter(
          ([, balance]) =>
            Math.abs(balance) > 0.01
        )
        .map(
          ([member, balance]) => `
            <div class="item">

              <b>
                ${esc(member)}
              </b>

              <span>
                ${
                  balance > 0
                    ? "Should receive "
                    : "Should pay "
                }
                ${fmt(Math.abs(balance))}
              </span>

            </div>
          `
        )
        .join("")
        ||
        "<p class='muted'>Select a group</p>";

  }


  if ($("splitList")) {

    $("splitList").innerHTML =
      groups
        .map(groupItem => `
          <div class="item">

            <div>

              <b>
                ${esc(
                  groupItem["Group Name"]
                )}
              </b>

              <br>

              <small>
                ${esc(groupItem.Category)}
                •
                ${
                  parseJSON(
                    groupItem["Members JSON"],
                    []
                  )
                    .map(esc)
                    .join(", ")
                }
              </small>

            </div>

            <button
              class="danger"
              onclick="del('splitGroups','${groupItem.ID}')"
            >
              Delete
            </button>

          </div>
        `)
        .join("");

  }

}


async function addGroup() {

  const name =
    val("spGroup");

  const members =
    unique(
      val("spMembers")
        .split(",")
        .map(
          item =>
            item.trim()
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
          JSON.stringify(
            members
          )
      }
    );

    $("spGroup").value = "";
    $("spMembers").value = "";

    renderAll();

    toast("Group created");

  } catch (error) {

    toast(error.message);

  }

}


async function addMember() {

  const group =
    groupById(
      val("spGroupSel")
    );

  const member =
    val("newMember");


  if (
    !group ||
    !member
  ) {
    return toast(
      "Select group and member"
    );
  }


  const members =
    unique([
      ...parseJSON(
        group["Members JSON"],
        []
      ),
      member
    ]);


  try {

    await save(
      "splitGroups",
      {
        ...group,

        "Members JSON":
          JSON.stringify(
            members
          )
      }
    );

    $("newMember").value = "";

    renderAll();

    toast("Member added");

  } catch (error) {

    toast(error.message);

  }

}


async function renameGroup() {

  const group =
    groupById(
      val("spGroupSel")
    );


  if (!group) {
    return toast(
      "Select group"
    );
  }


  const name =
    prompt(
      "New group name",
      group["Group Name"]
    );


  if (!name) {
    return;
  }


  try {

    await save(
      "splitGroups",
      {
        ...group,

        "Group Name":
          name
      }
    );

    renderAll();

    toast("Renamed");

  } catch (error) {

    toast(error.message);

  }

}


async function saveSplitExpense() {

  const groupId =
    val("spGroupExpense");

  const group =
    groupById(groupId);

  const amount =
    num(val("spAmount"));


  if (
    !group ||
    !val("spTitle") ||
    !amount ||
    !val("spPaidBy")
  ) {
    return toast(
      "Complete all required fields"
    );
  }


  const allMembers =
    parseJSON(
      group["Members JSON"],
      []
    );


  const participants =
    unique(
      val("spMembersSel")
        .split(",")
        .map(
          item =>
            item.trim()
        )
        .filter(Boolean)
    );


  try {

    await save(
      "splitExpenses",
      {
        "Group ID":
          groupId,

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
              : allMembers
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
    ].forEach(id => {

      if ($(id)) {
        $(id).value = "";
      }

    });

    renderAll();

    toast("Expense saved");

  } catch (error) {

    toast(error.message);

  }

}


/* =================================================
   INVESTMENTS
================================================= */

function renderInvestments() {

  const baskets =
    DB.baskets || [];

  const assets =
    DB.assets || [];


  opt(
    $("assetBasket"),
    baskets,
    basket =>
      basket["Basket Name"],
    basket =>
      basket.ID,
    "Select basket"
  );


  const total =
    assets.reduce(
      (sum, item) =>
        sum +
        num(item["Monthly Amount"]),
      0
    );


  if ($("investmentDash")) {

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

  }


  if ($("basketList")) {

    $("basketList").innerHTML =
      baskets
        .map(basket => {

          const basketAssets =
            assets.filter(asset =>
              String(
                asset["Basket ID"]
              ) ===
              String(basket.ID)
            );

          return `
            <div class="item">

              <div>

                <b>
                  ${esc(
                    basket["Basket Name"]
                  )}
                </b>

                <br>

                <small>
                  ${
                    basketAssets
                      .map(asset =>
                        esc(
                          asset["Asset Name"]
                        ) +
                        " " +
                        fmt(
                          asset[
                            "Monthly Amount"
                          ]
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
                onclick="del('baskets','${basket.ID}')"
              >
                Delete
              </button>

            </div>
          `;

        })
        .join("")
        ||
        "<p class='muted'>No baskets</p>";

  }


  chart(
    "investmentChart",
    "doughnut",
    {
      labels:
        assets.map(
          item =>
            item["Asset Name"]
        ),

      datasets: [
        {
          data:
            assets.map(
              item =>
                num(
                  item["Monthly Amount"]
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

  const basketName =
    val("sipBasket");


  if (!basketName) {
    return toast(
      "Basket name required"
    );
  }


  try {

    let personRecord =
      (DB.people || [])
        .find(item =>
          String(
            item.Name
          ).toLowerCase() ===
          person.toLowerCase()
        );


    if (
      person &&
      !personRecord
    ) {

      personRecord =
        await save(
          "people",
          {
            Name:
              person
          }
        );

    }


    await save(
      "baskets",
      {
        "Person ID":
          personRecord?.ID || "",

        "Basket Name":
          basketName
      }
    );


    if ($("sipBasket")) {
      $("sipBasket").value = "";
    }

    renderAll();

    toast("Basket created");

  } catch (error) {

    toast(error.message);

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
          num(
            val("assetAmount")
          )
      }
    );

    [
      "assetName",
      "assetAmount"
    ].forEach(id => {

      if ($(id)) {
        $(id).value = "";
      }

    });

    renderAll();

    toast("Asset saved");

  } catch (error) {

    toast(error.message);

  }

}


/* =================================================
   VEHICLE HELPERS
================================================= */

function displayDate(value) {

  if (!value) {
    return "";
  }

  const stringValue =
    String(value);

  if (
    stringValue.includes("T")
  ) {
    return stringValue.slice(0, 10);
  }

  return stringValue;

}


function vehicleName(id) {

  return (
    DB.vehicles || []
  ).find(
    vehicle =>
      String(vehicle.ID) ===
      String(id)
  )?.["Vehicle Name"] ||
  "Vehicle";

}


/*
  Get fuel records in chronological order.

  IMPORTANT:
  Date is primary sorting.
  Odometer is secondary sorting.
*/

function getVehicleFuelRecords(vehicleId) {

  return (DB.fuel || [])
    .filter(
      record =>
        String(
          record["Vehicle ID"]
        ) ===
        String(vehicleId)
    )
    .slice()
    .sort((a, b) => {

      const dateCompare =
        String(a.Date || "")
          .localeCompare(
            String(b.Date || "")
          );

      if (
        dateCompare !== 0
      ) {
        return dateCompare;
      }

      return (
        num(a.Odometer) -
        num(b.Odometer)
      );

    });

}


/*
  Previous fuel entry before a specific record.
*/

function previousFuelRecord(record) {

  const records =
    getVehicleFuelRecords(
      record["Vehicle ID"]
    );

  const index =
    records.findIndex(
      item =>
        String(item.ID) ===
        String(record.ID)
    );

  if (index <= 0) {
    return null;
  }

  return records[index - 1];

}


/*
  Calculate distance travelled between
  previous and current odometer.
*/

function fuelDistance(record) {

  const previous =
    previousFuelRecord(record);

  if (!previous) {
    return null;
  }

  const currentOdo =
    num(record.Odometer);

  const previousOdo =
    num(previous.Odometer);

  const distance =
    currentOdo -
    previousOdo;

  if (
    distance < 0 ||
    !currentOdo ||
    !previousOdo
  ) {
    return null;
  }

  return distance;

}


/*
  Calculate approximate mileage.

  Distance between previous and current fill
  divided by previous fuel quantity.

  This gives the fuel efficiency for the fuel
  consumed since the previous fill.
*/

function fuelMileage(record) {

  const previous =
    previousFuelRecord(record);

  const distance =
    fuelDistance(record);

  if (
    !previous ||
    distance === null
  ) {
    return null;
  }

  const previousQuantity =
    num(previous.Quantity);

  if (
    previousQuantity <= 0
  ) {
    return null;
  }

  return (
    distance /
    previousQuantity
  );

}


function recentRecords(
  array,
  limit = 10
) {

  return [...array]
    .sort(
      (a, b) =>
        String(b.Date || "")
          .localeCompare(
            String(a.Date || "")
          )
    )
    .slice(0, limit);

}


function latestFuelOdometer(vehicleId) {

  const records =
    getVehicleFuelRecords(
      vehicleId
    );

  if (!records.length) {
    return 0;
  }

  return Math.max(
    ...records.map(
      record =>
        num(record.Odometer)
    )
  );

}


/* =================================================
   MAINTENANCE HELPERS
================================================= */

function getMaintenanceRecord(
  vehicleId,
  type
) {

  const keywords =
    type === "oil"
      ? [
          "oil",
          "oil change"
        ]
      : [
          "service",
          "servicing"
        ];


  const records =
    (DB.maintenance || [])
      .filter(record => {

        if (
          String(
            record["Vehicle ID"]
          ) !==
          String(vehicleId)
        ) {
          return false;
        }

        const category =
          String(
            record.Category || ""
          ).toLowerCase();

        return keywords.some(
          keyword =>
            category.includes(
              keyword
            )
        );

      })
      .sort((a, b) => {

        const kmDifference =
          num(b.Odometer) -
          num(a.Odometer);

        if (
          kmDifference !== 0
        ) {
          return kmDifference;
        }

        return String(
          b.Date || ""
        ).localeCompare(
          String(
            a.Date || ""
          )
        );

      });


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


/* =================================================
   MAINTENANCE CARD
================================================= */

function maintenanceCard(vehicle) {

  const vehicleId =
    vehicle.ID;

  const interval =
    getServiceInterval(
      vehicle
    );

  const currentKM =
    latestFuelOdometer(
      vehicleId
    );


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
    lastOilKM > 0
      ? lastOilKM + interval
      : 0;


  const nextServiceTarget =
    lastServiceKM > 0
      ? lastServiceKM + interval
      : 0;


  const oilRemaining =
    nextOilTarget > 0
      ? nextOilTarget -
        currentKM
      : 0;


  const serviceRemaining =
    nextServiceTarget > 0
      ? nextServiceTarget -
        currentKM
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
            vehicle["Vehicle Type"] ||
            ""
          )
            .toLowerCase()
            .includes("bike")
            ? "🏍️"
            : "🚗"
        }

        ${esc(
          vehicle["Vehicle Name"]
        )}
      </h3>


      <div class="maint-row">

        <span>
          Current Odometer
        </span>

        <b>
          ${
            currentKM
              ? currentKM.toLocaleString(
                  "en-IN"
                ) + " km"
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
              ? displayDate(
                  lastOil.Date
                ) +
                " · " +
                lastOilKM.toLocaleString(
                  "en-IN"
                ) +
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
              ? nextOilTarget.toLocaleString(
                  "en-IN"
                ) + " km"
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
                    ? oilRemaining.toLocaleString(
                        "en-IN"
                      ) + " km"
                    : Math.abs(
                        oilRemaining
                      ).toLocaleString(
                        "en-IN"
                      ) +
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
              ? displayDate(
                  lastService.Date
                ) +
                " · " +
                lastServiceKM.toLocaleString(
                  "en-IN"
                ) +
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
              ? nextServiceTarget.toLocaleString(
                  "en-IN"
                ) + " km"
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
                    ? serviceRemaining.toLocaleString(
                        "en-IN"
                      ) + " km"
                    : Math.abs(
                        serviceRemaining
                      ).toLocaleString(
                        "en-IN"
                      ) +
                      " km overdue"
                )
              : "—"
          }

        </b>

      </div>


      <div class="maintenance-interval">

        ${
          String(
            vehicle["Vehicle Type"] ||
            ""
          )
            .toLowerCase()
            .includes("bike")
            ? "Oil Change & Service every 3,000 km"
            : "Oil Change & Service every 10,000 km"
        }

      </div>

    </div>
  `;

}


/* =================================================
   VEHICLES
================================================= */

function renderVehicles() {

  const vehicles =
    DB.vehicles || [];


  const type =
    val("vehicleTypeFilter");

  const vehicleId =
    val("vehicleFilter");


  opt(
    $("vehicleFilter"),

    vehicles.filter(
      vehicle =>
        !type ||
        vehicle["Vehicle Type"] ===
        type
    ),

    vehicle =>
      vehicle["Vehicle Name"],

    vehicle =>
      vehicle.ID,

    "All Vehicles"
  );


  [
    "fuelVehicle",
    "maintVehicle"
  ].forEach(id => {

    opt(
      $(id),

      vehicles,

      vehicle =>
        vehicle["Vehicle Name"],

      vehicle =>
        vehicle.ID,

      "Select vehicle"
    );

  });


  const fuels =
    (DB.fuel || [])
      .filter(record =>
        !vehicleId ||
        String(
          record["Vehicle ID"]
        ) ===
        String(vehicleId)
      );


  const maintenance =
    (DB.maintenance || [])
      .filter(record =>
        !vehicleId ||
        String(
          record["Vehicle ID"]
        ) ===
        String(vehicleId)
      );


  const fuelCost =
    fuels.reduce(
      (sum, record) =>
        sum + num(record.Amount),
      0
    );


  const maintenanceCost =
    maintenance.reduce(
      (sum, record) =>
        sum + num(record.Amount),
      0
    );


  if ($("vehicleDash")) {

    $("vehicleDash").innerHTML =
      card(
        "Fuel Cost",
        fmt(fuelCost)
      ) +
      card(
        "Maintenance Cost",
        fmt(maintenanceCost)
      ) +
      card(
        "Total Cost",
        fmt(
          fuelCost +
          maintenanceCost
        )
      );

  }


  /* ===============================
     RECENT FUEL
  =============================== */

  const recentFuel =
    recentRecords(
      fuels,
      10
    );


  if ($("fuelList")) {

    $("fuelList").innerHTML =
      recentFuel
        .map(record => {

          const previous =
            previousFuelRecord(
              record
            );

          const distance =
            fuelDistance(
              record
            );

          const mileage =
            fuelMileage(
              record
            );


          return `
            <div class="item">

              <div>

                <b>
                  ${esc(
                    vehicleName(
                      record["Vehicle ID"]
                    )
                  )}
                </b>

                <br>

                <small>

                  ${displayDate(
                    record.Date
                  )}

                  •
                  ODO:
                  ${num(
                    record.Odometer
                  ).toLocaleString(
                    "en-IN"
                  )} km

                  ${
                    previous
                      ? `
                        <br>
                        Previous ODO:
                        ${num(
                          previous.Odometer
                        ).toLocaleString(
                          "en-IN"
                        )} km
                      `
                      : ""
                  }

                  ${
                    distance !== null
                      ? `
                        <br>
                        🛣️ Distance:
                        <b>
                          ${distance.toLocaleString(
                            "en-IN"
                          )} km
                        </b>
                      `
                      : `
                        <br>
                        🛣️ Distance:
                        First fuel record
                      `
                  }

                  ${
                    mileage !== null &&
                    isFinite(mileage)
                      ? `
                        <br>
                        ⛽ Mileage:
                        <b>
                          ${mileage.toFixed(
                            2
                          )} km/L
                        </b>
                      `
                      : ""
                  }

                  <br>

                  ⛽
                  ${num(
                    record.Quantity
                  )} L

                </small>

              </div>


              <div>

                <b>
                  ${fmt(
                    record.Amount
                  )}
                </b>

                <br>

                <button
                  class="danger"
                  onclick="del('fuel','${record.ID}')"
                >
                  Delete
                </button>

              </div>

            </div>
          `;

        })
        .join("")
        ||
        "<p class='muted'>No recent fuel entries</p>";

  }


  /* ===============================
     RECENT MAINTENANCE
  =============================== */

  const recentMaintenance =
    recentRecords(
      maintenance,
      10
    );


  if ($("maintenanceList")) {

    $("maintenanceList").innerHTML =
      recentMaintenance
        .map(record => `
          <div class="item">

            <div>

              <b>
                ${esc(
                  vehicleName(
                    record["Vehicle ID"]
                  )
                )}

                •

                ${esc(
                  record.Category
                )}
              </b>

              <br>

              <small>

                ${displayDate(
                  record.Date
                )}

                •
                ${num(
                  record.Odometer
                ).toLocaleString(
                  "en-IN"
                )} km

                ${
                  record.Remarks
                    ? " • " +
                      esc(
                        record.Remarks
                      )
                    : ""
                }

              </small>

            </div>


            <div>

              <b>
                ${fmt(
                  record.Amount
                )}
              </b>

              <br>

              <button
                class="danger"
                onclick="del('maintenance','${record.ID}')"
              >
                Delete
              </button>

            </div>

          </div>
        `)
        .join("")
        ||
        "<p class='muted'>No recent maintenance entries</p>";

  }


  /* ===============================
     MAINTENANCE SUMMARY
  =============================== */

  const selectedVehicles =
    vehicles.filter(vehicle =>
      !vehicleId ||
      String(vehicle.ID) ===
      String(vehicleId)
    );


  if ($("vehicleMaintenanceSummary")) {

    $("vehicleMaintenanceSummary").innerHTML =
      selectedVehicles
        .map(
          maintenanceCard
        )
        .join("");

  }


  /* ===============================
     FUEL SUMMARY CHART
  =============================== */

  const chartVehicles =
    selectedVehicles.length
      ? selectedVehicles
      : vehicles;


  const labels =
    chartVehicles.map(
      vehicle =>
        vehicle["Vehicle Name"]
    );


  chart(
    "fuelChart",
    "bar",
    {
      labels,

      datasets: [
        {
          label:
            "Fuel Cost",

          data:
            chartVehicles.map(vehicle =>
              (DB.fuel || [])
                .filter(record =>
                  String(
                    record["Vehicle ID"]
                  ) ===
                  String(vehicle.ID)
                )
                .reduce(
                  (sum, record) =>
                    sum +
                    num(record.Amount),
                  0
                )
            )
        }
      ]
    }
  );


  /* ===============================
     MAINTENANCE CHART
  =============================== */

  chart(
    "maintenanceChart",
    "bar",
    {
      labels,

      datasets: [
        {
          label:
            "Maintenance Cost",

          data:
            chartVehicles.map(vehicle =>
              (DB.maintenance || [])
                .filter(record =>
                  String(
                    record["Vehicle ID"]
                  ) ===
                  String(vehicle.ID)
                )
                .reduce(
                  (sum, record) =>
                    sum +
                    num(record.Amount),
                  0
                )
            )
        }
      ]
    }
  );

}


/* =================================================
   ADD VEHICLE
================================================= */

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
    ].forEach(id => {

      if ($(id)) {
        $(id).value = "";
      }

    });


    renderAll();

    toast("Vehicle added");

  } catch (error) {

    console.error(error);

    toast(error.message);

  }

}


/* =================================================
   ADD FUEL

   Previous odometer is automatically calculated.
================================================= */

async function addFuel() {

  const vehicleId =
    val("fuelVehicle");

  const amount =
    num(val("fuelAmount"));

  const odometer =
    num(val("fuelOdo"));


  if (
    !vehicleId ||
    !amount
  ) {
    return toast(
      "Vehicle and fuel amount are required"
    );
  }


  if (
    odometer <= 0
  ) {
    return toast(
      "Enter current odometer reading"
    );
  }


  /*
    Find previous odometer before saving.
  */

  const previousRecords =
    getVehicleFuelRecords(
      vehicleId
    );


  const previous =
    previousRecords.length
      ? previousRecords[
          previousRecords.length - 1
        ]
      : null;


  const previousOdometer =
    previous
      ? num(previous.Odometer)
      : 0;


  const distance =
    previousOdometer > 0
      ? odometer -
        previousOdometer
      : null;


  if (
    distance !== null &&
    distance < 0
  ) {
    return toast(
      "Current odometer cannot be lower than previous reading (" +
      previousOdometer.toLocaleString("en-IN") +
      " km)"
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
          odometer,

        Quantity:
          num(
            val("fuelQty")
          ),

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
      "fuelQty",
      "fuelAmount",
      "fuelNotes"
    ].forEach(id => {

      if ($(id)) {
        $(id).value = "";
      }

    });


    renderAll();


    /*
      Show useful confirmation.
    */

    if (
      distance !== null
    ) {

      toast(
        "Fuel saved • Distance travelled: " +
        distance.toLocaleString("en-IN") +
        " km"
      );

    } else {

      toast(
        "Fuel saved • First odometer record"
      );

    }

  } catch (error) {

    console.error(error);

    toast(error.message);

  }

}


/* =================================================
   ADD MAINTENANCE
================================================= */

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
          num(
            val("maintOdo")
          ),

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
    ].forEach(id => {

      if ($(id)) {
        $(id).value = "";
      }

    });


    renderAll();

    toast(
      "Maintenance saved"
    );

  } catch (error) {

    console.error(error);

    toast(error.message);

  }

}


function resetVehicleFilters() {

  if ($("vehicleTypeFilter")) {
    $("vehicleTypeFilter").value =
      "";
  }

  if ($("vehicleFilter")) {
    $("vehicleFilter").value =
      "";
  }

  renderVehicles();

}


/* =================================================
   LISTS / DROPDOWNS
================================================= */

function fillLists() {

  const categories =
    unique(
      (DB.passbook || [])
        .map(
          item =>
            item.Category
        )
    );


  opt(
    $("dashCategory"),
    categories,
    item => item,
    item => item,
    "All Categories"
  );


  opt(
    $("pbFilterCategory"),
    categories,
    item => item,
    item => item,
    "All Categories"
  );


  function dataList(
    id,
    array
  ) {

    const element =
      $(id);

    if (!element) {
      return;
    }

    element.innerHTML =
      unique(array)
        .map(item => `
          <option
            value="${esc(item)}"
          ></option>
        `)
        .join("");

  }


  dataList(
    "categoryList",
    categories
  );


  dataList(
    "accountList",
    (DB.passbook || [])
      .map(
        item =>
          item.Account
      )
  );


  dataList(
    "remarksList",
    (DB.passbook || [])
      .map(
        item =>
          item.Remarks
      )
  );


  dataList(
    "companyList",
    (DB.salary || [])
      .map(
        item =>
          item.Company
      )
  );


  dataList(
    "salaryRemarksList",
    (DB.salary || [])
      .map(
        item =>
          item.Remarks
      )
  );


  dataList(
    "personList",
    (DB.transactions || [])
      .map(
        item =>
          item.Person
      )
  );


  opt(
    $("emiLoan"),
    DB.loans || [],
    item =>
      item["Loan Name"],
    item =>
      item.ID,
    "Select loan"
  );

}


/* =================================================
   APP STARTUP
================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {


    const savedTheme =
      localStorage.getItem(
        "afh-theme"
      );


    if (
      savedTheme === "dark"
    ) {
      document.body.classList.add(
        "dark"
      );
    }


    if ($("themeBtn")) {

      $("themeBtn").onclick =
        () => {

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

    }


    if ($("menuBtn")) {

      $("menuBtn").onclick =
        () => {

          $("sidebar")?.classList.toggle(
            "open"
          );

        };

    }


    document
      .querySelectorAll(
        "[data-page]"
      )
      .forEach(button => {

        button.onclick =
          () => {

            document
              .querySelectorAll(
                ".page"
              )
              .forEach(page =>
                page.classList.remove(
                  "active"
                )
              );


            $(
              button.dataset.page
            )?.classList.add(
              "active"
            );


            $("sidebar")?.classList.remove(
              "open"
            );

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

          if ($("vehicleFilter")) {
            $("vehicleFilter").value =
              "";
          }

          renderVehicles();

        }
      );


    $("vehicleFilter")
      ?.addEventListener(
        "change",
        renderVehicles
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
