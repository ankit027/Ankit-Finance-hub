/* =========================================================
   ANKIT FINANCE HUB - COMPLETE APP.JS
   ========================================================= */

const DB_KEY = "ankit_finance_hub_v2";

let db = {
  passbook: [],
  salary: [],
  loans: [],
  emis: [],
  giveTake: [],
  splitGroups: [],
  splitExpenses: [],
  splitSettlements: [],
  baskets: [],
  assets: [],
  vehicles: [],
  fuel: [],
  maintenance: []
};

let charts = {};

const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
const num = v => Number(v || 0);
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);

function money(v) {
  return "₹" + Number(v || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });
}

/* =========================================================
   STORAGE
========================================================= */

function loadDB() {
  try {
    const data = JSON.parse(localStorage.getItem(DB_KEY));
    if (data) db = { ...db, ...data };
  } catch (e) {
    console.log(e);
  }
}

function saveDB() {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function saveAll() {
  saveDB();
  populateAllLists();
  renderAll();
}

function loadAll() {
  loadDB();
  populateAllLists();
  renderAll();
  toast("Cloud / Local data refreshed");
}

/* =========================================================
   TOAST
========================================================= */

function toast(message) {
  const el = $("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(window.toastTimer);

  window.toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2500);
}

/* =========================================================
   CHART
========================================================= */

function makeChart(id, type, labels, datasets) {
  const canvas = $(id);

  if (!canvas || typeof Chart === "undefined") return;

  if (charts[id]) {
    charts[id].destroy();
  }

  charts[id] = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true
        }
      },
      scales:
        type === "doughnut" || type === "pie"
          ? {}
          : {
              y: {
                beginAtZero: true
              }
            }
    }
  });
}

function card(title, amount) {
  return `
    <div>
      <small>${title}</small>
      <b>${money(amount)}</b>
    </div>
  `;
}

/* =========================================================
   DELETE
========================================================= */

function removeItem(collection, id) {
  db[collection] = db[collection].filter(x => x.id !== id);

  saveAll();

  toast("Deleted successfully");
}

/* =========================================================
   NAVIGATION
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

  loadDB();

  initDefaults();
  initNavigation();
  initListeners();

  populateAllLists();
  renderAll();

  if ($("status")) {
    $("status").textContent = "💾 Local Data";
  }

});

function initNavigation() {

  document.querySelectorAll("#sidebar button[data-page]")
    .forEach(button => {

      button.addEventListener("click", () => {

        document.querySelectorAll(".page")
          .forEach(page => page.classList.remove("active"));

        const page = $(button.dataset.page);

        if (page) {
          page.classList.add("active");
        }

        $("sidebar").classList.remove("open");

      });

    });

  $("menuBtn")?.addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
  });

  $("themeBtn")?.addEventListener("click", () => {

    document.body.classList.toggle("dark");

    const dark = document.body.classList.contains("dark");

    localStorage.setItem("financeTheme", dark ? "dark" : "light");

    $("themeBtn").textContent =
      dark ? "☀️ Light" : "🌙 Dark";

  });

  if (localStorage.getItem("financeTheme") === "dark") {

    document.body.classList.add("dark");

    if ($("themeBtn")) {
      $("themeBtn").textContent = "☀️ Light";
    }

  }

}

function initDefaults() {

  if ($("dashMonth")) $("dashMonth").value = currentMonth();

  if ($("salMonth")) $("salMonth").value = currentMonth();

  if ($("emiMonth")) $("emiMonth").value = currentMonth();

  [
    "pbDate",
    "gtDate",
    "spDate",
    "fuelDate",
    "maintDate"
  ].forEach(id => {

    if ($(id)) $(id).value = today();

  });

}

function initListeners() {

  $("dashMonth")?.addEventListener("change", renderDashboard);
  $("dashCategory")?.addEventListener("change", renderDashboard);

  $("pbFilterMonth")?.addEventListener("change", renderPassbook);
  $("pbFilterCategory")?.addEventListener("change", renderPassbook);

  $("vehicleTypeFilter")?.addEventListener("change", () => {

    populateVehicleFilters();
    renderVehicles();

  });

  $("vehicleFilter")?.addEventListener("change", renderVehicles);

  $("spGroupSel")?.addEventListener("change", () => {

    const id = $("spGroupSel").value;

    $("spGroupExpense").value = id;

    updateSplitGroup();

  });

  $("spGroupExpense")?.addEventListener("change", () => {

    const id = $("spGroupExpense").value;

    $("spGroupSel").value = id;

    updateSplitGroup();

  });

  $("spSplitType")?.addEventListener(
    "change",
    renderCustomShares
  );

}

/* =========================================================
   DASHBOARD
========================================================= */

function getDashboardRows() {

  const month = $("dashMonth").value;
  const category = $("dashCategory").value;

  return db.passbook.filter(x => {

    const monthMatch =
      !month ||
      String(x.date || "").startsWith(month);

    const categoryMatch =
      !category ||
      x.category === category;

    return monthMatch && categoryMatch;

  });

}

function renderDashboard() {

  const rows = getDashboardRows();

  const month = $("dashMonth").value;

  const income = rows
    .filter(x => x.type === "Income")
    .reduce((s, x) => s + num(x.amount), 0);

  const expense = rows
    .filter(x => x.type === "Expense")
    .reduce((s, x) => s + num(x.amount), 0);

  const salary = db.salary
    .filter(x => x.month === month)
    .reduce((s, x) => s + num(x.amount), 0);

  const emi = db.emis
    .filter(x => x.month === month)
    .reduce((s, x) => s + num(x.amount), 0);

  const sip = db.assets
    .reduce((s, x) => s + num(x.amount), 0);

  const toReceive = db.giveTake
    .filter(x =>
      x.type === "Receive" ||
      x.type === "Take"
    )
    .reduce((s, x) => s + num(x.amount), 0);

  const toPay = db.giveTake
    .filter(x =>
      x.type === "Give" ||
      x.type === "Pay"
    )
    .reduce((s, x) => s + num(x.amount), 0);

  $("dash").innerHTML =

    card("💰 Salary", salary) +

    card("📈 Total Income", income + salary) +

    card("💸 Expense", expense) +

    card("🏦 EMI Paid", emi) +

    card("📉 SIP Paid", sip) +

    card("🤝 To Receive", toReceive) +

    card("🤝 To Pay", toPay) +

    card(
      "💳 Net",
      income + salary - expense - emi - sip
    );

  const monthly = {};

  db.passbook.forEach(x => {

    const m = String(x.date || "").slice(0, 7);

    if (!m) return;

    if (!monthly[m]) {
      monthly[m] = {
        income: 0,
        expense: 0
      };
    }

    if (x.type === "Income") {
      monthly[m].income += num(x.amount);
    } else {
      monthly[m].expense += num(x.amount);
    }

  });

  const labels = Object.keys(monthly)
    .sort()
    .slice(-12);

  makeChart(
    "mainChart",
    "bar",
    labels,
    [
      {
        label: "Income",
        data: labels.map(x => monthly[x].income)
      },
      {
        label: "Expense",
        data: labels.map(x => monthly[x].expense)
      }
    ]
  );

  const categories = {};

  rows
    .filter(x => x.type === "Expense")
    .forEach(x => {

      const cat = x.category || "Other";

      categories[cat] =
        (categories[cat] || 0) +
        num(x.amount);

    });

  makeChart(
    "expenseChart",
    "doughnut",
    Object.keys(categories),
    [
      {
        label: "Expense",
        data: Object.values(categories)
      }
    ]
  );

}

function resetDashFilters() {

  $("dashMonth").value = currentMonth();

  $("dashCategory").value = "";

  renderDashboard();

}

/* =========================================================
   PASSBOOK
========================================================= */

function addPassbook() {

  const editId = $("pbEditId").value;

  const item = {

    id: editId || uid(),

    date:
      $("pbDate").value ||
      today(),

    type:
      $("pbType").value,

    category:
      $("pbCat").value.trim() ||
      "Other",

    amount:
      num($("pbAmt").value),

    account:
      $("pbAccount").value.trim(),

    remarks:
      $("pbRemarks").value.trim()

  };

  if (item.amount <= 0) {

    toast("Enter valid amount");

    return;

  }

  if (editId) {

    const index =
      db.passbook.findIndex(
        x => x.id === editId
      );

    if (index >= 0) {

      db.passbook[index] = item;

    }

    toast("Entry updated");

  } else {

    db.passbook.push(item);

    toast("Entry saved");

  }

  clearPassbook();

  saveAll();

}

function clearPassbook() {

  $("pbEditId").value = "";

  $("pbDate").value = today();

  $("pbType").value = "Expense";

  $("pbCat").value = "";

  $("pbAmt").value = "";

  $("pbAccount").value = "";

  $("pbRemarks").value = "";

  $("pbSaveBtn").textContent = "Save";

}

function editPassbook(id) {

  const x =
    db.passbook.find(
      x => x.id === id
    );

  if (!x) return;

  $("pbEditId").value = x.id;

  $("pbDate").value = x.date;

  $("pbType").value = x.type;

  $("pbCat").value = x.category;

  $("pbAmt").value = x.amount;

  $("pbAccount").value = x.account;

  $("pbRemarks").value = x.remarks;

  $("pbSaveBtn").textContent = "Update";

}

function getPassbookRows() {

  const month =
    $("pbFilterMonth").value;

  const category =
    $("pbFilterCategory").value;

  return db.passbook
    .filter(x => {

      const monthMatch =
        !month ||
        String(x.date || "")
          .startsWith(month);

      const categoryMatch =
        !category ||
        x.category === category;

      return monthMatch &&
        categoryMatch;

    })
    .sort((a, b) =>
      String(b.date).localeCompare(
        String(a.date)
      )
    );

}

function renderPassbook() {

  const rows =
    getPassbookRows();

  const income =
    rows
      .filter(x => x.type === "Income")
      .reduce(
        (s, x) =>
          s + num(x.amount),
        0
      );

  const expense =
    rows
      .filter(x => x.type === "Expense")
      .reduce(
        (s, x) =>
          s + num(x.amount),
        0
      );

  $("passbookDash").innerHTML =

    card("Income", income) +

    card("Expense", expense) +

    card(
      "Balance",
      income - expense
    );

  const categories = {};

  rows.forEach(x => {

    const cat =
      x.category || "Other";

    categories[cat] =
      (categories[cat] || 0) +
      num(x.amount);

  });

  makeChart(
    "passbookChart",
    "doughnut",
    Object.keys(categories),
    [
      {
        label: "Amount",
        data: Object.values(categories)
      }
    ]
  );

  $("pbList").innerHTML =
    rows.length
      ? rows.map(x => `
        <div class="item">

          <div>
            <b>${x.category}</b>

            <div class="muted">
              ${x.date} • ${x.type}
              ${x.account ? " • " + x.account : ""}
            </div>

            <div class="muted">
              ${x.remarks || ""}
            </div>
          </div>

          <div>
            <b>${money(x.amount)}</b>

            <button
              class="secondary"
              onclick="editPassbook('${x.id}')"
            >
              Edit
            </button>

            <button
              class="danger"
              onclick="removeItem('passbook','${x.id}')"
            >
              Delete
            </button>
          </div>

        </div>
      `).join("")

      : `<div class="item">
          No entries found.
        </div>`;

}

function resetPassbookFilters() {

  $("pbFilterMonth").value = "";

  $("pbFilterCategory").value = "";

  renderPassbook();

}

/* =========================================================
   SALARY
========================================================= */

function addSalary() {

  const amount =
    num($("salAmount").value);

  if (amount <= 0) {

    toast("Enter salary amount");

    return;

  }

  db.salary.push({

    id: uid(),

    month:
      $("salMonth").value ||
      currentMonth(),

    company:
      $("salCompany").value.trim() ||
      "Company",

    amount,

    remarks:
      $("salRemarks").value.trim()

  });

  $("salAmount").value = "";

  $("salRemarks").value = "";

  saveAll();

  toast("Salary saved");

}

function renderSalary() {

  const rows =
    [...db.salary]
      .sort((a, b) =>
        String(b.month)
          .localeCompare(
            String(a.month)
          )
      );

  const total =
    rows.reduce(
      (s, x) =>
        s + num(x.amount),
      0
    );

  const average =
    rows.length
      ? total / rows.length
      : 0;

  $("salaryDash").innerHTML =

    card(
      "Latest Salary",
      rows[0]?.amount || 0
    ) +

    card(
      "Total Salary",
      total
    ) +

    card(
      "Average Salary",
      average
    );

  makeChart(
    "salaryChart",
    "line",
    rows
      .slice()
      .reverse()
      .map(x => x.month),
    [
      {
        label: "Salary",
        data: rows
          .slice()
          .reverse()
          .map(x => num(x.amount))
      }
    ]
  );

  $("salaryList").innerHTML =
    rows.map(x => `
      <div class="item">

        <div>
          <b>${x.company}</b>

          <div class="muted">
            ${x.month}
            ${x.remarks ? " • " + x.remarks : ""}
          </div>
        </div>

        <div>
          <b>${money(x.amount)}</b>

          <button
            class="danger"
            onclick="removeItem('salary','${x.id}')"
          >
            Delete
          </button>
        </div>

      </div>
    `).join("");

}

/* =========================================================
   LOANS
========================================================= */

function addLoan() {

  const name =
    $("loanName").value.trim();

  const initial =
    num($("loanInitial").value);

  if (!name || initial <= 0) {

    toast("Enter loan details");

    return;

  }

  db.loans.push({

    id: uid(),

    name,

    initial,

    remarks:
      $("loanRemarks").value.trim()

  });

  $("loanName").value = "";

  $("loanInitial").value = "";

  $("loanRemarks").value = "";

  saveAll();

  toast("Loan added");

}

function addEmi() {

  const loanId =
    $("emiLoan").value;

  const amount =
    num($("emiAmount").value);

  if (!loanId || amount <= 0) {

    toast("Select loan and enter EMI");

    return;

  }

  db.emis.push({

    id: uid(),

    loanId,

    month:
      $("emiMonth").value ||
      currentMonth(),

    amount,

    remarks:
      $("emiRemarks").value.trim()

  });

  $("emiAmount").value = "";

  $("emiRemarks").value = "";

  saveAll();

  toast("EMI saved");

}

function getLoanPaid(id) {

  return db.emis
    .filter(x => x.loanId === id)
    .reduce(
      (s, x) =>
        s + num(x.amount),
      0
    );

}

function renderLoans() {

  const totalLoan =
    db.loans.reduce(
      (s, x) =>
        s + num(x.initial),
      0
    );

  const paid =
    db.emis.reduce(
      (s, x) =>
        s + num(x.amount),
      0
    );

  $("loanDash").innerHTML =

    card(
      "Total Loan",
      totalLoan
    ) +

    card(
      "EMI Paid",
      paid
    ) +

    card(
      "Outstanding",
      Math.max(
        0,
        totalLoan - paid
      )
    );

  makeChart(
    "loanChart",
    "bar",
    db.loans.map(x => x.name),
    [
      {
        label: "Outstanding",
        data:
          db.loans.map(x =>
            Math.max(
              0,
              num(x.initial) -
                getLoanPaid(x.id)
            )
          )
      }
    ]
  );

  $("loanList").innerHTML =
    db.loans.map(x => {

      const paid =
        getLoanPaid(x.id);

      const balance =
        Math.max(
          0,
          num(x.initial) -
            paid
        );

      return `
        <div class="item">

          <div>
            <b>${x.name}</b>

            <div class="muted">
              Original: ${money(x.initial)}
              • Paid: ${money(paid)}
              • Balance: ${money(balance)}
            </div>
          </div>

          <button
            class="danger"
            onclick="deleteLoan('${x.id}')"
          >
            Delete
          </button>

        </div>
      `;

    }).join("");

}

function deleteLoan(id) {

  db.loans =
    db.loans.filter(
      x => x.id !== id
    );

  db.emis =
    db.emis.filter(
      x => x.loanId !== id
    );

  saveAll();

}

/* =========================================================
   GIVE & TAKE
========================================================= */

function addGive() {

  const person =
    $("gtPerson").value.trim();

  const amount =
    num($("gtAmount").value);

  if (!person || amount <= 0) {

    toast("Enter person and amount");

    return;

  }

  db.giveTake.push({

    id: uid(),

    person,

    type:
      $("gtType").value,

    amount,

    date:
      $("gtDate").value ||
      today(),

    purpose:
      $("gtPurpose").value.trim(),

    notes:
      $("gtNotes").value.trim()

  });

  [
    "gtPerson",
    "gtAmount",
    "gtPurpose",
    "gtNotes"
  ].forEach(id =>
    $(id).value = ""
  );

  saveAll();

  toast("Saved");

}

function getPersonBalance(person) {

  let balance = 0;

  db.giveTake
    .filter(x => x.person === person)
    .forEach(x => {

      if (
        x.type === "Give" ||
        x.type === "Pay"
      ) {

        balance +=
          num(x.amount);

      } else {

        balance -=
          num(x.amount);

      }

    });

  return balance;

}

function renderGiveTake() {

  const persons =
    [...new Set(
      db.giveTake.map(
        x => x.person
      )
    )];

  const receive =
    persons.reduce(
      (s, person) =>
        s +
        Math.max(
          0,
          getPersonBalance(person)
        ),
      0
    );

  const pay =
    persons.reduce(
      (s, person) =>
        s +
        Math.max(
          0,
          -getPersonBalance(person)
        ),
      0
    );

  $("giveDash").innerHTML =

    card(
      "To Receive",
      receive
    ) +

    card(
      "To Pay",
      pay
    ) +

    card(
      "Net",
      receive - pay
    );

  $("gtDashboard").innerHTML =
    persons.map(person => {

      const balance =
        getPersonBalance(person);

      return card(
        person +
        (balance >= 0
          ? " - Receive"
          : " - Pay"),
        Math.abs(balance)
      );

    }).join("");

  makeChart(
    "giveChart",
    "bar",
    persons,
    [
      {
        label: "Balance",
        data:
          persons.map(
            getPersonBalance
          )
      }
    ]
  );

  const rows =
    [...db.giveTake]
      .sort((a, b) =>
        String(b.date)
          .localeCompare(
            String(a.date)
          )
      );

  $("gtList").innerHTML =
    rows.map(x => `
      <div class="item">

        <div>
          <b>
            ${x.person}
            • ${x.type}
          </b>

          <div class="muted">
            ${x.date}
            • ${x.purpose || ""}
          </div>
        </div>

        <div>
          <b>${money(x.amount)}</b>

          <button
            class="danger"
            onclick="removeItem('giveTake','${x.id}')"
          >
            Delete
          </button>
        </div>

      </div>
    `).join("");

}

/* =========================================================
   INVESTMENT & SIP
========================================================= */

function addBasket() {

  const name =
    $("sipBasket").value.trim();

  if (!name) {

    toast("Enter basket name");

    return;

  }

  db.baskets.push({

    id: uid(),

    person:
      $("sipPerson").value.trim() ||
      "Ankit",

    name

  });

  $("sipBasket").value = "";

  saveAll();

  toast("Basket created");

}

function addAsset() {

  const basketId =
    $("assetBasket").value;

  const name =
    $("assetName").value.trim();

  const amount =
    num($("assetAmount").value);

  if (
    !basketId ||
    !name ||
    amount <= 0
  ) {

    toast("Complete asset details");

    return;

  }

  db.assets.push({

    id: uid(),

    basketId,

    name,

    type:
      $("assetType").value,

    amount

  });

  $("assetName").value = "";

  $("assetAmount").value = "";

  saveAll();

  toast("Asset added");

}

/* IMPORTANT:
   This function fixes your "invest is not defined" issue.
*/
function renderInvestments() {

  const total =
    db.assets.reduce(
      (s, x) =>
        s + num(x.amount),
      0
    );

  const byType = {};

  db.assets.forEach(x => {

    byType[x.type] =
      (byType[x.type] || 0) +
      num(x.amount);

  });

  $("investmentDash").innerHTML =

    card(
      "Monthly SIP",
      total
    ) +

    card(
      "Annual Investment",
      total * 12
    ) +

    card(
      "Total Assets",
      db.assets.length
    ) +

    card(
      "Baskets",
      db.baskets.length
    );

  makeChart(
    "investmentChart",
    "doughnut",
    Object.keys(byType),
    [
      {
        label: "Monthly SIP",
        data:
          Object.values(byType)
      }
    ]
  );

  $("basketList").innerHTML =
    db.baskets.map(basket => {

      const assets =
        db.assets.filter(
          x =>
            x.basketId ===
            basket.id
        );

      const total =
        assets.reduce(
          (s, x) =>
            s + num(x.amount),
          0
        );

      return `
        <div class="box">

          <h3>
            ${basket.name}
          </h3>

          <p>
            ${basket.person}
          </p>

          <b>
            ${money(total)}
            / month
          </b>

          ${assets.map(asset => `
            <div class="item">

              <div>
                <b>
                  ${asset.name}
                </b>

                <div class="muted">
                  ${asset.type}
                </div>
              </div>

              <div>
                <b>
                  ${money(asset.amount)}
                </b>

                <button
                  class="danger"
                  onclick="removeItem('assets','${asset.id}')"
                >
                  Delete
                </button>
              </div>

            </div>
          `).join("")}

          <button
            class="danger"
            onclick="deleteBasket('${basket.id}')"
          >
            Delete Basket
          </button>

        </div>
      `;

    }).join("");

}

function deleteBasket(id) {

  db.baskets =
    db.baskets.filter(
      x => x.id !== id
    );

  db.assets =
    db.assets.filter(
      x => x.basketId !== id
    );

  saveAll();

}

/* =========================================================
   VEHICLES
========================================================= */

function addVehicle() {

  const name =
    $("vehicleName").value.trim();

  if (!name) {

    toast("Enter vehicle name");

    return;

  }

  db.vehicles.push({

    id: uid(),

    name,

    type:
      $("vehicleType").value,

    plate:
      $("vehiclePlate").value.trim()

  });

  $("vehicleName").value = "";

  $("vehiclePlate").value = "";

  saveAll();

  toast("Vehicle added");

}

function addFuel() {

  const vehicleId =
    $("fuelVehicle").value;

  const amount =
    num($("fuelAmount").value);

  if (
    !vehicleId ||
    amount <= 0
  ) {

    toast("Select vehicle and amount");

    return;

  }

  db.fuel.push({

    id: uid(),

    vehicleId,

    date:
      $("fuelDate").value ||
      today(),

    odo:
      num($("fuelOdo").value),

    qty:
      num($("fuelQty").value),

    amount,

    type:
      $("fuelType").value,

    notes:
      $("fuelNotes").value.trim()

  });

  [
    "fuelOdo",
    "fuelQty",
    "fuelAmount",
    "fuelNotes"
  ].forEach(
    id => $(id).value = ""
  );

  saveAll();

  toast("Fuel saved");

}

function addMaintenance() {

  const vehicleId =
    $("maintVehicle").value;

  if (!vehicleId) {

    toast("Select vehicle");

    return;

  }

  db.maintenance.push({

    id: uid(),

    vehicleId,

    date:
      $("maintDate").value ||
      today(),

    category:
      $("maintCategory").value,

    amount:
      num($("maintAmount").value),

    odo:
      num($("maintOdo").value),

    targetKm:
      num($("maintTargetKm").value),

    remarks:
      $("maintRemarks").value.trim()

  });

  [
    "maintAmount",
    "maintOdo",
    "maintTargetKm",
    "maintRemarks"
  ].forEach(
    id => $(id).value = ""
  );

  saveAll();

  toast("Maintenance saved");

}

function latestOdo(vehicleId) {

  const rows =
    db.fuel
      .filter(
        x =>
          x.vehicleId ===
          vehicleId
      )
      .sort(
        (a, b) =>
          num(b.odo) -
          num(a.odo)
      );

  return rows[0]?.odo || 0;

}

function renderVehicles() {

  const type =
    $("vehicleTypeFilter").value;

  const vehicleId =
    $("vehicleFilter").value;

  const vehicles =
    db.vehicles.filter(v => {

      const typeMatch =
        !type ||
        v.type === type;

      const vehicleMatch =
        !vehicleId ||
        v.id === vehicleId;

      return typeMatch &&
        vehicleMatch;

    });

  const fuelRows =
    db.fuel.filter(x =>
      vehicles.some(
        v =>
          v.id ===
          x.vehicleId
      )
    );

  const maintenanceRows =
    db.maintenance.filter(x =>
      vehicles.some(
        v =>
          v.id ===
          x.vehicleId
      )
    );

  const fuelCost =
    fuelRows.reduce(
      (s, x) =>
        s + num(x.amount),
      0
    );

  const maintenanceCost =
    maintenanceRows.reduce(
      (s, x) =>
        s + num(x.amount),
      0
    );

  $("vehicleDash").innerHTML =

    card(
      "Vehicles",
      vehicles.length
    ) +

    card(
      "Fuel Cost",
      fuelCost
    ) +

    card(
      "Maintenance Cost",
      maintenanceCost
    );

  $("vehicleMaintenanceSummary").innerHTML =
    vehicles.map(vehicle => {

      const current =
        num(
          latestOdo(vehicle.id)
        );

      const records =
        db.maintenance
          .filter(
            x =>
              x.vehicleId ===
              vehicle.id
          )
          .sort(
            (a, b) =>
              String(b.date)
                .localeCompare(
                  String(a.date)
                )
          );

      const last =
        records[0];

      if (!last) {

        return `
          <div class="maintenance-card">

            <h3>
              ${vehicle.name}
            </h3>

            <div class="muted">
              Current KM:
              ${current}
            </div>

          </div>
        `;

      }

      const next =
        num(last.odo) +
        num(last.targetKm);

      const remaining =
        next - current;

      let cls = "km-good";

      if (remaining < 0) {
        cls = "km-over";
      } else if (remaining < 500) {
        cls = "km-warn";
      }

      return `
        <div class="maintenance-card">

          <h3>
            ${vehicle.name}
          </h3>

          <div class="maint-row">
            <span>Current KM</span>
            <b>${current} km</b>
          </div>

          <div class="maint-row">
            <span>Last Service</span>
            <b>
              ${last.category}
              @ ${last.odo} km
            </b>
          </div>

          <div class="maint-row">
            <span>Next Target</span>
            <b>${next} km</b>
          </div>

          <div class="maint-row">
            <span>KM Remaining</span>
            <b class="${cls}">
              ${remaining} km
            </b>
          </div>

        </div>
      `;

    }).join("");

  const fuelData = {};
  const maintenanceData = {};

  vehicles.forEach(v => {

    fuelData[v.name] = 0;

    maintenanceData[v.name] = 0;

  });

  fuelRows.forEach(x => {

    const vehicle =
      db.vehicles.find(
        v => v.id === x.vehicleId
      );

    if (vehicle) {

      fuelData[vehicle.name] +=
        num(x.amount);

    }

  });

  maintenanceRows.forEach(x => {

    const vehicle =
      db.vehicles.find(
        v => v.id === x.vehicleId
      );

    if (vehicle) {

      maintenanceData[vehicle.name] +=
        num(x.amount);

    }

  });

  makeChart(
    "fuelChart",
    "bar",
    Object.keys(fuelData),
    [
      {
        label: "Fuel Cost",
        data:
          Object.values(fuelData)
      }
    ]
  );

  makeChart(
    "maintenanceChart",
    "bar",
    Object.keys(maintenanceData),
    [
      {
        label: "Maintenance Cost",
        data:
          Object.values(
            maintenanceData
          )
      }
    ]
  );

  $("fuelList").innerHTML =
    fuelRows
      .sort(
        (a, b) =>
          String(b.date)
            .localeCompare(
              String(a.date)
            )
      )
      .map(x => {

        const vehicle =
          db.vehicles.find(
            v =>
              v.id ===
              x.vehicleId
          );

        return `
          <div class="item">

            <div>
              <b>
                ${vehicle?.name || ""}
              </b>

              <div class="muted">
                ${x.date}
                • ${x.odo} km
                • ${x.qty} L
              </div>
            </div>

            <div>

              <b>
                ${money(x.amount)}
              </b>

              <button
                class="danger"
                onclick="removeItem('fuel','${x.id}')"
              >
                Delete
              </button>

            </div>

          </div>
        `;

      }).join("");

  $("maintenanceList").innerHTML =
    maintenanceRows
      .sort(
        (a, b) =>
          String(b.date)
            .localeCompare(
              String(a.date)
            )
      )
      .map(x => {

        const vehicle =
          db.vehicles.find(
            v =>
              v.id ===
              x.vehicleId
          );

        return `
          <div class="item">

            <div>

              <b>
                ${vehicle?.name || ""}
                • ${x.category}
              </b>

              <div class="muted">

                ${x.date}

                • ${x.odo} km

                ${x.targetKm
                  ? " • Next after " +
                    x.targetKm +
                    " km"
                  : ""
                }

              </div>

            </div>

            <div>

              <b>
                ${money(x.amount)}
              </b>

              <button
                class="danger"
                onclick="removeItem('maintenance','${x.id}')"
              >
                Delete
              </button>

            </div>

          </div>
        `;

      }).join("");

}

function resetVehicleFilters() {

  $("vehicleTypeFilter").value = "";

  $("vehicleFilter").value = "";

  renderVehicles();

}

/* =========================================================
   MONEY SPLITTER - BASIC
========================================================= */

function addGroup() {

  const name =
    $("spGroup").value.trim();

  const members =
    $("spMembers").value
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

  if (
    !name ||
    members.length === 0
  ) {

    toast(
      "Enter group and members"
    );

    return;

  }

  db.splitGroups.push({

    id: uid(),

    name,

    category:
      $("spCat").value,

    members

  });

  $("spGroup").value = "";

  $("spMembers").value = "";

  saveAll();

}

function addMember() {

  const group =
    db.splitGroups.find(
      x =>
        x.id ===
        $("spGroupSel").value
    );

  const member =
    $("newMember").value.trim();

  if (
    !group ||
    !member
  ) return;

  if (
    !group.members.includes(
      member
    )
  ) {

    group.members.push(member);

  }

  $("newMember").value = "";

  saveAll();

}

function renameGroup() {

  const group =
    db.splitGroups.find(
      x =>
        x.id ===
        $("spGroupSel").value
    );

  if (!group) return;

  const name =
    prompt(
      "New group name",
      group.name
    );

  if (name) {

    group.name =
      name.trim();

    saveAll();

  }

}

function updateSplitGroup() {

  const group =
    db.splitGroups.find(
      x =>
        x.id ===
        $("spGroupSel").value
    );

  if (!group) {

    $("memberChips").innerHTML = "";

    return;

  }

  $("memberChips").innerHTML =
    group.members
      .map(member => `
        <div class="chip">
          ${member}
        </div>
      `)
      .join("");

  $("spPaidBy").innerHTML =
    group.members
      .map(member =>
        `<option>${member}</option>`
      )
      .join("");

  $("spMembersSel").value =
    group.members.join(", ");

  renderSplitPage();

}

function renderCustomShares() {

  if (
    $("spSplitType").value !==
    "custom"
  ) {

    $("customShares").innerHTML =
      "";

    return;

  }

  const group =
    db.splitGroups.find(
      x =>
        x.id ===
        $("spGroupExpense").value
    );

  if (!group) return;

  $("customShares").innerHTML =
    group.members
      .map(member => `
        <div class="share">

          <span>
            ${member}
          </span>

          <input
            type="number"
            class="customShare"
            data-member="${member}"
            placeholder="Amount"
          >

        </div>
      `)
      .join("");

}

function saveSplitExpense() {

  const groupId =
    $("spGroupExpense").value;

  const group =
    db.splitGroups.find(
      x => x.id === groupId
    );

  const amount =
    num($("spAmount").value);

  if (
    !group ||
    amount <= 0
  ) {

    toast("Complete expense");

    return;

  }

  const participants =
    $("spMembersSel").value
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

  let shares = {};

  if (
    $("spSplitType").value ===
    "equal"
  ) {

    const share =
      amount /
      participants.length;

    participants.forEach(
      member =>
        shares[member] = share
    );

  } else {

    document
      .querySelectorAll(
        ".customShare"
      )
      .forEach(input => {

        shares[
          input.dataset.member
        ] =
          num(input.value);

      });

  }

  db.splitExpenses.push({

    id: uid(),

    groupId,

    title:
      $("spTitle").value.trim(),

    amount,

    paidBy:
      $("spPaidBy").value,

    date:
      $("spDate").value ||
      today(),

    shares

  });

  clearSplit();

  saveAll();

  toast("Expense saved");

}

function clearSplit() {

  $("splitEditId").value = "";

  $("spTitle").value = "";

  $("spAmount").value = "";

  $("customShares").innerHTML =
    "";

}

function renderSplitPage() {

  const groupId =
    $("spGroupSel").value;

  if (!groupId) {

    $("splitSummary").innerHTML =
      "";

    $("splitExpenseList").innerHTML =
      "";

    return;

  }

  const group =
    db.splitGroups.find(
      x => x.id === groupId
    );

  if (!group) return;

  const balances = {};

  group.members.forEach(
    member =>
      balances[member] = 0
  );

  const expenses =
    db.splitExpenses.filter(
      x =>
        x.groupId ===
        groupId
    );

  expenses.forEach(expense => {

    balances[
      expense.paidBy
    ] +=
      num(expense.amount);

    Object.entries(
      expense.shares
    ).forEach(
      ([member, value]) => {

        balances[member] -=
          num(value);

      }
    );

  });

  $("splitSummary").innerHTML =
    Object.entries(balances)
      .map(
        ([member, balance]) =>
          card(
            member,
            Math.abs(balance)
          )
      )
      .join("");

  $("splitExpenseList").innerHTML =
    expenses.map(x => `
      <div class="item">

        <div>

          <b>
            ${x.title}
          </b>

          <div class="muted">

            ${x.date}

            • Paid by
            ${x.paidBy}

          </div>

        </div>

        <div>

          <b>
            ${money(x.amount)}
          </b>

          <button
            class="danger"
            onclick="removeItem('splitExpenses','${x.id}')"
          >
            Delete
          </button>

        </div>

      </div>
    `).join("");

}

/* =========================================================
   LISTS
========================================================= */

function populateAllLists() {

  const categories =
    [
      ...new Set(
        db.passbook
          .map(x => x.category)
          .filter(Boolean)
      )
    ];

  const accounts =
    [
      ...new Set(
        db.passbook
          .map(x => x.account)
          .filter(Boolean)
      )
    ];

  const remarks =
    [
      ...new Set(
        db.passbook
          .map(x => x.remarks)
          .filter(Boolean)
      )
    ];

  fillDatalist(
    "categoryList",
    categories
  );

  fillDatalist(
    "accountList",
    accounts
  );

  fillDatalist(
    "remarksList",
    remarks
  );

  $("dashCategory").innerHTML =
    `<option value="">
      All Categories
    </option>` +
    categories.map(
      x =>
        `<option>${x}</option>`
    ).join("");

  $("pbFilterCategory").innerHTML =
    `<option value="">
      All Categories
    </option>` +
    categories.map(
      x =>
        `<option>${x}</option>`
    ).join("");

  $("emiLoan").innerHTML =
    `<option value="">
      Select Loan
    </option>` +
    db.loans.map(
      x =>
        `<option value="${x.id}">
          ${x.name}
        </option>`
    ).join("");

  $("assetBasket").innerHTML =
    `<option value="">
      Select Basket
    </option>` +
    db.baskets.map(
      x =>
        `<option value="${x.id}">
          ${x.name}
        </option>`
    ).join("");

  ["fuelVehicle", "maintVehicle"]
    .forEach(id => {

      $(id).innerHTML =
        `<option value="">
          Select Vehicle
        </option>` +
        db.vehicles.map(
          x =>
            `<option value="${x.id}">
              ${x.name}
            </option>`
        ).join("");

    });

  $("spGroupSel").innerHTML =
    `<option value="">
      Select Group
    </option>` +
    db.splitGroups.map(
      x =>
        `<option value="${x.id}">
          ${x.name}
        </option>`
    ).join("");

  $("spGroupExpense").innerHTML =
    `<option value="">
      Select Group
    </option>` +
    db.splitGroups.map(
      x =>
        `<option value="${x.id}">
          ${x.name}
        </option>`
    ).join("");

  populateVehicleFilters();

}

function fillDatalist(id, values) {

  const el = $(id);

  if (!el) return;

  el.innerHTML =
    values
      .map(
        x =>
          `<option value="${x}"></option>`
      )
      .join("");

}

function populateVehicleFilters() {

  const type =
    $("vehicleTypeFilter").value;

  const vehicles =
    db.vehicles.filter(
      x =>
        !type ||
        x.type === type
    );

  $("vehicleFilter").innerHTML =
    `<option value="">
      All Vehicles
    </option>` +
    vehicles.map(
      x =>
        `<option value="${x.id}">
          ${x.name}
        </option>`
    ).join("");

}

/* =========================================================
   RENDER ALL
========================================================= */

function renderAll() {

  renderDashboard();

  renderPassbook();

  renderSalary();

  renderLoans();

  renderGiveTake();

  renderInvestments();

  renderVehicles();

  renderSplitPage();

}
