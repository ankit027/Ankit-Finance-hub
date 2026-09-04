const API_URL="https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";
let DB={}; const $=id=>document.getElementById(id);
const uid=()=>Date.now()+"-"+Math.random().toString(36).slice(2);
const num=v=>Number(v||0)||0; const money=v=>"₹"+num(v).toLocaleString("en-IN");
const ym=()=>new Date().toISOString().slice(0,7); const today=()=>new Date().toISOString().slice(0,10);
function toast(t){$("toast").textContent=t;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2200)}
function setStatus(t){$("status").textContent=t}
async function api(action,payload={}){
 if(API_URL.includes("PASTE_")) throw new Error("API URL not configured");
 const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...payload})});
 const j=await r.json(); if(!j.success) throw new Error(j.error||"API error"); return j;
}
async function loadAll(){try{setStatus("☁️ Syncing…");DB=(await api("loadAll")).data||{};setStatus("☁️ Synced");render()}catch(e){setStatus("⚠️ Sync error");toast(e.message)}}
async function save(table,data){setStatus("☁️ Saving…");try{await api("save",{table,data});toast("✓ Saved to cloud instantly");await loadAll()}catch(e){toast(e.message);setStatus("⚠️ Save failed")}}
async function del(table,id){if(!confirm("Delete this record?"))return;await api("delete",{table,id});await loadAll()}
document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));$(b.dataset.page).classList.add("active");$("sidebar").classList.remove("open")});
$("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");

function item(left,right,id,table){return `<div class="item"><span>${left}</span><span>${right} <button class="danger" onclick="del('${table}','${id}')">Delete</button></span></div>`}
function render(){
 const y=ym(), p=DB.passbook||[], sal=DB.salary||[], em=DB.emi||[], sp=DB.sipPayments||[], tr=DB.transactions||[];
 const salary=sal.filter(x=>String(x["Month"])===y).reduce((s,x)=>s+num(x.Amount),0);
 const expense=p.filter(x=>String(x.Date).slice(0,7)===y&&String(x.Type).toLowerCase()==="expense").reduce((s,x)=>s+num(x.Amount),0);
 const income=p.filter(x=>String(x.Date).slice(0,7)===y&&String(x.Type).toLowerCase()==="income").reduce((s,x)=>s+num(x.Amount),0);
 const emi=em.filter(x=>String(x.Month)===y).reduce((s,x)=>s+num(x.Amount),0);
 const sip=sp.filter(x=>String(x.Month)===y).reduce((s,x)=>s+num(x.Amount),0);
 const receive=tr.filter(x=>String(x.Type).toLowerCase()==="receive").reduce((s,x)=>s+num(x.Amount),0);
 const pay=tr.filter(x=>String(x.Type).toLowerCase()==="pay").reduce((s,x)=>s+num(x.Amount),0);
 $("dash").innerHTML=[["💰 Salary",salary],["💸 Expense",expense],["📈 SIP Paid",sip],["🏦 EMI Paid",emi],["🤝 To Receive",receive],["🤝 To Pay",pay],["📒 Other Income",income],["💳 Net",salary+income-expense-emi-sip]].map(x=>`<div class="card"><small>${x[0]}</small><b>${money(x[1])}</b></div>`).join("");
 $("pbList").innerHTML=p.map(x=>item(`${x.Date} • <b>${x.Category}</b> • ${x.Type}`,money(x.Amount),x.ID,"passbook")).join("")||"<p>No records</p>";
 $("salaryList").innerHTML=sal.map(x=>item(`${x.Month} • ${x.Company}`,money(x.Amount),x.ID,"salary")).join("")||"<p>No records</p>";
 const loans=DB.loans||[];$("emiLoan").innerHTML='<option value="">Select loan</option>'+loans.map(x=>`<option value="${x.ID}">${x["Loan Name"]}</option>`).join("");
 $("loanList").innerHTML=loans.map(x=>`<div class="item"><span><b>${x["Loan Name"]}</b><br><small>${x.Remarks||""}</small></span><span>${money(x["Initial Amount"])}</span></div>`).join("")||"<p>No loans</p>";
 $("gtList").innerHTML=tr.map(x=>item(`<b>${x.Person}</b> • ${x.Type}<br><small>${x.Purpose||""}</small>`,money(x.Amount),x.ID,"transactions")).join("")||"<p>No records</p>";
 renderInvest();renderSplit();
}
function addPassbook(){save("passbook",{ID:uid(),Date:$("pbDate").value||today(),Type:$("pbType").value,Category:$("pbCat").value,Amount:num($("pbAmt").value),Account:$("pbAccount").value,Remarks:$("pbRemarks").value})}
function addSalary(){save("salary",{ID:uid(),Month:$("salMonth").value||ym(),Company:$("salCompany").value,Amount:num($("salAmount").value),Remarks:$("salRemarks").value})}
function addLoan(){save("loans",{ID:uid(),"Loan Name":$("loanName").value,"Initial Amount":num($("loanInitial").value),Remarks:$("loanRemarks").value})}
function addEmi(){if(!$("emiLoan").value)return toast("Select loan");save("emi",{ID:uid(),"Loan ID":$("emiLoan").value,Month:$("emiMonth").value||ym(),Amount:num($("emiAmount").value),Remarks:$("emiRemarks").value})}
function addGive(){save("transactions",{ID:uid(),Person:$("gtPerson").value,Type:$("gtType").value,Amount:num($("gtAmount").value),Date:$("gtDate").value||today(),Purpose:$("gtPurpose").value,Notes:$("gtNotes").value,Revisions:"[]"})}
async function addBasket(){const name=$("sipPerson").value.trim(),bn=$("sipBasket").value.trim();if(!name||!bn)return toast("Enter person and basket");let person=(DB.people||[]).find(x=>String(x.Name).toLowerCase()===name.toLowerCase());if(!person){const data={ID:uid(),Name:name};await save("people",data);person=data}await save("baskets",{ID:uid(),"Person ID":person.ID,"Basket Name":bn})}
function addAsset(){if(!$("assetBasket").value)return toast("Select basket");save("assets",{ID:uid(),"Basket ID":$("assetBasket").value,"Asset Name":$("assetName").value,"Asset Type":$("assetType").value,"Monthly Amount":num($("assetAmount").value)})}
function renderInvest(){const baskets=DB.baskets||[],people=DB.people||[],assets=DB.assets||[],payments=DB.sipPayments||[];$("assetBasket").innerHTML='<option value="">Select basket</option>'+baskets.map(b=>{let p=people.find(x=>x.ID===b["Person ID"]);return `<option value="${b.ID}">${p?p.Name:""} — ${b["Basket Name"]}</option>`}).join("");$("basketList").innerHTML=baskets.map(b=>{let p=people.find(x=>x.ID===b["Person ID"]),a=assets.filter(x=>x["Basket ID"]===b.ID),total=a.reduce((s,x)=>s+num(x["Monthly Amount"]),0),done=payments.some(x=>x["Basket ID"]===b.ID&&x.Month===ym());return `<div class="item"><span><b>${p?p.Name:""} — ${b["Basket Name"]}</b><br><small>${a.map(x=>`${x["Asset Name"]} ${money(x["Monthly Amount"])}`).join(" • ")||"No assets"}</small></span><span>${money(total)}<br>${done?"✓ PAID":`<button onclick="markBasket('${b.ID}',${total})">Mark Paid</button>`}</span></div>`}).join("")||"<p>No baskets</p>"}
function markBasket(id,total){save("sipPayments",{ID:uid(),"Basket ID":id,Month:ym(),Amount:total,"Paid At":new Date().toISOString()})}
function addGroup(){const m=$("spMembers").value.split(",").map(x=>x.trim()).filter(Boolean);if(m.length<2)return toast("Add minimum 2 members");save("splitGroups",{ID:uid(),"Group Name":$("spGroup").value,Category:$("spCat").value,"Members JSON":JSON.stringify(m)})}
function renderSplit(){const groups=DB.splitGroups||[];$("spGroupSel").innerHTML='<option value="">Select group</option>'+groups.map(g=>`<option value="${g.ID}">${g["Group Name"]}</option>`).join("");const g=groups.find(x=>x.ID===$("spGroupSel").value)||groups[0],m=g?JSON.parse(g["Members JSON"]||"[]"):[];$("spPaidBy").innerHTML='<option value="">Paid by</option>'+m.map(x=>`<option>${x}</option>`).join("");$("splitList").innerHTML=groups.map(g=>{const ex=(DB.splitExpenses||[]).filter(x=>x["Group ID"]===g.ID);return `<div class="card"><b>${g["Group Name"]}</b><p class="muted">${JSON.parse(g["Members JSON"]||"[]").join(", ")}</p>${ex.map(e=>`<div class="item"><span>${e.Title} • ${e["Paid By"]}</span><span>${money(e.Amount)}</span></div>`).join("")||"<small>No expenses</small>"}</div>`}).join("")||"<p>No groups</p>"}
function addSplitExpense(){const g=(DB.splitGroups||[]).find(x=>x.ID===$("spGroupSel").value);if(!g)return toast("Select group");let m=$("spMembersSel").value.split(",").map(x=>x.trim()).filter(Boolean);if(!m.length)m=JSON.parse(g["Members JSON"]);save("splitExpenses",{ID:uid(),"Group ID":g.ID,Title:$("spTitle").value,Amount:num($("spAmount").value),"Paid By":$("spPaidBy").value,"Members JSON":JSON.stringify(m),Date:today()})}
$("spGroupSel").onchange=renderSplit; loadAll();
