/* Minimal service worker: cache the shell, never cache data JSON/screen.
   Bump VERSION whenever the shell changes so installed phones stop using an
   old cached app.js (which can keep a revoked DATA_PATH forever). */
const VERSION = 'v1-shell-3';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'chart.js', 'manifest.json', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.pathname.endsWith('.json') || u.pathname.endsWith('.jpg')) return;
  e.respondWith(caches.open(VERSION).then(c =>
    c.match(e.request).then(r => r || fetch(e.request))));
});
