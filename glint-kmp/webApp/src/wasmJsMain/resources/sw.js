/* Offline shell for the Glint wasm preview — the sw.js equivalent:
   cache-first for the app shell, network-only for API/proxy traffic. */
const CACHE = 'glint-kmp-v1';
const SHELL = ['.', 'index.html', 'glint.js', 'manifest.webmanifest', 'offline.html',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-64.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) return; // sources + proxy go to the network
  event.respondWith(
    caches.match(event.request).then((hit) => hit ||
      fetch(event.request).then((response) => {
        const copy = response.clone();
        if (response.ok) caches.open(CACHE).then((c) => c.put(event.request, copy));
        return response;
      }).catch(() => (event.request.mode === 'navigate' ? caches.match('offline.html') : undefined))),
  );
});
