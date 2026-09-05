const API_URL="https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";
const KEY="ankit_finance_hub_final_v4";
let DB={},charts={};

const $=x=>document.getElementById(x);
const uid=()=>Date.now()+"-"+Math.random().toString(36).slice(2);
const n=x=>Number(x||0)||0;
const m=x=>"₹"+n(x).toLocaleString("en-IN",{maximumFractionDigits:2});
const ym=()=>new Date().toISOString().slice(0,7);
const today=()=>new Date().toISOString().slice(0,10);

window.addEventListener("unhandledrejection",e=>{console.error(e.reason);toast("⚠️ "+(e.reason?.message||"Something went wrong"))});
async function api(action, payload = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: action,
        ...payload
      }),
      signal: controller.signal,
      redirect: "follow"
    });

    const text = await response.text();

    if (!text) {
      throw new Error("Empty response from Google Apps Script");
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Server response:", text);
      throw new Error("Invalid server response");
    }

    if (!data.success) {
      throw new Error(data.error || "Server error");
    }

    return data;

  } catch (err) {

    if (err.name === "AbortError") {
      throw new Error("Sync timeout. Please check internet.");
    }

    throw err;

  } finally {
    clearTimeout(timeout);
  }
}
function toast(x){$("toast").textContent=x;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2200)}
function status(x){$("status").textContent=x}
function cache(){localStorage.setItem(KEY,JSON.stringify(DB))}

async function loadAll(){
  status("☁️ Syncing...");
  // Always render immediately so the dashboard never stays blank while cloud sync is pending.
  render();
  try{
    const data=await api("loadAll");
    DB=data.data||{};
    cache();
    render();
    status("☁️ Synced");
  }catch(e){
    // Keep cached/local UI usable even when Apps Script is unavailable.
    render();
    status("⚠️ Offline / Sync Error");
    toast(e.message||"Could not sync");
  }
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
  cache();render();toast("Deleted");
}

document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $(b.dataset.page).classList.add("active");$("sidebar").classList.remove("open");
});
$("menuBtn").onclick=()=>$("sidebar").classList.toggle("open");
$("themeBtn").onclick=()=>{document.body.classList.toggle("dark");$("themeBtn").textContent=document.body.classList.contains("dark")?"☀️ Light":"🌙 Dark";draw()};

function card(a,b){return `<div><small>${a}</small><b>${b}</b></div>`}
function item(a,b,c=""){return `<div class="item"><span>${a}</span><span>${b} ${c}</span></div>`}
function chart(id,type,labels,data,label){
  if(!$(id))return;
  if(charts[id])charts[id].destroy();
  charts[id]=new Chart($(id),{type,data:{labels,datasets:[{label,data}]},options:{responsive:true,maintainAspectRatio:false}});
}

function render(){lists();syncDashboardFilters();syncVehicleFilters();dash();passbook();salary();loans();give();invest();split();vehicles();draw()}

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
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function dash(){
  const f=dashFilter(),y=f.month,p=filterPassbook(DB.passbook||[],y,f.category),s=DB.salary||[],e=DB.emi||[],pay=DB.sipPayments||[];
  const otherIncome=p.filter(x=>String(x.Type||"").toLowerCase()==="income").reduce((a,x)=>a+n(x.Amount),0);
  const exp=p.filter(x=>String(x.Type||"").toLowerCase()==="expense").reduce((a,x)=>a+n(x.Amount),0);
  const sal=s.filter(x=>x.Month===y).reduce((a,x)=>a+n(x.Amount),0);
  const totalIncome=sal+otherIncome;
  const emi=e.filter(x=>x.Month===y).reduce((a,x)=>a+n(x.Amount),0);
  const sip=pay.filter(x=>x.Month===y).reduce((a,x)=>a+n(x.Amount),0);
  const b=Object.values(giveBal()),rec=b.filter(x=>x.balance>0).reduce((a,x)=>a+x.balance,0),owe=b.filter(x=>x.balance<0).reduce((a,x)=>a-x.balance,0);
  $("dash").innerHTML=[["💰 Salary",m(sal)],["📈 Total Income",m(totalIncome)],["💸 Expense",m(exp)],["🏦 EMI Paid",m(emi)],["📈 SIP Paid",m(sip)],["🤝 To Receive",m(rec)],["🤝 To Pay",m(owe)],["💳 Net",m(totalIncome-exp-emi-sip)]].map(x=>card(...x)).join("");
}

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

function salary(){
  const s=DB.salary||[],y=ym(),cur=s.filter(x=>x.Month===y).reduce((a,x)=>a+n(x.Amount),0),tot=s.reduce((a,x)=>a+n(x.Amount),0);
  $("salaryDash").innerHTML=[["This Month",m(cur)],["Total",m(tot)],["Entries",s.length],["Companies",new Set(s.map(x=>x.Company)).size]].map(x=>card(...x)).join("");
  $("salaryList").innerHTML=s.slice().reverse().map(x=>item(`${esc(x.Month)} • ${esc(x.Company)}`,m(x.Amount),`<button class="danger" onclick="del('salary','${x.ID}')">Delete</button>`)).join("")||"<p>No salary records</p>";
}
async function addSalary(){
  if(n($("salAmount").value)<=0)return toast("Enter valid salary amount");
  await save("salary",{ID:uid(),Month:$("salMonth").value||ym(),Company:$("salCompany").value,Amount:n($("salAmount").value),Remarks:$("salRemarks").value});
  $("salCompany").value="";$("salAmount").value="";$("salRemarks").value="";
}

function loans(){
  const l=DB.loans||[],e=DB.emi||[],y=ym(),init=l.reduce((a,x)=>a+n(x["Initial Amount"]),0),paid=e.reduce((a,x)=>a+n(x.Amount),0),month=e.filter(x=>x.Month===y).reduce((a,x)=>a+n(x.Amount),0);
  $("loanDash").innerHTML=[["Initial Loans",m(init)],["EMI This Month",m(month)],["Total EMI Paid",m(paid)],["Loans",l.length]].map(x=>card(...x)).join("");
  $("emiLoan").innerHTML=`<option value="">Select loan</option>`+l.map(x=>`<option value="${x.ID}">${esc(x["Loan Name"])}</option>`).join("");
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

function giveBal(){
  const o={};(DB.transactions||[]).forEach(x=>{
    const p=x.Person||"Unknown";if(!o[p])o[p]={person:p,balance:0,given:0,received:0,taken:0,paid:0};
    const a=n(x.Amount),z=o[p];
    if(x.Type==="Give"){z.balance+=a;z.given+=a}else if(x.Type==="Receive"){z.balance-=a;z.received+=a}else if(x.Type==="Take"){z.balance-=a;z.taken+=a}else if(x.Type==="Pay"){z.balance+=a;z.paid+=a}
  });return o;
}
function give(){
  const a=Object.values(giveBal()),r=a.filter(x=>x.balance>0).reduce((s,x)=>s+x.balance,0),p=a.filter(x=>x.balance<0).reduce((s,x)=>s-x.balance,0);
  $("giveDash").innerHTML=[["To Receive",m(r)],["To Pay",m(p)],["Net",m(r-p)],["People",a.length]].map(x=>card(...x)).join("");
  $("gtDashboard").innerHTML=a.map(x=>card(`${esc(x.person)} • ${x.balance>0?"To Receive":x.balance<0?"To Pay":"Settled"}`,m(Math.abs(x.balance)))).join("");
  $("gtList").innerHTML=(DB.transactions||[]).slice().reverse().map(x=>item(`<b>${esc(x.Person)}</b> • ${esc(x.Type)}<br><small>${esc(x.Date||"")} • ${esc(x.Purpose||"")}</small>`,m(x.Amount),`<button class="danger" onclick="del('transactions','${x.ID}')">Delete</button>`)).join("")||"<p>No records</p>";
}
async function addGive(){
  if(!$("gtPerson").value.trim()||n($("gtAmount").value)<=0)return toast("Enter person and valid amount");
  await save("transactions",{ID:uid(),Person:$("gtPerson").value,Type:$("gtType").value,Amount:n($("gtAmount").value),Date:$("gtDate").value||today(),Purpose:$("gtPurpose").value,Notes:$("gtNotes").value,Revisions:"[]"});
  $("gtPerson").value="";$("gtAmount").value="";$("gtPurpose").value="";$("gtNotes").value="";
}

const members=g=>{try{return JSON.parse(g["Members JSON"]||"[]")}catch(e){return[]}};
const json=(x,d=[])=>{try{return JSON.parse(x||"")}catch(e){return d}};
function calc(g){
  const st={};members(g).forEach(x=>st[x]={name:x,paid:0,share:0,out:0,in:0,net:0});
  const ex=(DB.splitExpenses||[]).filter(x=>x["Group ID"]===g.ID);
  ex.forEach(e=>{const a=n(e.Amount),payer=e["Paid By"];if(!st[payer])st[payer]={name:payer,paid:0,share:0,out:0,in:0,net:0};st[payer].paid+=a;let ps=json(e["Members JSON"],[]);if(!ps.length)ps=members(g);const cs=json(e["Custom Shares JSON"],null);ps.forEach(x=>{if(!st[x])st[x]={name:x,paid:0,share:0,out:0,in:0,net:0};st[x].share+=cs?n(cs[x]):a/ps.length})});
  (DB.splitSettlements||[]).filter(x=>x["Group ID"]===g.ID).forEach(s=>{if(st[s.From])st[s.From].out+=n(s.Amount);if(st[s.To])st[s.To].in+=n(s.Amount)});
  Object.values(st).forEach(x=>x.net=x.paid-x.share+x.out-x.in);return{ex,st:Object.values(st),total:ex.reduce((s,x)=>s+n(x.Amount),0)};
}
function settle(st){let c=st.filter(x=>x.net>.01).map(x=>({name:x.name,a:x.net})),d=st.filter(x=>x.net<-.01).map(x=>({name:x.name,a:-x.net})),o=[],i=0,j=0;while(i<d.length&&j<c.length){let a=Math.min(d[i].a,c[j].a);o.push({from:d[i].name,to:c[j].name,amount:a});d[i].a-=a;c[j].a-=a;if(d[i].a<.01)i++;if(c[j].a<.01)j++}return o}
function split(){
  const gs=DB.splitGroups||[],old=$("spGroupSel").value,id=old||gs[0]?.ID||"",opts=`<option value="">Select group</option>`+gs.map(g=>`<option value="${g.ID}">${esc(g["Group Name"])}</option>`).join("");
  $("spGroupSel").innerHTML=opts;$("spGroupExpense").innerHTML=opts;$("spGroupSel").value=id;$("spGroupExpense").value=id;
  const g=gs.find(x=>x.ID===id);if(!g){$("splitSummary").innerHTML="";return}
  const ms=members(g);$("spPaidBy").innerHTML=`<option value="">Paid by</option>`+ms.map(x=>`<option>${esc(x)}</option>`).join("");
  $("memberChips").innerHTML=ms.map(x=>`<span class="chip">${esc(x)}<button class="danger" onclick="removeMember('${String(x).replace(/'/g,"\\'")}')">×</button></span>`).join("");
  const c=calc(g);$("splitSummary").innerHTML=[["Total Expenses",m(c.total)],["Expenses",c.ex.length],...c.st.map(x=>[`${esc(x.name)} • ${x.net>0?"Receive":x.net<0?"Pay":"Settled"}`,m(Math.abs(x.net))])].map(x=>card(...x)).join("");
  $("settlementList").innerHTML=settle(c.st).map(x=>item(`<b>${esc(x.from)}</b> → <b>${esc(x.to)}</b>`,m(x.amount),`<button class="success" onclick="settleNow('${g.ID}','${String(x.from).replace(/'/g,"\\'")}','${String(x.to).replace(/'/g,"\\'")}',${x.amount})">Mark Settled</button>`)).join("")||"<p>🎉 Everyone is settled!</p>";
  $("splitExpenseList").innerHTML=c.ex.slice().reverse().map(x=>item(`<b>${esc(x.Title)}</b><br><small>${esc(x.Date)} • Paid by ${esc(x["Paid By"])} • ${esc(json(x["Members JSON"],[]).join(", "))}</small>`,m(x.Amount),`<button class="secondary" onclick="editExpense('${x.ID}')">Edit</button> <button class="danger" onclick="del('splitExpenses','${x.ID}')">Delete</button>`)).join("")||"<p>No expenses</p>";
  $("splitSettlementHistory").innerHTML=(DB.splitSettlements||[]).filter(x=>x["Group ID"]===g.ID).slice().reverse().map(x=>item(`<b>${esc(x.From)}</b> paid <b>${esc(x.To)}</b><br><small>${esc(x.Date)}</small>`,m(x.Amount),`<button class="danger" onclick="del('splitSettlements','${x.ID}')">Delete</button>`)).join("")||"<p>No settlements</p>";
  $("splitList").innerHTML=gs.map(x=>`<div class="item"><span><b>${esc(x["Group Name"])}</b><br><small>${esc(members(x).join(", "))}</small></span><button class="secondary" onclick="openGroup('${x.ID}')">Open</button></div>`).join("");shares();
}
function openGroup(id){$("spGroupSel").value=id;$("spGroupExpense").value=id;split();draw()}
function shares(){if($("spSplitType").value!=="custom")return $("customShares").innerHTML="";const g=(DB.splitGroups||[]).find(x=>x.ID===$("spGroupExpense").value);if(!g)return;let ps=$("spMembersSel").value.split(",").map(x=>x.trim()).filter(Boolean);if(!ps.length)ps=members(g);$("customShares").innerHTML=ps.map(x=>`<div class="share"><span>${esc(x)}</span><input class="shareamt" data-name="${esc(x)}" type="number" placeholder="Amount"></div>`).join("")}
async function addGroup(){const name=$("spGroup").value.trim(),ms=$("spMembers").value.split(",").map(x=>x.trim()).filter(Boolean);if(!name||ms.length<2)return toast("Enter group name and minimum 2 members");const g=await save("splitGroups",{ID:uid(),"Group Name":name,Category:$("spCat").value,"Members JSON":JSON.stringify([...new Set(ms)])});$("spGroup").value="";$("spMembers").value="";openGroup(g.ID)}
async function addMember(){const g=(DB.splitGroups||[]).find(x=>x.ID===$("spGroupSel").value),x=$("newMember").value.trim();if(!g||!x)return toast("Select group and enter member");const ms=members(g);if(ms.includes(x))return toast("Already added");await save("splitGroups",{...g,"Members JSON":JSON.stringify([...ms,x])});$("newMember").value=""}
async function removeMember(x){const g=(DB.splitGroups||[]).find(z=>z.ID===$("spGroupSel").value);if(!g||!confirm(`Remove ${x}?`))return;await save("splitGroups",{...g,"Members JSON":JSON.stringify(members(g).filter(z=>z!==x))})}
async function renameGroup(){const g=(DB.splitGroups||[]).find(x=>x.ID===$("spGroupSel").value),x=prompt("Group name",g?.["Group Name"]);if(x?.trim())await save("splitGroups",{...g,"Group Name":x.trim()})}
function clearSplit(){$("splitEditId").value="";$("spTitle").value="";$("spAmount").value="";$("spMembersSel").value="";$("spDate").value=today();$("spSplitType").value="equal";$("customShares").innerHTML=""}
function editExpense(id){const e=(DB.splitExpenses||[]).find(x=>x.ID===id);if(!e)return;$("splitEditId").value=id;$("spGroupExpense").value=e["Group ID"];$("spTitle").value=e.Title;$("spAmount").value=e.Amount;$("spPaidBy").value=e["Paid By"];$("spDate").value=e.Date;$("spMembersSel").value=json(e["Members JSON"],[]).join(", ");$("spSplitType").value=e["Custom Shares JSON"]?"custom":"equal";shares();const c=json(e["Custom Shares JSON"],{});document.querySelectorAll(".shareamt").forEach(i=>i.value=n(c[i.dataset.name]))}
async function saveSplitExpense(){const g=(DB.splitGroups||[]).find(x=>x.ID===$("spGroupExpense").value),a=n($("spAmount").value),payer=$("spPaidBy").value;if(!g||a<=0||!payer)return toast("Select group, payer and amount");let ps=$("spMembersSel").value.split(",").map(x=>x.trim()).filter(Boolean);if(!ps.length)ps=members(g);let custom="";if($("spSplitType").value==="custom"){let o={};document.querySelectorAll(".shareamt").forEach(i=>o[i.dataset.name]=n(i.value));if(Math.abs(Object.values(o).reduce((s,x)=>s+x,0)-a)>.01)return toast("Custom total must equal expense amount");custom=JSON.stringify(o)}await save("splitExpenses",{ID:$("splitEditId").value||uid(),"Group ID":g.ID,Title:$("spTitle").value||"Expense",Amount:a,"Paid By":payer,"Members JSON":JSON.stringify(ps),"Custom Shares JSON":custom,Date:$("spDate").value||today()});clearSplit()}
async function settleNow(g,f,t,a){if(confirm(`${f} paid ${m(a)} to ${t}?`))await save("splitSettlements",{ID:uid(),"Group ID":g,From:f,To:t,Amount:a,Date:today(),Notes:"Settlement"})}

function invest(){
  const b=DB.baskets||[],a=DB.assets||[],p=DB.sipPayments||[],plan=a.reduce((s,x)=>s+n(x["Monthly Amount"]),0),paid=p.filter(x=>x.Month===ym()).reduce((s,x)=>s+n(x.Amount),0);
  $("investmentDash").innerHTML=[["Monthly Planned",m(plan)],["Paid",m(paid)],["Pending",m(Math.max(0,plan-paid))],["Baskets",b.length]].map(x=>card(...x)).join("");
  $("assetBasket").innerHTML=`<option value="">Select basket</option>`+b.map(x=>`<option value="${x.ID}">${esc(x["Basket Name"])}</option>`).join("");
  $("basketList").innerHTML=b.map(x=>{const as=a.filter(z=>z["Basket ID"]===x.ID),t=as.reduce((s,z)=>s+n(z["Monthly Amount"]),0),done=p.some(z=>z["Basket ID"]===x.ID&&z.Month===ym());return item(`<b>${esc(x["Basket Name"])}</b><br><small>${esc(as.map(z=>z["Asset Name"]).join(", "))}</small>`,m(t),done?"✓ PAID":`<button onclick="markBasket('${x.ID}',${t})">Mark Paid</button>`)}).join("")||"<p>No baskets</p>";
}
async function addBasket(){const name=$("sipPerson").value.trim(),basket=$("sipBasket").value.trim();if(!name||!basket)return toast("Enter person and basket");let p=(DB.people||[]).find(x=>x.Name===name);if(!p)p=await save("people",{ID:uid(),Name:name});await save("baskets",{ID:uid(),"Person ID":p.ID,"Basket Name":basket});$("sipPerson").value="";$("sipBasket").value=""}
async function addAsset(){if(!$("assetBasket").value)return toast("Select basket");if(!$("assetName").value.trim()||n($("assetAmount").value)<=0)return toast("Enter asset and amount");await save("assets",{ID:uid(),"Basket ID":$("assetBasket").value,"Asset Name":$("assetName").value,"Asset Type":$("assetType").value,"Monthly Amount":n($("assetAmount").value)});$("assetName").value="";$("assetAmount").value=""}
function markBasket(id,total){return save("sipPayments",{ID:uid(),"Basket ID":id,Month:ym(),Amount:total,"Paid At":new Date().toISOString()})}

/* VEHICLE FILTER + MAINTENANCE SUMMARY */
function vehicleFilterState(){return {type:$("vehicleTypeFilter")?.value||"",id:$("vehicleFilter")?.value||""}}
function syncVehicleFilters(){
  const vs=DB.vehicles||[],typeEl=$("vehicleTypeFilter"),vehEl=$("vehicleFilter");if(!typeEl||!vehEl)return;
  const prevType=typeEl.value,prevId=vehEl.value;
  typeEl.value=prevType;
  const filtered=vs.filter(v=>!prevType||v["Vehicle Type"]===prevType);
  vehEl.innerHTML='<option value="">All Vehicles</option>'+filtered.map(v=>`<option value="${v.ID}">${esc(v["Vehicle Name"])} • ${esc(v["Vehicle Type"])}</option>`).join("");
  if(filtered.some(v=>v.ID===prevId))vehEl.value=prevId;
}
function resetVehicleFilters(){$("vehicleTypeFilter").value="";$("vehicleFilter").value="";render()}
function filteredVehicles(){const f=vehicleFilterState();return (DB.vehicles||[]).filter(v=>(!f.type||v["Vehicle Type"]===f.type)&&(!f.id||v.ID===f.id))}
function latestOdoForVehicle(id){
  const rows=(DB.fuel||[]).filter(x=>x["Vehicle ID"]===id&&n(x.Odometer)>0).sort((a,b)=>String(a.Date||"").localeCompare(String(b.Date||""))||n(a.Odometer)-n(b.Odometer));
  return rows.length?n(rows[rows.length-1].Odometer):0;
}
function latestMaintenanceForVehicle(id,kind){
  const rows=(DB.maintenance||[]).filter(x=>x["Vehicle ID"]===id&&n(x.Odometer)>0&&(!kind||kind(x))).sort((a,b)=>String(a.Date||"").localeCompare(String(b.Date||""))||n(a.Odometer)-n(b.Odometer));
  return rows.length?rows[rows.length-1]:null;
}
function targetLabel(v,category){
  const cat=String(category||"").toLowerCase();
  if(cat==="oil change"||cat==="engine oil")return "Next Oil Target";
  if(cat==="service")return "Next Service Target";
  return "Next Target";
}
function renderMaintenanceSummary(vs){
  const cards=vs.map(v=>{
    const current=latestOdoForVehicle(v.ID);
    const all=(DB.maintenance||[]).filter(x=>x["Vehicle ID"]===v.ID&&n(x.Odometer)>0);
    const oil=latestMaintenanceForVehicle(v.ID,x=>["oil change","engine oil"].includes(String(x.Category||"").toLowerCase()));
    const service=latestMaintenanceForVehicle(v.ID,x=>String(x.Category||"").toLowerCase()==="service");
    const rows=[{title:"Oil Change",x:oil},{title:"Service",x:service}].filter(z=>z.x);
    if(!rows.length){
      const last=all.sort((a,b)=>String(b.Date||"").localeCompare(String(a.Date||""))||n(b.Odometer)-n(a.Odometer))[0];
      if(last)rows.push({title:last.Category||"Maintenance",x:last});
    }
    const rowHtml=rows.map(({title,x})=>{
      const target=n(x.Odometer)+n(x["Next Target KM"]);
      const remain=target>0?target-current:0;
      const cls=target<=0?"":remain<0?"km-over":remain<1000?"km-warn":"km-good";
      return `<div class="maint-row"><span>Last ${esc(title)}</span><b>${esc(String(x.Date||"").slice(0,10))} • ${n(x.Odometer).toLocaleString("en-IN")} km</b></div>
      <div class="maint-row"><span>Next ${esc(title)} Target</span><b>${target>0?target.toLocaleString("en-IN")+" km":"Not set"}</b></div>
      <div class="maint-row"><span>KM Remaining</span><b class="${cls}">${target>0?(remain>=0?remain.toLocaleString("en-IN")+" km":Math.abs(remain).toLocaleString("en-IN")+" km overdue"):"Not set"}</b></div>`;
    }).join("");
    return `<div class="maintenance-card"><h3>${v["Vehicle Type"]==="Bike"?"🏍️":"🚗"} ${esc(v["Vehicle Name"])}</h3><div class="maint-row"><span>Current Odometer</span><b>${current?current.toLocaleString("en-IN")+" km":"No fuel odometer yet"}</b></div>${rowHtml||'<p class="muted">No maintenance entry yet for this vehicle.</p>'}</div>`;
  });
  $("vehicleMaintenanceSummary").innerHTML=cards.join("")||"<p>No vehicle selected.</p>";
}
function vehicles(){
  const vsAll=DB.vehicles||[],vs=filteredVehicles(),ids=new Set(vs.map(v=>v.ID));
  const fuel=(DB.fuel||[]).filter(x=>ids.has(x["Vehicle ID"])),maint=(DB.maintenance||[]).filter(x=>ids.has(x["Vehicle ID"]));
  const prevFuel=$("fuelVehicle").value,prevMaint=$("maintVehicle").value;
  const opts=`<option value="">Select vehicle</option>`+vsAll.map(v=>`<option value="${v.ID}">${esc(v["Vehicle Name"])} • ${esc(v["Vehicle Type"])}</option>`).join("");
  $("fuelVehicle").innerHTML=opts;$("maintVehicle").innerHTML=opts;
  if(vsAll.some(v=>v.ID===prevFuel))$("fuelVehicle").value=prevFuel;
  if(vsAll.some(v=>v.ID===prevMaint))$("maintVehicle").value=prevMaint;

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
  if(!$("fuelVehicle").value)return toast("Select vehicle");
  const amount=n($("fuelAmount").value);if(amount<=0)return toast("Enter valid fuel amount");
  const r=await save("fuel",{ID:uid(),"Vehicle ID":$("fuelVehicle").value,Date:$("fuelDate").value||today(),Odometer:n($("fuelOdo").value),Quantity:n($("fuelQty").value),Amount:amount,"Fuel Type":$("fuelType").value,Notes:$("fuelNotes").value});
  await save("passbook",{ID:"fuel-"+r.ID,Date:r.Date,Type:"Expense",Category:"Petrol / Fuel",Amount:amount,Account:"Vehicle Tracker",Remarks:(DB.vehicles||[]).find(v=>v.ID===r["Vehicle ID"])?.["Vehicle Name"]||"Fuel","Source ID":r.ID});
  $("fuelOdo").value="";$("fuelQty").value="";$("fuelAmount").value="";$("fuelNotes").value="";
}
async function addMaintenance(){
  if(!$("maintVehicle").value)return toast("Select vehicle");
  const amount=n($("maintAmount").value);if(amount<=0)return toast("Enter valid maintenance amount");
  const r=await save("maintenance",{ID:uid(),"Vehicle ID":$("maintVehicle").value,Date:$("maintDate").value||today(),Category:$("maintCategory").value,Amount:amount,Odometer:n($("maintOdo").value),"Next Target KM":n($("maintTargetKm").value),Remarks:$("maintRemarks").value});
  await save("passbook",{ID:"maintenance-"+r.ID,Date:r.Date,Type:"Expense",Category:"Vehicle Maintenance",Amount:amount,Account:"Vehicle Tracker",Remarks:`${r.Category} - ${(DB.vehicles||[]).find(v=>v.ID===r["Vehicle ID"])?.["Vehicle Name"]||"Vehicle"}`,"Source ID":r.ID});
  $("maintAmount").value="";$("maintOdo").value="";$("maintTargetKm").value="";$("maintRemarks").value="";
}

function lists(){
  const p=DB.passbook||[],s=DB.salary||[],t=DB.transactions||[];
  const fill=(id,a)=>{const e=$(id);if(e)e.innerHTML=[...new Set(a.filter(Boolean))].map(x=>`<option value="${esc(x)}">`).join("")};
  fill("categoryList",p.map(x=>x.Category));fill("accountList",p.map(x=>x.Account));fill("remarksList",p.map(x=>x.Remarks));
  fill("companyList",s.map(x=>x.Company));fill("salaryRemarksList",s.map(x=>x.Remarks));fill("personList",t.map(x=>x.Person));fill("vehicleNameList",(DB.vehicles||[]).map(x=>x["Vehicle Name"]));
}

function draw(){
  const f=dashFilter(),y=f.month,p=filterPassbook(DB.passbook||[],y,f.category),s=DB.salary||[],e=DB.emi||[],l=DB.loans||[],a=DB.assets||[];
  const otherIncome=p.filter(x=>String(x.Type||"").toLowerCase()==="income").reduce((z,x)=>z+n(x.Amount),0);
  const exp=p.filter(x=>String(x.Type||"").toLowerCase()==="expense").reduce((z,x)=>z+n(x.Amount),0);
  const sal=s.filter(x=>x.Month===y).reduce((z,x)=>z+n(x.Amount),0),totalIncome=sal+otherIncome,em=e.filter(x=>x.Month===y).reduce((z,x)=>z+n(x.Amount),0);
  chart("mainChart","bar",["Salary","Other Income","Total Income","Expense","EMI"],[sal,otherIncome,totalIncome,exp,em],"Amount");
  chart("expenseChart","doughnut",["Total Income","Expense"],[totalIncome,exp],"Amount");
  chart("passbookChart","bar",["Income","Expense"],[otherIncome,exp],"Amount");
  const sm={};s.forEach(x=>sm[x.Month]=(sm[x.Month]||0)+n(x.Amount));chart("salaryChart","line",Object.keys(sm),Object.values(sm),"Salary");
  chart("loanChart","doughnut",["Initial","EMI Paid"],[l.reduce((z,x)=>z+n(x["Initial Amount"]),0),e.reduce((z,x)=>z+n(x.Amount),0)],"Amount");
  const gb=Object.values(giveBal());chart("giveChart","bar",gb.map(x=>x.person),gb.map(x=>Math.abs(x.balance)),"Outstanding");
  const g=(DB.splitGroups||[]).find(x=>x.ID===$("spGroupSel").value);if(g){const c=calc(g);chart("splitChart","bar",c.st.map(x=>x.name),c.st.map(x=>x.paid),"Paid")}
  chart("investmentChart","doughnut",a.map(x=>x["Asset Name"]),a.map(x=>n(x["Monthly Amount"])),"Monthly Amount");
  const vs=filteredVehicles(),ids=new Set(vs.map(v=>v.ID)),fu=(DB.fuel||[]).filter(x=>ids.has(x["Vehicle ID"])),ma=(DB.maintenance||[]).filter(x=>ids.has(x["Vehicle ID"]));
  chart("fuelChart","bar",vs.map(v=>v["Vehicle Name"]),vs.map(v=>fu.filter(x=>x["Vehicle ID"]===v.ID).reduce((z,x)=>z+n(x.Amount),0)),"Fuel Cost");
  chart("maintenanceChart","bar",vs.map(v=>v["Vehicle Name"]),vs.map(v=>ma.filter(x=>x["Vehicle ID"]===v.ID).reduce((z,x)=>z+n(x.Amount),0)),"Maintenance Cost");
}

["dashMonth","dashCategory","pbFilterMonth","pbFilterCategory"].forEach(id=>{const el=$(id);if(el)el.onchange=()=>render()});
$("vehicleTypeFilter").onchange=()=>{syncVehicleFilters();render()};
$("vehicleFilter").onchange=()=>render();
$("spGroupSel").onchange=()=>openGroup($("spGroupSel").value);
$("spGroupExpense").onchange=()=>openGroup($("spGroupExpense").value);
$("spSplitType").onchange=shares;$("spMembersSel").onchange=shares;
["pbDate","gtDate","spDate","fuelDate","maintDate"].forEach(x=>$(x).value=today());
["salMonth","emiMonth"].forEach(x=>$(x).value=ym());
try{DB=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){DB={}}
// Render first, then sync from Google Sheets. This prevents a blank dashboard.
render();
status(Object.keys(DB).length?"☁️ Loading...":"☁️ Connecting...");
loadAll();
