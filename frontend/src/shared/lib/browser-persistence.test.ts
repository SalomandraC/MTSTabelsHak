import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { clearBrowserPersistence } from './browser-persistence';

describe('clearBrowserPersistence', () => {
  const originalCaches = window.caches;
  const originalIndexedDb = window.indexedDB;

  beforeEach(() => {
    window.localStorage.setItem('wikilive:selected-space-id', 'space-1');
    window.sessionStorage.setItem('temporary', 'value');

    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn(async () => ['wikilive-runtime', 'wikilive-api']),
        delete: vi.fn(async () => true),
      },
    });

    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: {
        databases: vi.fn(async () => [{ name: 'wikilive-db' }]),
        deleteDatabase: vi.fn(() => {
          const request = {} as IDBOpenDBRequest;
          queueMicrotask(() => {
            request.onsuccess?.({} as Event);
          });
          return request;
        }),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: originalCaches,
    });
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: originalIndexedDb,
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('clears local/session storage and browser-managed caches', async () => {
    await clearBrowserPersistence();

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.caches.keys).toHaveBeenCalledTimes(1);
    expect(window.caches.delete).toHaveBeenCalledWith('wikilive-runtime');
    expect(window.caches.delete).toHaveBeenCalledWith('wikilive-api');
    expect(window.indexedDB.databases).toHaveBeenCalledTimes(1);
    expect(window.indexedDB.deleteDatabase).toHaveBeenCalledWith('wikilive-db');
  });
});
