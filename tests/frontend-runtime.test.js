const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PlayerRatingEngine}=require('../public/js/models.js');
test('every declared entry script loads in HTML order with malformed stored preferences',()=>{
  const index=fs.readFileSync('public/index.html','utf8');
  const entries=[...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1].split('?')[0]);
  const window={addEventListener(){},localStorage:{getItem(){return 'null'}},sessionStorage:{getItem(){return '{'}}};
  const document={getElementById(){return {}},readyState:'loading',addEventListener(){}};
  const context=vm.createContext({window,document,AbortController,URLSearchParams,fetch:()=>{},console});
  for(const entry of entries) vm.runInContext(fs.readFileSync('public/'+entry.replace(/^\//,''),'utf8'),context,{filename:entry});
  assert.equal(vm.runInContext('typeof router',context),'function');
  assert.equal(vm.runInContext('state.favoriteTeams.length',context),0);
  assert.equal(vm.runInContext('UserPrefs.hasOnboarded()',context),false);
});
test('captured route document refuses writes through lookups after navigation',()=>{
  const original={isConnected:true,id:'old',querySelector:()=>({textContent:'old'})};
  const native={getElementById:()=>({textContent:'new'})};
  const context=vm.createContext({app:original,document:native,DOMException,CSS:{escape:x=>x},window:{addEventListener(){}}});
  vm.runInContext(fs.readFileSync('public/js/accessibility.js','utf8')+'\nthis.view=captureView()',context);
  assert.equal(context.view.document.getElementById('data').textContent,'old');
  context.app={isConnected:true,id:'new'};
  assert.throws(()=>context.view.document.getElementById('data'),{name:'AbortError'});
});
test('rating with insufficient playing time is missing and extreme events stay bounded',()=>{
  assert.equal(PlayerRatingEngine.calcularNota({games:{minutes:9,position:'F'}}).nota,null);
  assert.equal(PlayerRatingEngine.calcularNota({games:{minutes:90,position:'F'},goals:{total:100}}).nota,10);
  assert.equal(PlayerRatingEngine.calcularNota({games:{minutes:90,position:'F'},cards:{red:100}}).nota,3);
});
