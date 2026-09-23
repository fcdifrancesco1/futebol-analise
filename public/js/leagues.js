function toggleCountryCard(headerEl) {
  const card = headerEl.closest(".country-card");
  if (card) {
    const isOpen = card.classList.toggle("open");
    headerEl.setAttribute("aria-expanded", String(isOpen));
    const body = card.querySelector(".country-body");
    if (body) {
      body.inert = !isOpen;
      body.setAttribute("aria-hidden", String(!isOpen));
      headerEl.setAttribute("aria-controls", body.id);
    }
  }
}
window.toggleCountryCard = toggleCountryCard;

function renderHome() {
  const countryCardsHtml = COUNTRIES.map((c, idx) => {
    const leaguesInCountry = c.leagues.map(id => LEAGUES.find(l => l.id === id)).filter(Boolean);
    const countText = `${leaguesInCountry.length} ${leaguesInCountry.length === 1 ? 'Competição' : 'Competições'}`;
    const previewLogos = leaguesInCountry.map(l => `<img src="https://media.api-sports.io/football/leagues/${l.id}.png" alt="" style="width:20px;height:20px;object-fit:contain;" data-image-fallback="hide">`).join('');

    return `
      <div class="country-card ${idx === 0 ? 'open' : ''}" data-country="${c.id}">
        <div class="country-header" data-action="country" role="button" tabindex="0" aria-expanded="${idx === 0}" aria-controls="country-body-${c.id}">
          <div class="country-flag-icon"><img class="country-flag-img" src="${c.flagImg}" alt="${escapeHtml(c.name)}" loading="lazy"></div>
          <div class="country-info">
            <h3 class="country-name">${escapeHtml(c.name)}</h3>
            <div style="display:flex;align-items:center;gap:8px;margin-top:3px;">
              <span class="country-badge-count">${countText}</span>
              <div style="display:flex;align-items:center;gap:5px;opacity:0.85;">${previewLogos}</div>
            </div>
          </div>
          <div class="country-chevron">▼</div>
        </div>
        <div class="country-body" id="country-body-${c.id}" aria-hidden="${idx !== 0}" ${idx !== 0 ? 'inert' : ''}>
          ${leaguesInCountry.map(l => `
            <a class="league-sub-item" href="#/liga/${l.id}/${defaultSeasonFor(l)}">
              <img class="league-sub-logo" src="https://media.api-sports.io/football/leagues/${l.id}.png" alt="" loading="lazy" data-image-fallback="hide">
              <div class="league-sub-details">
                <span class="league-sub-name">${escapeHtml(l.name)}</span>
                <span class="league-sub-type">${l.isCup ? '🏆 Copa Mata-Mata' : '📊 Pontos Corridos'}</span>
              </div>
              <span class="league-sub-arrow">→</span>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  app.innerHTML = `
    <div class="page-head">
      <p class="page-eyebrow">Competições Oficiais</p>
      <h1 class="page-title">Escolha um País ou Região</h1>
      <p class="page-sub">Clique no país para expandir e escolher a liga nacional, copa ou torneio continental com estatísticas completas.</p>
    </div>
    <div class="country-accordion-grid">
      ${countryCardsHtml}
    </div>
  `;
}

// ============================================================
// COLUNA LATERAL WEB: TOP 5 ARTILHEIROS, ASSISTÊNCIAS E JOGOS SEM SOFRER GOL
// ============================================================

function computeTopCleanSheets(fixtures) {
  if (!Array.isArray(fixtures) || !fixtures.length) return [];
  const finished = fixtures.filter(f => ['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short));
  if (!finished.length) return [];

  const map = new Map();
  finished.forEach(f => {
    const h = f.teams?.home;
    const a = f.teams?.away;
    const gh = f.goals?.home;
    const ga = f.goals?.away;
    if (!h?.id || !a?.id || gh === null || ga === null || gh === undefined || ga === undefined) return;

    if (!map.has(h.id)) map.set(h.id, { id: h.id, name: h.name, logo: h.logo, cleanSheets: 0, matches: 0, goalsAgainst: 0 });
    if (!map.has(a.id)) map.set(a.id, { id: a.id, name: a.name, logo: a.logo, cleanSheets: 0, matches: 0, goalsAgainst: 0 });

    const sh = map.get(h.id);
    const sa = map.get(a.id);

    sh.matches++;
    sh.goalsAgainst += ga;
    if (ga === 0) sh.cleanSheets++;

    sa.matches++;
    sa.goalsAgainst += gh;
    if (gh === 0) sa.cleanSheets++;
  });

  return Array.from(map.values())
    .sort((a, b) => {
      if (b.cleanSheets !== a.cleanSheets) return b.cleanSheets - a.cleanSheets;
      if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
      return a.matches - b.matches;
    })
    .slice(0, 5);
}

function renderLeagueSidebarSkeleton() {
  return `
    <div class="sidebar-stat-card">
      <div class="skeleton" style="height:20px;width:55%;margin-bottom:12px;border-radius:4px;"></div>
      <div class="skeleton" style="height:76px;width:100%;margin-bottom:12px;border-radius:var(--radius-sm);"></div>
      <div class="skeleton" style="height:38px;width:100%;margin-bottom:8px;border-radius:4px;"></div>
      <div class="skeleton" style="height:38px;width:100%;border-radius:4px;"></div>
    </div>
    <div class="sidebar-stat-card">
      <div class="skeleton" style="height:20px;width:55%;margin-bottom:12px;border-radius:4px;"></div>
      <div class="skeleton" style="height:76px;width:100%;margin-bottom:12px;border-radius:var(--radius-sm);"></div>
      <div class="skeleton" style="height:38px;width:100%;border-radius:4px;"></div>
    </div>
  `;
}

function renderLeagueSidebar(leagueId, season, fixtures, scorers = [], assists = []) {
  const cleanSheets = computeTopCleanSheets(fixtures);

  // 1. Artilheiros (Top 5)
  const topScorersList = Array.isArray(scorers) ? scorers.slice(0, 5) : [];
  const scorerLeader = topScorersList[0];
  const scorerOthers = topScorersList.slice(1);

  // 2. Assistências (Top 5)
  const topAssistsList = Array.isArray(assists) ? assists.slice(0, 5) : [];
  const assistLeader = topAssistsList[0];
  const assistOthers = topAssistsList.slice(1);

  // 3. Jogos Sem Sofrer Gol (Top 5)
  const csLeader = cleanSheets[0];
  const csOthers = cleanSheets.slice(1);

  return `
    <!-- Card Artilharia -->
    <div class="sidebar-stat-card gold">
      <div class="sidebar-stat-header">
        <span class="sidebar-stat-title">⚽ Top 5 Artilheiros</span>
        <a href="#/liga/${leagueId}/${season}/artilheiros" class="sidebar-stat-more" title="Ver ranking completo">Ver todos →</a>
      </div>

      ${scorerLeader ? `
        <a class="sidebar-leader-hero gold" href="#/jogador/${scorerLeader.player?.id}/${scorerLeader.statistics?.[0]?.team?.id || 0}/${leagueId}/${season}" title="Ver perfil de ${escapeHtml(scorerLeader.player?.name || '')}">
          <div class="sidebar-leader-badge gold">👑 1º LUGAR · ARTILHEIRO</div>
          <div class="sidebar-leader-body">
            <div class="sidebar-leader-avatar-wrap gold">
              <img src="${scorerLeader.player?.photo}" alt="" loading="lazy" data-image-fallback="hide">
            </div>
            <div class="sidebar-leader-info">
              <span class="sidebar-leader-name">${escapeHtml(scorerLeader.player?.name || '-')}</span>
              <span class="sidebar-leader-team">${escapeHtml(formatTeamName(scorerLeader.statistics?.[0]?.team?.name || ''))}</span>
            </div>
            <div class="sidebar-stat-pill gold">
              <strong>${scorerLeader.statistics?.[0]?.goals?.total ?? 0}</strong>
              <small>gols</small>
            </div>
          </div>
        </a>
      ` : `<p class="sidebar-stat-empty">Sem dados de artilharia disponíveis.</p>`}

      ${scorerOthers.length ? `
        <div class="sidebar-rank-list">
          ${scorerOthers.map((item, idx) => {
            const p = item.player || {};
            const s = item.statistics?.[0] || {};
            return `
              <a class="sidebar-rank-row" href="#/jogador/${p.id}/${s.team?.id || 0}/${leagueId}/${season}" title="Ver estatísticas">
                <span class="sidebar-rank-num">${idx + 2}</span>
                <img class="sidebar-rank-thumb" src="${p.photo}" alt="" loading="lazy">
                <div class="sidebar-rank-details">
                  <span class="sidebar-rank-name">${escapeHtml(p.name || '-')}</span>
                  <span class="sidebar-rank-sub">${escapeHtml(formatTeamName(s.team?.name || ''))}</span>
                </div>
                <span class="sidebar-rank-val gold">${s.goals?.total ?? 0}</span>
              </a>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>

    <!-- Card Assistências -->
    <div class="sidebar-stat-card cyan">
      <div class="sidebar-stat-header">
        <span class="sidebar-stat-title">👟 Top 5 Assistências</span>
        <a href="#/liga/${leagueId}/${season}/artilheiros" class="sidebar-stat-more" title="Ver ranking completo">Ver todos →</a>
      </div>

      ${assistLeader ? `
        <a class="sidebar-leader-hero cyan" href="#/jogador/${assistLeader.player?.id}/${assistLeader.statistics?.[0]?.team?.id || 0}/${leagueId}/${season}" title="Ver perfil de ${escapeHtml(assistLeader.player?.name || '')}">
          <div class="sidebar-leader-badge cyan">👟 1º LUGAR · ASSISTÊNCIAS</div>
          <div class="sidebar-leader-body">
            <div class="sidebar-leader-avatar-wrap cyan">
              <img src="${assistLeader.player?.photo}" alt="" loading="lazy" data-image-fallback="hide">
            </div>
            <div class="sidebar-leader-info">
              <span class="sidebar-leader-name">${escapeHtml(assistLeader.player?.name || '-')}</span>
              <span class="sidebar-leader-team">${escapeHtml(formatTeamName(assistLeader.statistics?.[0]?.team?.name || ''))}</span>
            </div>
            <div class="sidebar-stat-pill cyan">
              <strong>${assistLeader.statistics?.[0]?.goals?.assists ?? 0}</strong>
              <small>assist.</small>
            </div>
          </div>
        </a>
      ` : `<p class="sidebar-stat-empty">Sem dados de assistências disponíveis.</p>`}

      ${assistOthers.length ? `
        <div class="sidebar-rank-list">
          ${assistOthers.map((item, idx) => {
            const p = item.player || {};
            const s = item.statistics?.[0] || {};
            return `
              <a class="sidebar-rank-row" href="#/jogador/${p.id}/${s.team?.id || 0}/${leagueId}/${season}" title="Ver estatísticas">
                <span class="sidebar-rank-num">${idx + 2}</span>
                <img class="sidebar-rank-thumb" src="${p.photo}" alt="" loading="lazy">
                <div class="sidebar-rank-details">
                  <span class="sidebar-rank-name">${escapeHtml(p.name || '-')}</span>
                  <span class="sidebar-rank-sub">${escapeHtml(formatTeamName(s.team?.name || ''))}</span>
                </div>
                <span class="sidebar-rank-val cyan">${s.goals?.assists ?? 0}</span>
              </a>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>

    <!-- Card Jogos Sem Sofrer Gol -->
    <div class="sidebar-stat-card green">
      <div class="sidebar-stat-header">
        <span class="sidebar-stat-title">🧤 Top 5 Sem Sofrer Gol</span>
      </div>

      ${csLeader ? `
        <a class="sidebar-leader-hero green" href="#/time/${csLeader.id}/${leagueId}/${season}" title="Ver estatísticas do ${escapeHtml(csLeader.name || '')}">
          <div class="sidebar-leader-badge green">🧤 1º LUGAR · DEFESA MENOS VAZADA</div>
          <div class="sidebar-leader-body">
            <div class="sidebar-leader-avatar-wrap green">
              <img src="${csLeader.logo}" alt="" loading="lazy" style="border-radius:4px;object-fit:contain;">
            </div>
            <div class="sidebar-leader-info">
              <span class="sidebar-leader-name">${escapeHtml(formatTeamName(csLeader.name || '-'))}</span>
              <span class="sidebar-leader-team">${csLeader.matches} partidas disputadas</span>
            </div>
            <div class="sidebar-stat-pill green">
              <strong>${csLeader.cleanSheets}</strong>
              <small>jogos</small>
            </div>
          </div>
        </a>
      ` : `<p class="sidebar-stat-empty">Sem dados de partidas finalizadas no momento.</p>`}

      ${csOthers.length ? `
        <div class="sidebar-rank-list">
          ${csOthers.map((item, idx) => {
            return `
              <a class="sidebar-rank-row" href="#/time/${item.id}/${leagueId}/${season}" title="Ver time">
                <span class="sidebar-rank-num">${idx + 2}</span>
                <img class="sidebar-rank-thumb" src="${item.logo}" alt="" loading="lazy" style="border-radius:4px;object-fit:contain;">
                <div class="sidebar-rank-details">
                  <span class="sidebar-rank-name">${escapeHtml(formatTeamName(item.name || '-'))}</span>
                  <span class="sidebar-rank-sub">${item.matches} jogos</span>
                </div>
                <span class="sidebar-rank-val green">${item.cleanSheets}</span>
              </a>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ============================================================
// View: Liga — Classificação
// ============================================================
async function renderLeague(leagueId, season) {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const league = LEAGUES.find(l => l.id === leagueId) || { id: leagueId, name: "Liga", country: "" };
  season = season || defaultSeasonFor(league);

  app.innerHTML = `
    ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: league.name, href: `#/liga/${leagueId}/${season}` }])}
    <div class="page-head">
      <p class="page-eyebrow">${escapeHtml(league.country)}</p>
      <h1 class="page-title">${escapeHtml(league.name)}</h1>
    </div>

    <div class="season-row">
      <div class="season-row-controls">
        <label for="season-select">Temporada</label>
        <select id="season-select">
          ${[season + 1, season, season - 1, season - 2].map(y => `<option value="${y}" ${y === season ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </div>
      <a class="btn ghost small" href="#/compare">Ir para Comparação →</a>
    </div>

    ${subNav([
      { label: "Classificação", href: `#/liga/${leagueId}/${season}`, active: true },
      { label: "Jogos", href: `#/liga/${leagueId}/${season}/jogos` },
      { label: "Rankings", href: `#/liga/${leagueId}/${season}/artilheiros` },
    ])}

    <div class="league-desktop-layout">
      <div class="league-main-column">
        <div class="table-filter-group" id="table-filters">
          <button class="table-filter-btn ${state.currentTableFilter === 'all' ? 'active' : ''}" data-filter="all">Geral</button>
          <button class="table-filter-btn ${state.currentTableFilter === 'home' ? 'active' : ''}" data-filter="home">Mandante</button>
          <button class="table-filter-btn ${state.currentTableFilter === 'away' ? 'active' : ''}" data-filter="away">Visitante</button>
        </div>

        <div id="league-content">${skeletonTable()}</div>
      </div>

      <aside class="league-sidebar-column" id="league-desktop-sidebar">
        ${renderLeagueSidebarSkeleton()}
      </aside>
    </div>
  `;

  document.getElementById("season-select").addEventListener("change", (e) => {
    location.hash = `#/liga/${leagueId}/${e.target.value}`;
  });

  document.getElementById("table-filters").addEventListener("click", (e) => {
    const btn = e.target.closest(".table-filter-btn");
    if (!btn) return;
    state.currentTableFilter = btn.dataset.filter;
    document.querySelectorAll(".table-filter-btn").forEach(b => b.classList.toggle("active", b === btn));
    renderStandingsFromCache(leagueId, season);
  });

  await renderStandingsFromCache(leagueId, season);
}

async function renderStandingsFromCache(leagueId, season) {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const content = document.getElementById("league-content");
  const sidebar = document.getElementById("league-desktop-sidebar");
  try {
    const fetchPromises = [
      apiGet("standings", { league: leagueId, season }, 5),
      apiGet("fixtures", { league: leagueId, season }, 5).catch(() => [])
    ];

    if (sidebar) {
      fetchPromises.push(apiGet("players/topscorers", { league: leagueId, season }, 30).catch(() => []));
      fetchPromises.push(apiGet("players/topassists", { league: leagueId, season }, 30).catch(() => []));
    }

    const [standingsResp, fixturesResp, scorersResp = [], assistsResp = []] = await Promise.all(fetchPromises);

    const officialStandings = Array.isArray(standingsResp?.[0]?.league?.standings) ? standingsResp[0].league.standings : [];
    if (!officialStandings.length || !officialStandings[0]) {
      content.innerHTML = `<div class="card" style="text-align:center;color:var(--chalk-dim);padding:30px;">Sem tabela de pontos corridos nesta competição (formato mata-mata). Acesse a aba <strong>Jogos</strong> para ver os confrontos de Ida e Volta.</div>`;
      if (sidebar) {
        sidebar.innerHTML = renderLeagueSidebar(leagueId, season, filterSeniorNationalFixtures(fixturesResp), scorersResp, assistsResp);
      }
      return;
    }

    const allFixtures = preprocessLeagueFixtures(filterSeniorNationalFixtures(fixturesResp));
    const finishedFixtures = allFixtures.filter(f => ['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short));

    let tablesToRender = officialStandings;

    // Se houver jogos finalizados, reconcilia a tabela aplicando as regras oficiais de desempate da liga
    if (finishedFixtures.length > 0) {
      const officialNotes = {};
      officialStandings.flat().forEach(t => {
        officialNotes[t.team.id] = {
          description: t.description,
          group: t.group
        };
      });

      const isMultiGroup = officialStandings.length > 1;
      if (isMultiGroup) {
        tablesToRender = officialStandings.map(groupTable => {
          const groupTeamIds = new Set(groupTable.map(t => t.team.id));
          const groupFinished = finishedFixtures.filter(f => groupTeamIds.has(f.teams.home.id) && groupTeamIds.has(f.teams.away.id));
          return computeTableFromFixtures(groupFinished, groupTable, officialNotes, leagueId);
        });
      } else {
        tablesToRender = [computeTableFromFixtures(finishedFixtures, officialStandings[0], officialNotes, leagueId)];
      }
    }

    content.innerHTML = tablesToRender.map((table, gi) => 
      renderStandingsTable(table, leagueId, season, tablesToRender.length > 1 ? `Grupo ${gi + 1}` : null, state.currentTableFilter, finishedFixtures)
    ).join("");

    // Renderiza a coluna lateral na versão desktop
    if (sidebar && sidebar.dataset.loadedLeague !== `${leagueId}-${season}`) {
      sidebar.dataset.loadedLeague = `${leagueId}-${season}`;
      sidebar.innerHTML = renderLeagueSidebar(leagueId, season, allFixtures, scorersResp, assistsResp);
    }
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

// ============================================================
// MOTOR DE CRITÉRIOS DE DESEMPATE OFICIAIS POR COMPETIÇÃO
// ============================================================

/**
 * Ordena a tabela de classificação de acordo com o regulamento oficial de cada liga:
 * 
 * 🇧🇷 Brasileirão Série A / Série B (71, 72):
 *    1º Pontos | 2º Vitórias | 3º Saldo de Gols | 4º Gols Pró | 5º Confronto Direto
 * 
 * 🇪🇸 La Liga (140), 🇮🇹 Serie A (135), 🇸🇦 Liga Saudita (307):
 *    1º Pontos | 2º Confronto Direto (Pts) | 3º Saldo no Confronto | 4º Saldo de Gols Geral | 5º Gols Pró | 6º Vitórias
 * 
 * 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League (39), 🇩🇪 Bundesliga (78), 🇫🇷 Ligue 1 (61), 🏆 UEFA (2, 3, 4), 🌎 CONMEBOL (13, 11):
 *    1º Pontos | 2º Saldo de Gols Geral | 3º Gols Pró Geral | 4º Confronto Direto | 5º Gols Fora de Casa | 6º Vitórias
 */
function sortStandingsByLeagueRules(table, leagueId, fixtures = [], filter = "all") {
  const isBrazil = (leagueId === 71 || leagueId === 72 || leagueId === 73);
  const isHeadToHeadFirst = (leagueId === 140 || leagueId === 135 || leagueId === 307);

  const getStats = (t) => {
    if (filter === "home") {
      const p = t.home || { win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } };
      return {
        pts: (p.win * 3 + p.draw),
        win: p.win,
        gf: p.goals.for,
        ga: p.goals.against,
        diff: p.goals.for - p.goals.against,
        awayGf: 0,
        awayWins: 0
      };
    }
    if (filter === "away") {
      const p = t.away || { win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } };
      return {
        pts: (p.win * 3 + p.draw),
        win: p.win,
        gf: p.goals.for,
        ga: p.goals.against,
        diff: p.goals.for - p.goals.against,
        awayGf: p.goals.for,
        awayWins: p.win
      };
    }
    const a = t.all || { win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } };
    const aw = t.away || { win: 0, goals: { for: 0 } };
    return {
      pts: t.points || 0,
      win: a.win || 0,
      gf: a.goals.for || 0,
      ga: a.goals.against || 0,
      diff: (a.goals.for || 0) - (a.goals.against || 0),
      awayGf: aw.goals.for || 0,
      awayWins: aw.win || 0
    };
  };

  const getHeadToHead = (teamAId, teamBId) => {
    if (!fixtures || !fixtures.length) return { ptsA: 0, ptsB: 0, diffA: 0, diffB: 0, played: 0 };
    const h2h = fixtures.filter(f => 
      (f.teams?.home?.id === teamAId && f.teams?.away?.id === teamBId) ||
      (f.teams?.home?.id === teamBId && f.teams?.away?.id === teamAId)
    );
    let ptsA = 0, ptsB = 0, gfA = 0, gfB = 0;
    h2h.forEach(f => {
      const hGoals = f.goals?.home ?? 0;
      const aGoals = f.goals?.away ?? 0;
      if (f.teams.home.id === teamAId) {
        gfA += hGoals; gfB += aGoals;
        if (hGoals > aGoals) ptsA += 3;
        else if (hGoals === aGoals) { ptsA += 1; ptsB += 1; }
        else ptsB += 3;
      } else {
        gfA += aGoals; gfB += hGoals;
        if (aGoals > hGoals) ptsA += 3;
        else if (hGoals === aGoals) { ptsA += 1; ptsB += 1; }
        else ptsB += 3;
      }
    });
    return { ptsA, ptsB, diffA: gfA - gfB, diffB: gfB - gfA, played: h2h.length };
  };

  return [...table].sort((a, b) => {
    const sA = getStats(a);
    const sB = getStats(b);

    // 1. PONTUAÇÃO (Geral em todas as ligas)
    if (sB.pts !== sA.pts) return sB.pts - sA.pts;

    // === CRITÉRIO BRASIL (Série A & Série B): 1º Vitórias, 2º Saldo de Gols, 3º Gols Pró, 4º Confronto Direto
    if (isBrazil) {
      if (sB.win !== sA.win) return sB.win - sA.win;
      if (sB.diff !== sA.diff) return sB.diff - sA.diff;
      if (sB.gf !== sA.gf) return sB.gf - sA.gf;
      const h2h = getHeadToHead(a.team?.id, b.team?.id);
      if (h2h.played > 0 && h2h.ptsB !== h2h.ptsA) return h2h.ptsB - h2h.ptsA;
      return (a.team?.name || "").localeCompare(b.team?.name || "");
    }

    // === CRITÉRIO ESPANHA / ITÁLIA / SAUDITA: 1º Confronto Direto, 2º Saldo Confronto, 3º Saldo Geral, 4º Gols Pró
    if (isHeadToHeadFirst) {
      const h2h = getHeadToHead(a.team?.id, b.team?.id);
      if (h2h.played > 0 && h2h.ptsB !== h2h.ptsA) return h2h.ptsB - h2h.ptsA;
      if (h2h.played > 0 && h2h.diffB !== h2h.diffA) return h2h.diffB - h2h.diffA;
      if (sB.diff !== sA.diff) return sB.diff - sA.diff;
      if (sB.gf !== sA.gf) return sB.gf - sA.gf;
      if (sB.win !== sA.win) return sB.win - sA.win;
      return (a.team?.name || "").localeCompare(b.team?.name || "");
    }

    // === CRITÉRIO PREMIER LEAGUE / BUNDESLIGA / LIGUE 1 / UEFA: 1º Saldo de Gols Geral, 2º Gols Pró, 3º Confronto Direto, 4º Gols Fora
    if (sB.diff !== sA.diff) return sB.diff - sA.diff;
    if (sB.gf !== sA.gf) return sB.gf - sA.gf;
    const h2h = getHeadToHead(a.team?.id, b.team?.id);
    if (h2h.played > 0 && h2h.ptsB !== h2h.ptsA) return h2h.ptsB - h2h.ptsA;
    if (sB.awayGf !== sA.awayGf) return sB.awayGf - sA.awayGf;
    if (sB.win !== sA.win) return sB.win - sA.win;
    return (a.team?.name || "").localeCompare(b.team?.name || "");
  });
}

function computeTableFromFixtures(fixtures, templateTable, officialNotes, leagueId) {
  const teamsMap = {};

  templateTable.forEach(t => {
    teamsMap[t.team.id] = {
      team: { id: t.team.id, name: t.team.name, logo: t.team.logo },
      all: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } },
      home: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } },
      away: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } },
      points: 0,
      form: '',
      matches: [],
      description: officialNotes[t.team.id]?.description || null,
      group: officialNotes[t.team.id]?.group || null
    };
  });

  fixtures.forEach(fx => {
    const homeId = fx.teams?.home?.id;
    const awayId = fx.teams?.away?.id;
    const homeGoals = fx.goals?.home;
    const awayGoals = fx.goals?.away;

    if (homeGoals === null || homeGoals === undefined || awayGoals === null || awayGoals === undefined) return;
    if (!teamsMap[homeId] || !teamsMap[awayId]) return;

    const h = teamsMap[homeId];
    const a = teamsMap[awayId];

    h.all.played++;
    h.home.played++;
    h.all.goals.for += homeGoals;
    h.all.goals.against += awayGoals;
    h.home.goals.for += homeGoals;
    h.home.goals.against += awayGoals;

    a.all.played++;
    a.away.played++;
    a.all.goals.for += awayGoals;
    a.all.goals.against += homeGoals;
    a.away.goals.for += awayGoals;
    a.away.goals.against += homeGoals;

    const date = new Date(fx.fixture.date);

    if (homeGoals > awayGoals) {
      h.all.win++;
      h.home.win++;
      h.points += 3;
      h.matches.push({ date, res: 'W' });

      a.all.lose++;
      a.away.lose++;
      a.matches.push({ date, res: 'L' });
    } else if (homeGoals === awayGoals) {
      h.all.draw++;
      h.home.draw++;
      h.points += 1;
      h.matches.push({ date, res: 'D' });

      a.all.draw++;
      a.away.draw++;
      a.points += 1;
      a.matches.push({ date, res: 'D' });
    } else {
      h.all.lose++;
      h.home.lose++;
      h.matches.push({ date, res: 'L' });

      a.all.win++;
      a.away.win++;
      a.points += 3;
      a.matches.push({ date, res: 'W' });
    }
  });

  const result = Object.values(teamsMap);
  result.forEach(t => {
    t.matches.sort((m1, m2) => m1.date - m2.date);
    t.form = t.matches.map(m => m.res).join('');
  });

  return sortStandingsByLeagueRules(result, leagueId, fixtures, "all");
}

function renderStandingsTable(table, leagueId, season, groupLabel, filter = "all", finishedFixtures = []) {
  const sortedTable = sortStandingsByLeagueRules(table, leagueId, finishedFixtures, filter);

  const rows = sortedTable.map((row, idx) => {
    const stat = filter === "home" ? row.home : filter === "away" ? row.away : row.all;
    const pts = filter === "all" ? row.points : (stat.win * 3 + stat.draw);
    const diff = stat.goals.for - stat.goals.against;
    
    const formPills = (row.form || "").split("").slice(-5).map(c => 
      `<span class="form-pill ${c}" title="${c}">${c}</span>`
    ).join("");

    return `
      <tr data-team-id="${row.team.id}" data-league-id="${leagueId}" data-season="${season}">
        <td class="pos-cell">${idx + 1}</td>
        <td class="team-cell">
          <div class="team-cell-inner">
            <img src="${row.team.logo}" alt="" loading="lazy">
            <span>${escapeHtml(row.team.name)}</span>
          </div>
        </td>
        <td>${stat.played}</td>
        <td>${stat.win}</td>
        <td>${stat.draw}</td>
        <td>${stat.lose}</td>
        <td>${stat.goals.for}</td>
        <td>${stat.goals.against}</td>
        <td>${diff > 0 ? "+" : ""}${diff}</td>
        <td><strong>${pts}</strong></td>
        <td>${formPills}</td>
      </tr>`;
  }).join("");

  return `
    ${groupLabel ? `<h2 class="section-title">${groupLabel}</h2>` : ""}
    <div class="table-container">
      <table class="standings-table">
        <thead>
          <tr>
            <th class="pos-cell">#</th>
            <th class="team-cell">Time</th>
            <th>J</th><th>V</th><th>E</th><th>D</th>
            <th>GP</th><th>GC</th><th>SG</th><th>Pts</th><th>Últ. 5</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ============================================================
// View: Liga — Jogos
// ============================================================
async function renderLeagueFixtures(leagueId, season) {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const league = LEAGUES.find(l => l.id === leagueId) || { id: leagueId, name: "Liga", country: "", isCup: false };
  app.innerHTML = `
    ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: league.name, href: `#/liga/${leagueId}/${season}` }, { label: "Jogos", href: "" }])}
    <div class="page-head">
      <p class="page-eyebrow">${escapeHtml(league.country)}</p>
      <h1 class="page-title">${escapeHtml(league.name)}</h1>
    </div>
    ${subNav([
      { label: "Classificação", href: `#/liga/${leagueId}/${season}` },
      { label: "Jogos", href: `#/liga/${leagueId}/${season}/jogos`, active: true },
      { label: "Rankings", href: `#/liga/${leagueId}/${season}/artilheiros` },
    ])}
    <div id="fx-content">${skeletonTable()}</div>
  `;

  const content = document.getElementById("fx-content");
  try {
    const rawFixtures = await apiGet("fixtures", { league: leagueId, season }, 15);
    const allFixtures = preprocessLeagueFixtures(filterSeniorNationalFixtures(rawFixtures));

    if (!allFixtures || !allFixtures.length) {
      content.innerHTML = `<div class="card"><p style="color:var(--chalk-dim);">Nenhum jogo cadastrado para esta temporada.</p></div>`;
      return;
    }

    const uniqueRoundsMap = new Map();
    allFixtures.forEach(f => {
      const formattedTitle = formatRoundName(f.league?.round);
      if (!uniqueRoundsMap.has(formattedTitle)) {
        uniqueRoundsMap.set(formattedTitle, f.league?.round);
      }
    });

    const uniqueRoundTitles = Array.from(uniqueRoundsMap.keys()).sort((a, b) => {
      return extractRoundNumber(a) - extractRoundNumber(b);
    });

    const roundOptions = uniqueRoundTitles.map(title => `
      <option value="${escapeHtml(title)}">${escapeHtml(title)}</option>
    `).join("");

    content.innerHTML = `
      ${uniqueRoundTitles.length > 1 ? `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;background:var(--glass-bg);border:1px solid var(--glass-border);padding:12px 16px;border-radius:var(--radius);">
          <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);font-weight:700;">FILTRAR RODADA:</span>
          <select id="select-league-round" style="background:var(--pitch-card);border:1px solid var(--line-strong);color:var(--chalk);padding:6px 12px;border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:0.82rem;">
            <option value="ALL">Todas as Rodadas</option>
            ${roundOptions}
          </select>
        </div>
      ` : ""}
      <div id="rounds-container">${renderGroupedFixtures(allFixtures, league.isCup)}</div>
    `;

    const selectEl = document.getElementById("select-league-round");
    if (selectEl) {
      selectEl.addEventListener("change", (e) => {
        const val = e.target.value;
        const filtered = val === "ALL" ? allFixtures : allFixtures.filter(f => formatRoundName(f.league.round) === val);
        document.getElementById("rounds-container").innerHTML = renderGroupedFixtures(filtered, league.isCup);
      });
    }
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderGroupedFixtures(fixtures, isCup = false) {
  if (!fixtures || !fixtures.length) {
    return `
      <div class="card" style="text-align:center;padding:36px 20px;color:var(--chalk-dim);">
        <span style="font-size:2rem;display:block;margin-bottom:8px;">🏆</span>
        <p style="margin:0;font-weight:700;font-size:1rem;color:var(--chalk);">Confronto ainda não definido</p>
        <span style="font-size:0.82rem;color:var(--chalk-dim);margin-top:6px;display:block;">Os times e datas desta fase serão confirmados após o encerramento das etapas anteriores.</span>
      </div>`;
  }

  const pairOccurrences = {};
  if (isCup) {
    fixtures.forEach(f => {
      const rName = f.league?.round || "";
      if (!/Group Stage|League Stage|Fase de Grupos|Fase de Liga|Rodada/i.test(rName)) {
        const tA = Math.min(f.teams.home.id, f.teams.away.id);
        const tB = Math.max(f.teams.home.id, f.teams.away.id);
        const key = `${tA}-${tB}`;
        pairOccurrences[key] = (pairOccurrences[key] || 0) + 1;
      }
    });
  }

  const pairCountSeen = {};
  const groups = {};
  fixtures.forEach(f => {
    let roundTitle = formatRoundName(f.league?.round);
    if (!groups[roundTitle]) groups[roundTitle] = [];
    groups[roundTitle].push(f);
  });

  const sortedGroupKeys = Object.keys(groups).sort((a, b) => extractRoundNumber(a) - extractRoundNumber(b));

  return sortedGroupKeys.map(roundTitle => {
    const list = groups[roundTitle];

    // Agrupa os jogos da rodada por data
    const dateGroups = {};
    list.forEach(f => {
      const d = new Date(f.fixture.date);
      const dateKey = d.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
      });
      const formattedDateKey = dateKey.charAt(0).toUpperCase() + dateKey.slice(1);
      if (!dateGroups[formattedDateKey]) dateGroups[formattedDateKey] = [];
      dateGroups[formattedDateKey].push(f);
    });

    const sortedDates = Object.keys(dateGroups).sort((a, b) => {
      const tA = dateGroups[a]?.[0]?.fixture?.date ? new Date(dateGroups[a][0].fixture.date).getTime() : 0;
      const tB = dateGroups[b]?.[0]?.fixture?.date ? new Date(dateGroups[b][0].fixture.date).getTime() : 0;
      return tA - tB;
    });

    return `
      <div class="fixture-group-section">
        <div class="fixture-round-header">
          <span>🏆</span>
          <span class="round-title-text">${escapeHtml(roundTitle)}</span>
        </div>
        <div class="card" style="padding:10px;">
          ${sortedDates.map((dateHeader, dIdx) => {
            const dayMatches = dateGroups[dateHeader];
            return `
              ${sortedDates.length > 1 ? `
                <div class="fixture-date-divider" style="${dIdx === 0 ? 'margin-top:2px;' : 'margin-top:16px;'}">
                  <span class="date-icon">📅</span>
                  <span class="date-text">${escapeHtml(dateHeader)}</span>
                </div>
              ` : ''}
              <div class="fixture-list" style="margin-bottom:${dIdx === sortedDates.length - 1 ? '0' : '8px'};">
                ${dayMatches.map(f => {
                  const rawRound = f.league?.round || "";
                  let legBadge = "";
                  const isKnockout = isCup && !/Group Stage|League Stage|Fase de Grupos|Fase de Liga|Rodada/i.test(rawRound);
                  if (isKnockout) {
                    if (/[-_ ]1$|\b1st leg\b|\bida\b/i.test(rawRound)) {
                      legBadge = `<span class="leg-badge ida">IDA</span>`;
                    } else if (/[-_ ]2$|\b2nd leg\b|\bvolta\b/i.test(rawRound)) {
                      legBadge = `<span class="leg-badge volta">VOLTA</span>`;
                    } else {
                      const tA = Math.min(f.teams.home.id, f.teams.away.id);
                      const tB = Math.max(f.teams.home.id, f.teams.away.id);
                      const key = `${tA}-${tB}`;
                      if (pairOccurrences[key] > 1) {
                        pairCountSeen[key] = (pairCountSeen[key] || 0) + 1;
                        legBadge = pairCountSeen[key] === 1 
                          ? `<span class="leg-badge ida">IDA</span>` 
                          : `<span class="leg-badge volta">VOLTA</span>`;
                      }
                    }
                  }

                  const statusInfo = getMatchStatusCategory(f.fixture);
                  const isMatchLive = statusInfo.isLive;
                  const played = isMatchLive || statusInfo.isFinished;
                  const dateDisplay = isMatchLive
                    ? `<span class="fixture-date" style="color:#10B981;font-weight:700;">🔴 ${statusInfo.label}</span>`
                    : (statusInfo.isPostponed
                        ? `<span class="fixture-date" style="color:#F59E0B;font-weight:600;">${statusInfo.label}</span>`
                        : (statusInfo.isFinished
                            ? `<span class="fixture-date" style="color:var(--chalk-dim);font-weight:600;">${statusInfo.short}</span>`
                            : `<span class="fixture-date">${date}<br>${time}</span>`));

                  return `
                    <a class="fixture-row match-fixture-row" href="#/jogo/${f.fixture.id}" title="Clique para ver estatísticas da partida">
                      <div class="fixture-date-col">
                        ${dateDisplay}
                        ${legBadge}
                      </div>

                      <div class="fixture-team-item right">
                        <span>${escapeHtml(f.teams.home.name)}</span>
                        <img src="${f.teams.home.logo}" alt="" loading="lazy">
                      </div>

                      <span class="fixture-score">${played ? `${f.goals.home ?? "-"} : ${f.goals.away ?? "-"}` : "vs"}</span>

                      <div class="fixture-team-item">
                        <img src="${f.teams.away.logo}" alt="" loading="lazy">
                        <span>${escapeHtml(f.teams.away.name)}</span>
                      </div>
                    </a>`;
                }).join("")}
              </div>
            `;
          }).join("")}
        </div>
      </div>`;
  }).join("");
}

async function renderLeagueTopStats(leagueId, season) {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const league = LEAGUES.find(l => l.id === leagueId) || { id: leagueId, name: "Liga", country: "" };
  app.innerHTML = `
    ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: league.name, href: `#/liga/${leagueId}/${season}` }, { label: "Rankings", href: "" }])}
    <div class="page-head">
      <p class="page-eyebrow">${escapeHtml(league.country)}</p>
      <h1 class="page-title">${escapeHtml(league.name)}</h1>
    </div>
    ${subNav([
      { label: "Classificação", href: `#/liga/${leagueId}/${season}` },
      { label: "Jogos", href: `#/liga/${leagueId}/${season}/jogos` },
      { label: "Rankings", href: `#/liga/${leagueId}/${season}/artilheiros`, active: true },
    ])}
    <div id="top-content">${skeletonTable()}</div>
  `;

  const content = document.getElementById("top-content");
  try {
    const [scorers, assists, yellows] = await Promise.all([
      apiGet("players/topscorers", { league: leagueId, season }, 30),
      apiGet("players/topassists", { league: leagueId, season }, 30),
      apiGet("players/topyellowcards", { league: leagueId, season }, 30),
    ]);

    content.innerHTML = `
      <h2 class="section-title">Artilharia</h2>
      <div class="card" style="margin-bottom:20px;">${renderTopList(scorers, s => `${s.goals.total} gols`, leagueId, season)}</div>
      <h2 class="section-title">Assistências</h2>
      <div class="card" style="margin-bottom:20px;">${renderTopList(assists, s => `${s.goals.assists ?? 0} assist.`, leagueId, season)}</div>
      <h2 class="section-title">Cartões Amarelos</h2>
      <div class="card">${renderTopList(yellows, s => `${s.cards.yellow} cartões`, leagueId, season)}</div>
    `;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderTopList(list, metricFn, leagueId, season) {
  if (!list || !list.length) return `<p style="color:var(--chalk-dim);">Sem estatísticas disponíveis.</p>`;
  return `<div class="fixture-list">
    ${list.slice(0, 10).map((entry, i) => {
      const p = entry.player || { id: 0, name: "-", photo: "" };
      const s = (Array.isArray(entry.statistics) && entry.statistics[0]) ? entry.statistics[0] : { team: { id: 0, name: "-" }, goals: { total: 0, assists: 0 }, cards: { yellow: 0 } };
      return `
        <a class="fixture-row" href="#/jogador/${p.id}/${s.team.id}/${leagueId}/${season}" style="grid-template-columns:30px 40px 1fr auto;" title="Ver estatísticas do jogador">
          <span style="font-family:var(--font-mono);font-weight:700;color:var(--chalk-dim);">${i + 1}</span>
          <img src="${p.photo}" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">
          <div>
            <div style="font-weight:600;">${escapeHtml(p.name)}</div>
            <div style="font-size:0.75rem;color:var(--chalk-dim);">${escapeHtml(s.team.name)}</div>
          </div>
          <span style="font-family:var(--font-mono);color:var(--gold);font-weight:700;">${metricFn(s)}</span>
        </a>`;
    }).join("")}
  </div>`;
}

// ============================================================
// View: Perfil do Jogador
// ============================================================

// ============================================================
// CLASSIFICAÇÃO INTELIGENTE DE FUNÇÃO / POSIÇÃO ESPECÍFICA DO JOGADOR
// ============================================================
