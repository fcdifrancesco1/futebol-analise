const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const bolaoSchema = readFileSync(require.resolve('../supabase/bolao_schema.sql'), 'utf8');

async function createTestDb() {
  const db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  return db;
}

test('Bolão Schema: idempotency and table creation', async () => {
  const db = await createTestDb();
  try {
    await db.exec(bolaoSchema);
    // Running a second time should not fail (idempotent)
    await db.exec(bolaoSchema);

    const tables = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'bolao_%' ORDER BY table_name"
    );
    const tableNames = tables.rows.map(r => r.table_name);
    assert.deepEqual(tableNames, ['bolao_leagues', 'bolao_participants', 'bolao_predictions']);
  } finally {
    await db.close();
  }
});

test('Bolão RPC: create league, join via invite code, and enforce invite security', async () => {
  const db = await createTestDb();
  try {
    await db.exec(bolaoSchema);

    const creatorId = '11111111-1111-4000-8000-111111111111';
    const creatorToken = 'creator_secret_token_123';
    const inviteCode = 'BOLAO123';

    // 1. Criar Liga
    const createRes = await db.query(
      "SELECT create_bolao_league($1, $2::jsonb, $3, $4, $5, $6) AS result",
      ['Liga dos Campeões dos Amigos', JSON.stringify([71, 2, 39]), creatorId, creatorToken, 'Felipe Criador', inviteCode]
    );

    const leagueData = typeof createRes.rows[0].result === 'string'
      ? JSON.parse(createRes.rows[0].result)
      : createRes.rows[0].result;

    assert.ok(leagueData.league_id);
    assert.equal(leagueData.name, 'Liga dos Campeões dos Amigos');
    assert.equal(leagueData.invite_code, inviteCode);
    assert.deepEqual(leagueData.competitions, [71, 2, 39]);

    const leagueId = leagueData.league_id;

    // 2. Entrar na Liga com código correto
    const friendId = '22222222-2222-4000-8000-222222222222';
    const friendToken = 'friend_secret_token_456';

    const joinRes = await db.query(
      "SELECT join_bolao_league($1, $2, $3, $4) AS result",
      [inviteCode, friendId, friendToken, 'Lucas Amigo']
    );

    const joinData = typeof joinRes.rows[0].result === 'string'
      ? JSON.parse(joinRes.rows[0].result)
      : joinRes.rows[0].result;

    assert.equal(joinData.league_id, leagueId);
    assert.equal(joinData.name, 'Liga dos Campeões dos Amigos');

    // 3. Tentar entrar com código de convite inválido
    await assert.rejects(
      db.query("SELECT join_bolao_league($1, $2, $3, $4)", ['WRONGCOD', '33333333-3333-4000-8000-333333333333', 'tok', 'Invasor']),
      /Liga não encontrada com este código de convite/
    );

    // 4. Verificar participantes registrados
    const participants = await db.query(
      "SELECT participant_id, participant_name FROM bolao_participants WHERE league_id = $1 ORDER BY joined_at ASC",
      [leagueId]
    );
    assert.equal(participants.rows.length, 2);
    assert.equal(participants.rows[0].participant_name, 'Felipe Criador');
    assert.equal(participants.rows[1].participant_name, 'Lucas Amigo');
  } finally {
    await db.close();
  }
});

test('Bolão Rules: enforce 10-minute deadline and scoring calculation (3 pts, 1 pt, 0 pts)', async () => {
  const db = await createTestDb();
  try {
    await db.exec(bolaoSchema);

    const creatorId = '11111111-1111-4000-8000-111111111111';
    const creatorToken = 'tok_creator';
    const inviteCode = 'REGRAS01';

    const createRes = await db.query(
      "SELECT create_bolao_league($1, $2::jsonb, $3, $4, $5, $6) AS result",
      ['Liga Regras', JSON.stringify([71]), creatorId, creatorToken, 'Jogador 1', inviteCode]
    );
    const leagueId = (typeof createRes.rows[0].result === 'string' ? JSON.parse(createRes.rows[0].result) : createRes.rows[0].result).league_id;

    // Participantes 2, 3 e 4 entram na liga
    const p2 = '22222222-2222-4000-8000-222222222222';
    const p3 = '33333333-3333-4000-8000-333333333333';
    const p4 = '44444444-4444-4000-8000-444444444444';

    await db.query("SELECT join_bolao_league($1, $2, $3, $4)", [inviteCode, p2, 'tok_p2', 'Jogador 2']);
    await db.query("SELECT join_bolao_league($1, $2, $3, $4)", [inviteCode, p3, 'tok_p3', 'Jogador 3']);
    await db.query("SELECT join_bolao_league($1, $2, $3, $4)", [inviteCode, p4, 'tok_p4', 'Jogador 4']);

    const fixtureId1 = 9001; // Jogo futuro (> 10min)
    const futureMatchDate = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora no futuro

    const fixtureIdLate = 9002; // Jogo prestes a começar (< 10min)
    const lateMatchDate = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutos no futuro

    // TESTE DA REGRA: Palpites até 10 minutos antes
    // Jogo a 5 minutos deve ser REJEITADO
    await assert.rejects(
      db.query(
        "SELECT save_bolao_prediction($1, $2, $3, $4, $5, $6, $7)",
        [leagueId, creatorId, creatorToken, fixtureIdLate, lateMatchDate, 1, 0]
      ),
      /Prazo de palpites encerrado/
    );

    // Jogo a 60 minutos deve ser ACEITO
    // P1 palpita 2x1 (vai acertar placar exato -> 3 pts)
    await db.query(
      "SELECT save_bolao_prediction($1, $2, $3, $4, $5, $6, $7)",
      [leagueId, creatorId, creatorToken, fixtureId1, futureMatchDate, 2, 1]
    );

    // P2 palpita 2x0 (vai acertar vitória do mandante, mas errou placar -> 1 pt)
    await db.query(
      "SELECT save_bolao_prediction($1, $2, $3, $4, $5, $6, $7)",
      [leagueId, p2, 'tok_p2', fixtureId1, futureMatchDate, 2, 0]
    );

    // P3 palpita 1x1 (vai errar, deu mandante -> 0 pts)
    await db.query(
      "SELECT save_bolao_prediction($1, $2, $3, $4, $5, $6, $7)",
      [leagueId, p3, 'tok_p3', fixtureId1, futureMatchDate, 1, 1]
    );

    // P4 palpita 0x3 (vai errar, deu mandante -> 0 pts)
    await db.query(
      "SELECT save_bolao_prediction($1, $2, $3, $4, $5, $6, $7)",
      [leagueId, p4, 'tok_p4', fixtureId1, futureMatchDate, 0, 3]
    );

    // Simula término do jogo com placar real: 2 x 1
    const evaluatedCount = await db.query("SELECT evaluate_bolao_fixture($1, $2, $3) AS count", [fixtureId1, 2, 1]);
    assert.equal(evaluatedCount.rows[0].count, 4);

    // Verifica pontos individuais na tabela bolao_predictions
    const pred1 = (await db.query("SELECT points FROM bolao_predictions WHERE fixture_id = $1 AND participant_id = $2", [fixtureId1, creatorId])).rows[0].points;
    const pred2 = (await db.query("SELECT points FROM bolao_predictions WHERE fixture_id = $1 AND participant_id = $2", [fixtureId1, p2])).rows[0].points;
    const pred3 = (await db.query("SELECT points FROM bolao_predictions WHERE fixture_id = $1 AND participant_id = $2", [fixtureId1, p3])).rows[0].points;
    const pred4 = (await db.query("SELECT points FROM bolao_predictions WHERE fixture_id = $1 AND participant_id = $2", [fixtureId1, p4])).rows[0].points;

    assert.equal(pred1, 3, 'Placar exato (2x1 no palpite, 2x1 no jogo) deve dar 3 pontos');
    assert.equal(pred2, 1, 'Resultado correto (2x0 no palpite, 2x1 no jogo) deve dar 1 ponto');
    assert.equal(pred3, 0, 'Empate palpitado (1x1) em vitória do mandante (2x1) deve dar 0 pontos');
    assert.equal(pred4, 0, 'Vitória do visitante (0x3) em vitória do mandante (2x1) deve dar 0 pontos');

    // Jogo 2: Empate 2x2
    const fixtureId2 = 9003;
    const futureMatchDate2 = new Date(Date.now() + 120 * 60 * 1000).toISOString();

    // P1 palpita 0x0 (empate diferente -> 1 pt)
    await db.query("SELECT save_bolao_prediction($1, $2, $3, $4, $5, $6, $7)", [leagueId, creatorId, creatorToken, fixtureId2, futureMatchDate2, 0, 0]);
    // P2 palpita 2x2 (empate exato -> 3 pts)
    await db.query("SELECT save_bolao_prediction($1, $2, $3, $4, $5, $6, $7)", [leagueId, p2, 'tok_p2', fixtureId2, futureMatchDate2, 2, 2]);

    // Apuração Jogo 2: termina 2 x 2
    await db.query("SELECT evaluate_bolao_fixture($1, $2, $3)", [fixtureId2, 2, 2]);

    // Busca Ranking da Liga
    const rankingRes = await db.query("SELECT * FROM get_bolao_ranking($1)", [leagueId]);
    const ranking = rankingRes.rows;

    assert.equal(ranking.length, 4);
    // P1 tem 3 + 1 = 4 pontos (1 exato)
    // P2 tem 1 + 3 = 4 pontos (1 exato)
    assert.equal(ranking[0].total_points, 4);
    assert.equal(ranking[1].total_points, 4);
    assert.equal(ranking[2].total_points, 0);
    assert.equal(ranking[3].total_points, 0);
  } finally {
    await db.close();
  }
});
