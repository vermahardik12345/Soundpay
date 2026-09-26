'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Mic,
  MicOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  QrCode,
  BookOpen,
  ArrowDownLeft,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AnimatedWave } from '@/components/AnimatedWave';
import { useAudioReceiver } from '@/hooks/useAudioReceiver';
import { validatePayload, getReceiverCode, formatReceiverQr } from '@/lib/crypto';
import { saveTransaction, Transaction } from '@/lib/db';

interface ReceivedPayment {
  amount: number;
  vendorId: string;
  note?: string;
  hash: string;
  timestamp: number;
}

// Gentle pleasant double chime when money is received
function playSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.12); // A5
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  } catch {}
}

export default function ReceivePage() {
  const [latestPayment, setLatestPayment] = useState<ReceivedPayment | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<ReceivedPayment[]>([]);
  const [showFlash, setShowFlash] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [myReceiverCode, setMyReceiverCode] = useState('0000');
  const lastProcessedHashRef = useRef<string | null>(null);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    setMyReceiverCode(getReceiverCode());
  }, []);

  const handleDecode = useCallback(
    async ({ raw }: { raw: string; timestamp: number }) => {
      if (raw.startsWith('ACK:')) return;

      console.log('[ReceivePage] Received acoustic payload:', raw);
      const parsed = validatePayload(raw);
      console.log('[ReceivePage] Validated payload:', parsed);
      if (!parsed) {
        setDecodeError('Received audio signal but payload format was invalid.');
        setTimeout(() => setDecodeError(null), 4000);
        return;
      }

      // Target Recipient Protection:
      if (parsed.r && parsed.r !== 'ANY' && parsed.r !== myReceiverCode) {
        console.log(`[ReceivePage] 🛡️ Ignored payment targeted to #${parsed.r} (my code is #${myReceiverCode})`);
        return;
      }

      // Prevent duplicate saves of identical transaction hash within short interval
      if (lastProcessedHashRef.current === parsed.s) {
        console.log('[ReceivePage] Duplicate packet ignored for hash:', parsed.s);
        return;
      }
      lastProcessedHashRef.current = parsed.s;

      const received: ReceivedPayment = {
        amount: parsed.a,
        vendorId: parsed.v,
        note: parsed.n,
        hash: parsed.s,
        timestamp: parsed.t || Date.now(),
      };

      // Play audio chime and haptic feedback
      playSuccessChime();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([80, 50, 80]);
      }

      // Update state without stopping the receiver!
      setLatestPayment(received);
      setPaymentHistory((prev) => [received, ...prev.slice(0, 4)]);
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 800);

      // Save to IndexedDB immediately
      try {
        await saveTransaction({
          type: 'received',
          amount: parsed.a,
          vendorId: parsed.v,
          note: parsed.n,
          hash: parsed.s,
          timestamp: Date.now(),
          synced: 'pending',
        } as Omit<Transaction, 'id'>);
      } catch (e) {
        console.error('Failed to save received transaction:', e);
      }
    },
    [myReceiverCode]
  );

  const { startListening, stopListening, isListening, error, isReady, permissionDenied, audioLevel } =
    useAudioReceiver(handleDecode);

  // Auto-start listening on mount and keep listening continuously!
  useEffect(() => {
    if (isReady && !isListening && !permissionDenied && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startListening();
    }
  }, [isReady, isListening, permissionDenied, startListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const qrPayload = formatReceiverQr(myReceiverCode);

  return (
    <main className="flex flex-col min-h-screen bg-gradient-primary px-4 pb-8 pt-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/"
          id="btn-back-receive"
          className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center hover:bg-white/15 active:scale-95 transition-all"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Receive Payment</h1>
          <p className="text-xs text-white/40">Always-on QR terminal · Auto-receiving</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isReady ? (
            <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
              isListening
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-white/40 bg-white/5 border-white/10'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isListening ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
              {isListening ? 'Listening' : 'Paused'}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded-full border border-yellow-500/20">
              <Loader2 size={10} className="animate-spin" />
              Loading
            </span>
          )}
        </div>
      </div>

      {/* 1. PERMANENT STATIC QR CODE CARD (ALWAYS DISPLAYED) */}
      <div className="glass-card p-5 flex flex-col items-center justify-center text-center mb-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between w-full mb-3 px-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
            <QrCode size={12} />
            <span>Static Terminal QR</span>
          </div>
          <span className="font-mono text-xs font-bold text-white/70">
            #{myReceiverCode}
          </span>
        </div>

        {/* QR SVG Container */}
        <div className="p-3 bg-white rounded-3xl shadow-2xl border-4 border-white/90 mb-2">
          <QRCodeSVG
            value={qrPayload}
            size={170}
            level="M"
            includeMargin={false}
          />
        </div>

        <p className="text-xs text-white/50 mt-1 max-w-[250px]">
          Show this QR code to the payer. The terminal is always listening for payments.
        </p>
      </div>

      {/* 2. LATEST PAYMENT RECEIVED BANNER (SHOWN DIRECTLY BELOW QR) */}
      {latestPayment && (
        <div className={`glass-card p-4 mb-4 border-emerald-500/40 bg-emerald-500/15 animate-fade-in relative overflow-hidden ${showFlash ? 'success-flash' : ''}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/25 border border-emerald-400/30 flex items-center justify-center flex-shrink-0 text-emerald-300">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Payment Received!</span>
                  <span className="text-[10px] bg-emerald-400/20 text-emerald-300 px-2 py-0.5 rounded-full font-medium">Just now</span>
                </div>
                <div className="text-3xl font-extrabold text-white mt-0.5">
                  ₹{latestPayment.amount.toFixed(2)}
                </div>
                <p className="text-xs text-white/60 mt-0.5">
                  From: <span className="font-mono font-medium text-white/80">{latestPayment.vendorId}</span>
                  {latestPayment.note && ` · "${latestPayment.note}"`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLatestPayment(null)}
              className="text-white/40 hover:text-white/80 p-1"
              title="Dismiss"
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-3 pt-2.5 border-t border-emerald-500/20 flex items-center justify-between text-[11px] text-emerald-300/80">
            <span className="flex items-center gap-1">
              <ShieldCheck size={12} />
              Saved & credited to offline balance
            </span>
            <span className="text-white/40">Ready for next</span>
          </div>
        </div>
      )}

      {/* 3. CONTINUOUS LISTENING STATUS & AUDIO MONITOR */}
      <div className="glass-card p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isListening ? 'bg-emerald-400 animate-ping' : 'bg-white/20'}`} />
            <span className="text-xs font-semibold text-white/80">
              {isListening ? 'Listening for soundwaves...' : 'Microphone Paused'}
            </span>
          </div>

          <button
            type="button"
            id="btn-toggle-mic"
            onClick={toggleListening}
            className="text-[11px] text-white/60 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-xl border border-white/10 flex items-center gap-1"
          >
            {isListening ? <><MicOff size={11} /> Pause</> : <><Mic size={11} /> Resume</>}
          </button>
        </div>

        {/* Live level meter */}
        {isListening && (
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-400"
              style={{ width: `${Math.max(5, audioLevel)}%` }}
            />
          </div>
        )}
      </div>

      {/* Animated wave */}
      <div className="mb-4">
        <AnimatedWave active={isListening} color={latestPayment ? '#10b981' : '#6366f1'} />
      </div>

      {/* 4. RECENT PAYMENTS RECEIVED LIST */}
      {paymentHistory.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
              Received in this session ({paymentHistory.length})
            </span>
            <Link href="/ledger" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              <BookOpen size={12} />
              Ledger
            </Link>
          </div>

          <div className="space-y-2">
            {paymentHistory.map((tx, idx) => (
              <div
                key={tx.hash + '-' + idx}
                className="glass-card p-3 flex items-center justify-between border-white/5 bg-white/5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <ArrowDownLeft size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white font-mono">{tx.vendorId}</p>
                    <p className="text-[10px] text-white/40">
                      {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      {tx.note && ` · "${tx.note}"`}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-black text-emerald-400 font-mono">
                  +₹{tx.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {(error || decodeError) && (
        <div className="glass-card p-3 mb-4 flex items-center gap-2.5 border-red-500/30 bg-red-500/10 text-red-400 text-xs">
          <AlertCircle size={16} className="flex-shrink-0" />
          <p>{permissionDenied ? 'Microphone blocked in browser settings' : (error || decodeError)}</p>
        </div>
      )}
    </main>
  );
}
