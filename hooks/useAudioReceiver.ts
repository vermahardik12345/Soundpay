'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useGGWave, convertTypedArray, getAudioSession } from './useGGWave';

const BUFFER_SIZE = 1024; // Must match ggwave samplesPerFrame (default 1024)

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
  audioLevel: number; // 0 to 100 real-time input signal level
}

export function useAudioReceiver(
  onPayloadDecoded?: (payload: DecodedPayload) => void
): UseAudioReceiverReturn {
  const { ggwave, isReady, error: initError } = useGGWave();
  const [isListening, setIsListening] = useState(false);
  const [lastPayload, setLastPayload] = useState<DecodedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const callbackRef = useRef(onPayloadDecoded);
  useEffect(() => {
    callbackRef.current = onPayloadDecoded;
  }, [onPayloadDecoded]);

  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const preAmpGainRef = useRef<GainNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);

  const stopListening = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    try {
      preAmpGainRef.current?.disconnect();
      processorRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      muteGainRef.current?.disconnect();
    } catch {}
    preAmpGainRef.current = null;
    processorRef.current = null;
    sourceNodeRef.current = null;
    muteGainRef.current = null;

    setAudioLevel(0);
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    if (!isReady || !ggwave) {
      setError('Audio engine not ready yet.');
      return;
    }
    if (isListening) return;

    setError(null);
    setPermissionDenied(false);

    try {
      // Obtain shared AudioContext & instance handle matching device sample rate
      const { ctx, instance } = await getAudioSession(ggwave);

      // Disable browser audio filtering so FSK tones are captured cleanly
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const sourceNode = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;

      // Route through a gain of 0 to destination to prevent speaker feedback while keeping the audio graph active
      const muteGain = ctx.createGain();
      muteGain.gain.value = 0;
      muteGainRef.current = muteGain;

      processor.onaudioprocess = (event) => {
        if (!ggwave || instance === null) return;

        const inputChannelData = event.inputBuffer.getChannelData(0);

        // Compute signal RMS for UI live volume indicator
        let sum = 0;
        for (let i = 0; i < inputChannelData.length; i++) {
          sum += inputChannelData[i] * inputChannelData[i];
        }
        const rms = Math.sqrt(sum / inputChannelData.length);
        const level = Math.min(100, Math.round(rms * 450));
        setAudioLevel(level);

        // Convert Float32Array to Int8Array view of raw float memory for ggwave WASM
        const floatSamples = new Float32Array(inputChannelData);
        const int8Input = convertTypedArray(floatSamples, Int8Array);

        try {
          const resultInt8: Int8Array = ggwave.decode(instance, int8Input);

          if (resultInt8 && resultInt8.length > 0) {
            const decoded = new TextDecoder('utf-8').decode(
              new Uint8Array(resultInt8.buffer, resultInt8.byteOffset, resultInt8.byteLength)
            );
            const trimmed = decoded.trim().replace(/\0/g, '');
            if (trimmed.length > 0) {
              console.log('[SoundPay Audio Receiver] Decoded tone payload:', trimmed);
              const payload: DecodedPayload = {
                raw: trimmed,
                timestamp: Date.now(),
              };
              setLastPayload(payload);
              callbackRef.current?.(payload);
            }
          }
        } catch {
          // Silent during noise frames
        }
      };

      // Pre-amplifier gain to boost faint ultrasonic signals from across the room
      const preAmpGain = ctx.createGain();
      preAmpGain.gain.value = 1.4;
      preAmpGainRef.current = preAmpGain;

      // Connect: mic -> preAmpGain -> processor -> muteGain -> destination
      sourceNode.connect(preAmpGain);
      preAmpGain.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(ctx.destination);

      setIsListening(true);
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')
      ) {
        setPermissionDenied(true);
        setError('Microphone permission denied. Please allow access in browser settings.');
      } else if (e instanceof DOMException && e.name === 'NotFoundError') {
        setError('No microphone detected on this device.');
      } else {
        const msg = e instanceof Error ? e.message : 'Failed to start microphone';
        setError(msg);
      }
      console.error('[useAudioReceiver] error:', e);
    }
  }, [ggwave, isReady, isListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopListening();
  }, [stopListening]);

  return {
    startListening,
    stopListening,
    isListening,
    lastPayload,
    error: error || initError,
    isReady,
    permissionDenied,
    audioLevel,
  };
}

