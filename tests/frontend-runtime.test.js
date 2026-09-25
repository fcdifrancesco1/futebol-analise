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

test('national team competitions, friendlies and leagues are registered and consistent',()=>{
  const window = { addEventListener() {}, localStorage: { getItem() { return 'null'; } }, sessionStorage: { getItem() { return '{}'; } } };
  const document = { getElementById() { return {}; }, readyState: 'loading', addEventListener() {} };
  const context = vm.createContext({ window, document, AbortController, URLSearchParams, fetch: () => {}, console });
  
  vm.runInContext(fs.readFileSync('public/js/cache.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('public/js/models.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('public/js/core.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('public/js/broadcast.js', 'utf8'), context);

  const countries = vm.runInContext('COUNTRIES', context);
  const leagues = vm.runInContext('LEAGUES', context);
  const getLeagueBroadcasters = vm.runInContext('getLeagueBroadcasters', context);
  const leagueIds = new Set(leagues.map(l => l.id));

  // Todos os IDs de ligas em COUNTRIES devem existir em LEAGUES
  for (const country of countries) {
    for (const lid of country.leagues) {
      assert.ok(leagueIds.has(lid), `Liga ID ${lid} do grupo ${country.id} não encontrada em LEAGUES`);
    }
  }

  // Categoria de Seleções Masculinas
  const selecoesGroup = countries.find(c => c.id === 'selecoes');
  assert.ok(selecoesGroup, 'Grupo selecoes deve existir em COUNTRIES');
  assert.equal(fs.existsSync('public' + selecoesGroup.flagImg), true, 'Bandeira de seleções deve existir em public/');
  assert.deepEqual(Array.from(selecoesGroup.leagues), [10, 1, 14, 9, 4, 5]);

  // Competições de Seleções Oficiais
  const friendlies = leagues.find(l => l.id === 10);
  assert.ok(friendlies && friendlies.isCup && friendlies.calendarYear);
  assert.equal(friendlies.name, 'Amistosos Internacionais');

  const worldCup = leagues.find(l => l.id === 1);
  assert.ok(worldCup && worldCup.isCup && worldCup.calendarYear);
  assert.equal(worldCup.name, 'Copa do Mundo FIFA');

  const qualifiers = leagues.find(l => l.id === 14);
  assert.ok(qualifiers && qualifiers.isCup && qualifiers.calendarYear);
  assert.equal(qualifiers.name, 'Eliminatórias da Copa - América do Sul');

  const copaAmerica = leagues.find(l => l.id === 9);
  assert.ok(copaAmerica && copaAmerica.isCup && copaAmerica.calendarYear);
  assert.equal(copaAmerica.name, 'Copa América');

  const euro = leagues.find(l => l.id === 4);
  assert.ok(euro && euro.isCup && euro.calendarYear);
  assert.equal(euro.name, 'Eurocopa');

  const nationsLeague = leagues.find(l => l.id === 5);
  assert.ok(nationsLeague && nationsLeague.isCup && !nationsLeague.calendarYear);
  assert.equal(nationsLeague.name, 'UEFA Nations League');

  // Conference League corrigida para 848
  const confLeague = leagues.find(l => l.id === 848);
  assert.ok(confLeague && confLeague.name === 'Conference League');

  // Guia de transmissão para seleções
  const broadcast10 = getLeagueBroadcasters(10);
  assert.ok(Array.isArray(broadcast10) && broadcast10.length > 0);
  assert.ok(broadcast10.some(c => c.name === 'TV Globo'));
});

test('national team fixture lists contain senior selections only',()=>{
  const window={addEventListener(){},localStorage:{getItem(){return 'null'}},sessionStorage:{getItem(){return '{}'}}};
  const document={getElementById(){return {}},readyState:'loading',addEventListener(){}};
  const context=vm.createContext({window,document,AbortController,URLSearchParams,fetch:()=>{},console});
  for(const file of ['cache','models','core']) vm.runInContext(fs.readFileSync(`public/js/${file}.js`,'utf8'),context);
  const fixtures=[
    {fixture:{id:1},league:{id:10},teams:{home:{name:'Brazil'},away:{name:'Argentina'}}},
    {fixture:{id:2},league:{id:10},teams:{home:{name:'Brazil U20'},away:{name:'Argentina'}}},
    {fixture:{id:3},league:{id:10},teams:{home:{name:'Brasil Sub-17'},away:{name:'Chile'}}},
    {fixture:{id:4},league:{id:1},teams:{home:{name:'France'},away:{name:'Spain U23'}}},
    {fixture:{id:5},league:{id:10,round:'Under 19'},teams:{home:{name:'Brazil'},away:{name:'Chile'}}},
    {fixture:{id:6},league:{id:5},teams:{home:{name:'France'},away:{name:'Italy'}}},
    {fixture:{id:7},league:{id:39},teams:{home:{name:'Arsenal U21'},away:{name:'Chelsea U21'}}},
    {fixture:{id:8},league:{id:10},teams:{home:{name:'Brazil Olympic'},away:{name:'Chile'}}}
  ];
  context.fixtures=fixtures;
  const visible=vm.runInContext('filterSeniorNationalFixtures(fixtures)',context);
  assert.deepEqual(Array.from(visible,f=>f.fixture.id),[1,6,7]);
});

test('scheduled league fixtures render their date and kickoff time',()=>{
  const index=fs.readFileSync('public/index.html','utf8');
  const entries=[...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1].split('?')[0]);
  const window={addEventListener(){},localStorage:{getItem(){return 'null'}},sessionStorage:{getItem(){return '{}'}}};
  const document={getElementById(){return {}},readyState:'loading',addEventListener(){}};
  const context=vm.createContext({window,document,AbortController,URLSearchParams,fetch:()=>{},console});
  for(const entry of entries) vm.runInContext(fs.readFileSync('public/'+entry.replace(/^\//,''),'utf8'),context,{filename:entry});
  context.fixtures=[{
    fixture:{id:123,date:'2099-10-10T18:30:00',status:{short:'NS',long:'Not Started'}},
    league:{round:'League Stage - 1'},
    teams:{home:{id:1,name:'Portugal',logo:''},away:{id:2,name:'Espanha',logo:''}},
    goals:{home:null,away:null}
  }];
  const html=vm.runInContext('renderGroupedFixtures(fixtures, false)',context);
  assert.match(html,/href="#\/jogo\/123"/);
  assert.match(html,/<span class="fixture-date">10\/10<br>18:30<\/span>/);
});

test('fixture goal extraction handles own goals and recovers scorers from player statistics when events lag', () => {
  const fixtureSrc = fs.readFileSync('public/js/fixture.js', 'utf8');
  // Extrai a lógica das funções auxiliares de fixture.js
  const isGoalForTeamStr = fixtureSrc.match(/const isGoalForTeam = \([\s\S]*?\n    \};/)[0];
  const recoverMissingGoalsStr = fixtureSrc.match(/const recoverMissingGoals = \([\s\S]*?\n    \};/)[0];

  const fnContext = vm.createContext({});
  vm.runInContext(`${isGoalForTeamStr}\nthis.isGoalForTeam = isGoalForTeam;\n${recoverMissingGoalsStr}\nthis.recoverMissingGoals = recoverMissingGoals;`, fnContext);

  const homeTeam = { id: 20, name: 'Australia' };
  const awayTeam = { id: 6, name: 'Brazil' };

  // 1. Gol normal de Irankunda para Austrália
  const normalGoalAustralia = {
    type: 'Goal',
    detail: 'Normal Goal',
    team: { id: 20, name: 'Australia' },
    player: { id: 101, name: 'N. Irankunda' },
    time: { elapsed: 68 }
  };
  assert.equal(fnContext.isGoalForTeam(normalGoalAustralia, homeTeam, awayTeam), true);
  assert.equal(fnContext.isGoalForTeam(normalGoalAustralia, awayTeam, homeTeam), false);

  // 2. Gol contra cometido por jogador da Austrália beneficia o Brasil (away)
  const ownGoalAustralia = {
    type: 'Goal',
    detail: 'Own Goal',
    team: { id: 20, name: 'Australia' },
    player: { id: 102, name: 'Defensor Australiano' },
    time: { elapsed: 80 }
  };
  assert.equal(fnContext.isGoalForTeam(ownGoalAustralia, awayTeam, homeTeam), true);
  assert.equal(fnContext.isGoalForTeam(ownGoalAustralia, homeTeam, awayTeam), false);

  // 3. Recuperação de gol de Rayan a partir de fixturePlayersArr quando o evento ainda não foi publicado na API
  const currentAwayGoals = []; // API events ainda não trouxe o gol do Brasil
  const fixturePlayersArr = [
    {
      team: { id: 6, name: 'Brazil' },
      players: [
        { player: { id: 202, name: 'Rayan' }, statistics: [{ goals: { total: 1 } }] },
        { player: { id: 203, name: 'Vinicius Jr' }, statistics: [{ goals: { total: 0 } }] }
      ]
    }
  ];

  const recovered = fnContext.recoverMissingGoals(currentAwayGoals, awayTeam, fixturePlayersArr, 1);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].player.name, 'Rayan');
  assert.equal(recovered[0].isRecovered, true);

  // 4. Se nem mesmo fixturePlayersArr tem o gol (delay total da súmula), provê placeholder informativo
  const fallback = fnContext.recoverMissingGoals([], awayTeam, [], 1);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].player.name, 'Gol (Aguardando súmula da API)');
  assert.equal(fallback[0].isPendingSummary, true);
});


