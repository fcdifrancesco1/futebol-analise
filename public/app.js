// ============================================================
// APURAÇÃO — app.js (Refatorado & Otimizado)
// SPA Vanilla JS com Cache Inteligente, Auto-Refresh e Métricas Avançadas
// ============================================================

const FN_URL = "/api/football";

const LEAGUES = [
  { id: 71, name: "Brasileirão Série A", country: "Brasil", calendarYear: true },
  { id: 72, name: "Brasileirão Série B", country: "Brasil", calendarYear: true },
  { id: 13, name: "Copa Libertadores", country: "América do Sul", calendarYear: true },
  { id: 11, name: "Copa Sul-Americana", country: "América do Sul", calendarYear: true },
  { id: 73, name: "Copa do Brasil", country: "Brasil", calendarYear: true },
  { id: 140, name: "La Liga", country: "Espanha", calendarYear: false },
  { id: 39, name: "Premier League", country: "Inglaterra", calendarYear: false },
  { id: 61, name: "Ligue 1", country: "França", calendarYear: false },
  { id: 78, name: "Bundesliga", country: "Alemanha", calendarYear: false },
  { id: 135, name: "Serie A", country: "Itália", calendarYear: false },
  { id: 2, name: "Champions League", country: "UEFA", calendarYear: false },
  { id: 3, name: "Europa League", country: "UEFA", calendarYear: false },
  { id: 4, name: "Conference League", country: "UEFA", calendarYear: false },
];

const POPULAR_TEAMS = [
  { id: 127, name: "Flamengo" },
  { id: 121, name: "Palmeiras" },
  { id: 541, name: "Real Madrid" },
  { id: 529, name: "Barcelona" },
  { id: 50, name: "Man. City" },
  { id: 40, name: "Liverpool" }
];

function defaultSeasonFor(league) {
  const now = new Date();
  const y = now.getFullYear();
  if (!league || league.calendarYear) return y;
  return now.getMonth() < 6 ? y - 1 : y;
}

// ---------- Estado Global & Cache ----------
const state = {
  compareSlots: { a: null, b: null },
  homeSide: null,
  liveTimer: null,
  liveIntervalSeconds: 60,
  currentTableFilter: "all", // 'all' | 'home' | 'away'
};

const apiCache = new Map();

const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
const quotaHint = document.getElementById("quota-hint");
const compareBadge = document.getElementById("compare-badge");

function toast(msg, isError = true) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastEl.style.borderColor = isError ? "var(--terracotta)" : "var(--gold)";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.hidden = true), 4200);
}

function updateCompareBadge() {
  const count = (state.compareSlots.a ? 1 : 0) + (state.compareSlots.b ? 1 : 0);
  if (count > 0) {
    compareBadge.textContent = count;
    compareBadge.hidden = false;
  } else {
    compareBadge.hidden = true;
  }
}

function markUpdated(fromCache = false) {
  quotaHint.textContent = (fromCache ? "⚡ Cache " : "Atualizado ") + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ---------- Requisição com Cache em Memória e SessionStorage ----------
async function apiGet(endpoint, params = {}, ttlMinutes = 15) {
  const clean = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") clean[k] = v;
  });
  const qs = new URLSearchParams({ endpoint, ...clean }).toString();
  const cacheKey = `ap_cache_${endpoint}_${qs}`;

  // Se não for rota ao vivo, tenta memória primeiro
  if (ttlMinutes > 0) {
    const memoryItem = apiCache.get(cacheKey);
    if (memoryItem && Date.now() - memoryItem.timestamp < ttlMinutes * 60 * 1000) {
      markUpdated(true);
      return memoryItem.data;
    }

    try {
      const stored = sessionStorage.getItem(cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.timestamp < ttlMinutes * 60 * 1000) {
          apiCache.set(cacheKey, parsed);
          markUpdated(true);
          return parsed.data;
        }
      }
    } catch { /* sessionStorage indisponível */ }
  }

  const res = await fetch(`${FN_URL}?${qs}`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Resposta inválida do servidor.");
  }
  if (!res.ok) {
    throw new Error(data.error || data.message || `Erro ${res.status} ao consultar dados.`);
  }
  if (data.errors && !Array.isArray(data.errors) && Object.keys(data.errors).length) {
    const firstErr = Object.values(data.errors)[0];
    throw new Error(typeof firstErr === "string" ? firstErr : "A API retornou um erro.");
  }

  if (ttlMinutes > 0) {
    const cacheObj = { data: data.response, timestamp: Date.now() };
    apiCache.set(cacheKey, cacheObj);
    try { sessionStorage.setItem(cacheKey, JSON.stringify(cacheObj)); } catch { /* quota cheia */ }
  }

  markUpdated(false);
  return data.response;
}

// ---------- Componentes Visuais Reutilizáveis ----------
function skeletonTable() {
  return `
    <div class="card skeleton">
      <div class="skeleton-title skeleton"></div>
      <div class="skeleton-box skeleton"></div>
      <div class="skeleton-box skeleton"></div>
    </div>`;
}

function errorBox(msg) {
  return `
    <div class="card" style="text-align:center;padding:40px 20px;">
      <h3 style="color:var(--terracotta);margin-top:0;">Falha ao carregar dados</h3>
      <p style="color:var(--chalk-dim);">${escapeHtml(msg)}</p>
      <button class="btn ghost small" onclick="location.reload()">Tentar novamente</button>
    </div>`;
}

function subNav(items) {
  return `
    <div class="subnav">
      ${items.map(it => `<a class="subnav-item ${it.active ? 'active' : ''}" href="${it.href}">${escapeHtml(it.label)}</a>`).join('')}
    </div>`;
}

function breadcrumbs(crumbs) {
  return `
    <nav class="breadcrumbs" aria-label="Rastro de navegação">
      ${crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return isLast 
          ? `<span>${escapeHtml(c.label)}</span>`
          : `<a href="${c.href}">${escapeHtml(c.label)}</a><span class="breadcrumbs-sep">/</span>`;
      }).join('')}
    </nav>`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ============================================================
// Roteamento
// ============================================================
function parseHash() {
  return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.nav === name));
}

async function router() {
  if (state.liveTimer) {
    clearInterval(state.liveTimer);
    state.liveTimer = null;
  }

  const parts = parseHash();
  window.scrollTo(0, 0);
  updateCompareBadge();

  if (parts[0] === "liga" && parts[1] && parts[3] === "jogos") {
    setActiveTab("home");
    await renderLeagueFixtures(Number(parts[1]), Number(parts[2]));
  } else if (parts[0] === "liga" && parts[1] && parts[3] === "artilheiros") {
    setActiveTab("home");
    await renderLeagueTopStats(Number(parts[1]), Number(parts[2]));
  } else if (parts[0] === "liga" && parts[1]) {
    setActiveTab("home");
    await renderLeague(Number(parts[1]), parts[2] ? Number(parts[2]) : undefined);
  } else if (parts[0] === "time" && parts[1] && parts[2] && parts[4] === "elenco") {
    setActiveTab("home");
    await renderSquad(Number(parts[1]), Number(parts[2]), Number(parts[3]));
  } else if (parts[0] === "time" && parts[1] && parts[2] && parts[4] === "lesoes") {
    setActiveTab("home");
    await renderInjuries(Number(parts[1]), Number(parts[2]), Number(parts[3]));
  } else if (parts[0] === "time" && parts[1] && parts[2]) {
    setActiveTab("home");
    await renderTeam(Number(parts[1]), Number(parts[2]), parts[3] ? Number(parts[3]) : undefined);
  } else if (parts[0] === "jogador" && parts[1]) {
    setActiveTab("home");
    await renderPlayer(Number(parts[1]), Number(parts[2]), Number(parts[3]), Number(parts[4]));
  } else if (parts[0] === "jogo" && parts[1]) {
    setActiveTab("home");
    await renderFixture(Number(parts[1]));
  } else if (parts[0] === "aovivo") {
    setActiveTab("live");
    await renderLive();
  } else if (parts[0] === "compare") {
    setActiveTab("compare");
    renderCompare();
  } else {
    setActiveTab("home");
    renderHome();
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-nav]").forEach(el => {
    el.addEventListener("click", () => {
      const nav = el.dataset.nav;
      if (nav === "home") location.hash = "#/";
      if (nav === "compare") location.hash = "#/compare";
      if (nav === "live") location.hash = "#/aovivo";
    });
  });

  // Delegação Global de Cliques
  app.addEventListener("click", (e) => {
    const standingsRow = e.target.closest(".standings-table tbody tr");
    if (standingsRow && !e.target.closest("button")) {
      const { teamId, leagueId, season } = standingsRow.dataset;
      if (teamId && leagueId && season) {
        location.hash = `#/time/${teamId}/${leagueId}/${season}`;
      }
    }
  });

  router();
});

// ============================================================
// View: Home
// ============================================================
function renderHome() {
  app.innerHTML = `
    <div class="page-head">
      <p class="page-eyebrow">Competições Oficiais</p>
      <h1 class="page-title">Escolha uma Liga</h1>
      <p class="page-sub">Classificação detalhada, desempenho de mandante/visitante, estatísticas avançadas e comparador direto.</p>
    </div>
    <div class="league-grid">
      ${LEAGUES.map(l => `
        <a class="league-card" href="#/liga/${l.id}/${defaultSeasonFor(l)}">
          <img class="league-logo" src="https://media.api-sports.io/football/leagues/${l.id}.png" alt="" loading="lazy" onerror="this.style.display='none'">
          <div class="league-country">${escapeHtml(l.country)}</div>
          <div class="league-name">${escapeHtml(l.name)}</div>
        </a>`
      ).join("")}
    </div>
  `;
}

// ============================================================
// View: Liga — Classificação (com Filtro Geral / Casa / Fora)
// ============================================================
async function renderLeague(leagueId, season) {
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

    <div class="table-filter-group" id="table-filters">
      <button class="table-filter-btn ${state.currentTableFilter === 'all' ? 'active' : ''}" data-filter="all">Geral</button>
      <button class="table-filter-btn ${state.currentTableFilter === 'home' ? 'active' : ''}" data-filter="home">Mandante</button>
      <button class="table-filter-btn ${state.currentTableFilter === 'away' ? 'active' : ''}" data-filter="away">Visitante</button>
    </div>

    <div id="league-content">${skeletonTable()}</div>
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
  const content = document.getElementById("league-content");
  try {
    const response = await apiGet("standings", { league: leagueId, season }, 30);
    const groups = response?.[0]?.league?.standings;
    if (!groups || !groups.length) {
      content.innerHTML = `<div class="card" style="text-align:center;color:var(--chalk-dim);padding:30px;">Sem classificação disponível para esta temporada.</div>`;
      return;
    }
    content.innerHTML = groups.map((table, gi) => 
      renderStandingsTable(table, leagueId, season, groups.length > 1 ? `Grupo ${gi + 1}` : null, state.currentTableFilter)
    ).join("");
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderStandingsTable(table, leagueId, season, groupLabel, filter = "all") {
  // Ordenar conforme o filtro selecionado se for mandante ou visitante
  let sortedTable = [...table];
  if (filter === "home") {
    sortedTable.sort((a, b) => (b.home.win * 3 + b.home.draw) - (a.home.win * 3 + a.home.draw));
  } else if (filter === "away") {
    sortedTable.sort((a, b) => (b.away.win * 3 + b.away.draw) - (a.away.win * 3 + a.away.draw));
  }

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
  const league = LEAGUES.find(l => l.id === leagueId) || { id: leagueId, name: "Liga", country: "" };
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
    const [next, last] = await Promise.all([
      apiGet("fixtures", { league: leagueId, season, next: 10 }, 10),
      apiGet("fixtures", { league: leagueId, season, last: 10 }, 10),
    ]);

    content.innerHTML = `
      <h2 class="section-title">Próximos Jogos</h2>
      <div class="card" style="margin-bottom:20px;">${renderFixtureList(next)}</div>
      <h2 class="section-title">Resultados Recentes</h2>
      <div class="card">${renderFixtureList(last)}</div>
    `;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderFixtureList(fixtures) {
  if (!fixtures || !fixtures.length) return `<p style="color:var(--chalk-dim);">Nenhum jogo registrado.</p>`;
  return `<div class="fixture-list">
    ${fixtures.map(f => {
      const date = new Date(f.fixture.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      const time = new Date(f.fixture.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const played = f.fixture.status.short !== "NS" && f.fixture.status.short !== "TBD";
      return `
        <a class="fixture-row" href="#/jogo/${f.fixture.id}">
          <span class="fixture-date">${date}<br>${time}</span>
          <span class="fixture-team right">${escapeHtml(f.teams.home.name)}</span>
          <span class="fixture-score">${played ? `${f.goals.home ?? "-"} : ${f.goals.away ?? "-"}` : "vs"}</span>
          <span class="fixture-team">${escapeHtml(f.teams.away.name)}</span>
        </a>`;
    }).join("")}
  </div>`;
}

// ============================================================
// View: Liga — Artilheiros e Rankings
// ============================================================
async function renderLeagueTopStats(leagueId, season) {
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
      <div class="card" style="margin-bottom:20px;">${renderTopList(scorers, s => `${s.goals.total} gols`)}</div>
      <h2 class="section-title">Assistências</h2>
      <div class="card" style="margin-bottom:20px;">${renderTopList(assists, s => `${s.goals.assists ?? 0} assist.`)}</div>
      <h2 class="section-title">Cartões Amarelos</h2>
      <div class="card">${renderTopList(yellows, s => `${s.cards.yellow} cartões`)}</div>
    `;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderTopList(list, metricFn) {
  if (!list || !list.length) return `<p style="color:var(--chalk-dim);">Sem estatísticas disponíveis.</p>`;
  return `<div class="fixture-list">
    ${list.slice(0, 10).map((entry, i) => {
      const p = entry.player;
      const s = entry.statistics[0];
      return `
        <div class="fixture-row" style="grid-template-columns:30px 40px 1fr auto;">
          <span style="font-family:var(--font-mono);font-weight:700;color:var(--chalk-dim);">${i + 1}</span>
          <img src="${p.photo}" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">
          <div>
            <div style="font-weight:600;">${escapeHtml(p.name)}</div>
            <div style="font-size:0.75rem;color:var(--chalk-dim);">${escapeHtml(s.team.name)}</div>
          </div>
          <span style="font-family:var(--font-mono);color:var(--gold);font-weight:700;">${metricFn(s)}</span>
        </div>`;
    }).join("")}
  </div>`;
}

// ============================================================
// View: Time — Estatísticas com Distribuição de Gols por Minuto
// ============================================================
async function renderTeam(teamId, leagueId, season) {
  const league = LEAGUES.find(l => l.id === leagueId);
  season = season || defaultSeasonFor(league);

  app.innerHTML = `<div id="team-content">${skeletonTable()}</div>`;
  const content = document.getElementById("team-content");

  try {
    const [stats, recentFixtures] = await Promise.all([
      apiGet("teams/statistics", { league: leagueId, season, team: teamId }, 30),
      apiGet("fixtures", { team: teamId, last: 5 }, 15),
    ]);

    if (!stats || !stats.team) {
      content.innerHTML = errorBox("Sem estatísticas para esse time nessa temporada.");
      return;
    }

    const t = stats.team;
    const gfAvg = parseFloat(stats.goals.for.average.total) || 0;
    const gaAvg = parseFloat(stats.goals.against.average.total) || 0;
    const played = stats.fixtures.played.total;
    const winPct = played ? Math.round((stats.fixtures.wins.total / played) * 100) : 0;

    content.innerHTML = `
      ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: league?.name || "Liga", href: `#/liga/${leagueId}/${season}` }, { label: t.name, href: "" }])}
      
      <div class="team-header">
        <img src="${t.logo}" alt="">
        <div>
          <p class="page-eyebrow">${escapeHtml(league?.name || "")} · ${season}</p>
          <h1 class="page-title">${escapeHtml(t.name)}</h1>
        </div>
      </div>

      ${subNav([
        { label: "Estatísticas", href: `#/time/${teamId}/${leagueId}/${season}`, active: true },
        { label: "Elenco", href: `#/time/${teamId}/${leagueId}/${season}/elenco` },
        { label: "Lesões", href: `#/time/${teamId}/${leagueId}/${season}/lesoes` },
      ])}

      <div class="stat-grid">
        <div class="stat-card">
          <p class="stat-label">Aproveitamento</p>
          <p class="stat-value">${winPct}<small>%</small></p>
          <div class="stat-split"><span>${stats.fixtures.wins.total}V</span><span>${stats.fixtures.draws.total}E</span><span>${stats.fixtures.loses.total}D</span></div>
        </div>
        <div class="stat-card">
          <p class="stat-label">Média de Gols Pró</p>
          <p class="stat-value">${gfAvg.toFixed(2)}</p>
          <div class="stat-split"><span>Casa ${stats.goals.for.average.home}</span><span>Fora ${stats.goals.for.average.away}</span></div>
        </div>
        <div class="stat-card">
          <p class="stat-label">Média de Gols Contra</p>
          <p class="stat-value">${gaAvg.toFixed(2)}</p>
          <div class="stat-split"><span>Casa ${stats.goals.against.average.home}</span><span>Fora ${stats.goals.against.average.away}</span></div>
        </div>
        <div class="stat-card">
          <p class="stat-label">Jogos Sem Sofrer Gol</p>
          <p class="stat-value">${stats.clean_sheet.total}</p>
          <div class="stat-split"><span>Casa ${stats.clean_sheet.home}</span><span>Fora ${stats.clean_sheet.away}</span></div>
        </div>
      </div>

      <!-- Distribuição de Gols por Tempo -->
      <div class="goal-timing-wrap">
        <div class="section-title" style="border:none;margin-bottom:0;">
          <span>Distribuição de Gols por Período de Jogo</span>
          <span style="font-size:0.75rem;font-family:var(--font-mono);"><span style="color:var(--gold);">■ Pró</span> <span style="color:var(--terracotta);margin-left:8px;">■ Contra</span></span>
        </div>
        ${renderGoalTimingChart(stats.goals.for.minute, stats.goals.against.minute)}
      </div>

      <h2 class="section-title" style="margin-top:24px;">Últimos Jogos</h2>
      <div class="card" style="margin-bottom:20px;">
        ${renderRecentFixtures(recentFixtures, teamId)}
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn" id="set-slot-a">Definir como Time A na Comparação</button>
        <button class="btn ghost" id="set-slot-b">Definir como Time B na Comparação</button>
      </div>
    `;

    document.getElementById("set-slot-a").addEventListener("click", () => setCompareSlot("a", t, leagueId, league?.name, season));
    document.getElementById("set-slot-b").addEventListener("click", () => setCompareSlot("b", t, leagueId, league?.name, season));
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderGoalTimingChart(forMin, againstMin) {
  const intervals = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90", "91-105"];
  let maxGoals = 1;
  intervals.forEach(k => {
    const f = forMin?.[k]?.total || 0;
    const a = againstMin?.[k]?.total || 0;
    if (f > maxGoals) maxGoals = f;
    if (a > maxGoals) maxGoals = a;
  });

  return `
    <div class="goal-timing-bars">
      ${intervals.map(k => {
        const gf = forMin?.[k]?.total || 0;
        const ga = againstMin?.[k]?.total || 0;
        const hf = (gf / maxGoals) * 100;
        const ha = (ga / maxGoals) * 100;
        return `
          <div class="goal-timing-col">
            <div class="goal-bar-pair">
              <div class="goal-bar for" style="height:${Math.max(hf, 4)}%;" title="Gols marcados: ${gf}"></div>
              <div class="goal-bar against" style="height:${Math.max(ha, 4)}%;" title="Gols sofridos: ${ga}"></div>
            </div>
            <span class="goal-timing-label">${k}'</span>
          </div>`;
      }).join("")}
    </div>`;
}

// ============================================================
// View: Time — Elenco
// ============================================================
async function renderSquad(teamId, leagueId, season) {
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
      <div class="team-header">
        <img src="${squad.team.logo}" alt="">
        <div>
          <p class="page-eyebrow">${escapeHtml(league?.name || "")}</p>
          <h1 class="page-title">${escapeHtml(squad.team.name)}</h1>
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
          <div class="squad-grid">
            ${players.map(p => `
              <a class="squad-card" href="#/jogador/${p.id}/${season}/${teamId}/${leagueId}">
                <img src="${p.photo}" alt="" loading="lazy">
                <div class="squad-number">${p.number ?? "-"}</div>
                <div class="squad-name">${escapeHtml(p.name)}</div>
                <div class="squad-age">${p.age ? p.age + " anos" : ""}</div>
              </a>`
            ).join("")}
          </div>`;
      }).join("")}
    `;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

// ============================================================
// View: Time — Lesões
// ============================================================
async function renderInjuries(teamId, leagueId, season) {
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
                <div class="fixture-row" style="grid-template-columns:40px 1fr auto;">
                  <img src="${inj.player.photo}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                  <div>
                    <div style="font-weight:600;">${escapeHtml(inj.player.name)}</div>
                    <div style="font-size:0.75rem;color:var(--terracotta);">${escapeHtml(inj.player.reason || "Desfalque")}</div>
                  </div>
                  <span class="fixture-date">${inj.fixture?.date ? new Date(inj.fixture.date).toLocaleDateString("pt-BR") : ""}</span>
                </div>`
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
      <div class="fixture-row" style="grid-template-columns:70px 1fr auto 30px;">
        <span class="fixture-date">${new Date(f.fixture.date).toLocaleDateString("pt-BR")}</span>
        <span>${isHome ? "vs" : "@"} ${escapeHtml(opp.name)}</span>
        <span class="fixture-score">${ownGoals ?? "-"} : ${oppGoals ?? "-"}</span>
        <span class="form-pill ${result}">${label}</span>
      </div>`;
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
// View: Jogador
// ============================================================
async function renderPlayer(playerId, season, teamId, leagueId) {
  app.innerHTML = `<div id="player-content">${skeletonTable()}</div>`;
  const content = document.getElementById("player-content");
  const backHref = teamId && leagueId ? `#/time/${teamId}/${leagueId}/${season}/elenco` : "#/";

  try {
    const response = await apiGet("players", { id: playerId, season }, 60);
    const entry = response?.[0];
    if (!entry) {
      content.innerHTML = errorBox("Estatísticas indisponíveis para este jogador.");
      return;
    }

    const p = entry.player;
    const stats = entry.statistics || [];

    content.innerHTML = `
      ${breadcrumbs([{ label: "Elenco", href: backHref }, { label: p.name, href: "" }])}
      <div class="team-header">
        <img src="${p.photo}" alt="" style="width:72px;height:72px;border-radius:50%;object-fit:cover;">
        <div>
          <p class="page-eyebrow">${escapeHtml(stats[0]?.games.position || "Jogador")}</p>
          <h1 class="page-title">${escapeHtml(p.name)}</h1>
          <div class="breadcrumbs" style="margin-top:6px;">
            ${p.age ? `<span>${p.age} anos</span>` : ""}
            ${p.nationality ? `<span>${escapeHtml(p.nationality)}</span>` : ""}
          </div>
        </div>
      </div>
      ${stats.map(s => `
        <div class="card" style="margin-bottom:16px;">
          <div class="section-title">
            <span>${escapeHtml(s.league.name)} · ${s.league.season}</span>
            <span style="color:var(--gold);font-family:var(--font-mono);">Nota: ${s.games.rating ? parseFloat(s.games.rating).toFixed(2) : "—"}</span>
          </div>
          <div class="stat-grid">
            <div class="stat-card"><p class="stat-label">Jogos</p><p class="stat-value">${s.games.appearences ?? 0}</p></div>
            <div class="stat-card"><p class="stat-label">Minutos</p><p class="stat-value">${s.games.minutes ?? 0}</p></div>
            <div class="stat-card"><p class="stat-label">Gols</p><p class="stat-value">${s.goals?.total ?? 0}</p></div>
            <div class="stat-card"><p class="stat-label">Assistências</p><p class="stat-value">${s.goals?.assists ?? 0}</p></div>
          </div>
        </div>
      `).join("")}
    `;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

// ============================================================
// View: Ao Vivo (com Auto-Refresh Regressivo)
// ============================================================
async function renderLive() {
  app.innerHTML = `
    <div class="live-header-bar">
      <div>
        <p class="page-eyebrow">Tempo Real</p>
        <h1 class="page-title" style="margin:0;">Jogos Ao Vivo</h1>
      </div>
      <div class="live-refresh-ctrl">
        <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">Auto-refresh</span>
        <div class="live-progress"><div class="live-progress-fill" id="live-progress-bar"></div></div>
        <button class="btn ghost small" id="btn-force-refresh">Atualizar</button>
      </div>
    </div>
    <div id="live-content">${skeletonTable()}</div>
  `;

  document.getElementById("btn-force-refresh").addEventListener("click", () => fetchLiveMatches(true));
  await fetchLiveMatches();
  startLiveAutoRefresh();
}

async function fetchLiveMatches(isForced = false) {
  const content = document.getElementById("live-content");
  if (!content) return;

  const knownLeagueIds = new Set(LEAGUES.map(l => l.id));
  try {
    const fixtures = await apiGet("fixtures", { live: "all" }, isForced ? 0 : 0.5);
    const relevant = (fixtures || []).filter(f => knownLeagueIds.has(f.league.id));

    if (!relevant.length) {
      content.innerHTML = `<div class="card" style="text-align:center;padding:40px 20px;color:var(--chalk-dim);">Nenhum jogo ao vivo acontecendo nas ligas cobertas no momento.</div>`;
      return;
    }

    content.innerHTML = `
      <div class="card">
        <div class="fixture-list">
          ${relevant.map(f => {
            const league = LEAGUES.find(l => l.id === f.league.id);
            return `
              <a class="fixture-row" href="#/jogo/${f.fixture.id}">
                <span class="fixture-date" style="color:var(--gold);font-weight:700;">${f.fixture.status.elapsed}'<br><small style="color:var(--chalk-dim);">${escapeHtml(league?.name || "")}</small></span>
                <span class="fixture-team right">${escapeHtml(f.teams.home.name)}</span>
                <span class="fixture-score">${f.goals.home ?? 0} : ${f.goals.away ?? 0}</span>
                <span class="fixture-team">${escapeHtml(f.teams.away.name)}</span>
              </a>`;
          }).join("")}
        </div>
      </div>`;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function startLiveAutoRefresh() {
  let remaining = state.liveIntervalSeconds;
  const bar = document.getElementById("live-progress-bar");
  
  state.liveTimer = setInterval(() => {
    remaining--;
    if (bar) bar.style.width = `${(remaining / state.liveIntervalSeconds) * 100}%`;
    if (remaining <= 0) {
      remaining = state.liveIntervalSeconds;
      fetchLiveMatches(true);
    }
  }, 1000);
}

// ============================================================
// View: Detalhe do Jogo (Odds, xG, Escalação 2D Tática)
// ============================================================
async function renderFixture(fixtureId) {
  app.innerHTML = `<div id="fixture-content">${skeletonTable()}</div>`;
  const content = document.getElementById("fixture-content");

  try {
    const fxResponse = await apiGet("fixtures", { id: fixtureId }, 5);
    const fx = fxResponse?.[0];
    if (!fx) {
      content.innerHTML = errorBox("Jogo não encontrado.");
      return;
    }

    const [events, lineups, stats, odds, predictions] = await Promise.allSettled([
      apiGet("fixtures/events", { fixture: fixtureId }, 5),
      apiGet("fixtures/lineups", { fixture: fixtureId }, 15),
      apiGet("fixtures/statistics", { fixture: fixtureId }, 5),
      apiGet("odds", { fixture: fixtureId }, 15),
      apiGet("predictions", { fixture: fixtureId }, 15),
    ]);

    const date = new Date(fx.fixture.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const time = new Date(fx.fixture.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    content.innerHTML = `
      ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: fx.league.name, href: `#/liga/${fx.league.id}/${fx.league.season}` }, { label: "Partida", href: "" }])}
      
      <div class="page-head">
        <p class="page-eyebrow">${escapeHtml(fx.league.name)} · ${date} · ${time}${fx.fixture.venue?.name ? " · " + escapeHtml(fx.fixture.venue.name) : ""}</p>
      </div>

      <div class="fixture-hero">
        <div class="fixture-hero-team">
          <img src="${fx.teams.home.logo}" alt="">
          <span>${escapeHtml(fx.teams.home.name)}</span>
        </div>
        <div class="fixture-hero-score">
          ${fx.goals.home ?? "-"} : ${fx.goals.away ?? "-"}
          <div class="fixture-hero-status">${escapeHtml(fx.fixture.status.long)}</div>
        </div>
        <div class="fixture-hero-team">
          <img src="${fx.teams.away.logo}" alt="">
          <span>${escapeHtml(fx.teams.away.name)}</span>
        </div>
      </div>

      <div id="fx-predictions"></div>
      <div id="fx-odds"></div>
      <div id="fx-stats"></div>
      <div id="fx-lineups"></div>
      <div id="fx-events"></div>
    `;

    if (predictions.status === "fulfilled") renderFixturePredictions(predictions.value?.[0], fx);
    if (odds.status === "fulfilled") renderFixtureOdds(odds.value?.[0], predictions.value?.[0]);
    if (stats.status === "fulfilled") renderFixtureStats(stats.value);
    if (lineups.status === "fulfilled") renderFixtureLineups(lineups.value);
    if (events.status === "fulfilled") renderFixtureEvents(events.value, fx);
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderFixturePredictions(pred, fx) {
  const el = document.getElementById("fx-predictions");
  if (!pred || !el) return;
  const pct = pred.predictions.percent;
  const probA = parseInt(pct.home);
  const probB = parseInt(pct.away);
  const probDraw = 100 - probA - probB;
  el.innerHTML = `
    <h2 class="section-title">Previsão Oficial da API</h2>
    ${renderPitchBar(fx.teams.home, fx.teams.away, { probA, probB, probDraw })}
  `;
}

function renderFixtureOdds(oddsEntry, pred) {
  const el = document.getElementById("fx-odds");
  if (!oddsEntry || !oddsEntry.bookmakers?.length || !el) return;
  const bookmaker = oddsEntry.bookmakers[0];
  const winnerBet = bookmaker.bets.find(b => b.name === "Match Winner");
  if (!winnerBet) return;

  const predHome = pred ? parseInt(pred.predictions.percent.home) : null;
  const predAway = pred ? parseInt(pred.predictions.percent.away) : null;

  el.innerHTML = `
    <h2 class="section-title">Odds & Valor Esperado (+EV) — ${escapeHtml(bookmaker.name)}</h2>
    <div class="card" style="margin-bottom:20px;">
      <div class="odds-grid">
        ${winnerBet.values.map(v => {
          const oddNum = parseFloat(v.odd);
          let evBadge = "";
          let isValue = false;
          
          if (v.value === "Home" && predHome) {
            const ev = ((predHome / 100) * oddNum - 1) * 100;
            isValue = ev > 0;
            evBadge = `<span class="ev-tag ${isValue ? 'positive' : 'negative'}">${ev > 0 ? '+' : ''}${ev.toFixed(1)}% EV</span>`;
          } else if (v.value === "Away" && predAway) {
            const ev = ((predAway / 100) * oddNum - 1) * 100;
            isValue = ev > 0;
            evBadge = `<span class="ev-tag ${isValue ? 'positive' : 'negative'}">${ev > 0 ? '+' : ''}${ev.toFixed(1)}% EV</span>`;
          }

          return `
            <div class="odds-card ${isValue ? 'has-value' : ''}">
              <span class="odds-label">${escapeHtml(v.value)}</span>
              <span class="odds-val">${v.odd}</span>
              ${evBadge}
            </div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderFixtureStats(statsArr) {
  const el = document.getElementById("fx-stats");
  if (!statsArr || statsArr.length < 2 || !el) return;
  const [homeStats, awayStats] = statsArr;

  const rows = homeStats.statistics.map((s, i) => {
    const homeVal = s.value ?? 0;
    const awayVal = awayStats.statistics[i]?.value ?? 0;
    const homeNum = parseFloat(homeVal) || 0;
    const awayNum = parseFloat(awayVal) || 0;
    const max = Math.max(homeNum, awayNum, 1);
    return [s.type, homeVal, awayVal, (homeNum / max) * 100, (awayNum / max) * 100];
  });

  el.innerHTML = `
    <h2 class="section-title">Estatísticas da Partida</h2>
    <div class="card" style="margin-bottom:20px;">
      <table class="standings-table">
        ${rows.map(([label, va, vb, pctA, pctB]) => `
          <tr>
            <td style="text-align:right;color:var(--gold);font-weight:700;width:30%;">${va}</td>
            <td style="color:var(--chalk-dim);font-size:0.75rem;text-transform:uppercase;">${escapeHtml(label)}</td>
            <td style="text-align:left;color:var(--terracotta);font-weight:700;width:30%;">${vb}</td>
          </tr>
          <tr>
            <td colspan="3" style="padding:0 8px 12px;">
              <div style="position:relative;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                <div style="position:absolute;right:50%;height:100%;background:var(--gold);width:${pctA / 2}%;"></div>
                <div style="position:absolute;left:50%;height:100%;background:var(--terracotta);width:${pctB / 2}%;"></div>
              </div>
            </td>
          </tr>`
        ).join("")}
      </table>
    </div>
  `;
}

// ------------------------------------------------------------
// Campo Tático 2D Reestruturado por Linhas
// ------------------------------------------------------------
function renderFixtureLineups(lineupsArr) {
  const el = document.getElementById("fx-lineups");
  if (!lineupsArr || !lineupsArr.length || !el) return;

  el.innerHTML = `
    <h2 class="section-title">Escalações & Campo Tático</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;margin-bottom:20px;">
      ${lineupsArr.map((l, teamIdx) => {
        const isAway = teamIdx === 1;
        const formation = l.formation || "4-4-2";
        const formLines = formation.split("-").map(Number);
        
        // Separar jogadores por linhas táticas
        const rows = [];
        let cursor = 1;
        rows.push([l.startXI[0]]); // Goleiro
        formLines.forEach(count => {
          rows.push(l.startXI.slice(cursor, cursor + count));
          cursor += count;
        });

        const displayRows = isAway ? [...rows].reverse() : rows;

        return `
          <div class="card">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
              <img src="${l.team.logo}" alt="" style="width:32px;height:32px;object-fit:contain;">
              <div>
                <div style="font-family:var(--font-display);font-size:1.1rem;font-weight:600;">${escapeHtml(l.team.name)}</div>
                <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">${escapeHtml(formation)} · Téc. ${escapeHtml(l.coach?.name || "-")}</div>
              </div>
            </div>

            <div class="tactical-pitch ${isAway ? 'pitch-away' : ''}">
              <div class="pitch-half-line"></div>
              <div class="pitch-center-circle"></div>
              <div class="pitch-penalty-area"></div>
              
              ${displayRows.map(rowPlayers => `
                <div class="pitch-row">
                  ${rowPlayers.map(p => `
                    <div class="pitch-player" title="${escapeHtml(p.player.name)}">
                      <div class="pitch-player-badge">${p.player.number ?? ""}</div>
                      <span class="pitch-player-name">${escapeHtml((p.player.name || "").split(" ").pop())}</span>
                    </div>`
                  ).join("")}
                </div>`
              ).join("")}
            </div>

            <p class="stat-label" style="margin-top:16px;">Banco de Reservas</p>
            <ul style="list-style:none;padding:0;margin:0;font-size:0.82rem;display:flex;flex-direction:column;gap:4px;color:var(--chalk-dim);">
              ${l.substitutes.map(s => `<li><strong style="color:var(--gold);font-family:var(--font-mono);margin-right:6px;">${s.player.number ?? "-"}</strong>${escapeHtml(s.player.name)}</li>`).join("")}
            </ul>
          </div>`;
      }).join("")}
    </div>
  `;
}

function renderFixtureEvents(events, fx) {
  const el = document.getElementById("fx-events");
  if (!events || !events.length || !el) return;

  el.innerHTML = `
    <h2 class="section-title">Linha do Tempo</h2>
    <div class="card">
      <div class="fixture-list">
        ${events.map(e => {
          const isHome = e.team.id === fx.teams.home.id;
          return `
            <div class="fixture-row" style="grid-template-columns:44px auto 1fr;">
              <span class="fixture-date">${e.time.elapsed}'${e.time.extra ? "+" + e.time.extra : ""}</span>
              <span>${e.type === "Goal" ? "⚽" : e.type === "Card" ? (e.detail === "Red Card" ? "🟥" : "🟨") : "🔁"}</span>
              <div>
                <strong>${escapeHtml(e.player?.name || "")}</strong>
                <span style="color:var(--chalk-dim);font-size:0.75rem;">(${escapeHtml(e.detail || e.type)})</span>
              </div>
            </div>`;
        }).join("")}
      </div>
    </div>
  `;
}

// ============================================================
// View: Comparação de Confronto
// ============================================================
function renderCompare() {
  const { a, b } = state.compareSlots;
  app.innerHTML = `
    <div class="page-head">
      <p class="page-eyebrow">Laboratório de Confronto</p>
      <h1 class="page-title">Time A × Time B</h1>
      <p class="page-sub">Selecione dois clubes para comparar saldo ponderado, forma recente, histórico direto e calcular probabilidades com vantagem de mando.</p>
    </div>

    <div class="quick-picks">
      <span>Atalhos rápidos:</span>
      ${POPULAR_TEAMS.map(pt => `<span class="quick-tag" data-quick-id="${pt.id}" data-quick-name="${pt.name}">${pt.name}</span>`).join("")}
    </div>

    <div class="compare-picker">
      <div class="picker-box slot-a" id="picker-a"></div>
      <div class="compare-vs">×</div>
      <div class="picker-box slot-b" id="picker-b"></div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <p class="stat-label" style="margin-bottom:10px;">Mando de Campo</p>
      <div style="display:flex;gap:18px;font-size:0.88rem;flex-wrap:wrap;">
        <label><input type="radio" name="home" value="" ${!state.homeSide ? "checked" : ""}> Campo Neutro</label>
        <label><input type="radio" name="home" value="a" ${state.homeSide === "a" ? "checked" : ""}> Time A Manda</label>
        <label><input type="radio" name="home" value="b" ${state.homeSide === "b" ? "checked" : ""}> Time B Manda</label>
      </div>
    </div>

    <button class="btn" id="run-compare" ${a && b ? "" : "disabled"}>Gerar Análise Completa</button>
    <div id="compare-result" style="margin-top:24px;"></div>
  `;

  renderPicker("a", a);
  renderPicker("b", b);

  document.querySelectorAll('.quick-tag').forEach(tag => {
    tag.addEventListener("click", () => {
      const slot = !state.compareSlots.a ? "a" : "b";
      selectTeamForCompare(slot, tag.dataset.quickId, tag.dataset.quickName, `https://media.api-sports.io/football/teams/${tag.dataset.quickId}.png`);
    });
  });

  document.querySelectorAll('input[name="home"]').forEach(r =>
    r.addEventListener("change", (e) => {
      state.homeSide = e.target.value || null;
      if (state.compareSlots.a && state.compareSlots.b) runComparison();
    })
  );

  document.getElementById("run-compare").addEventListener("click", runComparison);
  if (state.compareSlots.a && state.compareSlots.b) runComparison();
}

function renderPicker(slot, selected) {
  const box = document.getElementById(`picker-${slot}`);
  if (!box) return;

  if (selected) {
    box.innerHTML = `
      <div class="picker-selected">
        <img src="${selected.logo}" alt="">
        <div>
          <div class="name">${escapeHtml(selected.name)}</div>
          <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">${escapeHtml(selected.leagueName || "")} · ${selected.season}</div>
        </div>
      </div>
      <button class="btn ghost small" style="margin-top:10px;" data-action="clear">Trocar Time</button>
    `;
    box.querySelector('[data-action="clear"]').addEventListener("click", () => {
      state.compareSlots[slot] = null;
      updateCompareBadge();
      renderCompare();
    });
    return;
  }

  box.innerHTML = `
    <input type="text" placeholder="Buscar clube (ex: Flamengo, Real Madrid...)" id="search-${slot}" autocomplete="off">
    <div class="picker-results" id="results-${slot}"></div>
  `;

  const input = document.getElementById(`search-${slot}`);
  const results = document.getElementById(`results-${slot}`);
  let debounceTimer;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 3) { results.innerHTML = ""; return; }

    debounceTimer = setTimeout(async () => {
      results.innerHTML = `<div style="padding:8px;color:var(--chalk-dim);font-size:0.8rem;">Buscando...</div>`;
      try {
        const teams = await apiGet("teams", { search: q }, 60);
        if (!teams || !teams.length) {
          results.innerHTML = `<div style="padding:8px;color:var(--chalk-dim);font-size:0.8rem;">Nenhum time encontrado.</div>`;
          return;
        }
        results.innerHTML = teams.slice(0, 6).map(r => `
          <div class="picker-result" data-id="${r.team.id}" data-name="${escapeHtml(r.team.name)}" data-logo="${r.team.logo}">
            <img src="${r.team.logo}" alt="">
            <span>${escapeHtml(r.team.name)}</span>
          </div>`
        ).join("");

        results.querySelectorAll(".picker-result").forEach(el => {
          el.addEventListener("click", () => selectTeamForCompare(slot, el.dataset.id, el.dataset.name, el.dataset.logo));
        });
      } catch (err) {
        results.innerHTML = `<div style="padding:8px;color:var(--terracotta);font-size:0.8rem;">${escapeHtml(err.message)}</div>`;
      }
    }, 350);
  });
}

async function selectTeamForCompare(slot, teamId, name, logo) {
  const box = document.getElementById(`picker-${slot}`);
  if (box) box.innerHTML = `<div class="skeleton-line skeleton"></div>`;

  try {
    const leagues = await apiGet("leagues", { team: teamId, current: "true" }, 60);
    let leagueId, leagueName, season;
    if (leagues && leagues.length) {
      const domestic = leagues.find(l => l.league.type === "League") || leagues[0];
      leagueId = domestic.league.id;
      leagueName = domestic.league.name;
      season = domestic.seasons?.[0]?.year;
    }
    if (!leagueId) throw new Error("Liga ativa não localizada.");
    state.compareSlots[slot] = { teamId: Number(teamId), name, logo, leagueId, leagueName, season };
    updateCompareBadge();
    renderCompare();
  } catch (err) {
    toast(err.message);
    renderPicker(slot, null);
  }
}

async function runComparison() {
  const { a, b } = state.compareSlots;
  const result = document.getElementById("compare-result");
  if (!a || !b || !result) return;
  result.innerHTML = skeletonTable();

  try {
    const [statsA, statsB, h2h] = await Promise.all([
      apiGet("teams/statistics", { league: a.leagueId, season: a.season, team: a.teamId }, 30),
      apiGet("teams/statistics", { league: b.leagueId, season: b.season, team: b.teamId }, 30),
      apiGet("fixtures/headtohead", { h2h: `${a.teamId}-${b.teamId}`, last: 6 }, 30),
    ]);

    if (!statsA?.team || !statsB?.team) {
      result.innerHTML = errorBox("Estatísticas incompletas para um dos times nesta temporada.");
      return;
    }

    const homeTeamId = state.homeSide === "a" ? a.teamId : state.homeSide === "b" ? b.teamId : null;
    const prob = computeProbability(statsA, statsB, h2h, homeTeamId);
    const justifs = buildJustifications(statsA, statsB, h2h, homeTeamId);

    result.innerHTML = `
      ${renderPitchBar(statsA.team, statsB.team, prob)}

      <h2 class="section-title">Justificativas do Modelo</h2>
      <ul class="justif-list">
        ${justifs.map(j => `<li class="justif-item"><span class="justif-side ${j.side}"></span><span>${j.text}</span></li>`).join("")}
      </ul>

      <h2 class="section-title" style="margin-top:24px;">Confronto Direto Recente (H2H)</h2>
      <div class="card">
        ${renderH2H(h2h)}
      </div>
    `;
  } catch (err) {
    result.innerHTML = errorBox(err.message);
  }
}

// ------------------------------------------------------------
// Modelo Matemático Refinado com Sigmoide e Mando
// ------------------------------------------------------------
function computeProbability(statsA, statsB, h2h, homeTeamId) {
  const isAHome = homeTeamId ? homeTeamId === statsA.team.id : null;
  const isBHome = homeTeamId ? homeTeamId === statsB.team.id : null;

  const winRate = (s, isHome) => {
    if (!s.fixtures.played.total) return 0.5;
    if (isHome === null) return s.fixtures.wins.total / s.fixtures.played.total;
    const side = isHome ? "home" : "away";
    const played = s.fixtures.played[side] || 1;
    return (s.fixtures.wins[side] || 0) / played;
  };

  const goalDiffScore = (s, isHome) => {
    const side = isHome === null ? "total" : isHome ? "home" : "away";
    const gf = parseFloat(s.goals.for.average[side]) || 1;
    const ga = parseFloat(s.goals.against.average[side]) || 1;
    return Math.min(1, Math.max(0, (gf - ga + 3) / 6));
  };

  const formScore = (s) => {
    const map = { W: 1, D: 0.35, L: 0 };
    const chars = (s.form || "").split("").slice(-5);
    if (!chars.length) return 0.5;
    return chars.reduce((sum, c) => sum + (map[c] ?? 0.35), 0) / chars.length;
  };

  const strength = (s, isHome) =>
    40 * winRate(s, isHome) + 25 * goalDiffScore(s, isHome) + 20 * formScore(s);

  let strengthA = strength(statsA, isAHome);
  let strengthB = strength(statsB, isBHome);

  if (isAHome) strengthA += 6;
  if (isBHome) strengthB += 6;

  const diff = strengthA - strengthB;
  const drawProb = Math.min(28, Math.max(16, 25 - Math.abs(diff) * 0.25));
  const remaining = 100 - drawProb;
  const sig = 1 / (1 + Math.exp(-diff / 14));
  
  let probA = Math.round(remaining * sig);
  let probB = Math.round(remaining - probA);
  const probDraw = 100 - probA - probB;

  return { probA, probB, probDraw };
}

function buildJustifications(statsA, statsB, h2h, homeTeamId) {
  const j = [];
  const nameA = statsA.team.name, nameB = statsB.team.name;
  const isAHome = homeTeamId ? homeTeamId === statsA.team.id : null;
  const isBHome = homeTeamId ? homeTeamId === statsB.team.id : null;

  const wrA = ((statsA.fixtures.wins.total / (statsA.fixtures.played.total || 1)) * 100).toFixed(0);
  const wrB = ((statsB.fixtures.wins.total / (statsB.fixtures.played.total || 1)) * 100).toFixed(0);

  j.push({
    side: wrA === wrB ? "n" : wrA > wrB ? "a" : "b",
    text: `Aproveitamento na temporada: ${nameA} venceu ${wrA}% dos jogos vs ${wrB}% do ${nameB}.`,
  });

  const gfA = parseFloat(statsA.goals.for.average.total) || 0;
  const gfB = parseFloat(statsB.goals.for.average.total) || 0;
  j.push({
    side: gfA === gfB ? "n" : gfA > gfB ? "a" : "b",
    text: `Ataque: ${nameA} marca em média ${gfA.toFixed(2)} gols/jogo vs ${gfB.toFixed(2)} do ${nameB}.`,
  });

  if (homeTeamId) {
    const homeName = homeTeamId === statsA.team.id ? nameA : nameB;
    j.push({ side: homeTeamId === statsA.team.id ? "a" : "b", text: `Fator Casa: ${homeName} atua como mandante (+6% bônus tático).` });
  }

  return j;
}

function renderPitchBar(teamA, teamB, prob) {
  return `
    <div class="pitch-bar-wrap">
      <div class="pitch-bar-labels">
        <div class="pitch-bar-label a">${escapeHtml(teamA.name)}<span class="pitch-bar-pct">${prob.probA}%</span></div>
        <div class="pitch-bar-label b">${escapeHtml(teamB.name)}<span class="pitch-bar-pct">${prob.probB}%</span></div>
      </div>
      <div class="pitch-bar">
        <div class="pitch-bar-fill-a" style="width:${prob.probA}%;"></div>
        <div class="pitch-bar-fill-b" style="width:${prob.probB}%;"></div>
        <div class="pitch-bar-draw" style="left:${prob.probA}%;width:${prob.probDraw}%;"></div>
        <div class="pitch-bar-ball" style="left:${prob.probA + prob.probDraw / 2}%;"></div>
      </div>
      <div class="draw-caption">Empate Estimado: ${prob.probDraw}%</div>
    </div>`;
}

function renderH2H(h2h) {
  if (!h2h || !h2h.length) return `<p style="color:var(--chalk-dim);">Nenhum confronto direto recente encontrado.</p>`;
  return `<div class="fixture-list">
    ${h2h.slice().reverse().map(f => `
      <div class="fixture-row">
        <span class="fixture-date">${new Date(f.fixture.date).toLocaleDateString("pt-BR")}</span>
        <span class="fixture-team right">${escapeHtml(f.teams.home.name)}</span>
        <span class="fixture-score">${f.goals.home ?? "-"} : ${f.goals.away ?? "-"}</span>
        <span class="fixture-team">${escapeHtml(f.teams.away.name)}</span>
      </div>`
    ).join("")}
  </div>`;
}