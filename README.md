# Chess

A chess.com-style app: play chess locally, against Stockfish, or online 1v1 with auth and ratings.

```
chess/
├── frontend/            Vite + React + TypeScript
│   ├── src/
│   │   ├── App.tsx              mode switcher (local / bot / online) + Clerk auth shell
│   │   ├── ChessGame.tsx        local 2-player board
│   │   ├── BotGame.tsx          vs Stockfish (difficulty, pick your color)
│   │   ├── OnlineGame.tsx       online 1v1 over Socket.IO
│   │   ├── Stats.tsx            rating + recent games, fetched from the backend
│   │   ├── Clock.tsx            countdown display, re-synced from the server
│   │   ├── MoveList.tsx         SAN scoresheet
│   │   ├── PromotionPicker.tsx  shared promotion overlay
│   │   ├── status.ts            shared status text + clock formatting
│   │   ├── boardStyles.ts       shared last-move square tint
│   │   └── engine.ts            Stockfish Web Worker wrapper
│   └── public/engine/   vendored Stockfish 18 lite WASM
└── backend/             Node + Socket.IO
    ├── index.js         matchmaking, authoritative game loop, HTTP API
    └── db.js            Postgres schema, Elo, persistence
```

**Stack:** React 19, [chess.js](https://github.com/jhlywa/chess.js) (rules), [react-chessboard](https://github.com/Clariity/react-chessboard) (board), [Clerk](https://clerk.com) (auth), Socket.IO (real-time), Postgres via `pg` (saved games + Elo), [Stockfish 18](https://github.com/nmrugg/stockfish.js) WASM (computer opponent).

## Setup

**1. Keys** — from [dashboard.clerk.com](https://dashboard.clerk.com) → API Keys:

- `frontend/.env.local` → `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...`
- `backend/.env` → `CLERK_SECRET_KEY=sk_test_...`

Both folders ship a `.env.example` listing every variable. `.env` files are gitignored.

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

Open `localhost:5173` in two browsers, sign in as **different** users, click **Play online** in both.
(Two tabs of the same account will not be matched against each other — matchmaking skips your own
sessions, since a self-game would corrupt your rating.)

## Checks

```bash
cd frontend && npm run build && npm run lint && npm test
```

`build` typechecks then bundles, `lint` runs oxlint, `test` runs the `node:test` suite in
`src/*.test.ts` (Node runs the TypeScript directly — no test framework or transpile step).

## Features

- Local 2-player, **vs computer** (Stockfish, Easy/Medium/Hard, play either color), and online 1v1
- Full rules: legal moves, check/checkmate/stalemate/draw, **promotion picker**, **resign**
- **Clocks** on online games — 10+0, server-run, win on time
- **Last-move highlight** and a **move list** on every board
- Server-authoritative — every move re-validated on the backend, which also owns game-over detection
- Elo ratings (K=32, start 1200) + last-20 game history, with a database

## How online play works

1. Client gets a Clerk session token and opens a socket with it; the server verifies it in
   middleware and rejects anonymous connections.
2. New sockets join a FIFO queue. A socket is paired with the oldest waiting socket from a
   *different* account; the pair gets `start` with their color and the opening position.
3. Clients apply their own move optimistically, then emit `move`. The server replays it on its own
   `Chess` instance — the only position that counts — and broadcasts `state` to both players.
4. A refused move comes back as `rejected` **carrying the server's FEN**, which the client loads to
   re-sync (its optimistic move is discarded).
5. Games end via `state.over` (checkmate/draw), `ended` (resign or timeout), or `opponentLeft`
   (disconnect = forfeit). The result is written to Postgres *before* the clients are told, so the
   stats panel they immediately refetch is never stale.

### Clocks

Both sides get 10 minutes, no increment (`START_MS` in `backend/index.js`). The server holds the
authoritative times: it charges the mover for the elapsed time when their move lands, then arms a
single `setTimeout` for exactly the opponent's remaining time — no polling interval, one timer per
game. If that timer fires, whoever is on move has flagged and loses. `endGame()` is the one place a
game leaves the map, so a timer can never outlive its game and flag a finished one.

Every `state` carries both clock readings; the browser only counts down between them and re-syncs on
each move, so client drift never accumulates and never decides a game.

### HTTP API

Both routes require `Authorization: Bearer <clerk token>`; failures return 401, DB errors 500.

| Route | Returns |
| --- | --- |
| `GET /health` | `ok` |
| `GET /api/me` | `{ rating, wins, losses, draws }` |
| `GET /api/games` | last 20 games for the signed-in user |

## Chess engine

The computer opponent runs entirely in the browser (no server). The Stockfish 18
"lite single-threaded" WASM files are vendored in `frontend/public/engine/` (from the
`stockfish` npm package) and loaded in a Web Worker — single-threaded so it needs no
cross-origin-isolation headers. Stockfish is **GPLv3**; keep that in mind if you distribute.

## Known gaps

- One fixed time control (10+0) and no increment; more would mean segmenting the waiting queue
- Clocks are online-only — local and bot games are untimed
- No draw offers, spectating, or rematch-same-opponent
- A disconnect forfeits immediately; there's no grace period to reconnect after a dropped network
- Switching modes mid-game unmounts the board and forfeits the online game, with no warning
- Matchmaking is first-come-first-served, not rating-based, and lives in memory — a server
  restart drops every in-progress game
- The online board is drag-only; local and bot boards also support click-to-move
- `engine.ts` tracks one pending search at a time; changing difficulty mid-think leaves the
  superseded promise unresolved (harmless today, but it needs a UCI `stop` if search is queued)
- Remote Postgres connects with `rejectUnauthorized: false` (`backend/db.js`), which skips
  certificate verification — fine for a local/hobby DB, worth tightening before real deployment
