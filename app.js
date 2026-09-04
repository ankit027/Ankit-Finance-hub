const API_URL="https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";
const LOCAL_KEY="ankit_finance_hub_db_v3";
let DB={};
let syncInProgress=false;

const $=id=>document.getElementById(id);
const uid=()=>Date.now()+"-"+Math.random().toString(36).slice(2);
const num=v=>Number(v||0)||0;
const money=v=>"₹"+num(v).toLocaleString("en-IN",{maximumFractionDigits:2});
const ym=()=>new Date().toISOString().slice(0,7);
const today=()=>new Date().toISOString().slice(0,10);

function toast(t){$("toast").textContent=t;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2500)}
function setStatus(t){$("status").textContent=t}
function persist(){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(DB))}catch(e){}}
function restore(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||"{}")}catch(e){return {}}}

async function api(action,payload={}){
  const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...payload})});
  const text=await r.text();
  let j;try{j=JSON.parse(text)}catch(e){throw new Error("Invalid API response. Check Apps Script deployment.");}
  if(!j.success)throw new Error(j.error||"API error");
  return j;
}

// INSTANT OPEN: render saved local data first, then cloud refresh in background.
async function loadAll(silent=false){
  if(syncInProgress)return;
  syncInProgress=true;
  try{
    if(!silent)setStatus("☁️ Syncing…");
    const r=await api("loadAll");
    DB=r.data||{};
    persist();
    render();
    setStatus(r.cached?"☁️ Synced (fast)":"☁️ Synced");
  }catch(e){
    if(!Object.keys(DB).length)setStatus("⚠️ Sync error");
    else setStatus("☁️ Offline cache");
    if(!silent)toast(e.message);
  }finally{syncInProgress=false;}
}

// FAST SAVE: screen updates immediately. No complete reload after every save.
async function save(table,data){
  setStatus("☁️ Saving…");
  try{
    const r=await api("save",{table,data});
    const record=r.record||data;
    DB[table]=DB[table]||[];
    const i=DB[table].findIndex(x=>String(x.ID)===String(record.ID));
    if(i>=0)DB[table][i]=record;else DB[table].push(record);
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

async function del(table,id){
  if(!confirm("Delete this record?"))return;
  try{
    await api("delete",{table,id});
    DB[table]=(DB[table]||[]).filter(x=>String(x.ID)!==String(id));
    persist();render();toast("Deleted");
  }catch(e){toast(e.message)}
}

document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $(b.dataset.page).classList.add("active");
  $("sidebar").classList.remove("open");
});
$("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");

const savedTheme=localStorage.getItem("financeTheme")||"light";
if(savedTheme==="dark")document.body.classList.add("dark");
function updateThemeBtn(){$("themeBtn").textContent=document.body.classList.contains("dark")?"☀️ Light":"🌙 Dark"}
updateThemeBtn();
$("themeBtn").onclick=()=>{document.body.classList.toggle("dark");localStorage.setItem("financeTheme",document.body.classList.contains("dark")?"dark":"light");updateThemeBtn();};

function item(left,right,id,table){return `<div class="item"><span>${left}</span><span>${right} <button class="danger" onclick="del('${table}','${id}')">Delete</button></span></div>`}

function render(){
  const y=ym(),p=DB.passbook||[],sal=DB.salary||[],em=DB.emi||[],sp=DB.sipPayments||[],tr=DB.transactions||[];
  const salary=sal.filter(x=>String(x.Month)===y).reduce((s,x)=>s+num(x.Amount),0);
  const expense=p.filter(x=>String(x.Date).slice(0,7)===y&&String(x.Type).toLowerCase()==="expense").reduce((s,x)=>s+num(x.Amount),0);
  const income=p.filter(x=>String(x.Date).slice(0,7)===y&&String(x.Type).toLowerCase()==="income").reduce((s,x)=>s+num(x.Amount),0);
  const emi=em.filter(x=>String(x.Month)===y).reduce((s,x)=>s+num(x.Amount),0);
  const sip=sp.filter(x=>String(x.Month)===y).reduce((s,x)=>s+num(x.Amount),0);

  const gt=getGiveTakeBalances_();
  const receive=Object.values(gt).filter(x=>x.balance>0).reduce((s,x)=>s+x.balance,0);
  const pay=Object.values(gt).filter(x=>x.balance<0).reduce((s,x)=>s+Math.abs(x.balance),0);

  $("dash").innerHTML=[["💰 Salary",salary],["💸 Expense",expense],["📈 SIP Paid",sip],["🏦 EMI Paid",emi],["🤝 To Receive",receive],["🤝 To Pay",pay],["📒 Other Income",income],["💳 Net",salary+income-expense-emi-sip]].map(x=>`<div class="card"><small>${x[0]}</small><b>${money(x[1])}</b></div>`).join("");

  $("pbList").innerHTML=p.map(x=>item(`${x.Date} • <b>${x.Category}</b> • ${x.Type}`,money(x.Amount),x.ID,"passbook")).join("")||"<p>No records</p>";
  $("salaryList").innerHTML=sal.map(x=>item(`${x.Month} • ${x.Company}`,money(x.Amount),x.ID,"salary")).join("")||"<p>No records</p>";

  const loans=DB.loans||[];
  $("emiLoan").innerHTML='<option value="">Select loan</option>'+loans.map(x=>`<option value="${x.ID}">${x["Loan Name"]}</option>`).join("");
  $("loanList").innerHTML=loans.map(x=>`<div class="item"><span><b>${x["Loan Name"]}</b><br><small>${x.Remarks||""}</small></span><span>${money(x["Initial Amount"])}</span></div>`).join("")||"<p>No loans</p>";

  renderSectionDashboards_();
  renderGiveTakeDashboard_();
  $("gtList").innerHTML=tr.map(x=>item(`<b>${x.Person}</b> • ${x.Type}<br><small>${x.Purpose||""}</small>`,money(x.Amount),x.ID,"transactions")).join("")||"<p>No records</p>";

  renderInvest();
  renderSplit();
}


// ================= DASHBOARDS FOR EVERY SECTION =================
function ensureSummaryBox_(id, anchorId, title){
  let box=document.getElementById(id);
  if(!box){
    const anchor=$(anchorId);
    if(!anchor)return null;
    box=document.createElement("div");
    box.id=id;
    box.className="section-dashboard";
    anchor.parentNode.insertBefore(box,anchor);
  }
  return box;
}
function cards_(cards){
  return `<div class="section-dashboard-grid">${cards.map(c=>
    `<div class="section-stat-card"><small>${c[0]}</small><b>${c[1]}</b>${c[2]?`<span>${c[2]}</span>`:""}</div>`
  ).join("")}</div>`;
}
function renderSectionDashboards_(){
  const y=ym();
  const p=DB.passbook||[], sal=DB.salary||[], loans=DB.loans||[], em=DB.emi||[];
  const assets=DB.assets||[], baskets=DB.baskets||[], payments=DB.sipPayments||[];

  // PASSBOOK DASHBOARD
  const pbIncome=p.filter(x=>String(x.Date||"").slice(0,7)===y && String(x.Type||"").toLowerCase()==="income").reduce((s,x)=>s+num(x.Amount),0);
  const pbExpense=p.filter(x=>String(x.Date||"").slice(0,7)===y && String(x.Type||"").toLowerCase()==="expense").reduce((s,x)=>s+num(x.Amount),0);
  const pbBox=ensureSummaryBox_("passbookDashboard","pbList");
  if(pbBox)pbBox.innerHTML=`<h3>📒 This Month — Passbook</h3>${cards_([
    ["Income",money(pbIncome)],
    ["Expense",money(pbExpense)],
    ["Net",money(pbIncome-pbExpense)],
    ["Transactions",p.filter(x=>String(x.Date||"").slice(0,7)===y).length]
  ])}`;

  // SALARY DASHBOARD
  const monthSalary=sal.filter(x=>String(x.Month||"")===y).reduce((s,x)=>s+num(x.Amount),0);
  const totalSalary=sal.reduce((s,x)=>s+num(x.Amount),0);
  const companies=[...new Set(sal.map(x=>String(x.Company||"").trim()).filter(Boolean))].length;
  const salBox=ensureSummaryBox_("salaryDashboard","salaryList");
  if(salBox)salBox.innerHTML=`<h3>💰 Salary Dashboard</h3>${cards_([
    ["This Month",money(monthSalary)],
    ["Total Recorded",money(totalSalary)],
    ["Salary Entries",sal.length],
    ["Companies",companies]
  ])}`;

  // LOANS & EMI DASHBOARD
  const totalLoan=loans.reduce((s,x)=>s+num(x["Initial Amount"]),0);
  const paidThisMonth=em.filter(x=>String(x.Month||"")===y).reduce((s,x)=>s+num(x.Amount),0);
  const paidAll=em.reduce((s,x)=>s+num(x.Amount),0);
  const loanBox=ensureSummaryBox_("loanDashboard","loanList");
  if(loanBox)loanBox.innerHTML=`<h3>🏦 Loans & EMI Dashboard</h3>${cards_([
    ["Total Initial Loans",money(totalLoan)],
    ["EMI This Month",money(paidThisMonth)],
    ["Total EMI Recorded",money(paidAll)],
    ["Active Loans",loans.length]
  ])}`;

  // GIVE & TAKE SUMMARY
  const gt=Object.values(getGiveTakeBalances_());
  const toReceive=gt.filter(x=>x.balance>0).reduce((s,x)=>s+x.balance,0);
  const toPay=gt.filter(x=>x.balance<0).reduce((s,x)=>s+Math.abs(x.balance),0);
  const gtBox=ensureSummaryBox_("giveTakeSummary","gtList");
  if(gtBox)gtBox.innerHTML=`<h3>🤝 Give & Take Summary</h3>${cards_([
    ["Total To Receive",money(toReceive)],
    ["Total To Pay",money(toPay)],
    ["Net Position",money(toReceive-toPay)],
    ["People",gt.length]
  ])}`;

  // INVESTMENT & SIP DASHBOARD
  const monthlyPlan=assets.reduce((s,x)=>s+num(x["Monthly Amount"]),0);
  const sipPaid=payments.filter(x=>String(x.Month||"")===y).reduce((s,x)=>s+num(x.Amount),0);
  const paidBaskets=new Set(payments.filter(x=>String(x.Month||"")===y).map(x=>String(x["Basket ID"]))).size;
  const invBox=ensureSummaryBox_("investmentDashboard","basketList");
  if(invBox)invBox.innerHTML=`<h3>📈 Investments & SIP Dashboard</h3>${cards_([
    ["Monthly Planned",money(monthlyPlan)],
    ["Paid This Month",money(sipPaid)],
    ["Pending",money(Math.max(0,monthlyPlan-sipPaid))],
    ["Baskets Paid",`${paidBaskets}/${baskets.length}`]
  ])}`;
}

// ================= GIVE & TAKE INDIVIDUAL DASHBOARD =================
function getGiveTakeBalances_(){
  const out={};
  (DB.transactions||[]).forEach(x=>{
    const person=String(x.Person||"Unknown").trim();
    if(!out[person])out[person]={person,balance:0,given:0,received:0,taken:0,paid:0,transactions:0};
    const t=String(x.Type||"").toLowerCase().trim();
    const a=num(x.Amount);
    const p=out[person];p.transactions++;

    // Positive balance = user should receive money.
    if(t.includes("give")||t.includes("lent")||t==="lend"){p.balance+=a;p.given+=a;}
    else if(t.includes("receive")||t.includes("received")){p.balance-=a;p.received+=a;}
    // Negative balance = user has to pay money.
    else if(t.includes("take")||t.includes("borrow")){p.balance-=a;p.taken+=a;}
    else if(t==="pay"||t.includes("paid")){p.balance+=a;p.paid+=a;}
  });
  return out;
}

function renderGiveTakeDashboard_(){
  const list=Object.values(getGiveTakeBalances_()).sort((a,b)=>Math.abs(b.balance)-Math.abs(a.balance));
  let box=document.getElementById("gtDashboard");
  if(!box){
    box=document.createElement("div");
    box.id="gtDashboard";
    box.style.margin="0 0 14px 0";
    $("gtList").parentNode.insertBefore(box,$("gtList"));
  }

  if(!list.length){box.innerHTML="";return;}

  box.innerHTML=`<h3 style="margin:0 0 10px">👤 Individual Dashboard</h3>
  <div class="summary-grid">
    ${list.map(p=>{
      const status=p.balance>0?"To Receive":p.balance<0?"To Pay":"Settled";
      const amount=Math.abs(p.balance);
      return `<div class="card person-card">
        <small>${p.person}</small>
        <b>${money(amount)}</b>
        <span class="balance-label">${status}</span>
        <small>Given ${money(p.given)} • Received ${money(p.received)}<br>Taken ${money(p.taken)} • Paid ${money(p.paid)}</small>
      </div>`;
    }).join("")}
  </div>`;
}

// ================= NORMAL ADD FUNCTIONS =================
function addPassbook(){return save("passbook",{ID:uid(),Date:$("pbDate").value||today(),Type:$("pbType").value,Category:$("pbCat").value,Amount:num($("pbAmt").value),Account:$("pbAccount").value,Remarks:$("pbRemarks").value})}
function addSalary(){return save("salary",{ID:uid(),Month:$("salMonth").value||ym(),Company:$("salCompany").value,Amount:num($("salAmount").value),Remarks:$("salRemarks").value})}
function addLoan(){return save("loans",{ID:uid(),"Loan Name":$("loanName").value,"Initial Amount":num($("loanInitial").value),Remarks:$("loanRemarks").value})}
function addEmi(){if(!$("emiLoan").value)return toast("Select loan");return save("emi",{ID:uid(),"Loan ID":$("emiLoan").value,Month:$("emiMonth").value||ym(),Amount:num($("emiAmount").value),Remarks:$("emiRemarks").value})}
function addGive(){return save("transactions",{ID:uid(),Person:$("gtPerson").value,Type:$("gtType").value,Amount:num($("gtAmount").value),Date:$("gtDate").value||today(),Purpose:$("gtPurpose").value,Notes:$("gtNotes").value,Revisions:"[]"})}

async function addBasket(){
  const name=$("sipPerson").value.trim(),bn=$("sipBasket").value.trim();
  if(!name||!bn)return toast("Enter person and basket");
  let person=(DB.people||[]).find(x=>String(x.Name).toLowerCase()===name.toLowerCase());
  if(!person)person=await save("people",{ID:uid(),Name:name});
  await save("baskets",{ID:uid(),"Person ID":person.ID,"Basket Name":bn});
}
function addAsset(){if(!$("assetBasket").value)return toast("Select basket");return save("assets",{ID:uid(),"Basket ID":$("assetBasket").value,"Asset Name":$("assetName").value,"Asset Type":$("assetType").value,"Monthly Amount":num($("assetAmount").value)})}
function renderInvest(){
  const baskets=DB.baskets||[],people=DB.people||[],assets=DB.assets||[],payments=DB.sipPayments||[];
  $("assetBasket").innerHTML='<option value="">Select basket</option>'+baskets.map(b=>{const p=people.find(x=>x.ID===b["Person ID"]);return `<option value="${b.ID}">${p?p.Name:""} — ${b["Basket Name"]}</option>`}).join("");
  $("basketList").innerHTML=baskets.map(b=>{const p=people.find(x=>x.ID===b["Person ID"]),a=assets.filter(x=>x["Basket ID"]===b.ID),total=a.reduce((s,x)=>s+num(x["Monthly Amount"]),0),done=payments.some(x=>x["Basket ID"]===b.ID&&x.Month===ym());return `<div class="item"><span><b>${p?p.Name:""} — ${b["Basket Name"]}</b><br><small>${a.map(x=>`${x["Asset Name"]} ${money(x["Monthly Amount"])}`).join(" • ")||"No assets"}</small></span><span>${money(total)}<br>${done?"✓ PAID":`<button onclick="markBasket('${b.ID}',${total})">Mark Paid</button>`}</span></div>`}).join("")||"<p>No baskets</p>";
}
function markBasket(id,total){return save("sipPayments",{ID:uid(),"Basket ID":id,Month:ym(),Amount:total,"Paid At":new Date().toISOString()})}

// ================= MONEY SPLITTER =================
async function addGroup(){
  const name=$("spGroup").value.trim();
  const members=$("spMembers").value.split(",").map(x=>x.trim()).filter(Boolean);
  if(!name)return toast("Enter group name");
  if(members.length<2)return toast("Add minimum 2 members separated by comma");

  const record=await save("splitGroups",{ID:uid(),"Group Name":name,Category:$("spCat").value,"Members JSON":JSON.stringify(members)});
  $("spGroup").value="";$("spMembers").value="";
  $("spGroupSel").value=record.ID;
  renderSplit();
}

function groupMembers_(g){
  try{return JSON.parse(g["Members JSON"]||"[]")}catch(e){return []}
}

function calculateSplitGroup_(group){
  const allMembers=groupMembers_(group);
  const expenses=(DB.splitExpenses||[]).filter(x=>x["Group ID"]===group.ID);
  const stats={};
  allMembers.forEach(m=>stats[m]={name:m,paid:0,share:0,net:0});
  let total=0;

  expenses.forEach(e=>{
    const amount=num(e.Amount);
    total+=amount;
    const paidBy=String(e["Paid By"]||"").trim();
    if(paidBy){
      if(!stats[paidBy])stats[paidBy]={name:paidBy,paid:0,share:0,net:0};
      stats[paidBy].paid+=amount;
    }
    let participants=[];
    try{participants=JSON.parse(e["Members JSON"]||"[]")}catch(err){}
    if(!participants.length)participants=allMembers;
    const each=participants.length?amount/participants.length:0;
    participants.forEach(m=>{
      if(!stats[m])stats[m]={name:m,paid:0,share:0,net:0};
      stats[m].share+=each;
    });
  });

  Object.values(stats).forEach(s=>s.net=s.paid-s.share);
  return {total,expenses,stats:Object.values(stats)};
}

function renderSplit(){
  const groups=DB.splitGroups||[];
  const previous=$("spGroupSel").value;
  $("spGroupSel").innerHTML='<option value="">Select group</option>'+groups.map(g=>`<option value="${g.ID}">${g["Group Name"]}</option>`).join("");
  if(previous&&groups.some(g=>g.ID===previous))$("spGroupSel").value=previous;
  else if(groups.length)$("spGroupSel").value=groups[groups.length-1].ID;

  const selected=groups.find(x=>x.ID===$("spGroupSel").value);
  const members=selected?groupMembers_(selected):[];
  $("spPaidBy").innerHTML='<option value="">Paid by</option>'+members.map(x=>`<option value="${x}">${x}</option>`).join("");

  let summaryBox=document.getElementById("splitSummary");
  if(!summaryBox){
    summaryBox=document.createElement("div");
    summaryBox.id="splitSummary";
    summaryBox.style.margin="0 0 14px 0";
    $("splitList").parentNode.insertBefore(summaryBox,$("splitList"));
  }

  if(selected){
    const c=calculateSplitGroup_(selected);
    summaryBox.innerHTML=`<h3 style="margin:0 0 10px">📊 ${selected["Group Name"]} Summary</h3>
    <div class="summary-grid">
      <div class="card"><small>Total Expenses</small><b>${money(c.total)}</b></div>
      <div class="card"><small>Expenses Added</small><b>${c.expenses.length}</b></div>
      ${c.stats.map(s=>{
        const status=s.net>0?"Should Receive":s.net<0?"Should Pay":"Settled";
        return `<div class="card person-card"><small>${s.name}</small><b>${money(Math.abs(s.net))}</b><span class="balance-label">${status}</span><small>Paid ${money(s.paid)} • Share ${money(s.share)}</small></div>`;
      }).join("")}
    </div>`;
  }else summaryBox.innerHTML="";

  $("splitList").innerHTML=groups.map(g=>{
    const c=calculateSplitGroup_(g);
    const balances=c.stats.map(s=>`${s.name}: ${s.net>=0?"Receive":"Pay"} ${money(Math.abs(s.net))}`).join(" • ");
    return `<div class="card"><b>${g["Group Name"]}</b><p class="muted">${groupMembers_(g).join(", ")}</p><div class="item"><span>Total spent</span><span>${money(c.total)}</span></div><small>${balances||"No expenses yet"}</small></div>`;
  }).join("")||"<p>No groups</p>";
}

async function addSplitExpense(){
  const g=(DB.splitGroups||[]).find(x=>x.ID===$("spGroupSel").value);
  if(!g)return toast("Create/select a group first");
  if(!$("spTitle").value.trim())return toast("Enter expense title");
  if(num($("spAmount").value)<=0)return toast("Enter valid amount");
  if(!$("spPaidBy").value)return toast("Select who paid");

  let members=$("spMembersSel").value.split(",").map(x=>x.trim()).filter(Boolean);
  if(!members)members=groupMembers_(g);

  await save("splitExpenses",{ID:uid(),"Group ID":g.ID,Title:$("spTitle").value.trim(),Amount:num($("spAmount").value),"Paid By":$("spPaidBy").value,"Members JSON":JSON.stringify(members),Date:today()});
  $("spTitle").value="";$("spAmount").value="";$("spMembersSel").value="";
}

$("spGroupSel").onchange=renderSplit;

// START FAST
DB=restore();
if(Object.keys(DB).length){
  render();
  setStatus("☁️ Loading latest…");
  loadAll(true);
}else{
  loadAll(false);
}
