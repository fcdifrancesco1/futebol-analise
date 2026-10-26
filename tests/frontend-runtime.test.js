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
test('More navigation indicates the active lineup or favorite-team page',()=>{
  const menus=[{classList:{toggle(name,active){this[name]=active;}}},{classList:{toggle(name,active){this[name]=active;}}}];
  const document={readyState:'loading',addEventListener(){},querySelectorAll(selector){return selector==='.desktop-more, .mobile-more' ? menus : [];}};
  const context=vm.createContext({document,window:{addEventListener(){}}});
  vm.runInContext(fs.readFileSync('public/app.js','utf8'),context);
  vm.runInContext("setActiveTab('mylineups')",context);
  assert.ok(menus.every(menu=>menu.classList.active));
  vm.runInContext("setActiveTab('today')",context);
  assert.ok(menus.every(menu=>!menu.classList.active));
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

test('day spotlight uses a real fixture and does not invent match statistics',()=>{
  const index=fs.readFileSync('public/index.html','utf8');
  const entries=[...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1].split('?')[0]);
  const window={addEventListener(){},localStorage:{getItem(){return 'null'}},sessionStorage:{getItem(){return '{}'}}};
  const document={getElementById(){return {}},readyState:'loading',addEventListener(){}};
  const context=vm.createContext({window,document,AbortController,URLSearchParams,fetch:()=>{},console});
  for(const entry of entries) vm.runInContext(fs.readFileSync('public/'+entry.replace(/^\//,''),'utf8'),context,{filename:entry});
  context.fixtures=[{
    fixture:{id:456,date:'2099-10-10T18:30:00',status:{short:'NS',long:'Not Started'}},
    league:{id:71,name:'Brasileirão Série A',round:'Regular Season - 28'},
    teams:{home:{id:1,name:'Cruzeiro',logo:'/home.png'},away:{id:2,name:'Palmeiras',logo:'/away.png'}},
    goals:{home:null,away:null}
  }];
  const html=vm.runInContext('renderDaySpotlight(fixtures)',context);
  assert.match(html,/Cruzeiro/);
  assert.match(html,/Palmeiras/);
  assert.match(html,/href="#\/jogo\/456"/);
  assert.match(html,/18:30/);
  assert.doesNotMatch(html,/finaliza[cç][oõ]es|posse/i);
});

test('older day response cannot overwrite the latest day render',async()=>{
  const pending=[];
  const content={writes:0,_html:'',set innerHTML(value){this.writes++;this._html=value;},get innerHTML(){return this._html;}};
  const elements={
    'day-matches-content':content,
    'day-count':{},'day-spotlight':{},'day-visible-count':{}
  };
  const root={};
  const document={getElementById(id){return id==='route-view' ? root : elements[id];}};
  const context=vm.createContext({
    console,Intl,Date,
    window:{document},
    captureView:()=>({root,document}),
    LEAGUES:[],
    apiGet:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),
    filterSeniorNationalFixtures:fixtures=>fixtures,
    NotificationManager:{checkLiveAlerts(){}},
    errorBox:message=>`error: ${message}`
  });
  vm.runInContext(fs.readFileSync('public/js/matches.js','utf8'),context);
  const first=vm.runInContext("fetchAndRenderDayMatches('2099-10-10')",context);
  const second=vm.runInContext("fetchAndRenderDayMatches('2099-10-10')",context);
  pending[1].resolve([]);
  await second;
  const latest=content.innerHTML;
  assert.match(latest,/Nenhum jogo programado/);
  pending[0].resolve([]);
  await first;
  assert.equal(content.innerHTML,latest);
  assert.equal(content.writes,1);
});

test('live spotlight does not invent scores when the provider omits goals',()=>{
  const index=fs.readFileSync('public/index.html','utf8');
  const entries=[...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1].split('?')[0]);
  const window={addEventListener(){},localStorage:{getItem(){return 'null'}},sessionStorage:{getItem(){return '{}'}}};
  const document={getElementById(){return {}},readyState:'loading',addEventListener(){}};
  const context=vm.createContext({window,document,AbortController,URLSearchParams,fetch:()=>{},console});
  for(const entry of entries) vm.runInContext(fs.readFileSync('public/'+entry.replace(/^\//,''),'utf8'),context,{filename:entry});
  context.fixtures=[{
    fixture:{id:321,date:new Date().toISOString(),status:{short:'1H',long:'First Half',elapsed:12}},
    league:{id:71,name:'Brasileirão Série A',round:'Regular Season - 28'},
    teams:{home:{id:1,name:'Cruzeiro',logo:''},away:{id:2,name:'Palmeiras',logo:''}},
    goals:{home:null,away:null}
  }];
  const spotlight=vm.runInContext('renderDaySpotlight(fixtures)',context);
  assert.match(spotlight,/— : —/);
  assert.doesNotMatch(spotlight,/<img src=""/);
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
  // Sabendo que o jogador 102 é da Austrália, o gol contra vai para o Brasil.
  const roster = new Map([['102', '20']]);
  assert.equal(fnContext.isGoalForTeam(ownGoalAustralia, awayTeam, homeTeam, roster), true);
  assert.equal(fnContext.isGoalForTeam(ownGoalAustralia, homeTeam, awayTeam, roster), false);

  // 2b. Formato real da API-Football (fixture 1492402): gol contra de Kaio Jorge (Cruzeiro)
  // vem com team = RB Bragantino, o time beneficiado.
  const bragantino = { id: 794, name: 'RB Bragantino' };
  const cruzeiro = { id: 135, name: 'Cruzeiro' };
  const kaioJorgeOG = { type: 'Goal', detail: 'Own Goal', team: bragantino, player: { id: 10008, name: 'Kaio Jorge' }, time: { elapsed: 20 } };
  // Sem saber o time do jogador: vale o time do evento.
  assert.equal(fnContext.isGoalForTeam(kaioJorgeOG, bragantino, cruzeiro), true);
  assert.equal(fnContext.isGoalForTeam(kaioJorgeOG, cruzeiro, bragantino), false);
  // Sabendo que Kaio Jorge é do Cruzeiro: mesmo resultado.
  const kaioRoster = new Map([['10008', '135']]);
  assert.equal(fnContext.isGoalForTeam(kaioJorgeOG, bragantino, cruzeiro, kaioRoster), true);
  assert.equal(fnContext.isGoalForTeam(kaioJorgeOG, cruzeiro, bragantino, kaioRoster), false);

  // 2c. Com os 3 gols do Bragantino nos eventos, a recuperação não inventa um 4º
  // "Lucas Barbosa" (nome diferente do evento "Lucas Henrique Barbosa", mesmo id).
  const braGoals = [
    { type: 'Goal', detail: 'Normal Goal', team: bragantino, player: { id: 279811, name: 'Lucas Henrique Barbosa' }, time: { elapsed: 13 } },
    kaioJorgeOG,
    { type: 'Goal', detail: 'Normal Goal', team: bragantino, player: { id: 10027, name: 'Eric Ramires' }, time: { elapsed: 30 } }
  ];
  const braPlayers = [{ team: bragantino, players: [
    { player: { id: 279811, name: 'Lucas Barbosa' }, statistics: [{ goals: { total: 1 } }] },
    { player: { id: 10027, name: 'Eric Ramires' }, statistics: [{ goals: { total: 1 } }] }
  ] }];
  assert.equal(fnContext.recoverMissingGoals(braGoals, bragantino, braPlayers, 3).length, 3);
  // Se faltar um gol nos eventos, recupera só o que falta, sem duplicar por nome diferente.
  const recoveredOne = fnContext.recoverMissingGoals(braGoals.slice(0, 2), bragantino, braPlayers, 3);
  assert.equal(recoveredOne.length, 3);
  assert.equal(recoveredOne[2].player.name, 'Eric Ramires');

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

test('following a fixture succeeds and persists even when push subscription fails', () => {
  const fixtureSrc = fs.readFileSync('public/js/fixture.js', 'utf8');
  assert.match(fixtureSrc, /subscribe\(\{\s*silent:\s*true\s*\}\)/);
  assert.doesNotMatch(fixtureSrc, /if \(!isSub && !await NotificationManager\.subscribe\(\)\) return;/);
  assert.match(fixtureSrc, /Partida adicionada aos seus jogos/);
});

test('finished followed matches are automatically removed from favoriteFixtures using the day results', () => {
  const matchesSrc = fs.readFileSync('public/js/matches.js', 'utf8');
  let synced = false;
  const context = vm.createContext({
    state: {
      favoriteFixtures: [
        {
          id: 101,
          home: { name: 'France' },
          away: { name: 'Germany' },
          date: '2026-09-25T15:00:00+00:00'
        },
        {
          id: 102,
          home: { name: 'Brazil' },
          away: { name: 'Italy' },
          date: '2026-09-26T18:00:00+00:00'
        },
        {
          id: 103,
          home: { name: 'Japan' },
          away: { name: 'Korea' },
          date: '2026-09-26T21:00:00+00:00'
        }
      ]
    },
    escapeHtml: s => s,
    sanitizeUrl: u => u,
    formatRoundName: r => r,
    getLocalDateString: () => '2026-09-26',
    getMatchStatusCategory: f => ({
      isLive: f.status.short === '1H' || f.status.short === '2H',
      isFinished: f.status.short === 'FT' || f.status.short === 'AET',
      isScheduled: f.status.short === 'NS',
      isPostponed: false,
      label: f.status.short
    }),
    NotificationManager: {
      syncPreferences: async () => { synced = true; }
    },
    localStorage: {
      setItem: () => {}
    }
  });
  vm.runInContext(matchesSrc, context);

  const todayFixtures = [
    {
      fixture: { id: 102, date: '2026-09-26T18:00:00+00:00', status: { short: 'FT' } },
      teams: { home: { name: 'Brazil' }, away: { name: 'Italy' } },
      goals: { home: 2, away: 1 }
    },
    {
      fixture: { id: 103, date: '2026-09-26T21:00:00+00:00', status: { short: 'NS' } },
      teams: { home: { name: 'Japan' }, away: { name: 'Korea' } },
      goals: { home: null, away: null }
    }
  ];

  context.todayFixtures = todayFixtures;
  vm.runInContext('cleanFinishedFavoriteFixtures(todayFixtures)', context);

  // France x Germany (dia anterior) e Brazil x Italy (FT) saem; Japan x Korea (NS) fica
  assert.equal(context.state.favoriteFixtures.length, 1);
  assert.equal(context.state.favoriteFixtures[0].id, 103);

  todayFixtures[1].fixture.status.short = 'FT';
  vm.runInContext('cleanFinishedFavoriteFixtures(todayFixtures)', context);
  assert.equal(context.state.favoriteFixtures.length, 0);
  // A página do dia chama a limpeza com os resultados do dia
  assert.ok(matchesSrc.includes('cleanFinishedFavoriteFixtures(relevant)'));
});

test('day spotlight prioritizes favorite teams, prominent competitions and complete logos over obscure preliminary matches', () => {
  const matchesSrc = fs.readFileSync('public/js/matches.js', 'utf8');
  const context = vm.createContext({
    state: { favoriteFixtures: [] },
    escapeHtml: s => s,
    sanitizeUrl: u => u,
    formatRoundName: r => r,
    UserPrefs: { getFavoriteTeam: () => null },
    getMatchStatusCategory: f => ({
      isLive: f.status.short === '1H',
      isFinished: f.status.short === 'FT',
      isScheduled: f.status.short === 'NS',
      isPostponed: false,
      label: f.status.short,
      short: f.status.short
    })
  });
  vm.runInContext(matchesSrc, context);

  // Cenário 1: Jogo preliminar da Copa do Rei com time sem escudo às 08:00 vs Amistoso de Seleções com escudos às 10:00
  const fixtures = [
    {
      fixture: { id: 1, date: '2026-10-04T08:00:00Z', status: { short: 'NS' } },
      league: { id: 143, name: 'Copa do Rei', round: '1/128-finals' },
      teams: { home: { id: 101, name: 'Güímar', logo: 'https://example.com/not-available.png' }, away: { id: 102, name: 'Hortaleza', logo: 'https://example.com/hortaleza.png' } }
    },
    {
      fixture: { id: 2, date: '2026-10-04T10:00:00Z', status: { short: 'NS' } },
      league: { id: 10, name: 'Amistosos Internacionais', round: 'Friendly International' },
      teams: { home: { id: 201, name: 'Comoros', logo: 'https://example.com/comoros.png' }, away: { id: 202, name: 'Senegal', logo: 'https://example.com/senegal.png' } }
    }
  ];

  context.fixtures = fixtures;
  let html = vm.runInContext('renderDaySpotlight(fixtures)', context);
  assert.match(html, /Senegal/);
  assert.doesNotMatch(html, /Güímar/);

  // Cenário 2: Se o usuário tem um time do coração (ex: Güímar), ele supera outros jogos
  context.UserPrefs.getFavoriteTeam = () => ({ id: 101, name: 'Güímar' });
  html = vm.runInContext('renderDaySpotlight(fixtures)', context);
  assert.match(html, /Güímar/);

  // Cenário 3: Jogo ao vivo supera agendado
  fixtures[1].fixture.status.short = '1H';
  context.UserPrefs.getFavoriteTeam = () => null;
  html = vm.runInContext('renderDaySpotlight(fixtures)', context);
  assert.match(html, /Senegal/);
  assert.match(html, /AO VIVO/);
});

test('fixture hero goals: chronological mobile list and VAR cancelled goals', () => {
  const fixtureSrc = fs.readFileSync('public/js/fixture.js', 'utf8');
  const start = fixtureSrc.indexOf('function isCancelledGoalEvent');
  const end = fixtureSrc.indexOf('function renderFixtureEvents');
  const ctx = vm.createContext({ escapeHtml: s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`) });
  vm.runInContext(fixtureSrc.slice(start, end) + '\nthis.renderHeroGoals = renderHeroGoals; this.sortByMatchTime = sortByMatchTime; this.isCancelledGoalEvent = isCancelledGoalEvent; this.varDetailLabel = varDetailLabel;', ctx);

  // Inter 1 x 1 Club Brugge (fixture 1635671): Tresoldi (Brugge) 30' pênalti, Lautaro (Inter) 44'.
  const inter = [{ type: 'Goal', detail: 'Normal Goal', player: { name: 'Lautaro Martínez' }, assist: { name: 'Federico Dimarco' }, time: { elapsed: 44 } }];
  const brugge = [
    { type: 'Goal', detail: 'Normal Goal', player: { name: 'Nicolo Tresoldi' }, assist: { name: 'Carlos Forbs' }, time: { elapsed: 63 } },
    { type: 'Goal', detail: 'Penalty', player: { name: 'Nicolo Tresoldi' }, time: { elapsed: 30 } }
  ];
  const html = ctx.renderHeroGoals(inter, ctx.sortByMatchTime(brugge));
  const timeline = html.slice(html.indexOf('hero-goals-timeline'));
  const order = [...timeline.matchAll(/side-(home|away)[\s\S]*?class="time">([^<]+)</g)].map(m => `${m[1]} ${m[2].replace(/&#39;/g, "'")}`);
  assert.deepEqual(order, ["away 30' (P)", "home 44'", "away 63'"]);
  // Colunas do desktop continuam por time
  assert.match(html, /hero-goals-col home/);
  assert.match(html, /hero-goals-col away/);

  // Acréscimos e gols sem minuto (súmula pendente) ordenados corretamente
  const sorted = ctx.sortByMatchTime([
    { time: { elapsed: '-' } }, { time: { elapsed: 45, extra: 2 } }, { time: { elapsed: 46 } }, { time: { elapsed: 45 } }
  ]).map(g => `${g.time.elapsed}+${g.time.extra || 0}`);
  assert.deepEqual(sorted, ['45+0', '45+2', '46+0', '-+0']);

  // Gol anulado pelo VAR (Atlético x Man United, 45')
  const cancelled = { type: 'Var', detail: 'Goal cancelled', team: { id: 530 }, player: { name: 'Johnny Cardoso' }, time: { elapsed: 45 } };
  assert.equal(ctx.isCancelledGoalEvent(cancelled), true);
  assert.equal(ctx.isCancelledGoalEvent({ type: 'Var', detail: 'Penalty confirmed' }), false);
  assert.equal(ctx.varDetailLabel('Goal Disallowed - offside'), 'Gol anulado (VAR · impedimento)');
  const cancelledHtml = ctx.renderHeroGoals([cancelled], []);
  assert.match(cancelledHtml, /is-cancelled/);
  assert.match(cancelledHtml, /Anulado \(VAR\)/);
});

test('day standings carousel picks the day competitions in LEAGUES order, with fallback', () => {
  const src = fs.readFileSync('public/js/matches.js', 'utf8');
  const start = src.indexOf('const DAY_STANDINGS_FALLBACK');
  const end = src.indexOf('function renderDayStandingsSlide');
  const ctx = vm.createContext({
    LEAGUES: [{ id: 71, name: 'Brasileirão Série A', calendarYear: true }, { id: 72, name: 'Brasileirão Série B', calendarYear: true }, { id: 140, name: 'La Liga' }, { id: 39, name: 'Premier League' }],
    defaultSeasonFor: league => (league?.calendarYear ? 2026 : 2026)
  });
  vm.runInContext(src.slice(start, end) + '\nthis.comps = dayStandingsCompetitions; this.zone = dayStandingsZone;', ctx);
  const fx = (id, season = 2026) => ({ league: { id, season, logo: `l${id}.png`, name: `API ${id}` } });
  // Ordem do projeto (Série A antes da Premier), sem repetir e ignorando ligas fora de LEAGUES
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.comps([fx(39), fx(71), fx(39), fx(999)]).map(c => `${c.id}:${c.name}`))), ['71:Brasileirão Série A', '39:Premier League']);
  // Sem jogos no dia: campeonatos principais
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.comps([]).map(c => c.id))), [71, 39, 140]);
  // Zonas: rebaixamento em vermelho, classificação/promoção em destaque, meio da tabela neutro
  assert.equal(ctx.zone('Relegation - Serie B'), 'down');
  assert.equal(ctx.zone('Promotion - Libertadores'), 'up');
  assert.equal(ctx.zone(null), '');
});

test('day standings movement compares the table before the last round played', () => {
  const leaguesSrc = fs.readFileSync('public/js/leagues.js', 'utf8');
  const matchesSrc = fs.readFileSync('public/js/matches.js', 'utf8');
  const start = matchesSrc.indexOf('function dayStandingsRoundNumber');
  const end = matchesSrc.indexOf('function dayStandingsZone');
  const ctx = vm.createContext({ console, Date, Math, Number, String, Set, Map, Array, Object, document: { getElementById: () => null }, window: {} });
  // Só o motor de tabela de leagues.js (sem rotas/DOM)
  const engineStart = leaguesSrc.indexOf('function sortStandingsByLeagueRules');
  const engineEnd = leaguesSrc.indexOf('function renderStandingsTable');
  vm.runInContext(leaguesSrc.slice(engineStart, engineEnd) + '\n' + matchesSrc.slice(start, end) + '\nthis.movement = dayStandingsMovement; this.moveHtml = dayStandingsMoveHtml;', ctx);

  const team = (id, name) => ({ team: { id, name, logo: '' } });
  const rows = [team(1, 'A'), team(2, 'B'), team(3, 'C'), team(4, 'D')];
  const game = (round, home, away, hg, ag, status = 'FT') => ({
    league: { round: `Regular Season - ${round}` }, fixture: { date: `2026-10-${10 + round}T20:00:00Z`, status: { short: status } },
    teams: { home: { id: home }, away: { id: away } }, goals: { home: hg, away: ag }
  });
  // Rodada 1: A 3x0 B, C 1x0 D -> A (3, +3), C (3, +1), D (0, -1), B (0, -3)
  // Rodada 2: B 4x0 C, D 2x0 A -> todos com 3 pts; A, B e D com saldo +1 (gols pró B 4, A 3, D 2), C -3
  const fixtures = [game(1, 1, 2, 3, 0), game(1, 3, 4, 1, 0), game(2, 2, 3, 4, 0), game(2, 4, 1, 2, 0), game(3, 1, 3, null, null, 'NS')];
  const after = ctx.computeTableFromFixtures(fixtures.slice(0, 4), rows, {}, 999).map(t => t.team.id);
  assert.deepEqual(JSON.parse(JSON.stringify(after)), [2, 1, 4, 3]);
  // A posição atual vem do ranking oficial (rank), não do recálculo
  const official = [[2, 1], [1, 2], [4, 3], [3, 4]].map(([id, rank]) => ({ ...rows.find(r => r.team.id === id), rank }));
  const mv = ctx.movement(official, fixtures, 999);
  // Antes: [A, C, D, B]  Depois (oficial): [B, A, D, C]
  assert.equal(mv.get(2), 3);   // B: 4º -> 1º
  assert.equal(mv.get(1), -1);  // A: 1º -> 2º
  assert.equal(mv.get(4), 0);   // D: 3º -> 3º
  assert.equal(mv.get(3), -2);  // C: 2º -> 4º

  // Só uma rodada disputada: sem tabela anterior
  assert.equal(ctx.movement(rows, fixtures.slice(0, 2), 999), null);
  // Setas: ▲ subiu, ▼ caiu, traço amarelo sem mudança
  assert.match(ctx.moveHtml(2), /up[\s\S]*▲<small>2/);
  assert.match(ctx.moveHtml(-1), /down[\s\S]*▼<small>1/);
  assert.match(ctx.moveHtml(0), /same[\s\S]*–/);
});
