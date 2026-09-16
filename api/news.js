const { enforceRateLimit, configuredLimit } = require('../lib/request-security');
const { fetchBounded, requireGet } = require('../lib/http');

// Stable club identities only. Exact normalized aliases avoid confusing Inter
// Miami with Internacional, Sporting with Sport, or a short substring with a city.
const CLUBS = [
  [['sao paulo','spfc'],['São Paulo FC','SPFC','São Paulo Futebol Clube','Tricolor Paulista']],
  [['internacional','inter de porto alegre'],['Sport Club Internacional','SC Internacional','Inter de Porto Alegre']],
  [['vitoria','ec vitoria'],['Esporte Clube Vitória','EC Vitória','Vitória-BA','Leão da Barra']],
  [['sport','sport recife'],['Sport Club do Recife','Sport Recife','Leão da Ilha']],
  [['santos','santos fc'],['Santos FC','Santos Futebol Clube','Alvinegro Praiano']],
  [['fortaleza'],['Fortaleza EC','Fortaleza Esporte Clube','Leão do Pici']],
  [['bahia'],['EC Bahia','Esporte Clube Bahia','Tricolor de Aço']],
  [['cruzeiro'],['Cruzeiro EC','Cruzeiro Esporte Clube']],
  [['vasco','vasco da gama'],['CR Vasco da Gama','Vasco da Gama futebol','Gigante da Colina']],
  [['flamengo'],['CR Flamengo','Clube de Regatas do Flamengo','Flamengo futebol']],
  [['fluminense'],['Fluminense FC','Fluminense Football Club','Tricolor das Laranjeiras']],
  [['palmeiras'],['Sociedade Esportiva Palmeiras','Palmeiras futebol']],
  [['corinthians'],['Sport Club Corinthians Paulista','Corinthians futebol']],
  [['gremio'],['Grêmio Foot-Ball Porto Alegrense','Grêmio futebol','Tricolor Gaúcho']],
  [['atletico mineiro','atletico-mg'],['Atlético-MG','Atlético Mineiro']],
  [['athletico','athletico paranaense','athletico-pr'],['Athletico-PR','Athletico Paranaense']],
  [['atletico goianiense','atletico-go'],['Atlético-GO','Atlético Goianiense']],
  [['america mineiro','america-mg'],['América-MG','América Mineiro']],
  [['botafogo'],['Botafogo FR','Botafogo de Futebol e Regatas','Botafogo futebol']],
  [['juventude'],['EC Juventude','Esporte Clube Juventude']],
  [['cuiaba'],['Cuiabá EC','Cuiabá Esporte Clube']],
  [['ceara'],['Ceará SC','Ceará Sporting Club']],
  [['goias'],['Goiás EC','Goiás Esporte Clube']],
  [['coritiba'],['Coritiba FC','Coritiba Foot Ball Club']],
  [['avai'],['Avaí FC','Avaí Futebol Clube']],
  [['chapecoense'],['Associação Chapecoense de Futebol','Chapecoense']],
  [['crb'],['Clube de Regatas Brasil','CRB futebol']],
  [['csa'],['Centro Sportivo Alagoano','CSA futebol']],
  [['ponte preta'],['Associação Atlética Ponte Preta','Ponte Preta futebol']],
  [['guarani'],['Guarani FC','Guarani de Campinas']],
  [['paysandu'],['Paysandu Sport Club','Paysandu futebol']],
  [['remo'],['Clube do Remo']],
  [['nautico'],['Clube Náutico Capibaribe','Náutico futebol']],
  [['santa cruz'],['Santa Cruz Futebol Clube','Santa Cruz FC']],
  [['operario','operario-pr'],['Operário-PR','Operário Ferroviário']],
  [['novorizontino'],['Grêmio Novorizontino','Novorizontino']],
  [['mirassol'],['Mirassol FC','Mirassol Futebol Clube']],
  [['brusque'],['Brusque FC','Brusque Futebol Clube']],
  [['amazonas'],['Amazonas FC']],
  [['ituano'],['Ituano FC','Ituano Futebol Clube']],
  [['londrina'],['Londrina EC','Londrina Esporte Clube']],
  [['figueirense'],['Figueirense FC','Figueirense Futebol Clube']],
  [['parana'],['Paraná Clube']],
  [['portuguesa'],['Portuguesa de Desportos']],
  [['real madrid'],['Real Madrid futebol','Real Madrid CF']],
  [['barcelona'],['FC Barcelona','Barcelona futebol']],
  [['manchester city','man city','man. city'],['Manchester City','Man City']],
  [['manchester united'],['Manchester United','Man United']],
  [['liverpool'],['Liverpool FC','Liverpool futebol']],
  [['chelsea'],['Chelsea FC','Chelsea futebol']],
  [['arsenal'],['Arsenal FC','Arsenal futebol']],
  [['bayern munich','bayern munchen'],['Bayern de Munique','Bayern München','Bayern Munich']],
  [['borussia dortmund'],['Borussia Dortmund','BVB futebol']],
  [['paris saint germain','psg'],['Paris Saint-Germain','PSG futebol']],
  [['juventus'],['Juventus Turim','Juventus futebol']],
  [['milan','ac milan'],['AC Milan']],
  [['inter','internazionale','inter milan'],['Inter de Milão','Internazionale','Inter Milan']],
  [['benfica'],['SL Benfica','Benfica futebol']],
  [['sporting','sporting cp'],['Sporting CP','Sporting de Portugal']],
  [['porto'],['FC Porto']],
  [['boca juniors'],['Boca Juniors']],
  [['river plate'],['River Plate futebol']]
];
const EXCLUSIONS = {
  "sao paulo": [
    "prefeitura", "governador", "tarcísio", "metrô", "trânsito", "rodovia",
    "acidente", "zona leste", "zona sul", "zona norte", "polícia civil",
    "polícia militar", "av. paulista", "chuva em sp", "tempo em sp", "hilton", "hotel", "hotéis", "revista hotéis"
  ],
  "internacional": [
    "epia", "aeroporto", "comércio internacional", "mercado financeiro", "tribunal",
    "tráfico", "internacional de cinema", "fundo monetário", "comunidade internacional",
    "relações internacionais", "política internacional"
  ],
  "vitoria": [
    "vitória de ", "conquista vitória", "garante vitória", "vitória por ", "cidade de vitória",
    "prefeitura de vitória", "capital capixaba", "espírito santo", "polícia de vitória",
    "vitória do flamengo", "vitória do palmeiras", "vitória do corinthians", "vitória do são paulo",
    "vitória do grêmio", "vitória do cruzeiro", "vitória do vasco", "vitória do botafogo",
    "vitória do santos", "vitória do fluminense", "vitória do galo"
  ],
  "santos": [
    "prefeitura de santos", "porto de santos", "praia de santos", "intoxicação por peixe",
    "pesca de peixe", "hospital de santos", "polícia de santos"
  ],
  "sport": [
    "futsal experience", "diadema", "prefeitura de", "secretaria de esporte"
  ],
  "vasco": [
    "bairro vasco da gama", "encostas protegidas", "prefeitura do recife",
    "incêndio em prédio", "vasco-pi", "vasco-ac", "vasco-se", "piauiense"
  ],
  "botafogo": [
    "botafogo-sp", "botafogo-pb", "botafogo-ba", "botafogo da paraíba",
    "botafogo de ribeirão", "paraibano", "paulistão a2"
  ],
  "flamengo": [
    "flamengo-pi", "flamengo-sp", "flamengo-se", "flamengo-ba", "flamengo de guarulhos"
  ],
  "fluminense": [
    "fluminense de feira", "flu de feira", "fluminense-pi", "fluminense-ba"
  ]
};


function normalizeName(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}
function decodeXML(value) {
  const named = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'" };
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (_,entity) => {
    if(entity[0]!=='#') return named[entity.toLowerCase()];
    const code = entity[1].toLowerCase()==='x' ? parseInt(entity.slice(2),16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code>=0xd800 && code<=0xdfff) ? String.fromCodePoint(code) : '\uFFFD';
  });
}
// Bounded RSS tokenizer: handles CDATA, entities, attributes, comments and
// namespace prefixes, validates nesting and never resolves DTD/external entities.
function parseRSS(xml) {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD not permitted');
  const tokens=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z_][\w:.-]*(?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?>|[^<]+/gy;
  const stack=[], items=[]; let current=null, position=0, root=false, match;
  const local = tag => tag.split(':').pop();
  while((match=tokens.exec(xml))) {
    if(match.index!==position) throw new Error('Malformed feed');
    const token=match[0]; position=tokens.lastIndex;
    if(token.startsWith('<!--') || token.startsWith('<?')) continue;
    if(token.startsWith('<![CDATA[') || token[0]!=='<') {
      if(!stack.length && token.trim()) throw new Error('Text outside root');
      const field=local(stack.at(-1) || '');
      if(current && ['title','link','pubDate','source'].includes(field)) {
        current[field]=(current[field] || '')+(token.startsWith('<![CDATA[') ? token.slice(9,-3) : decodeXML(token));
      }
      continue;
    }
    const name=token.match(/^<\/?([\w:.-]+)/)[1];
    if(token.startsWith('</')) {
      if(stack.pop()!==name) throw new Error('Malformed nesting');
      if(local(name)==='item' && current){items.push(current); current=null;}
    } else {
      if(!stack.length){if(root || local(name)!=='rss') throw new Error('Expected RSS'); root=true;}
      if(stack.length>32 || items.length>1000) throw new Error('Feed limits exceeded');
      if(local(name)==='item'){
        if(current || local(stack.at(-1)||'')!=='channel') throw new Error('Malformed item');
        current={};
      }
      if(!token.endsWith('/>')) stack.push(name);
      else if(local(name)==='item'){items.push(current);current=null;}
    }
  }
  if(position!==xml.length || stack.length || !root) throw new Error('Incomplete feed');
  return items;
}
function toNews(item, negatives) {
  let title=(item.title || '').trim(), source=(item.source || '').trim();
  if(source && title.endsWith(' - '+source)) title=title.slice(0,-source.length-3).trim();
  else if(!source && title.includes(' - ')){const parts=title.split(' - ');source=parts.pop().trim();title=parts.join(' - ').trim();}
  if(!title || negatives.some(n=>normalizeName(title).includes(normalizeName(n)))) return null;
  let link;
  try {
    link=new URL((item.link || '').trim());
    if(!['https:','http:'].includes(link.protocol) || link.username || link.password) return null;
  } catch {return null;}
  const pubDate=(item.pubDate || '').trim(), parsed=Date.parse(pubDate);
  const timestamp=Number.isFinite(parsed) ? parsed : 0;
  let timeAgo='Recente';
  if(timestamp){
    const minutes=Math.max(0,Math.floor((Date.now()-timestamp)/60000)), hours=Math.floor(minutes/60), days=Math.floor(hours/24);
    timeAgo=minutes<=1?'Agora mesmo':minutes<60?'Há '+minutes+' min':hours<24?'Há '+hours+'h':days===1?'Ontem':'Há '+days+' dias';
  }
  return {title,source:source||'Portal de Notícias',link:link.href,pubDate,timestamp,timeAgo};
}
module.exports = async (req,res) => {
  if(!requireGet(req,res)) return;
  const team=req.query?.team;
  if(typeof team!=='string' || team.trim().length<2 || team.length>120 || !/^[\p{L}\p{N} .'-]+$/u.test(team) || Object.keys(req.query).some(k=>k!=='team')) {
    return res.status(400).json({error:'Parâmetro team inválido.'});
  }
  let limit;
  try {limit=configuredLimit('NEWS_RATE_LIMIT',30);} catch {return res.status(503).json({error:'Serviço temporariamente indisponível.'});}
  if(!await enforceRateLimit(req,res,{scope:'news',limit,windowSeconds:60})) return;
  const cleanTeam=team.trim(), normalized=normalizeName(cleanTeam);
  const club=CLUBS.find(([aliases])=>aliases.includes(normalized));
  const query=club ? '('+club[1].map(name=>'"'+name+'"').join(' OR ')+')' : '"'+cleanTeam+'" futebol';
  const negatives=EXCLUSIONS[club ? club[0][0] : normalized] || [];
  try {
    const {body}=await fetchBounded('https://news.google.com/rss/search?q='+encodeURIComponent(query)+'&hl=pt-BR&gl=BR&ceid=BR:pt-419',
      {headers:{Accept:'application/rss+xml, application/xml, text/xml'}},{timeoutMs:8000,maxBytes:1024*1024});
    const seen=new Set();
    const items=parseRSS(body.toString('utf8')).map(item=>toNews(item,negatives)).filter(item=>{
      if(!item || seen.has(item.link)) return false; seen.add(item.link); return true;
    }).sort((a,b)=>b.timestamp-a.timestamp).slice(0,6);
    res.setHeader('Cache-Control','public, max-age=180, s-maxage=300');
    return res.status(200).json({team:cleanTeam,count:items.length,items});
  } catch { return res.status(502).json({error:'Erro ao processar notícias esportivas.'}); }
};
