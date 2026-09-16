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
  const view = captureView();
  const app = view.root;
  const document = view.document;
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
  const view = captureView();
  const app = view.root;
  const document = view.document;
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
                  statusBadge = `<span class="fixture-date" style="color:#10B981;font-weight:700;">🔴 ${formatLiveMatchTime(f.fixture.status)}</span>`;
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

  document.getElementById("btn-force-refresh").addEventListener("click", () => fetchLiveMatches(true));
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
    const fixtures = await apiGet("fixtures", { live: "all" }, isForced ? 0 : 0.5);
    NotificationManager.checkLiveAlerts(fixtures);
    const relevant = (fixtures || []).filter(f => knownLeagueIds.has(f.league.id));

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
            <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">${formatRoundName(matches[0]?.league?.round || "")}</span>
          </div>

          <div class="card league-matches-body">
            <div class="fixture-list">
              ${matches.map(f => {
                const timeDisplay = formatLiveMatchTime(f.fixture.status);

                return `
                  <a class="fixture-row" href="#/jogo/${f.fixture.id}" title="Clique para abrir detalhes do jogo">
                    <div class="fixture-date-col">
                      <span class="fixture-date" style="color:#10B981;font-weight:700;">🔴 ${timeDisplay}</span>
                    </div>
                    <div class="fixture-team-item right">
                      <span>${escapeHtml(f.teams.home.name)}</span>
                      <img src="${f.teams.home.logo}" alt="" loading="lazy">
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:54px;">
                      <span class="fixture-score live-score">${f.goals.home ?? 0} : ${f.goals.away ?? 0}</span>
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
      // The global refresh scheduler performs the network refresh.
    }
  }, 1000);
}

// ============================================================
// View: Detalhe do Jogo (Com Estatísticas Pré-Jogo vs Ao Vivo)
// ============================================================
