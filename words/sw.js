'use strict';

// Retire previously installed offline pages without touching review progress.
self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.filter(function (key) {
        return key.indexOf('sqnuzy-vocabulary-app-') === 0;
      }).map(function (key) { return caches.delete(key); }));
    } catch (error) {}
    await self.clients.claim();
    await self.registration.unregister();
    var windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(windows.filter(function (client) {
      var url = new URL(client.url);
      return url.origin === self.location.origin && (url.pathname === '/words' || url.pathname.indexOf('/words/') === 0);
    }).map(function (client) {
      return client.navigate(new URL('/study/', self.location.origin).href).catch(function () {});
    }));
  })());
});
