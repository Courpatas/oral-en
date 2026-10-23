// Service worker : l'app et les phrases fonctionnent hors ligne.
// Changer VERSION à chaque mise en ligne pour que les appareils récupèrent la nouvelle version.
const VERSION = 'oral-en-v0.2.0';
const RUNTIME = 'oral-en-runtime';
const ASSETS = [
  './', 'index.html', 'manifest.json', 'css/app.css',
  'js/app.js', 'js/compare.js', 'js/tts.js', 'js/srs.js', 'js/store.js',
  'js/asr/index.js', 'js/asr/webspeech.js', 'js/asr/whisper.js',
  'data/themes.json', 'data/phrases.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' contourne le cache HTTP pour embarquer les fichiers vraiment à jour.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== RUNTIME) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Bibliothèque transformers.js (plan B Whisper) : mise en cache au premier usage.
  // Les fichiers du modèle sont mis en cache par la bibliothèque elle-même.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // Fichiers de l'app : cache d'abord, mise à jour en arrière-plan.
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
