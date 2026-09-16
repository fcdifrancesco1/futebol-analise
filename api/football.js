const { enforceRateLimit, consumeGlobalBudget, configuredLimit } = require('../lib/request-security');
const { fetchBounded, requireGet } = require('../lib/http');

const integer = (min, max) => v => /^[1-9]\d*$/.test(v) && Number(v) >= min && Number(v) <= max;
const id = integer(1, 100000000);
const season = integer(2000, new Date().getUTCFullYear() + 1);
const text = v => v.length >= 3 && v.length <= 80 && /^[\p{L}\p{N} .'-]+$/u.test(v);
const date = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const timezone = v => { try { if(v.length > 64) return false; new Intl.DateTimeFormat('en', { timeZone:v }); return true; } catch { return false; } };
const rules = { id, team:id, league:id, fixture:id, player:id, season, search:text, name:text, country:text,
  code:v=>/^[A-Z]{2,3}$/.test(v), type:v=>/^(league|cup)$/.test(v), current:v=>/^(true|false)$/.test(v),
  last:integer(1,50), next:integer(1,50), page:integer(1,100), date, from:date, to:date, timezone,
  live:v=>v==='all' || /^[1-9]\d{0,7}(?:-[1-9]\d{0,7}){0,19}$/.test(v),
  h2h:v=>/^[1-9]\d{0,7}-[1-9]\d{0,7}$/.test(v),
  status:v=>/^(TBD|NS|1H|HT|2H|ET|BT|P|SUSP|INT|FT|AET|PEN|PST|CANC|ABD|AWD|WO|LIVE)(-(TBD|NS|1H|HT|2H|ET|BT|P|SUSP|INT|FT|AET|PEN|PST|CANC|ABD|AWD|WO|LIVE)){0,9}$/.test(v),
  round:v=>v.length<=80 && /^[\p{L}\p{N} .'-]+$/u.test(v), bookmaker:id, bet:id };
const schemas = {
  leagues:'id name country code season team type current search', teams:'id name league season country code search',
  'teams/statistics':'league season team date', standings:'league season team',
  fixtures:'id live date league season team last next from to round status timezone',
  'fixtures/headtohead':'h2h date league season last next from to status timezone',
  'fixtures/events':'fixture team player', 'fixtures/lineups':'fixture team',
  'fixtures/statistics':'fixture team', 'fixtures/players':'fixture team',
  'players/topscorers':'league season', 'players/topassists':'league season',
  'players/topyellowcards':'league season', 'players/topredcards':'league season',
  'players/squads':'team player', players:'id team league season search page',
  injuries:'league season fixture team player date timezone', odds:'fixture league season date timezone page bookmaker bet', predictions:'fixture'
};
const required = { 'teams/statistics':['league','season','team'], standings:['season'],
  'fixtures/headtohead':['h2h'], 'fixtures/events':['fixture'], 'fixtures/lineups':['fixture'],
  'fixtures/statistics':['fixture'], 'fixtures/players':['fixture'], predictions:['fixture'],
  'players/topscorers':['league','season'], 'players/topassists':['league','season'],
  'players/topyellowcards':['league','season'], 'players/topredcards':['league','season'] };

function validate(query) {
  const { endpoint, ...params } = query;
  if(typeof endpoint !== 'string' || !Object.hasOwn(schemas, endpoint)) return null;
  const keys = Object.keys(params), allowed = schemas[endpoint].split(' ');
  if(keys.some(k=>!allowed.includes(k) || typeof params[k] !== 'string' || !rules[k](params[k]))) return null;
  if((required[endpoint] || []).some(k=>!params[k])) return null;
  if(!keys.length || (endpoint === 'fixtures' && !['id','live','date','league','team'].some(k=>params[k]))) return null;
  if(endpoint === 'teams' && !(params.id || params.search || params.name || params.country || (params.league && params.season))) return null;
  if(endpoint === 'standings' && !(params.league || params.team)) return null;
  if(endpoint === 'players/squads' && !(params.team || params.player)) return null;
  if(endpoint === 'players' && !(params.season && (params.id || params.team || params.league))) return null;
  if(endpoint === 'fixtures' && params.league && !params.season && !params.live && !params.date && !params.id) return null;
  if(endpoint === 'injuries' && !(params.fixture || params.date || (params.season && (params.team || params.league || params.player)))) return null;
  if(endpoint === 'odds' && !(params.fixture || params.date || (params.league && params.season))) return null;
  if(params.from && (!params.to || params.from > params.to)) return null;
  if(params.to && !params.from) return null;
  if(params.from && Date.parse(params.to)-Date.parse(params.from)>366*86400000) return null;
  if(params.last && params.next) return null;
  return { endpoint, params };
}
function ttlFor(endpoint) {
  if(endpoint === 'fixtures' || /^fixtures\/(events|statistics|players|lineups)$/.test(endpoint)) return 15;
  if(endpoint === 'leagues' || endpoint === 'teams' || endpoint === 'players/squads') return 21600;
  if(endpoint === 'odds') return 60;
  return 300;
}
// Per-instance reuse reduces paid calls; the distributed budget is authoritative.
// CDN hits never enter this function.
const cache = new Map(); let cacheBytes = 0;
function remember(key, body, ttl) {
  if(body.length > 1024 * 1024) return;
  // Concurrent misses can finish for the same key. Replace its byte accounting.
  if(cache.has(key)){ cacheBytes-=cache.get(key).body.length; cache.delete(key); }
  while(cache.size >= 128 || cacheBytes + body.length > 8 * 1024 * 1024) {
    const first = cache.keys().next().value; cacheBytes -= cache.get(first).body.length; cache.delete(first);
  }
  cache.set(key, { body, expires:Date.now() + ttl * 1000 }); cacheBytes += body.length;
}
module.exports = async (req,res) => {
  if(!requireGet(req,res)) return;
  const parsed = validate(req.query || {});
  if(!parsed) return res.status(400).json({ error:'Consulta esportiva inválida.' });
  let limit;
  try { limit=configuredLimit('FOOTBALL_RATE_LIMIT',120); } catch { return res.status(503).json({error:'Serviço temporariamente indisponível.'}); }
  if(!await enforceRateLimit(req,res,{scope:'football',limit,windowSeconds:60})) return;
  if(!process.env.FOOTBALL_API_KEY) return res.status(503).json({error:'Serviço temporariamente indisponível.'});
  const { endpoint, params }=parsed;
  const qs=new URLSearchParams(Object.entries(params).sort(([a],[b])=>a.localeCompare(b))).toString();
  const key=endpoint+'?'+qs;
  const cached=cache.get(key);
  if(cached && cached.expires>Date.now()) {
    const remaining=Math.max(1,Math.ceil((cached.expires-Date.now())/1000));
    res.setHeader('Cache-Control','public, max-age=0, s-maxage='+remaining);
    return res.status(200).json(JSON.parse(cached.body.toString('utf8')));
  }
  if(cached){ cacheBytes-=cached.body.length; cache.delete(key); }
  try {
    const budget=await consumeGlobalBudget();
    if(!budget.allowed) { res.setHeader('Retry-After',String(budget.retryAfter)); return res.status(429).json({error:'Limite diário de consultas atingido.'}); }
  } catch { return res.status(503).json({error:'Serviço temporariamente indisponível.'}); }
  try {
    const {body}=await fetchBounded('https://v3.football.api-sports.io/'+key,{headers:{'x-apisports-key':process.env.FOOTBALL_API_KEY}}, {timeoutMs:12000,maxBytes:4*1024*1024});
    const data=JSON.parse(body.toString('utf8'));
    // teams/statistics returns an object; other endpoints generally return lists.
    if(!data || !data.response || typeof data.response !== 'object' || (data.errors && Object.keys(data.errors).length)) throw new Error('Provider application error');
    const ttl=ttlFor(endpoint); remember(key,body,ttl);
    res.setHeader('Cache-Control','public, max-age=0, s-maxage='+ttl); return res.status(200).json(data);
  } catch { return res.status(502).json({error:'Falha temporária ao consultar a API-Football.'}); }
};
