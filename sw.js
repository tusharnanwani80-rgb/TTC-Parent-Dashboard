const CACHE_NAME = 'ttc-pd-cache-v1';

// Install event
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// A basic fetch listener is strictly required by browsers 
// to pass the PWA installability criteria.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('You are offline.', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    })
  );
});
