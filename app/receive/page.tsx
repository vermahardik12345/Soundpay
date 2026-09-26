'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mic, MicOff, CheckCircle2, AlertCircle, Loader2, ShieldCheck, QrCode, BookOpen } from 'lucide-react';
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

export default function ReceivePage() {
  const [receivedPayment, setReceivedPayment] = useState<ReceivedPayment | null>(null);
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
        setDecodeError('Received audio signal but payload format was invalid. Try again.');
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
        timestamp: parsed.t,
      };

      setReceivedPayment(received);
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 500);

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

  // Auto-start listening as soon as audio engine is ready without manual tapping!
  useEffect(() => {
    if (isReady && !isListening && !permissionDenied && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startListening();
    }
  }, [isReady, isListening, permissionDenied, startListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
      setReceivedPayment(null);
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const qrPayload = formatReceiverQr(myReceiverCode);

  return (
    <main className="flex flex-col min-h-screen bg-gradient-primary px-4 pb-8 pt-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          id="btn-back-receive"
          className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center hover:bg-white/15 active:scale-95 transition-all"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Receive Payment</h1>
          <p className="text-xs text-white/40">Scan QR to pair · Listening automatically</p>
        </div>
        <div className="ml-auto">
          {isReady ? (
            <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
              isListening
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-white/40 bg-white/5 border-white/10'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isListening ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
              {isListening ? 'Live Mic' : 'Idle'}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded-full border border-yellow-500/20">
              <Loader2 size={10} className="animate-spin" />
              Loading
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {!receivedPayment ? (
        <>
          {/* Static QR Code Card */}
          <div className="glass-card p-6 flex flex-col items-center justify-center text-center mb-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-4 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
              <QrCode size={13} />
              <span>Static Receiver QR</span>
            </div>

            {/* QR SVG */}
            <div className="p-3.5 bg-white rounded-3xl shadow-2xl border-4 border-white/90 mb-3">
              <QRCodeSVG
                value={qrPayload}
                size={185}
                level="M"
                includeMargin={false}
              />
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xl font-black text-white tracking-widest">
                #{myReceiverCode}
              </span>
            </div>
            <p className="text-xs text-white/50 mt-1 max-w-[240px]">
              Ask the payer to scan this QR code with their camera to send payment instantly.
            </p>
          </div>

          {/* Automatic Listening Indicator & Control */}
          <div className="glass-card p-4 mb-4 flex items-center justify-between border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isListening ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' : 'bg-white/10 text-white/40'}`}>
                <Mic size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {isListening ? 'Microphone Active' : 'Microphone Paused'}
                </p>
                <p className="text-xs text-white/40">
                  {isListening ? 'Auto-listening for soundwaves' : 'Tap button to resume'}
                </p>
              </div>
            </div>

            <button
              id="btn-toggle-mic"
              onClick={toggleListening}
              className={`p-2.5 rounded-xl border text-xs font-medium transition-all ${
                isListening
                  ? 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  : 'bg-emerald-500 text-black font-bold hover:bg-emerald-400'
              }`}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          </div>

          {/* Live Audio Level Meter */}
          {isListening && (
            <div className="glass-card p-3 mb-4">
              <div className="flex items-center justify-between text-[11px] text-white/50 px-1 mb-1.5">
                <span>Soundwave Detector</span>
                <span className={audioLevel > 15 ? 'text-emerald-400 font-semibold' : 'text-white/40'}>
                  {audioLevel > 15 ? 'Sound Detected' : 'Listening...'} ({audioLevel}%)
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-400"
                  style={{ width: `${Math.max(5, audioLevel)}%` }}
                />
              </div>
            </div>
          )}

          {/* Sound Wave Animation */}
          <div className="mb-4">
            <AnimatedWave active={isListening} color={isListening ? '#10b981' : '#6366f1'} />
          </div>
        </>
      ) : (
        /* Success Screen */
        <div className={`glass-card p-6 border-emerald-500/40 bg-emerald-500/10 ${showFlash ? 'success-flash' : ''}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 size={24} className="text-emerald-400" />
            </div>
            <div>
              <p className="font-bold text-emerald-400 text-lg">Payment Received!</p>
              <p className="text-xs text-emerald-400/60">Credited to offline balance</p>
            </div>
          </div>

          <div className="text-5xl font-bold text-white text-center py-4">
            ₹{receivedPayment.amount.toFixed(2)}
          </div>

          {receivedPayment.note && (
            <p className="text-center text-sm text-white/60 mb-3">"{receivedPayment.note}"</p>
          )}

          <div className="space-y-2 mt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">From</span>
              <span className="text-white/70 font-mono">{receivedPayment.vendorId}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">Receiver Code</span>
              <span className="text-emerald-400 font-mono font-bold">#{myReceiverCode}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">Hash</span>
              <span className="text-white/50 font-mono">{receivedPayment.hash}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">Status</span>
              <span className="text-emerald-400 flex items-center gap-1 font-medium">
                <ShieldCheck size={12} />
                Saved to offline ledger
              </span>
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              id="btn-receive-another"
              onClick={() => {
                setReceivedPayment(null);
                startListening();
              }}
              className="flex-1 py-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 active:scale-95 transition-all"
            >
              Receive Another
            </button>
            <Link
              href="/ledger"
              id="btn-view-ledger"
              className="flex-1 py-3 rounded-2xl bg-white/10 text-white text-xs font-semibold hover:bg-white/15 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <BookOpen size={14} />
              View Ledger
            </Link>
          </div>
        </div>
      )}

      {/* Error states */}
      {(error || decodeError) && !receivedPayment && (
        <div className="glass-card p-4 mt-2 mb-4 flex items-center gap-3 border-red-500/30 bg-red-500/10">
          <AlertCircle size={22} className="text-red-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-400 text-sm">
              {permissionDenied ? 'Microphone Blocked' : 'Notice'}
            </p>
            <p className="text-xs text-red-400/70">{error || decodeError}</p>
          </div>
        </div>
      )}
    </main>
  );
}
