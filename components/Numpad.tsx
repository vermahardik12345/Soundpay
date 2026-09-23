'use client';

interface NumpadProps {
  value: string;
  onChange: (value: string) => void;
  maxDigits?: number;
}

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

export function Numpad({ value, onChange, maxDigits = 8 }: NumpadProps) {
  const handleKey = (key: string) => {
    if (key === '⌫') {
      onChange(value.slice(0, -1) || '0');
      return;
    }

    // Don't allow two decimals
    if (key === '.' && value.includes('.')) return;

    // Don't start with two zeros
    if (value === '0' && key === '0') return;

    // Replace leading zero
    if (value === '0' && key !== '.') {
      onChange(key);
      return;
    }

    // Limit total digits
    const digits = value.replace('.', '').length;
    if (digits >= maxDigits) return;

    // Limit 2 decimal places
    if (value.includes('.')) {
      const decimalPart = value.split('.')[1];
      if (decimalPart && decimalPart.length >= 2) return;
    }

    onChange(value + key);
  };

  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-xs mx-auto">
      {KEYS.flat().map((key) => (
        <button
          key={key}
          id={`numpad-key-${key === '⌫' ? 'backspace' : key === '.' ? 'dot' : key}`}
          onClick={() => handleKey(key)}
          className={`
            h-16 rounded-2xl text-2xl font-semibold transition-all duration-150
            active:scale-95 select-none
            ${key === '⌫'
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
              : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
            }
          `}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
