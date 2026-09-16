function follows(sub, fixture) {
  let teams = sub.favorite_teams;
  try { if (typeof teams === 'string') teams = JSON.parse(teams); } catch { teams = []; }
  const fixtures = sub.preferences?.favorite_fixtures || [];
  const has = (list, id) => Array.isArray(list) && list.some(item => Number(item?.id ?? item) === Number(id));
  return has(teams, fixture.teams.home.id) || has(teams, fixture.teams.away.id) || has(fixtures, fixture.fixture.id);
}
function payloads(fx, events, lineups) {
  const id = fx.fixture.id; const status = fx.fixture.status.short; const elapsed = fx.fixture.status.elapsed;
  const home = fx.teams.home; const away = fx.teams.away;
  const score = `${home.name} ${fx.goals.home ?? 0} x ${fx.goals.away ?? 0} ${away.name}`;
  const result = [];
  const add = (kind, title, body, suffix = '') => result.push({ kind, payload: { title, body, tag: `${kind}-${id}${suffix}`, icon: '/icon-192.png', badge: '/badge-96.png', data: { url: `/#/jogo/${id}` } } });
  if (['NS', 'TBD', '1H'].includes(status) && lineups.some(team => team.startXI?.length)) add('lineups', '📋 ESCALAÇÕES CONFIRMADAS!', `${home.name} × ${away.name}: escalações oficiais disponíveis.`);
  if (status === '1H' && (elapsed == null || elapsed <= 15)) add('kickoff', '⏱️ BOLA ROLANDO!', `Começou ${home.name} × ${away.name}!`);
  if (status === 'HT') add('halftime', '⏸️ INTERVALO', score);
  if (['FT', 'AET', 'PEN'].includes(status)) add('fulltime', '🏁 FIM DE JOGO', score);
  if (['1H', '2H', 'ET', 'P', 'LIVE'].includes(status)) {
    for (const event of events) {
      if (!Number.isFinite(elapsed) || !Number.isFinite(event.time?.elapsed) || elapsed - event.time.elapsed < 0 || elapsed - event.time.elapsed > 3) continue;
      const minute = `${event.time.elapsed}'${event.time.extra ? '+' + event.time.extra : ''}`;
      const suffix = `-${event.time.elapsed}-${event.time.extra || 0}-${event.player?.id || event.team?.id || ''}`;
      if (event.type === 'Goal' && event.detail !== 'Missed Penalty') add('goals', `⚽ GOL DO ${(event.team?.name || 'TIME').toUpperCase()}!`, `${event.player?.name || event.team?.name || 'Gol'} aos ${minute}! ${score}`, suffix);
      if (event.type === 'Card' && ['Red Card', 'Yellow Red'].includes(event.detail)) add('redcards', '🟥 CARTÃO VERMELHO!', `${event.player?.name || event.team?.name || 'Jogador'} expulso aos ${minute}.`, suffix);
    }
  }
  // Preserve historical tags during migration from preferences.sent_events.
  for (const item of result) item.payload.tag = item.payload.tag.replace(/^goals-/, 'goal-').replace(/^redcards-/, 'redcard-');
  return result;
}
module.exports = { follows, payloads };
