const test = require('node:test');
const assert = require('node:assert/strict');
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
// These fixtures model direct TCP requests; do not inherit the build host's
// VERCEL flag. Trusted edge identities are exercised in rate-security.test.js.
process.env.VERCEL = '0';
Object.assign(process.env, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'service-test', FOOTBALL_API_KEY: 'football-test', CRON_SECRET: 'cron-test', VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey });
process.env.RATE_LIMIT_SECRET = 'a'.repeat(32);
const subscribe = require('../api/subscribe');
const cron = require('../api/cron-alerts');
function response() { return { code: 200, setHeader() {}, status(n) { this.code=n; return this; }, json(body) { this.body=body; return this; }, end() {} }; }
const valid = () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: keys.publicKey, auth: Buffer.alloc(16, 1).toString('base64url'), favorite_teams: [1], preferences: { goals: true } });

test('Chromium legacy Google push endpoint is accepted without broadening Google access', () => {
  const { validEndpoint, validateBody } = require('../lib/push-security');
  const endpoint = 'https://jmt17.google.com/fcm/send/browser-token';
  assert.equal(validEndpoint(endpoint), true);
  assert.equal(validateBody({ ...valid(), endpoint }).endpoint, endpoint);
  for (const rejected of [
    'https://jmt17.google.com.evil.test/fcm/send/token',
    'https://other.google.com/fcm/send/token',
    'https://jmt17.google.com/private',
    'https://jmt17.google.com/fcm/send/',
    'https://jmt17.google.com/fcm/send/token?redirect=https://evil.test',
    'http://jmt17.google.com/fcm/send/token',
    'https://user@jmt17.google.com/fcm/send/token',
    'https://jmt17.google.com:8443/fcm/send/token',
    'https://jmt17.google.com/fcm/send/token#fragment',
  ]) assert.equal(validEndpoint(rejected), false, rejected);
});

test('legacy Chromium subscription can be saved and tested through the handler', async () => {
  const original = webpush.sendNotification;
  const endpoint = 'https://jmt17.google.com/fcm/send/browser-token';
  let saved = false; let delivered = false;
  global.fetch = async (url, options) => {
    if (url.endsWith('/consume_request_limit')) return new Response('{"allowed":true,"retry_after":3600}');
    assert.ok(url.endsWith('/save_push_subscription'));
    assert.equal(JSON.parse(options.body).p_endpoint, endpoint);
    saved = true; return new Response('true');
  };
  webpush.sendNotification = async subscription => { assert.equal(subscription.endpoint, endpoint); delivered = true; };
  try {
    const res = response();
    await subscribe({ method: 'POST', headers: {}, socket: { remoteAddress: '192.0.2.1' }, body: { ...valid(), endpoint, test: true } }, res);
    assert.equal(res.code, 200); assert.equal(saved, true); assert.equal(delivered, true);
  } finally { webpush.sendNotification = original; }
});
test('spoofed Vercel cron header cannot authorize delivery', async () => {
  const res=response(); global.fetch=async()=>{ throw Error('unexpected network'); };
  await cron({method:'GET',headers:{'x-vercel-cron':'1'}},res);
  assert.equal(res.code,401);
});
test('subscription rejects arbitrary outbound endpoints', async () => {
  global.fetch=async()=>new Response('true',{status:200});
  const res=response(); await subscribe({method:'POST',headers:{},body:{...valid(),endpoint:'https://127.0.0.1/private'}},res);
  assert.equal(res.code,400);
});
test('database failure cannot report subscription saved', async () => {
  let attemptedSave = false;
  global.fetch=async(url)=> {
    if (url.endsWith('/consume_request_limit')) return new Response('{"allowed":true,"retry_after":3600}');
    attemptedSave = true; return new Response('{"message":"database unavailable"}',{status:503});
  };
  const res=response(); await subscribe({method:'POST',headers:{},socket:{remoteAddress:'192.0.2.1'},body:valid()},res);
  assert.ok(res.code>=500); assert.equal(attemptedSave, true);
});
test('subscription rejects unexpected payload fields', async () => {
  const res=response(); await subscribe({method:'POST',headers:{},body:{...valid(),admin:true}},res);
  assert.equal(res.code,400);
});
test('subscription canonical keys, favorites and booleans are checked before network', async () => {
  global.fetch=async()=>{throw Error('unexpected network');};
  for (const body of [{...valid(),auth:'x'}, {...valid(),p256dh:Buffer.alloc(65,4).toString('base64url')}, {...valid(),favorite_teams:Array(51).fill(1)}, {...valid(),preferences:{goals:'true'}}, {...valid(),preferences:{favorite_fixtures:Array(101).fill(1)}}, {...valid(),test:'yes'}, {...valid(),auth:valid().auth+'='}]) {
    const res=response(); await subscribe({method:'POST',headers:{},body},res); assert.equal(res.code,400);
  }
});
test('GET exposes only configured public VAPID key and never queries subscribers', async () => {
  global.fetch=async()=>{throw Error('unexpected network');};
  const res=response(); await subscribe({method:'GET',headers:{authorization:'Bearer cron-test'}},res);
  assert.deepEqual(res.body,{vapidPublicKey:keys.publicKey});
});
test('POST uses one ownership-preserving RPC and cannot pass client delivery history', async () => {
  const writes=[];
  global.fetch=async(url,options)=>{
    if(url.endsWith('/consume_request_limit')) return new Response('{"allowed":true,"retry_after":3600}');
    writes.push({url,method:options.method,body:JSON.parse(options.body)}); return new Response('true');
  };
  const res=response(); await subscribe({method:'POST',headers:{},socket:{remoteAddress:'192.0.2.1'},body:{...valid(),preferences:{goals:false,sent_events:[]}}},res);
  assert.equal(res.code,200); assert.equal(writes.length,1); assert.ok(writes[0].url.endsWith('/rpc/save_push_subscription'));
  assert.deepEqual(writes[0].body.p_preferences,{goals:false}); assert.equal(writes[0].method,'POST');
});
test('ownership collision is forbidden and does not trigger a push', async () => {
  const original=webpush.sendNotification; let pushed=false; webpush.sendNotification=async()=>{pushed=true;};
  global.fetch=async url=>new Response(url.endsWith('/consume_request_limit')?'{"allowed":true,"retry_after":3600}':'false');
  try { const res=response(); await subscribe({method:'POST',headers:{},socket:{remoteAddress:'192.0.2.1'},body:{...valid(),test:true}},res); assert.equal(res.code,403); assert.equal(pushed,false); } finally {webpush.sendNotification=original;}
});
test('test sends obey their separate budget before saving or sending', async () => {
  let saved=false;
  global.fetch=async(url,options)=>{
    if(!url.endsWith('/consume_request_limit')) {saved=true;return new Response('true');}
    const input=JSON.parse(options.body); return new Response(JSON.stringify({allowed:input.p_scope!=='push-test',retry_after:3600}));
  };
  const res=response(); await subscribe({method:'POST',headers:{},socket:{remoteAddress:'192.0.2.1'},body:{...valid(),test:true}},res);
  assert.equal(res.code,429); assert.equal(saved,false);
});
test('cron requires service role key even if anon key exists', async () => {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY; process.env.SUPABASE_ANON_KEY='anon';
  try { const res=response(); await cron({method:'GET',headers:{authorization:'Bearer cron-test'}},res); assert.equal(res.code,503); }
  finally {process.env.SUPABASE_SERVICE_ROLE_KEY=key;}
});
test('cron propagates upstream errors and releases its acquired lease', async () => {
  let released=false;
  global.fetch=async url=>{
    if(url.endsWith('/acquire_push_run')) return new Response('[{"cursor_endpoint":""}]');
    if(url.includes('/push_subscriptions?')) return new Response(JSON.stringify([valid()]));
    if(url.endsWith('/consume_request_limit')) return new Response('{"allowed":true,"retry_after":86400}');
    if(url.endsWith('/release_push_run')) {released=true; return new Response('true');}
    return new Response('{"errors":{"quota":"exhausted"},"response":[]}');
  };
  const res=response(); await cron({method:'GET',headers:{authorization:'Bearer cron-test'}},res);
  assert.equal(res.code,502); assert.equal(res.body.success,false); assert.equal(released,true);
});
test('a bounded cron resumes within a subscriber instead of starving later fixtures', async () => {
  let released;
  global.fetch=async(url,options)=>{
    if(url.endsWith('/acquire_push_run')) return new Response(JSON.stringify([{cursor_endpoint:'',active_endpoint:valid().endpoint,cursor_fixture:2}]));
    if(url.includes('/push_subscriptions?')) return new Response(JSON.stringify([valid()]));
    if(url.endsWith('/consume_request_limit')) return new Response('{"allowed":true,"retry_after":86400}');
    if(url.endsWith('/release_push_run')) {released=JSON.parse(options.body);return new Response('true');}
    if(url.endsWith('/claim_push_event')) {
      assert.equal(JSON.parse(options.body).p_event,'fulltime-3'); return new Response('false');
    }
    return new Response(JSON.stringify({errors:[],response:[1,2,3].map(id=>({fixture:{id,status:{short:'FT',elapsed:90}},teams:{home:{id:1,name:'A'},away:{id:2,name:'B'}},goals:{home:1,away:0}}))}));
  };
  const res=response();await cron({method:'GET',headers:{authorization:'Bearer cron-test'}},res);
  assert.equal(res.code,200);assert.equal(res.body.completed,true);assert.equal(released.p_fixture,0);assert.equal(released.p_active,'');
});
test('unknown provider delivery is recorded and cannot be reported as sent', async () => {
  const original=webpush.sendNotification; let outcome;
  webpush.sendNotification=async()=>{throw Object.assign(new Error('connection reset'),{code:'ECONNRESET'});};
  global.fetch=async(url,options)=>{
    if(url.endsWith('/acquire_push_run')) return new Response('[{"cursor_endpoint":""}]');
    if(url.includes('/push_subscriptions?')) return new Response(JSON.stringify([valid()]));
    if(url.endsWith('/consume_request_limit')) return new Response('{"allowed":true,"retry_after":86400}');
    if(url.endsWith('/release_push_run')||url.endsWith('/claim_push_event')) return new Response('true');
    if(url.endsWith('/finish_push_event')) {outcome=JSON.parse(options.body).p_status;return new Response('true');}
    return new Response(JSON.stringify({response:[{fixture:{id:1,status:{short:'FT',elapsed:90}},teams:{home:{id:1,name:'A'},away:{id:2,name:'B'}},goals:{home:1,away:0}}]}));
  };
  try {
    const res=response();await cron({method:'GET',headers:{authorization:'Bearer cron-test'}},res);
    assert.equal(res.code,200);assert.equal(res.body.notificationsSent,0);assert.equal(res.body.deliveryUnknown,1);assert.equal(outcome,'unknown');
  } finally {webpush.sendNotification=original;}
});
test('cron pages subscriptions and skips forged endpoints already in database', async () => {
  let pages=0;let claims=0;
  const subs=Array.from({length:51},(_,index)=>({...valid(),endpoint:`https://fcm.googleapis.com/fcm/send/${String(index).padStart(3,'0')}`}));
  subs[25].endpoint='https://localhost/private';
  global.fetch=async(url)=>{
    if(url.endsWith('/acquire_push_run')) return new Response('[{"cursor_endpoint":""}]');
    if(url.includes('/push_subscriptions?')) {pages++;return new Response(JSON.stringify(pages===1?subs.slice(0,50):subs.slice(50)));}
    if(url.endsWith('/consume_request_limit')) return new Response('{"allowed":true,"retry_after":86400}');
    if(url.endsWith('/release_push_run')) return new Response('true');
    if(url.endsWith('/claim_push_event')) {claims++;return new Response('false');}
    return new Response(JSON.stringify({response:[{fixture:{id:1,status:{short:'FT',elapsed:90}},teams:{home:{id:1,name:'A'},away:{id:2,name:'B'}},goals:{home:1,away:0}}]}));
  };
  const res=response();await cron({method:'GET',headers:{authorization:'Bearer cron-test'}},res);
  assert.equal(res.code,200);assert.equal(res.body.completed,true);assert.equal(pages,2);assert.equal(res.body.invalidSubscriptions,1);assert.equal(claims,50);
});
test('DELETE without ownership credential fails before database', async () => {
  let network=0; global.fetch=async()=>{network++;return new Response('[]',{status:200});};
  const res=response(); await subscribe({method:'DELETE',headers:{},body:{endpoint:valid().endpoint}},res);
  assert.equal(res.code,400); assert.equal(network,0);
});
