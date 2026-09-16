function getSpecificPlayerRole(player, st) {
  const rawPos = String(st?.games?.position || player?.position || "").trim();
  const dribblesAttempts = st?.dribbles?.attempts || 0;
  const dribblesSuccess = st?.dribbles?.success || 0;
  const tackles = st?.tackles?.total || 0;
  const keyPasses = st?.passes?.key || 0;
  const goals = st?.goals?.total || 0;
  const shots = st?.shots?.total || 0;
  const apps = Math.max(st?.games?.appearences || 1, 1);
  const number = Number(st?.games?.number || player?.number || 0);

  // 1. Goleiro
  if (/goalkeeper|goleiro|^G$/i.test(rawPos)) {
    return "Goleiro";
  }

  // 2. Defensor (Zagueiro, Lateral-Direito, Lateral-Esquerdo)
  if (/defender|defensor|^D$/i.test(rawPos)) {
    if (number === 2 || number === 13 || (dribblesAttempts / apps > 0.8 && keyPasses / apps > 0.4)) {
      return "Lateral-Direito";
    }
    if (number === 6 || number === 16 || number === 33) {
      return "Lateral-Esquerdo";
    }
    if (dribblesAttempts / apps > 0.6) {
      return "Lateral";
    }
    return "Zagueiro";
  }

  // 3. Meio-Campo (Volante, Meia-Armador, Meia-Atacante, Ponta/Meia de Lado)
  if (/midfielder|meio|^M$/i.test(rawPos)) {
    // Jogador de lado de campo / Driblador (ex: Andrés Gómez, Savinho, Estêvão quando listado no meio)
    if ((dribblesAttempts / apps >= 1.3) || (dribblesSuccess / apps >= 0.9)) {
      if (number === 11 || number === 7 || number === 9 || number === 17) {
        return "Meia-Esquerda / Ponta";
      }
      return "Meia-Atacante / Ponta";
    }

    // Primeiro/Segundo Volante (Muitos desarmes e poucas finalizações)
    if ((tackles / apps >= 1.4) && (shots / apps < 1.0)) {
      return (tackles / apps >= 2.2) ? "Primeiro Volante" : "Volante";
    }

    // Meia-Armador / Camisa 10
    if ((keyPasses / apps >= 1.1) || number === 10 || number === 8 || number === 14) {
      return "Meia-Armador / Meia Ofensivo";
    }

    return "Meia-Atacante";
  }

  // 4. Atacante (Centroavante, Ponta-Esquerda, Ponta-Direita, Segundo Atacante)
  if (/attacker|atacante|^F$|^A$/i.test(rawPos) || !rawPos) {
    if (dribblesAttempts / apps >= 1.3) {
      if (number === 11 || number === 7) return "Ponta-Esquerda / Ponta-Direita";
      return "Ponta / Atacante de Lado";
    }
    if ((goals / apps >= 0.35) || (shots / apps >= 1.8) || number === 9) {
      return "Centroavante";
    }
    return "Atacante";
  }

  return "Meio-Campista";
}

async function renderPlayer(playerId, teamId, leagueId, season) {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  app.innerHTML = `<div id="player-content">${skeletonTable()}</div>`;
  const content = document.getElementById("player-content");

  try {
    const pRes = await apiGet("players", { id: playerId, season: season || 2026 }, 30);
    const entry = pRes?.[0];
    if (!entry) {
      content.innerHTML = errorBox("Estatísticas não localizadas para este atleta na temporada.");
      return;
    }

    const p = entry.player;
    const statsList = entry.statistics || [];

    // Reconciliação em Tempo Real: Corrige o delay da API-Football somando os dados dos jogos já finalizados
    await Promise.all(statsList.map(async (st) => {
      if (!st.team?.id || !st.league?.id) return;
      try {
        const finishedFixtures = await apiGet("fixtures", {
          team: st.team.id,
          league: st.league.id,
          season: st.league.season || season || 2026,
          status: "FT-AET-PEN"
        }, 15).catch(() => []);

        if (Array.isArray(finishedFixtures) && finishedFixtures.length > 0) {
          const fixturePlayerResponses = await Promise.all(
            finishedFixtures.map(f => apiGet("fixtures/players", { fixture: f.fixture.id }, 60).catch(() => []))
          );

          const matchStats = [];
          for (const fPlayers of fixturePlayerResponses) {
            if (!Array.isArray(fPlayers)) continue;
            const tData = fPlayers.find(t => t.team?.id === st.team.id);
            const pData = tData?.players?.find(pl => pl.player?.id === playerId);
            if (pData?.statistics?.[0] && pData.statistics[0].games?.minutes !== null) {
              matchStats.push(pData.statistics[0]);
            }
          }

          if (matchStats.length > (st.games?.appearences || 0)) {
            const totalApps = matchStats.length;
            const totalLineups = matchStats.filter(s => s.games?.substitute === false).length;
            const totalMinutes = matchStats.reduce((acc, s) => acc + (s.games?.minutes || 0), 0);
            const rated = matchStats.filter(s => parseFloat(s.games?.rating) > 0);
            const avgRating = rated.length ? (rated.reduce((acc, s) => acc + parseFloat(s.games.rating), 0) / rated.length).toFixed(2) : st.games?.rating;
            const totalGoals = matchStats.reduce((acc, s) => acc + (s.goals?.total || 0), 0);
            const totalAssists = matchStats.reduce((acc, s) => acc + (s.goals?.assists || 0), 0);
            const totalShots = matchStats.reduce((acc, s) => acc + (s.shots?.total || 0), 0);
            const shotsOn = matchStats.reduce((acc, s) => acc + (s.shots?.on || 0), 0);
            const totalPasses = matchStats.reduce((acc, s) => acc + (s.passes?.total || 0), 0);
            const totalKeyPasses = matchStats.reduce((acc, s) => acc + (s.passes?.key || 0), 0);
            const completedPasses = matchStats.reduce((acc, s) => {
              const accNum = parseFloat(s.passes?.accuracy) || 0;
              if (accNum <= (s.passes?.total || 0) && accNum > 0) {
                return acc + accNum;
              } else if (accNum <= 100 && accNum > 0) {
                return acc + Math.round(((s.passes?.total || 0) * accNum) / 100);
              }
              return acc;
            }, 0);
            const passAccPct = totalPasses > 0 ? Math.round((completedPasses / totalPasses) * 100) : st.passes?.accuracy;

            const totalDribblesAttempts = matchStats.reduce((acc, s) => acc + (s.dribbles?.attempts || 0), 0);
            const totalDribblesSuccess = matchStats.reduce((acc, s) => acc + (s.dribbles?.success || 0), 0);
            const totalTackles = matchStats.reduce((acc, s) => acc + (s.tackles?.total || 0), 0);
            const totalInterceptions = matchStats.reduce((acc, s) => acc + (s.tackles?.interceptions || 0), 0);
            const totalFoulsDrawn = matchStats.reduce((acc, s) => acc + (s.fouls?.drawn || 0), 0);
            const totalFoulsCommitted = matchStats.reduce((acc, s) => acc + (s.fouls?.committed || 0), 0);
            const yellowCards = matchStats.reduce((acc, s) => acc + (s.cards?.yellow || 0), 0);
            const redCards = matchStats.reduce((acc, s) => acc + (s.cards?.red || 0), 0);
            const penaltyWon = matchStats.reduce((acc, s) => acc + (s.penalty?.won || 0), 0);
            const penaltyScored = matchStats.reduce((acc, s) => acc + (s.penalty?.scored || 0), 0);

            st.games = {
              ...st.games,
              appearences: totalApps,
              lineups: totalLineups,
              minutes: totalMinutes,
              rating: avgRating
            };
            st.goals = {
              ...st.goals,
              total: totalGoals,
              assists: totalAssists
            };
            st.shots = { total: totalShots, on: shotsOn };
            st.passes = {
              ...st.passes,
              total: totalPasses,
              key: totalKeyPasses,
              accuracy: passAccPct
            };
            st.dribbles = { attempts: totalDribblesAttempts, success: totalDribblesSuccess };
            st.tackles = { ...(st.tackles || {}), total: totalTackles, interceptions: totalInterceptions };
            st.fouls = { drawn: totalFoulsDrawn, committed: totalFoulsCommitted };
            st.cards = { ...(st.cards || {}), yellow: yellowCards, red: redCards };
            st.penalty = { ...(st.penalty || {}), won: penaltyWon, scored: penaltyScored };
          }
        }
      } catch (err) {
        console.warn("Reconciliação de estatísticas do jogador ignorada:", err);
      }
    }));

    const totalStats = {
      team: { name: statsList[0]?.team?.name || "Clube", logo: statsList[0]?.team?.logo },
      league: { id: "TOTAL", name: "Total da Temporada (Todas as Competições)" },
      games: {
        appearences: statsList.reduce((acc, s) => acc + (s.games?.appearences || 0), 0),
        lineups: statsList.reduce((acc, s) => acc + (s.games?.lineups || 0), 0),
        minutes: statsList.reduce((acc, s) => acc + (s.games?.minutes || 0), 0),
        position: statsList[0]?.games?.position || "-",
        number: statsList[0]?.games?.number || "-",
        rating: (() => {
          const rated = statsList.filter(s => parseFloat(s.games?.rating) > 0);
          if (!rated.length) return "0";
          const totalScore = rated.reduce((sum, s) => sum + (parseFloat(s.games.rating) * (s.games.appearences || 1)), 0);
          const totalApps = rated.reduce((sum, s) => sum + (s.games.appearences || 1), 0);
          return (totalScore / totalApps).toFixed(2);
        })()
      },
      goals: {
        total: statsList.reduce((acc, s) => acc + (s.goals?.total || 0), 0),
        assists: statsList.reduce((acc, s) => acc + (s.goals?.assists || 0), 0),
        conceded: statsList.reduce((acc, s) => acc + (s.goals?.conceded || 0), 0),
        saves: statsList.reduce((acc, s) => acc + (s.goals?.saves || 0), 0),
      },
      passes: {
        total: statsList.reduce((acc, s) => acc + (s.passes?.total || 0), 0),
        key: statsList.reduce((acc, s) => acc + (s.passes?.key || 0), 0),
        accuracy: (() => {
          const withAcc = statsList.filter(s => s.passes?.accuracy && s.passes?.total);
          if (!withAcc.length) return null;
          const totalAccPasses = withAcc.reduce((sum, s) => sum + (s.passes.total * s.passes.accuracy), 0);
          const totalP = withAcc.reduce((sum, s) => sum + s.passes.total, 0);
          return totalP ? Math.round(totalAccPasses / totalP) : null;
        })()
      },
      shots: {
        total: statsList.reduce((acc, s) => acc + (s.shots?.total || 0), 0),
        on: statsList.reduce((acc, s) => acc + (s.shots?.on || 0), 0),
      },
      dribbles: {
        attempts: statsList.reduce((acc, s) => acc + (s.dribbles?.attempts || 0), 0),
        success: statsList.reduce((acc, s) => acc + (s.dribbles?.success || 0), 0),
      },
      tackles: {
        total: statsList.reduce((acc, s) => acc + (s.tackles?.total || 0), 0),
        blocks: statsList.reduce((acc, s) => acc + (s.tackles?.blocks || 0), 0),
        interceptions: statsList.reduce((acc, s) => acc + (s.tackles?.interceptions || 0), 0),
      },
      fouls: {
        drawn: statsList.reduce((acc, s) => acc + (s.fouls?.drawn || 0), 0),
        committed: statsList.reduce((acc, s) => acc + (s.fouls?.committed || 0), 0),
      },
      cards: {
        yellow: statsList.reduce((acc, s) => acc + (s.cards?.yellow || 0), 0),
        yellowred: statsList.reduce((acc, s) => acc + (s.cards?.yellowred || 0), 0),
        red: statsList.reduce((acc, s) => acc + (s.cards?.red || 0), 0),
      },
      duels: {
        total: statsList.reduce((acc, s) => acc + (s.duels?.total || 0), 0),
        won: statsList.reduce((acc, s) => acc + (s.duels?.won || 0), 0),
      },
      penalty: {
        won: statsList.reduce((acc, s) => acc + (s.penalty?.won || 0), 0),
        scored: statsList.reduce((acc, s) => acc + (s.penalty?.scored || 0), 0),
        missed: statsList.reduce((acc, s) => acc + (s.penalty?.missed || 0), 0),
        saved: statsList.reduce((acc, s) => acc + (s.penalty?.saved || 0), 0),
      }
    };

    const allOptions = [totalStats, ...statsList];
    let currentSelectedIdx = 0;
    let currentMode = "total"; // "total" | "per_game"

    function renderPlayerStatsView(s, selectedIdx = 0, mode = "total") {
      const rating = parseFloat(s.games?.rating || "0").toFixed(2);
      const isPerGame = (mode === "per_game");
      const apps = Math.max(s.games?.appearences || 0, 0);

      function perGame(val, digits = 2) {
        if (!apps || val === undefined || val === null) return "0.00";
        return (val / apps).toFixed(digits);
      }

      function fmt(val, digits = 2) {
        if (isPerGame) {
          return perGame(val, digits);
        }
        return (val ?? 0).toString();
      }
      
      const compOptions = allOptions.map((st, idx) => `
        <option value="${idx}" ${idx === selectedIdx ? 'selected' : ''}>
          ${idx === 0 ? '📊 Total Geral (Todas as Competições)' : `${escapeHtml(st.league.name)} — ${escapeHtml(st.team.name)}`}
        </option>
      `).join("");

      const rawPos = (s.games?.position || p.position || "").toLowerCase();
      const specificRole = getSpecificPlayerRole(p, s);
      const isGK = rawPos.includes("goalkeeper") || rawPos === "g" || specificRole === "Goleiro";
      const isDefender = rawPos.includes("defender") || rawPos === "d" || specificRole.includes("Zagueiro") || specificRole.includes("Lateral");
      const isMidfielder = rawPos.includes("midfielder") || rawPos === "m" || specificRole.includes("Volante") || specificRole.includes("Meia");
      const isAttacker = rawPos.includes("attacker") || rawPos === "f" || rawPos === "a" || specificRole.includes("Centroavante") || specificRole.includes("Ponta") || specificRole.includes("Atacante") || (!isGK && !isDefender && !isMidfielder);

      // Top 4 cards por posição (100% nativos da API)
      let topCardsHtml = "";

      if (isGK) {
        // Goleiro
        topCardsHtml = `
          <div class="stat-card-modern cyan">
            <div class="stat-card-header">
              <span>${isPerGame ? '⏱️' : '🏃'}</span>
              <span>${isPerGame ? 'Minutos por Jogo' : 'Jogos (Titular)'}</span>
            </div>
            <div class="stat-card-main-val cyan">
              ${isPerGame 
                ? `${apps ? Math.round((s.games?.minutes || 0) / apps) : 0} <small style="font-size:0.95rem;color:var(--chalk-dim);">min</small>`
                : `${s.games?.appearences ?? 0} <small style="font-size:1rem;color:var(--chalk-dim);">(${s.games?.lineups ?? 0})</small>`
              }
            </div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total de ${apps} jogos (${s.games?.lineups ?? 0} titular)` : `⏱️ ${s.games?.minutes ?? 0} minutos`}</span>
            </div>
          </div>

          <div class="stat-card-modern green">
            <div class="stat-card-header">
              <span>🧤</span>
              <span>${isPerGame ? 'Defesas / Jogo' : 'Defesas Totais'}</span>
            </div>
            <div class="stat-card-main-val green">${fmt(s.goals?.saves)}</div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total de ${s.goals?.saves ?? 0} defesas` : `Média: ${perGame(s.goals?.saves)} / jogo`}</span>
            </div>
          </div>

          <div class="stat-card-modern gold">
            <div class="stat-card-header">
              <span>🥅</span>
              <span>${isPerGame ? 'Média Sofridos / Jogo' : 'Gols Sofridos'}</span>
            </div>
            <div class="stat-card-main-val gold">${fmt(s.goals?.conceded)}</div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total sofrido: ${s.goals?.conceded ?? 0} gols` : `Média: ${perGame(s.goals?.conceded)} por partida`}</span>
            </div>
          </div>

          <div class="stat-card-modern cyan">
            <div class="stat-card-header">
              <span>🛑</span>
              <span>Pênaltis Defendidos</span>
            </div>
            <div class="stat-card-main-val cyan">${s.penalty?.saved ?? 0}</div>
            <div class="stat-split-bar">
              <span>${s.passes?.accuracy ? `Precisão de Reposição: ${s.passes.accuracy}%` : 'Reposições seguras'}</span>
            </div>
          </div>
        `;
      } else if (isDefender) {
        // Zagueiro / Lateral
        const duelTotal = s.duels?.total || 0;
        const duelWon = s.duels?.won || 0;
        const duelPct = duelTotal > 0 ? Math.round((duelWon / duelTotal) * 100) + '%' : '-';

        topCardsHtml = `
          <div class="stat-card-modern cyan">
            <div class="stat-card-header">
              <span>${isPerGame ? '⏱️' : '🏃'}</span>
              <span>${isPerGame ? 'Minutos por Jogo' : 'Jogos (Titular)'}</span>
            </div>
            <div class="stat-card-main-val cyan">
              ${isPerGame 
                ? `${apps ? Math.round((s.games?.minutes || 0) / apps) : 0} <small style="font-size:0.95rem;color:var(--chalk-dim);">min</small>`
                : `${s.games?.appearences ?? 0} <small style="font-size:1rem;color:var(--chalk-dim);">(${s.games?.lineups ?? 0})</small>`
              }
            </div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total de ${apps} jogos (${s.games?.lineups ?? 0} titular)` : `⏱️ ${s.games?.minutes ?? 0} minutos`}</span>
            </div>
          </div>

          <div class="stat-card-modern green">
            <div class="stat-card-header">
              <span>⚔️</span>
              <span>${isPerGame ? 'Desarmes / Jogo' : 'Desarmes Totais'}</span>
            </div>
            <div class="stat-card-main-val green">${fmt(s.tackles?.total)}</div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total: ${s.tackles?.total ?? 0} desarmes` : `Média: ${perGame(s.tackles?.total)} / jogo`}</span>
            </div>
          </div>

          <div class="stat-card-modern cyan">
            <div class="stat-card-header">
              <span>🧤</span>
              <span>${isPerGame ? 'Interceptações / Jogo' : 'Interceptações'}</span>
            </div>
            <div class="stat-card-main-val cyan">${fmt(s.tackles?.interceptions)}</div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total: ${s.tackles?.interceptions ?? 0} cortes` : `Média: ${perGame(s.tackles?.interceptions)} / jogo`}</span>
            </div>
          </div>

          <div class="stat-card-modern gold">
            <div class="stat-card-header">
              <span>🛡️</span>
              <span>Duelos Vencidos</span>
            </div>
            <div class="stat-card-main-val gold">${duelPct}</div>
            <div class="stat-split-bar">
              <span>${duelTotal > 0 ? `${duelWon} de ${duelTotal} disputas ganhas` : (s.passes?.accuracy ? `Precisão de Passe: ${s.passes.accuracy}%` : 'Disputas defensivas')}</span>
            </div>
          </div>
        `;
      } else if (isMidfielder) {
        // Meio-campista / Volante / Meia
        topCardsHtml = `
          <div class="stat-card-modern cyan">
            <div class="stat-card-header">
              <span>${isPerGame ? '⏱️' : '🏃'}</span>
              <span>${isPerGame ? 'Minutos por Jogo' : 'Jogos (Titular)'}</span>
            </div>
            <div class="stat-card-main-val cyan">
              ${isPerGame 
                ? `${apps ? Math.round((s.games?.minutes || 0) / apps) : 0} <small style="font-size:0.95rem;color:var(--chalk-dim);">min</small>`
                : `${s.games?.appearences ?? 0} <small style="font-size:1rem;color:var(--chalk-dim);">(${s.games?.lineups ?? 0})</small>`
              }
            </div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total de ${apps} jogos (${s.games?.lineups ?? 0} titular)` : `⏱️ ${s.games?.minutes ?? 0} minutos`}</span>
            </div>
          </div>

          <div class="stat-card-modern gold">
            <div class="stat-card-header">
              <span>⚽</span>
              <span>${isPerGame ? 'Média de Gols / Jogo' : 'Gols Marcados'}</span>
            </div>
            <div class="stat-card-main-val gold">${fmt(s.goals?.total)}</div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total: ${s.goals?.total ?? 0} gols (${s.penalty?.scored ?? 0} pênaltis)` : `Média: ${perGame(s.goals?.total)} / jogo · Pênaltis: ${s.penalty?.scored ?? 0}`}</span>
            </div>
          </div>

          <div class="stat-card-modern green">
            <div class="stat-card-header">
              <span>👟</span>
              <span>${isPerGame ? 'Média de Assist. / Jogo' : 'Assistências'}</span>
            </div>
            <div class="stat-card-main-val green">${fmt(s.goals?.assists)}</div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total: ${s.goals?.assists ?? 0} assistências · Chave/j: ${perGame(s.passes?.key)}` : `Média: ${perGame(s.goals?.assists)} / j · Passes-Chave: ${s.passes?.key ?? 0}`}</span>
            </div>
          </div>

          <div class="stat-card-modern cyan">
            <div class="stat-card-header">
              <span>🎯</span>
              <span>Precisão de Passes</span>
            </div>
            <div class="stat-card-main-val cyan">${s.passes?.accuracy ? s.passes.accuracy + '%' : '-'}</div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Média: ${perGame(s.passes?.total, 1)} passes / jogo` : `Total: ${s.passes?.total ?? 0} passes (Média: ${perGame(s.passes?.total, 1)}/j)`}</span>
            </div>
          </div>

          <div class="stat-card-modern gold">
            <div class="stat-card-header">
              <span>⚔️</span>
              <span>${isPerGame ? 'Desarmes / Jogo' : 'Desarmes & Botes'}</span>
            </div>
            <div class="stat-card-main-val gold">${fmt(s.tackles?.total)}</div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total: ${s.tackles?.total ?? 0} desarmes · Intercep/j: ${perGame(s.tackles?.interceptions)}` : `Média: ${perGame(s.tackles?.total)}/j · Interceptações: ${s.tackles?.interceptions ?? 0}`}</span>
            </div>
          </div>
        `;
      } else {
        // Atacante / Ponta / Centroavante
        const shotTotal = s.shots?.total || 0;
        const shotOn = s.shots?.on || 0;
        const shotAccuracy = shotTotal > 0 ? Math.round((shotOn / shotTotal) * 100) + '%' : '-';

        topCardsHtml = `
          <div class="stat-card-modern cyan">
            <div class="stat-card-header">
              <span>${isPerGame ? '⏱️' : '🏃'}</span>
              <span>${isPerGame ? 'Minutos por Jogo' : 'Jogos (Titular)'}</span>
            </div>
            <div class="stat-card-main-val cyan">
              ${isPerGame 
                ? `${apps ? Math.round((s.games?.minutes || 0) / apps) : 0} <small style="font-size:0.95rem;color:var(--chalk-dim);">min</small>`
                : `${s.games?.appearences ?? 0} <small style="font-size:1rem;color:var(--chalk-dim);">(${s.games?.lineups ?? 0})</small>`
              }
            </div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total de ${apps} jogos (${s.games?.lineups ?? 0} titular)` : `⏱️ ${s.games?.minutes ?? 0} minutos`}</span>
            </div>
          </div>

          <div class="stat-card-modern gold">
            <div class="stat-card-header">
              <span>⚽</span>
              <span>${isPerGame ? 'Média de Gols / Jogo' : 'Gols Marcados'}</span>
            </div>
            <div class="stat-card-main-val gold">${fmt(s.goals?.total)}</div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total: ${s.goals?.total ?? 0} gols (${s.penalty?.scored ?? 0} pênaltis)` : `Média: ${perGame(s.goals?.total)} / jogo · Pênaltis: ${s.penalty?.scored ?? 0}`}</span>
            </div>
          </div>

          <div class="stat-card-modern green">
            <div class="stat-card-header">
              <span>🎯</span>
              <span>Pontaria no Alvo</span>
            </div>
            <div class="stat-card-main-val green">${shotAccuracy}</div>
            <div class="stat-split-bar">
              <span>${shotTotal > 0 ? `${shotOn} no alvo de ${shotTotal} chutes (${perGame(s.shots?.total, 1)} ch/j)` : 'Precisão de chute'}</span>
            </div>
          </div>

          <div class="stat-card-modern cyan">
            <div class="stat-card-header">
              <span>👟</span>
              <span>${isPerGame ? 'Média de Assist. / Jogo' : 'Assistências'}</span>
            </div>
            <div class="stat-card-main-val cyan">${fmt(s.goals?.assists)}</div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Total: ${s.goals?.assists ?? 0} assistências · Chave/j: ${perGame(s.passes?.key)}` : `Média: ${perGame(s.goals?.assists)} / j · Passes-Chave: ${s.passes?.key ?? 0}`}</span>
            </div>
          </div>
        `;
      }

      // Detalhamento das 2 seções inferiores específicas por posição
      let detailedSectionsHtml = "";

      if (isGK) {
        // Detalhes Goleiro
        detailedSectionsHtml = `
          <div class="player-metrics-grid">
            <div class="player-metrics-card">
              <div class="player-metrics-header defense">
                <span class="metrics-header-icon">🧤</span>
                <span class="metrics-header-title">Desempenho no Gol & Defesas ${isPerGame ? '(Por Jogo)' : ''}</span>
              </div>
              <div class="player-metrics-list">
                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🧤</span>
                    <span class="metric-label">Defesas Realizadas</span>
                  </div>
                  <span class="metric-val green">${fmt(s.goals?.saves)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🥅</span>
                    <span class="metric-label">Gols Sofridos</span>
                  </div>
                  <span class="metric-val gold">${fmt(s.goals?.conceded)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🛑</span>
                    <span class="metric-label">Pênaltis Defendidos</span>
                  </div>
                  <span class="metric-val">${s.penalty?.saved ?? 0}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🛡️</span>
                    <span class="metric-label">Duelos & Saídas Ganhas</span>
                  </div>
                  <span class="metric-val">${fmt(s.duels?.won)}</span>
                </div>
              </div>
            </div>

            <div class="player-metrics-card">
              <div class="player-metrics-header" style="background:linear-gradient(90deg, rgba(0,229,255,0.15), transparent);border-left:3px solid var(--cyan);">
                <span class="metrics-header-icon">⚽</span>
                <span class="metrics-header-title">Reposições & Disciplina ${isPerGame ? '(Por Jogo)' : ''}</span>
              </div>
              <div class="player-metrics-list">
                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🎯</span>
                    <span class="metric-label">Passes Totais</span>
                  </div>
                  <span class="metric-val">${fmt(s.passes?.total)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">📊</span>
                    <span class="metric-label">Precisão de Passes</span>
                  </div>
                  <span class="metric-val">${s.passes?.accuracy ? s.passes.accuracy + '%' : '-'}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🛡️</span>
                    <span class="metric-label">Faltas Sofridas</span>
                  </div>
                  <span class="metric-val">${fmt(s.fouls?.drawn)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🟨</span>
                    <span class="metric-label">Cartões Amarelos / Vermelhos</span>
                  </div>
                  <span class="metric-val" style="color:var(--gold);">
                    ${s.cards?.yellow ?? 0} <small style="color:var(--chalk-dim);">/</small> <span style="color:#EF4444;">${s.cards?.red ?? 0}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        `;
      } else if (isDefender) {
        // Detalhes Defensor
        detailedSectionsHtml = `
          <div class="player-metrics-grid">
            <div class="player-metrics-card">
              <div class="player-metrics-header defense">
                <span class="metrics-header-icon">🛡️</span>
                <span class="metrics-header-title">Desarmes, Cortes & Interceptações ${isPerGame ? '(Por Jogo)' : ''}</span>
              </div>
              <div class="player-metrics-list">
                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">⚔️</span>
                    <span class="metric-label">Desarmes Totais</span>
                  </div>
                  <span class="metric-val green">${fmt(s.tackles?.total)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🧤</span>
                    <span class="metric-label">Interceptações</span>
                  </div>
                  <span class="metric-val green">${fmt(s.tackles?.interceptions)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🧱</span>
                    <span class="metric-label">Bloqueios de Chute</span>
                  </div>
                  <span class="metric-val">${fmt(s.tackles?.blocks)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🏆</span>
                    <span class="metric-label">Duelos Vencidos</span>
                  </div>
                  <span class="metric-val gold">${fmt(s.duels?.won)}</span>
                </div>
              </div>
            </div>

            <div class="player-metrics-card">
              <div class="player-metrics-header" style="background:linear-gradient(90deg, rgba(0,229,255,0.15), transparent);border-left:3px solid var(--cyan);">
                <span class="metrics-header-icon">⚡</span>
                <span class="metrics-header-title">Construção, Apoio & Disciplina ${isPerGame ? '(Por Jogo)' : ''}</span>
              </div>
              <div class="player-metrics-list">
                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">⚽</span>
                    <span class="metric-label">Gols Marcados</span>
                  </div>
                  <span class="metric-val gold">${fmt(s.goals?.total)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🎯</span>
                    <span class="metric-label">Passes Totais</span>
                  </div>
                  <span class="metric-val">${fmt(s.passes?.total)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">👟</span>
                    <span class="metric-label">Passes-Chave (Apoio)</span>
                  </div>
                  <span class="metric-val">${fmt(s.passes?.key)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">⚠️</span>
                    <span class="metric-label">Faltas Cometidas</span>
                  </div>
                  <span class="metric-val" style="color:var(--gold);">${fmt(s.fouls?.committed)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🟨</span>
                    <span class="metric-label">Cartões Amarelos / Vermelhos</span>
                  </div>
                  <span class="metric-val" style="color:var(--gold);">
                    ${s.cards?.yellow ?? 0} <small style="color:var(--chalk-dim);">/</small> <span style="color:#EF4444;">${s.cards?.red ?? 0}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        `;
      } else if (isMidfielder) {
        // Detalhes Meio-Campista
        detailedSectionsHtml = `
          <div class="player-metrics-grid">
            <div class="player-metrics-card">
              <div class="player-metrics-header" style="background:linear-gradient(90deg, rgba(255,184,0,0.15), transparent);border-left:3px solid var(--gold);">
                <span class="metrics-header-icon">🧠</span>
                <span class="metrics-header-title">Criação & Transição Ofensiva ${isPerGame ? '(Por Jogo)' : ''}</span>
              </div>
              <div class="player-metrics-list">
                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">⚽</span>
                    <span class="metric-label">Gols Marcados</span>
                  </div>
                  <span class="metric-val gold">${fmt(s.goals?.total)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">👟</span>
                    <span class="metric-label">Passes-Chave (Key Passes)</span>
                  </div>
                  <span class="metric-val gold">${fmt(s.passes?.key)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🎁</span>
                    <span class="metric-label">Assistências para Gol</span>
                  </div>
                  <span class="metric-val green">${fmt(s.goals?.assists)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">⚡</span>
                    <span class="metric-label">Dribles Certos (1x1)</span>
                  </div>
                  <span class="metric-val">${fmt(s.dribbles?.success)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🎯</span>
                    <span class="metric-label">Chutes no Alvo</span>
                  </div>
                  <span class="metric-val">${fmt(s.shots?.on)}</span>
                </div>
              </div>
            </div>

            <div class="player-metrics-card">
              <div class="player-metrics-header defense">
                <span class="metrics-header-icon">🛡️</span>
                <span class="metrics-header-title">Contenção, Desarmes & Duelos ${isPerGame ? '(Por Jogo)' : ''}</span>
              </div>
              <div class="player-metrics-list">
                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">⚔️</span>
                    <span class="metric-label">Desarmes Totais</span>
                  </div>
                  <span class="metric-val green">${fmt(s.tackles?.total)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🧤</span>
                    <span class="metric-label">Interceptações</span>
                  </div>
                  <span class="metric-val green">${fmt(s.tackles?.interceptions)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🏆</span>
                    <span class="metric-label">Duelos Ganhos</span>
                  </div>
                  <span class="metric-val">${fmt(s.duels?.won)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🟨</span>
                    <span class="metric-label">Cartões Amarelos / Vermelhos</span>
                  </div>
                  <span class="metric-val" style="color:var(--gold);">
                    ${s.cards?.yellow ?? 0} <small style="color:var(--chalk-dim);">/</small> <span style="color:#EF4444;">${s.cards?.red ?? 0}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        `;
      } else {
        // Detalhes Atacante
        const shotTotal = s.shots?.total || 0;
        const convRate = shotTotal > 0 ? Math.round(((s.goals?.total || 0) / shotTotal) * 100) + '%' : '-';

        detailedSectionsHtml = `
          <div class="player-metrics-grid">
            <div class="player-metrics-card">
              <div class="player-metrics-header attack">
                <span class="metrics-header-icon">🔥</span>
                <span class="metrics-header-title">Finalizações & Faro de Gol ${isPerGame ? '(Por Jogo)' : ''}</span>
              </div>
              <div class="player-metrics-list">
                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">⚽</span>
                    <span class="metric-label">Gols Marcados</span>
                  </div>
                  <span class="metric-val gold">${fmt(s.goals?.total)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🎯</span>
                    <span class="metric-label">Chutes no Alvo</span>
                  </div>
                  <span class="metric-val gold">${fmt(s.shots?.on)} <small style="font-size:0.75rem;color:var(--chalk-dim);">(${fmt(s.shots?.total)} tot)</small></span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">📊</span>
                    <span class="metric-label">Conversão de Chutes</span>
                  </div>
                  <span class="metric-val green">${convRate}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🎖️</span>
                    <span class="metric-label">Pênaltis Sofridos</span>
                  </div>
                  <span class="metric-val">${fmt(s.penalty?.won)}</span>
                </div>
              </div>
            </div>

            <div class="player-metrics-card">
              <div class="player-metrics-header" style="background:linear-gradient(90deg, rgba(0,229,255,0.15), transparent);border-left:3px solid var(--cyan);">
                <span class="metrics-header-icon">⚡</span>
                <span class="metrics-header-title">Dribles, Criação & Participação ${isPerGame ? '(Por Jogo)' : ''}</span>
              </div>
              <div class="player-metrics-list">
                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">⚡</span>
                    <span class="metric-label">Dribles Certos (1x1)</span>
                  </div>
                  <span class="metric-val">${fmt(s.dribbles?.success)} <small style="font-size:0.75rem;color:var(--chalk-dim);">(${fmt(s.dribbles?.attempts)} tent)</small></span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">👟</span>
                    <span class="metric-label">Passes-Chave Criados</span>
                  </div>
                  <span class="metric-val">${fmt(s.passes?.key)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🛡️</span>
                    <span class="metric-label">Faltas Sofridas</span>
                  </div>
                  <span class="metric-val">${fmt(s.fouls?.drawn)}</span>
                </div>

                <div class="player-metric-row">
                  <div class="metric-info">
                    <span class="metric-icon">🏆</span>
                    <span class="metric-label">Duelos Físicos Ganhos</span>
                  </div>
                  <span class="metric-val">${fmt(s.duels?.won)}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      return `
        ${breadcrumbs([
          { label: "Ligas", href: "#/" },
          { label: s.team?.name || "Clube", href: `#/time/${s.team?.id || teamId}/${leagueId || 71}/${season || 2026}` },
          { label: p.name, href: "" }
        ])}

        <div class="player-hero">
          <div class="player-hero-main-row">
            <div class="player-hero-avatar-wrap">
              <img class="player-avatar-large" src="${p.photo}" alt="" data-image-fallback="hide">
            </div>
            <div class="player-hero-text">
              <p class="page-eyebrow">${escapeHtml(formatTeamName(s.team?.name || ""))} · ${escapeHtml(getSpecificPlayerRole(p, s))} ${s.games?.number ? `#${s.games.number}` : ''}</p>
              <h1 class="page-title">${escapeHtml(p.name)}</h1>
            </div>
            <div class="player-rating-badge">
              <span class="rating-num">${rating > 0 ? rating : '-'}</span>
              <span class="rating-label">Nota Média</span>
            </div>
          </div>
          <div class="player-hero-meta">
            <span>🎂 ${p.age ? p.age + ' anos' : '-'}</span>
            <span>📍 ${escapeHtml(p.nationality || '-')}</span>
            <span>📏 ${p.height || '-'}</span>
            <span>⚖️ ${p.weight || '-'}</span>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;background:var(--glass-bg);border:1px solid var(--glass-border);padding:12px 16px;border-radius:var(--radius);flex-wrap:wrap;gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);font-weight:700;">FILTRO DE COMPETIÇÃO:</span>
            <select id="player-comp-select" style="background:var(--pitch-card);border:1px solid var(--line-strong);color:var(--chalk);padding:6px 14px;border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:0.85rem;">
              ${compOptions}
            </select>
          </div>

          <div class="player-mode-btn-group">
            <button type="button" class="player-mode-btn ${!isPerGame ? 'active' : ''}" id="btn-player-mode-total">Geral</button>
            <button type="button" class="player-mode-btn ${isPerGame ? 'active' : ''}" id="btn-player-mode-per-game">Por jogo</button>
          </div>
        </div>

        <h2 class="section-title">${isPerGame ? 'Estatísticas por Jogo' : 'Estatísticas na Temporada'} (${s.league?.id === 'TOTAL' ? 'Todas as Competições' : escapeHtml(formatTeamName(s.league?.name || 'Geral'))})</h2>
        <div class="stat-grid">
          ${topCardsHtml}
        </div>

        ${detailedSectionsHtml}
      `;
    }

    function updatePlayerView() {
      content.innerHTML = renderPlayerStatsView(allOptions[currentSelectedIdx], currentSelectedIdx, currentMode);

      const compSelect = document.getElementById("player-comp-select");
      if (compSelect) {
        compSelect.addEventListener("change", (e) => {
          currentSelectedIdx = Number(e.target.value);
          updatePlayerView();
        });
      }

      const btnTotal = document.getElementById("btn-player-mode-total");
      const btnPerGame = document.getElementById("btn-player-mode-per-game");

      if (btnTotal) {
        btnTotal.addEventListener("click", () => {
          if (currentMode !== "total") {
            currentMode = "total";
            updatePlayerView();
          }
        });
      }

      if (btnPerGame) {
        btnPerGame.addEventListener("click", () => {
          if (currentMode !== "per_game") {
            currentMode = "per_game";
            updatePlayerView();
          }
        });
      }
    }

    updatePlayerView();
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

// ============================================================
// View: Time — Estatísticas
// ============================================================
