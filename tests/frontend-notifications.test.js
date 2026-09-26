const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function manager(fetcher, extra={}) {
  const context=vm.createContext({fetch:fetcher,state:{favoriteTeams:[],favoriteFixtures:[],notificationPrefs:{goals:true,sent_events:['client-owned']}},console,...extra});
  vm.runInContext(fs.readFileSync('public/js/notifications.js','utf8')+'\nthis.manager=NotificationManager',context);
  return context.manager;
}
test('notification persistence propagates server and network failures',async()=>{
  const rejected=manager(async()=>({ok:false,status:503,json:async()=>({error:'Unavailable'})}));
  await assert.rejects(rejected.saveToSupabase('endpoint','key','auth'),/Unavailable/);
  const offline=manager(async()=>{throw Error('offline')});
  await assert.rejects(offline.saveToSupabase('endpoint','key','auth'),/offline/);
});
test('browser push-service failure leaves alerts inactive and explains a retry to the user',async()=>{
  const messages=[];
  const registration={pushManager:{getSubscription:async()=>null,subscribe:async()=>{throw new Error('Registration failed - push service error');}}};
  const localStorage={getItem:()=>null,removeItem(){}};
  const instance=manager(async()=>({ok:true,json:async()=>({vapidPublicKey:'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'})}),{
    navigator:{serviceWorker:{controller:{},ready:Promise.resolve(registration)}},
    window:{PushManager:{},Notification:{},atob},Notification:{permission:'granted'},
    document:{getElementById:()=>null},localStorage,
    browserStorage:()=>localStorage,safeReadStorage:()=>false,
    toast:message=>messages.push(message),console:{error(){}}
  });
  assert.equal(await instance.subscribe(),false);
  assert.equal(instance._persisted,false);
  assert.match(messages.at(-1),/navegador.*serviço.*Push/i);
  assert.match(messages.at(-1),/tente novamente/i);
  assert.doesNotMatch(messages.at(-1),/Registration failed/i);
});
test('near-limit favorite collections send IDs within the backend body limit and keep local metadata',async()=>{
  const state={favoriteTeams:Array.from({length:50},(_,i)=>({id:i+1,name:'Club'.repeat(50),logo:'https://example.com/logo.png'})),favoriteFixtures:Array.from({length:100},(_,i)=>({id:i+1,home:{name:'Home'.repeat(50)},away:{name:'Away'.repeat(50)}})),notificationPrefs:{goals:true}};
  let body,bytes;
  const instance=manager(async(url,options)=>{bytes=Buffer.byteLength(options.body);body=JSON.parse(options.body);return {ok:true}},{state});
  await instance.saveToSupabase('endpoint','key','auth');
  assert.ok(bytes < 16384);
  assert.deepEqual(body.favorite_teams,Array.from({length:50},(_,i)=>i+1));
  assert.deepEqual(body.preferences.favorite_fixtures,Array.from({length:100},(_,i)=>i+1));
  assert.equal(typeof state.favoriteFixtures[0].home.name,'string');
});
test('failed server unsubscribe leaves enabled state and browser subscription intact',async()=>{
  const listeners={},storage=new Map(),toggle={checked:false,addEventListener:(event,callback)=>listeners[event]=callback};
  let removed=false;
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const sub={endpoint:'endpoint',toJSON:()=>({keys:{auth:'auth'}}),unsubscribe:async()=>{removed=true}};
  const instance=manager(async()=>({ok:false,status:503}),{
    document:{getElementById:id=>id==='toggle-notif-master'?toggle:null},localStorage,
    browserStorage:()=>localStorage,safeReadStorage:(store,key,fallback)=>JSON.parse(store.getItem(key)??JSON.stringify(fallback)),
    navigator:{serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>sub}})}},window:{PushManager:{}},toast:()=>{}
  });
  instance._persisted=true;
  instance.bindModalEvents();
  await listeners.change({target:toggle});
  assert.equal(storage.get('ap_alerts_disabled'),undefined);
  assert.equal(toggle.checked,true);
  assert.equal(instance._persisted,true);
  assert.equal(removed,false);
});
test('notification payload cannot replace server event history using saved client preferences',async()=>{
  let body;
  const instance=manager(async(url,options)=>{body=JSON.parse(options.body);return {ok:true}});
  await instance.saveToSupabase('endpoint','key','auth');
  assert.equal('sent_events' in body.preferences,false);
  assert.equal('updated_at' in body,false);
  assert.equal(body.preferences.goals,true);
});
test('Push key fallback is converted to canonical base64url for POST',async()=>{
  let body;
  const instance=manager(async(url,options)=>{body=JSON.parse(options.body);return {ok:true}});
  await instance.saveToSupabase('endpoint','+///','Zm8=');
  assert.equal(body.p256dh,'-___');
  assert.equal(body.auth,'Zm8');
});
test('confirmed removal stays disabled after browser cleanup fails, and init or sync cannot recreate it',async()=>{
  const storage=new Map(),requests=[];
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const sub={endpoint:'endpoint',toJSON:()=>({keys:{auth:'+///'}}),unsubscribe:async()=>{throw Error('local failure')}};
  const instance=manager(async(url,options)=>{requests.push({method:options.method,body:JSON.parse(options.body)});return {ok:true}},{
    document:{getElementById:()=>null},localStorage,UserPrefs:{getFavoriteTeam:()=>null},
    browserStorage:()=>localStorage,safeReadStorage:require('../public/js/cache.js').safeReadStorage,
    navigator:{serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>sub}})}},window:{PushManager:{}},toast:()=>{},console:{warn(){}}
  });
  instance._persisted=true;
  await instance.unsubscribe();
  assert.equal(storage.get('ap_alerts_disabled'),'true');
  assert.equal(instance._persisted,false);
  await instance.init();
  await instance.syncPreferences();
  assert.equal(requests.length,1);
  assert.equal(requests[0].method,'DELETE');
  assert.equal(requests[0].body.auth,'-___');
});
test('testing alerts explicitly reenables a disabled retained browser registration before sending',async()=>{
  const storage=new Map([['ap_alerts_disabled','true']]),posts=[];let click;
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const toggle={checked:false,addEventListener(){}},testButton={addEventListener:(name,callback)=>click=callback};
  const sub={endpoint:'endpoint',toJSON:()=>({keys:{auth:'auth',p256dh:'key'}})};
  const instance=manager(async(url,options)=>{posts.push(JSON.parse(options.body));return {ok:true}},{
    document:{getElementById:id=>id==='toggle-notif-master'?toggle:id==='btn-test-notification'?testButton:null},localStorage,
    browserStorage:()=>localStorage,safeReadStorage:require('../public/js/cache.js').safeReadStorage,
    navigator:{serviceWorker:{controller:{},ready:Promise.resolve({pushManager:{getSubscription:async()=>sub}})}},
    window:{PushManager:{},Notification:{}},Notification:{permission:'granted'},toast:()=>{}
  });
  instance.bindModalEvents();
  await click();
  assert.equal(storage.get('ap_alerts_disabled'),undefined);
  assert.equal(toggle.checked,true);
  assert.deepEqual(posts.map(body=>body.test),[false,true]);
});
