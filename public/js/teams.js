async function renderTeam(teamId, leagueId, season) {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const league = LEAGUES.find(l => l.id === leagueId);
  season = season || defaultSeasonFor(league);

  app.innerHTML = `<div id="team-content">${skeletonTable()}</div>`;
  const content = document.getElementById("team-content");

  try {
    const [stats, recentFixtures, teamSeasonFixtures, nextFixtures] = await Promise.all([
      apiGet("teams/statistics", { league: leagueId, season, team: teamId }, 5),
      apiGet("fixtures", { team: teamId, last: 5 }, 5),
      apiGet("fixtures", { team: teamId, season, league: leagueId }, 5).catch(() => []),
      apiGet("fixtures", { team: teamId, next: 5 }, 5).catch(() => [])
    ]);

    if (!stats || !stats.team) {
      content.innerHTML = errorBox("Sem estatísticas para esse time nessa temporada.");
      return;
    }

    const t = stats.team;
    const finishedSeason = Array.isArray(teamSeasonFixtures) ? teamSeasonFixtures.filter(f => ['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short)) : [];

    let totalPlayed = stats.fixtures?.played?.total || 0;
    let totalWins = stats.fixtures?.wins?.total || 0;
    let totalDraws = stats.fixtures?.draws?.total || 0;
    let totalLoses = stats.fixtures?.loses?.total || 0;
    let gfAvg = parseFloat(stats.goals?.for?.average?.total) || 0;
    let gaAvg = parseFloat(stats.goals?.against?.average?.total) || 0;
    let gfHomeAvg = stats.goals?.for?.average?.home || "0.0";
    let gfAwayAvg = stats.goals?.for?.average?.away || "0.0";
    let gaHomeAvg = stats.goals?.against?.average?.home || "0.0";
    let gaAwayAvg = stats.goals?.against?.average?.away || "0.0";
    let csTotal = stats.clean_sheet?.total || 0;
    let csHome = stats.clean_sheet?.home || 0;
    let csAway = stats.clean_sheet?.away || 0;

    // Se houver partidas finalizadas recentes que ainda não constem no agregado da API-Football:
    if (finishedSeason.length > totalPlayed) {
      let wH = 0, wA = 0, dH = 0, dA = 0, lH = 0, lA = 0;
      let gForH = 0, gForA = 0, gAgainstH = 0, gAgainstA = 0;
      let cHome = 0, cAway = 0;
      let playedHome = 0, playedAway = 0;

      finishedSeason.forEach(f => {
        const isHome = f.teams.home.id === teamId;
        const gF = isHome ? f.goals.home : f.goals.away;
        const gA = isHome ? f.goals.away : f.goals.home;
        if (gF === null || gA === null || gF === undefined || gA === undefined) return;

        if (isHome) {
          playedHome++;
          gForH += gF;
          gAgainstH += gA;
          if (gA === 0) cHome++;
          if (gF > gA) wH++;
          else if (gF === gA) dH++;
          else lH++;
        } else {
          playedAway++;
          gForA += gF;
          gAgainstA += gA;
          if (gA === 0) cAway++;
          if (gF > gA) wA++;
          else if (gF === gA) dA++;
          else lA++;
        }
      });

      totalPlayed = finishedSeason.length;
      totalWins = wH + wA;
      totalDraws = dH + dA;
      totalLoses = lH + lA;
      gfAvg = totalPlayed ? ((gForH + gForA) / totalPlayed) : 0;
      gaAvg = totalPlayed ? ((gAgainstH + gAgainstA) / totalPlayed) : 0;
      gfHomeAvg = playedHome ? (gForH / playedHome).toFixed(2) : gfHomeAvg;
      gfAwayAvg = playedAway ? (gForA / playedAway).toFixed(2) : gfAwayAvg;
      gaHomeAvg = playedHome ? (gAgainstH / playedHome).toFixed(2) : gaHomeAvg;
      gaAwayAvg = playedAway ? (gAgainstA / playedAway).toFixed(2) : gaAwayAvg;
      csTotal = cHome + cAway;
      csHome = cHome;
      csAway = cAway;
    }

    const winPct = totalPlayed ? Math.round((totalWins / totalPlayed) * 100) : 0;
    const isFav = state.favoriteTeams.some(fav => fav.id === teamId);

    content.innerHTML = `
      ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: league?.name || "Liga", href: `#/liga/${leagueId}/${season}` }, { label: t.name, href: "" }])}
      
      <div class="team-header" style="display:flex;align-items:center;gap:16px;margin-bottom:20px;background:var(--pitch-card);border:1px solid var(--pitch-border);padding:16px;border-radius:var(--radius-lg);flex-wrap:wrap;">
        <img src="${t.logo}" alt="" style="width:64px;height:64px;object-fit:contain;">
        <div>
          <p class="page-eyebrow">${escapeHtml(league?.name || "")} · ${season}</p>
          <h1 class="page-title" style="margin:0;">${escapeHtml(formatTeamName(t.name))}</h1>
        </div>
        <button class="btn ${isFav ? 'ghost' : ''} small" id="btn-toggle-team-fav" style="margin-left:auto;">
          ${isFav ? '⭐ Seguindo Alertas' : '🔔 Seguir Time'}
        </button>
      </div>

      ${subNav([
        { label: "Estatísticas", href: `#/time/${teamId}/${leagueId}/${season}`, active: true },
        { label: "Elenco", href: `#/time/${teamId}/${leagueId}/${season}/elenco` },
        { label: "Lesões", href: `#/time/${teamId}/${leagueId}/${season}/lesoes` },
      ])}

      <div class="stat-grid">
        <div class="stat-card-modern gold">
          <div class="stat-card-header">
            <span>🎯</span>
            <span>Aproveitamento</span>
          </div>
          <div class="stat-card-main-val gold">${winPct}<small style="font-size:1.1rem;">%</small></div>
          <div class="stat-card-chips">
            <span class="stat-chip win">${totalWins}V</span>
            <span class="stat-chip draw">${totalDraws}E</span>
            <span class="stat-chip loss">${totalLoses}D</span>
          </div>
        </div>

        <div class="stat-card-modern green">
          <div class="stat-card-header">
            <span>⚽</span>
            <span>Média Gols Pró</span>
          </div>
          <div class="stat-card-main-val green">${gfAvg.toFixed(2)}</div>
          <div class="stat-split-bar">
            <span>🏠 Casa ${gfHomeAvg}</span>
            <span>✈️ Fora ${gfAwayAvg}</span>
          </div>
        </div>

        <div class="stat-card-modern red">
          <div class="stat-card-header">
            <span>🛡️</span>
            <span>Média Gols Contra</span>
          </div>
          <div class="stat-card-main-val red">${gaAvg.toFixed(2)}</div>
          <div class="stat-split-bar">
            <span>🏠 Casa ${gaHomeAvg}</span>
            <span>✈️ Fora ${gaAwayAvg}</span>
          </div>
        </div>

        <div class="stat-card-modern cyan">
          <div class="stat-card-header">
            <span>🧤</span>
            <span>Jogos Sem Sofrer Gol</span>
          </div>
          <div class="stat-card-main-val cyan">${csTotal}</div>
          <div class="stat-split-bar">
            <span>🏠 Casa ${csHome}</span>
            <span>✈️ Fora ${csAway}</span>
          </div>
        </div>
      </div>

      <h2 class="section-title">Últimas Notícias do ${escapeHtml(formatTeamName(t.name))}</h2>
      <div id="team-page-news-container" class="news-feed-card" style="margin-bottom:20px;">
        <div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.85rem;">Carregando manchetes...</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px;margin-bottom:24px;">
        <!-- 1. Próximas Partidas (5 jogos) -->
        <div class="card" style="padding:16px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:10px;">
            <span style="font-size:1.1rem;">⏳</span>
            <h3 style="margin:0;font-size:1rem;font-weight:700;color:var(--chalk);">Próximas Partidas (5 Jogos)</h3>
          </div>

          ${(nextFixtures && nextFixtures.length) ? `
            <div class="fixture-list">
              ${nextFixtures.map(f => {
                const dObj = new Date(f.fixture.date);
                const day = String(dObj.getDate()).padStart(2, "0");
                const month = String(dObj.getMonth() + 1).padStart(2, "0");
                const year = dObj.getFullYear();
                const timeStr = dObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const dateFormatted = `${day}/${month}/${year}${timeStr && timeStr !== "00:00" ? ' · ' + timeStr : ''}`;
                const isHome = f.teams.home.id === teamId;
                const leagueLogo = f.league?.logo;
                const leagueName = formatTeamName(f.league?.name || "");

                return `
                  <a class="fixture-card-compact" href="#/jogo/${f.fixture.id}" title="Ver detalhes de ${escapeHtml(leagueName)}">
                    <div class="fixture-card-topbar">
                      <div class="fixture-card-league" title="${escapeHtml(leagueName)}">
                        ${leagueLogo ? `<img src="${leagueLogo}" alt="" class="fixture-card-league-logo" data-image-fallback="hide">` : ''}
                        <span>${escapeHtml(leagueName)}</span>
                      </div>
                      <div class="fixture-card-top-right">
                        <span class="fixture-card-date-badge">📅 ${dateFormatted}</span>
                      </div>
                    </div>
                    <div class="fixture-card-matchup">
                      <div class="fixture-team-item right ${isHome ? 'bold-team' : ''}">
                        <span class="fixture-team-name" title="${escapeHtml(formatTeamName(f.teams.home.name))}">${escapeHtml(formatTeamName(f.teams.home.name))}</span>
                        <img src="${f.teams.home.logo}" alt="" loading="lazy">
                      </div>
                      <div class="fixture-card-score-box">
                        <span class="fixture-score" style="color:var(--chalk-dim);font-size:0.8rem;padding:2px 8px;min-width:38px;">vs</span>
                      </div>
                      <div class="fixture-team-item ${!isHome ? 'bold-team' : ''}">
                        <img src="${f.teams.away.logo}" alt="" loading="lazy">
                        <span class="fixture-team-name" title="${escapeHtml(formatTeamName(f.teams.away.name))}">${escapeHtml(formatTeamName(f.teams.away.name))}</span>
                      </div>
                    </div>
                  </a>
                `;
              }).join("")}
            </div>
          ` : `
            <div style="padding:20px;text-align:center;color:var(--chalk-dim);font-size:0.85rem;">
              Nenhuma partida futura agendada no momento.
            </div>
          `}
        </div>

        <!-- 2. Últimos Resultados (5 jogos) -->
        <div class="card" style="padding:16px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:10px;">
            <span style="font-size:1.1rem;">✅</span>
            <h3 style="margin:0;font-size:1rem;font-weight:700;color:var(--chalk);">Últimos Resultados (5 Jogos)</h3>
          </div>

          ${(recentFixtures && recentFixtures.length) ? `
            <div class="fixture-list">
              ${recentFixtures.map(f => {
                const dObj = new Date(f.fixture.date);
                const day = String(dObj.getDate()).padStart(2, "0");
                const month = String(dObj.getMonth() + 1).padStart(2, "0");
                const year = dObj.getFullYear();
                const dateFormatted = `${day}/${month}/${year}`;
                const isHome = f.teams.home.id === teamId;
                const homeGoals = f.goals.home ?? 0;
                const awayGoals = f.goals.away ?? 0;
                const leagueLogo = f.league?.logo;
                const leagueName = formatTeamName(f.league?.name || "");

                let outcomeLetter = "E";
                let outcomeBg = "rgba(255,184,0,0.2)";
                let outcomeColor = "#FFB800";
                let outcomeBorder = "rgba(255,184,0,0.5)";

                if (homeGoals !== awayGoals) {
                  if ((isHome && homeGoals > awayGoals) || (!isHome && awayGoals > homeGoals)) {
                    outcomeLetter = "V";
                    outcomeBg = "rgba(16,185,129,0.2)";
                    outcomeColor = "#10B981";
                    outcomeBorder = "rgba(16,185,129,0.5)";
                  } else {
                    outcomeLetter = "D";
                    outcomeBg = "rgba(239,68,68,0.2)";
                    outcomeColor = "#EF4444";
                    outcomeBorder = "rgba(239,68,68,0.5)";
                  }
                }

                return `
                  <a class="fixture-card-compact" href="#/jogo/${f.fixture.id}" title="Ver detalhes de ${escapeHtml(leagueName)}">
                    <div class="fixture-card-topbar">
                      <div class="fixture-card-league" title="${escapeHtml(leagueName)}">
                        ${leagueLogo ? `<img src="${leagueLogo}" alt="" class="fixture-card-league-logo" data-image-fallback="hide">` : ''}
                        <span>${escapeHtml(leagueName)}</span>
                      </div>
                      <div class="fixture-card-top-right">
                        <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:${outcomeBg};color:${outcomeColor};border:1px solid ${outcomeBorder};border-radius:4px;font-family:var(--font-mono);font-size:0.68rem;font-weight:800;line-height:1;">
                          ${outcomeLetter}
                        </span>
                        <span class="fixture-card-date-badge">📅 ${dateFormatted}</span>
                      </div>
                    </div>
                    <div class="fixture-card-matchup">
                      <div class="fixture-team-item right ${isHome ? 'bold-team' : ''}">
                        <span class="fixture-team-name" title="${escapeHtml(formatTeamName(f.teams.home.name))}">${escapeHtml(formatTeamName(f.teams.home.name))}</span>
                        <img src="${f.teams.home.logo}" alt="" loading="lazy">
                      </div>
                      <div class="fixture-card-score-box">
                        <span class="fixture-score" style="padding:2px 8px;min-width:44px;">${homeGoals} : ${awayGoals}</span>
                        <button type="button" class="btn-fixture-highlights-pill" title="Assistir aos Melhores Momentos no YouTube" data-action="highlights" data-url="https://www.youtube.com/results?search_query=${encodeURIComponent(`Melhores Momentos ${f.teams.home.name} x ${f.teams.away.name} ${leagueName}`)}">
                          <span style="font-size:0.6rem;line-height:1;">▶</span>
                          <span>Melhores Momentos</span>
                        </button>
                      </div>
                      <div class="fixture-team-item ${!isHome ? 'bold-team' : ''}">
                        <img src="${f.teams.away.logo}" alt="" loading="lazy">
                        <span class="fixture-team-name" title="${escapeHtml(formatTeamName(f.teams.away.name))}">${escapeHtml(formatTeamName(f.teams.away.name))}</span>
                      </div>
                    </div>
                  </a>
                `;
              }).join("")}
            </div>
          ` : `
            <div style="padding:20px;text-align:center;color:var(--chalk-dim);font-size:0.85rem;">
              Nenhum resultado recente encontrado.
            </div>
          `}
        </div>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn" id="set-slot-a">Definir como Time A na Comparação</button>
        <button class="btn ghost" id="set-slot-b">Definir como Time B na Comparação</button>
      </div>
    `;

    document.getElementById("btn-toggle-team-fav").addEventListener("click", () => {
      if (state.favoriteTeams.some(fav => fav.id === teamId)) {
        state.favoriteTeams = state.favoriteTeams.filter(fav => fav.id !== teamId);
        toast(`Você deixou de seguir o ${t.name}.`);
      } else {
        state.favoriteTeams.push({ id: teamId, name: t.name, logo: t.logo });
        toast(`${t.name} adicionado aos favoritos. Ative os alertas no sino para receber notificações.`, false);
      }
      NotificationManager.syncPreferences().catch(err => toast("Não foi possível sincronizar alertas: " + err.message));
      renderTeam(teamId, leagueId, season);
    });

    document.getElementById("set-slot-a").addEventListener("click", () => setCompareSlot("a", t, leagueId, league?.name, season));
    document.getElementById("set-slot-b").addEventListener("click", () => setCompareSlot("b", t, leagueId, league?.name, season));
    loadTeamNews(t.name, "team-page-news-container");
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

// ============================================================
// View: Time — Elenco (Com Cards Perfeitamente Alinhados)
// ============================================================
async function renderSquad(teamId, leagueId, season) {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const league = LEAGUES.find(l => l.id === leagueId);
  app.innerHTML = `<div id="squad-content">${skeletonTable()}</div>`;
  const content = document.getElementById("squad-content");

  try {
    const response = await apiGet("players/squads", { team: teamId }, 60);
    const squad = response?.[0];
    if (!squad) {
      content.innerHTML = errorBox("Elenco indisponível para esse time.");
      return;
    }

    const groups = { Goalkeeper: "Goleiros", Defender: "Defensores", Midfielder: "Meio-Campistas", Attacker: "Atacantes" };
    const byPos = {};
    (squad.players || []).forEach(p => {
      const key = p.position || "Outros";
      byPos[key] = byPos[key] || [];
      byPos[key].push(p);
    });

    content.innerHTML = `
      ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: squad.team.name, href: `#/time/${teamId}/${leagueId}/${season}` }, { label: "Elenco", href: "" }])}
      <div class="team-header" style="display:flex;align-items:center;gap:16px;margin-bottom:20px;background:var(--pitch-card);border:1px solid var(--pitch-border);padding:16px;border-radius:var(--radius-lg);">
        <img src="${squad.team.logo}" alt="" style="width:54px;height:54px;object-fit:contain;">
        <div>
          <p class="page-eyebrow">${escapeHtml(league?.name || "")}</p>
          <h1 class="page-title" style="margin:0;">${escapeHtml(squad.team.name)}</h1>
        </div>
      </div>
      ${subNav([
        { label: "Estatísticas", href: `#/time/${teamId}/${leagueId}/${season}` },
        { label: "Elenco", href: `#/time/${teamId}/${leagueId}/${season}/elenco`, active: true },
        { label: "Lesões", href: `#/time/${teamId}/${leagueId}/${season}/lesoes` },
      ])}
      ${Object.entries(groups).map(([key, label]) => {
        const players = byPos[key];
        if (!players || !players.length) return "";
        return `
          <h2 class="section-title">${label}</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:12px;margin-bottom:22px;">
            ${players.map(p => `
              <a class="card player-card" href="#/jogador/${p.id}/${teamId}/${leagueId}/${season}" title="Ver estatísticas de ${escapeHtml(p.name)}">
                <img src="${p.photo}" alt="" loading="lazy" data-image-fallback="player">
                <div style="font-family:var(--font-mono);color:var(--gold);font-size:0.8rem;font-weight:700;">${p.number ?? "-"}</div>
                <div style="font-size:0.86rem;margin-top:3px;font-weight:600;color:var(--chalk);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</div>
                <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--chalk-dim);margin-top:2px;">${p.age ? p.age + " anos" : ""}</div>
              </a>`
            ).join("")}
          </div>`;
      }).join("")}
    `;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

async function renderInjuries(teamId, leagueId, season) {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const league = LEAGUES.find(l => l.id === leagueId);
  app.innerHTML = `<div id="injuries-content">${skeletonTable()}</div>`;
  const content = document.getElementById("injuries-content");

  try {
    const injuries = await apiGet("injuries", { team: teamId, season }, 30);
    content.innerHTML = `
      ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: "Time", href: `#/time/${teamId}/${leagueId}/${season}` }, { label: "Desfalques", href: "" }])}
      <div class="page-head">
        <p class="page-eyebrow">${escapeHtml(league?.name || "")} · ${season}</p>
        <h1 class="page-title">Lesões e Desfalques</h1>
      </div>
      ${subNav([
        { label: "Estatísticas", href: `#/time/${teamId}/${leagueId}/${season}` },
        { label: "Elenco", href: `#/time/${teamId}/${leagueId}/${season}/elenco` },
        { label: "Lesões", href: `#/time/${teamId}/${leagueId}/${season}/lesoes`, active: true },
      ])}
      <div class="card">
        ${!injuries || !injuries.length 
          ? `<p style="color:var(--chalk-dim);">Nenhum desfalque registrado recentemente.</p>`
          : `<div class="fixture-list">
              ${injuries.map(inj => `
                <a class="fixture-row" href="#/jogador/${inj.player.id}/${teamId}/${leagueId}/${season}" style="grid-template-columns:40px 1fr auto;" title="Ver detalhes do atleta">
                  <img src="${inj.player.photo}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                  <div>
                    <div style="font-weight:600;">${escapeHtml(inj.player.name)}</div>
                    <div style="font-size:0.75rem;color:var(--terracotta);">${escapeHtml(inj.player.reason || "Desfalque")}</div>
                  </div>
                  <span class="fixture-date">${inj.fixture?.date ? new Date(inj.fixture.date).toLocaleDateString("pt-BR") : ""}</span>
                </a>`
              ).join("")}
            </div>`
        }
      </div>
    `;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function sumCards(cardsObj) {
  if (!cardsObj) return 0;
  return Object.values(cardsObj).reduce((s, v) => s + (v?.total || 0), 0);
}

function renderRecentFixtures(fixtures, teamId) {
  if (!fixtures || !fixtures.length) return `<p style="color:var(--chalk-dim);">Sem histórico recente.</p>`;
  return fixtures.slice().reverse().map(f => {
    const isHome = f.teams.home.id === teamId;
    const opp = isHome ? f.teams.away : f.teams.home;
    const ownGoals = isHome ? f.goals.home : f.goals.away;
    const oppGoals = isHome ? f.goals.away : f.goals.home;
    let result = "D";
    if (ownGoals !== null && oppGoals !== null) {
      result = ownGoals > oppGoals ? "W" : ownGoals < oppGoals ? "L" : "D";
    }
    const label = result === "W" ? "V" : result === "L" ? "D" : "E";
    return `
      <a class="fixture-row" href="#/jogo/${f.fixture.id}" style="grid-template-columns:85px 1fr auto 30px;" title="Clique para abrir detalhes da partida">
        <span class="fixture-date">${new Date(f.fixture.date).toLocaleDateString("pt-BR")}</span>
        <span>${isHome ? "vs" : "@"} ${escapeHtml(opp.name)}</span>
        <span class="fixture-score">${ownGoals ?? "-"} : ${oppGoals ?? "-"}</span>
        <span class="form-pill ${result}">${label}</span>
      </a>`;
  }).join("");
}

function setCompareSlot(slot, team, leagueId, leagueName, season) {
  state.compareSlots[slot] = {
    teamId: team.id,
    name: team.name,
    logo: team.logo,
    leagueId,
    leagueName,
    season,
  };
  updateCompareBadge();
  toast(`${team.name} selecionado como Time ${slot.toUpperCase()}`, false);
  location.hash = "#/compare";
}

// ============================================================
// View: Jogos do Dia (Todas as Competições do Projeto)
// ============================================================
