const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {enforceRateLimit,consumeGlobalBudget}=require('../lib/request-security');
const {fetchBounded}=require('../lib/http');
const originalEnv={...process.env}, originalFetch=global.fetch;
const req={headers:{'x-forwarded-for':'203.0.113.99'},socket:{remoteAddress:'192.0.2.10'}};
const options={scope:'test',limit:2,windowSeconds:60};
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;}});
const json=value=>new Response(JSON.stringify(value));
beforeEach(()=>{Object.assign(process.env,{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only',RATE_LIMIT_SECRET:'a-secret-with-at-least-32-characters'});delete process.env.VERCEL;});
afterEach(()=>{global.fetch=originalFetch;process.env={...originalEnv};});
test('local caller cannot spoof identity with forwarded headers; RPC stores only HMAC',async()=>{
  let payload;
  global.fetch=async(_,config)=>{payload=JSON.parse(config.body);return json({allowed:true,retry_after:60});};
  assert.equal(await enforceRateLimit(req,response(),options),true);
  assert.equal(payload.p_subject,createHmac('sha256',process.env.RATE_LIMIT_SECRET).update('192.0.2.10').digest('hex'));
  assert.doesNotMatch(JSON.stringify(payload),/192\.0\.2|203\.0\.113/);
});
test('Vercel uses its edge header and rejects missing, multiple or malformed identities',async()=>{
  process.env.VERCEL='1'; let subjects=[];
  global.fetch=async(_,config)=>{subjects.push(JSON.parse(config.body).p_subject);return json({allowed:true,retry_after:60});};
  const trusted={...req,headers:{...req.headers,'x-vercel-forwarded-for':'2001:db8::1'}};
  assert.equal(await enforceRateLimit(trusted,response(),options),true);
  trusted.headers['x-vercel-forwarded-for']='2001:0db8:0:0:0:0:0:1';
  assert.equal(await enforceRateLimit(trusted,response(),options),true);assert.equal(subjects[0],subjects[1]);
  for(const value of [undefined,'bad','192.0.2.1, 192.0.2.2',['192.0.2.1']]){
    const res=response();trusted.headers['x-vercel-forwarded-for']=value;
    assert.equal(await enforceRateLimit(trusted,res,options),false);assert.equal(res.code,503);
  }
});
test('distributed denial returns 429 and bounded Retry-After; malformed RPC fails closed',async()=>{
  global.fetch=async()=>json({allowed:false,retry_after:17});
  const res=response();assert.equal(await enforceRateLimit(req,res,options),false);assert.equal(res.code,429);assert.equal(res.headers['Retry-After'],'17');
  for(const body of [{allowed:'true',retry_after:1},{allowed:true,retry_after:0},{allowed:true,retry_after:999}]){
    global.fetch=async()=>json(body);const invalid=response();assert.equal(await enforceRateLimit(req,invalid,options),false);assert.equal(invalid.code,503);
  }
});
test('global budget uses one shared daily identity, reads configured ceiling, and rejects invalid config',async()=>{
  let payload;process.env.FOOTBALL_DAILY_BUDGET='7000';
  global.fetch=async(_,config)=>{payload=JSON.parse(config.body);return json({allowed:false,retry_after:80000});};
  assert.deepEqual(await consumeGlobalBudget(),{allowed:false,retryAfter:80000});
  assert.deepEqual(payload,{p_scope:'football-global',p_subject:'global',p_limit:7000,p_window_seconds:86400});
  process.env.FOOTBALL_DAILY_BUDGET='0';await assert.rejects(consumeGlobalBudget());
});
test('bounded fetch cancels streamed bodies exceeding the limit without content-length',async()=>{
  let cancelled=false;
  global.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(5));c.enqueue(new Uint8Array(5));},cancel(){cancelled=true;}}));
  await assert.rejects(fetchBounded('https://example.com',{}, {maxBytes:8}),/too large/);assert.equal(cancelled,true);
});
test('bounded fetch deadline covers a stalled body, not only response headers',async()=>{
  global.fetch=async(_,config)=>new Response(new ReadableStream({start(c){config.signal.addEventListener('abort',()=>c.error(new Error('body aborted')));}}));
  await assert.rejects(fetchBounded('https://example.com',{}, {timeoutMs:10}),/aborted/);
});
