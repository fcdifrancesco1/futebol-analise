const { enforceRateLimit } = require('../lib/request-security');
const {
  generateInviteCode,
  isValidUUID,
  sanitizeText,
  validateCompetitions,
  validateScore,
  validateFixtureDate,
  database,
  rpc
} = require('../lib/bolao-security');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const action = (req.query?.action || '').toLowerCase();

  try {
    // 1. Obter Prévia de Convite (Público via Invite Code)
    if (req.method === 'GET' && action === 'invite') {
      const code = (req.query?.code || '').trim().toUpperCase();
      if (!code || code.length !== 8) {
        return res.status(400).json({ error: 'Código de convite inválido.' });
      }

      if (!await enforceRateLimit(req, res, { scope: 'bolao-invite', limit: 60, windowSeconds: 900 })) return;

      const rows = await database(`bolao_leagues?invite_code=eq.${encodeURIComponent(code)}&select=id,name,invite_code,competitions,created_at,bolao_participants(count)`);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: 'Liga não encontrada com este código de convite.' });
      }

      const league = rows[0];
      const memberCount = league.bolao_participants?.[0]?.count ?? 1;

      return res.status(200).json({
        id: league.id,
        name: league.name,
        invite_code: league.invite_code,
        competitions: league.competitions,
        created_at: league.created_at,
        member_count: memberCount
      });
    }

    // 2. Criar Nova Liga (POST)
    if (req.method === 'POST' && action === 'create') {
      if (!await enforceRateLimit(req, res, { scope: 'bolao-create', limit: 15, windowSeconds: 3600 })) return;

      const body = req.body || {};
      const name = sanitizeText(body.name, 3, 50);
      const creatorName = sanitizeText(body.creator_name, 2, 40);
      const competitions = validateCompetitions(body.competitions);
      const creatorId = body.creator_id;
      const creatorToken = typeof body.creator_token === 'string' && body.creator_token.length >= 8 ? body.creator_token : null;

      if (!name) return res.status(400).json({ error: 'Nome da liga deve ter entre 3 e 50 caracteres.' });
      if (!creatorName) return res.status(400).json({ error: 'Seu apelido deve ter entre 2 e 40 caracteres.' });
      if (!competitions) return res.status(400).json({ error: 'Selecione ao menos uma competição válida.' });
      if (!isValidUUID(creatorId)) return res.status(400).json({ error: 'Identificador de participante inválido.' });
      if (!creatorToken) return res.status(400).json({ error: 'Token de segurança inválido.' });

      const inviteCode = generateInviteCode();
      let created = null;

      try {
        created = await rpc('create_bolao_league', {
          p_name: name,
          p_competitions: competitions,
          p_creator_id: creatorId,
          p_creator_token: creatorToken,
          p_creator_name: creatorName,
          p_invite_code: inviteCode
        });
      } catch (rpcErr) {
        // Se a RPC falhar por cache do PostgREST mas as tabelas existirem, executa inserção direta
        if (rpcErr.message && (rpcErr.message.includes('não foram criadas') || rpcErr.message.includes('schema cache') || rpcErr.message.includes('PGRST202') || rpcErr.message.includes('Could not find'))) {
          try {
            const leagues = await database('bolao_leagues', {
              method: 'POST',
              body: JSON.stringify({
                name,
                invite_code: inviteCode,
                competitions,
                created_by: creatorId
              })
            });
            const leagueObj = Array.isArray(leagues) ? leagues[0] : leagues;
            if (leagueObj && leagueObj.id) {
              await database('bolao_participants', {
                method: 'POST',
                body: JSON.stringify({
                  league_id: leagueObj.id,
                  participant_id: creatorId,
                  participant_token: creatorToken,
                  participant_name: creatorName
                })
              });
              created = {
                league_id: leagueObj.id,
                name: leagueObj.name,
                invite_code: leagueObj.invite_code,
                competitions: leagueObj.competitions
              };
            } else {
              throw rpcErr;
            }
          } catch {
            throw rpcErr;
          }
        } else {
          throw rpcErr;
        }
      }

      return res.status(201).json({ success: true, league: created });
    }

    // 3. Ingressar na Liga via Código de Convite (POST)
    if (req.method === 'POST' && action === 'join') {
      if (!await enforceRateLimit(req, res, { scope: 'bolao-join', limit: 30, windowSeconds: 900 })) return;

      const body = req.body || {};
      const inviteCode = (body.invite_code || '').trim().toUpperCase();
      const participantName = sanitizeText(body.participant_name, 2, 40);
      const participantId = body.participant_id;
      const participantToken = typeof body.participant_token === 'string' && body.participant_token.length >= 8 ? body.participant_token : null;

      if (!inviteCode || inviteCode.length !== 8) return res.status(400).json({ error: 'Código de convite inválido.' });
      if (!participantName) return res.status(400).json({ error: 'Seu apelido deve ter entre 2 e 40 caracteres.' });
      if (!isValidUUID(participantId)) return res.status(400).json({ error: 'Identificador de participante inválido.' });
      if (!participantToken) return res.status(400).json({ error: 'Token de segurança inválido.' });

      let joined = null;
      try {
        joined = await rpc('join_bolao_league', {
          p_invite_code: inviteCode,
          p_participant_id: participantId,
          p_participant_token: participantToken,
          p_participant_name: participantName
        });
      } catch (rpcErr) {
        if (rpcErr.message && (rpcErr.message.includes('não foram criadas') || rpcErr.message.includes('schema cache') || rpcErr.message.includes('PGRST202') || rpcErr.message.includes('Could not find'))) {
          try {
            const rows = await database(`bolao_leagues?invite_code=eq.${encodeURIComponent(inviteCode)}&select=id,name,competitions`);
            if (!Array.isArray(rows) || rows.length === 0) {
              return res.status(404).json({ error: 'Liga não encontrada com este código de convite.' });
            }
            const leagueObj = rows[0];
            await database('bolao_participants', {
              method: 'POST',
              headers: { Prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify({
                league_id: leagueObj.id,
                participant_id: participantId,
                participant_token: participantToken,
                participant_name: participantName
              })
            });
            joined = {
              league_id: leagueObj.id,
              name: leagueObj.name,
              competitions: leagueObj.competitions
            };
          } catch {
            throw rpcErr;
          }
        } else {
          throw rpcErr;
        }
      }

      return res.status(200).json({ success: true, league: joined });
    }

    // 4. Detalhes da Liga e Participantes (GET)
    if (req.method === 'GET' && action === 'league') {
      const leagueId = req.query?.id;
      const participantId = req.query?.participant_id;

      if (!isValidUUID(leagueId)) return res.status(400).json({ error: 'Identificador de liga inválido.' });
      if (!await enforceRateLimit(req, res, { scope: 'bolao-read', limit: 120, windowSeconds: 60 })) return;

      // Busca liga
      const leagueRows = await database(`bolao_leagues?id=eq.${leagueId}&select=id,name,invite_code,competitions,created_by,created_at`);
      if (!Array.isArray(leagueRows) || leagueRows.length === 0) {
        return res.status(404).json({ error: 'Liga não encontrada.' });
      }

      // Busca participantes
      const participants = await database(`bolao_participants?league_id=eq.${leagueId}&select=participant_id,participant_name,joined_at&order=joined_at.asc`);

      return res.status(200).json({
        league: leagueRows[0],
        participants: Array.isArray(participants) ? participants : []
      });
    }

    // 5. Minhas Ligas (POST com IDs de ligas salvas localmente)
    if (req.method === 'POST' && action === 'my-leagues') {
      const body = req.body || {};
      const participantId = body.participant_id;
      const leagueIds = Array.isArray(body.league_ids) ? body.league_ids.filter(isValidUUID) : [];

      if (!isValidUUID(participantId)) return res.status(400).json({ error: 'Identificador de participante inválido.' });

      if (leagueIds.length === 0) {
        return res.status(200).json({ leagues: [] });
      }

      const idFilter = leagueIds.map(id => `"${id}"`).join(',');
      const rows = await database(`bolao_leagues?id=in.(${idFilter})&select=id,name,invite_code,competitions,created_at,bolao_participants(count)`);

      return res.status(200).json({
        leagues: Array.isArray(rows) ? rows.map(l => ({
          id: l.id,
          name: l.name,
          invite_code: l.invite_code,
          competitions: l.competitions,
          created_at: l.created_at,
          member_count: l.bolao_participants?.[0]?.count ?? 1
        })) : []
      });
    }

    // 6. Salvar Palpite (POST)
    if (req.method === 'POST' && action === 'prediction') {
      if (!await enforceRateLimit(req, res, { scope: 'bolao-predict', limit: 100, windowSeconds: 60 })) return;

      const body = req.body || {};
      const leagueId = body.league_id;
      const participantId = body.participant_id;
      const participantToken = body.participant_token;
      const fixtureId = Number(body.fixture_id);
      const fixtureDate = validateFixtureDate(body.fixture_date);
      const homeScore = validateScore(body.home_score);
      const awayScore = validateScore(body.away_score);

      if (!isValidUUID(leagueId)) return res.status(400).json({ error: 'Identificador de liga inválido.' });
      if (!isValidUUID(participantId)) return res.status(400).json({ error: 'Identificador de participante inválido.' });
      if (!participantToken) return res.status(400).json({ error: 'Token de participante inválido.' });
      if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0) return res.status(400).json({ error: 'Jogo inválido.' });
      if (!fixtureDate) return res.status(400).json({ error: 'Data da partida inválida.' });
      if (homeScore === null || awayScore === null) return res.status(400).json({ error: 'Placar deve estar entre 0 e 99.' });

      // Validação estrita do prazo de 10 minutos no servidor
      const kickoffTime = new Date(fixtureDate).getTime();
      const now = Date.now();
      const tenMinutes = 10 * 60 * 1000;
      if (kickoffTime - now < tenMinutes) {
        return res.status(400).json({
          error: 'Prazo de palpites encerrado para esta partida (limite de até 10 minutos antes do início).'
        });
      }

      try {
        await rpc('save_bolao_prediction', {
          p_league_id: leagueId,
          p_participant_id: participantId,
          p_participant_token: participantToken,
          p_fixture_id: fixtureId,
          p_fixture_date: fixtureDate,
          p_home_score: homeScore,
          p_away_score: awayScore
        });
      } catch (rpcErr) {
        if (rpcErr.message && (rpcErr.message.includes('não foram criadas') || rpcErr.message.includes('schema cache') || rpcErr.message.includes('PGRST202') || rpcErr.message.includes('Could not find'))) {
          try {
            const partRows = await database(
              `bolao_participants?league_id=eq.${leagueId}&participant_id=eq.${participantId}&participant_token=eq.${encodeURIComponent(participantToken)}&select=participant_id`
            );
            if (!Array.isArray(partRows) || partRows.length === 0) {
              return res.status(403).json({ error: 'Participante ou token inválido para esta liga.' });
            }

            await database('bolao_predictions', {
              method: 'POST',
              headers: { Prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify({
                league_id: leagueId,
                participant_id: participantId,
                fixture_id: fixtureId,
                fixture_date: fixtureDate,
                home_score: homeScore,
                away_score: awayScore,
                points: null,
                status: 'pending',
                updated_at: new Date().toISOString()
              })
            });
          } catch {
            throw rpcErr;
          }
        } else {
          throw rpcErr;
        }
      }

      return res.status(200).json({ success: true });
    }

    // 7. Obter Palpites da Liga (GET)
    if (req.method === 'GET' && action === 'predictions') {
      const leagueId = req.query?.league_id;
      const participantId = req.query?.participant_id;

      if (!isValidUUID(leagueId)) return res.status(400).json({ error: 'Identificador de liga inválido.' });
      if (!await enforceRateLimit(req, res, { scope: 'bolao-read', limit: 120, windowSeconds: 60 })) return;

      // Palpites do próprio participante
      let userPredictions = [];
      if (isValidUUID(participantId)) {
        userPredictions = await database(
          `bolao_predictions?league_id=eq.${leagueId}&participant_id=eq.${participantId}&select=fixture_id,home_score,away_score,points,status,fixture_date,updated_at`
        );
      }

      // Palpites de todos os participantes para jogos cujo prazo já encerrou (menos de 10 minutos para começar ou já começaram)
      const tenMinFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const closedMatchPredictions = await database(
        `bolao_predictions?league_id=eq.${leagueId}&fixture_date=lte.${encodeURIComponent(tenMinFromNow)}&select=fixture_id,participant_id,home_score,away_score,points,status`
      );

      return res.status(200).json({
        my_predictions: Array.isArray(userPredictions) ? userPredictions : [],
        closed_predictions: Array.isArray(closedMatchPredictions) ? closedMatchPredictions : []
      });
    }

    // 8. Apuração de Partidas Finalizadas (POST)
    if (req.method === 'POST' && action === 'sync-scores') {
      if (!await enforceRateLimit(req, res, { scope: 'bolao-sync', limit: 30, windowSeconds: 60 })) return;

      const body = req.body || {};
      const fixtures = Array.isArray(body.fixtures) ? body.fixtures : [];

      let evaluatedTotal = 0;
      for (const item of fixtures) {
        const fId = Number(item.id);
        const home = validateScore(item.home_score);
        const away = validateScore(item.away_score);
        const status = (item.status || '').toUpperCase();

        if (Number.isSafeInteger(fId) && home !== null && away !== null && ['FT', 'AET', 'PEN'].includes(status)) {
          try {
            const count = await rpc('evaluate_bolao_fixture', {
              p_fixture_id: fId,
              p_actual_home: home,
              p_actual_away: away
            });
            evaluatedTotal += Number(count) || 0;
          } catch (e) {
            // Fallback direto nas tabelas caso a RPC não esteja em cache
            if (e.message && (e.message.includes('não foram criadas') || e.message.includes('schema cache') || e.message.includes('PGRST202') || e.message.includes('Could not find'))) {
              try {
                const pendings = await database(`bolao_predictions?fixture_id=eq.${fId}&status=eq.pending&select=id,home_score,away_score`);
                if (Array.isArray(pendings)) {
                  for (const pred of pendings) {
                    let pts = 0;
                    let st = 'wrong';
                    if (pred.home_score === home && pred.away_score === away) {
                      pts = 3;
                      st = 'exact';
                    } else if (
                      (pred.home_score > pred.away_score && home > away) ||
                      (pred.home_score < pred.away_score && home < away) ||
                      (pred.home_score === pred.away_score && home === away)
                    ) {
                      pts = 1;
                      st = 'result';
                    }
                    await database(`bolao_predictions?id=eq.${pred.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ points: pts, status: st, updated_at: new Date().toISOString() })
                    });
                    evaluatedTotal += 1;
                  }
                }
              } catch {}
            }
          }
        }
      }

      return res.status(200).json({ success: true, evaluated: evaluatedTotal });
    }

    // 9. Classificação / Ranking (GET)
    if (req.method === 'GET' && action === 'ranking') {
      const leagueId = req.query?.league_id;
      if (!isValidUUID(leagueId)) return res.status(400).json({ error: 'Identificador de liga inválido.' });

      if (!await enforceRateLimit(req, res, { scope: 'bolao-read', limit: 120, windowSeconds: 60 })) return;

      let ranking = [];
      try {
        ranking = await rpc('get_bolao_ranking', { p_league_id: leagueId });
      } catch (rpcErr) {
        if (rpcErr.message && (rpcErr.message.includes('não foram criadas') || rpcErr.message.includes('schema cache') || rpcErr.message.includes('PGRST202') || rpcErr.message.includes('Could not find'))) {
          try {
            const participants = await database(
              `bolao_participants?league_id=eq.${leagueId}&select=participant_id,participant_name,joined_at&order=joined_at.asc`
            );
            if (Array.isArray(participants)) {
              const predictions = await database(
                `bolao_predictions?league_id=eq.${leagueId}&points=not.is.null&select=participant_id,points`
              );
              const predList = Array.isArray(predictions) ? predictions : [];

              const statsMap = new Map();
              for (const p of participants) {
                statsMap.set(p.participant_id, {
                  participant_id: p.participant_id,
                  participant_name: p.participant_name,
                  total_points: 0,
                  exact_count: 0,
                  result_count: 0,
                  wrong_count: 0,
                  total_predictions: 0,
                  joined_at: p.joined_at
                });
              }

              for (const pr of predList) {
                const stat = statsMap.get(pr.participant_id);
                if (stat) {
                  stat.total_predictions += 1;
                  const pts = Number(pr.points);
                  if (pts === 3) {
                    stat.exact_count += 1;
                    stat.total_points += 3;
                  } else if (pts === 1) {
                    stat.result_count += 1;
                    stat.total_points += 1;
                  } else if (pts === 0) {
                    stat.wrong_count += 1;
                  }
                }
              }

              ranking = Array.from(statsMap.values()).sort((a, b) => {
                if (b.total_points !== a.total_points) return b.total_points - a.total_points;
                if (b.exact_count !== a.exact_count) return b.exact_count - a.exact_count;
                if (b.result_count !== a.result_count) return b.result_count - a.result_count;
                return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
              });
            }
          } catch {
            throw rpcErr;
          }
        } else {
          throw rpcErr;
        }
      }

      return res.status(200).json({
        ranking: Array.isArray(ranking) ? ranking : []
      });
    }

    return res.status(400).json({ error: 'Ação não reconhecida.' });
  } catch (error) {
    console.error('Bolão API error:', error);
    return res.status(500).json({ error: error.message || 'Erro interno no servidor do Bolão.' });
  }
};
