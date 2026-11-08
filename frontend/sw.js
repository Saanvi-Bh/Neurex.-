/* sw.js: lets the app open offline after the first visit (cache the app files). */
const CACHE = "neurex-v3";
const FILES = ["./", "./index.html", "./css/styles.css", "./js/store.js", "./js/charts.js", "./js/escalation.js", "./js/call.js", "./js/sound.js", "./js/engine.js", "./js/strip.js", "./js/app.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); return res;
  }).catch(() => hit)));
});
