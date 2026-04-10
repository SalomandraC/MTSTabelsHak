import * as Y from 'yjs';

export function encodeBytesToBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

export function decodeBase64ToBuffer(value: string): Buffer {
  return Buffer.from(value, 'base64');
}

export function decodeBase64ToUint8Array(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export function createEmptyYDoc(): Y.Doc {
  return new Y.Doc();
}
