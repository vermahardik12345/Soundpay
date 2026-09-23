# SoundPay — Offline Audio Payment PWA

A peer-to-peer offline payment system that transmits encrypted payment payloads between phones using audible FSK audio tones (ggwave). **No internet required during transactions.**

## Demo

> Deploy to Vercel → open on 2 phones → Phone A taps "Send" → Phone B taps "Receive" → hold phones 1–2 feet apart → payment confirmed! 🎉

## Tech Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** — mobile-first dark UI
- **ggwave WASM** — FSK audio modem (`AUDIBLE_FAST` protocol, 1–4kHz, Reed-Solomon ECC)
- **Web Audio API** — speaker playback + microphone capture
- **IndexedDB (`idb`)** — offline transaction ledger
- **`@ducanh2912/next-pwa`** — service worker for full offline support

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Or connect your GitHub repo to [vercel.com](https://vercel.com) for auto-deploy.

> **Important:** The `vercel.json` sets COOP/COEP headers required for WASM and microphone access on mobile browsers.

## Demo Instructions (2 Phones)

1. Open the deployed Vercel URL on **both phones**
2. **Phone B (Receiver):** Tap "Receive" → tap the mic button to start listening
3. **Phone A (Sender):** Tap "Pay" → enter amount → tap "Send Sound 🔊"
4. Hold phones **30–60cm apart**, speaker facing the other phone's mic
5. **Phone B** will show a green "Payment Received: ₹[amount]" card
6. Check "Ledger" on both phones to see the stored transactions

## Tips for Best Demo Results

- Turn phone volume to **maximum** on the sender
- Use in a **quiet room** (background noise reduces reliability)
- Use `AUDIBLE_FAST` protocol (default) — don't change this for demos
- If a payment doesn't decode the first time, tap "Send Sound" again

## Architecture

```
app/
├── page.tsx          # Home dashboard
├── pay/page.tsx      # Send payment (plays audio tones)
├── receive/page.tsx  # Receive payment (mic decodes)
└── ledger/page.tsx   # Transaction history (IndexedDB)

hooks/
├── useGGWave.ts      # WASM module singleton
├── useAudioSender.ts # Encode payload → play tones
└── useAudioReceiver.ts # Mic → decode payload

lib/
├── db.ts             # IndexedDB ledger
├── crypto.ts         # SHA-256 payload hashing (SubtleCrypto, offline)
└── sync.ts           # Mock cloud sync (triggers on reconnect)

public/
└── ggwave/           # ggwave.js (WASM embedded as base64 — no .wasm file needed)
```

## Offline Behavior

- All assets cached by service worker (PWA)
- Works 100% in Airplane Mode after first load
- Transactions stored in IndexedDB with `synced: "pending"` status
- Auto-syncs to backend when internet reconnects
