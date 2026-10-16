// Service Worker: Alarme als Mitteilung anzeigen, beim Antippen die passende Steckdose öffnen (#dev/MAC),
// und schneller Start: App-Dateien frisch vom Server, nach 2 s ohne Netz die zuletzt gespeicherte Version. Daten (/api/) nie.
const CACHE = 'steckdosen-v2'; // bei neuen Dateien hochzählen, damit alte Versionen verschwinden
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.includes('/api/') || u.pathname.endsWith('/sw.js')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(e.request).then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; });
    const cached = await cache.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
    if (!cached) return net;
    return Promise.race([net.catch(() => cached), new Promise((done) => setTimeout(() => done(cached), 2000))]);
  })());
});

self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Steckdosen', {
    body: m.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: m.tag, data: { url: m.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) if ('focus' in c) { await c.focus(); c.postMessage({ type: 'open', url }); return; }
    await self.clients.openWindow(url);
  })());
});
