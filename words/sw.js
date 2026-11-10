'use strict';
var PREFIX = 'sqnuzy-vocabulary-app-';
var CACHE = PREFIX + '20261110-3';
var PAGE = '/words/';
var DATA = '/study/vocabulary.json';
var ASSETS = [
  PAGE, DATA,
  '/words/manifest.webmanifest',
  '/words/icons/icon-192.png',
  '/words/icons/icon-512.png',
  '/words/icons/apple-touch-icon.png',
  '/css/firefly.css?v=2',
  '/css/refined.css?v=10',
  '/css/navigation.css?v=20261031',
  '/css/study.css?v=20261104-1',
  '/css/vocabulary-app.css?v=20261110-1',
  '/js/firefly.js?v=8',
  '/todo/timer/review.js?v=20261101-3',
  '/todo/gist-sync.js?v=20261106-3',
  '/js/vocabulary-core.js?v=20261104-5',
  '/js/vocabulary.js?v=20261108-1',
  '/js/vocabulary-app.js?v=20261110-1'
];
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(ASSETS.map(function (url) { return new Request(url, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key.indexOf(PREFIX) === 0 && key !== CACHE; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});
function notify(event, type) {
  if (event.clientId) event.waitUntil(self.clients.get(event.clientId).then(function (client) {
    if (client) client.postMessage({ type: type });
  }));
}
async function networkFirst(event, key) {
  var cache = await caches.open(CACHE);
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 5000);
  try {
    var response = await fetch(event.request, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Network response unavailable');
    if (key === DATA) {
      var data = await response.clone().json();
      if (!data || !Array.isArray(data.words)) throw new Error('Invalid vocabulary');
    }
    await cache.put(key, response.clone()).catch(function () {});
    if (key === DATA) notify(event, 'vocabulary-online');
    return response;
  } catch (error) {
    var saved = await cache.match(key);
    if (saved) {
      if (key === DATA) notify(event, 'vocabulary-cached');
      return saved;
    }
    return new Response('暂时无法连接。首次使用请联网打开每日单词。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } finally { clearTimeout(timer); }
}
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  var key = url.pathname === '/words' || url.pathname === PAGE ? PAGE : url.pathname === DATA ? DATA : url.pathname + url.search;
  if (ASSETS.indexOf(key) === -1) return;
  event.respondWith(key === DATA ? networkFirst(event, key) : cachedFirst(event, key));
});
async function cachedFirst(event, key) {
  var cache = await caches.open(CACHE);
  var saved = await cache.match(key);
  return saved || networkFirst(event, key);
}
