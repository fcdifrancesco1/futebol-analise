function parseHash() {
  return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.nav === name));
  document.querySelectorAll(".bottom-nav-item").forEach(t => t.classList.toggle("active", t.dataset.nav === name));
  document.querySelectorAll(".desktop-more, .mobile-more").forEach(menu => menu.classList.toggle("active", name === "mylineups" || name === "myteam"));
}

async function router() {
  document.querySelectorAll('.desktop-more, .mobile-more').forEach(menu => { menu.open = false; });
  const ticker = document.getElementById('day-ticker');
  if (ticker) ticker.hidden = true;
  document.querySelectorAll('#onboarding-modal-backdrop, #player-match-modal-backdrop, #squad-picker-backdrop').forEach(modal => modal.remove());
  const notificationModal = document.getElementById('notif-modal-backdrop');
  if (notificationModal) { notificationModal.hidden = true; notificationModal.style.display = 'none'; }
  routeController.abort();
  routeController = new AbortController();
  const shell = document.getElementById("app");
  const root = document.createElement("div");
  root.id = "route-view";
  shell.replaceChildren(root);
  app = root;
  const routeApp = root;

  if (state.liveTimer) {
    clearInterval(state.liveTimer);
    state.liveTimer = null;
  }

  const parts = parseHash();
  window.scrollTo(0, 0);
  updateCompareBadge();

  try {
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
    } else if (parts[0] === "bolao") {
      setActiveTab("bolao");
      if (parts[1] === "criar") {
        await renderBolaoCreate();
      } else if (parts[1] === "convite" && parts[2]) {
        await renderBolaoInvite(parts[2]);
      } else if (parts[1] === "liga" && parts[2]) {
        await renderBolaoLeague(parts[2], parts[3]);
      } else {
        await renderBolaoHome();
      }
    } else {
      // Página padrão ao abrir o site e app: Jogos do Dia
      setActiveTab("today");
      await renderMatchesOfDay(parts[1]);
    }
  } catch (err) {
    if (err.name === "AbortError" || routeApp !== app) return;
    console.error("Router error:", err);
    routeApp.innerHTML = errorBox("Erro ao carregar os dados: " + (err.message || "Tente novamente."));
  }
}

window.addEventListener("hashchange", router);

function initApp() {
  initAccessibility();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").then(reg => reg.update()).catch(err => console.warn("Service Worker indisponível:", err));
  NotificationManager.init().catch(err => toast(err.message));
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
      const targetHash = nav === "home" ? "#/ligas"
        : nav === "today" ? "#/jogos-do-dia"
        : nav === "myteam" ? "#/meu-time"
        : nav === "live" ? "#/aovivo"
        : nav === "mylineups" ? "#/minha-escalacao"
        : nav === "bolao" ? "#/bolao" : "#/";
      const currentHash = location.hash || "#/";
      if (currentHash === targetHash || (nav === "today" && (currentHash === "#/" || currentHash.startsWith("#/jogos-do-dia")))) {
        if (nav === "today") {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
          const today = getLocalDateString(new Date());
          footballClient.invalidate("fixtures", { date: today, timezone: tz });
          footballClient.invalidate("fixtures", { date: today });
          footballClient.invalidate("fixtures", { live: "all" });
          const activeFilter = document.querySelector(".matches-day-filter-btn.active")?.dataset?.filter || "all";
          fetchAndRenderDayMatches(today, activeFilter, true);
        } else if (nav === "live") {
          footballClient.invalidate("fixtures", { live: "all" });
          fetchLiveMatches(true);
        } else if (nav === "bolao") {
          renderBolaoHome();
        }
      } else {
        location.hash = targetHash;
      }
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
    if (isGlobalRefreshing || document.hidden) return;
    isGlobalRefreshing = true;

    const hash = location.hash || "#/";
    try {
      if (hash.startsWith("#/jogo/")) {
        const fixtureId = Number(hash.replace("#/jogo/", "").split("/")[0]);
        if (fixtureId) {
          footballClient.invalidate("fixtures", { id: fixtureId });
          footballClient.invalidate("fixtures/events", { fixture: fixtureId });
          footballClient.invalidate("fixtures/statistics", { fixture: fixtureId });
          // Player data and provisional lineups expire within sixty seconds.
          await renderFixture(fixtureId, true);
        }
      } else if (hash === "#/aovivo") {
        await fetchLiveMatches(true);
      } else if (hash === "#/" || hash === "#/jogos-do-dia" || hash.startsWith("#/jogos-do-dia/")) {
        const datePart = hash.startsWith("#/jogos-do-dia/") ? hash.split('/')[2] : '';
        const targetDate = datePart || getLocalDateString(new Date());
        const activeFilter = document.querySelector(".matches-day-filter-btn.active")?.dataset?.filter || "all";
        const todayStr = getLocalDateString(new Date());
        const isToday = !datePart || datePart === todayStr;
        if (isToday) {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
          footballClient.invalidate("fixtures", { date: targetDate, timezone: tz });
          footballClient.invalidate("fixtures", { date: targetDate });
        }
        await fetchAndRenderDayMatches(targetDate, activeFilter, isToday);
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
  async function triggerVisibilityRefresh() {
    const elapsedBg = Date.now() - lastBackgroundTime;
    if (elapsedBg > 3000) {
      lastBackgroundTime = Date.now();
      await executeGlobal30sRefresh();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      triggerVisibilityRefresh();
    } else {
      lastBackgroundTime = Date.now();
    }
  });

  window.addEventListener("focus", () => {
    triggerVisibilityRefresh();
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
