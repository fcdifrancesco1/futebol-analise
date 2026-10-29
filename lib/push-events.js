function follows(sub, fixture) {
  let teams = sub.favorite_teams;
  try { if (typeof teams === 'string') teams = JSON.parse(teams); } catch { teams = []; }
  const fixtures = sub.preferences?.favorite_fixtures || [];
  const has = (list, id) => Array.isArray(list) && list.some(item => Number(item?.id ?? item) === Number(id));
  return has(teams, fixture.teams.home.id) || has(teams, fixture.teams.away.id) || has(fixtures, fixture.fixture.id);
}
const shared = require('../public/js/goal-rules.js');
const isOwnGoal = shared.isOwnGoalEvent;
// VAR da API-Football: "Goal cancelled", "Goal Disallowed - offside" etc.
const isCancelledGoal = e => e?.type === 'Var' && /^goal (cancelled|disallowed)/i.test(String(e.detail || ''));
const VAR_REASONS = { offside: 'impedimento', handball: 'mão na bola', foul: 'falta' };
const varReason = detail => {
  const key = Object.keys(VAR_REASONS).find(k => new RegExp(k, 'i').test(String(detail || '')));
  return key ? VAR_REASONS[key] : '';
};

// Time real de um jogador, inferido pelos outros eventos da partida em que ele
// aparece pelo próprio time (gol normal, assistência, cartão, substituição).
function playerTeamFromEvents(events, playerId) {
  if (playerId == null) return null;
  for (const e of events || []) {
    if (!e?.team?.id || isOwnGoal(e)) continue;
    if (Number(e.player?.id) === Number(playerId) || Number(e.assist?.id) === Number(playerId)) return Number(e.team.id);
  }
  return null;
}

// Sem escalação aqui: o time real do jogador vem dos demais eventos da partida.
const isGoalForTeam = (e, targetTeam, otherTeam, events = null) =>
  shared.isGoalForTeam(e, targetTeam, otherTeam, playerId => playerTeamFromEvents(events, playerId));

function computeScore(events, home, away, fxGoals, upToEvent = null) {
  const eventTime = e => (Number(e.time?.elapsed) || 0) * 100 + (Number(e.time?.extra) || 0);
  const cutoff = upToEvent ? eventTime(upToEvent) : Infinity;
  const relevantGoals = (events || []).filter(e => {
    if (!e || e.type !== 'Goal' || e.detail === 'Missed Penalty') return false;
    return upToEvent ? eventTime(e) <= cutoff : true;
  });
  const eventsHome = relevantGoals.filter(e => isGoalForTeam(e, home, away, events)).length;
  const eventsAway = relevantGoals.filter(e => isGoalForTeam(e, away, home, events)).length;
  // O placar oficial só cobre atrasos da lista de eventos quando o gol é o mais
  // recente; para gols anteriores, o placar daquele minuto vem só dos eventos.
  const isLatestGoal = !upToEvent || !(events || []).some(e => e && e.type === 'Goal' && e.detail !== 'Missed Penalty' && eventTime(e) > cutoff);
  if (!isLatestGoal) return `${home.name} ${eventsHome} x ${eventsAway} ${away.name}`;
  const homeGoals = Math.max(eventsHome, Number(fxGoals?.home ?? 0));
  const awayGoals = Math.max(eventsAway, Number(fxGoals?.away ?? 0));
  return `${home.name} ${homeGoals} x ${awayGoals} ${away.name}`;
}

function payloads(fx, allEvents, lineups) {
  // Cobranças da disputa de pênaltis não são gols da partida nem mudam o placar.
  const events = allEvents.filter(e => !shared.isShootoutKick(e));
  const id = fx.fixture.id; const status = fx.fixture.status.short; const elapsed = fx.fixture.status.elapsed;
  const home = fx.teams.home; const away = fx.teams.away;
  const currentScore = computeScore(events, home, away, fx.goals);
  const result = [];
  const add = (kind, title, body, suffix = '') => result.push({ kind, payload: { title, body, tag: `${kind}-${id}${suffix}`, icon: '/icon-192.png', badge: '/badge-96.png', data: { url: `/#/jogo/${id}` } } });
  if (['NS', 'TBD', '1H'].includes(status) && lineups.some(team => team.startXI?.length)) add('lineups', '📋 ESCALAÇÕES CONFIRMADAS!', `${home.name} × ${away.name}: escalações oficiais disponíveis.`);
  if (status === '1H' && (elapsed == null || elapsed <= 15)) add('kickoff', '⏱️ BOLA ROLANDO!', `Começou ${home.name} × ${away.name}!`);
  if (status === 'HT') add('halftime', '⏸️ INTERVALO', currentScore);
  if (['FT', 'AET', 'PEN'].includes(status)) add('fulltime', '🏁 FIM DE JOGO', currentScore);
  if (['1H', '2H', 'ET', 'P', 'LIVE'].includes(status)) {
    // Identidade do lance SEM o minuto: a API corrige minutos depois de publicar
    // (ex.: vermelho de Olise saiu aos 74' e virou 73'), o que gerava alerta duplicado.
    // Usa o jogador + a ordem do lance daquele tipo para ele na partida.
    const ordinals = new Map();
    const eventKey = new Map();
    const timeKey = e => (Number(e.time?.elapsed) || 0) * 100 + (Number(e.time?.extra) || 0);
    const kindOf = e => e.type === 'Goal' && e.detail !== 'Missed Penalty' ? 'g'
      : isCancelledGoal(e) ? 'x'
      : e.type === 'Card' && ['Red Card', 'Yellow Red'].includes(e.detail) ? 'r' : null;
    [...events].sort((a, b) => timeKey(a) - timeKey(b)).forEach(e => {
      const kind = kindOf(e);
      const who = e.player?.id || (e.player?.name ? `n${String(e.player.name).toLowerCase().replace(/[^a-z0-9]+/g, '')}` : null);
      if (!kind || !who) return;
      const counter = `${kind}-${who}-${e.team?.id || ''}`;
      const n = (ordinals.get(counter) || 0) + 1;
      ordinals.set(counter, n);
      eventKey.set(e, `-p${who}-n${n}`);
    });
    for (const event of events) {
      if (!Number.isFinite(elapsed) || !Number.isFinite(event.time?.elapsed) || elapsed - event.time.elapsed < 0 || elapsed - event.time.elapsed > 3) continue;
      const minute = `${event.time.elapsed}'${event.time.extra ? '+' + event.time.extra : ''}`;
      const suffix = eventKey.get(event) || `-${event.time.elapsed}-${event.time.extra || 0}-${event.team?.id || ''}`;
      if (event.type === 'Goal' && event.detail !== 'Missed Penalty') {
        const isOwn = isOwnGoal(event);
        const scoringTeam = isGoalForTeam(event, home, away, events) ? home : (isGoalForTeam(event, away, home, events) ? away : event.team);
        const scoreAtGoal = computeScore(events, home, away, fx.goals, event);
        const title = `⚽ GOL DO ${(scoringTeam?.name || event.team?.name || 'TIME').toUpperCase()}!${isOwn ? ' (CONTRA)' : ''}`;
        const body = `${event.player?.name || event.team?.name || 'Gol'}${isOwn ? ' (contra)' : ''} aos ${minute}! ${scoreAtGoal}`;
        add('goals', title, body, suffix);
      }
      // Gol anulado pelo VAR: a API envia um evento "Var" com o time e o jogador do lance.
      if (isCancelledGoal(event)) {
        const reason = varReason(event.detail);
        const author = event.player?.name ? ` de ${event.player.name}` : '';
        add('goals', `❌ GOL ANULADO DO ${(event.team?.name || 'TIME').toUpperCase()}!`, `VAR anulou o gol${author} aos ${minute}${reason ? ` (${reason})` : ''}. ${currentScore}`, `-cancelled${suffix}`);
      }
      if (event.type === 'Card' && ['Red Card', 'Yellow Red'].includes(event.detail)) add('redcards', '🟥 CARTÃO VERMELHO!', `${event.player?.name || event.team?.name || 'Jogador'} expulso aos ${minute}.`, suffix);
    }
  }
  // Preserve historical tags during migration from preferences.sent_events.
  for (const item of result) item.payload.tag = item.payload.tag.replace(/^goals-/, 'goal-').replace(/^redcards-/, 'redcard-');
  return result;
}
module.exports = { follows, payloads, isGoalForTeam, computeScore, isCancelledGoal };
