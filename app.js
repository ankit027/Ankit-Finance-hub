const API_URL =
"https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";

const LOCAL_KEY = "ankit_finance_hub_v2";

let DB = {};
let charts = {};
let syncInProgress = false;

const $ = id => document.getElementById(id);

const uid = () =>
  Date.now() + "-" + Math.random().toString(36).slice(2);

const num = value =>
  Number(value || 0) || 0;

const money = value =>
  "₹" + num(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });

const today = () =>
  new Date().toISOString().slice(0, 10);

const ym = () =>
  new Date().toISOString().slice(0, 7);


/* API */

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

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Server error");
  }

  return data;
}


/* CACHE */

function persist() {
  localStorage.setItem(
    LOCAL_KEY,
    JSON.stringify(DB)
  );
}

function restore() {
  try {
    return JSON.parse(
      localStorage.getItem(LOCAL_KEY) || "{}"
    );
  } catch (e) {
    return {};
  }
}


/* TOAST */

function toast(text) {

  $("toast").textContent = text;

  $("toast").classList.add("show");

  setTimeout(() => {
    $("toast").classList.remove("show");
  }, 2500);
}


/* LOAD */

async function loadAll(silent = false) {

  if (syncInProgress) return;

  syncInProgress = true;

  try {

    $("status").textContent = "☁️ Syncing...";

    const result = await api("loadAll");

    DB = result.data || {};

    persist();

    render();

    $("status").textContent = "☁️ Synced";

  } catch (e) {

    $("status").textContent = "⚠️ Offline";

    if (!silent) {
      toast(e.message);
    }

  } finally {

    syncInProgress = false;

  }
}


/* SAVE */

async function save(table, data) {

  try {

    $("status").textContent = "☁️ Saving...";

    const result = await api("save", {
      table,
      data
    });

    const record = result.data;

    DB[table] = DB[table] || [];

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

    $("status").textContent = "☁️ Synced";

    toast("✓ Saved");

    return record;

  } catch (e) {

    toast(e.message);

    throw e;

  }
}


/* DELETE */

async function del(table, id) {

  if (!confirm("Delete this record?")) return;

  await api("delete", {
    table,
    id
  });

  DB[table] =
    (DB[table] || []).filter(
      x => String(x.ID) !== String(id)
    );

  persist();

  render();

  toast("Deleted");
}


/* NAVIGATION */

document.querySelectorAll("[data-page]").forEach(button => {

  button.onclick = () => {

    document.querySelectorAll(".page")
      .forEach(page =>
        page.classList.remove("active")
      );

    $(button.dataset.page)
      .classList.add("active");

    $("sidebar")
      .classList.remove("open");

    setTimeout(renderCharts, 100);
  };

});


$("menuBtn").onclick = () => {
  $("sidebar").classList.toggle("open");
};


/* THEME */

$("themeBtn").onclick = () => {

  document.body.classList.toggle("dark");

  $("themeBtn").textContent =
    document.body.classList.contains("dark")
      ? "☀️ Light"
      : "🌙 Dark";

  setTimeout(renderCharts, 100);

};


/* ITEM */

function item(left, right, id, table) {

  return `
  <div class="item">

    <div>${left}</div>

    <div>
      ${right}
      <button
        class="danger"
        onclick="del('${table}','${id}')"
      >
        Delete
      </button>
    </div>

  </div>`;
}


/* CHART */

function createChart(
  id,
  type,
  labels,
  data,
  label
) {

  if (!window.Chart) return;

  const canvas = $(id);

  if (!canvas) return;

  if (charts[id]) {
    charts[id].destroy();
  }

  charts[id] = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: [{
        label,
        data
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}


/* GIVE TAKE BALANCE */

function getGiveTakeBalances() {

  const out = {};

  (DB.transactions || []).forEach(x => {

    const person =
      String(x.Person || "Unknown").trim();

    if (!out[person]) {
      out[person] = {
        person,
        balance: 0
      };
    }

    const amount = num(x.Amount);

    const type =
      String(x.Type || "").toLowerCase();

    if (type === "give") {
      out[person].balance += amount;
    }

    if (type === "receive") {
      out[person].balance -= amount;
    }

    if (type === "take") {
      out[person].balance -= amount;
    }

    if (type === "pay") {
      out[person].balance += amount;
    }

  });

  return out;
}


/* MAIN RENDER */

function render() {

  renderDashboard();

  renderPassbook();

  renderSalary();

  renderLoans();

  renderGiveTake();

  renderSplit();

  renderInvest();

  setTimeout(renderCharts, 100);
}


function renderDashboard() {

  const p = DB.passbook || [];

  const income = p
    .filter(x =>
      String(x.Date).slice(0, 7) === ym() &&
      String(x.Type).toLowerCase() === "income"
    )
    .reduce((s, x) => s + num(x.Amount), 0);

  const expense = p
    .filter(x =>
      String(x.Date).slice(0, 7) === ym() &&
      String(x.Type).toLowerCase() === "expense"
    )
    .reduce((s, x) => s + num(x.Amount), 0);

  const salary = (DB.salary || [])
    .filter(x => x.Month === ym())
    .reduce((s, x) => s + num(x.Amount), 0);

  $("dash").innerHTML = [

    ["💰 Salary", salary],

    ["📥 Income", income],

    ["💸 Expense", expense],

    ["💳 Net", salary + income - expense]

  ].map(x => `
    <div class="card">
      <small>${x[0]}</small>
      <b>${money(x[1])}</b>
    </div>
  `).join("");
}


/* PASSBOOK */

function renderPassbook() {

  const p = DB.passbook || [];

  $("pbList").innerHTML =
    p.slice().reverse().map(x =>
      item(
        `${x.Date} • <b>${x.Category}</b><br>
        <small>${x.Type} • ${x.Account}</small>`,
        money(x.Amount),
        x.ID,
        "passbook"
      )
    ).join("") || "<p>No transactions</p>";
}


/* SALARY */

function renderSalary() {

  const sal = DB.salary || [];

  $("salaryList").innerHTML =
    sal.slice().reverse().map(x =>
      item(
        `<b>${x.Company}</b><br>${x.Month}`,
        money(x.Amount),
        x.ID,
        "salary"
      )
    ).join("") || "<p>No salary records</p>";
}


/* LOANS */

function renderLoans() {

  const loans = DB.loans || [];
  const emi = DB.emi || [];

  $("emiLoan").innerHTML =
    `<option value="">Select Loan</option>` +
    loans.map(x =>
      `<option value="${x.ID}">
        ${x["Loan Name"]}
      </option>`
    ).join("");

  $("loanList").innerHTML =
    loans.map(loan => {

      const paid = emi
        .filter(x =>
          String(x["Loan ID"]) === String(loan.ID)
        )
        .reduce(
          (s, x) => s + num(x.Amount),
          0
        );

      const remaining =
        Math.max(
          0,
          num(loan["Initial Amount"]) - paid
        );

      return item(
        `<b>${loan["Loan Name"]}</b><br>
        <small>
        Initial: ${money(loan["Initial Amount"])}<br>
        Paid: ${money(paid)}<br>
        Remaining: ${money(remaining)}
        </small>`,
        "",
        loan.ID,
        "loans"
      );

    }).join("") || "<p>No loans</p>";
}


/* GIVE TAKE */

function renderGiveTake() {

  const balances =
    Object.values(getGiveTakeBalances());

  $("gtDashboard").innerHTML =
    balances.map(x => {

      const status =
        x.balance > 0
          ? "To Receive"
          : x.balance < 0
            ? "To Pay"
            : "Settled";

      return `
      <div class="card person-card">

        <small>${x.person}</small>

        <b>${money(Math.abs(x.balance))}</b>

        <span class="balance-label">
          ${status}
        </span>

      </div>`;

    }).join("");

  $("gtList").innerHTML =
    (DB.transactions || [])
      .slice()
      .reverse()
      .map(x =>
        item(
          `<b>${x.Person}</b><br>
          <small>${x.Type} • ${x.Date}</small>`,
          money(x.Amount),
          x.ID,
          "transactions"
        )
      ).join("");
}


/* SPLITTER */

function groupMembers(group) {

  try {
    return JSON.parse(
      group["Members JSON"] || "[]"
    );
  } catch (e) {
    return [];
  }
}


function calculateSplitGroup(group) {

  const members = groupMembers(group);

  const expenses =
    (DB.splitExpenses || [])
      .filter(x =>
        String(x["Group ID"]) === String(group.ID)
      );

  const stats = {};

  members.forEach(name => {
    stats[name] = {
      name,
      paid: 0,
      share: 0
    };
  });

  expenses.forEach(expense => {

    const amount = num(expense.Amount);

    const paidBy =
      expense["Paid By"];

    if (!stats[paidBy]) {
      stats[paidBy] = {
        name: paidBy,
        paid: 0,
        share: 0
      };
    }

    stats[paidBy].paid += amount;

    let participants = [];

    try {
      participants =
        JSON.parse(
          expense["Members JSON"] || "[]"
        );
    } catch (e) {}

    if (!participants.length) {
      participants = members;
    }

    const share =
      amount / participants.length;

    participants.forEach(person => {

      if (!stats[person]) {
        stats[person] = {
          name: person,
          paid: 0,
          share: 0
        };
      }

      stats[person].share += share;

    });

  });

  const result =
    Object.values(stats);

  result.forEach(x => {
    x.net = x.paid - x.share;
  });

  return {
    stats: result,
    total: expenses.reduce(
      (s, x) => s + num(x.Amount),
      0
    )
  };
}


function calculateSettlements(stats) {

  const creditors =
    stats
      .filter(x => x.net > 0.01)
      .map(x => ({
        name: x.name,
        amount: x.net
      }));

  const debtors =
    stats
      .filter(x => x.net < -0.01)
      .map(x => ({
        name: x.name,
        amount: -x.net
      }));

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
      from: debtors[i].name,
      to: creditors[j].name,
      amount
    });

    debtors[i].amount -= amount;
    creditors[j].amount -= amount;

    if (debtors[i].amount < 0.01) i++;

    if (creditors[j].amount < 0.01) j++;

  }

  return result;
}


function renderSplit() {

  const groups =
    DB.splitGroups || [];

  const oldValue =
    $("spGroupSel").value;

  $("spGroupSel").innerHTML =
    `<option value="">Select Group</option>` +
    groups.map(x =>
      `<option value="${x.ID}">
        ${x["Group Name"]}
      </option>`
    ).join("");

  if (groups.some(x => x.ID === oldValue)) {
    $("spGroupSel").value = oldValue;
  }

  if (!oldValue && groups.length) {
    $("spGroupSel").value =
      groups[0].ID;
  }

  const group =
    groups.find(
      x => x.ID === $("spGroupSel").value
    );

  if (!group) return;

  const members =
    groupMembers(group);

  $("spPaidBy").innerHTML =
    members.map(x =>
      `<option value="${x}">${x}</option>`
    ).join("");

  const calc =
    calculateSplitGroup(group);

  $("splitSummary").innerHTML =
    calc.stats.map(x => {

      const status =
        x.net > 0
          ? "Should Receive"
          : x.net < 0
            ? "Should Pay"
            : "Settled";

      return `
      <div class="card person-card">

        <small>${x.name}</small>

        <b>${money(Math.abs(x.net))}</b>

        <span class="balance-label">
          ${status}
        </span>

        <small>
          Paid ${money(x.paid)}
        </small>

      </div>`;

    }).join("");

  const settlements =
    calculateSettlements(calc.stats);

  $("settlementList").innerHTML =
    settlements.map((x, index) => `
      <div class="item">

        <span>
          <b>${x.from}</b>
          → 
          <b>${x.to}</b>
        </span>

        <span>
          ${money(x.amount)}

          <button
            class="success"
            onclick="settleSplit('${group.ID}',${index})"
          >
            Settled
          </button>

        </span>

      </div>
    `).join("") ||
    "<p>🎉 Everyone is settled!</p>";

  $("splitList").innerHTML =
    groups.map(x => {

      const c =
        calculateSplitGroup(x);

      return `
      <div class="card">

        <b>${x["Group Name"]}</b>

        <p class="muted">
          ${groupMembers(x).join(", ")}
        </p>

        <b>Total: ${money(c.total)}</b>

      </div>`;

    }).join("");
}


$("spGroupSel").onchange = () => {
  renderSplit();
  renderCharts();
};


/* INVESTMENTS */

function renderInvest() {

  const baskets =
    DB.baskets || [];

  const people =
    DB.people || [];

  const assets =
    DB.assets || [];

  $("assetBasket").innerHTML =
    `<option value="">Select Basket</option>` +
    baskets.map(x => {

      const person =
        people.find(
          p => p.ID === x["Person ID"]
        );

      return `
      <option value="${x.ID}">
        ${person ? person.Name : ""}
        - ${x["Basket Name"]}
      </option>`;

    }).join("");

  $("basketList").innerHTML =
    baskets.map(x => {

      const basketAssets =
        assets.filter(
          a => a["Basket ID"] === x.ID
        );

      const total =
        basketAssets.reduce(
          (s, a) =>
            s + num(a["Monthly Amount"]),
          0
        );

      return `
      <div class="item">

        <span>
          <b>${x["Basket Name"]}</b>
        </span>

        <b>${money(total)}</b>

      </div>`;

    }).join("");
}


/* ADD FUNCTIONS */

function addPassbook() {

  return save("passbook", {

    ID: uid(),

    Date:
      $("pbDate").value || today(),

    Type:
      $("pbType").value,

    Category:
      $("pbCat").value,

    Amount:
      num($("pbAmt").value),

    Account:
      $("pbAccount").value,

    Remarks:
      $("pbRemarks").value

  });
}


function addSalary() {

  return save("salary", {

    ID: uid(),

    Month:
      $("salMonth").value || ym(),

    Company:
      $("salCompany").value,

    Amount:
      num($("salAmount").value),

    Remarks:
      $("salRemarks").value

  });
}


function addLoan() {

  return save("loans", {

    ID: uid(),

    "Loan Name":
      $("loanName").value,

    "Initial Amount":
      num($("loanInitial").value),

    Remarks:
      $("loanRemarks").value

  });
}


function addEmi() {

  if (!$("emiLoan").value) {
    return toast("Select Loan");
  }

  return save("emi", {

    ID: uid(),

    "Loan ID":
      $("emiLoan").value,

    Month:
      $("emiMonth").value || ym(),

    Amount:
      num($("emiAmount").value),

    Remarks:
      $("emiRemarks").value

  });
}


function addGive() {

  return save("transactions", {

    ID: uid(),

    Person:
      $("gtPerson").value,

    Type:
      $("gtType").value,

    Amount:
      num($("gtAmount").value),

    Date:
      $("gtDate").value || today(),

    Purpose:
      $("gtPurpose").value,

    Notes:
      $("gtNotes").value,

    Revisions:
      "[]"

  });
}


async function addGroup() {

  const members =
    $("spMembers").value
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

  if (members.length < 2) {
    return toast("Minimum 2 members required");
  }

  const record =
    await save("splitGroups", {

      ID: uid(),

      "Group Name":
        $("spGroup").value,

      Category:
        $("spCat").value,

      "Members JSON":
        JSON.stringify(members)

    });

  $("spGroup").value = "";
  $("spMembers").value = "";

  $("spGroupSel").value =
    record.ID;

  renderSplit();
}


function addSplitExpense() {

  const group =
    (DB.splitGroups || []).find(
      x =>
        x.ID ===
        $("spGroupSel").value
    );

  if (!group) {
    return toast("Select group");
  }

  let members =
    $("spMembersSel").value
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

  if (!members.length) {
    members = groupMembers(group);
  }

  return save("splitExpenses", {

    ID: uid(),

    "Group ID":
      group.ID,

    Title:
      $("spTitle").value,

    Amount:
      num($("spAmount").value),

    "Paid By":
      $("spPaidBy").value,

    "Members JSON":
      JSON.stringify(members),

    Date:
      today()

  });
}


async function addBasket() {

  const name =
    $("sipPerson").value.trim();

  let person =
    (DB.people || []).find(
      x =>
        String(x.Name).toLowerCase() ===
        name.toLowerCase()
    );

  if (!person) {

    person =
      await save("people", {
        ID: uid(),
        Name: name
      });

  }

  return save("baskets", {

    ID: uid(),

    "Person ID":
      person.ID,

    "Basket Name":
      $("sipBasket").value

  });
}


function addAsset() {

  return save("assets", {

    ID: uid(),

    "Basket ID":
      $("assetBasket").value,

    "Asset Name":
      $("assetName").value,

    "Asset Type":
      $("assetType").value,

    "Monthly Amount":
      num($("assetAmount").value)

  });
}


/* SETTLEMENT */

async function settleSplit(groupId, index) {

  const group =
    (DB.splitGroups || [])
      .find(x => x.ID === groupId);

  if (!group) return;

  const calc =
    calculateSplitGroup(group);

  const settlements =
    calculateSettlements(calc.stats);

  const s =
    settlements[index];

  if (!s) return;

  await save("splitSettlements", {

    ID: uid(),

    "Group ID":
      groupId,

    From:
      s.from,

    To:
      s.to,

    Amount:
      s.amount,

    Date:
      today(),

    Notes:
      "Settled"

  });

  toast("✓ Settlement saved");
}


/* CHARTS */

function renderCharts() {

  const p =
    DB.passbook || [];

  const income =
    p.filter(x =>
      String(x.Type).toLowerCase() === "income"
    )
    .reduce((s, x) =>
      s + num(x.Amount), 0
    );

  const expense =
    p.filter(x =>
      String(x.Type).toLowerCase() === "expense"
    )
    .reduce((s, x) =>
      s + num(x.Amount), 0
    );

  const salary =
    (DB.salary || [])
      .reduce((s, x) =>
        s + num(x.Amount), 0
      );

  createChart(
    "mainChart",
    "bar",
    ["Salary", "Income", "Expense"],
    [salary, income, expense],
    "Amount"
  );

  createChart(
    "expenseChart",
    "doughnut",
    ["Income", "Expense"],
    [income, expense],
    "Amount"
  );

  createChart(
    "passbookChart",
    "bar",
    ["Income", "Expense"],
    [income, expense],
    "Amount"
  );

  const salaryMonths = {};

  (DB.salary || []).forEach(x => {
    salaryMonths[x.Month] =
      (salaryMonths[x.Month] || 0) +
      num(x.Amount);
  });

  createChart(
    "salaryChart",
    "line",
    Object.keys(salaryMonths),
    Object.values(salaryMonths),
    "Salary"
  );

  const loanTotal =
    (DB.loans || [])
      .reduce((s, x) =>
        s + num(x["Initial Amount"]), 0
      );

  const emiTotal =
    (DB.emi || [])
      .reduce((s, x) =>
        s + num(x.Amount), 0
      );

  createChart(
    "loanChart",
    "doughnut",
    ["Loan", "EMI Paid"],
    [loanTotal, emiTotal],
    "Amount"
  );

  const balances =
    Object.values(
      getGiveTakeBalances()
    );

  createChart(
    "giveChart",
    "bar",
    balances.map(x => x.person),
    balances.map(x =>
      Math.abs(x.balance)
    ),
    "Outstanding"
  );

  const group =
    (DB.splitGroups || [])
      .find(
        x =>
          x.ID ===
          $("spGroupSel").value
      );

  if (group) {

    const calc =
      calculateSplitGroup(group);

    createChart(
      "splitChart",
      "bar",
      calc.stats.map(x => x.name),
      calc.stats.map(x => x.paid),
      "Paid"
    );
  }

  const assets =
    DB.assets || [];

  createChart(
    "investmentChart",
    "doughnut",
    assets.map(x => x["Asset Name"]),
    assets.map(x =>
      num(x["Monthly Amount"])
    ),
    "Monthly Investment"
  );
}


/* START */

DB = restore();

render();

loadAll(true);
