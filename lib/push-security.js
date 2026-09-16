const crypto = require('node:crypto');
const { fetchBounded } = require('./http');
function validEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    // Chromium also issues legacy staging subscriptions on this exact Google
    // host. Preserve the issued endpoint; tokens cannot be moved to another host.
    if (url.hostname === 'jmt17.google.com') return /^\/fcm\/send\/[A-Za-z0-9_:-]+$/.test(url.pathname) && !url.search;
    return ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  } catch { return false; }
}
function validKey(value, bytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== bytes || decoded.toString('base64url') !== value) return false;
  if (bytes === 65) {
    try { crypto.ECDH.convertKey(decoded, 'prime256v1', undefined, undefined, 'uncompressed'); } catch { return false; }
    return decoded[0] === 4;
  }
  return true;
}
function idList(value, max) {
  if (!Array.isArray(value) || value.length > max) throw new Error('Lista de favoritos inválida.');
  return [...new Set(value.map(item => {
    const id = item && typeof item === 'object' ? item.id : item;
    if (!['number', 'string'].includes(typeof id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('Identificador inválido.');
    return Number(id);
  }))];
}
function validateBody(body, deleting = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 16384) throw new Error('Corpo inválido ou muito grande.');
  const allowed = deleting ? ['endpoint','auth'] : ['endpoint','auth','p256dh','favorite_teams','preferences','test'];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new Error('Campo desconhecido.');
  if (!validEndpoint(body.endpoint) || !validKey(body.auth, 16)) throw new Error('Endpoint ou credencial inválida.');
  if (deleting) return { endpoint: body.endpoint, auth: body.auth };
  if (!validKey(body.p256dh, 65)) throw new Error('Chave pública inválida.');
  if (body.test !== undefined && typeof body.test !== 'boolean') throw new Error('Teste inválido.');
  const prefs = body.preferences ?? {};
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) throw new Error('Preferências inválidas.');
  const preferences = {};
  for (const [key, value] of Object.entries(prefs)) {
    if (key === 'sent_events') continue;
    if (key === 'favorite_fixtures') preferences[key] = idList(value, 100);
    else if (['goals', 'redcards', 'lineups', 'kickoff', 'halftime', 'fulltime'].includes(key) && typeof value === 'boolean') preferences[key] = value;
    else throw new Error('Preferência desconhecida ou inválida.');
  }
  return { endpoint: body.endpoint, auth: body.auth, p256dh: body.p256dh, favorite_teams: idList(body.favorite_teams ?? [], 50), preferences, test: body.test === true };
}
function authorizedCron(req) {
  const secret = process.env.CRON_SECRET; const header = req.headers?.authorization;
  if (!secret || typeof header !== 'string') return false;
  const expected = Buffer.from(`Bearer ${secret}`); const actual = Buffer.from(header);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
async function database(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; const base = process.env.SUPABASE_URL;
  if (!base || !key) throw new Error('Banco não configurado.');
  const response = await fetchBounded(`${base}/rest/v1/${path}`, { ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...options.headers } }, { timeoutMs: 5000, maxBytes: 2 * 1024 * 1024 });
  return JSON.parse(response.body.toString('utf8'));
}
const rpc = (name, body) => database(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
module.exports = { validEndpoint, validKey, validateBody, authorizedCron, database, rpc };
