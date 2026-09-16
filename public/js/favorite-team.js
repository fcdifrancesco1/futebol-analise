async function renderMyTeam() {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const favTeam = UserPrefs.getFavoriteTeam();

  if (!favTeam) {
    app.innerHTML = `
      <div class="page-head">
        <p class="page-eyebrow">Personalização</p>
        <h1 class="page-title">Seu Time ⭐</h1>
        <p class="page-sub">Escolha o seu time do coração para acompanhar notícias em tempo real, próximos 5 jogos, últimos resultados, estatísticas e elenco.</p>
      </div>

      <div class="card" style="max-width:560px;margin:24px auto;padding:28px;text-align:center;">
        <span style="font-size:3rem;display:block;margin-bottom:12px;">🛡️</span>
        <h2 style="font-size:1.25rem;font-weight:800;color:var(--chalk);margin-bottom:8px;">Nenhum time selecionado</h2>
        <p style="font-size:0.85rem;color:var(--chalk-dim);margin-bottom:20px;">
          Pesquise e selecione qualquer clube do mundo para transformar esta aba na central exclusiva do seu time.
        </p>
        <button class="btn primary" id="btn-select-fav-team-main" style="font-weight:700;padding:10px 24px;">
          ⭐ Escolher Meu Time Agora
        </button>
      </div>
    `;

    document.getElementById("btn-select-fav-team-main")?.addEventListener("click", () => showOnboardingModal(true));
    return;
  }

  const teamFormattedName = formatTeamName(favTeam.name);

  app.innerHTML = `
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;">
      <div style="display:flex;align-items:center;gap:14px;">
        <img src="${favTeam.logo}" alt="" style="width:52px;height:52px;object-fit:contain;" data-image-fallback="hide">
        <div>
          <p class="page-eyebrow" style="margin:0;">Central do Torcedor</p>
          <h1 class="page-title" style="margin:0;font-size:1.6rem;color:var(--chalk);">${escapeHtml(teamFormattedName)}</h1>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <button class="btn ghost small" id="btn-change-fav-team-tab" style="font-size:0.78rem;">
          🔄 Trocar Time
        </button>
      </div>
    </div>

    <!-- 1. Notícias em Tempo Real -->
    <div class="news-feed-card" style="margin-bottom:24px;">
      <div class="news-feed-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:1.3rem;">📰</span>
          <div>
            <h2 style="font-size:1.1rem;font-weight:700;margin:0;color:var(--chalk);display:flex;align-items:center;gap:8px;">
              Últimas Notícias
              <span style="font-size:0.68rem;background:rgba(239,68,68,0.2);color:#EF4444;border:1px solid rgba(239,68,68,0.4);padding:1px 6px;border-radius:10px;font-family:var(--font-mono);font-weight:700;">🔴 EM TEMPO REAL</span>
            </h2>
            <span style="font-size:0.75rem;color:var(--chalk-dim);">As 6 manchetes mais recentes dos principais portais de notícias</span>
          </div>
        </div>
      </div>
      <div id="myteam-news-container">
        <div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.85rem;">Carregando notícias de ${escapeHtml(teamFormattedName)}...</div>
      </div>
    </div>

    <!-- Conteúdo dos Jogos e Estatísticas -->
    <div id="myteam-content-section">${skeletonCards(2)}</div>
  `;

  document.getElementById("btn-change-fav-team-tab")?.addEventListener("click", () => showOnboardingModal(true));
  loadTeamNews(favTeam.name, "myteam-news-container");

  const contentSection = document.getElementById("myteam-content-section");

  try {
    const currentYear = new Date().getFullYear();
    const [lastRes, nextRes, leaguesRes] = await Promise.allSettled([
      apiGet("fixtures", { team: favTeam.id, last: 5 }, 15),
      apiGet("fixtures", { team: favTeam.id, next: 5 }, 15),
      apiGet("leagues", { team: favTeam.id, season: currentYear }, 60)
    ]);

    const lastFixtures = (lastRes.status === "fulfilled" && Array.isArray(lastRes.value)) ? lastRes.value : [];
    const nextFixtures = (nextRes.status === "fulfilled" && Array.isArray(nextRes.value)) ? nextRes.value : [];
    const teamLeagues = (leaguesRes.status === "fulfilled" && Array.isArray(leaguesRes.value)) ? leaguesRes.value : [];

    // Competição e temporada principal para o link do elenco
    const primaryLeague = lastFixtures[0]?.league || nextFixtures[0]?.league || teamLeagues[0]?.league || { id: 71, season: currentYear, name: "Competição Principal" };
    const leagueId = primaryLeague.id;
    const season = primaryLeague.season || currentYear;

    // Buscar e agregar estatísticas de TODAS as competições da temporada
    let totalPlayed = 0, totalWins = 0, totalDraws = 0, totalLoses = 0;
    let totalGf = 0, totalGa = 0, totalCleanSheets = 0;
    let homeWins = 0, homePlayed = 0, awayWins = 0, awayPlayed = 0;
    const leagueNamesSet = new Set();

    if (teamLeagues.length) {
      const statsResponses = await Promise.allSettled(
        teamLeagues.map(l => apiGet("teams/statistics", { team: favTeam.id, league: l.league.id, season: season }, 30))
      );

      statsResponses.forEach((res, idx) => {
        if (res.status === "fulfilled" && res.value?.fixtures) {
          const s = res.value;
          const p = s.fixtures.played?.total || 0;
          if (p > 0) {
            leagueNamesSet.add(teamLeagues[idx]?.league?.name || "Liga");
            totalPlayed += p;
            totalWins += s.fixtures.wins?.total || 0;
            totalDraws += s.fixtures.draws?.total || 0;
            totalLoses += s.fixtures.loses?.total || 0;
            totalGf += s.goals?.for?.total?.total || 0;
            totalGa += s.goals?.against?.total?.total || 0;
            totalCleanSheets += s.clean_sheet?.total || 0;
            homeWins += s.fixtures.wins?.home || 0;
            homePlayed += s.fixtures.played?.home || 0;
            awayWins += s.fixtures.wins?.away || 0;
            awayPlayed += s.fixtures.played?.away || 0;
          }
        }
      });
    }

    // Forma Recente calculada sobre os últimos 5 jogos de TODAS as competições (da mais antiga para a mais recente)
    const sortedLast = [...lastFixtures].sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));
    const recentFormList = sortedLast.map(f => {
      const isHome = f.teams.home.id === favTeam.id;
      const hG = f.goals.home ?? 0;
      const aG = f.goals.away ?? 0;
      if (hG === aG) return { letter: "E", color: "#FFB800" };
      if ((isHome && hG > aG) || (!isHome && aG > hG)) return { letter: "V", color: "#10B981" };
      return { letter: "D", color: "#EF4444" };
    });

    const hasStats = totalPlayed > 0;
    const avgGf = totalPlayed ? (totalGf / totalPlayed).toFixed(1) : "0.0";
    const avgGa = totalPlayed ? (totalGa / totalPlayed).toFixed(1) : "0.0";

    contentSection.innerHTML = `
      <!-- Acesso Rápido ao Elenco -->
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;margin-bottom:24px;background:linear-gradient(90deg, rgba(0,229,255,0.08), rgba(255,184,0,0.08));border:1px solid rgba(0,229,255,0.25);flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:1.6rem;">👥</span>
          <div>
            <strong style="font-size:1rem;color:var(--chalk);display:block;">Elenco Atual de ${escapeHtml(teamFormattedName)}</strong>
            <span style="font-size:0.78rem;color:var(--chalk-dim);">Jogadores, fotos, números de camisa, idades e posições</span>
          </div>
        </div>
        <a class="btn primary small" href="#/time/${favTeam.id}/${leagueId}/${season}/elenco" style="font-weight:700;">
          Ver Elenco Completo →
        </a>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px;margin-bottom:24px;">
        <!-- 2. Próximas Partidas (5 jogos) -->
        <div class="card" style="padding:16px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:10px;">
            <span style="font-size:1.1rem;">⏳</span>
            <h3 style="margin:0;font-size:1rem;font-weight:700;color:var(--chalk);">Próximas Partidas (5 Jogos)</h3>
          </div>

          ${nextFixtures.length ? `
            <div class="fixture-list">
              ${nextFixtures.map(f => {
                const dObj = new Date(f.fixture.date);
                const day = String(dObj.getDate()).padStart(2, "0");
                const month = String(dObj.getMonth() + 1).padStart(2, "0");
                const year = dObj.getFullYear();
                const timeStr = dObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const dateFormatted = `${day}/${month}/${year}${timeStr && timeStr !== "00:00" ? ' · ' + timeStr : ''}`;
                const isHome = f.teams.home.id === favTeam.id;
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

        <!-- 3. Últimos Resultados (5 jogos) -->
        <div class="card" style="padding:16px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:10px;">
            <span style="font-size:1.1rem;">✅</span>
            <h3 style="margin:0;font-size:1rem;font-weight:700;color:var(--chalk);">Últimos Resultados (5 Jogos)</h3>
          </div>

          ${lastFixtures.length ? `
            <div class="fixture-list">
              ${lastFixtures.map(f => {
                const dObj = new Date(f.fixture.date);
                const day = String(dObj.getDate()).padStart(2, "0");
                const month = String(dObj.getMonth() + 1).padStart(2, "0");
                const year = dObj.getFullYear();
                const dateFormatted = `${day}/${month}/${year}`;
                const isHome = f.teams.home.id === favTeam.id;
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

      <!-- 4. Estatísticas Gerais na Temporada (Todas as Competições) -->
      ${hasStats ? `
        <div class="card" style="padding:20px;margin-bottom:24px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:12px;flex-wrap:wrap;gap:8px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:1.3rem;">📊</span>
              <div>
                <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:var(--chalk);">Estatísticas Gerais na Temporada</h3>
                <span style="font-size:0.75rem;color:var(--chalk-dim);">Todas as Competições Oficiais · Temporada ${season}</span>
              </div>
            </div>

            ${recentFormList.length ? `
              <div style="display:flex;align-items:center;gap:5px;">
                <span style="font-size:0.72rem;color:var(--chalk-dim);font-family:var(--font-mono);margin-right:4px;">Forma Recente:</span>
                ${recentFormList.map(item => `
                  <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:${item.color}22;color:${item.color};border:1px solid ${item.color};border-radius:4px;font-size:0.72rem;font-weight:800;font-family:var(--font-mono);line-height:1;">
                    ${item.letter}
                  </span>
                `).join("")}
              </div>
            ` : ""}
          </div>

          <div class="match-stat-chip-grid" style="grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:12px;">
            <div class="match-stat-chip">
              <span class="match-stat-chip-label">🏆 Jogos / Vitórias</span>
              <span class="match-stat-chip-val">${totalPlayed}J · <span style="color:#10B981;">${totalWins}V</span></span>
            </div>
            <div class="match-stat-chip">
              <span class="match-stat-chip-label">🤝 Empates / Derrotas</span>
              <span class="match-stat-chip-val"><span style="color:#FFB800;">${totalDraws}E</span> · <span style="color:#EF4444;">${totalLoses}D</span></span>
            </div>
            <div class="match-stat-chip">
              <span class="match-stat-chip-label">⚽ Gols Pró (Média)</span>
              <span class="match-stat-chip-val" style="color:var(--cyan);">${totalGf} (${avgGf})</span>
            </div>
            <div class="match-stat-chip">
              <span class="match-stat-chip-label">🛡️ Gols Contra (Média)</span>
              <span class="match-stat-chip-val">${totalGa} (${avgGa})</span>
            </div>
            <div class="match-stat-chip">
              <span class="match-stat-chip-label">🧤 Jogos sem Sofrer Gols</span>
              <span class="match-stat-chip-val" style="color:var(--gold);">${totalCleanSheets}</span>
            </div>
            ${(() => {
              const homePct = homePlayed ? Math.round((homeWins / homePlayed) * 100) : 0;
              const awayPct = awayPlayed ? Math.round((awayWins / awayPlayed) * 100) : 0;
              const homePctColor = homePct >= 50 ? "#10B981" : "#EF4444";
              const awayPctColor = awayPct >= 50 ? "#10B981" : "#EF4444";
              return `
                <div class="match-stat-chip">
                  <span class="match-stat-chip-label">🏟️ Vitórias em Casa</span>
                  <span class="match-stat-chip-val">${homeWins} de ${homePlayed} · <span style="color:${homePctColor};font-weight:800;">${homePct}%</span></span>
                </div>
                <div class="match-stat-chip">
                  <span class="match-stat-chip-label">✈️ Vitórias Fora</span>
                  <span class="match-stat-chip-val">${awayWins} de ${awayPlayed} · <span style="color:${awayPctColor};font-weight:800;">${awayPct}%</span></span>
                </div>
              `;
            })()}
          </div>
        </div>
      ` : ""}
    `;
  } catch (err) {
    contentSection.innerHTML = errorBox("Erro ao carregar dados do seu time.");
  }
}

// ============================================================
// View: Home
// ============================================================
