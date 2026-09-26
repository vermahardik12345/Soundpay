'use client';

import { useState, useCallback, useRef } from 'react';
import { useGGWave, convertTypedArray, getAudioSession } from './useGGWave';

export type SoundMode = 'ultrasound' | 'audible';

interface UseAudioSenderReturn {
  sendPayload: (payloadJson: string, mode?: SoundMode) => Promise<void>;
  isSending: boolean;
  error: string | null;
  isReady: boolean;
}

export function useAudioSender(): UseAudioSenderReturn {
  const { ggwave, isReady, error: initError } = useGGWave();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const sendPayload = useCallback(
    async (payloadJson: string, mode: SoundMode = 'ultrasound'): Promise<void> => {
      if (!isReady || !ggwave) {
        const msg = 'Audio engine not ready yet. Please wait.';
        setError(msg);
        throw new Error(msg);
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

      return new Promise<void>(async (resolve, reject) => {
        try {
          // Acquire or resume the AudioContext and the matching instance handle
          const { ctx, instance } = await getAudioSession(ggwave);

          // Select protocol: Inaudible GGWAVE_PROTOCOL_ULTRASOUND_FAST (near-ultrasound ~17kHz-20kHz)
          const protocolId = ggwave.ProtocolId.GGWAVE_PROTOCOL_ULTRASOUND_FAST;

          // Strong output amplitude ensures clear acoustic reception through phone cases and laptop mics
          const txVolume = 95;

          // Encode text into raw audio waveform (Int8Array view of 32-bit floats)
          const waveformInt8: Int8Array = ggwave.encode(
            instance,
            payloadJson,
            protocolId,
            txVolume
          );

          if (!waveformInt8 || waveformInt8.length === 0) {
            throw new Error('ggwave encode returned empty waveform. Payload may be too long.');
          }

          // Convert raw WASM Int8Array bytes to Float32Array
          const float32Samples = convertTypedArray(waveformInt8, Float32Array);

          // Create Web Audio buffer matching the hardware sample rate
          const buffer = ctx.createBuffer(1, float32Samples.length, ctx.sampleRate);
          buffer.getChannelData(0).set(float32Samples);

          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          sourceRef.current = source;

          source.onended = () => {
            setIsSending(false);
            sourceRef.current = null;
            resolve();
          };

          source.start(0);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Audio send failed';
          setError(msg);
          setIsSending(false);
          sourceRef.current = null;
          console.error('[useAudioSender] error:', e);
          reject(e);
        }
      });
    },
    [ggwave, isReady]
  );

  return {
    sendPayload,
    isSending,
    error: error || initError,
    isReady,
  };
}

