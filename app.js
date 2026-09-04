const API_URL="https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";

const LOCAL_KEY="ankit_finance_hub_final_v1";

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


/* ================= API ================= */

async function api(action,payload={}){

const response=await fetch(API_URL,{
method:"POST",
headers:{
"Content-Type":"text/plain;charset=utf-8"
},
body:JSON.stringify({
action,
...payload
})
});

const text=await response.text();

let data;

try{
data=JSON.parse(text);
}catch(e){
throw new Error("Invalid server response");
}

if(!data.success){
throw new Error(data.error||"Server error");
}

return data;
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


/* ================= UI ================= */

function toast(text){

$("toast").textContent=text;

$("toast").classList.add("show");

setTimeout(()=>{
$("toast").classList.remove("show");
},2500);

}

function setStatus(text){

$("status").textContent=text;

}


/* ================= LOAD ================= */

async function loadAll(silent=false){

if(syncInProgress)return;

syncInProgress=true;

try{

if(!silent){
setStatus("☁️ Syncing...");
}

const result=await api("loadAll");

DB=result.data||{};

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

const result=await api("save",{
table,
data
});

const record=result.record||data;

DB[table]=DB[table]||[];

const index=DB[table].findIndex(
x=>String(x.ID)===String(record.ID)
);

if(index>=0){

DB[table][index]=record;

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

if(!confirm("Delete this record?"))return;

try{

await api("delete",{
table,
id
});

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

document.querySelectorAll("[data-page]").forEach(button=>{

button.onclick=()=>{

document.querySelectorAll(".page").forEach(page=>{
page.classList.remove("active");
});

$(button.dataset.page).classList.add("active");

$("sidebar").classList.remove("open");

};

});

$("menuBtn").onclick=()=>{

$("sidebar").classList.toggle("open");

};


/* ================= DARK MODE ================= */

const savedTheme=localStorage.getItem("financeTheme")||"light";

if(savedTheme==="dark"){

document.body.classList.add("dark");

}

function updateTheme(){

$("themeBtn").textContent=
document.body.classList.contains("dark")
?"☀️ Light"
:"🌙 Dark";

}

updateTheme();

$("themeBtn").onclick=()=>{

document.body.classList.toggle("dark");

localStorage.setItem(
"financeTheme",
document.body.classList.contains("dark")
?"dark"
:"light"
);

updateTheme();

renderCharts();

};


/* ================= ITEM ================= */

function item(left,right,id,table){

return `
<div class="item">

<span>${left}</span>

<span>
${right}
<button class="danger"
onclick="del('${table}','${id}')">
Delete
</button>
</span>

</div>
`;

}


/* ================= CHART ================= */

function createChart(id,type,labels,data,label){

if(!window.Chart)return;

if(charts[id]){

charts[id].destroy();

}

const canvas=$(id);

if(!canvas)return;

charts[id]=new Chart(canvas,{

type,

data:{
labels,
datasets:[{
label,
data
}]
},

options:{
responsive:true,
maintainAspectRatio:false
}

});

}


/* ================= MAIN RENDER ================= */

function render(){

const y=ym();

const p=DB.passbook||[];
const sal=DB.salary||[];
const em=DB.emi||[];
const payments=DB.sipPayments||[];

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

const sip=payments
.filter(x=>String(x.Month)===y)
.reduce((s,x)=>s+num(x.Amount),0);


const balances=getGiveTakeBalances();

const receive=Object.values(balances)
.filter(x=>x.balance>0)
.reduce((s,x)=>s+x.balance,0);

const pay=Object.values(balances)
.filter(x=>x.balance<0)
.reduce((s,x)=>s+Math.abs(x.balance),0);


/* MAIN DASH */

$("dash").innerHTML=[

["💰 Salary",salary],
["💸 Expense",expense],
["📈 SIP Paid",sip],
["🏦 EMI Paid",emi],
["🤝 To Receive",receive],
["🤝 To Pay",pay],
["📒 Other Income",income],
["💳 Net",salary+income-expense-emi-sip]

].map(x=>`

<div class="card">

<small>${x[0]}</small>

<b>${money(x[1])}</b>

</div>

`).join("");


renderPassbook();

renderSalary();

renderLoans();

renderGiveTake();

renderInvest();

renderSplit();

updateDropdowns();

renderCharts();

}


/* ================= PASSBOOK ================= */

function renderPassbook(){

const p=DB.passbook||[];

const y=ym();

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

$("passbookDash").innerHTML=[
["Income",money(income)],
["Expense",money(expense)],
["Net",money(income-expense)],
["Transactions",
p.filter(x=>String(x.Date).slice(0,7)===y).length]
].map(x=>`

<div class="section-stat-card">
<small>${x[0]}</small>
<b>${x[1]}</b>
</div>

`).join("");


$("pbList").innerHTML=p
.slice()
.reverse()
.map(x=>item(
`${x.Date} • <b>${x.Category}</b> • ${x.Type}`,
money(x.Amount),
x.ID,
"passbook"
))
.join("")||"<p>No records</p>";

}


/* ================= SALARY ================= */

function renderSalary(){

const sal=DB.salary||[];

const y=ym();

const current=sal
.filter(x=>String(x.Month)===y)
.reduce((s,x)=>s+num(x.Amount),0);

const total=sal
.reduce((s,x)=>s+num(x.Amount),0);

const companies=[
...new Set(
sal.map(x=>x.Company).filter(Boolean)
)
].length;


$("salaryDash").innerHTML=[

["This Month",money(current)],
["Total Recorded",money(total)],
["Entries",sal.length],
["Companies",companies]

].map(x=>`

<div class="section-stat-card">
<small>${x[0]}</small>
<b>${x[1]}</b>
</div>

`).join("");


$("salaryList").innerHTML=sal
.slice()
.reverse()
.map(x=>item(
`${x.Month} • ${x.Company}`,
money(x.Amount),
x.ID,
"salary"
))
.join("")||"<p>No salary records</p>";

}


/* ================= LOANS ================= */

function renderLoans(){

const loans=DB.loans||[];

const emi=DB.emi||[];

const y=ym();

const initial=loans
.reduce((s,x)=>s+num(x["Initial Amount"]),0);

const paidMonth=emi
.filter(x=>String(x.Month)===y)
.reduce((s,x)=>s+num(x.Amount),0);

const paidTotal=emi
.reduce((s,x)=>s+num(x.Amount),0);


$("loanDash").innerHTML=[

["Initial Loans",money(initial)],
["EMI This Month",money(paidMonth)],
["Total EMI Paid",money(paidTotal)],
["Loans",loans.length]

].map(x=>`

<div class="section-stat-card">
<small>${x[0]}</small>
<b>${x[1]}</b>
</div>

`).join("");


$("emiLoan").innerHTML=

`<option value="">Select loan</option>`+

loans.map(x=>`
<option value="${x.ID}">
${x["Loan Name"]}
</option>
`).join("");


$("loanList").innerHTML=loans.map(x=>{

const loanEmi=emi
.filter(e=>e["Loan ID"]===x.ID)
.reduce((s,e)=>s+num(e.Amount),0);

const remaining=Math.max(
0,
num(x["Initial Amount"])-loanEmi
);

return `

<div class="item">

<span>

<b>${x["Loan Name"]}</b>

<br>

<small>
Initial: ${money(x["Initial Amount"])}
<br>
EMI Paid: ${money(loanEmi)}
<br>
Approx Remaining: ${money(remaining)}
</small>

</span>

<button class="danger"
onclick="del('loans','${x.ID}')">

Delete

</button>

</div>

`;

}).join("")||"<p>No loans</p>";

}


/* ================= GIVE TAKE ================= */

function getGiveTakeBalances(){

const out={};

(DB.transactions||[]).forEach(x=>{

const person=String(x.Person||"Unknown").trim();

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

const amount=num(x.Amount);

const type=String(x.Type||"").toLowerCase();

const p=out[person];


/*
Positive = Person owes YOU.
Negative = YOU owe person.
*/

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


function renderGiveTake(){

const balances=getGiveTakeBalances();

const list=Object.values(balances);

const receive=list
.filter(x=>x.balance>0)
.reduce((s,x)=>s+x.balance,0);

const pay=list
.filter(x=>x.balance<0)
.reduce((s,x)=>s+Math.abs(x.balance),0);


$("giveDash").innerHTML=[

["To Receive",money(receive)],
["To Pay",money(pay)],
["Net",money(receive-pay)],
["People",list.length]

].map(x=>`

<div class="section-stat-card">
<small>${x[0]}</small>
<b>${x[1]}</b>
</div>

`).join("");


$("gtDashboard").innerHTML=list
.sort((a,b)=>Math.abs(b.balance)-Math.abs(a.balance))
.map(p=>{

const status=
p.balance>0
?"To Receive"
:p.balance<0
?"To Pay"
:"Settled";

return `

<div class="card person-card">

<small>${p.person}</small>

<b>${money(Math.abs(p.balance))}</b>

<span class="balance-label">
${status}
</span>

<small>

Given ${money(p.given)}
<br>

Received ${money(p.received)}
<br>

Taken ${money(p.taken)}
<br>

Paid ${money(p.paid)}

</small>

</div>

`;

}).join("")||"<p>No balances</p>";


$("gtList").innerHTML=(DB.transactions||[])
.slice()
.reverse()
.map(x=>item(
`<b>${x.Person}</b> • ${x.Type}<br>
<small>${x.Purpose||""}</small>`,
money(x.Amount),
x.ID,
"transactions"
))
.join("")||"<p>No records</p>";

}


/* ================= INVESTMENTS ================= */

function renderInvest(){

const baskets=DB.baskets||[];
const people=DB.people||[];
const assets=DB.assets||[];
const payments=DB.sipPayments||[];

const planned=assets
.reduce((s,x)=>s+num(x["Monthly Amount"]),0);

const paid=payments
.filter(x=>String(x.Month)===ym())
.reduce((s,x)=>s+num(x.Amount),0);


$("investmentDash").innerHTML=[

["Monthly Planned",money(planned)],
["Paid This Month",money(paid)],
["Pending",money(Math.max(0,planned-paid))],
["Baskets",baskets.length]

].map(x=>`

<div class="section-stat-card">
<small>${x[0]}</small>
<b>${x[1]}</b>
</div>

`).join("");


$("assetBasket").innerHTML=

`<option value="">Select basket</option>`+

baskets.map(b=>{

const person=people.find(
p=>p.ID===b["Person ID"]
);

return `

<option value="${b.ID}">
${person?person.Name:""} — ${b["Basket Name"]}
</option>

`;

}).join("");


$("basketList").innerHTML=baskets.map(b=>{

const person=people.find(
p=>p.ID===b["Person ID"]
);

const basketAssets=assets.filter(
a=>a["Basket ID"]===b.ID
);

const total=basketAssets
.reduce((s,x)=>s+num(x["Monthly Amount"]),0);

const done=payments.some(
x=>x["Basket ID"]===b.ID &&
x.Month===ym()
);

return `

<div class="item">

<span>

<b>
${person?person.Name:""} —
${b["Basket Name"]}
</b>

<br>

<small>

${basketAssets.map(a=>
`${a["Asset Name"]} ${money(a["Monthly Amount"])}`
).join(" • ")||"No assets"}

</small>

</span>

<span>

${money(total)}

<br>

${done
?"✓ PAID"
:`<button onclick="markBasket('${b.ID}',${total})">
Mark Paid
</button>`
}

</span>

</div>

`;

}).join("")||"<p>No baskets</p>";

}


/* ================= SPLITTER ================= */

function groupMembers(group){

try{

return JSON.parse(
group["Members JSON"]||"[]"
);

}catch(e){

return [];

}

}


function calculateSplitGroup(group){

const members=groupMembers(group);

const expenses=(DB.splitExpenses||[])
.filter(x=>x["Group ID"]===group.ID);

const stats={};

members.forEach(name=>{

stats[name]={
name,
paid:0,
share:0,
net:0
};

});


let total=0;


expenses.forEach(expense=>{

const amount=num(expense.Amount);

total+=amount;

const paidBy=String(
expense["Paid By"]||""
);

if(!stats[paidBy]){

stats[paidBy]={
name:paidBy,
paid:0,
share:0,
net:0
};

}

stats[paidBy].paid+=amount;


let participants=[];

try{

participants=JSON.parse(
expense["Members JSON"]||"[]"
);

}catch(e){}


if(!participants.length){

participants=members;

}


const share=
participants.length
?amount/participants.length
:0;


participants.forEach(person=>{

if(!stats[person]){

stats[person]={
name:person,
paid:0,
share:0,
net:0
};

}

stats[person].share+=share;

});

});


Object.values(stats).forEach(x=>{

x.net=x.paid-x.share;

});


return {
total,
expenses,
stats:Object.values(stats)
};

}


/* WHO PAYS WHOM */

function calculateSettlements(stats){

let creditors=stats
.filter(x=>x.net>0.01)
.map(x=>({
name:x.name,
amount:x.net
}));

let debtors=stats
.filter(x=>x.net<-0.01)
.map(x=>({
name:x.name,
amount:-x.net
}));

const result=[];

let i=0;
let j=0;


while(
i<debtors.length &&
j<creditors.length
){

const amount=Math.min(
debtors[i].amount,
creditors[j].amount
);

result.push({

from:debtors[i].name,

to:creditors[j].name,

amount

});


debtors[i].amount-=amount;

creditors[j].amount-=amount;


if(debtors[i].amount<0.01)i++;

if(creditors[j].amount<0.01)j++;

}


return result;

}


function renderSplit(){

const groups=DB.splitGroups||[];

const previous=$("spGroupSel").value;


$("spGroupSel").innerHTML=

`<option value="">Select group</option>`+

groups.map(g=>`

<option value="${g.ID}">
${g["Group Name"]}
</option>

`).join("");


if(
previous &&
groups.some(g=>g.ID===previous)
){

$("spGroupSel").value=previous;

}

else if(groups.length){

$("spGroupSel").value=groups[0].ID;

}


const selected=groups.find(
g=>g.ID===$("spGroupSel").value
);


const members=selected
?groupMembers(selected)
:[];


$("spPaidBy").innerHTML=

`<option value="">Paid by</option>`+

members.map(m=>`

<option value="${m}">
${m}
</option>

`).join("");


if(selected){

const calc=calculateSplitGroup(selected);


$("splitSummary").innerHTML=`

<div class="card">

<small>Total Expenses</small>

<b>${money(calc.total)}</b>

</div>


<div class="card">

<small>Expenses</small>

<b>${calc.expenses.length}</b>

</div>


${calc.stats.map(s=>{

const status=

s.net>0
?"Should Receive"
:s.net<0
?"Should Pay"
:"Settled";


return `

<div class="card person-card">

<small>${s.name}</small>

<b>${money(Math.abs(s.net))}</b>

<span class="balance-label">
${status}
</span>

<small>

Paid ${money(s.paid)}
<br>

Share ${money(s.share)}

</small>

</div>

`;

}).join("")}

`;


const settlements=
calculateSettlements(calc.stats);


$("settlementList").innerHTML=

settlements.map((s,index)=>`

<div class="item">

<span>

<b>${s.from}</b>

→

<b>${s.to}</b>

</span>

<span>

<b>${money(s.amount)}</b>

<button class="success"
onclick="settleSplit('${selected.ID}',${index})">

Mark Settled

</button>

</span>

</div>

`).join("")
||"<p>🎉 Everyone is settled!</p>";


}else{

$("splitSummary").innerHTML="";

$("settlementList").innerHTML=
"<p>Select a group</p>";

}


$("splitList").innerHTML=groups.map(group=>{

const calc=calculateSplitGroup(group);

return `

<div class="card">

<b>${group["Group Name"]}</b>

<p class="muted">

${groupMembers(group).join(", ")}

</p>

<div class="item">

<span>Total Spent</span>

<span>${money(calc.total)}</span>

</div>

<p>

${calc.stats.map(s=>`

${s.name}:
${s.net>=0?"Receive":"Pay"}
${money(Math.abs(s.net))}

`).join(" • ")}

</p>

</div>

`;

}).join("")||"<p>No groups</p>";

}


/* ================= SETTLE SPLIT ================= */

/*
Settlement is stored as a new split expense.
It does not affect total group expenses.
Instead we create a settlement transaction table record.
*/

async function settleSplit(groupId,index){

const group=(DB.splitGroups||[])
.find(x=>x.ID===groupId);

if(!group)return;


const calc=calculateSplitGroup(group);

const settlements=
calculateSettlements(calc.stats);

const settlement=settlements[index];

if(!settlement)return;


if(!confirm(
`${settlement.from} paid ${money(settlement.amount)} to ${settlement.to}?`
)){
return;
}


/*
Store as Give/Take record for permanent history.
*/

await save("transactions",{

ID:uid(),

Person:settlement.to,

Type:"Receive",

Amount:settlement.amount,

Date:today(),

Purpose:
`Splitter Settlement from ${settlement.from}`,

Notes:
`Group: ${group["Group Name"]}`,

Revisions:"[]"

});


await save("transactions",{

ID:uid(),

Person:settlement.from,

Type:"Pay",

Amount:settlement.amount,

Date:today(),

Purpose:
`Splitter Settlement to ${settlement.to}`,

Notes:
`Group: ${group["Group Name"]}`,

Revisions:"[]"

});


toast("✓ Settlement recorded");

}


/* ================= DROPDOWNS ================= */

function fillList(id,values){

const unique=[
...new Set(
values
.filter(Boolean)
.map(x=>String(x).trim())
)
];

$(id).innerHTML=
unique.map(x=>`
<option value="${x}">
`).join("");

}


function updateDropdowns(){

const passbook=DB.passbook||[];

fillList(
"categoryList",
passbook.map(x=>x.Category)
);

fillList(
"accountList",
passbook.map(x=>x.Account)
);

fillList(
"remarksList",
passbook.map(x=>x.Remarks)
);


const salary=DB.salary||[];

fillList(
"companyList",
salary.map(x=>x.Company)
);

fillList(
"salaryRemarksList",
salary.map(x=>x.Remarks)
);


const loans=DB.loans||[];

fillList(
"loanNameList",
loans.map(x=>x["Loan Name"])
);

fillList(
"loanRemarksList",
loans.map(x=>x.Remarks)
);


const emi=DB.emi||[];

fillList(
"emiRemarksList",
emi.map(x=>x.Remarks)
);


const transactions=DB.transactions||[];

fillList(
"personList",
transactions.map(x=>x.Person)
);

fillList(
"purposeList",
transactions.map(x=>x.Purpose)
);

fillList(
"notesList",
transactions.map(x=>x.Notes)
);


const groups=DB.splitGroups||[];

fillList(
"groupNameList",
groups.map(x=>x["Group Name"])
);


const expenses=DB.splitExpenses||[];

fillList(
"expenseTitleList",
expenses.map(x=>x.Title)
);


const people=DB.people||[];

fillList(
"investmentPersonList",
people.map(x=>x.Name)
);


const baskets=DB.baskets||[];

fillList(
"basketNameList",
baskets.map(x=>x["Basket Name"])
);


const assets=DB.assets||[];

fillList(
"assetNameList",
assets.map(x=>x["Asset Name"])
);

}


/* ================= ADD FUNCTIONS ================= */

function addPassbook(){

return save("passbook",{

ID:uid(),

Date:$("pbDate").value||today(),

Type:$("pbType").value,

Category:$("pbCat").value,

Amount:num($("pbAmt").value),

Account:$("pbAccount").value,

Remarks:$("pbRemarks").value

});

}


function addSalary(){

return save("salary",{

ID:uid(),

Month:$("salMonth").value||ym(),

Company:$("salCompany").value,

Amount:num($("salAmount").value),

Remarks:$("salRemarks").value

});

}


function addLoan(){

return save("loans",{

ID:uid(),

"Loan Name":$("loanName").value,

"Initial Amount":num($("loanInitial").value),

Remarks:$("loanRemarks").value

});

}


function addEmi(){

if(!$("emiLoan").value){

toast("Select loan");

return;

}


return save("emi",{

ID:uid(),

"Loan ID":$("emiLoan").value,

Month:$("emiMonth").value||ym(),

Amount:num($("emiAmount").value),

Remarks:$("emiRemarks").value

});

}


function addGive(){

return save("transactions",{

ID:uid(),

Person:$("gtPerson").value,

Type:$("gtType").value,

Amount:num($("gtAmount").value),

Date:$("gtDate").value||today(),

Purpose:$("gtPurpose").value,

Notes:$("gtNotes").value,

Revisions:"[]"

});

}


/* ================= INVESTMENT ADD ================= */

async function addBasket(){

const name=$("sipPerson").value.trim();

const basket=$("sipBasket").value.trim();


if(!name||!basket){

toast("Enter person and basket");

return;

}


let person=(DB.people||[]).find(
x=>String(x.Name).toLowerCase()===
name.toLowerCase()
);


if(!person){

person=await save("people",{

ID:uid(),

Name:name

});

}


await save("baskets",{

ID:uid(),

"Person ID":person.ID,

"Basket Name":basket

});

}


function addAsset(){

if(!$("assetBasket").value){

toast("Select basket");

return;

}


return save("assets",{

ID:uid(),

"Basket ID":$("assetBasket").value,

"Asset Name":$("assetName").value,

"Asset Type":$("assetType").value,

"Monthly Amount":num($("assetAmount").value)

});

}


function markBasket(id,total){

return save("sipPayments",{

ID:uid(),

"Basket ID":id,

Month:ym(),

Amount:total,

"Paid At":new Date().toISOString()

});

}


/* ================= GROUP ================= */

async function addGroup(){

const name=$("spGroup").value.trim();

const members=$("spMembers").value
.split(",")
.map(x=>x.trim())
.filter(Boolean);


if(!name){

toast("Enter group name");

return;

}


if(members.length<2){

toast("Minimum 2 members required");

return;

}


const group=await save("splitGroups",{

ID:uid(),

"Group Name":name,

Category:$("spCat").value,

"Members JSON":JSON.stringify(members)

});


$("spGroup").value="";

$("spMembers").value="";


$("spGroupSel").value=group.ID;

renderSplit();

}


async function addSplitExpense(){

const group=(DB.splitGroups||[])
.find(x=>x.ID===$("spGroupSel").value);


if(!group){

toast("Select group");

return;

}


const amount=num($("spAmount").value);


if(amount<=0){

toast("Enter valid amount");

return;

}


let members=$("spMembersSel").value
.split(",")
.map(x=>x.trim())
.filter(Boolean);


if(!members.length){

members=groupMembers(group);

}


await save("splitExpenses",{

ID:uid(),

"Group ID":group.ID,

Title:$("spTitle").value,

Amount:amount,

"Paid By":$("spPaidBy").value,

"Members JSON":JSON.stringify(members),

Date:today()

});


$("spTitle").value="";

$("spAmount").value="";

$("spMembersSel").value="";

}


$("spGroupSel").onchange=renderSplit;


/* ================= CHARTS ================= */

function renderCharts(){

const y=ym();

const p=DB.passbook||[];

const sal=DB.salary||[];

const loans=DB.loans||[];

const emi=DB.emi||[];

const assets=DB.assets||[];


/* MAIN */

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


const salary=sal
.filter(x=>String(x.Month)===y)
.reduce((s,x)=>s+num(x.Amount),0);


const emiPaid=emi
.filter(x=>String(x.Month)===y)
.reduce((s,x)=>s+num(x.Amount),0);


createChart(
"mainChart",
"bar",
["Salary","Other Income","Expense","EMI"],
[salary,income,expense,emiPaid],
"Amount"
);


createChart(
"expenseChart",
"doughnut",
["Income","Expense"],
[income,expense],
"Amount"
);


/* PASSBOOK */

createChart(
"passbookChart",
"bar",
["Income","Expense"],
[income,expense],
"Amount"
);


/* SALARY TREND */

const salaryMonths={};

sal.forEach(x=>{

salaryMonths[x.Month]=
(salaryMonths[x.Month]||0)+num(x.Amount);

});


createChart(
"salaryChart",
"line",
Object.keys(salaryMonths),
Object.values(salaryMonths),
"Salary"
);


/* LOANS */

const totalLoan=loans
.reduce((s,x)=>s+num(x["Initial Amount"]),0);

const totalEmi=emi
.reduce((s,x)=>s+num(x.Amount),0);


createChart(
"loanChart",
"doughnut",
["Initial Loan","EMI Recorded"],
[totalLoan,totalEmi],
"Amount"
);


/* GIVE TAKE */

const balances=
Object.values(getGiveTakeBalances());


createChart(
"giveChart",
"bar",
balances.map(x=>x.person),
balances.map(x=>Math.abs(x.balance)),
"Outstanding"
);


/* SPLITTER */

const group=(DB.splitGroups||[])
.find(x=>x.ID===$("spGroupSel").value);


if(group){

const calc=calculateSplitGroup(group);

createChart(
"splitChart",
"bar",
calc.stats.map(x=>x.name),
calc.stats.map(x=>x.paid),
"Amount Paid"
);

}


/* INVESTMENT */

createChart(
"investmentChart",
"doughnut",
assets.map(x=>x["Asset Name"]),
assets.map(x=>num(x["Monthly Amount"])),
"Monthly Amount"
);

}


/* ================= START ================= */

DB=restore();


if(Object.keys(DB).length){

render();

setStatus("☁️ Loading latest...");

loadAll(true);

}else{

loadAll();

}
