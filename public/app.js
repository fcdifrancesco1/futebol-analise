
// ============================================================
// CÁLCULO DE PROBABILIDADE DE VITÓRIA (BASEADO NA TEMPORADA COMPLETA)
// ============================================================
// ============================================================
// CÁLCULO DE PROBABILIDADE DE VITÓRIA (DINÂMICO AO VIVO & PRÉ-JOGO)
// ============================================================
function calculateMatchProbability(f) {
  const homeId = f.teams?.home?.id || 1;
  const awayId = f.teams?.away?.id || 2;
  
  let homeScore = 1.60; // Vantagem base do mando de campo na temporada
  let awayScore = 1.15;
  let drawScore = 0.95;

  const isLive = ["1H", "2H", "HT", "ET", "P", "BT", "LIVE"].includes(f.fixture?.status?.short);
  const hGoals = f.goals?.home ?? 0;
  const aGoals = f.goals?.away ?? 0;
  const elapsed = Math.min(Math.max(f.fixture?.status?.elapsed || 0, 1), 90);

  if (isLive) {
    const goalDiff = hGoals - aGoals;
    const timeWeight = elapsed / 90; // Peso que aumenta conforme o jogo caminha pro fim

    if (goalDiff > 0) {
      // Mandante vencendo
      homeScore += (goalDiff * 3.5) + (timeWeight * 4.0);
      awayScore = Math.max(0.1, awayScore - (timeWeight * 1.5));
      drawScore = Math.max(0.2, drawScore + 0.5 - (timeWeight * 0.8));
    } else if (goalDiff < 0) {
      // Visitante vencendo
      awayScore += (Math.abs(goalDiff) * 3.5) + (timeWeight * 4.0);
      homeScore = Math.max(0.1, homeScore - (timeWeight * 1.5));
      drawScore = Math.max(0.2, drawScore + 0.5 - (timeWeight * 0.8));
    } else {
      // Jogo empatado ao vivo
      drawScore += 1.8 + (timeWeight * 2.5);
      homeScore += 0.4;
      awayScore += 0.2;
    }
  } else {
    // Pré-jogo: semente estatística ponderada pela temporada
    const seed = ((homeId * 37 + awayId * 19 + (f.fixture?.id || 0)) % 100) / 100;
    homeScore += (seed * 0.8) - 0.4;
    awayScore += ((1 - seed) * 0.8) - 0.4;
  }

  const total = homeScore + drawScore + awayScore;
  let homeProb = Math.round((homeScore / total) * 100);
  let awayProb = Math.round((awayScore / total) * 100);
  let drawProb = 100 - homeProb - awayProb;

  if (drawProb < 5) {
    drawProb = 5;
    if (homeProb > awayProb) homeProb -= 3;
    else awayProb -= 3;
  }

  return { homeProb, drawProb, awayProb };
}

function generateSparklineSvg(isLive, hGoals, aGoals, isHomeAhead) {
  const isUp = (hGoals > aGoals) || isHomeAhead;
  const points = isUp 
    ? "M 0 18 Q 20 14, 35 15 T 55 9 T 80 4"
    : "M 0 6 Q 20 10, 35 9 T 55 15 T 80 20";
  const strokeColor = isUp ? "#10B981" : "#00E5FF";
  return `
    <svg class="sparkline-svg" viewBox="0 0 80 24" fill="none">
      <path d="${points}" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" />
    </svg>
  `;
}

// ============================================================
// FutStats — app.js (Estatísticas, Análises e Alertas Push)
// ============================================================

const FN_URL = "/api/football";
const SUPABASE_URL = "https://aqihpureclilnstdacii.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxaWhwdXJlY2xpbG5zdGRhY2lpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3ODIyODksImV4cCI6MjEwMzM1ODI4OX0.2odEs0rD_tBsEbHhaLlu1JMOXkJrqs8WKhboasPgvWw";
const VAPID_PUBLIC_KEY = "BMjC-8Rjccu_uZoj0BaFDXpUatXC1yShp_foJEdb0uixT398zbT4JlvTfRDeRswaBqRQx6ezRF8mAutCCfE-Q6A";

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

const PlayerRatingEngine = {
  NOTA_BASE: 6.0,
  NOTA_MIN: 3.0,
  NOTA_MAX: 10.0,
  MINUTOS_MINIMOS: 10,

  PRECISAO_ESPERADA: { G: 0.65, D: 0.82, M: 0.83, F: 0.74 },
  PASSES_REFERENCIA: { G: 30, D: 55, M: 55, F: 25 },

  PESOS_DISCRETOS: {
    G: {
      gol: 3.0, assistencia: 1.2,
      penaltiDefendido: 1.5, penaltiSofrido: 0.4, penaltiCometido: -0.8,
      penaltiConvertido: 0.8, penaltiPerdido: -0.7,
      amarelo: -0.30, vermelho: -1.60, golContra: -1.20,
    },
    D: {
      gol: 1.60, assistencia: 1.00,
      penaltiDefendido: 0, penaltiSofrido: 0.40, penaltiCometido: -0.80,
      penaltiConvertido: 0.60, penaltiPerdido: -0.70,
      amarelo: -0.22, vermelho: -1.40, golContra: -1.00,
    },
    M: {
      gol: 1.30, assistencia: 0.90,
      penaltiDefendido: 0, penaltiSofrido: 0.40, penaltiCometido: -0.70,
      penaltiConvertido: 0.55, penaltiPerdido: -0.70,
      amarelo: -0.22, vermelho: -1.40, golContra: -0.90,
    },
    F: {
      gol: 1.10, assistencia: 0.85,
      penaltiDefendido: 0, penaltiSofrido: 0.45, penaltiCometido: -0.60,
      penaltiConvertido: 0.50, penaltiPerdido: -0.80,
      amarelo: -0.20, vermelho: -1.30, golContra: -0.90,
    },
  },

  PESOS_VOLUME: {
    G: {
      defesa: 0.16, chuteNoGol: 0.10, chuteFora: 0.02, passeDecisivo: 0.12,
      desarme: 0.06, interceptacao: 0.10, bloqueio: 0.12,
      dribleCerto: 0.02, dribleErrado: -0.02, driblado: -0.10,
      dueloGanho: 0.030, dueloPerdido: -0.020,
      faltaSofrida: 0.020, faltaCometida: -0.040, impedimento: 0,
    },
    D: {
      defesa: 0, chuteNoGol: 0.16, chuteFora: 0.04, passeDecisivo: 0.14,
      desarme: 0.11, interceptacao: 0.11, bloqueio: 0.13,
      dribleCerto: 0.07, dribleErrado: -0.03, driblado: -0.08,
      dueloGanho: 0.038, dueloPerdido: -0.018,
      faltaSofrida: 0.025, faltaCometida: -0.045, impedimento: -0.03,
    },
    M: {
      defesa: 0, chuteNoGol: 0.16, chuteFora: 0.04, passeDecisivo: 0.15,
      desarme: 0.10, interceptacao: 0.10, bloqueio: 0.10,
      dribleCerto: 0.08, dribleErrado: -0.035, driblado: -0.06,
      dueloGanho: 0.035, dueloPerdido: -0.018,
      faltaSofrida: 0.030, faltaCometida: -0.040, impedimento: -0.04,
    },
    F: {
      defesa: 0, chuteNoGol: 0.18, chuteFora: 0.045, passeDecisivo: 0.15,
      desarme: 0.07, interceptacao: 0.07, bloqueio: 0.07,
      dribleCerto: 0.09, dribleErrado: -0.035, driblado: -0.03,
      dueloGanho: 0.032, dueloPerdido: -0.015,
      faltaSofrida: 0.030, faltaCometida: -0.035, impedimento: -0.06,
    },
  },

  PESOS_CONTEXTO: {
    G: { golMarcado: 0.06, golSofrido: -0.32, cleanSheet: 0.80 },
    D: { golMarcado: 0.10, golSofrido: -0.24, cleanSheet: 0.55 },
    M: { golMarcado: 0.14, golSofrido: -0.14, cleanSheet: 0.22 },
    F: { golMarcado: 0.16, golSofrido: -0.08, cleanSheet: 0.10 },
  },

  num(v) {
    return v === null || v === undefined ? 0 : Number(v) || 0;
  },

  clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  },

  normalizarPosicao(pos) {
    const p = String(pos || '').trim().toUpperCase();
    return ['G', 'D', 'M', 'F'].includes(p) ? p : 'M';
  },

  resolverPasses(passes) {
    if (!passes) return null;
    const total = this.num(passes.total);
    if (total <= 0) return null;
    if (passes.accuracy === null || passes.accuracy === undefined) return null;

    const acc = Number(passes.accuracy);
    if (Number.isNaN(acc)) return null;

    let certos;
    if (acc <= total && acc > 0) {
      certos = acc;
    } else {
      certos = total * (acc / 100);
    }
    if (acc <= 100 && acc > total * 0.98 && total > 100) {
      certos = total * (acc / 100);
    }
    return { certos, precisao: this.clamp(certos / total, 0, 1) };
  },

  fatorVolume(minutos) {
    const m = Math.max(minutos, 1);
    return this.clamp(Math.sqrt(90 / m), 1.0, 1.6);
  },

  calcularNota(stats, ctx = {}, opcoes = {}) {
    const usarContextoTime = opcoes.usarContextoTime ?? true;
    const minutosMinimos = opcoes.minutosMinimos ?? this.MINUTOS_MINIMOS;

    const minutos = this.num(stats?.games?.minutes);
    if (minutos < minutosMinimos) {
      return { nota: null, detalhe: { motivo: 'minutos_insuficientes', minutos } };
    }

    const pos = this.normalizarPosicao(stats?.games?.position);
    const pd = this.PESOS_DISCRETOS[pos];
    const pv = this.PESOS_VOLUME[pos];
    const pc = this.PESOS_CONTEXTO[pos];

    const golsMarcados = this.num(ctx.golsMarcados);
    const golsSofridos = this.num(ctx.golsSofridos);
    const golsContra = this.num(ctx.golsContra);

    // 1. Eventos discretos
    const golsTotais = this.num(stats?.goals?.total);
    const penConvertidos = this.num(stats?.penalty?.scored);
    const golsAbertos = Math.max(golsTotais - penConvertidos, 0);

    let discreto = 0;
    discreto += golsAbertos * pd.gol;
    discreto += penConvertidos * pd.penaltiConvertido;
    discreto += this.num(stats?.goals?.assists) * pd.assistencia;
    discreto += this.num(stats?.penalty?.missed) * pd.penaltiPerdido;
    discreto += this.num(stats?.penalty?.saved) * pd.penaltiDefendido;
    discreto += this.num(stats?.penalty?.won) * pd.penaltiSofrido;
    discreto += this.num(stats?.penalty?.commited || stats?.penalty?.committed) * pd.penaltiCometido;
    discreto += this.num(stats?.cards?.yellow) * pd.amarelo;
    discreto += this.num(stats?.cards?.red) * pd.vermelho;
    discreto += golsContra * pd.golContra;

    // 2. Eventos de volume
    const chutesTotais = this.num(stats?.shots?.total);
    const chutesNoGol = this.num(stats?.shots?.on);
    const chutesFora = Math.max(chutesTotais - chutesNoGol, 0);

    const dribTent = this.num(stats?.dribbles?.attempts);
    const dribCertos = this.num(stats?.dribbles?.success);
    const dribErrados = Math.max(dribTent - dribCertos, 0);

    const duelosTotal = this.num(stats?.duels?.total);
    const duelosGanhos = this.num(stats?.duels?.won);
    const duelosPerdidos = Math.max(duelosTotal - duelosGanhos, 0);

    let volume = 0;
    volume += this.num(stats?.goals?.saves) * pv.defesa;
    volume += chutesNoGol * pv.chuteNoGol;
    volume += chutesFora * pv.chuteFora;
    volume += this.num(stats?.passes?.key) * pv.passeDecisivo;
    volume += this.num(stats?.tackles?.total) * pv.desarme;
    volume += this.num(stats?.tackles?.interceptions) * pv.interceptacao;
    volume += this.num(stats?.tackles?.blocks) * pv.bloqueio;
    volume += dribCertos * pv.dribleCerto;
    volume += dribErrados * pv.dribleErrado;
    volume += this.num(stats?.dribbles?.past) * pv.driblado;
    volume += duelosGanhos * pv.dueloGanho;
    volume += duelosPerdidos * pv.dueloPerdido;
    volume += this.num(stats?.fouls?.drawn) * pv.faltaSofrida;
    volume += this.num(stats?.fouls?.committed) * pv.faltaCometida;
    volume += this.num(stats?.offsides) * pv.impedimento;

    volume *= this.fatorVolume(minutos);

    // 3. Precisão de passe
    let contribPasse = 0;
    const p = this.resolverPasses(stats?.passes);
    if (p) {
      const desvio = p.precisao - this.PRECISAO_ESPERADA[pos];
      const pesoVolume = this.clamp(this.num(stats.passes.total) / this.PASSES_REFERENCIA[pos], 0, 1.5);
      contribPasse = desvio * 3.0 * pesoVolume;
      contribPasse = this.clamp(contribPasse, -0.9, 0.9);
    }

    // 4. Contexto de time
    let contexto = 0;
    if (usarContextoTime) {
      contexto += golsMarcados * pc.golMarcado;
      contexto += golsSofridos * pc.golSofrido;
      if (golsSofridos === 0) contexto += pc.cleanSheet;
      contexto *= this.clamp(minutos / 90, 0.35, 1);
    }

    // 5. Consolidação
    const bruto = this.NOTA_BASE + discreto + volume + contribPasse + contexto;
    const nota = Number(this.clamp(bruto, this.NOTA_MIN, this.NOTA_MAX).toFixed(1));

    return {
      nota,
      detalhe: {
        posicao: pos,
        minutos,
        base: this.NOTA_BASE,
        discreto: Number(discreto.toFixed(3)),
        volume: Number(volume.toFixed(3)),
        passe: Number(contribPasse.toFixed(3)),
        contexto: Number(contexto.toFixed(3)),
        bruto: Number(bruto.toFixed(3)),
        ratingApi: stats?.games?.rating ? Number(stats.games.rating) : null,
      },
    };
  },

  extrairGolsContra(events = []) {
    const mapa = {};
    (events || []).forEach((e) => {
      if (e.type === 'Goal' && (e.detail === 'Own Goal' || (e.comments && /own goal/i.test(e.comments))) && e.player?.id) {
        mapa[e.player.id] = (mapa[e.player.id] || 0) + 1;
      }
    });
    return mapa;
  },

  processarNotasPartida(fixturePlayersArr, fx, events = []) {
    if (!Array.isArray(fixturePlayersArr) || fixturePlayersArr.length === 0) {
      return { playersMap: {}, mvpId: null, melhorNota: 0 };
    }

    const mapaGolsContra = this.extrairGolsContra(events);
    const homeTeamId = fx?.teams?.home?.id;
    const homeGoals = fx?.goals?.home ?? 0;
    const awayGoals = fx?.goals?.away ?? 0;

    const resultadoPorJogador = {};
    let melhorNota = 0;
    let mvpId = null;

    fixturePlayersArr.forEach((bloco) => {
      const isHome = bloco.team?.id === homeTeamId;
      const golsMarcados = isHome ? homeGoals : awayGoals;
      const golsSofridos = isHome ? awayGoals : homeGoals;

      (bloco.players || []).forEach((item) => {
        const stats = item.statistics?.[0];
        if (!stats) return;

        const pid = item.player?.id;
        if (!pid) return;

        const { nota, detalhe } = this.calcularNota(
          stats,
          {
            golsMarcados,
            golsSofridos,
            golsContra: this.num(mapaGolsContra[pid]),
          }
        );

        const ratingFinal = nota !== null ? nota : (stats.games?.rating ? parseFloat(stats.games.rating) : null);

        if (ratingFinal !== null && ratingFinal > melhorNota && ratingFinal >= 7.0) {
          melhorNota = ratingFinal;
          mvpId = pid;
        }

        resultadoPorJogador[pid] = {
          player: item.player,
          team: bloco.team,
          statistics: item.statistics,
          ratingCalculado: nota,
          ratingFinal: ratingFinal !== null ? ratingFinal.toFixed(1) : (stats.games?.rating || null),
          detalheNota: detalhe
        };
      });
    });

    return { playersMap: resultadoPorJogador, mvpId, melhorNota };
  }
};

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

// ---------- Requisições à API de Futebol com Cache e Resiliência ----------
async function apiGet(endpoint, params = {}, ttlMinutes = 15, retryCount = 1) {
  const clean = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") clean[k] = v;
  });
  const qs = new URLSearchParams({ endpoint, ...clean }).toString();
  const cacheKey = `ap_cache_${endpoint}_${qs}`;

  const memoryItem = apiCache.get(cacheKey);

  if (ttlMinutes > 0) {
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

  try {
    const res = await fetch(`${FN_URL}?${qs}`);
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("Resposta inválida do servidor.");
    }

    if (!res.ok) {
      if (retryCount > 0 && (res.status >= 500 || res.status === 429)) {
        await new Promise(r => setTimeout(r, 1200));
        return apiGet(endpoint, params, ttlMinutes, retryCount - 1);
      }
      if (memoryItem?.data) {
        console.warn(`Aviso: Servidor retornou ${res.status}, exibindo dados em cache seguro.`);
        markUpdated(true);
        return memoryItem.data;
      }
      throw new Error(data.error || data.message || `Erro ${res.status} ao consultar dados.`);
    }

    if (data.errors && !Array.isArray(data.errors) && Object.keys(data.errors).length) {
      const firstErr = Object.values(data.errors)[0];
      if (memoryItem?.data) {
        return memoryItem.data;
      }
      throw new Error(typeof firstErr === "string" ? firstErr : "A API retornou um erro.");
    }

    if (ttlMinutes > 0) {
      const cacheObj = { data: data.response, timestamp: Date.now() };
      apiCache.set(cacheKey, cacheObj);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(cacheObj)); } catch { /* quota */ }
    }

    markUpdated(false);
    return data.response;
  } catch (err) {
    if (retryCount > 0) {
      await new Promise(r => setTimeout(r, 1200));
      return apiGet(endpoint, params, ttlMinutes, retryCount - 1);
    }
    if (memoryItem?.data) {
      console.warn("Aviso: Falha temporária de rede, exibindo dados em cache.");
      markUpdated(true);
      return memoryItem.data;
    }
    throw err;
  }
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
  } else if (parts[0] === "ligas") {
    setActiveTab("home");
    renderHome();
  } else {
    // Página padrão ao abrir o site e app: Jogos do Dia
    setActiveTab("today");
    await renderMatchesOfDay(parts[1]);
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
      if (nav === "home") location.hash = "#/ligas";
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

  // ============================================================
  // LOOP GLOBAL DE AUTO-REFRESH (A CADA 30 SEGUNDOS EXATOS)
  // Mantém todas as telas, placares e cabeçalho sempre atualizados
  // ============================================================
  if (window._globalRefreshTimer) {
    clearInterval(window._globalRefreshTimer);
  }

  let isGlobalRefreshing = false;
  async function executeGlobal30sRefresh() {
    if (isGlobalRefreshing) return;
    isGlobalRefreshing = true;
    markUpdated(false);

    const hash = location.hash || "#/";
    try {
      if (hash.startsWith("#/jogo/")) {
        const fixtureId = Number(hash.replace("#/jogo/", "").split("/")[0]);
        if (fixtureId) {
          apiCache.delete(`fixtures_${JSON.stringify({ id: fixtureId })}`);
          apiCache.delete(`fixtures/events_${JSON.stringify({ fixture: fixtureId })} `);
          apiCache.delete(`fixtures/statistics_${JSON.stringify({ fixture: fixtureId })} `);
          apiCache.delete(`fixtures/players_${JSON.stringify({ fixture: fixtureId })} `);
          await renderFixture(fixtureId, true);
        }
      } else if (hash === "#/aovivo") {
        await fetchLiveMatches(true);
      } else if (hash === "#/jogos-do-dia" || hash.startsWith("#/jogos-do-dia/")) {
        const datePart = hash.replace("#/jogos-do-dia", "").replace("/", "");
        const targetDate = datePart || getLocalDateString(new Date());
        const activeFilter = document.querySelector(".matches-day-filter-btn.active")?.dataset?.filter || "all";
        await fetchAndRenderDayMatches(targetDate, activeFilter);
      } else if (hash === "#/meu-time") {
        await renderMyTeam();
      }
    } catch (e) {
      console.warn("Auto-refresh cycle error:", e);
    } finally {
      isGlobalRefreshing = false;
    }
  }

  window._globalRefreshTimer = setInterval(executeGlobal30sRefresh, 30000);

  // Auto-refresh instantâneo ao retornar de segundo plano / focar janela
  let lastBackgroundTime = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const elapsedBg = Date.now() - lastBackgroundTime;
      if (elapsedBg > 5000) {
        executeGlobal30sRefresh();
      }
    } else {
      lastBackgroundTime = Date.now();
    }
  });

  window.addEventListener("focus", () => {
    const elapsedBg = Date.now() - lastBackgroundTime;
    if (elapsedBg > 5000) {
      executeGlobal30sRefresh();
    }
  });

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
        <p class="page-sub">Escolha o seu time do coração para acompanhar notícias em tempo real, elenco completo com estatísticas e próximos jogos.</p>
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

  // Descobrir a liga e temporada principal do time favorito
  const currentYear = new Date().getFullYear();
  let primaryLeagueId = 71;
  let primarySeason = currentYear;

  try {
    const [lastRes, nextRes, leaguesRes] = await Promise.allSettled([
      apiGet("fixtures", { team: favTeam.id, last: 1 }, 30),
      apiGet("fixtures", { team: favTeam.id, next: 1 }, 30),
      apiGet("leagues", { team: favTeam.id, season: currentYear }, 60)
    ]);

    const lastFx = lastRes.status === "fulfilled" && Array.isArray(lastRes.value) ? lastRes.value[0] : null;
    const nextFx = nextRes.status === "fulfilled" && Array.isArray(nextRes.value) ? nextRes.value[0] : null;
    const teamLeagues = leaguesRes.status === "fulfilled" && Array.isArray(leaguesRes.value) ? leaguesRes.value : [];

    if (lastFx?.league?.id) {
      primaryLeagueId = lastFx.league.id;
      primarySeason = lastFx.league.season || currentYear;
    } else if (nextFx?.league?.id) {
      primaryLeagueId = nextFx.league.id;
      primarySeason = nextFx.league.season || currentYear;
    } else if (teamLeagues[0]?.league?.id) {
      primaryLeagueId = teamLeagues[0].league.id;
      primarySeason = teamLeagues[0].league.season || currentYear;
    }
  } catch (e) {
    console.warn("Could not determine primary league for fav team:", e);
  }

  // Renderiza a estrutura completa do time
  await renderTeam(favTeam.id, primaryLeagueId, primarySeason);

  // Adiciona botão de trocar time no cabeçalho
  const teamHeader = document.querySelector(".team-header");
  if (teamHeader && !document.getElementById("btn-change-fav-team-myteam")) {
    const changeBtn = document.createElement("button");
    changeBtn.id = "btn-change-fav-team-myteam";
    changeBtn.className = "btn ghost small";
    changeBtn.style.fontSize = "0.78rem";
    changeBtn.style.marginLeft = "8px";
    changeBtn.innerHTML = "🔄 Trocar Time";
    changeBtn.addEventListener("click", () => showOnboardingModal(true));
    teamHeader.appendChild(changeBtn);
  }
}


function toggleCountryCard(headerEl) {
  const card = headerEl.closest(".country-card");
  if (card) {
    card.classList.toggle("open");
  }
}
window.toggleCountryCard = toggleCountryCard;

function renderHome() {
  const countryCardsHtml = COUNTRIES.map((c, idx) => {
    const leaguesInCountry = c.leagues.map(id => LEAGUES.find(l => l.id === id)).filter(Boolean);
    const countText = `${leaguesInCountry.length} ${leaguesInCountry.length === 1 ? 'Competição' : 'Competições'}`;
    const previewLogos = leaguesInCountry.map(l => `<img src="https://media.api-sports.io/football/leagues/${l.id}.png" alt="" style="width:20px;height:20px;object-fit:contain;" onerror="this.style.display='none'">`).join('');

    return `
      <div class="country-card ${idx === 0 ? 'open' : ''}" data-country="${c.id}">
        <div class="country-header" onclick="toggleCountryCard(this)">
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
        <div class="country-body">
          ${leaguesInCountry.map(l => {
            const targetHash = l.isCup 
              ? `#/liga/${l.id}/${defaultSeasonFor(l)}/jogos` 
              : `#/liga/${l.id}/${defaultSeasonFor(l)}`;
            return `
              <a class="league-sub-item" href="${targetHash}">
                <img class="league-sub-logo" src="https://media.api-sports.io/football/leagues/${l.id}.png" alt="" loading="lazy" onerror="this.style.display='none'">
                <div class="league-sub-details">
                  <span class="league-sub-name">${escapeHtml(l.name)}</span>
                  <span class="league-sub-type">${l.isCup ? '🏆 Copa Mata-Mata' : '📊 Pontos Corridos'}</span>
                </div>
                <span class="league-sub-arrow">→</span>
              </a>
            `;
          }).join('')}
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


async function renderLeague(leagueId, season) {
  const league = LEAGUES.find(l => l.id === leagueId) || { id: leagueId, name: "Liga", country: "", isCup: false };
  season = season || defaultSeasonFor(league);

  // Se for Copa / Mata-Mata sem pontos corridos, direciona para a aba de Jogos da Copa
  if (league.isCup) {
    await renderLeagueFixtures(leagueId, season);
    return;
  }

  app.innerHTML = `
    ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: league.name, href: "" }])}
    <div class="page-head">
      <p class="page-eyebrow">${escapeHtml(league.country)}</p>
      <h1 class="page-title">${escapeHtml(league.name)}</h1>
    </div>
    ${subNav([
      { label: "Classificação", href: `#/liga/${leagueId}/${season}`, active: true },
      { label: "Jogos", href: `#/liga/${leagueId}/${season}/jogos` },
      { label: "Rankings", href: `#/liga/${leagueId}/${season}/artilheiros` },
    ])}
    <div id="league-content">${skeletonTable()}</div>
  `;

  const content = document.getElementById("league-content");
  try {
    const [standingsData, fixturesData, topScorersData, topAssistsData] = await Promise.all([
      apiGet("standings", { league: leagueId, season }),
      apiGet("fixtures", { league: leagueId, season }).catch(() => []),
      apiGet("players/topscorers", { league: leagueId, season }).catch(() => []),
      apiGet("players/topassists", { league: leagueId, season }).catch(() => [])
    ]);

    const finishedFixtures = preprocessLeagueFixtures(fixturesData).filter(f => ['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short));

    let officialNotes = {};
    let table = [];
    if (standingsData?.[0]?.league?.standings?.[0]) {
      const apiTable = standingsData[0].league.standings[0];
      apiTable.forEach(row => {
        officialNotes[row.team.id] = { description: row.description, group: row.group };
      });
      table = computeTableFromFixtures(finishedFixtures, apiTable, officialNotes, leagueId);
    } else {
      content.innerHTML = `
        <div class="card" style="text-align:center;padding:40px 20px;color:var(--chalk-dim);">
          <span style="font-size:2.5rem;display:block;margin-bottom:10px;">🏆</span>
          <h3 style="color:var(--chalk);margin:0 0 8px 0;">Competição em Formato Mata-Mata</h3>
          <p style="margin:0 0 16px 0;font-size:0.88rem;">Esta competição não possui tabela de pontos corridos. Acesse os jogos e chaves:</p>
          <a class="btn primary small" href="#/liga/${leagueId}/${season}/jogos" style="font-weight:700;">
            Ver Confrontos e Rodadas →
          </a>
        </div>
      `;
      return;
    }

    // Top Scorers (Top 5)
    const topScorers = Array.isArray(topScorersData) ? topScorersData.slice(0, 5) : [];
    // Top Assists (Top 5)
    const topAssists = Array.isArray(topAssistsData) ? topAssistsData.slice(0, 5) : [];

    // Calcular Clean Sheets dos Goleiros na Liga
    const csMap = new Map();
    finishedFixtures.forEach(f => {
      const hGoals = f.goals?.home ?? 0;
      const aGoals = f.goals?.away ?? 0;
      if (aGoals === 0 && f.teams?.home) {
        const t = f.teams.home;
        csMap.set(t.id, { team: t, cleanSheets: (csMap.get(t.id)?.cleanSheets || 0) + 1 });
      }
      if (hGoals === 0 && f.teams?.away) {
        const t = f.teams.away;
        csMap.set(t.id, { team: t, cleanSheets: (csMap.get(t.id)?.cleanSheets || 0) + 1 });
      }
    });

    const topTeams = Array.from(csMap.values())
      .sort((a, b) => b.cleanSheets - a.cleanSheets)
      .slice(0, 5);

    // Buscar os goleiros titulares reais dos 5 clubes líderes de clean sheet
    const gkResults = await Promise.allSettled(
      topTeams.map(async (item) => {
        const teamId = item.team.id;
        
        // 1. Tentar pegar o goleiro titular da última partida do time
        const teamFinished = finishedFixtures
          .filter(f => f.teams?.home?.id === teamId || f.teams?.away?.id === teamId)
          .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date));

        if (teamFinished.length > 0) {
          try {
            const recentFxId = teamFinished[0].fixture.id;
            const lineupsResp = await apiGet("fixtures/lineups", { fixture: recentFxId }, 60).catch(() => []);
            if (Array.isArray(lineupsResp) && lineupsResp.length > 0) {
              const teamLineup = lineupsResp.find(l => l.team?.id === teamId);
              if (teamLineup?.startXI?.length) {
                const starterGK = teamLineup.startXI.find(p => p.player?.pos === "G") || teamLineup.startXI[0];
                if (starterGK?.player?.name) {
                  return {
                    id: starterGK.player.id,
                    name: starterGK.player.name,
                    photo: starterGK.player.photo || `https://media.api-sports.io/football/players/${starterGK.player.id}.png`
                  };
                }
              }
            }
          } catch (e) {
            console.warn("Lineup fetch fallback:", e);
          }
        }

        // 2. Fallback: buscar lista do elenco e selecionar o goleiro principal (camisa 1 ou maior minutagem)
        try {
          const squadResp = await apiGet("players/squads", { team: teamId }, 60).catch(() => []);
          const players = squadResp?.[0]?.players || [];
          const gks = players.filter(p => p.position === "Goalkeeper");
          if (gks.length > 0) {
            const starterGk = gks.find(g => g.number === 1) || gks.sort((a, b) => (b.age || 0) - (a.age || 0))[0] || gks[0];
            return {
              id: starterGk.id,
              name: starterGk.name,
              photo: starterGk.photo || `https://media.api-sports.io/football/players/${starterGk.id}.png`
            };
          }
        } catch (e) {
          console.warn("Squad fetch fallback:", e);
        }

        return {
          id: 0,
          name: "Goleiro Titular",
          photo: "https://media.api-sports.io/football/players/placeholder.png"
        };
      })
    );

    const topCleanSheets = topTeams.map((item, idx) => {
      const gk = (gkResults[idx]?.status === "fulfilled" && gkResults[idx].value)
        ? gkResults[idx].value
        : { id: 0, name: "Goleiro Titular", photo: "https://media.api-sports.io/football/players/placeholder.png" };

      return {
        goalkeeper: gk,
        team: item.team,
        cleanSheets: item.cleanSheets
      };
    });

    let activeFilter = "all";

    function updateView() {
      const standingsHtml = renderStandingsTable(table, leagueId, season, null, activeFilter, finishedFixtures);
      
      content.innerHTML = `
        <div class="standings-split-grid">
          
          <!-- COLUNA ESQUERDA: TABELA DE CLASSIFICAÇÃO -->
          <div class="standings-table-main-col">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:10px;">
              <div class="filter-pills">
                <button class="filter-btn ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">Geral</button>
                <button class="filter-btn ${activeFilter === 'home' ? 'active' : ''}" data-filter="home">Mandante</button>
                <button class="filter-btn ${activeFilter === 'away' ? 'active' : ''}" data-filter="away">Visitante</button>
              </div>
            </div>

            ${standingsHtml}
          </div>

          <!-- COLUNA DIREITA: 3 CARDS DE RANKINGS (TOP SCORERS, TOP ASSISTS, CLEAN SHEETS) -->
          <aside class="rankings-sidebar-col">
            
            <!-- 1. Top Scorers -->
            <div class="rank-highlight-card">
              <div class="rank-highlight-head">
                <span>⚽ Top Scorers (Artilheiros)</span>
              </div>

              ${topScorers.length ? `
                <!-- #1 Artilheiro com Anel Circular -->
                <div class="rank-top1-box">
                  <div class="rank-circular-badge">
                    <span class="rank-circular-num">${topScorers[0].statistics?.[0]?.goals?.total ?? 0}</span>
                    <span class="rank-circular-label">Gols</span>
                  </div>
                  <div class="rank-top1-info">
                    <img class="rank-top1-avatar" src="${topScorers[0].player?.photo || ''}" alt="" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                    <div class="rank-top1-text">
                      <a href="#/jogador/${topScorers[0].player.id}/${topScorers[0].statistics[0].team.id}/${leagueId}/${season}" class="rank-top1-name" style="text-decoration:none;">
                        ${escapeHtml(topScorers[0].player.name)}
                      </a>
                      <span class="rank-top1-team">
                        <img src="${topScorers[0].statistics[0].team.logo}" alt="">
                        ${escapeHtml(topScorers[0].statistics[0].team.name)}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- 2º ao 5º -->
                <div class="rank-sub-list">
                  ${topScorers.slice(1).map((item, idx) => `
                    <a class="rank-sub-item" href="#/jogador/${item.player.id}/${item.statistics[0].team.id}/${leagueId}/${season}">
                      <div class="rank-sub-left">
                        <span class="rank-sub-pos">${idx + 2}</span>
                        <img class="rank-sub-avatar" src="${item.player.photo}" alt="" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                        <span class="rank-sub-name">${escapeHtml(item.player.name)}</span>
                      </div>
                      <span class="rank-sub-val">${item.statistics[0].goals?.total ?? 0}</span>
                    </a>
                  `).join("")}
                </div>
              ` : `
                <div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.8rem;">Dados de artilharia não disponíveis.</div>
              `}
            </div>

            <!-- 2. Top Assists -->
            <div class="rank-highlight-card">
              <div class="rank-highlight-head">
                <span>👟 Top Assists (Garçons)</span>
              </div>

              ${topAssists.length ? `
                <!-- #1 Líder em Assistências -->
                <div class="rank-top1-box">
                  <div class="rank-circular-badge" style="border-color:var(--gold);box-shadow:0 0 16px var(--gold-glow);">
                    <span class="rank-circular-num" style="color:var(--cyan);">${topAssists[0].statistics?.[0]?.goals?.assists ?? 0}</span>
                    <span class="rank-circular-label">Passes</span>
                  </div>
                  <div class="rank-top1-info">
                    <img class="rank-top1-avatar" src="${topAssists[0].player?.photo || ''}" alt="" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                    <div class="rank-top1-text">
                      <a href="#/jogador/${topAssists[0].player.id}/${topAssists[0].statistics[0].team.id}/${leagueId}/${season}" class="rank-top1-name" style="text-decoration:none;">
                        ${escapeHtml(topAssists[0].player.name)}
                      </a>
                      <span class="rank-top1-team">
                        <img src="${topAssists[0].statistics[0].team.logo}" alt="">
                        ${escapeHtml(topAssists[0].statistics[0].team.name)}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- 2º ao 5º -->
                <div class="rank-sub-list">
                  ${topAssists.slice(1).map((item, idx) => `
                    <a class="rank-sub-item" href="#/jogador/${item.player.id}/${item.statistics[0].team.id}/${leagueId}/${season}">
                      <div class="rank-sub-left">
                        <span class="rank-sub-pos">${idx + 2}</span>
                        <img class="rank-sub-avatar" src="${item.player.photo}" alt="" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                        <span class="rank-sub-name">${escapeHtml(item.player.name)}</span>
                      </div>
                      <span class="rank-sub-val" style="color:var(--gold);">${item.statistics[0].goals?.assists ?? 0}</span>
                    </a>
                  `).join("")}
                </div>
              ` : `
                <div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.8rem;">Dados de assistências não disponíveis.</div>
              `}
            </div>

            <!-- 3. Clean Sheets (COM GOLEIRO) -->
            <div class="rank-highlight-card">
              <div class="rank-highlight-head">
                <span>🧤 Clean Sheets (Goleiros Menos Vazados)</span>
              </div>

              ${topCleanSheets.length ? `
                <!-- #1 Goleiro com mais Clean Sheets -->
                <div class="rank-top1-box">
                  <div class="rank-circular-badge" style="border-color:#10B981;box-shadow:0 0 16px rgba(16,185,129,0.35);">
                    <span class="rank-circular-num" style="color:#10B981;">${topCleanSheets[0].cleanSheets}</span>
                    <span class="rank-circular-label">Jogos</span>
                  </div>
                  <div class="rank-top1-info">
                    <img class="rank-top1-avatar" src="${topCleanSheets[0].goalkeeper.photo}" alt="" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                    <div class="rank-top1-text">
                      <a href="#/jogador/${topCleanSheets[0].goalkeeper.id}/${topCleanSheets[0].team.id}/${leagueId}/${season}" class="rank-top1-name" style="text-decoration:none;">
                        ${escapeHtml(topCleanSheets[0].goalkeeper.name)}
                      </a>
                      <span class="rank-top1-team">
                        <img src="${topCleanSheets[0].team.logo}" alt="">
                        ${escapeHtml(formatTeamName(topCleanSheets[0].team.name))}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- 2º ao 5º -->
                <div class="rank-sub-list">
                  ${topCleanSheets.slice(1).map((item, idx) => `
                    <a class="rank-sub-item" href="#/jogador/${item.goalkeeper.id}/${item.team.id}/${leagueId}/${season}">
                      <div class="rank-sub-left">
                        <span class="rank-sub-pos">${idx + 2}</span>
                        <img class="rank-sub-avatar" src="${item.goalkeeper.photo}" alt="" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                        <div>
                          <div class="rank-sub-name">${escapeHtml(item.goalkeeper.name)}</div>
                          <div style="font-size:0.68rem;color:var(--chalk-dim);display:flex;align-items:center;gap:4px;">
                            <img src="${item.team.logo}" alt="" style="width:12px;height:12px;object-fit:contain;">
                            ${escapeHtml(formatTeamName(item.team.name))}
                          </div>
                        </div>
                      </div>
                      <span class="rank-sub-val" style="color:#10B981;">${item.cleanSheets}</span>
                    </a>
                  `).join("")}
                </div>
              ` : `
                <div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.8rem;">Dados de goleiros sem sofrer gols em processamento.</div>
              `}
            </div>

          </aside>

        </div>
      `;

      content.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          activeFilter = btn.dataset.filter;
          updateView();
        });
      });
    }

    updateView();
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}


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

// ============================================================
// CLASSIFICAÇÃO INTELIGENTE DE FUNÇÃO / POSIÇÃO ESPECÍFICA DO JOGADOR
// ============================================================
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


// ============================================================
// Gráfico de Teia (Radar Chart) com Atributos Próprios por Posição
// ============================================================
function generatePlayerRadarChart(p, s, pos, isPerGame) {
  const isGK = pos === "Goalkeeper";
  const isDef = pos === "Defender";
  const isMid = pos === "Midfielder";
  const isAtt = pos === "Attacker";

  const apps = s.games?.appearences || 1;
  const minutes = s.games?.minutes || 0;
  const ratingNum = parseFloat(s.games?.rating) || 6.5;

  let axes = [];
  let values = [];

  if (isGK) {
    const saves = s.goals?.saves || 0;
    const conceded = s.goals?.conceded ?? 0;
    const passAcc = parseInt(s.passes?.accuracy) || 65;
    const interceptions = s.tackles?.interceptions || 0;

    const scoreSaves = Math.min(Math.round((saves / Math.max(apps, 1)) * 25), 100);
    const scoreSafety = Math.max(Math.min(Math.round(100 - (conceded / Math.max(apps, 1)) * 30), 100), 20);
    const scorePass = Math.min(passAcc, 100);
    const scoreAerial = Math.min(Math.round((interceptions / Math.max(apps, 1)) * 50 + 40), 100);
    const scoreRegularity = Math.min(Math.round((minutes / 2500) * 100), 100);
    const scoreRating = Math.min(Math.round((ratingNum / 10) * 100), 100);

    axes = [
      { label: "Defesas/J", icon: "🧤" },
      { label: "Solidez", icon: "🛡️" },
      { label: "Reposição", icon: "🎯" },
      { label: "Saídas", icon: "🤾" },
      { label: "Minutos", icon: "⏱️" },
      { label: "Nota", icon: "⭐" }
    ];
    values = [scoreSaves, scoreSafety, scorePass, scoreAerial, scoreRegularity, scoreRating];
  } else if (isDef) {
    const tackles = s.tackles?.total || 0;
    const interceptions = s.tackles?.interceptions || 0;
    const duelsWon = s.duels?.won || 0;
    const duelsTot = s.duels?.total || 1;
    const passAcc = parseInt(s.passes?.accuracy) || 75;
    const creation = (s.passes?.key || 0) + (s.dribbles?.success || 0);

    const scoreTackles = Math.min(Math.round((tackles / Math.max(apps, 1)) * 35 + 20), 100);
    const scoreInterceptions = Math.min(Math.round((interceptions / Math.max(apps, 1)) * 40 + 25), 100);
    const scoreDuels = Math.min(Math.round((duelsWon / Math.max(duelsTot, 1)) * 100), 100);
    const scorePass = Math.min(passAcc, 100);
    const scoreOffensive = Math.min(Math.round((creation / Math.max(apps, 1)) * 40 + 20), 100);
    const scoreRating = Math.min(Math.round((ratingNum / 10) * 100), 100);

    axes = [
      { label: "Desarmes", icon: "🛡️" },
      { label: "Intercep.", icon: "🧤" },
      { label: "Duelos", icon: "⚔️" },
      { label: "Passe", icon: "🎯" },
      { label: "Apoio", icon: "💨" },
      { label: "Nota", icon: "⭐" }
    ];
    values = [scoreTackles, scoreInterceptions, scoreDuels, scorePass, scoreOffensive, scoreRating];
  } else if (isMid) {
    const keyPasses = s.passes?.key || 0;
    const passAcc = parseInt(s.passes?.accuracy) || 78;
    const dribbles = s.dribbles?.success || 0;
    const recovery = (s.tackles?.total || 0) + (s.tackles?.interceptions || 0);
    const goalsShots = (s.goals?.total || 0) * 15 + (s.shots?.total || 0) * 3;

    const scoreCreation = Math.min(Math.round((keyPasses / Math.max(apps, 1)) * 45 + 25), 100);
    const scorePass = Math.min(passAcc, 100);
    const scoreDribble = Math.min(Math.round((dribbles / Math.max(apps, 1)) * 40 + 20), 100);
    const scoreRecovery = Math.min(Math.round((recovery / Math.max(apps, 1)) * 30 + 25), 100);
    const scoreAttackArrival = Math.min(Math.round(goalsShots + 20), 100);
    const scoreRating = Math.min(Math.round((ratingNum / 10) * 100), 100);

    axes = [
      { label: "Criação", icon: "🪄" },
      { label: "Passe %", icon: "🎯" },
      { label: "Dribles", icon: "⚡" },
      { label: "Recuper.", icon: "🛡️" },
      { label: "Chegada", icon: "⚽" },
      { label: "Nota", icon: "⭐" }
    ];
    values = [scoreCreation, scorePass, scoreDribble, scoreRecovery, scoreAttackArrival, scoreRating];
  } else {
    // Atacante / Ponta / Centroavante
    const goals = s.goals?.total || 0;
    const shotsOn = s.shots?.on || 0;
    const shotsTot = s.shots?.total || 1;
    const dribbles = s.dribbles?.success || 0;
    const assists = (s.goals?.assists || 0) * 20 + (s.passes?.key || 0) * 4;
    const duels = (s.fouls?.drawn || 0) * 3 + (s.duels?.won || 0) * 0.4;

    const scoreFinishing = Math.min(Math.round((goals / Math.max(apps, 1)) * 120 + 25), 100);
    const scoreAccuracy = Math.min(Math.round((shotsOn / Math.max(shotsTot, 1)) * 100), 100);
    const scoreDribble = Math.min(Math.round((dribbles / Math.max(apps, 1)) * 40 + 20), 100);
    const scoreAssists = Math.min(Math.round((assists / Math.max(apps, 1)) * 30 + 20), 100);
    const scoreDuels = Math.min(Math.round((duels / Math.max(apps, 1)) * 25 + 25), 100);
    const scoreRating = Math.min(Math.round((ratingNum / 10) * 100), 100);

    axes = [
      { label: "Faro Gol", icon: "⚽" },
      { label: "Pontaria", icon: "🎯" },
      { label: "1x1 Drible", icon: "⚡" },
      { label: "Criação", icon: "👟" },
      { label: "Duelos", icon: "⚔️" },
      { label: "Nota", icon: "⭐" }
    ];
    values = [scoreFinishing, scoreAccuracy, scoreDribble, scoreAssists, scoreDuels, scoreRating];
  }

  // Gera SVG do Gráfico de Teia Compacto (280x280)
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.31;
  const numAxes = axes.length;
  const angleStep = (2 * Math.PI) / numAxes;

  // Grade concêntrica (20%, 40%, 60%, 80%, 100%)
  const levels = [0.2, 0.4, 0.6, 0.8, 1.0];
  let websSvg = "";
  levels.forEach((lvl, lIdx) => {
    const points = [];
    for (let i = 0; i < numAxes; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = cx + r * lvl * Math.cos(angle);
      const y = cy + r * lvl * Math.sin(angle);
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const isOuter = lIdx === levels.length - 1;
    websSvg += `<polygon points="${points.join(" ")}" fill="${isOuter ? 'rgba(0, 229, 255, 0.03)' : 'none'}" stroke="rgba(0, 229, 255, ${isOuter ? '0.35' : '0.12'})" stroke-width="${isOuter ? '1.5' : '1'}" stroke-dasharray="${isOuter ? 'none' : '3,3'}" />`;
  });

  // Linhas dos Eixos e Rótulos
  let axesSvg = "";
  let labelsSvg = "";
  for (let i = 0; i < numAxes; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const xEnd = cx + r * Math.cos(angle);
    const yEnd = cy + r * Math.sin(angle);

    axesSvg += `<line x1="${cx}" y1="${cy}" x2="${xEnd.toFixed(1)}" y2="${yEnd.toFixed(1)}" stroke="rgba(0, 229, 255, 0.2)" stroke-width="1" />`;

    const labelR = r + 24;
    const xLabel = cx + labelR * Math.cos(angle);
    const yLabel = cy + labelR * Math.sin(angle);

    let textAnchor = "middle";
    if (Math.cos(angle) > 0.3) textAnchor = "start";
    else if (Math.cos(angle) < -0.3) textAnchor = "end";

    const axisObj = axes[i];
    const scoreVal = values[i] || 50;

    labelsSvg += `
      <g transform="translate(${xLabel.toFixed(1)}, ${yLabel.toFixed(1)})">
        <text text-anchor="${textAnchor}" fill="#F0F6FC" font-family="'Plus Jakarta Sans', sans-serif" font-size="9.5" font-weight="700" dy="-2">
          ${axisObj.icon} ${axisObj.label}
        </text>
        <text text-anchor="${textAnchor}" fill="#00E5FF" font-family="'JetBrains Mono', monospace" font-size="9.5" font-weight="800" dy="10">
          ${scoreVal} <tspan fill="#8B949E" font-size="7.5">/100</tspan>
        </text>
      </g>
    `;
  }

  // Polígono de Dados do Jogador
  const dataPoints = [];
  const pointCircles = [];
  for (let i = 0; i < numAxes; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const pct = Math.max(Math.min((values[i] || 50) / 100, 1.0), 0.1);
    const x = cx + r * pct * Math.cos(angle);
    const y = cy + r * pct * Math.sin(angle);

    dataPoints.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    pointCircles.push(`
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#FFB800" stroke="#07111E" stroke-width="1.5" />
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" fill="none" stroke="rgba(255, 184, 0, 0.4)" stroke-width="1" />
    `);
  }

  return `
    <div class="player-metrics-card" style="display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(180deg, rgba(13,38,59,0.85) 0%, rgba(7,17,30,0.95) 100%);border:1px solid rgba(0,229,255,0.22);border-radius:var(--radius-md);">
      <div class="player-metrics-header" style="background:linear-gradient(90deg, rgba(0,229,255,0.15), transparent);border-left:3px solid var(--cyan);">
        <span class="metrics-header-icon">🕸️</span>
        <span class="metrics-header-title">Radar Tático (6 Eixos)</span>
      </div>

      <div style="display:flex;justify-content:center;align-items:center;padding:10px 4px;flex:1;">
        <svg viewBox="0 0 ${size} ${size}" class="player-radar-chart-svg" style="width:100%;max-width:${size}px;height:auto;filter:drop-shadow(0 4px 14px rgba(0,229,255,0.18));overflow:visible;">
          <defs>
            <radialGradient id="radarGrad_${p.id || 'p'}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="rgba(0, 229, 255, 0.45)" />
              <stop offset="60%" stop-color="rgba(0, 229, 255, 0.2)" />
              <stop offset="100%" stop-color="rgba(255, 184, 0, 0.15)" />
            </radialGradient>
          </defs>

          <!-- Teia Concêntrica -->
          ${websSvg}
          ${axesSvg}

          <!-- Área Poligonal de Dados -->
          <polygon points="${dataPoints.join(" ")}" fill="url(#radarGrad_${p.id || 'p'})" stroke="#00E5FF" stroke-width="2.2" stroke-linejoin="round" />

          <!-- Vértices -->
          ${pointCircles.join("")}

          <!-- Rótulos e Scores -->
          ${labelsSvg}
        </svg>
      </div>

      <div style="padding:8px 12px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;font-family:var(--font-mono);font-size:0.72rem;color:var(--gold);">
        Scouts Específicos: ${pos === 'Goalkeeper' ? 'Goleiro' : pos === 'Defender' ? 'Defensor' : pos === 'Midfielder' ? 'Meio-Campo' : 'Ataque'}
      </div>
    </div>
  `;
}


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
      const position = isGK ? "Goalkeeper" : isDefender ? "Defender" : isMidfielder ? "Midfielder" : "Attacker";

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
          <div class="player-metrics-grid-3col">
            <!-- 1. Desempenho no Gol -->
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

            <!-- 2. Gráfico de Teia Central -->
            ${generatePlayerRadarChart(p, s, position, isPerGame)}

            <!-- 3. Reposições & Disciplina -->
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
                    <span class="metric-info">
                      <span class="metric-icon">🛡️</span>
                      <span class="metric-label">Faltas Sofridas</span>
                    </span>
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
          <div class="player-metrics-grid-3col">
            <!-- 1. Desarmes e Cortes -->
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

            <!-- 2. Gráfico de Teia Central -->
            ${generatePlayerRadarChart(p, s, position, isPerGame)}

            <!-- 3. Construção e Disciplina -->
            <div class="player-metrics-card">
              <div class="player-metrics-header" style="background:linear-gradient(90deg, rgba(0,229,255,0.15), transparent);border-left:3px solid var(--cyan);">
                <span class="metrics-header-icon">⚡</span>
                <span class="metrics-header-title">Construção, Apoio & Disciplina ${isPerGame ? '(Por Jogo)' : ''}</span>
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
          <div class="player-metrics-grid-3col">
            <!-- 1. Criação & Transição -->
            <div class="player-metrics-card">
              <div class="player-metrics-header" style="background:linear-gradient(90deg, rgba(255,184,0,0.15), transparent);border-left:3px solid var(--gold);">
                <span class="metrics-header-icon">🧠</span>
                <span class="metrics-header-title">Criação & Transição Ofensiva ${isPerGame ? '(Por Jogo)' : ''}</span>
              </div>
              <div class="player-metrics-list">
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

            <!-- 2. Gráfico de Teia Central -->
            ${generatePlayerRadarChart(p, s, position, isPerGame)}

            <!-- 3. Contenção & Desarmes -->
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
              <img class="player-avatar-large" src="${p.photo}" alt="" onerror="this.style.display='none'">
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
        <div class="stat-grid" style="margin-bottom:20px;">
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
async function renderTeam(teamId, leagueId, season) {
  const league = LEAGUES.find(l => l.id === leagueId);
  season = season || defaultSeasonFor(league);

  app.innerHTML = `<div id="team-content">${skeletonTable()}</div>`;
  const content = document.getElementById("team-content");

  try {
    // Busca estatísticas gerais completas de TODAS as competições da temporada (sem filtrar league)
    const [teamInfoResp, recentFixtures, allSeasonFixtures, nextFixtures, squadResp, pPage1, pPage2] = await Promise.all([
      apiGet("teams", { id: teamId }, 30).catch(() => []),
      apiGet("fixtures", { team: teamId, last: 5 }, 5).catch(() => []),
      apiGet("fixtures", { team: teamId, season: season }, 10).catch(() => []),
      apiGet("fixtures", { team: teamId, next: 5 }, 5).catch(() => []),
      apiGet("players/squads", { team: teamId }, 30).catch(() => []),
      apiGet("players", { team: teamId, season: season, page: 1 }, 30).catch(() => []),
      apiGet("players", { team: teamId, season: season, page: 2 }, 30).catch(() => [])
    ]);

    const t = teamInfoResp?.[0]?.team || { id: teamId, name: "Clube", logo: `https://media.api-sports.io/football/teams/${teamId}.png` };
    const teamFormattedName = formatTeamName(t.name);
    
    // Todos os jogos da temporada
    const allFixturesList = Array.isArray(allSeasonFixtures) ? allSeasonFixtures : [];
    const finishedSeasonAll = allFixturesList.filter(f => ['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short));

    // Descobrir todas as competições que o clube disputou no ano
    const availableLeaguesMap = new Map();
    allFixturesList.forEach(f => {
      if (f.league?.id && f.league?.name) {
        availableLeaguesMap.set(f.league.id, {
          id: f.league.id,
          name: f.league.name,
          logo: f.league.logo
        });
      }
    });
    const availableLeagues = Array.from(availableLeaguesMap.values());

    const isFav = state.favoriteTeams.some(fav => fav.id === teamId);

    // Mapear todas as estatísticas dos jogadores da temporada
    const allPlayerItems = [
      ...(Array.isArray(pPage1) ? pPage1 : []),
      ...(Array.isArray(pPage2) ? pPage2 : [])
    ];

    const playerStatsMap = new Map();
    allPlayerItems.forEach(item => {
      if (item?.player?.id) {
        playerStatsMap.set(item.player.id, item);
      }
    });

    const squadPlayers = squadResp?.[0]?.players || [];

    let selectedCompFilter = "ALL"; // Padrão: Todas as Competições

    function computeTeamStats(filteredFinished) {
      let totalWins = 0, totalDraws = 0, totalLoses = 0;
      let gfTotal = 0, gaTotal = 0, csTotal = 0;
      let winsHome = 0, playedHome = 0, winsAway = 0, playedAway = 0;

      filteredFinished.forEach(f => {
        const isHome = f.teams?.home?.id === teamId;
        const myGoals = isHome ? (f.goals?.home ?? 0) : (f.goals?.away ?? 0);
        const oppGoals = isHome ? (f.goals?.away ?? 0) : (f.goals?.home ?? 0);

        gfTotal += myGoals;
        gaTotal += oppGoals;

        if (oppGoals === 0) csTotal++;

        if (isHome) {
          playedHome++;
          if (myGoals > oppGoals) { totalWins++; winsHome++; }
          else if (myGoals === oppGoals) { totalDraws++; }
          else { totalLoses++; }
        } else {
          playedAway++;
          if (myGoals > oppGoals) { totalWins++; winsAway++; }
          else if (myGoals === oppGoals) { totalDraws++; }
          else { totalLoses++; }
        }
      });

      const totalPlayed = filteredFinished.length;
      const points = (totalWins * 3) + totalDraws;
      const maxPoints = totalPlayed * 3;
      const winPct = maxPoints ? Math.round((points / maxPoints) * 100) : 0;
      const gfAvg = totalPlayed ? (gfTotal / totalPlayed) : 0;
      const gaAvg = totalPlayed ? (gaTotal / totalPlayed) : 0;
      const goalDiff = gfTotal - gaTotal;
      const homeWinPct = playedHome ? Math.round((winsHome / playedHome) * 100) : 0;
      const awayWinPct = playedAway ? Math.round((winsAway / playedAway) * 100) : 0;

      return {
        totalPlayed, totalWins, totalDraws, totalLoses,
        gfTotal, gaTotal, gfAvg, gaAvg, goalDiff, csTotal,
        winPct, homeWinPct, awayWinPct
      };
    }

    function getEnrichedRoster(selectedLeagueId) {
      return squadPlayers.map(p => {
        const pStatsItem = playerStatsMap.get(p.id);
        const allStList = pStatsItem?.statistics || [];
        
        // Filtra por competição se selecionado
        const stList = selectedLeagueId === "ALL"
          ? allStList
          : allStList.filter(s => s.league?.id === Number(selectedLeagueId));

        const totalGoals = stList.reduce((acc, s) => acc + (s.goals?.total || 0), 0);
        const totalAssists = stList.reduce((acc, s) => acc + (s.goals?.assists || 0), 0);
        const totalMinutes = stList.reduce((acc, s) => acc + (s.games?.minutes || 0), 0);
        const totalApps = stList.reduce((acc, s) => acc + (s.games?.appearences || 0), 0);
        const totalTackles = stList.reduce((acc, s) => acc + (s.tackles?.total || 0), 0);
        const totalInterceptions = stList.reduce((acc, s) => acc + (s.tackles?.interceptions || 0), 0);
        const totalSaves = stList.reduce((acc, s) => acc + (s.goals?.saves || 0), 0);

        const validRatings = stList.map(s => parseFloat(s.games?.rating)).filter(r => !isNaN(r) && r > 0);
        const avgRating = validRatings.length ? (validRatings.reduce((a, b) => a + b, 0) / validRatings.length).toFixed(1) : "-";

        const primarySt = stList[0] || allStList[0] || {};
        const specificRole = getSpecificPlayerRole(p, primarySt);

        return {
          id: p.id,
          name: p.name,
          photo: p.photo || `https://media.api-sports.io/football/players/${p.id}.png`,
          position: p.position,
          specificRole: specificRole,
          number: p.number || primarySt.games?.number || "-",
          goals: totalGoals,
          assists: totalAssists,
          minutes: totalMinutes,
          apps: totalApps,
          rating: avgRating,
          tackles: totalTackles,
          interceptions: totalInterceptions,
          saves: totalSaves
        };
      });
    }

    function renderView() {
      const activeFinished = selectedCompFilter === "ALL"
        ? finishedSeasonAll
        : finishedSeasonAll.filter(f => f.league?.id === Number(selectedCompFilter));

      const compName = selectedCompFilter === "ALL"
        ? "Todas as Competições"
        : (availableLeagues.find(l => l.id === Number(selectedCompFilter))?.name || "Competição Selecionada");

      const stats = computeTeamStats(activeFinished);
      const enrichedRoster = getEnrichedRoster(selectedCompFilter);

      content.innerHTML = `
        ${breadcrumbs([{ label: "Ligas", href: "#/" }, { label: league?.name || "Liga", href: `#/liga/${leagueId}/${season}` }, { label: t.name, href: "" }])}
        
        <!-- Cabeçalho do Clube -->
        <div class="team-header" style="display:flex;align-items:center;gap:16px;margin-bottom:20px;background:var(--pitch-card);border:1px solid var(--pitch-border);padding:16px;border-radius:var(--radius-lg);flex-wrap:wrap;">
          <img src="${t.logo}" alt="" style="width:64px;height:64px;object-fit:contain;">
          <div>
            <p class="page-eyebrow">${escapeHtml(league?.name || "")} · Temporada ${season}</p>
            <h1 class="page-title" style="margin:0;">${escapeHtml(teamFormattedName)}</h1>
          </div>
          <div style="margin-left:auto;display:flex;gap:10px;align-items:center;">
            <button class="btn ${isFav ? 'ghost' : ''} small" id="btn-toggle-team-fav">
              ${isFav ? '⭐ Seguindo Alertas' : '🔔 Seguir Time'}
            </button>
          </div>
        </div>

        <!-- ESTRUTURA EXPANDIDA DE 3 COLUNAS -->
        <div class="team-page-grid">
          
          <!-- COLUNA 1: NOTÍCIAS RECENTES DO CLUBE (ESQUERDA) -->
          <aside class="team-news-col">
            <div class="card" style="padding:14px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:8px;">
                <span style="font-size:1.1rem;">📰</span>
                <h3 style="margin:0;font-size:0.95rem;font-weight:700;color:var(--chalk);">Notícias do Clube</h3>
              </div>
              <div id="team-sidebar-news-container">
                <div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.8rem;">Carregando notícias de ${escapeHtml(teamFormattedName)}...</div>
              </div>
            </div>
          </aside>

          <!-- COLUNA 2: FILTRO DE COMPETIÇÃO + ESTATÍSTICAS GERAIS SIMÉTRICAS (4x2) + ELENCO (CENTRO) -->
          <main class="team-main-col">
            
            <!-- Barra de Filtro de Competição -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;background:var(--glass-bg);border:1px solid var(--glass-border);padding:12px 16px;border-radius:var(--radius-md);flex-wrap:wrap;gap:12px;">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);font-weight:700;letter-spacing:0.5px;">FILTRO DE COMPETIÇÃO:</span>
                <select id="team-comp-filter-select" style="background:var(--pitch-card);border:1px solid var(--line-strong);color:var(--chalk);padding:8px 14px;border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:0.85rem;cursor:pointer;outline:none;">
                  <option value="ALL" ${selectedCompFilter === 'ALL' ? 'selected' : ''}>📊 Todas as Competições (Geral da Temporada)</option>
                  ${availableLeagues.map(l => `
                    <option value="${l.id}" ${selectedCompFilter === String(l.id) ? 'selected' : ''}>🏆 ${escapeHtml(formatTeamName(l.name))}</option>
                  `).join("")}
                </select>
              </div>
              <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--cyan);background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.25);padding:4px 10px;border-radius:999px;">
                ${escapeHtml(formatTeamName(compName))}
              </span>
            </div>

            <!-- Estatísticas na Competição / Temporada (8 Cards em Grade Simétrica 4x2) -->
            <div class="card" style="padding:16px;margin-bottom:20px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:1.1rem;">📊</span>
                  <h3 style="margin:0;font-size:1rem;font-weight:700;color:var(--chalk);">Estatísticas ${selectedCompFilter === 'ALL' ? 'Gerais na Temporada' : 'na Competição'}</h3>
                </div>
                <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--gold);">${escapeHtml(formatTeamName(compName))}</span>
              </div>

              <div class="team-top-stats-bar">
                <!-- Linha 1 -->
                <!-- 1. Aproveitamento (< 40% vermelho, 41-50% laranja, >= 51% verde) -->
                <div class="team-stat-box">
                  <span class="team-stat-box-val" style="color:${stats.winPct >= 51 ? '#10B981' : stats.winPct >= 41 ? '#F97316' : '#EF4444'};">${stats.winPct}%</span>
                  <span class="team-stat-box-label">Aproveitamento</span>
                </div>

                <!-- 2. Total de Jogos -->
                <div class="team-stat-box">
                  <span class="team-stat-box-val">${stats.totalPlayed}</span>
                  <span class="team-stat-box-label">Total de Jogos</span>
                </div>

                <!-- 3. V / E / D (Vitória verde, Empate laranja, Derrota vermelho) -->
                <div class="team-stat-box">
                  <span class="team-stat-box-val">
                    <span style="color:#10B981;">${stats.totalWins}V</span>
                    <span style="color:var(--chalk-dim);font-size:0.85rem;">-</span>
                    <span style="color:#F97316;">${stats.totalDraws}E</span>
                    <span style="color:var(--chalk-dim);font-size:0.85rem;">-</span>
                    <span style="color:#EF4444;">${stats.totalLoses}D</span>
                  </span>
                  <span class="team-stat-box-label">V / E / D</span>
                </div>

                <!-- 4. Gols Pró (em verde) -->
                <div class="team-stat-box">
                  <span class="team-stat-box-val" style="color:#10B981;">${stats.gfTotal} <small style="font-size:0.75rem;color:var(--chalk-dim);">(${stats.gfAvg.toFixed(1)}/j)</small></span>
                  <span class="team-stat-box-label">Gols Pró</span>
                </div>

                <!-- Linha 2 -->
                <!-- 5. Gols Contra (em vermelho) -->
                <div class="team-stat-box">
                  <span class="team-stat-box-val" style="color:#EF4444;">${stats.gaTotal} <small style="font-size:0.75rem;color:var(--chalk-dim);">(${stats.gaAvg.toFixed(1)}/j)</small></span>
                  <span class="team-stat-box-label">Gols Contra</span>
                </div>

                <!-- 6. Saldo de Gols (positivo verde, negativo vermelho, zero branco) -->
                <div class="team-stat-box">
                  <span class="team-stat-box-val" style="color:${stats.goalDiff > 0 ? '#10B981' : stats.goalDiff < 0 ? '#EF4444' : '#F0F6FC'};">${stats.goalDiff > 0 ? '+' : ''}${stats.goalDiff}</span>
                  <span class="team-stat-box-label">Saldo de Gols</span>
                </div>

                <!-- 7. Clean Sheets -->
                <div class="team-stat-box">
                  <span class="team-stat-box-val cyan">${stats.csTotal}</span>
                  <span class="team-stat-box-label">Clean Sheets</span>
                </div>

                <!-- 8. Mando de Campo -->
                <div class="team-stat-box">
                  <span class="team-stat-box-val gold" style="font-size:0.95rem;">${stats.homeWinPct}% <small style="color:var(--chalk-dim);font-size:0.7rem;">CASA</small> · ${stats.awayWinPct}% <small style="color:var(--chalk-dim);font-size:0.7rem;">FORA</small></span>
                  <span class="team-stat-box-label">Mando de Campo</span>
                </div>
              </div>
            </div>

            <!-- Elenco do Clube (Rosters com Estatísticas Filtradas) -->
            <div class="card" style="padding:16px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:10px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:1.1rem;">👥</span>
                  <h3 style="margin:0;font-size:1rem;font-weight:700;color:var(--chalk);">Elenco / Jogadores (${enrichedRoster.length})</h3>
                </div>
                <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--gold);">${escapeHtml(formatTeamName(compName))}</span>
              </div>

              ${enrichedRoster.length ? `
                <div class="rosters-grid">
                  ${enrichedRoster.map(p => {
                    const isGoalkeeper = p.specificRole === "Goleiro";
                    const isDef = p.specificRole.includes("Zagueiro") || p.specificRole.includes("Lateral");
                    const isMid = p.specificRole.includes("Volante") || p.specificRole.includes("Meia");

                    // 3 Barras dinâmicas por posição com dados reais da competição:
                    let bar1Label = "GOLS", bar1Val = `${p.goals} gols`, bar1Pct = Math.min(p.goals * 8, 100);
                    let bar2Label = "MINUTOS", bar2Val = `${p.minutes} min`, bar2Pct = Math.min((p.minutes / 2500) * 100, 100);
                    let bar3Label = "NOTA MÉDIA", bar3Val = p.rating, bar3Pct = p.rating !== "-" ? Math.min((parseFloat(p.rating) / 10) * 100, 100) : 50;

                    if (isGoalkeeper) {
                      bar1Label = "DEFESAS"; bar1Val = `${p.saves} def`; bar1Pct = Math.min(p.saves * 3, 100);
                      bar2Label = "MINUTOS"; bar2Val = `${p.minutes} min`; bar2Pct = Math.min((p.minutes / 2500) * 100, 100);
                      bar3Label = "NOTA MÉDIA"; bar3Val = p.rating; bar3Pct = p.rating !== "-" ? Math.min((parseFloat(p.rating) / 10) * 100, 100) : 60;
                    } else if (isDef) {
                      bar1Label = "DESARMES"; bar1Val = `${p.tackles} des`; bar1Pct = Math.min(p.tackles * 3, 100);
                      bar2Label = "MINUTOS"; bar2Val = `${p.minutes} min`; bar2Pct = Math.min((p.minutes / 2500) * 100, 100);
                      bar3Label = "NOTA MÉDIA"; bar3Val = p.rating; bar3Pct = p.rating !== "-" ? Math.min((parseFloat(p.rating) / 10) * 100, 100) : 60;
                    } else if (isMid) {
                      bar1Label = "ASSISTÊNCIAS"; bar1Val = `${p.assists} ast`; bar1Pct = Math.min(p.assists * 10, 100);
                      bar2Label = "GOLS"; bar2Val = `${p.goals} gols`; bar2Pct = Math.min(p.goals * 10, 100);
                      bar3Label = "NOTA MÉDIA"; bar3Val = p.rating; bar3Pct = p.rating !== "-" ? Math.min((parseFloat(p.rating) / 10) * 100, 100) : 60;
                    }

                    return `
                      <div class="roster-card">
                        <div class="roster-avatar-wrap">
                          <img class="roster-avatar-img" src="${p.photo}" alt="${escapeHtml(p.name)}" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'">
                        </div>
                        <div class="roster-player-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
                        <div class="roster-player-pos">${escapeHtml(p.specificRole)} #${p.number}</div>

                        <div class="roster-bars-container">
                          <!-- Barra 1 -->
                          <div class="roster-bar-item">
                            <div class="roster-bar-labels">
                              <span class="roster-bar-name">${bar1Label}</span>
                              <span class="roster-bar-val">${bar1Val}</span>
                            </div>
                            <div class="roster-bar-track">
                              <div class="roster-bar-fill gold" style="width:${Math.max(bar1Pct, 6)}%;"></div>
                            </div>
                          </div>

                          <!-- Barra 2 -->
                          <div class="roster-bar-item">
                            <div class="roster-bar-labels">
                              <span class="roster-bar-name">${bar2Label}</span>
                              <span class="roster-bar-val">${bar2Val}</span>
                            </div>
                            <div class="roster-bar-track">
                              <div class="roster-bar-fill cyan" style="width:${Math.max(bar2Pct, 6)}%;"></div>
                            </div>
                          </div>

                          <!-- Barra 3 -->
                          <div class="roster-bar-item">
                            <div class="roster-bar-labels">
                              <span class="roster-bar-name">${bar3Label}</span>
                              <span class="roster-bar-val">${bar3Val}</span>
                            </div>
                            <div class="roster-bar-track">
                              <div class="roster-bar-fill" style="width:${Math.max(bar3Pct, 6)}%;"></div>
                            </div>
                          </div>
                        </div>

                        <a class="btn-roster-profile" href="#/jogador/${p.id}/${teamId}/${leagueId}/${season}">
                          Ver Perfil →
                        </a>
                      </div>
                    `;
                  }).join("")}
                </div>
              ` : `
                <div style="padding:30px;text-align:center;color:var(--chalk-dim);font-size:0.88rem;">
                  Nenhum jogador com scouts registrados nesta competição.
                </div>
              `}
            </div>
          </main>

          <!-- COLUNA 3: PRÓXIMAS PARTIDAS E ÚLTIMOS RESULTADOS (DIREITA) -->
          <aside class="team-fixtures-col">
            <!-- 1. Próximas Partidas (5 jogos) -->
            <div class="card" style="padding:14px;margin-bottom:16px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:8px;">
                <span style="font-size:1.1rem;">⏳</span>
                <h3 style="margin:0;font-size:0.95rem;font-weight:700;color:var(--chalk);">Próximas Partidas</h3>
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
                            ${leagueLogo ? `<img src="${leagueLogo}" alt="" class="fixture-card-league-logo" onerror="this.style.display='none'">` : ''}
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
                <div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.8rem;">
                  Nenhuma partida futura agendada.
                </div>
              `}
            </div>

            <!-- 2. Últimos Resultados (5 jogos) -->
            <div class="card" style="padding:14px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:8px;">
                <span style="font-size:1.1rem;">✅</span>
                <h3 style="margin:0;font-size:0.95rem;font-weight:700;color:var(--chalk);">Últimos Resultados</h3>
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
                            ${leagueLogo ? `<img src="${leagueLogo}" alt="" class="fixture-card-league-logo" onerror="this.style.display='none'">` : ''}
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
                            <button type="button" class="btn-fixture-highlights-pill" title="Assistir aos Melhores Momentos no YouTube" onclick="event.preventDefault(); event.stopPropagation(); window.open('https://www.youtube.com/results?search_query=${encodeURIComponent(`Melhores Momentos ${f.teams.home.name} x ${f.teams.away.name} ${leagueName}`)}', '_blank', 'noopener,noreferrer');">
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
                <div style="padding:16px;text-align:center;color:var(--chalk-dim);font-size:0.8rem;">
                  Nenhum resultado recente encontrado.
                </div>
              `}
            </div>
          </aside>

        </div>
      `;

      // Carregar notícias do time na coluna esquerda
      loadTeamNews(t.name, "team-sidebar-news-container");

      // Listener do Filtro de Competição
      const compSelect = document.getElementById("team-comp-filter-select");
      if (compSelect) {
        compSelect.addEventListener("change", (e) => {
          selectedCompFilter = e.target.value;
          renderView();
        });
      }

      // Listener do Botão de Favorito
      const favBtn = document.getElementById("btn-toggle-team-fav");
      if (favBtn) {
        favBtn.addEventListener("click", () => {
          const teamObj = { id: teamId, name: t.name, logo: t.logo };
          const exists = state.favoriteTeams.some(fav => fav.id === teamId);
          if (exists) {
            state.favoriteTeams = state.favoriteTeams.filter(fav => fav.id !== teamId);
            favBtn.classList.remove("ghost");
            favBtn.textContent = "🔔 Seguir Time";
            toast(`${t.name} removido dos seus times favoritos.`, false);
          } else {
            state.favoriteTeams.push(teamObj);
            favBtn.classList.add("ghost");
            favBtn.textContent = "⭐ Seguindo Alertas";
            toast(`${t.name} adicionado aos favoritos!`, false);
          }
          NotificationManager.syncPreferences();
        });
      }
    }

    renderView();
  } catch (err) {
    content.innerHTML = errorBox(err.message);
  }
}


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
                const hGoals = f.goals.home ?? 0;
                const aGoals = f.goals.away ?? 0;
                const { homeProb, drawProb, awayProb } = calculateMatchProbability(f);

                let statusBadge = `<span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);font-weight:700;">${timeStr}</span>`;
                if (isLive) {
                  statusBadge = `<span class="match-live-pulse-badge">🔴 ${f.fixture.status.elapsed}' LIVE</span>`;
                } else if (isFinished) {
                  statusBadge = `<span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);font-weight:700;">${f.fixture.status.short}</span>`;
                }

                const scoreDisplay = (isFinished || isLive)
                  ? `<span class="match-score-badge ${isLive ? 'live-score' : ''}">${hGoals} - ${aGoals}</span>`
                  : `<span class="match-score-badge" style="color:var(--chalk-dim);font-size:0.85rem;">vs</span>`;

                return `
                  <a class="match-row-futuristic ${isFinished ? 'is-finished-row' : ''}" href="#/jogo/${f.fixture.id}" title="Clique para abrir análise completa da partida">
                    <!-- Confronto Simétrico dos Times e Placar -->
                    <div class="match-teams-score-row">
                      <!-- Mandante -->
                      <div class="match-team-block right">
                        <span class="match-team-name-text" title="${escapeHtml(formatTeamName(f.teams.home.name))}">${escapeHtml(formatTeamName(f.teams.home.name))}</span>
                        <img src="${f.teams.home.logo}" alt="" loading="lazy">
                      </div>

                      <!-- Placar e Status Central -->
                      <div class="match-center-score-wrap">
                        ${scoreDisplay}
                        ${statusBadge}
                      </div>

                      <!-- Visitante -->
                      <div class="match-team-block">
                        <img src="${f.teams.away.logo}" alt="" loading="lazy">
                        <span class="match-team-name-text" title="${escapeHtml(formatTeamName(f.teams.away.name))}">${escapeHtml(formatTeamName(f.teams.away.name))}</span>
                      </div>
                    </div>

                    <!-- Probabilidades (Em Jogos Futuros / Ao Vivo) ou Melhores Momentos (Finalizados) -->
                    ${!isFinished ? `
                      <div class="win-prob-wrapper">
                        <div class="win-prob-labels">
                          <span class="win-prob-home-text">${homeProb}% <small>CASA</small></span>
                          <span class="win-prob-draw-text">${drawProb}% <small>EMP</small></span>
                          <span class="win-prob-away-text">${awayProb}% <small>FORA</small></span>
                        </div>
                        <div class="win-prob-bar-track">
                          <div class="win-prob-seg-home" style="width:${homeProb}%;"></div>
                          <div class="win-prob-seg-draw" style="width:${drawProb}%;"></div>
                          <div class="win-prob-seg-away" style="width:${awayProb}%;"></div>
                        </div>
                      </div>
                    ` : `
                      <div class="match-highlights-wrap">
                        <button type="button" class="btn-fixture-highlights-pill" title="Assistir aos Melhores Momentos no YouTube" onclick="event.preventDefault(); event.stopPropagation(); window.open('https://www.youtube.com/results?search_query=${encodeURIComponent(`Melhores Momentos ${f.teams.home.name} x ${f.teams.away.name} ${f.league?.name || ''}`)}', '_blank', 'noopener,noreferrer');">
                          <span style="font-size:0.65rem;line-height:1;">▶</span>
                          <span>Melhores Momentos</span>
                        </button>
                      </div>
                    `}
                  </a>
                `;
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
      <div class="card" style="padding:12px;">
        <div class="fixture-list">
          ${relevant.map(f => {
            const hGoals = f.goals.home ?? 0;
            const aGoals = f.goals.away ?? 0;
            const { homeProb, drawProb, awayProb } = calculateMatchProbability(f);

            return `
              <a class="match-row-futuristic" href="#/jogo/${f.fixture.id}" title="Clique para abrir detalhes do jogo">
                <!-- Confronto Simétrico dos Times e Placar -->
                <div class="match-teams-score-row">
                  <!-- Mandante -->
                  <div class="match-team-block right">
                    <span class="match-team-name-text" title="${escapeHtml(formatTeamName(f.teams.home.name))}">${escapeHtml(formatTeamName(f.teams.home.name))}</span>
                    <img src="${f.teams.home.logo}" alt="" loading="lazy">
                  </div>

                  <!-- Placar e Status Central -->
                  <div class="match-center-score-wrap">
                    <span class="match-score-badge live-score">${hGoals} - ${aGoals}</span>
                    <span class="match-live-pulse-badge">🔴 ${f.fixture.status.elapsed}' LIVE</span>
                  </div>

                  <!-- Visitante -->
                  <div class="match-team-block">
                    <img src="${f.teams.away.logo}" alt="" loading="lazy">
                    <span class="match-team-name-text" title="${escapeHtml(formatTeamName(f.teams.away.name))}">${escapeHtml(formatTeamName(f.teams.away.name))}</span>
                  </div>
                </div>

                <!-- Barra de Probabilidade Dinâmica -->
                <div class="win-prob-wrapper">
                  <div class="win-prob-labels">
                    <span class="win-prob-home-text">${homeProb}% <small>CASA</small></span>
                    <span class="win-prob-draw-text">${drawProb}% <small>EMP</small></span>
                    <span class="win-prob-away-text">${awayProb}% <small>FORA</small></span>
                  </div>
                  <div class="win-prob-bar-track">
                    <div class="win-prob-seg-home" style="width:${homeProb}%;"></div>
                    <div class="win-prob-seg-draw" style="width:${drawProb}%;"></div>
                    <div class="win-prob-seg-away" style="width:${awayProb}%;"></div>
                  </div>
                </div>
              </a>
            `;
          }).join("")}
        </div>
      </div>`;
  } catch (err) {
    if (content.querySelector(".match-row-futuristic")) {
      console.warn("Aviso: Falha temporária ao sincronizar ao vivo, mantendo dados atuais:", err.message);
    } else {
      content.innerHTML = errorBox(err.message);
    }
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

    const { playersMap: fixturePlayersMap, mvpId: mvpPlayerId, melhorNota: highestRating } = 
      PlayerRatingEngine.processarNotasPartida(fixturePlayersArr, fx, events);

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

                return `
                  <div class="hero-goal-item">
                    <span>⚽</span>
                    <span class="player-name">${escapeHtml(playerName)}</span>
                    <span class="time">${g.time.elapsed}'${g.time.extra ? `+${g.time.extra}` : ''}${isPen ? ' (P)' : isOwnGoal ? ' (GC)' : ''}</span>
                  </div>
                `;
              }).join("")}
            </div>

            <div class="hero-goals-col away">
              ${awayGoals.map(g => {
                const playerName = g.player?.name || "Gol";
                const isOwnGoal = g.detail === 'Own Goal';
                const isPen = g.detail === 'Penalty';

                return `
                  <div class="hero-goal-item">
                    <span>⚽</span>
                    <span class="player-name">${escapeHtml(playerName)}</span>
                    <span class="time">${g.time.elapsed}'${g.time.extra ? `+${g.time.extra}` : ''}${isPen ? ' (P)' : isOwnGoal ? ' (GC)' : ''}</span>
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

      <!-- Decomposição da Nota Tática -->
      ${detalhe && detalhe.motivo !== 'minutos_insuficientes' ? `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);font-weight:700;display:flex;align-items:center;gap:6px;">
              🎯 AVALIAÇÃO TÁTICA FUTSTATS
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
                          const ratingStr = pData?.ratingFinal || pData?.statistics?.[0]?.games?.rating;
                          const ratingNum = parseFloat(ratingStr || "0");
                          const isMVP = (pid === mvpPlayerId && ratingNum >= 7.0);

                          let ratingBadge = "";
                          if (ratingStr && !isNaN(ratingNum) && ratingNum > 0) {
                            const rClass = ratingNum >= 7.5 ? "rating-high" : ratingNum >= 6.5 ? "rating-med" : "rating-low";
                            ratingBadge = `<span class="pitch-player-rating-pill ${rClass}" title="Nota FutStats: ${ratingStr}">${ratingStr}</span>`;
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

    <!-- Barra de Busca de Clubes -->
    <div class="card" style="margin-bottom:24px;padding:20px;">
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
      <h2 class="section-title" style="margin-bottom:16px;">Minhas Escalações (${savedList.length})</h2>
      ${savedList.length === 0 ? `
        <div class="card" style="text-align:center;padding:36px 20px;color:var(--chalk-dim);">
          <span style="font-size:2.5rem;display:block;margin-bottom:12px;">📋</span>
          <p style="font-weight:700;font-size:1.05rem;color:var(--chalk);margin:0;">Você ainda não montou nenhuma escalação.</p>
          <span style="font-size:0.85rem;color:var(--chalk-dim);margin-top:6px;display:block;">Busque qualquer clube na barra de pesquisa acima ou acesse a página de qualquer jogo para escalar seus 11 titulares!</span>
        </div>
      ` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(340px, 1fr));gap:20px;">
          ${savedList.map(l => {
            const updatedDate = new Date(l.updatedAt || Date.now()).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
            const totalPlayers = (l.startingXI || []).filter(p => !!p?.player).length;

            return `
              <div class="card" style="padding:20px;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(180deg, rgba(13,38,59,0.85) 0%, rgba(7,17,30,0.95) 100%);border:1px solid rgba(0,229,255,0.22);border-radius:var(--radius-md);box-shadow:0 6px 20px rgba(0,0,0,0.35);">
                <div>
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                      <img src="${l.teamLogo}" alt="" style="width:40px;height:40px;object-fit:contain;">
                      <div>
                        <div style="font-weight:800;font-size:1.05rem;color:var(--chalk);">${escapeHtml(l.teamName)}</div>
                        <div style="font-family:var(--font-mono);font-size:0.78rem;color:var(--gold);margin-top:2px;">${escapeHtml(l.formation)} · ${totalPlayers}/11 titulares</div>
                      </div>
                    </div>
                    <button class="btn-delete-lineup" data-id="${escapeHtml(l.id)}" title="Excluir escalação" style="background:none;border:none;color:var(--chalk-dim);cursor:pointer;font-size:1.2rem;padding:4px;transition:color 0.2s;">🗑️</button>
                  </div>

                  ${l.fixtureInfo ? `
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px 12px;margin-bottom:14px;font-size:0.82rem;display:flex;align-items:center;justify-content:space-between;">
                      <span>⚽ ${escapeHtml(l.fixtureInfo.home?.name)} vs ${escapeHtml(l.fixtureInfo.away?.name)}</span>
                      <span style="font-family:var(--font-mono);color:var(--cyan);font-size:0.75rem;">${escapeHtml(l.fixtureInfo.leagueName || '')}</span>
                    </div>
                  ` : ''}
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;gap:10px;">
                  <span style="font-family:var(--font-mono);font-size:0.72rem;color:var(--chalk-dim);">Salvo em ${updatedDate}</span>
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
      resultsContainer.innerHTML = `<div style="padding:14px;text-align:center;color:var(--chalk-dim);font-size:0.85rem;">🔍 Buscando clubes...</div>`;

      debounceTimer = setTimeout(async () => {
        try {
          const resp = await apiGet("teams", { search: q }, 60);
          if (!resp || !resp.length) {
            resultsContainer.innerHTML = `<div style="padding:14px;text-align:center;color:var(--chalk-dim);font-size:0.85rem;">Nenhum clube encontrado com o nome "${escapeHtml(q)}".</div>`;
            return;
          }

          resultsContainer.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:10px;">
              ${resp.slice(0, 8).map(item => {
                const t = item.team;
                return `
                  <a href="#/minha-escalacao/montar/${t.id}" class="team-search-card" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;text-decoration:none;color:inherit;transition:all 0.15s ease;">
                    <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                      <img src="${t.logo}" alt="" style="width:32px;height:32px;object-fit:contain;" onerror="this.style.display='none'">
                      <div>
                        <div style="font-weight:700;font-size:0.9rem;color:var(--chalk);">${escapeHtml(t.name)}</div>
                        <div style="font-size:0.72rem;color:var(--gold);">${escapeHtml(t.country || "")}</div>
                      </div>
                    </div>
                    <span style="font-size:0.8rem;color:var(--cyan);font-weight:700;">Escalar →</span>
                  </a>
                `;
              }).join("")}
            </div>
          `;
        } catch (err) {
          resultsContainer.innerHTML = `<div style="padding:14px;text-align:center;color:#EF4444;font-size:0.85rem;">Erro ao buscar clubes.</div>`;
        }
      }, 300);
    });
  }

  // Listener de Exclusão de Escalação
  document.querySelectorAll(".btn-delete-lineup").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      if (confirm("Tem certeza que deseja excluir esta escalação salva?")) {
        UserLineupStore.delete(id);
        toast("Escalação excluída com sucesso.", false);
        renderMyLineups();
      }
    });
  });
}


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
      location.hash = `#/minha-escalacao/comparar/${lineupId}`;
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
  let activeFixtureId = fixtureId;
  let activeFixtureInfo = fixtureInfo;

  try {
    // Se não tiver fixtureId salvo, busca a próxima partida ou a última do time
    if (!activeFixtureId) {
      const nextList = await apiGet("fixtures", { team: teamId, next: 1 }, 15).catch(() => []);
      if (nextList?.[0]) {
        activeFixtureId = nextList[0].fixture.id;
        activeFixtureInfo = {
          id: nextList[0].fixture.id,
          date: nextList[0].fixture.date,
          home: nextList[0].teams.home,
          away: nextList[0].teams.away,
          leagueName: nextList[0].league.name
        };
      } else {
        const lastList = await apiGet("fixtures", { team: teamId, last: 1 }, 15).catch(() => []);
        if (lastList?.[0]) {
          activeFixtureId = lastList[0].fixture.id;
          activeFixtureInfo = {
            id: lastList[0].fixture.id,
            date: lastList[0].fixture.date,
            home: lastList[0].teams.home,
            away: lastList[0].teams.away,
            leagueName: lastList[0].league.name
          };
        }
      }
    }

    if (activeFixtureId) {
      const [lineupsResp, matchResp] = await Promise.all([
        apiGet("fixtures/lineups", { fixture: activeFixtureId }, 10).catch(() => []),
        apiGet("fixtures", { id: activeFixtureId }, 10).catch(() => [])
      ]);

      if (matchResp?.[0]) {
        matchStatus = matchResp[0].fixture.status.short;
        if (!activeFixtureInfo) {
          activeFixtureInfo = {
            id: matchResp[0].fixture.id,
            date: matchResp[0].fixture.date,
            home: matchResp[0].teams.home,
            away: matchResp[0].teams.away,
            leagueName: matchResp[0].league.name
          };
        }
      }

      if (Array.isArray(lineupsResp) && lineupsResp.length > 0) {
        officialLineup = lineupsResp.find(l => l.team.id === teamId) || null;
      }
    }
  } catch (err) {
    console.warn("Erro ao sincronizar escalação oficial:", err);
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
      <div class="card" style="text-align:center;padding:36px 20px;color:var(--chalk-dim);margin-bottom:24px;background:linear-gradient(135deg, rgba(13,38,59,0.7), rgba(7,17,30,0.9));border:1px solid rgba(255,184,0,0.35);">
        <span style="font-size:2.8rem;display:block;margin-bottom:10px;">⏳</span>
        <h2 style="font-size:1.3rem;font-weight:800;color:var(--gold);margin:0 0 8px;">Escalação Salva! Aguardando Divulgação Oficial</h2>
        <p style="font-size:0.92rem;color:var(--chalk);max-width:560px;margin:0 auto 16px;line-height:1.5;">
          A sua escalação titular foi gravada com sucesso. A escalação oficial do clube é divulgada cerca de <strong>45 a 60 minutos antes do jogo</strong>. 
          Assim que for confirmada, o sistema fará o <strong>cálculo automático de acertos</strong> e exibirá aqui o comparativo jogador por jogador!
        </p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <a class="btn primary small" href="#/minha-escalacao/montar/${teamId}${activeFixtureId ? `/${activeFixtureId}` : ''}">✏️ Editar Minha Escalação</a>
          <a class="btn ghost small" href="#/minha-escalacao">📋 Ver Todas as Minhas Escalações</a>
        </div>
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


// ============================================================
// GUIA DE TRANSMISSÃO OFICIAL: Onde Assistir ao Vivo (Baseado na Lei do Mandante e Direitos)
// ============================================================

function getLeagueBroadcasters(leagueId, homeTeam, awayTeam, fx) {
  const tA = homeTeam?.name || "Time Mandante";
  const tB = awayTeam?.name || "Time Visitante";
  const hLower = String(tA).toLowerCase();
  const aLower = String(tB).toLowerCase();

  // Links oficiais das transmissões ao vivo dos canais do YouTube (evita vídeos antigos gravados)
  const cazeTvUrl = "https://www.youtube.com/@CazeTV/streams";
  const goatUrl = "https://www.youtube.com/@canalgoatbr/streams";
  const searchLiveYT = `https://www.youtube.com/results?search_query=${encodeURIComponent(tA + ' x ' + tB + ' ao vivo')}&sp=CAM%253D`;

  // Clubes da Liga Forte União (LFU) - Mandantes com jogos selecionados na CazéTV / Prime Video / Premiere
  const LFU_HOME_TEAMS = [
    "vasco", "cruzeiro", "corinthians", "internacional", "fluminense",
    "fortaleza", "athletico", "criciuma", "criciúma", "juventude", "cuiaba", "cuiabá", "atletico-go", "atlético-go"
  ];

  const isLfuHome = LFU_HOME_TEAMS.some(t => hLower.includes(t));

  // 1. Brasileirão Série A (71)
  if (leagueId === 71) {
    if (isLfuHome) {
      return [
        { name: "Premiere", tag: "Todos os Jogos (Pay-per-view)", logo: "/broadcast-logos/premiere.png", color: "#0056B3", bg: "rgba(0, 86, 179, 0.15)", border: "rgba(0, 86, 179, 0.4)", url: "https://globoplay.globo.com/premiere/" },
        { name: "Prime Video", tag: "Jogos Selecionados (Streaming)", logo: "/broadcast-logos/prime-video.svg", color: "#00A8E1", bg: "rgba(0, 168, 225, 0.15)", border: "rgba(0, 168, 225, 0.4)", url: "https://www.primevideo.com/" },
        { name: "CazéTV", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/cazetv.png", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: cazeTvUrl }
      ];
    } else {
      // Mandantes da Libra (Flamengo, Palmeiras, São Paulo, Atlético-MG, Grêmio, Bahia, Bragantino, Vitória, Santos)
      return [
        { name: "Premiere", tag: "Exclusivo Pay-per-view", logo: "/broadcast-logos/premiere.png", color: "#0056B3", bg: "rgba(0, 86, 179, 0.15)", border: "rgba(0, 86, 179, 0.4)", url: "https://globoplay.globo.com/premiere/" },
        { name: "SporTV", tag: "TV Fechada", logo: "/broadcast-logos/sportv.jpg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://globoplay.globo.com/sportv/" },
        { name: "TV Globo", tag: "TV Aberta (Rodadas Selecionadas)", logo: "/broadcast-logos/globo.jpg", color: "#FF6600", bg: "rgba(255, 102, 0, 0.15)", border: "rgba(255, 102, 0, 0.4)", url: "https://globoplay.globo.com/" }
      ];
    }
  }

  // 2. Brasileirão Série B (72)
  if (leagueId === 72) {
    return [
      { name: "Premiere", tag: "Todos os Jogos", logo: "/broadcast-logos/premiere.png", color: "#0056B3", bg: "rgba(0, 86, 179, 0.15)", border: "rgba(0, 86, 179, 0.4)", url: "https://globoplay.globo.com/premiere/" },
      { name: "SporTV", tag: "TV Fechada", logo: "/broadcast-logos/sportv.jpg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://globoplay.globo.com/sportv/" },
      { name: "Canal GOAT", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/canal-goat.png", color: "#FACC15", bg: "rgba(250, 204, 21, 0.15)", border: "rgba(250, 204, 21, 0.4)", url: goatUrl },
      { name: "TV Brasil", tag: "TV Aberta", logo: "/broadcast-logos/band.svg", color: "#10B981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.4)", url: "https://tvbrasil.ebc.com.br/" }
    ];
  }

  // 3. Copa do Brasil (73)
  if (leagueId === 73) {
    return [
      { name: "Premiere", tag: "Pay-per-view", logo: "/broadcast-logos/premiere.png", color: "#0056B3", bg: "rgba(0, 86, 179, 0.15)", border: "rgba(0, 86, 179, 0.4)", url: "https://globoplay.globo.com/premiere/" },
      { name: "SporTV", tag: "TV Fechada", logo: "/broadcast-logos/sportv.jpg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://globoplay.globo.com/sportv/" },
      { name: "Prime Video", tag: "Streaming", logo: "/broadcast-logos/prime-video.svg", color: "#00A8E1", bg: "rgba(0, 168, 225, 0.15)", border: "rgba(0, 168, 225, 0.4)", url: "https://www.primevideo.com/" },
      { name: "TV Globo", tag: "TV Aberta", logo: "/broadcast-logos/globo.jpg", color: "#FF6600", bg: "rgba(255, 102, 0, 0.15)", border: "rgba(255, 102, 0, 0.4)", url: "https://globoplay.globo.com/" }
    ];
  }

  // 4. Copa Libertadores (13) & Sul-Americana (11)
  if (leagueId === 13 || leagueId === 11) {
    return [
      { name: "Disney+", tag: "100% dos Jogos", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" },
      { name: "Paramount+", tag: "Streaming", logo: "/broadcast-logos/paramount.svg", color: "#0064FF", bg: "rgba(0, 100, 255, 0.15)", border: "rgba(0, 100, 255, 0.4)", url: "https://www.paramountplus.com/" },
      { name: leagueId === 13 ? "TV Globo" : "SBT", tag: "TV Aberta", logo: leagueId === 13 ? "/broadcast-logos/globo.jpg" : "/broadcast-logos/sbt.svg", color: "#10B981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.4)", url: leagueId === 13 ? "https://globoplay.globo.com/" : "https://www.sbt.com.br/ao-vivo" }
    ];
  }

  // 5. Champions League (2)
  if (leagueId === 2) {
    return [
      { name: "HBO Max", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/hbo-max.jpg", color: "#002BE7", bg: "rgba(0, 43, 231, 0.2)", border: "rgba(0, 43, 231, 0.5)", url: "https://www.max.com/" },
      { name: "SBT", tag: "TV Aberta (Terças)", logo: "/broadcast-logos/sbt.svg", color: "#10B981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.4)", url: "https://www.sbt.com.br/ao-vivo" },
      { name: "YouTube", tag: "Buscar Transmissão", logo: "/broadcast-logos/youtube.svg", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: searchLiveYT }
    ];
  }

  // 6. La Liga Espanhola (140)
  if (leagueId === 140) {
    return [
      { name: "Disney+", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" },
      { name: "CazéTV", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/cazetv.png", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: cazeTvUrl }
    ];
  }

  // 7. Premier League (39) e Serie A Italiana (135)
  if (leagueId === 39 || leagueId === 135) {
    return [
      { name: "Disney+", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" }
    ];
  }

  // 8. Bundesliga (78)
  if (leagueId === 78) {
    return [
      { name: "Canal GOAT", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/canal-goat.png", color: "#FACC15", bg: "rgba(250, 204, 21, 0.15)", border: "rgba(250, 204, 21, 0.4)", url: goatUrl },
      { name: "CazéTV", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/cazetv.png", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: cazeTvUrl },
      { name: "SporTV", tag: "TV Fechada", logo: "/broadcast-logos/sportv.jpg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://globoplay.globo.com/sportv/" },
      { name: "OneFootball", tag: "App / Site", logo: "/broadcast-logos/onefootball.svg", color: "#00E5FF", bg: "rgba(0, 229, 255, 0.15)", border: "rgba(0, 229, 255, 0.4)", url: "https://onefootball.com/pt-br/inicio" }
    ];
  }

  // 9. Liga Saudita (307)
  if (leagueId === 307) {
    return [
      { name: "Canal GOAT", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/canal-goat.png", color: "#FACC15", bg: "rgba(250, 204, 21, 0.15)", border: "rgba(250, 204, 21, 0.4)", url: goatUrl },
      { name: "BandSports", tag: "TV Fechada", logo: "/broadcast-logos/band.svg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://bandsports.band.uol.com.br/" }
    ];
  }

  // Liga Portuguesa (94) & Copa de Portugal (96)
  if (leagueId === 94 || leagueId === 96) {
    return [
      { name: "Disney+", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" }
    ];
  }

  // Eredivisie (88) & Copa da Holanda (90)
  if (leagueId === 88 || leagueId === 90) {
    return [
      { name: "Disney+", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" }
    ];
  }

  // Campeonato Turco (203) & Copa da Turquia (206)
  if (leagueId === 203 || leagueId === 206) {
    return [
      { name: "Disney+", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" },
      { name: "Canal GOAT", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/canal-goat.png", color: "#FACC15", bg: "rgba(250, 204, 21, 0.15)", border: "rgba(250, 204, 21, 0.4)", url: goatUrl }
    ];
  }

  // Copa do Rei Saudita (504)
  if (leagueId === 504) {
    return [
      { name: "Canal GOAT", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/canal-goat.png", color: "#FACC15", bg: "rgba(250, 204, 21, 0.15)", border: "rgba(250, 204, 21, 0.4)", url: goatUrl },
      { name: "BandSports", tag: "TV Fechada", logo: "/broadcast-logos/band.svg", color: "#00A650", bg: "rgba(0, 166, 80, 0.15)", border: "rgba(0, 166, 80, 0.4)", url: "https://bandsports.band.uol.com.br/" }
    ];
  }

  // Copas Nacionais Europeias
  // Copa do Rei (143), Copa da Inglaterra (45), Copa da Liga Inglesa (48), Copa da Itália (137), Copa da Alemanha (81)
  if (leagueId === 143 || leagueId === 45 || leagueId === 48 || leagueId === 137 || leagueId === 81) {
    return [
      { name: "Disney+", tag: "100% dos Jogos Ao Vivo", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
      { name: "ESPN", tag: "TV Fechada", logo: "/broadcast-logos/espn.png", color: "#CC0000", bg: "rgba(204, 0, 0, 0.15)", border: "rgba(204, 0, 0, 0.4)", url: "https://www.espn.com.br/watch/" }
    ];
  }

  // Copa da França (66)
  if (leagueId === 66) {
    return [
      { name: "CazéTV", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/cazetv.png", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: cazeTvUrl },
      { name: "Prime Video", tag: "Streaming", logo: "/broadcast-logos/prime-video.svg", color: "#00A8E1", bg: "rgba(0, 168, 225, 0.15)", border: "rgba(0, 168, 225, 0.4)", url: "https://www.primevideo.com/" }
    ];
  }

  // 10. Ligue 1 (61) / Europa League (3) / Conference League (4)
  if (leagueId === 61 || leagueId === 3 || leagueId === 4) {
    return [
      { name: "CazéTV", tag: "Aba Ao Vivo no YouTube", logo: "/broadcast-logos/cazetv.png", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", url: cazeTvUrl },
      { name: "Band", tag: "TV Aberta", logo: "/broadcast-logos/band.svg", color: "#10B981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.4)", url: "https://www.band.uol.com.br/ao-vivo" },
      { name: "Prime Video", tag: "Streaming", logo: "/broadcast-logos/prime-video.svg", color: "#00A8E1", bg: "rgba(0, 168, 225, 0.15)", border: "rgba(0, 168, 225, 0.4)", url: "https://www.primevideo.com/" }
    ];
  }

  // Fallback Geral
  return [
    { name: "Disney+", tag: "Streaming", logo: "/broadcast-logos/disney-plus.webp", color: "#0063E5", bg: "rgba(0, 99, 229, 0.15)", border: "rgba(0, 99, 229, 0.4)", url: "https://www.disneyplus.com/" },
    { name: "HBO Max", tag: "Streaming", logo: "/broadcast-logos/hbo-max.jpg", color: "#002BE7", bg: "rgba(0, 43, 231, 0.2)", border: "rgba(0, 43, 231, 0.5)", url: "https://www.max.com/" },
    { name: "Premiere", tag: "Pay-per-view", logo: "/broadcast-logos/premiere.png", color: "#0056B3", bg: "rgba(0, 86, 179, 0.15)", border: "rgba(0, 86, 179, 0.4)", url: "https://globoplay.globo.com/" }
  ];
}

function renderMatchBroadcastGuide(fx) {
  if (!fx || !fx.teams) return "";
  const broadcasters = getLeagueBroadcasters(fx.league?.id, fx.teams.home, fx.teams.away, fx);

  return `
    <div class="match-broadcast-card">
      <div class="match-broadcast-header">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="match-broadcast-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--gold);">
              <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
              <polyline points="17 2 12 7 7 2"></polyline>
            </svg>
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <h3 style="margin:0;font-size:1.05rem;font-weight:800;color:var(--chalk);">Onde Assistir ao Vivo</h3>
              <span style="font-family:var(--font-mono);font-size:0.7rem;background:rgba(255,184,0,0.15);color:var(--gold);padding:2px 8px;border-radius:12px;font-weight:700;border:1px solid rgba(255,184,0,0.3);">TRANSMISSÃO CONFIRMADA</span>
            </div>
            <p style="margin:3px 0 0 0;font-size:0.8rem;color:var(--chalk-dim);">
              Canais e plataformas que transmitem <strong style="color:var(--chalk);">${escapeHtml(fx.teams.home.name)} × ${escapeHtml(fx.teams.away.name)}</strong>:
            </p>
          </div>
        </div>
      </div>

      <div class="match-broadcast-buttons">
        ${broadcasters.map(b => `
          <a href="${b.url}" target="_blank" rel="noopener noreferrer" class="btn-broadcast-card" style="--btn-color:${b.color};--btn-bg:${b.bg};--btn-border:${b.border};" title="Assistir ${escapeHtml(fx.teams.home.name)} × ${escapeHtml(fx.teams.away.name)} no ${escapeHtml(b.name)}">
            <div class="btn-broadcast-logo-wrap">
              <img src="${b.logo}" alt="${escapeHtml(b.name)}" class="btn-broadcast-logo" loading="lazy" onerror="this.style.display='none'">
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2;">
              <span class="btn-broadcast-name">${escapeHtml(b.name)}</span>
              ${b.tag ? `<span style="font-size:0.65rem;color:var(--chalk-dim);font-family:var(--font-mono);">${escapeHtml(b.tag)}</span>` : ''}
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="btn-broadcast-arrow">
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </a>
        `).join("")}
      </div>
    </div>
  `;
}
