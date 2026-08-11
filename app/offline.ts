const DB_NAME = "crmvlc-field-v1";
const DB_VERSION = 1;
const SNAPSHOTS = "snapshots";
const OUTBOX = "outbox";
const SNAPSHOT_TTL_MS = 60 * 60 * 1000;
const PHOTO_TARGET_BYTES = 5_500_000;
const PHOTO_MAX_BYTES = 7_500_000;

type SnapshotRecord<T> = {
  key: string;
  userId: string;
  value: T;
  savedAt: number;
  expiresAt: number;
};

type PhotoAuditOutbox = {
  id: string;
  kind: "photo-audit";
  deliveryId: string;
  photo: Blob;
  filename: string;
  mimeType: string;
  latitude: number;
  longitude: number;
  createdAt: number;
  attempts: number;
  lastError: string | null;
};

export type OfflineSnapshot<T> = {
  value: T;
  userId: string;
  savedAt: number;
};

function canUseIndexedDb(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) return Promise.reject(new Error("Archivio offline non disponibile."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: "key" });
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Impossibile aprire l’archivio offline."));
  });
}

async function useStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Operazione offline non riuscita."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Operazione offline annullata."));
    });
  } finally {
    db.close();
  }
}

export async function saveOfflineSnapshot<T>(key: string, userId: string, value: T): Promise<void> {
  if (!canUseIndexedDb()) return;
  const now = Date.now();
  await useStore(SNAPSHOTS, "readwrite", (store) => store.put({
    key,
    userId,
    value,
    savedAt: now,
    expiresAt: now + SNAPSHOT_TTL_MS,
  } satisfies SnapshotRecord<T>));
}

export async function loadOfflineSnapshot<T>(key: string): Promise<OfflineSnapshot<T> | null> {
  if (!canUseIndexedDb()) return null;
  const record = await useStore<SnapshotRecord<T> | undefined>(SNAPSHOTS, "readonly", (store) => store.get(key));
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    await useStore(SNAPSHOTS, "readwrite", (store) => store.delete(key));
    return null;
  }
  return { value: record.value, userId: record.userId, savedAt: record.savedAt };
}

export async function clearOfflineSnapshots(): Promise<void> {
  if (!canUseIndexedDb()) return;
  await useStore(SNAPSHOTS, "readwrite", (store) => store.clear());
}

export async function clearOfflineData(): Promise<void> {
  if (!canUseIndexedDb()) return;
  const db = await openDatabase();
  try {
    await Promise.all([SNAPSHOTS, OUTBOX].map((storeName) => new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const request = transaction.objectStore(storeName).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Pulizia offline non riuscita."));
    })));
  } finally {
    db.close();
  }
  notifyOutboxChanged();
}

export async function prepareDeliveryPhoto(photo: File): Promise<File> {
  const supported = ["image/jpeg", "image/png", "image/webp"].includes(photo.type);
  if (supported && photo.size <= PHOTO_TARGET_BYTES) return photo;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(photo, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Formato fotografico non supportato. Usa la fotocamera o scegli un file JPG, PNG o WebP.");
  }

  try {
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 2200 / Math.max(longestEdge, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Impossibile preparare la fotografia.");

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let quality = 0.86;
    let compressed: Blob | null = null;
    do {
      compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      quality -= 0.08;
    } while (compressed && compressed.size > PHOTO_TARGET_BYTES && quality >= 0.54);

    if (!compressed || compressed.size > PHOTO_MAX_BYTES) {
      throw new Error("La fotografia resta troppo pesante. Ripeti lo scatto con una risoluzione inferiore.");
    }
    const stem = photo.name.replace(/\.[^.]+$/, "") || "consegna";
    return new File([compressed], `${stem}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

export async function queuePhotoAudit(input: {
  deliveryId: string;
  photo: Blob;
  filename: string;
  latitude: number;
  longitude: number;
}): Promise<string> {
  const id = crypto.randomUUID();
  await useStore(OUTBOX, "readwrite", (store) => store.put({
    id,
    kind: "photo-audit",
    deliveryId: input.deliveryId,
    photo: input.photo,
    filename: input.filename,
    mimeType: input.photo.type || "image/jpeg",
    latitude: input.latitude,
    longitude: input.longitude,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  } satisfies PhotoAuditOutbox));
  await registerBackgroundSync();
  notifyOutboxChanged();
  return id;
}

export async function pendingOutboxCount(): Promise<number> {
  if (!canUseIndexedDb()) return 0;
  return useStore<number>(OUTBOX, "readonly", (store) => store.count());
}

export async function syncPhotoAuditOutbox(): Promise<{ sent: number; pending: number }> {
  if (!canUseIndexedDb() || !navigator.onLine) return { sent: 0, pending: await pendingOutboxCount() };
  const records = await useStore<PhotoAuditOutbox[]>(OUTBOX, "readonly", (store) => store.getAll());
  let sent = 0;

  for (const record of records.sort((a, b) => a.createdAt - b.createdAt)) {
    const form = new FormData();
    form.set("deliveryId", record.deliveryId);
    form.set("latitude", String(record.latitude));
    form.set("longitude", String(record.longitude));
    form.set("photo", new File([record.photo], record.filename, { type: record.mimeType }));

    try {
      const response = await fetch("/api/operations/photo-audits", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      if (response.ok) {
        await useStore(OUTBOX, "readwrite", (store) => store.delete(record.id));
        sent += 1;
        continue;
      }
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      await updateOutboxFailure(record, payload?.error?.message ?? `Errore HTTP ${response.status}`);
      if (response.status === 401 || response.status === 403) break;
    } catch (error) {
      await updateOutboxFailure(record, error instanceof Error ? error.message : "Rete non disponibile.");
      break;
    }
  }

  const pending = await pendingOutboxCount();
  notifyOutboxChanged();
  return { sent, pending };
}

async function updateOutboxFailure(record: PhotoAuditOutbox, message: string): Promise<void> {
  await useStore(OUTBOX, "readwrite", (store) => store.put({
    ...record,
    attempts: record.attempts + 1,
    lastError: message.slice(0, 300),
  } satisfies PhotoAuditOutbox));
}

async function registerBackgroundSync(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sync = (registration as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    }).sync;
    await sync?.register("crmvlc-photo-outbox");
  } catch {
    // Safari/iOS does not expose Background Sync. The online event remains the fallback.
  }
}

function notifyOutboxChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("crmvlc:outbox-changed"));
}
