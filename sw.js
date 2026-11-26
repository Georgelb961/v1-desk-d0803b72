/* Minimal service worker: cache the shell, never cache data JSON/screen. */
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'chart.js', 'manifest.json', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open('v1-shell').then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.pathname.endsWith('.json') || u.pathname.endsWith('.jpg')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
