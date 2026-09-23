# Flip 7 Companion

A real-time companion for the physical Flip 7 card game. The application records cards selected by each player; it never deals or generates cards.

## Run locally

1. Copy `.env.example` to `.env.local` and add the Supabase URL and publishable key.
2. Run `npm install`.
3. Run `npm run dev`.

## Current implementation

- Email/password accounts and guest sessions
- Host-created rooms, join requests, and host approval
- Target scores and the official 3–18 player start rule
- Authoritative Supabase RPCs for card recording, scoring, bust confirmation, corrections, round confirmation, round finalization, action targets, replay events, and stale-host transfer
- RLS-protected room data and Realtime-enabled tables
- Mobile-first Carnival Table lobby and gameplay surface using the supplied card art

Database changes are versioned under `supabase/migrations`.
