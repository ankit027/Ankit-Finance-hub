const API_URL="https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";
const KEY="ankit_finance_hub_final_v4";
let DB={},charts={};

const $=x=>document.getElementById(x);
const uid=()=>Date.now()+"-"+Math.random().toString(36).slice(2);
const n=x=>Number(x||0)||0;
const m=x=>"₹"+n(x).toLocaleString("en-IN",{maximumFractionDigits:2});
const ym=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`};
const monthKey=v=>{const s=String(v||"").trim();const m=s.match(/^(\d{4})[-/](\d{1,2})/);if(m)return `${m[1]}-${String(Number(m[2])).padStart(2,"0")}`;const d=new Date(s);return Number.isNaN(d.getTime())?"":`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`};
const today=()=>new Date().toISOString().slice(0,10);

window.addEventListener("unhandledrejection",e=>{console.error(e.reason);toast("⚠️ "+(e.reason?.message||"Something went wrong"))});

/* ---------- API ---------- */
async function api(action,payload={},tries=2){
  for(let a=1;a<=tries;a++){
    const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),45000);
    try{
      const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...payload}),signal:ctl.signal,redirect:"follow"});
      const t=await r.text();let d;
      try{d=JSON.parse(t)}catch(e){throw Error("Server returned a web page, not data. Redeploy the Apps Script as a new version (Execute as Me, Access Anyone).")}
      if(!d.success)throw Error(d.error||"Server error");
      return d;
    }catch(e){
      if(e.name==="AbortError")e=Error("Request timed out");
      if(a===tries||/Server returned|Invalid table/.test(e.message))throw e;
      await new Promise(r=>setTimeout(r,1200*a));
    }finally{clearTimeout(to)}
  }
}

function toast(x){$("toast").textContent=x;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2400)}
function status(x){$("status").textContent=x}
function cache(){try{localStorage.setItem(KEY,JSON.stringify(DB))}catch(e){}}

let loading=false;
async function loadAll(){
  if(loading)return;loading=true;let ok=false;
  try{
    status("☁️ Syncing...");
    DB=(await api("loadAll")).data||{};
    ["salary","passbook","transactions","emi","loans","vehicles","fuel","maintenance"].forEach(k=>{if(!Array.isArray(DB[k]))DB[k]=[]});
    cache();render();status("☁️ Synced");ok=true;
  }catch(e){status("⚠️ Sync failed");toast(e.message)}
  finally{loading=false}
  if(ok)reconcileSalaryPassbook().then(c=>{if(c){cache();render()}}).catch(e=>console.warn("Salary reconcile skipped:",e.message));
}
async function save(table,data){
  const before=JSON.parse(JSON.stringify(DB[table]||[]));
  DB[table]=DB[table]||[];
  const i=DB[table].findIndex(z=>String(z.ID)===String(data.ID));
  if(i<0)DB[table].push({...data});else DB[table][i]={...DB[table][i],...data};
  cache();render();status("💾 Saved • syncing...");toast("✓ Saved successfully");
  try{
    const r=await api("save",{table,data});
    const x=(r.data&&r.data.record)||r.record||data;
    const j=DB[table].findIndex(z=>String(z.ID)===String(x.ID));
    if(j<0)DB[table].push(x);else DB[table][j]=x;
    cache();render();status("☁️ Synced");
    return x;
  }catch(e){
    DB[table]=before;cache();render();status("⚠️ Sync failed");toast("Save failed: "+e.message);throw e;
  }
}
async function del(table,id){
  if(!confirm("Delete this record?"))return;
  await api("delete",{table,id});
  DB[table]=(DB[table]||[]).filter(x=>String(x.ID)!==String(id));

  /* remove linked Passbook rows */
  let linked=[];
  if(table==="salary")linked=(DB.passbook||[]).filter(x=>String(x["Source ID"]||"")===`salary:${id}`||String(x.ID)===`salary-${id}`);
  if(table==="fuel"||table==="maintenance")linked=(DB.passbook||[]).filter(x=>String(x.ID)===`${table}-${id}`);
  for(const x of linked){await api("delete",{table:"passbook",id:x.ID})}
  if(linked.length)DB.passbook=(DB.passbook||[]).filter(x=>!linked.some(z=>String(z.ID)===String(x.ID)));

  /* remove EMI rows of a deleted loan */
  if(table==="loans"){
    const emis=(DB.emi||[]).filter(x=>String(x["Loan ID"])===String(id));
    for(const x of emis){await api("delete",{table:"emi",id:x.ID})}
    DB.emi=(DB.emi||[]).filter(x=>String(x["Loan ID"])!==String(id));
  }
  cache();render();toast("Deleted");
}

/* ---------- Navigation + theme ---------- */
document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("[data-page]").forEach(x=>x.classList.toggle("active",x===b));
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $(b.dataset.page).classList.add("active");$("sidebar").classList.remove("open");
});
$("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");
const setTheme=d=>{document.body.classList.toggle("dark",d);$("themeBtn").textContent=d?"☀️ Light":"🌙 Dark";try{localStorage.setItem("afh_theme",d?"dark":"light")}catch(e){}};
$("themeBtn").onclick=()=>{setTheme(!document.body.classList.contains("dark"));draw()};
try{setTheme(localStorage.getItem("afh_theme")==="dark")}catch(e){}

/* ---------- UI helpers ---------- */
function card(a,b){return `<div><small>${a}</small><b>${b}</b></div>`}
function item(a,b,c=""){return `<div class="item"><span>${a}</span><span>${b} ${c}</span></div>`}
const PAL=["#0f766e","#f59e0b","#6366f1","#ef4444","#22c55e","#06b6d4","#a855f7"];
function chart(id,type,labels,data,label){
  if(!$(id))return;
  if(charts[id])charts[id].destroy();
  const dark=document.body.classList.contains("dark"),txt=dark?"#8da39a":"#64726b",grid=dark?"#1f3029":"#e8ece6",pie=type==="doughnut";
  charts[id]=new Chart($(id),{type,data:{labels,datasets:[{label,data,
    backgroundColor:type==="line"?"rgba(15,118,110,.12)":labels.map((_,i)=>PAL[i%PAL.length]),
    borderColor:PAL[0],borderWidth:type==="line"?2.5:0,borderRadius:type==="bar"?8:0,fill:type==="line",tension:.35}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:pie,labels:{color:txt}}},
      scales:pie?{}:{x:{ticks:{color:txt},grid:{display:false}},y:{ticks:{color:txt},grid:{color:grid}}}}});
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function render(){lists();syncDashboardFilters();syncVehicleFilters();dash();passbook();salary();loans();give();vehicles();draw()}

/* ---------- Filters ---------- */
function syncDashboardFilters(){
  const cats=[...new Set((DB.passbook||[]).map(x=>String(x.Category||"").trim()).filter(Boolean))].sort();
  ["dashCategory","pbFilterCategory"].forEach(id=>{
    const el=$(id);if(!el)return;const prev=el.value;
    el.innerHTML='<option value="">All Categories</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
    if(cats.includes(prev))el.value=prev;
  });
  if(!$("dashMonth").value)$("dashMonth").value=ym();
  if(!$("pbFilterMonth").value)$("pbFilterMonth").value=ym();
}
function resetDashFilters(){$("dashMonth").value=ym();$("dashCategory").value="";render()}
function resetPassbookFilters(){$("pbFilterMonth").value=ym();$("pbFilterCategory").value="";render()}
function dashFilter(){return {month:$("dashMonth")?.value||ym(),category:$("dashCategory")?.value||""}}
function pbFilter(){return {month:$("pbFilterMonth")?.value||ym(),category:$("pbFilterCategory")?.value||""}}
function filterPassbook(rows,month,category){return rows.filter(x=>(!month||String(x.Date||"").slice(0,7)===month)&&(!category||String(x.Category||"")===category))}

/* ---------- Dashboard ---------- */
function dash(){
  const f=dashFilter(),y=f.month,p=filterPassbook(DB.passbook||[],y,f.category),s=DB.salary||[],e=DB.emi||[];
  const otherIncome=p.filter(x=>String(x.Type||"").toLowerCase()==="income"&&String(x.Category||"").toLowerCase()!=="salary").reduce((a,x)=>a+n(x.Amount),0);
  const exp=p.filter(x=>String(x.Type||"").toLowerCase()==="expense").reduce((a,x)=>a+n(x.Amount),0);
  const sal=(!f.category||String(f.category).toLowerCase()==="salary")?s.filter(x=>monthKey(x.Month)===y).reduce((a,x)=>a+n(x.Amount),0):0;
  const totalIncome=sal+otherIncome;
  const emi=e.filter(x=>monthKey(x.Month)===y).reduce((a,x)=>a+n(x.Amount),0);
  const b=Object.values(giveBal()),rec=b.reduce((a,x)=>a+x.toReceive,0),owe=b.reduce((a,x)=>a+x.toPay,0);
  $("dash").innerHTML=[["💰 Salary",m(sal)],["📈 Total Income",m(totalIncome)],["💸 Expense",m(exp)],["🏦 EMI Paid",m(emi)],["🤝 To Receive",m(rec)],["🤝 To Pay",m(owe)],["⚖️ Net Outstanding",m(rec-owe)],["💳 Net Cash Flow",m(totalIncome-exp-emi)]].map(x=>card(...x)).join("");
}

/* ---------- Passbook ---------- */
function passbook(){
  const f=pbFilter(),p=filterPassbook(DB.passbook||[],f.month,f.category);
  const i=p.filter(x=>String(x.Type||"").toLowerCase()==="income").reduce((a,x)=>a+n(x.Amount),0);
  const e=p.filter(x=>String(x.Type||"").toLowerCase()==="expense").reduce((a,x)=>a+n(x.Amount),0);
  $("passbookDash").innerHTML=[["Income",m(i)],["Expense",m(e)],["Net",m(i-e)],["Entries",p.length]].map(x=>card(...x)).join("");
  $("pbList").innerHTML=p.slice().reverse().map(x=>item(
    `${esc(x.Date)} • <b>${esc(x.Category)}</b> • ${esc(x.Type)}`,
    m(x.Amount),
    `<button class="secondary" onclick="editPassbook('${x.ID}')">Edit</button> <button class="danger" onclick="del('passbook','${x.ID}')">Delete</button>`
  )).join("")||"<p>No records for selected filter</p>";
}
function clearPassbook(){
  $("pbEditId").value="";$("pbDate").value=today();$("pbType").value="Expense";
  $("pbCat").value="";$("pbAmt").value="";$("pbAccount").value="";$("pbRemarks").value="";
  $("pbSaveBtn").textContent="Save";
}
function editPassbook(id){
  const x=(DB.passbook||[]).find(z=>String(z.ID)===String(id));if(!x)return;
  $("pbEditId").value=x.ID;$("pbDate").value=String(x.Date||"").slice(0,10);
  $("pbType").value=x.Type||"Expense";$("pbCat").value=x.Category||"";$("pbAmt").value=x.Amount||"";
  $("pbAccount").value=x.Account||"";$("pbRemarks").value=x.Remarks||"";$("pbSaveBtn").textContent="Update";
  document.querySelector('[data-page="passbook"]').click();window.scrollTo({top:0,behavior:"smooth"});
}
async function addPassbook(){
  const amount=n($("pbAmt").value);if(amount<=0)return toast("Enter valid amount");
  await save("passbook",{ID:$("pbEditId").value||uid(),Date:$("pbDate").value||today(),Type:$("pbType").value,Category:$("pbCat").value,Amount:amount,Account:$("pbAccount").value,Remarks:$("pbRemarks").value});
  clearPassbook();
}

/* ---------- Salary ---------- */
function salaryPassbookRecord(x){
  const mk=monthKey(x.Month)||ym();
  return {
    ID:`salary-${x.ID}`,
    Date:`${mk}-01`,
    Type:"Income",
    Category:"Salary",
    Amount:n(x.Amount),
    Account:"Salary",
    Remarks:[x.Company,x.Remarks].filter(Boolean).join(" • "),
    "Source ID":`salary:${x.ID}`
  };
}
async function reconcileSalaryPassbook(){
  DB.passbook=DB.passbook||[];let changed=false;
  for(const sal of (DB.salary||[])){
    const data=salaryPassbookRecord(sal);
    const ex=DB.passbook.find(p=>String(p["Source ID"]||"")===data["Source ID"]||String(p.ID)===data.ID);
    const same=ex&&String(ex.Date||"").slice(0,10)===data.Date&&n(ex.Amount)===data.Amount&&String(ex.Remarks||"")===data.Remarks&&String(ex["Source ID"]||"")===data["Source ID"];
    if(same)continue;
    try{
      const saved=await api("save",{table:"passbook",data:ex?{...ex,...data,ID:ex.ID}:data});
      const rec=saved.data?.record||data,i=DB.passbook.findIndex(p=>String(p.ID)===String(rec.ID));
      if(i>=0)DB.passbook[i]=rec;else DB.passbook.push(rec);
      changed=true;
    }catch(e){console.warn("Salary sync stopped:",e.message);break}
  }
  return changed;
}
function salary(){
  const s=DB.salary||[],y=ym();
  if($("salMonth")&&!$("salMonth").value)$("salMonth").value=y;
  const cur=s.filter(x=>monthKey(x.Month)===y).reduce((a,x)=>a+n(x.Amount),0),tot=s.reduce((a,x)=>a+n(x.Amount),0);
  $("salaryDash").innerHTML=[["This Month",m(cur)],["Total Recorded",m(tot)],["Salary Entries",s.length],["Companies",new Set(s.map(x=>String(x.Company||"").trim()).filter(Boolean)).size]].map(x=>card(...x)).join("");
  $("salaryList").innerHTML=s.slice().sort((a,b)=>monthKey(b.Month).localeCompare(monthKey(a.Month))).map(x=>item(`${esc(monthKey(x.Month)||x.Month)} • ${esc(x.Company)}`,m(x.Amount),`<button class="danger" onclick="del('salary','${x.ID}')">Delete</button>`)).join("")||"<p>No salary records</p>";
}
async function addSalary(){
  if(n($("salAmount").value)<=0)return toast("Enter valid salary amount");
  const rec=await save("salary",{ID:uid(),Month:$("salMonth").value||ym(),Company:$("salCompany").value,Amount:n($("salAmount").value),Remarks:$("salRemarks").value});
  await save("passbook",salaryPassbookRecord(rec));
  $("salCompany").value="";$("salAmount").value="";$("salRemarks").value="";
  render();toast("✓ Salary saved and added to Passbook as Income");
}

/* ---------- Loans & EMI ---------- */
function loans(){
  const l=DB.loans||[],e=DB.emi||[],y=ym(),init=l.reduce((a,x)=>a+n(x["Initial Amount"]),0),paid=e.reduce((a,x)=>a+n(x.Amount),0),month=e.filter(x=>monthKey(x.Month)===y).reduce((a,x)=>a+n(x.Amount),0);
  $("loanDash").innerHTML=[["Initial Loans",m(init)],["EMI This Month",m(month)],["Total EMI Paid",m(paid)],["Loans",l.length]].map(x=>card(...x)).join("");
  const prev=$("emiLoan").value;
  $("emiLoan").innerHTML=`<option value="">Select loan</option>`+l.map(x=>`<option value="${x.ID}">${esc(x["Loan Name"])}</option>`).join("");
  if(l.some(x=>x.ID===prev))$("emiLoan").value=prev;
  $("loanList").innerHTML=l.map(x=>{const p=e.filter(z=>z["Loan ID"]===x.ID).reduce((a,z)=>a+n(z.Amount),0);return item(`<b>${esc(x["Loan Name"])}</b><br><small>Initial ${m(x["Initial Amount"])} • Paid ${m(p)} • Remaining ${m(Math.max(0,n(x["Initial Amount"])-p))}</small>`,"",`<button class="danger" onclick="del('loans','${x.ID}')">Delete</button>`)}).join("")||"<p>No loans</p>";
}
async function addLoan(){
  if(!$("loanName").value.trim()||n($("loanInitial").value)<=0)return toast("Enter loan name and amount");
  await save("loans",{ID:uid(),"Loan Name":$("loanName").value,"Initial Amount":n($("loanInitial").value),Remarks:$("loanRemarks").value});
  $("loanName").value="";$("loanInitial").value="";$("loanRemarks").value="";
}
async function addEmi(){
  if(!$("emiLoan").value)return toast("Select loan");
  if(n($("emiAmount").value)<=0)return toast("Enter valid EMI amount");
  await save("emi",{ID:uid(),"Loan ID":$("emiLoan").value,Month:$("emiMonth").value||ym(),Amount:n($("emiAmount").value),Remarks:$("emiRemarks").value});
  $("emiAmount").value="";$("emiRemarks").value="";
}

/* ---------- Give & Take ---------- */
function giveBal(){
  const o={};
  (DB.transactions||[]).forEach(x=>{
    const p=String(x.Person||"Unknown").trim();
    if(!o[p])o[p]={person:p,toPay:0,toReceive:0,given:0,received:0,paid:0,taken:0,balance:0};
    const a=n(x.Amount),z=o[p],t=String(x.Type||"").toLowerCase().trim();
    if(t==="give")z.given+=a;
    else if(t==="pay")z.paid+=a;
    else if(t==="take")z.taken+=a;
    else if(t==="receive")z.received+=a;
  });
  Object.values(o).forEach(z=>{
    z.toPay=Math.max(0,z.given-z.paid);
    z.toReceive=Math.max(0,z.taken-z.received);
    z.balance=z.toReceive-z.toPay;
  });
  return o;
}
function give(){
  const a=Object.values(giveBal());
  const r=a.reduce((s,x)=>s+x.toReceive,0),p=a.reduce((s,x)=>s+x.toPay,0);
  $("giveDash").innerHTML=[["To Receive",m(r)],["To Pay",m(p)],["Net Outstanding",m(r-p)],["People",a.length]].map(x=>card(...x)).join("");
  $("gtDashboard").innerHTML=a.map(x=>`<div class="item"><b>${esc(x.person)}</b><span>To Pay: ${m(x.toPay)}<br>To Receive: ${m(x.toReceive)}</span></div>`).join("");
  $("gtList").innerHTML=(DB.transactions||[]).slice().reverse().map(x=>item(
    `<b>${esc(x.Person)}</b> • ${esc(x.Type)}<br><small>${esc(x.Date||"")}${x.Purpose?` • Purpose: ${esc(x.Purpose)}`:""}${x.Notes?`<br>Remarks: ${esc(x.Notes)}`:""}</small>`,
    m(x.Amount),`<button class="danger" onclick="del('transactions','${x.ID}')">Delete</button>`
  )).join("")||"<p>No records</p>";
}
async function addGive(){
  if(!$("gtPerson").value.trim()||n($("gtAmount").value)<=0)return toast("Enter person and valid amount");
  await save("transactions",{ID:uid(),Person:$("gtPerson").value,Type:$("gtType").value,Amount:n($("gtAmount").value),Date:$("gtDate").value||today(),Purpose:$("gtPurpose").value,Notes:$("gtNotes").value,Revisions:"[]"});
  $("gtPerson").value="";$("gtAmount").value="";$("gtPurpose").value="";$("gtNotes").value="";
}

/* ---------- Vehicles ---------- */
function vehicleFilterState(){return {type:$("vehicleTypeFilter")?.value||"",id:$("vehicleFilter")?.value||""}}
function syncVehicleFilters(){
  const vs=DB.vehicles||[],typeEl=$("vehicleTypeFilter"),vehEl=$("vehicleFilter");if(!typeEl||!vehEl)return;
  const prevType=typeEl.value,prevId=vehEl.value;
  const filtered=vs.filter(v=>!prevType||v["Vehicle Type"]===prevType);
  vehEl.innerHTML='<option value="">All Vehicles</option>'+filtered.map(v=>`<option value="${v.ID}">${esc(v["Vehicle Name"])} • ${esc(v["Vehicle Type"])}</option>`).join("");
  if(filtered.some(v=>v.ID===prevId))vehEl.value=prevId;
}
function resetVehicleFilters(){$("vehicleTypeFilter").value="";$("vehicleFilter").value="";render()}
function filteredVehicles(){const f=vehicleFilterState();return (DB.vehicles||[]).filter(v=>(!f.type||v["Vehicle Type"]===f.type)&&(!f.id||v.ID===f.id))}
function latestOdoForVehicle(id){
  const rows=(DB.fuel||[]).filter(x=>String(x["Vehicle ID"])===String(id)&&n(x.Odometer)>0).sort((a,b)=>String(a.Date||"").localeCompare(String(b.Date||""))||n(a.Odometer)-n(b.Odometer));
  return rows.length?n(rows[rows.length-1].Odometer):0;
}
function latestMaintenanceForVehicle(id,kind){
  const rows=(DB.maintenance||[]).filter(x=>String(x["Vehicle ID"])===String(id)&&n(x.Odometer)>0&&(!kind||kind(x))).sort((a,b)=>String(a.Date||"").localeCompare(String(b.Date||""))||n(a.Odometer)-n(b.Odometer));
  return rows.length?rows[rows.length-1]:null;
}
function renderMaintenanceSummary(vs){
  const cards=vs.map(v=>{
    const current=latestOdoForVehicle(v.ID);
    const all=(DB.maintenance||[]).filter(x=>String(x["Vehicle ID"])===String(v.ID)&&n(x.Odometer)>0);
    const oil=latestMaintenanceForVehicle(v.ID,x=>["oil change","engine oil"].includes(String(x.Category||"").toLowerCase()));
    const coolant=latestMaintenanceForVehicle(v.ID,x=>String(x.Category||"").toLowerCase().includes("coolant"));
    const service=latestMaintenanceForVehicle(v.ID,x=>String(x.Category||"").toLowerCase()==="service");
    const rows=[{title:"Oil Change",x:oil},{title:"Coolant Change",x:coolant},{title:"Service",x:service}].filter(z=>z.x);
    if(!rows.length&&all.length){
      const last=all.slice().sort((a,b)=>String(b.Date||"").localeCompare(String(a.Date||""))||n(b.Odometer)-n(a.Odometer))[0];
      rows.push({title:last.Category||"Maintenance",x:last});
    }
    const rowHtml=rows.map(({title,x})=>{
      const interval=n(x["Next Target KM"]);
      const target=interval>0?n(x.Odometer)+interval:0;
      const remain=target>0?target-current:0;
      const cls=target<=0?"":remain<0?"km-over":remain<=500?"km-warn":"km-good";
      const remainingText=target<=0?"Not set":!current?"Waiting for first fuel odometer":remain<0?`${Math.abs(remain).toLocaleString("en-IN")} km overdue`:`${remain.toLocaleString("en-IN")} km`;
      return `<div class="maint-row"><span>Last ${esc(title)}</span><b>${esc(String(x.Date||"").slice(0,10))} • ${n(x.Odometer).toLocaleString("en-IN")} km</b></div>
      <div class="maint-row"><span>Service interval</span><b>${interval>0?interval.toLocaleString("en-IN")+" km":"Not entered"}</b></div>
      <div class="maint-row"><span>Next ${esc(title)} Target</span><b>${target>0?target.toLocaleString("en-IN")+" km":"Not set"}</b></div>
      <div class="maint-row"><span>KM Remaining</span><b class="${cls}">${remainingText}</b></div>`;
    }).join("");
    return `<div class="maintenance-card"><h3>${v["Vehicle Type"]==="Bike"?"🏍️":"🚗"} ${esc(v["Vehicle Name"])}</h3><div class="maint-row"><span>Current Odometer (latest fuel entry)</span><b>${current?current.toLocaleString("en-IN")+" km":"No fuel odometer yet"}</b></div>${rowHtml||'<p class="muted">No oil/coolant service entry yet for this vehicle.</p>'}</div>`;
  });
  $("vehicleMaintenanceSummary").innerHTML=cards.join("")||"<p>No vehicle selected.</p>";
}
function previousFuelOdo(vehicleId){return latestOdoForVehicle(vehicleId)}
function updateFuelOdometerFields(){
  const previous=previousFuelOdo($("fuelVehicle").value);
  $("fuelLastOdo").value=previous||"";
  const current=n($("fuelOdo").value);
  $("fuelDistance").value=current>0&&current>=previous?current-previous:"";
}
function vehicles(){
  const vsAll=DB.vehicles||[],vs=filteredVehicles(),ids=new Set(vs.map(v=>v.ID));
  const fuel=(DB.fuel||[]).filter(x=>ids.has(x["Vehicle ID"])),maint=(DB.maintenance||[]).filter(x=>ids.has(x["Vehicle ID"]));
  const prevFuel=$("fuelVehicle").value,prevMaint=$("maintVehicle").value;
  const opts=`<option value="">Select vehicle</option>`+vsAll.map(v=>`<option value="${v.ID}">${esc(v["Vehicle Name"])} • ${esc(v["Vehicle Type"])}</option>`).join("");
  $("fuelVehicle").innerHTML=opts;$("maintVehicle").innerHTML=opts;
  if(vsAll.some(v=>v.ID===prevFuel))$("fuelVehicle").value=prevFuel;
  if(vsAll.some(v=>v.ID===prevMaint))$("maintVehicle").value=prevMaint;
  updateFuelOdometerFields();

  const fuelTotal=fuel.reduce((s,x)=>s+n(x.Amount),0),maintTotal=maint.reduce((s,x)=>s+n(x.Amount),0),month=ym();
  const monthFuel=fuel.filter(x=>String(x.Date||"").slice(0,7)===month).reduce((s,x)=>s+n(x.Amount),0);
  const monthMaint=maint.filter(x=>String(x.Date||"").slice(0,7)===month).reduce((s,x)=>s+n(x.Amount),0);
  $("vehicleDash").innerHTML=[["Vehicles",vs.length],["Fuel This Month",m(monthFuel)],["Maintenance This Month",m(monthMaint)],["Total Fuel",m(fuelTotal)],["Total Maintenance",m(maintTotal)],["Total Vehicle Cost",m(fuelTotal+maintTotal)]].map(x=>card(...x)).join("");
  renderMaintenanceSummary(vs);

  $("fuelList").innerHTML=fuel.slice().sort((a,b)=>String(b.Date).localeCompare(String(a.Date))).map(x=>{
    const v=vsAll.find(z=>z.ID===x["Vehicle ID"]);
    return item(`<b>${esc(v?v["Vehicle Name"]:"Unknown Vehicle")}</b><br><small>${esc(x.Date)} • ${n(x.Odometer)||"-"} km • ${n(x.Quantity)||0} L • ${esc(x["Fuel Type"]||"Fuel")} • ${esc(x.Notes||"")}</small>`,m(x.Amount),`<button class="danger" onclick="del('fuel','${x.ID}')">Delete</button>`);
  }).join("")||"<p>No fuel entries</p>";

  $("maintenanceList").innerHTML=maint.slice().sort((a,b)=>String(b.Date).localeCompare(String(a.Date))).map(x=>{
    const v=vsAll.find(z=>z.ID===x["Vehicle ID"]);
    return item(`<b>${esc(v?v["Vehicle Name"]:"Unknown Vehicle")}</b><br><small>${esc(x.Date)} • ${esc(x.Category)} • ${n(x.Odometer)||"-"} km • Next interval ${n(x["Next Target KM"])||"-"} km • ${esc(x.Remarks||"")}</small>`,m(x.Amount),`<button class="danger" onclick="del('maintenance','${x.ID}')">Delete</button>`);
  }).join("")||"<p>No maintenance entries</p>";
}
async function addVehicle(){
  const name=$("vehicleName").value.trim();if(!name)return toast("Enter vehicle name");
  await save("vehicles",{ID:uid(),"Vehicle Name":name,"Vehicle Type":$("vehicleType").value,"Number Plate":$("vehiclePlate").value.trim()});
  $("vehicleName").value="";$("vehiclePlate").value="";
}
async function addFuel(){
  const vehicle=$("fuelVehicle").value;
  if(!vehicle)return toast("Select vehicle");
  const amount=n($("fuelAmount").value),odometer=n($("fuelOdo").value),quantity=n($("fuelQty").value),account=$("fuelAccount").value.trim();
  if(amount<=0)return toast("Enter valid fuel amount");
  if(odometer<=0)return toast("Enter current odometer reading");
  const previous=previousFuelOdo(vehicle);
  if(previous&&odometer<previous)return toast("Current odometer cannot be lower than previous reading");
  if(!account)return toast("Enter payment mode / account");
  const distance=previous?odometer-previous:0;
  const r=await save("fuel",{ID:uid(),"Vehicle ID":vehicle,Date:$("fuelDate").value||today(),Odometer:odometer,Distance:distance,Quantity:quantity,Amount:amount,"Fuel Type":$("fuelType").value,Account:account,Notes:$("fuelNotes").value});
  await save("passbook",{ID:"fuel-"+r.ID,Date:r.Date,Type:"Expense",Category:"Petrol / Fuel",Amount:amount,Account:account,Remarks:`${(DB.vehicles||[]).find(v=>String(v.ID)===String(r["Vehicle ID"]))?.["Vehicle Name"]||"Vehicle"} • ${r["Fuel Type"]||"Fuel"}${distance?` • ${distance} km`:""}`,"Source ID":r.ID});
  $("fuelOdo").value="";$("fuelLastOdo").value="";$("fuelDistance").value="";$("fuelQty").value="";$("fuelAmount").value="";$("fuelAccount").value="";$("fuelNotes").value="";
  render();toast("✓ Fuel saved and payment added to Passbook");
}
async function addMaintenance(){
  const vehicle=$("maintVehicle").value;
  if(!vehicle)return toast("Select vehicle");
  const amount=n($("maintAmount").value),odometer=n($("maintOdo").value),interval=n($("maintTargetKm").value),account=$("maintAccount").value.trim();
  if(amount<=0)return toast("Enter valid maintenance amount");
  if(odometer<=0)return toast("Enter actual odometer at service");
  if(!account)return toast("Enter payment mode / account");
  const category=$("maintCategory").value;
  if(["Oil Change","Engine Oil","Coolant Change"].includes(category)&&interval<=0)return toast("Enter the distance after which this service should be repeated");
  const r=await save("maintenance",{ID:uid(),"Vehicle ID":vehicle,Date:$("maintDate").value||today(),Category:category,Amount:amount,Odometer:odometer,"Next Target KM":interval,Account:account,Remarks:$("maintRemarks").value});
  await save("passbook",{ID:"maintenance-"+r.ID,Date:r.Date,Type:"Expense",Category:"Vehicle Maintenance",Amount:amount,Account:account,Remarks:`${r.Category} - ${(DB.vehicles||[]).find(v=>String(v.ID)===String(r["Vehicle ID"]))?.["Vehicle Name"]||"Vehicle"}`,"Source ID":r.ID});
  $("maintAmount").value="";$("maintOdo").value="";$("maintTargetKm").value="";$("maintAccount").value="";$("maintRemarks").value="";
  render();toast("✓ Maintenance saved and payment added to Passbook");
}

/* ---------- Suggestion lists ---------- */
function lists(){
  const p=DB.passbook||[],s=DB.salary||[],t=DB.transactions||[];
  const fill=(id,a)=>{const e=$(id);if(e)e.innerHTML=[...new Set(a.filter(Boolean))].map(x=>`<option value="${esc(x)}">`).join("")};
  const accounts=[...new Set(["Cash","UPI","HDFC Bank","Kotak","Jio Payments Bank","Amazon Pay","Paytm","Credit Card",...p.map(x=>x.Account),...(DB.fuel||[]).map(x=>x.Account),...(DB.maintenance||[]).map(x=>x.Account)].filter(Boolean))];
  fill("categoryList",p.map(x=>x.Category));fill("accountList",accounts);fill("remarksList",p.map(x=>x.Remarks));
  fill("companyList",s.map(x=>x.Company));fill("salaryRemarksList",s.map(x=>x.Remarks));fill("personList",t.map(x=>x.Person));fill("vehicleNameList",(DB.vehicles||[]).map(x=>x["Vehicle Name"]));
  fill("purposeList",t.map(x=>x.Purpose));fill("giveNotesList",t.map(x=>x.Notes));fill("fuelNotesList",(DB.fuel||[]).map(x=>x.Notes));fill("maintenanceRemarksList",(DB.maintenance||[]).map(x=>x.Remarks));
  ["fuelAccount","maintAccount"].forEach(id=>{const el=$(id);if(!el)return;const old=el.value;el.innerHTML='<option value="">Select payment mode / account</option>'+accounts.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");if(accounts.includes(old))el.value=old;});
}

/* ---------- Charts ---------- */
function draw(){
  const f=dashFilter(),y=f.month,p=filterPassbook(DB.passbook||[],y,f.category),s=DB.salary||[],e=DB.emi||[],l=DB.loans||[];
  const otherIncome=p.filter(x=>String(x.Type||"").toLowerCase()==="income"&&String(x.Category||"").toLowerCase()!=="salary").reduce((z,x)=>z+n(x.Amount),0);
  const exp=p.filter(x=>String(x.Type||"").toLowerCase()==="expense").reduce((z,x)=>z+n(x.Amount),0);
  const sal=(!f.category||String(f.category).toLowerCase()==="salary")?s.filter(x=>monthKey(x.Month)===y).reduce((z,x)=>z+n(x.Amount),0):0,totalIncome=sal+otherIncome,em=e.filter(x=>monthKey(x.Month)===y).reduce((z,x)=>z+n(x.Amount),0);
  chart("mainChart","bar",["Salary","Other Income","Total Income","Expense","EMI"],[sal,otherIncome,totalIncome,exp,em],"Amount");
  chart("expenseChart","doughnut",["Total Income","Expense"],[totalIncome,exp],"Amount");

  /* Passbook chart follows the Passbook filters and includes all income */
  const pf=pbFilter(),pp=filterPassbook(DB.passbook||[],pf.month,pf.category);
  const pbInc=pp.filter(x=>String(x.Type||"").toLowerCase()==="income").reduce((z,x)=>z+n(x.Amount),0);
  const pbExp=pp.filter(x=>String(x.Type||"").toLowerCase()==="expense").reduce((z,x)=>z+n(x.Amount),0);
  chart("passbookChart","bar",["Income","Expense"],[pbInc,pbExp],"Amount");

  /* Salary chart groups by normalised month */
  const sm={};s.slice().sort((a,b)=>monthKey(a.Month).localeCompare(monthKey(b.Month))).forEach(x=>{const k=monthKey(x.Month)||String(x.Month);sm[k]=(sm[k]||0)+n(x.Amount)});
  chart("salaryChart","line",Object.keys(sm),Object.values(sm),"Salary");

  chart("loanChart","doughnut",["Initial","EMI Paid"],[l.reduce((z,x)=>z+n(x["Initial Amount"]),0),e.reduce((z,x)=>z+n(x.Amount),0)],"Amount");
  const gb=Object.values(giveBal());chart("giveChart","bar",gb.map(x=>x.person),gb.map(x=>Math.abs(x.balance)),"Outstanding");
  const vs=filteredVehicles(),ids=new Set(vs.map(v=>v.ID)),fu=(DB.fuel||[]).filter(x=>ids.has(x["Vehicle ID"])),ma=(DB.maintenance||[]).filter(x=>ids.has(x["Vehicle ID"]));
  chart("fuelChart","bar",vs.map(v=>v["Vehicle Name"]),vs.map(v=>fu.filter(x=>x["Vehicle ID"]===v.ID).reduce((z,x)=>z+n(x.Amount),0)),"Fuel Cost");
  chart("maintenanceChart","bar",vs.map(v=>v["Vehicle Name"]),vs.map(v=>ma.filter(x=>x["Vehicle ID"]===v.ID).reduce((z,x)=>z+n(x.Amount),0)),"Maintenance Cost");
}

/* ---------- Init ---------- */
["dashMonth","dashCategory","pbFilterMonth","pbFilterCategory"].forEach(id=>{const el=$(id);if(el)el.onchange=()=>render()});
if($("fuelVehicle"))$("fuelVehicle").addEventListener("change",updateFuelOdometerFields);
if($("fuelOdo"))$("fuelOdo").addEventListener("input",updateFuelOdometerFields);
if($("vehicleTypeFilter"))$("vehicleTypeFilter").onchange=()=>{syncVehicleFilters();render()};
if($("vehicleFilter"))$("vehicleFilter").onchange=()=>render();

["pbDate","gtDate","fuelDate","maintDate"].forEach(x=>{if($(x))$(x).value=today()});
["salMonth","emiMonth"].forEach(x=>{if($(x))$(x).value=ym()});
document.querySelector('[data-page="dashboard"]')?.classList.add("active");
try{DB=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){DB={}}
if(Object.keys(DB).length){render();status("☁️ Loading...")}
loadAll();
