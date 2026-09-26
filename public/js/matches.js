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

function renderDaySpotlight(fixtures) {
  if (!fixtures.length) return '';
  const featured = fixtures.find(f => getMatchStatusCategory(f.fixture).isLive)
    || fixtures.find(f => getMatchStatusCategory(f.fixture).isScheduled)
    || fixtures[0];
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

function renderDayTicker(fixtures) {
  if (!fixtures.length) return '';
  const sorted = [...fixtures].sort((a, b) => Number(getMatchStatusCategory(b.fixture).isLive) - Number(getMatchStatusCategory(a.fixture).isLive) || new Date(a.fixture.date) - new Date(b.fixture.date));
  return `<span class="day-ticker-label">PLACAR RÁPIDO</span>${sorted.slice(0, 6).map(f => {
    const status = getMatchStatusCategory(f.fixture);
    const score = status.isLive || status.isFinished ? `${f.goals?.home ?? '—'}–${f.goals?.away ?? '—'}` : '×';
    const label = status.isLive ? `● ${status.label}` : status.isFinished ? 'ENC.' : status.isPostponed ? status.label : new Date(f.fixture.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `<a class="day-ticker-game" href="#/jogo/${f.fixture.id}"><small>${escapeHtml(label)}</small><span>${escapeHtml(f.teams.home.name)}</span><strong>${escapeHtml(score)}</strong><span>${escapeHtml(f.teams.away.name)}</span></a>`;
  }).join('')}`;
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
      <aside class="day-sidebar" aria-label="Atalhos e competições">
        <p class="day-rail-label">Navegar</p>
        <a class="day-side-link active" href="#/jogos-do-dia">▦ <span>Jogos do Dia</span></a>
        <a class="day-side-link" href="#/aovivo">● <span>Ao Vivo</span></a>
        <a class="day-side-link" href="#/bolao">◎ <span>Meu Bolão</span></a>
        <p class="day-rail-label day-rail-space">Competições</p>
        <a class="day-side-link" href="#/liga/71/${defaultSeasonFor(LEAGUES.find(l => l.id === 71))}">🇧🇷 <span>Brasileirão</span></a>
        <a class="day-side-link" href="#/liga/2/${defaultSeasonFor(LEAGUES.find(l => l.id === 2))}">🏆 <span>Champions League</span></a>
        <a class="day-side-link" href="#/liga/39/${defaultSeasonFor(LEAGUES.find(l => l.id === 39))}">🇬🇧 <span>Premier League</span></a>
        <a class="day-side-link" href="#/ligas">＋ <span>Todas as ligas</span></a>
        <div class="day-side-card"><strong>Seu bolão, sem confusão.</strong><p>Palpites e classificação no mesmo lugar.</p><a href="#/bolao">Acessar bolão ↗</a></div>
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

      <aside class="day-right" aria-label="Resumo do dia">
        <div class="day-rail-card"><span class="page-eyebrow">EM UM OLHAR</span><h2>Resumo do dia</h2><div id="day-summary">Carregando partidas…</div></div>
        <div class="day-rail-card day-next-card" id="day-next-card" hidden></div>
        <div class="day-rail-card"><span class="page-eyebrow">SEU ESPAÇO</span><h2>Acompanhe o que importa</h2><p>Abra uma partida para seguir o jogo e receber alertas.</p></div>
      </aside>
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

    const liveCount = relevant.filter(f => getMatchStatusCategory(f.fixture).isLive).length;
    const finishedCount = relevant.filter(f => getMatchStatusCategory(f.fixture).isFinished).length;
    const scheduledCount = relevant.filter(f => {
      const cat = getMatchStatusCategory(f.fixture);
      return cat.isScheduled || cat.isPostponed;
    }).length;
    const ticker = window.document.getElementById('day-ticker');
    if (ticker) {
      ticker.hidden = relevant.length === 0;
      ticker.querySelector('#day-ticker-inner').innerHTML = renderDayTicker(relevant);
    }
    document.getElementById('day-count').textContent = `${relevant.length} ${relevant.length === 1 ? 'PARTIDA' : 'PARTIDAS'}`;
    document.getElementById('day-summary').innerHTML = `
      <div class="day-metric"><span>Partidas</span><strong>${relevant.length}</strong></div>
      <div class="day-metric"><span>Ao vivo</span><strong>${liveCount}</strong></div>
      <div class="day-metric"><span>Competições</span><strong>${new Set(relevant.map(f => f.league?.id)).size}</strong></div>`;
    const next = relevant.filter(f => getMatchStatusCategory(f.fixture).isScheduled && new Date(f.fixture.date) >= new Date())
      .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))[0];
    const nextCard = document.getElementById('day-next-card');
    nextCard.hidden = !next;
    if (next) nextCard.innerHTML = `<span class="page-eyebrow">PRÓXIMO DESTAQUE</span><strong>${escapeHtml(next.teams.home.name)} × ${escapeHtml(next.teams.away.name)}</strong><p>${new Date(next.fixture.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${escapeHtml(next.league?.name || '')}</p><a href="#/jogo/${next.fixture.id}">Ver partida ↗</a>`;

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
            <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">${formatRoundName(matches[0]?.league?.round || "")}</span>
          </div>

          <div class="card league-matches-body">
            <div class="fixture-list">
              ${matches.map(f => {
                const statusInfo = getMatchStatusCategory(f.fixture);
                const isLive = statusInfo.isLive;
                const isFinished = statusInfo.isFinished;
                const statusBadge = statusInfo.badgeHtml;

                const scoreDisplay = (isFinished || isLive)
                  ? `<span class="fixture-score ${isLive ? 'live-score' : ''}">${f.goals.home ?? 0} : ${f.goals.away ?? 0}</span>`
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
            <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--chalk-dim);">${formatRoundName(matches[0]?.league?.round || "")}</span>
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
      if (typeof refreshFn === 'function') {
        try { refreshFn(); } catch (e) { console.warn("Erro no auto-refresh:", e); }
      }
    }
  }, 1000);
}

// ============================================================
// View: Detalhe do Jogo (Com Estatísticas Pré-Jogo vs Ao Vivo)
// ============================================================
