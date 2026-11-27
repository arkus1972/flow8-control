// Offline cache for FLOW 8 Control. Bump VERSION when files change.
const VERSION = 'flow8-v70';
const FONTS = ['doto-latin-700', 'doto-latin-900', 'doto-latin-ext-700', 'doto-latin-ext-900',
  'inter-tight-latin-400', 'inter-tight-latin-500', 'inter-tight-latin-600', 'inter-tight-latin-700',
  'inter-tight-latin-ext-400', 'inter-tight-latin-ext-500', 'inter-tight-latin-ext-600', 'inter-tight-latin-ext-700'].map(f => 'fonts/' + f + '-normal.woff2');
const FILES = ['./', 'index.html', 'app.css', 'fonts.css', 'app.js', 'manifest.webmanifest', 'icon.svg'].concat(FONTS);
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // only the app's own files go through the cache; other addresses (the update check on GitHub) go straight to the network
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    // bypass the browser HTTP cache (GitHub Pages caches files for 10 min) so updates show at once
    fetch(e.request.mode === 'navigate' ? new Request(e.request.url, { cache: 'no-cache' }) : new Request(e.request, { cache: 'no-cache' })).then(res => {
      if (!res.ok) return caches.match(e.request).then(c => c || res);   // never keep an error page; offer the last good copy
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
