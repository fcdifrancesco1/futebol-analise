const crypto = require('node:crypto');
const { fetchBounded } = require('./http');

function generateInviteCode() {
  // Gera 8 caracteres alfanuméricos legíveis em maiúsculas (ex: C8F2A9B1)
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function isValidUUID(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeText(value, min, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  // Permite letras, números, espaços e pontuação básica comum em nomes
  if (/[\r\n\t<>]/.test(trimmed)) return null;
  return trimmed;
}

function validateCompetitions(list) {
  if (!Array.isArray(list) || list.length === 0 || list.length > 50) return null;
  const validIds = [];
  for (const item of list) {
    const num = Number(item);
    if (!Number.isSafeInteger(num) || num <= 0) return null;
    validIds.push(num);
  }
  return [...new Set(validIds)];
}

function validateScore(score) {
  const num = Number(score);
  if (!Number.isSafeInteger(num) || num < 0 || num > 99) return null;
  return num;
}

function validateFixtureDate(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const timestamp = Date.parse(dateStr);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

async function database(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base = process.env.SUPABASE_URL;
  if (!base || !key) throw new Error('Banco não configurado.');
  const response = await fetchBounded(
    `${base}/rest/v1/${path}`,
    {
      ...options,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...options.headers
      }
    },
    { timeoutMs: 5000, maxBytes: 2 * 1024 * 1024 }
  );
  return JSON.parse(response.body.toString('utf8'));
}

const rpc = (name, body) => database(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });

module.exports = {
  generateInviteCode,
  isValidUUID,
  sanitizeText,
  validateCompetitions,
  validateScore,
  validateFixtureDate,
  database,
  rpc
};
