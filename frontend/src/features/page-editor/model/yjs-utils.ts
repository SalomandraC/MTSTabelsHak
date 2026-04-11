export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export type StoredDraft = {
  value: string;
  updatedAt: string;
  checkpointId: string | null;
  serverVersion: number;
};

export function draftStorageKey(pageId: string) {
  return `wikilive:draft:${pageId}`;
}

export function readStoredDraft(pageId: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(pageId));
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
}

export function writeStoredDraft(pageId: string, draft: StoredDraft) {
  try {
    localStorage.setItem(draftStorageKey(pageId), JSON.stringify(draft));
  } catch {
    // Browser storage may be unavailable in private mode or after quota errors.
  }
}
