const DB_NAME = "flip-finder-ai";
const DB_VERSION = 1;
const ITEMS_STORE = "items";
const SETTINGS_STORE = "settings";

let databasePromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("The local database could not be opened."));
  });
}

export function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        const items = db.createObjectStore(ITEMS_STORE, { keyPath: "id" });
        items.createIndex("updatedAt", "updatedAt");
        items.createIndex("stage", "stage");
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Flip Finder could not access storage on this device."));
  });

  return databasePromise;
}

async function store(name, mode = "readonly") {
  const db = await openDatabase();
  return db.transaction(name, mode).objectStore(name);
}

export async function getAllItems() {
  return requestResult((await store(ITEMS_STORE)).getAll());
}

export async function saveItem(item) {
  await requestResult((await store(ITEMS_STORE, "readwrite")).put(item));
  return item;
}

export async function deleteItem(id) {
  await requestResult((await store(ITEMS_STORE, "readwrite")).delete(id));
}

export async function getSetting(key) {
  const record = await requestResult((await store(SETTINGS_STORE)).get(key));
  return record?.value;
}

export async function saveSetting(key, value) {
  await requestResult((await store(SETTINGS_STORE, "readwrite")).put({ key, value }));
  return value;
}

export async function saveManyItems(items) {
  if (!items.length) return;
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(ITEMS_STORE, "readwrite");
    const itemStore = transaction.objectStore(ITEMS_STORE);
    items.forEach((item) => itemStore.put(item));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("The projects could not be saved."));
    transaction.onabort = () => reject(transaction.error || new Error("Saving the projects was cancelled."));
  });
}

export async function clearItems() {
  await requestResult((await store(ITEMS_STORE, "readwrite")).clear());
}
