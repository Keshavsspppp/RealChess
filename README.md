# Chess

A chess.com-style app: play chess online 1v1 with auth and ratings.

```
chess/
├── frontend/   Vite + React + TypeScript (board, auth UI)
└── backend/    Node + Socket.IO (real-time games, Clerk verify, Postgres)
```

**Stack:** React 19, [chess.js](https://github.com/jhlywa/chess.js) (rules), [react-chessboard](https://github.com/Clariity/react-chessboard) (board), [Clerk](https://clerk.com) (auth), Socket.IO (real-time), Postgres via `pg` (saved games + Elo ratings), [Stockfish 18](https://github.com/nmrugg/stockfish.js) WASM (computer opponent).

## Setup

**1. Keys** — from [dashboard.clerk.com](https://dashboard.clerk.com) → API Keys:

- `frontend/.env.local` → `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...`
- `backend/.env` → `CLERK_SECRET_KEY=sk_test_...`

**2. Database (optional)** — for saved games + ratings. Set `DATABASE_URL` in `backend/.env`
(local Docker or a free [Neon](https://neon.com) DB). Tables are created automatically on boot.
Leave it unset and online play still works — games just aren't saved.

## Run

Each folder is its own project. Install once:

```bash
cd frontend && npm install
```

```bash
cd backend && npm install
```

Then start each in its own terminal:

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

Open `localhost:5173` in two browsers, sign in as different users, click **Play online** in both.

## Features

- Local 2-player, **vs computer** (Stockfish, Easy/Medium/Hard, play either color), and online 1v1
- Full rules: legal moves, check/checkmate/stalemate/draw, **promotion picker**, **resign**
- Server-authoritative — every move re-validated on the backend
- Elo ratings + game history (with a database)

## Chess engine

The computer opponent runs entirely in the browser (no server). The Stockfish 18
"lite single-threaded" WASM files are vendored in `frontend/public/engine/` (from the
`stockfish` npm package) and loaded in a Web Worker — single-threaded so it needs no
cross-origin-isolation headers. Stockfish is **GPLv3**; keep that in mind if you distribute.

## Not yet built

- Spectating, draw offers, clocks/time control
