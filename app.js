// ============================================================
// APURAÇÃO — app.js
// SPA vanilla JS. Roteamento por hash. Sem frameworks, sem build.
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

function defaultSeasonFor(league) {
  const now = new Date();
  const y = now.getFullYear();
  if (!league || league.calendarYear) return y;
  // temporada europeia out/ago: se estamos antes de julho, a temporada em curso começou no ano anterior
  return now.getMonth() < 6 ? y - 1 : y;
}

// ---------- estado global simples ----------
const state = {
  compareSlots: { a: null, b: null }, // { teamId, name, logo, leagueId, leagueName, season, contexts:[] }
  homeSide: null, // 'a' | 'b' | null
};

const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
const quotaHint = document.getElementById("quota-hint");

function toast(msg, isError = true) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastEl.style.borderColor = isError ? "var(--terracotta)" : "var(--win)";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.hidden = true), 4200);
}

function markUpdated() {
  quotaHint.textContent = "Atualizado " + new Date().toLocaleTimeString("pt-BR");
}

async function apiGet(endpoint, params = {}) {
  const clean = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") clean[k] = v;
  });
  const qs = new URLSearchParams({ endpoint, ...clean }).toString();
  const res = await fetch(`${FN_URL}?${qs}`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Resposta inválida da API.");
  }
  if (!res.ok) {
    throw new Error(data.error || `Erro ${res.status} ao consultar a API.`);
  }
  if (data.errors && Array.isArray(data.errors) === false && Object.keys(data.errors).length) {
    const firstErr = Object.values(data.errors)[0];
    throw new Error(typeof firstErr === "string" ? firstErr : "A API retornou um erro.");
  }
  markUpdated();
  return data.response;
}

function loadingBox(label = "Carregando dados…") {
  return `<div class="state-box"><div class="spinner"></div><div class="state-title">${label}</div></div>`;
}
function errorBox(msg) {
  return `<div class="state-box"><div class="state-title">Não deu pra carregar</div><div>${escapeHtml(msg)}</div></div>`;
}
function subNav(items) {
  return `<div class="subnav">
    ${items
      .map(
        (it) =>
          `<a class="subnav-item ${it.active ? "active" : ""}" href="${it.href}">${escapeHtml(it.label)}</a>`
      )
      .join("")}
  </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ============================================================
// Roteamento
// ============================================================
function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean);
  return parts;
}

function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.nav === name));
}

async function router() {
  const parts = parseHash();
  window.scrollTo(0, 0);

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
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const nav = el.dataset.nav;
      if (nav === "home") location.hash = "#/";
      if (nav === "compare") location.hash = "#/compare";
      if (nav === "live") location.hash = "#/aovivo";
    });
  });
  router();
});

// ============================================================
// View: Home — grid de ligas
// ============================================================
function renderHome() {
  app.innerHTML = `
    <div class="page-head">
      <p class="page-eyebrow">Competições</p>
      <h1 class="page-title">Escolha uma liga</h1>
      <p class="page-sub">Classificação, estatísticas por time e comparação direta de confrontos.</p>
    </div>
    <div class="league-grid">
      ${LEAGUES.map(
        (l) => `
        <a class="league-card" href="#/liga/${l.id}/${defaultSeasonFor(l)}">
          <div class="league-country">${escapeHtml(l.country)}</div>
          <div class="league-name">${escapeHtml(l.name)}</div>
        </a>`
      ).join("")}
    </div>
  `;
}

// ============================================================
// View: Liga — classificação
// ============================================================
async function renderLeague(leagueId, season) {
  const league = LEAGUES.find((l) => l.id === leagueId) || { id: leagueId, name: "Liga", country: "" };
  season = season || defaultSeasonFor(league);

  app.innerHTML = `
    <div class="page-head">
      <p class="page-eyebrow">${escapeHtml(league.country)}</p>
      <h1 class="page-title">${escapeHtml(league.name)}</h1>
    </div>
    <div class="season-row">
      <label for="season-select">Temporada</label>
      <select id="season-select">
        ${[season + 1, season, season - 1, season - 2].map((y) => `<option value="${y}" ${y === season ? "selected" : ""}>${y}</option>`).join("")}
      </select>
      <a class="btn ghost small" href="#/compare">Ir para comparação →</a>
    </div>
    ${subNav([
      { label: "Classificação", href: `#/liga/${leagueId}/${season}`, active: true },
      { label: "Jogos", href: `#/liga/${leagueId}/${season}/jogos` },
      { label: "Artilheiros", href: `#/liga/${leagueId}/${season}/artilheiros` },
    ])}
    <div id="league-content">${loadingBox("Buscando classificação…")}</div>
  `;

  document.getElementById("season-select").addEventListener("change", (e) => {
    location.hash = `#/liga/${leagueId}/${e.target.value}`;
  });

  const content = document.getElementById("league-content");
  try {
    const response = await apiGet("standings", { league: leagueId, season });
    const groups = response?.[0]?.league?.standings;
    if (!groups || !groups.length) {
      content.innerHTML = `<div class="state-box"><div class="state-title">Sem classificação disponível</div>Tente outra temporada.</div>`;
      return;
    }
    content.innerHTML = groups
      .map((table, gi) => renderStandingsTable(table, leagueId, season, groups.length > 1 ? `Grupo ${gi + 1}` : null))
      .join("");
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderStandingsTable(table, leagueId, season, groupLabel) {
  const rows = table
    .map((row) => {
      const formPills = (row.form || "")
        .split("")
        .slice(-5)
        .map((c) => `<span class="form-pill ${c}" title="${c}"></span>`)
        .join("");
      return `
      <tr data-team-id="${row.team.id}" data-team-name="${escapeHtml(row.team.name)}" data-team-logo="${row.team.logo}">
        <td class="pos-cell">${row.rank}</td>
        <td class="team-cell"><img src="${row.team.logo}" alt=""><span>${escapeHtml(row.team.name)}</span></td>
        <td>${row.all.played}</td>
        <td>${row.all.win}</td>
        <td>${row.all.draw}</td>
        <td>${row.all.lose}</td>
        <td>${row.all.goals.for}</td>
        <td>${row.all.goals.against}</td>
        <td>${row.goalsDiff > 0 ? "+" : ""}${row.goalsDiff}</td>
        <td><strong>${row.points}</strong></td>
        <td>${formPills}</td>
        <td><button class="select-btn" data-action="view">ver</button></td>
      </tr>`;
    })
    .join("");

  const html = `
    ${groupLabel ? `<h2 class="section-title">${groupLabel}</h2>` : ""}
    <div class="card" style="overflow-x:auto;margin-bottom:20px;">
      <table class="standings-table">
        <thead><tr>
          <th>#</th><th>Time</th><th>J</th><th>V</th><th>E</th><th>D</th>
          <th>GP</th><th>GC</th><th>SG</th><th>Pts</th><th>Últ. 5</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  // adiar o binding de clique pra depois de inserir no DOM (feito no chamador via delegação)
  setTimeout(() => {
    document.querySelectorAll(".standings-table tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => {
        location.hash = `#/time/${tr.dataset.teamId}/${leagueId}/${season}`;
      });
    });
  }, 0);

  return html;
}

// ============================================================
// View: Liga — jogos (próximos e resultados recentes)
// ============================================================
async function renderLeagueFixtures(leagueId, season) {
  const league = LEAGUES.find((l) => l.id === leagueId) || { id: leagueId, name: "Liga", country: "" };

  app.innerHTML = `
    <div class="page-head">
      <p class="page-eyebrow">${escapeHtml(league.country)}</p>
      <h1 class="page-title">${escapeHtml(league.name)}</h1>
    </div>
    ${subNav([
      { label: "Classificação", href: `#/liga/${leagueId}/${season}` },
      { label: "Jogos", href: `#/liga/${leagueId}/${season}/jogos`, active: true },
      { label: "Artilheiros", href: `#/liga/${leagueId}/${season}/artilheiros` },
    ])}
    <div id="fx-content">${loadingBox("Buscando jogos…")}</div>
  `;

  const content = document.getElementById("fx-content");
  try {
    const [next, last] = await Promise.all([
      apiGet("fixtures", { league: leagueId, season, next: 10 }),
      apiGet("fixtures", { league: leagueId, season, last: 10 }),
    ]);

    content.innerHTML = `
      <h2 class="section-title">Próximos jogos</h2>
      <div class="card" style="margin-bottom:20px;">${renderFixtureList(next)}</div>
      <h2 class="section-title">Resultados recentes</h2>
      <div class="card">${renderFixtureList(last)}</div>
    `;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderFixtureList(fixtures) {
  if (!fixtures || !fixtures.length) return `<p style="color:var(--chalk-dim);">Nada encontrado.</p>`;
  return `<div class="fixture-list">
    ${fixtures
      .map((f) => {
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
      })
      .join("")}
  </div>`;
}

// ============================================================
// View: Liga — artilheiros, garçons e cartões
// ============================================================
async function renderLeagueTopStats(leagueId, season) {
  const league = LEAGUES.find((l) => l.id === leagueId) || { id: leagueId, name: "Liga", country: "" };

  app.innerHTML = `
    <div class="page-head">
      <p class="page-eyebrow">${escapeHtml(league.country)}</p>
      <h1 class="page-title">${escapeHtml(league.name)}</h1>
    </div>
    ${subNav([
      { label: "Classificação", href: `#/liga/${leagueId}/${season}` },
      { label: "Jogos", href: `#/liga/${leagueId}/${season}/jogos` },
      { label: "Artilheiros", href: `#/liga/${leagueId}/${season}/artilheiros`, active: true },
    ])}
    <div id="top-content">${loadingBox("Buscando rankings…")}</div>
  `;

  const content = document.getElementById("top-content");
  try {
    const [scorers, assists, yellows] = await Promise.all([
      apiGet("players/topscorers", { league: leagueId, season }),
      apiGet("players/topassists", { league: leagueId, season }),
      apiGet("players/topyellowcards", { league: leagueId, season }),
    ]);

    content.innerHTML = `
      <h2 class="section-title">Artilheiros</h2>
      <div class="card" style="margin-bottom:20px;">${renderTopList(scorers, (s) => `${s.goals.total} gols`)}</div>
      <h2 class="section-title">Garçons (assistências)</h2>
      <div class="card" style="margin-bottom:20px;">${renderTopList(assists, (s) => `${s.goals.assists ?? 0} assist.`)}</div>
      <h2 class="section-title">Cartões amarelos</h2>
      <div class="card">${renderTopList(yellows, (s) => `${s.cards.yellow} cartões`)}</div>
    `;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderTopList(list, metricFn) {
  if (!list || !list.length) return `<p style="color:var(--chalk-dim);">Sem dados disponíveis.</p>`;
  return `<div class="top-list">
    ${list
      .slice(0, 10)
      .map((entry, i) => {
        const p = entry.player;
        const s = entry.statistics[0];
        return `
        <div class="top-row">
          <span class="top-rank">${i + 1}</span>
          <img src="${p.photo}" alt="" class="top-photo">
          <div class="top-info">
            <div class="top-name">${escapeHtml(p.name)}</div>
            <div class="top-team">${escapeHtml(s.team.name)}</div>
          </div>
          <span class="top-metric">${metricFn(s)}</span>
        </div>`;
      })
      .join("")}
  </div>`;
}

// ============================================================
// View: Time — estatísticas individuais
// ============================================================
async function renderTeam(teamId, leagueId, season) {
  const league = LEAGUES.find((l) => l.id === leagueId);
  season = season || defaultSeasonFor(league);

  app.innerHTML = `<div id="team-content">${loadingBox("Buscando estatísticas do time…")}</div>`;
  const content = document.getElementById("team-content");

  try {
    const [stats, recentFixtures] = await Promise.all([
      apiGet("teams/statistics", { league: leagueId, season, team: teamId }),
      apiGet("fixtures", { team: teamId, last: 5 }),
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
          <p class="stat-label">Jogos disputados</p>
          <p class="stat-value">${played}</p>
          <div class="stat-split"><span>Casa ${stats.fixtures.played.home}</span><span>Fora ${stats.fixtures.played.away}</span></div>
        </div>
        <div class="stat-card">
          <p class="stat-label">Gols marcados (total)</p>
          <p class="stat-value">${stats.goals.for.total.total}</p>
          <div class="stat-split"><span>Casa ${stats.goals.for.total.home}</span><span>Fora ${stats.goals.for.total.away}</span></div>
        </div>
        <div class="stat-card">
          <p class="stat-label">Gols marcados (média/jogo)</p>
          <p class="stat-value">${gfAvg.toFixed(2)}</p>
          <div class="stat-split"><span>Casa ${stats.goals.for.average.home}</span><span>Fora ${stats.goals.for.average.away}</span></div>
        </div>
        <div class="stat-card">
          <p class="stat-label">Gols sofridos (total)</p>
          <p class="stat-value">${stats.goals.against.total.total}</p>
          <div class="stat-split"><span>Casa ${stats.goals.against.total.home}</span><span>Fora ${stats.goals.against.total.away}</span></div>
        </div>
        <div class="stat-card">
          <p class="stat-label">Gols sofridos (média/jogo)</p>
          <p class="stat-value">${gaAvg.toFixed(2)}</p>
          <div class="stat-split"><span>Casa ${stats.goals.against.average.home}</span><span>Fora ${stats.goals.against.average.away}</span></div>
        </div>
        <div class="stat-card">
          <p class="stat-label">Saldo de gols</p>
          <p class="stat-value">${(stats.goals.for.total.total - stats.goals.against.total.total) >= 0 ? "+" : ""}${stats.goals.for.total.total - stats.goals.against.total.total}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Jogos sem sofrer gol</p>
          <p class="stat-value">${stats.clean_sheet.total}</p>
          <div class="stat-split"><span>Casa ${stats.clean_sheet.home}</span><span>Fora ${stats.clean_sheet.away}</span></div>
        </div>
        <div class="stat-card">
          <p class="stat-label">Jogos sem marcar</p>
          <p class="stat-value">${stats.failed_to_score.total}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Cartões amarelos</p>
          <p class="stat-value">${sumCards(stats.cards.yellow)}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Cartões vermelhos</p>
          <p class="stat-value">${sumCards(stats.cards.red)}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Forma recente</p>
          <p class="stat-value" style="font-size:1.1rem;letter-spacing:2px;">${(stats.form || "—").slice(-5)}</p>
        </div>
      </div>

      <h2 class="section-title">Últimos jogos</h2>
      <div class="card" style="margin-bottom:20px;">
        ${renderRecentFixtures(recentFixtures, teamId)}
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn" id="set-slot-a">Definir como Time A na comparação</button>
        <button class="btn ghost" id="set-slot-b">Definir como Time B na comparação</button>
      </div>
    `;

    document.getElementById("set-slot-a").addEventListener("click", () => setCompareSlot("a", t, leagueId, league?.name, season));
    document.getElementById("set-slot-b").addEventListener("click", () => setCompareSlot("b", t, leagueId, league?.name, season));
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

// ============================================================
// View: Time — elenco
// ============================================================
async function renderSquad(teamId, leagueId, season) {
  const league = LEAGUES.find((l) => l.id === leagueId);
  app.innerHTML = `<div id="squad-content">${loadingBox("Buscando elenco…")}</div>`;
  const content = document.getElementById("squad-content");

  try {
    const response = await apiGet("players/squads", { team: teamId });
    const squad = response?.[0];
    if (!squad) {
      content.innerHTML = errorBox("Elenco não disponível para esse time.");
      return;
    }

    const groups = { Goalkeeper: "Goleiros", Defender: "Zagueiros e laterais", Midfielder: "Meio-campo", Attacker: "Ataque" };
    const byPos = {};
    (squad.players || []).forEach((p) => {
      const key = p.position || "Outros";
      byPos[key] = byPos[key] || [];
      byPos[key].push(p);
    });

    content.innerHTML = `
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
      ${Object.entries(groups)
        .map(([key, label]) => {
          const players = byPos[key];
          if (!players || !players.length) return "";
          return `
          <h2 class="section-title">${label}</h2>
          <div class="squad-grid" style="margin-bottom:20px;">
            ${players
              .map(
                (p) => `
              <div class="squad-card">
                <img src="${p.photo}" alt="">
                <div class="squad-number">${p.number ?? "-"}</div>
                <div class="squad-name">${escapeHtml(p.name)}</div>
                <div class="squad-age">${p.age ? p.age + " anos" : ""}</div>
              </div>`
              )
              .join("")}
          </div>`;
        })
        .join("")}
    `;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

// ============================================================
// View: Time — lesões e desfalques
// ============================================================
async function renderInjuries(teamId, leagueId, season) {
  const league = LEAGUES.find((l) => l.id === leagueId);
  app.innerHTML = `<div id="injuries-content">${loadingBox("Buscando lesões e desfalques…")}</div>`;
  const content = document.getElementById("injuries-content");

  try {
    const injuries = await apiGet("injuries", { team: teamId, season });

    content.innerHTML = `
      <div class="page-head">
        <p class="page-eyebrow">${escapeHtml(league?.name || "")} · ${season}</p>
        <h1 class="page-title">Lesões e desfalques</h1>
      </div>
      ${subNav([
        { label: "Estatísticas", href: `#/time/${teamId}/${leagueId}/${season}` },
        { label: "Elenco", href: `#/time/${teamId}/${leagueId}/${season}/elenco` },
        { label: "Lesões", href: `#/time/${teamId}/${leagueId}/${season}/lesoes`, active: true },
      ])}
      <div class="card">
        ${
          !injuries || !injuries.length
            ? `<p style="color:var(--chalk-dim);">Nenhuma lesão ou desfalque registrado nessa temporada.</p>`
            : `<div class="injury-list">
              ${injuries
                .map(
                  (inj) => `
                <div class="injury-row">
                  <img src="${inj.player.photo}" alt="">
                  <div class="injury-info">
                    <div class="injury-name">${escapeHtml(inj.player.name)}</div>
                    <div class="injury-reason">${escapeHtml(inj.player.reason || inj.player.type || "Motivo não informado")}</div>
                  </div>
                  <span class="injury-date">${inj.fixture?.date ? new Date(inj.fixture.date).toLocaleDateString("pt-BR") : ""}</span>
                </div>`
                )
                .join("")}
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
  if (!fixtures || !fixtures.length) return `<p style="color:var(--chalk-dim);">Sem jogos recentes registrados.</p>`;
  return fixtures
    .slice()
    .reverse()
    .map((f) => {
      const isHome = f.teams.home.id === teamId;
      const own = isHome ? f.teams.home : f.teams.away;
      const opp = isHome ? f.teams.away : f.teams.home;
      const ownGoals = isHome ? f.goals.home : f.goals.away;
      const oppGoals = isHome ? f.goals.away : f.goals.home;
      let result = "—";
      if (ownGoals !== null && oppGoals !== null) {
        result = ownGoals > oppGoals ? "V" : ownGoals < oppGoals ? "D" : "E";
      }
      const date = new Date(f.fixture.date).toLocaleDateString("pt-BR");
      return `
      <div class="h2h-row" style="grid-template-columns:70px 1fr auto 40px;">
        <span class="h2h-date">${date}</span>
        <span>${isHome ? "vs" : "@"} ${escapeHtml(opp.name)}</span>
        <span class="h2h-score">${ownGoals ?? "-"} : ${oppGoals ?? "-"}</span>
        <span class="form-pill ${result === "V" ? "W" : result === "D" ? "L" : "D"}" style="width:22px;height:22px;border-radius:5px;font-size:0;display:inline-block;"></span>
      </div>`;
    })
    .join("");
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
  toast(`${team.name} definido como Time ${slot.toUpperCase()}`, false);
  location.hash = "#/compare";
}

// ============================================================
// View: Ao vivo
// ============================================================
async function renderLive() {
  app.innerHTML = `
    <div class="page-head">
      <p class="page-eyebrow">Tempo real</p>
      <h1 class="page-title">Jogos ao vivo</h1>
      <p class="page-sub">Só das competições cobertas pelo site. Atualize a página pra ver o placar mais recente.</p>
    </div>
    <div id="live-content">${loadingBox("Buscando jogos ao vivo…")}</div>
  `;
  const content = document.getElementById("live-content");
  const knownLeagueIds = new Set(LEAGUES.map((l) => l.id));

  try {
    const fixtures = await apiGet("fixtures", { live: "all" });
    const relevant = (fixtures || []).filter((f) => knownLeagueIds.has(f.league.id));

    if (!relevant.length) {
      content.innerHTML = `<div class="state-box"><div class="state-title">Nada rolando agora</div>Nenhum jogo ao vivo nas ligas cobertas pelo site neste momento.</div>`;
      return;
    }

    content.innerHTML = `<div class="card">
      <div class="fixture-list">
        ${relevant
          .map((f) => {
            const league = LEAGUES.find((l) => l.id === f.league.id);
            return `
            <a class="fixture-row" href="#/jogo/${f.fixture.id}">
              <span class="fixture-date" style="color:var(--gold);">${f.fixture.status.elapsed ?? ""}'<br><small>${escapeHtml(league?.name || "")}</small></span>
              <span class="fixture-team right">${escapeHtml(f.teams.home.name)}</span>
              <span class="fixture-score">${f.goals.home ?? 0} : ${f.goals.away ?? 0}</span>
              <span class="fixture-team">${escapeHtml(f.teams.away.name)}</span>
            </a>`;
          })
          .join("")}
      </div>
    </div>`;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

// ============================================================
// View: Detalhe do jogo — eventos, escalação, estatísticas, odds, previsão
// ============================================================
async function renderFixture(fixtureId) {
  app.innerHTML = `<div id="fixture-content">${loadingBox("Buscando detalhes do jogo…")}</div>`;
  const content = document.getElementById("fixture-content");

  try {
    const fxResponse = await apiGet("fixtures", { id: fixtureId });
    const fx = fxResponse?.[0];
    if (!fx) {
      content.innerHTML = errorBox("Jogo não encontrado.");
      return;
    }

    const [events, lineups, stats, odds, predictions] = await Promise.allSettled([
      apiGet("fixtures/events", { fixture: fixtureId }),
      apiGet("fixtures/lineups", { fixture: fixtureId }),
      apiGet("fixtures/statistics", { fixture: fixtureId }),
      apiGet("odds", { fixture: fixtureId }),
      apiGet("predictions", { fixture: fixtureId }),
    ]);

    const date = new Date(fx.fixture.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const time = new Date(fx.fixture.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    content.innerHTML = `
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
    if (odds.status === "fulfilled") renderFixtureOdds(odds.value?.[0]);
    if (stats.status === "fulfilled") renderFixtureStats(stats.value, fx);
    if (lineups.status === "fulfilled") renderFixtureLineups(lineups.value);
    if (events.status === "fulfilled") renderFixtureEvents(events.value, fx);
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function renderFixturePredictions(pred, fx) {
  const el = document.getElementById("fx-predictions");
  if (!pred) return;
  const pct = pred.predictions.percent;
  const probA = parseInt(pct.home);
  const probB = parseInt(pct.away);
  const probDraw = 100 - probA - probB;
  el.innerHTML = `
    <h2 class="section-title">Previsão oficial da API-Football</h2>
    ${renderPitchBar(fx.teams.home, fx.teams.away, { probA, probB, probDraw })}
    ${pred.predictions.advice ? `<p class="predict-advice">${escapeHtml(pred.predictions.advice)}</p>` : ""}
  `;
}

function renderFixtureOdds(oddsEntry) {
  const el = document.getElementById("fx-odds");
  if (!oddsEntry || !oddsEntry.bookmakers?.length) return;
  const bookmaker = oddsEntry.bookmakers[0];
  const winnerBet = bookmaker.bets.find((b) => b.name === "Match Winner");
  if (!winnerBet) return;
  el.innerHTML = `
    <h2 class="section-title">Odds — ${escapeHtml(bookmaker.name)}</h2>
    <div class="card" style="margin-bottom:20px;">
      <div class="odds-row">
        ${winnerBet.values
          .map((v) => `<div class="odds-cell"><span class="odds-label">${escapeHtml(v.value)}</span><span class="odds-value">${v.odd}</span></div>`)
          .join("")}
      </div>
    </div>
  `;
}

function renderFixtureStats(statsArr, fx) {
  const el = document.getElementById("fx-stats");
  if (!statsArr || statsArr.length < 2) return;
  const [homeStats, awayStats] = statsArr;
  const rows = homeStats.statistics.map((s, i) => {
    const homeVal = s.value;
    const awayVal = awayStats.statistics[i]?.value;
    const homeNum = parseFloat(homeVal) || 0;
    const awayNum = parseFloat(awayVal) || 0;
    const max = Math.max(homeNum, awayNum, 1);
    return [s.type, homeVal ?? 0, awayVal ?? 0, (homeNum / max) * 100, (awayNum / max) * 100];
  });

  el.innerHTML = `
    <h2 class="section-title">Estatísticas do jogo</h2>
    <div class="card" style="overflow-x:auto;margin-bottom:20px;">
      <table class="compare-table">
        ${rows
          .map(
            ([label, va, vb, pctA, pctB]) => `
          <tr><td class="val-a">${va}</td><td class="mid-label">${escapeHtml(label)}</td><td class="val-b">${vb}</td></tr>
          <tr><td colspan="3" class="compare-bar-cell">
            <div class="compare-bar-row"><div class="compare-bar-a" style="width:${pctA / 2}%;"></div><div class="compare-bar-b" style="width:${pctB / 2}%;"></div></div>
          </td></tr>`
          )
          .join("")}
      </table>
    </div>
  `;
}

function renderFixtureLineups(lineupsArr) {
  const el = document.getElementById("fx-lineups");
  if (!lineupsArr || !lineupsArr.length) return;

  el.innerHTML = `
    <h2 class="section-title">Escalações</h2>
    <div class="lineup-grid" style="margin-bottom:20px;">
      ${lineupsArr
        .map(
          (l) => `
        <div class="card">
          <div class="lineup-head">
            <img src="${l.team.logo}" alt="">
            <div>
              <div style="font-family:var(--font-display);">${escapeHtml(l.team.name)}</div>
              <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--chalk-dim);">${escapeHtml(l.formation || "")} · téc. ${escapeHtml(l.coach?.name || "-")}</div>
            </div>
          </div>
          <p class="stat-label" style="margin-top:12px;">Titulares</p>
          <ul class="lineup-list">
            ${l.startXI.map((s) => `<li><span class="lineup-num">${s.player.number ?? ""}</span>${escapeHtml(s.player.name)} <span class="lineup-pos">${escapeHtml(s.player.pos || "")}</span></li>`).join("")}
          </ul>
          <p class="stat-label" style="margin-top:12px;">Banco</p>
          <ul class="lineup-list dim">
            ${l.substitutes.map((s) => `<li><span class="lineup-num">${s.player.number ?? ""}</span>${escapeHtml(s.player.name)}</li>`).join("")}
          </ul>
        </div>`
        )
        .join("")}
    </div>
  `;
}

const EVENT_ICON = { Goal: "⚽", Card: "🟨", subst: "🔁", Var: "📺" };

function renderFixtureEvents(events, fx) {
  const el = document.getElementById("fx-events");
  if (!events || !events.length) return;

  el.innerHTML = `
    <h2 class="section-title">Linha do jogo</h2>
    <div class="card">
      <div class="event-list">
        ${events
          .map((e) => {
            const isHome = e.team.id === fx.teams.home.id;
            const icon = e.type === "Card" ? (e.detail === "Red Card" ? "🟥" : "🟨") : EVENT_ICON[e.type] || "•";
            return `
            <div class="event-row ${isHome ? "home" : "away"}">
              <span class="event-min">${e.time.elapsed}'${e.time.extra ? "+" + e.time.extra : ""}</span>
              <span class="event-icon">${icon}</span>
              <span class="event-text">${escapeHtml(e.player?.name || "")}${e.assist?.name ? ` <span class="event-dim">(assist. ${escapeHtml(e.assist.name)})</span>` : ""} <span class="event-dim">— ${escapeHtml(e.detail || e.type)}</span></span>
            </div>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

// ============================================================
// View: Comparação
// ============================================================
function renderCompare() {
  const { a, b } = state.compareSlots;
  app.innerHTML = `
    <div class="page-head">
      <p class="page-eyebrow">Confronto</p>
      <h1 class="page-title">Time A × Time B</h1>
      <p class="page-sub">Busque dois times (de qualquer liga) para comparar estatísticas e ver a probabilidade estimada de vitória.</p>
    </div>

    <div class="compare-picker">
      <div class="picker-box slot-a" id="picker-a"></div>
      <div class="compare-vs">×</div>
      <div class="picker-box slot-b" id="picker-b"></div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <p class="stat-label" style="margin-bottom:10px;">Mandante do jogo (opcional — afeta a probabilidade)</p>
      <div style="display:flex;gap:16px;font-size:0.85rem;">
        <label><input type="radio" name="home" value="" ${!state.homeSide ? "checked" : ""}> Neutro</label>
        <label><input type="radio" name="home" value="a" ${state.homeSide === "a" ? "checked" : ""}> Time A manda o jogo</label>
        <label><input type="radio" name="home" value="b" ${state.homeSide === "b" ? "checked" : ""}> Time B manda o jogo</label>
      </div>
    </div>

    <button class="btn" id="run-compare" ${a && b ? "" : "disabled"}>Comparar</button>

    <div id="compare-result" style="margin-top:24px;"></div>
  `;

  renderPicker("a", a);
  renderPicker("b", b);

  document.querySelectorAll('input[name="home"]').forEach((r) =>
    r.addEventListener("change", (e) => (state.homeSide = e.target.value || null))
  );

  document.getElementById("run-compare").addEventListener("click", runComparison);

  if (state.compareSlots.a && state.compareSlots.b) {
    runComparison();
  }
}

function renderPicker(slot, selected) {
  const box = document.getElementById(`picker-${slot}`);
  if (selected) {
    box.innerHTML = `
      <div class="picker-selected">
        <img src="${selected.logo}" alt="">
        <div>
          <div class="name">${escapeHtml(selected.name)}</div>
          <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--chalk-dim);">${escapeHtml(selected.leagueName || "")} · ${selected.season}</div>
        </div>
      </div>
      <button class="btn ghost small" style="margin-top:8px;" data-action="clear">Trocar time</button>
    `;
    box.querySelector('[data-action="clear"]').addEventListener("click", () => {
      state.compareSlots[slot] = null;
      renderCompare();
    });
    return;
  }

  box.innerHTML = `
    <input type="text" placeholder="Buscar time (ex: Flamengo, Real Madrid...)" id="search-${slot}" autocomplete="off">
    <div class="picker-results" id="results-${slot}"></div>
  `;

  const input = document.getElementById(`search-${slot}`);
  const results = document.getElementById(`results-${slot}`);
  let debounceTimer;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 3) {
      results.innerHTML = "";
      return;
    }
    debounceTimer = setTimeout(async () => {
      results.innerHTML = `<div style="padding:8px;color:var(--chalk-dim);font-size:0.8rem;">buscando…</div>`;
      try {
        const teams = await apiGet("teams", { search: q });
        if (!teams || !teams.length) {
          results.innerHTML = `<div style="padding:8px;color:var(--chalk-dim);font-size:0.8rem;">nenhum time encontrado</div>`;
          return;
        }
        results.innerHTML = teams
          .slice(0, 8)
          .map(
            (r) => `
          <div class="picker-result" data-id="${r.team.id}" data-name="${escapeHtml(r.team.name)}" data-logo="${r.team.logo}">
            <img src="${r.team.logo}" alt="">
            <span>${escapeHtml(r.team.name)}</span>
          </div>`
          )
          .join("");
        results.querySelectorAll(".picker-result").forEach((el) => {
          el.addEventListener("click", () => selectTeamForCompare(slot, el.dataset.id, el.dataset.name, el.dataset.logo));
        });
      } catch (err) {
        results.innerHTML = `<div style="padding:8px;color:var(--terracotta);font-size:0.8rem;">${escapeHtml(err.message)}</div>`;
      }
    }, 380);
  });
}

async function selectTeamForCompare(slot, teamId, name, logo) {
  const box = document.getElementById(`picker-${slot}`);
  box.innerHTML = loadingBox("Localizando liga atual do time…");
  try {
    const leagues = await apiGet("leagues", { team: teamId, current: "true" });
    let leagueId, leagueName, season;
    if (leagues && leagues.length) {
      // prioriza liga doméstica (tem 'standings' no formato de liga nacional) — fallback pra primeira
      const domestic = leagues.find((l) => l.league.type === "League") || leagues[0];
      leagueId = domestic.league.id;
      leagueName = domestic.league.name;
      season = domestic.seasons?.[0]?.year;
    }
    if (!leagueId) throw new Error("Não achei uma liga ativa para esse time.");
    state.compareSlots[slot] = { teamId: Number(teamId), name, logo, leagueId, leagueName, season };
    renderCompare();
  } catch (err) {
    toast(err.message);
    renderPicker(slot, null);
  }
}

async function runComparison() {
  const { a, b } = state.compareSlots;
  const result = document.getElementById("compare-result");
  if (!a || !b) return;
  result.innerHTML = loadingBox("Cruzando estatísticas e histórico de confronto…");

  try {
    const [statsA, statsB, h2h] = await Promise.all([
      apiGet("teams/statistics", { league: a.leagueId, season: a.season, team: a.teamId }),
      apiGet("teams/statistics", { league: b.leagueId, season: b.season, team: b.teamId }),
      apiGet("fixtures/headtohead", { h2h: `${a.teamId}-${b.teamId}`, last: 5 }),
    ]);

    if (!statsA?.team || !statsB?.team) {
      result.innerHTML = errorBox("Não consegui estatísticas completas para um dos times nessa temporada.");
      return;
    }

    const homeTeamId = state.homeSide === "a" ? a.teamId : state.homeSide === "b" ? b.teamId : null;
    const prob = computeProbability(statsA, statsB, h2h, homeTeamId);
    const justifs = buildJustifications(statsA, statsB, h2h, homeTeamId);

    result.innerHTML = `
      ${renderPitchBar(statsA.team, statsB.team, prob)}

      <h2 class="section-title">Justificativas</h2>
      <ul class="justif-list">
        ${justifs
          .map(
            (j) => `<li class="justif-item"><span class="justif-side ${j.side}"></span><span>${j.text}</span></li>`
          )
          .join("")}
      </ul>

      <div id="official-prediction"></div>

      <h2 class="section-title" style="margin-top:24px;">Comparação direta</h2>
      ${renderCompareTable(statsA, statsB)}

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;">
        <a class="btn ghost small" href="#/time/${a.teamId}/${a.leagueId}/${a.season}/elenco">Elenco ${escapeHtml(statsA.team.name)}</a>
        <a class="btn ghost small" href="#/time/${b.teamId}/${b.leagueId}/${b.season}/elenco">Elenco ${escapeHtml(statsB.team.name)}</a>
      </div>

      <h2 class="section-title">Confronto direto — últimos jogos</h2>
      <div class="card">
        ${renderH2H(h2h, statsA.team, statsB.team)}
      </div>
    `;

    // conferência cruzada opcional: previsão oficial da API se houver jogo marcado entre os dois
    fetchOfficialPredictionForPair(a.teamId, b.teamId, statsA.team, statsB.team);
  } catch (err) {
    result.innerHTML = errorBox(err.message);
  }
}

async function fetchOfficialPredictionForPair(teamAId, teamBId, teamA, teamB) {
  const el = document.getElementById("official-prediction");
  if (!el) return;
  try {
    const upcoming = await apiGet("fixtures/headtohead", { h2h: `${teamAId}-${teamBId}`, next: 1 });
    if (!upcoming || !upcoming.length) return;
    const fixtureId = upcoming[0].fixture.id;
    const predResponse = await apiGet("predictions", { fixture: fixtureId });
    const pred = predResponse?.[0];
    if (!pred) return;
    const isAHome = upcoming[0].teams.home.id === teamAId;
    const homePct = parseInt(pred.predictions.percent.home);
    const awayPct = parseInt(pred.predictions.percent.away);
    const probA = isAHome ? homePct : awayPct;
    const probB = isAHome ? awayPct : homePct;
    const probDraw = 100 - probA - probB;
    el.innerHTML = `
      <h2 class="section-title" style="margin-top:24px;">Conferência cruzada — previsão oficial da API</h2>
      <p class="page-sub" style="margin-bottom:12px;">Há um jogo marcado entre os dois times (${new Date(upcoming[0].fixture.date).toLocaleDateString("pt-BR")}). Isto é o algoritmo próprio da API-Football, pra comparar com o cálculo acima.</p>
      ${renderPitchBar(teamA, teamB, { probA, probB, probDraw })}
      <a class="btn ghost small" href="#/jogo/${fixtureId}">Ver detalhes desse jogo →</a>
    `;
  } catch {
    // silencioso — conferência cruzada é opcional, não deve quebrar a tela de comparação
  }
}

// ------------------------------------------------------------
// Cálculo de probabilidade (modelo transparente, não caixa-preta)
// ------------------------------------------------------------
function computeProbability(statsA, statsB, h2h, homeTeamId) {
  const winRate = (s) => (s.fixtures.played.total ? s.fixtures.wins.total / s.fixtures.played.total : 0.5);
  const goalDiffScore = (s) => {
    const gf = parseFloat(s.goals.for.average.total) || 0;
    const ga = parseFloat(s.goals.against.average.total) || 0;
    const diff = gf - ga;
    return Math.min(1, Math.max(0, (diff + 3) / 6));
  };
  const formScore = (s) => {
    const map = { W: 1, D: 0.33, L: 0 };
    const chars = (s.form || "").split("").slice(-5);
    if (!chars.length) return 0.5;
    return chars.reduce((sum, c) => sum + (map[c] ?? 0.33), 0) / chars.length;
  };
  const h2hScore = (teamId) => {
    if (!h2h || !h2h.length) return 0.5;
    let w = 0,
      d = 0,
      l = 0;
    h2h.forEach((f) => {
      if (f.goals.home === null || f.goals.away === null) return;
      const isHome = f.teams.home.id === teamId;
      const tg = isHome ? f.goals.home : f.goals.away;
      const og = isHome ? f.goals.away : f.goals.home;
      if (tg > og) w++;
      else if (tg === og) d++;
      else l++;
    });
    const total = w + d + l;
    if (!total) return 0.5;
    return (w + d * 0.33) / total;
  };

  const strength = (s) => 40 * winRate(s) + 25 * goalDiffScore(s) + 20 * formScore(s) + 15 * h2hScore(s.team.id);

  let strengthA = strength(statsA);
  let strengthB = strength(statsB);

  const HOME_BONUS = 6;
  if (homeTeamId === statsA.team.id) strengthA += HOME_BONUS;
  if (homeTeamId === statsB.team.id) strengthB += HOME_BONUS;

  const diff = strengthA - strengthB;
  const drawProb = Math.min(30, Math.max(15, 26 - Math.abs(diff) * 0.3));
  const remaining = 100 - drawProb;
  const sig = 1 / (1 + Math.exp(-diff / 15));
  let probA = remaining * sig;
  let probB = remaining - probA;

  probA = Math.round(probA);
  probB = Math.round(probB);
  const probDraw = 100 - probA - probB;

  return { probA, probB, probDraw, strengthA, strengthB };
}

function buildJustifications(statsA, statsB, h2h, homeTeamId) {
  const j = [];
  const nameA = statsA.team.name,
    nameB = statsB.team.name;

  const wrA = statsA.fixtures.played.total ? (statsA.fixtures.wins.total / statsA.fixtures.played.total) * 100 : null;
  const wrB = statsB.fixtures.played.total ? (statsB.fixtures.wins.total / statsB.fixtures.played.total) * 100 : null;
  if (wrA !== null && wrB !== null) {
    j.push({
      side: wrA === wrB ? "n" : wrA > wrB ? "a" : "b",
      text: `Aproveitamento na temporada: ${nameA} venceu ${wrA.toFixed(0)}% dos jogos, ${nameB} venceu ${wrB.toFixed(0)}%.`,
    });
  }

  const gfA = parseFloat(statsA.goals.for.average.total) || 0;
  const gfB = parseFloat(statsB.goals.for.average.total) || 0;
  j.push({
    side: gfA === gfB ? "n" : gfA > gfB ? "a" : "b",
    text: `Média de gols marcados por jogo: ${nameA} ${gfA.toFixed(2)} contra ${gfB.toFixed(2)} do ${nameB}.`,
  });

  const gaA = parseFloat(statsA.goals.against.average.total) || 0;
  const gaB = parseFloat(statsB.goals.against.average.total) || 0;
  j.push({
    side: gaA === gaB ? "n" : gaA < gaB ? "a" : "b",
    text: `Média de gols sofridos por jogo: ${nameA} ${gaA.toFixed(2)} contra ${gaB.toFixed(2)} do ${nameB} (menor é melhor).`,
  });

  const formA = (statsA.form || "").slice(-5);
  const formB = (statsB.form || "").slice(-5);
  if (formA && formB) {
    j.push({ side: "n", text: `Forma nos últimos 5 jogos: ${nameA} "${formA}" · ${nameB} "${formB}".` });
  }

  if (h2h && h2h.length) {
    let w = 0,
      l = 0,
      d = 0;
    h2h.forEach((f) => {
      if (f.goals.home === null) return;
      const isAHome = f.teams.home.id === statsA.team.id;
      const gA = isAHome ? f.goals.home : f.goals.away;
      const gB = isAHome ? f.goals.away : f.goals.home;
      if (gA > gB) w++;
      else if (gA < gB) l++;
      else d++;
    });
    j.push({
      side: w === l ? "n" : w > l ? "a" : "b",
      text: `Confronto direto (últimos ${w + l + d} jogos): ${nameA} venceu ${w}, empataram ${d}, ${nameB} venceu ${l}.`,
    });
  } else {
    j.push({ side: "n", text: "Sem histórico recente de confronto direto disponível entre os dois times." });
  }

  if (homeTeamId) {
    const homeName = homeTeamId === statsA.team.id ? nameA : nameB;
    j.push({ side: homeTeamId === statsA.team.id ? "a" : "b", text: `Fator casa: ${homeName} manda o jogo.` });
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
        <div class="pitch-bar-center-mark" style="left:50%;"></div>
        <div class="pitch-bar-ball" style="left:${prob.probA + prob.probDraw / 2}%;"></div>
      </div>
      <div class="draw-caption">Empate: ${prob.probDraw}%</div>
    </div>
  `;
}

function renderCompareTable(statsA, statsB) {
  const rows = [
    ["Aproveitamento", statsA.fixtures.played.total ? Math.round((statsA.fixtures.wins.total / statsA.fixtures.played.total) * 100) : 0, statsB.fixtures.played.total ? Math.round((statsB.fixtures.wins.total / statsB.fixtures.played.total) * 100) : 0, "%", 100],
    ["Gols marcados/jogo", parseFloat(statsA.goals.for.average.total) || 0, parseFloat(statsB.goals.for.average.total) || 0, "", 4],
    ["Gols sofridos/jogo", parseFloat(statsA.goals.against.average.total) || 0, parseFloat(statsB.goals.against.average.total) || 0, "", 4],
    ["Jogos sem sofrer gol", statsA.clean_sheet.total, statsB.clean_sheet.total, "", Math.max(statsA.clean_sheet.total, statsB.clean_sheet.total, 1)],
    ["Cartões amarelos", sumCards(statsA.cards.yellow), sumCards(statsB.cards.yellow), "", Math.max(sumCards(statsA.cards.yellow), sumCards(statsB.cards.yellow), 1)],
  ];

  return `
    <div class="card" style="overflow-x:auto;margin-bottom:20px;">
      <table class="compare-table">
        ${rows
          .map(([label, va, vb, unit, max]) => {
            const pctA = Math.min(100, (va / max) * 100);
            const pctB = Math.min(100, (vb / max) * 100);
            return `
            <tr>
              <td class="val-a">${typeof va === "number" && va % 1 !== 0 ? va.toFixed(2) : va}${unit}</td>
              <td class="mid-label">${label}</td>
              <td class="val-b">${typeof vb === "number" && vb % 1 !== 0 ? vb.toFixed(2) : vb}${unit}</td>
            </tr>
            <tr><td colspan="3" class="compare-bar-cell">
              <div class="compare-bar-row">
                <div class="compare-bar-a" style="width:${pctA / 2}%;"></div>
                <div class="compare-bar-b" style="width:${pctB / 2}%;"></div>
              </div>
            </td></tr>
          `;
          })
          .join("")}
      </table>
    </div>
  `;
}

function renderH2H(h2h, teamA, teamB) {
  if (!h2h || !h2h.length) return `<p style="color:var(--chalk-dim);">Nenhum confronto direto recente encontrado.</p>`;
  return `<div class="h2h-list">
    ${h2h
      .slice()
      .reverse()
      .map((f) => {
        const date = new Date(f.fixture.date).toLocaleDateString("pt-BR");
        return `
        <div class="h2h-row">
          <span class="h2h-date">${date}</span>
          <span class="h2h-team">${escapeHtml(f.teams.home.name)}</span>
          <span class="h2h-score">${f.goals.home ?? "-"} : ${f.goals.away ?? "-"}</span>
          <span class="h2h-team right">${escapeHtml(f.teams.away.name)}</span>
        </div>`;
      })
      .join("")}
  </div>`;
}
