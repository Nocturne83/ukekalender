/* Ukeplanen service worker: offline app shell + push notifications. */
const CACHE = 'ukeplanen-v2.1.2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/badge-96.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first for our own files (so updates show up right away), cache as fallback.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Pages and the app shell always come fresh from the network (no browser cache), so updates show at once.
  const fresh = e.request.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname) || url.pathname.endsWith('sw.js');
  e.respondWith(
    fetch(fresh ? new Request(e.request, { cache: 'no-store' }) : e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});

// Push messages sent through Firebase Cloud Messaging.
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { notification: { body: e.data && e.data.text() } }; }
  const n = data.notification || {};
  const link = (data.fcmOptions && data.fcmOptions.link) || (data.webpush && data.webpush.fcm_options && data.webpush.fcm_options.link) || self.registration.scope;
  e.waitUntil(self.registration.showNotification(n.title || 'Ukeplanen', {
    body: n.body || '',
    icon: n.icon || 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: 'ukeplanen',
    renotify: true,
    data: { link: link }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const scope = self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.startsWith(scope)) return c.focus(); }
    return self.clients.openWindow(scope);
  }));
});
