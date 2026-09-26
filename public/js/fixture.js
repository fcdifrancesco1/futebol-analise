async function renderFixture(fixtureId, isSilentRefresh = false) {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  // Se o usuário não está mais nesta partida, interrompe
  if (location.hash !== `#/jogo/${fixtureId}`) {
    if (state.liveTimer) {
      clearInterval(state.liveTimer);
      state.liveTimer = null;
    }
    return;
  }

  if (!isSilentRefresh) {
    if (state.liveTimer) {
      clearInterval(state.liveTimer);
      state.liveTimer = null;
    }
    app.innerHTML = `<div id="fixture-content">${skeletonTable()}</div>`;
  }
  const content = document.getElementById("fixture-content") || app;

  try {
    const [fxResponse, eventsRes, statsRes, lineupsRes, predictionsRes, playersRes] = await Promise.allSettled([
      apiGet("fixtures", { id: fixtureId }, 0.5),
      apiGet("fixtures/events", { fixture: fixtureId }, 0.5),
      apiGet("fixtures/statistics", { fixture: fixtureId }, 0.5),
      apiGet("fixtures/lineups", { fixture: fixtureId }, 30),
      apiGet("predictions", { fixture: fixtureId }, 60),
      apiGet("fixtures/players", { fixture: fixtureId }, 15)
    ]);

    // Verifica novamente se o usuário ainda está nesta partida após as requisições assíncronas
    if (location.hash !== `#/jogo/${fixtureId}`) {
      return;
    }

    const fx = fxResponse.status === "fulfilled" ? fxResponse.value?.[0] : null;
    if (!fx) {
      content.innerHTML = errorBox("Jogo não encontrado ou indisponível.");
      return;
    }

    // Unifica eventos de fixtures/events e fx.events (da chamada fixtures?id=...), evitando perdas por delay de sincronização da API
    const apiEvents = eventsRes.status === "fulfilled" && Array.isArray(eventsRes.value) ? eventsRes.value : [];
    const fxEvents = Array.isArray(fx.events) ? fx.events : [];
    const allRawEvents = [...apiEvents, ...fxEvents];
    const seenEvents = new Set();
    const events = [];
    for (const e of allRawEvents) {
      if (!e) continue;
      const key = `${e.time?.elapsed || 0}_${e.time?.extra || 0}_${e.team?.id || e.team?.name || ''}_${e.player?.id || e.player?.name || ''}_${e.type || ''}_${e.detail || ''}`;
      if (!seenEvents.has(key)) {
        seenEvents.add(key);
        events.push(e);
      }
    }
    events.sort((a, b) => ((a.time?.elapsed || 0) + (a.time?.extra || 0) / 100) - ((b.time?.elapsed || 0) + (b.time?.extra || 0) / 100));

    const statsArr = statsRes.status === "fulfilled" ? (statsRes.value || []) : [];
    const lineupsArr = lineupsRes.status === "fulfilled" ? (lineupsRes.value || []) : [];
    const pred = predictionsRes.status === "fulfilled" ? predictionsRes.value?.[0] : null;
    const fixturePlayersArr = playersRes.status === "fulfilled" ? (playersRes.value || []) : [];

    const { playersMap: fixturePlayersMap, mvpId: mvpPlayerId, melhorNota: highestRating } = 
      PlayerRatingEngine.processarNotasPartida(fixturePlayersArr, fx, events);

    const date = new Date(fx.fixture.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const time = new Date(fx.fixture.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    
    const statusInfo = getMatchStatusCategory(fx.fixture);
    const isLive = statusInfo.isLive;
    const isFinished = statusInfo.isFinished;

    const liveTimeFormatted = formatLiveMatchTime(fx.fixture.status, events);
    let statusText = escapeHtml(fx.fixture.status.long || "");
    if (isLive) {
      statusText = `<span style="color:var(--gold);font-weight:700;">● AO VIVO ${liveTimeFormatted} (${escapeHtml(fx.fixture.status.long || "")})</span>`;
    } else if (statusInfo.isStaleLive) {
      statusText = `<span style="color:var(--chalk-dim);font-weight:600;">Partida Encerrada (${fx.fixture.status.elapsed}')</span>`;
    } else if (statusInfo.isPostponed) {
      statusText = `<span style="color:#F59E0B;font-weight:700;">● ${statusInfo.label}</span>`;
    }

    const isGoalForTeam = (e, targetTeam, otherTeam) => {
      if (e.type !== "Goal" || e.detail === "Missed Penalty") return false;
      const isOwnGoal = e.detail === "Own Goal" || (e.comments && /own goal/i.test(e.comments));
      const targetId = targetTeam?.id != null ? String(targetTeam.id) : "";
      const otherId = otherTeam?.id != null ? String(otherTeam.id) : "";
      const eventTeamId = e.team?.id != null ? String(e.team.id) : "";
      const eventTeamName = String(e.team?.name || "").toLowerCase().trim();
      const targetName = String(targetTeam?.name || "").toLowerCase().trim();
      const otherName = String(otherTeam?.name || "").toLowerCase().trim();

      const isTargetTeam = (targetId && eventTeamId === targetId) || (targetName && eventTeamName === targetName);
      const isOtherTeam = (otherId && eventTeamId === otherId) || (otherName && eventTeamName === otherName);

      // Gol contra beneficia o time adversário no placar
      if (isOwnGoal) return isOtherTeam;
      return isTargetTeam;
    };

    let homeGoals = events.filter(e => isGoalForTeam(e, fx.teams.home, fx.teams.away));
    let awayGoals = events.filter(e => isGoalForTeam(e, fx.teams.away, fx.teams.home));

    // Se o placar da partida tiver mais gols que os eventos registrados (delay ou súmula pendente da API)
    const recoverMissingGoals = (currentGoals, team, fixturePlayers, expectedGoals) => {
      const needed = Number(expectedGoals || 0);
      if (needed <= currentGoals.length) return currentGoals;
      const teamId = team?.id != null ? String(team.id) : "";
      const teamName = String(team?.name || "").toLowerCase().trim();

      const teamBlock = (fixturePlayers || []).find(b => 
        (teamId && String(b.team?.id || "") === teamId) || 
        (teamName && String(b.team?.name || "").toLowerCase().trim() === teamName)
      );

      const existingNames = new Set(currentGoals.map(g => String(g.player?.name || "").toLowerCase().trim()));
      const result = [...currentGoals];

      if (teamBlock && Array.isArray(teamBlock.players)) {
        for (const p of teamBlock.players) {
          const stats = p.statistics?.[0] || {};
          const goalsScored = Number(stats.goals?.total || 0);
          const pName = p.player?.name || "";
          if (goalsScored > 0 && pName && !existingNames.has(pName.toLowerCase().trim())) {
            for (let i = 0; i < goalsScored && result.length < needed; i++) {
              result.push({
                type: "Goal",
                detail: "Normal Goal",
                player: { id: p.player?.id, name: pName },
                time: { elapsed: "-" },
                isRecovered: true
              });
            }
          }
        }
      }

      while (result.length < needed) {
        result.push({
          type: "Goal",
          detail: "Normal Goal",
          player: { name: "Gol (Aguardando súmula da API)" },
          time: { elapsed: "-" },
          isPendingSummary: true
        });
      }

      return result;
    };

    homeGoals = recoverMissingGoals(homeGoals, fx.teams.home, fixturePlayersArr, fx.goals?.home);
    awayGoals = recoverMissingGoals(awayGoals, fx.teams.away, fixturePlayersArr, fx.goals?.away);

    // Buscar estatísticas pré-jogo se a partida ainda não começou
    let preMatchSection = "";
    if (statsArr.length < 2) {
      try {
        const [statsA, statsB] = await Promise.all([
          apiGet("teams/statistics", { league: fx.league.id, season: fx.league.season, team: fx.teams.home.id }, 30),
          apiGet("teams/statistics", { league: fx.league.id, season: fx.league.season, team: fx.teams.away.id }, 30)
        ]);
        if (statsA?.team && statsB?.team) {
          preMatchSection = renderPreMatchStatsComparison(statsA, statsB, fx);
        }
      } catch { /* fallback */ }
    }

    // Confirma novamente antes de renderizar no DOM
    if (location.hash !== `#/jogo/${fixtureId}`) {
      return;
    }

    const isFavFixture = state.favoriteFixtures.some(f => f.id === fixtureId);

    content.innerHTML = `
      ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: fx.league.name, href: `#/liga/${fx.league.id}/${fx.league.season}` }, { label: "Partida", href: "" }])}
      
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <p class="page-eyebrow" style="margin:0;">${escapeHtml(fx.league.name)} · ${formatRoundName(fx.league.round)} · ${date} · ${time}${fx.fixture.venue?.name ? " · " + escapeHtml(fx.fixture.venue.name) : ""}</p>
        <div style="display:flex;align-items:center;gap:10px;margin-left:auto;flex-wrap:wrap;">
          <button class="day-nav-btn day-refresh-btn" id="btn-refresh-fixture" title="Atualizar dados e eventos agora" style="padding:6px 12px;font-size:0.82rem;">
            <span class="refresh-spin-icon">🔄</span> Atualizar
          </button>
          <button class="btn ${isFavFixture ? 'active-fav' : 'ghost'} small" id="btn-toggle-fixture-fav" style="display:inline-flex;align-items:center;gap:6px;">
            ${isFavFixture ? '🔔 Alertas Ativados (Jogo)' : '🔔 Seguir Jogo (Gols & Escalações)'}
          </button>
          ${isLive ? `
            <div style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,0.3);padding:4px 12px;border-radius:999px;border:1px solid var(--gold-soft);">
              <span class="pulse-dot"></span>
              <span style="font-family:var(--font-mono);font-size:0.72rem;color:var(--chalk-dim);">Auto-refresh (30s)</span>
              <div style="width:40px;height:4px;background:rgba(255,255,255,0.1);border-radius:999px;overflow:hidden;">
                <div style="height:100%;background:var(--gold);width:100%;" id="live-progress-bar"></div>
              </div>
            </div>
          ` : ""}
        </div>
      </div>

      <!-- Placar Principal Simétrico -->
      <div class="fixture-hero">
        <div class="fixture-hero-main">
          <div class="hero-team-col home">
            <img src="${fx.teams.home.logo}" alt="" class="hero-team-logo" loading="lazy">
            <span class="hero-team-name">${escapeHtml(fx.teams.home.name)}</span>
          </div>

          <div class="hero-score-col">
            <div class="hero-score-numbers">${fx.goals.home ?? "-"} : ${fx.goals.away ?? "-"}</div>
            <div class="hero-status-pill">${statusText}</div>
            ${isFinished ? `
              <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(`Melhores Momentos ${fx.teams.home.name} x ${fx.teams.away.name} ${fx.league?.name || ''}`)}" 
                 target="_blank" 
                 rel="noopener noreferrer" 
                 class="btn-highlights-hero" 
                 title="Assistir aos Melhores Momentos da partida no YouTube">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block;vertical-align:middle;margin-right:4px;">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Melhores Momentos
              </a>
            ` : ""}
          </div>

          <div class="hero-team-col away">
            <img src="${fx.teams.away.logo}" alt="" class="hero-team-logo" loading="lazy">
            <span class="hero-team-name">${escapeHtml(fx.teams.away.name)}</span>
          </div>
        </div>

        ${(homeGoals.length || awayGoals.length) ? `
          <div class="hero-goals-section">
            <div class="hero-goals-col home">
              ${homeGoals.map(g => {
                const playerName = g.player?.name || "Gol";
                const isOwnGoal = g.detail === 'Own Goal';
                const isPen = g.detail === 'Penalty';
                const rawAssist = g.assist?.name;
                const hasAssist = !isOwnGoal && !isPen && rawAssist && String(rawAssist).trim() && String(rawAssist).trim().toLowerCase() !== "null" && String(rawAssist).trim().toLowerCase() !== playerName.toLowerCase();
                const assistHtml = hasAssist ? ` <span class="assist-name">(${escapeHtml(String(rawAssist).trim())})</span>` : '';
                const hasTime = g.time && g.time.elapsed != null && g.time.elapsed !== "-";
                const timeStr = hasTime ? `${g.time.elapsed}${g.time.extra ? `+${g.time.extra}` : ""}'` : "";
                const tagStr = `${timeStr}${isPen ? ' (P)' : isOwnGoal ? ' (GC)' : ''}`;

                return `
                  <div class="hero-goal-item">
                    <span>⚽</span>
                    <span class="player-name"${g.isPendingSummary ? ' style="opacity:0.85;font-style:italic;"' : ''}>${escapeHtml(playerName)}${assistHtml}</span>
                    ${tagStr ? `<span class="time">${escapeHtml(tagStr)}</span>` : ''}
                  </div>
                `;
              }).join("")}
            </div>

            <div class="hero-goals-col away">
              ${awayGoals.map(g => {
                const playerName = g.player?.name || "Gol";
                const isOwnGoal = g.detail === 'Own Goal';
                const isPen = g.detail === 'Penalty';
                const rawAssist = g.assist?.name;
                const hasAssist = !isOwnGoal && !isPen && rawAssist && String(rawAssist).trim() && String(rawAssist).trim().toLowerCase() !== "null" && String(rawAssist).trim().toLowerCase() !== playerName.toLowerCase();
                const assistHtml = hasAssist ? ` <span class="assist-name">(${escapeHtml(String(rawAssist).trim())})</span>` : '';
                const hasTime = g.time && g.time.elapsed != null && g.time.elapsed !== "-";
                const timeStr = hasTime ? `${g.time.elapsed}${g.time.extra ? `+${g.time.extra}` : ""}'` : "";
                const tagStr = `${timeStr}${isPen ? ' (P)' : isOwnGoal ? ' (GC)' : ''}`;

                return `
                  <div class="hero-goal-item">
                    <span>⚽</span>
                    <span class="player-name"${g.isPendingSummary ? ' style="opacity:0.85;font-style:italic;"' : ''}>${escapeHtml(playerName)}${assistHtml}</span>
                    ${tagStr ? `<span class="time">${escapeHtml(tagStr)}</span>` : ''}
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        ` : ""}
      </div>

      <!-- Estatísticas da Partida (Pré-Jogo ou Ao Vivo) -->
      <div id="fixture-stats-section" style="margin-bottom:24px;">
        ${statsArr.length >= 2 ? renderLiveMatchStats(statsArr, fx) : (preMatchSection || `
          <div class="card" style="text-align:center;padding:24px;color:var(--chalk-dim);">
            <p style="margin:0;">Estatísticas detalhadas da partida serão disponibilizadas assim que a bola rolar.</p>
          </div>
        `)}
      </div>

      <!-- Banner de Escalação do Usuário -->
      ${renderMatchBroadcastGuide(fx)}

      <!-- Campo Tático 2D -->
      <div id="fixture-lineups-section" style="margin-bottom:24px;">
        ${renderFixtureLineups(lineupsArr, events, fx.league.id, fx.league.season, fixturePlayersMap, mvpPlayerId, fx)}
      </div>

      <!-- Previsão Oficial -->
      ${pred ? `
        <div style="margin-bottom:24px;">
          <h2 class="section-title">Previsão Oficial da API</h2>
          ${(() => {
            const pct = pred.predictions.percent;
            const probA = parseInt(pct.home);
            const probB = parseInt(pct.away);
            const probDraw = 100 - probA - probB;
            return renderPitchBar(fx.teams.home, fx.teams.away, { probA, probB, probDraw }, "provider");
          })()}
        </div>
      ` : ""}

      <!-- Linha do Tempo -->
      <div id="fixture-events-section">
        ${renderFixtureEvents(events, fx, isFinished)}
      </div>
    `;

    const btnRefresh = document.getElementById("btn-refresh-fixture");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", async () => {
        btnRefresh.classList.add("spinning");
        btnRefresh.disabled = true;
        try {
          footballClient.invalidate("fixtures", { id: fixtureId });
          footballClient.invalidate("fixtures/events", { fixture: fixtureId });
          footballClient.invalidate("fixtures/players", { fixture: fixtureId });
          footballClient.invalidate("fixtures/statistics", { fixture: fixtureId });
          footballClient.invalidate("fixtures/lineups", { fixture: fixtureId });
          await renderFixture(fixtureId, true);
          toast("Dados da partida atualizados com a API!", false);
        } catch (err) {
          toast("Erro ao atualizar: " + (err.message || "Tente novamente"), true);
        } finally {
          btnRefresh.classList.remove("spinning");
          btnRefresh.disabled = false;
        }
      });
    }

    const btnFav = document.getElementById("btn-toggle-fixture-fav");
    if (btnFav) {
      btnFav.addEventListener("click", async () => {
        const previousFavorites = state.favoriteFixtures.slice();
        btnFav.disabled = true;
        try {
        const isFav = state.favoriteFixtures.some(f => f.id === fixtureId);
        if (isFav) {
          state.favoriteFixtures = state.favoriteFixtures.filter(f => f.id !== fixtureId);
          await NotificationManager.syncPreferences().catch(err => {
            console.warn("Preferências locais salvas; falha na sincronização remota:", err);
          });
          await NotificationManager.updateBellUI();
          toast(`Você deixou de seguir os alertas de ${fx.teams.home.name} x ${fx.teams.away.name}.`, false);
        } else {
          const isSub = await NotificationManager.isSubscribed();
          const pushOk = isSub ? true : await NotificationManager.subscribe({ silent: true });
          state.favoriteFixtures.push({
            id: fixtureId,
            home: { id: fx.teams.home.id, name: fx.teams.home.name, logo: fx.teams.home.logo },
            away: { id: fx.teams.away.id, name: fx.teams.away.name, logo: fx.teams.away.logo },
            league: { id: fx.league.id, name: fx.league.name },
            date: fx.fixture.date
          });
          await NotificationManager.syncPreferences().catch(err => {
            console.warn("Partida favoritada localmente; falha na sincronização remota:", err);
          });
          await NotificationManager.updateBellUI();
          if (pushOk) {
            toast(`🔔 Alertas ativados para ${fx.teams.home.name} x ${fx.teams.away.name}! Você receberá avisos de Escalações, Gols e Lances.`, false);
          } else {
            toast(`⭐ Partida adicionada aos seus jogos! Alertas Push do navegador indisponíveis no momento.`, false);
          }
        }
        renderFixture(fixtureId, true);
        } catch (err) {
          state.favoriteFixtures = previousFavorites;
          toast("Não foi possível salvar alertas: " + err.message);
        } finally { btnFav.disabled = false; }
      });
    }

    // Event listeners para abrir modal de nota e mapa de calor ao clicar no jogador
    document.querySelectorAll(".btn-open-match-player-modal").forEach(el => {
      el.addEventListener("click", () => {
        const pid = Number(el.dataset.playerId);
        const tid = Number(el.dataset.teamId);
        const pData = fixturePlayersMap[pid];
        const teamObj = fx.teams.home.id === tid ? fx.teams.home : fx.teams.away;
        
        let pObj = pData?.player;
        if (!pObj) {
          // Busca nos lineups
          lineupsArr.forEach(l => {
            const starter = (l.startXI || []).find(x => x.player?.id === pid);
            if (starter) pObj = starter.player;
            const sub = (l.substitutes || []).find(x => x.player?.id === pid);
            if (sub) pObj = sub.player;
          });
        }

        openPlayerMatchModal(pid, tid, fx.league.id, fx.league.season, pData, pObj, teamObj, fx);
      });
    });

    if (isLive) {
      startLiveAutoRefresh(() => renderFixture(fixtureId, true));
    }
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

// Estatísticas Pré-Jogo baseadas na campanha dos times no campeonato
function renderPreMatchStatsComparison(statsA, statsB, fx) {
  const pA = statsA.fixtures.played.total || 1;
  const pB = statsB.fixtures.played.total || 1;

  const winPctA = Math.round((statsA.fixtures.wins.total / pA) * 100);
  const winPctB = Math.round((statsB.fixtures.wins.total / pB) * 100);

  const gfAvgA = parseFloat(statsA.goals.for.average.total) || 0;
  const gfAvgB = parseFloat(statsB.goals.for.average.total) || 0;
  const gaAvgA = parseFloat(statsA.goals.against.average.total) || 0;
  const gaAvgB = parseFloat(statsB.goals.against.average.total) || 0;

  const metrics = [
    { label: "Aproveitamento no Campeonato", valA: `${winPctA}%`, valB: `${winPctB}%`, numA: winPctA, numB: winPctB, higherWins: true },
    { label: "Média de Gols Pró / Jogo", valA: gfAvgA.toFixed(2), valB: gfAvgB.toFixed(2), numA: gfAvgA, numB: gfAvgB, higherWins: true },
    { label: "Média de Gols Sofridos / Jogo", valA: gaAvgA.toFixed(2), valB: gaAvgB.toFixed(2), numA: gaAvgA, numB: gaAvgB, higherWins: false },
    { label: "Jogos sem Sofrer Gols", valA: statsA.clean_sheet.total, valB: statsB.clean_sheet.total, numA: statsA.clean_sheet.total, numB: statsB.clean_sheet.total, higherWins: true },
    { label: "Total de Vitórias", valA: statsA.fixtures.wins.total, valB: statsB.fixtures.wins.total, numA: statsA.fixtures.wins.total, numB: statsB.fixtures.wins.total, higherWins: true }
  ];

  return `
    <h2 class="section-title">Desempenho dos Times no Campeonato (Pré-Jogo)</h2>
    <div class="card" style="padding:16px;">
      <div class="fifa-stats-center" style="background:transparent;border:none;">
        ${metrics.map(m => {
          const max = Math.max(m.numA, m.numB, 1);
          const aWins = m.higherWins ? m.numA > m.numB : m.numA < m.numB;
          const bWins = m.higherWins ? m.numB > m.numA : m.numB < m.numA;

          return `
            <div class="fifa-stat-row">
              <div class="fifa-val a ${aWins ? 'highlight' : ''}">
                <span>${m.valA}</span>
              </div>
              <div class="fifa-label">${escapeHtml(m.label)}</div>
              <div class="fifa-val b ${bWins ? 'highlight' : ''}">
                <span>${m.valB}</span>
              </div>
            </div>
            <div style="position:relative;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin:0 12px 8px;">
              <div style="position:absolute;right:50%;height:100%;background:var(--gold);width:${(m.numA / max) * 50}%;"></div>
              <div style="position:absolute;left:50%;height:100%;background:var(--terracotta);width:${(m.numB / max) * 50}%;"></div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderLiveMatchStats(statsArr, fx) {
  if (!statsArr || statsArr.length < 2) return "";

  const [homeStats, awayStats] = statsArr;
  const statMap = {
    "Ball Possession": "Posse de Bola",
    "Total Shots": "Finalizações Totais",
    "Shots on Goal": "Chutes no Gol",
    "Shots off Goal": "Chutes para Fora",
    "Blocked Shots": "Chutes Bloqueados",
    "Shots insidebox": "Finalizações na Área",
    "Shots outsidebox": "Finalizações Fora da Área",
    "Corner Kicks": "Escanteios",
    "Offsides": "Impedimentos",
    "Fouls": "Faltas Cometidas",
    "Yellow Cards": "Cartões Amarelos",
    "Red Cards": "Cartões Vermelhos",
    "Goalkeeper Saves": "Defesas do Goleiro",
    "Total passes": "Passes Totais",
    "Passes accurate": "Passes Certos",
    "Passes %": "Precisão de Passe"
  };

  const filteredStats = homeStats.statistics.filter((s, i) => {
    const rawLabel = String(s.type || "").trim();
    if (rawLabel === "goals_prevented") return false;
    if (rawLabel === "expected_goals") return false;
    if (!statMap[rawLabel]) return false;
    
    let va = s.value;
    let vb = awayStats.statistics[i]?.value;
    if (va === null && vb === null) return false;
    return true;
  });

  if (!filteredStats.length) return "";

  const rows = filteredStats.map((s) => {
    const origIdx = homeStats.statistics.indexOf(s);
    const rawLabel = s.type;
    const label = statMap[rawLabel] || rawLabel;
    let va = s.value ?? 0;
    let vb = awayStats.statistics[origIdx]?.value ?? 0;

    let numA = parseFloat(String(va).replace("%", "")) || 0;
    let numB = parseFloat(String(vb).replace("%", "")) || 0;
    let max = Math.max(numA, numB, 1);

    const aWins = numA > numB;
    const bWins = numB > numA;

    return `
      <div class="fifa-stat-row">
        <div class="fifa-val a ${aWins ? 'highlight' : ''}">
          <span>${va}</span>
        </div>
        <div class="fifa-label">${escapeHtml(label)}</div>
        <div class="fifa-val b ${bWins ? 'highlight' : ''}">
          <span>${vb}</span>
        </div>
      </div>
      <div style="position:relative;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin:0 12px 6px;">
        <div style="position:absolute;right:50%;height:100%;background:var(--gold);width:${(numA / max) * 50}%;"></div>
        <div style="position:absolute;left:50%;height:100%;background:var(--terracotta);width:${(numB / max) * 50}%;"></div>
      </div>
    `;
  }).join("");

  return `
    <h2 class="section-title">Estatísticas do Jogo em Tempo Real</h2>
    <div class="card" style="padding:14px 10px;">
      <div class="fifa-stats-center" style="background:transparent;border:none;">
        ${rows}
      </div>
    </div>
  `;
}


// ============================================================
// Modal de Desempenho do Jogador na Partida & Mapa de Calor
// ============================================================

function openPlayerMatchModal(playerId, teamId, leagueId, season, pData, pObj, teamObj, fx) {
  let backdrop = document.getElementById("player-match-modal-backdrop");
  if (backdrop) backdrop.remove();

  backdrop = document.createElement("div");
  backdrop.id = "player-match-modal-backdrop";
  backdrop.className = "player-match-modal-backdrop";

  const p = pObj || pData?.player || { id: playerId, name: "Jogador", number: "-" };
  const team = teamObj || { id: teamId, name: "Clube", logo: "" };
  const st = pData?.statistics?.[0] || {};
  const game = st.games || {};
  const ratingStr = pData?.ratingFinal || game.rating || "-";
  const ratingNum = parseFloat(ratingStr || "0");
  const isMVP = (ratingNum >= 7.5);
  const position = game.position || p.pos || "M";
  const minutes = game.minutes ?? "-";
  const detalhe = pData?.detalheNota || null;

  const shotsOn = st.shots?.on ?? 0;
  const shotsTotal = st.shots?.total ?? 0;
  const goals = st.goals?.total ?? 0;
  const assists = st.goals?.assists ?? 0;
  const passesTotal = st.passes?.total ?? 0;
  const passAcc = st.passes?.accuracy ?? "-";
  const keyPasses = st.passes?.key ?? 0;
  const tackles = st.tackles?.total ?? 0;
  const blocks = st.tackles?.blocks ?? 0;
  const interceptions = st.tackles?.interceptions ?? 0;
  const dribblesSuccess = st.dribbles?.success ?? 0;
  const dribblesTotal = st.dribbles?.attempts ?? 0;
  const duelsWon = st.duels?.won ?? 0;
  const duelsTotal = st.duels?.total ?? 0;
  const foulsDrawn = st.fouls?.drawn ?? 0;
  const foulsCommitted = st.fouls?.committed ?? 0;
  const yellowCards = st.cards?.yellow ?? 0;
  const redCards = st.cards?.red ?? 0;

  const ratingClass = ratingNum >= 7.5 ? "rating-high" : ratingNum >= 6.5 ? "rating-med" : ratingNum > 0 ? "rating-low" : "";

  backdrop.innerHTML = `
    <div class="player-match-modal-card">
      <div class="player-match-header">
        <div style="display:flex;align-items:center;gap:12px;">
          <img src="https://media.api-sports.io/football/players/${p.id}.png" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);" data-image-fallback="player">
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:var(--chalk);">${escapeHtml(p.name)}</h3>
              <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);font-weight:700;">#${p.number ?? "-"}</span>
            </div>
            <div style="font-size:0.78rem;color:var(--chalk-dim);margin-top:2px;">
              ${escapeHtml(team.name)} · ${position === 'G' ? 'Goleiro' : position === 'D' ? 'Defensor' : position === 'M' ? 'Meio-campista' : 'Atacante'} · ${minutes}' jogados
            </div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;">
          ${ratingNum > 0 ? `
            <div class="player-match-rating-circle ${ratingClass}" title="Nota heurística FutStats, não calibrada">
              
              <span>${ratingStr}</span>
            </div>
          ` : ''}
          <button id="btn-close-player-match-modal" style="background:none;border:none;color:var(--chalk);font-size:1.3rem;cursor:pointer;padding:4px;">✕</button>
        </div>
      </div>

      <p class="data-disclaimer">Notas calculadas pelo FutStats são heurísticas não calibradas. Quando não há minutos suficientes, a nota disponível vem do provedor.</p>
      <!-- Mapa de Calor -->
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);font-weight:700;display:flex;align-items:center;gap:6px;">
            🔥 SIMULAÇÃO DE MAPA DE CALOR
          </span>
          <span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--cyan);">Ataque ➔</span>
        </div>
        <div class="heatmap-canvas-container">
          <p class="data-disclaimer">Simulação ilustrativa por posição e estatísticas; não representa coordenadas reais de movimentação.</p>
          <canvas aria-label="Simulação ilustrativa do posicionamento; sem rastreamento real" id="player-match-heatmap-canvas" class="heatmap-canvas" width="480" height="220"></canvas>
        </div>
      </div>

      <!-- Decomposição da Nota Tática -->
      ${detalhe && detalhe.motivo !== 'minutos_insuficientes' ? `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);font-weight:700;display:flex;align-items:center;gap:6px;">
              🎯 NOTA HEURÍSTICA FUTSTATS
            </span>
            <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">
              Base: 6.0 · Nota: <strong style="color:${ratingNum >= 7.5 ? 'var(--emerald)' : ratingNum >= 6.5 ? 'var(--gold)' : 'var(--terracotta)'};font-size:0.9rem;">${ratingStr}</strong>
            </span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px;font-size:0.75rem;">
            <div style="background:rgba(0,0,0,0.25);padding:6px 10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--chalk-dim);">⚡ Lances Decisivos:</span>
              <span style="color:${detalhe.discreto >= 0 ? 'var(--emerald)' : 'var(--terracotta)'};font-family:var(--font-mono);font-weight:700;">${detalhe.discreto >= 0 ? '+' : ''}${detalhe.discreto.toFixed(2)}</span>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:6px 10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--chalk-dim);">🏃 Volume & Duelos:</span>
              <span style="color:${detalhe.volume >= 0 ? 'var(--emerald)' : 'var(--terracotta)'};font-family:var(--font-mono);font-weight:700;">${detalhe.volume >= 0 ? '+' : ''}${detalhe.volume.toFixed(2)}</span>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:6px 10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--chalk-dim);">📐 Impacto de Passe:</span>
              <span style="color:${detalhe.passe >= 0 ? 'var(--emerald)' : 'var(--terracotta)'};font-family:var(--font-mono);font-weight:700;">${detalhe.passe >= 0 ? '+' : ''}${detalhe.passe.toFixed(2)}</span>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:6px 10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--chalk-dim);">🛡️ Contexto Coletivo:</span>
              <span style="color:${detalhe.contexto >= 0 ? 'var(--emerald)' : 'var(--terracotta)'};font-family:var(--font-mono);font-weight:700;">${detalhe.contexto >= 0 ? '+' : ''}${detalhe.contexto.toFixed(2)}</span>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Grade de Estatísticas do Jogo -->
      <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);font-weight:700;display:block;margin-bottom:10px;">
        📊 ESTATÍSTICAS NESTE CONFRONTO:
      </span>
      <div class="match-stat-chip-grid">
        <div class="match-stat-chip">
          <span class="match-stat-chip-label">⚽ Gols</span>
          <span class="match-stat-chip-val" style="color:#10B981;">${goals}</span>
        </div>
        <div class="match-stat-chip">
          <span class="match-stat-chip-label">👟 Assistências</span>
          <span class="match-stat-chip-val" style="color:var(--cyan);">${assists}</span>
        </div>
        <div class="match-stat-chip">
          <span class="match-stat-chip-label">🎯 Chutes (No Gol)</span>
          <span class="match-stat-chip-val">${shotsOn} / ${shotsTotal}</span>
        </div>
        <div class="match-stat-chip">
          <span class="match-stat-chip-label">📐 Passes (Precisão)</span>
          <span class="match-stat-chip-val">${passAcc ? passAcc + '%' : passesTotal}</span>
        </div>
        <div class="match-stat-chip">
          <span class="match-stat-chip-label">🔑 Passes Decisivos</span>
          <span class="match-stat-chip-val">${keyPasses}</span>
        </div>
        <div class="match-stat-chip">
          <span class="match-stat-chip-label">⚡ Dribles Certos</span>
          <span class="match-stat-chip-val">${dribblesSuccess} / ${dribblesTotal}</span>
        </div>
        <div class="match-stat-chip">
          <span class="match-stat-chip-label">🛡️ Desarmes / Intercep.</span>
          <span class="match-stat-chip-val">${tackles + interceptions}</span>
        </div>
        <div class="match-stat-chip">
          <span class="match-stat-chip-label">⚔️ Duelos Ganhos</span>
          <span class="match-stat-chip-val">${duelsWon} / ${duelsTotal}</span>
        </div>
        <div class="match-stat-chip">
          <span class="match-stat-chip-label">🟨 Cartões</span>
          <span class="match-stat-chip-val">${yellowCards ? `🟨 ${yellowCards}` : '-'} ${redCards ? `🟥 ${redCards}` : ''}</span>
        </div>
      </div>

      <!-- Botão para perfil completo -->
      <a class="btn primary small" href="#/jogador/${p.id}/${team.id}/${leagueId}/${season}" style="text-align:center;font-weight:700;margin-top:6px;">
        Ver Perfil e Histórico Completo do Atleta →
      </a>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Fechar
  document.getElementById("btn-close-player-match-modal")?.addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  // Renderizar o Canvas do Mapa de Calor
  const canvas = document.getElementById("player-match-heatmap-canvas");
  if (canvas) {
    drawPlayerHeatmap(canvas, position, st, p);
  }
}

function drawPlayerHeatmap(canvas, position, st, p) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  // 1. Fundo do Campo de Futebol
  ctx.fillStyle = "#0A2238";
  ctx.fillRect(0, 0, w, h);

  // Faixas de grama sutis
  const stripeWidth = w / 10;
  for (let i = 0; i < 10; i += 2) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
    ctx.fillRect(i * stripeWidth, 0, stripeWidth, h);
  }

  // 2. Linhas do Campo (Teal suave)
  ctx.strokeStyle = "rgba(0, 229, 255, 0.35)";
  ctx.lineWidth = 1.5;

  // Borda externa
  ctx.strokeRect(16, 12, w - 32, h - 24);

  // Linha de meio-campo
  ctx.beginPath();
  ctx.moveTo(w / 2, 12);
  ctx.lineTo(w / 2, h - 12);
  ctx.stroke();

  // Círculo central
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 38, 0, Math.PI * 2);
  ctx.stroke();

  // Ponto central
  ctx.fillStyle = "rgba(0, 229, 255, 0.5)";
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Grande Área Esquerda (Defesa)
  ctx.strokeRect(16, h / 2 - 50, 68, 100);
  // Pequena Área Esquerda
  ctx.strokeRect(16, h / 2 - 24, 26, 48);

  // Grande Área Direita (Ataque)
  ctx.strokeRect(w - 84, h / 2 - 50, 68, 100);
  // Pequena Área Direita
  ctx.strokeRect(w - 42, h / 2 - 24, 26, 48);

  // Marca do pênalti esquerda e direita
  ctx.beginPath();
  ctx.arc(62, h / 2, 2, 0, Math.PI * 2);
  ctx.arc(w - 62, h / 2, 2, 0, Math.PI * 2);
  ctx.fill();

  // 3. Focos de Calor Térmico Dinâmico
  const spots = [];
  const pos = (position || "").toUpperCase();
  const grid = p?.grid || "";

  const shotsTotal = st?.shots?.total || 0;
  const keyPasses = st?.passes?.key || 0;
  const tackles = st?.tackles?.total || 0;
  const dribbles = st?.dribbles?.success || 0;

  // Pontos base por posição tática (Ataque sempre da Esquerda para Direita)
  if (pos === "G") {
    spots.push({ x: 38, y: h / 2, r: 42, intensity: 1.0 });
    spots.push({ x: 55, y: h / 2 - 15, r: 35, intensity: 0.7 });
    spots.push({ x: 55, y: h / 2 + 15, r: 35, intensity: 0.7 });
  } else if (pos === "D") {
    if (grid.endsWith(":1") || grid.endsWith(":4") || p?.number === 6 || p?.number === 3 || (p?.name && /left|esquerdo|le/i.test(p.name))) {
      // Lateral Esquerdo
      spots.push({ x: 100, y: 38, r: 45, intensity: 0.8 });
      spots.push({ x: 180, y: 38, r: 50, intensity: 0.95 });
      spots.push({ x: 260, y: 40, r: 52, intensity: 0.9 });
      spots.push({ x: 340, y: 45, r: 48, intensity: 0.75 });
    } else if (grid.endsWith(":2") || p?.number === 2 || (p?.name && /right|direito|ld/i.test(p.name))) {
      // Lateral Direito
      spots.push({ x: 100, y: h - 38, r: 45, intensity: 0.8 });
      spots.push({ x: 180, y: h - 38, r: 50, intensity: 0.95 });
      spots.push({ x: 260, y: h - 40, r: 52, intensity: 0.9 });
      spots.push({ x: 340, y: h - 45, r: 48, intensity: 0.75 });
    } else {
      // Zagueiro Central
      spots.push({ x: 100, y: h / 2 - 28, r: 55, intensity: 0.9 });
      spots.push({ x: 100, y: h / 2 + 28, r: 55, intensity: 0.9 });
      spots.push({ x: 135, y: h / 2, r: 60, intensity: 0.8 });
    }
  } else if (pos === "M") {
    // Meio-Campo
    spots.push({ x: w / 2 - 40, y: h / 2, r: 62, intensity: 0.9 });
    spots.push({ x: w / 2 + 30, y: h / 2 - 25, r: 58, intensity: 0.95 });
    spots.push({ x: w / 2 + 30, y: h / 2 + 25, r: 58, intensity: 0.95 });
    spots.push({ x: w * 0.65, y: h / 2, r: 55, intensity: 0.8 });
  } else {
    // Atacante / Ponta
    spots.push({ x: w * 0.72, y: h / 2, r: 60, intensity: 0.95 });
    spots.push({ x: w * 0.82, y: h / 2 - 30, r: 52, intensity: 0.9 });
    spots.push({ x: w * 0.82, y: h / 2 + 30, r: 52, intensity: 0.9 });
    spots.push({ x: w - 60, y: h / 2, r: 48, intensity: 0.85 });
  }

  // Focos extras baseados nas ações reais do jogo
  if (shotsTotal > 0) {
    spots.push({ x: w - 55, y: h / 2 + (Math.random() * 20 - 10), r: 40, intensity: 1.0 });
  }
  if (keyPasses > 0 || dribbles > 0) {
    spots.push({ x: w * 0.68, y: h / 2 + (Math.random() * 40 - 20), r: 45, intensity: 0.9 });
  }
  if (tackles >= 2) {
    spots.push({ x: w * 0.35, y: h / 2, r: 48, intensity: 0.85 });
  }

  // Desenhar manchas térmicas radiais
  spots.forEach(spot => {
    const radGrad = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, spot.r);
    radGrad.addColorStop(0.0, `rgba(239, 68, 68, ${0.85 * spot.intensity})`);
    radGrad.addColorStop(0.35, `rgba(255, 184, 0, ${0.65 * spot.intensity})`);
    radGrad.addColorStop(0.70, `rgba(16, 185, 129, ${0.35 * spot.intensity})`);
    radGrad.addColorStop(1.0, "rgba(0, 229, 255, 0)");

    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, spot.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderFixtureLineups(lineupsArr, events = [], leagueId, season, fixturePlayersMap = {}, mvpPlayerId = null, fx = null) {
  if (!lineupsArr || !lineupsArr.length) {
    return `
      <div class="card" style="text-align:center;padding:24px;color:var(--chalk-dim);">
        <p style="margin:0;">Escalações táticas serão confirmadas cerca de 45 minutos antes do jogo.</p>
      </div>`;
  }

  const playerEventsMap = {};
  events.forEach(e => {
    const min = e.time?.elapsed ?? 0;
    if (e.type === "Goal" && e.detail !== "Missed Penalty") {
      const pid = e.player?.id;
      const isOwnGoal = (e.detail === "Own Goal" || (e.comments && /own goal/i.test(e.comments)));
      if (pid) {
        playerEventsMap[pid] = playerEventsMap[pid] || { goals: 0, ownGoals: 0, yellows: 0, reds: 0 };
        if (isOwnGoal) {
          playerEventsMap[pid].ownGoals = (playerEventsMap[pid].ownGoals || 0) + 1;
        } else {
          playerEventsMap[pid].goals = (playerEventsMap[pid].goals || 0) + 1;
        }
      }
    } else if (e.type === "Card") {
      const pid = e.player?.id;
      if (pid) {
        playerEventsMap[pid] = playerEventsMap[pid] || { goals: 0, ownGoals: 0, yellows: 0, reds: 0 };
        if (e.detail === "Yellow Card") playerEventsMap[pid].yellows += 1;
        else playerEventsMap[pid].reds += 1;
      }
    } else if (e.type === "subst") {
      const pOutId = e.player?.id;
      const pInId = e.assist?.id;
      if (pOutId) {
        playerEventsMap[pOutId] = playerEventsMap[pOutId] || { goals: 0, ownGoals: 0, yellows: 0, reds: 0 };
        playerEventsMap[pOutId].subOut = min;
      }
      if (pInId) {
        playerEventsMap[pInId] = playerEventsMap[pInId] || { goals: 0, ownGoals: 0, yellows: 0, reds: 0 };
        playerEventsMap[pInId].subIn = min;
      }
    }
  });

  function generateGoalBadge(pid) {
    const ev = playerEventsMap[pid];
    if (!ev) return "";
    const redSoccerBall = `<svg width="15" height="15" viewBox="0 0 36 36" style="display:inline-block;vertical-align:middle;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.8));"><circle cx="18" cy="18" r="17" fill="#EF4444" stroke="#B91C1C" stroke-width="1.5"/><polygon points="18,11 23,15 21,21 15,21 13,15" fill="#7F1D1D" stroke="#FCA5A5" stroke-width="0.75"/><line x1="18" y1="11" x2="18" y2="2" stroke="#FCA5A5" stroke-width="1"/><line x1="23" y1="15" x2="31" y2="12" stroke="#FCA5A5" stroke-width="1"/><line x1="21" y1="21" x2="28" y2="28" stroke="#FCA5A5" stroke-width="1"/><line x1="15" y1="21" x2="8" y2="28" stroke="#FCA5A5" stroke-width="1"/><line x1="13" y1="15" x2="5" y2="12" stroke="#FCA5A5" stroke-width="1"/></svg>`;

    if (ev.goals > 0) {
      return `<span class="pitch-goal-badge goal" title="${ev.goals} Gol(s)">⚽${ev.goals > 1 ? `<small style="font-size:0.55rem;font-weight:800;margin-left:1px;">${ev.goals}</small>` : ''}</span>`;
    }
    if (ev.ownGoals > 0) {
      return `<span class="pitch-goal-badge own-goal" title="${ev.ownGoals} Gol(s) Contra">${redSoccerBall}${ev.ownGoals > 1 ? `<small style="font-size:0.55rem;font-weight:800;margin-left:1px;color:#EF4444;">${ev.ownGoals}</small>` : ''}</span>`;
    }
    return "";
  }

  function generateCardBadge(pid) {
    const ev = playerEventsMap[pid];
    if (!ev) return "";
    if (ev.reds > 0) {
      return `<span class="pitch-card-badge red" title="Cartão Vermelho">🟥</span>`;
    }
    if (ev.yellows > 0) {
      return `<span class="pitch-card-badge yellow" title="Cartão Amarelo">🟨</span>`;
    }
    return "";
  }

  function generateSubBadge(pid) {
    const ev = playerEventsMap[pid];
    if (!ev) return "";
    if (ev.subOut) {
      return `<span class="pitch-sub-pill sub-out" title="Substituído aos ${ev.subOut}'"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l8-8h-6v-8h-4v8h-6z"/></svg></span>`;
    }
    if (ev.subIn) {
      return `<span class="pitch-sub-pill sub-in" title="Entrou aos ${ev.subIn}'"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-8 8h6v8h4v-8h6z"/></svg></span>`;
    }
    return "";
  }

  function generateEventBadges(pid) {
    const ev = playerEventsMap[pid];
    if (!ev) return "";
    const badges = [];
    if (ev.goals > 0) badges.push(`<span class="event-pill goal" title="${ev.goals} Gol(s)">⚽${ev.goals > 1 ? `x${ev.goals}` : ''}</span>`);
    if (ev.ownGoals > 0) badges.push(`<span class="event-pill own-goal" title="${ev.ownGoals} Gol(s) Contra">🔴${ev.ownGoals > 1 ? `x${ev.ownGoals}` : ''}</span>`);
    if (ev.yellows > 0) badges.push(`<span class="event-pill yellow" title="Cartão Amarelo">🟨</span>`);
    if (ev.reds > 0) badges.push(`<span class="event-pill red" title="Cartão Vermelho">🟥</span>`);
    if (ev.subIn) badges.push(`<span class="event-pill sub-in" title="Entrou aos ${ev.subIn}'">⬆ ${ev.subIn}'</span>`);
    return badges.join("");
  }

  return `
    <h2 class="section-title">Escalações & Campo Tático 2D (Clique no jogador para ver perfil)</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;">
      ${lineupsArr.map((l, teamIdx) => {
        const isAway = teamIdx === 1;
        const startXI = Array.isArray(l.startXI) ? l.startXI : [];
        const substitutes = Array.isArray(l.substitutes) ? l.substitutes : [];
        if (!startXI.length) {
          return `
            <div class="card" style="text-align:center;padding:24px;color:var(--chalk-dim);">
              <p style="margin:0;">Escalação de ${escapeHtml(l.team?.name || 'Clube')} ainda não confirmada.</p>
            </div>`;
        }

        const formation = l.formation || "4-4-2";
        const formLines = formation.split("-").map(Number);
        
        const rows = [];
        let cursor = 1;
        rows.push([startXI[0]]);
        formLines.forEach(count => {
          rows.push(startXI.slice(cursor, cursor + count));
          cursor += count;
        });

        if (cursor < startXI.length) rows.push(startXI.slice(cursor));
        const displayRows = isAway ? [...rows].reverse() : rows;

        return `
          <div class="card">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
              <img src="${l.team.logo}" alt="" style="width:34px;height:34px;object-fit:contain;">
              <div>
                <div style="font-family:var(--font-display);font-size:1.1rem;font-weight:700;">${escapeHtml(l.team.name)}</div>
                <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">${escapeHtml(formation)} · Téc. ${escapeHtml(l.coach?.name || "-")}</div>
              </div>
            </div>

            <div class="tactical-pitch">
              <div class="pitch-lines">
                <div class="pitch-half-line"></div>
                <div class="pitch-center-circle"></div>
                <div class="pitch-center-spot"></div>
                <div class="pitch-penalty-area top"></div>
                <div class="pitch-penalty-area bottom"></div>
              </div>
              
              <div class="pitch-players-layer">
                ${displayRows.map(rowPlayers => `
                  <div class="pitch-row">
                    ${rowPlayers.map(p => {
                      const pid = p.player?.id;
                      const goalBadge = generateGoalBadge(pid);
                      const cardBadge = generateCardBadge(pid);
                      const subBadge = generateSubBadge(pid);
                      const photoUrl = pid ? `https://media.api-sports.io/football/players/${pid}.png` : 'https://media.api-sports.io/football/players/placeholder.png';
                      return `
                        ${(() => {
                          const pData = fixturePlayersMap[pid];
                          const ratingStr = pData?.ratingFinal || pData?.statistics?.[0]?.games?.rating;
                          const ratingNum = parseFloat(ratingStr || "0");
                          const isMVP = (pid === mvpPlayerId && ratingNum >= 7.0);

                          let ratingBadge = "";
                          if (ratingStr && !isNaN(ratingNum) && ratingNum > 0) {
                            const rClass = ratingNum >= 7.5 ? "rating-high" : ratingNum >= 6.5 ? "rating-med" : "rating-low";
                            ratingBadge = `<span class="pitch-player-rating-pill ${rClass}" title="Nota heurística FutStats não calibrada: ${ratingStr}">${ratingStr}</span>`;
                          }

                          return `
                            <div class="pitch-player btn-open-match-player-modal" data-player-id="${pid}" data-team-id="${l.team.id}" style="cursor:pointer;" title="Clique para ver nota, mapa de calor e estatísticas de ${escapeHtml(p.player.name)}">
                              <div class="pitch-badge-wrapper">
                                <div class="pitch-player-avatar-circle ${isAway ? 'away' : 'home'} ${isMVP ? 'is-mvp' : ''}">
                                  <img src="${photoUrl}" alt="" loading="lazy" data-image-fallback="player">
                                </div>
                                ${goalBadge}
                                ${ratingBadge}
                                ${cardBadge}
                                ${subBadge}
                              </div>
                              <span class="pitch-player-name">${escapeHtml((p.player.name || "").split(" ").pop())}</span>
                            </div>
                          `;
                        })()}`;
                    }).join("")}
                  </div>`
                ).join("")}
              </div>
            </div>

            <p class="stat-label" style="margin-top:18px;">Banco de Reservas</p>
            <div class="substitutes-grid">
              ${(Array.isArray(l.substitutes) ? l.substitutes : []).map(s => {
                const pid = s.player?.id;
                const eventBadges = generateEventBadges(pid);
                const entered = playerEventsMap[pid]?.subIn;
                const photoUrl = pid ? `https://media.api-sports.io/football/players/${pid}.png` : 'https://media.api-sports.io/football/players/placeholder.png';
                return `
                  <a class="sub-player-card ${entered ? 'was-subbed-in' : ''}" href="#/jogador/${pid}/${l.team.id}/${leagueId}/${season}" title="Ver perfil de ${escapeHtml(s.player.name)}">
                    <span class="sub-num ${isAway ? 'away' : 'home'}">${s.player.number ?? "-"}</span>
                    <img class="sub-photo" src="${photoUrl}" alt="" loading="lazy" data-image-fallback="player">
                    <span class="sub-name">${escapeHtml(s.player.name)}</span>
                    ${eventBadges ? `<span class="sub-events">${eventBadges}</span>` : ''}
                  </a>`;
              }).join("")}
            </div>
          </div>`;
      }).join("")}
    </div>
  `;
}

function renderFixtureEvents(events, fx, isFinished = false) {
  if (!events || !events.length) return "";
  return `
    <h2 class="section-title">Linha do Tempo</h2>
    <div class="card">
      <div class="fixture-list">
        ${events.map(e => {
          const isGoal = e.type === "Goal" && e.detail !== "Missed Penalty";
          const pName = e.player?.name || "Gol";
          const isOwnGoal = e.detail === 'Own Goal';
          const isPen = e.detail === 'Penalty';
          const rawAssist = e.assist?.name;
          const hasAssist = isGoal && !isOwnGoal && !isPen && rawAssist && String(rawAssist).trim() && String(rawAssist).trim().toLowerCase() !== "null" && String(rawAssist).trim().toLowerCase() !== pName.toLowerCase();
          const ytGoalUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`Gol ${pName} ${fx.teams.home.name} ${fx.teams.away.name}`)}`;

          const timeElapsed = (e.time && e.time.elapsed != null && e.time.elapsed !== "-") ? `${e.time.elapsed}'${e.time.extra ? "+" + e.time.extra : ""}` : (e.time?.elapsed === "-" ? "-" : "");
          return `
            <div class="fixture-row" style="grid-template-columns:44px auto 1fr auto;">
              <span class="fixture-date">${timeElapsed}</span>
              <span>${e.type === "Goal" ? "⚽" : e.type === "Card" ? (e.detail === "Red Card" ? "🟥" : "🟨") : "🔁"}</span>
              <div>
                <strong>${escapeHtml(pName)}</strong>${hasAssist ? ` <span style="color:var(--chalk-dim);font-size:0.8rem;font-weight:400;">(${escapeHtml(String(rawAssist).trim())})</span>` : ''}
                <span style="color:var(--chalk-dim);font-size:0.75rem;">(${escapeHtml(e.detail || e.type)})</span>
              </div>
              ${(isFinished && isGoal) ? `
                <a href="${ytGoalUrl}" target="_blank" rel="noopener noreferrer" class="btn-goal-video" title="Ver vídeo do gol de ${escapeHtml(pName)} no YouTube">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </a>
              ` : '<div></div>'}
            </div>`;
        }).join("")}
      </div>
    </div>`;
}

// ============================================================
// View: Comparação de Confronto
// ============================================================
