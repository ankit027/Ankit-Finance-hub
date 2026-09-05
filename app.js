const API_URL =
  "https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";

const KEY = "ankit_finance_hub_final_v4";

let DB = {};
let charts = {};

const $ = (x) => document.getElementById(x);

const uid = () =>
  Date.now() + "-" + Math.random().toString(36).slice(2);

const n = (x) => Number(x || 0) || 0;

const m = (x) =>
  "₹" +
  n(x).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });

const ym = () => new Date().toISOString().slice(0, 7);

const today = () =>
  new Date().toISOString().slice(0, 10);


/* =====================================================
   ERROR HANDLING
===================================================== */

window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);

  toast(
    "⚠️ " +
    (e.reason?.message || "Something went wrong")
  );
});


/* =====================================================
   API
===================================================== */

async function api(action, payload = {}) {

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 30000);

  try {

    /* ================= LOAD DATA ================= */

    if (action === "loadAll") {

      const url =
        API_URL +
        "?action=loadAll&_=" +
        Date.now();

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        redirect: "follow"
      });

      const text = await response.text();

      if (!text) {
        throw new Error(
          "Empty response from Google Apps Script"
        );
      }

      let data;

      try {
        data = JSON.parse(text);
      } catch (err) {

        console.error(
          "Invalid server response:",
          text
        );

        throw new Error(
          "Invalid response from Google Sheet"
        );
      }

      if (!data.success) {
        throw new Error(
          data.error || "Google Sheet error"
        );
      }

      return data;
    }


    /* ================= SAVE / DELETE ================= */

    const response = await fetch(API_URL, {
      method: "POST",

      headers: {
        "Content-Type":
          "text/plain;charset=utf-8"
      },

      body: JSON.stringify({
        action,
        ...payload
      }),

      signal: controller.signal,
      redirect: "follow"
    });


    const text = await response.text();

    if (!text) {
      throw new Error(
        "Empty response from Google Apps Script"
      );
    }

    let data;

    try {

      data = JSON.parse(text);

    } catch (err) {

      console.error(
        "Server response:",
        text
      );

      throw new Error(
        "Invalid response from server"
      );
    }


    if (!data.success) {

      throw new Error(
        data.error || "Server error"
      );
    }

    return data;

  } catch (err) {

    console.error(
      "API Error:",
      err
    );

    if (err.name === "AbortError") {

      throw new Error(
        "Sync timeout. Please check internet."
      );
    }

    throw err;

  } finally {

    clearTimeout(timeout);
  }
}


/* =====================================================
   UI HELPERS
===================================================== */

function toast(x) {

  const el = $("toast");

  if (!el) return;

  el.textContent = x;

  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 2200);
}


function status(x) {

  const el = $("status");

  if (el) {
    el.textContent = x;
  }
}


function cache() {

  localStorage.setItem(
    KEY,
    JSON.stringify(DB)
  );
}


/* =====================================================
   LOAD DATA
===================================================== */

async function loadAll() {

  status("☁️ Syncing...");

  render();

  try {

    const data = await api("loadAll");

    DB = data.data || {};

    cache();

    render();

    status("☁️ Synced");

  } catch (e) {

    console.error(e);

    render();

    status("⚠️ Offline / Sync Error");

    toast(
      e.message ||
      "Could not sync with Google Sheet"
    );
  }
}


/* =====================================================
   SAVE
===================================================== */

async function save(table, data) {

  const before =
    JSON.parse(
      JSON.stringify(DB[table] || [])
    );

  DB[table] =
    DB[table] || [];


  const i =
    DB[table].findIndex(
      (z) =>
        String(z.ID) ===
        String(data.ID)
    );


  if (i < 0) {

    DB[table].push({
      ...data
    });

  } else {

    DB[table][i] = {
      ...DB[table][i],
      ...data
    };
  }


  cache();

  render();

  status("💾 Saved • syncing...");

  try {

    const r = await api(
      "save",
      {
        table,
        data
      }
    );


    const x =
      (r.data && r.data.record) ||
      r.record ||
      data;


    const j =
      DB[table].findIndex(
        (z) =>
          String(z.ID) ===
          String(x.ID)
      );


    if (j < 0) {

      DB[table].push(x);

    } else {

      DB[table][j] = x;
    }


    cache();

    render();

    status("☁️ Synced");

    toast("✓ Saved successfully");

    return x;

  } catch (e) {

    DB[table] = before;

    cache();

    render();

    status("⚠️ Sync failed");

    toast(
      "Save failed: " +
      e.message
    );

    throw e;
  }
}


/* =====================================================
   DELETE
===================================================== */

async function del(table, id) {

  if (
    !confirm(
      "Delete this record?"
    )
  ) return;


  try {

    await api(
      "delete",
      {
        table,
        id
      }
    );


    DB[table] =
      (DB[table] || [])
        .filter(
          (x) =>
            String(x.ID) !==
            String(id)
        );


    cache();

    render();

    toast("Deleted successfully");

  } catch (e) {

    toast(
      "Delete failed: " +
      e.message
    );
  }
}


/* =====================================================
   NAVIGATION
===================================================== */

document
  .querySelectorAll("[data-page]")
  .forEach((b) => {

    b.onclick = () => {

      document
        .querySelectorAll(".page")
        .forEach((p) =>
          p.classList.remove("active")
        );

      const page =
        $(b.dataset.page);

      if (page) {
        page.classList.add("active");
      }


      const sidebar =
        $("sidebar");

      if (sidebar) {
        sidebar.classList.remove("open");
      }
    };
  });


if ($("menuBtn")) {

  $("menuBtn").onclick =
    () =>
      $("sidebar")
        .classList.toggle("open");
}


if ($("themeBtn")) {

  $("themeBtn").onclick =
    () => {

      document.body.classList.toggle("dark");

      $("themeBtn").textContent =
        document.body.classList.contains("dark")
          ? "☀️ Light"
          : "🌙 Dark";

      draw();
    };
}


/* =====================================================
   UI CARD
===================================================== */

function card(a, b) {

  return `
    <div>
      <small>${a}</small>
      <b>${b}</b>
    </div>
  `;
}


function item(a, b, c = "") {

  return `
    <div class="item">

      <span>
        ${a}
      </span>

      <span>
        ${b}
        ${c}
      </span>

    </div>
  `;
}


/* =====================================================
   CHART
===================================================== */

function chart(
  id,
  type,
  labels,
  data,
  label
) {

  const el = $(id);

  if (!el) return;

  if (charts[id]) {

    charts[id].destroy();
  }


  charts[id] =
    new Chart(el, {

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
   ESCAPE HTML
===================================================== */

function esc(v) {

  return String(v ?? "")
    .replace(
      /[&<>"']/g,
      (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c])
    );
}


/* =====================================================
   RENDER ALL
===================================================== */

function render() {

  lists();

  syncDashboardFilters();

  syncVehicleFilters();

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
   DASHBOARD FILTER
===================================================== */

function syncDashboardFilters() {

  const cats =
    [
      ...new Set(
        (DB.passbook || [])
          .map(
            (x) =>
              String(
                x.Category || ""
              ).trim()
          )
          .filter(Boolean)
      )
    ].sort();


  [
    "dashCategory",
    "pbFilterCategory"
  ].forEach((id) => {

    const el = $(id);

    if (!el) return;

    const prev =
      el.value;


    el.innerHTML =
      `<option value="">
        All Categories
      </option>` +
      cats
        .map(
          (c) =>
            `<option value="${esc(c)}">
              ${esc(c)}
            </option>`
        )
        .join("");


    if (
      cats.includes(prev)
    ) {
      el.value = prev;
    }
  });


  if (
    $("dashMonth") &&
    !$("dashMonth").value
  ) {

    $("dashMonth").value =
      ym();
  }


  if (
    $("pbFilterMonth") &&
    !$("pbFilterMonth").value
  ) {

    $("pbFilterMonth").value =
      ym();
  }
}


function resetDashFilters() {

  $("dashMonth").value =
    ym();

  $("dashCategory").value =
    "";

  render();
}


function resetPassbookFilters() {

  $("pbFilterMonth").value =
    ym();

  $("pbFilterCategory").value =
    "";

  render();
}


function dashFilter() {

  return {

    month:
      $("dashMonth")?.value ||
      ym(),

    category:
      $("dashCategory")?.value ||
      ""
  };
}


function pbFilter() {

  return {

    month:
      $("pbFilterMonth")?.value ||
      ym(),

    category:
      $("pbFilterCategory")?.value ||
      ""
  };
}


function filterPassbook(
  rows,
  month,
  category
) {

  return rows.filter(
    (x) =>
      (
        !month ||
        String(
          x.Date || ""
        ).slice(0, 7) ===
          month
      ) &&

      (
        !category ||
        String(
          x.Category || ""
        ) === category
      )
  );
}


/* =====================================================
   DASHBOARD
===================================================== */

function dash() {

  const f =
    dashFilter();

  const y =
    f.month;


  const p =
    filterPassbook(
      DB.passbook || [],
      y,
      f.category
    );


  const s =
    DB.salary || [];

  const e =
    DB.emi || [];

  const pay =
    DB.sipPayments || [];


  const otherIncome =
    p
      .filter(
        (x) =>
          String(
            x.Type || ""
          ).toLowerCase() ===
          "income"
      )
      .reduce(
        (a, x) =>
          a + n(x.Amount),
        0
      );


  const exp =
    p
      .filter(
        (x) =>
          String(
            x.Type || ""
          ).toLowerCase() ===
          "expense"
      )
      .reduce(
        (a, x) =>
          a + n(x.Amount),
        0
      );


  const sal =
    s
      .filter(
        (x) =>
          x.Month === y
      )
      .reduce(
        (a, x) =>
          a + n(x.Amount),
        0
      );


  const totalIncome =
    sal +
    otherIncome;


  const emi =
    e
      .filter(
        (x) =>
          x.Month === y
      )
      .reduce(
        (a, x) =>
          a + n(x.Amount),
        0
      );


  const sip =
    pay
      .filter(
        (x) =>
          x.Month === y
      )
      .reduce(
        (a, x) =>
          a + n(x.Amount),
        0
      );


  const b =
    Object.values(
      giveBal()
    );


  const rec =
    b
      .filter(
        (x) =>
          x.balance > 0
      )
      .reduce(
        (a, x) =>
          a + x.balance,
        0
      );


  const owe =
    b
      .filter(
        (x) =>
          x.balance < 0
      )
      .reduce(
        (a, x) =>
          a - x.balance,
        0
      );


  $("dash").innerHTML = [

    ["💰 Salary", m(sal)],

    ["📈 Total Income", m(totalIncome)],

    ["💸 Expense", m(exp)],

    ["🏦 EMI Paid", m(emi)],

    ["📈 SIP Paid", m(sip)],

    ["🤝 To Receive", m(rec)],

    ["🤝 To Pay", m(owe)],

    [
      "💳 Net",
      m(
        totalIncome -
        exp -
        emi -
        sip
      )
    ]

  ]
    .map(
      (x) =>
        card(...x)
    )
    .join("");
}


/* =====================================================
   PASSBOOK
===================================================== */

function passbook() {

  const f =
    pbFilter();


  const p =
    filterPassbook(
      DB.passbook || [],
      f.month,
      f.category
    );


  const income =
    p
      .filter(
        (x) =>
          String(
            x.Type || ""
          ).toLowerCase() ===
          "income"
      )
      .reduce(
        (a, x) =>
          a + n(x.Amount),
        0
      );


  const expense =
    p
      .filter(
        (x) =>
          String(
            x.Type || ""
          ).toLowerCase() ===
          "expense"
      )
      .reduce(
        (a, x) =>
          a + n(x.Amount),
        0
      );


  $("passbookDash").innerHTML = [

    ["Income", m(income)],

    ["Expense", m(expense)],

    ["Net", m(income - expense)],

    ["Entries", p.length]

  ]
    .map(
      (x) =>
        card(...x)
    )
    .join("");


  $("pbList").innerHTML =
    p
      .slice()
      .reverse()
      .map(
        (x) =>
          item(

            `${esc(x.Date)}
            • <b>${esc(x.Category)}</b>
            • ${esc(x.Type)}`,

            m(x.Amount),

            `
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
            `
          )
      )
      .join("") ||

    "<p>No records for selected filter</p>";
}


function clearPassbook() {

  $("pbEditId").value =
    "";

  $("pbDate").value =
    today();

  $("pbType").value =
    "Expense";

  $("pbCat").value =
    "";

  $("pbAmt").value =
    "";

  $("pbAccount").value =
    "";

  $("pbRemarks").value =
    "";

  $("pbSaveBtn").textContent =
    "Save";
}


function editPassbook(id) {

  const x =
    (DB.passbook || [])
      .find(
        (z) =>
          String(z.ID) ===
          String(id)
      );


  if (!x) return;


  $("pbEditId").value =
    x.ID;

  $("pbDate").value =
    String(
      x.Date || ""
    ).slice(0, 10);

  $("pbType").value =
    x.Type ||
    "Expense";

  $("pbCat").value =
    x.Category ||
    "";

  $("pbAmt").value =
    x.Amount ||
    "";

  $("pbAccount").value =
    x.Account ||
    "";

  $("pbRemarks").value =
    x.Remarks ||
    "";


  $("pbSaveBtn").textContent =
    "Update";


  document
    .querySelector(
      '[data-page="passbook"]'
    )
    ?.click();


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


async function addPassbook() {

  const amount =
    n(
      $("pbAmt").value
    );


  if (amount <= 0) {

    return toast(
      "Enter valid amount"
    );
  }


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
        $("pbCat").value,

      Amount:
        amount,

      Account:
        $("pbAccount").value,

      Remarks:
        $("pbRemarks").value
    }
  );


  /* CLEAR AFTER SAVE */

  clearPassbook();
}


/* =====================================================
   SALARY
===================================================== */

function salary() {

  const s =
    DB.salary || [];

  const y =
    ym();


  const cur =
    s
      .filter(
        (x) =>
          x.Month === y
      )
      .reduce(
        (a, x) =>
          a + n(x.Amount),
        0
      );


  const tot =
    s
      .reduce(
        (a, x) =>
          a + n(x.Amount),
        0
      );


  $("salaryDash").innerHTML = [

    ["This Month", m(cur)],

    ["Total", m(tot)],

    ["Entries", s.length],

    [
      "Companies",
      new Set(
        s.map(
          (x) =>
            x.Company
        )
      ).size
    ]

  ]
    .map(
      (x) =>
        card(...x)
    )
    .join("");


  $("salaryList").innerHTML =
    s
      .slice()
      .reverse()
      .map(
        (x) =>
          item(

            `${esc(x.Month)}
            • ${esc(x.Company)}`,

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
      .join("") ||

    "<p>No salary records</p>";
}


async function addSalary() {

  if (
    n(
      $("salAmount").value
    ) <= 0
  ) {

    return toast(
      "Enter valid salary amount"
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
        $("salCompany").value,

      Amount:
        n(
          $("salAmount").value
        ),

      Remarks:
        $("salRemarks").value
    }
  );


  $("salCompany").value =
    "";

  $("salAmount").value =
    "";

  $("salRemarks").value =
    "";
}


/* =====================================================
   LOANS & EMI
===================================================== */

function loans() {

  const l =
    DB.loans || [];

  const e =
    DB.emi || [];

  const y =
    ym();


  const init =
    l.reduce(
      (a, x) =>
        a +
        n(
          x["Initial Amount"]
        ),
      0
    );


  const paid =
    e.reduce(
      (a, x) =>
        a +
        n(x.Amount),
      0
    );


  const month =
    e
      .filter(
        (x) =>
          x.Month === y
      )
      .reduce(
        (a, x) =>
          a + n(x.Amount),
        0
      );


  $("loanDash").innerHTML =
    [

      [
        "Initial Loans",
        m(init)
      ],

      [
        "EMI This Month",
        m(month)
      ],

      [
        "Total EMI Paid",
        m(paid)
      ],

      [
        "Loans",
        l.length
      ]

    ]
      .map(
        (x) =>
          card(...x)
      )
      .join("");


  $("emiLoan").innerHTML =
    `<option value="">
      Select loan
    </option>` +

    l
      .map(
        (x) =>
          `<option value="${x.ID}">
            ${esc(
              x["Loan Name"]
            )}
          </option>`
      )
      .join("");


  $("loanList").innerHTML =
    l
      .map(
        (x) => {

          const p =
            e
              .filter(
                (z) =>
                  z["Loan ID"] ===
                  x.ID
              )
              .reduce(
                (a, z) =>
                  a + n(z.Amount),
                0
              );


          return item(

            `<b>
              ${esc(
                x["Loan Name"]
              )}
            </b>

            <br>

            <small>
              Initial ${m(
                x["Initial Amount"]
              )}

              • Paid ${m(p)}

              • Remaining ${m(
                Math.max(
                  0,
                  n(
                    x["Initial Amount"]
                  ) - p
                )
              )}
            </small>`,

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
        }
      )
      .join("") ||

    "<p>No loans</p>";
}


async function addLoan() {

  if (
    !$("loanName")
      .value
      .trim() ||

    n(
      $("loanInitial").value
    ) <= 0
  ) {

    return toast(
      "Enter loan name and amount"
    );
  }


  await save(
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


  $("loanName").value =
    "";

  $("loanInitial").value =
    "";

  $("loanRemarks").value =
    "";
}


async function addEmi() {

  if (
    !$("emiLoan").value
  ) {

    return toast(
      "Select loan"
    );
  }


  if (
    n(
      $("emiAmount").value
    ) <= 0
  ) {

    return toast(
      "Enter valid EMI amount"
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
        n(
          $("emiAmount").value
        ),

      Remarks:
        $("emiRemarks").value
    }
  );


  $("emiAmount").value =
    "";

  $("emiRemarks").value =
    "";
}


/* =====================================================
   GIVE & TAKE
===================================================== */

function giveBal() {

  const o = {};


  (
    DB.transactions ||
    []
  ).forEach(
    (x) => {

      const p =
        x.Person ||
        "Unknown";


      if (!o[p]) {

        o[p] = {

          person: p,

          balance: 0,

          given: 0,

          received: 0,

          taken: 0,

          paid: 0
        };
      }


      const a =
        n(x.Amount);

      const z =
        o[p];


      if (
        x.Type ===
        "Give"
      ) {

        z.balance += a;
        z.given += a;

      } else if (
        x.Type ===
        "Receive"
      ) {

        z.balance -= a;
        z.received += a;

      } else if (
        x.Type ===
        "Take"
      ) {

        z.balance -= a;
        z.taken += a;

      } else if (
        x.Type ===
        "Pay"
      ) {

        z.balance += a;
        z.paid += a;
      }
    }
  );


  return o;
}


function give() {

  const a =
    Object.values(
      giveBal()
    );


  const r =
    a
      .filter(
        (x) =>
          x.balance > 0
      )
      .reduce(
        (s, x) =>
          s + x.balance,
        0
      );


  const p =
    a
      .filter(
        (x) =>
          x.balance < 0
      )
      .reduce(
        (s, x) =>
          s - x.balance,
        0
      );


  $("giveDash").innerHTML =
    [

      [
        "To Receive",
        m(r)
      ],

      [
        "To Pay",
        m(p)
      ],

      [
        "Net",
        m(r - p)
      ],

      [
        "People",
        a.length
      ]

    ]
      .map(
        (x) =>
          card(...x)
      )
      .join("");


  $("gtDashboard").innerHTML =
    a
      .map(
        (x) =>
          card(

            `${esc(x.person)}

            • ${

              x.balance > 0
                ? "To Receive"

                : x.balance < 0
                  ? "To Pay"

                  : "Settled"
            }`,

            m(
              Math.abs(
                x.balance
              )
            )
          )
      )
      .join("");


  $("gtList").innerHTML =
    (
      DB.transactions ||
      []
    )
      .slice()
      .reverse()
      .map(
        (x) =>
          item(

            `<b>
              ${esc(x.Person)}
            </b>

            • ${esc(x.Type)}

            <br>

            <small>
              ${esc(
                x.Date || ""
              )}

              • ${esc(
                x.Purpose || ""
              )}
            </small>`,

            m(x.Amount),

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
}


async function addGive() {

  if (
    !$("gtPerson")
      .value
      .trim() ||

    n(
      $("gtAmount").value
    ) <= 0
  ) {

    return toast(
      "Enter person and valid amount"
    );
  }


  await save(
    "transactions",
    {

      ID:
        uid(),

      Person:
        $("gtPerson").value,

      Type:
        $("gtType").value,

      Amount:
        n(
          $("gtAmount").value
        ),

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
  );


  $("gtPerson").value =
    "";

  $("gtAmount").value =
    "";

  $("gtPurpose").value =
    "";

  $("gtNotes").value =
    "";
}


/* =====================================================
   VEHICLE FILTER
===================================================== */

function vehicleFilterState() {

  return {

    type:
      $("vehicleTypeFilter")
        ?.value || "",

    id:
      $("vehicleFilter")
        ?.value || ""
  };
}


function syncVehicleFilters() {

  const vs =
    DB.vehicles || [];

  const typeEl =
    $("vehicleTypeFilter");

  const vehEl =
    $("vehicleFilter");


  if (
    !typeEl ||
    !vehEl
  ) return;


  const prevType =
    typeEl.value;

  const prevId =
    vehEl.value;


  const filtered =
    vs.filter(
      (v) =>
        !prevType ||

        v["Vehicle Type"] ===
        prevType
    );


  vehEl.innerHTML =
    `<option value="">
      All Vehicles
    </option>` +

    filtered
      .map(
        (v) =>
          `<option value="${v.ID}">

            ${esc(
              v["Vehicle Name"]
            )}

            •

            ${esc(
              v["Vehicle Type"]
            )}

          </option>`
      )
      .join("");


  if (
    filtered.some(
      (v) =>
        v.ID === prevId
    )
  ) {

    vehEl.value =
      prevId;
  }
}


function resetVehicleFilters() {

  $("vehicleTypeFilter").value =
    "";

  $("vehicleFilter").value =
    "";

  render();
}


function filteredVehicles() {

  const f =
    vehicleFilterState();


  return (
    DB.vehicles ||
    []
  ).filter(
    (v) =>

      (
        !f.type ||

        v["Vehicle Type"] ===
        f.type
      ) &&

      (
        !f.id ||

        v.ID ===
        f.id
      )
  );
}


/* =====================================================
   LATEST ODOMETER
===================================================== */

function latestOdoForVehicle(id) {

  const rows =
    (
      DB.fuel ||
      []
    )
      .filter(
        (x) =>
          x["Vehicle ID"] === id &&
          n(x.Odometer) > 0
      )
      .sort(
        (a, b) =>

          String(
            a.Date || ""
          ).localeCompare(
            String(
              b.Date || ""
            )
          ) ||

          n(a.Odometer) -
          n(b.Odometer)
      );


  return rows.length
    ? n(
        rows[
          rows.length - 1
        ].Odometer
      )
    : 0;
}


/* =====================================================
   LATEST MAINTENANCE
===================================================== */

function latestMaintenanceForVehicle(
  id,
  checker
) {

  const rows =
    (
      DB.maintenance ||
      []
    )
      .filter(
        (x) =>

          x["Vehicle ID"] ===
          id &&

          n(
            x.Odometer
          ) > 0 &&

          (
            !checker ||
            checker(x)
          )
      )
      .sort(
        (a, b) =>

          String(
            a.Date || ""
          ).localeCompare(
            String(
              b.Date || ""
            )
          ) ||

          n(a.Odometer) -
          n(b.Odometer)
      );


  return rows.length
    ? rows[
        rows.length - 1
      ]
    : null;
}


/* =====================================================
   OIL INTERVAL
===================================================== */

function oilInterval(vehicle) {

  const type =
    String(
      vehicle["Vehicle Type"] || ""
    ).toLowerCase();


  /* Bike = 3000 KM */

  if (
    type ===
    "bike"
  ) {

    return 3000;
  }


  /* Car = 10000 KM */

  if (
    type ===
    "car"
  ) {

    return 10000;
  }


  return 0;
}


/* =====================================================
   MAINTENANCE SUMMARY
===================================================== */

function renderMaintenanceSummary(vs) {

  const cards =
    vs.map(
      (v) => {

        const current =
          latestOdoForVehicle(
            v.ID
          );


        const oil =
          latestMaintenanceForVehicle(
            v.ID,

            (x) =>

              [
                "oil change",
                "engine oil",
                "oil"
              ].includes(
                String(
                  x.Category || ""
                )
                  .toLowerCase()
              )
          );


        const service =
          latestMaintenanceForVehicle(
            v.ID,

            (x) =>
              String(
                x.Category || ""
              )
                .toLowerCase() ===
              "service"
          );


        let html = "";


        /* ================= OIL ================= */

        if (oil) {

          const interval =
            n(
              oil["Next Target KM"]
            ) ||
            oilInterval(v);


          const target =
            n(oil.Odometer) +
            interval;


          const remain =
            target -
            current;


          let cls =
            "km-good";


          if (remain < 0) {

            cls =
              "km-over";

          } else if (
            remain < 1000
          ) {

            cls =
              "km-warn";
          }


          html += `

            <div class="maint-section">

              <h4>
                🛢️ Oil Change
              </h4>

              <div class="maint-row">

                <span>
                  Last Oil Change
                </span>

                <b>
                  ${esc(
                    String(
                      oil.Date || ""
                    ).slice(0, 10)
                  )}

                  •

                  ${n(
                    oil.Odometer
                  ).toLocaleString(
                    "en-IN"
                  )} km
                </b>

              </div>


              <div class="maint-row">

                <span>
                  Next Oil Target
                </span>

                <b>
                  ${target.toLocaleString(
                    "en-IN"
                  )} km
                </b>

              </div>


              <div class="maint-row">

                <span>
                  KM Remaining
                </span>

                <b class="${cls}">

                  ${
                    remain >= 0

                      ? remain.toLocaleString(
                          "en-IN"
                        ) + " km"

                      : Math.abs(
                          remain
                        ).toLocaleString(
                          "en-IN"
                        ) +
                        " km overdue"
                  }

                </b>

              </div>

            </div>
          `;
        }


        /* ================= SERVICE ================= */

        if (service) {

          const interval =
            n(
              service["Next Target KM"]
            );


          const target =
            interval > 0

              ? n(
                  service.Odometer
                ) + interval

              : 0;


          const remain =
            target -
            current;


          let cls =
            "km-good";


          if (
            target > 0
          ) {

            if (
              remain < 0
            ) {

              cls =
                "km-over";

            } else if (
              remain < 1000
            ) {

              cls =
                "km-warn";
            }
          }


          html += `

            <div class="maint-section">

              <h4>
                🔧 Service
              </h4>


              <div class="maint-row">

                <span>
                  Last Service
                </span>

                <b>

                  ${esc(
                    String(
                      service.Date || ""
                    ).slice(0, 10)
                  )}

                  •

                  ${n(
                    service.Odometer
                  ).toLocaleString(
                    "en-IN"
                  )} km

                </b>

              </div>


              <div class="maint-row">

                <span>
                  Next Service Target
                </span>

                <b>

                  ${
                    target > 0

                      ? target.toLocaleString(
                          "en-IN"
                        ) + " km"

                      : "Not set"
                  }

                </b>

              </div>


              <div class="maint-row">

                <span>
                  KM Remaining
                </span>

                <b class="${cls}">

                  ${
                    target > 0

                      ? remain >= 0

                        ? remain.toLocaleString(
                            "en-IN"
                          ) + " km"

                        : Math.abs(
                            remain
                          ).toLocaleString(
                            "en-IN"
                          ) +
                          " km overdue"

                      : "Not set"
                  }

                </b>

              </div>

            </div>
          `;
        }


        return `

          <div class="maintenance-card">

            <h3>

              ${
                v["Vehicle Type"] ===
                "Bike"

                  ? "🏍️"

                  : "🚗"
              }

              ${esc(
                v["Vehicle Name"]
              )}

            </h3>


            <div class="maint-row">

              <span>
                Current Odometer
              </span>

              <b>

                ${
                  current

                    ? current.toLocaleString(
                        "en-IN"
                      ) + " km"

                    : "No fuel odometer yet"
                }

              </b>

            </div>


            ${
              html ||

              `<p class="muted">
                No maintenance entry yet.
              </p>`
            }

          </div>
        `;
      }
    );


  $("vehicleMaintenanceSummary").innerHTML =
    cards.join("") ||

    "<p>No vehicle selected.</p>";
}


/* =====================================================
   VEHICLES DASHBOARD
===================================================== */

function vehicles() {

  const vsAll =
    DB.vehicles || [];

  const vs =
    filteredVehicles();


  const ids =
    new Set(
      vs.map(
        (v) =>
          v.ID
      )
    );


  const fuel =
    (
      DB.fuel ||
      []
    )
      .filter(
        (x) =>
          ids.has(
            x["Vehicle ID"]
          )
      );


  const maint =
    (
      DB.maintenance ||
      []
    )
      .filter(
        (x) =>
          ids.has(
            x["Vehicle ID"]
          )
      );


  const prevFuel =
    $("fuelVehicle").value;

  const prevMaint =
    $("maintVehicle").value;


  const opts =
    `<option value="">
      Select vehicle
    </option>` +

    vsAll
      .map(
        (v) =>
          `<option value="${v.ID}">

            ${esc(
              v["Vehicle Name"]
            )}

            •

            ${esc(
              v["Vehicle Type"]
            )}

          </option>`
      )
      .join("");


  $("fuelVehicle").innerHTML =
    opts;

  $("maintVehicle").innerHTML =
    opts;


  if (
    vsAll.some(
      (v) =>
        v.ID === prevFuel
    )
  ) {

    $("fuelVehicle").value =
      prevFuel;
  }


  if (
    vsAll.some(
      (v) =>
        v.ID === prevMaint
    )
  ) {

    $("maintVehicle").value =
      prevMaint;
  }


  const month =
    ym();


  const fuelTotal =
    fuel.reduce(
      (s, x) =>
        s + n(x.Amount),
      0
    );


  const maintTotal =
    maint.reduce(
      (s, x) =>
        s + n(x.Amount),
      0
    );


  const monthFuel =
    fuel
      .filter(
        (x) =>
          String(
            x.Date || ""
          ).slice(0, 7) ===
          month
      )
      .reduce(
        (s, x) =>
          s + n(x.Amount),
        0
      );


  const monthMaint =
    maint
      .filter(
        (x) =>
          String(
            x.Date || ""
          ).slice(0, 7) ===
          month
      )
      .reduce(
        (s, x) =>
          s + n(x.Amount),
        0
      );


  $("vehicleDash").innerHTML =
    [

      [
        "Vehicles",
        vs.length
      ],

      [
        "Fuel This Month",
        m(monthFuel)
      ],

      [
        "Maintenance This Month",
        m(monthMaint)
      ],

      [
        "Total Fuel",
        m(fuelTotal)
      ],

      [
        "Total Maintenance",
        m(maintTotal)
      ],

      [
        "Total Vehicle Cost",
        m(
          fuelTotal +
          maintTotal
        )
      ]

    ]
      .map(
        (x) =>
          card(...x)
      )
      .join("");


  renderMaintenanceSummary(
    vs
  );


  $("fuelList").innerHTML =
    fuel
      .slice()
      .sort(
        (a, b) =>
          String(
            b.Date
          ).localeCompare(
            String(
              a.Date
            )
          )
      )
      .map(
        (x) => {

          const v =
            vsAll.find(
              (z) =>
                z.ID ===
                x["Vehicle ID"]
            );


          return item(

            `<b>
              ${esc(
                v
                  ? v["Vehicle Name"]
                  : "Unknown Vehicle"
              )}
            </b>

            <br>

            <small>

              ${esc(x.Date)}

              •

              ${
                n(x.Odometer) ||
                "-"
              } km

              •

              ${
                n(x.Quantity) ||
                0
              } L

              •

              ${esc(
                x["Fuel Type"] ||
                "Fuel"
              )}

            </small>`,

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
        }
      )
      .join("") ||

    "<p>No fuel entries</p>";


  $("maintenanceList").innerHTML =
    maint
      .slice()
      .sort(
        (a, b) =>
          String(
            b.Date
          ).localeCompare(
            String(
              a.Date
            )
          )
      )
      .map(
        (x) => {

          const v =
            vsAll.find(
              (z) =>
                z.ID ===
                x["Vehicle ID"]
            );


          return item(

            `<b>
              ${esc(
                v
                  ? v["Vehicle Name"]
                  : "Unknown Vehicle"
              )}
            </b>

            <br>

            <small>

              ${esc(x.Date)}

              •

              ${esc(x.Category)}

              •

              ${
                n(x.Odometer) ||
                "-"
              } km

              •

              Next Interval

              ${
                n(
                  x["Next Target KM"]
                ) || "-"
              } km

            </small>`,

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
        }
      )
      .join("") ||

    "<p>No maintenance entries</p>";
}


/* =====================================================
   ADD VEHICLE
===================================================== */

async function addVehicle() {

  const name =
    $("vehicleName")
      .value
      .trim();


  if (!name) {

    return toast(
      "Enter vehicle name"
    );
  }


  await save(
    "vehicles",
    {

      ID:
        uid(),

      "Vehicle Name":
        name,

      "Vehicle Type":
        $("vehicleType").value,

      "Number Plate":
        $("vehiclePlate")
          .value
          .trim()
    }
  );


  $("vehicleName").value =
    "";

  $("vehiclePlate").value =
    "";
}


/* =====================================================
   ADD FUEL
===================================================== */

async function addFuel() {

  if (
    !$("fuelVehicle").value
  ) {

    return toast(
      "Select vehicle"
    );
  }


  const amount =
    n(
      $("fuelAmount").value
    );


  if (amount <= 0) {

    return toast(
      "Enter valid fuel amount"
    );
  }


  const r =
    await save(
      "fuel",
      {

        ID:
          uid(),

        "Vehicle ID":
          $("fuelVehicle").value,

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
          $("fuelNotes").value
      }
    );


  await save(
    "passbook",
    {

      ID:
        "fuel-" +
        r.ID,

      Date:
        r.Date,

      Type:
        "Expense",

      Category:
        "Petrol / Fuel",

      Amount:
        amount,

      Account:
        "Vehicle Tracker",

      Remarks:

        (
          DB.vehicles ||
          []
        )
          .find(
            (v) =>
              v.ID ===
              r["Vehicle ID"]
          )
          ?.["Vehicle Name"] ||
        "Fuel",

      "Source ID":
        r.ID
    }
  );


  $("fuelOdo").value =
    "";

  $("fuelQty").value =
    "";

  $("fuelAmount").value =
    "";

  $("fuelNotes").value =
    "";
}


/* =====================================================
   ADD MAINTENANCE
===================================================== */

async function addMaintenance() {

  if (
    !$("maintVehicle").value
  ) {

    return toast(
      "Select vehicle"
    );
  }


  const amount =
    n(
      $("maintAmount").value
    );


  if (amount <= 0) {

    return toast(
      "Enter valid maintenance amount"
    );
  }


  const vehicle =
    (
      DB.vehicles ||
      []
    ).find(
      (v) =>
        v.ID ===
        $("maintVehicle").value
    );


  const category =
    $("maintCategory").value;


  let targetInterval =
    n(
      $("maintTargetKm").value
    );


  /*
    AUTO DEFAULT OIL INTERVAL

    Bike = 3000 KM
    Car = 10000 KM
  */

  if (
    [
      "oil change",
      "engine oil",
      "oil"
    ].includes(
      String(category)
        .toLowerCase()
    ) &&

    targetInterval <= 0
  ) {

    targetInterval =
      oilInterval(vehicle || {});
  }


  const r =
    await save(
      "maintenance",
      {

        ID:
          uid(),

        "Vehicle ID":
          $("maintVehicle").value,

        Date:
          $("maintDate").value ||
          today(),

        Category:
          category,

        Amount:
          amount,

        Odometer:
          n(
            $("maintOdo").value
          ),

        "Next Target KM":
          targetInterval,

        Remarks:
          $("maintRemarks").value
      }
    );


  await save(
    "passbook",
    {

      ID:
        "maintenance-" +
        r.ID,

      Date:
        r.Date,

      Type:
        "Expense",

      Category:
        "Vehicle Maintenance",

      Amount:
        amount,

      Account:
        "Vehicle Tracker",

      Remarks:
        `${r.Category} - ${
          vehicle?.["Vehicle Name"] ||
          "Vehicle"
        }`,

      "Source ID":
        r.ID
    }
  );


  $("maintAmount").value =
    "";

  $("maintOdo").value =
    "";

  $("maintTargetKm").value =
    "";

  $("maintRemarks").value =
    "";
}


/* =====================================================
   DATALISTS
===================================================== */

function lists() {

  const p =
    DB.passbook || [];

  const s =
    DB.salary || [];

  const t =
    DB.transactions || [];


  const fill =
    (id, a) => {

      const e =
        $(id);

      if (!e) return;


      e.innerHTML =
        [
          ...new Set(
            a.filter(Boolean)
          )
        ]
          .map(
            (x) =>
              `<option value="${esc(x)}">`
          )
          .join("");
    };


  fill(
    "categoryList",
    p.map(
      (x) =>
        x.Category
    )
  );


  fill(
    "accountList",
    p.map(
      (x) =>
        x.Account
    )
  );


  fill(
    "remarksList",
    p.map(
      (x) =>
        x.Remarks
    )
  );


  fill(
    "companyList",
    s.map(
      (x) =>
        x.Company
    )
  );


  fill(
    "salaryRemarksList",
    s.map(
      (x) =>
        x.Remarks
    )
  );


  fill(
    "personList",
    t.map(
      (x) =>
        x.Person
    )
  );
}


/* =====================================================
   CHARTS
===================================================== */

function draw() {

  const f =
    dashFilter();

  const y =
    f.month;


  const p =
    filterPassbook(
      DB.passbook || [],
      y,
      f.category
    );


  const s =
    DB.salary || [];

  const e =
    DB.emi || [];

  const l =
    DB.loans || [];


  const otherIncome =
    p
      .filter(
        (x) =>
          String(
            x.Type || ""
          ).toLowerCase() ===
          "income"
      )
      .reduce(
        (z, x) =>
          z + n(x.Amount),
        0
      );


  const exp =
    p
      .filter(
        (x) =>
          String(
            x.Type || ""
          ).toLowerCase() ===
          "expense"
      )
      .reduce(
        (z, x) =>
          z + n(x.Amount),
        0
      );


  const sal =
    s
      .filter(
        (x) =>
          x.Month === y
      )
      .reduce(
        (z, x) =>
          z + n(x.Amount),
        0
      );


  const totalIncome =
    sal +
    otherIncome;


  const em =
    e
      .filter(
        (x) =>
          x.Month === y
      )
      .reduce(
        (z, x) =>
          z + n(x.Amount),
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
      sal,
      otherIncome,
      totalIncome,
      exp,
      em
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
      exp
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
      exp
    ],

    "Amount"
  );


  const sm = {};

  s.forEach(
    (x) => {

      sm[x.Month] =
        (
          sm[x.Month] ||
          0
        ) +
        n(x.Amount);
    }
  );


  chart(
    "salaryChart",
    "line",

    Object.keys(sm),

    Object.values(sm),

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
      l.reduce(
        (z, x) =>
          z +
          n(
            x["Initial Amount"]
          ),
        0
      ),

      e.reduce(
        (z, x) =>
          z +
          n(x.Amount),
        0
      )
    ],

    "Amount"
  );


  const gb =
    Object.values(
      giveBal()
    );


  chart(
    "giveChart",
    "bar",

    gb.map(
      (x) =>
        x.person
    ),

    gb.map(
      (x) =>
        Math.abs(
          x.balance
        )
    ),

    "Outstanding"
  );


  const vs =
    filteredVehicles();


  const ids =
    new Set(
      vs.map(
        (v) =>
          v.ID
      )
    );


  const fu =
    (
      DB.fuel ||
      []
    )
      .filter(
        (x) =>
          ids.has(
            x["Vehicle ID"]
          )
      );


  const ma =
    (
      DB.maintenance ||
      []
    )
      .filter(
        (x) =>
          ids.has(
            x["Vehicle ID"]
          )
      );


  chart(
    "fuelChart",
    "bar",

    vs.map(
      (v) =>
        v["Vehicle Name"]
    ),

    vs.map(
      (v) =>
        fu
          .filter(
            (x) =>
              x["Vehicle ID"] ===
              v.ID
          )
          .reduce(
            (z, x) =>
              z +
              n(x.Amount),
            0
          )
    ),

    "Fuel Cost"
  );


  chart(
    "maintenanceChart",
    "bar",

    vs.map(
      (v) =>
        v["Vehicle Name"]
    ),

    vs.map(
      (v) =>
        ma
          .filter(
            (x) =>
              x["Vehicle ID"] ===
              v.ID
          )
          .reduce(
            (z, x) =>
              z +
              n(x.Amount),
            0
          )
    ),

    "Maintenance Cost"
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
].forEach(
  (id) => {

    const el =
      $(id);

    if (el) {

      el.onchange =
        () =>
          render();
    }
  }
);


if (
  $("vehicleTypeFilter")
) {

  $("vehicleTypeFilter").onchange =
    () => {

      /*
        Reset selected vehicle
        when vehicle type changes
      */

      $("vehicleFilter").value =
        "";

      syncVehicleFilters();

      render();
    };
}


if (
  $("vehicleFilter")
) {

  $("vehicleFilter").onchange =
    () =>
      render();
}


/* =====================================================
   DEFAULT DATES
===================================================== */

[
  "pbDate",
  "gtDate",
  "fuelDate",
  "maintDate"
].forEach(
  (x) => {

    if (
      $(x) &&
      !$(x).value
    ) {

      $(x).value =
        today();
    }
  }
);


[
  "salMonth",
  "emiMonth"
].forEach(
  (x) => {

    if (
      $(x) &&
      !$(x).value
    ) {

      $(x).value =
        ym();
    }
  }
);


/* =====================================================
   LOCAL CACHE LOAD
===================================================== */

try {

  DB =
    JSON.parse(
      localStorage.getItem(KEY) ||
      "{}"
    );

} catch (e) {

  console.error(e);

  DB = {};
}


/* =====================================================
   START APP
===================================================== */

render();


status(
  Object.keys(DB).length

    ? "☁️ Loading..."

    : "☁️ Connecting..."
);


loadAll();
