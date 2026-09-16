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
            if (!input.isConnected || input.value.trim() !== q) return;
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
        if (err.name === 'AbortError' || !input.isConnected || input.value.trim() !== q) return;
        results.innerHTML = `<div style="padding:8px;color:var(--terracotta);font-size:0.8rem;">${escapeHtml(err.message)}</div>`;
      }
    }, 350);
  });
}

async function selectTeamForCompare(slot, teamId, name, logo) {
  const view = captureView();
  const app = view.root;
  const document = view.document;
  const box = document.getElementById(`picker-${slot}`);
  if (box) box.innerHTML = `<div class="skeleton-line skeleton"></div>`;

  try {
    const leagues = await apiGet("leagues", { team: teamId, current: "true" }, 60);
    view.assertCurrent();
    let leagueId, leagueName, season;
    if (leagues && leagues.length) {
      const domestic = leagues.find(l => l.league?.type === "League") || leagues[0];
      leagueId = domestic?.league?.id;
      leagueName = domestic?.league?.name;
      season = domestic?.seasons?.[0]?.year;
    }
    if (!leagueId) throw new Error("Liga ativa não localizada.");
    state.compareSlots[slot] = { teamId: Number(teamId), name, logo, leagueId, leagueName, season };
    updateCompareBadge();
    renderCompare();
  } catch (err) {
    if (err.name === 'AbortError') return;
    toast(err.message);
    renderPicker(slot, null);
  }
}

async function runComparison() {
  const view = captureView();
  const app = view.root;
  const document = view.document;
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
        ${justifs.map(j => `<li class="justif-item"><span class="justif-side ${j.side}"></span><span>${escapeHtml(j.text)}</span></li>`).join("")}
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
      <p class="data-disclaimer">Posse, passes, finalizações e xG neste comparador são aproximações heurísticas derivadas de gols e resultados, sem calibração; não são medições observadas desses indicadores.</p>
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

function renderPitchBar(teamA, teamB, prob, source = "heuristic") {
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
      <p class="data-disclaimer">${source === 'provider' ? 'Estimativa do provedor de dados, sem calibração ou validação preditiva pelo FutStats.' : 'Estimativa heurística não calibrada, sem validação preditiva. Pesos: vitórias 40, saldo médio 25, forma 20, até 6 confrontos diretos encerrados 15; mando +6 pontos internos.'}</p>
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
