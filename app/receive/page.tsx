'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mic, MicOff, CheckCircle2, AlertCircle, Loader2, ShieldCheck, Radio } from 'lucide-react';
import { AnimatedWave } from '@/components/AnimatedWave';
import { useAudioReceiver } from '@/hooks/useAudioReceiver';
import { useAudioSender } from '@/hooks/useAudioSender';
import { validatePayload, formatAckPayload } from '@/lib/crypto';
import { saveTransaction } from '@/lib/db';
import { Transaction } from '@/lib/db';

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
  const [ackStatus, setAckStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const lastProcessedHashRef = useRef<string | null>(null);

  const { sendPayload, isReady: isSenderReady } = useAudioSender();

  const sendAckBursts = useCallback(
    async (hash: string) => {
      try {
        setAckStatus('sending');
        const ackPayload = formatAckPayload(hash);

        // 1. Initial guard delay of 700ms so sender's phone speaker finishes trailing audio and switches on mic
        await new Promise((r) => setTimeout(r, 700));

        // 2. First burst
        console.log('[ReceivePage] Emitting inaudible ultrasound ACK (burst 1):', ackPayload);
        await sendPayload(ackPayload, 'ultrasound');

        // 3. Second burst after 400ms pause to ensure delivery over air gap
        await new Promise((r) => setTimeout(r, 400));
        console.log('[ReceivePage] Emitting inaudible ultrasound ACK (burst 2):', ackPayload);
        await sendPayload(ackPayload, 'ultrasound');

        setAckStatus('sent');
      } catch (ackErr) {
        console.warn('[ReceivePage] Could not broadcast ultrasound ACK:', ackErr);
        setAckStatus('idle');
      }
    },
    [sendPayload]
  );

  const handleDecode = useCallback(
    async ({ raw }: { raw: string; timestamp: number }) => {
      // Ignore any ACK echo packets
      if (raw.startsWith('ACK:')) {
        return;
      }

      console.log('[ReceivePage] Received acoustic payload:', raw);
      const parsed = validatePayload(raw);
      console.log('[ReceivePage] Validated payload:', parsed);
      if (!parsed) {
        setDecodeError('Received audio signal but payload format was invalid. Try again.');
        setTimeout(() => setDecodeError(null), 4000);
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

      // Save to IndexedDB
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

      // Two-Way Handshake: Emit inaudible ultrasound ACK back to payer so payer knows it's safe to deduct funds
      await sendAckBursts(parsed.s);
    },
    [sendAckBursts]
  );

  const { startListening, stopListening, isListening, error, isReady, permissionDenied, audioLevel } =
    useAudioReceiver(handleDecode);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
      setReceivedPayment(null);
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Auto-start listening when ready
  useEffect(() => {
    if (isReady && !isListening) {
      // Don't auto-start - wait for user gesture (required for iOS)
    }
  }, [isReady, isListening]);

  return (
    <main className="flex flex-col min-h-screen bg-gradient-primary px-4 pb-8 pt-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/"
          id="btn-back-receive"
          className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center hover:bg-white/15 active:scale-95 transition-all"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Receive Payment</h1>
          <p className="text-xs text-white/40">Listening via microphone</p>
        </div>
        <div className="ml-auto">
          {isReady ? (
            <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${
              isListening
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-white/40 bg-white/5 border-white/10'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isListening ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
              {isListening ? 'Live' : 'Idle'}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded-full border border-yellow-500/20">
              <Loader2 size={10} className="animate-spin" />
              Loading
            </span>
          )}
        </div>
      </div>

      {/* Main microphone button */}
      <div className="flex flex-col items-center justify-center py-6 mb-4">
        {/* Pulse rings */}
        <div className="relative flex items-center justify-center">
          {isListening && (
            <>
              <div className="absolute w-44 h-44 rounded-full bg-emerald-500/10 border border-emerald-500/15 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="absolute w-36 h-36 rounded-full bg-emerald-500/15 border border-emerald-500/20 animate-ping" style={{ animationDuration: '1.5s', animationDelay: '0.5s' }} />
            </>
          )}

          <button
            id="btn-toggle-listen"
            onClick={toggleListening}
            disabled={!isReady || permissionDenied}
            className={`
              relative w-28 h-28 rounded-full flex items-center justify-center
              transition-all duration-300 active:scale-90
              ${isListening
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 neon-glow-emerald shadow-2xl'
                : isReady && !permissionDenied
                  ? 'bg-gradient-to-br from-indigo-600 to-purple-700 neon-glow-indigo hover:scale-105'
                  : 'bg-white/10 cursor-not-allowed'
              }
            `}
          >
            {isListening ? (
              <MicOff size={40} className="text-white" />
            ) : (
              <Mic size={40} className="text-white" />
            )}
          </button>
        </div>

        <p className="mt-6 text-center font-semibold text-white/70">
          {!isReady && 'Loading audio engine...'}
          {isReady && !isListening && !permissionDenied && 'Tap to start listening'}
          {isListening && 'Listening for payment tones...'}
          {permissionDenied && 'Microphone permission required'}
        </p>
        <p className="text-xs text-white/30 mt-1 text-center max-w-xs">
          {isListening
            ? 'Hold sender phone 30–60cm away and tap "Send Sound"'
            : 'Make sure to allow microphone access when prompted'
          }
        </p>

        {/* Live Audio Level Meter */}
        {isListening && (
          <div className="mt-4 flex flex-col items-center gap-1.5 w-full max-w-xs">
            <div className="flex items-center justify-between w-full text-[11px] text-white/50 px-1">
              <span>Microphone Input</span>
              <span className={audioLevel > 15 ? 'text-emerald-400 font-semibold' : 'text-white/40'}>
                {audioLevel > 15 ? 'Signal Detected' : 'Quiet'} ({audioLevel}%)
              </span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/10">
              <div
                className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-400"
                style={{ width: `${Math.max(5, audioLevel)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Audio wave */}
      <div className="mb-6">
        <AnimatedWave active={isListening} color={isListening ? '#10b981' : '#6366f1'} />
      </div>

      {/* Error states */}
      {(error || decodeError) && !receivedPayment && (
        <div className="glass-card p-4 mb-6 flex items-center gap-3 border-red-500/30 bg-red-500/10">
          <AlertCircle size={22} className="text-red-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-400 text-sm">
              {permissionDenied ? 'Microphone Blocked' : 'Error'}
            </p>
            <p className="text-xs text-red-400/70">{error || decodeError}</p>
          </div>
        </div>
      )}

      {/* Success card */}
      {receivedPayment && (
        <div className={`glass-card p-6 border-emerald-500/40 bg-emerald-500/10 ${showFlash ? 'success-flash' : ''}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 size={24} className="text-emerald-400" />
            </div>
            <div>
              <p className="font-bold text-emerald-400 text-lg">Payment Received!</p>
              <p className="text-xs text-emerald-400/60">Saved to offline ledger</p>
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
              <span className="text-white/40">Hash</span>
              <span className="text-white/50 font-mono">{receivedPayment.hash}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">Synced</span>
              <span className="text-yellow-400 flex items-center gap-1">
                <ShieldCheck size={11} />
                Stored locally, pending sync
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">Handshake</span>
              <span className={ackStatus === 'sent' ? "text-emerald-400 flex items-center gap-1 font-medium" : "text-indigo-400 flex items-center gap-1"}>
                <Radio size={11} className={ackStatus === 'sending' ? 'animate-spin' : ''} />
                {ackStatus === 'sent' ? 'Inaudible ACK Confirmed to Payer' : ackStatus === 'sending' ? 'Sending Ultrasound ACK...' : 'Ready'}
              </span>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              id="btn-resend-ack"
              onClick={() => receivedPayment && sendAckBursts(receivedPayment.hash)}
              disabled={ackStatus === 'sending'}
              className="flex-1 py-3 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/30 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <Radio size={14} className={ackStatus === 'sending' ? 'animate-spin' : ''} />
              {ackStatus === 'sending' ? 'Sending Ultrasound...' : 'Resend ACK to Payer'}
            </button>
            <button
              id="btn-receive-another"
              onClick={() => setReceivedPayment(null)}
              className="flex-1 py-3 rounded-2xl bg-white/10 text-white text-xs font-semibold hover:bg-white/15 active:scale-95 transition-all"
            >
              Receive Another
            </button>
          </div>
        </div>
      )}

      {/* Instructions if not listening */}
      {!isListening && !receivedPayment && (
        <div className="glass-card p-4 mt-2">
          <p className="text-xs font-semibold text-white/60 mb-3 uppercase tracking-wider">Tips for Best Results</p>
          <div className="space-y-2">
            {[
              'Hold phones 30–60cm (1–2 feet) apart',
              'Quiet environment works better',
              'Keep volume high on the sender\'s phone',
              'Avoid covering the mic or speaker',
            ].map((tip, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-white/40">
                <span className="text-indigo-400 font-bold mt-0.5">{i + 1}.</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
