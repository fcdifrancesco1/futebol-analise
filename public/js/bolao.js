// ============================================================
// FutStats — bolao.js (Bolão de Palpites entre Amigos)
// Regras: 3 pts placar exato, 1 pt resultado, 0 pts erro
// Prazo: Até 10 minutos antes do início de cada partida
// Acesso: Exclusivo por link de convite
// ============================================================

function generateUUIDv4() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try { return crypto.randomUUID(); } catch {}
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    } catch {}
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const BolaoUser = {
  getId() {
    let id = localStorage.getItem("bolao_user_id");
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      id = generateUUIDv4();
      localStorage.setItem("bolao_user_id", id);
    }
    return id;
  },

  getToken() {
    let token = localStorage.getItem("bolao_user_token");
    if (!token || token.length < 16) {
      token = generateUUIDv4().replace(/-/g, "") + generateUUIDv4().replace(/-/g, "");
      localStorage.setItem("bolao_user_token", token);
    }
    return token;
  },

  getName() {
    return (localStorage.getItem("bolao_user_name") || "").trim();
  },

  setName(name) {
    if (name && typeof name === "string") {
      localStorage.setItem("bolao_user_name", name.trim());
    }
  },

  getMyLeagues() {
    try {
      const stored = localStorage.getItem("bolao_my_leagues");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveMyLeague(league) {
    if (!league || !league.id) return;
    const list = this.getMyLeagues().filter(l => l.id !== league.id);
    list.unshift({
      id: league.id,
      name: league.name || "Bolão",
      invite_code: league.invite_code || "",
      competitions: Array.isArray(league.competitions) ? league.competitions : [],
      joined_at: league.joined_at || new Date().toISOString()
    });
    localStorage.setItem("bolao_my_leagues", JSON.stringify(list.slice(0, 50)));
  },

  removeMyLeague(leagueId) {
    const list = this.getMyLeagues().filter(l => l.id !== leagueId);
    localStorage.setItem("bolao_my_leagues", JSON.stringify(list));
  }
};

const bolaoApi = {
  async request(action, method = "GET", body = null, queryParams = {}) {
    const params = new URLSearchParams({ action, ...queryParams });
    const url = `/api/bolao?${params.toString()}`;
    const options = {
      method,
      headers: { "Content-Type": "application/json" }
    };
    if (body && ["POST", "PUT"].includes(method)) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({ error: "Erro de comunicação com o servidor." }));
    if (!res.ok) {
      throw new Error(data.error || `Erro na solicitação (${res.status})`);
    }
    return data;
  },

  async getInvite(code) {
    return this.request("invite", "GET", null, { code });
  },

  async createLeague(name, competitions, creatorName) {
    return this.request("create", "POST", {
      name,
      competitions,
      creator_name: creatorName,
      creator_id: BolaoUser.getId(),
      creator_token: BolaoUser.getToken()
    });
  },

  async joinLeague(inviteCode, participantName) {
    return this.request("join", "POST", {
      invite_code: inviteCode,
      participant_name: participantName,
      participant_id: BolaoUser.getId(),
      participant_token: BolaoUser.getToken()
    });
  },

  async getLeague(leagueId) {
    return this.request("league", "GET", null, {
      id: leagueId,
      participant_id: BolaoUser.getId()
    });
  },

  async getMyLeagues(leagueIds) {
    return this.request("my-leagues", "POST", {
      participant_id: BolaoUser.getId(),
      league_ids: leagueIds
    });
  },

  async savePrediction(leagueId, fixtureId, fixtureDate, homeScore, awayScore) {
    return this.request("prediction", "POST", {
      league_id: leagueId,
      participant_id: BolaoUser.getId(),
      participant_token: BolaoUser.getToken(),
      fixture_id: fixtureId,
      fixture_date: fixtureDate,
      home_score: homeScore,
      away_score: awayScore
    });
  },

  async getPredictions(leagueId) {
    return this.request("predictions", "GET", null, {
      league_id: leagueId,
      participant_id: BolaoUser.getId()
    });
  },

  async getRanking(leagueId) {
    return this.request("ranking", "GET", null, {
      league_id: leagueId
    });
  },

  async syncScores(fixtures) {
    return this.request("sync-scores", "POST", { fixtures });
  }
};

// Auxiliar: Cálculo de pontos local (para exibição imediata e validação)
function calculatePredictionPoints(homeScore, awayScore, actualHome, actualAway) {
  if (actualHome === null || actualAway === null || actualHome === undefined || actualAway === undefined) {
    return null;
  }
  // Placar Exato: 3 pontos
  if (homeScore === actualHome && awayScore === actualAway) {
    return 3;
  }
  // Mesmo resultado (vitória mandante, visitante ou empate): 1 ponto
  const predDiff = Math.sign(homeScore - awayScore);
  const actualDiff = Math.sign(actualHome - actualAway);
  if (predDiff === actualDiff) {
    return 1;
  }
  // Errou o resultado: 0 pontos
  return 0;
}

// Auxiliar: Status do prazo de 10 minutos
function getKickoffDeadlineInfo(kickoffDateStr) {
  const kickoff = new Date(kickoffDateStr).getTime();
  const now = Date.now();
  const deadline = kickoff - 10 * 60 * 1000;
  const msLeft = deadline - now;
  const isLocked = msLeft <= 0;

  if (isLocked) {
    return {
      isLocked: true,
      badgeText: "🔒 Palpites encerrados",
      badgeClass: "badge-locked",
      helperText: "Prazo encerra 10 min antes da partida"
    };
  }

  const minutesLeft = Math.floor(msLeft / 60000);
  const hoursLeft = Math.floor(minutesLeft / 60);
  const daysLeft = Math.floor(hoursLeft / 24);

  let timeText = "";
  if (daysLeft > 0) {
    timeText = `Fecha em ${daysLeft}d ${hoursLeft % 24}h`;
  } else if (hoursLeft > 0) {
    timeText = `Fecha em ${hoursLeft}h ${minutesLeft % 60}m`;
  } else {
    timeText = `Fecha em ${minutesLeft}m`;
  }

  return {
    isLocked: false,
    badgeText: `⏰ ${timeText}`,
    badgeClass: minutesLeft <= 30 ? "badge-urgent" : "badge-open",
    helperText: "Palpite liberado até 10min antes do jogo"
  };
}


// ============================================================
// View: Bolão Home (Minhas Ligas & Criação)
// ============================================================
async function renderBolaoHome() {
  const view = captureView();
  const app = view.root;

  const myLocalLeagues = BolaoUser.getMyLeagues();

  app.innerHTML = `
    ${breadcrumbs([{ label: "Início", href: "#/" }, { label: "Bolão FutStats", href: "#/bolao" }])}

    <div class="bolao-hero-card">
      <div class="bolao-hero-content">
        <div class="bolao-hero-badge">🎯 Bolão Entre Amigos</div>
        <h1 class="bolao-hero-title">Bolão FutStats</h1>
        <p class="bolao-hero-desc">
          Crie ligas fechadas com as competições que você escolher, desafie seus amigos com link de convite exclusivo e prove quem mais entende de futebol!
        </p>
        <div class="bolao-hero-actions">
          <a class="btn primary" href="#/bolao/criar">
            <span style="font-size:1.1rem;">+</span> Criar Nova Liga
          </a>
        </div>
      </div>
      <div class="bolao-hero-icon" aria-hidden="true">🏆</div>
    </div>

    <!-- Regras Rápidas de Pontuação -->
    <div class="bolao-rules-banner">
      <div class="bolao-rule-item">
        <span class="bolao-rule-pts exact">3 PTS</span>
        <div>
          <strong>Placar Exato</strong>
          <span>Acertou os gols dos dois times</span>
        </div>
      </div>
      <div class="bolao-rule-item">
        <span class="bolao-rule-pts outcome">1 PT</span>
        <div>
          <strong>Acertou o Vencedor/Empate</strong>
          <span>Acertou o resultado com outro placar</span>
        </div>
      </div>
      <div class="bolao-rule-item">
        <span class="bolao-rule-pts wrong">0 PTS</span>
        <div>
          <strong>Errou o Resultado</strong>
          <span>Não pontua no jogo</span>
        </div>
      </div>
      <div class="bolao-rule-item">
        <span class="bolao-rule-pts deadline">⏱️ 10 min</span>
        <div>
          <strong>Limite de Palpite</strong>
          <span>Até 10 min antes do apito inicial</span>
        </div>
      </div>
    </div>

    <!-- Seção Minhas Ligas -->
    <div class="bolao-section-header">
      <h2 style="margin:0;font-size:1.3rem;font-weight:700;">Minhas Ligas</h2>
      <a class="btn ghost small" href="#/bolao/criar">+ Nova Liga</a>
    </div>

    <div id="bolao-leagues-container">
      ${skeletonCards(2)}
    </div>
  `;

  const container = document.getElementById("bolao-leagues-container");
  if (!container) return;

  try {
    if (myLocalLeagues.length === 0) {
      container.innerHTML = `
        <div class="bolao-empty-card">
          <div style="font-size:3rem;margin-bottom:12px;">⚽</div>
          <h3 style="margin:0 0 8px 0;font-size:1.2rem;">Você ainda não participa de nenhuma liga</h3>
          <p style="color:var(--chalk-dim);max-width:440px;margin:0 auto 20px auto;font-size:0.9rem;">
            Crie sua própria liga e envie o link de convite exclusivo para seus amigos, ou peça o link de uma liga já criada para entrar!
          </p>
          <a class="btn primary" href="#/bolao/criar">+ Criar Minha Primeira Liga</a>
        </div>
      `;
      return;
    }

    // Busca detalhes atualizados das ligas do usuário no servidor
    const leagueIds = myLocalLeagues.map(l => l.id);
    const serverData = await bolaoApi.getMyLeagues(leagueIds).catch(() => ({ leagues: [] }));
    const serverLeagues = serverData.leagues || [];

    const mergedLeagues = myLocalLeagues.map(local => {
      const remote = serverLeagues.find(r => r.id === local.id);
      return {
        ...local,
        name: remote?.name || local.name,
        competitions: remote?.competitions || local.competitions || [],
        member_count: remote?.member_count || 1,
        invite_code: remote?.invite_code || local.invite_code
      };
    });

    container.innerHTML = `
      <div class="bolao-leagues-grid">
        ${mergedLeagues.map(league => {
          const comps = (league.competitions || [])
            .map(cid => LEAGUES.find(l => l.id === cid))
            .filter(Boolean);

          return `
            <div class="bolao-league-card">
              <div class="bolao-card-top">
                <div>
                  <h3 class="bolao-card-title">${escapeHtml(league.name)}</h3>
                  <div class="bolao-card-meta">
                    <span>👥 ${league.member_count} ${league.member_count === 1 ? "participante" : "participantes"}</span>
                    <span>•</span>
                    <span>🏆 ${comps.length} ${comps.length === 1 ? "competição" : "competições"}</span>
                  </div>
                </div>
                <button class="btn-share-icon" data-invite-code="${escapeHtml(league.invite_code)}" data-league-name="${escapeHtml(league.name)}" title="Convidar amigos">
                  🔗
                </button>
              </div>

              <!-- Escudos das competições selecionadas -->
              <div class="bolao-comps-row">
                ${comps.slice(0, 5).map(c => `
                  <img src="https://media.api-sports.io/football/leagues/${c.id}.png" 
                       alt="${escapeHtml(c.name)}" 
                       title="${escapeHtml(c.name)}" 
                       class="bolao-comp-badge" 
                       loading="lazy" />
                `).join("")}
                ${comps.length > 5 ? `<span class="bolao-comp-more">+${comps.length - 5}</span>` : ""}
              </div>

              <div class="bolao-card-footer">
                <a class="btn primary small" href="#/bolao/liga/${league.id}" style="flex:1;">
                  Acessar Liga →
                </a>
                <button class="btn ghost small btn-share-text" data-invite-code="${escapeHtml(league.invite_code)}" data-league-name="${escapeHtml(league.name)}">
                  Convidar Amigos
                </button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    // Eventos dos botões de convite
    container.querySelectorAll(".btn-share-icon, .btn-share-text").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const code = btn.dataset.inviteCode;
        const name = btn.dataset.leagueName;
        showBolaoShareModal(code, name);
      });
    });

  } catch (err) {
    container.innerHTML = errorBox("Erro ao carregar suas ligas: " + (err.message || "Tente novamente."));
  }
}


// ============================================================
// View: Criar Nova Liga (Com Seleção de Competições)
// ============================================================
async function renderBolaoCreate() {
  const view = captureView();
  const app = view.root;

  const currentNickname = BolaoUser.getName();

  // Agrupa as ligas por País / Região para seleção intuitiva
  const groups = COUNTRIES.map(country => {
    const leaguesInCountry = country.leagues.map(id => LEAGUES.find(l => l.id === id)).filter(Boolean);
    return {
      country: country.name,
      flag: country.flagImg,
      leagues: leaguesInCountry
    };
  }).filter(g => g.leagues.length > 0);

  app.innerHTML = `
    ${breadcrumbs([{ label: "Início", href: "#/" }, { label: "Bolão", href: "#/bolao" }, { label: "Criar Liga", href: "#/bolao/criar" }])}

    <div class="page-head" style="margin-bottom:20px;">
      <p class="page-eyebrow">Novo Bolão</p>
      <h1 class="page-title">Criar Liga Privada</h1>
      <p style="color:var(--chalk-dim);font-size:0.9rem;margin-top:6px;">
        Personalize o nome da liga, seu apelido e selecione quais competições oficiais do FutStats valerão pontos no seu bolão.
      </p>
    </div>

    <form id="form-create-bolao" class="bolao-form-card">
      <div class="bolao-field-group">
        <label for="bolao-league-name" class="bolao-field-label">Nome da Liga *</label>
        <input type="text" id="bolao-league-name" class="bolao-input" placeholder="Ex: Bolão dos Amigos, Firma 2026, Cartoleiros..." required maxlength="50" autocomplete="off" />
        <span class="bolao-field-hint">Dê um nome marcante que seus amigos reconheçam.</span>
      </div>

      <div class="bolao-field-group">
        <label for="bolao-creator-name" class="bolao-field-label">Seu Nome / Apelido no Bolão *</label>
        <input type="text" id="bolao-creator-name" class="bolao-input" value="${escapeHtml(currentNickname)}" placeholder="Ex: Felipe, Zico, Menino Ney..." required maxlength="40" autocomplete="off" />
        <span class="bolao-field-hint">Como você aparecerá na tabela de classificação.</span>
      </div>

      <!-- Seleção de Competições -->
      <div class="bolao-field-group" style="margin-top:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <div>
            <label class="bolao-field-label" style="margin:0;">Competições Participantes *</label>
            <span class="bolao-field-hint">Selecione quais campeonatos terão jogos para palpitar.</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn ghost small" id="btn-select-all-leagues">Selecionar Todas</button>
            <button type="button" class="btn ghost small" id="btn-clear-all-leagues">Limpar</button>
          </div>
        </div>

        <div class="bolao-competitions-selector">
          ${groups.map(group => `
            <div class="bolao-comp-group">
              <div class="bolao-comp-group-header">
                ${group.flag ? `<img src="${group.flag}" alt="" style="width:16px;height:12px;object-fit:cover;border-radius:2px;">` : ""}
                <span>${escapeHtml(group.country)}</span>
              </div>
              <div class="bolao-comp-group-items">
                ${group.leagues.map(l => {
                  // Brasileirão, Champions e Premier League pré-selecionados por padrão
                  const isDefaultChecked = [71, 2, 39, 73].includes(l.id);
                  return `
                    <label class="bolao-comp-checkbox-item">
                      <input type="checkbox" name="bolao_competition" value="${l.id}" ${isDefaultChecked ? "checked" : ""} />
                      <img src="https://media.api-sports.io/football/leagues/${l.id}.png" alt="" class="bolao-comp-item-logo" loading="lazy" />
                      <span class="bolao-comp-item-name">${escapeHtml(l.name)}</span>
                    </label>
                  `;
                }).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <div id="bolao-create-error" style="display:none;background:rgba(239,68,68,0.12);border:1px solid var(--terracotta);color:#fca5a5;padding:14px 18px;border-radius:10px;margin-bottom:20px;font-size:0.92rem;line-height:1.5;"></div>

      <div class="bolao-form-actions">
        <a class="btn ghost" href="#/bolao">Cancelar</a>
        <button type="submit" class="btn primary" id="btn-submit-create-bolao">
          Criar Liga & Gerar Convite 🚀
        </button>
      </div>
    </form>
  `;

  const form = document.getElementById("form-create-bolao");
  const btnSelectAll = document.getElementById("btn-select-all-leagues");
  const btnClearAll = document.getElementById("btn-clear-all-leagues");
  const checkboxes = form.querySelectorAll("input[name='bolao_competition']");
  const errorBox = document.getElementById("bolao-create-error");

  btnSelectAll?.addEventListener("click", () => checkboxes.forEach(cb => cb.checked = true));
  btnClearAll?.addEventListener("click", () => checkboxes.forEach(cb => cb.checked = false));

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorBox) {
      errorBox.style.display = "none";
      errorBox.textContent = "";
    }

    const nameInput = document.getElementById("bolao-league-name");
    const creatorInput = document.getElementById("bolao-creator-name");
    const submitBtn = document.getElementById("btn-submit-create-bolao");

    const name = nameInput.value.trim();
    const creatorName = creatorInput.value.trim();
    const selectedComps = Array.from(checkboxes).filter(cb => cb.checked).map(cb => Number(cb.value));

    if (name.length < 3) {
      toast("O nome da liga deve ter pelo menos 3 caracteres.");
      nameInput.focus();
      return;
    }
    if (creatorName.length < 2) {
      toast("Seu apelido deve ter pelo menos 2 caracteres.");
      creatorInput.focus();
      return;
    }
    if (selectedComps.length === 0) {
      toast("Selecione ao menos uma competição para o bolão.");
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Criando Liga...";

      BolaoUser.setName(creatorName);
      const res = await bolaoApi.createLeague(name, selectedComps, creatorName);

      if (res.league) {
        BolaoUser.saveMyLeague({
          id: res.league.league_id,
          name: res.league.name,
          invite_code: res.league.invite_code,
          competitions: res.league.competitions
        });

        toast("Liga criada com sucesso! 🎉", false);
        location.hash = `#/bolao/liga/${res.league.league_id}`;
      }
    } catch (err) {
      toast(err.message || "Erro ao criar liga. Tente novamente.");
      if (errorBox) {
        errorBox.textContent = err.message || "Erro ao criar liga. Tente novamente.";
        errorBox.style.display = "block";
        errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Criar Liga & Gerar Convite 🚀";
    }
  });
}


// ============================================================
// View: Ingressar por Link de Convite (#/bolao/convite/:code)
// ============================================================
async function renderBolaoInvite(inviteCode) {
  const view = captureView();
  const app = view.root;

  if (!inviteCode || inviteCode.length !== 8) {
    app.innerHTML = `
      ${breadcrumbs([{ label: "Início", href: "#/" }, { label: "Bolão", href: "#/bolao" }])}
      <div class="bolao-empty-card" style="margin-top:40px;">
        <div style="font-size:3rem;margin-bottom:12px;">⚠️</div>
        <h2 style="margin:0 0 8px 0;">Código de Convite Inválido</h2>
        <p style="color:var(--chalk-dim);margin-bottom:20px;">O link acessado é inválido ou está incompleto.</p>
        <a class="btn primary" href="#/bolao">Ir para o Bolão</a>
      </div>
    `;
    return;
  }

  app.innerHTML = `
    ${breadcrumbs([{ label: "Início", href: "#/" }, { label: "Bolão", href: "#/bolao" }])}
    <div id="bolao-invite-loading" style="margin-top:30px;">
      ${skeletonCards(1)}
    </div>
  `;

  try {
    const preview = await bolaoApi.getInvite(inviteCode);
    const comps = (preview.competitions || []).map(cid => LEAGUES.find(l => l.id === cid)).filter(Boolean);
    const currentName = BolaoUser.getName();

    app.innerHTML = `
      ${breadcrumbs([{ label: "Início", href: "#/" }, { label: "Bolão", href: "#/bolao" }])}

      <div class="bolao-invite-container">
        <div class="bolao-invite-card">
          <div class="bolao-invite-badge">🏆 Convite Especial</div>
          <h1 class="bolao-invite-title">Você foi convidado para um Bolão!</h1>
          
          <div class="bolao-invite-league-info">
            <h2 class="bolao-invite-league-name">${escapeHtml(preview.name)}</h2>
            <div class="bolao-invite-meta">
              <span>👥 ${preview.member_count} ${preview.member_count === 1 ? "participante" : "participantes"}</span>
              <span>•</span>
              <span>🏆 ${comps.length} ${comps.length === 1 ? "competição" : "competições"}</span>
            </div>

            <div class="bolao-invite-comps-grid">
              ${comps.map(c => `
                <div class="bolao-invite-comp-pill">
                  <img src="https://media.api-sports.io/football/leagues/${c.id}.png" alt="" loading="lazy" />
                  <span>${escapeHtml(c.name)}</span>
                </div>
              `).join("")}
            </div>
          </div>

          <form id="form-join-bolao" style="margin-top:20px;">
            <div class="bolao-field-group">
              <label for="bolao-join-name" class="bolao-field-label">Seu Nome ou Apelido *</label>
              <input type="text" id="bolao-join-name" class="bolao-input" value="${escapeHtml(currentName)}" placeholder="Como seus amigos te conhecem no futebol?" required maxlength="40" autocomplete="off" />
              <span class="bolao-field-hint">Esse nome aparecerá na classificação para seus amigos.</span>
            </div>

            <button type="submit" class="btn primary" id="btn-submit-join" style="width:100%;margin-top:16px;padding:14px;font-size:1rem;">
              Entrar no Bolão Agora 🚀
            </button>
          </form>
        </div>
      </div>
    `;

    const form = document.getElementById("form-join-bolao");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("bolao-join-name");
      const submitBtn = document.getElementById("btn-submit-join");
      const participantName = nameInput.value.trim();

      if (participantName.length < 2) {
        toast("Digite um apelido com pelo menos 2 caracteres.");
        nameInput.focus();
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = "Entrando...";

        BolaoUser.setName(participantName);
        const res = await bolaoApi.joinLeague(inviteCode, participantName);

        if (res.league) {
          BolaoUser.saveMyLeague({
            id: res.league.league_id,
            name: res.league.name,
            invite_code: inviteCode,
            competitions: res.league.competitions
          });

          toast(`Você entrou no ${res.league.name}! ⚽`, false);
          location.hash = `#/bolao/liga/${res.league.league_id}`;
        }
      } catch (err) {
        toast(err.message || "Erro ao ingressar na liga.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Entrar no Bolão Agora 🚀";
      }
    });

  } catch (err) {
    app.innerHTML = `
      ${breadcrumbs([{ label: "Início", href: "#/" }, { label: "Bolão", href: "#/bolao" }])}
      <div class="bolao-empty-card" style="margin-top:40px;">
        <div style="font-size:3rem;margin-bottom:12px;">🔍</div>
        <h2 style="margin:0 0 8px 0;">Liga não encontrada</h2>
        <p style="color:var(--chalk-dim);margin-bottom:20px;">
          Não foi possível encontrar a liga com o código <strong>${escapeHtml(inviteCode)}</strong>. Verifique se o link foi copiado por completo.
        </p>
        <a class="btn primary" href="#/bolao">Ver Meus Bolões</a>
      </div>
    `;
  }
}


// ============================================================
// View: Dashboard da Liga (#/bolao/liga/:id/:tab?)
// ============================================================
async function renderBolaoLeague(leagueId, activeTab = "palpites") {
  const view = captureView();
  const app = view.root;

  app.innerHTML = `
    ${breadcrumbs([{ label: "Início", href: "#/" }, { label: "Bolão", href: "#/bolao" }, { label: "Carregando...", href: "" }])}
    <div style="margin-top:20px;">${skeletonCards(2)}</div>
  `;

  try {
    const [leagueData, predictionsData, rankingData] = await Promise.all([
      bolaoApi.getLeague(leagueId),
      bolaoApi.getPredictions(leagueId).catch(() => ({ my_predictions: [], closed_predictions: [] })),
      bolaoApi.getRanking(leagueId).catch(() => ({ ranking: [] }))
    ]);

    const league = leagueData.league;
    const participants = leagueData.participants || [];
    const myPredictions = predictionsData.my_predictions || [];
    const closedPredictions = predictionsData.closed_predictions || [];
    const ranking = rankingData.ranking || [];

    // Salva na lista local para acesso rápido
    BolaoUser.saveMyLeague({
      id: league.id,
      name: league.name,
      invite_code: league.invite_code,
      competitions: league.competitions
    });

    const compObjects = (league.competitions || []).map(cid => LEAGUES.find(l => l.id === cid)).filter(Boolean);

    app.innerHTML = `
      ${breadcrumbs([{ label: "Início", href: "#/" }, { label: "Bolão", href: "#/bolao" }, { label: league.name, href: `#/bolao/liga/${leagueId}` }])}

      <!-- Topo da Liga -->
      <div class="bolao-league-header">
        <div class="bolao-league-title-wrap">
          <span class="bolao-league-badge-top">Bolão Privado</span>
          <h1 class="bolao-league-h1">${escapeHtml(league.name)}</h1>
          <div class="bolao-league-submeta">
            <span>👥 ${participants.length} participantes</span>
            <span>•</span>
            <span>Código: <strong style="font-family:var(--font-mono);letter-spacing:1px;">${escapeHtml(league.invite_code)}</strong></span>
          </div>
        </div>

        <div class="bolao-league-top-actions">
          <button class="btn primary" id="btn-open-share-modal">
            🔗 Convidar Amigos
          </button>
        </div>
      </div>

      <!-- Abas de Navegação Interna da Liga -->
      <div class="bolao-subnav-tabs">
        <button class="bolao-subtab-btn ${activeTab === 'palpites' ? 'active' : ''}" data-bolao-tab="palpites">
          ⚽ Palpitar & Jogos
        </button>
        <button class="bolao-subtab-btn ${activeTab === 'ranking' ? 'active' : ''}" data-bolao-tab="ranking">
          🏆 Classificação (${participants.length})
        </button>
        <button class="bolao-subtab-btn ${activeTab === 'regras' ? 'active' : ''}" data-bolao-tab="regras">
          ℹ️ Regras & Convite
        </button>
      </div>

      <div id="bolao-tab-content"></div>
    `;

    // Botão Convidar Amigos
    document.getElementById("btn-open-share-modal")?.addEventListener("click", () => {
      showBolaoShareModal(league.invite_code, league.name);
    });

    // Eventos das Abas
    document.querySelectorAll(".bolao-subtab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.bolaoTab;
        document.querySelectorAll(".bolao-subtab-btn").forEach(b => b.classList.toggle("active", b === btn));
        renderBolaoSubTab(tab, league, compObjects, participants, myPredictions, closedPredictions, ranking);
      });
    });

    // Renderiza a aba ativa inicial
    renderBolaoSubTab(activeTab, league, compObjects, participants, myPredictions, closedPredictions, ranking);

  } catch (err) {
    app.innerHTML = `
      ${breadcrumbs([{ label: "Início", href: "#/" }, { label: "Bolão", href: "#/bolao" }])}
      <div class="bolao-empty-card" style="margin-top:40px;">
        <div style="font-size:3rem;margin-bottom:12px;">⚠️</div>
        <h2 style="margin:0 0 8px 0;">Erro ao acessar o Bolão</h2>
        <p style="color:var(--chalk-dim);margin-bottom:20px;">${escapeHtml(err.message || "Tente novamente mais tarde.")}</p>
        <a class="btn primary" href="#/bolao">Voltar aos Meus Bolões</a>
      </div>
    `;
  }
}

// Sub-renderizador das Abas Internas da Liga
async function renderBolaoSubTab(tab, league, compObjects, participants, myPredictions, closedPredictions, ranking) {
  const container = document.getElementById("bolao-tab-content");
  if (!container) return;

  if (tab === "ranking") {
    renderBolaoRankingTab(container, league, ranking);
  } else if (tab === "regras") {
    renderBolaoRegrasTab(container, league, compObjects);
  } else {
    await renderBolaoFixturesTab(container, league, compObjects, participants, myPredictions, closedPredictions);
  }
}

// ============================================================
// Aba 1: Jogos & Palpites
// ============================================================
async function renderBolaoFixturesTab(container, league, compObjects, participants = [], myPredictions = [], closedPredictions = []) {
  container.innerHTML = `
    <div class="bolao-fixtures-filter-bar">
      <div class="bolao-fixture-filters">
        <button class="bolao-filter-chip active" data-filter="all">Todos os Jogos</button>
        <button class="bolao-filter-chip" data-filter="open">Abertos para Palpitar</button>
        <button class="bolao-filter-chip" data-filter="finished">Encerrados</button>
      </div>

      <div class="bolao-fixtures-lock-notice">
        <span>🔒 Bloqueio: 10 min antes do jogo</span>
      </div>
    </div>

    <div id="bolao-round-nav-card" class="bolao-round-nav-card" style="display:none;"></div>

    <div id="bolao-fixtures-list">${skeletonCards(3)}</div>
  `;

  const fixturesListEl = document.getElementById("bolao-fixtures-list");
  const roundNavEl = document.getElementById("bolao-round-nav-card");
  if (!fixturesListEl) return;

  try {
    // Busca todos os jogos da temporada das competições selecionadas (reutiliza cache de 15min)
    const fixturePromises = compObjects.map(c => {
      const season = defaultSeasonFor(c);
      return apiGet("fixtures", { league: c.id, season }, 15);
    });

    const results = await Promise.allSettled(fixturePromises);

    const seen = new Set();
    const uniqueFixtures = [];
    results.forEach(res => {
      if (res.status === "fulfilled" && Array.isArray(res.value)) {
        res.value.forEach(f => {
          const fid = f.fixture?.id;
          if (fid && !seen.has(fid) && isSeniorNationalFixture(f)) {
            seen.add(fid);
            uniqueFixtures.push(f);
          }
        });
      }
    });

    if (uniqueFixtures.length === 0) {
      fixturesListEl.innerHTML = `
        <div class="bolao-empty-card" style="padding:32px 20px;">
          <p style="color:var(--chalk-dim);margin:0;font-size:0.95rem;">
            Nenhum jogo encontrado para as competições selecionadas nesta temporada.
          </p>
        </div>
      `;
      return;
    }

    // Ordena cronologicamente
    uniqueFixtures.sort((a, b) => (a.fixture?.timestamp || 0) - (b.fixture?.timestamp || 0));

    // Sincroniza partidas finalizadas que possuem palpites na liga ou dos últimos 7 dias
    const predictedFixtureIds = new Set([
      ...myPredictions.map(p => Number(p.fixture_id)),
      ...closedPredictions.map(p => Number(p.fixture_id))
    ]);
    const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const finishedToSync = uniqueFixtures
      .filter(f => {
        const isFin = ["FT", "AET", "PEN"].includes(f.fixture?.status?.short);
        if (!isFin) return false;
        const fId = Number(f.fixture?.id);
        const fDate = new Date(f.fixture?.date).getTime();
        return predictedFixtureIds.has(fId) || (fDate >= recentCutoff);
      })
      .slice(0, 30)
      .map(f => ({
        id: f.fixture.id,
        home_score: f.goals?.home,
        away_score: f.goals?.away,
        status: f.fixture.status.short
      }));

    if (finishedToSync.length > 0) {
      bolaoApi.syncScores(finishedToSync).catch(() => {});
    }

    // Mapa de palpites do usuário: fixtureId -> { home_score, away_score, points, status }
    const myPredMap = new Map();
    myPredictions.forEach(p => myPredMap.set(Number(p.fixture_id), p));

    // Agrupamento por rodada
    const roundsMap = new Map();
    uniqueFixtures.forEach(f => {
      const rawRound = f.league?.round || "";
      const roundTitle = formatRoundName(rawRound);
      const roundKey = compObjects.length > 1 
        ? `${f.league?.id || 'comp'}_${roundTitle}` 
        : roundTitle;
      const displayTitle = compObjects.length > 1 
        ? `${roundTitle} • ${f.league?.name || ''}` 
        : roundTitle;

      if (!roundsMap.has(roundKey)) {
        roundsMap.set(roundKey, {
          roundKey,
          roundTitle: displayTitle,
          rawTitle: roundTitle,
          leagueId: f.league?.id,
          fixtures: [],
          firstTimestamp: f.fixture?.timestamp || 0
        });
      }
      roundsMap.get(roundKey).fixtures.push(f);
    });

    const allRounds = Array.from(roundsMap.values()).sort((a, b) => {
      const numA = extractRoundNumber(a.rawTitle);
      const numB = extractRoundNumber(b.rawTitle);
      if (numA !== 999 && numB !== 999 && numA !== numB) {
        return numA - numB;
      }
      return a.firstTimestamp - b.firstTimestamp;
    });

    // Detecta a rodada atual
    const now = Date.now();
    let currentRoundKey = null;

    // 1. Prioriza rodada com jogos acontecendo hoje ou nas próximas 72h que ainda não terminaram
    for (const r of allRounds) {
      const hasUpcomingSoon = r.fixtures.some(f => {
        const kickoff = new Date(f.fixture?.date).getTime();
        const isFin = ["FT", "AET", "PEN"].includes(f.fixture?.status?.short);
        return !isFin && (kickoff - now <= 72 * 3600 * 1000);
      });
      if (hasUpcomingSoon) {
        currentRoundKey = r.roundKey;
        break;
      }
    }

    // 2. Se não houver jogos nos próximos 3 dias, pega a primeira rodada com qualquer jogo não finalizado
    if (!currentRoundKey) {
      const firstUnfinished = allRounds.find(r => r.fixtures.some(f => !["FT", "AET", "PEN"].includes(f.fixture?.status?.short)));
      if (firstUnfinished) {
        currentRoundKey = firstUnfinished.roundKey;
      }
    }

    // 3. Se todos os jogos do campeonato acabaram, pega a última rodada
    if (!currentRoundKey && allRounds.length > 0) {
      currentRoundKey = allRounds[allRounds.length - 1].roundKey;
    }

    let selectedRoundKey = currentRoundKey || (allRounds[0]?.roundKey || "ALL");
    let selectedFilter = "all"; // 'all', 'open', 'finished'

    // Renderiza o Navegador de Rodadas
    function renderRoundNavigator() {
      if (allRounds.length <= 1 || !roundNavEl) {
        if (roundNavEl) roundNavEl.style.display = "none";
        return;
      }
      roundNavEl.style.display = "block";

      const roundOptions = allRounds.map(r => {
        const isCurrent = r.roundKey === currentRoundKey;
        return `
          <option value="${escapeHtml(r.roundKey)}" ${r.roundKey === selectedRoundKey ? 'selected' : ''}>
            ${escapeHtml(r.roundTitle)} ${isCurrent ? '• (Atual)' : ''}
          </option>
        `;
      }).join("");

      roundNavEl.innerHTML = `
        <div class="bolao-round-navigator">
          <button class="bolao-round-nav-btn" id="bolao-round-prev" title="Rodada Anterior" aria-label="Rodada Anterior">
            ◀
          </button>
          <div class="bolao-round-select-wrapper">
            <select id="bolao-round-select" class="bolao-round-select" aria-label="Selecionar rodada">
              <option value="ALL" ${selectedRoundKey === 'ALL' ? 'selected' : ''}>Todas as Rodadas</option>
              ${roundOptions}
            </select>
          </div>
          <button class="bolao-round-nav-btn" id="bolao-round-next" title="Próxima Rodada" aria-label="Próxima Rodada">
            ▶
          </button>
        </div>
      `;

      updateNavButtonsState();

      const selectEl = document.getElementById("bolao-round-select");
      selectEl?.addEventListener("change", (e) => {
        selectedRoundKey = e.target.value;
        updateNavButtonsState();
        renderView();
      });

      document.getElementById("bolao-round-prev")?.addEventListener("click", () => {
        navigateRound(-1);
      });

      document.getElementById("bolao-round-next")?.addEventListener("click", () => {
        navigateRound(1);
      });
    }

    function updateNavButtonsState() {
      const prevBtn = document.getElementById("bolao-round-prev");
      const nextBtn = document.getElementById("bolao-round-next");
      if (!prevBtn || !nextBtn) return;

      if (selectedRoundKey === "ALL") {
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
      }

      const idx = allRounds.findIndex(r => r.roundKey === selectedRoundKey);
      prevBtn.disabled = idx <= 0;
      nextBtn.disabled = idx >= allRounds.length - 1;
    }

    function navigateRound(direction) {
      let idx = allRounds.findIndex(r => r.roundKey === selectedRoundKey);
      if (idx === -1) {
        idx = allRounds.findIndex(r => r.roundKey === currentRoundKey);
        if (idx === -1) idx = 0;
      } else {
        idx += direction;
      }

      if (idx >= 0 && idx < allRounds.length) {
        selectedRoundKey = allRounds[idx].roundKey;
        const selectEl = document.getElementById("bolao-round-select");
        if (selectEl) selectEl.value = selectedRoundKey;
        updateNavButtonsState();
        renderView();
      }
    }

    // Renderiza um Card de Partida
    function renderMatchCard(f) {
      const fid = f.fixture.id;
      const dateStr = f.fixture.date;
      const deadlineInfo = getKickoffDeadlineInfo(dateStr);
      const userPred = myPredMap.get(fid);
      const isFinished = ["FT", "AET", "PEN"].includes(f.fixture?.status?.short);

      const homeGoal = f.goals?.home;
      const awayGoal = f.goals?.away;

      // Formatação de data/hora
      const matchDate = new Date(dateStr);
      const formattedDate = matchDate.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
      const formattedTime = matchDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

      // Cálculo de pontos para jogos finalizados
      let pointsBadge = "";
      let userPts = null;
      if (isFinished) {
        if (userPred && homeGoal !== null && awayGoal !== null && homeGoal !== undefined && awayGoal !== undefined) {
          userPts = calculatePredictionPoints(userPred.home_score, userPred.away_score, homeGoal, awayGoal);
          if (userPts === 3) {
            pointsBadge = `<span class="bolao-points-badge exact">🎯 +3 PTS (Placar Exato!)</span>`;
          } else if (userPts === 1) {
            pointsBadge = `<span class="bolao-points-badge outcome">⚽ +1 PT (Acertou Resultado)</span>`;
          } else {
            pointsBadge = `<span class="bolao-points-badge wrong">❌ 0 PTS (Não Pontuou)</span>`;
          }
        } else {
          pointsBadge = `<span class="bolao-points-badge no-pred">⚠️ Sem Palpite (0 PTS)</span>`;
        }
      }

      // Palpites dos amigos
      const friendsBets = (deadlineInfo.isLocked || isFinished)
        ? closedPredictions.filter(cp => Number(cp.fixture_id) === fid)
        : [];

      return `
        <div class="bolao-match-card ${deadlineInfo.isLocked || isFinished ? 'locked' : ''}">
          <div class="bolao-match-header">
            <div class="bolao-match-comp">
              <img src="${f.league.logo || `https://media.api-sports.io/football/leagues/${f.league.id}.png`}" alt="" class="bolao-mini-comp-logo" loading="lazy" />
              <span title="${escapeHtml(f.league.name)} • ${escapeHtml(formatRoundName(f.league.round || ''))}">${escapeHtml(f.league.name)} • ${escapeHtml(formatRoundName(f.league.round || ''))}</span>
            </div>
            <div class="bolao-deadline-pill ${isFinished ? 'badge-finished' : deadlineInfo.badgeClass}">
              ${isFinished ? '🏁 Encerrado' : deadlineInfo.badgeText}
            </div>
          </div>

          <!-- Confronto e Data -->
          <div class="bolao-match-body">
            <div class="bolao-team-side home">
              <span class="bolao-team-name" title="${escapeHtml(formatTeamName(f.teams.home.name))}">${escapeHtml(formatTeamName(f.teams.home.name))}</span>
              <img src="${f.teams.home.logo || `https://media.api-sports.io/football/teams/${f.teams.home.id}.png`}" alt="${escapeHtml(formatTeamName(f.teams.home.name))}" class="bolao-team-logo" loading="lazy" />
            </div>

            <div class="bolao-match-center">
              <div class="bolao-match-time">${formattedDate} às ${formattedTime}</div>
              ${isFinished 
                ? `<div class="bolao-official-score">${homeGoal ?? 0} - ${awayGoal ?? 0}</div><span class="bolao-status-tag">Fim de Jogo</span>` 
                : `<div class="bolao-vs-tag">VS</div>`}
              ${pointsBadge}
            </div>

            <div class="bolao-team-side away">
              <img src="${f.teams.away.logo || `https://media.api-sports.io/football/teams/${f.teams.away.id}.png`}" alt="${escapeHtml(formatTeamName(f.teams.away.name))}" class="bolao-team-logo" loading="lazy" />
              <span class="bolao-team-name" title="${escapeHtml(formatTeamName(f.teams.away.name))}">${escapeHtml(formatTeamName(f.teams.away.name))}</span>
            </div>
          </div>

          <!-- Seção do Palpite -->
          <div class="bolao-prediction-section">
            ${!deadlineInfo.isLocked && !isFinished ? `
              <div class="bolao-pred-form" data-fixture-id="${fid}" data-fixture-date="${escapeHtml(dateStr)}">
                <span class="bolao-pred-label">Seu Palpite:</span>
                <div class="bolao-pred-inputs">
                  <input type="number" min="0" max="99" class="bolao-score-input home" value="${userPred?.home_score ?? ''}" placeholder="0" />
                  <span class="bolao-pred-x">x</span>
                  <input type="number" min="0" max="99" class="bolao-score-input away" value="${userPred?.away_score ?? ''}" placeholder="0" />
                  <button class="btn primary small btn-save-prediction">
                    ${userPred ? "Atualizar" : "Salvar"}
                  </button>
                </div>
              </div>
            ` : `
              <div class="bolao-pred-locked-info">
                <div class="bolao-locked-pred-content">
                  ${userPred ? `
                    <span class="bolao-locked-pred-val">Seu palpite: <strong>${userPred.home_score} x ${userPred.away_score}</strong></span>
                    ${isFinished ? `
                      <span class="bolao-pred-outcome-badge ${userPts === 3 ? 'exact' : userPts === 1 ? 'outcome' : 'wrong'}">
                        ${userPts === 3 ? '🎯 +3 PTS' : userPts === 1 ? '⚽ +1 PT' : '❌ 0 PTS'}
                      </span>
                    ` : ''}
                  ` : `
                    <span class="bolao-locked-no-pred">⚠️ Você não palpitou nesta partida</span>
                  `}
                </div>
                ${friendsBets.length > 0 ? `
                  <button class="btn-toggle-friends-bets" data-fixture-id="${fid}">
                    Ver palpites da galera (${friendsBets.length}) ▾
                  </button>
                ` : ''}
              </div>

              ${friendsBets.length > 0 ? `
                <div class="bolao-friends-bets-box" id="friends-bets-${fid}" hidden>
                  <div class="bolao-friends-bets-grid">
                    ${friendsBets.map(fb => {
                      const member = participants.find(p => p.participant_id === fb.participant_id);
                      const memberName = member?.participant_name || "Participante";
                      const isMe = fb.participant_id === BolaoUser.getId();
                      return `
                        <div class="bolao-friend-bet-chip ${isMe ? 'is-me' : ''}">
                          <span class="friend-name">${escapeHtml(memberName)} ${isMe ? '(Você)' : ''}:</span>
                          <strong class="friend-score">${fb.home_score} x ${fb.away_score}</strong>
                        </div>
                      `;
                    }).join("")}
                  </div>
                </div>
              ` : ''}
            `}
          </div>
        </div>
      `;
    }

    // Renderiza uma lista de partidas agrupadas por data
    function renderFixturesGroupedByDate(fixturesList) {
      const dateGroups = {};
      fixturesList.forEach(f => {
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
        const tA = dateGroups[a]?.[0]?.fixture?.timestamp || 0;
        const tB = dateGroups[b]?.[0]?.fixture?.timestamp || 0;
        return tA - tB;
      });

      return sortedDates.map((dateHeader, idx) => `
        <div class="bolao-date-divider" style="${idx === 0 ? 'margin-top:2px;' : ''}">
          <span class="date-icon">📅</span>
          <span class="date-text">${escapeHtml(dateHeader)}</span>
        </div>
        ${dateGroups[dateHeader].map(renderMatchCard).join("")}
      `).join("");
    }

    // Renderiza a visualização com base na rodada e filtro selecionados
    function renderView() {
      const currentTime = Date.now();

      function matchesFilter(f) {
        const kickoff = new Date(f.fixture?.date).getTime();
        const isPast10Min = (kickoff - currentTime) <= 10 * 60 * 1000;
        const isFinished = ["FT", "AET", "PEN"].includes(f.fixture?.status?.short);

        if (selectedFilter === "open") return !isPast10Min && !isFinished;
        if (selectedFilter === "finished") return isFinished;
        return true;
      }

      if (selectedRoundKey === "ALL") {
        // Todas as rodadas
        let html = "";
        let totalMatchesShown = 0;

        allRounds.forEach(r => {
          const filtered = r.fixtures.filter(matchesFilter);
          if (filtered.length === 0) return;

          totalMatchesShown += filtered.length;

          // Estatísticas da rodada
          let roundPoints = 0;
          let betsCount = 0;
          let finishedCount = 0;
          r.fixtures.forEach(f => {
            const fid = f.fixture.id;
            const pred = myPredMap.get(fid);
            const isFin = ["FT", "AET", "PEN"].includes(f.fixture?.status?.short);
            if (pred) betsCount++;
            if (isFin) {
              finishedCount++;
              if (pred && f.goals?.home !== null && f.goals?.away !== null && f.goals?.home !== undefined && f.goals?.away !== undefined) {
                const pts = calculatePredictionPoints(pred.home_score, pred.away_score, f.goals.home, f.goals.away);
                if (pts) roundPoints += pts;
              }
            }
          });

          const isCurrent = r.roundKey === currentRoundKey;

          html += `
            <div class="bolao-round-section" style="margin-bottom:24px;">
              <div class="bolao-round-header-bar">
                <div class="bolao-round-title-row">
                  <span class="bolao-round-badge-icon">🏆</span>
                  <span class="bolao-round-title-text">${escapeHtml(r.roundTitle)}</span>
                  ${isCurrent ? `<span class="bolao-round-current-tag">Atual</span>` : ''}
                </div>
                <div class="bolao-round-stats-pills">
                  <div class="bolao-round-stat-pill points" title="Pontos conquistados por você nesta rodada">
                    <span class="bolao-stat-icon">⭐</span>
                    <span class="bolao-stat-val">+${roundPoints} pts</span>
                  </div>
                  <div class="bolao-round-stat-pill bets" title="Seus palpites nesta rodada">
                    <span class="bolao-stat-icon">🎯</span>
                    <span class="bolao-stat-val">${betsCount}/${r.fixtures.length} palpites</span>
                  </div>
                  <div class="bolao-round-stat-pill finished" title="Partidas finalizadas na rodada">
                    <span class="bolao-stat-icon">🏁</span>
                    <span class="bolao-stat-val">${finishedCount}/${r.fixtures.length} encerrados</span>
                  </div>
                </div>
              </div>
              ${renderFixturesGroupedByDate(filtered)}
            </div>
          `;
        });

        if (totalMatchesShown === 0) {
          fixturesListEl.innerHTML = `
            <div class="bolao-empty-card" style="padding:32px 20px;">
              <p style="color:var(--chalk-dim);margin:0;font-size:0.95rem;">
                ${selectedFilter === 'open' 
                  ? 'Nenhum jogo aberto para palpites no momento.' 
                  : selectedFilter === 'finished' 
                  ? 'Nenhum jogo encerrado encontrado.' 
                  : 'Nenhum jogo encontrado.'}
              </p>
            </div>
          `;
        } else {
          fixturesListEl.innerHTML = html;
        }

      } else {
        // Rodada Específica
        const activeRound = allRounds.find(r => r.roundKey === selectedRoundKey);
        if (!activeRound) {
          fixturesListEl.innerHTML = `
            <div class="bolao-empty-card" style="padding:32px 20px;">
              <p style="color:var(--chalk-dim);margin:0;">Rodada não encontrada.</p>
            </div>
          `;
          return;
        }

        const filtered = activeRound.fixtures.filter(matchesFilter);

        // Estatísticas da rodada ativa
        let roundPoints = 0;
        let betsCount = 0;
        let finishedCount = 0;
        activeRound.fixtures.forEach(f => {
          const fid = f.fixture.id;
          const pred = myPredMap.get(fid);
          const isFin = ["FT", "AET", "PEN"].includes(f.fixture?.status?.short);
          if (pred) betsCount++;
          if (isFin) {
            finishedCount++;
            if (pred && f.goals?.home !== null && f.goals?.away !== null && f.goals?.home !== undefined && f.goals?.away !== undefined) {
              const pts = calculatePredictionPoints(pred.home_score, pred.away_score, f.goals.home, f.goals.away);
              if (pts) roundPoints += pts;
            }
          }
        });

        const isCurrent = activeRound.roundKey === currentRoundKey;

        let html = `
          <div class="bolao-round-header-bar">
            <div class="bolao-round-title-row">
              <span class="bolao-round-badge-icon">🏆</span>
              <span class="bolao-round-title-text">${escapeHtml(activeRound.roundTitle)}</span>
              ${isCurrent ? `<span class="bolao-round-current-tag">Atual</span>` : ''}
            </div>
            <div class="bolao-round-stats-pills">
              <div class="bolao-round-stat-pill points" title="Pontos conquistados por você nesta rodada">
                <span class="bolao-stat-icon">⭐</span>
                <span class="bolao-stat-val">+${roundPoints} pts</span>
              </div>
              <div class="bolao-round-stat-pill bets" title="Seus palpites nesta rodada">
                <span class="bolao-stat-icon">🎯</span>
                <span class="bolao-stat-val">${betsCount}/${activeRound.fixtures.length} palpites</span>
              </div>
              <div class="bolao-round-stat-pill finished" title="Partidas finalizadas na rodada">
                <span class="bolao-stat-icon">🏁</span>
                <span class="bolao-stat-val">${finishedCount}/${activeRound.fixtures.length} encerrados</span>
              </div>
            </div>
          </div>
        `;

        if (filtered.length === 0) {
          html += `
            <div class="bolao-empty-card" style="padding:32px 20px;">
              <p style="color:var(--chalk-dim);margin:0;font-size:0.95rem;">
                ${selectedFilter === 'open' 
                  ? 'Nenhum jogo aberto para palpites nesta rodada.' 
                  : selectedFilter === 'finished' 
                  ? 'Nenhum jogo encerrado nesta rodada até o momento.' 
                  : 'Nenhum jogo encontrado para esta rodada.'}
              </p>
            </div>
          `;
        } else {
          html += renderFixturesGroupedByDate(filtered);
        }

        fixturesListEl.innerHTML = html;
      }

      // Conecta os eventos dos formulários de palpite
      bindPredictionFormEvents();
    }

    function bindPredictionFormEvents() {
      // Vincula eventos aos formulários de palpite
      fixturesListEl.querySelectorAll(".bolao-pred-form").forEach(formEl => {
        const fid = Number(formEl.dataset.fixtureId);
        const fDate = formEl.dataset.fixtureDate;
        const inputHome = formEl.querySelector(".bolao-score-input.home");
        const inputAway = formEl.querySelector(".bolao-score-input.away");
        const saveBtn = formEl.querySelector(".btn-save-prediction");

        saveBtn?.addEventListener("click", async () => {
          const homeVal = inputHome.value.trim();
          const awayVal = inputAway.value.trim();

          if (homeVal === "" || awayVal === "") {
            toast("Informe o placar completo para os dois times.");
            return;
          }

          const hNum = Number(homeVal);
          const aNum = Number(awayVal);

          if (!Number.isSafeInteger(hNum) || hNum < 0 || hNum > 99 || !Number.isSafeInteger(aNum) || aNum < 0 || aNum > 99) {
            toast("O placar deve ser um número entre 0 e 99.");
            return;
          }

          try {
            saveBtn.disabled = true;
            saveBtn.textContent = "Salvando...";

            await bolaoApi.savePrediction(league.id, fid, fDate, hNum, aNum);

            // Atualiza cache local de palpites
            myPredMap.set(fid, { fixture_id: fid, home_score: hNum, away_score: aNum });
            toast("Palpite registrado com sucesso! 🎯", false);
            saveBtn.disabled = false;
            saveBtn.textContent = "Atualizar";
          } catch (err) {
            toast(err.message || "Erro ao salvar palpite.");
            saveBtn.disabled = false;
            saveBtn.textContent = "Salvar";
          }
        });
      });

      // Accordion para palpites dos amigos
      fixturesListEl.querySelectorAll(".btn-toggle-friends-bets").forEach(btn => {
        btn.addEventListener("click", () => {
          const fid = btn.dataset.fixtureId;
          const box = document.getElementById(`friends-bets-${fid}`);
          if (box) {
            const isHidden = box.hidden;
            box.hidden = !isHidden;
            btn.textContent = isHidden ? "Ocultar palpites ▴" : `Ver palpites da galera ▾`;
          }
        });
      });
    }

    // Inicializa o navegador e renderiza a view
    renderRoundNavigator();
    renderView();

    // Eventos dos chips de filtro
    container.querySelectorAll(".bolao-filter-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        container.querySelectorAll(".bolao-filter-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        selectedFilter = chip.dataset.filter;
        renderView();
      });
    });

  } catch (err) {
    fixturesListEl.innerHTML = errorBox("Erro ao carregar jogos da liga: " + (err.message || "Tente novamente."));
  }
}


// ============================================================
// Aba 2: Classificação (Ranking em Tempo Real)
// ============================================================
function renderBolaoRankingTab(container, league, ranking) {
  const currentUserId = BolaoUser.getId();

  if (!ranking || ranking.length === 0) {
    container.innerHTML = `
      <div class="bolao-empty-card" style="padding:40px 20px;">
        <div style="font-size:2.5rem;margin-bottom:10px;">🏆</div>
        <h3 style="margin:0 0 6px 0;">Nenhuma pontuação registrada ainda</h3>
        <p style="color:var(--chalk-dim);margin:0;font-size:0.9rem;">
          A classificação será calculada e atualizada automaticamente assim que as partidas finalizarem!
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="bolao-ranking-card">
      <div class="bolao-ranking-header-bar">
        <div>
          <h3 style="margin:0;font-size:1.1rem;font-weight:700;">Tabela de Classificação</h3>
          <span style="font-size:0.75rem;color:var(--chalk-dim);">Critérios: Total de Pontos > Cravadas (3 pts) > Acertos (1 pt)</span>
        </div>
        <button class="btn ghost small" id="btn-refresh-ranking">🔄 Atualizar</button>
      </div>

      <div class="table-responsive">
        <table class="standings-table bolao-ranking-table">
          <thead>
            <tr>
              <th style="width:48px;text-align:center;">#</th>
              <th>Participante</th>
              <th style="text-align:center;" title="Pontos Totais">Pts</th>
              <th style="text-align:center;" title="Cravadas de Placar Exato (3 pts)">🎯 3P</th>
              <th style="text-align:center;" title="Acertos de Resultado (1 pt)">⚽ 1P</th>
              <th style="text-align:center;" title="Erros">❌ 0P</th>
              <th style="text-align:center;" title="Total de Palpites">Jogos</th>
            </tr>
          </thead>
          <tbody>
            ${ranking.map((row, index) => {
              const pos = index + 1;
              const isMe = row.participant_id === currentUserId;
              let medal = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : `${pos}º`;

              return `
                <tr class="${isMe ? 'bolao-rank-me' : ''}">
                  <td style="text-align:center;font-weight:700;font-family:var(--font-mono);">${medal}</td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span class="bolao-rank-avatar">${escapeHtml((row.participant_name || "A").substring(0, 2).toUpperCase())}</span>
                      <span style="font-weight:${isMe ? '700' : '500'};color:${isMe ? 'var(--gold)' : 'var(--chalk)'};">
                        ${escapeHtml(row.participant_name)} ${isMe ? '<span class="bolao-you-tag">(Você)</span>' : ''}
                      </span>
                    </div>
                  </td>
                  <td style="text-align:center;font-weight:800;font-family:var(--font-mono);color:var(--gold);font-size:1.05rem;">
                    ${row.total_points}
                  </td>
                  <td style="text-align:center;font-family:var(--font-mono);color:#10B981;font-weight:600;">
                    ${row.exact_count}
                  </td>
                  <td style="text-align:center;font-family:var(--font-mono);color:#FBBF24;">
                    ${row.result_count}
                  </td>
                  <td style="text-align:center;font-family:var(--font-mono);color:var(--chalk-muted);">
                    ${row.wrong_count || 0}
                  </td>
                  <td style="text-align:center;font-family:var(--font-mono);color:var(--chalk-dim);">
                    ${row.total_predictions || 0}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("btn-refresh-ranking")?.addEventListener("click", () => {
    renderBolaoLeague(league.id, "ranking");
  });
}


// ============================================================
// Aba 3: Regras & Convite da Liga
// ============================================================
function renderBolaoRegrasTab(container, league, compObjects) {
  const inviteUrl = `${window.location.origin}/#/bolao/convite/${league.invite_code}`;

  container.innerHTML = `
    <div class="bolao-rules-tab-grid">
      <!-- Card de Convite -->
      <div class="bolao-info-card">
        <h3 class="bolao-info-title">🔗 Convidar Amigos</h3>
        <p style="color:var(--chalk-dim);font-size:0.9rem;margin-bottom:16px;">
          Esta liga é privada. Amigos só conseguem entrar utilizando o seu código ou link exclusivo.
        </p>

        <div class="bolao-invite-copy-box">
          <span style="font-size:0.8rem;color:var(--chalk-dim);display:block;margin-bottom:4px;">Link de Acesso:</span>
          <div style="display:flex;gap:8px;">
            <input type="text" readonly value="${escapeHtml(inviteUrl)}" class="bolao-input" id="invite-url-input" style="font-family:var(--font-mono);font-size:0.85rem;" />
            <button class="btn primary small" id="btn-copy-tab-link">Copiar</button>
          </div>
        </div>

        <div style="margin-top:14px;">
          <button class="btn ghost small" id="btn-whatsapp-tab-link" style="width:100%;">
            📲 Compartilhar no WhatsApp
          </button>
        </div>
      </div>

      <!-- Card de Regras Oficiais -->
      <div class="bolao-info-card">
        <h3 class="bolao-info-title">📜 Regras Oficiais da Liga</h3>
        <ul class="bolao-rules-list">
          <li>
            <div class="rule-bullet">3</div>
            <div>
              <strong>Placar Exato (Cravada) — 3 Pontos</strong>
              <p>Se você apostou 2x1 e o jogo terminou exatamente 2x1, ganha 3 pontos.</p>
            </div>
          </li>
          <li>
            <div class="rule-bullet">1</div>
            <div>
              <strong>Acertou o Resultado — 1 Ponto</strong>
              <p>Se você apostou 2x0 para o Time A e terminou 1x0 para o Time A (ou apostou empate 1x1 e terminou 2x2), ganha 1 ponto.</p>
            </div>
          </li>
          <li>
            <div class="rule-bullet">0</div>
            <div>
              <strong>Errou o Resultado — 0 Pontos</strong>
              <p>Se você apostou no Time A e deu empate ou vitória do Time B, você não pontua.</p>
            </div>
          </li>
          <li>
            <div class="rule-bullet">⏱️</div>
            <div>
              <strong>Prazo Limite: 10 Minutos Antes do Início</strong>
              <p>Os palpites de cada partida fecham rigorosamente 10 minutos antes do início oficial do jogo. Após esse prazo, os palpites são travados e os amigos podem ver o palpite uns dos outros.</p>
            </div>
          </li>
        </ul>
      </div>

      <!-- Competições Válidas nesta Liga -->
      <div class="bolao-info-card" style="grid-column:1 / -1;">
        <h3 class="bolao-info-title">🏆 Competições Válidas Nesta Liga (${compObjects.length})</h3>
        <div class="bolao-valid-comps-grid">
          ${compObjects.map(c => `
            <div class="bolao-valid-comp-pill">
              <img src="https://media.api-sports.io/football/leagues/${c.id}.png" alt="" loading="lazy" />
              <div>
                <strong style="display:block;font-size:0.9rem;">${escapeHtml(c.name)}</strong>
                <span style="font-size:0.75rem;color:var(--chalk-dim);">${escapeHtml(c.country)}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-copy-tab-link")?.addEventListener("click", () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      toast("Link de convite copiado para a área de transferência! ✅", false);
    }).catch(() => {
      toast("Não foi possível copiar automaticamente.");
    });
  });

  document.getElementById("btn-whatsapp-tab-link")?.addEventListener("click", () => {
    const text = encodeURIComponent(`🏆 Venha participar do meu Bolão "${league.name}" no FutStats! Entre agora pelo link:\n${inviteUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  });
}


// ============================================================
// Modal de Compartilhamento / Convite
// ============================================================
function showBolaoShareModal(inviteCode, leagueName) {
  const existing = document.getElementById("bolao-share-modal-backdrop");
  if (existing) existing.remove();

  const inviteUrl = `${window.location.origin}/#/bolao/convite/${inviteCode}`;

  const modal = document.createElement("div");
  modal.id = "bolao-share-modal-backdrop";
  modal.className = "modal-backdrop";
  modal.style.display = "flex";

  modal.innerHTML = `
    <div class="notif-modal-card" style="max-width:440px;">
      <div class="notif-modal-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:1.4rem;">🔗</span>
          <h3 style="margin:0;font-size:1.1rem;font-weight:700;">Convidar Amigos para o Bolão</h3>
        </div>
        <button class="btn-modal-close" id="btn-close-share-modal">✕</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px;">
        <p style="color:var(--chalk-dim);font-size:0.9rem;margin:0;">
          Compartilhe este link com quem você quer desafiar no bolão <strong>${escapeHtml(leagueName)}</strong>. Apenas convidados com este link podem entrar!
        </p>

        <div>
          <label style="font-size:0.75rem;color:var(--gold);font-family:var(--font-mono);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px;">
            Código de Acesso
          </label>
          <div class="bolao-share-code-box">${escapeHtml(inviteCode)}</div>
        </div>

        <div>
          <label style="font-size:0.75rem;color:var(--gold);font-family:var(--font-mono);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px;">
            Link Direto de Convite
          </label>
          <div style="display:flex;gap:8px;">
            <input type="text" readonly value="${escapeHtml(inviteUrl)}" class="bolao-input" id="share-modal-url-input" style="font-family:var(--font-mono);font-size:0.85rem;" />
            <button class="btn primary small" id="btn-modal-copy-link">Copiar</button>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:6px;">
          <button class="btn ghost" id="btn-modal-whatsapp" style="flex:1;">
            📲 WhatsApp
          </button>
          ${navigator.share ? `<button class="btn" id="btn-modal-native-share" style="flex:1;">Compartilhar 📤</button>` : ''}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  document.getElementById("btn-close-share-modal")?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.getElementById("btn-modal-copy-link")?.addEventListener("click", () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      toast("Link copiado com sucesso! ✅", false);
    }).catch(() => {
      toast("Selecione e copie o texto manualmente.");
    });
  });

  document.getElementById("btn-modal-whatsapp")?.addEventListener("click", () => {
    const text = encodeURIComponent(`🏆 Venha participar do meu Bolão "${leagueName}" no FutStats! Entre pelo link:\n${inviteUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  });

  document.getElementById("btn-modal-native-share")?.addEventListener("click", async () => {
    try {
      await navigator.share({
        title: `Bolão FutStats — ${leagueName}`,
        text: `Venha participar do meu Bolão "${leagueName}" no FutStats!`,
        url: inviteUrl
      });
    } catch {}
  });
}
