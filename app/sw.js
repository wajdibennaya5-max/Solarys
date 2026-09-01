/**
 * Service worker : met l'application en cache pour un fonctionnement hors
 * ligne complet. Stratégie « cache d'abord » sur les ressources de
 * l'application, qui sont toutes statiques et versionnées par CACHE.
 */

const CACHE = 'solarys-v6';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css', './css/print.css',
  './assets/icons/icon.svg', './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './js/app.js', './js/state.js', './js/i18n.js', './js/licence.js', './js/download.js',
  './js/core/solar.js', './js/core/sizing.js', './js/core/energy.js',
  './js/core/battery.js', './js/core/cabling.js', './js/core/finance.js',
  './js/core/layout.js', './js/core/rowspacing.js', './js/core/field.js',
  './js/model/geometry.js', './js/model/surface.js',
  './js/data/components.js', './js/data/sites.js',
  './js/ui/charts.js', './js/ui/sld.js', './js/ui/sheet.js', './js/ui/dossier.js',
  './js/ui/plan2d.js',
  './js/ui/dom.js', './js/ui/views.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((res) => {
      // On ne met en cache que les réponses de même origine.
      if (res.ok && new URL(e.request.url).origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
