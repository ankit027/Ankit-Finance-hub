const API_URL="https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";

const LOCAL_KEY="ankit_finance_hub_db_final";

let DB={};
let syncInProgress=false;
let charts={};

const $=id=>document.getElementById(id);

const uid=()=>Date.now()+"-"+Math.random().toString(36).slice(2);

const num=v=>Number(v||0)||0;

const money=v=>"₹"+num(v).toLocaleString("en-IN",{
  maximumFractionDigits:2
});

const ym=()=>new Date().toISOString().slice(0,7);

const today=()=>new Date().toISOString().slice(0,10);


/* ================= TOAST ================= */

function toast(t){

  $("toast").textContent=t;

  $("toast").classList.add("show");

  setTimeout(()=>{
    $("toast").classList.remove("show");
  },2500);

}

function setStatus(t){
  $("status").textContent=t;
}


/* ================= LOCAL CACHE ================= */

function persist(){

  try{
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify(DB)
    );
  }catch(e){}

}

function restore(){

  try{
    return JSON.parse(
      localStorage.getItem(LOCAL_KEY)||"{}"
    );
  }catch(e){
    return {};
  }

}


/* ================= API ================= */

async function api(action,payload={}){

  const r=await fetch(API_URL,{
    method:"POST",
    headers:{
      "Content-Type":"text/plain;charset=utf-8"
    },
    body:JSON.stringify({
      action,
      ...payload
    })
  });

  const text=await r.text();

  let j;

  try{
    j=JSON.parse(text);
  }catch(e){

    throw new Error(
      "Invalid API response. Check Apps Script."
    );

  }

  if(!j.success){

    throw new Error(
      j.error||"API Error"
    );

  }

  return j;

}


/* ================= LOAD ================= */

async function loadAll(silent=false){

  if(syncInProgress)return;

  syncInProgress=true;

  try{

    if(!silent){
      setStatus("☁️ Syncing...");
    }

    const r=await api("loadAll");

    DB=r.data||{};

    persist();

    render();

    setStatus("☁️ Synced");

  }catch(e){

    if(Object.keys(DB).length){

      setStatus("📱 Offline Cache");

    }else{

      setStatus("⚠️ Sync Error");

    }

    if(!silent){
      toast(e.message);
    }

  }finally{

    syncInProgress=false;

  }

}


/* ================= SAVE ================= */

async function save(table,data){

  setStatus("☁️ Saving...");

  try{

    const r=await api(
      "save",
      {
        table,
        data
      }
    );

    const record=r.record||data;

    DB[table]=DB[table]||[];

    const i=DB[table].findIndex(
      x=>String(x.ID)===String(record.ID)
    );

    if(i>=0){

      DB[table][i]=record;

    }else{

      DB[table].push(record);

    }

    persist();

    render();

    setStatus("☁️ Synced");

    toast("✓ Saved instantly");

    return record;

  }catch(e){

    setStatus("⚠️ Save failed");

    toast(e.message);

    throw e;

  }

}


/* ================= DELETE ================= */

async function del(table,id){

  if(!confirm("Delete this record?")){
    return;
  }

  try{

    await api(
      "delete",
      {
        table,
        id
      }
    );

    DB[table]=(DB[table]||[]).filter(
      x=>String(x.ID)!==String(id)
    );

    persist();

    render();

    toast("Deleted");

  }catch(e){

    toast(e.message);

  }

}


/* ================= NAVIGATION ================= */

document.querySelectorAll("[data-page]").forEach(b=>{

  b.onclick=()=>{

    document.querySelectorAll(".page").forEach(p=>{
      p.classList.remove("active");
    });

    $(b.dataset.page).classList.add("active");

    $("sidebar").classList.remove("open");

  };

});


$("menuBtn").onclick=()=>{

  $("sidebar").classList.toggle("open");

};


/* ================= DARK MODE ================= */

const savedTheme=
localStorage.getItem("financeTheme")||"light";

if(savedTheme==="dark"){

  document.body.classList.add("dark");

}

function updateThemeBtn(){

  $("themeBtn").textContent=
  document.body.classList.contains("dark")
  ?"☀️ Light"
  :"🌙 Dark";

}

updateThemeBtn();

$("themeBtn").onclick=()=>{

  document.body.classList.toggle("dark");

  localStorage.setItem(
    "financeTheme",
    document.body.classList.contains("dark")
    ?"dark"
    :"light"
  );

  updateThemeBtn();

};


/* ================= HTML ITEM ================= */

function item(left,right,id,table){

  return `
  <div class="item">

    <span>
      ${left}
    </span>

    <span>

      ${right}

      <button
      class="danger"
      onclick="del('${table}','${id}')">

      Delete

      </button>

    </span>

  </div>
  `;

}


/* ================= MAIN RENDER ================= */

function render(){

  const y=ym();

  const p=DB.passbook||[];
  const sal=DB.salary||[];
  const em=DB.emi||[];
  const sp=DB.sipPayments||[];

  const salary=sal
  .filter(x=>String(x.Month)===y)
  .reduce((s,x)=>s+num(x.Amount),0);

  const expense=p
  .filter(x=>
    String(x.Date).slice(0,7)===y &&
    String(x.Type).toLowerCase()==="expense"
  )
  .reduce((s,x)=>s+num(x.Amount),0);

  const income=p
  .filter(x=>
    String(x.Date).slice(0,7)===y &&
    String(x.Type).toLowerCase()==="income"
  )
  .reduce((s,x)=>s+num(x.Amount),0);

  const emi=em
  .filter(x=>String(x.Month)===y)
  .reduce((s,x)=>s+num(x.Amount),0);

  const sip=sp
  .filter(x=>String(x.Month)===y)
  .reduce((s,x)=>s+num(x.Amount),0);


  const gt=getGiveTakeBalances();

  const receive=Object.values(gt)
  .filter(x=>x.balance>0)
  .reduce((s,x)=>s+x.balance,0);

  const pay=Object.values(gt)
  .filter(x=>x.balance<0)
  .reduce((s,x)=>s+Math.abs(x.balance),0);


  $("dash").innerHTML=[

    ["💰 Salary",salary],

    ["💸 Expense",expense],

    ["📈 SIP Paid",sip],

    ["🏦 EMI Paid",emi],

    ["🤝 To Receive",receive],

    ["🤝 To Pay",pay],

    ["📒 Other Income",income],

    [
      "💳 Net",
      salary+income-expense-emi-sip
    ]

  ].map(x=>`

    <div class="card">

      <small>${x[0]}</small>

      <b>${money(x[1])}</b>

    </div>

  `).join("");


  /* PASSBOOK */

  $("pbList").innerHTML=

  p.map(x=>
    item(
      `${x.Date} • <b>${x.Category}</b> • ${x.Type}`,
      money(x.Amount),
      x.ID,
      "passbook"
    )
  ).join("")
  ||"<p>No records</p>";


  /* SALARY */

  $("salaryList").innerHTML=

  sal.map(x=>
    item(
      `${x.Month} • ${x.Company}`,
      money(x.Amount),
      x.ID,
      "salary"
    )
  ).join("")
  ||"<p>No records</p>";


  /* LOANS */

  const loans=DB.loans||[];

  $("emiLoan").innerHTML=

  '<option value="">Select loan</option>'+

  loans.map(x=>
    `<option value="${x.ID}">
      ${x["Loan Name"]}
    </option>`
  ).join("");


  $("loanList").innerHTML=

  loans.map(x=>`

    <div class="item">

      <span>

        <b>${x["Loan Name"]}</b>

        <br>

        <small>
        ${x.Remarks||""}
        </small>

      </span>

      <span>

        ${money(x["Initial Amount"])}

      </span>

    </div>

  `).join("")
  ||"<p>No loans</p>";


  /* GIVE TAKE */

  const tr=DB.transactions||[];

  $("gtList").innerHTML=

  tr.map(x=>
    item(
      `<b>${x.Person}</b> • ${x.Type}
      <br>
      <small>${x.Purpose||""}</small>`,
      money(x.Amount),
      x.ID,
      "transactions"
    )
  ).join("")
  ||"<p>No records</p>";


  renderSuggestions();

  renderSectionDashboards();

  renderGiveTakeDashboard();

  renderInvest();

  renderSplit();

  renderCharts();

}


/* ================= DASHBOARD BOX ================= */

function ensureSummaryBox(id,anchorId){

  let box=$(id);

  if(!box){

    const anchor=$(anchorId);

    if(!anchor)return null;

    box=document.createElement("div");

    box.id=id;

    box.className="section-dashboard";

    anchor.parentNode.insertBefore(
      box,
      anchor
    );

  }

  return box;

}


function cards(arr){

  return `

  <div class="section-dashboard-grid">

  ${arr.map(c=>`

    <div class="section-stat-card">

      <small>${c[0]}</small>

      <b>${c[1]}</b>

    </div>

  `).join("")}

  </div>

  `;

}


/* ================= SECTION DASHBOARDS ================= */

function renderSectionDashboards(){

  const y=ym();

  const p=DB.passbook||[];
  const sal=DB.salary||[];
  const loans=DB.loans||[];
  const em=DB.emi||[];
  const assets=DB.assets||[];
  const baskets=DB.baskets||[];
  const payments=DB.sipPayments||[];


  /* PASSBOOK */

  const income=p
  .filter(x=>
    String(x.Date).slice(0,7)===y &&
    String(x.Type).toLowerCase()==="income"
  )
  .reduce((s,x)=>s+num(x.Amount),0);


  const expense=p
  .filter(x=>
    String(x.Date).slice(0,7)===y &&
    String(x.Type).toLowerCase()==="expense"
  )
  .reduce((s,x)=>s+num(x.Amount),0);


  const pbBox=
  ensureSummaryBox(
    "passbookDashboard",
    "pbList"
  );

  if(pbBox){

    pbBox.innerHTML=

    `<h3>📒 This Month</h3>`+

    cards([
      ["Income",money(income)],
      ["Expense",money(expense)],
      ["Net",money(income-expense)],
      [
        "Transactions",
        p.filter(x=>
          String(x.Date).slice(0,7)===y
        ).length
      ]
    ]);

  }


  /* SALARY */

  const monthSalary=sal
  .filter(x=>String(x.Month)===y)
  .reduce((s,x)=>s+num(x.Amount),0);


  const totalSalary=sal
  .reduce((s,x)=>s+num(x.Amount),0);


  const salBox=
  ensureSummaryBox(
    "salaryDashboard",
    "salaryList"
  );

  if(salBox){

    salBox.innerHTML=

    `<h3>💰 Salary Dashboard</h3>`+

    cards([
      ["This Month",money(monthSalary)],
      ["Total Salary",money(totalSalary)],
      ["Entries",sal.length],
      [
        "Companies",
        new Set(
          sal.map(x=>x.Company)
        ).size
      ]
    ]);

  }


  /* LOANS */

  const totalLoan=loans
  .reduce(
    (s,x)=>s+num(x["Initial Amount"]),
    0
  );


  const emiMonth=em
  .filter(x=>String(x.Month)===y)
  .reduce(
    (s,x)=>s+num(x.Amount),
    0
  );


  const emiTotal=em
  .reduce(
    (s,x)=>s+num(x.Amount),
    0
  );


  const loanBox=
  ensureSummaryBox(
    "loanDashboard",
    "loanList"
  );


  if(loanBox){

    loanBox.innerHTML=

    `<h3>🏦 Loans & EMI</h3>`+

    cards([
      ["Initial Loans",money(totalLoan)],
      ["EMI This Month",money(emiMonth)],
      ["Total EMI Paid",money(emiTotal)],
      ["Loans",loans.length]
    ]);

  }


  /* INVESTMENTS */

  const monthlyPlan=assets
  .reduce(
    (s,x)=>s+num(x["Monthly Amount"]),
    0
  );


  const sipPaid=payments
  .filter(x=>String(x.Month)===y)
  .reduce(
    (s,x)=>s+num(x.Amount),
    0
  );


  const invBox=
  ensureSummaryBox(
    "investmentDashboard",
    "basketList"
  );


  if(invBox){

    invBox.innerHTML=

    `<h3>📈 Investment Dashboard</h3>`+

    cards([
      ["Monthly Planned",money(monthlyPlan)],
      ["Paid This Month",money(sipPaid)],
      ["Pending",money(Math.max(0,monthlyPlan-sipPaid))],
      ["Baskets",baskets.length]
    ]);

  }

}


/* ================= GIVE TAKE ================= */

function getGiveTakeBalances(){

  const out={};

  (DB.transactions||[]).forEach(x=>{

    const person=
    String(x.Person||"Unknown").trim();

    if(!out[person]){

      out[person]={
        person,
        balance:0,
        given:0,
        received:0,
        taken:0,
        paid:0
      };

    }


    const type=
    String(x.Type||"")
    .toLowerCase()
    .trim();


    const amount=num(x.Amount);

    const p=out[person];


    if(type==="give"){

      p.balance+=amount;

      p.given+=amount;

    }

    else if(type==="receive"){

      p.balance-=amount;

      p.received+=amount;

    }

    else if(type==="take"){

      p.balance-=amount;

      p.taken+=amount;

    }

    else if(type==="pay"){

      p.balance+=amount;

      p.paid+=amount;

    }

  });

  return out;

}


function renderGiveTakeDashboard(){

  const list=
  Object.values(
    getGiveTakeBalances()
  ).sort(
    (a,b)=>
    Math.abs(b.balance)-
    Math.abs(a.balance)
  );


  let box=$("gtDashboard");

  if(!box){

    box=document.createElement("div");

    box.id="gtDashboard";

    $("gtList").parentNode.insertBefore(
      box,
      $("gtList")
    );

  }


  if(!list.length){

    box.innerHTML="";

    return;

  }


  box.innerHTML=

  `<h3>👤 Individual Dashboard</h3>

  <div class="summary-grid">

  ${list.map(p=>{

    const status=

    p.balance>0
    ?"To Receive"
    :p.balance<0
    ?"To Pay"
    :"Settled";


    return `

    <div class="card person-card">

      <small>${p.person}</small>

      <b>
      ${money(Math.abs(p.balance))}
      </b>

      <span class="balance-label">
      ${status}
      </span>

      <small>

      Given ${money(p.given)}

      • Received ${money(p.received)}

      <br>

      Taken ${money(p.taken)}

      • Paid ${money(p.paid)}

      </small>

    </div>

    `;

  }).join("")}

  </div>`;

}


/* ================= ADD FUNCTIONS ================= */

function addPassbook(){

  return save(
    "passbook",
    {
      ID:uid(),
      Date:$("pbDate").value||today(),
      Type:$("pbType").value,
      Category:$("pbCat").value,
      Amount:num($("pbAmt").value),
      Account:$("pbAccount").value,
      Remarks:$("pbRemarks").value
    }
  );

}


function addSalary(){

  return save(
    "salary",
    {
      ID:uid(),
      Month:$("salMonth").value||ym(),
      Company:$("salCompany").value,
      Amount:num($("salAmount").value),
      Remarks:$("salRemarks").value
    }
  );

}


function addLoan(){

  return save(
    "loans",
    {
      ID:uid(),
      "Loan Name":$("loanName").value,
      "Initial Amount":
      num($("loanInitial").value),
      Remarks:$("loanRemarks").value
    }
  );

}


function addEmi(){

  if(!$("emiLoan").value){

    toast("Select loan");

    return;

  }

  return save(
    "emi",
    {
      ID:uid(),
      "Loan ID":$("emiLoan").value,
      Month:$("emiMonth").value||ym(),
      Amount:num($("emiAmount").value),
      Remarks:$("emiRemarks").value
    }
  );

}


function addGive(){

  return save(
    "transactions",
    {
      ID:uid(),
      Person:$("gtPerson").value,
      Type:$("gtType").value,
      Amount:num($("gtAmount").value),
      Date:$("gtDate").value||today(),
      Purpose:$("gtPurpose").value,
      Notes:$("gtNotes").value,
      Revisions:"[]"
    }
  );

}


/* ================= INVESTMENTS ================= */

async function addBasket(){

  const name=
  $("sipPerson").value.trim();

  const basket=
  $("sipBasket").value.trim();


  if(!name||!basket){

    toast("Enter person and basket");

    return;

  }


  let person=
  (DB.people||[])
  .find(
    x=>
    String(x.Name)
    .toLowerCase()===
    name.toLowerCase()
  );


  if(!person){

    person=await save(
      "people",
      {
        ID:uid(),
        Name:name
      }
    );

  }


  await save(
    "baskets",
    {
      ID:uid(),
      "Person ID":person.ID,
      "Basket Name":basket
    }
  );

}


function addAsset(){

  if(!$("assetBasket").value){

    toast("Select basket");

    return;

  }


  return save(
    "assets",
    {
      ID:uid(),
      "Basket ID":
      $("assetBasket").value,

      "Asset Name":
      $("assetName").value,

      "Asset Type":
      $("assetType").value,

      "Monthly Amount":
      num($("assetAmount").value)
    }
  );

}


function renderInvest(){

  const baskets=DB.baskets||[];

  const people=DB.people||[];

  const assets=DB.assets||[];

  const payments=
  DB.sipPayments||[];


  $("assetBasket").innerHTML=

  '<option value="">Select basket</option>'+

  baskets.map(b=>{

    const person=
    people.find(
      x=>x.ID===b["Person ID"]
    );

    return `

    <option value="${b.ID}">

    ${person?person.Name:""}

    — ${b["Basket Name"]}

    </option>

    `;

  }).join("");


  $("basketList").innerHTML=

  baskets.map(b=>{

    const person=
    people.find(
      x=>x.ID===b["Person ID"]
    );


    const assetsForBasket=

    assets.filter(
      x=>x["Basket ID"]===b.ID
    );


    const total=

    assetsForBasket.reduce(
      (s,x)=>
      s+num(x["Monthly Amount"]),
      0
    );


    const done=

    payments.some(
      x=>
      x["Basket ID"]===b.ID &&
      x.Month===ym()
    );


    return `

    <div class="item">

      <span>

      <b>

      ${person?person.Name:""}

      — ${b["Basket Name"]}

      </b>

      <br>

      <small>

      ${assetsForBasket.map(
        x=>
        `${x["Asset Name"]}
        ${money(x["Monthly Amount"])}`
      ).join(" • ")||"No assets"}

      </small>

      </span>


      <span>

      ${money(total)}

      <br>

      ${
        done
        ?"✓ PAID"
        :`<button onclick="markBasket('${b.ID}',${total})">
        Mark Paid
        </button>`
      }

      </span>

    </div>

    `;

  }).join("")
  ||"<p>No baskets</p>";

}


function markBasket(id,total){

  return save(
    "sipPayments",
    {
      ID:uid(),
      "Basket ID":id,
      Month:ym(),
      Amount:total,
      "Paid At":
      new Date().toISOString()
    }
  );

}


/* ================= SPLITTER ================= */

async function addGroup(){

  const name=
  $("spGroup").value.trim();

  const members=

  $("spMembers").value
  .split(",")
  .map(x=>x.trim())
  .filter(Boolean);


  if(!name){

    toast("Enter group name");

    return;

  }


  if(members.length<2){

    toast("Minimum 2 members");

    return;

  }


  await save(
    "splitGroups",
    {
      ID:uid(),

      "Group Name":name,

      Category:$("spCat").value,

      "Members JSON":
      JSON.stringify(members)
    }
  );

}


function groupMembers(g){

  try{

    return JSON.parse(
      g["Members JSON"]||"[]"
    );

  }catch(e){

    return [];

  }

}


function calculateSplitGroup(group){

  const members=
  groupMembers(group);


  const expenses=

  (DB.splitExpenses||[])
  .filter(
    x=>x["Group ID"]===group.ID
  );


  const stats={};


  members.forEach(m=>{

    stats[m]={
      name:m,
      paid:0,
      share:0,
      net:0
    };

  });


  let total=0;


  expenses.forEach(e=>{

    const amount=num(e.Amount);

    total+=amount;


    const paidBy=
    String(e["Paid By"]||"");


    if(stats[paidBy]){

      stats[paidBy].paid+=amount;

    }


    let participants=[];

    try{

      participants=
      JSON.parse(
        e["Members JSON"]||"[]"
      );

    }catch(err){}


    if(!participants.length){

      participants=members;

    }


    const each=

    amount/
    participants.length;


    participants.forEach(m=>{

      if(stats[m]){

        stats[m].share+=each;

      }

    });

  });


  Object.values(stats)
  .forEach(s=>{

    s.net=s.paid-s.share;

  });


  return {
    total,
    expenses,
    stats:Object.values(stats)
  };

}


function renderSplit(){

  const groups=
  DB.splitGroups||[];


  const previous=
  $("spGroupSel").value;


  $("spGroupSel").innerHTML=

  '<option value="">Select group</option>'+

  groups.map(g=>
    `<option value="${g.ID}">
    ${g["Group Name"]}
    </option>`
  ).join("");


  if(
    previous &&
    groups.some(
      g=>g.ID===previous
    )
  ){

    $("spGroupSel").value=
    previous;

  }

  else if(groups.length){

    $("spGroupSel").value=
    groups[0].ID;

  }


  const selected=

  groups.find(
    x=>x.ID===$("spGroupSel").value
  );


  const members=

  selected
  ?groupMembers(selected)
  :[];


  $("spPaidBy").innerHTML=

  '<option value="">Paid by</option>'+

  members.map(
    x=>`<option>${x}</option>`
  ).join("");


  let summaryBox=
  $("splitSummary");


  if(!summaryBox){

    summaryBox=
    document.createElement("div");

    summaryBox.id="splitSummary";

    $("splitList")
    .parentNode
    .insertBefore(
      summaryBox,
      $("splitList")
    );

  }


  if(selected){

    const c=
    calculateSplitGroup(
      selected
    );


    summaryBox.innerHTML=

    `<h3>
    📊 ${selected["Group Name"]} Summary
    </h3>

    <div class="summary-grid">

    <div class="card">

    <small>Total Expense</small>

    <b>${money(c.total)}</b>

    </div>


    <div class="card">

    <small>Expenses</small>

    <b>${c.expenses.length}</b>

    </div>


    ${c.stats.map(s=>{

      const status=

      s.net>0
      ?"Should Receive"
      :s.net<0
      ?"Should Pay"
      :"Settled";


      return `

      <div class="card">

      <small>${s.name}</small>

      <b>
      ${money(Math.abs(s.net))}
      </b>

      <span class="balance-label">

      ${status}

      </span>

      <small>

      Paid ${money(s.paid)}

      • Share ${money(s.share)}

      </small>

      </div>

      `;

    }).join("")}

    </div>`;

  }

  else{

    summaryBox.innerHTML="";

  }


  $("splitList").innerHTML=

  groups.map(g=>{

    const c=
    calculateSplitGroup(g);


    return `

    <div class="card">

    <b>
    ${g["Group Name"]}
    </b>

    <p class="muted">

    ${groupMembers(g).join(", ")}

    </p>


    <div class="item">

    <span>Total Spent</span>

    <span>
    ${money(c.total)}
    </span>

    </div>

    </div>

    `;

  }).join("")
  ||"<p>No groups</p>";

}


async function addSplitExpense(){

  const group=

  (DB.splitGroups||[])
  .find(
    x=>x.ID===$("spGroupSel").value
  );


  if(!group){

    toast("Select group");

    return;

  }


  if(
    num(
      $("spAmount").value
    )<=0
  ){

    toast("Enter amount");

    return;

  }


  let members=

  $("spMembersSel").value
  .split(",")
  .map(x=>x.trim())
  .filter(Boolean);


  if(!members.length){

    members=
    groupMembers(group);

  }


  await save(
    "splitExpenses",
    {
      ID:uid(),

      "Group ID":group.ID,

      Title:$("spTitle").value,

      Amount:num(
        $("spAmount").value
      ),

      "Paid By":
      $("spPaidBy").value,

      "Members JSON":
      JSON.stringify(members),

      Date:today()
    }
  );

}


$("spGroupSel").onchange=
renderSplit;


/* ================= SUGGESTIONS ================= */

function fillDatalist(id,values){

  const el=$(id);

  if(!el)return;

  const unique=[
    ...new Set(
      values
      .map(x=>String(x||"").trim())
      .filter(Boolean)
    )
  ];

  el.innerHTML=

  unique.map(
    v=>`<option value="${v}">`
  ).join("");

}


function renderSuggestions(){

  const p=DB.passbook||[];

  const sal=DB.salary||[];

  const loans=DB.loans||[];

  const tr=DB.transactions||[];

  const groups=
  DB.splitGroups||[];

  const people=DB.people||[];

  const baskets=
  DB.baskets||[];

  const assets=DB.assets||[];


  fillDatalist(
    "categorySuggestions",
    p.map(x=>x.Category)
  );

  fillDatalist(
    "accountSuggestions",
    p.map(x=>x.Account)
  );

  fillDatalist(
    "remarkSuggestions",
    p.map(x=>x.Remarks)
  );

  fillDatalist(
    "companySuggestions",
    sal.map(x=>x.Company)
  );

  fillDatalist(
    "salaryRemarkSuggestions",
    sal.map(x=>x.Remarks)
  );

  fillDatalist(
    "loanSuggestions",
    loans.map(x=>x["Loan Name"])
  );

  fillDatalist(
    "loanRemarkSuggestions",
    loans.map(x=>x.Remarks)
  );

  fillDatalist(
    "personSuggestions",
    tr.map(x=>x.Person)
  );

  fillDatalist(
    "purposeSuggestions",
    tr.map(x=>x.Purpose)
  );

  fillDatalist(
    "groupSuggestions",
    groups.map(x=>x["Group Name"])
  );

  fillDatalist(
    "investmentPersonSuggestions",
    people.map(x=>x.Name)
  );

  fillDatalist(
    "basketSuggestions",
    baskets.map(x=>x["Basket Name"])
  );

  fillDatalist(
    "assetSuggestions",
    assets.map(x=>x["Asset Name"])
  );

}


/* ================= CHARTS ================= */

function destroyChart(id){

  if(charts[id]){

    charts[id].destroy();

    delete charts[id];

  }

}


function renderCharts(){

  if(typeof Chart==="undefined"){
    return;
  }


  const p=DB.passbook||[];

  const sal=DB.salary||[];

  const em=DB.emi||[];


  /* INCOME VS EXPENSE */

  const months={};


  p.forEach(x=>{

    const month=
    String(x.Date||"")
    .slice(0,7);

    if(!month)return;


    if(!months[month]){

      months[month]={
        income:0,
        expense:0
      };

    }


    if(
      String(x.Type)
      .toLowerCase()==="income"
    ){

      months[month].income+=
      num(x.Amount);

    }

    else{

      months[month].expense+=
      num(x.Amount);

    }

  });


  const monthLabels=
  Object.keys(months).sort();


  destroyChart(
    "incomeExpense"
  );


  charts.incomeExpense=
  new Chart(
    $("incomeExpenseChart"),
    {
      type:"bar",

      data:{
        labels:monthLabels,

        datasets:[
          {
            label:"Income",
            data:monthLabels.map(
              m=>months[m].income
            )
          },
          {
            label:"Expense",
            data:monthLabels.map(
              m=>months[m].expense
            )
          }
        ]
      },

      options:{
        responsive:true,
        maintainAspectRatio:false
      }

    }
  );


  /* EXPENSE CATEGORY */

  const categories={};


  p.filter(
    x=>
    String(x.Type)
    .toLowerCase()==="expense"
  )
  .forEach(x=>{

    const cat=
    x.Category||"Other";

    categories[cat]=
    (categories[cat]||0)+
    num(x.Amount);

  });


  destroyChart(
    "expenseCategory"
  );


  charts.expenseCategory=
  new Chart(
    $("expenseCategoryChart"),
    {
      type:"doughnut",

      data:{
        labels:Object.keys(categories),

        datasets:[
          {
            data:Object.values(categories)
          }
        ]
      },

      options:{
        responsive:true,
        maintainAspectRatio:false
      }

    }
  );


  /* SALARY */

  const salaryMonths={};


  sal.forEach(x=>{

    if(!x.Month)return;

    salaryMonths[x.Month]=
    (salaryMonths[x.Month]||0)+
    num(x.Amount);

  });


  const salaryLabels=
  Object.keys(salaryMonths).sort();


  destroyChart("salary");


  charts.salary=
  new Chart(
    $("salaryChart"),
    {
      type:"line",

      data:{
        labels:salaryLabels,

        datasets:[
          {
            label:"Salary",

            data:
            salaryLabels.map(
              m=>salaryMonths[m]
            )
          }
        ]
      },

      options:{
        responsive:true,
        maintainAspectRatio:false
      }

    }
  );


  /* EMI */

  const emiMonths={};


  em.forEach(x=>{

    if(!x.Month)return;

    emiMonths[x.Month]=
    (emiMonths[x.Month]||0)+
    num(x.Amount);

  });


  const emiLabels=
  Object.keys(emiMonths).sort();


  destroyChart("emi");


  charts.emi=
  new Chart(
    $("emiChart"),
    {
      type:"bar",

      data:{
        labels:emiLabels,

        datasets:[
          {
            label:"EMI Paid",

            data:
            emiLabels.map(
              m=>emiMonths[m]
            )
          }
        ]
      },

      options:{
        responsive:true,
        maintainAspectRatio:false
      }

    }
  );

}


/* ================= START APP ================= */

DB=restore();


if(Object.keys(DB).length){

  render();

  setStatus("☁️ Loading latest...");

  loadAll(true);

}

else{

  loadAll(false);

}
