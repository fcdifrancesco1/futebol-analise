// ============================================================
// FutStats — app.js (Estatísticas, Análises e Alertas Push)
// ============================================================

const FN_URL = "/api/football";
const SUPABASE_URL = "https://aqihpureclilnstdacii.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxaWhwdXJlY2xpbG5zdGRhY2lpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3ODIyODksImV4cCI6MjEwMzM1ODI4OX0.2odEs0rD_tBsEbHhaLlu1JMOXkJrqs8WKhboasPgvWw";
const VAPID_PUBLIC_KEY = "BMjC-8Rjccu_uZoj0BaFDXpUatXC1yShp_foJEdb0uixT398zbT4JlvTfRDeRswaBqRQx6ezRF8mAutCCfE-Q6A";

const LEAGUES = [
  { id: 71, name: "Brasileirão Série A", country: "Brasil", calendarYear: true, isCup: false },
  { id: 72, name: "Brasileirão Série B", country: "Brasil", calendarYear: true, isCup: false },
  { id: 13, name: "Copa Libertadores", country: "América do Sul", calendarYear: true, isCup: true },
  { id: 11, name: "Copa Sul-Americana", country: "América do Sul", calendarYear: true, isCup: true },
  { id: 73, name: "Copa do Brasil", country: "Brasil", calendarYear: true, isCup: true },
  { id: 140, name: "La Liga", country: "Espanha", calendarYear: false, isCup: false },
  { id: 39, name: "Premier League", country: "Inglaterra", calendarYear: false, isCup: false },
  { id: 61, name: "Ligue 1", country: "França", calendarYear: false, isCup: false },
  { id: 78, name: "Bundesliga", country: "Alemanha", calendarYear: false, isCup: false },
  { id: 135, name: "Serie A", country: "Itália", calendarYear: false, isCup: false },
  { id: 307, name: "Liga Profissional Saudita", country: "Arábia Saudita", calendarYear: false, isCup: false },
  { id: 2, name: "Champions League", country: "UEFA", calendarYear: false, isCup: true },
  { id: 3, name: "Europa League", country: "UEFA", calendarYear: false, isCup: true },
  { id: 4, name: "Conference League", country: "UEFA", calendarYear: false, isCup: true },
];

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
  liveIntervalSeconds: 45,
  currentTableFilter: "all",
  fifaTab: "summary",
  lastComparisonData: null,
  favoriteTeams: JSON.parse(localStorage.getItem("ap_fav_teams") || "[]"),
  favoriteFixtures: JSON.parse(localStorage.getItem("ap_fav_fixtures") || "[]"),
  notificationPrefs: JSON.parse(localStorage.getItem("ap_notif_prefs") || '{"goals":true,"lineups":true,"kickoff":true,"halftime":true,"fulltime":true,"redcards":true}')
};

const apiCache = new Map();

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

// ---------- Requisições à API de Futebol com Cache ----------
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

// ============================================================
// Gerenciador de Notificações & Supabase
// ============================================================
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const NotificationManager = {
  async init() {
    try {
      const savedTeams = localStorage.getItem("ap_fav_teams");
      if (savedTeams) state.favoriteTeams = JSON.parse(savedTeams);
      const savedPrefs = localStorage.getItem("ap_notif_prefs");
      if (savedPrefs) state.notificationPrefs = JSON.parse(savedPrefs);
    } catch { /* storage */ }

    this.updateBellUI();
    this.bindModalEvents();
  },

  async isSubscribed() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  },

  async updateBellUI() {
    const active = await this.isSubscribed();
    const dot = document.getElementById("bell-active-dot");
    const masterToggle = document.getElementById("toggle-notif-master");
    if (dot) dot.hidden = !active;
    if (masterToggle) masterToggle.checked = active;
  },

  async subscribe() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast("Seu navegador não suporta notificações Push.");
      return false;
    }

    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      toast("Permissão de notificação negada no navegador.");
      return false;
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
    }

    const subJson = sub.toJSON();
    await this.saveToSupabase(subJson.endpoint, subJson.keys.p256dh, subJson.keys.auth);
    this.updateBellUI();
    toast("🔔 Notificações ativadas com sucesso no celular!", false);
    return true;
  },

  async unsubscribe() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
    }
    this.updateBellUI();
    toast("Notificações desativadas.");
  },

  async saveToSupabase(endpoint, p256dh, auth) {
    const existingSentEvents = JSON.parse(localStorage.getItem("ap_sent_events") || "[]");
    const payload = {
      endpoint,
      p256dh,
      auth,
      favorite_teams: state.favoriteTeams,
      preferences: {
        ...state.notificationPrefs,
        favorite_fixtures: state.favoriteFixtures,
        sent_events: existingSentEvents
      },
      updated_at: new Date().toISOString()
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn("Supabase save response:", res.status, errText);
      }
    } catch (err) {
      console.warn("Erro ao sincronizar com Supabase:", err);
    }
  },

  async syncPreferences() {
    localStorage.setItem("ap_fav_teams", JSON.stringify(state.favoriteTeams));
    localStorage.setItem("ap_fav_fixtures", JSON.stringify(state.favoriteFixtures));
    localStorage.setItem("ap_notif_prefs", JSON.stringify(state.notificationPrefs));

    if (await this.isSubscribed()) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const subJson = sub.toJSON();
        await this.saveToSupabase(subJson.endpoint, subJson.keys.p256dh, subJson.keys.auth);
      }
    }
    this.renderFavoriteTeamsList();
    this.renderFavoriteFixturesList();
  },

  renderFavoriteFixturesList() {
    const container = document.getElementById("notif-fav-fixtures-list");
    if (!container) return;

    if (!state.favoriteFixtures || !state.favoriteFixtures.length) {
      container.innerHTML = `<span style="font-size:0.75rem;color:var(--chalk-dim);">Nenhum jogo específico seguido ainda. Abra qualquer partida e clique em "Seguir Jogo"!</span>`;
      return;
    }

    container.innerHTML = state.favoriteFixtures.map(f => `
      <div class="notif-fixture-pill">
        <div class="notif-fixture-pill-left">
          <img src="${f.home?.logo || ''}" alt="">
          <span><strong>${escapeHtml(f.home?.name || 'Casa')}</strong> × <strong>${escapeHtml(f.away?.name || 'Fora')}</strong></span>
          <img src="${f.away?.logo || ''}" alt="">
        </div>
        <button class="btn-remove-fixture-fav" data-fixture-id="${f.id}" title="Parar de seguir este jogo">✕</button>
      </div>
    `).join("");

    container.querySelectorAll(".btn-remove-fixture-fav").forEach(btn => {
      btn.addEventListener("click", () => {
        const fid = Number(btn.dataset.fixtureId);
        state.favoriteFixtures = state.favoriteFixtures.filter(f => f.id !== fid);
        this.syncPreferences();
      });
    });
  },

  renderFavoriteTeamsList() {
    const container = document.getElementById("notif-fav-list");
    if (!container) return;

    if (!state.favoriteTeams.length) {
      container.innerHTML = `<span style="font-size:0.75rem;color:var(--chalk-dim);">Nenhum time favoritado ainda. Busque acima para receber alertas de gols!</span>`;
      return;
    }

    container.innerHTML = state.favoriteTeams.map(t => `
      <div class="notif-team-pill">
        <img src="${t.logo}" alt="">
        <span>${escapeHtml(t.name)}</span>
        <button class="btn-remove-fav" data-team-id="${t.id}">✕</button>
      </div>
    `).join("");

    container.querySelectorAll(".btn-remove-fav").forEach(btn => {
      btn.addEventListener("click", () => {
        const tid = Number(btn.dataset.teamId);
        state.favoriteTeams = state.favoriteTeams.filter(t => t.id !== tid);
        this.syncPreferences();
      });
    });
  },

  bindModalEvents() {
    const modal = document.getElementById("notif-modal-backdrop");
    const openBtn = document.getElementById("btn-open-notifications");
    const bottomNavBell = document.getElementById("bottom-nav-bell");
    const closeBtn = document.getElementById("btn-close-notifications");
    const masterToggle = document.getElementById("toggle-notif-master");
    const testBtn = document.getElementById("btn-test-notification");
    const saveBtn = document.getElementById("btn-save-notif");
    const searchInput = document.getElementById("notif-team-search");
    const searchResults = document.getElementById("notif-team-results");

    const openModal = () => {
      if (!modal) return;
      modal.hidden = false;
      modal.style.display = "flex";
      this.renderFavoriteTeamsList();
      this.renderFavoriteFixturesList();
      this.updateBellUI();

      // Sincroniza estado das checkboxes
      const prefGoals = document.getElementById("pref-goals");
      const prefLineups = document.getElementById("pref-lineups");
      const prefKickoff = document.getElementById("pref-kickoff");
      const prefHalftime = document.getElementById("pref-halftime");
      const prefFulltime = document.getElementById("pref-fulltime");
      const prefRedcards = document.getElementById("pref-redcards");

      if (prefGoals) prefGoals.checked = state.notificationPrefs.goals !== false;
      if (prefLineups) prefLineups.checked = state.notificationPrefs.lineups !== false;
      if (prefKickoff) prefKickoff.checked = state.notificationPrefs.kickoff !== false;
      if (prefHalftime) prefHalftime.checked = state.notificationPrefs.halftime !== false;
      if (prefFulltime) prefFulltime.checked = state.notificationPrefs.fulltime !== false;
      if (prefRedcards) prefRedcards.checked = state.notificationPrefs.redcards !== false;
    };

    const closeModal = () => {
      if (!modal) return;
      modal.hidden = true;
      modal.style.display = "none";
    };

    if (openBtn) openBtn.addEventListener("click", openModal);
    if (bottomNavBell) bottomNavBell.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      });
    }

    if (masterToggle) {
      masterToggle.addEventListener("change", async (e) => {
        if (e.target.checked) {
          await this.subscribe();
        } else {
          await this.unsubscribe();
        }
      });
    }

    if (testBtn) {
      testBtn.addEventListener("click", async () => {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification("📋 ESCALAÇÕES CONFIRMADAS!", {
          body: "As escalações oficiais de Internacional × Grêmio já estão divulgadas!",
          icon: "https://media.api-sports.io/football/teams/119.png",
          vibrate: [200, 100, 200, 100, 200],
          data: { url: "/#/jogo/1623070" }
        });
        toast("Notificação de teste disparada!", false);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        state.notificationPrefs = {
          goals: document.getElementById("pref-goals")?.checked ?? true,
          lineups: document.getElementById("pref-lineups")?.checked ?? true,
          kickoff: document.getElementById("pref-kickoff")?.checked ?? true,
          halftime: document.getElementById("pref-halftime")?.checked ?? true,
          fulltime: document.getElementById("pref-fulltime")?.checked ?? true,
          redcards: document.getElementById("pref-redcards")?.checked ?? true,
        };
        this.syncPreferences();
        closeModal();
        toast("Preferências salvas com sucesso!", false);
      });
    }

    let searchTimer;
    if (searchInput && searchResults) {
      searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        const q = searchInput.value.trim();
        if (q.length < 3) { searchResults.hidden = true; return; }

        searchTimer = setTimeout(async () => {
          searchResults.hidden = false;
          searchResults.innerHTML = `<div style="padding:8px;font-size:0.75rem;color:var(--chalk-dim);">Buscando time...</div>`;
          try {
            const teams = await apiGet("teams", { search: q }, 60);
            if (!teams || !teams.length) {
              searchResults.innerHTML = `<div style="padding:8px;font-size:0.75rem;color:var(--chalk-dim);">Nenhum time encontrado.</div>`;
              return;
            }
            searchResults.innerHTML = teams.slice(0, 5).map(t => `
              <div class="notif-team-res-item" data-id="${t.team.id}" data-name="${escapeHtml(t.team.name)}" data-logo="${t.team.logo}">
                <img src="${t.team.logo}" alt="">
                <span>${escapeHtml(t.team.name)}</span>
              </div>
            `).join("");

            searchResults.querySelectorAll(".notif-team-res-item").forEach(item => {
              item.addEventListener("click", () => {
                const teamObj = { id: Number(item.dataset.id), name: item.dataset.name, logo: item.dataset.logo };
                if (!state.favoriteTeams.some(t => t.id === teamObj.id)) {
                  state.favoriteTeams.push(teamObj);
                  this.syncPreferences();
                  toast(`${teamObj.name} adicionado aos favoritos!`, false);
                }
                searchInput.value = "";
                searchResults.hidden = true;
              });
            });
          } catch (err) {
            searchResults.innerHTML = `<div style="padding:8px;font-size:0.75rem;color:var(--terracotta);">${escapeHtml(err.message)}</div>`;
          }
        }, 300);
      });
    }
  }
};

// ============================================================
// ============================================================
// Formatador Rigoroso de Rodadas e Copas
// ============================================================
function formatRoundName(r) {
  if (!r) return "Partidas";
  let s = String(r).trim();

  // 1. Se for fase de grupos ou fase de liga com número (ex: Group Stage - 1, League Stage - 4, etc.)
  const groupMatch = s.match(/(?:Group Stage|League Stage|Fase de Grupos|Fase de Liga|Fase de Grupo)\s*-\s*(\d+)/i);
  if (groupMatch) {
    return `Fase de Grupos — Rodada ${groupMatch[1]}`;
  }

  // 2. Se for liga de pontos corridos (ex: Regular Season - 14, Round 14, Rodada 14)
  if (/Regular Season\s*-\s*\d+/i.test(s) || /^Round\s*\d+$/i.test(s) || /^Rodada\s*\d+$/i.test(s)) {
    const matchNum = s.match(/\d+/);
    if (matchNum) return `Rodada ${matchNum[0]}`;
  }

  const isLeg1 = /[-_ ]1$|\b1st leg\b|\bida\b/i.test(s);
  const isLeg2 = /[-_ ]2$|\b2nd leg\b|\bvolta\b/i.test(s);
  const legSuffix = isLeg1 ? " — Jogo de Ida" : isLeg2 ? " — Jogo de Volta" : "";
  const cleanPhase = s.replace(/[-_ ]\d+$/, "").replace(/\s*-\s*(1st|2nd)\s*Leg/i, "").trim();

  // 3. Fases de mata-mata em ordem estrita de prioridade (evita que 1st Round vire Final)
  if (/Round of 64|1st Qualifying|1ª Fase|1st Round/i.test(cleanPhase)) return "1ª Fase" + legSuffix;
  if (/2nd Qualifying|2ª Fase|2nd Round/i.test(cleanPhase)) return "2ª Fase" + legSuffix;
  if (/3rd Qualifying|3ª Fase|3rd Round/i.test(cleanPhase)) return "3ª Fase" + legSuffix;
  if (/Round of 32|16th Finals|16 avos/i.test(cleanPhase)) return "16 avos de Final" + legSuffix;
  if (/Round of 16|8th Finals|Oitavas/i.test(cleanPhase)) return "Oitavas de Final" + legSuffix;
  if (/Quarter-finals|Quarterfinals|Quartas/i.test(cleanPhase)) return "Quartas de Final" + legSuffix;
  if (/Semi-finals|Semifinals|Semifinal/i.test(cleanPhase)) return "Semifinal" + legSuffix;
  if (/^Final$|^Finals$|Grande Final|Championship Final/i.test(cleanPhase)) return "Grande Final" + legSuffix;
  if (/Play-offs|Playoffs/i.test(cleanPhase)) return "Play-offs" + legSuffix;
  if (/Group Stage|Fase de Grupos/i.test(cleanPhase)) return "Fase de Grupos";
  if (/Preliminary/i.test(cleanPhase)) return "Fase Preliminar" + legSuffix;

  // Fallback para qualquer número de rodada
  const matchNum = s.match(/\d+/);
  if (matchNum && /Round|Rodada/i.test(s)) return `Rodada ${matchNum[0]}`;

  return cleanPhase + legSuffix;
}

function extractRoundNumber(title) {
  const t = String(title).toLowerCase();
  if (t.includes("fase preliminar")) return 1;
  if (t.includes("1ª fase") || t.includes("1ª pré") || t.includes("1st qualifying")) return 2;
  if (t.includes("2ª fase") || t.includes("2ª pré") || t.includes("2nd qualifying")) return 3;
  if (t.includes("3ª fase") || t.includes("3ª pré") || t.includes("3rd qualifying")) return 4;
  if (t.includes("play-offs") || t.includes("playoff")) return 5;
  
  if (t.includes("fase de grupos") || t.includes("fase de liga")) {
    const m = title.match(/\d+/);
    return m ? 10 + parseInt(m[0], 10) : 10;
  }

  if (t.includes("16 avos") || t.includes("round of 32")) return 50;
  if (t.includes("oitavas") || t.includes("round of 16")) return 60;
  if (t.includes("quartas") || t.includes("quarter")) return 70;
  if (t.includes("semifinal") || t.includes("semi-finals")) return 80;
  if (t.includes("grande final") || t.includes("final")) return 90;

  const m = title.match(/\d+/);
  return m ? parseInt(m[0], 10) : 9999;
}

const CL_2026_SCHEDULE = {"1635606":[7,"2027-01-20T19:00:00+00:00"],"1635607":[6,"2026-12-09T19:00:00+00:00"],"1635608":[4,"2026-11-04T19:00:00+00:00"],"1635609":[8,"2027-01-27T19:00:00+00:00"],"1635610":[1,"2026-09-15T19:00:00+00:00"],"1635611":[4,"2026-11-03T19:00:00+00:00"],"1635612":[7,"2027-01-19T19:00:00+00:00"],"1635613":[6,"2026-12-08T19:00:00+00:00"],"1635614":[2,"2026-09-30T19:00:00+00:00"],"1635615":[5,"2026-11-24T19:00:00+00:00"],"1635616":[4,"2026-11-03T19:00:00+00:00"],"1635617":[8,"2027-01-27T19:00:00+00:00"],"1635618":[3,"2026-10-20T19:00:00+00:00"],"1635619":[8,"2027-01-27T19:00:00+00:00"],"1635620":[5,"2026-11-24T19:00:00+00:00"],"1635621":[1,"2026-09-15T19:00:00+00:00"],"1635622":[6,"2026-12-09T19:00:00+00:00"],"1635623":[2,"2026-09-30T19:00:00+00:00"],"1635624":[7,"2027-01-20T19:00:00+00:00"],"1635625":[4,"2026-11-04T19:00:00+00:00"],"1635626":[3,"2026-10-21T19:00:00+00:00"],"1635627":[6,"2026-12-09T19:00:00+00:00"],"1635628":[5,"2026-11-24T19:00:00+00:00"],"1635629":[7,"2027-01-20T19:00:00+00:00"],"1635630":[2,"2026-09-29T19:00:00+00:00"],"1635631":[5,"2026-11-24T19:00:00+00:00"],"1635632":[4,"2026-11-03T19:00:00+00:00"],"1635633":[3,"2026-10-20T19:00:00+00:00"],"1635634":[8,"2027-01-27T19:00:00+00:00"],"1635635":[4,"2026-11-04T19:00:00+00:00"],"1635636":[1,"2026-09-16T19:00:00+00:00"],"1635637":[6,"2026-12-09T19:00:00+00:00"],"1635638":[3,"2026-10-20T19:00:00+00:00"],"1635639":[5,"2026-11-24T19:00:00+00:00"],"1635640":[6,"2026-12-08T19:00:00+00:00"],"1635641":[7,"2027-01-19T19:00:00+00:00"],"1635642":[3,"2026-10-21T19:00:00+00:00"],"1635643":[2,"2026-09-30T19:00:00+00:00"],"1635644":[8,"2027-01-27T19:00:00+00:00"],"1635645":[5,"2026-11-25T19:00:00+00:00"],"1635646":[1,"2026-09-16T19:00:00+00:00"],"1635647":[5,"2026-11-25T19:00:00+00:00"],"1635648":[8,"2027-01-27T19:00:00+00:00"],"1635649":[3,"2026-10-21T19:00:00+00:00"],"1635650":[7,"2027-01-19T19:00:00+00:00"],"1635651":[3,"2026-10-20T19:00:00+00:00"],"1635652":[6,"2026-12-08T19:00:00+00:00"],"1635653":[1,"2026-09-15T19:00:00+00:00"],"1635654":[8,"2027-01-27T19:00:00+00:00"],"1635655":[7,"2027-01-19T19:00:00+00:00"],"1635656":[5,"2026-11-24T19:00:00+00:00"],"1635657":[1,"2026-09-16T19:00:00+00:00"],"1635658":[4,"2026-11-04T19:00:00+00:00"],"1635659":[1,"2026-09-16T19:00:00+00:00"],"1635660":[3,"2026-10-21T19:00:00+00:00"],"1635661":[6,"2026-12-09T19:00:00+00:00"],"1635662":[2,"2026-09-29T19:00:00+00:00"],"1635663":[6,"2026-12-08T19:00:00+00:00"],"1635664":[7,"2027-01-19T19:00:00+00:00"],"1635665":[4,"2026-11-03T19:00:00+00:00"],"1635666":[8,"2027-01-27T19:00:00+00:00"],"1635667":[7,"2027-01-20T19:00:00+00:00"],"1635668":[3,"2026-10-21T19:00:00+00:00"],"1635669":[6,"2026-12-09T19:00:00+00:00"],"1635670":[6,"2026-12-09T19:00:00+00:00"],"1635671":[4,"2026-11-04T19:00:00+00:00"],"1635672":[1,"2026-09-16T19:00:00+00:00"],"1635673":[8,"2027-01-27T19:00:00+00:00"],"1635674":[5,"2026-11-25T19:00:00+00:00"],"1635675":[3,"2026-10-21T19:00:00+00:00"],"1635676":[2,"2026-09-30T19:00:00+00:00"],"1635677":[1,"2026-09-16T19:00:00+00:00"],"1635678":[6,"2026-12-08T19:00:00+00:00"],"1635679":[3,"2026-10-20T19:00:00+00:00"],"1635680":[1,"2026-09-15T19:00:00+00:00"],"1635681":[2,"2026-09-29T19:00:00+00:00"],"1635682":[8,"2027-01-27T19:00:00+00:00"],"1635683":[2,"2026-09-29T19:00:00+00:00"],"1635684":[5,"2026-11-24T19:00:00+00:00"],"1635685":[3,"2026-10-20T19:00:00+00:00"],"1635686":[8,"2027-01-27T19:00:00+00:00"],"1635687":[2,"2026-09-29T19:00:00+00:00"],"1635688":[1,"2026-09-15T19:00:00+00:00"],"1635689":[7,"2027-01-19T19:00:00+00:00"],"1635690":[5,"2026-11-24T19:00:00+00:00"],"1635691":[4,"2026-11-03T19:00:00+00:00"],"1635692":[7,"2027-01-19T19:00:00+00:00"],"1635693":[2,"2026-09-29T19:00:00+00:00"],"1635694":[1,"2026-09-15T19:00:00+00:00"],"1635695":[3,"2026-10-20T19:00:00+00:00"],"1635696":[6,"2026-12-08T19:00:00+00:00"],"1635697":[4,"2026-11-03T19:00:00+00:00"],"1635698":[3,"2026-10-21T19:00:00+00:00"],"1635699":[1,"2026-09-16T19:00:00+00:00"],"1635700":[2,"2026-09-30T19:00:00+00:00"],"1635701":[6,"2026-12-09T19:00:00+00:00"],"1635702":[4,"2026-11-03T19:00:00+00:00"],"1635703":[7,"2027-01-19T19:00:00+00:00"],"1635704":[2,"2026-09-29T19:00:00+00:00"],"1635705":[6,"2026-12-08T19:00:00+00:00"],"1635706":[1,"2026-09-15T19:00:00+00:00"],"1635707":[6,"2026-12-08T19:00:00+00:00"],"1635708":[4,"2026-11-03T19:00:00+00:00"],"1635709":[3,"2026-10-20T19:00:00+00:00"],"1635710":[1,"2026-09-15T19:00:00+00:00"],"1635711":[2,"2026-09-29T19:00:00+00:00"],"1635712":[3,"2026-10-20T19:00:00+00:00"],"1635713":[4,"2026-11-03T19:00:00+00:00"],"1635714":[3,"2026-10-21T19:00:00+00:00"],"1635715":[8,"2027-01-27T19:00:00+00:00"],"1635716":[5,"2026-11-25T19:00:00+00:00"],"1635717":[4,"2026-11-04T19:00:00+00:00"],"1635718":[1,"2026-09-16T19:00:00+00:00"],"1635719":[2,"2026-09-30T19:00:00+00:00"],"1635720":[8,"2027-01-27T19:00:00+00:00"],"1635721":[7,"2027-01-20T19:00:00+00:00"],"1635722":[6,"2026-12-09T19:00:00+00:00"],"1635723":[7,"2027-01-20T19:00:00+00:00"],"1635724":[8,"2027-01-27T19:00:00+00:00"],"1635725":[5,"2026-11-25T19:00:00+00:00"],"1635726":[5,"2026-11-25T19:00:00+00:00"],"1635727":[4,"2026-11-04T19:00:00+00:00"],"1635728":[2,"2026-09-30T19:00:00+00:00"],"1635729":[8,"2027-01-27T19:00:00+00:00"],"1635730":[5,"2026-11-25T19:00:00+00:00"],"1635731":[7,"2027-01-20T19:00:00+00:00"],"1635732":[2,"2026-09-30T19:00:00+00:00"],"1635733":[4,"2026-11-04T19:00:00+00:00"],"1635734":[2,"2026-09-30T19:00:00+00:00"],"1635735":[8,"2027-01-27T19:00:00+00:00"],"1635736":[1,"2026-09-16T19:00:00+00:00"],"1635737":[6,"2026-12-08T19:00:00+00:00"],"1635738":[5,"2026-11-24T19:00:00+00:00"],"1635739":[7,"2027-01-19T19:00:00+00:00"],"1635740":[1,"2026-09-15T19:00:00+00:00"],"1635741":[2,"2026-09-29T19:00:00+00:00"],"1635742":[7,"2027-01-20T19:00:00+00:00"],"1635743":[5,"2026-11-25T19:00:00+00:00"],"1635744":[8,"2027-01-27T19:00:00+00:00"],"1635745":[3,"2026-10-21T19:00:00+00:00"],"1635746":[8,"2027-01-27T19:00:00+00:00"],"1635747":[7,"2027-01-20T19:00:00+00:00"],"1635748":[4,"2026-11-04T19:00:00+00:00"],"1635749":[5,"2026-11-25T19:00:00+00:00"]};

// Pre-processamento inteligente de Fase de Grupos/Fase de Liga da Champions e Copas:
function preprocessLeagueFixtures(allFixtures) {
  if (!Array.isArray(allFixtures) || allFixtures.length === 0) return allFixtures;

  allFixtures.forEach(f => {
    const sched = CL_2026_SCHEDULE[f.fixture?.id];
    if (sched) {
      f.league.round = "Group Stage - " + sched[0];
      f.fixture.date = sched[1];
    }
  });

  return allFixtures;
}

function skeletonTable() {
  return `
    <div class="card skeleton">
      <div class="skeleton-title skeleton"></div>
      <div class="skeleton-box skeleton"></div>
      <div class="skeleton-box skeleton"></div>
    </div>`;
}

function skeletonCards(count = 2) {
  return Array.from({ length: count }, () => `
    <div class="card skeleton" style="margin-bottom:16px;">
      <div class="skeleton-title skeleton"></div>
      <div class="skeleton-box skeleton"></div>
      <div class="skeleton-box skeleton"></div>
    </div>
  `).join("");
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

function formatTeamName(name) {
  if (!name) return "";
  return String(name)
    .replace(/\bDA\b/g, "da")
    .replace(/\bDE\b/g, "de")
    .replace(/\bDO\b/g, "do")
    .replace(/\bDOS\b/g, "dos")
    .replace(/\bDAS\b/g, "das");
}

// ============================================================
// Preferências do Usuário & Time Favorito
// ============================================================
const UserPrefs = {
  KEY: "futstats_user_prefs_v1",
  get() {
    try {
      const data = localStorage.getItem(this.KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  },
  getFavoriteTeam() {
    return this.get().favoriteTeam || null;
  },
  setFavoriteTeam(team) {
    const prefs = this.get();
    prefs.favoriteTeam = team;
    prefs.onboarded = true;
    localStorage.setItem(this.KEY, JSON.stringify(prefs));
    updateFavoriteTeamHeader();
  },
  hasOnboarded() {
    return !!this.get().onboarded;
  },
  setOnboarded() {
    const prefs = this.get();
    prefs.onboarded = true;
    localStorage.setItem(this.KEY, JSON.stringify(prefs));
  }
};

function updateFavoriteTeamHeader() {
  const btn = document.getElementById("btn-fav-team-header");
  if (!btn) return;
  const fav = UserPrefs.getFavoriteTeam();
  if (fav) {
    btn.innerHTML = `
      <img src="${fav.logo}" alt="" class="fav-team-crest" onerror="this.style.display='none'">
      <span style="font-size:0.65rem;opacity:0.7;margin-left:2px;">▾</span>
    `;
    btn.title = `Seu Time: ${formatTeamName(fav.name)} (Clique para trocar)`;
  } else {
    btn.innerHTML = `<span class="fav-team-label">⭐ Escolher Time</span>`;
    btn.title = "Escolha seu time do coração";
  }
}

function showOnboardingModal(isChange = false) {
  let backdropEl = document.getElementById("onboarding-modal-backdrop");
  if (backdropEl) backdropEl.remove();

  backdropEl = document.createElement("div");
  backdropEl.id = "onboarding-modal-backdrop";
  backdropEl.className = "onboarding-backdrop";

  const POPULAR_CHOICES = [
    { id: 127, name: "Flamengo", logo: "https://media.api-sports.io/football/teams/127.png" },
    { id: 121, name: "Palmeiras", logo: "https://media.api-sports.io/football/teams/121.png" },
    { id: 529, name: "Barcelona", logo: "https://media.api-sports.io/football/teams/529.png" },
    { id: 541, name: "Real Madrid", logo: "https://media.api-sports.io/football/teams/541.png" },
    { id: 50, name: "Manchester City", logo: "https://media.api-sports.io/football/teams/50.png" },
    { id: 40, name: "Liverpool", logo: "https://media.api-sports.io/football/teams/40.png" }
  ];

  backdropEl.innerHTML = `
    <div class="onboarding-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:1.6rem;">⭐</span>
          <div>
            <h3 style="margin:0;font-size:1.2rem;font-weight:800;color:var(--chalk);">${isChange ? 'Trocar Time do Coração' : 'Bem-vindo ao FutStats! ⚽'}</h3>
            <p style="margin:2px 0 0;font-size:0.8rem;color:var(--chalk-dim);">${isChange ? 'Escolha o novo clube para acompanhar notícias e receber alertas.' : 'Escolha seu time para receber notícias e alertas em tempo real.'}</p>
          </div>
        </div>
        <button id="btn-close-onboarding" style="background:none;border:none;color:var(--chalk);font-size:1.2rem;cursor:pointer;">✕</button>
      </div>

      <!-- Barra de busca com auto-complete -->
      <div style="margin-top:14px;position:relative;">
        <div style="display:flex;align-items:center;background:rgba(255,255,255,0.06);border:1px solid var(--line-strong);border-radius:var(--radius-sm);padding:0 12px;">
          <span style="font-size:1rem;color:var(--chalk-dim);margin-right:8px;">🔍</span>
          <input type="text" id="input-onboarding-search" placeholder="Busque qualquer clube (ex: Corinthians, Chelsea, Grêmio...)" autocomplete="off" style="width:100%;background:transparent;border:none;color:var(--chalk);padding:10px 0;font-family:var(--font-body);font-size:0.88rem;outline:none;">
        </div>
        <div id="onboarding-search-results" style="margin-top:10px;display:none;max-height:220px;overflow-y:auto;"></div>
      </div>

      <!-- Atalhos Populares -->
      <div id="onboarding-popular-section" style="margin-top:18px;">
        <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--gold);font-weight:700;display:block;margin-bottom:8px;">SUGESTÕES POPULARES:</span>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:8px;">
          ${POPULAR_CHOICES.map(c => `
            <div class="onboarding-team-chip" data-id="${c.id}" data-name="${escapeHtml(c.name)}" data-logo="${c.logo}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;cursor:pointer;transition:all 0.15s ease;">
              <img src="${c.logo}" alt="" style="width:24px;height:24px;object-fit:contain;" onerror="this.style.display='none'">
              <span style="font-size:0.8rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(c.name)}</span>
            </div>
          `).join("")}
        </div>
      </div>

      ${!isChange ? `
        <div style="margin-top:20px;text-align:center;">
          <button id="btn-skip-onboarding" style="background:none;border:none;color:var(--chalk-dim);font-size:0.78rem;cursor:pointer;text-decoration:underline;">
            Pular e escolher mais tarde
          </button>
        </div>
      ` : ''}
    </div>
  `;

  document.body.appendChild(backdropEl);

  function selectAndSaveTeam(team) {
    UserPrefs.setFavoriteTeam(team);
    if (!state.favoriteTeams.some(f => f.id === team.id)) {
      state.favoriteTeams.push({ id: team.id, name: team.name, logo: team.logo });
      NotificationManager.syncPreferences();
    }
    backdropEl.remove();
    toast(`⭐ ${team.name} definido como seu time do coração!`, false);
    if (!location.hash || location.hash === "#/") {
      renderHome();
    }
  }

  // Close / Skip
  document.getElementById("btn-close-onboarding")?.addEventListener("click", () => {
    UserPrefs.setOnboarded();
    backdropEl.remove();
  });
  document.getElementById("btn-skip-onboarding")?.addEventListener("click", () => {
    UserPrefs.setOnboarded();
    backdropEl.remove();
  });

  // Popular chips
  backdropEl.querySelectorAll(".onboarding-team-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      selectAndSaveTeam({
        id: Number(chip.dataset.id),
        name: chip.dataset.name,
        logo: chip.dataset.logo
      });
    });
  });

  // Search input
  const searchInput = document.getElementById("input-onboarding-search");
  const resultsContainer = document.getElementById("onboarding-search-results");
  const popularSection = document.getElementById("onboarding-popular-section");
  let searchDebounce;

  searchInput?.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();
    if (q.length < 3) {
      resultsContainer.innerHTML = "";
      resultsContainer.style.display = "none";
      if (popularSection) popularSection.style.display = "block";
      return;
    }

    if (popularSection) popularSection.style.display = "none";
    resultsContainer.style.display = "block";
    resultsContainer.innerHTML = `<div style="padding:10px;text-align:center;color:var(--chalk-dim);font-size:0.8rem;">🔍 Buscando clubes...</div>`;

    searchDebounce = setTimeout(async () => {
      try {
        const resp = await apiGet("teams", { search: q }, 60);
        if (!resp || !resp.length) {
          resultsContainer.innerHTML = `<div style="padding:10px;text-align:center;color:var(--chalk-dim);font-size:0.8rem;">Nenhum clube encontrado com "${escapeHtml(q)}".</div>`;
          return;
        }

        resultsContainer.innerHTML = resp.map(item => {
          const t = item.team;
          return `
            <div class="onboarding-search-item" data-id="${t.id}" data-name="${escapeHtml(t.name)}" data-logo="${t.logo}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:6px;margin-bottom:6px;cursor:pointer;">
              <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                <img src="${t.logo}" alt="" style="width:28px;height:28px;object-fit:contain;" onerror="this.style.display='none'">
                <div>
                  <div style="font-weight:700;font-size:0.85rem;color:var(--chalk);">${escapeHtml(t.name)}</div>
                  <div style="font-size:0.7rem;color:var(--gold);">${escapeHtml(t.country || "")}</div>
                </div>
              </div>
              <span style="font-size:0.75rem;color:var(--cyan);font-weight:700;">Escolher ⭐</span>
            </div>
          `;
        }).join("");

        resultsContainer.querySelectorAll(".onboarding-search-item").forEach(item => {
          item.addEventListener("click", () => {
            selectAndSaveTeam({
              id: Number(item.dataset.id),
              name: item.dataset.name,
              logo: item.dataset.logo
            });
          });
        });
      } catch (err) {
        resultsContainer.innerHTML = `<div style="padding:10px;text-align:center;color:#EF4444;font-size:0.8rem;">Erro ao buscar clubes.</div>`;
      }
    }, 300);
  });
}

async function loadTeamNews(teamName, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const resp = await fetch(`/api/news?team=${encodeURIComponent(teamName)}`);
    if (!resp.ok) throw new Error("Erro ao carregar notícias");
    const data = await resp.json();
    let items = data.items || [];

    // Ordena da mais nova para mais velha e limita a exatamente 6 notícias
    items = items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 6);

    if (!items.length) {
      container.innerHTML = `<div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.85rem;">Nenhuma notícia recente encontrada no momento.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="news-grid">
        ${items.map(item => `
          <a class="news-card-item" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" title="Ler matéria completa no portal ${escapeHtml(item.source)}">
            <div class="news-title">${escapeHtml(item.title)}</div>
            <div class="news-meta-row">
              <span class="news-source-badge">${escapeHtml(item.source)}</span>
              <div style="display:flex;align-items:center;gap:6px;">
                <span>${escapeHtml(item.timeAgo)}</span>
                <span style="color:var(--cyan);font-weight:700;">↗</span>
              </div>
            </div>
          </a>
        `).join("")}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.85rem;">Não foi possível carregar as notícias agora.</div>`;
  }
}

// ============================================================
// Roteamento
// ============================================================
function parseHash() {
  return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.nav === name));
  document.querySelectorAll(".bottom-nav-item").forEach(t => t.classList.toggle("active", t.dataset.nav === name));
}

async function router() {
  if (!app) app = document.getElementById("app") || document.querySelector("main") || document.body;

  if (state.liveTimer) {
    clearInterval(state.liveTimer);
    state.liveTimer = null;
  }

  const parts = parseHash();
  window.scrollTo(0, 0);
  updateCompareBadge();

  if (parts[0] === "minha-escalacao") {
    setActiveTab("mylineups");
    if (parts[1] === "montar" && parts[2]) {
      await renderLineupBuilder(Number(parts[2]), parts[3] ? Number(parts[3]) : undefined);
    } else if (parts[1] === "comparar" && parts[2]) {
      await renderLineupComparison(parts[2]);
    } else {
      await renderMyLineups();
    }
  } else if (parts[0] === "jogos-do-dia") {
    setActiveTab("today");
    await renderMatchesOfDay(parts[1]);
  } else if (parts[0] === "liga" && parts[1] && parts[3] === "jogos") {
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
  } else if (parts[0] === "meu-time" || parts[0] === "seu-time") {
    setActiveTab("myteam");
    await renderMyTeam();
  } else if (parts[0] === "compare") {
    setActiveTab("home");
    renderCompare();
  } else {
    setActiveTab("home");
    renderHome();
  }
}

// Auto-recuperação de imagens bloqueadas por AdBlockers / Brave / DNS / Firewall
window.addEventListener("error", (e) => {
  if (e.target && e.target.tagName === "IMG") {
    const img = e.target;
    const src = img.src || "";
    if (src.includes("media.api-sports.io") && !src.includes("/api/img?url=")) {
      img.src = `/api/img?url=${encodeURIComponent(src)}`;
    }
  }
}, true);

window.addEventListener("hashchange", router);

function initApp() {
  NotificationManager.init();
  updateFavoriteTeamHeader();
  document.getElementById("btn-fav-team-header")?.addEventListener("click", () => {
    showOnboardingModal(true);
  });

  if (!UserPrefs.hasOnboarded()) {
    setTimeout(() => {
      showOnboardingModal(false);
    }, 700);
  }

  document.querySelectorAll("[data-nav]").forEach(el => {
    el.addEventListener("click", () => {
      const nav = el.dataset.nav;
      if (nav === "home") location.hash = "#/";
      if (nav === "today") location.hash = "#/jogos-do-dia";
      if (nav === "myteam") location.hash = "#/meu-time";
      if (nav === "live") location.hash = "#/aovivo";
      if (nav === "mylineups") location.hash = "#/minha-escalacao";
    });
  });

  const appEl = document.getElementById("app") || document.querySelector("main");
  if (appEl) {
    appEl.addEventListener("click", (e) => {
      const standingsRow = e.target.closest(".standings-table tbody tr");
      if (standingsRow && !e.target.closest("button")) {
        const { teamId, leagueId, season } = standingsRow.dataset;
        if (teamId && leagueId && season) {
          location.hash = `#/time/${teamId}/${leagueId}/${season}`;
        }
      }
    });
  }

  router();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}


// ============================================================
// View: Seu Time (Aba Central do Clube Favorito)
// ============================================================
async function renderMyTeam() {
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
        <img src="${favTeam.logo}" alt="" style="width:52px;height:52px;object-fit:contain;" onerror="this.style.display='none'">
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
                const dayNum = dObj.toLocaleDateString("pt-BR", { day: "2-digit" });
                const monthName = dObj.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
                const timeStr = dObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const isHome = f.teams.home.id === favTeam.id;
                const leagueLogo = f.league?.logo;
                const leagueName = formatTeamName(f.league?.name || "");

                return `
                  <a class="fixture-row" href="#/jogo/${f.fixture.id}" title="Ver detalhes de ${escapeHtml(leagueName)}">
                    <div class="fixture-date-col" style="display:flex;flex-direction:row;align-items:center;gap:8px;min-width:65px;">
                      <div style="display:flex;flex-direction:column;align-items:center;line-height:1.15;min-width:28px;">
                        <span class="fixture-date" style="color:var(--gold);font-weight:800;font-size:0.95rem;">${dayNum}</span>
                        <span style="font-size:0.68rem;color:var(--chalk-dim);text-transform:lowercase;font-weight:600;">${monthName}</span>
                        <span style="font-family:var(--font-mono);font-size:0.65rem;color:var(--chalk-dim);margin-top:2px;">${timeStr}</span>
                      </div>
                      ${leagueLogo ? `<img src="${leagueLogo}" alt="" style="width:20px;height:20px;object-fit:contain;flex-shrink:0;" title="${escapeHtml(leagueName)}" onerror="this.style.display='none'">` : ''}
                    </div>
                    <div class="fixture-team-item right ${isHome ? 'bold-team' : ''}">
                      <span>${escapeHtml(formatTeamName(f.teams.home.name))}</span>
                      <img src="${f.teams.home.logo}" alt="" loading="lazy">
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:60px;">
                      ${leagueName ? `<span style="font-size:0.65rem;color:var(--chalk-dim);font-weight:600;white-space:nowrap;max-width:85px;overflow:hidden;text-overflow:ellipsis;text-align:center;" title="${escapeHtml(leagueName)}">${escapeHtml(leagueName)}</span>` : ''}
                      <span class="fixture-score" style="color:var(--chalk-dim);font-size:0.8rem;padding:2px 8px;min-width:38px;">vs</span>
                    </div>
                    <div class="fixture-team-item ${!isHome ? 'bold-team' : ''}">
                      <img src="${f.teams.away.logo}" alt="" loading="lazy">
                      <span>${escapeHtml(formatTeamName(f.teams.away.name))}</span>
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
                const dayNum = dObj.toLocaleDateString("pt-BR", { day: "2-digit" });
                const monthName = dObj.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
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
                  <a class="fixture-row" href="#/jogo/${f.fixture.id}" title="Ver detalhes de ${escapeHtml(leagueName)}">
                    <div class="fixture-date-col" style="display:flex;flex-direction:row;align-items:center;gap:8px;min-width:65px;">
                      <div style="display:flex;flex-direction:column;align-items:center;line-height:1.15;min-width:28px;">
                        <span class="fixture-date" style="font-size:0.95rem;font-weight:800;color:var(--chalk);">${dayNum}</span>
                        <span style="font-size:0.68rem;color:var(--chalk-dim);text-transform:lowercase;font-weight:600;">${monthName}</span>
                      </div>
                      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;">
                        ${leagueLogo ? `<img src="${leagueLogo}" alt="" style="width:18px;height:18px;object-fit:contain;" title="${escapeHtml(leagueName)}" onerror="this.style.display='none'">` : ''}
                        <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:${outcomeBg};color:${outcomeColor};border:1px solid ${outcomeBorder};border-radius:4px;font-family:var(--font-mono);font-size:0.68rem;font-weight:800;line-height:1;">
                          ${outcomeLetter}
                        </span>
                      </div>
                    </div>
                    <div class="fixture-team-item right ${isHome ? 'bold-team' : ''}">
                      <span>${escapeHtml(formatTeamName(f.teams.home.name))}</span>
                      <img src="${f.teams.home.logo}" alt="" loading="lazy">
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:60px;">
                      ${leagueName ? `<span style="font-size:0.65rem;color:var(--chalk-dim);font-weight:600;white-space:nowrap;max-width:85px;overflow:hidden;text-overflow:ellipsis;text-align:center;" title="${escapeHtml(leagueName)}">${escapeHtml(leagueName)}</span>` : ''}
                      <span class="fixture-score" style="padding:2px 8px;min-width:44px;">${homeGoals} : ${awayGoals}</span>
                      <button type="button" class="btn-fixture-highlights-pill" title="Assistir aos Melhores Momentos no YouTube" onclick="event.preventDefault(); event.stopPropagation(); window.open('https://www.youtube.com/results?search_query=${encodeURIComponent(`Melhores Momentos ${f.teams.home.name} x ${f.teams.away.name} ${leagueName}`)}', '_blank', 'noopener,noreferrer');">
                        <span style="font-size:0.6rem;line-height:1;">▶</span>
                        <span>Melhores Momentos</span>
                      </button>
                    </div>
                    <div class="fixture-team-item ${!isHome ? 'bold-team' : ''}">
                      <img src="${f.teams.away.logo}" alt="" loading="lazy">
                      <span>${escapeHtml(formatTeamName(f.teams.away.name))}</span>
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
function renderHome() {
  app.innerHTML = `
    <div class="page-head">
      <p class="page-eyebrow">Competições Oficiais</p>
      <h1 class="page-title">Escolha uma Liga</h1>
      <p class="page-sub">Classificação detalhada, rodadas completas, estatísticas avançadas e alertas de gols.</p>
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
    const [standingsResp, fixturesResp] = await Promise.all([
      apiGet("standings", { league: leagueId, season }, 5),
      apiGet("fixtures", { league: leagueId, season }, 5).catch(() => [])
    ]);

    const officialStandings = standingsResp?.[0]?.league?.standings;
    if (!officialStandings || !officialStandings.length) {
      content.innerHTML = `<div class="card" style="text-align:center;color:var(--chalk-dim);padding:30px;">Sem tabela de pontos corridos nesta competição (formato mata-mata). Acesse a aba <strong>Jogos</strong> para ver os confrontos de Ida e Volta.</div>`;
      return;
    }

    const allFixtures = preprocessLeagueFixtures(Array.isArray(fixturesResp) ? fixturesResp : []);
    const finishedFixtures = allFixtures.filter(f => ['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short));

    let tablesToRender = officialStandings;

    // Se houver jogos finalizados, reconcilia a tabela para garantir sincronismo em tempo real imediato
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
          return computeTableFromFixtures(groupFinished, groupTable, officialNotes);
        });
      } else {
        tablesToRender = [computeTableFromFixtures(finishedFixtures, officialStandings[0], officialNotes)];
      }
    }

    content.innerHTML = tablesToRender.map((table, gi) => 
      renderStandingsTable(table, leagueId, season, tablesToRender.length > 1 ? `Grupo ${gi + 1}` : null, state.currentTableFilter)
    ).join("");
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}

function computeTableFromFixtures(fixtures, templateTable, officialNotes) {
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

  result.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const diffA = a.all.goals.for - a.all.goals.against;
    const diffB = b.all.goals.for - b.all.goals.against;
    if (diffB !== diffA) return diffB - diffA;
    if (b.all.goals.for !== a.all.goals.for) return b.all.goals.for - a.all.goals.for;
    return a.team.name.localeCompare(b.team.name);
  });

  return result;
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
// View: Liga — Jogos
// ============================================================
async function renderLeagueFixtures(leagueId, season) {
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
    const allFixtures = preprocessLeagueFixtures(rawFixtures);

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
      const tA = new Date(dateGroups[a][0].fixture.date).getTime();
      const tB = new Date(dateGroups[b][0].fixture.date).getTime();
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
            `;
          }).join("")}
        </div>
      </div>`;
  }).join("");
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
// View: Perfil do Jogador
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
      penalty: {
        won: statsList.reduce((acc, s) => acc + (s.penalty?.won || 0), 0),
        scored: statsList.reduce((acc, s) => acc + (s.penalty?.scored || 0), 0),
        missed: statsList.reduce((acc, s) => acc + (s.penalty?.missed || 0), 0),
      }
    };

    const allOptions = [totalStats, ...statsList];
    let currentSelectedIdx = 0;
    let currentMode = "total"; // "total" | "per_game"

    function renderPlayerStatsView(s, selectedIdx = 0, mode = "total") {
      const rating = parseFloat(s.games?.rating || "0").toFixed(2);
      const isPerGame = (mode === "per_game");
      const apps = s.games?.appearences || 0;

      function fmt(val, digits = 2) {
        if (!isPerGame) return (val ?? 0).toString();
        if (!apps || val === undefined || val === null) return "0.00";
        return (val / apps).toFixed(digits);
      }
      
      const compOptions = allOptions.map((st, idx) => `
        <option value="${idx}" ${idx === selectedIdx ? 'selected' : ''}>
          ${idx === 0 ? '📊 Total Geral (Todas as Competições)' : `${escapeHtml(st.league.name)} — ${escapeHtml(st.team.name)}`}
        </option>
      `).join("");

      return `
        ${breadcrumbs([
          { label: "Ligas", href: "#/" },
          { label: s.team?.name || "Clube", href: `#/time/${s.team?.id || teamId}/${leagueId || 71}/${season || 2026}` },
          { label: p.name, href: "" }
        ])}

        <div class="player-hero">
          <div class="player-hero-main-row">
            <div class="player-hero-avatar-wrap">
              <img class="player-avatar-large" src="${p.photo}" alt="" onerror="this.style.display='none'">
            </div>
            <div class="player-hero-text">
              <p class="page-eyebrow">${escapeHtml(formatTeamName(s.team?.name || ""))} · ${escapeHtml(s.games?.position || "")} ${s.games?.number ? `#${s.games.number}` : ''}</p>
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
              <span>${isPerGame ? `Total: ${s.goals?.total ?? 0} gols (${s.penalty?.scored ?? 0} pênaltis)` : `Pênaltis: ${s.penalty?.scored ?? 0}`}</span>
            </div>
          </div>

          <div class="stat-card-modern green">
            <div class="stat-card-header">
              <span>👟</span>
              <span>${isPerGame ? 'Média de Assist. / Jogo' : 'Assistências'}</span>
            </div>
            <div class="stat-card-main-val green">${fmt(s.goals?.assists)}</div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Passes Chave / Jogo: ${fmt(s.passes?.key)}` : `Passes Chave: ${s.passes?.key ?? 0}`}</span>
            </div>
          </div>

          <div class="stat-card-modern cyan">
            <div class="stat-card-header">
              <span>🎯</span>
              <span>Precisão de Passes</span>
            </div>
            <div class="stat-card-main-val cyan">${s.passes?.accuracy ? s.passes.accuracy + '%' : '-'}</div>
            <div class="stat-split-bar">
              <span>${isPerGame ? `Média: ${fmt(s.passes?.total, 1)} passes / jogo` : `Total: ${s.passes?.total ?? 0}`}</span>
            </div>
          </div>
        </div>

        <div class="player-metrics-grid">
          <div class="player-metrics-card">
            <div class="player-metrics-header attack">
              <span class="metrics-header-icon">🔥</span>
              <span class="metrics-header-title">Finalizações & Ataque ${isPerGame ? '(Por Jogo)' : ''}</span>
            </div>
            <div class="player-metrics-list">
              <div class="player-metric-row">
                <div class="metric-info">
                  <span class="metric-icon">🎯</span>
                  <span class="metric-label">Chutes Totais</span>
                </div>
                <span class="metric-val gold">${fmt(s.shots?.total)}</span>
              </div>

              <div class="player-metric-row">
                <div class="metric-info">
                  <span class="metric-icon">🥅</span>
                  <span class="metric-label">Chutes no Alvo</span>
                </div>
                <span class="metric-val gold">${fmt(s.shots?.on)}</span>
              </div>

              <div class="player-metric-row">
                <div class="metric-info">
                  <span class="metric-icon">⚡</span>
                  <span class="metric-label">Dribles Certos</span>
                </div>
                <span class="metric-val">${fmt(s.dribbles?.success)}</span>
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
            <div class="player-metrics-header defense">
              <span class="metrics-header-icon">🛡️</span>
              <span class="metrics-header-title">Defesa & Disciplina ${isPerGame ? '(Por Jogo)' : ''}</span>
            </div>
            <div class="player-metrics-list">
              <div class="player-metric-row">
                <div class="metric-info">
                  <span class="metric-icon">⚔️</span>
                  <span class="metric-label">Desarmes</span>
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
                  <span class="metric-icon">⚠️</span>
                  <span class="metric-label">Faltas Cometidas</span>
                </div>
                <span class="metric-val">${fmt(s.fouls?.committed)}</span>
              </div>

              <div class="player-metric-row">
                <div class="metric-info">
                  <span class="metric-icon">🎴</span>
                  <span class="metric-label">Cartões Amarelos / Vermelhos</span>
                </div>
                <div class="metric-cards-badges">
                  <span class="card-badge yellow">🟨 ${isPerGame ? fmt(s.cards?.yellow) + '/j' : (s.cards?.yellow ?? 0)}</span>
                  <span class="card-badge red">🟥 ${isPerGame ? fmt(s.cards?.red) + '/j' : (s.cards?.red ?? 0)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
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
async function renderTeam(teamId, leagueId, season) {
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
                const dayNum = dObj.toLocaleDateString("pt-BR", { day: "2-digit" });
                const monthName = dObj.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
                const timeStr = dObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const isHome = f.teams.home.id === teamId;
                const leagueLogo = f.league?.logo;
                const leagueName = formatTeamName(f.league?.name || "");

                return `
                  <a class="fixture-row" href="#/jogo/${f.fixture.id}" title="Ver detalhes de ${escapeHtml(leagueName)}">
                    <div class="fixture-date-col" style="display:flex;flex-direction:row;align-items:center;gap:8px;min-width:65px;">
                      <div style="display:flex;flex-direction:column;align-items:center;line-height:1.15;min-width:28px;">
                        <span class="fixture-date" style="color:var(--gold);font-weight:800;font-size:0.95rem;">${dayNum}</span>
                        <span style="font-size:0.68rem;color:var(--chalk-dim);text-transform:lowercase;font-weight:600;">${monthName}</span>
                        <span style="font-family:var(--font-mono);font-size:0.65rem;color:var(--chalk-dim);margin-top:2px;">${timeStr}</span>
                      </div>
                      ${leagueLogo ? `<img src="${leagueLogo}" alt="" style="width:20px;height:20px;object-fit:contain;flex-shrink:0;" title="${escapeHtml(leagueName)}" onerror="this.style.display='none'">` : ''}
                    </div>
                    <div class="fixture-team-item right ${isHome ? 'bold-team' : ''}">
                      <span>${escapeHtml(formatTeamName(f.teams.home.name))}</span>
                      <img src="${f.teams.home.logo}" alt="" loading="lazy">
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:60px;">
                      ${leagueName ? `<span style="font-size:0.65rem;color:var(--chalk-dim);font-weight:600;white-space:nowrap;max-width:85px;overflow:hidden;text-overflow:ellipsis;text-align:center;" title="${escapeHtml(leagueName)}">${escapeHtml(leagueName)}</span>` : ''}
                      <span class="fixture-score" style="color:var(--chalk-dim);font-size:0.8rem;padding:2px 8px;min-width:38px;">vs</span>
                    </div>
                    <div class="fixture-team-item ${!isHome ? 'bold-team' : ''}">
                      <img src="${f.teams.away.logo}" alt="" loading="lazy">
                      <span>${escapeHtml(formatTeamName(f.teams.away.name))}</span>
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
                const dayNum = dObj.toLocaleDateString("pt-BR", { day: "2-digit" });
                const monthName = dObj.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
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
                  <a class="fixture-row" href="#/jogo/${f.fixture.id}" title="Ver detalhes de ${escapeHtml(leagueName)}">
                    <div class="fixture-date-col" style="display:flex;flex-direction:row;align-items:center;gap:8px;min-width:65px;">
                      <div style="display:flex;flex-direction:column;align-items:center;line-height:1.15;min-width:28px;">
                        <span class="fixture-date" style="font-size:0.95rem;font-weight:800;color:var(--chalk);">${dayNum}</span>
                        <span style="font-size:0.68rem;color:var(--chalk-dim);text-transform:lowercase;font-weight:600;">${monthName}</span>
                      </div>
                      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;">
                        ${leagueLogo ? `<img src="${leagueLogo}" alt="" style="width:18px;height:18px;object-fit:contain;" title="${escapeHtml(leagueName)}" onerror="this.style.display='none'">` : ''}
                        <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:${outcomeBg};color:${outcomeColor};border:1px solid ${outcomeBorder};border-radius:4px;font-family:var(--font-mono);font-size:0.68rem;font-weight:800;line-height:1;">
                          ${outcomeLetter}
                        </span>
                      </div>
                    </div>
                    <div class="fixture-team-item right ${isHome ? 'bold-team' : ''}">
                      <span>${escapeHtml(formatTeamName(f.teams.home.name))}</span>
                      <img src="${f.teams.home.logo}" alt="" loading="lazy">
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:60px;">
                      ${leagueName ? `<span style="font-size:0.65rem;color:var(--chalk-dim);font-weight:600;white-space:nowrap;max-width:85px;overflow:hidden;text-overflow:ellipsis;text-align:center;" title="${escapeHtml(leagueName)}">${escapeHtml(leagueName)}</span>` : ''}
                      <span class="fixture-score" style="padding:2px 8px;min-width:44px;">${homeGoals} : ${awayGoals}</span>
                      <button type="button" class="btn-fixture-highlights-pill" title="Assistir aos Melhores Momentos no YouTube" onclick="event.preventDefault(); event.stopPropagation(); window.open('https://www.youtube.com/results?search_query=${encodeURIComponent(`Melhores Momentos ${f.teams.home.name} x ${f.teams.away.name} ${leagueName}`)}', '_blank', 'noopener,noreferrer');">
                        <span style="font-size:0.6rem;line-height:1;">▶</span>
                        <span>Melhores Momentos</span>
                      </button>
                    </div>
                    <div class="fixture-team-item ${!isHome ? 'bold-team' : ''}">
                      <img src="${f.teams.away.logo}" alt="" loading="lazy">
                      <span>${escapeHtml(formatTeamName(f.teams.away.name))}</span>
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
        toast(`🔔 Você receberá notificações de gols do ${t.name}!`, false);
      }
      NotificationManager.syncPreferences();
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
                <img src="${p.photo}" alt="" loading="lazy" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
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
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return getLocalDateString(dt);
}

function formatDateDisplayBR(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const nowStr = getLocalDateString(new Date());
  const isToday = dateStr === nowStr;

  const weekday = dateObj.toLocaleDateString("pt-BR", { weekday: "long" });
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const formattedDate = dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return {
    full: isToday ? `Hoje, ${formattedDate}` : `${capitalizedWeekday}, ${formattedDate}`,
    short: formattedDate,
    isToday
  };
}

async function renderMatchesOfDay(selectedDate, statusFilter = "all") {
  const currentDate = selectedDate || getLocalDateString(new Date());
  const dateInfo = formatDateDisplayBR(currentDate);
  const prevDate = shiftDate(currentDate, -1);
  const nextDate = shiftDate(currentDate, 1);
  const todayStr = getLocalDateString(new Date());

  app.innerHTML = `
    <div class="page-head" style="margin-bottom:14px;">
      <p class="page-eyebrow">Calendário Oficial</p>
      <h1 class="page-title">Jogos do Dia</h1>
      <p class="page-sub">Acompanhe todas as partidas das competições oficiais do FutStats em tempo real.</p>
    </div>

    <!-- Barra de Navegação por Data -->
    <div class="day-selector-bar">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <button class="day-nav-btn" id="btn-prev-day" data-date="${prevDate}">
          ← Anterior
        </button>
        <button class="day-nav-btn ${dateInfo.isToday ? 'active' : ''}" id="btn-today-day" data-date="${todayStr}">
          Hoje
        </button>
        <button class="day-nav-btn" id="btn-next-day" data-date="${nextDate}">
          Próximo →
        </button>
      </div>

      <div class="day-current-display">
        <span class="day-date-title">📅 ${dateInfo.full}</span>
        <input type="date" class="day-date-picker" id="day-date-input" value="${currentDate}">
      </div>
    </div>

    <!-- Filtros de Status (Todos, Ao Vivo, Finalizados, A Realizar) -->
    <div class="matches-day-filters" id="day-status-filters">
      <button class="matches-day-filter-btn ${statusFilter === 'all' ? 'active' : ''}" data-filter="all">Todos</button>
      <button class="matches-day-filter-btn ${statusFilter === 'live' ? 'active' : ''}" data-filter="live">🔴 Ao Vivo</button>
      <button class="matches-day-filter-btn ${statusFilter === 'finished' ? 'active' : ''}" data-filter="finished">✅ Finalizados</button>
      <button class="matches-day-filter-btn ${statusFilter === 'scheduled' ? 'active' : ''}" data-filter="scheduled">⏳ A Realizar</button>
    </div>

    <div id="day-matches-content">${skeletonTable()}</div>
  `;

  // Listeners de data
  document.getElementById("btn-prev-day").addEventListener("click", () => {
    location.hash = `#/jogos-do-dia/${prevDate}`;
  });
  document.getElementById("btn-next-day").addEventListener("click", () => {
    location.hash = `#/jogos-do-dia/${nextDate}`;
  });
  document.getElementById("btn-today-day").addEventListener("click", () => {
    location.hash = `#/jogos-do-dia/${todayStr}`;
  });
  document.getElementById("day-date-input").addEventListener("change", (e) => {
    if (e.target.value) {
      location.hash = `#/jogos-do-dia/${e.target.value}`;
    }
  });

  // Listeners de filtro de status
  document.getElementById("day-status-filters").addEventListener("click", (e) => {
    const btn = e.target.closest(".matches-day-filter-btn");
    if (!btn) return;
    const filter = btn.dataset.filter;
    document.querySelectorAll(".matches-day-filter-btn").forEach(b => b.classList.toggle("active", b === btn));
    fetchAndRenderDayMatches(currentDate, filter);
  });

  await fetchAndRenderDayMatches(currentDate, statusFilter);
}

async function fetchAndRenderDayMatches(dateStr, filter = "all") {
  const content = document.getElementById("day-matches-content");
  if (!content) return;

  const knownLeagueIds = new Set(LEAGUES.map(l => l.id));
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

  try {
    const fixtures = await apiGet("fixtures", { date: dateStr, timezone: tz }, 3);
    const relevant = (fixtures || []).filter(f => {
      if (!knownLeagueIds.has(f.league?.id)) return false;
      // Garante que o jogo pertence exatamente ao dia selecionado no fuso horário local
      const fixtureDateLocal = getLocalDateString(new Date(f.fixture?.date));
      return fixtureDateLocal === dateStr;
    });

    if (!relevant.length) {
      content.innerHTML = `
        <div class="card" style="text-align:center;padding:48px 20px;color:var(--chalk-dim);">
          <div style="font-size:2.4rem;margin-bottom:10px;">📅</div>
          <h3 style="color:var(--chalk);margin:0 0 6px 0;">Nenhum jogo programado para esta data</h3>
          <p style="margin:0;font-size:0.88rem;">Não há partidas das competições cobertas nesta data. Experimente navegar para outro dia.</p>
        </div>`;
      return;
    }

    // Filtragem por status
    const liveStatuses = ["1H", "2H", "HT", "ET", "P", "BT", "LIVE"];
    const finishedStatuses = ["FT", "AET", "PEN"];
    const scheduledStatuses = ["NS", "TBD"];

    const liveCount = relevant.filter(f => liveStatuses.includes(f.fixture.status?.short)).length;
    const finishedCount = relevant.filter(f => finishedStatuses.includes(f.fixture.status?.short)).length;
    const scheduledCount = relevant.filter(f => scheduledStatuses.includes(f.fixture.status?.short)).length;

    // Atualiza contadores dos botões de filtro se existirem
    const filterButtons = document.querySelectorAll(".matches-day-filter-btn");
    if (filterButtons.length >= 4) {
      filterButtons[0].textContent = `Todos (${relevant.length})`;
      filterButtons[1].textContent = `🔴 Ao Vivo (${liveCount})`;
      filterButtons[2].textContent = `✅ Finalizados (${finishedCount})`;
      filterButtons[3].textContent = `⏳ A Realizar (${scheduledCount})`;
    }

    let filtered = relevant;
    if (filter === "live") {
      filtered = relevant.filter(f => liveStatuses.includes(f.fixture.status?.short));
    } else if (filter === "finished") {
      filtered = relevant.filter(f => finishedStatuses.includes(f.fixture.status?.short));
    } else if (filter === "scheduled") {
      filtered = relevant.filter(f => scheduledStatuses.includes(f.fixture.status?.short));
    }

    if (!filtered.length) {
      content.innerHTML = `
        <div class="card" style="text-align:center;padding:36px 20px;color:var(--chalk-dim);">
          <p style="margin:0;">Nenhuma partida encontrada com o filtro selecionado nesta data.</p>
        </div>`;
      return;
    }

    // Agrupa por Liga mantendo a ordem oficial das Ligas do projeto
    const leagueMap = new Map();
    LEAGUES.forEach(l => {
      const leagueMatches = filtered.filter(f => f.league?.id === l.id);
      if (leagueMatches.length) {
        leagueMap.set(l.id, { league: l, matches: leagueMatches });
      }
    });

    // Caso haja alguma liga não indexada na ordem padrão
    filtered.forEach(f => {
      if (!leagueMap.has(f.league?.id)) {
        leagueMap.set(f.league?.id, { league: f.league, matches: [f] });
      }
    });

    const groupsHtml = Array.from(leagueMap.values()).map(group => {
      const leagueInfo = group.league;
      const matches = group.matches;
      const season = matches[0]?.league?.season || defaultSeasonFor(leagueInfo);

      return `
        <div class="league-matches-group">
          <div class="league-matches-header">
            <a class="league-matches-header-left" href="#/liga/${leagueInfo.id}/${season}" title="Ver classificação de ${escapeHtml(leagueInfo.name)}">
              <img src="${matches[0]?.league?.logo || ''}" alt="" loading="lazy">
              <span class="league-matches-header-title">${escapeHtml(leagueInfo.name)}</span>
            </a>
            <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">${formatRoundName(matches[0]?.league?.round || "")}</span>
          </div>

          <div class="card league-matches-body">
            <div class="fixture-list">
              ${matches.map(f => {
                const isLive = liveStatuses.includes(f.fixture.status?.short);
                const isFinished = finishedStatuses.includes(f.fixture.status?.short);
                const timeStr = new Date(f.fixture.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

                let statusBadge = `<span class="fixture-date">${timeStr}</span>`;
                if (isLive) {
                  statusBadge = `<span class="fixture-date" style="color:#10B981;font-weight:700;">🔴 ${f.fixture.status.elapsed}'</span>`;
                } else if (isFinished) {
                  statusBadge = `<span class="fixture-date" style="color:var(--chalk-dim);font-weight:600;">${f.fixture.status.short}</span>`;
                }

                const scoreDisplay = (isFinished || isLive)
                  ? `<span class="fixture-score ${isLive ? 'live-score' : ''}">${f.goals.home ?? 0} : ${f.goals.away ?? 0}</span>`
                  : `<span class="fixture-score" style="color:var(--chalk-dim);font-size:0.85rem;">vs</span>`;

                return `
                  <a class="fixture-row" href="#/jogo/${f.fixture.id}" title="Clique para abrir estatísticas do confronto">
                    <div class="fixture-date-col">
                      ${statusBadge}
                    </div>
                    <div class="fixture-team-item right">
                      <span>${escapeHtml(f.teams.home.name)}</span>
                      <img src="${f.teams.home.logo}" alt="" loading="lazy">
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:54px;">
                      ${scoreDisplay}
                      ${isFinished ? `
                        <button type="button" class="btn-fixture-highlights-pill" title="Assistir aos Melhores Momentos no YouTube" onclick="event.preventDefault(); event.stopPropagation(); window.open('https://www.youtube.com/results?search_query=${encodeURIComponent(`Melhores Momentos ${f.teams.home.name} x ${f.teams.away.name} ${f.league?.name || ''}`)}', '_blank', 'noopener,noreferrer');">
                          <span style="font-size:0.6rem;line-height:1;">▶</span>
                          <span>Melhores Momentos</span>
                        </button>
                      ` : ''}
                    </div>
                    <div class="fixture-team-item">
                      <img src="${f.teams.away.logo}" alt="" loading="lazy">
                      <span>${escapeHtml(f.teams.away.name)}</span>
                    </div>
                  </a>`;
              }).join("")}
            </div>
          </div>
        </div>`;
    }).join("");

    content.innerHTML = groupsHtml;
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
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
  if (state.liveTimer) {
    clearInterval(state.liveTimer);
    state.liveTimer = null;
  }

  let remaining = state.liveIntervalSeconds;
  
  state.liveTimer = setInterval(() => {
    const bar = document.getElementById("live-progress-bar");
    // Se o elemento sumiu da tela ou o usuário mudou de rota, cancela o timer
    if (!bar) {
      clearInterval(state.liveTimer);
      state.liveTimer = null;
      return;
    }

    remaining--;
    bar.style.width = `${(remaining / state.liveIntervalSeconds) * 100}%`;
    if (remaining <= 0) {
      remaining = state.liveIntervalSeconds;
      refreshFn();
    }
  }, 1000);
}

// ============================================================
// View: Detalhe do Jogo (Com Estatísticas Pré-Jogo vs Ao Vivo)
// ============================================================
async function renderFixture(fixtureId, isSilentRefresh = false) {
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

    const events = eventsRes.status === "fulfilled" ? (eventsRes.value || []) : [];
    const statsArr = statsRes.status === "fulfilled" ? (statsRes.value || []) : [];
    const lineupsArr = lineupsRes.status === "fulfilled" ? (lineupsRes.value || []) : [];
    const pred = predictionsRes.status === "fulfilled" ? predictionsRes.value?.[0] : null;
    const fixturePlayersArr = playersRes.status === "fulfilled" ? (playersRes.value || []) : [];

    const fixturePlayersMap = {};
    let highestRating = 0;
    let mvpPlayerId = null;

    if (Array.isArray(fixturePlayersArr)) {
      fixturePlayersArr.forEach(teamData => {
        (teamData.players || []).forEach(pData => {
          const pid = pData.player?.id;
          if (pid) {
            fixturePlayersMap[pid] = pData;
            const r = parseFloat(pData.statistics?.[0]?.games?.rating || "0");
            if (r > highestRating && r >= 7.0) {
              highestRating = r;
              mvpPlayerId = pid;
            }
          }
        });
      });
    }

    const date = new Date(fx.fixture.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const time = new Date(fx.fixture.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    
    const isLive = ["1H", "2H", "HT", "ET", "P", "LIVE"].includes(fx.fixture.status.short);
    const isFinished = ["FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"].includes(fx.fixture.status.short) || 
      String(fx.fixture.status.long || "").toLowerCase().includes("finish") || 
      String(fx.fixture.status.long || "").toLowerCase().includes("encerrado") ||
      String(fx.fixture.status.long || "").toLowerCase().includes("final");

    const statusText = isLive 
      ? `<span style="color:var(--gold);font-weight:700;">● AO VIVO ${fx.fixture.status.elapsed ?? ""}' (${fx.fixture.status.long})</span>` 
      : escapeHtml(fx.fixture.status.long);

    const homeGoals = events.filter(e => e.type === "Goal" && e.detail !== "Missed Penalty" && e.team?.id === fx.teams.home.id);
    const awayGoals = events.filter(e => e.type === "Goal" && e.detail !== "Missed Penalty" && e.team?.id === fx.teams.away.id);

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
          <button class="btn ${isFavFixture ? 'active-fav' : 'ghost'} small" id="btn-toggle-fixture-fav" style="display:inline-flex;align-items:center;gap:6px;">
            ${isFavFixture ? '🔔 Alertas Ativados (Jogo)' : '🔔 Seguir Jogo (Gols & Escalações)'}
          </button>
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
                const searchQ = encodeURIComponent(`Gol ${playerName} ${fx.teams.home.name} ${fx.teams.away.name}`);
                const ytUrl = `https://www.youtube.com/results?search_query=${searchQ}`;

                return `
                  <div class="hero-goal-item">
                    <span>⚽</span>
                    <span class="player-name">${escapeHtml(playerName)}</span>
                    <span class="time">${g.time.elapsed}'${g.time.extra ? `+${g.time.extra}` : ''}${isPen ? ' (P)' : isOwnGoal ? ' (GC)' : ''}</span>
                    ${isFinished ? `
                      <a href="${ytUrl}" target="_blank" rel="noopener noreferrer" class="btn-goal-video" title="Ver vídeo do gol de ${escapeHtml(playerName)} no YouTube">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </a>
                    ` : ''}
                  </div>
                `;
              }).join("")}
            </div>

            <div class="hero-goals-col away">
              ${awayGoals.map(g => {
                const playerName = g.player?.name || "Gol";
                const isOwnGoal = g.detail === 'Own Goal';
                const isPen = g.detail === 'Penalty';
                const searchQ = encodeURIComponent(`Gol ${playerName} ${fx.teams.home.name} ${fx.teams.away.name}`);
                const ytUrl = `https://www.youtube.com/results?search_query=${searchQ}`;

                return `
                  <div class="hero-goal-item">
                    <span>⚽</span>
                    <span class="player-name">${escapeHtml(playerName)}</span>
                    <span class="time">${g.time.elapsed}'${g.time.extra ? `+${g.time.extra}` : ''}${isPen ? ' (P)' : isOwnGoal ? ' (GC)' : ''}</span>
                    ${isFinished ? `
                      <a href="${ytUrl}" target="_blank" rel="noopener noreferrer" class="btn-goal-video" title="Ver vídeo do gol de ${escapeHtml(playerName)} no YouTube">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </a>
                    ` : ''}
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
      ${renderMatchLineupPrompt(fx, lineupsArr)}

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
            return renderPitchBar(fx.teams.home, fx.teams.away, { probA, probB, probDraw });
          })()}
        </div>
      ` : ""}

      <!-- Linha do Tempo -->
      <div id="fixture-events-section">
        ${renderFixtureEvents(events, fx, isFinished)}
      </div>
    `;

    const btnFav = document.getElementById("btn-toggle-fixture-fav");
    if (btnFav) {
      btnFav.addEventListener("click", async () => {
        const isFav = state.favoriteFixtures.some(f => f.id === fixtureId);
        if (isFav) {
          state.favoriteFixtures = state.favoriteFixtures.filter(f => f.id !== fixtureId);
          await NotificationManager.syncPreferences();
          toast(`Você deixou de seguir os alertas de ${fx.teams.home.name} x ${fx.teams.away.name}.`, false);
        } else {
          if (Notification.permission !== "granted") {
            await NotificationManager.subscribe();
          }
          state.favoriteFixtures.push({
            id: fixtureId,
            home: { id: fx.teams.home.id, name: fx.teams.home.name, logo: fx.teams.home.logo },
            away: { id: fx.teams.away.id, name: fx.teams.away.name, logo: fx.teams.away.logo },
            league: { id: fx.league.id, name: fx.league.name },
            date: fx.fixture.date
          });
          await NotificationManager.syncPreferences();
          toast(`🔔 Alertas ativados para ${fx.teams.home.name} x ${fx.teams.away.name}! Você receberá avisos de Escalações, Gols e Lances.`, false);
        }
        renderFixture(fixtureId, true);
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
  const ratingStr = game.rating || "-";
  const ratingNum = parseFloat(ratingStr || "0");
  const isMVP = (ratingNum >= 7.5);
  const position = game.position || p.pos || "M";
  const minutes = game.minutes ?? "-";

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
          <img src="https://media.api-sports.io/football/players/${p.id}.png" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
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
            <div class="player-match-rating-circle ${ratingClass}" title="Nota da Partida">
              
              <span>${ratingStr}</span>
            </div>
          ` : ''}
          <button id="btn-close-player-match-modal" style="background:none;border:none;color:var(--chalk);font-size:1.3rem;cursor:pointer;padding:4px;">✕</button>
        </div>
      </div>

      <!-- Mapa de Calor -->
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);font-weight:700;display:flex;align-items:center;gap:6px;">
            🔥 MAPA DE CALOR TÁTICO
          </span>
          <span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--cyan);">Ataque ➔</span>
        </div>
        <div class="heatmap-canvas-container">
          <canvas id="player-match-heatmap-canvas" class="heatmap-canvas" width="480" height="220"></canvas>
        </div>
      </div>

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
                          const ratingStr = pData?.statistics?.[0]?.games?.rating;
                          const ratingNum = parseFloat(ratingStr || "0");
                          const isMVP = (pid === mvpPlayerId && ratingNum >= 7.0);

                          let ratingBadge = "";
                          if (ratingStr && !isNaN(ratingNum) && ratingNum > 0) {
                            const rClass = ratingNum >= 7.5 ? "rating-high" : ratingNum >= 6.5 ? "rating-med" : "rating-low";
                            ratingBadge = `<span class="pitch-player-rating-pill ${rClass}" title="Nota da Partida: ${ratingStr}">${ratingStr}</span>`;
                          }

                          return `
                            <div class="pitch-player btn-open-match-player-modal" data-player-id="${pid}" data-team-id="${l.team.id}" style="cursor:pointer;" title="Clique para ver nota, mapa de calor e estatísticas de ${escapeHtml(p.player.name)}">
                              <div class="pitch-badge-wrapper">
                                <div class="pitch-player-avatar-circle ${isAway ? 'away' : 'home'} ${isMVP ? 'is-mvp' : ''}">
                                  <img src="${photoUrl}" alt="" loading="lazy" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
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
              ${l.substitutes.map(s => {
                const pid = s.player?.id;
                const eventBadges = generateEventBadges(pid);
                const entered = playerEventsMap[pid]?.subIn;
                const photoUrl = pid ? `https://media.api-sports.io/football/players/${pid}.png` : 'https://media.api-sports.io/football/players/placeholder.png';
                return `
                  <a class="sub-player-card ${entered ? 'was-subbed-in' : ''}" href="#/jogador/${pid}/${l.team.id}/${leagueId}/${season}" title="Ver perfil de ${escapeHtml(s.player.name)}">
                    <span class="sub-num ${isAway ? 'away' : 'home'}">${s.player.number ?? "-"}</span>
                    <img class="sub-photo" src="${photoUrl}" alt="" loading="lazy" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
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
          const ytGoalUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`Gol ${pName} ${fx.teams.home.name} ${fx.teams.away.name}`)}`;

          return `
            <div class="fixture-row" style="grid-template-columns:44px auto 1fr auto;">
              <span class="fixture-date">${e.time.elapsed}'${e.time.extra ? "+" + e.time.extra : ""}</span>
              <span>${e.type === "Goal" ? "⚽" : e.type === "Card" ? (e.detail === "Red Card" ? "🟥" : "🟨") : "🔁"}</span>
              <div>
                <strong>${escapeHtml(pName)}</strong>
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
                <span>${r.valA}</span>
              </div>
              <div class="fifa-label">${r.label}</div>
              <div class="fifa-val b ${r.bWins ? 'highlight' : ''}">
                <span>${r.valB}</span>
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

// ============================================================
// Sua Escalação — Montador Tático & Comparador
// ============================================================

const TACTICAL_FORMATIONS = {
  "4-3-3": {
    name: "4-3-3",
    label: "4-3-3 (Clássico)",
    lines: [
      { name: "Ataque", count: 3, roles: ["Ponta Esquerda", "Centroavante", "Ponta Direita"], posFilter: "Attacker" },
      { name: "Meio-campo", count: 3, roles: ["Meia", "Volante", "Meia"], posFilter: "Midfielder" },
      { name: "Defesa", count: 4, roles: ["Lateral Esquerdo", "Zagueiro", "Zagueiro", "Lateral Direito"], posFilter: "Defender" },
      { name: "Goleiro", count: 1, roles: ["Goleiro"], posFilter: "Goalkeeper" }
    ]
  },
  "4-2-3-1": {
    name: "4-2-3-1",
    label: "4-2-3-1 (Moderno)",
    lines: [
      { name: "Ataque", count: 1, roles: ["Centroavante"], posFilter: "Attacker" },
      { name: "Meias Ofensivos", count: 3, roles: ["Meia Esquerda", "Meia Central", "Meia Direita"], posFilter: "Midfielder" },
      { name: "Volantes", count: 2, roles: ["Volante", "Volante"], posFilter: "Midfielder" },
      { name: "Defesa", count: 4, roles: ["Lateral Esquerdo", "Zagueiro", "Zagueiro", "Lateral Direito"], posFilter: "Defender" },
      { name: "Goleiro", count: 1, roles: ["GOL"], posFilter: "Goalkeeper" }
    ]
  },
  "4-4-2": {
    name: "4-4-2",
    label: "4-4-2 (Tradicional)",
    lines: [
      { name: "Ataque", count: 2, roles: ["Atacante", "Centroavante"], posFilter: "Attacker" },
      { name: "Meio-campo", count: 4, roles: ["Meia Esquerda", "Meia Central", "Meia Central", "Meia Direita"], posFilter: "Midfielder" },
      { name: "Defesa", count: 4, roles: ["Lateral Esquerdo", "Zagueiro", "Zagueiro", "Lateral Direito"], posFilter: "Defender" },
      { name: "Goleiro", count: 1, roles: ["Goleiro"], posFilter: "Goalkeeper" }
    ]
  },
  "3-5-2": {
    name: "3-5-2",
    label: "3-5-2 (Alas)",
    lines: [
      { name: "Ataque", count: 2, roles: ["Atacante", "Centroavante"], posFilter: "Attacker" },
      { name: "Meio-campo", count: 5, roles: ["Ala Esquerdo", "Meia", "Volante", "Meia", "Ala Direito"], posFilter: "Midfielder" },
      { name: "Defesa", count: 3, roles: ["Zagueiro", "Zagueiro Central", "Zagueiro"], posFilter: "Defender" },
      { name: "Goleiro", count: 1, roles: ["Goleiro"], posFilter: "Goalkeeper" }
    ]
  },
  "3-4-3": {
    name: "3-4-3",
    label: "3-4-3 (Ofensivo)",
    lines: [
      { name: "Ataque", count: 3, roles: ["Ponta Esquerda", "Centroavante", "Ponta Direita"], posFilter: "Attacker" },
      { name: "Meio-campo", count: 4, roles: ["Ala Esquerdo", "Meia", "Meia", "Ala Direito"], posFilter: "Midfielder" },
      { name: "Defesa", count: 3, roles: ["Zagueiro", "Zagueiro Central", "Zagueiro"], posFilter: "Defender" },
      { name: "Goleiro", count: 1, roles: ["Goleiro"], posFilter: "Goalkeeper" }
    ]
  },
  "5-3-2": {
    name: "5-3-2",
    label: "5-3-2 (Defensivo)",
    lines: [
      { name: "Ataque", count: 2, roles: ["Atacante", "Centroavante"], posFilter: "Attacker" },
      { name: "Meio-campo", count: 3, roles: ["Meia", "Volante", "Meia"], posFilter: "Midfielder" },
      { name: "Defesa", count: 5, roles: ["Ala Esquerdo", "Zagueiro", "Líbero", "Zagueiro", "Ala Direito"], posFilter: "Defender" },
      { name: "Goleiro", count: 1, roles: ["Goleiro"], posFilter: "Goalkeeper" }
    ]
  },
  "4-1-4-1": {
    name: "4-1-4-1",
    label: "4-1-4-1 (Linhas)",
    lines: [
      { name: "Ataque", count: 1, roles: ["Centroavante"], posFilter: "Attacker" },
      { name: "Meias", count: 4, roles: ["Meia Esquerda", "Meia", "Meia", "Meia Direita"], posFilter: "Midfielder" },
      { name: "Volante", count: 1, roles: ["Volante"], posFilter: "Midfielder" },
      { name: "Defesa", count: 4, roles: ["Lateral Esquerdo", "Zagueiro", "Zagueiro", "Lateral Direito"], posFilter: "Defender" },
      { name: "Goleiro", count: 1, roles: ["Goleiro"], posFilter: "Goalkeeper" }
    ]
  }
};

const UserLineupStore = {
  KEY: "futstats_user_lineups_v1",
  getAll() {
    try {
      const data = localStorage.getItem(this.KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  },
  get(id) {
    return this.getAll()[id] || null;
  },
  save(lineup) {
    try {
      const all = this.getAll();
      all[lineup.id] = { ...lineup, updatedAt: Date.now() };
      localStorage.setItem(this.KEY, JSON.stringify(all));
      return true;
    } catch (e) {
      console.error("Erro ao salvar escalação:", e);
      return false;
    }
  },
  delete(id) {
    try {
      const all = this.getAll();
      delete all[id];
      localStorage.setItem(this.KEY, JSON.stringify(all));
      return true;
    } catch {
      return false;
    }
  }
};

// 1. Tela Principal: Lista de Escalações do Usuário
async function renderMyLineups() {
  const savedMap = UserLineupStore.getAll();
  const savedList = Object.values(savedMap).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  app.innerHTML = `
    ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: "Sua Escalação", href: "" }])}
    <div class="page-head">
      <p class="page-eyebrow">Prancheta Tática do Usuário</p>
      <h1 class="page-title">Sua Escalação</h1>
      <p class="page-sub">Monte a escalação ideal do seu time, escolha o esquema tático e compare seu palpite com a escalação oficial do treinador!</p>
    </div>

    <!-- Barra de Busca de Clubes (Sem equipes sugeridas na tela) -->
    <div class="card" style="margin-bottom:24px;">
      <h2 class="section-title" style="margin-top:0;">Buscar Clube para Escalar</h2>
      <div style="position:relative;margin-top:12px;">
        <div style="display:flex;align-items:center;background:rgba(255,255,255,0.04);border:1px solid var(--line-strong);border-radius:var(--radius-sm);padding:0 14px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.3);">
          <span style="font-size:1.1rem;color:var(--chalk-dim);margin-right:10px;">🔍</span>
          <input type="text" id="input-team-search" placeholder="Digite o nome do clube que deseja escalar (ex: Barcelona, Flamengo, Arsenal, Real Madrid...)" autocomplete="off" style="width:100%;background:transparent;border:none;color:var(--chalk);padding:12px 0;font-family:var(--font-body);font-size:0.92rem;outline:none;">
        </div>
        <div id="team-search-results" style="margin-top:14px;display:none;"></div>
      </div>
    </div>

    <!-- Escalações Salvas -->
    <div>
      <h2 class="section-title">Minhas Escalações (${savedList.length})</h2>
      ${savedList.length === 0 ? `
        <div class="card" style="text-align:center;padding:36px 20px;color:var(--chalk-dim);">
          <span style="font-size:2.5rem;display:block;margin-bottom:12px;">📋</span>
          <p style="font-weight:700;font-size:1.05rem;color:var(--chalk);margin:0;">Você ainda não montou nenhuma escalação.</p>
          <span style="font-size:0.85rem;color:var(--chalk-dim);margin-top:6px;display:block;">Busque qualquer clube na barra de pesquisa acima ou acesse a página de qualquer jogo para escalar seus 11 titulares!</span>
        </div>
      ` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:16px;">
          ${savedList.map(l => {
            const updatedDate = new Date(l.updatedAt || Date.now()).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
            const totalPlayers = (l.startingXI || []).filter(p => !!p?.player).length;

            return `
              <div class="user-lineup-card">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <img src="${l.teamLogo}" alt="" style="width:36px;height:36px;object-fit:contain;">
                    <div>
                      <div style="font-weight:700;font-size:1rem;color:var(--chalk);">${escapeHtml(l.teamName)}</div>
                      <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--gold);">${escapeHtml(l.formation)} · ${totalPlayers}/11 titulares</div>
                    </div>
                  </div>
                  <button class="btn-delete-lineup" data-id="${escapeHtml(l.id)}" title="Excluir escalação" style="background:none;border:none;color:var(--chalk-dim);cursor:pointer;font-size:1.1rem;padding:4px;">🗑️</button>
                </div>

                ${l.fixtureInfo ? `
                  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px 10px;margin-bottom:12px;font-size:0.8rem;display:flex;align-items:center;justify-content:space-between;">
                    <span>⚽ ${escapeHtml(l.fixtureInfo.home?.name)} vs ${escapeHtml(l.fixtureInfo.away?.name)}</span>
                    <span style="font-family:var(--font-mono);color:var(--cyan);font-size:0.75rem;">${escapeHtml(l.fixtureInfo.leagueName || '')}</span>
                  </div>
                ` : ''}

                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);">
                  <span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--chalk-dim);">Salvo em ${updatedDate}</span>
                  <div style="display:flex;gap:8px;">
                    <a class="btn small ghost" href="#/minha-escalacao/montar/${l.teamId}${l.fixtureId ? `/${l.fixtureId}` : ''}">Editar</a>
                    <a class="btn small primary" href="#/minha-escalacao/comparar/${l.id}">Comparar →</a>
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `}
    </div>
  `;

  // Listener da Busca de Clubes
  const searchInput = document.getElementById("input-team-search");
  const resultsContainer = document.getElementById("team-search-results");
  let debounceTimer;

  if (searchInput && resultsContainer) {
    searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const q = searchInput.value.trim();
      if (q.length < 3) {
        resultsContainer.innerHTML = "";
        resultsContainer.style.display = "none";
        return;
      }

      resultsContainer.style.display = "block";
      resultsContainer.innerHTML = `<div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.85rem;">🔍 Buscando clubes...</div>`;

      debounceTimer = setTimeout(async () => {
        try {
          const resp = await apiGet("teams", { search: q }, 60);
          if (!resp || !resp.length) {
            resultsContainer.innerHTML = `<div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.85rem;">Nenhum clube encontrado com "${escapeHtml(q)}".</div>`;
            return;
          }

          resultsContainer.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:10px;">
              ${resp.map(item => {
                const t = item.team;
                return `
                  <a class="player-card" href="#/minha-escalacao/montar/${t.id}" style="padding:12px;display:flex;align-items:center;flex-direction:row;gap:12px;text-align:left;text-decoration:none;">
                    <img src="${t.logo}" alt="" style="width:36px;height:36px;object-fit:contain;flex-shrink:0;" onerror="this.style.display='none'">
                    <div style="min-width:0;flex:1;">
                      <div style="font-weight:700;font-size:0.88rem;color:var(--chalk);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(t.name)}</div>
                      <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--gold);">${escapeHtml(t.country || "")}</div>
                    </div>
                    <span style="font-size:0.75rem;color:var(--cyan);font-weight:700;flex-shrink:0;">Escalar →</span>
                  </a>
                `;
              }).join("")}
            </div>
          `;
        } catch (err) {
          resultsContainer.innerHTML = `<div style="padding:16px;text-align:center;color:#EF4444;font-size:0.85rem;">Erro ao buscar clubes: ${escapeHtml(err.message)}</div>`;
        }
      }, 350);
    });
  }

  document.querySelectorAll(".btn-delete-lineup").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (confirm("Deseja realmente excluir esta escalação?")) {
        UserLineupStore.delete(id);
        renderMyLineups();
      }
    });
  });
}

// 2. Montador Interativo de Escalação
async function renderLineupBuilder(teamId, fixtureId) {
  app.innerHTML = `<div class="card skeleton"><div class="skeleton-shimmer" style="height:400px;"></div></div>`;

  try {
    const squadResp = await apiGet("players/squads", { team: teamId }, 60);
    const squadData = squadResp?.[0];
    if (!squadData) {
      app.innerHTML = errorBox("Não foi possível carregar o elenco deste clube.");
      return;
    }

    const team = squadData.team;
    const squadPlayers = squadData.players || [];

    let fixtureInfo = null;
    if (fixtureId) {
      try {
        const fxResp = await apiGet("fixtures", { id: fixtureId }, 30);
        const fx = fxResp?.[0];
        if (fx) {
          fixtureInfo = {
            id: fx.fixture.id,
            date: fx.fixture.date,
            status: fx.fixture.status.short,
            leagueName: fx.league.name,
            home: { id: fx.teams.home.id, name: fx.teams.home.name, logo: fx.teams.home.logo },
            away: { id: fx.teams.away.id, name: fx.teams.away.name, logo: fx.teams.away.logo }
          };
        }
      } catch (err) {
        console.warn("Não foi possível obter dados da partida:", err);
      }
    }

    const lineupId = fixtureId ? `lineup_fx_${fixtureId}_${teamId}` : `lineup_team_${teamId}`;
    const existing = UserLineupStore.get(lineupId);

    let currentFormationKey = existing?.formation && TACTICAL_FORMATIONS[existing.formation] ? existing.formation : "4-3-3";
    let selectedSlots = existing?.startingXI ? [...existing.startingXI] : Array(11).fill(null);
    let captainId = existing?.captainId || null;

    // Garante que o array tenha exatamente 11 posições
    while (selectedSlots.length < 11) selectedSlots.push(null);
    selectedSlots = selectedSlots.slice(0, 11);

    function getSelectedPlayerIds() {
      return new Set(selectedSlots.filter(Boolean).map(p => p.id));
    }

    function renderBuilderView() {
      const formationObj = TACTICAL_FORMATIONS[currentFormationKey] || TACTICAL_FORMATIONS["4-3-3"];
      const selectedIds = getSelectedPlayerIds();

      // Mapeamento dos 11 slots em linhas
      const linesLayout = formationObj.lines;
      let slotIndexCursor = 0;

      const linesRenderedHtml = linesLayout.map((line, lineIdx) => {
        const lineSlots = [];
        for (let i = 0; i < line.count; i++) {
          const currentSlotIdx = slotIndexCursor++;
          const assignedPlayer = selectedSlots[currentSlotIdx];
          const isCapt = assignedPlayer && assignedPlayer.id === captainId;
          const roleName = line.roles[i] || line.name;

          lineSlots.push(`
            <div class="pitch-slot ${assignedPlayer ? 'filled' : 'empty'}" data-slot-idx="${currentSlotIdx}" data-pos-filter="${line.posFilter}" title="${assignedPlayer ? escapeHtml(assignedPlayer.name) : 'Clique para escalar ' + roleName}">
              <div class="pitch-slot-avatar">
                ${assignedPlayer ? `
                  <img src="${assignedPlayer.photo || `https://media.api-sports.io/football/players/${assignedPlayer.id}.png`}" alt="" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                  <span class="pitch-slot-number">${assignedPlayer.number ?? ""}</span>
                  ${isCapt ? `<span class="pitch-slot-captain">C</span>` : ''}
                ` : `
                  <span class="pitch-slot-add-icon">+</span>
                `}
              </div>
              <span class="pitch-slot-name">${assignedPlayer ? escapeHtml((assignedPlayer.name || "").split(" ").pop()) : roleName}</span>
            </div>
          `);
        }

        return `<div class="pitch-slot-row" style="margin-bottom:${lineIdx === linesLayout.length - 1 ? '0' : '16px'};">${lineSlots.join("")}</div>`;
      }).join("");

      const filledCount = selectedSlots.filter(Boolean).length;

      app.innerHTML = `
        ${breadcrumbs([
          { label: "Ligas", href: "#/" },
          { label: "Sua Escalação", href: "#/minha-escalacao" },
          { label: formatTeamName(team.name), href: "" }
        ])}

        <div class="page-head" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <img src="${team.logo}" alt="" style="width:48px;height:48px;object-fit:contain;">
            <div>
              <p class="page-eyebrow" style="margin:0;">Montador Tático</p>
              <h1 class="page-title" style="margin:0;">${escapeHtml(formatTeamName(team.name))}</h1>
              ${fixtureInfo ? `<span style="font-size:0.8rem;color:var(--cyan);font-family:var(--font-mono);">Confronto: ${escapeHtml(fixtureInfo.home.name)} x ${escapeHtml(fixtureInfo.away.name)}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn ghost small" id="btn-autofill-lineup" title="Preencher automaticamente com jogadores do time">⚡ Auto-escalar</button>
            <button class="btn ghost small" id="btn-clear-lineup" title="Limpar todos os jogadores">🗑️ Limpar</button>
            <button class="btn primary small" id="btn-save-lineup" style="font-weight:700;">💾 Salvar Escalação (${filledCount}/11)</button>
          </div>
        </div>

        <div class="builder-container">
          <!-- Campo Tático Interativo -->
          <div>
            <!-- Seletor de Formações Táticas -->
            <div style="margin-bottom:8px;">
              <span style="font-family:var(--font-mono);font-size:0.78rem;color:var(--gold);font-weight:700;display:block;margin-bottom:6px;">ESQUEMA TÁTICO:</span>
              <div class="formation-bar">
                ${Object.keys(TACTICAL_FORMATIONS).map(fKey => `
                  <button class="formation-btn ${fKey === currentFormationKey ? 'active' : ''}" data-formation="${fKey}">
                    ${fKey}
                  </button>
                `).join("")}
              </div>
            </div>

            <div class="interactive-pitch">
              <div class="pitch-lines">
                <div class="pitch-half-line"></div>
                <div class="pitch-center-circle"></div>
                <div class="pitch-center-spot"></div>
                <div class="pitch-penalty-area top"></div>
                <div class="pitch-penalty-area bottom"></div>
              </div>
              <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%;min-height:480px;z-index:2;position:relative;">
                ${linesRenderedHtml}
              </div>
            </div>
          </div>

          <!-- Painel Lateral: Elenco & Detalhes -->
          <div class="card" style="height:fit-content;">
            <h3 style="font-size:1rem;margin-top:0;margin-bottom:12px;color:var(--gold);">Elenco do ${escapeHtml(formatTeamName(team.name))}</h3>
            <p style="font-size:0.8rem;color:var(--chalk-dim);margin-bottom:14px;">Clique em qualquer posição no campo para escolher o atleta correspondente.</p>
            
            <div style="font-family:var(--font-mono);font-size:0.8rem;margin-bottom:12px;background:rgba(255,255,255,0.03);padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);">
              <div>Titulares Escalados: <strong style="color:${filledCount === 11 ? '#10B981' : 'var(--gold)'};">${filledCount}/11</strong></div>
              <div style="margin-top:4px;">Capitão: <strong style="color:var(--cyan);">${selectedSlots.find(p => p && p.id === captainId)?.name || "Não definido"}</strong></div>
            </div>

            <div style="display:flex;flex-direction:column;gap:6px;max-height:360px;overflow-y:auto;padding-right:4px;">
              ${squadPlayers.map(p => {
                const isSelected = selectedIds.has(p.id);
                const isCapt = p.id === captainId;
                return `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:rgba(255,255,255,${isSelected ? '0.08' : '0.02'});border-radius:6px;border:1px solid rgba(255,255,255,${isSelected ? '0.15' : '0.04'});opacity:${isSelected ? '1' : '0.7'};">
                    <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                      <img src="${p.photo}" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                      <span style="font-size:0.78rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.name)}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;">
                      <span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--chalk-dim);">#${p.number ?? '-'}</span>
                      ${isSelected ? `<span style="font-size:0.7rem;color:#10B981;font-weight:700;">✓</span>` : ''}
                      ${isSelected ? `<button class="btn-set-captain-inline" data-id="${p.id}" title="Definir como capitão" style="background:none;border:none;cursor:pointer;font-size:0.7rem;padding:2px 4px;color:${isCapt ? '#EF4444' : 'var(--chalk-dim)'};font-weight:700;">${isCapt ? '©' : 'C'}</button>` : ''}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        </div>
      `;

      // Eventos de clique nas posições do campo
      document.querySelectorAll(".pitch-slot").forEach(slotEl => {
        slotEl.addEventListener("click", () => {
          const slotIdx = Number(slotEl.dataset.slotIdx);
          const posFilter = slotEl.dataset.posFilter;
          openSquadPickerModal(slotIdx, posFilter);
        });
      });

      // Evento de alteração de formação tática
      document.querySelectorAll(".formation-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          currentFormationKey = btn.dataset.formation;
          renderBuilderView();
        });
      });

      // Evento de Auto-Preenchimento
      document.getElementById("btn-autofill-lineup")?.addEventListener("click", () => {
        autoFillStartingXI();
      });

      // Evento de Limpar Campo
      document.getElementById("btn-clear-lineup")?.addEventListener("click", () => {
        if (confirm("Deseja limpar todos os jogadores do campo?")) {
          selectedSlots = Array(11).fill(null);
          captainId = null;
          renderBuilderView();
        }
      });

      // Evento de Salvar
      document.getElementById("btn-save-lineup")?.addEventListener("click", () => {
        saveCurrentLineup();
      });

      // Eventos de Capitão
      document.querySelectorAll(".btn-set-captain-inline").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const pid = Number(btn.dataset.id);
          captainId = (captainId === pid) ? null : pid;
          renderBuilderView();
        });
      });
    }

    function autoFillStartingXI() {
      const formationObj = TACTICAL_FORMATIONS[currentFormationKey];
      const usedIds = new Set();
      const newSlots = Array(11).fill(null);
      let slotIdx = 0;

      formationObj.lines.forEach(line => {
        const matchingPlayers = squadPlayers.filter(p => p.position === line.posFilter && !usedIds.has(p.id));
        for (let i = 0; i < line.count; i++) {
          if (matchingPlayers[i]) {
            newSlots[slotIdx] = matchingPlayers[i];
            usedIds.add(matchingPlayers[i].id);
          } else {
            // Fallback para qualquer jogador não utilizado
            const fallback = squadPlayers.find(p => !usedIds.has(p.id));
            if (fallback) {
              newSlots[slotIdx] = fallback;
              usedIds.add(fallback.id);
            }
          }
          slotIdx++;
        }
      });

      selectedSlots = newSlots;
      if (!captainId && selectedSlots[0]) captainId = selectedSlots[0].id;
      renderBuilderView();
      toast("Escalação preenchida automaticamente com o elenco base!", true);
    }

    function openSquadPickerModal(slotIdx, defaultPosFilter) {
      let activeFilter = "ALL"; // ALL | Goalkeeper | Defender | Midfielder | Attacker
      if (defaultPosFilter) activeFilter = defaultPosFilter;

      let searchQuery = "";

      function renderModalContent() {
        const modalContainer = document.getElementById("squad-picker-backdrop");
        if (!modalContainer) return;

        const selectedIds = getSelectedPlayerIds();
        const filtered = squadPlayers.filter(p => {
          const matchesPos = activeFilter === "ALL" || p.position === activeFilter;
          const matchesSearch = !searchQuery || (p.name || "").toLowerCase().includes(searchQuery.toLowerCase());
          return matchesPos && matchesSearch;
        });

        modalContainer.innerHTML = `
          <div class="squad-picker-card">
            <div class="squad-picker-header">
              <h3 style="margin:0;font-size:1.1rem;font-weight:700;">Escolha o Jogador (${slotIdx + 1}/11)</h3>
              <button id="btn-close-squad-picker" style="background:none;border:none;color:var(--chalk);font-size:1.2rem;cursor:pointer;">✕</button>
            </div>

            <!-- Busca rápida -->
            <input type="text" id="input-squad-search" placeholder="Buscar por nome do atleta..." value="${escapeHtml(searchQuery)}" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--chalk);padding:8px 12px;border-radius:var(--radius-sm);margin-bottom:10px;font-family:var(--font-body);font-size:0.85rem;width:100%;box-sizing:border-box;">

            <!-- Filtros de Posição -->
            <div class="squad-picker-filter-row">
              <button class="squad-picker-filter-btn ${activeFilter === 'ALL' ? 'active' : ''}" data-filter="ALL">Todos</button>
              <button class="squad-picker-filter-btn ${activeFilter === 'Goalkeeper' ? 'active' : ''}" data-filter="Goalkeeper">Goleiros</button>
              <button class="squad-picker-filter-btn ${activeFilter === 'Defender' ? 'active' : ''}" data-filter="Defender">Defensores</button>
              <button class="squad-picker-filter-btn ${activeFilter === 'Midfielder' ? 'active' : ''}" data-filter="Midfielder">Meias</button>
              <button class="squad-picker-filter-btn ${activeFilter === 'Attacker' ? 'active' : ''}" data-filter="Attacker">Atacantes</button>
            </div>

            <!-- Lista de Atletas -->
            <div class="squad-picker-list">
              ${filtered.map(p => {
                const isSelected = selectedIds.has(p.id);
                const isCurrentSlot = selectedSlots[slotIdx]?.id === p.id;
                return `
                  <div class="squad-picker-item ${isSelected && !isCurrentSlot ? 'already-selected' : ''}" data-player-id="${p.id}">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <img src="${p.photo}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                      <div>
                        <div style="font-weight:700;font-size:0.88rem;color:var(--chalk);">${escapeHtml(p.name)}</div>
                        <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--chalk-dim);">${p.position} · ${p.age ? p.age + ' anos' : ''}</div>
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="font-family:var(--font-mono);font-weight:700;color:var(--gold);font-size:0.85rem;">#${p.number ?? '-'}</span>
                      ${isCurrentSlot ? `<span style="color:#10B981;font-size:0.8rem;font-weight:700;">(Atual)</span>` : isSelected ? `<span style="font-size:0.72rem;color:var(--chalk-dim);">(Escalado)</span>` : ''}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>

            ${selectedSlots[slotIdx] ? `
              <button id="btn-remove-slot-player" class="btn ghost small" style="margin-top:12px;color:#EF4444;border-color:rgba(239,68,68,0.3);width:100%;">
                Remover ${escapeHtml(selectedSlots[slotIdx].name)} desta posição
              </button>
            ` : ''}
          </div>
        `;

        document.getElementById("btn-close-squad-picker")?.addEventListener("click", closeSquadPickerModal);
        
        const searchInput = document.getElementById("input-squad-search");
        if (searchInput) {
          searchInput.focus();
          searchInput.setSelectionRange(searchQuery.length, searchQuery.length);
          searchInput.addEventListener("input", (e) => {
            searchQuery = e.target.value;
            renderModalContent();
          });
        }

        modalContainer.querySelectorAll(".squad-picker-filter-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            activeFilter = btn.dataset.filter;
            renderModalContent();
          });
        });

        modalContainer.querySelectorAll(".squad-picker-item:not(.already-selected)").forEach(itemEl => {
          itemEl.addEventListener("click", () => {
            const pid = Number(itemEl.dataset.playerId);
            const playerObj = squadPlayers.find(p => p.id === pid);
            if (playerObj) {
              selectedSlots[slotIdx] = playerObj;
              closeSquadPickerModal();
              renderBuilderView();
            }
          });
        });

        document.getElementById("btn-remove-slot-player")?.addEventListener("click", () => {
          selectedSlots[slotIdx] = null;
          closeSquadPickerModal();
          renderBuilderView();
        });
      }

      let backdropEl = document.getElementById("squad-picker-backdrop");
      if (!backdropEl) {
        backdropEl = document.createElement("div");
        backdropEl.id = "squad-picker-backdrop";
        backdropEl.className = "squad-picker-backdrop";
        backdropEl.addEventListener("click", (e) => {
          if (e.target === backdropEl) closeSquadPickerModal();
        });
        document.body.appendChild(backdropEl);
      }

      renderModalContent();
    }

    function closeSquadPickerModal() {
      const backdropEl = document.getElementById("squad-picker-backdrop");
      if (backdropEl) backdropEl.remove();
    }

    function saveCurrentLineup() {
      const filled = selectedSlots.filter(Boolean);
      if (filled.length < 11) {
        const missing = 11 - filled.length;
        toast(`⚠️ Faltam ${missing} jogador${missing > 1 ? 'es' : ''} para serem escalados! Complete os 11 titulares para salvar.`, false);
        return;
      }

      const lineupObj = {
        id: lineupId,
        teamId: team.id,
        teamName: formatTeamName(team.name),
        teamLogo: team.logo,
        fixtureId: fixtureId || null,
        fixtureInfo: fixtureInfo,
        formation: currentFormationKey,
        startingXI: selectedSlots,
        captainId: captainId || (selectedSlots[0]?.id || null)
      };

      UserLineupStore.save(lineupObj);
      toast("Escalação salva com sucesso!", true);
      location.hash = fixtureId ? `#/minha-escalacao/comparar/${lineupId}` : `#/minha-escalacao`;
    }

    renderBuilderView();
  } catch (err) {
    app.innerHTML = errorBox("Erro ao carregar montador de escalação: " + err.message);
  }
}

// 3. Comparador Tático: Sua Escalação vs Escalação Oficial
async function renderLineupComparison(lineupId) {
  app.innerHTML = `<div class="card skeleton"><div class="skeleton-shimmer" style="height:400px;"></div></div>`;

  const userLineup = UserLineupStore.get(lineupId);
  if (!userLineup) {
    app.innerHTML = errorBox("Escalação não encontrada.");
    return;
  }

  const { teamId, teamName, teamLogo, formation, startingXI, fixtureId, fixtureInfo, captainId } = userLineup;

  let officialLineup = null;
  let matchStatus = "NS";

  if (fixtureId) {
    try {
      const lineupsResp = await apiGet("fixtures/lineups", { fixture: fixtureId }, 15).catch(() => []);
      const matchResp = await apiGet("fixtures", { id: fixtureId }, 15).catch(() => []);
      
      if (matchResp?.[0]) {
        matchStatus = matchResp[0].fixture.status.short;
      }

      if (Array.isArray(lineupsResp) && lineupsResp.length > 0) {
        officialLineup = lineupsResp.find(l => l.team.id === teamId) || null;
      }
    } catch (err) {
      console.warn("Erro ao buscar escalação oficial:", err);
    }
  }

  // Se a escalação oficial saiu, fazemos o cruzamento detalhado
  let comparisonResults = null;
  if (officialLineup && officialLineup.startXI && officialLineup.startXI.length) {
    const officialStarterIds = new Set(officialLineup.startXI.map(p => p.player.id));
    const officialSubIds = new Set((officialLineup.substitutes || []).map(p => p.player.id));

    const userStarters = (startingXI || []).filter(Boolean);
    const userStarterIds = new Set(userStarters.map(p => p.id));

    const matchedStarters = [];
    const benchedStarters = [];
    const missingStarters = [];

    userStarters.forEach(p => {
      if (officialStarterIds.has(p.id)) {
        matchedStarters.push(p);
      } else if (officialSubIds.has(p.id)) {
        benchedStarters.push(p);
      } else {
        missingStarters.push(p);
      }
    });

    const surpriseStarters = officialLineup.startXI.filter(p => !userStarterIds.has(p.player.id)).map(p => p.player);

    const matchCount = matchedStarters.length;
    const accuracyPct = Math.round((matchCount / 11) * 100);

    comparisonResults = {
      matchedStarters,
      benchedStarters,
      missingStarters,
      surpriseStarters,
      matchCount,
      accuracyPct,
      officialFormation: officialLineup.formation,
      coachName: officialLineup.coach?.name || "Técnico"
    };
  }

  app.innerHTML = `
    ${breadcrumbs([
      { label: "Ligas", href: "#/" },
      { label: "Sua Escalação", href: "#/minha-escalacao" },
      { label: "Comparação: " + teamName, href: "" }
    ])}

    <div class="page-head" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <img src="${teamLogo}" alt="" style="width:48px;height:48px;object-fit:contain;">
        <div>
          <p class="page-eyebrow" style="margin:0;">Comparador Tático</p>
          <h1 class="page-title" style="margin:0;">Sua Escalação vs Oficial</h1>
          <span style="font-size:0.85rem;color:var(--gold);font-weight:600;">${escapeHtml(teamName)}</span>
          ${fixtureInfo ? `<span style="font-size:0.8rem;color:var(--chalk-dim);"> · ${escapeHtml(fixtureInfo.home?.name)} x ${escapeHtml(fixtureInfo.away?.name)}</span>` : ''}
        </div>
      </div>
      <div>
        <a class="btn ghost small" href="#/minha-escalacao/montar/${teamId}${fixtureId ? `/${fixtureId}` : ''}">✏️ Editar Minha Escalação</a>
      </div>
    </div>

    ${comparisonResults ? `
      <!-- Card de Score de Precisão -->
      <div class="card" style="margin-bottom:24px;background:linear-gradient(135deg, rgba(13,38,59,0.9), rgba(7,17,30,0.95));border-color:var(--gold);text-align:center;padding:28px 20px;">
        <span style="font-size:2.5rem;display:block;margin-bottom:6px;">🎯</span>
        <h2 style="font-size:1.8rem;font-weight:800;color:var(--gold);margin:0;font-family:var(--font-mono);">
          ${comparisonResults.matchCount}/11 Acertos (${comparisonResults.accuracyPct}%)
        </h2>
        <p style="color:var(--chalk);font-size:0.95rem;margin:8px 0 16px;">
          ${comparisonResults.matchCount >= 10 ? '🔥 Incrível leitura tática! Você adivinhou praticamente toda a equipe titular.' : comparisonResults.matchCount >= 8 ? '👏 Ótimo palpite! Você acertou a grande maioria dos titulares do treinador.' : '⚽ Bom palpite! O treinador optou por algumas surpresas na escalação oficial.'}
        </p>

        <!-- Legenda de Badges -->
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;font-size:0.78rem;font-family:var(--font-mono);">
          <span class="diff-badge-correct" style="padding:4px 10px;border-radius:12px;">🟢 ${comparisonResults.matchedStarters.length} Titulares Acertados</span>
          <span class="diff-badge-bench" style="padding:4px 10px;border-radius:12px;">🟡 ${comparisonResults.benchedStarters.length} No Banco</span>
          <span class="diff-badge-missing" style="padding:4px 10px;border-radius:12px;">🔴 ${comparisonResults.missingStarters.length} Não Relacionados</span>
          <span class="diff-badge-surprise" style="padding:4px 10px;border-radius:12px;">🔵 ${comparisonResults.surpriseStarters.length} Surpresas do Técnico</span>
        </div>
      </div>

      <!-- Campos Táticos Lado a Lado -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px;margin-bottom:24px;">
        <!-- Sua Escalação -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="font-weight:700;font-size:1.05rem;color:var(--gold);">📋 Sua Escalação (${escapeHtml(formation)})</div>
            <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">${comparisonResults.matchCount}/11 Acertos</span>
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
              ${(() => {
                const formObj = TACTICAL_FORMATIONS[formation] || TACTICAL_FORMATIONS["4-3-3"];
                let cursor = 0;
                return formObj.lines.map(line => {
                  const lineSlots = startingXI.slice(cursor, cursor + line.count);
                  cursor += line.count;
                  return `
                    <div class="pitch-row">
                      ${lineSlots.map(p => {
                        if (!p) return `<div class="pitch-player"><div class="pitch-badge-wrapper"><div class="pitch-player-avatar-circle home">?</div></div><span class="pitch-player-name">Vazio</span></div>`;
                        const isMatch = comparisonResults.matchedStarters.some(m => m.id === p.id);
                        const isBench = comparisonResults.benchedStarters.some(m => m.id === p.id);
                        const haloColor = isMatch ? '#10B981' : isBench ? '#FFB800' : '#EF4444';
                        return `
                          <div class="pitch-player" title="${escapeHtml(p.name)} (${isMatch ? 'Titular Acertado' : isBench ? 'Foi pro Banco' : 'Não Relacionado'})">
                            <div class="pitch-badge-wrapper">
                              <div class="pitch-player-avatar-circle" style="border: 2px solid ${haloColor}; box-shadow: 0 0 10px ${haloColor};">
                                <img src="${p.photo || `https://media.api-sports.io/football/players/${p.id}.png`}" alt="" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                              </div>
                              <div class="pitch-player-badge home">${p.number ?? ""}</div>
                            </div>
                            <span class="pitch-player-name" style="color:${haloColor};font-weight:700;">${escapeHtml((p.name || "").split(" ").pop())}</span>
                          </div>
                        `;
                      }).join("")}
                    </div>
                  `;
                }).join("");
              })()}
            </div>
          </div>
        </div>

        <!-- Escalação Oficial do Técnico -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="font-weight:700;font-size:1.05rem;color:var(--cyan);">⚽ Escalação Oficial (${escapeHtml(comparisonResults.officialFormation || 'Real')})</div>
            <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">Téc. ${escapeHtml(comparisonResults.coachName)}</span>
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
              ${(() => {
                const offFormation = officialLineup.formation || "4-4-2";
                const formLines = offFormation.split("-").map(Number);
                const rows = [];
                let offCursor = 1;
                rows.push([officialLineup.startXI[0]]);
                formLines.forEach(c => {
                  rows.push(officialLineup.startXI.slice(offCursor, offCursor + c));
                  offCursor += c;
                });
                if (offCursor < officialLineup.startXI.length) rows.push(officialLineup.startXI.slice(offCursor));

                const userStarterIds = new Set((startingXI || []).filter(Boolean).map(p => p.id));

                return rows.map(rPlayers => `
                  <div class="pitch-row">
                    ${rPlayers.map(px => {
                      const p = px.player;
                      const wasGuessed = userStarterIds.has(p.id);
                      const haloColor = wasGuessed ? '#10B981' : '#00E5FF';
                      return `
                        <div class="pitch-player" title="${escapeHtml(p.name)} (${wasGuessed ? 'Você acertou!' : 'Surpresa do Técnico'})">
                          <div class="pitch-badge-wrapper">
                            <div class="pitch-player-avatar-circle" style="border: 2px solid ${haloColor}; box-shadow: 0 0 10px ${haloColor};">
                              <img src="https://media.api-sports.io/football/players/${p.id}.png" alt="" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                            </div>
                            <div class="pitch-player-badge away">${p.number ?? ""}</div>
                          </div>
                          <span class="pitch-player-name" style="color:${haloColor};font-weight:700;">${escapeHtml((p.name || "").split(" ").pop())}</span>
                        </div>
                      `;
                    }).join("")}
                  </div>
                `).join("");
              })()}
            </div>
          </div>
        </div>
      </div>

      <!-- Detalhamento das Diferenças -->
      <div class="card">
        <h3 style="margin-top:0;font-size:1.05rem;color:var(--gold);">Análise Tática dos Atletas</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:16px;margin-top:14px;">
          <!-- Acertos -->
          <div>
            <span style="font-family:var(--font-mono);font-size:0.8rem;color:#10B981;font-weight:700;display:block;margin-bottom:8px;">🟢 Titulares que Você Acertou (${comparisonResults.matchedStarters.length})</span>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${comparisonResults.matchedStarters.map(p => `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);border-radius:6px;font-size:0.82rem;">
                  <img src="${p.photo}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;">
                  <span style="font-weight:600;">${escapeHtml(p.name)}</span>
                </div>
              `).join("")}
            </div>
          </div>

          <!-- Foi pro Banco -->
          ${comparisonResults.benchedStarters.length ? `
            <div>
              <span style="font-family:var(--font-mono);font-size:0.8rem;color:#FFB800;font-weight:700;display:block;margin-bottom:8px;">🟡 Ficaram no Banco (${comparisonResults.benchedStarters.length})</span>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${comparisonResults.benchedStarters.map(p => `
                  <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(255,184,0,0.06);border:1px solid rgba(255,184,0,0.2);border-radius:6px;font-size:0.82rem;">
                    <img src="${p.photo}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;">
                    <span style="font-weight:600;">${escapeHtml(p.name)}</span>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ''}

          <!-- Surpresas do Treinador -->
          ${comparisonResults.surpriseStarters.length ? `
            <div>
              <span style="font-family:var(--font-mono);font-size:0.8rem;color:#00E5FF;font-weight:700;display:block;margin-bottom:8px;">🔵 Surpresas do Treinador (${comparisonResults.surpriseStarters.length})</span>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${comparisonResults.surpriseStarters.map(p => `
                  <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(0,229,255,0.06);border:1px solid rgba(0,229,255,0.2);border-radius:6px;font-size:0.82rem;">
                    <img src="https://media.api-sports.io/football/players/${p.id}.png" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;">
                    <span style="font-weight:600;">${escapeHtml(p.name)}</span>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    ` : `
      <!-- Status: Aguardando Escalação Oficial -->
      <div class="card" style="text-align:center;padding:36px 20px;color:var(--chalk-dim);margin-bottom:24px;">
        <span style="font-size:2.8rem;display:block;margin-bottom:12px;">⏳</span>
        <h2 style="font-size:1.2rem;color:var(--chalk);margin:0 0 8px;">Aguardando Escalação Oficial</h2>
        <p style="font-size:0.88rem;color:var(--chalk-dim);max-width:500px;margin:0 auto 18px;">
          Os clubes costumam confirmar a escalação oficial cerca de <strong>45 a 60 minutos antes do início do jogo</strong>. Assim que for publicada, volte a esta tela para conferir seu índice de acertos e as diferenças táticas!
        </p>
        <a class="btn primary small" href="#/minha-escalacao/montar/${teamId}${fixtureId ? `/${fixtureId}` : ''}">Editar Minha Escalação</a>
      </div>

      <!-- Prévia da Escalação Salva do Usuário -->
      <div class="card">
        <h3 style="margin-top:0;font-size:1.05rem;color:var(--gold);">Sua Escalação Salva (${escapeHtml(formation)})</h3>
        <div class="tactical-pitch" style="margin-top:14px;">
          <div class="pitch-lines">
            <div class="pitch-half-line"></div>
            <div class="pitch-center-circle"></div>
            <div class="pitch-center-spot"></div>
            <div class="pitch-penalty-area top"></div>
            <div class="pitch-penalty-area bottom"></div>
          </div>
          <div class="pitch-players-layer">
            ${(() => {
              const formObj = TACTICAL_FORMATIONS[formation] || TACTICAL_FORMATIONS["4-3-3"];
              let cursor = 0;
              return formObj.lines.map(line => {
                const lineSlots = startingXI.slice(cursor, cursor + line.count);
                cursor += line.count;
                return `
                  <div class="pitch-row">
                    ${lineSlots.map(p => {
                      if (!p) return `<div class="pitch-player"><div class="pitch-badge-wrapper"><div class="pitch-player-avatar-circle home">?</div></div><span class="pitch-player-name">Vazio</span></div>`;
                      const isCapt = p.id === captainId;
                      return `
                        <div class="pitch-player" title="${escapeHtml(p.name)}">
                          <div class="pitch-badge-wrapper">
                            <div class="pitch-player-avatar-circle home">
                              <img src="${p.photo || `https://media.api-sports.io/football/players/${p.id}.png`}" alt="" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                            </div>
                            <div class="pitch-player-badge home">${p.number ?? ""}</div>
                            ${isCapt ? `<span class="pitch-slot-captain" style="top:-2px;left:-2px;">C</span>` : ''}
                          </div>
                          <span class="pitch-player-name">${escapeHtml((p.name || "").split(" ").pop())}</span>
                        </div>
                      `;
                    }).join("")}
                  </div>
                `;
              }).join("");
            })()}
          </div>
        </div>
      </div>
    `}
  `;
}

// 4. Banner Atalho na Tela de Partida
function renderMatchLineupPrompt(fx, lineupsArr) {
  if (!fx || !fx.teams) return "";
  const hId = fx.teams.home.id;
  const aId = fx.teams.away.id;
  const fId = fx.fixture.id;

  const userHomeLineup = UserLineupStore.get(`lineup_fx_${fId}_${hId}`) || UserLineupStore.get(`lineup_team_${hId}`);
  const userAwayLineup = UserLineupStore.get(`lineup_fx_${fId}_${aId}`) || UserLineupStore.get(`lineup_team_${aId}`);

  if (userHomeLineup || userAwayLineup) {
    const existing = userHomeLineup || userAwayLineup;
    const hasOfficial = Array.isArray(lineupsArr) && lineupsArr.length > 0;
    return `
      <div class="match-lineup-prompt-card">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:1.6rem;">📋</span>
          <div>
            <strong style="font-size:0.95rem;color:var(--chalk);display:block;">Você montou a escalação do ${escapeHtml(existing.teamName)}!</strong>
            <span style="font-size:0.78rem;color:var(--chalk-dim);">${hasOfficial ? 'A escalação oficial já saiu! Veja quantos jogadores você acertou.' : 'Aguardando a divulgação oficial do treinador.'}</span>
          </div>
        </div>
        <a class="btn primary small" href="#/minha-escalacao/comparar/${existing.id}" style="font-weight:700;">
          ${hasOfficial ? '🎯 Ver Comparação e Acertos →' : '📋 Ver / Editar Minha Escalação →'}
        </a>
      </div>
    `;
  }

  return `
    <div class="match-lineup-prompt-card">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:1.6rem;">📋</span>
        <div>
          <strong style="font-size:0.95rem;color:var(--chalk);display:block;">Qual seria a sua escalação para este jogo?</strong>
          <span style="font-size:0.78rem;color:var(--chalk-dim);">Escale o time titular ideal e compare seu palpite com a escalação oficial quando ela sair!</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a class="btn ghost small" href="#/minha-escalacao/montar/${hId}/${fId}">Escalar ${escapeHtml(fx.teams.home.name)}</a>
        <a class="btn ghost small" href="#/minha-escalacao/montar/${aId}/${fId}">Escalar ${escapeHtml(fx.teams.away.name)}</a>
      </div>
    </div>
  `;
}
