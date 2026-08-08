const CACHE_NAME = 'wellness-timer-v1';

const APP_SHELL_FILES = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './vendor/leaflet/leaflet.css',
    './vendor/leaflet/leaflet.js',
    './vendor/leaflet/images/layers.png',
    './vendor/leaflet/images/layers-2x.png',
    './vendor/leaflet/images/marker-icon.png',
    './vendor/leaflet/images/marker-icon-2x.png',
    './vendor/leaflet/images/marker-shadow.png',
    './vendor/nosleep/NoSleep.min.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL_FILES))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const request = event.request;

    if (request.method !== 'GET') {
        return;
    }

    const requestUrl = new URL(request.url);
    const isMapTile = requestUrl.hostname.endsWith('tile.openstreetmap.org');

    if (isMapTile) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) {
                    return cached;
                }

                return fetch(request)
                    .then(response => {
                        if (response && response.ok) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
                        }
                        return response;
                    })
                    .catch(() => cached);
            })
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) {
                return cached;
            }

            return fetch(request)
                .then(response => {
                    if (response && response.ok && requestUrl.origin === self.location.origin) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
                    }
                    return response;
                });
        })
    );
});
