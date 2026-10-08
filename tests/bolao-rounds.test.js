const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Carrega funções do frontend para teste unitário
const sharedUiCode = fs.readFileSync(path.join(__dirname, '../public/js/shared-ui.js'), 'utf8');
const bolaoCode = fs.readFileSync(path.join(__dirname, '../public/js/bolao.js'), 'utf8');

// Cria contexto para executar as funções
const vm = require('node:vm');
const sandbox = {
  window: {},
  document: { getElementById: () => null },
  console: console,
  Date: Date,
  Math: Math,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  Map: Map,
  Set: Set
};
vm.createContext(sandbox);
vm.runInContext(sharedUiCode, sandbox);
vm.runInContext(bolaoCode, sandbox);

test('Bolão - Pontuação: Cálculo rigoroso de pontos para jogos encerrados', () => {
  const { calculatePredictionPoints } = sandbox;

  // Placar Exato: 3 pontos
  assert.equal(calculatePredictionPoints(2, 1, 2, 1), 3);
  assert.equal(calculatePredictionPoints(0, 0, 0, 0), 3);
  assert.equal(calculatePredictionPoints(3, 3, 3, 3), 3);

  // Acertou o vencedor mandante (mas errou placar): 1 ponto
  assert.equal(calculatePredictionPoints(2, 0, 1, 0), 1);
  assert.equal(calculatePredictionPoints(3, 1, 2, 0), 1);

  // Acertou o vencedor visitante (mas errou placar): 1 ponto
  assert.equal(calculatePredictionPoints(0, 2, 1, 3), 1);
  assert.equal(calculatePredictionPoints(1, 2, 0, 1), 1);

  // Acertou empate diferente: 1 ponto
  assert.equal(calculatePredictionPoints(1, 1, 2, 2), 1);
  assert.equal(calculatePredictionPoints(0, 0, 1, 1), 1);

  // Errou o resultado: 0 pontos
  assert.equal(calculatePredictionPoints(2, 1, 0, 1), 0);
  assert.equal(calculatePredictionPoints(1, 1, 2, 0), 0);
  assert.equal(calculatePredictionPoints(0, 2, 2, 0), 0);

  // Jogo sem placar oficial (não finalizado): null
  assert.equal(calculatePredictionPoints(2, 1, null, null), null);
  assert.equal(calculatePredictionPoints(2, 1, undefined, undefined), null);
});

test('Bolão - Rodadas: Formatação e ordenação numérica natural', () => {
  const { formatRoundName, extractRoundNumber } = sandbox;

  assert.equal(formatRoundName('Regular Season - 28'), 'Rodada 28');
  assert.equal(formatRoundName('Regular Season - 1'), 'Rodada 1');
  assert.equal(formatRoundName('Round 14'), 'Rodada 14');
  assert.equal(formatRoundName('Quarter-finals'), 'Quartas de Final');
  assert.equal(formatRoundName('Semi-finals'), 'Semifinal');
  assert.equal(formatRoundName('Final'), 'Grande Final');

  const rounds = ['Rodada 10', 'Rodada 2', 'Rodada 1', 'Rodada 28', 'Rodada 19'];
  const sorted = [...rounds].sort((a, b) => extractRoundNumber(a) - extractRoundNumber(b));
  assert.deepEqual(sorted, ['Rodada 1', 'Rodada 2', 'Rodada 10', 'Rodada 19', 'Rodada 28']);
});

test('Bolão - Divisão por Rodada e Identificação da Rodada Atual', () => {
  const { formatRoundName, extractRoundNumber } = sandbox;

  // Simula fixtures de várias rodadas (algumas encerradas, outras abertas)
  const mockFixtures = [
    // Rodada 27: todos encerrados (ontem)
    { fixture: { id: 101, timestamp: 1700000000, date: '2026-09-12T16:00:00Z', status: { short: 'FT' } }, league: { round: 'Regular Season - 27' }, goals: { home: 2, away: 0 } },
    { fixture: { id: 102, timestamp: 1700003600, date: '2026-09-12T18:30:00Z', status: { short: 'FT' } }, league: { round: 'Regular Season - 27' }, goals: { home: 1, away: 1 } },
    // Rodada 28: jogos mistos (alguns FT, outros futuros hoje/amanhã)
    { fixture: { id: 201, timestamp: 1700100000, date: '2026-09-19T16:00:00Z', status: { short: 'FT' } }, league: { round: 'Regular Season - 28' }, goals: { home: 3, away: 1 } },
    { fixture: { id: 202, timestamp: 1700186400, date: '2026-09-20T18:30:00Z', status: { short: 'NS' } }, league: { round: 'Regular Season - 28' }, goals: { home: null, away: null } },
    // Rodada 29: todos futuros
    { fixture: { id: 301, timestamp: 1700700000, date: '2026-09-26T16:00:00Z', status: { short: 'NS' } }, league: { round: 'Regular Season - 29' }, goals: { home: null, away: null } }
  ];

  // Agrupa rodadas
  const roundsMap = new Map();
  mockFixtures.forEach(f => {
    const rawRound = f.league?.round || '';
    const roundTitle = formatRoundName(rawRound);
    if (!roundsMap.has(roundTitle)) {
      roundsMap.set(roundTitle, { roundTitle, fixtures: [] });
    }
    roundsMap.get(roundTitle).fixtures.push(f);
  });

  const allRounds = Array.from(roundsMap.values()).sort((a, b) => {
    return extractRoundNumber(a.roundTitle) - extractRoundNumber(b.roundTitle);
  });

  assert.equal(allRounds.length, 3);
  assert.equal(allRounds[0].roundTitle, 'Rodada 27');
  assert.equal(allRounds[1].roundTitle, 'Rodada 28');
  assert.equal(allRounds[2].roundTitle, 'Rodada 29');

  // Rodada atual deve ser a Rodada 28 (pois tem jogos em andamento/futuros e é a primeira não 100% finalizada)
  const currentRound = allRounds.find(r => r.fixtures.some(f => !['FT', 'AET', 'PEN'].includes(f.fixture.status.short)));
  assert.equal(currentRound.roundTitle, 'Rodada 28');
});

test('Bolão - Jogos Encerrados: Filtro e Cálculo de Pontos do Usuário', () => {
  const { calculatePredictionPoints } = sandbox;

  const finishedMatches = [
    { id: 201, goals: { home: 2, away: 1 }, status: 'FT' },
    { id: 202, goals: { home: 0, away: 0 }, status: 'FT' },
    { id: 203, goals: { home: 1, away: 3 }, status: 'FT' },
    { id: 204, goals: { home: 2, away: 0 }, status: 'FT' }
  ];

  // Palpites do usuário
  const userPredictions = new Map([
    [201, { home_score: 2, away_score: 1 }], // Cravou: 3 pts
    [202, { home_score: 1, away_score: 1 }], // Empate diferente: 1 pt
    [203, { home_score: 2, away_score: 0 }]  // Errou vencedor: 0 pts
    // 204: sem palpite
  ]);

  let totalRoundPoints = 0;
  const matchResults = finishedMatches.map(m => {
    const pred = userPredictions.get(m.id);
    let pts = 0;
    let badge = '';

    if (pred) {
      pts = calculatePredictionPoints(pred.home_score, pred.away_score, m.goals.home, m.goals.away);
      totalRoundPoints += pts;
      if (pts === 3) badge = '🎯 +3 PTS (Placar Exato!)';
      else if (pts === 1) badge = '⚽ +1 PT (Acertou o Resultado)';
      else badge = '❌ 0 PTS (Não Pontuou)';
    } else {
      badge = '⚠️ Sem Palpite (0 PTS)';
    }

    return { id: m.id, pts, badge };
  });

  // Valida pontuação total da rodada
  assert.equal(totalRoundPoints, 4); // 3 + 1 + 0 = 4 pts

  // Valida badges individuais
  assert.equal(matchResults[0].badge, '🎯 +3 PTS (Placar Exato!)');
  assert.equal(matchResults[1].badge, '⚽ +1 PT (Acertou o Resultado)');
  assert.equal(matchResults[2].badge, '❌ 0 PTS (Não Pontuou)');
  assert.equal(matchResults[3].badge, '⚠️ Sem Palpite (0 PTS)');
});

test('Bolão - Rodada atual: jogo adiado de rodada antiga não vira a rodada atual', () => {
  const { detectCurrentRoundKey } = sandbox;
  const now = Date.parse('2026-10-08T12:00:00Z');
  const day = 86400000;
  const fx = (iso, status) => ({ fixture: { date: iso, timestamp: Date.parse(iso) / 1000, status: { short: status } } });
  const round = (roundKey, fixtures) => ({ roundKey, fixtures });
  const at = offsetDays => new Date(now + offsetDays * day).toISOString();

  // Caso real do Brasileirão 2026: rodada 21 tem Chapecoense x Vasco adiado (PST) desde julho.
  const rounds = [
    round('Rodada 21', [fx('2026-07-26T19:00:00Z', 'FT'), fx('2026-07-29T19:00:00Z', 'PST')]),
    round('Rodada 29', [fx(at(-6), 'FT'), fx(at(-5), 'FT')]),
    round('Rodada 30', [fx(at(1), 'NS'), fx(at(2), 'NS')]),
    round('Rodada 31', [fx(at(8), 'NS')])
  ];
  assert.equal(detectCurrentRoundKey(rounds, now), 'Rodada 30');

  // Jogo adiado remarcado meses depois (NS, data futura) também não sequestra a rodada atual.
  rounds[0].fixtures[1] = fx(at(1), 'NS');
  rounds[2].fixtures = [fx(at(3), 'NS'), fx(at(4), 'NS')];
  assert.equal(detectCurrentRoundKey(rounds, now), 'Rodada 30');

  // Rodada em andamento com último jogo na segunda-feira continua sendo a atual.
  const monday = [
    round('Rodada 30', [fx(at(-2), 'FT'), fx(at(-1), 'FT'), fx(at(0.3), 'NS')]),
    round('Rodada 31', [fx(at(3), 'NS'), fx(at(4), 'NS')])
  ];
  assert.equal(detectCurrentRoundKey(monday, now), 'Rodada 30');

  // Jogo ao vivo tem prioridade.
  const live = [
    round('Rodada 30', [fx(at(-0.05), '2H'), fx(at(1), 'NS')]),
    round('Rodada 31', [fx(at(0.2), 'NS')])
  ];
  assert.equal(detectCurrentRoundKey(live, now), 'Rodada 30');

  // Campeonato encerrado: última rodada.
  const done = [round('Rodada 37', [fx(at(-14), 'FT')]), round('Rodada 38', [fx(at(-7), 'FT')])];
  assert.equal(detectCurrentRoundKey(done, now), 'Rodada 38');
  assert.equal(detectCurrentRoundKey([], now), null);
});
