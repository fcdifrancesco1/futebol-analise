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

function canonicalPushKey(value) {
  return String(value || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const NotificationManager = {
  async init() {
    if (!Array.isArray(state.favoriteTeams)) state.favoriteTeams = [];
    if (!Array.isArray(state.favoriteFixtures)) state.favoriteFixtures = [];

    // Garante que o time do coração (ex: Real Madrid) esteja na lista de times seguidos
    const heartTeam = UserPrefs.getFavoriteTeam();
    if (heartTeam && heartTeam.id && !state.favoriteTeams.some(f => Number(f.id) === Number(heartTeam.id))) {
      state.favoriteTeams.push({ id: Number(heartTeam.id), name: heartTeam.name, logo: heartTeam.logo });
    }

    await this.updateBellUI();
    this.bindModalEvents();


    // Sincroniza preferências atualizadas com o servidor
    if (!safeReadStorage(browserStorage("localStorage"), "ap_alerts_disabled", false) && await this.isSubscribed()) {
      this.syncPreferences().catch(err => toast("Não foi possível sincronizar alertas: " + err.message));
    }
  },

  async isSubscribed() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch {
      return false;
    }
  },

  async updateBellUI() {
    const isSub = await this.isSubscribed();
    const isExplicitlyDisabled = safeReadStorage(browserStorage("localStorage"), "ap_alerts_disabled", false);
    const active = isSub && this._persisted === true && !isExplicitlyDisabled;
    const dot = document.getElementById("bell-active-dot");
    const masterToggle = document.getElementById("toggle-notif-master");
    if (dot) dot.hidden = !active;
    if (masterToggle) {
      masterToggle.checked = active;
    }
  },

  async subscribe(options = {}) {
    const silent = Boolean(options && options.silent);
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      if (!silent) toast("Seu navegador não suporta notificações Push.");
      return false;
    }

    if (!("Notification" in window)) {
      if (!silent) toast("Seu navegador não suporta a API de Notificações.");
      return false;
    }

    let perm = Notification.permission;
    if (perm !== "granted") {
      try {
        perm = await Notification.requestPermission();
      } catch (err) {
        console.warn("Erro ao pedir permissão:", err);
      }
    }

    if (perm === "denied") {
      if (!silent) toast("Notificações bloqueadas no Chrome. Clique no ícone de cadeado/ajustes ao lado da URL para permitir.");
      return false;
    }

    if (perm !== "granted") {
      if (!silent) toast("Permissão de notificação não foi concedida.");
      return false;
    }

    let createdSubscription = null;
    try {
      let reg;
      if (navigator.serviceWorker.controller) {
        reg = await navigator.serviceWorker.ready;
      } else {
        await navigator.serviceWorker.register('/sw.js');
        reg = await navigator.serviceWorker.ready;
      }

      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        const configRes = await fetch("/api/subscribe");
        if (!configRes.ok) throw new Error("Configuração Push indisponível.");
        const config = await configRes.json();
        if (!config.vapidPublicKey) throw new Error("Chave pública Push indisponível.");
        const cleanVapidKey = String(config.vapidPublicKey || "").replace(/^[\"']|[\"']$/g, "").trim();
        const convertedVapidKey = urlBase64ToUint8Array(cleanVapidKey);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });
        createdSubscription = sub;
      }

      const subJson = sub.toJSON ? sub.toJSON() : {};
      const rawP256dh = sub.getKey ? sub.getKey("p256dh") : null;
      const rawAuth = sub.getKey ? sub.getKey("auth") : null;
      const p256dh = subJson.keys?.p256dh || (rawP256dh ? btoa(String.fromCharCode(...new Uint8Array(rawP256dh))) : "");
      const auth = subJson.keys?.auth || (rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))) : "");
      const endpoint = sub.endpoint || subJson.endpoint;

      if (!endpoint || !p256dh || !auth) {
        throw new Error("Não foi possível extrair as chaves Push do navegador.");
      }

      await this.saveToSupabase(endpoint, p256dh, auth);
      localStorage.removeItem("ap_alerts_disabled");
      await this.updateBellUI();
      return true;
    } catch (err) {
      if (createdSubscription) await createdSubscription.unsubscribe().catch(() => {});
      this._persisted = false;
      await this.updateBellUI();
      console.error("Erro ao assinar notificações Push:", err);
      const pushServiceError = /registration failed\s*[-–]\s*push service error/i.test(String(err.message || err));
      if (!silent) {
        toast(pushServiceError
          ? "O navegador não conseguiu se registrar no serviço Push. Verifique a conexão e tente novamente. Se persistir, atualize o navegador ou teste sem VPN/bloqueador. Os alertas continuam desativados."
          : "Erro ao ativar notificações: " + (err.message || err));
      }
      return false;
    }
  },

  async saveToSupabase(endpoint, p256dh, auth, isTest = false) {
    if (!endpoint || !p256dh || !auth) throw new Error("Chaves Push incompletas.");
    const payload = {
      endpoint,
      p256dh: canonicalPushKey(p256dh),
      auth: canonicalPushKey(auth),
      favorite_teams: state.favoriteTeams.map(team => Number(team.id)),
      preferences: {
        ...Object.fromEntries(['goals','lineups','kickoff','halftime','fulltime','redcards'].map(key => [key, state.notificationPrefs[key] !== false])),
        favorite_fixtures: state.favoriteFixtures.map(fixture => Number(fixture.id))
      },
      test: isTest
    };

    // Envia para o endpoint backend próprio (/api/subscribe)
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Não foi possível salvar alertas (${res.status}).`);
      }
      this._persisted = true;
    } catch (err) {
      this._persisted = false;
      throw err;
    }
  },

  async unsubscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const subJson = sub.toJSON ? sub.toJSON() : {};
        const rawAuth = sub.getKey ? sub.getKey("auth") : null;
        const auth = subJson.keys?.auth || (rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))) : undefined);
        const response = await fetch("/api/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint || subJson.endpoint,
            auth: canonicalPushKey(auth)
          })
        });
        if (!response.ok) throw new Error("Não foi possível desativar alertas no servidor.");
        await sub.unsubscribe().catch(err => console.warn("Alertas removidos do servidor; limpeza local pendente:", err));
        this._persisted = false;
      }
    } catch (err) {
      throw err;
    }
    localStorage.setItem("ap_alerts_disabled", "true");
    await this.updateBellUI();
    toast("Notificações desativadas.");
  },

  // Match alerts are sent exclusively by the server Push pipeline.
  async checkLiveAlerts() {},

  async syncPreferences() {
    localStorage.setItem("ap_fav_teams", JSON.stringify(state.favoriteTeams));
    localStorage.setItem("ap_fav_fixtures", JSON.stringify(state.favoriteFixtures));
    localStorage.setItem("ap_notif_prefs", JSON.stringify(state.notificationPrefs));

    if (!safeReadStorage(browserStorage("localStorage"), "ap_alerts_disabled", false) && await this.isSubscribed()) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const subJson = sub.toJSON ? sub.toJSON() : {};
          const rawP256dh = sub.getKey ? sub.getKey("p256dh") : null;
          const rawAuth = sub.getKey ? sub.getKey("auth") : null;
          const p256dh = subJson.keys?.p256dh || (rawP256dh ? btoa(String.fromCharCode(...new Uint8Array(rawP256dh))) : "");
          const auth = subJson.keys?.auth || (rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))) : "");
          const endpoint = sub.endpoint || subJson.endpoint;
          if (endpoint && p256dh && auth) {
            await this.saveToSupabase(endpoint, p256dh, auth);
          }
        }
      } catch (err) {
        throw err;
      }
    }
    this.renderFavoriteTeamsList();
    this.renderFavoriteFixturesList();
    await this.updateBellUI();
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
      btn.addEventListener("click", async () => {
        const fid = Number(btn.dataset.fixtureId);
        state.favoriteFixtures = state.favoriteFixtures.filter(f => f.id !== fid);
        await this.syncPreferences();
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
      btn.addEventListener("click", async () => {
        const tid = Number(btn.dataset.teamId);
        state.favoriteTeams = state.favoriteTeams.filter(t => t.id !== tid);
        await this.syncPreferences();
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

    const openModal = async () => {
      if (!modal) return;
      modal.hidden = false;
      modal.style.display = "flex";
      this.renderFavoriteTeamsList();
      this.renderFavoriteFixturesList();
      await this.updateBellUI();

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
        try {
        if (e.target.checked) {
          const ok = await this.subscribe();
          if (!ok) {
            e.target.checked = false;
          }
        } else {
          await this.unsubscribe();
        }
        await this.updateBellUI();
        } catch (err) {
          toast("Não foi possível alterar alertas: " + err.message);
          await this.updateBellUI();
        }
      });
    }

    if (testBtn) {
      testBtn.addEventListener("click", async () => {
        if (!("Notification" in window)) {
          toast("Seu navegador não suporta notificações.");
          return;
        }

        if (Notification.permission !== "granted") {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") {
            toast("Permissão para notificações negada no navegador.");
            return;
          }
        }

        try {
          const isSub = await this.isSubscribed();
          const isDisabled = safeReadStorage(browserStorage("localStorage"), "ap_alerts_disabled", false);
          if ((!isSub || isDisabled) && !await this.subscribe()) return;

          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            const subJson = sub.toJSON ? sub.toJSON() : {};
            const rawP256dh = sub.getKey ? sub.getKey("p256dh") : null;
            const rawAuth = sub.getKey ? sub.getKey("auth") : null;
            const p256dh = subJson.keys?.p256dh || (rawP256dh ? btoa(String.fromCharCode(...new Uint8Array(rawP256dh))) : "");
            const auth = subJson.keys?.auth || (rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))) : "");
            const endpoint = sub.endpoint || subJson.endpoint;

            await this.saveToSupabase(endpoint, p256dh, auth, true);
          }

          toast("🔔 Notificação de teste disparada com sucesso!", false);
        } catch (err) {
          console.error("Erro ao testar notificação:", err);
          toast("Erro ao disparar notificação: " + err.message);
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        saveBtn.disabled = true;
        const originalText = saveBtn.textContent;
        saveBtn.textContent = "Salvando...";

        try {
          state.notificationPrefs = {
            goals: document.getElementById("pref-goals")?.checked ?? true,
            lineups: document.getElementById("pref-lineups")?.checked ?? true,
            kickoff: document.getElementById("pref-kickoff")?.checked ?? true,
            halftime: document.getElementById("pref-halftime")?.checked ?? true,
            fulltime: document.getElementById("pref-fulltime")?.checked ?? true,
            redcards: document.getElementById("pref-redcards")?.checked ?? true,
          };
          localStorage.setItem("ap_notif_prefs", JSON.stringify(state.notificationPrefs));

          const masterToggle = document.getElementById("toggle-notif-master");
          const wantsActive = masterToggle ? masterToggle.checked : true;

          if (wantsActive) {
            const ok = await this.subscribe();
            if (!ok) {
              if (masterToggle) masterToggle.checked = false;
              return;
            }
          } else {
            const isSub = await this.isSubscribed();
            if (isSub) {
              await this.unsubscribe();
            } else {
              localStorage.setItem("ap_alerts_disabled", "true");
              await this.syncPreferences();
            }
          }

          await this.updateBellUI();
          closeModal();
          toast("🔔 Preferências de alertas salvas com sucesso!", false);
        } catch (err) {
          console.error("Erro ao salvar ajustes:", err);
          toast("Erro ao salvar ajustes: " + (err.message || err));
          await this.updateBellUI();
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = originalText;
        }
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
            if (!searchInput.isConnected || searchInput.value.trim() !== q) return;
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
              item.addEventListener("click", async () => {
                const teamObj = { id: Number(item.dataset.id), name: item.dataset.name, logo: item.dataset.logo };
                if (!state.favoriteTeams.some(t => t.id === teamObj.id)) {
                  state.favoriteTeams.push(teamObj);
                  await this.syncPreferences();
                  toast(`${teamObj.name} adicionado aos favoritos!`, false);
                }
                searchInput.value = "";
                searchResults.hidden = true;
              });
            });
          } catch (err) {
            if (err.name === 'AbortError' || !searchInput.isConnected || searchInput.value.trim() !== q) return;
            searchResults.innerHTML = `<div style="padding:8px;font-size:0.75rem;color:var(--terracotta);">${escapeHtml(err.message)}</div>`;
          }
        }, 300);
      });
    }
  }
};

// ============================================================
// Formatador de Tempo de Jogo ao Vivo (com Acréscimos)
// ============================================================
