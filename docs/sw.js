const V = '202609301148';
const SHELL = 'sarig-shell-' + V;
const DATA = 'sarig-data-10233e38'; // changes whenever the song index is rebuilt, so cached chunks never mismatch
const FONTS = 'sarig-fonts-v1';
const PRE = ['./', 'index.html', 'app.js?v=' + V, 'app.css?v=' + V, 'manifest.webmanifest', 'data/index.json?v=' + V, 'data/chords.json?v=' + V,
  'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => (k.startsWith('sarig-shell-') && k !== SHELL) || (k.startsWith('sarig-data-') && k !== DATA)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'cache-all') {
    const n = e.data.chunks || 0;
    e.waitUntil(caches.open(DATA).then(async (c) => {
      let done = 0;
      for (let i = 0; i < n; i++) {
        const url = new URL(`data/s/${i}.json?v=${V}`, self.registration.scope).href;
        if (!(await c.match(url))) { try { const r = await fetch(url); if (r.ok) await c.put(url, r); } catch (err) { /* offline */ } }
        done++;
        if (done % 5 === 0 || done === n) (await self.clients.matchAll()).forEach((cl) => cl.postMessage({ type: 'cache-progress', done, n }));
      }
    }));
  }
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.includes('youtube') || url.hostname.includes('ytimg') || url.hostname.includes('googlevideo')) return;
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (c) => { const hit = await c.match(req); if (hit) return hit; const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }));
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/data/s/')) {
    e.respondWith(caches.open(DATA).then(async (c) => {
      const key = url.href.includes('?') ? url.href : url.href + '?v=' + V;
      const hit = await c.match(key) || await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(key, r.clone());
      return r;
    }));
    return;
  }
  if (url.pathname.endsWith('/data/yt.json')) {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(DATA).then((c) => c.put('yt.json', cp)); } return r; }).catch(() => caches.open(DATA).then((c) => c.match('yt.json'))));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(SHELL).then((c) => c.put('index.html', cp)); return r; }).catch(() => caches.match('index.html', { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || caches.match(req, { ignoreSearch: true }).then((h2) => h2 || fetch(req).then((r) => {
    if (r.ok) { const cp = r.clone(); caches.open(SHELL).then((c) => c.put(req, cp)); }
    return r;
  }))));
});
