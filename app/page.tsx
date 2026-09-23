'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, BookOpen, Wifi, WifiOff, Volume2, Mic, Zap } from 'lucide-react';
import { getAllTransactions, Transaction } from '@/lib/db';
import { StatusBadge } from '@/components/StatusBadge';
import { registerAutoSync, SyncResult } from '@/lib/sync';

export default function HomePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    async function load() {
      const txs = await getAllTransactions();
      setTransactions(txs.slice(0, 5));
      // Simulate a balance (in a real app this comes from backend)
      const bal = txs.reduce((acc, t) => {
        return t.type === 'received' ? acc + t.amount : acc - t.amount;
      }, 1000); // Start with ₹1000 demo balance
      setBalance(bal);
    }
    load();
  }, []);

  useEffect(() => {
    const cleanup = registerAutoSync((result: SyncResult) => {
      if (result.synced > 0) {
        setSyncMsg(`✓ ${result.synced} transaction${result.synced > 1 ? 's' : ''} synced to cloud`);
        setTimeout(() => setSyncMsg(null), 4000);
      }
    });
    return cleanup;
  }, []);

  const recentTxs = transactions.slice(0, 3);

  return (
    <main className="flex flex-col min-h-screen bg-gradient-primary px-4 pb-32 pt-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
            <Volume2 size={18} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">SoundPay</h1>
            <p className="text-xs text-white/40">Offline Audio Payments</p>
          </div>
        </div>
        <StatusBadge />
      </div>

      {/* Sync notification */}
      {syncMsg && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm text-center">
          {syncMsg}
        </div>
      )}

      {/* Balance Card */}
      <div className="glass-card p-6 mb-6 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-purple-500/10 blur-3xl" />

        <p className="text-white/50 text-sm font-medium mb-1 relative z-10">Available Balance</p>
        <div className="text-5xl font-bold text-white mb-4 relative z-10">
          ₹{balance.toFixed(2)}
        </div>

        <div className="flex items-center gap-2 relative z-10">
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <Zap size={11} className="text-indigo-400" />
            <span>Audio-based P2P • No Internet Required</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Link
          href="/pay"
          id="btn-pay"
          className="glass-card p-5 flex flex-col items-center gap-3 hover:bg-white/10 active:scale-95 transition-all duration-200 border-indigo-500/20 hover:border-indigo-500/40 group"
        >
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center group-hover:neon-glow-indigo transition-all">
            <ArrowUpRight size={26} className="text-indigo-400" />
          </div>
          <div className="text-center">
            <p className="font-bold text-white">Send</p>
            <p className="text-xs text-white/40">Inaudible tone</p>
          </div>
        </Link>

        <Link
          href="/receive"
          id="btn-receive"
          className="glass-card p-5 flex flex-col items-center gap-3 hover:bg-white/10 active:scale-95 transition-all duration-200 border-emerald-500/20 hover:border-emerald-500/40 group"
        >
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center group-hover:neon-glow-emerald transition-all">
            <ArrowDownLeft size={26} className="text-emerald-400" />
          </div>
          <div className="text-center">
            <p className="font-bold text-white">Receive</p>
            <p className="text-xs text-white/40">Listen via mic</p>
          </div>
        </Link>
      </div>

      {/* How it works banner */}
      <div className="glass-card p-4 mb-8 flex items-center gap-4">
        <div className="flex items-center gap-1 flex-shrink-0">
          <Zap size={20} className="text-indigo-400" />
          <div className="flex gap-0.5">
            {[3,5,4,6,3,5,4].map((h,i) => (
              <div key={i} className="w-0.5 bg-indigo-400/50 rounded-full" style={{height: h*4, animationDelay: `${i*0.1}s`}} />
            ))}
          </div>
          <Mic size={20} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">How it works</p>
          <p className="text-xs text-white/40">Sender transmits inaudible ultrasound · Receiver&apos;s mic decodes it · No WiFi needed</p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Recent</h2>
          <Link href="/ledger" id="btn-ledger" className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
            <BookOpen size={13} />
            View All
          </Link>
        </div>

        {recentTxs.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
              <BookOpen size={24} className="text-white/20" />
            </div>
            <p className="text-white/40 text-sm">No transactions yet</p>
            <p className="text-white/25 text-xs mt-1">Send or receive your first payment</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentTxs.map((tx) => (
              <div key={tx.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.type === 'sent' ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
                  {tx.type === 'sent'
                    ? <ArrowUpRight size={18} className="text-red-400" />
                    : <ArrowDownLeft size={18} className="text-emerald-400" />
                  }
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white capitalize">{tx.type === 'sent' ? 'Sent' : 'Received'}</p>
                  <p className="text-xs text-white/40">{new Date(tx.timestamp).toLocaleDateString('en-IN')}</p>
                </div>
                <span className={`font-bold ${tx.type === 'sent' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {tx.type === 'sent' ? '-' : '+'}₹{tx.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-4 pb-6 pt-4 bg-gradient-to-t from-[#0f0a1e] to-transparent">
        <div className="glass-card p-2 flex">
          <Link href="/" id="nav-home" className="flex-1 flex flex-col items-center gap-1 py-2 text-indigo-400">
            <Zap size={20} />
            <span className="text-xs font-medium">Home</span>
          </Link>
          <Link href="/pay" id="nav-pay" className="flex-1 flex flex-col items-center gap-1 py-2 text-white/40 hover:text-white/70">
            <ArrowUpRight size={20} />
            <span className="text-xs font-medium">Pay</span>
          </Link>
          <Link href="/receive" id="nav-receive" className="flex-1 flex flex-col items-center gap-1 py-2 text-white/40 hover:text-white/70">
            <Mic size={20} />
            <span className="text-xs font-medium">Receive</span>
          </Link>
          <Link href="/ledger" id="nav-ledger" className="flex-1 flex flex-col items-center gap-1 py-2 text-white/40 hover:text-white/70">
            <BookOpen size={20} />
            <span className="text-xs font-medium">Ledger</span>
          </Link>
        </div>
      </nav>
    </main>
  );
}
