const test = require('node:test');
const assert = require('node:assert/strict');
const { payloads, isGoalForTeam, computeScore } = require('../lib/push-events');

test('isGoalForTeam correctly identifies scoring team and own goals', () => {
  const home = { id: 10, name: 'England' };
  const away = { id: 9, name: 'Spain' };

  const normalHomeGoal = {
    type: 'Goal',
    detail: 'Normal Goal',
    team: { id: 10, name: 'England' },
    player: { name: 'Kane' }
  };
  assert.equal(isGoalForTeam(normalHomeGoal, home, away), true);
  assert.equal(isGoalForTeam(normalHomeGoal, away, home), false);

  const normalAwayGoal = {
    type: 'Goal',
    detail: 'Normal Goal',
    team: { id: 9, name: 'Spain' },
    player: { name: 'Morata' }
  };
  assert.equal(isGoalForTeam(normalAwayGoal, home, away), false);
  assert.equal(isGoalForTeam(normalAwayGoal, away, home), true);

  // Formato da API-Football: gol contra de Laporte (Espanha) vem no time beneficiado
  const ownGoalByAway = {
    type: 'Goal',
    detail: 'Own Goal',
    team: { id: 10, name: 'England' },
    player: { name: 'Laporte' }
  };
  // Gol contra da Espanha beneficia a Inglaterra (Home)
  assert.equal(isGoalForTeam(ownGoalByAway, home, away), true);
  assert.equal(isGoalForTeam(ownGoalByAway, away, home), false);

  const missedPenalty = {
    type: 'Goal',
    detail: 'Missed Penalty',
    team: { id: 10, name: 'England' },
    player: { name: 'Kane' }
  };
  assert.equal(isGoalForTeam(missedPenalty, home, away), false);
  assert.equal(isGoalForTeam(missedPenalty, away, home), false);
});

test('payloads computes correct score for England 2nd goal even when fx.goals has cache delay (1x1)', () => {
  const fx = {
    fixture: {
      id: 12345,
      status: { short: '1H', elapsed: 41 },
      date: '2026-09-26T16:00:00Z'
    },
    teams: {
      home: { id: 10, name: 'England' },
      away: { id: 9, name: 'Spain' }
    },
    // fx.goals ainda desatualizado pela CDN (1x1)
    goals: { home: 1, away: 1 }
  };

  const events = [
    { time: { elapsed: 15 }, team: { id: 10, name: 'England' }, player: { id: 1, name: 'Bellingham' }, type: 'Goal', detail: 'Normal Goal' },
    { time: { elapsed: 28 }, team: { id: 9, name: 'Spain' }, player: { id: 2, name: 'Morata' }, type: 'Goal', detail: 'Normal Goal' },
    { time: { elapsed: 40 }, team: { id: 10, name: 'England' }, player: { id: 3, name: 'Harry Kane' }, type: 'Goal', detail: 'Normal Goal' }
  ];

  const results = payloads(fx, events, []);

  // O evento aos 40' ocorreu há 1 min (41 - 40 = 1 <= 3), logo gera notificação
  const goalPayloads = results.filter(r => r.kind === 'goals');
  assert.equal(goalPayloads.length, 1);

  const kaneNotification = goalPayloads[0].payload;
  assert.equal(kaneNotification.title, '⚽ GOL DO ENGLAND!');
  // O placar deve ser 2 x 1 e não o defasado 1 x 1!
  assert.match(kaneNotification.body, /Harry Kane aos 40'! England 2 x 1 Spain/);
  assert.equal(kaneNotification.tag, 'goal-12345-40-0-3');
});

test('payloads correctly formats own goal notifications with adjusted team and score', () => {
  const fx = {
    fixture: {
      id: 999,
      status: { short: '2H', elapsed: 75 }
    },
    teams: {
      home: { id: 10, name: 'England' },
      away: { id: 9, name: 'Spain' }
    },
    goals: { home: 0, away: 0 }
  };

  const events = [
    { time: { elapsed: 74 }, team: { id: 10, name: 'England' }, player: { id: 88, name: 'Laporte' }, type: 'Goal', detail: 'Own Goal' }
  ];

  const results = payloads(fx, events, []);
  const goal = results.find(r => r.kind === 'goals');
  assert.ok(goal);
  assert.equal(goal.payload.title, '⚽ GOL DO ENGLAND! (CONTRA)');
  assert.match(goal.payload.body, /Laporte \(contra\) aos 74'! England 1 x 0 Spain/);
});

// Formato real da API-Football (RB Bragantino x Cruzeiro, fixture 1492402):
// o gol contra vem com team = time BENEFICIADO e player = jogador do adversário.
const bragantino = { id: 794, name: 'RB Bragantino' };
const cruzeiro = { id: 135, name: 'Cruzeiro' };
const realEvents = [
  { time: { elapsed: 13 }, team: bragantino, player: { id: 279811, name: 'Lucas Henrique Barbosa' }, assist: { id: 10027, name: 'Eric Ramires' }, type: 'Goal', detail: 'Normal Goal' },
  { time: { elapsed: 20 }, team: bragantino, player: { id: 10008, name: 'Kaio Jorge' }, assist: { id: null, name: null }, type: 'Goal', detail: 'Own Goal' },
  { time: { elapsed: 30 }, team: bragantino, player: { id: 10027, name: 'Eric Ramires' }, assist: { id: null, name: null }, type: 'Goal', detail: 'Normal Goal' },
  { time: { elapsed: 43 }, team: cruzeiro, player: { id: 504950, name: 'Zé Lucas' }, assist: { id: 10008, name: 'Kaio Jorge' }, type: 'Goal', detail: 'Normal Goal' }
];

test('own goal in real API-Football format counts for the team on the event (beneficiary)', () => {
  const og = realEvents[1];
  assert.equal(isGoalForTeam(og, bragantino, cruzeiro, realEvents), true);
  assert.equal(isGoalForTeam(og, cruzeiro, bragantino, realEvents), false);
  assert.equal(computeScore(realEvents, bragantino, cruzeiro, { home: 3, away: 1 }), 'RB Bragantino 3 x 1 Cruzeiro');
  // Placar no momento do gol contra (20') não pode usar o placar final da partida.
  assert.equal(computeScore(realEvents, bragantino, cruzeiro, { home: 3, away: 1 }, og), 'RB Bragantino 2 x 0 Cruzeiro');
});

test('own goal is attributed against the player own team when the event team is the player team', () => {
  // Variante defensiva: se o evento vier no time do jogador, o elenco inferido pelos
  // demais eventos (assistência de Kaio Jorge pelo Cruzeiro) decide o beneficiado.
  const events = realEvents.map((e, i) => i === 1 ? { ...e, team: cruzeiro } : e);
  assert.equal(isGoalForTeam(events[1], bragantino, cruzeiro, events), true);
  assert.equal(isGoalForTeam(events[1], cruzeiro, bragantino, events), false);
});

test('own goal notification names the benefiting team and the score at that minute', () => {
  const fx = { fixture: { id: 1492402, status: { short: '1H', elapsed: 21 } }, teams: { home: bragantino, away: cruzeiro }, goals: { home: 2, away: 0 } };
  const goal = payloads(fx, realEvents.slice(0, 2), []).find(r => r.kind === 'goals' && /contra/.test(r.payload.body));
  assert.equal(goal.payload.title, '⚽ GOL DO RB BRAGANTINO! (CONTRA)');
  assert.match(goal.payload.body, /Kaio Jorge \(contra\) aos 20'! RB Bragantino 2 x 0 Cruzeiro/);
});
