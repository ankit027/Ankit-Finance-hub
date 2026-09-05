
/*
  IMPORTANT:
  Paste your deployed Google Apps Script Web App URL below.
*/

const API_URL = "https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";

let DB = {}, charts = {};

const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const monthNow = () => new Date().toISOString().slice(0, 7);
const num = v => Number(v || 0);
const fmt = v => "₹" + num(v).toLocaleString("en-IN", {
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

function toast(msg, ms = 2500) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");

  clearTimeout(window._toast);

  window._toast = setTimeout(() => {
    t.classList.remove("show");
  }, ms);
}

function setStatus(text) {
  $("status").textContent = text;
}

function apiReady() {
  return API_URL && !API_URL.includes("PASTE_YOUR");
}

async function api(action, payload = {}) {

  if (!apiReady()) {
    throw new Error("Paste your Google Apps Script Web App URL in app.js");
  }

  const r = await fetch(API_URL, {
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

  const j = await r.json();

  if (!j.success) {
    throw new Error(j.error || "Cloud request failed");
  }

  return j;
}

async function loadAll() {

  if (!apiReady()) {
    setStatus("⚠️ API URL required");
    toast("Paste Apps Script Web App URL in app.js");
    renderAll();
    return;
  }

  try {

    setStatus("☁️ Syncing...");

    const r = await fetch(
      API_URL + "?action=loadAll",
      {
        cache: "no-store"
      }
    );

    const j = await r.json();

    if (!j.success) {
      throw new Error(j.error || "Load failed");
    }

    DB = j.data || {};

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
    ].forEach(k => DB[k] = DB[k] || []);

    setStatus("☁️ Synced");

    renderAll();

  } catch (e) {

    console.error(e);

    setStatus("⚠️ Sync failed");

    toast(e.message);

    renderAll();
  }
}
async function save(table,data){
  const r=await api("save",{table,data});
  const rec=r.data.record;
  DB[table]=DB[table]||[];
  const i=DB[table].findIndex(x=>String(x.ID)===String(rec.ID));
  if(i>=0) DB[table][i]=rec; else DB[table].push(rec);
  return rec;
}
async function del(table,id){
  if(!confirm("Delete this record?")) return;
  await api("delete",{table,id});
  DB[table]=(DB[table]||[]).filter(x=>String(x.ID)!==String(id));
  renderAll(); toast("Deleted");
}
function card(label,value){return `<div><small>${esc(label)}</small><b>${value}</b></div>`}
function monthOf(v){ return String(v||"").slice(0,7); }
function opt(el, arr, textFn=x=>x, valueFn=x=>x, placeholder="Select"){
  if(!el)return; const current=el.value;
  el.innerHTML=`<option value="">${placeholder}</option>`+arr.map(x=>`<option value="${esc(valueFn(x))}">${esc(textFn(x))}</option>`).join("");
  el.value=current;
}
function unique(a){return [...new Set(a.filter(Boolean))]}

function renderAll(){
  renderDashboard(); renderPassbook(); renderSalary(); renderLoans(); renderGive(); renderSplitter(); renderInvestments(); renderVehicles(); fillLists();
}
function chart(id,type,data,options={}){
  if(!window.Chart) return;
  if(charts[id]) charts[id].destroy();
  const el=$(id); if(!el)return;
  charts[id]=new Chart(el,{type,data,options:{responsive:true,maintainAspectRatio:false,...options}});
}
function renderDashboard(){
  const m=val("dashMonth"), c=val("dashCategory");
  let pb=(DB.passbook||[]).filter(x=>(!m||monthOf(x.Date)===m)&&(!c||x.Category===c));
  const income=pb.filter(x=>x.Type==="Income").reduce((s,x)=>s+num(x.Amount),0);
  const expense=pb.filter(x=>x.Type==="Expense").reduce((s,x)=>s+num(x.Amount),0);
  const salary=(DB.salary||[]).filter(x=>!m||String(x.Month)===m).reduce((s,x)=>s+num(x.Amount),0);
  const emi=(DB.emi||[]).filter(x=>!m||String(x.Month)===m).reduce((s,x)=>s+num(x.Amount),0);
  const toReceive=(DB.transactions||[]).filter(x=>["Give","Receive"].includes(x.Type)).reduce((s,x)=>s+(x.Type==="Give"?num(x.Amount):-num(x.Amount)),0);
  const toPay=(DB.transactions||[]).filter(x=>["Take","Pay"].includes(x.Type)).reduce((s,x)=>s+(x.Type==="Take"?num(x.Amount):-num(x.Amount)),0);
  $("dash").innerHTML=[
    card("💰 Salary",fmt(salary)),card("📈 Total Income",fmt(income)),card("💸 Expense",fmt(expense)),card("🏦 EMI Paid",fmt(emi)),
    card("📉 SIP Paid","₹0"),card("🤝 To Receive",fmt(Math.max(0,toReceive))),card("🤝 To Pay",fmt(Math.max(0,toPay))),card("💳 Net",fmt(income-expense-emi))
  ].join("");
  const months=unique((DB.passbook||[]).map(x=>monthOf(x.Date))).sort();
  const inc=months.map(mm=>(DB.passbook||[]).filter(x=>monthOf(x.Date)===mm&&x.Type==="Income").reduce((s,x)=>s+num(x.Amount),0));
  const exp=months.map(mm=>(DB.passbook||[]).filter(x=>monthOf(x.Date)===mm&&x.Type==="Expense").reduce((s,x)=>s+num(x.Amount),0));
  chart("mainChart","bar",{labels:months,datasets:[{label:"Income",data:inc},{label:"Expense",data:exp}]});
  const cats=unique(pb.filter(x=>x.Type==="Expense").map(x=>x.Category||"Other"));
  chart("expenseChart","doughnut",{labels:cats,datasets:[{data:cats.map(cat=>pb.filter(x=>x.Type==="Expense"&&(x.Category||"Other")===cat).reduce((s,x)=>s+num(x.Amount),0))}]});
}
function renderPassbook(){
  const month=val("pbFilterMonth"), cat=val("pbFilterCategory");
  const rows=(DB.passbook||[]).filter(x=>(!month||monthOf(x.Date)===month)&&(!cat||x.Category===cat)).sort((a,b)=>String(b.Date).localeCompare(String(a.Date)));
  const income=rows.filter(x=>x.Type==="Income").reduce((s,x)=>s+num(x.Amount),0), expense=rows.filter(x=>x.Type==="Expense").reduce((s,x)=>s+num(x.Amount),0);
  $("passbookDash").innerHTML=card("Income",fmt(income))+card("Expense",fmt(expense))+card("Balance",fmt(income-expense));
  $("pbList").innerHTML=rows.map(x=>`<div class="item"><div><b>${esc(x.Category||"Uncategorized")} • ${esc(x.Type)}</b><br><small>${esc(x.Date)} • ${esc(x.Account||"")}${x.Remarks?" • "+esc(x.Remarks):""}</small></div><div><b>${fmt(x.Amount)}</b><br><button class="danger" onclick="del('passbook','${x.ID}')">Delete</button></div></div>`).join("")||"<p class='muted'>No entries</p>";
  const cats=unique(rows.map(x=>x.Category||"Other"));
  chart("passbookChart","bar",{labels:cats,datasets:[{label:"Amount",data:cats.map(c=>rows.filter(x=>(x.Category||"Other")===c).reduce((s,x)=>s+num(x.Amount),0))}]});
}
async function addPassbook(){
  if(!val("pbDate")||!val("pbCat")||!num(val("pbAmt"))) return toast("Date, category and amount are required");
  try{await save("passbook",{ID:val("pbEditId"),Date:val("pbDate"),Type:val("pbType"),Category:val("pbCat"),Amount:num(val("pbAmt")),Account:val("pbAccount"),Remarks:val("pbRemarks")}); clearPassbook(); renderAll(); toast("Saved to cloud");}catch(e){toast(e.message)}
}
function clearPassbook(){["pbEditId","pbCat","pbAmt","pbAccount","pbRemarks"].forEach(id=>$(id).value=""); $("pbDate").value=today(); $("pbType").value="Expense";}
function resetPassbookFilters(){$("pbFilterMonth").value="";$("pbFilterCategory").value="";renderPassbook();}
function resetDashFilters(){$("dashMonth").value="";$("dashCategory").value="";renderDashboard();}

function renderSalary(){
  const rows=(DB.salary||[]).sort((a,b)=>String(b.Month).localeCompare(String(a.Month)));
  $("salaryDash").innerHTML=card("Total Salary",fmt(rows.reduce((s,x)=>s+num(x.Amount),0)))+card("Latest",fmt(rows[0]?.Amount||0));
  $("salaryList").innerHTML=rows.map(x=>`<div class="item"><div><b>${esc(x.Company||"Salary")}</b><br><small>${esc(x.Month)} ${x.Remarks?"• "+esc(x.Remarks):""}</small></div><div><b>${fmt(x.Amount)}</b><br><button class="danger" onclick="del('salary','${x.ID}')">Delete</button></div></div>`).join("")||"<p class='muted'>No salary records</p>";
  chart("salaryChart","line",{labels:rows.slice().reverse().map(x=>x.Month),datasets:[{label:"Salary",data:rows.slice().reverse().map(x=>num(x.Amount))}]});
}
async function addSalary(){if(!val("salMonth")||!num(val("salAmount")))return toast("Month and amount required");try{await save("salary",{Month:val("salMonth"),Company:val("salCompany"),Amount:num(val("salAmount")),Remarks:val("salRemarks")});["salCompany","salAmount","salRemarks"].forEach(id=>$(id).value="");renderAll();toast("Salary saved");}catch(e){toast(e.message)}}

function renderLoans(){
  const loans=DB.loans||[], emi=DB.emi||[];
  const total=loans.reduce((s,x)=>s+num(x["Initial Amount"]),0), paid=emi.reduce((s,x)=>s+num(x.Amount),0);
  $("loanDash").innerHTML=card("Total Loan",fmt(total))+card("EMI Paid",fmt(paid))+card("Remaining",fmt(Math.max(0,total-paid)));
  $("loanList").innerHTML=loans.map(l=>{const p=emi.filter(e=>String(e["Loan ID"])===String(l.ID)).reduce((s,e)=>s+num(e.Amount),0);return `<div class="item"><div><b>${esc(l["Loan Name"])}</b><br><small>${esc(l.Remarks||"")}</small></div><div>Initial: <b>${fmt(l["Initial Amount"])}</b><br>Paid: ${fmt(p)}<br><button class="danger" onclick="del('loans','${l.ID}')">Delete</button></div></div>`}).join("")||"<p class='muted'>No loans</p>";
  chart("loanChart","bar",{labels:loans.map(x=>x["Loan Name"]),datasets:[{label:"Initial Amount",data:loans.map(x=>num(x["Initial Amount"]))},{label:"Paid",data:loans.map(l=>emi.filter(e=>String(e["Loan ID"])===String(l.ID)).reduce((s,e)=>s+num(e.Amount),0))}]});
}
async function addLoan(){if(!val("loanName")||!num(val("loanInitial")))return toast("Loan name and amount required");try{await save("loans",{"Loan Name":val("loanName"),"Initial Amount":num(val("loanInitial")),Remarks:val("loanRemarks")});["loanName","loanInitial","loanRemarks"].forEach(id=>$(id).value="");renderAll();toast("Loan added");}catch(e){toast(e.message)}}
async function addEmi(){if(!val("emiLoan")||!val("emiMonth")||!num(val("emiAmount")))return toast("Select loan, month and amount");try{await save("emi",{"Loan ID":val("emiLoan"),Month:val("emiMonth"),Amount:num(val("emiAmount")),Remarks:val("emiRemarks")});$("emiAmount").value="";$("emiRemarks").value="";renderAll();toast("EMI saved");}catch(e){toast(e.message)}}

function renderGive(){
  const rows=DB.transactions||[];
  const rec=rows.reduce((s,x)=>s+(x.Type==="Give"?num(x.Amount):x.Type==="Receive"?-num(x.Amount):0),0);
  const pay=rows.reduce((s,x)=>s+(x.Type==="Take"?num(x.Amount):x.Type==="Pay"?-num(x.Amount):0),0);
  $("giveDash").innerHTML=card("To Receive",fmt(Math.max(0,rec)))+card("To Pay",fmt(Math.max(0,pay)));
  $("gtList").innerHTML=rows.sort((a,b)=>String(b.Date).localeCompare(String(a.Date))).map(x=>`<div class="item"><div><b>${esc(x.Person)} • ${esc(x.Type)}</b><br><small>${esc(x.Date)} • ${esc(x.Purpose||"")} ${x.Notes?"• "+esc(x.Notes):""}</small></div><div><b>${fmt(x.Amount)}</b><br><button class="danger" onclick="del('transactions','${x.ID}')">Delete</button></div></div>`).join("")||"<p class='muted'>No records</p>";
  const persons = unique(rows.map(x => x.Person));

const receiveData = persons.map(p => {
  const balance = rows
    .filter(x => x.Person === p)
    .reduce((s, x) => {
      if (x.Type === "Give") return s + num(x.Amount);
      if (x.Type === "Receive") return s - num(x.Amount);
      return s;
    }, 0);

  return Math.max(0, balance);
});

const payData = persons.map(p => {
  const balance = rows
    .filter(x => x.Person === p)
    .reduce((s, x) => {
      if (x.Type === "Take") return s + num(x.Amount);
      if (x.Type === "Pay") return s - num(x.Amount);
      return s;
    }, 0);

  return Math.max(0, balance);
});

chart("giveChart", "bar", {
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
});}
async function addGive(){if(!val("gtPerson")||!num(val("gtAmount")))return toast("Person and amount required");try{await save("transactions",{Person:val("gtPerson"),Type:val("gtType"),Amount:num(val("gtAmount")),Date:val("gtDate")||today(),Purpose:val("gtPurpose"),Notes:val("gtNotes")});["gtPerson","gtAmount","gtPurpose","gtNotes"].forEach(id=>$(id).value="");renderAll();toast("Saved");}catch(e){toast(e.message)}}

function parseJSON(v, fallback=[]){try{return typeof v==="string"?JSON.parse(v):v||fallback}catch(e){return fallback}}
function groupById(id){return (DB.splitGroups||[]).find(x=>String(x.ID)===String(id))}
function renderSplitter(){
  const groups=DB.splitGroups||[];
  ["spGroupSel","spGroupExpense"].forEach(id=>opt($(id),groups,g=>g["Group Name"],g=>g.ID,"Select group"));
  const gid=val("spGroupSel")||val("spGroupExpense"), g=groupById(gid), members=g?parseJSON(g["Members JSON"],[]):[];
  opt($("spPaidBy"),members,x=>x,x=>x,"Paid by");
  $("memberChips").innerHTML=members.map(m=>`<span class="chip">${esc(m)}</span>`).join("");
  const exps=(DB.splitExpenses||[]).filter(x=>!gid||String(x["Group ID"])===String(gid));
  $("splitExpenseList").innerHTML=exps.map(x=>`<div class="item"><div><b>${esc(x.Title)}</b><br><small>${esc(x.Date)} • Paid by ${esc(x["Paid By"])}</small></div><div><b>${fmt(x.Amount)}</b><br><button class="danger" onclick="del('splitExpenses','${x.ID}')">Delete</button></div></div>`).join("")||"<p class='muted'>No expenses</p>";
  const balances={}; members.forEach(m=>balances[m]=0);
  exps.forEach(x=>{const participants=parseJSON(x["Members JSON"],members);const custom=parseJSON(x["Custom Shares JSON"],{});balances[x["Paid By"]]=(balances[x["Paid By"]]||0)+num(x.Amount);participants.forEach(m=>balances[m]=(balances[m]||0)-(num(custom[m])||num(x.Amount)/Math.max(1,participants.length)));});
  $("splitSummary").innerHTML=Object.entries(balances).map(([m,b])=>card(m,fmt(b))).join("");
  $("settlementList").innerHTML=Object.entries(balances).filter(([,b])=>Math.abs(b)>0.01).map(([m,b])=>`<div class="item"><b>${esc(m)}</b><span>${b>0?"Should receive ":"Should pay "}${fmt(Math.abs(b))}</span></div>`).join("")||"<p class='muted'>Select a group</p>";
  $("splitList").innerHTML=groups.map(x=>`<div class="item"><div><b>${esc(x["Group Name"])}</b><br><small>${esc(x.Category)} • ${parseJSON(x["Members JSON"],[]).map(esc).join(", ")}</small></div><button class="danger" onclick="del('splitGroups','${x.ID}')">Delete</button></div>`).join("");
}
async function addGroup(){const name=val("spGroup"), members=unique(val("spMembers").split(",").map(x=>x.trim()));if(!name)return toast("Group name required");try{await save("splitGroups",{"Group Name":name,Category:val("spCat"),"Members JSON":JSON.stringify(members)});$("spGroup").value="";$("spMembers").value="";renderAll();toast("Group created");}catch(e){toast(e.message)}}
async function addMember(){const g=groupById(val("spGroupSel")), m=val("newMember");if(!g||!m)return toast("Select group and member");const members=unique([...parseJSON(g["Members JSON"],[]),m]);try{await save("splitGroups",{...g,"Members JSON":JSON.stringify(members)});$("newMember").value="";renderAll();toast("Member added");}catch(e){toast(e.message)}}
async function renameGroup(){const g=groupById(val("spGroupSel"));if(!g)return toast("Select group");const n=prompt("New group name",g["Group Name"]);if(!n)return;try{await save("splitGroups",{...g,"Group Name":n});renderAll();toast("Renamed");}catch(e){toast(e.message)}}
async function saveSplitExpense(){const gid=val("spGroupExpense"),g=groupById(gid),amount=num(val("spAmount"));if(!g||!val("spTitle")||!amount||!val("spPaidBy"))return toast("Complete all required fields");const all=parseJSON(g["Members JSON"],[]), participants=unique(val("spMembersSel").split(",").map(x=>x.trim()).filter(Boolean));try{await save("splitExpenses",{"Group ID":gid,Title:val("spTitle"),Amount:amount,"Paid By":val("spPaidBy"),"Members JSON":JSON.stringify(participants.length?participants:all),"Custom Shares JSON":"{}",Date:val("spDate")||today()});["spTitle","spAmount","spMembersSel"].forEach(id=>$(id).value="");renderAll();toast("Expense saved");}catch(e){toast(e.message)}}

function renderInvestments(){
  const baskets=DB.baskets||[], assets=DB.assets||[];
  opt($("assetBasket"),baskets,b=>b["Basket Name"],b=>b.ID,"Select basket");
  const total=assets.reduce((s,x)=>s+num(x["Monthly Amount"]),0);
  $("investmentDash").innerHTML=card("Monthly SIP",fmt(total))+card("Assets",assets.length)+card("Baskets",baskets.length);
  $("basketList").innerHTML=baskets.map(b=>{const aa=assets.filter(a=>String(a["Basket ID"])===String(b.ID));return `<div class="item"><div><b>${esc(b["Basket Name"])}</b><br><small>${aa.map(a=>esc(a["Asset Name"])+" "+fmt(a["Monthly Amount"])).join(" • ")||"No assets"}</small></div><button class="danger" onclick="del('baskets','${b.ID}')">Delete</button></div>`}).join("")||"<p class='muted'>No baskets</p>";
  chart("investmentChart","doughnut",{labels:assets.map(x=>x["Asset Name"]),datasets:[{data:assets.map(x=>num(x["Monthly Amount"]))}]});
}
async function addBasket(){const person=val("sipPerson"), name=val("sipBasket");if(!name)return toast("Basket name required");try{let p=(DB.people||[]).find(x=>String(x.Name).toLowerCase()===person.toLowerCase());if(person&&!p)p=await save("people",{Name:person});await save("baskets",{"Person ID":p?.ID||"", "Basket Name":name});$("sipBasket").value="";renderAll();toast("Basket created");}catch(e){toast(e.message)}}
async function addAsset(){if(!val("assetBasket")||!val("assetName")||!num(val("assetAmount")))return toast("Select basket, asset and amount");try{await save("assets",{"Basket ID":val("assetBasket"),"Asset Name":val("assetName"),"Asset Type":val("assetType"),"Monthly Amount":num(val("assetAmount"))});["assetName","assetAmount"].forEach(id=>$(id).value="");renderAll();toast("Asset saved");}catch(e){toast(e.message)}}

function displayDate(v){
  if(!v) return "";

  const s = String(v);

  // Convert ISO date such as 2026-07-04T18:30:00.000Z
  if(s.includes("T")){
    return s.slice(0,10);
  }

  return s;
}

function recentRecords(arr, limit=10){
  return [...arr]
    .sort((a,b)=>String(b.Date||"").localeCompare(String(a.Date||"")))
    .slice(0,limit);
}

function latestFuelOdometer(vehicleId){
  const records = (DB.fuel||[])
    .filter(x=>String(x["Vehicle ID"])===String(vehicleId))
    .sort((a,b)=>num(b.Odometer)-num(a.Odometer));

  return records.length ? num(records[0].Odometer) : 0;
}

function getMaintenanceRecord(vehicleId, type){

  const keywords =
    type === "oil"
      ? ["oil","oil change"]
      : ["service","servicing"];

  const records = (DB.maintenance||[])
    .filter(x=>{
      if(String(x["Vehicle ID"]) !== String(vehicleId)) return false;

      const category = String(x.Category||"").toLowerCase();

      return keywords.some(k=>category.includes(k));
    })
    .sort((a,b)=>{

      const kmDiff = num(b.Odometer)-num(a.Odometer);

      if(kmDiff !== 0) return kmDiff;

      return String(b.Date||"").localeCompare(String(a.Date||""));
    });

  return records[0] || null;
}

function getServiceInterval(vehicle){

  const type = String(vehicle["Vehicle Type"]||"").toLowerCase();

  if(
    type.includes("bike") ||
    type.includes("motorcycle") ||
    type.includes("scooter")
  ){
    return 3000;
  }

  return 10000;
}

function maintenanceCard(vehicle){

  const vehicleId = vehicle.ID;

  const interval = getServiceInterval(vehicle);

  const currentKM = latestFuelOdometer(vehicleId);

  const lastOil = getMaintenanceRecord(vehicleId,"oil");
  const lastService = getMaintenanceRecord(vehicleId,"service");

  const lastOilKM = lastOil ? num(lastOil.Odometer) : 0;
  const lastServiceKM = lastService ? num(lastService.Odometer) : 0;

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
      ? nextOilTarget-currentKM
      : 0;

  const serviceRemaining =
    nextServiceTarget > 0
      ? nextServiceTarget-currentKM
      : 0;

  const oilClass =
    oilRemaining <= 0 && nextOilTarget > 0
      ? "danger-km"
      : oilRemaining < 500
        ? "warning-km"
        : "good-km";

  const serviceClass =
    serviceRemaining <= 0 && nextServiceTarget > 0
      ? "danger-km"
      : serviceRemaining < 500
        ? "warning-km"
        : "good-km";

  return `
    <div class="maintenance-card">

      <h3>
        ${esc(vehicle["Vehicle Type"]||"Vehicle")==="Bike" ? "🏍️" : "🚗"}
        ${esc(vehicle["Vehicle Name"])}
      </h3>

      <div class="maint-row">
        <span>Current Odometer</span>
        <b>${currentKM ? currentKM.toLocaleString("en-IN")+" km" : "—"}</b>
      </div>

      <hr>

      <div class="maint-section-title">
        🛢️ Oil Change
      </div>

      <div class="maint-row">
        <span>Last Oil Change</span>
        <b>
          ${
            lastOil
              ? displayDate(lastOil.Date)+" · "+lastOilKM.toLocaleString("en-IN")+" km"
              : "No record"
          }
        </b>
      </div>

      <div class="maint-row">
        <span>Last Actual KM</span>
        <b>${lastOilKM ? lastOilKM.toLocaleString("en-IN")+" km" : "—"}</b>
      </div>

      <div class="maint-row">
        <span>Next Oil Target</span>
        <b>
          ${
            nextOilTarget
              ? nextOilTarget.toLocaleString("en-IN")+" km"
              : "—"
          }
        </b>
      </div>

      <div class="maint-row">
        <span>KM Remaining</span>
        <b class="${oilClass}">
          ${
            nextOilTarget
              ? (
                  oilRemaining >= 0
                    ? oilRemaining.toLocaleString("en-IN")+" km"
                    : Math.abs(oilRemaining).toLocaleString("en-IN")+" km overdue"
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
        <span>Last Service</span>
        <b>
          ${
            lastService
              ? displayDate(lastService.Date)+" · "+lastServiceKM.toLocaleString("en-IN")+" km"
              : "No record"
          }
        </b>
      </div>

      <div class="maint-row">
        <span>Last Actual KM</span>
        <b>${lastServiceKM ? lastServiceKM.toLocaleString("en-IN")+" km" : "—"}</b>
      </div>

      <div class="maint-row">
        <span>Next Service Target</span>
        <b>
          ${
            nextServiceTarget
              ? nextServiceTarget.toLocaleString("en-IN")+" km"
              : "—"
          }
        </b>
      </div>

      <div class="maint-row">
        <span>KM Remaining</span>
        <b class="${serviceClass}">
          ${
            nextServiceTarget
              ? (
                  serviceRemaining >= 0
                    ? serviceRemaining.toLocaleString("en-IN")+" km"
                    : Math.abs(serviceRemaining).toLocaleString("en-IN")+" km overdue"
                )
              : "—"
          }
        </b>
      </div>

      <div class="maintenance-interval">
        ${
          String(vehicle["Vehicle Type"]||"").toLowerCase().includes("bike")
            ? "Oil Change & Service every 3,000 km"
            : "Oil Change & Service every 10,000 km"
        }
      </div>

    </div>
  `;
}


function renderVehicles(){

  const vehicles = DB.vehicles || [];

  const type = val("vehicleTypeFilter");
  const vid = val("vehicleFilter");

  opt(
    $("vehicleFilter"),
    vehicles.filter(v=>!type || v["Vehicle Type"]===type),
    v=>v["Vehicle Name"],
    v=>v.ID,
    "All Vehicles"
  );

  ["fuelVehicle","maintVehicle"].forEach(id=>
    opt(
      $(id),
      vehicles,
      v=>v["Vehicle Name"],
      v=>v.ID,
      "Select vehicle"
    )
  );

  const fuels = (DB.fuel||[])
    .filter(x=>
      !vid ||
      String(x["Vehicle ID"])===String(vid)
    );

  const maint = (DB.maintenance||[])
    .filter(x=>
      !vid ||
      String(x["Vehicle ID"])===String(vid)
    );

  const fcost = fuels.reduce(
    (s,x)=>s+num(x.Amount),
    0
  );

  const mcost = maint.reduce(
    (s,x)=>s+num(x.Amount),
    0
  );

  $("vehicleDash").innerHTML =
    card("Fuel Cost",fmt(fcost))+
    card("Maintenance Cost",fmt(mcost))+
    card("Total Cost",fmt(fcost+mcost));


  // ===============================
  // RECENT FUEL TRANSACTIONS ONLY
  // ===============================

  const recentFuel = recentRecords(fuels,10);

  $("fuelList").innerHTML =
    recentFuel.map(x=>`
      <div class="item">

        <div>

          <b>${esc(vehicleName(x["Vehicle ID"]))}</b>

          <br>

          <small>
            ${displayDate(x.Date)}
            • ${num(x.Odometer).toLocaleString("en-IN")} km
            • ${num(x.Quantity)} L
          </small>

        </div>

        <div>

          <b>${fmt(x.Amount)}</b>

          <br>

          <button
            class="danger"
            onclick="del('fuel','${x.ID}')"
          >
            Delete
          </button>

        </div>

      </div>
    `).join("")
    ||
    "<p class='muted'>No recent fuel entries</p>";


  // ===============================
  // RECENT MAINTENANCE ONLY
  // ===============================

  const recentMaintenance = recentRecords(maint,10);

  $("maintenanceList").innerHTML =
    recentMaintenance.map(x=>`
      <div class="item">

        <div>

          <b>
            ${esc(vehicleName(x["Vehicle ID"]))}
            • ${esc(x.Category)}
          </b>

          <br>

          <small>
            ${displayDate(x.Date)}
            • ${num(x.Odometer).toLocaleString("en-IN")} km
            ${x.Remarks ? " • "+esc(x.Remarks) : ""}
          </small>

        </div>

        <div>

          <b>${fmt(x.Amount)}</b>

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


  // ===============================
  // MAINTENANCE SUMMARY
  // ===============================

  const selectedVehicles =
    vehicles.filter(v=>
      !vid ||
      String(v.ID)===String(vid)
    );

  $("vehicleMaintenanceSummary").innerHTML =
    selectedVehicles
      .map(maintenanceCard)
      .join("");


  // ===============================
  // CHARTS
  // ===============================

  const chartVehicles =
    selectedVehicles.length
      ? selectedVehicles
      : vehicles;

  const labels =
    chartVehicles.map(v=>v["Vehicle Name"]);


  chart(
    "fuelChart",
    "bar",
    {
      labels,
      datasets:[
        {
          label:"Fuel Cost",
          data:chartVehicles.map(v=>
            (DB.fuel||[])
              .filter(x=>
                String(x["Vehicle ID"])===String(v.ID)
              )
              .reduce(
                (s,x)=>s+num(x.Amount),
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
      datasets:[
        {
          label:"Maintenance Cost",
          data:chartVehicles.map(v=>
            (DB.maintenance||[])
              .filter(x=>
                String(x["Vehicle ID"])===String(v.ID)
              )
              .reduce(
                (s,x)=>s+num(x.Amount),
                0
              )
          )
        }
      ]
    }
  );

}


// =================================================
// VEHICLE HELPERS / SAVE FUNCTIONS
// =================================================

function vehicleName(id){
  return (DB.vehicles||[]).find(v=>String(v.ID)===String(id))?.["Vehicle Name"] || "Vehicle";
}

async function addVehicle(){
  const name = val("vehicleName");
  if(!name) return toast("Vehicle name required");

  try{
    await save("vehicles",{
      "Vehicle Name": name,
      "Vehicle Type": val("vehicleType") || "Car",
      "Number Plate": val("vehiclePlate")
    });

    ["vehicleName","vehiclePlate"].forEach(id=>$(id).value="");
    renderAll();
    toast("Vehicle added");
  }catch(e){
    console.error(e);
    toast(e.message);
  }
}

async function addFuel(){
  const vehicleId = val("fuelVehicle");
  const amount = num(val("fuelAmount"));

  if(!vehicleId || !amount){
    return toast("Vehicle and fuel amount are required");
  }

  try{
    await save("fuel",{
      "Vehicle ID": vehicleId,
      Date: val("fuelDate") || today(),
      Odometer: num(val("fuelOdo")),
      Quantity: num(val("fuelQty")),
      Amount: amount,
      "Fuel Type": val("fuelType"),
      Notes: val("fuelNotes")
    });

    ["fuelOdo","fuelQty","fuelAmount","fuelNotes"].forEach(id=>$(id).value="");
    renderAll();
    toast("Fuel saved");
  }catch(e){
    console.error(e);
    toast(e.message);
  }
}

async function addMaintenance(){
  const vehicleId = val("maintVehicle");
  const amount = num(val("maintAmount"));

  if(!vehicleId || !amount){
    return toast("Vehicle and maintenance amount are required");
  }

  try{
    await save("maintenance",{
      "Vehicle ID": vehicleId,
      Date: val("maintDate") || today(),
      Category: val("maintCategory") || "Service",
      Amount: amount,
      Odometer: num(val("maintOdo")),
      "Next Target KM": num(val("maintTargetKm")),
      Remarks: val("maintRemarks")
    });

    ["maintAmount","maintOdo","maintTargetKm","maintRemarks"].forEach(id=>$(id).value="");
    renderAll();
    toast("Maintenance saved");
  }catch(e){
    console.error(e);
    toast(e.message);
  }
}

function resetVehicleFilters(){
  $("vehicleTypeFilter").value="";
  $("vehicleFilter").value="";
  renderVehicles();
}

// =================================================
// LISTS / DROPDOWNS
// =================================================

function fillLists(){
  const cats = unique((DB.passbook||[]).map(x=>x.Category));

  opt($("dashCategory"),cats,x=>x,x=>x,"All Categories");
  opt($("pbFilterCategory"),cats,x=>x,x=>x,"All Categories");

  function dl(id,arr){
    const e=$(id);
    if(!e) return;
    e.innerHTML=unique(arr).map(x=>`<option value="${esc(x)}"></option>`).join("");
  }

  dl("categoryList",cats);
  dl("accountList",(DB.passbook||[]).map(x=>x.Account));
  dl("remarksList",(DB.passbook||[]).map(x=>x.Remarks));
  dl("companyList",(DB.salary||[]).map(x=>x.Company));
  dl("salaryRemarksList",(DB.salary||[]).map(x=>x.Remarks));
  dl("personList",(DB.transactions||[]).map(x=>x.Person));

  opt(
    $("emiLoan"),
    DB.loans||[],
    x=>x["Loan Name"],
    x=>x.ID,
    "Select loan"
  );
}

// =================================================
// APP STARTUP
// =================================================

document.addEventListener("DOMContentLoaded",()=>{

  const saved=localStorage.getItem("afh-theme");
  if(saved==="dark") document.body.classList.add("dark");

  $("themeBtn").onclick=()=>{
    document.body.classList.toggle("dark");
    localStorage.setItem(
      "afh-theme",
      document.body.classList.contains("dark") ? "dark" : "light"
    );
    $("themeBtn").textContent=
      document.body.classList.contains("dark") ? "☀️ Light" : "🌙 Dark";
  };

  $("themeBtn").textContent=
    document.body.classList.contains("dark") ? "☀️ Light" : "🌙 Dark";

  $("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");

  document.querySelectorAll("[data-page]").forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
      $(b.dataset.page).classList.add("active");
      $("sidebar").classList.remove("open");
    };
  });

  ["dashMonth","dashCategory"].forEach(id=>{
    $(id)?.addEventListener("change",renderDashboard);
  });

  ["pbFilterMonth","pbFilterCategory"].forEach(id=>{
    $(id)?.addEventListener("change",renderPassbook);
  });

  $("vehicleTypeFilter")?.addEventListener("change",()=>{
    $("vehicleFilter").value="";
    renderVehicles();
  });

  $("vehicleFilter")?.addEventListener("change",renderVehicles);
  $("spGroupSel")?.addEventListener("change",renderSplitter);
  $("spGroupExpense")?.addEventListener("change",renderSplitter);

  ["pbDate","gtDate","spDate","fuelDate","maintDate"].forEach(id=>{
    if($(id)) $(id).value=today();
  });

  ["salMonth","emiMonth"].forEach(id=>{
    if($(id)) $(id).value=monthNow();
  });

  loadAll();
});
