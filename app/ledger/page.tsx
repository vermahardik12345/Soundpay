'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Trash2, BookOpen, Loader2 } from 'lucide-react';
import { getAllTransactions, clearAllTransactions, Transaction } from '@/lib/db';
import { TransactionCard } from '@/components/TransactionCard';
import { syncPendingTransactions, SyncResult } from '@/lib/sync';

export default function LedgerPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const loadTransactions = async () => {
    setIsLoading(true);
    try {
      const txs = await getAllTransactions();
      setTransactions(txs);
    } catch (e) {
      console.error('Failed to load transactions:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const handleSync = async () => {
    if (!navigator.onLine) {
      setSyncResult({ synced: 0, failed: 0, skipped: 0 });
      return;
    }
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncPendingTransactions();
      setSyncResult(result);
      await loadTransactions();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClear = async () => {
    if (window.confirm('Clear all transactions? This cannot be undone.')) {
      await clearAllTransactions();
      setTransactions([]);
      setSyncResult(null);
    }
  };

  // Group by date
  const grouped: Record<string, Transaction[]> = {};
  transactions.forEach((tx) => {
    const dateKey = new Date(tx.timestamp).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(tx);
  });

  const totalReceived = transactions
    .filter((t) => t.type === 'received')
    .reduce((s, t) => s + t.amount, 0);
  const totalSent = transactions
    .filter((t) => t.type === 'sent')
    .reduce((s, t) => s + t.amount, 0);
  const pending = transactions.filter((t) => t.synced === 'pending').length;

  return (
    <main className="flex flex-col min-h-screen bg-gradient-primary px-4 pb-8 pt-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          id="btn-back-ledger"
          className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center hover:bg-white/15 active:scale-95 transition-all"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-bold text-white flex-1">Transaction Ledger</h1>
        <div className="flex items-center gap-2">
          <button
            id="btn-sync"
            onClick={handleSync}
            disabled={isSyncing}
            title="Sync to cloud"
            className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center hover:bg-white/15 active:scale-95 transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin text-indigo-400' : ''} />
          </button>
          <button
            id="btn-clear"
            onClick={handleClear}
            title="Clear all"
            className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 active:scale-95 transition-all"
          >
            <Trash2 size={16} className="text-red-400" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="glass-card p-3 text-center">
          <p className="text-xs text-white/40 mb-1">Received</p>
          <p className="font-bold text-emerald-400">₹{totalReceived.toFixed(0)}</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-xs text-white/40 mb-1">Sent</p>
          <p className="font-bold text-red-400">₹{totalSent.toFixed(0)}</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-xs text-white/40 mb-1">Unsynced</p>
          <p className="font-bold text-yellow-400">{pending}</p>
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className={`p-3 rounded-xl mb-4 text-sm text-center border ${
          syncResult.synced > 0
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : navigator.onLine
              ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
              : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
        }`}>
          {!navigator.onLine
            ? '📵 Offline — sync when you reconnect'
            : syncResult.synced === 0 && syncResult.skipped === 0
              ? '✓ All transactions already synced'
              : `✓ Synced ${syncResult.synced} · Failed ${syncResult.failed} · Pending ${syncResult.skipped}`
          }
        </div>
      )}

      {/* Transaction list */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 size={32} className="animate-spin text-indigo-400" />
          <p className="text-white/40 text-sm">Loading transactions...</p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
            <BookOpen size={28} className="text-white/20" />
          </div>
          <p className="text-white/40 font-medium">No transactions yet</p>
          <p className="text-white/25 text-sm mt-1">Your offline payment history will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, txs]) => (
            <div key={date}>
              <p className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-3 px-1">
                {date}
              </p>
              <div className="space-y-3">
                {txs.map((tx) => (
                  <TransactionCard key={tx.id} tx={tx} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
