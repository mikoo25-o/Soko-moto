/* Minimal compatibility service worker for browsers with a stale /sw.js registration.
   It deliberately does not cache or intercept requests. */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
