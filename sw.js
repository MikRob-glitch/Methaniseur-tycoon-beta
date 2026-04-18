// ─────────────────────────────────────────────────────────────────────────────
// Méthaniseur Tycoon — Service Worker v23
// Stratégie : network-first pour index.html, cache-first pour le reste
// Le bump de CACHE_NAME à chaque déploiement force le rafraîchissement.
// ─────────────────────────────────────────────────────────────────────────────
const CACHE_NAME = 'methaniseur-v23-5';

// Ressources essentielles à pré-cacher au premier lancement
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
];

// ─── INSTALL ─────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS).catch((e) => {
        console.warn('[SW] Pré-cache partiel :', e);
      }))
      .then(() => self.skipWaiting()) // Active immédiatement le nouveau SW
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
// Supprime les anciens caches (v22 → v23 etc.)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ignorer les requêtes non-GET (upsert Supabase, POST, etc.)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ne pas cacher les appels Supabase (toujours frais)
  if (url.hostname.includes('supabase.co')) return;

  // Ne pas cacher les CDN externes (React, Babel) — laisser au cache HTTP du navigateur
  if (url.hostname !== self.location.hostname) return;

  // Network-first pour index.html : toujours chercher la dernière version,
  // fallback sur le cache si offline
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first pour le reste (manifest, icônes, sw.js déjà cached)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      });
    })
  );
});

// ─── MESSAGE (trigger manuel de rafraîchissement) ────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
