const CACHE_NAME = 'financas-v11';
const assets = ['./', './index.html', './app.js', './manifest.json'];

self.addEventListener('install', e => {
    self.skipWaiting(); // Força a atualização imediata
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(assets)));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
        })
    );
});

// Estratégia: Rede primeiro, Cache como fallback.
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET' || e.request.url.includes('script.google.com')) return;

    e.respondWith(
        fetch(e.request).then(response => {
            return caches.open(CACHE_NAME).then(cache => {
                cache.put(e.request, response.clone());
                return response;
            });
        }).catch(() => caches.match(e.request))
    );
});
