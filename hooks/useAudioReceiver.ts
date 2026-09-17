/**
 * hooks/useAudioReceiver.ts
 * Captures microphone audio and decodes it using ggwave.
 *
 * Key settings for reliable decoding:
 *   - echoCancellation: false  (prevents DSP from distorting FSK tones)
 *   - noiseSuppression: false  (ggwave's Reed-Solomon handles noise)
 *   - autoGainControl: false   (prevents amplitude normalization)
 *
 * Uses ScriptProcessorNode for broad mobile browser compatibility.
 * Note: ScriptProcessorNode is deprecated but has the widest support.
 * AudioWorklet is the modern replacement but requires a separate worker file.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useGGWave, sharedAudioContext, SAMPLE_RATE } from './useGGWave';

const BUFFER_SIZE = 4096; // Samples per processing chunk

export interface DecodedPayload {
  raw: string;
  timestamp: number;
}

interface UseAudioReceiverReturn {
  startListening: () => Promise<void>;
  stopListening: () => void;
  isListening: boolean;
  lastPayload: DecodedPayload | null;
  error: string | null;
  isReady: boolean;
  permissionDenied: boolean;
}

export function useAudioReceiver(
  onPayloadDecoded?: (payload: DecodedPayload) => void
): UseAudioReceiverReturn {
  const { ggwave, instance, isReady, error: initError } = useGGWave();
  const [isListening, setIsListening] = useState(false);
  const [lastPayload, setLastPayload] = useState<DecodedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const stopListening = useCallback(() => {
    // Stop all mic tracks
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Disconnect audio nodes
    try {
      processorRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
    } catch {}
    processorRef.current = null;
    sourceNodeRef.current = null;

    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    if (!isReady || !ggwave || !instance) {
      setError('ggwave not ready yet');
      return;
    }
    if (isListening) return;

    setError(null);
    setPermissionDenied(false);

    try {
      // Request mic with noise suppression OFF for clean FSK tones
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // Use shared AudioContext or create one
      let ctx = sharedAudioContext;
      if (!ctx) {
        ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      }
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Create source from microphone
      const sourceNode = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      // ScriptProcessorNode for processing audio chunks
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!ggwave || !instance) return;

        const inputData = event.inputBuffer.getChannelData(0);

        // Convert Float32Array → Int8Array for ggwave.decode
        const int8Samples = convertToInt8(inputData);

        try {
          const result = ggwave.decode(instance, int8Samples);

          if (result && result.length > 0) {
            const decoded = new TextDecoder().decode(result);
            if (decoded.trim().length > 0) {
              const payload: DecodedPayload = {
                raw: decoded.trim(),
                timestamp: Date.now(),
              };
              setLastPayload(payload);
              onPayloadDecoded?.(payload);
            }
          }
        } catch {
          // Decoding errors are normal (most frames have no payload)
        }
      };

      // Connect: mic → processor → (silent destination to keep pipeline active)
      sourceNode.connect(processor);
      processor.connect(ctx.destination);

      setIsListening(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        setPermissionDenied(true);
        setError('Microphone permission denied. Please allow mic access.');
      } else {
        const msg = e instanceof Error ? e.message : 'Failed to start microphone';
        setError(msg);
      }
      console.error('[useAudioReceiver] error:', e);
    }
  }, [ggwave, instance, isReady, isListening, onPayloadDecoded]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    startListening,
    stopListening,
    isListening,
    lastPayload,
    error: error || initError,
    isReady,
    permissionDenied,
  };
}

/**
 * Float32Array [-1, 1] → Int8Array [-128, 127] for ggwave.decode input
 */
function convertToInt8(float32: Float32Array): Int8Array {
  const int8 = new Int8Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int8[i] = Math.round(clamped * 127);
  }
  return int8;
}
