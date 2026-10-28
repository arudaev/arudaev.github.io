// VOYAGER // 56K — the service worker that makes the game installable and lets
// it start without a connection (a 56k modem is not always on, after all).
//   · the page itself: network first, so a new build shows up on the next visit
//   · everything else from this origin (JS/CSS, models, images) and the three
//     bitmap webfonts: straight from the cache, refreshed in the background
// Bump VERSION to drop every cached file at once.
const VERSION = 'v2';
const CACHE = `voyager56k-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // only our own files and the webfonts – the guestbook and counter go straight out
  const ours = url.origin === self.location.origin;
  const font = url.hostname === 'fonts.gstatic.com';
  if (req.method !== 'GET' || !(ours || font)) return;

  if (req.mode === 'navigate') {
    // Only the game's own page. Other sites on this origin (/THD-Room-Finder/
    // and its /thd-room-finder/ redirect) must never be cached as the start page.
    if (url.pathname !== '/' && url.pathname !== '/index.html') return;
    event.respondWith(
      fetch(req)
        .then((res) => {
          // only a good page becomes the offline start page – never a 404 or a 5xx
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // stale-while-revalidate: answer from the cache at once, refresh it behind
  event.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit ?? fresh;
    }),
  );
});
