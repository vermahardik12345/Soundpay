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
 * Formats a payment into a minimal acoustic payload.
 * Keeping payloads under 25 chars doubles acoustic transmission reliability
 * and drops playback time to ~2 seconds.
 */
export function formatCompactPayload(
  amount: number,
  vendorId: string,
  timestamp: number,
  hash: string,
  note?: string
): string {
  const shortVendor = vendorId.replace(/^DEV-/, '').slice(0, 6);
  const shortHash = hash.slice(0, 8);
  const sec = Math.floor(timestamp / 1000);
  const n = note ? `:${encodeURIComponent(note.slice(0, 15))}` : '';
  return `P:${amount}:${shortVendor}:${sec}:${shortHash}${n}`;
}

/**
 * Validates that a decoded payload has the expected structure.
 * Supports both ultra-compact format (P:...) and standard JSON.
 */
export function validatePayload(raw: string): { v: string; a: number; s: string; t: number; n?: string } | null {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();

  // 1. Try Compact format: P:amount:vendorId:timestamp:hash[:note]
  if (str.startsWith('P:')) {
    const parts = str.split(':');
    if (parts.length >= 5) {
      const amount = parseFloat(parts[1]);
      const vendorId = 'DEV-' + parts[2];
      const timestamp = parseInt(parts[3], 10) * 1000;
      const hash = parts[4];
      const note = parts[5] ? decodeURIComponent(parts[5]) : undefined;
      if (!isNaN(amount) && amount > 0 && hash) {
        return { v: vendorId, a: amount, s: hash, t: timestamp, n: note };
      }
    }
  }

  // 2. Try JSON fallback
  try {
    const parsed = JSON.parse(str);
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

/**
 * Formats an acoustic ACK payload to confirm transaction receipt.
 * e.g. ACK:a1b2c3d4
 */
export function formatAckPayload(hash: string): string {
  const shortHash = hash.slice(0, 8);
  return `ACK:${shortHash}`;
}

/**
 * Checks if raw decoded string is an acoustic ACK and returns the confirmed hash.
 */
export function parseAckPayload(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();
  if (str.startsWith('ACK:')) {
    const parts = str.split(':');
    if (parts.length >= 2 && parts[1].length > 0) {
      return parts[1];
    }
  }
  return null;
}
