/**
 * lib/crypto.ts
 * Payload hashing using the built-in SubtleCrypto API.
 * Works 100% offline — no external dependencies.
 */

export async function hashPayload(payload: object): Promise<string> {
  const msgBuffer = new TextEncoder().encode(JSON.stringify(payload));
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/**
 * Generates a stable device ID stored in localStorage.
 * Used as the vendorId / sender identifier.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('audio-pay-device-id');
  if (!id) {
    id = 'DEV-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem('audio-pay-device-id', id);
  }
  return id;
}

/**
 * Validates that a decoded payload has the expected structure.
 */
export function validatePayload(raw: string): { v: string; a: number; s: string; t: number; n?: string } | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.v === 'string' &&
      typeof parsed.a === 'number' &&
      typeof parsed.s === 'string' &&
      typeof parsed.t === 'number'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
