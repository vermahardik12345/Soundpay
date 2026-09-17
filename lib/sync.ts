/**
 * lib/sync.ts
 * Mock cloud sync module.
 * When the device goes online, unsynced transactions are POSTed to a backend.
 * Replace SYNC_ENDPOINT with your real API URL in production.
 */

import { getPendingTransactions, markAsSynced, markAsFailed, Transaction } from './db';

// Replace with your real backend endpoint
const SYNC_ENDPOINT = 'https://jsonplaceholder.typicode.com/posts';

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: number;
}

export async function syncPendingTransactions(): Promise<SyncResult> {
  if (!navigator.onLine) {
    return { synced: 0, failed: 0, skipped: 0 };
  }

  const pending = await getPendingTransactions();
  const result: SyncResult = { synced: 0, failed: 0, skipped: pending.length };

  for (const tx of pending) {
    try {
      const response = await fetch(SYNC_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: tx.vendorId,
          amount: tx.amount,
          type: tx.type,
          hash: tx.hash,
          timestamp: tx.timestamp,
          note: tx.note,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        await markAsSynced(tx.id!);
        result.synced++;
        result.skipped--;
      } else {
        await markAsFailed(tx.id!);
        result.failed++;
        result.skipped--;
      }
    } catch {
      await markAsFailed(tx.id!);
      result.failed++;
      result.skipped--;
    }
  }

  return result;
}

/**
 * Registers a one-time 'online' event listener that triggers sync
 * when the device reconnects to the internet.
 */
export function registerAutoSync(onSynced?: (result: SyncResult) => void): () => void {
  const handler = async () => {
    const result = await syncPendingTransactions();
    onSynced?.(result);
  };

  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
