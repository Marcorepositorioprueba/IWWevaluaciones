// sw.js — Service Worker para Wundt PWA (P32 2026-08-26)
// Estrategia: cache-first para assets estáticos, network-first para navegación.
// NO cacheamos el backend (Google Apps Script) — el portal requiere red para datos.

const CACHE_NAME = 'wundt-v1.2';

// En install: pre-cachear lo mínimo indispensable
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        './',
        './index.html',
        './assets/css/app.css',
        './assets/img/willogo.jpg',
        './assets/img/icon-192.png',
        './assets/img/icon-512.png',
        './assets/img/persons.jpg'
      ]).catch((err) => {
        // Si algún asset no existe todavía (ej. PWA sin icono), no fallar
        console.warn('[sw] Algunos assets no se pudieron pre-cachear:', err);
      });
    })
  );
  self.skipWaiting();
});

// En activate: borrar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// En fetch:
// - network-first para navegación (HTML) — para tener siempre la versión más nueva
// - cache-first para assets estáticos (CSS, JS, imágenes) — para offline rápido
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo interceptar mismo origen
  if (url.origin !== self.location.origin) return;

  // No cachear POSTs (mutaciones) ni endpoints del backend
  if (req.method !== 'GET') return;
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('googleusercontent.com') ||
      url.hostname.includes('script.google.com')) return;

  // Network-first para HTML/navegación
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).then((res) => {
        // Si la red responde, clonar y guardar en cache
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return res;
      }).catch(() => {
        // Sin red: servir desde cache
        return caches.match(req).then((cached) => cached || caches.match('./index.html'));
      })
    );
    return;
  }

  // Cache-first para assets estáticos
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => {
        // Si falla (offline + no cache), devolver respuesta vacía
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});