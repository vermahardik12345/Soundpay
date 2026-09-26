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
 * Generates or retrieves a permanent, immutable 4-digit receiver pairing code (e.g. "4821").
 * Generated once per device and cannot be changed or forged by bystanders.
 */
export function getReceiverCode(): string {
  if (typeof window === 'undefined') return '0000';
  let code = localStorage.getItem('soundpay-permanent-receiver-code');
  if (!code || code.length !== 4) {
    // Generate a permanent 4-digit numeric code
    code = Math.floor(1000 + Math.random() * 9000).toString();
    localStorage.setItem('soundpay-permanent-receiver-code', code);
  }
  return code;
}

/**
 * Encodes the receiver code into a QR format.
 */
export function formatReceiverQr(code: string): string {
  return `SOUNDPAY:${code.trim().toUpperCase()}`;
}

/**
 * Parses a scanned QR string and extracts the receiver code.
 */
export function parseReceiverQr(scanned: string): string | null {
  if (!scanned || typeof scanned !== 'string') return null;
  const s = scanned.trim();
  if (s.startsWith('SOUNDPAY:')) {
    return s.replace('SOUNDPAY:', '').trim().toUpperCase();
  }
  try {
    const url = new URL(s);
    const code = url.searchParams.get('code');
    if (code) return code.trim().toUpperCase();
  } catch {}
  if (/^[0-9A-Za-z]{4,6}$/.test(s)) {
    return s.toUpperCase();
  }
  return null;
}

/**
 * Formats a payment into a minimal acoustic payload with target receiver code.
 * Format: P:amount:shortSender:targetReceiver:sec:shortHash[:note]
 * Keeps payload ~25-30 chars for ultra-reliable, rapid near-ultrasound transmission.
 */
export function formatCompactPayload(
  amount: number,
  vendorId: string,
  timestamp: number,
  hash: string,
  receiverCode?: string,
  note?: string
): string {
  const shortVendor = vendorId.replace(/^DEV-/, '').slice(0, 6);
  const target = receiverCode && receiverCode.trim() ? receiverCode.trim().slice(0, 6).toUpperCase() : 'ANY';
  const shortHash = hash.slice(0, 8);
  const sec = Math.floor(timestamp / 1000);
  const n = note ? `:${encodeURIComponent(note.slice(0, 15))}` : '';
  return `P:${amount}:${shortVendor}:${target}:${sec}:${shortHash}${n}`;
}

export interface ValidatedPayload {
  v: string; // sender ID
  r: string; // target receiver code ('ANY' or 4-digit code)
  a: number; // amount
  s: string; // hash
  t: number; // timestamp
  n?: string; // note
}

/**
 * Validates that a decoded payload has the expected structure.
 * Supports targeted format (P:...:target:...), legacy format, and JSON fallback.
 */
export function validatePayload(raw: string): ValidatedPayload | null {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();

  // 1. Try Compact format:
  if (str.startsWith('P:')) {
    const parts = str.split(':');
    // Format A: Targeted -> P:amount:sender:targetReceiver:sec:hash[:note] (length >= 6)
    if (parts.length >= 6) {
      const amount = parseFloat(parts[1]);
      const vendorId = 'DEV-' + parts[2];
      const targetReceiver = parts[3].toUpperCase();
      const timestamp = parseInt(parts[4], 10) * 1000;
      const hash = parts[5];
      const note = parts[6] ? decodeURIComponent(parts[6]) : undefined;
      if (!isNaN(amount) && amount > 0 && hash) {
        return { v: vendorId, r: targetReceiver, a: amount, s: hash, t: timestamp, n: note };
      }
    }

    // Format B: Legacy -> P:amount:sender:sec:hash[:note] (length == 5)
    if (parts.length >= 5) {
      const amount = parseFloat(parts[1]);
      const vendorId = 'DEV-' + parts[2];
      const timestamp = parseInt(parts[3], 10) * 1000;
      const hash = parts[4];
      const note = parts[5] ? decodeURIComponent(parts[5]) : undefined;
      if (!isNaN(amount) && amount > 0 && hash) {
        return { v: vendorId, r: 'ANY', a: amount, s: hash, t: timestamp, n: note };
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
      return {
        v: parsed.v,
        r: parsed.r || 'ANY',
        a: parsed.a,
        s: parsed.s,
        t: parsed.t,
        n: parsed.n,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Formats an acoustic ACK payload to confirm transaction receipt.
 * e.g. ACK:a1b2c3d4 or ACK:a1b2c3d4:4821
 */
export function formatAckPayload(hash: string, receiverCode?: string): string {
  const shortHash = hash.slice(0, 8);
  const rc = receiverCode ? `:${receiverCode.slice(0, 6)}` : '';
  return `ACK:${shortHash}${rc}`;
}

export interface ParsedAck {
  hash: string;
  receiverCode?: string;
}

/**
 * Checks if raw decoded string is an acoustic ACK and returns the confirmed hash + receiver code.
 */
export function parseAckPayload(raw: string): ParsedAck | null {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();
  if (str.startsWith('ACK:')) {
    const parts = str.split(':');
    if (parts.length >= 2 && parts[1].length > 0) {
      return {
        hash: parts[1],
        receiverCode: parts[2] || undefined,
      };
    }
  }
  return null;
}
