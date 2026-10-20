(function(root){
  'use strict';
  const DB_NAME='qingxun-records',DB_VERSION=1,STORE='documents',LEGACY_KEY='qingxun-v1';
  function copy(value){return JSON.parse(JSON.stringify(value));}
  const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
  function validState(value){
    if(!plain(value)||!plain(value.days)||!Array.isArray(value.videos))return false;
    return Object.entries(value.days).every(([date,day])=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&plain(day)&&Array.isArray(day.meals));
  }
  function clean(value,depth=0){
    if(depth>18)throw Error('备份层级过深');
    if(Array.isArray(value))return value.map(v=>clean(v,depth+1));
    if(plain(value))return Object.fromEntries(Object.entries(value).filter(([k])=>!['__proto__','prototype','constructor'].includes(k)).map(([k,v])=>[k,clean(v,depth+1)]));
    return value;
  }
  function readBackup(input){
    const parsed=typeof input==='string'?JSON.parse(input):input;
    if(parsed?.format!=='qingxun-backup'||parsed.version!==1||!validState(parsed.data))throw Error('不是有效的轻循备份文件');
    return clean(parsed.data);
  }
  function unique(items,key){return [...new Map(items.map(v=>[key(v),v])).values()];}
  const recorded=day=>day&&(day.water||day.exercise||day.weight||day.symptom||day.energy||day.meals?.length||Object.keys(day.measurements||{}).length);
  function mergeStates(current,incoming){
    const result=copy(current);
    result.profile={...incoming.profile,...Object.fromEntries(Object.entries(current.profile||{}).filter(([,v])=>v!==''&&v!=null))};
    result.days={...copy(incoming.days),...copy(current.days)};
    for(const [date,old] of Object.entries(incoming.days)){
      const now=current.days[date];if(!recorded(now)){result.days[date]=copy(old);continue;}
      result.days[date]={...old,...now,measurements:{...old.measurements,...now.measurements},meals:unique([...(old.meals||[]),...(now.meals||[])],m=>m.id||JSON.stringify([m.type,m.name,m.amount,m.time,m.kcal,m.photo]))};
      // Imported meals require the user to confirm the day's intake again.
      if(result.days[date].meals.length!==(now.meals||[]).length)result.days[date].intakeComplete=false;
      if(old.trainingVideos||now.trainingVideos)result.days[date].trainingVideos=unique([...(old.trainingVideos||[]),...(now.trainingVideos||[])],v=>v.id);
    }
    result.videos=unique([...(incoming.videos||[]),...(current.videos||[])],v=>v.url);
    const records=c=>c?.records|| (c?.start?[{start:c.start,length:c.length,duration:c.duration}]:[]);
    const cycles=unique([...records(incoming.cycle),...records(current.cycle)],v=>v.start).sort((a,b)=>a.start.localeCompare(b.start));
    if(cycles.length)result.cycle={...cycles[cycles.length-1],records:cycles};
    result.reminders={...incoming.reminders,...current.reminders};
    return clean(result);
  }
  function createStorage(environment=root){
    let database,revision=0,lastSavedAt=null,error=null,recovered=false;
    function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
    async function open(){
      if(database)return database;
      if(!environment.indexedDB)throw Error('当前浏览器不支持本机数据库');
      const req=environment.indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
      database=await request(req);
      database.onversionchange=()=>{database.close();database=null;};
      return database;
    }
    async function load(){
      let legacy;
      try{const raw=environment.localStorage?.getItem(LEGACY_KEY);if(raw){legacy=JSON.parse(raw);if(!validState(legacy))legacy=null;}}catch{}
      try{
        const db=await open(),tx=db.transaction(STORE,'readonly'),records=await request(tx.objectStore(STORE).getAll());
        const valid=records.filter(r=>validState(r?.data)).sort((a,b)=>b.revision-a.revision);
        const latest=valid[0];
        if(latest){revision=latest.revision;lastSavedAt=latest.savedAt;recovered=latest.kind==='backup';return copy(latest.data);}
        if(records.length&&!legacy)throw Error('本机记录无法读取，请从导出文件恢复；原数据已保留');
        if(legacy){await save(legacy);return copy(legacy);}
        return null;
      }catch(e){error=e;return legacy?copy(legacy):null;}
    }
    async function save(value){
      if(error)throw error;
      if(!validState(value))throw Error('数据格式不正确，未写入数据库');
      const data=copy(value),db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);let failure;
        const req=store.get('current');
        req.onsuccess=()=>{
          const previous=req.result;
          if(previous&&previous.revision!==revision){failure=Error('另一个页面已更新记录，请刷新页面后重试');tx.abort();return;}
          const next=revision+1,savedAt=new Date().toISOString();
          if(previous&&validState(previous.data))store.put({...previous,kind:'backup'},'backup-'+(previous.revision%5));
          store.put({kind:'current',revision:next,savedAt,data},'current');
          tx.oncomplete=()=>{revision=next;lastSavedAt=savedAt;resolve({revision,savedAt});};
        };
        tx.onabort=()=>reject(failure||tx.error||Error('本机数据库未能完成写入'));
        tx.onerror=()=>{failure=tx.error;};
      });
    }
    const api={load,save,export(data){return {format:'qingxun-backup',version:1,exportedAt:new Date().toISOString(),data:copy(data)};},get info(){return {available:!!database&&!error,lastSavedAt,recovered,error:error?.message||null};}};
    return api;
  }
  const api={createStorage,readBackup,mergeStates,validState};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.QingxunStorage=api;
})(typeof globalThis!=='undefined'?globalThis:this);
