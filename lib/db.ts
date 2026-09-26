/**
 * lib/db.ts
 * IndexedDB ledger using the `idb` wrapper.
 * Stores all transactions (sent & received) offline-first.
 *
 * NOTE: All functions check for browser environment before running.
 * This prevents SSR crashes in Next.js.
 */

export type TransactionType = 'sent' | 'received';
export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface Transaction {
  id?: number;
  type: TransactionType;
  amount: number;
  vendorId: string;
  note?: string;
  hash: string;
  timestamp: number; // Unix ms
  synced: SyncStatus;
}

const DB_NAME = 'audio-pay-db';
const DB_VERSION = 1;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDB(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB only available in browser');
  }
  if (!dbPromise) {
    // Dynamic import to ensure idb is never bundled for SSR
    const { openDB } = await import('idb');
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db: any) {
        if (!db.objectStoreNames.contains('transactions')) {
          const store = db.createObjectStore('transactions', {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('by-timestamp', 'timestamp');
          store.createIndex('by-synced', 'synced');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveTransaction(tx: Omit<Transaction, 'id'>): Promise<number> {
  const db = await getDB();
  return db.add('transactions', tx as Transaction);
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('transactions', 'by-timestamp');
  return (all as Transaction[]).reverse(); // newest first
}

export async function getBalance(): Promise<number> {
  const txs = await getAllTransactions();
  return txs.reduce((acc, t) => {
    return t.type === 'received' ? acc + t.amount : acc - t.amount;
  }, 1000); // Start with ₹1000 demo balance
}

export async function getPendingTransactions(): Promise<Transaction[]> {
  const db = await getDB();
  return db.getAllFromIndex('transactions', 'by-synced', 'pending') as Promise<Transaction[]>;
}

export async function markAsSynced(id: number): Promise<void> {
  const db = await getDB();
  const tx: Transaction = await db.get('transactions', id);
  if (tx) {
    tx.synced = 'synced';
    await db.put('transactions', tx);
  }
}

export async function markAsFailed(id: number): Promise<void> {
  const db = await getDB();
  const tx: Transaction = await db.get('transactions', id);
  if (tx) {
    tx.synced = 'failed';
    await db.put('transactions', tx);
  }
}

export async function clearAllTransactions(): Promise<void> {
  const db = await getDB();
  await db.clear('transactions');
}
