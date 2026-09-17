/**
 * hooks/useAudioSender.ts
 * Encodes a JSON payload as audio tones and plays it via the device speaker.
 *
 * Protocol: GGWAVE_PROTOCOL_AUDIBLE_FAST (index 1)
 *   - Uses FSK tones in the 1-4kHz range
 *   - Reed-Solomon error correction for noise resilience
 *   - Works on ALL device speakers and microphones
 *   - Resistant to typical background noise (speech, music, ambient)
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { useGGWave, sharedAudioContext, SAMPLE_RATE } from './useGGWave';

// Protocol IDs from ggwave (0=Audible Normal, 1=Audible Fast, 2=Audible Fastest)
// We use AUDIBLE_FAST (1) — good balance of speed and reliability
const PROTOCOL_ID = 1; // GGWAVE_PROTOCOL_AUDIBLE_FAST
const TX_VOLUME = 20; // 0-100 scale, 20 is loud and clear

interface UseAudioSenderReturn {
  sendPayload: (payloadJson: string) => Promise<void>;
  isSending: boolean;
  error: string | null;
  isReady: boolean;
}

export function useAudioSender(): UseAudioSenderReturn {
  const { ggwave, instance, isReady, error: initError } = useGGWave();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const sendPayload = useCallback(
    async (payloadJson: string) => {
      if (!isReady || !ggwave || !instance) {
        setError('ggwave not ready yet');
        return;
      }

      // Stop any ongoing transmission
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {}
        sourceRef.current = null;
      }

      setIsSending(true);
      setError(null);

      try {
        // Ensure AudioContext is running (may be suspended before user gesture)
        let ctx = sharedAudioContext;
        if (!ctx) {
          ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
        }
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        // Encode: returns Int8Array (waveform samples at SAMPLE_RATE)
        const waveform = ggwave.encode(instance, payloadJson, PROTOCOL_ID, TX_VOLUME);

        if (!waveform || waveform.length === 0) {
          throw new Error('ggwave encoding returned empty buffer');
        }

        // Convert Int8Array to Float32Array for Web Audio API
        const float32 = convertToFloat32(waveform);

        // Create AudioBuffer and fill it
        const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
        buffer.getChannelData(0).set(float32);

        // Play it
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        sourceRef.current = source;

        source.start();
        source.onended = () => {
          setIsSending(false);
          sourceRef.current = null;
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Audio send failed';
        setError(msg);
        setIsSending(false);
        console.error('[useAudioSender] error:', e);
      }
    },
    [ggwave, instance, isReady]
  );

  return {
    sendPayload,
    isSending,
    error: error || initError,
    isReady,
  };
}

/**
 * ggwave.encode() returns Int8Array. Web Audio API expects Float32Array in [-1, 1].
 * The samples are already normalized, just need type conversion.
 */
function convertToFloat32(int8Array: Int8Array | Uint8Array | Float32Array): Float32Array {
  // If it's already float, return as-is
  if (int8Array instanceof Float32Array) return int8Array;

  const float32 = new Float32Array(int8Array.length);
  for (let i = 0; i < int8Array.length; i++) {
    // Int8 range is -128 to 127; normalize to [-1, 1]
    float32[i] = int8Array[i] / 32768.0;
  }
  return float32;
}
