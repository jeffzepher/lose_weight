const {test}=require('node:test');
const assert=require('node:assert/strict');
const {IDBFactory}=require('fake-indexeddb');
const {createStorage}=require('../storage.js');
const record=()=>({profile:{height:165.25,weight:60.55},days:{'2026-10-20':{meals:[{name:'鸡蛋',photo:'data:image/jpeg;base64,abc',kcal:80}],weight:60.55}},videos:[]});
test('migrates legacy records and persists decimals and photos across reloads',async()=>{
  const legacy=record();const env={indexedDB:new IDBFactory(),localStorage:{getItem:()=>JSON.stringify(legacy)}};
  const db=createStorage(env);assert.deepEqual(await db.load(),legacy);assert.equal(db.info.available,true);
  const next=record();next.days['2026-10-20'].weight=59.85;await db.save(next);
  const reloaded=createStorage(env);assert.deepEqual(await reloaded.load(),next);
  assert.equal(legacy.days['2026-10-20'].weight,60.55);
});
test('keeps backups and rejects stale writes from another tab',async()=>{
  const env={indexedDB:new IDBFactory()},one=createStorage(env);await one.load();await one.save(record());
  const two=createStorage(env);await two.load();const updated=record();updated.profile.height=166.75;await one.save(updated);
  await assert.rejects(two.save(record()),/另一个页面/);
  const fresh=createStorage(env);assert.deepEqual(await fresh.load(),updated);
  const db=await new Promise((resolve,reject)=>{const req=env.indexedDB.open('qingxun-records');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  const entries=await new Promise(resolve=>{const req=db.transaction('documents').objectStore('documents').getAll();req.onsuccess=()=>resolve(req.result);});
  assert.ok(entries.some(r=>r.kind==='backup'));db.close();
});
test('database failure preserves legacy records and reports failure instead of claiming to save',async()=>{
  const db=createStorage({localStorage:{getItem:()=>JSON.stringify(record())}});
  assert.deepEqual(await db.load(),record());assert.match(db.info.error,/不支持/);
  await assert.rejects(db.save(record()),/不支持/);
});
