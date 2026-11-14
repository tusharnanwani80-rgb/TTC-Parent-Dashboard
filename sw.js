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

// ══════════ 🔔 TTC PUSH NOTIFICATIONS ══════════
self.addEventListener('push', function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) {}
  var p = d.data || d.notification || d;               // FCM data-only message → d.data

  event.waitUntil(self.registration.showNotification(p.title || 'TTC', {
    body: p.body || '',
    icon: 'icon.png',
    tag: p.tag || 'ttc',
    renotify: true,
    data: { tab: p.tab || 'home' }
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var tab = (event.notification.data && event.notification.data.tab) || 'home';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) {                       // app already open → just switch tab
          list[i].postMessage({ type: 'ttc-open-tab', tab: tab });
          return list[i].focus();
        }
      }
      return clients.openWindow(self.registration.scope + '#tab=' + tab);   // app closed → launch it
    })
  );
});
