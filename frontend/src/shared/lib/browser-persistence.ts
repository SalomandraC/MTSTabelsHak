export async function clearBrowserPersistence(): Promise<void> {
  try {
    window.localStorage.clear();
  } catch {
    // Ignore storage cleanup failures in restricted browser contexts.
  }

  try {
    window.sessionStorage.clear();
  } catch {
    // Ignore storage cleanup failures in restricted browser contexts.
  }

  try {
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
    }
  } catch {
    // Ignore cache storage cleanup failures; logout should still continue.
  }

  try {
    const indexedDbApi = window.indexedDB as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string }>>;
    };

    if (typeof indexedDbApi.databases === 'function') {
      const databases = await indexedDbApi.databases();
      await Promise.all(
        databases
          .map((database) => database.name)
          .filter((name): name is string => Boolean(name))
          .map(
            (name) =>
              new Promise<void>((resolve) => {
                const request = indexedDbApi.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                request.onblocked = () => resolve();
              }),
          ),
      );
    }
  } catch {
    // Ignore IndexedDB cleanup failures; some browsers do not expose database enumeration.
  }
}
