'use strict';

const CACHE_NAME = 'tennis-slice-pop-v42';
const APP_VERSION = 'tennis-slice-pop-34';
const APP_SHELL = [
  './index.html',
  './pwa-update.js?v=tennis-slice-pop-34',
  './styles.css?v=tennis-slice-pop-34',
  './ranking.css?v=tennis-slice-pop-34',
  './court.css?v=tennis-slice-pop-34',
  './intro.css?v=tennis-slice-pop-34',
  './intro.js?v=tennis-slice-pop-34',
  './settings.js?v=tennis-slice-pop-34',
  './court-theme.js?v=tennis-slice-pop-34',
  './ranking-core.js?v=tennis-slice-pop-34',
  './vendor/supabase.js?v=tennis-slice-pop-34',
  './vendor/LICENCES.txt',
  './auth.js?v=tennis-slice-pop-34',
  './ranking-config.js?v=tennis-slice-pop-34',
  './ranking-ui.js?v=tennis-slice-pop-34',
  './game.js?v=tennis-slice-pop-34',
  './manifest.json?v=tennis-slice-pop-34',
  './icon.svg?v=tennis-slice-pop-34',
  './assets/stadium-desktop.jpg',
  './assets/stadium-mobile.jpg',
  './assets/appnoia-logo.png',
  './assets/court-groove.wav',
  './icons/icon-192.png?v=tennis-slice-pop-34',
  './icons/icon-512.png?v=tennis-slice-pop-34',
  './icons/icon-maskable-192.png?v=tennis-slice-pop-34',
  './icons/icon-maskable-512.png?v=tennis-slice-pop-34',
  './icons/apple-touch-icon.png?v=tennis-slice-pop-34',
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
