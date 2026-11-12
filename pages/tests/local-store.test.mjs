import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';

let instance = 0;
const databaseName = 'huabu-artwork-ledger-v1';
const work = (id = 'work-a', title = '春日花园') => ({id, title, createdDate:'2024', image:'', notes:''});
const deal = (id = 'deal-a', workId = 'work-a') => ({id, workId, kind:'license', client:'测试出版社', domain:'出版', amount:2800, paid:1400, soldDate:'2025', startDate:'2025-11-27', endDate:'2026-11-26', perpetual:false, exclusive:false, notes:''});
async function freshModule() {
  return (await import(new URL(`../local-store.mjs?test=${++instance}`, import.meta.url))).localApi;
}
async function setup(t) {
  // Each test owns an in-memory factory. No browser or user database is accessed.
  const factory = new IDBFactory();
  globalThis.indexedDB = factory;
  t.after(async () => {
    await new Promise((resolve,reject) => {
      const request = factory.deleteDatabase(databaseName);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Adapter did not close on versionchange'));
    });
  });
  return freshModule();
}

test('records survive independent adapter reload and retain date precision without private fields', async (t) => {
  const api = await setup(t);
  assert.deepEqual(await api('/api/ledger'), {works:[],deals:[]});
  await api('/api/works','POST',work());
  await api('/api/deals','POST',deal());
  const reopened = await freshModule();
  assert.deepEqual(await reopened('/api/ledger'), {works:[work()],deals:[deal()]});
});

test('create/update preserves insertion order and updates referenced cooperation', async (t) => {
  const api = await setup(t);
  await api('/api/works','POST',work());
  await api('/api/works','POST',work('work-b','晚风'));
  await api('/api/deals','POST',deal());
  await api('/api/works','PUT',work('work-a','花园改名'));
  await api('/api/deals','PUT',{...deal(),amount:3600,paid:1800});
  const ledger = await api('/api/ledger');
  assert.deepEqual(ledger.works.map(w=>w.id),['work-b','work-a']);
  assert.equal(ledger.works[1].title,'花园改名');
  assert.equal(ledger.deals[0].amount,3600);
  assert.equal(ledger.deals[0].paid,1800);
  await assert.rejects(api('/api/works','PUT',work('absent')),/不存在/);
});

test('duplicate work/deal creation rejects and leaves original records intact', async (t) => {
  const api = await setup(t);
  await api('/api/works','POST',work());
  await api('/api/deals','POST',deal());
  await assert.rejects(api('/api/works','POST',work('work-a','应被拒绝')),/已经存在/);
  await assert.rejects(api('/api/deals','POST',{...deal(),amount:9900}),/已经存在/);
  assert.deepEqual(await api('/api/ledger'),{works:[work()],deals:[deal()]});
});

test('orphan deals cannot be created or introduced through updates', async (t) => {
  const api = await setup(t);
  await assert.rejects(api('/api/deals','POST',deal()),/作品/);
  await api('/api/works','POST',work());
  await api('/api/deals','POST',deal());
  await assert.rejects(api('/api/deals','PUT',deal('deal-a','missing-work')),/作品/);
  assert.deepEqual(await api('/api/ledger'),{works:[work()],deals:[deal()]});
});

test('work deletion is blocked while any cooperation remains', async (t) => {
  const api = await setup(t);
  await api('/api/works','POST',work());
  await api('/api/deals','POST',deal());
  await api('/api/deals','POST',deal('deal-b'));
  await assert.rejects(api('/api/works?id=work-a','DELETE'),/还有约稿或授权记录/);
  await api('/api/deals?id=deal-a','DELETE');
  await assert.rejects(api('/api/works?id=work-a','DELETE'),/还有约稿或授权记录/);
  await api('/api/deals?id=deal-b','DELETE');
  assert.deepEqual(await api('/api/works?id=work-a','DELETE'),{ok:true});
  assert.deepEqual(await api('/api/ledger'),{works:[],deals:[]});
});

test('backup import merges IDs, retains unrelated records, and is repeatable', async (t) => {
  const api = await setup(t);
  await api('/api/works','POST',work());
  await api('/api/works','POST',work('retained'));
  await api('/api/deals','POST',deal());
  const backup={version:1,works:[work('work-a','已恢复'),work('new-work')],deals:[{...deal(),amount:4200},deal('new-deal','new-work')]};
  assert.deepEqual(await api('/api/import','POST',backup),{ok:true,works:2,deals:2});
  const first=await api('/api/ledger');
  await api('/api/import','POST',backup);
  assert.deepEqual(await api('/api/ledger'),first);
  assert.equal(first.works.length,3);
  assert.equal(first.deals.length,2);
  assert.equal(first.works.find(w=>w.id==='work-a').title,'已恢复');
  assert.equal(first.deals.find(d=>d.id==='deal-a').amount,4200);
});

test('invalid backup or invalid financial/calendar values leave all existing data untouched', async (t) => {
  const api=await setup(t);
  await api('/api/works','POST',work());
  await api('/api/deals','POST',deal());
  const before=await api('/api/ledger');
  await assert.rejects(api('/api/import','POST',{works:[work('work-a','不应保存')],deals:[deal('new','missing')]}),/没有对应的作品/);
  await assert.rejects(api('/api/import','POST',{works:[work(),work()],deals:[]}),/重复/);
  await assert.rejects(api('/api/deals','PUT',{...deal(),paid:2800.01}),/不能超过/);
  await assert.rejects(api('/api/works','PUT',{...work(),createdDate:'2026-02-30'}),/有效的日期/);
  assert.deepEqual(await api('/api/ledger'),before);
});

test('a storage failure after queued import writes rolls back the whole transaction', async (t) => {
  const api=await setup(t);
  await api('/api/works','POST',work());
  await api('/api/deals','POST',deal());
  const before=await api('/api/ledger');
  const originalPut=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,...args){
    // Duplicate-key failure occurs after the earlier update request has run.
    if(value.id==='force-storage-failure') return this.add({...value,id:'work-a'});
    return originalPut.call(this,value,...args);
  };
  try {
    await assert.rejects(api('/api/import','POST',{version:1,works:[work('work-a','不应留下部分更新'),work('force-storage-failure')],deals:[]}),/已经存在/);
  } finally { IDBObjectStore.prototype.put=originalPut; }
  assert.deepEqual(await api('/api/ledger'),before);
});

test('concurrent tabs cannot delete a work and leave an orphan cooperation', async (t) => {
  const first=await setup(t);
  const second=await freshModule();
  await first('/api/works','POST',work());
  const outcomes=await Promise.allSettled([
    first('/api/deals','POST',deal()),
    second('/api/works?id=work-a','DELETE'),
  ]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  const ledger=await first('/api/ledger');
  assert.ok(ledger.deals.every(d=>ledger.works.some(w=>w.id===d.workId)));
});
