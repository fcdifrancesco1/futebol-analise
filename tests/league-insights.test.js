const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const src = fs.readFileSync('public/js/league-insights.js', 'utf8');
const ctx = vm.createContext({ Math, Date, Map, Set, Number, String, Array, Object, Int32Array, Float64Array, setTimeout,
  escapeHtml: s => String(s ?? ''), formatTeamName: s => s, formatRoundName: s => s });
vm.runInContext(src, ctx);
const plain = v => JSON.parse(JSON.stringify(v));

test('zone descriptions from the API are translated and classified', () => {
  const z = d => plain(ctx.leagueZoneInfo(d));
  assert.deepEqual(z('Promotion - Champions League (League phase)'), { kind: 'top', label: 'Champions League' });
  assert.deepEqual(z('Promotion - Conference League (Qualification)'), { kind: 'cont3', label: 'Conference League (qualificação)' });
  assert.deepEqual(z('Promotion - Copa Libertadores (Group Stage)'), { kind: 'top', label: 'Libertadores' });
  assert.deepEqual(z('Promotion - Copa Libertadores (Qualification)'), { kind: 'qual', label: 'Pré-Libertadores' });
  assert.deepEqual(z('Promotion - AFC Champions League 2'), { kind: 'cont2', label: 'AFC Champions League 2' });
  assert.deepEqual(z('Relegation Playoffs'), { kind: 'downpo', label: 'Playoff de rebaixamento' });
  assert.deepEqual(z('Liga Portugal (Relegation)'), { kind: 'downpo', label: 'Playoff de rebaixamento' });
  assert.deepEqual(z('Relegation - Serie B'), { kind: 'down', label: 'Rebaixamento' });
  assert.deepEqual(z('Promotion - Champions League (Play Offs: 1/8-finals)'), { kind: 'top', label: 'Oitavas de final' });
  assert.deepEqual(z(' Qualifying'), { kind: 'qual', label: 'Qualificação' });
  assert.equal(ctx.leagueZoneInfo(null), null);
});

const rows = (descs, pts) => descs.map((d, i) => ({ rank: i + 1, description: d, team: { id: i + 1, name: `T${i + 1}` }, points: pts?.[i] ?? 0 }));

test('G and Z blocks: top from 1st with the same label; Z only counts direct relegation', () => {
  // Ligue 1: 16º playoff de rebaixamento, 17º-18º rebaixamento direto
  const descs = ['Champions League league stage', 'Champions League league stage', 'Champions League league stage', ' Qualifying',
    ...Array(11).fill(null), 'Relegation Playoffs', 'Relegation', 'Relegation'];
  const zones = ctx.leagueZones(rows(descs));
  assert.equal(zones.top, 3);
  assert.equal(zones.down, 2);
  assert.deepEqual(plain(zones.legend.map(l => `${l.label} ${l.from}-${l.to}`)),
    ['Champions League 1-3', 'Qualificação 4-4', 'Playoff de rebaixamento 16-16', 'Rebaixamento 17-18']);
});

test('distance to G block and to escape the Z block', () => {
  const r = rows(['Libertadores', 'Libertadores', null, null, 'Relegation', 'Relegation'], [20, 18, 15, 12, 10, 7]);
  const zones = ctx.leagueZones(r);
  assert.equal(ctx.leagueDistance(r, 0, zones), null);                 // dentro do G2
  assert.deepEqual(plain(ctx.leagueDistance(r, 2, zones)).gap, 3);     // 18 - 15
  const z = plain(ctx.leagueDistance(r, 5, zones));
  assert.equal(z.kind, 'down'); assert.equal(z.block, 'Z2'); assert.equal(z.gap, 5); // 12 - 7
  assert.match(ctx.leagueDistanceHtml(ctx.leagueDistance(r, 2, zones)), /G2 −3/);
});

test('remaining-schedule difficulty is not biased by the team own position', () => {
  // 4 times; cada um enfrenta todos os outros uma vez: dificuldade relativa igual para todos
  const sorted = [1, 2, 3, 4].map(id => ({ team: { id } }));
  const games = [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]].map(([h, a]) => ({ teams: { home: { id: h }, away: { id: a } } }));
  const sch = ctx.leagueRemainingSchedule(sorted, games);
  for (const id of [1, 2, 3, 4]) assert.equal(Math.round(sch.get(id).rel * 1000), 0);
  // Média bruta do líder é maior que a do lanterna, mas isso não o torna "fácil"
  assert.ok(sch.get(1).avg > sch.get(4).avg);
});

test('simulation: decided title is 100%, deterministic with the same seed', () => {
  const team = (id, pts, gf = 10, ga = 10) => ({ team: { id }, points: pts, all: { win: Math.floor(pts / 3), goals: { for: gf, against: ga } },
    home: { played: 5, goals: { for: gf / 2, against: ga / 2 } }, away: { played: 5, goals: { for: gf / 2, against: ga / 2 } } });
  const sorted = [team(1, 60), team(2, 20), team(3, 18), team(4, 10)];
  const finished = Array.from({ length: 10 }, () => ({ goals: { home: 1, away: 1 } }));
  const remaining = [{ teams: { home: { id: 1 }, away: { id: 2 } } }, { teams: { home: { id: 3 }, away: { id: 4 } } }];
  const zones = { top: 1, down: 1 };
  const a = ctx.leagueSimulate(sorted, finished, remaining, zones, 999, 42);
  const b = ctx.leagueSimulate(sorted, finished, remaining, zones, 999, 42);
  assert.equal(a.get(1).title, 1);
  assert.equal(a.get(4).down > 0.5, true);
  assert.deepEqual(plain([...a.entries()]), plain([...b.entries()]));
  // Projeção nunca abaixo dos pontos atuais
  for (const t of sorted) assert.ok(a.get(t.team.id).projected >= t.points);
  assert.equal(ctx.leaguePercent(0), '–'); assert.equal(ctx.leaguePercent(0.004), '<1%'); assert.equal(ctx.leaguePercent(0.995), '>99%');
});
