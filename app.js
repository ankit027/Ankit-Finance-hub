const API_URL="https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";
const LOCAL_KEY="ankit_finance_hub_db_v4";
let DB={},syncInProgress=false;
const $=id=>document.getElementById(id);
const uid=()=>Date.now()+"-"+Math.random().toString(36).slice(2);
const num=v=>Number(v||0)||0;
const money=v=>"₹"+num(v).toLocaleString("en-IN",{maximumFractionDigits:2});
const ym=()=>new Date().toISOString().slice(0,7);
const today=()=>new Date().toISOString().slice(0,10);

function toast(t){$("toast").textContent=t;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2200)}
function setStatus(t){$("status").textContent=t}
function persist(){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(DB))}catch(e){}}
function restore(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||"{}")}catch(e){return {}}}

async function api(action,payload={}){
 const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...payload})});
 const text=await r.text();let j;try{j=JSON.parse(text)}catch(e){throw new Error("Invalid API response")}
 if(!j.success)throw new Error(j.error||"API error");return j;
}
async function loadAll(silent=false){
 if(syncInProgress)return;syncInProgress=true;
 try{if(!silent)setStatus("☁️ Syncing…");const r=await api("loadAll");DB=r.data||{};persist();render();setStatus("☁️ Synced")}
 catch(e){setStatus(Object.keys(DB).length?"☁️ Offline cache":"⚠️ Sync error");if(!silent)toast(e.message)}
 finally{syncInProgress=false}
}
async function save(table,data){
 setStatus("☁️ Saving…");
 try{const r=await api("save",{table,data});const record=r.record||data;DB[table]=DB[table]||[];
 const i=DB[table].findIndex(x=>String(x.ID)===String(record.ID));if(i>=0)DB[table][i]=record;else DB[table].push(record);
 persist();render();setStatus("☁️ Synced");toast("✓ Saved instantly");return record}
 catch(e){setStatus("⚠️ Save failed");toast(e.message);throw e}
}
async function del(table,id){if(!confirm("Delete this record?"))return;await api("delete",{table,id});DB[table]=(DB[table]||[]).filter(x=>String(x.ID)!==String(id));persist();render();toast("Deleted")}

document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));$(b.dataset.page).classList.add("active");$("sidebar").classList.remove("open")});
$("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");
const theme=localStorage.getItem("financeTheme")||"light";if(theme==="dark")document.body.classList.add("dark");
function updateThemeBtn(){$("themeBtn").textContent=document.body.classList.contains("dark")?"☀️ Light":"🌙 Dark"}
updateThemeBtn();$("themeBtn").onclick=()=>{document.body.classList.toggle("dark");localStorage.setItem("financeTheme",document.body.classList.contains("dark")?"dark":"light");updateThemeBtn()};

function item(left,right,id,table){return `<div class="item"><span>${left}</span><span>${right} <button class="danger" onclick="del('${table}','${id}')">Delete</button></span></div>`}
function cards(a){return `<div class="section-dashboard-grid">${a.map(x=>`<div class="section-stat-card"><small>${x[0]}</small><b>${x[1]}</b></div>`).join("")}</div>`}
function suggestions(id,values){const el=$(id);if(el)el.innerHTML=[...new Set(values.map(x=>String(x||"").trim()).filter(Boolean))].sort().map(x=>`<option value="${x.replace(/"/g,"&quot;")}"></option>`).join("")}

function getGT(){
 const out={};(DB.transactions||[]).forEach(x=>{const n=String(x.Person||"Unknown").trim(),t=String(x.Type||"").toLowerCase(),a=num(x.Amount);if(!out[n])out[n]={person:n,balance:0,given:0,received:0,taken:0,paid:0};
 const p=out[n];if(t.includes("give")||t.includes("lent")){p.balance+=a;p.given+=a}else if(t.includes("receive")){p.balance-=a;p.received+=a}else if(t.includes("take")||t.includes("borrow")){p.balance-=a;p.taken+=a}else if(t.includes("pay")){p.balance+=a;p.paid+=a}});return out;
}

function render(){
 const y=ym(),p=DB.passbook||[],sal=DB.salary||[],em=DB.emi||[],sp=DB.sipPayments||[],tr=DB.transactions||[];
 const salary=sal.filter(x=>String(x.Month)===y).reduce((s,x)=>s+num(x.Amount),0);
 const expense=p.filter(x=>String(x.Date).slice(0,7)===y&&String(x.Type).toLowerCase()==="expense").reduce((s,x)=>s+num(x.Amount),0);
 const income=p.filter(x=>String(x.Date).slice(0,7)===y&&String(x.Type).toLowerCase()==="income").reduce((s,x)=>s+num(x.Amount),0);
 const emi=em.filter(x=>String(x.Month)===y).reduce((s,x)=>s+num(x.Amount),0);
 const sip=sp.filter(x=>String(x.Month)===y).reduce((s,x)=>s+num(x.Amount),0);
 const gt=Object.values(getGT()),receive=gt.filter(x=>x.balance>0).reduce((s,x)=>s+x.balance,0),pay=gt.filter(x=>x.balance<0).reduce((s,x)=>s+Math.abs(x.balance),0);
 $("dash").innerHTML=[["💰 Salary",salary],["💸 Expense",expense],["📈 SIP Paid",sip],["🏦 EMI Paid",emi],["🤝 To Receive",receive],["🤝 To Pay",pay],["📒 Other Income",income],["💳 Net",salary+income-expense-emi-sip]].map(x=>`<div class="card"><small>${x[0]}</small><b>${money(x[1])}</b></div>`).join("");

 $("passbookDashboard").innerHTML=`<h3>📊 Passbook Dashboard</h3>${cards([["Income",money(income)],["Expense",money(expense)],["Net",money(income-expense)],["Transactions",p.filter(x=>String(x.Date).slice(0,7)===y).length]])}`;
 $("salaryDashboard").innerHTML=`<h3>📊 Salary Dashboard</h3>${cards([["This Month",money(salary)],["Total",money(sal.reduce((s,x)=>s+num(x.Amount),0))],["Entries",sal.length],["Companies",new Set(sal.map(x=>x.Company).filter(Boolean)).size]])}`;
 const loans=DB.loans||[],$loan=loans.reduce((s,x)=>s+num(x["Initial Amount"]),0),allEmi=em.reduce((s,x)=>s+num(x.Amount),0);
 $("loanDashboard").innerHTML=`<h3>📊 Loans & EMI Dashboard</h3>${cards([["Initial Loans",money($loan)],["EMI This Month",money(emi)],["Total EMI Paid",money(allEmi)],["Active Loans",loans.length]])}`;
 $("giveTakeSummary").innerHTML=`<h3>📊 Give & Take Summary</h3>${cards([["To Receive",money(receive)],["To Pay",money(pay)],["Net",money(receive-pay)],["People",gt.length]])}`;
 $("gtDashboard").innerHTML=gt.length?`<h3>👤 Individual Dashboard</h3><div class="summary-grid">${gt.map(x=>`<div class="card person-card"><small>${x.person}</small><b>${money(Math.abs(x.balance))}</b><span class="balance-label">${x.balance>0?"To Receive":x.balance<0?"To Pay":"Settled"}</span><small>Given ${money(x.given)} • Received ${money(x.received)}<br>Taken ${money(x.taken)} • Paid ${money(x.paid)}</small></div>`).join("")}</div>`:"";
 const assets=DB.assets||[],baskets=DB.baskets||[],monthly=assets.reduce((s,x)=>s+num(x["Monthly Amount"]),0),paidB=new Set(sp.filter(x=>x.Month===y).map(x=>x["Basket ID"])).size;
 $("investmentDashboard").innerHTML=`<h3>📊 Investment & SIP Dashboard</h3>${cards([["Monthly Planned",money(monthly)],["Paid This Month",money(sip)],["Pending",money(Math.max(0,monthly-sip))],["Baskets Paid",paidB+"/"+baskets.length]])}`;

 $("pbList").innerHTML=p.map(x=>item(`${x.Date} • <b>${x.Category}</b> • ${x.Type}`,money(x.Amount),x.ID,"passbook")).join("")||"<p>No records</p>";
 $("salaryList").innerHTML=sal.map(x=>item(`${x.Month} • ${x.Company}`,money(x.Amount),x.ID,"salary")).join("")||"<p>No records</p>";
 $("emiLoan").innerHTML='<option value="">Select loan</option>'+loans.map(x=>`<option value="${x.ID}">${x["Loan Name"]}</option>`).join("");
 $("loanList").innerHTML=loans.map(x=>`<div class="item"><span><b>${x["Loan Name"]}</b><br><small>${x.Remarks||""}</small></span><span>${money(x["Initial Amount"])}</span></div>`).join("")||"<p>No loans</p>";
 $("gtList").innerHTML=tr.map(x=>item(`<b>${x.Person}</b> • ${x.Type}<br><small>${x.Purpose||""}</small>`,money(x.Amount),x.ID,"transactions")).join("")||"<p>No records</p>";
 renderInvest();renderSplit();buildSuggestions();
}

function buildSuggestions(){
 const p=DB.passbook||[],s=DB.salary||[],l=DB.loans||[],e=DB.emi||[],t=DB.transactions||[],g=DB.splitGroups||[],ex=DB.splitExpenses||[],pe=DB.people||[],b=DB.baskets||[],a=DB.assets||[];
 suggestions("pbCatList",p.map(x=>x.Category));suggestions("pbAccountList",p.map(x=>x.Account));suggestions("pbRemarksList",p.map(x=>x.Remarks));
 suggestions("salCompanyList",s.map(x=>x.Company));suggestions("salRemarksList",s.map(x=>x.Remarks));
 suggestions("loanNameList",l.map(x=>x["Loan Name"]));suggestions("loanRemarksList",l.map(x=>x.Remarks));suggestions("emiRemarksList",e.map(x=>x.Remarks));
 suggestions("gtPersonList",t.map(x=>x.Person));suggestions("gtPurposeList",t.map(x=>x.Purpose));suggestions("gtNotesList",t.map(x=>x.Notes));
 suggestions("spGroupList",g.map(x=>x["Group Name"]));suggestions("spMembersList",g.map(x=>x["Members JSON"]));suggestions("spTitleList",ex.map(x=>x.Title));
 suggestions("sipPersonList",pe.map(x=>x.Name));suggestions("sipBasketList",b.map(x=>x["Basket Name"]));suggestions("assetNameList",a.map(x=>x["Asset Name"]));
}

function addPassbook(){if(num($("pbAmt").value)<=0)return toast("Enter amount");return save("passbook",{ID:uid(),Date:$("pbDate").value||today(),Type:$("pbType").value,Category:$("pbCat").value,Amount:num($("pbAmt").value),Account:$("pbAccount").value,Remarks:$("pbRemarks").value})}
function addSalary(){return save("salary",{ID:uid(),Month:$("salMonth").value||ym(),Company:$("salCompany").value,Amount:num($("salAmount").value),Remarks:$("salRemarks").value})}
function addLoan(){return save("loans",{ID:uid(),"Loan Name":$("loanName").value,"Initial Amount":num($("loanInitial").value),Remarks:$("loanRemarks").value})}
function addEmi(){if(!$("emiLoan").value)return toast("Select loan");return save("emi",{ID:uid(),"Loan ID":$("emiLoan").value,Month:$("emiMonth").value||ym(),Amount:num($("emiAmount").value),Remarks:$("emiRemarks").value})}
function addGive(){return save("transactions",{ID:uid(),Person:$("gtPerson").value,Type:$("gtType").value,Amount:num($("gtAmount").value),Date:$("gtDate").value||today(),Purpose:$("gtPurpose").value,Notes:$("gtNotes").value,Revisions:"[]"})}
async function addBasket(){const name=$("sipPerson").value.trim(),bn=$("sipBasket").value.trim();if(!name||!bn)return toast("Enter person and basket");let p=(DB.people||[]).find(x=>String(x.Name).toLowerCase()===name.toLowerCase());if(!p)p=await save("people",{ID:uid(),Name:name});await save("baskets",{ID:uid(),"Person ID":p.ID,"Basket Name":bn})}
function addAsset(){if(!$("assetBasket").value)return toast("Select basket");return save("assets",{ID:uid(),"Basket ID":$("assetBasket").value,"Asset Name":$("assetName").value,"Asset Type":$("assetType").value,"Monthly Amount":num($("assetAmount").value)})}
function renderInvest(){const bs=DB.baskets||[],pe=DB.people||[],a=DB.assets||[],pay=DB.sipPayments||[];$("assetBasket").innerHTML='<option value="">Select basket</option>'+bs.map(b=>{const p=pe.find(x=>x.ID===b["Person ID"]);return `<option value="${b.ID}">${p?p.Name:""} — ${b["Basket Name"]}</option>`}).join("");$("basketList").innerHTML=bs.map(b=>{const p=pe.find(x=>x.ID===b["Person ID"]),aa=a.filter(x=>x["Basket ID"]===b.ID),total=aa.reduce((s,x)=>s+num(x["Monthly Amount"]),0),done=pay.some(x=>x["Basket ID"]===b.ID&&x.Month===ym());return `<div class="item"><span><b>${p?p.Name:""} — ${b["Basket Name"]}</b><br><small>${aa.map(x=>`${x["Asset Name"]} ${money(x["Monthly Amount"])}`).join(" • ")||"No assets"}</small></span><span>${money(total)}<br>${done?"✓ PAID":`<button onclick="markBasket('${b.ID}',${total})">Mark Paid</button>`}</span></div>`}).join("")||"<p>No baskets</p>"}
function markBasket(id,total){return save("sipPayments",{ID:uid(),"Basket ID":id,Month:ym(),Amount:total,"Paid At":new Date().toISOString()})}
async function addGroup(){const name=$("spGroup").value.trim(),m=$("spMembers").value.split(",").map(x=>x.trim()).filter(Boolean);if(!name||m.length<2)return toast("Enter group and minimum 2 members");const r=await save("splitGroups",{ID:uid(),"Group Name":name,Category:$("spCat").value,"Members JSON":JSON.stringify(m)});$("spGroupSel").value=r.ID;renderSplit()}
function members(g){try{return JSON.parse(g["Members JSON"]||"[]")}catch(e){return []}}
function calc(g){const all=members(g),stats={};all.forEach(n=>stats[n]={name:n,paid:0,share:0,net:0});const ex=(DB.splitExpenses||[]).filter(x=>x["Group ID"]===g.ID);let total=0;ex.forEach(e=>{const amt=num(e.Amount);total+=amt;const payer=e["Paid By"];if(payer){stats[payer]=stats[payer]||{name:payer,paid:0,share:0,net:0};stats[payer].paid+=amt}let ps=[];try{ps=JSON.parse(e["Members JSON"]||"[]")}catch(z){}if(!ps.length)ps=all;ps.forEach(n=>{stats[n]=stats[n]||{name:n,paid:0,share:0,net:0};stats[n].share+=amt/ps.length})});Object.values(stats).forEach(x=>x.net=x.paid-x.share);return{total,ex,stats:Object.values(stats)}}
function renderSplit(){const gs=DB.splitGroups||[],prev=$("spGroupSel").value;$("spGroupSel").innerHTML='<option value="">Select group</option>'+gs.map(g=>`<option value="${g.ID}">${g["Group Name"]}</option>`).join("");if(prev&&gs.some(g=>g.ID===prev))$("spGroupSel").value=prev;const g=gs.find(x=>x.ID===$("spGroupSel").value)||gs[0];if(g)$("spGroupSel").value=g.ID;const m=g?members(g):[];$("spPaidBy").innerHTML='<option value="">Paid by</option>'+m.map(x=>`<option>${x}</option>`).join("");if(g){const c=calc(g);$("splitSummary").innerHTML=`<h3>📊 ${g["Group Name"]} Summary</h3><div class="summary-grid"><div class="card"><small>Total Expenses</small><b>${money(c.total)}</b></div>${c.stats.map(x=>`<div class="card person-card"><small>${x.name}</small><b>${money(Math.abs(x.net))}</b><span class="balance-label">${x.net>0?"Should Receive":x.net<0?"Should Pay":"Settled"}</span><small>Paid ${money(x.paid)} • Share ${money(x.share)}</small></div>`).join("")}</div>`}else $("splitSummary").innerHTML="";$("splitList").innerHTML=gs.map(g=>{const c=calc(g);return `<div class="card"><b>${g["Group Name"]}</b><p class="muted">${members(g).join(", ")}</p><b>Total: ${money(c.total)}</b></div>`}).join("")||"<p>No groups</p>"}
async function addSplitExpense(){const g=(DB.splitGroups||[]).find(x=>x.ID===$("spGroupSel").value);if(!g)return toast("Select group");let m=$("spMembersSel").value.split(",").map(x=>x.trim()).filter(Boolean);if(!m.length)m=members(g);await save("splitExpenses",{ID:uid(),"Group ID":g.ID,Title:$("spTitle").value,Amount:num($("spAmount").value),"Paid By":$("spPaidBy").value,"Members JSON":JSON.stringify(m),Date:today()})}
$("spGroupSel").onchange=renderSplit;
DB=restore();if(Object.keys(DB).length){render();setStatus("☁️ Loading latest…");loadAll(true)}else loadAll();
