const crypto = require('node:crypto');

function generateInviteCode() {
  // Gera 8 caracteres alfanuméricos legíveis em maiúsculas (ex: C8F2A9B1)
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function isValidUUID(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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
  if (!base || !key) {
    throw new Error('Banco de dados Supabase não configurado no servidor.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `${base.replace(/\/$/, '')}/rest/v1/${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...options.headers
      },
      redirect: 'error',
      signal: controller.signal
    });

    const bodyText = await response.text();

    if (!response.ok) {
      let errMessage = '';
      try {
        const errJson = JSON.parse(bodyText);
        errMessage = errJson.message || errJson.error || errJson.details || errJson.hint || '';
      } catch {
        errMessage = bodyText;
      }

      // Identifica com precisão se a tabela ou RPC não existe no Supabase
      if (
        response.status === 404 ||
        errMessage.includes('PGRST202') ||
        errMessage.includes('Could not find the function') ||
        errMessage.includes('42P01') ||
        errMessage.includes('does not exist')
      ) {
        throw new Error(
          'As tabelas ou funções do Bolão ainda não foram criadas no banco de dados. Por favor, execute o script SQL supabase/bolao_schema.sql no SQL Editor do seu projeto Supabase.'
        );
      }

      throw new Error(errMessage || `Erro no Supabase (HTTP ${response.status})`);
    }

    if (!bodyText || bodyText.trim() === '') return null;
    return JSON.parse(bodyText);
  } finally {
    clearTimeout(timer);
  }
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
