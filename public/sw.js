const CACHE_NAME = "crmvlc-shell-v13";
const SHELL = ["/", "/vip", "/favicon.svg", "/manifest.webmanifest", "/vip.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;

      if (request.mode === "navigate") {
        const shell = await caches.match(url.pathname.startsWith("/vip") ? "/vip" : "/");
        if (shell) return shell;
      }

      return new Response("Servizio temporaneamente non disponibile.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  })());
});
