/* Mises à jour immédiates : on demande toujours la dernière version au réseau,
   et on se rabat sur le cache seulement hors ligne. */
const VERSION = 'liferpg-1.4.0';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'sons.js', 'manifest.webmanifest',
  'fonts/pressstart2p.woff2', 'fonts/vt323.woff2','fonts/pixelify.ttf','monde.js', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, {cache:'reload'})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    try {
      const r = await fetch(e.request, {cache:'no-cache'});
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch {
      return (await c.match(e.request, {ignoreSearch:true})) || (await c.match('index.html'));
    }
  })());
});
