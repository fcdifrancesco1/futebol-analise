const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const realFetch = global.fetch;
const originalEnv = { ...process.env };
function response() {
  return { statusCode: 200, headers: {}, status(n) { this.statusCode = n; return this; }, setHeader(k,v) { this.headers[k.toLowerCase()] = v; }, json(v) { this.body = v; return this; }, send(v) { this.body = v; return this; } };
}
function request(query, method = 'GET') { return { method, query, headers: {}, socket: { remoteAddress: '192.0.2.10' } }; }
function handler(name) { delete require.cache[require.resolve(`../api/${name}`)]; return require(`../api/${name}`); }
beforeEach(() => {
  process.env.FOOTBALL_API_KEY = 'test'; process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service'; process.env.RATE_LIMIT_SECRET = 'test-secret-is-at-least-32-characters';
  delete process.env.VERCEL;
});
afterEach(() => { global.fetch = realFetch; process.env = { ...originalEnv }; });
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function allowRpc(url) { return String(url).includes('/rest/v1/rpc/'); }
test('all read proxies reject POST before any upstream request', async () => {
  global.fetch = async () => json({ response: [] });
  for (const name of ['football','news','img']) {
    const res = response(); await handler(name)(request({endpoint:'fixtures',live:'all',team:'Santos',url:'https://media.api-sports.io/football/teams/1.png'}, 'POST'),res);
    assert.equal(res.statusCode,405); assert.equal(res.headers.allow,'GET');
  }
});
test('football rejects unknown query keys and non-scalar or out-of-range values', async () => {
  global.fetch = async () => json({ response: [] });
  for (const query of [{endpoint:'fixtures',bogus:'1'}, {endpoint:'fixtures',id:['1','2']}, {endpoint:'fixtures',last:'10000'}, {endpoint:'teams',search:'a'}]) {
    const res = response(); await handler('football')(request(query),res); assert.equal(res.statusCode,400);
  }
});
test('football fails closed when distributed limiter is unavailable', async () => {
  global.fetch = async () => { throw Error('database offline'); };
  const res=response(); await handler('football')(request({endpoint:'fixtures',live:'all'}),res);
  assert.equal(res.statusCode,503); assert.equal(res.headers['cache-control'],'no-store');
});
test('global budget denial prevents paid football fetch', async () => {
  let paid=0;
  global.fetch=async (url,opts) => { if (allowRpc(url)) return json({allowed:JSON.parse(opts.body).p_scope !== 'football-global',retry_after:30}); paid++; return json({errors:[],response:[]}); };
  const res=response(); await handler('football')(request({endpoint:'fixtures',live:'all'}),res);
  assert.equal(res.statusCode,429); assert.equal(paid,0);
});
test('live football caches at most 15 seconds and local cache avoids second paid call', async () => {
  let paid=0;
  global.fetch=async url => { if(allowRpc(url)) return json({allowed:true,retry_after:1}); paid++; return json({errors:[],response:[]}); };
  const run=handler('football');
  for(let i=0;i<2;i++){ const res=response(); await run(request({endpoint:'fixtures',live:'all'}),res); assert.equal(res.statusCode,200); assert.match(res.headers['cache-control'],/s-maxage=(10|15)(?:,|$)/); }
  assert.equal(paid,1);
});
test('upstream application errors never get success caching', async () => {
  global.fetch=async url => allowRpc(url) ? json({allowed:true,retry_after:1}) : json({errors:{requests:'quota exceeded'},response:[]});
  const res=response(); await handler('football')(request({endpoint:'fixtures',live:'all'}),res);
  assert.equal(res.statusCode,502); assert.equal(res.headers['cache-control'],'no-store');
});
test('image proxy refuses redirects, HTML and oversized responses', async () => {
  for (const upstream of [new Response(null,{status:302,headers:{location:'http://127.0.0.1'}}),new Response('<html>',{headers:{'content-type':'text/html'}}),new Response('x',{headers:{'content-type':'image/png','content-length':'999999999'}})]) {
    global.fetch=async url => allowRpc(url) ? json({allowed:true,retry_after:1}) : upstream;
    const res=response(); await handler('img')(request({url:'https://media.api-sports.io/football/teams/1.png'}),res);
    assert.equal(res.statusCode,502); assert.equal(res.headers['cache-control'],'no-store');
  }
});
test('image proxy only allows approved football asset paths', async () => {
  global.fetch=async()=>new Response('x',{headers:{'content-type':'image/png'}});
  for(const url of ['https://media.api-sports.io/private/file.png','https://media.api-sports.io/football/teams/1.png?x=1','https://media.api-sports.io/football/teams/1.svg']){
    const res=response(); await handler('img')(request({url}),res); assert.equal(res.statusCode,400);
  }
});
test('news does not substring-match Inter Miami to Internacional and decodes XML', async () => {
  let query;
  global.fetch=async url => { if(allowRpc(url)) return json({allowed:true,retry_after:1}); query=new URL(url).searchParams.get('q'); return new Response('<rss><channel><item><title><![CDATA[Inter Miami\nvence]]> &#x26; avança - Fonte &amp; Cia</title><link>https://example.com/a?x=1&amp;y=2</link><pubDate>invalid</pubDate><source url="https://example.com">Fonte &amp; Cia</source></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>'); };
  const res=response(); await handler('news')(request({team:'Inter Miami'}),res);
  assert.equal(res.statusCode,200); assert.doesNotMatch(query,/Internacional|Internazionale/);
  assert.equal(res.body.items.length,1); assert.equal(res.body.items[0].title,'Inter Miami\nvence & avança');
  assert.equal(res.body.items[0].link,'https://example.com/a?x=1&y=2'); assert.equal(res.body.items[0].timestamp,0);
});
test('news rejects query operators and overlong input', async () => {
  global.fetch=async()=>new Response('<rss><channel></channel></rss>');
  for(const team of ['x'.repeat(121),'Santos" OR politics','a']){ const res=response(); await handler('news')(request({team}),res); assert.equal(res.statusCode,400); }
});
test('football rejects incomplete endpoint filters before spending budget', async () => {
  global.fetch=async url=>allowRpc(url)?json({allowed:true,retry_after:1}):json({errors:[],response:[]});
  for(const query of [
    {endpoint:'players',page:'2'}, {endpoint:'players',id:'42'},
    {endpoint:'fixtures',league:'71'}, {endpoint:'injuries',timezone:'UTC'},
    {endpoint:'odds',bookmaker:'1'},
    {endpoint:'fixtures',team:'1',from:'2024-01-01',to:'2026-12-31'}
  ]) {const res=response();await handler('football')(request(query),res);assert.equal(res.statusCode,400,JSON.stringify(query));}
});
test('football accepts the concrete dashboard query shapes', async () => {
  global.fetch=async url=>allowRpc(url)?json({allowed:true,retry_after:1}):json({errors:[],response:[]});
  for(const query of [
    {endpoint:'teams',search:'São'}, {endpoint:'leagues',team:'127',current:'true'},
    {endpoint:'fixtures',team:'127',next:'5'}, {endpoint:'fixtures',league:'71',season:'2026'},
    {endpoint:'fixtures',date:'2026-09-10',timezone:'America/Sao_Paulo'},
    {endpoint:'fixtures/headtohead',h2h:'127-121',last:'6'},
    {endpoint:'teams/statistics',league:'71',season:'2026',team:'127'},
    {endpoint:'players',id:'42',season:'2026'}, {endpoint:'injuries',team:'127',season:'2026'},
    {endpoint:'fixtures/players',fixture:'1234'}
  ]) {const res=response();await handler('football')(request(query),res);assert.equal(res.statusCode,200,JSON.stringify(query));}
});
