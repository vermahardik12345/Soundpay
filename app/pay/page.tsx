'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
  ShieldCheck,
  Wallet,
  QrCode,
  ScanLine,
  RotateCcw,
} from 'lucide-react';
import { Numpad } from '@/components/Numpad';
import { AnimatedWave } from '@/components/AnimatedWave';
import { QrScanner } from '@/components/QrScanner';
import { useAudioSender } from '@/hooks/useAudioSender';
import { hashPayload, getDeviceId, formatCompactPayload } from '@/lib/crypto';
import { saveTransaction, getBalance } from '@/lib/db';

type SendState = 'idle' | 'sending' | 'success' | 'error';
type PayView = 'scan' | 'pay';

export default function PayPage() {
  const [view, setView] = useState<PayView>('scan');
  const [amount, setAmount] = useState('0');
  const [targetCode, setTargetCode] = useState('');
  const [note, setNote] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);

  const { sendPayload, error: senderError, isReady: isSenderReady } = useAudioSender();

  // Load device ID and current balance on mount
  useEffect(() => {
    setDeviceId(getDeviceId());
    getBalance()
      .then((bal) => setAvailableBalance(bal))
      .catch((err) => console.error('Failed to load balance:', err));
  }, []);

  // Sync sender errors
  useEffect(() => {
    if (senderError && sendState === 'sending') {
      setSendState('error');
      setErrorMsg(senderError);
    }
  }, [senderError, sendState]);

  const amountNum = parseFloat(amount) || 0;
  const isInsufficientFunds = availableBalance !== null && amountNum > availableBalance;
  const isValidAmount = amountNum > 0 && !isInsufficientFunds;

  // Called when camera detects QR code
  const handleQrSuccess = useCallback((scannedCode: string) => {
    console.log('[PayPage] Scanned receiver code:', scannedCode);
    setTargetCode(scannedCode);
    setView('pay');
  }, []);

  const handleSend = useCallback(async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) {
      setErrorMsg('Please enter a valid amount');
      setSendState('error');
      return;
    }

    if (availableBalance !== null && num > availableBalance) {
      setErrorMsg(`Not enough funds. Available balance: ₹${availableBalance.toFixed(2)}`);
      setSendState('error');
      return;
    }

    if (!isSenderReady) {
      setErrorMsg('Audio engine loading, please wait...');
      setSendState('error');
      return;
    }

    setErrorMsg('');
    setSendState('sending');

    try {
      // 1. Build payment payload and unique transaction hash
      const timestamp = Date.now();
      const cleanTarget = targetCode.trim() ? targetCode.trim().toUpperCase() : undefined;
      const payloadBase = { v: deviceId, a: num, t: timestamp, r: cleanTarget, n: note || undefined };
      const hash = await hashPayload(payloadBase);
      const acousticPayload = formatCompactPayload(num, deviceId, timestamp, hash, cleanTarget, note);

      // 2. DEDUCT & SAVE IMMEDIATELY to local ledger
      await saveTransaction({
        type: 'sent',
        amount: num,
        vendorId: deviceId,
        note: note || undefined,
        hash,
        timestamp,
        synced: 'pending',
      });

      // Update in-memory balance immediately
      setAvailableBalance((prev) => (prev !== null ? Math.max(0, prev - num) : 0));

      // 3. Broadcast soundwave via ultrasound
      await sendPayload(acousticPayload, 'ultrasound');

      setSendState('success');

      // Reset after 3.5 seconds
      setTimeout(() => {
        setSendState('idle');
        setAmount('0');
        setNote('');
        setView('scan'); // Return to scan view for next payment
      }, 3500);
    } catch (e) {
      setSendState('error');
      setErrorMsg(e instanceof Error ? e.message : 'Send failed');
    }
  }, [amount, availableBalance, targetCode, note, deviceId, isSenderReady, sendPayload]);

  return (
    <main className="flex flex-col min-h-screen bg-gradient-primary px-4 pb-8 pt-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          id="btn-back-pay"
          className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center hover:bg-white/15 active:scale-95 transition-all"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">
            {view === 'scan' ? 'Scan & Pay' : 'Enter Amount'}
          </h1>
          <p className="text-xs text-white/40">
            {view === 'scan' ? 'Align QR code in frame' : 'Inaudible sound transmission'}
          </p>
        </div>
        <div className="ml-auto">
          {view === 'pay' && (
            <button
              type="button"
              id="btn-open-scanner"
              onClick={() => setView('scan')}
              className="flex items-center gap-1.5 text-xs text-indigo-300 bg-indigo-500/20 px-3 py-1.5 rounded-full border border-indigo-500/30 hover:bg-indigo-500/30 transition-all"
            >
              <ScanLine size={13} />
              <span>Rescan</span>
            </button>
          )}
        </div>
      </div>

      {/* STEP 1: CAMERA SCANNER VIEW */}
      {view === 'scan' ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <QrScanner
            onScanSuccess={handleQrSuccess}
            onCancel={() => setView('pay')}
          />
        </div>
      ) : (
        /* STEP 2: ENTER AMOUNT & PAY VIEW */
        <div className="animate-fade-in flex flex-col flex-1">
          {/* Target Receiver Badge */}
          <div className="glass-card px-4 py-3 mb-4 flex items-center justify-between border-indigo-500/30 bg-indigo-500/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                <QrCode size={16} />
              </div>
              <div>
                <p className="text-[11px] text-white/50 uppercase tracking-wider font-semibold">Paying To</p>
                <p className="font-mono text-base font-bold text-white tracking-wide">
                  {targetCode ? `#${targetCode}` : 'Nearby Receiver'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setView('scan')}
              className="text-xs text-indigo-300 hover:text-white flex items-center gap-1 bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/10"
            >
              <RotateCcw size={12} />
              Change
            </button>
          </div>

          {/* Available Balance Pill */}
          <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 mb-4">
            <div className="flex items-center gap-2">
              <Wallet size={16} className="text-indigo-400" />
              <span className="text-xs text-white/60">Available Balance:</span>
            </div>
            <span className="font-bold text-sm text-emerald-400 font-mono">
              ₹{availableBalance !== null ? availableBalance.toFixed(2) : '...'}
            </span>
          </div>

          {/* Amount Display */}
          <div className="glass-card p-6 mb-4 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-indigo-500/10 blur-3xl" />
            <p className="text-white/50 text-sm mb-2">Amount to Send</p>
            <div className={`text-6xl font-bold mb-1 transition-all duration-150 ${isInsufficientFunds ? 'text-red-400' : 'text-white'}`}>
              ₹
              {parseFloat(amount).toLocaleString('en-IN', {
                minimumFractionDigits: amount.includes('.') ? Math.min(2, (amount.split('.')[1] || '').length) : 0,
                maximumFractionDigits: 2,
              })}
            </div>

            {/* Insufficient Funds Warning */}
            {isInsufficientFunds && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-red-400 mt-2 font-medium bg-red-500/10 py-1 px-3 rounded-full border border-red-500/20 max-w-fit mx-auto">
                <AlertCircle size={13} />
                <span>Not enough funds (Max ₹{availableBalance?.toFixed(2)})</span>
              </div>
            )}

            <p className="text-xs text-white/30 mt-2">From: {deviceId}</p>
          </div>

          {/* Animated wave during sound transmission */}
          <div className="mb-4">
            <AnimatedWave
              active={sendState === 'sending'}
              color={
                sendState === 'success'
                  ? '#10b981'
                  : sendState === 'error'
                    ? '#ef4444'
                    : '#6366f1'
              }
            />
          </div>

          {/* Success feedback */}
          {sendState === 'success' && (
            <div className="glass-card p-4 mb-4 flex items-center gap-3 border-emerald-500/30 bg-emerald-500/10 success-flash animate-fade-in">
              <CheckCircle2 size={24} className="text-emerald-400 flex-shrink-0" />
              <div>
                <p className="font-bold text-emerald-400">Payment Sent & Deducted!</p>
                <p className="text-xs text-emerald-300/80">
                  ₹{amountNum.toFixed(2)} transmitted via soundwave to #{targetCode || 'Receiver'}.
                </p>
              </div>
            </div>
          )}

          {/* General Error feedback */}
          {sendState === 'error' && (
            <div className="glass-card p-4 mb-4 flex items-center gap-3 border-red-500/30 bg-red-500/10 animate-fade-in">
              <AlertCircle size={22} className="text-red-400 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-400">Send Failed</p>
                <p className="text-xs text-red-400/80">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Note input */}
          <div className="mb-4">
            <input
              type="text"
              id="input-note"
              placeholder="Add a note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={30}
              className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500/50 text-sm transition-colors"
            />
          </div>

          {/* Numpad */}
          <div className="mb-6">
            <Numpad value={amount} onChange={setAmount} maxDigits={7} />
          </div>

          {/* Send Button */}
          <button
            id="btn-send-sound"
            onClick={handleSend}
            disabled={!isValidAmount || !isSenderReady || sendState === 'sending'}
            className={`
              w-full py-5 rounded-3xl font-bold text-xl flex items-center justify-center gap-3
              transition-all duration-300 active:scale-95
              ${
                sendState === 'sending'
                  ? 'bg-indigo-600/60 text-white/70 cursor-not-allowed sending-pulse'
                  : sendState === 'success'
                    ? 'bg-emerald-600 text-white'
                    : isInsufficientFunds
                      ? 'bg-red-500/20 text-red-300 cursor-not-allowed border border-red-500/30'
                      : isValidAmount && isSenderReady
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white neon-glow-indigo hover:from-indigo-500 hover:to-purple-500'
                        : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/10'
              }
            `}
          >
            {sendState === 'sending' ? (
              <>
                <Loader2 size={22} className="animate-spin" />
                Broadcasting soundwave...
              </>
            ) : sendState === 'success' ? (
              <>
                <CheckCircle2 size={22} />
                Sent & Deducted!
              </>
            ) : isInsufficientFunds ? (
              <>
                <AlertCircle size={22} />
                Not Enough Funds
              </>
            ) : (
              <>
                <Zap size={22} />
                Pay via Soundwave ⚡
              </>
            )}
          </button>

          <p className="text-center text-xs text-white/30 mt-3 flex items-center justify-center gap-1.5">
            <ShieldCheck size={12} className="text-emerald-400" />
            Instant offline transfer · No internet needed
          </p>
        </div>
      )}
    </main>
  );
}
