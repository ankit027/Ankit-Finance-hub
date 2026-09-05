const API_URL = "https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";
const KEY = "ankit_finance_hub_final_v3";

let DB = {};
let charts = {};
let passbookEditId = "";

window.addEventListener("unhandledrejection", e => {
  console.error(e.reason);
  toast("⚠️ " + (e.reason?.message || "Something went wrong"));
});

const $ = id => document.getElementById(id);

const uid = () =>
  Date.now() + "-" + Math.random().toString(36).slice(2);

const n = x => Number(x || 0) || 0;

const m = x =>
  "₹" +
  n(x).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });

const ym = () =>
  new Date().toISOString().slice(0, 7);

const today = () =>
  new Date().toISOString().slice(0, 10);


/* =====================================================
   API
===================================================== */

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

  let data;

  try {
    data = JSON.parse(text);
  } catch (error) {
    console.error("Invalid response:", text);
    throw new Error("Invalid server response");
  }

  if (!data.success) {
    throw new Error(data.error || "Server error");
  }

  return data;
}


/* =====================================================
   UI HELPERS
===================================================== */

function toast(message) {

  const el = $("toast");

  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 2200);
}


function status(message) {

  const el = $("status");

  if (el) {
    el.textContent = message;
  }
}


function cache() {
  localStorage.setItem(KEY, JSON.stringify(DB));
}


/* =====================================================
   LOAD DATA
===================================================== */

async function loadAll() {

  try {

    status("☁️ Syncing...");

    const response = await api("loadAll");

    DB = response.data || {};

    cache();

    render();

    status("☁️ Synced");

  } catch (error) {

    console.error(error);

    status("⚠️ Sync Error");

    toast(
      error.message || "Unable to sync"
    );
  }
}


/* =====================================================
   SAVE
===================================================== */

async function save(table, data) {

  const before = JSON.parse(
    JSON.stringify(DB[table] || [])
  );

  DB[table] = DB[table] || [];

  const index = DB[table].findIndex(
    item => String(item.ID) === String(data.ID)
  );

  if (index < 0) {

    DB[table].push({
      ...data
    });

  } else {

    DB[table][index] = {
      ...DB[table][index],
      ...data
    };
  }

  cache();

  render();

  status("💾 Saving...");

  toast("✓ Saved successfully");

  try {

    const response = await api("save", {
      table,
      data
    });

    const record =
      response.data?.record ||
      response.record ||
      data;

    const savedIndex = DB[table].findIndex(
      item =>
        String(item.ID) === String(record.ID)
    );

    if (savedIndex < 0) {

      DB[table].push(record);

    } else {

      DB[table][savedIndex] = record;
    }

    cache();

    render();

    status("☁️ Synced");

    return record;

  } catch (error) {

    console.error(error);

    DB[table] = before;

    cache();

    render();

    status("⚠️ Sync failed");

    toast(
      "Save failed: " + error.message
    );

    throw error;
  }
}


/* =====================================================
   DELETE
===================================================== */

async function del(table, id) {

  if (!confirm("Delete this record?")) {
    return;
  }

  try {

    await api("delete", {
      table,
      id
    });

    DB[table] = (DB[table] || []).filter(
      item => String(item.ID) !== String(id)
    );

    cache();

    render();

    toast("✓ Deleted successfully");

  } catch (error) {

    console.error(error);

    toast(
      "Delete failed: " + error.message
    );
  }
}


/* =====================================================
   NAVIGATION
===================================================== */

document.querySelectorAll("[data-page]").forEach(button => {

  button.onclick = () => {

    document
      .querySelectorAll(".page")
      .forEach(page =>
        page.classList.remove("active")
      );

    const page = $(button.dataset.page);

    if (page) {
      page.classList.add("active");
    }

    const sidebar = $("sidebar");

    if (sidebar) {
      sidebar.classList.remove("open");
    }

    draw();
  };
});


$("menuBtn").onclick = () => {
  $("sidebar").classList.toggle("open");
};


$("themeBtn").onclick = () => {

  document.body.classList.toggle("dark");

  $("themeBtn").textContent =
    document.body.classList.contains("dark")
      ? "☀️ Light"
      : "🌙 Dark";

  draw();
};


/* =====================================================
   COMMON HTML
===================================================== */

function card(title, value) {

  return `
    <div>
      <small>${title}</small>
      <b>${value}</b>
    </div>
  `;
}


function item(left, right, actions = "") {

  return `
    <div class="item">
      <span>${left}</span>
      <span>
        ${right}
        ${actions}
      </span>
    </div>
  `;
}


/* =====================================================
   CHART
===================================================== */

function chart(id, type, labels, data, label) {

  const canvas = $(id);

  if (!canvas) return;

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


/* =====================================================
   MAIN RENDER
===================================================== */

function render() {

  lists();

  syncDashboardFilters();

  dash();

  passbook();

  salary();

  loans();

  give();

  invest();

  split();

  vehicles();

  draw();
}


/* =====================================================
   FILTERS
===================================================== */

function syncDashboardFilters() {

  const categories = [
    ...new Set(
      (DB.passbook || [])
        .map(x =>
          String(x.Category || "").trim()
        )
        .filter(Boolean)
    )
  ].sort();

  ["dashCategory", "pbFilterCategory"]
    .forEach(id => {

      const el = $(id);

      if (!el) return;

      const previous = el.value;

      el.innerHTML =
        `<option value="">All Categories</option>` +
        categories
          .map(category =>
            `<option value="${category}">
              ${category}
            </option>`
          )
          .join("");

      if (categories.includes(previous)) {
        el.value = previous;
      }
    });

  if ($("dashMonth") && !$("dashMonth").value) {
    $("dashMonth").value = ym();
  }

  if (
    $("pbFilterMonth") &&
    !$("pbFilterMonth").value
  ) {
    $("pbFilterMonth").value = ym();
  }
}


function resetDashFilters() {

  $("dashMonth").value = ym();

  $("dashCategory").value = "";

  render();
}


function resetPassbookFilters() {

  $("pbFilterMonth").value = ym();

  $("pbFilterCategory").value = "";

  render();
}


function dashFilter() {

  return {
    month: $("dashMonth")?.value || ym(),
    category: $("dashCategory")?.value || ""
  };
}


function pbFilter() {

  return {
    month:
      $("pbFilterMonth")?.value || ym(),

    category:
      $("pbFilterCategory")?.value || ""
  };
}


function filterPassbook(
  rows,
  month,
  category
) {

  return rows.filter(x => {

    const monthMatch =
      !month ||
      String(x.Date || "")
        .slice(0, 7) === month;

    const categoryMatch =
      !category ||
      String(x.Category || "") === category;

    return monthMatch && categoryMatch;
  });
}


/* =====================================================
   DASHBOARD
===================================================== */

function dash() {

  const filter = dashFilter();

  const month = filter.month;

  const passbookRows =
    filterPassbook(
      DB.passbook || [],
      month,
      filter.category
    );

  const salaries = DB.salary || [];

  const emis = DB.emi || [];

  const payments =
    DB.sipPayments || [];


  const otherIncome =
    passbookRows
      .filter(
        x =>
          String(x.Type || "")
            .toLowerCase() === "income"
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  const expense =
    passbookRows
      .filter(
        x =>
          String(x.Type || "")
            .toLowerCase() === "expense"
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  const salaryIncome =
    salaries
      .filter(
        x => x.Month === month
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  const totalIncome =
    salaryIncome +
    otherIncome;


  const emi =
    emis
      .filter(
        x => x.Month === month
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  const sip =
    payments
      .filter(
        x => x.Month === month
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  const balances =
    Object.values(giveBal());


  const receive =
    balances
      .filter(
        x => x.balance > 0
      )
      .reduce(
        (sum, x) =>
          sum + x.balance,
        0
      );


  const owe =
    balances
      .filter(
        x => x.balance < 0
      )
      .reduce(
        (sum, x) =>
          sum - x.balance,
        0
      );


  $("dash").innerHTML = [

    ["💰 Salary", m(salaryIncome)],

    ["📈 Total Income", m(totalIncome)],

    ["💸 Expense", m(expense)],

    ["🏦 EMI Paid", m(emi)],

    ["📈 SIP Paid", m(sip)],

    ["🤝 To Receive", m(receive)],

    ["🤝 To Pay", m(owe)],

    [
      "💳 Net",
      m(
        totalIncome -
        expense -
        emi -
        sip
      )
    ]

  ]
    .map(x => card(...x))
    .join("");
}


/* =====================================================
   PASSBOOK
===================================================== */

  function passbook() {
  const f = pbFilter();

  const p = filterPassbook(
    DB.passbook || [],
    f.month,
    f.category
  );

  const income = p
    .filter(x => String(x.Type || "").toLowerCase() === "income")
    .reduce((a, x) => a + n(x.Amount), 0);

  const expense = p
    .filter(x => String(x.Type || "").toLowerCase() === "expense")
    .reduce((a, x) => a + n(x.Amount), 0);

  $("passbookDash").innerHTML = [
    ["Income", m(income)],
    ["Expense", m(expense)],
    ["Net", m(income - expense)],
    ["Entries", p.length]
  ].map(x => card(...x)).join("");

  $("pbList").innerHTML =
    p.slice()
      .sort((a, b) =>
        String(b.Date || "").localeCompare(String(a.Date || ""))
      )
      .map(x => item(
        `${x.Date || ""} • <b>${x.Category || ""}</b> • ${x.Type || ""}`,
        m(x.Amount),
        `
        <button class="secondary" onclick="editPassbook('${x.ID}')">
          ✏️ Edit
        </button>
        <button class="danger" onclick="del('passbook','${x.ID}')">
          Delete
        </button>
        `
      ))
      .join("") ||
    "<p>No records for selected filter</p>";
}
/* =====================================================
   SALARY
===================================================== */

function salary() {

  const salaries = DB.salary || [];

  const month = ym();


  const current =
    salaries
      .filter(
        x => x.Month === month
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  const total =
    salaries.reduce(
      (sum, x) =>
        sum + n(x.Amount),
      0
    );


  $("salaryDash").innerHTML = [

    ["This Month", m(current)],

    ["Total", m(total)],

    ["Entries", salaries.length],

    [
      "Companies",
      new Set(
        salaries.map(
          x => x.Company
        )
      ).size
    ]

  ]
    .map(x => card(...x))
    .join("");


  $("salaryList").innerHTML =
    salaries
      .slice()
      .reverse()
      .map(x =>
        item(
          `
          ${x.Month}
          • ${x.Company}
          `,
          m(x.Amount),
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
      .join("")
    ||
    "<p>No salary records</p>";
}


/* =====================================================
   LOANS
===================================================== */

function loans() {

  const loanList = DB.loans || [];

  const emis = DB.emi || [];

  const month = ym();


  const initial =
    loanList.reduce(
      (sum, x) =>
        sum +
        n(x["Initial Amount"]),
      0
    );


  const paid =
    emis.reduce(
      (sum, x) =>
        sum + n(x.Amount),
      0
    );


  const monthly =
    emis
      .filter(
        x => x.Month === month
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  $("loanDash").innerHTML = [

    ["Initial Loans", m(initial)],

    ["EMI This Month", m(monthly)],

    ["Total EMI Paid", m(paid)],

    ["Loans", loanList.length]

  ]
    .map(x => card(...x))
    .join("");


  $("emiLoan").innerHTML =
    `<option value="">
      Select loan
    </option>` +
    loanList
      .map(
        x =>
          `<option value="${x.ID}">
            ${x["Loan Name"]}
          </option>`
      )
      .join("");


  $("loanList").innerHTML =
    loanList
      .map(x => {

        const loanPaid =
          emis
            .filter(
              z =>
                z["Loan ID"] === x.ID
            )
            .reduce(
              (sum, z) =>
                sum + n(z.Amount),
              0
            );


        return item(
          `
          <b>${x["Loan Name"]}</b>
          <br>
          <small>
            Initial ${m(x["Initial Amount"])}
            • Paid ${m(loanPaid)}
            • Remaining ${m(
              Math.max(
                0,
                n(x["Initial Amount"]) -
                loanPaid
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
      .join("")
    ||
    "<p>No loans</p>";
}


/* =====================================================
   GIVE & TAKE
===================================================== */

function giveBal() {

  const output = {};

  (DB.transactions || [])
    .forEach(x => {

      const person =
        x.Person || "Unknown";

      if (!output[person]) {

        output[person] = {
          person,
          balance: 0,
          given: 0,
          received: 0,
          taken: 0,
          paid: 0
        };
      }

      const amount = n(x.Amount);

      const balance =
        output[person];


      if (x.Type === "Give") {

        balance.balance += amount;
        balance.given += amount;

      } else if (
        x.Type === "Receive"
      ) {

        balance.balance -= amount;
        balance.received += amount;

      } else if (
        x.Type === "Take"
      ) {

        balance.balance -= amount;
        balance.taken += amount;

      } else if (
        x.Type === "Pay"
      ) {

        balance.balance += amount;
        balance.paid += amount;
      }

    });

  return output;
}


function give() {

  const balances =
    Object.values(giveBal());


  const receive =
    balances
      .filter(
        x => x.balance > 0
      )
      .reduce(
        (sum, x) =>
          sum + x.balance,
        0
      );


  const pay =
    balances
      .filter(
        x => x.balance < 0
      )
      .reduce(
        (sum, x) =>
          sum - x.balance,
        0
      );


  $("giveDash").innerHTML = [

    ["To Receive", m(receive)],

    ["To Pay", m(pay)],

    ["Net", m(receive - pay)],

    ["People", balances.length]

  ]
    .map(x => card(...x))
    .join("");


  $("gtDashboard").innerHTML =
    balances
      .map(x =>
        card(
          `
          ${x.person}
          • ${
            x.balance > 0
              ? "To Receive"
              : x.balance < 0
              ? "To Pay"
              : "Settled"
          }
          `,
          m(Math.abs(x.balance))
        )
      )
      .join("");


  $("gtList").innerHTML =
    (DB.transactions || [])
      .slice()
      .reverse()
      .map(x =>
        item(
          `
          <b>${x.Person}</b>
          • ${x.Type}
          <br>
          <small>
            ${x.Date || ""}
            • ${x.Purpose || ""}
          </small>
          `,
          m(x.Amount),
          `
          <button
            class="secondary"
            onclick="editGive('${x.ID}')"
          >
            Edit
          </button>

          <button
            class="danger"
            onclick="del('transactions','${x.ID}')"
          >
            Delete
          </button>
          `
        )
      )
      .join("")
    ||
    "<p>No records</p>";
}


/* =====================================================
   EDIT GIVE & TAKE
===================================================== */

function editGive(id) {

  const record =
    (DB.transactions || [])
      .find(
        x =>
          String(x.ID) === String(id)
      );

  if (!record) {
    return;
  }

  const person = prompt(
    "Person",
    record.Person || ""
  );

  if (person === null) return;


  const type = prompt(
    "Type (Give / Receive / Take / Pay)",
    record.Type || ""
  );

  if (type === null) return;


  const amount = prompt(
    "Amount",
    record.Amount || ""
  );

  if (amount === null) return;


  const date = prompt(
    "Date (YYYY-MM-DD)",
    record.Date || today()
  );

  if (date === null) return;


  const purpose = prompt(
    "Purpose",
    record.Purpose || ""
  );

  if (purpose === null) return;


  const notes = prompt(
    "Notes",
    record.Notes || ""
  );

  if (notes === null) return;


  save("transactions", {
    ...record,

    Person: person.trim(),

    Type: type.trim(),

    Amount: n(amount),

    Date: date,

    Purpose: purpose,

    Notes: notes
  });
}


/* =====================================================
   INVESTMENTS
===================================================== */

function invest() {

  const baskets = DB.baskets || [];

  const assets = DB.assets || [];

  const payments =
    DB.sipPayments || [];


  const planned =
    assets.reduce(
      (sum, x) =>
        sum +
        n(x["Monthly Amount"]),
      0
    );


  const paid =
    payments
      .filter(
        x => x.Month === ym()
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  $("investmentDash").innerHTML = [

    ["Monthly Planned", m(planned)],

    ["Paid", m(paid)],

    [
      "Pending",
      m(
        Math.max(
          0,
          planned - paid
        )
      )
    ],

    ["Baskets", baskets.length]

  ]
    .map(x => card(...x))
    .join("");


  $("assetBasket").innerHTML =
    `<option value="">
      Select basket
    </option>` +
    baskets
      .map(
        x =>
          `<option value="${x.ID}">
            ${x["Basket Name"]}
          </option>`
      )
      .join("");


  $("basketList").innerHTML =
    baskets
      .map(x => {

        const basketAssets =
          assets.filter(
            z =>
              z["Basket ID"] === x.ID
          );


        const total =
          basketAssets.reduce(
            (sum, z) =>
              sum +
              n(z["Monthly Amount"]),
            0
          );


        const done =
          payments.some(
            z =>
              z["Basket ID"] === x.ID &&
              z.Month === ym()
          );


        return item(
          `
          <b>${x["Basket Name"]}</b>
          <br>
          <small>
            ${basketAssets
              .map(
                z =>
                  z["Asset Name"]
              )
              .join(", ")}
          </small>
          `,
          m(total),
          done
            ? "✓ PAID"
            : `
              <button
                onclick="markBasket('${x.ID}',${total})"
              >
                Mark Paid
              </button>
            `
        );

      })
      .join("")
    ||
    "<p>No baskets</p>";
}


/* =====================================================
   VEHICLES
===================================================== */

function vehicles() {

  const vehicleList =
    DB.vehicles || [];

  const fuel =
    DB.fuel || [];

  const maintenance =
    DB.maintenance || [];


  const previousFuel =
    $("fuelVehicle").value;

  const previousMaint =
    $("maintVehicle").value;


  const options =
    `<option value="">
      Select vehicle
    </option>` +
    vehicleList
      .map(
        vehicle =>
          `<option value="${vehicle.ID}">
            ${vehicle["Vehicle Name"]}
            • ${vehicle["Vehicle Type"]}
          </option>`
      )
      .join("");


  $("fuelVehicle").innerHTML =
    options;

  $("maintVehicle").innerHTML =
    options;


  if (
    vehicleList.some(
      v => v.ID === previousFuel
    )
  ) {
    $("fuelVehicle").value =
      previousFuel;
  }


  if (
    vehicleList.some(
      v => v.ID === previousMaint
    )
  ) {
    $("maintVehicle").value =
      previousMaint;
  }


  const fuelTotal =
    fuel.reduce(
      (sum, x) =>
        sum + n(x.Amount),
      0
    );


  const maintenanceTotal =
    maintenance.reduce(
      (sum, x) =>
        sum + n(x.Amount),
      0
    );


  const month = ym();


  const monthlyFuel =
    fuel
      .filter(
        x =>
          String(x.Date || "")
            .slice(0, 7) === month
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  const monthlyMaintenance =
    maintenance
      .filter(
        x =>
          String(x.Date || "")
            .slice(0, 7) === month
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  $("vehicleDash").innerHTML = [

    ["Vehicles", vehicleList.length],

    ["Fuel This Month", m(monthlyFuel)],

    [
      "Maintenance This Month",
      m(monthlyMaintenance)
    ],

    ["Total Fuel", m(fuelTotal)],

    [
      "Total Maintenance",
      m(maintenanceTotal)
    ],

    [
      "Total Vehicle Cost",
      m(
        fuelTotal +
        maintenanceTotal
      )
    ]

  ]
    .map(x => card(...x))
    .join("");


  $("fuelList").innerHTML =
    fuel
      .slice()
      .sort(
        (a, b) =>
          String(b.Date)
            .localeCompare(
              String(a.Date)
            )
      )
      .map(x => {

        const vehicle =
          vehicleList.find(
            z =>
              z.ID ===
              x["Vehicle ID"]
          );


        return item(
          `
          <b>
            ${
              vehicle
                ? vehicle["Vehicle Name"]
                : "Unknown Vehicle"
            }
          </b>
          <br>
          <small>
            ${x.Date}
            • ${x.Odometer || "-"} km
            • ${x.Quantity || 0} L
            • ${x["Fuel Type"] || "Fuel"}
            • ${x.Notes || ""}
          </small>
          `,
          m(x.Amount),
          `
          <button
            class="danger"
            onclick="del('fuel','${x.ID}')"
          >
            Delete
          </button>
          `
        );

      })
      .join("")
    ||
    "<p>No fuel entries</p>";


  $("maintenanceList").innerHTML =
    maintenance
      .slice()
      .sort(
        (a, b) =>
          String(b.Date)
            .localeCompare(
              String(a.Date)
            )
      )
      .map(x => {

        const vehicle =
          vehicleList.find(
            z =>
              z.ID ===
              x["Vehicle ID"]
          );


        return item(
          `
          <b>
            ${
              vehicle
                ? vehicle["Vehicle Name"]
                : "Unknown Vehicle"
            }
          </b>
          <br>
          <small>
            ${x.Date}
            • ${x.Category}
            • ${x.Odometer || "-"} km
            • ${x.Remarks || ""}
          </small>
          `,
          m(x.Amount),
          `
          <button
            class="danger"
            onclick="del('maintenance','${x.ID}')"
          >
            Delete
          </button>
          `
        );

      })
      .join("")
    ||
    "<p>No maintenance entries</p>";
}


/* =====================================================
   ADD VEHICLE
===================================================== */

function addVehicle() {

  const name =
    $("vehicleName").value.trim();

  if (!name) {
    return toast(
      "Enter vehicle name"
    );
  }

  return save("vehicles", {

    ID: uid(),

    "Vehicle Name": name,

    "Vehicle Type":
      $("vehicleType").value,

    "Number Plate":
      $("vehiclePlate")
        .value
        .trim()
  });
}


/* =====================================================
   ADD FUEL
===================================================== */

async function addFuel() {

  const vehicleId =
    $("fuelVehicle").value;

  if (!vehicleId) {
    return toast(
      "Select vehicle"
    );
  }

  const amount =
    n($("fuelAmount").value);

  if (amount <= 0) {
    return toast(
      "Enter valid fuel amount"
    );
  }

  const id = uid();

  const fuelRecord =
    await save("fuel", {

      ID: id,

      "Vehicle ID":
        vehicleId,

      Date:
        $("fuelDate").value ||
        today(),

      Odometer:
        n(
          $("fuelOdo").value
        ),

      Quantity:
        n(
          $("fuelQty").value
        ),

      Amount:
        amount,

      "Fuel Type":
        $("fuelType").value,

      Notes:
        $("fuelNotes").value,

      "Passbook ID":
        id
    });


  const vehicle =
    (DB.vehicles || [])
      .find(
        v => v.ID === vehicleId
      );


  await save("passbook", {

    ID: id,

    Date:
      fuelRecord.Date,

    Type:
      "Expense",

    Category:
      "Petrol / Fuel",

    Amount:
      amount,

    Account:
      "Vehicle Tracker",

    Remarks:
      vehicle?.["Vehicle Name"] ||
      "Fuel",

    "Source ID":
      id
  });


  $("fuelAmount").value = "";
  $("fuelQty").value = "";
  $("fuelNotes").value = "";

  toast("✓ Fuel saved successfully");
}


/* =====================================================
   ADD MAINTENANCE
===================================================== */

async function addMaintenance() {

  const vehicleId =
    $("maintVehicle").value;

  if (!vehicleId) {
    return toast(
      "Select vehicle"
    );
  }

  const amount =
    n($("maintAmount").value);

  if (amount <= 0) {
    return toast(
      "Enter valid maintenance amount"
    );
  }

  const id = uid();


  const record =
    await save("maintenance", {

      ID: id,

      "Vehicle ID":
        vehicleId,

      Date:
        $("maintDate").value ||
        today(),

      Category:
        $("maintCategory").value,

      Amount:
        amount,

      Odometer:
        n(
          $("maintOdo").value
        ),

      Remarks:
        $("maintRemarks").value,

      "Passbook ID":
        id
    });


  const vehicle =
    (DB.vehicles || [])
      .find(
        v => v.ID === vehicleId
      );


  await save("passbook", {

    ID: id,

    Date:
      record.Date,

    Type:
      "Expense",

    Category:
      "Vehicle Maintenance",

    Amount:
      amount,

    Account:
      "Vehicle Tracker",

    Remarks:
      `${record.Category} - ${
        vehicle?.["Vehicle Name"] ||
        "Vehicle"
      }`,

    "Source ID":
      id
  });


  $("maintAmount").value = "";
  $("maintOdo").value = "";
  $("maintRemarks").value = "";

  toast(
    "✓ Maintenance saved successfully"
  );
}


/* =====================================================
   SPLITWISE HELPERS
===================================================== */

const members = group => {

  try {
    return JSON.parse(
      group["Members JSON"] || "[]"
    );
  } catch (error) {
    return [];
  }
};


const json = (value, fallback = []) => {

  try {
    return JSON.parse(
      value || ""
    );
  } catch (error) {
    return fallback;
  }
};


/* =====================================================
   SPLIT CALCULATION
===================================================== */

function calc(group) {

  const state = {};

  members(group).forEach(name => {

    state[name] = {
      name,
      paid: 0,
      share: 0,
      out: 0,
      in: 0,
      net: 0
    };

  });


  const expenses =
    (DB.splitExpenses || [])
      .filter(
        x =>
          x["Group ID"] ===
          group.ID
      );


  expenses.forEach(expense => {

    const amount =
      n(expense.Amount);

    const payer =
      expense["Paid By"];


    if (!state[payer]) {

      state[payer] = {
        name: payer,
        paid: 0,
        share: 0,
        out: 0,
        in: 0,
        net: 0
      };
    }


    state[payer].paid += amount;


    let participants =
      json(
        expense["Members JSON"],
        []
      );


    if (!participants.length) {
      participants =
        members(group);
    }


    const custom =
      json(
        expense[
          "Custom Shares JSON"
        ],
        null
      );


    participants.forEach(name => {

      if (!state[name]) {

        state[name] = {
          name,
          paid: 0,
          share: 0,
          out: 0,
          in: 0,
          net: 0
        };
      }


      state[name].share +=
        custom
          ? n(custom[name])
          : amount /
            participants.length;

    });

  });


  (DB.splitSettlements || [])
    .filter(
      x =>
        x["Group ID"] ===
        group.ID
    )
    .forEach(settlement => {

      if (state[settlement.From]) {
        state[
          settlement.From
        ].out +=
          n(settlement.Amount);
      }

      if (state[settlement.To]) {
        state[
          settlement.To
        ].in +=
          n(settlement.Amount);
      }

    });


  Object.values(state)
    .forEach(person => {

      person.net =
        person.paid -
        person.share +
        person.out -
        person.in;

    });


  return {
    ex: expenses,
    st: Object.values(state),
    total:
      expenses.reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      )
  };
}


/* =====================================================
   SETTLEMENT
===================================================== */

function settle(state) {

  const creditors =
    state
      .filter(
        x => x.net > 0.01
      )
      .map(x => ({
        name: x.name,
        amount: x.net
      }));


  const debtors =
    state
      .filter(
        x => x.net < -0.01
      )
      .map(x => ({
        name: x.name,
        amount: -x.net
      }));


  const output = [];

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


    output.push({

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

  return output;
}


/* =====================================================
   SPLIT RENDER
===================================================== */

function split() {

  const groups =
    DB.splitGroups || [];


  const currentId =
    $("spGroupSel").value ||
    groups[0]?.ID ||
    "";


  const options =
    `<option value="">
      Select group
    </option>` +
    groups
      .map(
        group =>
          `<option value="${group.ID}">
            ${group["Group Name"]}
          </option>`
      )
      .join("");


  $("spGroupSel").innerHTML =
    options;

  $("spGroupExpense").innerHTML =
    options;


  $("spGroupSel").value =
    currentId;

  $("spGroupExpense").value =
    currentId;


  const group =
    groups.find(
      x =>
        x.ID === currentId
    );


  if (!group) {

    $("splitSummary").innerHTML =
      "";

    return;
  }


  const memberList =
    members(group);


  $("spPaidBy").innerHTML =
    `<option value="">
      Paid by
    </option>` +
    memberList
      .map(
        name =>
          `<option>
            ${name}
          </option>`
      )
      .join("");


  $("memberChips").innerHTML =
    memberList
      .map(
        name =>
          `
          <span class="chip">
            ${name}

            <button
              class="danger"
              onclick="removeMember('${name}')"
            >
              ×
            </button>
          </span>
          `
      )
      .join("");


  const calculation =
    calc(group);


  $("splitSummary").innerHTML = [

    [
      "Total Expenses",
      m(calculation.total)
    ],

    [
      "Expenses",
      calculation.ex.length
    ],

    ...calculation.st.map(
      person => [
        `
        ${person.name}
        • ${
          person.net > 0
            ? "Receive"
            : person.net < 0
            ? "Pay"
            : "Settled"
        }
        `,
        m(
          Math.abs(
            person.net
          )
        )
      ]
    )

  ]
    .map(x => card(...x))
    .join("");


  $("settlementList").innerHTML =
    settle(calculation.st)
      .map(x =>
        item(
          `
          <b>${x.from}</b>
          →
          <b>${x.to}</b>
          `,
          m(x.amount),
          `
          <button
            class="success"
            onclick="
              settleNow(
                '${group.ID}',
                '${x.from}',
                '${x.to}',
                ${x.amount}
              )
            "
          >
            Mark Settled
          </button>
          `
        )
      )
      .join("")
    ||
    "<p>🎉 Everyone is settled!</p>";


  $("splitExpenseList").innerHTML =
    calculation.ex
      .slice()
      .reverse()
      .map(x =>
        item(
          `
          <b>${x.Title}</b>
          <br>

          <small>
            ${x.Date}
            • Paid by ${x["Paid By"]}
            • ${
              json(
                x["Members JSON"],
                []
              ).join(", ")
            }
          </small>
          `,
          m(x.Amount),
          `
          <button
            class="secondary"
            onclick="editExpense('${x.ID}')"
          >
            Edit
          </button>

          <button
            class="danger"
            onclick="
              del(
                'splitExpenses',
                '${x.ID}'
              )
            "
          >
            Delete
          </button>
          `
        )
      )
      .join("")
    ||
    "<p>No expenses</p>";


  $("splitSettlementHistory").innerHTML =
    (DB.splitSettlements || [])
      .filter(
        x =>
          x["Group ID"] ===
          group.ID
      )
      .slice()
      .reverse()
      .map(x =>
        item(
          `
          <b>${x.From}</b>
          paid
          <b>${x.To}</b>

          <br>

          <small>
            ${x.Date}
          </small>
          `,
          m(x.Amount),
          `
          <button
            class="danger"
            onclick="
              del(
                'splitSettlements',
                '${x.ID}'
              )
            "
          >
            Delete
          </button>
          `
        )
      )
      .join("")
    ||
    "<p>No settlements</p>";


  $("splitList").innerHTML =
    groups
      .map(
        x =>
          `
          <div class="item">

            <span>
              <b>
                ${x["Group Name"]}
              </b>

              <br>

              <small>
                ${
                  members(x)
                    .join(", ")
                }
              </small>
            </span>

            <button
              class="secondary"
              onclick="openGroup('${x.ID}')"
            >
              Open
            </button>

          </div>
          `
      )
      .join("");


  shares();
}


function openGroup(id) {

  $("spGroupSel").value =
    id;

  $("spGroupExpense").value =
    id;

  split();

  draw();
}


/* =====================================================
   CUSTOM SHARES
===================================================== */

function shares() {

  if (
    $("spSplitType").value !==
    "custom"
  ) {

    $("customShares").innerHTML =
      "";

    return;
  }


  const group =
    (DB.splitGroups || [])
      .find(
        x =>
          x.ID ===
          $("spGroupExpense").value
      );


  if (!group) return;


  let participants =
    $("spMembersSel")
      .value
      .split(",")
      .map(
        x => x.trim()
      )
      .filter(Boolean);


  if (!participants.length) {
    participants =
      members(group);
  }


  $("customShares").innerHTML =
    participants
      .map(
        name =>
          `
          <div class="share">

            <span>
              ${name}
            </span>

            <input
              class="shareamt"
              data-name="${name}"
              type="number"
              placeholder="Amount"
            >

          </div>
          `
      )
      .join("");
}


/* =====================================================
   SPLIT GROUP
===================================================== */

async function addGroup() {

  const name =
    $("spGroup")
      .value
      .trim();


  const memberList =
    $("spMembers")
      .value
      .split(",")
      .map(
        x => x.trim()
      )
      .filter(Boolean);


  if (
    !name ||
    memberList.length < 2
  ) {
    return toast(
      "Enter group name and minimum 2 members"
    );
  }


  const group =
    await save(
      "splitGroups",
      {

        ID: uid(),

        "Group Name":
          name,

        Category:
          $("spCat").value,

        "Members JSON":
          JSON.stringify(
            [...new Set(memberList)]
          )

      }
    );


  $("spGroup").value =
    "";

  $("spMembers").value =
    "";


  openGroup(group.ID);
}


async function addMember() {

  const group =
    (DB.splitGroups || [])
      .find(
        x =>
          x.ID ===
          $("spGroupSel").value
      );


  const name =
    $("newMember")
      .value
      .trim();


  if (
    !group ||
    !name
  ) {
    return toast(
      "Select group and enter member"
    );
  }


  const memberList =
    members(group);


  if (
    memberList.includes(name)
  ) {
    return toast(
      "Already added"
    );
  }


  await save(
    "splitGroups",
    {
      ...group,

      "Members JSON":
        JSON.stringify([
          ...memberList,
          name
        ])
    }
  );


  $("newMember").value =
    "";
}


async function removeMember(name) {

  const group =
    (DB.splitGroups || [])
      .find(
        x =>
          x.ID ===
          $("spGroupSel").value
      );


  if (
    !group ||
    !confirm(
      `Remove ${name}?`
    )
  ) {
    return;
  }


  await save(
    "splitGroups",
    {
      ...group,

      "Members JSON":
        JSON.stringify(
          members(group)
            .filter(
              member =>
                member !== name
            )
        )
    }
  );
}


async function renameGroup() {

  const group =
    (DB.splitGroups || [])
      .find(
        x =>
          x.ID ===
          $("spGroupSel").value
      );


  const name =
    prompt(
      "Group name",
      group?.["Group Name"]
    );


  if (
    name?.trim()
  ) {

    await save(
      "splitGroups",
      {
        ...group,

        "Group Name":
          name.trim()
      }
    );
  }
}


/* =====================================================
   SPLIT EXPENSE
===================================================== */

function clearSplit() {

  $("splitEditId").value =
    "";

  $("spTitle").value =
    "";

  $("spAmount").value =
    "";

  $("spMembersSel").value =
    "";

  $("spDate").value =
    today();

  $("spSplitType").value =
    "equal";

  $("customShares").innerHTML =
    "";
}


function editExpense(id) {

  const expense =
    (DB.splitExpenses || [])
      .find(
        x => x.ID === id
      );


  if (!expense) return;


  $("splitEditId").value =
    id;

  $("spGroupExpense").value =
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
    json(
      expense["Members JSON"],
      []
    ).join(", ");


  $("spSplitType").value =
    expense[
      "Custom Shares JSON"
    ]
      ? "custom"
      : "equal";


  shares();


  const custom =
    json(
      expense[
        "Custom Shares JSON"
      ],
      {}
    );


  document
    .querySelectorAll(
      ".shareamt"
    )
    .forEach(input => {

      input.value =
        n(
          custom[
            input.dataset.name
          ]
        );

    });
}


async function saveSplitExpense() {

  const group =
    (DB.splitGroups || [])
      .find(
        x =>
          x.ID ===
          $("spGroupExpense").value
      );


  const amount =
    n(
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
    $("spMembersSel")
      .value
      .split(",")
      .map(
        x => x.trim()
      )
      .filter(Boolean);


  if (!participants.length) {
    participants =
      members(group);
  }


  let custom =
    "";


  if (
    $("spSplitType").value ===
    "custom"
  ) {

    const values = {};

    document
      .querySelectorAll(
        ".shareamt"
      )
      .forEach(input => {

        values[
          input.dataset.name
        ] =
          n(input.value);

      });


    const total =
      Object
        .values(values)
        .reduce(
          (sum, value) =>
            sum + value,
          0
        );


    if (
      Math.abs(
        total - amount
      ) > 0.01
    ) {
      return toast(
        "Custom total must equal expense amount"
      );
    }


    custom =
      JSON.stringify(values);
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
        $("spTitle").value ||
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
        custom,

      Date:
        $("spDate").value ||
        today()

    }
  );


  clearSplit();
}


async function settleNow(
  groupId,
  from,
  to,
  amount
) {

  if (
    confirm(
      `${from} paid ${m(amount)} to ${to}?`
    )
  ) {

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
}


/* =====================================================
   DATALISTS
===================================================== */

function lists() {

  const passbook =
    DB.passbook || [];

  const salaries =
    DB.salary || [];

  const transactions =
    DB.transactions || [];


  const fill =
    (id, values) => {

      const el = $(id);

      if (!el) return;

      el.innerHTML =
        [
          ...new Set(
            values.filter(Boolean)
          )
        ]
          .map(
            value =>
              `<option value="${value}">`
          )
          .join("");
    };


  fill(
    "categoryList",
    passbook.map(
      x => x.Category
    )
  );


  fill(
    "accountList",
    passbook.map(
      x => x.Account
    )
  );


  fill(
    "remarksList",
    passbook.map(
      x => x.Remarks
    )
  );


  fill(
    "companyList",
    salaries.map(
      x => x.Company
    )
  );


  fill(
    "salaryRemarksList",
    salaries.map(
      x => x.Remarks
    )
  );


  fill(
    "personList",
    transactions.map(
      x => x.Person
    )
  );


  fill(
    "vehicleNameList",
    (DB.vehicles || [])
      .map(
        x =>
          x["Vehicle Name"]
      )
  );
}


/* =====================================================
   DRAW CHARTS
===================================================== */

function draw() {

  const filter =
    dashFilter();

  const month =
    filter.month;


  const passbookRows =
    filterPassbook(
      DB.passbook || [],
      month,
      filter.category
    );


  const salaries =
    DB.salary || [];

  const emis =
    DB.emi || [];

  const loanList =
    DB.loans || [];

  const assets =
    DB.assets || [];


  const otherIncome =
    passbookRows
      .filter(
        x =>
          String(x.Type || "")
            .toLowerCase() ===
            "income"
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  const expense =
    passbookRows
      .filter(
        x =>
          String(x.Type || "")
            .toLowerCase() ===
            "expense"
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  const salaryIncome =
    salaries
      .filter(
        x =>
          x.Month === month
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  const totalIncome =
    salaryIncome +
    otherIncome;


  const emi =
    emis
      .filter(
        x =>
          x.Month === month
      )
      .reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      );


  chart(
    "mainChart",
    "bar",

    [
      "Salary",
      "Other Income",
      "Total Income",
      "Expense",
      "EMI"
    ],

    [
      salaryIncome,
      otherIncome,
      totalIncome,
      expense,
      emi
    ],

    "Amount"
  );


  chart(
    "expenseChart",
    "doughnut",

    [
      "Total Income",
      "Expense"
    ],

    [
      totalIncome,
      expense
    ],

    "Amount"
  );


  chart(
    "passbookChart",
    "bar",

    [
      "Income",
      "Expense"
    ],

    [
      otherIncome,
      expense
    ],

    "Amount"
  );


  const salaryMonths =
    {};


  salaries.forEach(x => {

    salaryMonths[x.Month] =
      (salaryMonths[x.Month] || 0) +
      n(x.Amount);

  });


  chart(
    "salaryChart",
    "line",

    Object.keys(
      salaryMonths
    ),

    Object.values(
      salaryMonths
    ),

    "Salary"
  );


  chart(
    "loanChart",
    "doughnut",

    [
      "Initial",
      "EMI Paid"
    ],

    [

      loanList.reduce(
        (sum, x) =>
          sum +
          n(
            x["Initial Amount"]
          ),
        0
      ),

      emis.reduce(
        (sum, x) =>
          sum + n(x.Amount),
        0
      )

    ],

    "Amount"
  );


  const balances =
    Object.values(
      giveBal()
    );


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


  const group =
    (DB.splitGroups || [])
      .find(
        x =>
          x.ID ===
          $("spGroupSel")?.value
      );


  if (group) {

    const calculation =
      calc(group);

    chart(
      "splitChart",
      "bar",

      calculation.st.map(
        x => x.name
      ),

      calculation.st.map(
        x => x.paid
      ),

      "Paid"
    );
  }


  chart(
    "investmentChart",
    "doughnut",

    assets.map(
      x =>
        x["Asset Name"]
    ),

    assets.map(
      x =>
        n(
          x["Monthly Amount"]
        )
    ),

    "Monthly Amount"
  );


  const vehicleList =
    DB.vehicles || [];

  const fuel =
    DB.fuel || [];

  const maintenance =
    DB.maintenance || [];


  chart(
    "fuelChart",
    "bar",

    vehicleList.map(
      v =>
        v["Vehicle Name"]
    ),

    vehicleList.map(
      v =>
        fuel
          .filter(
            x =>
              x["Vehicle ID"] ===
              v.ID
          )
          .reduce(
            (sum, x) =>
              sum + n(x.Amount),
            0
          )
    ),

    "Fuel Cost"
  );


  chart(
    "maintenanceChart",
    "bar",

    vehicleList.map(
      v =>
        v["Vehicle Name"]
    ),

    vehicleList.map(
      v =>
        maintenance
          .filter(
            x =>
              x["Vehicle ID"] ===
              v.ID
          )
          .reduce(
            (sum, x) =>
              sum + n(x.Amount),
            0
          )
    ),

    "Maintenance Cost"
  );
}


/* =====================================================
   ADD PASSBOOK
===================================================== */
function addPassbook() {

  const amount = n($("pbAmt").value);

  if (amount <= 0) {
    return toast("Enter valid amount");
  }

  const record = {
    ID: passbookEditId || uid(),
    Date: $("pbDate").value || today(),
    Type: $("pbType").value,
    Category: $("pbCat").value.trim(),
    Amount: amount,
    Account: $("pbAccount").value.trim(),
    Remarks: $("pbRemarks").value.trim()
  };

  save("passbook", record).then(() => {

    toast(
      passbookEditId
        ? "✓ Passbook entry updated"
        : "✓ Passbook entry saved"
    );

    clearPassbookForm();
  });
}


function editPassbook(id) {

  const entry = (DB.passbook || [])
    .find(x => String(x.ID) === String(id));

  if (!entry) {
    return toast("Passbook entry not found");
  }

  passbookEditId = entry.ID;

  $("pbDate").value = entry.Date || today();
  $("pbType").value = entry.Type || "Expense";
  $("pbCat").value = entry.Category || "";
  $("pbAmt").value = entry.Amount || "";
  $("pbAccount").value = entry.Account || "";
  $("pbRemarks").value = entry.Remarks || "";

  const saveButton = document.querySelector(
    '#passbook button[onclick="addPassbook()"]'
  );

  if (saveButton) {
    saveButton.textContent = "💾 Update Entry";
  }

  $("pbDate").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  toast("✏️ Editing passbook entry");
}


function clearPassbookForm() {

  passbookEditId = "";

  $("pbDate").value = today();
  $("pbType").value = "Expense";
  $("pbCat").value = "";
  $("pbAmt").value = "";
  $("pbAccount").value = "";
  $("pbRemarks").value = "";

  const saveButton = document.querySelector(
    '#passbook button[onclick="addPassbook()"]'
  );

  if (saveButton) {
    saveButton.textContent = "Save";
  }
}
/* =====================================================
   ADD SALARY
===================================================== */

function addSalary() {

  const amount =
    n(
      $("salAmount").value
    );

  if (amount <= 0) {
    return toast(
      "Enter valid salary amount"
    );
  }

  return save(
    "salary",
    {

      ID:
        uid(),

      Month:
        $("salMonth").value ||
        ym(),

      Company:
        $("salCompany").value,

      Amount:
        amount,

      Remarks:
        $("salRemarks").value

    }
  ).then(() => {

    $("salAmount").value =
      "";

    $("salRemarks").value =
      "";
  });
}


/* =====================================================
   ADD LOAN
===================================================== */

function addLoan() {

  return save(
    "loans",
    {

      ID:
        uid(),

      "Loan Name":
        $("loanName").value,

      "Initial Amount":
        n(
          $("loanInitial").value
        ),

      Remarks:
        $("loanRemarks").value

    }
  );
}


/* =====================================================
   ADD EMI
===================================================== */

function addEmi() {

  if (
    !$("emiLoan").value
  ) {
    return toast(
      "Select loan"
    );
  }

  return save(
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
        n(
          $("emiAmount").value
        ),

      Remarks:
        $("emiRemarks").value

    }
  );
}


/* =====================================================
   ADD GIVE / TAKE
===================================================== */

function addGive() {

  const person =
    $("gtPerson")
      .value
      .trim();

  const amount =
    n(
      $("gtAmount").value
    );

  if (!person) {
    return toast(
      "Enter person name"
    );
  }

  if (amount <= 0) {
    return toast(
      "Enter valid amount"
    );
  }

  return save(
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
        $("gtPurpose").value,

      Notes:
        $("gtNotes").value,

      Revisions:
        "[]"

    }
  ).then(() => {

    $("gtAmount").value =
      "";

    $("gtPurpose").value =
      "";

    $("gtNotes").value =
      "";
  });
}


/* =====================================================
   SIP BASKET
===================================================== */

async function addBasket() {

  const name =
    $("sipPerson")
      .value
      .trim();

  const basket =
    $("sipBasket")
      .value
      .trim();


  if (
    !name ||
    !basket
  ) {
    return toast(
      "Enter person and basket"
    );
  }


  let person =
    (DB.people || [])
      .find(
        x =>
          x.Name === name
      );


  if (!person) {

    person =
      await save(
        "people",
        {

          ID:
            uid(),

          Name:
            name

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
}


function addAsset() {

  if (
    !$("assetBasket").value
  ) {
    return toast(
      "Select basket"
    );
  }

  return save(
    "assets",
    {

      ID:
        uid(),

      "Basket ID":
        $("assetBasket").value,

      "Asset Name":
        $("assetName").value,

      "Asset Type":
        $("assetType").value,

      "Monthly Amount":
        n(
          $("assetAmount").value
        )

    }
  );
}


function markBasket(
  id,
  total
) {

  return save(
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


/* =====================================================
   FILTER EVENTS
===================================================== */

[
  "dashMonth",
  "dashCategory",
  "pbFilterMonth",
  "pbFilterCategory"
]
  .forEach(id => {

    const el = $(id);

    if (el) {

      el.onchange =
        () => render();
    }

  });


$("spGroupSel").onchange =
  () =>
    openGroup(
      $("spGroupSel").value
    );


$("spGroupExpense").onchange =
  () =>
    openGroup(
      $("spGroupExpense").value
    );


$("spSplitType").onchange =
  shares;


$("spMembersSel").onchange =
  shares;


/* =====================================================
   DEFAULT DATES
===================================================== */

[
  "pbDate",
  "gtDate",
  "spDate",
  "fuelDate",
  "maintDate"
]
  .forEach(id => {

    const el = $(id);

    if (el) {
      el.value =
        today();
    }

  });


[
  "salMonth",
  "emiMonth"
]
  .forEach(id => {

    const el = $(id);

    if (el) {
      el.value =
        ym();
    }

  });


/* =====================================================
   START APP
===================================================== */

try {

  DB =
    JSON.parse(
      localStorage.getItem(KEY) ||
      "{}"
    );

} catch (error) {

  DB = {};
}


if (
  Object.keys(DB).length
) {

  render();

  status(
    "☁️ Loading..."
  );
}


loadAll();
