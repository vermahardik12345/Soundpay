export default function OfflineFallbackPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-gradient-primary">
      <div className="w-20 h-20 rounded-3xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center mb-6">
        <span className="text-4xl">📵</span>
      </div>
      <h1 className="text-3xl font-bold text-white mb-3">You are offline</h1>
      <p className="text-white/50 text-lg mb-8 max-w-xs">
        SoundPay works offline! Return to the app to send and receive payments via audio.
      </p>
      <a
        href="/"
        className="px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-lg hover:opacity-90 active:scale-95 transition-all"
      >
        Open SoundPay
      </a>
      <p className="text-xs text-white/30 mt-6">
        All features work without internet · Sync when you reconnect
      </p>
    </main>
  );
}
