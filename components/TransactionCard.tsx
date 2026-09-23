'use client';

import { Transaction } from '@/lib/db';
import { ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface TransactionCardProps {
  tx: Transaction;
}

export function TransactionCard({ tx }: TransactionCardProps) {
  const isSent = tx.type === 'sent';
  const date = new Date(tx.timestamp);
  const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  const syncIcon = {
    pending: <Clock size={12} className="text-yellow-400" />,
    synced: <CheckCircle2 size={12} className="text-emerald-400" />,
    failed: <AlertCircle size={12} className="text-red-400" />,
  }[tx.synced];

  const syncLabel = {
    pending: 'Pending Sync',
    synced: 'Synced',
    failed: 'Sync Failed',
  }[tx.synced];

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/8 transition-colors">
      {/* Icon */}
      <div
        className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
          isSent ? 'bg-red-500/20' : 'bg-emerald-500/20'
        }`}
      >
        {isSent ? (
          <ArrowUpRight size={22} className="text-red-400" />
        ) : (
          <ArrowDownLeft size={22} className="text-emerald-400" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white truncate">
            {isSent ? 'Sent to' : 'Received from'} {tx.vendorId}
          </span>
        </div>
        {tx.note && (
          <p className="text-xs text-white/50 truncate mt-0.5">{tx.note}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-white/40">
            {dateStr} · {timeStr}
          </span>
          <span className="flex items-center gap-1 text-xs text-white/40">
            {syncIcon}
            {syncLabel}
          </span>
        </div>
      </div>

      {/* Amount */}
      <div className={`font-bold text-lg flex-shrink-0 ${isSent ? 'text-red-400' : 'text-emerald-400'}`}>
        {isSent ? '-' : '+'}₹{tx.amount.toFixed(2)}
      </div>
    </div>
  );
}
