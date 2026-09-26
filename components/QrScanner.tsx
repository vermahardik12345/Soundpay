'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, AlertCircle, X, Flashlight, Loader2 } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { parseReceiverQr } from '@/lib/crypto';

interface QrScannerProps {
  onScanSuccess: (code: string) => void;
  onCancel: () => void;
}

export function QrScanner({ onScanSuccess, onCancel }: QrScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStoppedRef = useRef(false);

  useEffect(() => {
    const readerElementId = 'qr-camera-stream';
    let html5QrCode: Html5Qrcode | null = null;
    isStoppedRef.current = false;

    async function startCamera() {
      try {
        html5QrCode = new Html5Qrcode(readerElementId);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            if (isStoppedRef.current) return;
            const parsed = parseReceiverQr(decodedText);
            if (parsed) {
              isStoppedRef.current = true;
              // Provide brief vibration feedback if supported
              if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                navigator.vibrate([40, 60, 40]);
              }
              // Stop camera immediately
              html5QrCode
                ?.stop()
                .then(() => html5QrCode?.clear())
                .catch(() => {})
                .finally(() => {
                  onScanSuccess(parsed);
                });
            }
          },
          () => {
            // Frame parse error - ignore standard non-QR frames
          }
        );

        setIsInitializing(false);

        // Check if flashlight / torch is supported
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const track = (html5QrCode as any).getRunningTrackCameraCapabilities?.();
          if (track && track.torch) {
            setHasTorch(true);
          }
        } catch {}
      } catch (err) {
        setIsInitializing(false);
        const msg = err instanceof Error ? err.message : 'Camera access failed';
        if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
          setError('Camera permission denied. Please allow camera access in browser settings.');
        } else if (msg.includes('NotFoundError')) {
          setError('No rear camera detected on this device.');
        } else {
          setError(msg);
        }
      }
    }

    startCamera();

    return () => {
      isStoppedRef.current = true;
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode
          .stop()
          .then(() => html5QrCode?.clear())
          .catch(() => {});
      }
    };
  }, [onScanSuccess]);

  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (scannerRef.current as any).applyVideoConstraints({
        advanced: [{ torch: !torchOn }],
      });
      setTorchOn(!torchOn);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  };

  return (
    <div className="flex flex-col items-center justify-between w-full h-full min-h-[500px] animate-fade-in relative">
      {/* Top action row */}
      <div className="w-full flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-2">
          <Camera size={20} className="text-indigo-400" />
          <span className="text-sm font-bold text-white">Scan Receiver QR</span>
        </div>
        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 rounded-xl border text-xs transition-all ${
                torchOn ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400/40' : 'bg-white/10 text-white/60 border-white/10'
              }`}
              title="Toggle Flashlight"
            >
              <Flashlight size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition-all border border-white/10"
            title="Close Scanner"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Camera Viewport Container */}
      <div className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden bg-black/60 border-2 border-indigo-500/40 shadow-2xl flex items-center justify-center">
        {/* The video container for Html5Qrcode */}
        <div id="qr-camera-stream" className="w-full h-full overflow-hidden" />

        {/* Loading Spinner */}
        {isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 gap-2">
            <Loader2 size={32} className="text-indigo-400 animate-spin" />
            <p className="text-xs text-white/60 font-medium">Opening camera...</p>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-30 p-6 text-center">
            <AlertCircle size={36} className="text-red-400 mb-2" />
            <p className="text-sm font-semibold text-white mb-1">Camera Unavailable</p>
            <p className="text-xs text-white/50 mb-4">{error}</p>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
            >
              Enter Code Manually
            </button>
          </div>
        )}

        {/* UPI-style Targeting Viewfinder Reticle */}
        {!isInitializing && !error && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            <div className="relative w-60 h-60">
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

              {/* Animated scanning laser line */}
              <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse shadow-glow top-1/2 -translate-y-1/2" />
            </div>
          </div>
        )}
      </div>

      {/* Helper text and skip button */}
      <div className="w-full mt-5 text-center">
        <p className="text-xs text-white/60 mb-3">
          Align the QR code shown on receiver's phone within the frame
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-indigo-300 text-xs font-semibold border border-white/10 transition-all"
        >
          Skip / Enter Code Manually
        </button>
      </div>
    </div>
  );
}
