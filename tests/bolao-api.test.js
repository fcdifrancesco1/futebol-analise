const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const realFetch = global.fetch;
const originalEnv = { ...process.env };

const {
  generateInviteCode,
  isValidUUID,
  sanitizeText,
  validateCompetitions,
  validateScore,
  validateFixtureDate
} = require('../lib/bolao-security');

function response() {
  return {
    statusCode: 200,
    headers: {},
    status(n) { this.statusCode = n; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    json(v) { this.body = v; return this; },
    send(v) { this.body = v; return this; }
  };
}

function request(query = {}, method = 'GET', body = null) {
  return {
    method,
    query,
    body,
    headers: {},
    socket: { remoteAddress: '192.0.2.20' }
  };
}

function handler() {
  delete require.cache[require.resolve('../api/bolao')];
  return require('../api/bolao');
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.RATE_LIMIT_SECRET = 'test-secret-at-least-32-chars-long-abc';
  delete process.env.VERCEL;
});

afterEach(() => {
  global.fetch = realFetch;
  process.env = { ...originalEnv };
});

const json = value => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'content-type': 'application/json' }
});

test('Bolão Security Helpers: code generation, UUID, text and score validation', () => {
  // Invite code
  const code = generateInviteCode();
  assert.equal(code.length, 8);
  assert.match(code, /^[0-9A-F]{8}$/);

  // UUID
  assert.equal(isValidUUID('11111111-1111-4000-8000-111111111111'), true);
  assert.equal(isValidUUID('invalid-uuid'), false);
  assert.equal(isValidUUID(null), false);

  // Text
  assert.equal(sanitizeText('  Liga dos Amigos  ', 3, 50), 'Liga dos Amigos');
  assert.equal(sanitizeText('ab', 3, 50), null);
  assert.equal(sanitizeText('Nome <script>', 3, 50), null);

  // Competitions
  assert.deepEqual(validateCompetitions([71, '39', 2, 71]), [71, 39, 2]);
  assert.equal(validateCompetitions([]), null);
  assert.equal(validateCompetitions(['invalid']), null);

  // Score
  assert.equal(validateScore(0), 0);
  assert.equal(validateScore('3'), 3);
  assert.equal(validateScore(-1), null);
  assert.equal(validateScore(100), null);
  assert.equal(validateScore('abc'), null);

  // Fixture Date
  assert.ok(validateFixtureDate('2026-09-20T16:00:00Z'));
  assert.equal(validateFixtureDate('invalid-date'), null);
});

test('Bolão API: rejects unsupported methods and unknown actions', async () => {
  const bolao = handler();
  const res1 = response();
  await bolao(request({}, 'DELETE'), res1);
  assert.equal(res1.statusCode, 405);

  const res2 = response();
  await bolao(request({ action: 'unknown-action' }, 'GET'), res2);
  assert.equal(res2.statusCode, 400);
});

test('Bolão API action=invite: validates invite code and returns preview', async () => {
  const bolao = handler();

  // Invalid code
  const resBad = response();
  await bolao(request({ action: 'invite', code: 'SHORT' }, 'GET'), resBad);
  assert.equal(resBad.statusCode, 400);

  // Mock database response
  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('/rpc/consume_request_limit')) {
      return json({ allowed: true, retry_after: 1 });
    }
    if (urlStr.includes('/bolao_leagues?invite_code=eq.ABC12345')) {
      return json([{
        id: '11111111-1111-4000-8000-111111111111',
        name: 'Liga dos Campeões',
        invite_code: 'ABC12345',
        competitions: [71, 39],
        created_at: '2026-09-18T10:00:00Z',
        bolao_participants: [{ count: 5 }]
      }]);
    }
    return json([]);
  };

  const resOk = response();
  await bolao(request({ action: 'invite', code: 'ABC12345' }, 'GET'), resOk);
  assert.equal(resOk.statusCode, 200);
  assert.equal(resOk.body.name, 'Liga dos Campeões');
  assert.equal(resOk.body.member_count, 5);

  // League not found
  const resNotFound = response();
  await bolao(request({ action: 'invite', code: 'ZZZZZZZZ' }, 'GET'), resNotFound);
  assert.equal(resNotFound.statusCode, 404);
});

test('Bolão API action=create: validates inputs and calls RPC', async () => {
  const bolao = handler();

  let rpcPayload = null;
  global.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.includes('/rpc/consume_request_limit')) {
      return json({ allowed: true, retry_after: 1 });
    }
    if (urlStr.includes('/rpc/create_bolao_league')) {
      rpcPayload = JSON.parse(opts.body);
      return json({
        league_id: '22222222-2222-4000-8000-222222222222',
        name: rpcPayload.p_name,
        invite_code: rpcPayload.p_invite_code,
        competitions: rpcPayload.p_competitions
      });
    }
    return json([]);
  };

  // Missing/invalid inputs
  const resBad = response();
  await bolao(request({ action: 'create' }, 'POST', { name: 'A' }), resBad);
  assert.equal(resBad.statusCode, 400);

  // Valid create
  const validBody = {
    name: 'Bolão da Galera',
    creator_name: 'Felipe',
    creator_id: '11111111-1111-4000-8000-111111111111',
    creator_token: 'valid_secret_token_123',
    competitions: [71, 13]
  };

  const resOk = response();
  await bolao(request({ action: 'create' }, 'POST', validBody), resOk);
  assert.equal(resOk.statusCode, 201);
  assert.equal(resOk.body.success, true);
  assert.equal(resOk.body.league.name, 'Bolão da Galera');
  assert.equal(rpcPayload.p_creator_name, 'Felipe');
  assert.equal(rpcPayload.p_invite_code.length, 8);
});

test('Bolão API action=prediction: enforces 10-minute deadline and saves valid prediction', async () => {
  const bolao = handler();

  let rpcCalled = false;
  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('/rpc/consume_request_limit')) {
      return json({ allowed: true, retry_after: 1 });
    }
    if (urlStr.includes('/rpc/save_bolao_prediction')) {
      rpcCalled = true;
      return json(true);
    }
    return json([]);
  };

  const validLeague = '11111111-1111-4000-8000-111111111111';
  const validUser = '22222222-2222-4000-8000-222222222222';

  // 1. Partida a menos de 10 minutos (5 min no futuro): REJEITADA
  const lateDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const resLate = response();
  await bolao(request({ action: 'prediction' }, 'POST', {
    league_id: validLeague,
    participant_id: validUser,
    participant_token: 'secret_token_abc',
    fixture_id: 101,
    fixture_date: lateDate,
    home_score: 2,
    away_score: 1
  }), resLate);

  assert.equal(resLate.statusCode, 400);
  assert.match(resLate.body.error, /10 minutos antes do início/);
  assert.equal(rpcCalled, false);

  // 2. Partida no passado: REJEITADA
  const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
  const resPast = response();
  await bolao(request({ action: 'prediction' }, 'POST', {
    league_id: validLeague,
    participant_id: validUser,
    participant_token: 'secret_token_abc',
    fixture_id: 102,
    fixture_date: pastDate,
    home_score: 1,
    away_score: 0
  }), resPast);
  assert.equal(resPast.statusCode, 400);

  // 3. Partida válida (> 10 minutos no futuro, ex: 1 hora): ACEITA
  const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const resOk = response();
  await bolao(request({ action: 'prediction' }, 'POST', {
    league_id: validLeague,
    participant_id: validUser,
    participant_token: 'secret_token_abc',
    fixture_id: 103,
    fixture_date: futureDate,
    home_score: 2,
    away_score: 0
  }), resOk);

  assert.equal(resOk.statusCode, 200);
  assert.equal(resOk.body.success, true);
  assert.equal(rpcCalled, true);
});

test('Bolão API action=create: falls back to direct table inserts when RPC is not in schema cache', async () => {
  const bolao = handler();

  let tableLeagueInserted = false;
  let tableParticipantInserted = false;

  global.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.includes('/rpc/consume_request_limit')) {
      return json({ allowed: true, retry_after: 1 });
    }
    if (urlStr.includes('/rpc/create_bolao_league')) {
      // Simula PostgREST schema cache miss (PGRST202)
      return new Response(JSON.stringify({
        code: 'PGRST202',
        message: 'Could not find the function public.create_bolao_league in the schema cache'
      }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    if (urlStr.includes('/rest/v1/bolao_leagues') && opts?.method === 'POST') {
      tableLeagueInserted = true;
      const body = JSON.parse(opts.body);
      return json([{
        id: '33333333-3333-4000-8000-333333333333',
        name: body.name,
        invite_code: body.invite_code,
        competitions: body.competitions
      }]);
    }
    if (urlStr.includes('/rest/v1/bolao_participants') && opts?.method === 'POST') {
      tableParticipantInserted = true;
      return json([{ id: 'mock-p-id' }]);
    }
    return json([]);
  };

  const validBody = {
    name: 'Liga Fallback',
    creator_name: 'Felipe',
    creator_id: '11111111-1111-4000-8000-111111111111',
    creator_token: 'valid_secret_token_123',
    competitions: [71]
  };

  const res = response();
  await bolao(request({ action: 'create' }, 'POST', validBody), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.league.name, 'Liga Fallback');
  assert.equal(tableLeagueInserted, true);
  assert.equal(tableParticipantInserted, true);
});

test('Bolão API: informs user clearly about supabase/bolao_schema.sql when tables do not exist', async () => {
  const bolao = handler();

  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('/rpc/consume_request_limit')) {
      return json({ allowed: true, retry_after: 1 });
    }
    // Simula 404 / 42P01 do PostgREST quando a tabela não existe
    return new Response(JSON.stringify({
      code: '42P01',
      message: 'relation "public.bolao_leagues" does not exist'
    }), { status: 404, headers: { 'content-type': 'application/json' } });
  };

  const validBody = {
    name: 'Liga Teste',
    creator_name: 'Felipe',
    creator_id: '11111111-1111-4000-8000-111111111111',
    creator_token: 'valid_secret_token_123',
    competitions: [71]
  };

  const res = response();
  await bolao(request({ action: 'create' }, 'POST', validBody), res);

  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /supabase\/bolao_schema\.sql/);
  // Não deve conter a mensagem opaca "Upstream HTTP error"
  assert.doesNotMatch(res.body.error, /Upstream HTTP error/);
});

