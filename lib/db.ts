/**
 * lib/db.ts
 * IndexedDB ledger using the `idb` wrapper.
 * Stores all transactions (sent & received) offline-first.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

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

interface AudioPayDB extends DBSchema {
  transactions: {
    key: number;
    value: Transaction;
    indexes: { 'by-timestamp': number; 'by-synced': string };
  };
}

const DB_NAME = 'audio-pay-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AudioPayDB>> | null = null;

function getDB(): Promise<IDBPDatabase<AudioPayDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AudioPayDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('transactions', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by-timestamp', 'timestamp');
        store.createIndex('by-synced', 'synced');
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
  return all.reverse(); // newest first
}

export async function getPendingTransactions(): Promise<Transaction[]> {
  const db = await getDB();
  return db.getAllFromIndex('transactions', 'by-synced', 'pending');
}

export async function markAsSynced(id: number): Promise<void> {
  const db = await getDB();
  const tx = await db.get('transactions', id);
  if (tx) {
    tx.synced = 'synced';
    await db.put('transactions', tx);
  }
}

export async function markAsFailed(id: number): Promise<void> {
  const db = await getDB();
  const tx = await db.get('transactions', id);
  if (tx) {
    tx.synced = 'failed';
    await db.put('transactions', tx);
  }
}

export async function clearAllTransactions(): Promise<void> {
  const db = await getDB();
  await db.clear('transactions');
}
