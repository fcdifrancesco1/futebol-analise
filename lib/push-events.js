function follows(sub, fixture) {
  let teams = sub.favorite_teams;
  try { if (typeof teams === 'string') teams = JSON.parse(teams); } catch { teams = []; }
  const fixtures = sub.preferences?.favorite_fixtures || [];
  const has = (list, id) => Array.isArray(list) && list.some(item => Number(item?.id ?? item) === Number(id));
  return has(teams, fixture.teams.home.id) || has(teams, fixture.teams.away.id) || has(fixtures, fixture.fixture.id);
}
function isGoalForTeam(e, targetTeam, otherTeam) {
  if (!e || e.type !== 'Goal' || e.detail === 'Missed Penalty') return false;
  const isOwn = e.detail === 'Own Goal' || (e.comments && /own goal/i.test(e.comments));
  const tId = targetTeam?.id != null ? Number(targetTeam.id) : null;
  const oId = otherTeam?.id != null ? Number(otherTeam.id) : null;
  const eId = e.team?.id != null ? Number(e.team.id) : null;
  const eName = String(e.team?.name || '').toLowerCase().trim();
  const tName = String(targetTeam?.name || '').toLowerCase().trim();
  const oName = String(otherTeam?.name || '').toLowerCase().trim();

  const isTarget = (tId != null && eId != null && tId === eId) || (Boolean(tName) && eName === tName);
  const isOther = (oId != null && eId != null && oId === eId) || (Boolean(oName) && eName === oName);

  return isOwn ? isOther : isTarget;
}

function computeScore(events, home, away, fxGoals, upToEvent = null) {
  const eventTime = e => (Number(e.time?.elapsed) || 0) * 100 + (Number(e.time?.extra) || 0);
  const cutoff = upToEvent ? eventTime(upToEvent) : Infinity;
  const relevantGoals = (events || []).filter(e => {
    if (!e || e.type !== 'Goal' || e.detail === 'Missed Penalty') return false;
    return upToEvent ? eventTime(e) <= cutoff : true;
  });
  const eventsHome = relevantGoals.filter(e => isGoalForTeam(e, home, away)).length;
  const eventsAway = relevantGoals.filter(e => isGoalForTeam(e, away, home)).length;
  const homeGoals = Math.max(eventsHome, Number(fxGoals?.home ?? 0));
  const awayGoals = Math.max(eventsAway, Number(fxGoals?.away ?? 0));
  return `${home.name} ${homeGoals} x ${awayGoals} ${away.name}`;
}

function payloads(fx, events, lineups) {
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
    for (const event of events) {
      if (!Number.isFinite(elapsed) || !Number.isFinite(event.time?.elapsed) || elapsed - event.time.elapsed < 0 || elapsed - event.time.elapsed > 3) continue;
      const minute = `${event.time.elapsed}'${event.time.extra ? '+' + event.time.extra : ''}`;
      const suffix = `-${event.time.elapsed}-${event.time.extra || 0}-${event.player?.id || event.team?.id || ''}`;
      if (event.type === 'Goal' && event.detail !== 'Missed Penalty') {
        const isOwn = event.detail === 'Own Goal' || (event.comments && /own goal/i.test(event.comments));
        const scoringTeam = isGoalForTeam(event, home, away) ? home : (isGoalForTeam(event, away, home) ? away : event.team);
        const scoreAtGoal = computeScore(events, home, away, fx.goals, event);
        const title = `⚽ GOL DO ${(scoringTeam?.name || event.team?.name || 'TIME').toUpperCase()}!${isOwn ? ' (CONTRA)' : ''}`;
        const body = `${event.player?.name || event.team?.name || 'Gol'}${isOwn ? ' (contra)' : ''} aos ${minute}! ${scoreAtGoal}`;
        add('goals', title, body, suffix);
      }
      if (event.type === 'Card' && ['Red Card', 'Yellow Red'].includes(event.detail)) add('redcards', '🟥 CARTÃO VERMELHO!', `${event.player?.name || event.team?.name || 'Jogador'} expulso aos ${minute}.`, suffix);
    }
  }
  // Preserve historical tags during migration from preferences.sent_events.
  for (const item of result) item.payload.tag = item.payload.tag.replace(/^goals-/, 'goal-').replace(/^redcards-/, 'redcard-');
  return result;
}
module.exports = { follows, payloads, isGoalForTeam, computeScore };
