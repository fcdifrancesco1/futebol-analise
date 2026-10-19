// ============================================================
// Liga › Classificação: painéis extras
// Rodada atual, zonas da tabela, destaques, projeção com chances e dificuldade
// da reta final. Tudo é calculado com os jogos da temporada que a página já
// baixa (fixtures + standings): nenhuma chamada extra à API.
// ============================================================

const LEAGUE_FINISHED_STATUS = ["FT", "AET", "PEN"];
const LEAGUE_VOID_STATUS = ["CANC", "ABD", "AWD", "WO"];
const LEAGUE_SIM_RUNS = 4000;

// ---------- Zonas (descrições da API → rótulo em PT-BR) ----------
// Formatos reais vistos na API: "Promotion - Champions League (League phase)",
// "Champions League league stage", "Play-offs", " Qualifying", "Relegation Playoffs",
// "Liga Portugal (Relegation)", "Promotion - AFC Champions League 2",
// "Promotion - Champions League (Play Offs: 1/8-finals)".
function leagueZoneInfo(description) {
  const d = String(description || "").trim();
  if (!d) return null;
  const qual = /qualif|preliminar|play-?offs?/i.test(d);
  const q = label => qual ? `${label} (qualificação)` : label;
  // "down" = rebaixamento direto (conta no Z); "downpo" = playoff de rebaixamento
  if (/relegation/i.test(d)) {
    const playoff = /play-?off/i.test(d) || /\(relegation\)/i.test(d);
    return playoff ? { kind: "downpo", label: "Playoff de rebaixamento" } : { kind: "down", label: "Rebaixamento" };
  }
  if (/round of 16|1\/8/i.test(d)) return { kind: "top", label: "Oitavas de final" };
  if (/1\/16/i.test(d)) return { kind: "qual", label: "Playoff das oitavas" };
  if (/libertadores/i.test(d)) return { kind: qual ? "qual" : "top", label: qual ? "Pré-Libertadores" : "Libertadores" };
  if (/sudamericana|sul-americana/i.test(d)) return { kind: "cont2", label: "Sul-Americana" };
  if (/afc champions league 2/i.test(d)) return { kind: "cont2", label: "AFC Champions League 2" };
  if (/afc champions league/i.test(d)) return { kind: qual ? "qual" : "top", label: q("AFC Champions League") };
  if (/gulf/i.test(d)) return { kind: "cont3", label: "Liga dos Campeões do Golfo" };
  if (/champions league/i.test(d)) return { kind: qual ? "qual" : "top", label: q("Champions League") };
  if (/europa league/i.test(d)) return { kind: "cont2", label: q("Europa League") };
  if (/conference league/i.test(d)) return { kind: "cont3", label: q("Conference League") };
  if (/promotion/i.test(d)) return { kind: qual ? "qual" : "promo", label: qual ? "Playoff de acesso" : "Acesso" };
  if (qual) return { kind: "qual", label: /play-?off/i.test(d) ? "Playoffs" : "Qualificação" };
  return { kind: "other", label: d };
}

// Zona por posição (1ª posição = índice 0), a partir da tabela oficial ordenada por rank.
// Também calcula os blocos "G" (zona de cima a partir do 1º) e "Z" (rebaixamento).
function leagueZones(officialRows) {
  const ordered = [...(officialRows || [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const byPos = ordered.map(t => leagueZoneInfo(t.description));
  let top = 0;
  const firstKind = byPos[0]?.kind;
  if (firstKind && firstKind !== "down" && firstKind !== "other") {
    while (top < byPos.length && byPos[top]?.label === byPos[0].label) top++;
  }
  let down = 0;
  while (down < byPos.length && byPos[byPos.length - 1 - down]?.kind === "down") down++;
  const legend = [];
  byPos.forEach((z, i) => {
    if (!z) return;
    const last = legend[legend.length - 1];
    if (last && last.label === z.label) last.to = i + 1;
    else legend.push({ ...z, from: i + 1, to: i + 1 });
  });
  return { byPos, top, down, total: ordered.length, legend };
}

// Distância em pontos até o bloco G (ou para sair do Z), na tabela exibida.
function leagueDistance(sortedRows, index, zones) {
  if (!zones || !sortedRows.length) return null;
  const pts = sortedRows[index]?.points ?? 0;
  const n = sortedRows.length;
  if (zones.down && index >= n - zones.down) {
    const safe = sortedRows[n - zones.down - 1];
    return { kind: "down", block: `Z${zones.down}`, gap: Math.max(0, (safe?.points ?? pts) - pts), ref: safe };
  }
  if (zones.top && index >= zones.top) {
    const cut = sortedRows[zones.top - 1];
    return { kind: "top", block: `G${zones.top}`, gap: Math.max(0, (cut?.points ?? pts) - pts), ref: cut };
  }
  return null;
}

function leagueDistanceHtml(dist) {
  if (!dist) return "";
  const who = dist.ref?.team?.name ? ` (${escapeHtml(dist.ref.team.name)})` : "";
  const title = dist.kind === "down"
    ? `${dist.gap} ${dist.gap === 1 ? "ponto" : "pontos"} para sair do ${dist.block}${who}`
    : `${dist.gap} ${dist.gap === 1 ? "ponto" : "pontos"} atrás do ${dist.block}${who}`;
  return `<span class="league-dist ${dist.kind}" title="${title}">${dist.block} ${dist.gap ? "−" + dist.gap : "="}</span>`;
}

// ---------- Rodadas ----------
function leagueRounds(fixtures) {
  const map = new Map();
  (fixtures || []).forEach(f => {
    const raw = f.league?.round || "";
    if (!map.has(raw)) map.set(raw, { roundKey: raw, title: formatRoundName(raw), fixtures: [], first: Infinity });
    const r = map.get(raw);
    r.fixtures.push(f);
    r.first = Math.min(r.first, (f.fixture?.timestamp || 0) * 1000 || Date.parse(f.fixture?.date) || Infinity);
  });
  const rounds = [...map.values()];
  const num = r => { const m = String(r.roundKey).match(/(\d+)\s*$/); return m ? Number(m[1]) : null; };
  rounds.sort((a, b) => {
    const na = num(a), nb = num(b);
    if (na != null && nb != null && /season|stage|phase/i.test(a.roundKey) && /season|stage|phase/i.test(b.roundKey) && na !== nb) return na - nb;
    return a.first - b.first;
  });
  rounds.forEach(r => r.fixtures.sort((a, b) => Date.parse(a.fixture?.date) - Date.parse(b.fixture?.date)));
  return rounds;
}

function leagueCurrentRoundIndex(rounds) {
  if (!rounds.length) return -1;
  const key = typeof detectCurrentRoundKey === "function" ? detectCurrentRoundKey(rounds) : null;
  const idx = rounds.findIndex(r => r.roundKey === key);
  if (idx >= 0) return idx;
  const open = rounds.findIndex(r => r.fixtures.some(f => !LEAGUE_FINISHED_STATUS.includes(f.fixture?.status?.short)));
  return open >= 0 ? open : rounds.length - 1;
}

function leagueRoundMatchHtml(f) {
  const status = getMatchStatusCategory(f.fixture);
  const date = new Date(f.fixture?.date);
  const when = date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
  const hour = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hasScore = status.isLive || status.isFinished;
  const score = hasScore ? `${f.goals?.home ?? "–"} <span>x</span> ${f.goals?.away ?? "–"}` : `<span>x</span>`;
  const label = status.isLive ? `<span class="league-round-live">● ${escapeHtml(status.label)}</span>`
    : status.isFinished ? `<span>${escapeHtml(when)} · Encerrado</span>`
    : status.isPostponed ? `<span class="league-round-postponed">${escapeHtml(status.label)}</span>`
    : `<span>${escapeHtml(when)} · ${hour}</span>`;
  return `
    <a class="league-round-match ${status.isLive ? "is-live" : ""}" href="#/jogo/${f.fixture?.id}">
      <div class="league-round-when">${label}</div>
      <div class="league-round-line">
        <span class="team home"><span>${escapeHtml(formatTeamName(f.teams?.home?.name || ""))}</span><img src="${f.teams?.home?.logo || ""}" alt="" loading="lazy" data-image-fallback="hide"></span>
        <strong class="score">${score}</strong>
        <span class="team away"><img src="${f.teams?.away?.logo || ""}" alt="" loading="lazy" data-image-fallback="hide"><span>${escapeHtml(formatTeamName(f.teams?.away?.name || ""))}</span></span>
      </div>
    </a>`;
}

function renderLeagueRoundPanel(panel, fixtures) {
  if (!panel) return;
  const rounds = leagueRounds(fixtures);
  if (!rounds.length) {
    panel.innerHTML = `<div class="card league-round-card"><p class="league-insight-empty">Sem jogos cadastrados nesta temporada.</p></div>`;
    return;
  }
  const current = leagueCurrentRoundIndex(rounds);
  let index = current;
  const draw = () => {
    const r = rounds[index];
    panel.innerHTML = `
      <div class="card league-round-card">
        <div class="league-round-head">
          <button type="button" class="league-round-nav" data-round-nav="-1" aria-label="Rodada anterior" ${index === 0 ? "disabled" : ""}>‹</button>
          <div class="league-round-title">
            <span class="page-eyebrow">${index === current ? "RODADA ATUAL" : "RODADA"}</span>
            <strong>${escapeHtml(r.title)}</strong>
          </div>
          <button type="button" class="league-round-nav" data-round-nav="1" aria-label="Próxima rodada" ${index === rounds.length - 1 ? "disabled" : ""}>›</button>
        </div>
        <div class="league-round-list">${r.fixtures.map(leagueRoundMatchHtml).join("")}</div>
        ${index !== current ? `<button type="button" class="league-round-back" data-round-nav="current">Voltar para a rodada atual</button>` : ""}
      </div>`;
  };
  if (panel.dataset.bound !== "1") {
    panel.dataset.bound = "1";
    panel.addEventListener("click", e => {
      const btn = e.target.closest("[data-round-nav]");
      if (!btn || btn.disabled) return;
      const step = btn.dataset.roundNav;
      index = step === "current" ? current : Math.min(rounds.length - 1, Math.max(0, index + Number(step)));
      draw();
    });
  }
  draw();
}

// ---------- Destaques ----------
function leagueHighlights(sortedRows, finished) {
  if (!sortedRows.length || !finished.length) return [];
  const pick = (score, better) => sortedRows.reduce((best, t) => (best == null || better(score(t), score(best)) ? t : best), null);
  const games = t => t.all?.played || 0;
  const homePts = t => (t.home?.win || 0) * 3 + (t.home?.draw || 0);
  const awayPts = t => (t.away?.win || 0) * 3 + (t.away?.draw || 0);
  const tail = (form, stop) => { let n = 0; for (let i = form.length - 1; i >= 0 && form[i] !== stop; i--) n++; return n; };
  const unbeaten = t => tail(t.form || "", "L");
  const winless = t => tail(t.form || "", "W");
  const pct = (v, total) => total ? Math.round((v / total) * 100) : 0;
  const fmt = v => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const attack = pick(t => t.all.goals.for, (a, b) => a > b);
  const defense = pick(t => t.all.goals.against, (a, b) => a < b);
  const home = pick(homePts, (a, b) => a > b);
  const away = pick(awayPts, (a, b) => a > b);
  const run = pick(unbeaten, (a, b) => a > b);
  const drought = pick(winless, (a, b) => a > b);
  const goals = finished.reduce((s, f) => s + (f.goals?.home || 0) + (f.goals?.away || 0), 0);

  const team = t => ({ name: t.team.name, logo: t.team.logo, id: t.team.id });
  return [
    { icon: "⚽", title: "Melhor ataque", team: team(attack), value: `${attack.all.goals.for} gols`, sub: `${fmt(attack.all.goals.for / Math.max(1, games(attack)))} por jogo` },
    { icon: "🧱", title: "Melhor defesa", team: team(defense), value: `${defense.all.goals.against} sofridos`, sub: `${fmt(defense.all.goals.against / Math.max(1, games(defense)))} por jogo` },
    { icon: "🏟️", title: "Melhor mandante", team: team(home), value: `${homePts(home)} pts em casa`, sub: `${pct(homePts(home), (home.home?.played || 0) * 3)}% de aproveitamento` },
    { icon: "✈️", title: "Melhor visitante", team: team(away), value: `${awayPts(away)} pts fora`, sub: `${pct(awayPts(away), (away.away?.played || 0) * 3)}% de aproveitamento` },
    { icon: "🔥", title: "Maior invencibilidade", team: team(run), value: `${unbeaten(run)} ${unbeaten(run) === 1 ? "jogo" : "jogos"}`, sub: "sem perder (sequência atual)" },
    { icon: "🥶", title: "Maior jejum de vitórias", team: team(drought), value: `${winless(drought)} ${winless(drought) === 1 ? "jogo" : "jogos"}`, sub: "sem vencer (sequência atual)" },
    { icon: "📊", title: "Média de gols", value: `${fmt(goals / finished.length)} por jogo`, sub: `${goals} gols em ${finished.length} jogos` }
  ];
}

function renderLeagueHighlights(items, leagueId, season) {
  if (!items.length) return "";
  return `
    <section class="league-insight-section">
      <h2 class="section-title">Destaques do campeonato</h2>
      <div class="league-highlights">
        ${items.map(h => `
          <div class="card league-highlight">
            <span class="league-highlight-title"><span aria-hidden="true">${h.icon}</span> ${escapeHtml(h.title)}</span>
            ${h.team ? `<a class="league-highlight-team" href="#/time/${h.team.id}/${leagueId}/${season}"><img src="${h.team.logo || ""}" alt="" loading="lazy" data-image-fallback="hide"><span>${escapeHtml(h.team.name)}</span></a>` : ""}
            <strong class="league-highlight-value">${escapeHtml(h.value)}</strong>
            <span class="league-highlight-sub">${escapeHtml(h.sub)}</span>
          </div>`).join("")}
      </div>
    </section>`;
}

// ---------- Projeção (simulação de Monte Carlo) e dificuldade da reta final ----------
function leagueRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function leaguePoisson(lambda, rand) {
  const limit = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > limit && k < 15);
  return k - 1;
}

// Força de ataque/defesa por time (casa e fora), suavizada para o início da temporada.
function leagueStrengthModel(sortedRows, finished) {
  const n = finished.length || 1;
  const avgHome = Math.max(0.3, finished.reduce((s, f) => s + (f.goals.home || 0), 0) / n);
  const avgAway = Math.max(0.3, finished.reduce((s, f) => s + (f.goals.away || 0), 0) / n);
  const K = 4; // jogos "fictícios" na média da liga
  const model = new Map();
  sortedRows.forEach(t => {
    const h = t.home || {}, a = t.away || {};
    const hp = h.played || 0, ap = a.played || 0;
    model.set(t.team.id, {
      attHome: (((h.goals?.for || 0) + avgHome * K) / (hp + K)) / avgHome,
      defHome: (((h.goals?.against || 0) + avgAway * K) / (hp + K)) / avgAway,
      attAway: (((a.goals?.for || 0) + avgAway * K) / (ap + K)) / avgAway,
      defAway: (((a.goals?.against || 0) + avgHome * K) / (ap + K)) / avgHome
    });
  });
  return { model, avgHome, avgAway };
}

function leagueSimulate(sortedRows, finished, remaining, zones, leagueId, seed) {
  const ids = sortedRows.map(t => t.team.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const T = ids.length;
  const games = remaining.filter(f => idx.has(f.teams?.home?.id) && idx.has(f.teams?.away?.id));
  const { model, avgHome, avgAway } = leagueStrengthModel(sortedRows, finished);
  const lambdas = games.map(f => {
    const h = model.get(f.teams.home.id), a = model.get(f.teams.away.id);
    return [Math.min(5, avgHome * h.attHome * a.defAway), Math.min(5, avgAway * a.attAway * h.defHome)];
  });
  const pairs = games.map(f => [idx.get(f.teams.home.id), idx.get(f.teams.away.id)]);
  const basePts = sortedRows.map(t => t.points || 0);
  const baseGd = sortedRows.map(t => (t.all?.goals?.for || 0) - (t.all?.goals?.against || 0));
  const baseGf = sortedRows.map(t => t.all?.goals?.for || 0);
  const baseW = sortedRows.map(t => t.all?.win || 0);
  const winsFirst = leagueId === 71 || leagueId === 72; // Brasileirão: vitórias antes do saldo
  const runs = games.length ? Math.max(800, Math.min(LEAGUE_SIM_RUNS, Math.floor(1500000 / games.length))) : 1;
  const rand = leagueRandom(seed);
  const title = new Float64Array(T), top = new Float64Array(T), down = new Float64Array(T), sumPts = new Float64Array(T);
  const pts = new Int32Array(T), gd = new Int32Array(T), gf = new Int32Array(T), w = new Int32Array(T);
  const order = ids.map((_, i) => i);
  for (let r = 0; r < runs; r++) {
    pts.set(basePts); gd.set(baseGd); gf.set(baseGf); w.set(baseW);
    for (let g = 0; g < pairs.length; g++) {
      const [hi, ai] = pairs[g];
      const hg = leaguePoisson(lambdas[g][0], rand), ag = leaguePoisson(lambdas[g][1], rand);
      gd[hi] += hg - ag; gd[ai] += ag - hg; gf[hi] += hg; gf[ai] += ag;
      if (hg > ag) { pts[hi] += 3; w[hi]++; } else if (hg < ag) { pts[ai] += 3; w[ai]++; } else { pts[hi]++; pts[ai]++; }
    }
    order.sort((x, y) => (pts[y] - pts[x])
      || (winsFirst ? (w[y] - w[x]) || (gd[y] - gd[x]) : (gd[y] - gd[x]))
      || (gf[y] - gf[x]) || (x - y));
    for (let p = 0; p < T; p++) {
      const i = order[p];
      if (p === 0) title[i]++;
      if (zones.top && p < zones.top) top[i]++;
      if (zones.down && p >= T - zones.down) down[i]++;
      sumPts[i] += pts[i];
    }
  }
  return new Map(ids.map((id, i) => [id, {
    title: title[i] / runs, top: top[i] / runs, down: down[i] / runs, projected: sumPts[i] / runs
  }]));
}

function leagueRemainingSchedule(sortedRows, remaining) {
  const pos = new Map(sortedRows.map((t, i) => [t.team.id, i + 1]));
  const result = new Map();
  sortedRows.forEach(t => result.set(t.team.id, []));
  remaining.forEach(f => {
    const h = f.teams?.home?.id, a = f.teams?.away?.id;
    if (!pos.has(h) || !pos.has(a)) return;
    result.get(h).push(pos.get(a));
    result.get(a).push(pos.get(h));
  });
  // Um time nunca enfrenta a si mesmo: o líder naturalmente pega adversários de
  // posição média mais alta (~11º numa liga de 20) e o lanterna mais baixa (~10º).
  // A classificação compara com a média "esperada" de cada um (todos os outros).
  const T = sortedRows.length;
  const sumPos = (T * (T + 1)) / 2;
  const avg = new Map();
  result.forEach((list, id) => {
    if (!list.length) { avg.set(id, { games: 0, avg: null }); return; }
    const mean = list.reduce((s, p) => s + p, 0) / list.length;
    const expected = (sumPos - pos.get(id)) / (T - 1);
    avg.set(id, { games: list.length, avg: mean, rel: mean - expected });
  });
  // Terços pelo desvio: abaixo do esperado = adversários mais fortes = mais difícil
  const sorted = [...avg.values()].filter(v => v.avg != null).map(v => v.rel).sort((x, y) => x - y);
  const cut1 = sorted[Math.floor(sorted.length / 3)] ?? 0, cut2 = sorted[Math.floor((sorted.length * 2) / 3)] ?? 0;
  avg.forEach(v => { if (v.avg != null) v.level = v.rel <= cut1 ? "hard" : v.rel >= cut2 ? "easy" : "mid"; });
  return avg;
}

function leaguePercent(p) {
  if (p == null) return "–";
  if (p <= 0) return "–";
  if (p >= 1) return "100%";
  if (p < 0.01) return "<1%";
  if (p > 0.99) return ">99%";
  return `${Math.round(p * 100)}%`;
}

function renderLeagueProjection(sortedRows, sim, schedule, zones, leagueId, season, remainingCount) {
  const levelLabel = { hard: "Difícil", mid: "Média", easy: "Fácil" };
  const topLabel = zones.top ? `G${zones.top}` : null;
  const downLabel = zones.down ? `Z${zones.down}` : null;
  const finishedSeason = remainingCount === 0;
  // Em copas (fase de liga/grupos), terminar em 1º não é o título.
  const isCup = typeof LEAGUES !== "undefined" && LEAGUES.find(l => l.id === Number(leagueId))?.isCup;
  const firstLabel = isCup ? "1º lugar" : "Título";
  return `
    <section class="league-insight-section">
      <h2 class="section-title">Projeção e reta final</h2>
      <p class="league-insight-note">${finishedSeason
        ? "Temporada encerrada: chances refletem a classificação final."
        : `Chances calculadas simulando ${remainingCount} ${remainingCount === 1 ? "jogo restante" : "jogos restantes"} milhares de vezes, com base em gols marcados e sofridos em casa e fora. Desempate aproximado (sem confronto direto).`}</p>
      <div class="table-container">
        <table class="standings-table league-projection-table">
          <thead><tr>
            <th class="pos-cell">#</th><th class="team-cell">Time</th><th title="Pontos atuais">Pts</th>
            <th title="Pontos projetados ao fim da temporada">Projeção</th>
            <th title="${isCup ? "Chance de terminar em 1º nesta fase" : "Chance de título"}">${firstLabel}</th>
            ${topLabel ? `<th title="Chance de terminar no ${topLabel}">${topLabel}</th>` : ""}
            ${downLabel ? `<th title="Chance de rebaixamento">${downLabel}</th>` : ""}
            <th title="Jogos restantes">Rest.</th>
            <th class="league-difficulty-col" title="Posição média atual dos próximos adversários (quanto menor, mais fortes). Difícil/Fácil compara com a média que o time teria enfrentando todos os outros.">Adversários</th>
          </tr></thead>
          <tbody>
            ${sortedRows.map((t, i) => {
              const s = sim.get(t.team.id) || {};
              const sch = schedule.get(t.team.id) || {};
              return `
              <tr data-team-id="${t.team.id}" data-league-id="${leagueId}" data-season="${season}">
                <td class="pos-cell">${i + 1}</td>
                <td class="team-cell"><div class="team-cell-inner"><img src="${t.team.logo}" alt="" loading="lazy"><span>${escapeHtml(t.team.name)}</span></div></td>
                <td><strong>${t.points}</strong></td>
                <td>${s.projected != null ? Math.round(s.projected) : "–"}</td>
                <td class="league-chance ${s.title >= 0.5 ? "hi" : ""}">${leaguePercent(s.title)}</td>
                ${topLabel ? `<td class="league-chance ${s.top >= 0.5 ? "hi" : ""}">${leaguePercent(s.top)}</td>` : ""}
                ${downLabel ? `<td class="league-chance down ${s.down >= 0.5 ? "hi" : ""}">${leaguePercent(s.down)}</td>` : ""}
                <td>${sch.games ?? 0}</td>
                <td class="league-difficulty-col">${sch.avg != null
                  ? `<span class="league-difficulty ${sch.level}" title="Posição média dos adversários: ${sch.avg.toFixed(1).replace(".", ",")}º">${levelLabel[sch.level]} · ${sch.avg.toFixed(1).replace(".", ",")}º</span>`
                  : "–"}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderLeagueZoneLegend(zones) {
  if (!zones?.legend?.length) return "";
  return `<div class="league-zone-legend" aria-label="Legenda das zonas">
    ${zones.legend.map(z => `<span class="league-zone-item"><i class="zone-swatch zone-${z.kind}" aria-hidden="true"></i>${escapeHtml(z.label)} <small>${z.from === z.to ? `${z.from}º` : `${z.from}º–${z.to}º`}</small></span>`).join("")}
  </div>`;
}

// Monta tudo abaixo da tabela. A simulação roda depois da pintura e fica em cache
// por liga/temporada/jogos encerrados (os filtros Mandante/Visitante não refazem).
const leagueProjectionCache = new Map();

function renderLeagueInsights(container, { leagueId, season, sortedRows, allFixtures, finished, zones }) {
  if (!container) return;
  const ids = new Set(sortedRows.map(t => t.team.id));
  const remaining = allFixtures.filter(f => !LEAGUE_FINISHED_STATUS.includes(f.fixture?.status?.short)
    && !LEAGUE_VOID_STATUS.includes(f.fixture?.status?.short)
    && ids.has(f.teams?.home?.id) && ids.has(f.teams?.away?.id));
  const highlights = renderLeagueHighlights(leagueHighlights(sortedRows, finished), leagueId, season);
  container.innerHTML = `${highlights}
    <section class="league-insight-section" id="league-projection-slot">
      <h2 class="section-title">Projeção e reta final</h2>
      <div class="card league-insight-empty">Calculando projeções…</div>
    </section>`;

  const key = `${leagueId}-${season}-${finished.length}-${remaining.length}`;
  const run = () => {
    const slot = container.querySelector("#league-projection-slot");
    if (!slot || !slot.isConnected) return;
    let sim = leagueProjectionCache.get(key);
    if (!sim) {
      sim = leagueSimulate(sortedRows, finished, remaining, zones, leagueId, Number(leagueId) * 10007 + Number(season));
      leagueProjectionCache.set(key, sim);
    }
    slot.outerHTML = renderLeagueProjection(sortedRows, sim, leagueRemainingSchedule(sortedRows, remaining), zones, leagueId, season, remaining.length);
  };
  setTimeout(run, 30);
}
