'use client';

import { useEffect, useRef } from 'react';

interface AnimatedWaveProps {
  active: boolean;
  color?: string;
  className?: string;
}

export function AnimatedWave({ active, color = '#6366f1', className = '' }: AnimatedWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      const amplitude = active ? 28 : 4;
      const frequency = active ? 0.04 : 0.02;
      const speed = active ? 0.08 : 0.02;

      // Draw 3 overlapping waves with different phases
      const waves = [
        { alpha: 0.9, phase: 0, amp: amplitude },
        { alpha: 0.5, phase: Math.PI / 2, amp: amplitude * 0.7 },
        { alpha: 0.3, phase: Math.PI, amp: amplitude * 0.4 },
      ];

      waves.forEach(({ alpha, phase, amp }) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2.5;

        for (let x = 0; x < width; x++) {
          const y =
            height / 2 +
            amp * Math.sin(x * frequency + timeRef.current * speed * 10 + phase);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
      timeRef.current++;
      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [active, color]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={80}
      className={`w-full ${className}`}
      style={{ borderRadius: '12px' }}
    />
  );
}
