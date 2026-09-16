// ============================================================
// FutStats — app.js (Estatísticas, Análises e Alertas Push)
// ============================================================

const FN_URL = "/api/football";

const COUNTRIES = [
  { id: "brasil", name: "Brasil", flagImg: "/flags/br.png", leagues: [71, 72, 73] },
  { id: "inglaterra", name: "Inglaterra", flagImg: "/flags/gb-eng.png", leagues: [39, 45, 48] },
  { id: "espanha", name: "Espanha", flagImg: "/flags/es.png", leagues: [140, 143] },
  { id: "alemanha", name: "Alemanha", flagImg: "/flags/de.png", leagues: [78, 81] },
  { id: "italia", name: "Itália", flagImg: "/flags/it.png", leagues: [135, 137] },
  { id: "franca", name: "França", flagImg: "/flags/fr.png", leagues: [61, 66] },
  { id: "portugal", name: "Portugal", flagImg: "/flags/pt.png", leagues: [94, 96] },
  { id: "holanda", name: "Holanda", flagImg: "/flags/nl.png", leagues: [88, 90] },
  { id: "turquia", name: "Turquia", flagImg: "/flags/tr.png", leagues: [203, 206] },
  { id: "arabia-saudita", name: "Arábia Saudita", flagImg: "/flags/sa.png", leagues: [307, 504] },
  { id: "uefa", name: "UEFA (Europa)", flagImg: "/flags/eu.png", leagues: [2, 3, 4] },
  { id: "conmebol", name: "América do Sul", flagImg: "/flags/conmebol.png", leagues: [13, 11] },
];

const LEAGUES = [
  // Ligas Nacionais
  { id: 71, name: "Brasileirão Série A", country: "Brasil", calendarYear: true, isCup: false },
  { id: 72, name: "Brasileirão Série B", country: "Brasil", calendarYear: true, isCup: false },
  { id: 140, name: "La Liga", country: "Espanha", calendarYear: false, isCup: false },
  { id: 39, name: "Premier League", country: "Inglaterra", calendarYear: false, isCup: false },
  { id: 61, name: "Ligue 1", country: "França", calendarYear: false, isCup: false },
  { id: 78, name: "Bundesliga", country: "Alemanha", calendarYear: false, isCup: false },
  { id: 135, name: "Serie A", country: "Itália", calendarYear: false, isCup: false },
  { id: 94, name: "Liga Portuguesa", country: "Portugal", calendarYear: false, isCup: false },
  { id: 88, name: "Eredivisie", country: "Holanda", calendarYear: false, isCup: false },
  { id: 203, name: "Campeonato Turco", country: "Turquia", calendarYear: false, isCup: false },
  { id: 307, name: "Liga Profissional Saudita", country: "Arábia Saudita", calendarYear: false, isCup: false },

  // Copas Continentais
  { id: 2, name: "Champions League", country: "UEFA", calendarYear: false, isCup: true },
  { id: 3, name: "Europa League", country: "UEFA", calendarYear: false, isCup: true },
  { id: 4, name: "Conference League", country: "UEFA", calendarYear: false, isCup: true },
  { id: 13, name: "Copa Libertadores", country: "América do Sul", calendarYear: true, isCup: true },
  { id: 11, name: "Copa Sul-Americana", country: "América do Sul", calendarYear: true, isCup: true },

  // Copas Nacionais
  { id: 73, name: "Copa do Brasil", country: "Brasil", calendarYear: true, isCup: true },
  { id: 143, name: "Copa do Rei", country: "Espanha", calendarYear: false, isCup: true },
  { id: 45, name: "Copa da Inglaterra", country: "Inglaterra", calendarYear: false, isCup: true },
  { id: 48, name: "Copa da Liga Inglesa", country: "Inglaterra", calendarYear: false, isCup: true },
  { id: 137, name: "Copa da Itália", country: "Itália", calendarYear: false, isCup: true },
  { id: 66, name: "Copa da França", country: "França", calendarYear: false, isCup: true },
  { id: 81, name: "Copa da Alemanha", country: "Alemanha", calendarYear: false, isCup: true },
  { id: 96, name: "Copa de Portugal", country: "Portugal", calendarYear: false, isCup: true },
  { id: 90, name: "Copa da Holanda", country: "Holanda", calendarYear: false, isCup: true },
  { id: 206, name: "Copa da Turquia", country: "Turquia", calendarYear: false, isCup: true },
  { id: 504, name: "Copa do Rei Saudita", country: "Arábia Saudita", calendarYear: false, isCup: true }
];


// ============================================================
// SISTEMA AVANÇADO DE NOTAS DE JOGADOR (FutStats Rating Engine)
// Baseado em modelos estatísticos (WhoScored/FotMob/Sofascore)
// com calibração posicional, tratamento de ambiguidades e contexto
// ============================================================

const POPULAR_TEAMS = [
  { id: 127, name: "Flamengo", logo: "https://media.api-sports.io/football/teams/127.png" },
  { id: 121, name: "Palmeiras", logo: "https://media.api-sports.io/football/teams/121.png" },
  { id: 541, name: "Real Madrid", logo: "https://media.api-sports.io/football/teams/541.png" },
  { id: 529, name: "Barcelona", logo: "https://media.api-sports.io/football/teams/529.png" },
  { id: 50, name: "Man. City", logo: "https://media.api-sports.io/football/teams/50.png" },
  { id: 40, name: "Liverpool", logo: "https://media.api-sports.io/football/teams/40.png" }
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
  liveIntervalSeconds: 30,
  currentTableFilter: "all",
  fifaTab: "summary",
  lastComparisonData: null,
  favoriteTeams: safeReadStorage(browserStorage("localStorage"), "ap_fav_teams", []).filter(item => item && Number(item.id) > 0),
  favoriteFixtures: safeReadStorage(browserStorage("localStorage"), "ap_fav_fixtures", []).filter(item => item && Number(item.id) > 0),
  notificationPrefs: safeReadStorage(browserStorage("localStorage"), "ap_notif_prefs", {goals:true,lineups:true,kickoff:true,halftime:true,fulltime:true,redcards:true})
};

function browserStorage(name) { try { return window[name]; } catch { return null; } }
let routeController = new AbortController();
const footballClient = createApiClient({fetch: (...args) => fetch(...args), storage: browserStorage("sessionStorage"), onUpdate: markUpdated});
const apiCache = footballClient.cache;

let app = document.getElementById("app");
let toastEl = document.getElementById("toast");
let quotaHint = document.getElementById("quota-hint");
let compareBadge = document.getElementById("compare-badge");

function toast(msg, isError = true) {
  if (!toastEl) toastEl = document.getElementById("toast");
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastEl.style.borderColor = isError ? "var(--terracotta)" : "var(--gold)";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.hidden = true), 4200);
}

function updateCompareBadge() {
  if (!compareBadge) compareBadge = document.getElementById("compare-badge");
  const count = (state.compareSlots?.a ? 1 : 0) + (state.compareSlots?.b ? 1 : 0);
  if (compareBadge) {
    if (count > 0) {
      compareBadge.textContent = count;
      compareBadge.hidden = false;
    } else {
      compareBadge.hidden = true;
    }
  }
}

function markUpdated(fromCache = false) {
  if (!quotaHint) quotaHint = document.getElementById("quota-hint");
  if (quotaHint) {
    quotaHint.textContent = (fromCache ? "⚡ Cache " : "Atualizado ") + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
}

// ---------- Requisições à API de Futebol com Cache e Resiliência ----------
async function apiGet(endpoint, params = {}, ttlMinutes = 15) {
  return footballClient.get(endpoint, params, ttlMinutes, routeController.signal);
}
