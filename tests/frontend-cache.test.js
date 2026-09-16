const test = require('node:test');
const assert = require('node:assert/strict');
const { createApiClient, cacheKey, safeReadStorage } = require('../public/js/cache.js');
test('equivalent parameter ordering shares one pending request and invalidation removes it', async () => {
  let calls=0;
  const api=createApiClient({fetch:async()=>{calls++;return {ok:true,json:async()=>({response:[calls]})}},storage:null});
  const [a,b]=await Promise.all([api.get('teams',{season:2026,league:71}),api.get('teams',{league:71,season:2026})]);
  assert.equal(calls,1); assert.deepEqual(a,b);
  api.invalidate('teams',{league:71,season:2026});
  await api.get('teams',{season:2026,league:71}); assert.equal(calls,2);
  assert.equal(cacheKey('teams',{search:'',league:71}),cacheKey('teams',{league:71}));
});
test('player data and empty lineups refresh within sixty seconds', async()=>{
  let now=0,calls=0;
  const api=createApiClient({now:()=>now,fetch:async()=>{calls++;return {ok:true,json:async()=>({response:[]})}},storage:null});
  await api.get('fixtures/players',{fixture:1},60);
  now=60000; await api.get('fixtures/players',{fixture:1},60); assert.equal(calls,2);
  await api.get('fixtures/lineups',{fixture:1},60);
  now+=59000; await api.get('fixtures/lineups',{fixture:1},60); assert.equal(calls,3);
  now+=1000; await api.get('fixtures/lineups',{fixture:1},60); assert.equal(calls,4);
});
test('aborted route request cannot return a late response or poison next route cache',async()=>{
  const controller=new AbortController(); let finish;
  const api=createApiClient({fetch:()=>new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>({response:[1]})})),storage:null});
  const pending=api.get('teams',{},15,controller.signal);
  controller.abort(); finish();
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(api.cache.size,0);
});
test('invalid storage JSON, null, wrong shapes and blocked storage fall back safely',()=>{
  for(const value of ['{','null','{}','42']) assert.deepEqual(safeReadStorage({getItem:()=>value},'key',[]),[]);
  assert.deepEqual(safeReadStorage({getItem:()=>{throw Error('blocked')}},'key',[]),[]);
});
test('stored boolean preference preserves false and true without object coercion',()=>{
  assert.equal(safeReadStorage({getItem:()=> 'false'},'disabled',false),false);
  assert.equal(safeReadStorage({getItem:()=> 'true'},'disabled',false),true);
});
test('forced refresh with ttl zero updates cache and storage with latest data', async () => {
  let calls = 0;
  const store = new Map();
  const mockStorage = {
    getItem: k => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k),
    key: i => Array.from(store.keys())[i],
    get length() { return store.size; }
  };
  const api = createApiClient({
    fetch: async () => { calls++; return { ok: true, json: async () => ({ response: [{ callId: calls }] }) }; },
    storage: mockStorage
  });

  const res1 = await api.get('fixtures', { live: 'all' }, 5);
  assert.equal(res1[0].callId, 1);

  // Forced refresh bypassing cache (ttl = 0)
  const res2 = await api.get('fixtures', { live: 'all' }, 0);
  assert.equal(calls, 2);
  assert.equal(res2[0].callId, 2);

  // Subsequent normal read within TTL receives the newly refreshed data without calling network again
  const res3 = await api.get('fixtures', { live: 'all' }, 5);
  assert.equal(calls, 2);
  assert.equal(res3[0].callId, 2);

  // Invalidate all clears storage keys
  api.invalidateAll();
  assert.equal(store.size, 0);
});
