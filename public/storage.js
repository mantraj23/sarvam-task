let database;

function open() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open("svara-admin", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("surveys", { keyPath: "id" });
      db.createObjectStore("runs", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(new Error("Browser storage is unavailable. Enable site storage to save surveys and recordings.")); };
    request.onblocked = () => { database = null; reject(new Error("Close other SurveySaarthi tabs and reload to finish opening storage.")); };
  });
  return database;
}

async function transaction(store, mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    let result;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(new Error("Could not save or read browser data. Storage may be full or disabled. Your current answer is still on screen; free space and retry."));
  });
}

export const storage = {
  surveys: () => transaction("surveys", "readonly", (store) => store.getAll()),
  runs: () => transaction("runs", "readonly", (store) => store.getAll()),
  saveSurvey: (survey) => transaction("surveys", "readwrite", (store) => store.put(survey)),
  saveRun: (run) => transaction("runs", "readwrite", (store) => store.put(run)),
};
