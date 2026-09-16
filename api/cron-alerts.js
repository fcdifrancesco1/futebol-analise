const webpush = require('web-push');
const { randomUUID } = require('node:crypto');
const { validEndpoint, validKey, authorizedCron, database, rpc } = require('../lib/push-security');
const { follows, payloads } = require('../lib/push-events');
const { consumeGlobalBudget } = require('../lib/request-security');
const { fetchBounded } = require('../lib/http');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorizedCron(req)) return res.status(401).json({ error: 'Acesso não autorizado.' });
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  if (!['FOOTBALL_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY'].every(key => process.env[key])) return res.status(503).json({ error: 'Configuração do monitor incompleta.' });
  const token = randomUUID();
  const deadline = Date.now() + 40000;
  let locked = false, cursor = '', completed = false, sent = 0, unknown = 0, processed = 0, requests = 0, invalid = 0;
  let active = '', fixtureCursor = 0;
  let failure = null;
  const checkTime = () => { if (Date.now() >= deadline) throw Object.assign(new Error('Limite de execução atingido.'), { bounded: true }); };
  const football = async path => {
    checkTime();
    if (++requests > 20) throw Object.assign(new Error('Limite de consultas por execução atingido.'), { bounded: true });
    const budget = await consumeGlobalBudget();
    if (!budget.allowed) throw Object.assign(new Error('Orçamento diário da API esgotado.'), { status: 429 });
    let json;
    try {
      const response = await fetchBounded('https://v3.football.api-sports.io/' + path, { headers: { 'x-apisports-key': process.env.FOOTBALL_API_KEY } }, { timeoutMs: 5000, maxBytes: 2 * 1024 * 1024 });
      json = JSON.parse(response.body.toString('utf8'));
    } catch { throw Object.assign(new Error('API de futebol indisponível.'), { status: 502 }); }
    if (!Array.isArray(json.response) || json.response.length > 2000 || (json.errors && Object.keys(json.errors).length)) throw Object.assign(new Error('Resposta inválida da API de futebol.'), { status: 502 });
    return json.response;
  };
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contato@futstats.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const lease = await rpc('acquire_push_run', { p_token: token });
    if (!Array.isArray(lease)) throw new Error('Resposta inválida do bloqueio.');
    if (!lease.length) return res.status(200).json({ success: true, skipped: 'already-running' });
    locked = true; cursor = lease[0].cursor_endpoint || '';
    active = lease[0].active_endpoint || ''; fixtureCursor = Number(lease[0].cursor_fixture) || 0;
    const firstPage = await database('push_subscriptions?select=endpoint,auth,p256dh,favorite_teams,preferences&order=endpoint.asc&limit=50&endpoint=gt.' + encodeURIComponent(cursor));
    if (!Array.isArray(firstPage)) throw new Error('Página de assinaturas inválida.');
    if (!firstPage.length) { completed = true; cursor = ''; active = ''; fixtureCursor = 0; }
    else {
      const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const live = await football('fixtures?live=all');
      const today = await football('fixtures?date=' + date + '&timezone=America/Sao_Paulo');
      const fixtures = [...new Map([...today, ...live].filter(fx => Number.isSafeInteger(fx.fixture?.id) && fx.teams?.home && fx.teams?.away && fx.goals).map(fx => [fx.fixture.id, fx])).values()].sort((a,b) => a.fixture.id-b.fixture.id);
      const details = new Map();
      let page = firstPage;
      for (let pages = 0; pages < 10; pages++) {
        for (const sub of page) {
          checkTime();
          if (active !== sub.endpoint) { active = sub.endpoint; fixtureCursor = 0; }
          if (!validEndpoint(sub.endpoint) || !validKey(sub.auth,16) || !validKey(sub.p256dh,65)) { invalid++; cursor = sub.endpoint; active = ''; fixtureCursor = 0; continue; }
          for (const fx of fixtures) {
            checkTime();
            if (fx.fixture.id <= fixtureCursor) continue;
            if (!follows(sub, fx)) { fixtureCursor = fx.fixture.id; continue; }
            const fixtureId = fx.fixture.id; const status = fx.fixture.status.short;
            if (!details.has(fixtureId)) {
              const lineups = ['NS','TBD','1H'].includes(status) ? await football('fixtures/lineups?fixture=' + fixtureId) : [];
              const events = ['1H','2H','ET','P','LIVE'].includes(status) ? await football('fixtures/events?fixture=' + fixtureId) : [];
              details.set(fixtureId, payloads(fx, events, lineups));
            }
            for (const item of details.get(fixtureId)) {
              checkTime();
              if (sub.preferences?.[item.kind] === false) continue;
              if (sent + unknown >= 80) throw Object.assign(new Error('Limite de entregas por execução atingido.'), { bounded: true });
              const claim = await rpc('claim_push_event', { p_endpoint: sub.endpoint, p_auth: sub.auth, p_event: item.payload.tag, p_token: token });
              if (claim === false) continue;
              if (claim !== true) throw new Error('Resposta inválida da reserva de entrega.');
              // A reserved attempt is never automatically retried: timeout may mean accepted by provider.
              let outcome = 'sent';
              try {
                await webpush.sendNotification({ endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } }, JSON.stringify(item.payload), { TTL: 180, urgency: 'high', timeout: 5000 });
                sent++;
              } catch (error) {
                outcome = [404,410].includes(error.statusCode) ? 'expired' : 'unknown';
                if (outcome === 'unknown') unknown++;
              }
              const finished = await rpc('finish_push_event', { p_endpoint: sub.endpoint, p_event: item.payload.tag, p_token: token, p_status: outcome });
              if (finished !== true) throw new Error('Não foi possível confirmar o registro de entrega.');
              if (outcome === 'expired') {
                const removed = await rpc('delete_push_subscription', { p_endpoint: sub.endpoint, p_auth: sub.auth });
                if (typeof removed !== 'boolean') throw new Error('Resposta inválida da remoção.');
                break;
              }
            }
            fixtureCursor = fixtureId;
          }
          cursor = sub.endpoint; active = ''; fixtureCursor = 0; processed++;
        }
        if (page.length < 50) { completed = true; cursor = ''; break; }
        checkTime();
        page = await database('push_subscriptions?select=endpoint,auth,p256dh,favorite_teams,preferences&order=endpoint.asc&limit=50&endpoint=gt.' + encodeURIComponent(cursor));
        if (!Array.isArray(page)) throw new Error('Página de assinaturas inválida.');
      }
    }
  } catch (error) {
    if (!error.bounded) failure = { status: error.status || 503, message: error.status ? error.message : 'Falha no processamento de alertas.' };
  } finally {
    if (locked) {
      try { if (await rpc('release_push_run', { p_token: token, p_cursor: cursor, p_active: active, p_fixture: fixtureCursor }) !== true) throw new Error('lease lost'); }
      catch { failure = { status: 503, message: 'Falha ao concluir o registro da execução.' }; }
    }
  }
  return res.status(failure?.status || 200).json({ success: !failure, completed, subscribersProcessed: processed, notificationsSent: sent, deliveryUnknown: unknown, invalidSubscriptions: invalid, ...(failure ? { error: failure.message } : {}) });
};
