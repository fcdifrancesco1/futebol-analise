const { createHmac } = require('node:crypto');
const { isIP } = require('node:net');
const { fetchBounded } = require('./http');
function configuredLimit(name, fallback, maximum = 1000000) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > maximum) throw new Error('Invalid limit configuration');
  return Number(value);
}
function clientIP(req) {
  // Vercel overwrites this header at its trusted edge. Ignore all forwarded
  // headers in direct/local deployments; only the TCP peer is authoritative.
  const value = process.env.VERCEL === '1' ? req.headers?.['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
  if (typeof value !== 'string' || !isIP(value.trim())) throw new Error('Unavailable client address');
  let ip = value.trim().toLowerCase();
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) return ip.slice(7);
  if (isIP(ip) === 6) ip = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  return ip;
}
async function consumeCounter(scope, subject, limit, windowSeconds) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) throw new Error('Limiter not configured');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid limiter URL');
  const result = await fetchBounded(`${url.origin}/rest/v1/rpc/consume_request_limit`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_scope: scope, p_subject: subject, p_limit: limit, p_window_seconds: windowSeconds })
  }, { timeoutMs: 4000, maxBytes: 8192 });
  const data = JSON.parse(result.body.toString('utf8'));
  if (!data || typeof data.allowed !== 'boolean' || !Number.isSafeInteger(data.retry_after) || data.retry_after < 1 || data.retry_after > windowSeconds) throw new Error('Invalid limiter response');
  return { allowed: data.allowed, retryAfter: data.retry_after };
}
async function enforceRateLimit(req, res, { scope, limit, windowSeconds }) {
  try {
    const secret = process.env.RATE_LIMIT_SECRET;
    if (!secret || secret.length < 32) throw new Error('Limiter secret not configured');
    const subject = createHmac('sha256', secret).update(clientIP(req)).digest('hex');
    const result = await consumeCounter(scope, subject, limit, windowSeconds);
    if (result.allowed) return true;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Retry-After', String(result.retryAfter));
    res.status(429).json({ error: 'Muitas solicitações. Tente novamente em instantes.' });
  } catch {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Retry-After', '30');
    res.status(503).json({ error: 'Serviço temporariamente indisponível.' });
  }
  return false;
}
// Same UTC daily counter for every paid request, including cron work. Reserve
// before contacting the provider; failures still consume a reservation.
async function consumeGlobalBudget() {
  return consumeCounter('football-global', 'global', configuredLimit('FOOTBALL_DAILY_BUDGET', 100), 86400);
}
module.exports = { enforceRateLimit, consumeGlobalBudget, configuredLimit, clientIP };
