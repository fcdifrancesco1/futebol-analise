// ============================================================
// Service Worker — FutStats PWA & Push Notifications
// ============================================================

const CACHE_NAME = "futstats-cache-v11";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/fundo.jpeg",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      )
    )
  );
  self.clients.claim();
});

// Sempre busca a versão mais recente da internet primeiro
self.addEventListener("fetch", (e) => {
  if (e.request.url.includes("/api/") || e.request.url.includes("supabase.co")) {
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Se conectou com sucesso, atualiza o cache em segundo plano
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request)) // Se estiver sem internet, usa o cache
  );
});

// ---------- Recebimento de Notificação Push (Com App Fechado) ----------
self.addEventListener("push", (event) => {
  let data = {
    title: "⚽ FutStats",
    body: "Novo evento na partida!",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
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

  const options = {
    body: data.body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    vibrate: [200, 100, 200, 100, 200],
    data: data.data || { url: "/#/" },
    tag: data.tag || "match-event-" + Date.now(),
    renotify: true,
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ---------- Clique na Notificação (Abre a tela do jogo) ----------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/#/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
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