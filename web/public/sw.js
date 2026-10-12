// Service worker de DARF (app instalable + notificaciones push).
// No guarda en caché páginas ni datos privados: solo la página "Sin conexión".
const OFFLINE = "/offline.html";
const CACHE = "darf-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Solo navegación: si no hay internet, muestra la página "Sin conexión".
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : "" }; }
  const title = d.title || "DARF Productions";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: d.id ? `n${d.id}` : undefined,
      data: { href: typeof d.href === "string" && d.href.startsWith("/") ? d.href : "/panel/notificaciones" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.href || "/panel/notificaciones", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.focus().then((f) => (f && "navigate" in f ? f.navigate(url) : f));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
