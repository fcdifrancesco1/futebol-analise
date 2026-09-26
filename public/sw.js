// Same-origin application shell only; API, user data and remote images never enter this cache.
const CACHE_NAME = "futstats-cache-v110";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/style.css",
  "/css/features.css",
  "/css/accessibility.css",
  "/css/redesign.css",
  "/app.js",
  "/js/cache.js",
  "/js/models.js",
  "/js/core.js",
  "/js/notifications.js",
  "/js/shared-ui.js",
  "/js/favorite-team.js",
  "/js/leagues.js",
  "/js/players.js",
  "/js/teams.js",
  "/js/matches.js",
  "/js/fixture.js",
  "/js/comparison.js",
  "/js/lineups.js",
  "/js/broadcast.js",
  "/js/accessibility.js",
  "/js/bolao.js",
  "/manifest.json",
  "/fundo.jpeg",
  "/icon-192.png",
  "/icon-512.png",
  "/badge-96.png"
];
const ASSET_PATHS = new Set(ASSETS_TO_CACHE);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("futstats-cache-") && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !ASSET_PATHS.has(url.pathname)) return;
  // Canonical paths bound cache size to the allowlist, independent of cache-busting queries.
  const key = url.pathname;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type !== "opaque" && !response.redirected) {
        await cache.put(key, response.clone()).catch(() => {});
      }
      if (response.ok) return response;
      const saved = await cache.match(key);
      return saved || response;
    } catch {
      const saved = await cache.match(key);
      if (saved) return saved;
      if (event.request.mode === "navigate") {
        const shell = await cache.match("/index.html");
        if (shell) return shell;
      }
      return new Response("Sem conexão. Tente novamente quando estiver online.", {
        status: 503, headers: {"Content-Type":"text/plain; charset=utf-8"}
      });
    }
  })());
});

// ---------- Recebimento de Notificação Push (Com App Fechado) ----------
self.addEventListener("push", (event) => {
  let data = {
    title: "⚽ FutStats",
    body: "Novo evento na partida!",
    icon: "/icon-192.png",
    data: { url: "/#/" }
  };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  // Opções otimizadas para o Google Chrome em Windows e Android
  const options = {
    body: data.body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/badge-96.png",
    vibrate: [200, 100, 200, 100, 200],
    data: data.data || { url: "/#/" },
    tag: data.tag || "match-event-" + Date.now(),
    renotify: true,
    requireInteraction: true, // Mantém a notificação visível na tela até ser vista
    silent: false,
    actions: [
      { action: "open", title: "Ver Detalhes ⚽" }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options).catch((err) => {
      console.warn("Aviso ao exibir notificação, acionando fallback local:", err);
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        vibrate: [200, 100, 200],
        data: data.data || { url: "/#/" },
        tag: data.tag || "match-event-" + Date.now(),
        renotify: true,
        requireInteraction: true
      });
    })
  );
});

// ---------- Clique na Notificação (Abre a tela do jogo) ----------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = new URL(event.notification.data?.url || "/#/", self.location.origin);
  const targetUrl = requestedUrl.origin === self.location.origin ? requestedUrl.href : self.location.origin + "/#/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
