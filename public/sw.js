const CACHE_NAME = "crmvlc-shell-v17";
const FIELD_DB = "crmvlc-field-v1";
const FIELD_DB_VERSION = 1;
const SNAPSHOTS = "snapshots";
const OUTBOX = "outbox";
const SYNC_TAG = "crmvlc-photo-outbox";
const SHELL = [
  "/",
  "/login",
  "/vip",
  "/favicon.svg",
  "/brand/viv-le-canarie-icon.svg",
  "/manifest.webmanifest",
  "/vip.webmanifest",
  "/icons/crmvlc-192.png",
  "/icons/crmvlc-512.png",
  "/icons/crmvlc-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request, url));
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname === "/favicon.svg" || url.pathname.startsWith("/brand/") || url.pathname.endsWith(".webmanifest")) {
    event.respondWith(cacheFirstAsset(request));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(syncPhotoAuditOutbox());
});

async function networkFirstPage(request, url) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch {
    return (await caches.match(request))
      ?? (await caches.match(url.pathname.startsWith("/vip") ? "/vip" : url.pathname.startsWith("/login") ? "/login" : "/"))
      ?? Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
  return response;
}

function openFieldDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FIELD_DB, FIELD_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: "key" });
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Archivio offline non disponibile."));
  });
}

async function outboxOperation(mode, operation) {
  const db = await openFieldDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(OUTBOX, mode);
      const request = operation(transaction.objectStore(OUTBOX));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Operazione offline non riuscita."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Operazione offline annullata."));
    });
  } finally {
    db.close();
  }
}

async function syncPhotoAuditOutbox() {
  const session = await fetch("/api/bootstrap", { credentials: "same-origin" });
  if (!session.ok) return;
  const bootstrap = await session.json();
  const userId = bootstrap?.user?.id;
  if (!userId) return;

  const allRecords = await outboxOperation("readonly", (store) => store.getAll());
  const records = allRecords.filter((record) => record.userId === userId);
  let sent = 0;

  for (const record of records.sort((a, b) => a.createdAt - b.createdAt)) {
    const form = new FormData();
    form.set("deliveryId", record.deliveryId);
    form.set("latitude", String(record.latitude));
    form.set("longitude", String(record.longitude));
    form.set("photo", record.photo, record.filename);

    try {
      const response = await fetch("/api/operations/photo-audits", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      if (response.ok) {
        await outboxOperation("readwrite", (store) => store.delete(record.id));
        sent += 1;
        continue;
      }

      const payload = await response.json().catch(() => null);
      await outboxOperation("readwrite", (store) => store.put({
        ...record,
        attempts: Number(record.attempts ?? 0) + 1,
        lastError: String(payload?.error?.message ?? `Errore HTTP ${response.status}`).slice(0, 300),
      }));
      break;
    } catch (error) {
      await outboxOperation("readwrite", (store) => store.put({
        ...record,
        attempts: Number(record.attempts ?? 0) + 1,
        lastError: error instanceof Error ? error.message.slice(0, 300) : "Rete non disponibile.",
      }));
      throw error;
    }
  }

  const remaining = await outboxOperation("readonly", (store) => store.getAll());
  const pending = remaining.filter((record) => record.userId === userId).length;
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: "crmvlc:outbox-synced", sent, pending }));
}
