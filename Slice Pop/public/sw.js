'use strict';

const CACHE_NAME = 'slice-pop-v37';
const APP_VERSION = 'slice-pop-29';
const APP_SHELL = [
  './index.html',
  './pwa-update.js?v=slice-pop-29',
  './styles.css?v=slice-pop-29',
  './ranking.css?v=slice-pop-29',
  './court.css?v=slice-pop-29',
  './intro.css?v=slice-pop-29',
  './intro.js?v=slice-pop-29',
  './settings.js?v=slice-pop-29',
  './court-theme.js?v=slice-pop-29',
  './ranking-core.js?v=slice-pop-29',
  './ranking-config.js?v=slice-pop-29',
  './ranking-ui.js?v=slice-pop-29',
  './game.js?v=slice-pop-29',
  './manifest.json?v=slice-pop-29',
  './icon.svg?v=slice-pop-29',
  './assets/stadium-desktop.jpg',
  './assets/stadium-mobile.jpg',
  './assets/appnoia-logo.png',
  './assets/court-groove.wav',
  './icons/icon-192.png?v=slice-pop-29',
  './icons/icon-512.png?v=slice-pop-29',
  './icons/icon-maskable-192.png?v=slice-pop-29',
  './icons/icon-maskable-512.png?v=slice-pop-29',
  './icons/apple-touch-icon.png?v=slice-pop-29',
  './fonts/oswald-variable.ttf',
  './fonts/share-tech-mono-regular.ttf',
  './fonts/unbounded-variable.ttf',
];

self.addEventListener('message', event => {
  if (event.data?.type === 'slice-pop:version') {
    event.ports[0]?.postMessage({ version: APP_VERSION });
  }
});

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => /^(?:slice|ace)-pop-/.test(key) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            event.waitUntil(
              caches.open(CACHE_NAME)
                .then(cache => cache.put('./index.html', response.clone()))
            );
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(request)) || cache.match('./index.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          event.waitUntil(
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, response.clone()))
          );
        }
        return response;
      }))
  );
});
