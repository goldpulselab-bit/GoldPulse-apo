const CACHE_NAME = "goldpulse-v5";
const FILES_TO_CACHE = ["./","./manifest.json"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))); self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", event => { if (event.request.method !== "GET") return; event.respondWith(fetch(event.request).then(response => { const copy=response.clone(); const u=new URL(event.request.url); if (u.pathname.endsWith(".html") || u.pathname.endsWith("/")) caches.open(CACHE_NAME).then(c=>c.put(event.request,copy)); return response; }).catch(() => caches.match(event.request))); });
