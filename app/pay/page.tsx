'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
  ShieldCheck,
  ShieldAlert,
  Radio,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { Numpad } from '@/components/Numpad';
import { AnimatedWave } from '@/components/AnimatedWave';
import { useAudioSender } from '@/hooks/useAudioSender';
import { useAudioReceiver } from '@/hooks/useAudioReceiver';
import { hashPayload, getDeviceId, formatCompactPayload, parseAckPayload } from '@/lib/crypto';
import { saveTransaction } from '@/lib/db';

type SendState = 'idle' | 'sending' | 'waiting_ack' | 'success' | 'timeout' | 'error';

interface PendingPayment {
  amountNum: number;
  deviceId: string;
  note?: string;
  hash: string;
  timestamp: number;
}

export default function PayPage() {
  const [amount, setAmount] = useState('0');
  const [note, setNote] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [ackCountdown, setAckCountdown] = useState(6);

  const pendingTxRef = useRef<PendingPayment | null>(null);
  const ackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { sendPayload, isSending, error: senderError, isReady: isSenderReady } = useAudioSender();

  // Listen for the receiver's acoustic ACK confirmation
  const handleAckDecoded = useCallback(
    async ({ raw }: { raw: string }) => {
      const confirmedHash = parseAckPayload(raw);
      if (!confirmedHash) return;

      const pending = pendingTxRef.current;
      if (!pending) return;

      const expectedShortHash = pending.hash.slice(0, 8);
      if (confirmedHash === expectedShortHash) {
        console.log('[PayPage] Handshake Success! Matching acoustic ACK received:', confirmedHash);

        // Clear timers immediately
        if (ackTimeoutRef.current) clearTimeout(ackTimeoutRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

        // Stop listening for further tones
        stopListening();

        // 🛡️ DEDUCT FUNDS: Save to local ledger ONLY NOW that receiver confirmed receipt!
        try {
          await saveTransaction({
            type: 'sent',
            amount: pending.amountNum,
            vendorId: pending.deviceId,
            note: pending.note || undefined,
            hash: pending.hash,
            timestamp: pending.timestamp,
            synced: 'pending',
          });
        } catch (e) {
          console.error('[PayPage] Failed to save confirmed sent transaction:', e);
        }

        pendingTxRef.current = null;
        setSendState('success');

        // Reset to initial screen after 4 seconds
        setTimeout(() => {
          setSendState('idle');
          setAmount('0');
          setNote('');
        }, 4000);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const { startListening, stopListening, isListening, audioLevel } = useAudioReceiver(handleAckDecoded);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  // Sync sender errors
  useEffect(() => {
    if (senderError && sendState === 'sending') {
      setSendState('error');
      setErrorMsg(senderError);
      pendingTxRef.current = null;
    }
  }, [senderError, sendState]);

  // Cleanup timers & audio on unmount
  useEffect(() => {
    return () => {
      if (ackTimeoutRef.current) clearTimeout(ackTimeoutRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      stopListening();
    };
  }, [stopListening]);

  // Cancel waiting handshake manually
  const handleCancelWaiting = useCallback(() => {
    if (ackTimeoutRef.current) clearTimeout(ackTimeoutRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    stopListening();
    pendingTxRef.current = null;
    setSendState('idle');
  }, [stopListening]);

  const handleSend = useCallback(async () => {
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setErrorMsg('Please enter a valid amount');
      setSendState('error');
      return;
    }
    if (!isSenderReady) {
      setErrorMsg('Audio engine loading, please wait...');
      setSendState('error');
      return;
    }

    // Clear any previous handshake timers
    if (ackTimeoutRef.current) clearTimeout(ackTimeoutRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    stopListening();

    setErrorMsg('');
    setSendState('sending');

    try {
      // 1. Build payment payload and unique transaction hash
      const timestamp = Date.now();
      const payloadBase = { v: deviceId, a: amountNum, t: timestamp, n: note || undefined };
      const hash = await hashPayload(payloadBase);
      const acousticPayload = formatCompactPayload(amountNum, deviceId, timestamp, hash, note);

      // Store in ref — DO NOT write to ledger yet!
      pendingTxRef.current = {
        amountNum,
        deviceId,
        note: note || undefined,
        hash,
        timestamp,
      };

      // 2. Play inaudible ultrasound tone
      await sendPayload(acousticPayload, 'ultrasound');

      // 3. Immediately switch to listening for receiver's acoustic ACK confirmation
      setSendState('waiting_ack');
      setAckCountdown(6);
      await startListening();

      // Countdown ticker for the UI
      countdownIntervalRef.current = setInterval(() => {
        setAckCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);

      // Handshake safety timeout: if receiver doesn't reply in 6.5s, ABORT without deducting money
      ackTimeoutRef.current = setTimeout(() => {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        stopListening();
        console.warn('[PayPage] Handshake timeout: Receiver did not respond. 0 funds deducted.');
        pendingTxRef.current = null;
        setSendState('timeout');
      }, 6500);
    } catch (e) {
      stopListening();
      pendingTxRef.current = null;
      setSendState('error');
      setErrorMsg(e instanceof Error ? e.message : 'Send failed');
    }
  }, [amount, note, deviceId, isSenderReady, sendPayload, startListening, stopListening]);

  const amountNum = parseFloat(amount) || 0;
  const isValidAmount = amountNum > 0;

  return (
    <main className="flex flex-col min-h-screen bg-gradient-primary px-4 pb-8 pt-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/"
          id="btn-back-pay"
          className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center hover:bg-white/15 active:scale-95 transition-all"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Send Payment</h1>
          <p className="text-xs text-white/40">Inaudible ultrasound handshake · Silent & safe</p>
        </div>
        <div className="ml-auto">
          {isSenderReady ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
              <Zap size={10} />
              Ready
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded-full border border-yellow-500/20">
              <Loader2 size={10} className="animate-spin" />
              Loading
            </span>
          )}
        </div>
      </div>

      {/* Amount Display */}
      <div className="glass-card p-6 mb-6 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-indigo-500/10 blur-3xl" />
        <p className="text-white/50 text-sm mb-2">Amount to Send</p>
        <div className="text-6xl font-bold text-white mb-1 transition-all duration-150">
          ₹
          {parseFloat(amount).toLocaleString('en-IN', {
            minimumFractionDigits: amount.includes('.') ? Math.min(2, (amount.split('.')[1] || '').length) : 0,
            maximumFractionDigits: 2,
          })}
        </div>
        <p className="text-xs text-white/30">From: {deviceId}</p>
      </div>

      {/* Animated wave during sound transmission or ACK listening */}
      <div className="mb-6">
        <AnimatedWave
          active={sendState === 'sending' || sendState === 'waiting_ack'}
          color={
            sendState === 'success'
              ? '#10b981'
              : sendState === 'waiting_ack'
                ? '#38bdf8'
                : sendState === 'timeout'
                  ? '#f59e0b'
                  : sendState === 'error'
                    ? '#ef4444'
                    : '#6366f1'
          }
        />
      </div>

      {/* Handshake: Waiting for Receiver ACK */}
      {sendState === 'waiting_ack' && (
        <div className="glass-card p-5 mb-6 border-sky-500/30 bg-sky-500/10 animate-fade-in relative overflow-hidden">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 flex items-center justify-center flex-shrink-0 animate-pulse">
              <Radio size={20} className="text-sky-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sky-400 text-sm">Awaiting Receiver Confirmation...</p>
                <span className="text-xs font-mono font-bold text-sky-300 bg-sky-500/20 px-2 py-0.5 rounded-full border border-sky-400/30">
                  {ackCountdown}s
                </span>
              </div>
              <p className="text-xs text-sky-300/70 mt-0.5">
                Sound sent! Listening for receiver's audio receipt. Money will ONLY be deducted when confirmed.
              </p>
            </div>
          </div>

          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mb-3">
            <div
              className="bg-sky-400 h-full transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${(ackCountdown / 6) * 100}%` }}
            />
          </div>

          <button
            type="button"
            onClick={handleCancelWaiting}
            className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
          >
            <XCircle size={14} />
            Cancel Handshake
          </button>
        </div>
      )}

      {/* Handshake: Timeout / Out of Range Protection */}
      {sendState === 'timeout' && (
        <div className="glass-card p-5 mb-6 border-amber-500/40 bg-amber-500/10 animate-fade-in">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <ShieldAlert size={22} className="text-amber-400" />
            </div>
            <div>
              <p className="font-bold text-amber-400 text-sm">Receiver Out of Audio Range</p>
              <p className="text-xs font-semibold text-emerald-400 mt-0.5">
                ✓ ₹0 Deducted — Your balance is untouched!
              </p>
              <p className="text-xs text-white/50 mt-1">
                The receiver device didn't confirm hearing the sound. Move closer (30–50 cm) with volume up and try again.
              </p>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={handleSend}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <RotateCcw size={13} />
              Move Closer & Retry
            </button>
            <button
              type="button"
              onClick={() => setSendState('idle')}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 text-xs font-medium transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Success feedback */}
      {sendState === 'success' && (
        <div className="glass-card p-4 mb-6 flex items-center gap-3 border-emerald-500/30 bg-emerald-500/10 success-flash animate-fade-in">
          <CheckCircle2 size={24} className="text-emerald-400 flex-shrink-0" />
          <div>
            <p className="font-bold text-emerald-400">Payment Verified & Deducted!</p>
            <p className="text-xs text-emerald-300/80">
              Receiver acknowledged receipt via acoustic handshake. ₹{amountNum.toFixed(2)} recorded in ledger.
            </p>
          </div>
        </div>
      )}

      {/* General Error feedback */}
      {sendState === 'error' && (
        <div className="glass-card p-4 mb-6 flex items-center gap-3 border-red-500/30 bg-red-500/10 animate-fade-in">
          <AlertCircle size={22} className="text-red-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-400">Send Failed</p>
            <p className="text-xs text-red-400/70">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Note input */}
      <div className="mb-6">
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
      <div className="mb-8">
        <Numpad value={amount} onChange={setAmount} maxDigits={7} />
      </div>

      {/* Send Button */}
      <button
        id="btn-send-sound"
        onClick={handleSend}
        disabled={!isValidAmount || !isSenderReady || sendState === 'sending' || sendState === 'waiting_ack'}
        className={`
          w-full py-5 rounded-3xl font-bold text-xl flex items-center justify-center gap-3
          transition-all duration-300 active:scale-95
          ${
            sendState === 'sending'
              ? 'bg-indigo-600/60 text-white/70 cursor-not-allowed sending-pulse'
              : sendState === 'waiting_ack'
                ? 'bg-sky-600/60 text-white/80 cursor-not-allowed'
                : isValidAmount && isSenderReady
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white neon-glow-indigo hover:from-indigo-500 hover:to-purple-500'
                  : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/10'
          }
        `}
      >
        {sendState === 'sending' ? (
          <>
            <Loader2 size={22} className="animate-spin" />
            Broadcasting inaudibly...
          </>
        ) : sendState === 'waiting_ack' ? (
          <>
            <Radio size={22} className="animate-pulse text-sky-300" />
            Waiting for confirmation ({ackCountdown}s)...
          </>
        ) : sendState === 'success' ? (
          <>
            <CheckCircle2 size={22} />
            Verified & Sent!
          </>
        ) : (
          <>
            <Zap size={22} />
            Pay Inaudible Ultrasound ⚡
          </>
        )}
      </button>

      <p className="text-center text-xs text-white/30 mt-4 flex items-center justify-center gap-1.5">
        <ShieldCheck size={12} className="text-emerald-400" />
        100% silent near-ultrasound · Amount deducts ONLY when receiver confirms
      </p>
    </main>
  );
}
