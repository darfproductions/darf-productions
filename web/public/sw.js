// Service worker de DARF (app instalable + notificaciones push).
// No guarda en caché páginas ni datos privados: solo la página "Sin conexión" (que muestra la credencial y los
// boletos que Mi cuenta dejó guardados en este teléfono, ver components/pwa/SinConexion.tsx).
const OFFLINE = "/offline.html";
const CACHE = "darf-offline-v2";
const LOGO = "/icons/icon-192.png";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, LOGO])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Solo navegación: si no hay internet, muestra la página "Sin conexión" (y su logo).
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET" && new URL(event.request.url).pathname === LOGO) {
    event.respondWith(fetch(event.request).catch(() => caches.match(LOGO)));
    return;
  }
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
      // Solo ligas internas ("/…", nunca "//…"); si no, a Mis notificaciones (existe para todos).
      data: { href: typeof d.href === "string" && /^\/(?![/\\])/.test(d.href) ? d.href : "/cuenta/notificaciones" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.href || "/cuenta/notificaciones", self.location.origin).href;
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
