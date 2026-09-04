const DB = {
  passbook:["ID","Date","Type","Category","Amount","Account","Remarks","Created At","Updated At"],
  salary:["ID","Month","Company","Amount","Remarks","Created At","Updated At"],
  loans:["ID","Loan Name","Initial Amount","Remarks","Created At","Updated At"],
  emi:["ID","Loan ID","Month","Amount","Remarks","Created At","Updated At"],
  transactions:["ID","Person","Type","Amount","Date","Purpose","Notes","Revisions","Created At","Updated At"],
  people:["ID","Name","Created At","Updated At"],
  baskets:["ID","Person ID","Basket Name","Created At","Updated At"],
  assets:["ID","Basket ID","Asset Name","Asset Type","Monthly Amount","Created At","Updated At"],
  sipPayments:["ID","Basket ID","Month","Amount","Paid At","Created At","Updated At"],
  splitGroups:["ID","Group Name","Category","Members JSON","Created At","Updated At"],
  splitExpenses:["ID","Group ID","Title","Amount","Paid By","Members JSON","Date","Created At","Updated At"]
};

function doGet(e){
  const action = String((e.parameter && e.parameter.action) || "loadAll");
  if(action === "loadAll") return json_({success:true,data:loadAll_()});
  return json_({success:true,message:"Finance Hub API running"});
}

function doPost(e){
  try{
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    const action = body.action || "";
    if(action === "loadAll") return json_({success:true,data:loadAll_()});
    if(action === "save"){
      upsert_(body.table, body.data || {});
      return json_({success:true,data:body.data});
    }
    if(action === "delete"){
      delete_(body.table, body.id);
      return json_({success:true});
    }
    return json_({success:false,error:"Unknown action"});
  }catch(err){
    return json_({success:false,error:String(err.message || err)});
  }
}

function sheet_(name){
  if(!DB[name]) throw new Error("Invalid table: "+name);
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName(name);
  if(!sh){
    sh=ss.insertSheet(name);
    sh.getRange(1,1,1,DB[name].length).setValues([DB[name]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function loadAll_(){
  const out={};
  Object.keys(DB).forEach(name=>{
    const sh=sheet_(name), n=sh.getLastRow();
    out[name]= n<2 ? [] : sh.getRange(2,1,n-1,DB[name].length).getValues()
      .map(r=>{
        const o={};
        DB[name].forEach((h,i)=>o[h]=normalize_(r[i]));
        return o;
      }).filter(x=>String(x.ID||"")!=="");
  });
  return out;
}

function upsert_(table,data){
  if(!data.ID) throw new Error("ID missing");
  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    const sh=sheet_(table), headers=DB[table], now=new Date().toISOString();
    const rowData={...data};
    rowData["Created At"]=rowData["Created At"]||now;
    rowData["Updated At"]=now;
    const values=headers.map(h=>rowData[h]===undefined ? "" : rowData[h]);
    const last=sh.getLastRow();
    let target=0;
    if(last>=2){
      const ids=sh.getRange(2,1,last-1,1).getValues().flat().map(String);
      const i=ids.indexOf(String(data.ID));
      if(i>=0) target=i+2;
    }
    if(target) sh.getRange(target,1,1,headers.length).setValues([values]);
    else sh.getRange(last+1,1,1,headers.length).setValues([values]);
  }finally{
    lock.releaseLock();
  }
}

function delete_(table,id){
  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    const sh=sheet_(table), last=sh.getLastRow();
    if(last<2) return;
    const ids=sh.getRange(2,1,last-1,1).getValues().flat().map(String);
    const i=ids.indexOf(String(id));
    if(i>=0) sh.deleteRow(i+2);
  }finally{
    lock.releaseLock();
  }
}

function normalize_(v){
  if(Object.prototype.toString.call(v)==='[object Date]' && !isNaN(v))
    return Utilities.formatDate(v,Session.getScriptTimeZone(),"yyyy-MM-dd'T'HH:mm:ss");
  return v===null||v===undefined ? "" : v;
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}