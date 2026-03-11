const CACHE_NAME = 'financas-v20';

const assets = [
  './',
  './index.html',
  './apps.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(assets))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {

  // Sempre tenta internet primeiro
  e.respondWith(
    fetch(e.request)
      .then(response => {

        const clone = response.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, clone);
        });

        return response;

      })
      .catch(() => {
        return caches.match(e.request);
      })
  );

});
