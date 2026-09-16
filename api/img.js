const { enforceRateLimit, configuredLimit } = require('../lib/request-security');
const { fetchBounded, requireGet } = require('../lib/http');

module.exports = async (req,res) => {
  if(!requireGet(req,res)) return;
  let url;
  try {
    const raw=req.query?.url;
    if(typeof raw !== 'string' || raw.length>256 || Object.keys(req.query).some(k=>k!=='url')) throw new Error();
    url=new URL(raw);
    if(url.protocol!=='https:' || url.hostname!=='media.api-sports.io' || url.port || url.username || url.password || url.search || url.hash ||
      !/^\/football\/(teams|players|leagues|venues|coaches)\/([1-9]\d{0,8}|placeholder)\.(png|jpg|jpeg|webp)$/.test(url.pathname) || raw !== url.href) throw new Error();
  } catch { return res.status(400).json({error:'URL de imagem inválida ou não autorizada.'}); }
  let limit;
  try { limit=configuredLimit('IMAGE_RATE_LIMIT',240); } catch { return res.status(503).json({error:'Serviço temporariamente indisponível.'}); }
  if(!await enforceRateLimit(req,res,{scope:'image',limit,windowSeconds:60})) return;
  try {
    const {body,contentType}=await fetchBounded(url.href,{}, {timeoutMs:8000,maxBytes:2*1024*1024,contentTypes:['image/png','image/jpeg','image/webp','image/gif']});
    res.setHeader('Content-Type',contentType); res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','public, max-age=86400, s-maxage=604800'); return res.status(200).send(body);
  } catch { return res.status(502).json({error:'Falha ao carregar imagem via proxy.'}); }
};
