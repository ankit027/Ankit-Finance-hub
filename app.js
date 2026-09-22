/* =========================================================
   ANKIT FINANCE HUB - COMPLETE APP.JS
   Cloud backend: Google Apps Script Web App
   ========================================================= */

const API_URL = "https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";

let DB = {};
const charts = {};

const $ = id => document.getElementById(id);
const val = id => $(id)?.value ?? "";
const num = v => Number(v || 0);
const today = () => new Date().toISOString().slice(0,10);
const monthNow = () => new Date().toISOString().slice(0,7);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = v => "₹" + num(v).toLocaleString("en-IN",{maximumFractionDigits:2});
const arr = t => Array.isArray(DB[t]) ? DB[t] : [];
const unique = a => [...new Set((a||[]).filter(x=>x!==""&&x!=null).map(String))];

function toast(msg){
  const t=$("toast"); if(!t){alert(msg);return;}
  t.textContent=msg;t.classList.add("show");
  clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove("show"),2600);
}
function setStatus(s){const e=$("status");if(e)e.textContent=s;}
function apiReady(){return API_URL && !API_URL.includes("PASTE_YOUR");}

const API_TIMEOUT = 15000;

async function fetchWithTimeout(url, options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),API_TIMEOUT);
  try{
    return await fetch(url,{...options,signal:controller.signal,cache:"no-store"});
  }catch(e){
    if(e.name==="AbortError") throw new Error("Connection timed out after 15 seconds. Check Apps Script deployment/access.");
    throw e;
  }finally{clearTimeout(timer)}
}

async function api(action,payload={}){
  if(!apiReady()) throw new Error("Google Apps Script URL is missing.");
  const r=await fetchWithTimeout(API_URL,{
    method:"POST",mode:"cors",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify({action,...payload})
  });
  if(!r.ok) throw new Error("Server error: "+r.status+" "+r.statusText);
  const text=await r.text();
  let out;
  try{out=JSON.parse(text)}catch(e){throw new Error("Invalid server response. Check Apps Script deployment and access.");}
  if(!out.success) throw new Error(out.error||"Cloud request failed");
  return out;
}

async function loadAll(){
  if(!apiReady()){setStatus("⚠️ API URL required");return;}
  try{
    setStatus("☁️ Connecting...");
    const r=await fetchWithTimeout(API_URL+"?action=loadAll&_="+Date.now(),{method:"GET"});
    if(!r.ok) throw new Error("Server error: "+r.status+" "+r.statusText);
    const text=await r.text();
    let out;
    try{out=JSON.parse(text)}catch(e){throw new Error("Apps Script did not return JSON. Set Web App access to Anyone and use the /exec URL.");}
    if(!out.success) throw new Error(out.error||"Cloud load failed");
    DB=out.data||{};
    [
      "transactions","salary","loans","emi","passbook","people","baskets","assets",
      "sipPayments","splitGroups","splitExpenses","splitSettlements","vehicles","fuel","maintenance"
    ].forEach(k=>{if(!Array.isArray(DB[k]))DB[k]=[]});
    setStatus("☁️ Synced");
    fillLists();renderAll();
  }catch(e){
    console.error("Cloud connection failed:",e);
    setStatus("⚠️ Sync failed");
    toast("Cloud connection failed: "+(e.message||"Unable to connect"));
  }
}

async function save(table,data){
  const r=await api("save",{table,data});
  const record=r.data?.record||r.record||r.data;
  if(!record) throw new Error("Save response did not contain a record.");
  DB[table]=arr(table);
  const i=DB[table].findIndex(x=>String(x.ID)===String(record.ID));
  if(i>=0)DB[table][i]=record;else DB[table].push(record);
  return record;
}

async function del(table,id){
  if(!id)return;
  if(!confirm("Delete this record?"))return;
  try{
    const record=arr(table).find(x=>String(x.ID)===String(id));
    if((table==="fuel"||table==="maintenance")&&record){
      const linked=arr("passbook").filter(p=>String(p.ID)===String(record["Passbook ID"])||String(p["Source ID"])===String(id));
      for(const p of linked) await api("delete",{table:"passbook",id:p.ID});
      DB.passbook=arr("passbook").filter(p=>!linked.some(q=>String(q.ID)===String(p.ID)));
    }
    await api("delete",{table,id});
    DB[table]=arr(table).filter(x=>String(x.ID)!==String(id));
    renderAll();toast("Deleted successfully");
  }catch(e){toast(e.message||"Delete failed")}
}

function opt(el,items,vf,lf,placeholder="Select"){
  if(!el)return;
  const old=el.value;
  el.innerHTML=`<option value="">${esc(placeholder)}</option>`+(items||[]).map(x=>`<option value="${esc(vf(x))}">${esc(lf(x))}</option>`).join("");
  if([...el.options].some(o=>o.value===old))el.value=old;
}
function vehicleName(id){const v=arr("vehicles").find(x=>String(x.ID)===String(id));return v?.["Vehicle Name"]||"Vehicle"}

function fillVehiclePaymentModes(){
  const accounts=unique(arr("passbook").map(x=>x.Account));
  ["fuelAccount","maintAccountSelect"].forEach(id=>opt($(id),accounts,x=>x,x=>"","Payment Mode / Account"));
  // fix labels
  ["fuelAccount","maintAccountSelect"].forEach(id=>{
    const e=$(id);if(!e)return;
    [...e.options].forEach((o,i)=>{if(i>0)o.textContent=o.value});
  });
}

function fillLists(){
  const vehicles=arr("vehicles"),groups=arr("splitGroups"),baskets=arr("baskets");
  opt($("fuelVehicle"),vehicles,x=>x.ID,x=>x["Vehicle Name"],"Select Vehicle");
  opt($("maintVehicle"),vehicles,x=>x.ID,x=>x["Vehicle Name"],"Select Vehicle");
  opt($("vehicleFilter"),vehicles,x=>x.ID,x=>x["Vehicle Name"],"All Vehicles");
  fillVehiclePaymentModes();

  opt($("emiLoan"),arr("loans"),x=>x.ID,x=>x["Loan Name"]||x.Name||"Loan","Select Loan");
  opt($("assetBasket"),baskets,x=>x.ID,x=>x["Basket Name"]||"Basket","Select Basket");
  opt($("spGroupSel"),groups,x=>x.ID,x=>x["Group Name"],"Select Group");
  opt($("spGroupExpense"),groups,x=>x.ID,x=>x["Group Name"],"Select Group");

  const categories=unique(arr("passbook").map(x=>x.Category));
  opt($("dashCategory"),categories,x=>x,x=>"","All Categories");
  opt($("pbFilterCategory"),categories,x=>x,x=>"","All Categories");

  const people=unique([...arr("people").map(x=>x.Name),...arr("splitGroups").flatMap(x=>String(x.Members||"").split(",").map(s=>s.trim()))]);
  if($("personList"))$("personList").innerHTML=people.map(x=>`<option value="${esc(x)}">`).join("");
  if($("accountList"))$("accountList").innerHTML=unique(arr("passbook").map(x=>x.Account)).map(x=>`<option value="${esc(x)}">`).join("");
  if($("categoryList"))$("categoryList").innerHTML=categories.map(x=>`<option value="${esc(x)}">`).join("");
  if($("remarksList"))$("remarksList").innerHTML=unique(arr("passbook").map(x=>x.Remarks)).map(x=>`<option value="${esc(x)}">`).join("");
  if($("companyList"))$("companyList").innerHTML=unique(arr("salary").map(x=>x.Company)).map(x=>`<option value="${esc(x)}">`).join("");
  if($("salaryRemarksList"))$("salaryRemarksList").innerHTML=unique(arr("salary").map(x=>x.Remarks)).map(x=>`<option value="${esc(x)}">`).join("");
  if($("vehicleNameList"))$("vehicleNameList").innerHTML=unique(vehicles.map(x=>x["Vehicle Name"])).map(x=>`<option value="${esc(x)}">`).join("");
}

function card(title,value){return `<div class="card"><small>${esc(title)}</small><b>${money(value)}</b></div>`}
function table(headers,rows){
  if(!rows.length)return `<div class="listbox muted">No records found.</div>`;
  return `<div class="listbox tablewrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}
function actionBtns(table,id,editFn=""){return `<span class="actions">${editFn?`<button onclick="${editFn}('${esc(id)}')">Edit</button>`:""}<button onclick="del('${table}','${esc(id)}')">Delete</button></span>`}

function renderDashboard(){
  const month=val("dashMonth")||monthNow(),cat=val("dashCategory");
  let rows=arr("passbook").filter(x=>String(x.Date||"").slice(0,7)===month);
  if(cat)rows=rows.filter(x=>String(x.Category)===cat);
  const income=rows.filter(x=>String(x.Type).toLowerCase()==="income").reduce((s,x)=>s+num(x.Amount),0);
  const expense=rows.filter(x=>String(x.Type).toLowerCase()!=="income").reduce((s,x)=>s+num(x.Amount),0);
  const salary=arr("salary").filter(x=>String(x.Month||"").slice(0,7)===month).reduce((s,x)=>s+num(x.Amount),0);
  $("dash").innerHTML=card("Income",income)+card("Expense",expense)+card("Balance",income-expense)+card("Salary",salary)+card("Vehicles",arr("vehicles").length);
  drawChart("mainChart","bar",["Income","Expense","Salary"],[income,expense,salary],"Amount");
  drawChart("expenseChart","doughnut",["Income","Expense"],[income,expense],"Amount");
}
function resetDashFilters(){if($("dashMonth"))$("dashMonth").value=monthNow();if($("dashCategory"))$("dashCategory").value="";renderDashboard()}

function renderPassbook(){
  let rows=arr("passbook").slice();
  const m=val("pbFilterMonth"),c=val("pbFilterCategory");
  if(m)rows=rows.filter(x=>String(x.Date||"").slice(0,7)===m);
  if(c)rows=rows.filter(x=>String(x.Category)===c);
  const inc=rows.filter(x=>String(x.Type).toLowerCase()==="income").reduce((s,x)=>s+num(x.Amount),0);
  const exp=rows.filter(x=>String(x.Type).toLowerCase()!=="income").reduce((s,x)=>s+num(x.Amount),0);
  $("passbookDash").innerHTML=card("Income",inc)+card("Expense",exp)+card("Net",inc-exp);
  $("pbList").innerHTML=table(["Date","Type","Category","Amount","Account","Remarks","Actions"],
    rows.sort((a,b)=>String(b.Date).localeCompare(String(a.Date))).map(x=>`<tr><td>${esc(x.Date)}</td><td>${esc(x.Type)}</td><td>${esc(x.Category)}</td><td>${money(x.Amount)}</td><td>${esc(x.Account)}</td><td>${esc(x.Remarks)}</td><td>${actionBtns("passbook",x.ID,"editPassbook")}</td></tr>`));
  drawChart("passbookChart","doughnut",["Income","Expense"],[inc,exp],"Amount");
}
function clearPassbook(){["pbEditId","pbCat","pbAmt","pbAccount","pbRemarks"].forEach(id=>{if($(id))$(id).value=""});if($("pbDate"))$("pbDate").value=today();if($("pbType"))$("pbType").value="Expense";if($("pbSaveBtn"))$("pbSaveBtn").textContent="Save"}
function editPassbook(id){const x=arr("passbook").find(r=>String(r.ID)===String(id));if(!x)return;$("pbEditId").value=x.ID;$("pbDate").value=x.Date||today();$("pbType").value=x.Type||"Expense";$("pbCat").value=x.Category||"";$("pbAmt").value=x.Amount||"";$("pbAccount").value=x.Account||"";$("pbRemarks").value=x.Remarks||"";$("pbSaveBtn").textContent="Update";showPage("passbook")}
async function addPassbook(){
  const data={Date:val("pbDate")||today(),Type:val("pbType"),Category:val("pbCat"),Amount:num(val("pbAmt")),Account:val("pbAccount"),Remarks:val("pbRemarks")};
  if(!data.Category||data.Amount<=0)return toast("Enter category and valid amount");
  try{if(val("pbEditId"))data.ID=val("pbEditId");await save("passbook",data);clearPassbook();renderAll();toast("Passbook saved")}catch(e){toast(e.message)}
}
function resetPassbookFilters(){if($("pbFilterMonth"))$("pbFilterMonth").value="";if($("pbFilterCategory"))$("pbFilterCategory").value="";renderPassbook()}

function renderSalary(){
  const rows=arr("salary").sort((a,b)=>String(b.Month).localeCompare(String(a.Month)));
  const total=rows.reduce((s,x)=>s+num(x.Amount),0);
  $("salaryDash").innerHTML=card("Total Recorded Salary",total)+card("Entries",rows.length);
  $("salaryList").innerHTML=table(["Month","Company","Amount","Remarks","Actions"],rows.map(x=>`<tr><td>${esc(x.Month)}</td><td>${esc(x.Company)}</td><td>${money(x.Amount)}</td><td>${esc(x.Remarks)}</td><td>${actionBtns("salary",x.ID)}</td></tr>`));
  const months=unique(rows.map(x=>x.Month)).slice(0,12).reverse();drawChart("salaryChart","line",months,months.map(m=>rows.filter(x=>x.Month===m).reduce((s,x)=>s+num(x.Amount),0)),"Salary");
}
async function addSalary(){const data={Month:val("salMonth")||monthNow(),Company:val("salCompany"),Amount:num(val("salAmount")),Remarks:val("salRemarks")};if(data.Amount<=0)return toast("Enter salary amount");try{await save("salary",data);["salCompany","salAmount","salRemarks"].forEach(id=>$(id).value="");renderAll();toast("Salary saved")}catch(e){toast(e.message)}}

function renderLoans(){
  const loans=arr("loans"),emis=arr("emi");
  $("loanDash").innerHTML=card("Loans",loans.length)+card("EMI Paid",emis.reduce((s,x)=>s+num(x.Amount),0));
  $("loanList").innerHTML=table(["Loan","Initial","Remarks","EMI Paid","Actions"],loans.map(l=>`<tr><td>${esc(l["Loan Name"]||l.Name)}</td><td>${money(l["Initial Amount"]||l.Initial||0)}</td><td>${esc(l.Remarks)}</td><td>${money(emis.filter(e=>String(e["Loan ID"])===String(l.ID)).reduce((s,x)=>s+num(x.Amount),0))}</td><td>${actionBtns("loans",l.ID)}</td></tr>`));
}
async function addLoan(){const data={"Loan Name":val("loanName"),"Initial Amount":num(val("loanInitial")),Remarks:val("loanRemarks")};if(!data["Loan Name"])return toast("Enter loan name");try{await save("loans",data);["loanName","loanInitial","loanRemarks"].forEach(id=>$(id).value="");renderAll();toast("Loan added")}catch(e){toast(e.message)}}
async function addEmi(){const loan=val("emiLoan"),amount=num(val("emiAmount"));if(!loan||amount<=0)return toast("Select loan and enter EMI");try{await save("emi",{"Loan ID":loan,Month:val("emiMonth")||monthNow(),Amount:amount,Remarks:val("emiRemarks")});["emiAmount","emiRemarks"].forEach(id=>$(id).value="");renderAll();toast("EMI saved")}catch(e){toast(e.message)}}

function renderGive(){
  const rows=arr("people").length?arr("transactions"):arr("transactions");
  const total=rows.reduce((s,x)=>s+num(x.Amount),0);
  $("giveDash").innerHTML=card("Transactions",rows.length)+card("Recorded Amount",total);
  $("gtList").innerHTML=table(["Person","Type","Amount","Date","Purpose","Notes","Actions"],rows.sort((a,b)=>String(b.Date).localeCompare(String(a.Date))).map(x=>`<tr><td>${esc(x.Person)}</td><td>${esc(x.Type)}</td><td>${money(x.Amount)}</td><td>${esc(x.Date)}</td><td>${esc(x.Purpose)}</td><td>${esc(x.Notes)}</td><td>${actionBtns("transactions",x.ID)}</td></tr>`));
}
async function addGive(){const data={Person:val("gtPerson"),Type:val("gtType"),Amount:num(val("gtAmount")),Date:val("gtDate")||today(),Purpose:val("gtPurpose"),Notes:val("gtNotes")};if(!data.Person||data.Amount<=0)return toast("Enter person and amount");try{await save("transactions",data);["gtPerson","gtAmount","gtPurpose","gtNotes"].forEach(id=>$(id).value="");renderAll();toast("Saved")}catch(e){toast(e.message)}}

function groupMembers(g){return String(g?.Members||"").split(",").map(s=>s.trim()).filter(Boolean)}
function selectedGroup(){return arr("splitGroups").find(x=>String(x.ID)===String(val("spGroupSel")))}
function refreshGroupUI(){
  const g=selectedGroup(),members=groupMembers(g);
  $("memberChips").innerHTML=members.map(m=>`<span class="chip">${esc(m)}</span>`).join("");
  opt($("spPaidBy"),members,x=>x,x=>"","Paid by");
  [...($("spPaidBy")?.options||[])].forEach((o,i)=>{if(i>0)o.textContent=o.value});
}
function addGroup(){const name=val("spGroup"),members=val("spMembers");if(!name)return toast("Enter group name");save("splitGroups",{"Group Name":name,Category:val("spCat"),Members:members}).then(()=>{ $("spGroup").value="";renderAll();toast("Group created")}).catch(e=>toast(e.message))}
async function addMember(){const g=selectedGroup(),m=val("newMember").trim();if(!g||!m)return toast("Select group and enter member");const ms=groupMembers(g);if(!ms.includes(m))ms.push(m);try{await save("splitGroups",{...g,Members:ms.join(", ")});$("newMember").value="";renderAll();$("spGroupSel").value=g.ID;refreshGroupUI();toast("Member added")}catch(e){toast(e.message)}}
async function renameGroup(){const g=selectedGroup(),n=prompt("New group name",g?.["Group Name"]||"");if(!g||!n)return;try{await save("splitGroups",{...g,"Group Name":n});renderAll();toast("Group renamed")}catch(e){toast(e.message)}}
function clearSplit(){["splitEditId","spTitle","spAmount","spMembersSel"].forEach(id=>{if($(id))$(id).value=""});if($("spDate"))$("spDate").value=today();$("customShares").innerHTML=""}
async function saveSplitExpense(){
  const g=val("spGroupExpense"),title=val("spTitle"),amount=num(val("spAmount")),paid=val("spPaidBy"),date=val("spDate")||today(),type=val("spSplitType");
  if(!g||!title||amount<=0||!paid)return toast("Select group, payer and enter amount");
  const group=arr("splitGroups").find(x=>String(x.ID)===String(g)),members=groupMembers(group);
  const participants=val("spMembersSel")?val("spMembersSel").split(",").map(x=>x.trim()).filter(Boolean):members;
  const shares={}; if(type==="equal"){const each=amount/(participants.length||1);participants.forEach(m=>shares[m]=Number(each.toFixed(2)))}else{
    document.querySelectorAll("#customShares input[data-member]").forEach(e=>shares[e.dataset.member]=num(e.value));
  }
  const data={"Group ID":g,Title:title,Amount:amount,"Paid By":paid,Date:date,"Split Type":type,Participants:participants.join(", "),"Shares":JSON.stringify(shares)};
  try{if(val("splitEditId"))data.ID=val("splitEditId");await save("splitExpenses",data);clearSplit();renderAll();toast("Expense saved")}catch(e){toast(e.message)}
}
function renderSplitter(){
  const g=selectedGroup();refreshGroupUI();
  const expenses=arr("splitExpenses").filter(x=>!g||String(x["Group ID"])===String(g.ID));
  $("splitSummary").innerHTML=card("Expenses",expenses.length)+card("Total",expenses.reduce((s,x)=>s+num(x.Amount),0));
  $("splitExpenseList").innerHTML=table(["Date","Title","Amount","Paid By","Participants","Actions"],expenses.sort((a,b)=>String(b.Date).localeCompare(String(a.Date))).map(x=>`<tr><td>${esc(x.Date)}</td><td>${esc(x.Title)}</td><td>${money(x.Amount)}</td><td>${esc(x["Paid By"])}</td><td>${esc(x.Participants)}</td><td>${actionBtns("splitExpenses",x.ID)}</td></tr>`));
  $("splitList").innerHTML=table(["Group","Category","Members","Actions"],arr("splitGroups").map(x=>`<tr><td>${esc(x["Group Name"])}</td><td>${esc(x.Category)}</td><td>${esc(x.Members)}</td><td>${actionBtns("splitGroups",x.ID)}</td></tr>`));
  $("settlementList").innerHTML="<div class='listbox muted'>Settlement calculation is based on the selected group's recorded expenses.</div>";
  $("splitSettlementHistory").innerHTML=table(["Date","Group","From","To","Amount"],arr("splitSettlements").map(x=>`<tr><td>${esc(x.Date)}</td><td>${esc(x["Group ID"])}</td><td>${esc(x.From)}</td><td>${esc(x.To)}</td><td>${money(x.Amount)}</td></tr>`));
}
function addAsset(){}
function renderInvestments(){
  const baskets=arr("baskets"),assets=arr("assets");
  const total=assets.reduce((s,x)=>s+num(x["Monthly Amount"]||x.Amount),0);
  $("investmentDash").innerHTML=card("Baskets",baskets.length)+card("Monthly SIP",total)+card("Assets",assets.length);
  $("basketList").innerHTML=table(["Basket","Person","Asset","Type","Monthly Amount","Actions"],assets.map(x=>`<tr><td>${esc(baskets.find(b=>String(b.ID)===String(x["Basket ID"]))?.["Basket Name"])}</td><td>${esc(x.Person)}</td><td>${esc(x["Asset Name"]||x.Name)}</td><td>${esc(x.Type)}</td><td>${money(x["Monthly Amount"]||x.Amount)}</td><td>${actionBtns("assets",x.ID)}</td></tr>`));
}
async function addBasket(){const data={"Person":val("sipPerson"),"Basket Name":val("sipBasket")};if(!data["Basket Name"])return toast("Enter basket name");try{await save("baskets",data);$("sipBasket").value="";renderAll();toast("Basket created")}catch(e){toast(e.message)}}
async function addAsset(){const data={"Basket ID":val("assetBasket"),"Asset Name":val("assetName"),Type:val("assetType"),"Monthly Amount":num(val("assetAmount"))};if(!data["Basket ID"]||!data["Asset Name"]||data["Monthly Amount"]<=0)return toast("Complete asset details");try{await save("assets",data);["assetName","assetAmount"].forEach(id=>$(id).value="");renderAll();toast("Asset added")}catch(e){toast(e.message)}}

function lastFuel(id){return arr("fuel").filter(x=>String(x["Vehicle ID"])===String(id)).sort((a,b)=>num(b.Odometer)-num(a.Odometer)||String(b.Date).localeCompare(String(a.Date)))[0]||null}
function latestOdo(id){return num(lastFuel(id)?.Odometer)}
function updateFuelPreviousOdometer(){const o=latestOdo(val("fuelVehicle"));if($("fuelLastOdo"))$("fuelLastOdo").value=o||"";if($("fuelOdo"))$("fuelOdo").value="";if($("fuelDistance"))$("fuelDistance").value=""}
function calculateFuelDistance(){const p=num(val("fuelLastOdo")),c=num(val("fuelOdo"));if(!p||!c){$("fuelDistance").value="";return}if(c<=p){$("fuelDistance").value="";toast("Current odometer must be greater than previous");return}$("fuelDistance").value=c-p}
function vehicleFiltered(){let v=arr("vehicles");const t=val("vehicleTypeFilter"),id=val("vehicleFilter");if(t)v=v.filter(x=>x["Vehicle Type"]===t);if(id)v=v.filter(x=>String(x.ID)===String(id));return v}
async function addVehicle(){const name=val("vehicleName"),type=val("vehicleType");if(!name)return toast("Enter vehicle name");try{await save("vehicles",{"Vehicle Name":name,"Vehicle Type":type,"Number Plate":val("vehiclePlate")});$("vehicleName").value="";$("vehiclePlate").value="";renderAll();toast("Vehicle saved")}catch(e){toast(e.message)}}
async function addFuel(){
  const vehicle=val("fuelVehicle"),amount=num(val("fuelAmount")),qty=num(val("fuelQty")),odo=num(val("fuelOdo")),prev=num(val("fuelLastOdo")),account=val("fuelAccount");
  if(!vehicle||amount<=0||qty<=0||odo<=0||!account)return toast("Complete vehicle, amount, litres, odometer and payment mode");
  if(prev&&odo<=prev)return toast("Current odometer must be greater than previous");
  try{
    const f=await save("fuel",{"Vehicle ID":vehicle,Date:val("fuelDate")||today(),Odometer:odo,Quantity:qty,Amount:amount,"Fuel Type":val("fuelType"),Notes:val("fuelNotes"),"Passbook ID":""});
    const p=await save("passbook",{Date:f.Date,Type:"Expense",Category:"Petrol / Fuel",Amount:amount,Account:account,Remarks:`${vehicleName(vehicle)} • ${f["Fuel Type"]||"Fuel"}${prev?` • ${odo-prev} km`:""}`,"Source ID":f.ID});
    await save("fuel",{...f,"Passbook ID":p.ID});
    ["fuelOdo","fuelLastOdo","fuelDistance","fuelQty","fuelAmount","fuelNotes"].forEach(id=>$(id).value="");
    renderAll();toast("✓ Fuel saved + added to Passbook");
  }catch(e){toast(e.message)}
}
async function addMaintenance(){
  const vehicle=val("maintVehicle"),amount=num(val("maintAmount")),account=val("maintAccountSelect");if(!vehicle||amount<=0||!account)return toast("Complete vehicle, amount and payment mode");
  try{
    const m=await save("maintenance",{"Vehicle ID":vehicle,Date:val("maintDate")||today(),Category:val("maintCategory"),Amount:amount,Odometer:num(val("maintOdo")),"Next Target KM":num(val("maintTargetKm")),Remarks:val("maintRemarks"),"Passbook ID":""});
    const p=await save("passbook",{Date:m.Date,Type:"Expense",Category:"Vehicle Maintenance",Amount:amount,Account:account,Remarks:`${vehicleName(vehicle)} • ${m.Category||"Service"}`,"Source ID":m.ID});
    await save("maintenance",{...m,"Passbook ID":p.ID});
    ["maintAmount","maintOdo","maintTargetKm","maintRemarks"].forEach(id=>$(id).value="");
    renderAll();toast("✓ Maintenance saved + added to Passbook");
  }catch(e){toast(e.message)}
}
function calculateFuelAverageKM(id){
  const rows=arr("fuel").filter(x=>String(x["Vehicle ID"])===String(id)).sort((a,b)=>num(a.Odometer)-num(b.Odometer));if(rows.length<2)return 0;
  let d=0,q=0;for(let i=1;i<rows.length;i++){d+=Math.max(0,num(rows[i].Odometer)-num(rows[i-1].Odometer));q+=num(rows[i].Quantity)}return q?d/q:0;
}
function renderVehicles(){
  const vehicles=vehicleFiltered(),fuel=arr("fuel"),maint=arr("maintenance");
  $("vehicleDash").innerHTML=card("Vehicles",vehicles.length)+card("Fuel Spend",fuel.reduce((s,x)=>s+num(x.Amount),0))+card("Maintenance Spend",maint.reduce((s,x)=>s+num(x.Amount),0));
  $("vehiclePerformanceDashboard").innerHTML=vehicles.map(v=>`<div class="card"><small>${esc(v["Vehicle Name"])} • ${esc(v["Vehicle Type"])}</small><b>${calculateFuelAverageKM(v.ID)?calculateFuelAverageKM(v.ID).toFixed(2)+" km/L":"—"}</b><div class="muted">Average fuel economy</div></div>`).join("")||`<div class="listbox muted">Add a vehicle to start tracking.</div>`;
  $("vehicleMaintenanceSummary").innerHTML=vehicles.map(v=>{const rows=maint.filter(x=>String(x["Vehicle ID"])===String(v.ID));const last=rows.sort((a,b)=>String(b.Date).localeCompare(String(a.Date)))[0];return `<div class="card"><small>${esc(v["Vehicle Name"])}</small><b>${money(rows.reduce((s,x)=>s+num(x.Amount),0))}</b><div class="muted">Last: ${esc(last?.Category||"No service")}${last?.["Next Target KM"]?" • Next "+esc(last["Next Target KM"]):""}</div></div>`}).join("");
  const vf=fuel.filter(x=>vehicles.some(v=>String(v.ID)===String(x["Vehicle ID"]))).sort((a,b)=>String(b.Date).localeCompare(String(a.Date))).slice(0,5);
  const vm=maint.filter(x=>vehicles.some(v=>String(v.ID)===String(x["Vehicle ID"]))).sort((a,b)=>String(b.Date).localeCompare(String(a.Date))).slice(0,5);
  $("fuelList").innerHTML=table(["Date","Vehicle","KM","Litres","Amount","Type","Actions"],vf.map(x=>`<tr><td>${esc(x.Date)}</td><td>${esc(vehicleName(x["Vehicle ID"]))}</td><td>${esc(x.Odometer)}</td><td>${esc(x.Quantity)}</td><td>${money(x.Amount)}</td><td>${esc(x["Fuel Type"])}</td><td>${actionBtns("fuel",x.ID)}</td></tr>`));
  $("maintenanceList").innerHTML=table(["Date","Vehicle","Category","KM","Amount","Next KM","Actions"],vm.map(x=>`<tr><td>${esc(x.Date)}</td><td>${esc(vehicleName(x["Vehicle ID"]))}</td><td>${esc(x.Category)}</td><td>${esc(x.Odometer)}</td><td>${money(x.Amount)}</td><td>${esc(x["Next Target KM"])}</td><td>${actionBtns("maintenance",x.ID)}</td></tr>`));
  const labels=vehicles.map(v=>v["Vehicle Name"]),fc=vehicles.map(v=>fuel.filter(x=>String(x["Vehicle ID"])===String(v.ID)).reduce((s,x)=>s+num(x.Amount),0)),mc=vehicles.map(v=>maint.filter(x=>String(x["Vehicle ID"])===String(v.ID)).reduce((s,x)=>s+num(x.Amount),0));
  drawChart("fuelChart","bar",labels,fc,"Fuel Cost");drawChart("maintenanceChart","bar",labels,mc,"Maintenance Cost");
}
function resetVehicleFilters(){if($("vehicleTypeFilter"))$("vehicleTypeFilter").value="";if($("vehicleFilter"))$("vehicleFilter").value="";renderVehicles()}

function drawChart(id,type,labels,data,label){
  const c=$(id);if(!c||typeof Chart==="undefined")return;
  if(charts[id])charts[id].destroy();
  charts[id]=new Chart(c,{type,data:{labels,datasets:[{label,data}]},options:{responsive:true,maintainAspectRatio:false}});
}

function renderAll(){
  fillLists();
  renderDashboard();renderPassbook();renderSalary();renderLoans();renderGive();renderSplitter();renderInvestments();renderVehicles();
}

function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  const target=$(page);if(target)target.classList.add("active");
  document.querySelectorAll("#sidebar button[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  $("sidebar")?.classList.remove("open");
  if(page==="splitter")refreshGroupUI();
}

function setup(){
  $("dashMonth").value=monthNow();$("salMonth").value=monthNow();$("emiMonth").value=monthNow();
  ["pbDate","gtDate","spDate","fuelDate","maintDate"].forEach(id=>{if($(id))$(id).value=today()});
  document.querySelectorAll("#sidebar button[data-page]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
  $("menuBtn")?.addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  $("themeBtn")?.addEventListener("click",()=>{document.body.classList.toggle("dark");const d=document.body.classList.contains("dark");localStorage.setItem("financeTheme",d?"dark":"light");$("themeBtn").textContent=d?"☀️ Light":"🌙 Dark"});
  if(localStorage.getItem("financeTheme")==="dark"){document.body.classList.add("dark");$("themeBtn").textContent="☀️ Light"}
  $("dashMonth")?.addEventListener("change",renderDashboard);$("dashCategory")?.addEventListener("change",renderDashboard);
  $("pbFilterMonth")?.addEventListener("change",renderPassbook);$("pbFilterCategory")?.addEventListener("change",renderPassbook);
  $("fuelVehicle")?.addEventListener("change",updateFuelPreviousOdometer);$("fuelOdo")?.addEventListener("input",calculateFuelDistance);
  $("vehicleTypeFilter")?.addEventListener("change",()=>{const t=val("vehicleTypeFilter");const vs=t?arr("vehicles").filter(v=>v["Vehicle Type"]===t):arr("vehicles");opt($("vehicleFilter"),vs,x=>x.ID,x=>x["Vehicle Name"],"All Vehicles");renderVehicles()});
  $("vehicleFilter")?.addEventListener("change",renderVehicles);
  $("spGroupSel")?.addEventListener("change",()=>{refreshGroupUI();renderSplitter()});
  $("spGroupExpense")?.addEventListener("change",()=>{const g=arr("splitGroups").find(x=>String(x.ID)===String(val("spGroupExpense")));if(g){opt($("spPaidBy"),groupMembers(g),x=>x,x=>"","Paid by");[...$("spPaidBy").options].forEach((o,i)=>{if(i>0)o.textContent=o.value})}});
  showPage("dashboard");setStatus("☁️ Connecting...");loadAll();
}

window.addEventListener("DOMContentLoaded",setup);
