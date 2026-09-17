/**
 * hooks/useGGWave.ts
 * Shared singleton hook to initialize the ggwave WASM module.
 * Must be called client-side only.
 *
 * ggwave.js and ggwave.wasm are served from /public/ggwave/
 * so they bypass webpack and are always available offline (cached by SW).
 */

'use client';

import { useEffect, useRef, useState } from 'react';

export type GGWaveProtocol =
  | 'GGWAVE_PROTOCOL_AUDIBLE_NORMAL'
  | 'GGWAVE_PROTOCOL_AUDIBLE_FAST'
  | 'GGWAVE_PROTOCOL_AUDIBLE_FASTEST'
  | 'GGWAVE_PROTOCOL_ULTRASOUND_NORMAL'
  | 'GGWAVE_PROTOCOL_ULTRASOUND_FAST'
  | 'GGWAVE_PROTOCOL_ULTRASOUND_FASTEST';

export interface GGWaveInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  encode: (payload: string, protocol: number, volume: number) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decode: (samples: Float32Array) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  free: (instance: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface GGWaveModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface UseGGWaveReturn {
  ggwave: GGWaveModule | null;
  instance: GGWaveInstance | null;
  isReady: boolean;
  error: string | null;
  sampleRate: number;
}

// Module-level singletons so init happens only once across the app
let ggwaveModuleCache: GGWaveModule | null = null;
let ggwaveInstanceCache: GGWaveInstance | null = null;
let audioContextCache: AudioContext | null = null;
const SAMPLE_RATE = 48000;

export function useGGWave(): UseGGWaveReturn {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current || ggwaveInstanceCache) {
      if (ggwaveInstanceCache) setIsReady(true);
      return;
    }
    initRef.current = true;

    async function init() {
      try {
        // Dynamically load the ggwave script from public folder
        if (!ggwaveModuleCache) {
          await loadScript('/ggwave/ggwave.js');

          // The script sets window.ggwave_factory
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const factory = (window as any).ggwave_factory;
          if (!factory) throw new Error('ggwave_factory not found on window');

          ggwaveModuleCache = await factory({
            locateFile: (file: string) => `/ggwave/${file}`,
          });
        }

        if (!ggwaveInstanceCache && ggwaveModuleCache) {
          const mod = ggwaveModuleCache;
          // Create AudioContext
          if (!audioContextCache) {
            audioContextCache = new AudioContext({ sampleRate: SAMPLE_RATE });
          }

          const params = mod.getDefaultParameters();
          params.sampleRateInp = SAMPLE_RATE;
          params.sampleRateOut = SAMPLE_RATE;

          ggwaveInstanceCache = mod.init(params) as GGWaveInstance;
        }

        setIsReady(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load ggwave';
        setError(msg);
        console.error('[useGGWave] init error:', e);
      }
    }

    init();
  }, []);

  return {
    ggwave: ggwaveModuleCache,
    instance: ggwaveInstanceCache,
    isReady,
    error,
    sampleRate: SAMPLE_RATE,
  };
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
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

export { audioContextCache as sharedAudioContext, SAMPLE_RATE };
