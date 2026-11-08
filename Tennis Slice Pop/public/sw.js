'use strict';

const CACHE_NAME = 'tennis-slice-pop-v40';
const APP_VERSION = 'tennis-slice-pop-32';
const APP_SHELL = [
  './index.html',
  './pwa-update.js?v=tennis-slice-pop-32',
  './styles.css?v=tennis-slice-pop-32',
  './ranking.css?v=tennis-slice-pop-32',
  './court.css?v=tennis-slice-pop-32',
  './intro.css?v=tennis-slice-pop-32',
  './intro.js?v=tennis-slice-pop-32',
  './settings.js?v=tennis-slice-pop-32',
  './court-theme.js?v=tennis-slice-pop-32',
  './ranking-core.js?v=tennis-slice-pop-32',
  './vendor/supabase.js?v=tennis-slice-pop-32',
  './vendor/LICENCES.txt',
  './auth.js?v=tennis-slice-pop-32',
  './ranking-config.js?v=tennis-slice-pop-32',
  './ranking-ui.js?v=tennis-slice-pop-32',
  './game.js?v=tennis-slice-pop-32',
  './manifest.json?v=tennis-slice-pop-32',
  './icon.svg?v=tennis-slice-pop-32',
  './assets/stadium-desktop.jpg',
  './assets/stadium-mobile.jpg',
  './assets/appnoia-logo.png',
  './assets/court-groove.wav',
  './icons/icon-192.png?v=tennis-slice-pop-32',
  './icons/icon-512.png?v=tennis-slice-pop-32',
  './icons/icon-maskable-192.png?v=tennis-slice-pop-32',
  './icons/icon-maskable-512.png?v=tennis-slice-pop-32',
  './icons/apple-touch-icon.png?v=tennis-slice-pop-32',
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
          .filter(key => /^(?:(?:tennis-)?slice|ace)-pop-/.test(key) && key !== CACHE_NAME)
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
