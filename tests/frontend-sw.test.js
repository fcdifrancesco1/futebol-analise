const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function worker(fetcher=async()=>new Response('ok')) {
  const events={},puts=[];
  const cache={put:async(...args)=>puts.push(args),match:async()=>undefined,keys:async()=>[],addAll:async()=>{}};
  const self={addEventListener:(name,fn)=>events[name]=fn,location:{origin:'https://example.com'},clients:{claim:async()=>{}},skipWaiting:()=>{}};
  vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),{self,URL,Response,fetch:fetcher,caches:{open:async()=>cache,match:async()=>undefined,keys:async()=>[]},console,Set});
  return {events,puts};
}
test('service worker ignores cross-origin requests, mutations and API requests',()=>{
  const {events}=worker();
  for(const [url,method] of [['https://other.test/a.png','GET'],['https://example.com/style.css','POST'],['https://example.com/api/football','GET'],['https://example.com/unknown.png','GET']]) {
    let handled=false;
    events.fetch({request:{url,method,mode:'cors'},respondWith:()=>handled=true});
    assert.equal(handled,false,url);
  }
});
test('failed HTTP responses are not cached as application assets',async()=>{
  const {events,puts}=worker(async()=>new Response('failure',{status:500}));
  let work;
  events.fetch({request:{url:'https://example.com/style.css',method:'GET',mode:'cors'},respondWith:p=>work=p,waitUntil:()=>{}});
  await work; assert.equal(puts.length,0);
});
test('offline uncached asset returns a response instead of undefined',async()=>{
  const {events}=worker(async()=>{throw Error('offline')}); let work;
  events.fetch({request:{url:'https://example.com/style.css',method:'GET',mode:'cors'},respondWith:p=>work=p,waitUntil:()=>{}});
  const response=await work;
  assert.ok(response instanceof Response); assert.equal(response.status,503);
});
test('new layout stylesheet is cached as an application asset',async()=>{
  const {events,puts}=worker(); let work;
  events.fetch({request:{url:'https://example.com/css/redesign.css?v=106',method:'GET',mode:'cors'},respondWith:p=>work=p});
  assert.ok(work,'layout stylesheet must be handled by the service worker');
  await work;
  assert.equal(puts.length,1);
});
