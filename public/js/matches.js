if (typeof getLocalDateString !== 'function') {
  var getLocalDateString = function(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
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

// ponytail: peso de relevância para seleção inteligente do jogo destaque
const SPOTLIGHT_TIER_1_LEAGUES = new Set([2, 1, 13, 71, 39, 140, 4, 9, 14]);
const SPOTLIGHT_TIER_2_LEAGUES = new Set([135, 78, 61, 73, 3, 5, 10]);

function getSpotlightScore(f, favTeamId = null, favFixtureIds = new Set()) {
  let score = 0;
  const homeId = Number(f.teams?.home?.id);
  const awayId = Number(f.teams?.away?.id);
  const fixtureId = Number(f.fixture?.id);

  // 1. Time do coração do usuário (prioridade máxima absoluta)
  if (favTeamId && (homeId === favTeamId || awayId === favTeamId)) {
    score += 1000;
  }

  // 2. Partida favoritada/seguida pelo usuário
  if (favFixtureIds.has(fixtureId)) {
    score += 500;
  }

  // 3. Status da partida (Ao vivo > Agendado > Encerrado)
  const statusCat = typeof getMatchStatusCategory === 'function' ? getMatchStatusCategory(f.fixture) : null;
  if (statusCat?.isLive) {
    score += 300;
  } else if (statusCat?.isScheduled) {
    score += 100;
  } else if (statusCat?.isFinished) {
    score += 10;
  }

  // 4. Peso / Prestígio da Competição
  const leagueId = Number(f.league?.id);
  if (SPOTLIGHT_TIER_1_LEAGUES.has(leagueId)) {
    score += 80;
  } else if (SPOTLIGHT_TIER_2_LEAGUES.has(leagueId)) {
    score += 50;
  } else {
    score += 20;
  }

  // 5. Qualidade dos dados / Escudos disponíveis
  const homeLogo = String(f.teams?.home?.logo || '');
  const awayLogo = String(f.teams?.away?.logo || '');
  if (homeLogo && awayLogo && !homeLogo.includes('not-available') && !awayLogo.includes('not-available')) {
    score += 25;
  }

  // 6. Penalização para fases muito preliminares (ex: 1/128-finals)
  const round = String(f.league?.round || '');
  if (/\b(?:1\/128|1\/64|prelimin|qualif)/i.test(round)) {
    score -= 35;
  }

  return score;
}

function renderDaySpotlight(fixtures) {
  if (!fixtures.length) return '';

  const favTeam = typeof UserPrefs !== 'undefined' && typeof UserPrefs.getFavoriteTeam === 'function' ? UserPrefs.getFavoriteTeam() : null;
  const favTeamId = favTeam?.id ? Number(favTeam.id) : null;
  const favFixtureIds = new Set(
    typeof state !== 'undefined' && Array.isArray(state?.favoriteFixtures)
      ? state.favoriteFixtures.map(f => Number(f.id))
      : []
  );

  const sorted = [...fixtures].sort((a, b) => {
    const scoreDiff = getSpotlightScore(b, favTeamId, favFixtureIds) - getSpotlightScore(a, favTeamId, favFixtureIds);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(a.fixture?.date || 0) - new Date(b.fixture?.date || 0);
  });

  const featured = sorted[0];
  const status = getMatchStatusCategory(featured.fixture);
  const hasScore = status.isLive || status.isFinished;
  const kickoff = new Date(featured.fixture.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const score = hasScore ? `${featured.goals?.home ?? '—'} : ${featured.goals?.away ?? '—'}` : '×';
  const statusText = status.isLive ? `● ${status.label} AO VIVO` : status.isFinished ? 'Encerrado' : status.isPostponed ? status.label : `${kickoff} · A começar`;
  return `
    <article class="day-spotlight" aria-label="Partida em destaque">
      <div class="day-spotlight-head"><span>${escapeHtml(featured.league?.name || 'Partida')} · ${escapeHtml(formatRoundName(featured.league?.round || ''))}</span><span class="day-spotlight-status ${status.isLive ? 'is-live' : ''}">${escapeHtml(statusText)}</span></div>
      <a class="day-spotlight-main" href="#/jogo/${featured.fixture.id}">
        <div class="day-spotlight-team">${featured.teams.home.logo ? `<img src="${sanitizeUrl(featured.teams.home.logo)}" alt="" loading="lazy">` : ''}<strong>${escapeHtml(featured.teams.home.name)}</strong></div>
        <div class="day-spotlight-score"><strong>${escapeHtml(score)}</strong><small>${hasScore ? escapeHtml(status.short) : kickoff}</small></div>
        <div class="day-spotlight-team away">${featured.teams.away.logo ? `<img src="${sanitizeUrl(featured.teams.away.logo)}" alt="" loading="lazy">` : ''}<strong>${escapeHtml(featured.teams.away.name)}</strong></div>
      </a>
      <a class="day-spotlight-foot" href="#/jogo/${featured.fixture.id}">Ver detalhes da partida <span aria-hidden="true">↗</span></a>
    </article>`;
}

function isFixtureFinished(fav, liveMatch = null) {
  if (!fav && !liveMatch) return false;

  const fxObj = liveMatch?.fixture || (fav?.status ? fav : null);
  if (fxObj) {
    if (typeof getMatchStatusCategory === 'function') {
      const statusCat = getMatchStatusCategory(fxObj);
      if (statusCat) {
        if (statusCat.isFinished) return true;
        if (statusCat.isPostponed && ['CANC', 'ABD'].includes(String(statusCat.short || '').toUpperCase())) return true;
        if (statusCat.isLive || statusCat.isScheduled) return false;
      }
    }
    const short = String(fxObj.status?.short || fxObj.short || '').toUpperCase();
    if (['FT', 'AET', 'PEN', 'AWD', 'WO', 'CANC', 'ABD'].includes(short)) return true;
    if (['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE', 'NS', 'TBD'].includes(short)) return false;
  }

  const dateStr = liveMatch?.fixture?.date || fav?.date;
  if (dateStr) {
    const kickoffDate = new Date(dateStr);
    const kickoff = kickoffDate.getTime();
    if (Number.isFinite(kickoff)) {
      const todayStr = typeof getLocalDateString === 'function' ? getLocalDateString(new Date()) : '';
      const matchDay = (kickoffDate instanceof Date && !isNaN(kickoffDate))
        ? `${kickoffDate.getFullYear()}-${String(kickoffDate.getMonth() + 1).padStart(2, '0')}-${String(kickoffDate.getDate()).padStart(2, '0')}`
        : '';

      if (todayStr && matchDay && matchDay > todayStr) return false;
      if (todayStr && matchDay && matchDay < todayStr) return true;

      const minutesSinceKickoff = (Date.now() - kickoff) / 60000;
      if (minutesSinceKickoff > 160) return true;
    }
  }

  return false;
}

function cleanFinishedFavoriteFixtures(knownFixtures = []) {
  if (typeof state === 'undefined' || !Array.isArray(state.favoriteFixtures) || !state.favoriteFixtures.length) {
    return false;
  }
  const beforeCount = state.favoriteFixtures.length;
  const remaining = state.favoriteFixtures.filter(fav => {
    const match = knownFixtures?.find(f => Number(f.fixture?.id) === Number(fav.id));
    return !isFixtureFinished(fav, match);
  });

  if (remaining.length !== beforeCount) {
    state.favoriteFixtures = remaining;
    try {
      localStorage.setItem("ap_fav_fixtures", JSON.stringify(state.favoriteFixtures));
    } catch { /* storage fallback */ }

    if (typeof NotificationManager !== 'undefined' && typeof NotificationManager.syncPreferences === 'function') {
      NotificationManager.syncPreferences().catch(err => {
        console.warn("Preferências de alertas sincronizadas localmente; erro remoto:", err);
      });
    }
    return true;
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.isFixtureFinished = isFixtureFinished;
  window.cleanFinishedFavoriteFixtures = cleanFinishedFavoriteFixtures;
  window.getSpotlightScore = getSpotlightScore;
}

// ---------- Classificação rotativa (coluna esquerda de "Jogos do Dia") ----------
// Gira entre os campeonatos com jogos no dia (ordem de LEAGUES) a cada 15s. Cada
// tabela só é buscada quando entra na tela (cache de 15 min em apiGet). Copas
// sem tabela são puladas; fases de grupos viram um slide por grupo.
const DAY_STANDINGS_FALLBACK = [71, 39, 140];
const DAY_STANDINGS_MAX_SLIDES = 12;
const dayStandings = { key: "", fixtures: [], slides: [], index: 0, userPaused: false, hoverPaused: false, requestId: 0, doc: null };

// O document da tela lança erro quando a tela já foi trocada; aqui isso vira null.
function dayStandingsEl(id) {
  try { return dayStandings.doc?.getElementById(id) || null; } catch { return null; }
}

function dayStandingsCompetitions(fixtures) {
  const byId = new Map();
  (fixtures || []).forEach(f => {
    const id = f.league?.id;
    if (id != null && !byId.has(id)) byId.set(id, { id, season: f.league.season, logo: f.league.logo, apiName: f.league.name });
  });
  const ordered = LEAGUES.filter(l => byId.has(l.id)).map(l => ({ ...byId.get(l.id), name: l.name }));
  if (ordered.length) return ordered;
  return DAY_STANDINGS_FALLBACK.map(id => {
    const league = LEAGUES.find(l => l.id === id);
    return { id, season: defaultSeasonFor(league), logo: `https://media.api-sports.io/football/leagues/${id}.png`, name: league?.name || "" };
  });
}

// Variação de posição em relação à rodada anterior. A API devolve status "same"
// para todos, então a tabela anterior é recalculada sem os jogos da última rodada
// disputada (motor de desempate da página da liga). A posição atual é a OFICIAL
// (ordem de `rows`), para a seta sempre bater com a posição exibida.
// Retorna Map(teamId -> posições ganhas; negativo = caiu) ou null sem referência.
function dayStandingsRoundNumber(round) {
  const m = String(round || "").match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

function dayStandingsMovement(rows, fixtures, leagueId) {
  if (typeof computeTableFromFixtures !== "function" || !Array.isArray(fixtures)) return null;
  const ids = new Set(rows.map(t => t.team?.id));
  const finished = fixtures.filter(f => FINISHED_STATUS.includes(f.fixture?.status?.short)
    && ids.has(f.teams?.home?.id) && ids.has(f.teams?.away?.id)
    && dayStandingsRoundNumber(f.league?.round) != null);
  if (!finished.length) return null;
  const lastRound = Math.max(...finished.map(f => dayStandingsRoundNumber(f.league.round)));
  const before = finished.filter(f => dayStandingsRoundNumber(f.league.round) < lastRound);
  if (!before.length) return null; // primeira rodada: não há tabela anterior
  const previous = computeTableFromFixtures(before, rows, {}, leagueId);
  const prevPos = new Map(previous.map((t, i) => [t.team.id, i]));
  const official = [...rows].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  return new Map(official.map((t, i) => [t.team.id, prevPos.has(t.team.id) ? prevPos.get(t.team.id) - i : 0]));
}

// Tabela "ao vivo": soma o placar atual dos jogos em andamento do campeonato à tabela
// oficial (a API só atualiza a classificação depois do apito final) e reordena com o
// motor de desempate da página da liga. Retorna null quando não há jogo ao vivo.
function dayStandingsLive(rows, fixtures, leagueId, finished = []) {
  const updatedAt = new Map(rows.map(t => [t.team?.id, Date.parse(t.update)]));
  // Jogo encerrado há pouco ainda fora da tabela oficial: terminou (início + ~2h) depois do
  // "update" da linha do time. Sem "update", só os jogos em andamento entram.
  const notInOfficial = f => (f.fixture?.timestamp || 0) * 1000 + 2 * 3600000 > updatedAt.get(f.teams.home.id);
  const live = (fixtures || []).filter(f => {
    if (f.league?.id !== leagueId || !updatedAt.has(f.teams?.home?.id) || !updatedAt.has(f.teams?.away?.id)) return false;
    if (!Number.isFinite(f.goals?.home) || !Number.isFinite(f.goals?.away)) return false;
    const status = getMatchStatusCategory(f.fixture);
    return status.isLive || (status.isFinished && notInOfficial(f));
  });
  if (!live.length || typeof sortStandingsByLeagueRules !== "function") return null;
  const table = structuredClone(rows);
  const byId = new Map(table.map(t => [t.team.id, t]));
  const add = (t, side, gf, ga) => {
    const res = gf > ga ? "win" : gf === ga ? "draw" : "lose";
    for (const s of [t.all ??= {}, t[side] ??= {}]) {
      s.played = (s.played || 0) + 1;
      s[res] = (s[res] || 0) + 1;
      s.goals = { for: (s.goals?.for || 0) + gf, against: (s.goals?.against || 0) + ga };
    }
    t.points = (t.points || 0) + (res === "win" ? 3 : res === "draw" ? 1 : 0);
    t.goalsDiff = (Number(t.goalsDiff) || 0) + gf - ga;
  };
  live.forEach(f => {
    add(byId.get(f.teams.home.id), "home", f.goals.home, f.goals.away);
    add(byId.get(f.teams.away.id), "away", f.goals.away, f.goals.home);
  });
  const sorted = sortStandingsByLeagueRules(table, leagueId, finished, "all");
  const officialRank = new Map(rows.map((t, i) => [t.team.id, t.rank ?? i + 1]));
  sorted.forEach((t, i) => { t.rank = i + 1; });
  const playing = new Set(live.filter(f => getMatchStatusCategory(f.fixture).isLive).flatMap(f => [f.teams.home.id, f.teams.away.id]));
  // A seta passa a comparar com a posição oficial: quanto o time sobe ou cai com os jogos em andamento.
  const movement = new Map(sorted.map(t => [t.team.id, officialRank.get(t.team.id) - t.rank]));
  return { rows: sorted, playing, movement };
}

function dayStandingsMoveHtml(delta) {
  if (delta > 0) return `<span class="day-standings-move up" title="Subiu ${delta} ${delta === 1 ? "posição" : "posições"} desde a rodada anterior">▲<small>${delta}</small></span>`;
  if (delta < 0) return `<span class="day-standings-move down" title="Caiu ${-delta} ${delta === -1 ? "posição" : "posições"} desde a rodada anterior">▼<small>${-delta}</small></span>`;
  return `<span class="day-standings-move same" title="Mesma posição da rodada anterior">–</span>`;
}

function dayStandingsZone(description) {
  const d = String(description || "");
  if (!d) return "";
  if (/relegation|rebaixamento/i.test(d)) return "down";
  return "up";
}

function renderDayStandingsSlide(slide, rows, movement = null, playing = null) {
  const comp = slide.comp;
  const groupLabel = slide.groupName && slide.groupCount > 1 ? `<span class="day-standings-group">${escapeHtml(slide.groupName)}</span>` : "";
  return `
    <a class="day-standings-title" href="#/liga/${comp.id}/${comp.season}" title="Ver classificação completa">
      <img src="${comp.logo || ""}" alt="" loading="lazy" data-image-fallback="hide">
      <span><strong>${escapeHtml(comp.name)}</strong>${groupLabel}</span>
      ${playing?.size ? '<span class="day-standings-live" title="Tabela com o placar atual dos jogos em andamento; setas comparam com a tabela oficial">● Ao vivo</span>' : ""}
    </a>
    <table class="day-standings-table">
      <thead><tr><th scope="col">#</th><th scope="col" class="move" aria-label="Variação desde a rodada anterior"></th><th scope="col" class="team">Time</th><th scope="col" title="Pontos">P</th><th scope="col" title="Jogos">J</th><th scope="col" title="Vitórias">V</th><th scope="col" title="Empates">E</th><th scope="col" title="Derrotas">D</th><th scope="col" title="Saldo de gols">SG</th></tr></thead>
      <tbody>
        ${rows.map(t => {
          const zone = dayStandingsZone(t.description);
          // Cor da competição (Champions, Libertadores...) quando league-insights.js está carregado
          const compKind = zone === "up" && typeof leagueZoneInfo === "function" ? leagueZoneInfo(t.description)?.kind : null;
          const compZone = compKind === "other" ? null : compKind;
          const gd = Number(t.goalsDiff) || 0;
          return `
          <tr class="${zone ? `zone-${zone}` : ""}${compZone ? ` zone-${compZone}` : ""}${playing?.has(t.team?.id) ? " is-live" : ""}"${t.description ? ` title="${escapeHtml(t.description)}"` : ""}>
            <td class="pos">${t.rank ?? "-"}</td>
            <td class="move">${dayStandingsMoveHtml(movement?.get(t.team?.id) ?? 0)}</td>
            <td class="team"><a href="#/time/${t.team?.id}/${comp.id}/${comp.season}"><img src="${t.team?.logo || ""}" alt="" loading="lazy" data-image-fallback="hide"><span>${escapeHtml(formatTeamName(t.team?.name || ""))}</span></a></td>
            <td class="pts">${t.points ?? 0}</td>
            <td>${t.all?.played ?? 0}</td>
            <td>${t.all?.win ?? 0}</td>
            <td>${t.all?.draw ?? 0}</td>
            <td>${t.all?.lose ?? 0}</td>
            <td>${gd > 0 ? "+" + gd : gd}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    ${dayStandings.slides.length > 1 ? '<div class="day-standings-timer" aria-hidden="true"><span></span></div>' : ""}`;
}

async function showDayStandingsSlide(index) {
  const body = dayStandingsEl("day-standings-body");
  if (!body || !dayStandings.slides.length) return;
  const requestId = ++dayStandings.requestId;
  dayStandings.index = ((index % dayStandings.slides.length) + dayStandings.slides.length) % dayStandings.slides.length;
  const slide = dayStandings.slides[dayStandings.index];

  let groups = [];
  let seasonFixtures = null;
  try {
    // Jogos da temporada só servem para a seta de variação; se falharem, a tabela sai sem setas.
    const [resp, fixtures] = await Promise.all([
      apiGet("standings", { league: slide.comp.id, season: slide.comp.season }, 15),
      apiGet("fixtures", { league: slide.comp.id, season: slide.comp.season }, 30).catch(() => null)
    ]);
    groups = (Array.isArray(resp?.[0]?.league?.standings) ? resp[0].league.standings : []).filter(g => Array.isArray(g) && g.length);
    seasonFixtures = fixtures;
  } catch { groups = []; }
  if (requestId !== dayStandings.requestId || !dayStandingsEl("day-standings-body")) return;

  // Sem tabela (copa em mata-mata): remove o slide e segue para o próximo.
  if (!groups.length) {
    dayStandings.slides.splice(dayStandings.index, 1);
    if (!dayStandings.slides.length) {
      body.innerHTML = `<p class="day-standings-empty">Sem classificação disponível para os campeonatos de hoje.</p>`;
      return;
    }
    return showDayStandingsSlide(dayStandings.index);
  }
  // Fase de grupos: um slide por grupo, na primeira vez que o campeonato aparece.
  if (slide.group == null && groups.length > 1) {
    const room = Math.max(1, DAY_STANDINGS_MAX_SLIDES - dayStandings.slides.length + 1);
    const groupSlides = groups.slice(0, room).map((g, gi) => ({ comp: slide.comp, group: gi, groupName: g[0]?.group || `Grupo ${gi + 1}`, groupCount: groups.length }));
    dayStandings.slides.splice(dayStandings.index, 1, ...groupSlides);
    return showDayStandingsSlide(dayStandings.index);
  }
  const rows = groups[slide.group ?? 0] || groups[0];
  if (slide.group == null) { slide.group = 0; slide.groupName = rows[0]?.group || ""; slide.groupCount = 1; }

  let movement = null;
  try { movement = dayStandingsMovement(rows, seasonFixtures, slide.comp.id); } catch { movement = null; }
  let live = null;
  try {
    const finished = (seasonFixtures || []).filter(f => FINISHED_STATUS.includes(f.fixture?.status?.short));
    live = dayStandingsLive(rows, dayStandings.fixtures, slide.comp.id, finished);
  } catch { live = null; }
  body.innerHTML = live ? renderDayStandingsSlide(slide, live.rows, live.movement, live.playing) : renderDayStandingsSlide(slide, rows, movement);
  const card = dayStandingsEl("day-standings");
  card?.classList.toggle("is-paused", dayStandings.userPaused || dayStandings.hoverPaused);
  fitDayStandings();
  // Um temporizador invisível (animação CSS de 15s) comanda a troca: pausar a
  // animação (mouse em cima, foco ou botão de pausa) pausa a rotação sem dessincronizar.
  const bar = body.querySelector(".day-standings-timer span");
  bar?.addEventListener("animationend", () => {
    if (requestId === dayStandings.requestId && dayStandingsEl("day-standings-body")) showDayStandingsSlide(dayStandings.index + 1);
  }, { once: true });
}

// Sem barra de rolagem: ajusta a altura das linhas para a tabela caber na tela.
// Se nem com linhas mínimas couber (tela muito baixa), a coluna fixa pelo rodapé.
const DAY_STANDINGS_TOP = 92;
function fitDayStandings() {
  const card = dayStandingsEl("day-standings");
  const aside = card?.closest(".day-sidebar");
  const tbody = card?.querySelector(".day-standings-table tbody");
  if (!card || !aside || !tbody || !tbody.rows.length || aside.offsetParent === null) return;
  card.style.removeProperty("--ds-row");
  const view = globalThis.innerHeight || 800;
  const fixed = card.offsetHeight - tbody.offsetHeight;
  const row = Math.floor((view - DAY_STANDINGS_TOP - 16 - fixed) / tbody.rows.length);
  card.style.setProperty("--ds-row", Math.max(22, Math.min(35, row)) + "px");
  const extra = aside.offsetHeight - (view - DAY_STANDINGS_TOP - 16);
  aside.style.top = extra > 0 ? (DAY_STANDINGS_TOP - extra) + "px" : "";
}
if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("resize", () => fitDayStandings());

function setupDayStandings(fixtures, doc = globalThis.document) {
  // Usa o document da tela (o mesmo de fetchAndRenderDayMatches); sem tela, não faz nada.
  if (!doc) return;
  dayStandings.doc = doc;
  dayStandings.fixtures = fixtures || [];
  const card = dayStandingsEl("day-standings");
  if (!card) return;
  const comps = dayStandingsCompetitions(fixtures);
  const key = comps.map(c => `${c.id}:${c.season}`).join(",");
  // Atualizações de placar não reiniciam a rotação se os campeonatos são os mesmos: o placar
  // novo entra na próxima troca de slide. Parada (pausa, mouse em cima ou slide único), a
  // tabela é redesenhada aqui para seguir o placar ao vivo.
  if (key === dayStandings.key && card.dataset.ready === "1") {
    const stopped = dayStandings.userPaused || dayStandings.hoverPaused || dayStandings.slides.length === 1;
    const compId = dayStandings.slides[dayStandings.index]?.comp?.id;
    if (stopped && dayStandings.fixtures.some(f => f.league?.id === compId && getMatchStatusCategory(f.fixture).isLive)) showDayStandingsSlide(dayStandings.index);
    return;
  }
  dayStandings.key = key;
  dayStandings.slides = comps.slice(0, DAY_STANDINGS_MAX_SLIDES).map(comp => ({ comp, group: null }));
  dayStandings.index = 0;
  if (card.dataset.bound !== "1") { dayStandings.userPaused = false; dayStandings.hoverPaused = false; }
  card.dataset.ready = "1";

  if (card.dataset.bound !== "1") {
    card.dataset.bound = "1";
    card.addEventListener("click", e => {
      const btn = e.target.closest("[data-standings]");
      if (!btn) return;
      const action = btn.dataset.standings;
      if (action === "pause") {
        dayStandings.userPaused = !dayStandings.userPaused;
        btn.setAttribute("aria-pressed", String(dayStandings.userPaused));
        btn.setAttribute("aria-label", dayStandings.userPaused ? "Retomar troca automática" : "Pausar troca automática");
        btn.textContent = dayStandings.userPaused ? "▶" : "❚❚";
        card.classList.toggle("is-paused", dayStandings.userPaused || dayStandings.hoverPaused);
        return;
      }
      showDayStandingsSlide(dayStandings.index + (action === "prev" ? -1 : 1));
    });
    const setHover = paused => { dayStandings.hoverPaused = paused; card.classList.toggle("is-paused", dayStandings.userPaused || paused); };
    card.addEventListener("mouseenter", () => setHover(true));
    card.addEventListener("mouseleave", () => setHover(false));
    card.addEventListener("focusin", () => setHover(true));
    card.addEventListener("focusout", e => { if (!card.contains(e.relatedTarget)) setHover(false); });
  }

  showDayStandingsSlide(0);
}

async function renderMatchesOfDay(selectedDate, statusFilter = "all") {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const currentDate = selectedDate || getLocalDateString(new Date());
  const dateInfo = formatDateDisplayBR(currentDate);
  const prevDate = shiftDate(currentDate, -1);
  const nextDate = shiftDate(currentDate, 1);
  const todayStr = getLocalDateString(new Date());

  app.innerHTML = `
    <div class="day-layout">
      <aside class="day-sidebar" aria-label="Classificação dos campeonatos">
        <div class="day-rail-card day-standings-card" id="day-standings">
          <div class="day-standings-head">
            <span class="page-eyebrow">CLASSIFICAÇÃO</span>
            <div class="day-standings-controls">
              <button type="button" class="day-standings-btn" data-standings="prev" aria-label="Campeonato anterior">‹</button>
              <button type="button" class="day-standings-btn" data-standings="pause" aria-label="Pausar troca automática" aria-pressed="false">❚❚</button>
              <button type="button" class="day-standings-btn" data-standings="next" aria-label="Próximo campeonato">›</button>
            </div>
          </div>
          <div id="day-standings-body"><p class="day-standings-empty">Carregando classificação…</p></div>
        </div>
      </aside>

      <section class="day-main" aria-label="Jogos do dia">
        <div class="day-intro"><div><p class="page-eyebrow">${escapeHtml(dateInfo.full)}</p><h1 class="page-title">${dateInfo.isToday ? 'Hoje em campo.' : 'Jogos em campo.'}</h1><p class="page-sub">Placar, horário e competição: o essencial primeiro.</p></div><span class="day-count" id="day-count" aria-live="polite"></span></div>
        <div class="day-selector-bar">
          <div class="day-nav-actions" role="group" aria-label="Selecionar data">
            <button class="day-nav-btn" id="btn-prev-day" data-date="${prevDate}">Anterior <small>${prevDate.slice(8)}/${prevDate.slice(5, 7)}</small></button>
            <button class="day-nav-btn ${dateInfo.isToday ? 'active' : ''}" id="btn-today-day" data-date="${todayStr}">Hoje <small>${todayStr.slice(8)}/${todayStr.slice(5, 7)}</small></button>
            <button class="day-nav-btn" id="btn-next-day" data-date="${nextDate}">Próximo <small>${nextDate.slice(8)}/${nextDate.slice(5, 7)}</small></button>
          </div>
          <div class="day-current-display">
            <label class="day-date-title" for="day-date-input">Escolher data</label>
            <input type="date" class="day-date-picker" id="day-date-input" value="${currentDate}">
            <button class="day-nav-btn day-refresh-btn" id="btn-refresh-day" title="Atualizar resultados e placares agora"><span class="refresh-spin-icon">↻</span><span>Atualizar</span></button>
          </div>
        </div>
        <div class="day-filter-row"><div class="matches-day-filters" id="day-status-filters" role="group" aria-label="Filtrar partidas">
          <button class="matches-day-filter-btn ${statusFilter === 'all' ? 'active' : ''}" data-filter="all">Todos</button>
          <button class="matches-day-filter-btn ${statusFilter === 'live' ? 'active' : ''}" data-filter="live">● Ao Vivo</button>
          <button class="matches-day-filter-btn ${statusFilter === 'scheduled' ? 'active' : ''}" data-filter="scheduled">Próximos</button>
          <button class="matches-day-filter-btn ${statusFilter === 'finished' ? 'active' : ''}" data-filter="finished">Resultados</button>
        </div><span class="day-timezone">HORÁRIOS LOCAIS</span></div>
        <div id="day-spotlight"></div>
        <div class="day-section-head"><h2>Partidas</h2><span id="day-visible-count" aria-live="polite"></span></div>
        <div id="day-matches-content">${skeletonTable()}</div>
      </section>
    </div>
  `;

  // Listeners de data
  document.getElementById("btn-prev-day").addEventListener("click", () => {
    location.hash = `#/jogos-do-dia/${prevDate}`;
  });
  document.getElementById("btn-next-day").addEventListener("click", () => {
    location.hash = `#/jogos-do-dia/${nextDate}`;
  });
  document.getElementById("btn-today-day").addEventListener("click", () => {
    if (location.hash === `#/jogos-do-dia/${todayStr}` || location.hash === "#/jogos-do-dia" || location.hash === "#/") {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
      footballClient.invalidate("fixtures", { date: todayStr, timezone: tz });
      footballClient.invalidate("fixtures", { date: todayStr });
      fetchAndRenderDayMatches(todayStr, "all", true);
    } else {
      location.hash = `#/jogos-do-dia/${todayStr}`;
    }
  });
  document.getElementById("btn-refresh-day")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-refresh-day");
    if (btn) {
      btn.classList.add("spinning");
      btn.disabled = true;
    }
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
      footballClient.invalidate("fixtures", { date: currentDate, timezone: tz });
      footballClient.invalidate("fixtures", { date: currentDate });
      footballClient.invalidate("fixtures", { live: "all" });
      const currentActiveFilter = document.querySelector(".matches-day-filter-btn.active")?.dataset?.filter || "all";
      await fetchAndRenderDayMatches(currentDate, currentActiveFilter, true);
      toast("Resultados e placares atualizados!", false);
    } catch (e) {
      toast("Erro ao atualizar: " + (e.message || "Tente novamente"), true);
    } finally {
      if (btn) {
        btn.classList.remove("spinning");
        btn.disabled = false;
      }
    }
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

let dayMatchesRequestId = 0;
async function fetchAndRenderDayMatches(dateStr, filter = "all", isForced = false) {
  const requestId = ++dayMatchesRequestId;
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const content = document.getElementById("day-matches-content");
  if (!content) return;

  const knownLeagueIds = new Set(LEAGUES.map(l => l.id));
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

  try {
    const ttl = isForced ? 0 : 3;
    const fixtures = filterSeniorNationalFixtures(await apiGet("fixtures", { date: dateStr, timezone: tz }, ttl));
    if (requestId !== dayMatchesRequestId || app !== window.document.getElementById('route-view')) return;
    try { NotificationManager.checkLiveAlerts(fixtures); } catch { /* ignore notification errors */ }
    const relevant = fixtures.filter(f => {
      if (!knownLeagueIds.has(f.league?.id)) return false;
      // Garante que o jogo pertence exatamente ao dia selecionado no fuso horário local
      const fixtureDateLocal = getLocalDateString(new Date(f.fixture?.date));
      return fixtureDateLocal === dateStr;
    });

    setupDayStandings(relevant, document);

    const liveCount = relevant.filter(f => getMatchStatusCategory(f.fixture).isLive).length;
    const finishedCount = relevant.filter(f => getMatchStatusCategory(f.fixture).isFinished).length;
    const scheduledCount = relevant.filter(f => {
      const cat = getMatchStatusCategory(f.fixture);
      return cat.isScheduled || cat.isPostponed;
    }).length;
    document.getElementById('day-count').textContent = `${relevant.length} ${relevant.length === 1 ? 'PARTIDA' : 'PARTIDAS'}`;
    // Jogos seguidos que já terminaram saem da lista (e dos alertas) com base nos resultados do dia.
    if (typeof cleanFinishedFavoriteFixtures === 'function') cleanFinishedFavoriteFixtures(relevant);

    if (!relevant.length) {
      document.getElementById('day-spotlight').innerHTML = '';
      document.getElementById('day-visible-count').textContent = '0 JOGOS';
      content.innerHTML = `
        <div class="card" style="text-align:center;padding:48px 20px;color:var(--chalk-dim);">
          <div style="font-size:2.4rem;margin-bottom:10px;">📅</div>
          <h3 style="color:var(--chalk);margin:0 0 6px 0;">Nenhum jogo programado para esta data</h3>
          <p style="margin:0;font-size:0.88rem;">Não há partidas das competições cobertas nesta data. Experimente navegar para outro dia.</p>
        </div>`;
      return;
    }

    // Filtragem por status com detecção inteligente de feeds da API
    // Atualiza contadores dos botões de filtro se existirem
    document.querySelector('[data-filter="all"]').textContent = `Todos (${relevant.length})`;
    document.querySelector('[data-filter="live"]').textContent = `● Ao Vivo (${liveCount})`;
    document.querySelector('[data-filter="scheduled"]').textContent = `Próximos (${scheduledCount})`;
    document.querySelector('[data-filter="finished"]').textContent = `Resultados (${finishedCount})`;

    let filtered = relevant;
    if (filter === "live") {
      filtered = relevant.filter(f => getMatchStatusCategory(f.fixture).isLive);
    } else if (filter === "finished") {
      filtered = relevant.filter(f => getMatchStatusCategory(f.fixture).isFinished);
    } else if (filter === "scheduled") {
      filtered = relevant.filter(f => {
        const cat = getMatchStatusCategory(f.fixture);
        return cat.isScheduled || cat.isPostponed;
      });
    }

    document.getElementById('day-spotlight').innerHTML = renderDaySpotlight(filtered);
    document.getElementById('day-visible-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'JOGO' : 'JOGOS'}`;

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
      const leagueInfo = group?.league || {};
      const matches = Array.isArray(group?.matches) ? group.matches : [];
      if (!matches.length) return "";
      const season = matches[0]?.league?.season || defaultSeasonFor(leagueInfo);

      return `
        <div class="league-matches-group">
          <div class="league-matches-header">
            <a class="league-matches-header-left" href="#/liga/${leagueInfo.id}/${season}" title="Ver classificação de ${escapeHtml(leagueInfo.name)}">
              <img src="${matches[0]?.league?.logo || ''}" alt="" loading="lazy">
              <span class="league-matches-header-title">${escapeHtml(leagueInfo.name)}</span>
            </a>
            <span class="league-matches-header-round">${formatRoundName(matches[0]?.league?.round || "")}</span>
          </div>

          <div class="card league-matches-body">
            <div class="fixture-list">
              ${matches.map(f => {
                const statusInfo = getMatchStatusCategory(f.fixture);
                const isLive = statusInfo.isLive;
                const isFinished = statusInfo.isFinished;
                const statusBadge = statusInfo.badgeHtml;

                const scoreDisplay = (isFinished || isLive)
                  ? `<span class="fixture-score ${isLive ? 'live-score' : ''}">${scoreWithPenaltiesHtml(f, 0)}</span>`
                  : `<span class="fixture-score" style="color:var(--chalk-dim);font-size:0.85rem;">vs</span>`;

                return `
                  <a class="fixture-row match-fixture-row" href="#/jogo/${f.fixture.id}" title="Clique para abrir estatísticas do confronto">
                    <div class="fixture-date-col">
                      ${statusBadge}
                    </div>
                    <div class="fixture-team-item right">
                      <span>${escapeHtml(f.teams.home.name)}</span>
                      <img src="${f.teams.home.logo}" alt="" loading="lazy">
                    </div>
                    <div class="fixture-score-col">
                      ${scoreDisplay}
                      ${isFinished ? `
                        <button type="button" class="btn-fixture-highlights-pill" title="Assistir aos Melhores Momentos no YouTube" data-action="highlights" data-url="https://www.youtube.com/results?search_query=${encodeURIComponent(`Melhores Momentos ${f.teams.home.name} x ${f.teams.away.name} ${f.league?.name || ''}`)}">
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
    if (requestId !== dayMatchesRequestId || app !== window.document.getElementById('route-view')) return;
    setupDayStandings([], document); // sem jogos carregados: mostra os campeonatos principais
    content.innerHTML = errorBox(err.message);
  }
}

// ============================================================
// View: Ao Vivo
// ============================================================
async function renderLive() {
  const view = captureView();
  const app = view.root;
  const document = view.document;
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

  document.getElementById("btn-force-refresh").addEventListener("click", async () => {
    const btn = document.getElementById("btn-force-refresh");
    if (btn) { btn.disabled = true; btn.textContent = "Atualizando..."; }
    try {
      footballClient.invalidate("fixtures", { live: "all" });
      await fetchLiveMatches(true);
      toast("Jogos ao vivo atualizados!", false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Atualizar"; }
    }
  });
  await fetchLiveMatches();
  startLiveAutoRefresh(() => fetchLiveMatches(true));
}

async function fetchLiveMatches(isForced = false) {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const content = document.getElementById("live-content");
  if (!content) return;

  const knownLeagueIds = new Set(LEAGUES.map(l => l.id));
  try {
    if (isForced) {
      footballClient.invalidate("fixtures", { live: "all" });
    }
    const fixtures = filterSeniorNationalFixtures(await apiGet("fixtures", { live: "all" }, isForced ? 0 : 0.5));
    NotificationManager.checkLiveAlerts(fixtures);
    const relevant = fixtures.filter(f => {
      if (!knownLeagueIds.has(f.league?.id)) return false;
      const statusInfo = getMatchStatusCategory(f.fixture);
      return statusInfo.isLive;
    });

    if (!relevant.length) {
      content.innerHTML = `<div class="card" style="text-align:center;padding:40px 20px;color:var(--chalk-dim);">Nenhum jogo ao vivo acontecendo nas ligas cobertas no momento.</div>`;
      return;
    }

    // Agrupa os jogos ao vivo por Liga mantendo a ordem oficial das Ligas do projeto
    const leagueMap = new Map();
    LEAGUES.forEach(l => {
      const leagueMatches = relevant.filter(f => f.league?.id === l.id);
      if (leagueMatches.length) {
        leagueMap.set(l.id, { league: l, matches: leagueMatches });
      }
    });

    // Caso haja alguma liga não indexada na ordem padrão
    relevant.forEach(f => {
      if (!leagueMap.has(f.league?.id)) {
        leagueMap.set(f.league?.id, { league: f.league, matches: [f] });
      }
    });

    content.innerHTML = Array.from(leagueMap.values()).map(group => {
      const leagueInfo = group?.league || {};
      const matches = Array.isArray(group?.matches) ? group.matches : [];
      if (!matches.length) return "";
      const season = matches[0]?.league?.season || defaultSeasonFor(leagueInfo);

      return `
        <div class="league-matches-group">
          <div class="league-matches-header">
            <a class="league-matches-header-left" href="#/liga/${leagueInfo.id}/${season}" title="Ver classificação de ${escapeHtml(leagueInfo.name)}">
              <img src="${matches[0]?.league?.logo || leagueInfo.logo || ''}" alt="" loading="lazy">
              <span class="league-matches-header-title">${escapeHtml(leagueInfo.name)}</span>
            </a>
            <span class="league-matches-header-round">${formatRoundName(matches[0]?.league?.round || "")}</span>
          </div>

          <div class="card league-matches-body">
            <div class="fixture-list">
              ${matches.map(f => {
                const statusInfo = getMatchStatusCategory(f.fixture);
                const timeDisplay = statusInfo.label;

                return `
                  <a class="fixture-row match-fixture-row" href="#/jogo/${f.fixture.id}" title="Clique para abrir detalhes do jogo">
                    <div class="fixture-date-col">
                      <span class="fixture-date" style="color:#10B981;font-weight:700;">🔴 ${timeDisplay}</span>
                    </div>
                    <div class="fixture-team-item right">
                      <span>${escapeHtml(f.teams.home.name)}</span>
                      <img src="${f.teams.home.logo}" alt="" loading="lazy">
                    </div>
                    <div class="fixture-score-col">
                      <span class="fixture-score live-score">${scoreWithPenaltiesHtml(f, 0)}</span>
                    </div>
                    <div class="fixture-team-item">
                      <img src="${f.teams.away.logo}" alt="" loading="lazy">
                      <span>${escapeHtml(f.teams.away.name)}</span>
                    </div>
                  </a>
                `;
              }).join("")}
            </div>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    if (content.querySelector(".fixture-row")) {
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
      if (typeof refreshFn === 'function') {
        try { refreshFn(); } catch (e) { console.warn("Erro no auto-refresh:", e); }
      }
    }
  }, 1000);
}

// ============================================================
// View: Detalhe do Jogo (Com Estatísticas Pré-Jogo vs Ao Vivo)
// ============================================================
