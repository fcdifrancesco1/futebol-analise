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
    return safeReadStorage(browserStorage("localStorage"), this.KEY, {});
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
  const view = captureView();
  const app = view.root;
  const document = view.document;
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
        if (!searchInput.isConnected || searchInput.value.trim() !== q) return;
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
                    <img src="${t.logo}" alt="" style="width:36px;height:36px;object-fit:contain;flex-shrink:0;" data-image-fallback="hide">
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
          if (err.name === 'AbortError' || !searchInput.isConnected || searchInput.value.trim() !== q) return;
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
  const view = captureView();
  const app = view.root;
  const document = view.document;
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
                  <img src="${assignedPlayer.photo || `https://media.api-sports.io/football/players/${assignedPlayer.id}.png`}" alt="" data-image-fallback="player">
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
                      <img src="${p.photo}" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;" data-image-fallback="player">
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
                      <img src="${p.photo}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" data-image-fallback="player">
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
  const view = captureView();
  const app = view.root;
  const document = view.document;
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
                                <img src="${p.photo || `https://media.api-sports.io/football/players/${p.id}.png`}" alt="" data-image-fallback="player">
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
                const offFormation = officialLineup?.formation || "4-4-2";
                const formLines = offFormation.split("-").map(Number);
                const offStartXI = Array.isArray(officialLineup?.startXI) ? officialLineup.startXI : [];
                const rows = [];
                let offCursor = 1;
                if (offStartXI.length > 0) {
                  rows.push([offStartXI[0]]);
                  formLines.forEach(c => {
                    rows.push(offStartXI.slice(offCursor, offCursor + c));
                    offCursor += c;
                  });
                  if (offCursor < offStartXI.length) rows.push(offStartXI.slice(offCursor));
                }

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
                              <img src="https://media.api-sports.io/football/players/${p.id}.png" alt="" data-image-fallback="player">
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
                              <img src="${p.photo || `https://media.api-sports.io/football/players/${p.id}.png`}" alt="" data-image-fallback="player">
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
// GUIA DE TRANSMISSÃO OFICIAL: Onde consultar transmissão (Baseado na Lei do Mandante e Direitos)
// ============================================================
