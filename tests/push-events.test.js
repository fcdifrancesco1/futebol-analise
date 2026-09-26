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

  const ownGoalByAway = {
    type: 'Goal',
    detail: 'Own Goal',
    team: { id: 9, name: 'Spain' },
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
    { time: { elapsed: 74 }, team: { id: 9, name: 'Spain' }, player: { id: 88, name: 'Laporte' }, type: 'Goal', detail: 'Own Goal' }
  ];

  const results = payloads(fx, events, []);
  const goal = results.find(r => r.kind === 'goals');
  assert.ok(goal);
  assert.equal(goal.payload.title, '⚽ GOL DO ENGLAND! (CONTRA)');
  assert.match(goal.payload.body, /Laporte \(contra\) aos 74'! England 1 x 0 Spain/);
});
