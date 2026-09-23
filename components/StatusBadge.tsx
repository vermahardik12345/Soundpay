'use client';

import { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export function StatusBadge() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all duration-300 ${
        isOnline
          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
          : 'bg-orange-500/15 text-orange-400 border-orange-500/30'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi size={11} />
          Online
        </>
      ) : (
        <>
          <WifiOff size={11} />
          Offline Mode
        </>
      )}
    </div>
  );
}
