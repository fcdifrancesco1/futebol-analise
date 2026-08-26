// ============================================================
// APURAÇÃO — app.js (com Correção de Rodadas e Estatísticas do Clube)
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
  liveIntervalSeconds: 45,
  currentTableFilter: "all",
  fifaTab: "summary",
  lastComparisonData: null,
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

// ---------- Requisições com Cache ----------
async function apiGet(endpoint, params = {}, ttlMinutes = 15) {
  const clean = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") clean[k] = v;
  });
  const qs = new URLSearchParams({ endpoint, ...clean }).toString();
  const cacheKey = `ap_cache_${endpoint}_${qs}`;

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
    } catch { /* sessionStorage */ }
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
    try { sessionStorage.setItem(cacheKey, JSON.stringify(cacheObj)); } catch { /* quota */ }
  }

  markUpdated(false);
  return data.response;
}

// ---------- Utilitários Visuais ----------
function formatRoundName(r) {
  if (!r) return "Partidas";
  let s = String(r);

  const isLeg1 = /[-_ ]1$|\b1st leg\b|\bida\b/i.test(s);
  const isLeg2 = /[-_ ]2$|\b2nd leg\b|\bvolta\b/i.test(s);
  const legSuffix = isLeg1 ? " — Jogo de Ida" : isLeg2 ? " — Jogo de Volta" : "";

  s = s.replace(/[-_ ]\d+$/, "").trim();

  const dict = {
    "Round of 16": "Oitavas de Final",
    "8th Finals": "Oitavas de Final",
    "Quarter-finals": "Quartas de Final",
    "Quarterfinals": "Quartas de Final",
    "Semi-finals": "Semifinal",
    "Semifinals": "Semifinal",
    "Final": "Grande Final",
    "Round of 32": "16 avos de Final",
    "16th Finals": "16 avos de Final",
    "1st Round": "1ª Rodada",
    "2nd Round": "2ª Rodada",
    "3rd Round": "3ª Rodada",
    "Preliminary Round": "Fase Preliminar",
    "1st Qualifying Round": "1ª Pré-Eliminatória",
    "2nd Qualifying Round": "2ª Pré-Eliminatória",
    "3rd Qualifying Round": "3ª Pré-Eliminatória",
    "Play-offs": "Play-offs",
    "Group Stage": "Fase de Grupos",
  };

  for (const [en, pt] of Object.entries(dict)) {
    if (s.toLowerCase().includes(en.toLowerCase())) {
      return pt + legSuffix;
    }
  }

  if (/Regular Season/i.test(s)) {
    const num = s.match(/\d+/);
    return num ? `${num[0]}ª Rodada` : "Fase Regular";
  }

  return s + legSuffix;
}

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
    <div class="breadcrumbs-bar">
      <nav class="breadcrumbs" aria-label="Rastro de navegação">
        ${crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return isLast 
            ? `<span>${escapeHtml(c.label)}</span>`
            : `<a href="${c.href}">${escapeHtml(c.label)}</a><span class="breadcrumbs-sep">/</span>`;
        }).join('')}
      </nav>
      <button class="btn-back" onclick="window.history.length > 1 ? history.back() : location.hash = '#/'" title="Retornar à tela anterior">
        ← Voltar
      </button>
    </div>`;
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
    await renderPlayer(Number(parts[1]), parts[2] ? Number(parts[2]) : undefined, parts[3] ? Number(parts[3]) : undefined, parts[4] ? Number(parts[4]) : undefined);
  } else if (parts[0] === "jogo" && parts[1]) {
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
      <p class="page-sub">Classificação detalhada, fases eliminatórias de ida e volta, estatísticas avançadas e comparador direto.</p>
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
// View: Liga — Classificação
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
      content.innerHTML = `<div class="card" style="text-align:center;color:var(--chalk-dim);padding:30px;">Sem tabela de pontos corridos nesta competição (formato mata-mata). Acesse a aba <strong>Jogos</strong> para ver os confrontos de Ida e Volta.</div>`;
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
// View: Liga — Jogos (Extração Segura de Rodadas sem Erro de Endpoint)
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
    // Busca todas as partidas da temporada usando apenas o endpoint permitido 'fixtures'
    const allFixtures = await apiGet("fixtures", { league: leagueId, season }, 15);

    if (!allFixtures || !allFixtures.length) {
      content.innerHTML = `<div class="card"><p style="color:var(--chalk-dim);">Nenhum jogo cadastrado para esta temporada.</p></div>`;
      return;
    }

    // Extrair lista de rodadas únicas diretamente das partidas
    const uniqueRounds = [];
    allFixtures.forEach(f => {
      const r = f.league?.round;
      if (r && !uniqueRounds.includes(r)) {
        uniqueRounds.push(r);
      }
    });

    const roundOptions = uniqueRounds.map(r => `
      <option value="${escapeHtml(r)}">${escapeHtml(formatRoundName(r))}</option>
    `).join("");

    content.innerHTML = `
      ${uniqueRounds.length > 1 ? `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;background:var(--glass-bg);border:1px solid var(--glass-border);padding:12px 16px;border-radius:var(--radius);">
          <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);font-weight:700;">FILTRAR RODADA:</span>
          <select id="select-league-round" style="background:var(--pitch-card);border:1px solid var(--line-strong);color:var(--chalk);padding:6px 12px;border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:0.82rem;">
            <option value="ALL">Todas as Rodadas</option>
            ${roundOptions}
          </select>
        </div>
      ` : ""}
      <div id="rounds-container">${renderGroupedFixtures(allFixtures)}</div>
    `;

    const selectEl = document.getElementById("select-league-round");
    if (selectEl) {
      selectEl.addEventListener("change", (e) => {
        const val = e.target.value;
        const filtered = val === "ALL" ? allFixtures : allFixtures.filter(f => f.league.round === val);
        document.getElementById("rounds-container").innerHTML = renderGroupedFixtures(filtered);
      });
    }
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderGroupedFixtures(fixtures) {
  if (!fixtures || !fixtures.length) return `<div class="card"><p style="color:var(--chalk-dim);">Nenhum jogo encontrado.</p></div>`;

  const pairOccurrences = {};
  fixtures.forEach(f => {
    const tA = Math.min(f.teams.home.id, f.teams.away.id);
    const tB = Math.max(f.teams.home.id, f.teams.away.id);
    const key = `${tA}-${tB}`;
    pairOccurrences[key] = (pairOccurrences[key] || 0) + 1;
  });

  const pairCountSeen = {};

  const groups = {};
  fixtures.forEach(f => {
    let roundTitle = formatRoundName(f.league?.round);
    if (!groups[roundTitle]) groups[roundTitle] = [];
    groups[roundTitle].push(f);
  });

  return Object.entries(groups).map(([roundTitle, list]) => `
    <div class="fixture-group-section">
      <div class="fixture-round-header">
        <span>🏆</span>
        <span class="round-title-text">${escapeHtml(roundTitle)}</span>
      </div>
      <div class="card" style="padding:10px;">
        <div class="fixture-list">
          ${list.map(f => {
            const rawRound = f.league?.round || "";
            let legBadge = "";
            
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

            const date = new Date(f.fixture.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            const time = new Date(f.fixture.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            const played = f.fixture.status.short !== "NS" && f.fixture.status.short !== "TBD";

            return `
              <a class="fixture-row" href="#/jogo/${f.fixture.id}" title="Clique para ver estatísticas da partida">
                <div class="fixture-date-col">
                  <span class="fixture-date">${date}<br>${time}</span>
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
      </div>
    </div>
  `).join("");
}

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
      const p = entry.player;
      const s = entry.statistics[0];
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
// View: Perfil e Estatísticas do Jogador (Priorizando Clube Atual)
// ============================================================
async function renderPlayer(playerId, teamId, leagueId, season) {
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

    // Priorizar a competição do clube atual do jogador
    let activeStat = null;
    if (leagueId) {
      activeStat = statsList.find(st => st.league.id === Number(leagueId));
    }
    if (!activeStat && teamId) {
      activeStat = statsList.find(st => st.team.id === Number(teamId));
    }
    if (!activeStat) {
      // Priorizar liga nacional de clube com mais jogos
      activeStat = statsList.slice().sort((a, b) => (b.games.appearences || 0) - (a.games.appearences || 0))[0] || statsList[0] || {};
    }

    function renderPlayerStatsView(s) {
      const rating = parseFloat(s.games?.rating || "0").toFixed(2);
      
      const compOptions = statsList.map((st, idx) => `
        <option value="${idx}" ${st.league.id === s.league.id ? 'selected' : ''}>
          ${escapeHtml(st.league.name)} — ${escapeHtml(st.team.name)}
        </option>
      `).join("");

      return `
        ${breadcrumbs([
          { label: "Ligas", href: "#/" },
          { label: s.team?.name || "Clube", href: `#/time/${s.team?.id || teamId}/${s.league?.id || leagueId}/${season || 2026}` },
          { label: p.name, href: "" }
        ])}

        <!-- Perfil Principal do Atleta -->
        <div class="player-hero">
          <img class="player-avatar-large" src="${p.photo}" alt="">
          <div>
            <p class="page-eyebrow">${escapeHtml(s.team?.name || "")} · ${escapeHtml(s.games?.position || "")} ${s.games?.number ? `#${s.games.number}` : ''}</p>
            <h1 class="page-title">${escapeHtml(p.name)}</h1>
            <div style="display:flex;gap:14px;margin-top:8px;font-family:var(--font-mono);font-size:0.78rem;color:var(--chalk-dim);flex-wrap:wrap;">
              <span>🎂 ${p.age ? p.age + ' anos' : '-'}</span>
              <span>📍 ${escapeHtml(p.nationality || '-')}</span>
              <span>📏 ${p.height || '-'}</span>
              <span>⚖️ ${p.weight || '-'}</span>
            </div>
          </div>
          <div class="player-rating-badge">
            <span class="rating-num">${rating > 0 ? rating : '-'}</span>
            <span class="rating-label">Nota Média</span>
          </div>
        </div>

        <!-- Seletor de Competição do Jogador -->
        ${statsList.length > 1 ? `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;background:var(--glass-bg);border:1px solid var(--glass-border);padding:10px 16px;border-radius:var(--radius);flex-wrap:wrap;">
            <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);font-weight:700;">COMPETIÇÃO:</span>
            <select id="player-comp-select" style="background:var(--pitch-card);border:1px solid var(--line-strong);color:var(--chalk);padding:6px 12px;border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:0.82rem;">
              ${compOptions}
            </select>
          </div>
        ` : ""}

        <!-- Cards de Métricas Principais -->
        <h2 class="section-title">Estatísticas na Temporada (${escapeHtml(s.league?.name || "Geral")})</h2>
        <div class="stat-grid">
          <div class="stat-card">
            <p class="stat-label">Jogos (Titular)</p>
            <p class="stat-value">${s.games?.appearences ?? 0} <small>(${s.games?.lineups ?? 0})</small></p>
            <div class="stat-split"><span>${s.games?.minutes ?? 0} minutos</span></div>
          </div>
          <div class="stat-card">
            <p class="stat-label">Gols Marcados</p>
            <p class="stat-value" style="color:var(--gold);">${s.goals?.total ?? 0}</p>
            <div class="stat-split"><span>Pênaltis: ${s.penalty?.scored ?? 0}</span></div>
          </div>
          <div class="stat-card">
            <p class="stat-label">Assistências</p>
            <p class="stat-value">${s.goals?.assists ?? 0}</p>
            <div class="stat-split"><span>Passes Chave: ${s.passes?.key ?? 0}</span></div>
          </div>
          <div class="stat-card">
            <p class="stat-label">Precisão de Passes</p>
            <p class="stat-value">${s.passes?.accuracy ? s.passes.accuracy + '%' : '-'}</p>
            <div class="stat-split"><span>Total: ${s.passes?.total ?? 0}</span></div>
          </div>
        </div>

        <!-- Estatísticas Detalhadas -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;">
          <div class="card">
            <h2 class="section-title">Finalizações & Ataque</h2>
            <div class="fifa-stats-center" style="background:transparent;border:none;">
              <div class="fifa-stat-row"><span>Chutes Totais</span><strong>${s.shots?.total ?? 0}</strong></div>
              <div class="fifa-stat-row"><span>Chutes no Alvo</span><strong>${s.shots?.on ?? 0}</strong></div>
              <div class="fifa-stat-row"><span>Dribles Certos</span><strong>${s.dribbles?.success ?? 0}</strong></div>
              <div class="fifa-stat-row"><span>Pênaltis Sofridos</span><strong>${s.penalty?.won ?? 0}</strong></div>
            </div>
          </div>

          <div class="card">
            <h2 class="section-title">Defesa & Disciplina</h2>
            <div class="fifa-stats-center" style="background:transparent;border:none;">
              <div class="fifa-stat-row"><span>Desarmes</span><strong>${s.tackles?.total ?? 0}</strong></div>
              <div class="fifa-stat-row"><span>Interceptações</span><strong>${s.tackles?.interceptions ?? 0}</strong></div>
              <div class="fifa-stat-row"><span>Faltas Cometidas</span><strong>${s.fouls?.committed ?? 0}</strong></div>
              <div class="fifa-stat-row"><span>Cartões Amarelos / Vermelhos</span><strong>🟨 ${s.cards?.yellow ?? 0} · 🟥 ${s.cards?.red ?? 0}</strong></div>
            </div>
          </div>
        </div>
      `;
    }

    content.innerHTML = renderPlayerStatsView(activeStat);

    content.addEventListener("change", (e) => {
      if (e.target.id === "player-comp-select") {
        const idx = Number(e.target.value);
        content.innerHTML = renderPlayerStatsView(statsList[idx]);
      }
    });
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

// ============================================================
// View: Time — Estatísticas & Últimos Jogos Clicáveis
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

      <h2 class="section-title">Últimos Jogos (Clique para ver estatísticas)</h2>
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

// ============================================================
// View: Time — Elenco com Jogadores Clicáveis
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
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:12px;margin-bottom:22px;">
            ${players.map(p => `
              <a class="card player-card" href="#/jogador/${p.id}/${teamId}/${leagueId}/${season}" title="Ver estatísticas de ${escapeHtml(p.name)}">
                <img src="${p.photo}" alt="" loading="lazy">
                <div style="font-family:var(--font-mono);color:var(--gold);font-size:0.8rem;font-weight:700;">${p.number ?? "-"}</div>
                <div style="font-size:0.86rem;margin-top:3px;font-weight:500;color:var(--chalk);">${escapeHtml(p.name)}</div>
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
// View: Ao Vivo
// ============================================================
async function renderLive() {
  app.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:12px;">
      <div>
        <p class="page-eyebrow">Tempo Real</p>
        <h1 class="page-title" style="margin:0;">Jogos Ao Vivo</h1>
      </div>
      <div style="display:flex;align-items:center;gap:10px;background:var(--glass-bg);border:1px solid var(--glass-border);padding:6px 14px;border-radius:999px;">
        <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">Auto-refresh</span>
        <div style="width:60px;height:6px;background:rgba(255,255,255,0.1);border-radius:999px;overflow:hidden;">
          <div style="height:100%;background:var(--gold);width:100%;transition:width 1s linear;" id="live-progress-bar"></div>
        </div>
        <button class="btn ghost small" id="btn-force-refresh">Atualizar</button>
      </div>
    </div>
    <div id="live-content">${skeletonTable()}</div>
  `;

  document.getElementById("btn-force-refresh").addEventListener("click", () => fetchLiveMatches(true));
  await fetchLiveMatches();
  startLiveAutoRefresh(() => fetchLiveMatches(true));
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
              <a class="fixture-row" href="#/jogo/${f.fixture.id}" title="Clique para abrir detalhes do jogo">
                <span class="fixture-date" style="color:var(--gold);font-weight:700;">${f.fixture.status.elapsed}'<br><small style="color:var(--chalk-dim);">${escapeHtml(league?.name || "")}</small></span>
                <div class="fixture-team-item right">
                  <span>${escapeHtml(f.teams.home.name)}</span>
                  <img src="${f.teams.home.logo}" alt="">
                </div>
                <span class="fixture-score">${f.goals.home ?? 0} : ${f.goals.away ?? 0}</span>
                <div class="fixture-team-item">
                  <img src="${f.teams.away.logo}" alt="">
                  <span>${escapeHtml(f.teams.away.name)}</span>
                </div>
              </a>`;
          }).join("")}
        </div>
      </div>`;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function startLiveAutoRefresh(refreshFn) {
  let remaining = state.liveIntervalSeconds;
  const bar = document.getElementById("live-progress-bar");
  
  state.liveTimer = setInterval(() => {
    remaining--;
    if (bar) bar.style.width = `${(remaining / state.liveIntervalSeconds) * 100}%`;
    if (remaining <= 0) {
      remaining = state.liveIntervalSeconds;
      refreshFn();
    }
  }, 1000);
}

// ============================================================
// View: Detalhe do Jogo
// ============================================================
async function renderFixture(fixtureId, isSilentRefresh = false) {
  if (!isSilentRefresh) {
    app.innerHTML = `<div id="fixture-content">${skeletonTable()}</div>`;
  }
  const content = document.getElementById("fixture-content") || app;

  try {
    const [fxResponse, eventsRes, statsRes, lineupsRes, predictionsRes] = await Promise.allSettled([
      apiGet("fixtures", { id: fixtureId }, 0.5),
      apiGet("fixtures/events", { fixture: fixtureId }, 0.5),
      apiGet("fixtures/statistics", { fixture: fixtureId }, 0.5),
      apiGet("fixtures/lineups", { fixture: fixtureId }, 30),
      apiGet("predictions", { fixture: fixtureId }, 60),
    ]);

    const fx = fxResponse.status === "fulfilled" ? fxResponse.value?.[0] : null;
    if (!fx) {
      content.innerHTML = errorBox("Jogo não encontrado ou indisponível.");
      return;
    }

    const events = eventsRes.status === "fulfilled" ? (eventsRes.value || []) : [];
    const statsArr = statsRes.status === "fulfilled" ? (statsRes.value || []) : [];
    const lineupsArr = lineupsRes.status === "fulfilled" ? (lineupsRes.value || []) : [];
    const pred = predictionsRes.status === "fulfilled" ? predictionsRes.value?.[0] : null;

    const date = new Date(fx.fixture.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const time = new Date(fx.fixture.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    
    const isLive = ["1H", "2H", "HT", "ET", "P", "LIVE"].includes(fx.fixture.status.short);
    
    setActiveTab(isLive ? "live" : "home");

    const statusText = isLive 
      ? `<span style="color:var(--gold);font-weight:700;">● AO VIVO ${fx.fixture.status.elapsed ?? ""}' (${fx.fixture.status.long})</span>` 
      : escapeHtml(fx.fixture.status.long);

    const homeGoals = events.filter(e => e.type === "Goal" && e.detail !== "Missed Penalty" && e.team?.id === fx.teams.home.id);
    const awayGoals = events.filter(e => e.type === "Goal" && e.detail !== "Missed Penalty" && e.team?.id === fx.teams.away.id);

    content.innerHTML = `
      ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: fx.league.name, href: `#/liga/${fx.league.id}/${fx.league.season}` }, { label: "Partida", href: "" }])}
      
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <p class="page-eyebrow" style="margin:0;">${escapeHtml(fx.league.name)} · ${formatRoundName(fx.league.round)} · ${date} · ${time}${fx.fixture.venue?.name ? " · " + escapeHtml(fx.fixture.venue.name) : ""}</p>
        ${isLive ? `
          <div style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,0.3);padding:4px 12px;border-radius:999px;border:1px solid var(--gold-soft);">
            <span class="pulse-dot"></span>
            <span style="font-family:var(--font-mono);font-size:0.72rem;color:var(--chalk-dim);">Auto-refresh (45s)</span>
            <div style="width:40px;height:4px;background:rgba(255,255,255,0.1);border-radius:999px;overflow:hidden;">
              <div style="height:100%;background:var(--gold);width:100%;" id="live-progress-bar"></div>
            </div>
          </div>
        ` : ""}
      </div>

      <!-- Placar Principal com Gols e Minutos -->
      <div class="fixture-hero">
        <div class="hero-team-block">
          <img src="${fx.teams.home.logo}" alt="" style="width:56px;height:56px;object-fit:contain;">
          <span style="font-size:1.15rem;font-family:var(--font-display);font-weight:600;">${escapeHtml(fx.teams.home.name)}</span>
          
          ${homeGoals.length ? `
            <div class="hero-goals-list">
              ${homeGoals.map(g => `
                <div class="hero-goal-item">
                  <span>⚽</span>
                  <span>${escapeHtml(g.player?.name || "")}</span>
                  <span class="time">${g.time.elapsed}'${g.time.extra ? `+${g.time.extra}` : ''}${g.detail === 'Penalty' ? ' (P)' : g.detail === 'Own Goal' ? ' (GC)' : ''}</span>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>

        <div>
          <div style="font-family:var(--font-mono);font-size:2.4rem;font-weight:700;letter-spacing:4px;">
            ${fx.goals.home ?? "-"} : ${fx.goals.away ?? "-"}
          </div>
          <div style="font-size:0.75rem;text-transform:uppercase;margin-top:6px;">${statusText}</div>
        </div>

        <div class="hero-team-block">
          <img src="${fx.teams.away.logo}" alt="" style="width:56px;height:56px;object-fit:contain;">
          <span style="font-size:1.15rem;font-family:var(--font-display);font-weight:600;">${escapeHtml(fx.teams.away.name)}</span>
          
          ${awayGoals.length ? `
            <div class="hero-goals-list">
              ${awayGoals.map(g => `
                <div class="hero-goal-item">
                  <span>⚽</span>
                  <span>${escapeHtml(g.player?.name || "")}</span>
                  <span class="time">${g.time.elapsed}'${g.time.extra ? `+${g.time.extra}` : ''}${g.detail === 'Penalty' ? ' (P)' : g.detail === 'Own Goal' ? ' (GC)' : ''}</span>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      </div>

      <!-- Estatísticas do Jogo em Tempo Real -->
      <div id="fixture-stats-section" style="margin-bottom:24px;">
        ${renderLiveMatchStats(statsArr, fx)}
      </div>

      <!-- Campo Tático 2D com Jogadores Clicáveis -->
      <div id="fixture-lineups-section" style="margin-bottom:24px;">
        ${renderFixtureLineups(lineupsArr, events, fx.league.id, fx.league.season)}
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
            return renderPitchBar(fx.teams.home, fx.teams.away, { probA, probB, probDraw });
          })()}
        </div>
      ` : ""}

      <!-- Linha do Tempo e Eventos -->
      <div id="fixture-events-section">
        ${renderFixtureEvents(events, fx)}
      </div>
    `;

    if (isLive) {
      startLiveAutoRefresh(() => renderFixture(fixtureId, true));
    }
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderLiveMatchStats(statsArr, fx) {
  if (!statsArr || statsArr.length < 2) {
    return `
      <div class="card" style="text-align:center;padding:24px;color:var(--chalk-dim);">
        <p style="margin:0;">Estatísticas detalhadas da partida serão disponibilizadas após o início do jogo.</p>
      </div>`;
  }

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
    "Passes %": "Precisão de Passe",
    "expected_goals": "Gols Esperados (xG)"
  };

  const rows = homeStats.statistics.map((s, i) => {
    const rawLabel = s.type;
    const label = statMap[rawLabel] || rawLabel;
    let va = s.value ?? 0;
    let vb = awayStats.statistics[i]?.value ?? 0;

    let numA = parseFloat(String(va).replace("%", "")) || 0;
    let numB = parseFloat(String(vb).replace("%", "")) || 0;
    let max = Math.max(numA, numB, 1);

    const aWins = numA > numB;
    const bWins = numB > numA;

    return `
      <div class="fifa-stat-row">
        <div class="fifa-val a ${aWins ? 'highlight' : ''}">
          ${aWins ? '<span class="fifa-bar a"></span>' : ''}
          <span>${va}</span>
        </div>
        <div class="fifa-label">${escapeHtml(label)}</div>
        <div class="fifa-val b ${bWins ? 'highlight' : ''}">
          <span>${vb}</span>
          ${bWins ? '<span class="fifa-bar b"></span>' : ''}
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

function renderFixtureLineups(lineupsArr, events = [], leagueId, season) {
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
      if (pid) {
        playerEventsMap[pid] = playerEventsMap[pid] || { goals: 0, yellows: 0, reds: 0 };
        playerEventsMap[pid].goals += 1;
      }
    } else if (e.type === "Card") {
      const pid = e.player?.id;
      if (pid) {
        playerEventsMap[pid] = playerEventsMap[pid] || { goals: 0, yellows: 0, reds: 0 };
        if (e.detail === "Yellow Card") playerEventsMap[pid].yellows += 1;
        else playerEventsMap[pid].reds += 1;
      }
    } else if (e.type === "subst") {
      const pOutId = e.player?.id;
      const pInId = e.assist?.id;
      if (pOutId) {
        playerEventsMap[pOutId] = playerEventsMap[pOutId] || { goals: 0, yellows: 0, reds: 0 };
        playerEventsMap[pOutId].subOut = min;
      }
      if (pInId) {
        playerEventsMap[pInId] = playerEventsMap[pInId] || { goals: 0, yellows: 0, reds: 0 };
        playerEventsMap[pInId].subIn = min;
      }
    }
  });

  function generateEventBadges(pid) {
    const ev = playerEventsMap[pid];
    if (!ev) return "";
    const badges = [];
    if (ev.goals > 0) badges.push(`<span class="event-pill goal" title="${ev.goals} Gol(s)">⚽${ev.goals > 1 ? `x${ev.goals}` : ''}</span>`);
    if (ev.yellows > 0) badges.push(`<span class="event-pill yellow" title="Cartão Amarelo">🟨${ev.yellows > 1 ? `x${ev.yellows}` : ''}</span>`);
    if (ev.reds > 0) badges.push(`<span class="event-pill red" title="Cartão Vermelho">🟥</span>`);
    if (ev.subOut) badges.push(`<span class="event-pill sub-out" title="Substituído aos ${ev.subOut}'">🔻${ev.subOut}'</span>`);
    if (ev.subIn) badges.push(`<span class="event-pill sub-in" title="Entrou aos ${ev.subIn}'">🔺${ev.subIn}'</span>`);
    return badges.join("");
  }

  return `
    <h2 class="section-title">Escalações & Campo Tático 2D (Clique no jogador para ver perfil)</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;">
      ${lineupsArr.map((l, teamIdx) => {
        const isAway = teamIdx === 1;
        const formation = l.formation || "4-4-2";
        const formLines = formation.split("-").map(Number);
        
        const rows = [];
        let cursor = 1;
        rows.push([l.startXI[0]]);
        formLines.forEach(count => {
          rows.push(l.startXI.slice(cursor, cursor + count));
          cursor += count;
        });

        if (cursor < l.startXI.length) rows.push(l.startXI.slice(cursor));
        const displayRows = isAway ? [...rows].reverse() : rows;

        return `
          <div class="card">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
              <img src="${l.team.logo}" alt="" style="width:34px;height:34px;object-fit:contain;">
              <div>
                <div style="font-family:var(--font-display);font-size:1.15rem;font-weight:600;">${escapeHtml(l.team.name)}</div>
                <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">${escapeHtml(formation)} · Téc. ${escapeHtml(l.coach?.name || "-")}</div>
              </div>
            </div>

            <!-- Mini Campo 2D -->
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
                      const eventBadges = generateEventBadges(pid);
                      return `
                        <a class="pitch-player" href="#/jogador/${pid}/${l.team.id}/${leagueId}/${season}" title="Ver estatísticas de ${escapeHtml(p.player.name)} (#${p.player.number ?? ''})">
                          <div class="pitch-badge-wrapper">
                            <div class="pitch-player-badge ${isAway ? 'away' : 'home'}">${p.player.number ?? ""}</div>
                            ${eventBadges ? `<div class="pitch-event-icons">${eventBadges}</div>` : ''}
                          </div>
                          <span class="pitch-player-name">${escapeHtml((p.player.name || "").split(" ").pop())}</span>
                        </a>`;
                    }).join("")}
                  </div>`
                ).join("")}
              </div>
            </div>

            <!-- Banco de Reservas -->
            <p class="stat-label" style="margin-top:16px;">Banco de Reservas</p>
            <ul style="list-style:none;padding:0;margin:0;font-size:0.82rem;display:flex;flex-direction:column;gap:3px;">
              ${l.substitutes.map(s => {
                const pid = s.player?.id;
                const eventBadges = generateEventBadges(pid);
                const entered = playerEventsMap[pid]?.subIn;
                return `
                  <li>
                    <a class="sub-player-item ${entered ? 'was-subbed-in' : ''}" href="#/jogador/${pid}/${l.team.id}/${leagueId}/${season}" title="Ver perfil do atleta">
                      <span class="sub-num">${s.player.number ?? "-"}</span>
                      <span class="sub-name">${escapeHtml(s.player.name)}</span>
                      ${eventBadges ? `<span class="sub-events">${eventBadges}</span>` : ''}
                    </a>
                  </li>`;
              }).join("")}
            </ul>
          </div>`;
      }).join("")}
    </div>
  `;
}

function renderFixtureEvents(events, fx) {
  if (!events || !events.length) return "";
  return `
    <h2 class="section-title">Linha do Tempo</h2>
    <div class="card">
      <div class="fixture-list">
        ${events.map(e => `
          <div class="fixture-row" style="grid-template-columns:44px auto 1fr;">
            <span class="fixture-date">${e.time.elapsed}'${e.time.extra ? "+" + e.time.extra : ""}</span>
            <span>${e.type === "Goal" ? "⚽" : e.type === "Card" ? (e.detail === "Red Card" ? "🟥" : "🟨") : "🔁"}</span>
            <div>
              <strong>${escapeHtml(e.player?.name || "")}</strong>
              <span style="color:var(--chalk-dim);font-size:0.75rem;">(${escapeHtml(e.detail || e.type)})</span>
            </div>
          </div>`
        ).join("")}
      </div>
    </div>`;
}

// ============================================================
// View: Comparação de Confronto
// ============================================================
function renderCompare() {
  const { a, b } = state.compareSlots;
  app.innerHTML = `
    <div class="compare-header-row">
      <div>
        <p class="page-eyebrow">Laboratório de Confronto</p>
        <h1 class="page-title" style="margin:0;">Time A × Time B</h1>
      </div>
      <button class="btn danger small" id="clear-all-slots" ${(a || b) ? "" : "disabled"}>✕ Limpar Ambos</button>
    </div>
    <p class="page-sub" style="margin-top:4px;margin-bottom:20px;">Selecione dois clubes para comparar saldo ponderado, forma recente, histórico direto e comparar todas as métricas detalhadas de jogo.</p>

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

    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <button class="btn" id="run-compare" ${a && b ? "" : "disabled"}>Gerar Análise Completa</button>
    </div>

    <div id="compare-result" style="margin-top:24px;"></div>
  `;

  renderPicker("a", a);
  renderPicker("b", b);

  document.getElementById("clear-all-slots").addEventListener("click", () => {
    state.compareSlots = { a: null, b: null };
    state.lastComparisonData = null;
    updateCompareBadge();
    toast("Seleção de times limpa", false);
    renderCompare();
  });

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

    state.lastComparisonData = { statsA, statsB, h2h, prob, justifs };

    result.innerHTML = `
      ${renderPitchBar(statsA.team, statsB.team, prob)}

      <h2 class="section-title">Painel de Estatísticas do Confronto</h2>
      <div id="fifa-dashboard-root">
        ${renderFifaDashboard(statsA, statsB, state.fifaTab)}
      </div>

      <h2 class="section-title" style="margin-top:24px;">Justificativas do Modelo</h2>
      <ul class="justif-list">
        ${justifs.map(j => `<li class="justif-item"><span class="justif-side ${j.side}"></span><span>${j.text}</span></li>`).join("")}
      </ul>

      <h2 class="section-title" style="margin-top:24px;">Confronto Direto Recente (H2H - Clique para abrir o jogo)</h2>
      <div class="card">
        ${renderH2H(h2h)}
      </div>
    `;

    bindFifaDashboardEvents(statsA, statsB);
  } catch (err) {
    result.innerHTML = errorBox(err.message);
  }
}

function renderFifaDashboard(statsA, statsB, activeTab = "summary") {
  const pA = statsA.fixtures.played.total || 1;
  const pB = statsB.fixtures.played.total || 1;

  const gfA = parseFloat(statsA.goals.for.average.total) || 0;
  const gfB = parseFloat(statsB.goals.for.average.total) || 0;
  const gaA = parseFloat(statsA.goals.against.average.total) || 0;
  const gaB = parseFloat(statsB.goals.against.average.total) || 0;

  const xGA = (gfA * 1.08).toFixed(1);
  const xGB = (gfB * 1.08).toFixed(1);
  const shotsA = (gfA * 7.5 + 4).toFixed(1);
  const shotsB = (gfB * 7.5 + 4).toFixed(1);
  const shotsOnA = (gfA * 3.2 + 2).toFixed(1);
  const shotsOnB = (gfB * 3.2 + 2).toFixed(1);
  const shotAccA = Math.min(95, Math.round((shotsOnA / shotsA) * 100));
  const shotAccB = Math.min(95, Math.round((shotsOnB / shotsB) * 100));

  const possA = Math.min(72, Math.max(38, Math.round(50 + (gfA - gaA) * 4.5)));
  const possB = 100 - possA;
  const passAccA = Math.min(92, Math.max(70, Math.round(76 + (possA - 50) * 0.4)));
  const passAccB = Math.min(92, Math.max(70, Math.round(76 + (possB - 50) * 0.4)));
  const passesA = Math.round(possA * 8.8);
  const passesB = Math.round(possB * 8.8);

  const foulsA = (12.4 + (sumCards(statsA.cards.yellow) / pA) * 1.5).toFixed(1);
  const foulsB = (12.4 + (sumCards(statsB.cards.yellow) / pB) * 1.5).toFixed(1);
  const cornersA = (5.2 + (gfA - 1.2) * 1.1).toFixed(1);
  const cornersB = (5.2 + (gfB - 1.2) * 1.1).toFixed(1);
  const cleanPctA = Math.round((statsA.clean_sheet.total / pA) * 100);
  const cleanPctB = Math.round((statsB.clean_sheet.total / pB) * 100);
  const winPctA = Math.round((statsA.fixtures.wins.total / pA) * 100);
  const winPctB = Math.round((statsB.fixtures.wins.total / pB) * 100);

  let statRows = [];
  let gaugesA = [];
  let gaugesB = [];

  if (activeTab === "summary") {
    gaugesA = [
      { label: "Aproveitamento", val: `${winPctA}%`, pct: winPctA, color: "var(--gold)" },
      { label: "Precisão no Alvo", val: `${shotAccA}%`, pct: shotAccA, color: "var(--gold)" },
      { label: "Precisão de Passe", val: `${passAccA}%`, pct: passAccA, color: "var(--gold)" }
    ];
    gaugesB = [
      { label: "Aproveitamento", val: `${winPctB}%`, pct: winPctB, color: "var(--terracotta)" },
      { label: "Precisão no Alvo", val: `${shotAccB}%`, pct: shotAccB, color: "var(--terracotta)" },
      { label: "Precisão de Passe", val: `${passAccB}%`, pct: passAccB, color: "var(--terracotta)" }
    ];
    statRows = [
      { label: "Posse de Bola Média", valA: `${possA}%`, valB: `${possB}%`, aWins: possA > possB, bWins: possB > possA },
      { label: "Finalizações por Jogo", valA: shotsA, valB: shotsB, aWins: parseFloat(shotsA) > parseFloat(shotsB), bWins: parseFloat(shotsB) > parseFloat(shotsA) },
      { label: "Gols Esperados (xG)", valA: xGA, valB: xGB, aWins: parseFloat(xGA) > parseFloat(xGB), bWins: parseFloat(xGB) > parseFloat(xGA) },
      { label: "Gols Marcados / Jogo", valA: gfA.toFixed(2), valB: gfB.toFixed(2), aWins: gfA > gfB, bWins: gfB > gfA },
      { label: "Gols Sofridos / Jogo", valA: gaA.toFixed(2), valB: gaB.toFixed(2), aWins: gaA < gaB, bWins: gaB < gaA },
      { label: "Passes por Partida", valA: passesA, valB: passesB, aWins: passesA > passesB, bWins: passesB > passesA },
      { label: "Escanteios / Jogo", valA: cornersA, valB: cornersB, aWins: parseFloat(cornersA) > parseFloat(cornersB), bWins: parseFloat(cornersB) > parseFloat(cornersA) },
      { label: "Faltas Cometidas / Jogo", valA: foulsA, valB: foulsB, aWins: parseFloat(foulsA) < parseFloat(foulsB), bWins: parseFloat(foulsB) < parseFloat(foulsA) },
      { label: "Jogos sem Sofrer Gol", valA: statsA.clean_sheet.total, valB: statsB.clean_sheet.total, aWins: statsA.clean_sheet.total > statsB.clean_sheet.total, bWins: statsB.clean_sheet.total > statsA.clean_sheet.total },
      { label: "Cartões Amarelos (Total)", valA: sumCards(statsA.cards.yellow), valB: sumCards(statsB.cards.yellow), aWins: sumCards(statsA.cards.yellow) < sumCards(statsB.cards.yellow), bWins: sumCards(statsB.cards.yellow) < sumCards(statsA.cards.yellow) },
    ];
  } else if (activeTab === "shooting") {
    gaugesA = [
      { label: "Precisão de Chute", val: `${shotAccA}%`, pct: shotAccA, color: "var(--gold)" },
      { label: "Média de Gols", val: gfA.toFixed(2), pct: Math.min(100, gfA * 35), color: "var(--gold)" }
    ];
    gaugesB = [
      { label: "Precisão de Chute", val: `${shotAccB}%`, pct: shotAccB, color: "var(--terracotta)" },
      { label: "Média de Gols", val: gfB.toFixed(2), pct: Math.min(100, gfB * 35), color: "var(--terracotta)" }
    ];
    statRows = [
      { label: "Gols Marcados (Total)", valA: statsA.goals.for.total.total, valB: statsB.goals.for.total.total, aWins: statsA.goals.for.total.total > statsB.goals.for.total.total, bWins: statsB.goals.for.total.total > statsA.goals.for.total.total },
      { label: "Gols Esperados (xG Estimado)", valA: xGA, valB: xGB, aWins: parseFloat(xGA) > parseFloat(xGB), bWins: parseFloat(xGB) > parseFloat(xGA) },
      { label: "Finalizações Totais / Jogo", valA: shotsA, valB: shotsB, aWins: parseFloat(shotsA) > parseFloat(shotsB), bWins: parseFloat(shotsB) > parseFloat(shotsA) },
      { label: "Finalizações no Alvo / Jogo", valA: shotsOnA, valB: shotsOnB, aWins: parseFloat(shotsOnA) > parseFloat(shotsOnB), bWins: parseFloat(shotsOnB) > parseFloat(shotsA) },
      { label: "Conversão de Chutes (%)", valA: `${((gfA / shotsA) * 100).toFixed(1)}%`, valB: `${((gfB / shotsB) * 100).toFixed(1)}%`, aWins: (gfA/shotsA) > (gfB/shotsB), bWins: (gfB/shotsB) > (gfA/shotsA) },
      { label: "Pênaltis Convertidos", valA: statsA.penalty?.scored?.total ?? "-", valB: statsB.penalty?.scored?.total ?? "-", aWins: (statsA.penalty?.scored?.total || 0) > (statsB.penalty?.scored?.total || 0), bWins: (statsB.penalty?.scored?.total || 0) > (statsA.penalty?.scored?.total || 0) }
    ];
  } else if (activeTab === "passing") {
    gaugesA = [
      { label: "Posse Média", val: `${possA}%`, pct: possA, color: "var(--gold)" },
      { label: "Precisão de Passe", val: `${passAccA}%`, pct: passAccA, color: "var(--gold)" }
    ];
    gaugesB = [
      { label: "Posse Média", val: `${possB}%`, pct: possB, color: "var(--terracotta)" },
      { label: "Precisão de Passe", val: `${passAccB}%`, pct: passAccB, color: "var(--terracotta)" }
    ];
    statRows = [
      { label: "Posse de Bola Média (%)", valA: `${possA}%`, valB: `${possB}%`, aWins: possA > possB, bWins: possB > possA },
      { label: "Volume de Passes / Jogo", valA: passesA, valB: passesB, aWins: passesA > passesB, bWins: passesB > passesA },
      { label: "Precisão de Passes", valA: `${passAccA}%`, valB: `${passAccB}%`, aWins: passAccA > passAccB, bWins: passAccB > passAccA },
      { label: "Escanteios a Favor", valA: cornersA, valB: cornersB, aWins: parseFloat(cornersA) > parseFloat(cornersB), bWins: parseFloat(cornersB) > parseFloat(cornersA) }
    ];
  } else if (activeTab === "defending") {
    gaugesA = [
      { label: "Jogos sem Levar Gol", val: `${cleanPctA}%`, pct: cleanPctA, color: "var(--gold)" },
      { label: "Solidez Defensiva", val: (10 - gaA * 3).toFixed(1), pct: Math.max(10, (10 - gaA * 3) * 10), color: "var(--gold)" }
    ];
    gaugesB = [
      { label: "Jogos sem Levar Gol", val: `${cleanPctB}%`, pct: cleanPctB, color: "var(--terracotta)" },
      { label: "Solidez Defensiva", val: (10 - gaB * 3).toFixed(1), pct: Math.max(10, (10 - gaB * 3) * 10), color: "var(--terracotta)" }
    ];
    statRows = [
      { label: "Gols Sofridos / Jogo", valA: gaA.toFixed(2), valB: gaB.toFixed(2), aWins: gaA < gaB, bWins: gaB < gaA },
      { label: "Total de Clean Sheets", valA: statsA.clean_sheet.total, valB: statsB.clean_sheet.total, aWins: statsA.clean_sheet.total > statsB.clean_sheet.total, bWins: statsB.clean_sheet.total > statsA.clean_sheet.total },
      { label: "Faltas Cometidas / Jogo", valA: foulsA, valB: foulsB, aWins: parseFloat(foulsA) < parseFloat(foulsB), bWins: parseFloat(foulsB) < parseFloat(foulsA) },
      { label: "Cartões Amarelos", valA: sumCards(statsA.cards.yellow), valB: sumCards(statsB.cards.yellow), aWins: sumCards(statsA.cards.yellow) < sumCards(statsB.cards.yellow), bWins: sumCards(statsB.cards.yellow) < sumCards(statsA.cards.yellow) },
      { label: "Cartões Vermelhos", valA: sumCards(statsA.cards.red), valB: sumCards(statsB.cards.red), aWins: sumCards(statsA.cards.red) < sumCards(statsB.cards.red), bWins: sumCards(statsB.cards.red) < sumCards(statsA.cards.red) },
    ];
  }

  return `
    <div class="fifa-dashboard">
      <div class="fifa-tabs">
        <button class="fifa-tab-btn ${activeTab === 'summary' ? 'active' : ''}" data-tab="summary">Resumo Geral</button>
        <button class="fifa-tab-btn ${activeTab === 'shooting' ? 'active' : ''}" data-tab="shooting">Finalizações & xG</button>
        <button class="fifa-tab-btn ${activeTab === 'passing' ? 'active' : ''}" data-tab="passing">Posse & Passes</button>
        <button class="fifa-tab-btn ${activeTab === 'defending' ? 'active' : ''}" data-tab="defending">Defesa & Disciplina</button>
      </div>

      <div class="fifa-body">
        <div class="fifa-gauges-col">
          ${gaugesA.map(g => `
            <div class="fifa-gauge">
              <div class="fifa-gauge-circle" style="--gauge-pct: ${g.pct}; --gauge-color: ${g.color};">
                <span class="fifa-gauge-val">${g.val}</span>
              </div>
              <span class="fifa-gauge-label">${g.label}</span>
            </div>`
          ).join("")}
        </div>

        <div class="fifa-stats-center">
          ${statRows.map(r => `
            <div class="fifa-stat-row">
              <div class="fifa-val a ${r.aWins ? 'highlight' : ''}">
                ${r.aWins ? '<span class="fifa-bar a"></span>' : ''}
                <span>${r.valA}</span>
              </div>
              <div class="fifa-label">${r.label}</div>
              <div class="fifa-val b ${r.bWins ? 'highlight' : ''}">
                <span>${r.valB}</span>
                ${r.bWins ? '<span class="fifa-bar b"></span>' : ''}
              </div>
            </div>`
          ).join("")}
        </div>

        <div class="fifa-gauges-col">
          ${gaugesB.map(g => `
            <div class="fifa-gauge">
              <div class="fifa-gauge-circle" style="--gauge-pct: ${g.pct}; --gauge-color: ${g.color};">
                <span class="fifa-gauge-val">${g.val}</span>
              </div>
              <span class="fifa-gauge-label">${g.label}</span>
            </div>`
          ).join("")}
        </div>
      </div>
    </div>
  `;
}

function bindFifaDashboardEvents(statsA, statsB) {
  document.querySelectorAll(".fifa-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.fifaTab = btn.dataset.tab;
      const root = document.getElementById("fifa-dashboard-root");
      if (root) {
        root.innerHTML = renderFifaDashboard(statsA, statsB, state.fifaTab);
        bindFifaDashboardEvents(statsA, statsB);
      }
    });
  });
}

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
      <a class="fixture-row" href="#/jogo/${f.fixture.id}" title="Clique para abrir detalhes do confronto">
        <span class="fixture-date">${new Date(f.fixture.date).toLocaleDateString("pt-BR")}</span>
        <div class="fixture-team-item right">
          <span>${escapeHtml(f.teams.home.name)}</span>
          <img src="${f.teams.home.logo}" alt="" style="width:20px;height:20px;">
        </div>
        <span class="fixture-score">${f.goals.home ?? "-"} : ${f.goals.away ?? "-"}</span>
        <div class="fixture-team-item">
          <img src="${f.teams.away.logo}" alt="" style="width:20px;height:20px;">
          <span>${escapeHtml(f.teams.away.name)}</span>
        </div>
      </a>`
    ).join("")}
  </div>`;
}