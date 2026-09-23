'use client';

import { useEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GGWaveModule = Record<string, any>;
// The instance is a numeric handle returned by m.init()
export type GGWaveInstanceHandle = number;

interface UseGGWaveReturn {
  ggwave: GGWaveModule | null;
  instance: GGWaveInstanceHandle | null;
  isReady: boolean;
  error: string | null;
  sampleRate: number;
}

// Module-level singletons so WASM init happens only once across the app
let ggwaveModuleCache: GGWaveModule | null = null;
let sharedAudioContext: AudioContext | null = null;
const handlesBySampleRate = new Map<number, GGWaveInstanceHandle>();
const DEFAULT_SAMPLE_RATE = 48000;

/**
 * Reinterprets raw bytes into the target TypedArray view.
 * Essential for ggwave WASM which transfers Float32 audio as raw Int8Array memory buffers.
 */
export function convertTypedArray<T extends ArrayBufferView>(
  src: ArrayBufferView,
  type: new (buffer: ArrayBuffer) => T
): T {
  const buffer = new ArrayBuffer(src.byteLength);
  new Uint8Array(buffer).set(new Uint8Array(src.buffer, src.byteOffset, src.byteLength));
  return new type(buffer);
}

/**
 * Retrieves or creates a running AudioContext and a matching ggwave instance.
 * Automatically synchronizes ggwave's input/output sample rates with the hardware sample rate.
 */
export async function getAudioSession(
  mod?: GGWaveModule | null
): Promise<{ ctx: AudioContext; instance: GGWaveInstanceHandle }> {
  const ggwave = mod || ggwaveModuleCache;
  if (!ggwave) {
    throw new Error('ggwave WASM module is not loaded yet.');
  }

  if (typeof window === 'undefined') {
    throw new Error('Audio is only supported in the browser.');
  }

  // Create or retrieve AudioContext
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    try {
      sharedAudioContext = new AudioCtx({ sampleRate: DEFAULT_SAMPLE_RATE });
    } catch {
      sharedAudioContext = new AudioCtx();
    }
  }

  // Resume suspended context (required after user gesture on iOS/Android)
  if (sharedAudioContext.state === 'suspended') {
    await sharedAudioContext.resume();
  }

  const rate = sharedAudioContext.sampleRate;
  let handle = handlesBySampleRate.get(rate);
  if (handle === undefined) {
    const params = ggwave.getDefaultParameters();
    params.sampleRateInp = rate;
    params.sampleRateOut = rate;
    const newHandle: GGWaveInstanceHandle = ggwave.init(params);
    handlesBySampleRate.set(rate, newHandle);
    handle = newHandle;
  }

  return { ctx: sharedAudioContext, instance: handle };
}

export function useGGWave(): UseGGWaveReturn {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeHandle, setActiveHandle] = useState<GGWaveInstanceHandle | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (ggwaveModuleCache !== null) {
      const defaultH = handlesBySampleRate.get(DEFAULT_SAMPLE_RATE) ?? null;
      setActiveHandle(defaultH);
      setIsReady(true);
      return;
    }
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      try {
        await loadScript('/ggwave/ggwave.js');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const factory = (window as any).ggwave_factory;
        if (!factory) throw new Error('ggwave_factory not found in /ggwave/ggwave.js');

        const mod: GGWaveModule = await factory();
        ggwaveModuleCache = mod;

        // Pre-initialize a default 48k instance
        const params = mod.getDefaultParameters();
        params.sampleRateInp = DEFAULT_SAMPLE_RATE;
        params.sampleRateOut = DEFAULT_SAMPLE_RATE;
        const defaultHandle = mod.init(params);
        handlesBySampleRate.set(DEFAULT_SAMPLE_RATE, defaultHandle);
        setActiveHandle(defaultHandle);

        setIsReady(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load ggwave WASM';
        setError(msg);
        console.error('[useGGWave] init error:', e);
      }
    }

    init();
  }, []);

  return {
    ggwave: ggwaveModuleCache,
    instance: activeHandle,
    isReady,
    error,
    sampleRate: sharedAudioContext?.sampleRate || DEFAULT_SAMPLE_RATE,
  };
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

export { sharedAudioContext, DEFAULT_SAMPLE_RATE as SAMPLE_RATE };

