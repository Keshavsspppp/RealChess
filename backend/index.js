import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { Chess } from 'chess.js'
import { verifyToken } from '@clerk/backend'
import { initDb, persistGame, getMe, getGames } from './db.js'

const PORT = process.env.PORT || 3001
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
const SECRET_KEY = process.env.CLERK_SECRET_KEY

// ponytail: one fixed time control (10+0). Segment the waiting queue by control if you add more.
const START_MS = 10 * 60 * 1000

if (!SECRET_KEY) {
  console.error('Missing CLERK_SECRET_KEY. Add it to .env (dashboard.clerk.com → API Keys).')
  process.exit(1)
}

async function authFromHeader(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return null
  try {
    return (await verifyToken(token, { secretKey: SECRET_KEY })).sub
  } catch {
    return null
  }
}

function json(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

const httpServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', CLIENT_ORIGIN)
  res.setHeader('Access-Control-Allow-Headers', 'Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  if (req.url === '/health') return res.writeHead(200).end('ok')

  if (req.url.startsWith('/api/')) {
    // A rejected DB query here would otherwise be an unhandled rejection — which kills the process.
    try {
      const userId = await authFromHeader(req)
      if (!userId) return res.writeHead(401).end()
      if (req.url === '/api/me') return json(res, await getMe(userId))
      if (req.url.startsWith('/api/games')) return json(res, await getGames(userId))
      return res.writeHead(404).end()
    } catch (e) {
      console.error('API error:', e.message)
      return res.writeHead(500).end()
    }
  }
  res.writeHead(404).end()
})

const io = new Server(httpServer, { cors: { origin: CLIENT_ORIGIN } })

// Verify the Clerk session token on connect; reject anonymous sockets.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('no token'))
    const payload = await verifyToken(token, { secretKey: SECRET_KEY })
    socket.data.userId = payload.sub
    next()
  } catch {
    next(new Error('auth failed'))
  }
})

const waiting = [] // sockets queued for an opponent, oldest first
const games = new Map() // gameId -> { chess, white, black, whiteMs, blackMs, lastMove, lastTickAt, timer }
let nextGameId = 1

const cap = (color) => color[0].toUpperCase() + color.slice(1)

// Oldest queued socket that is still connected and belongs to a different account.
// Two tabs of one account must never be paired: persistGame would then read and
// write the same players row twice in one transaction and corrupt that rating.
function takeOpponent(socket) {
  const i = waiting.findIndex((s) => s.connected && s.data.userId !== socket.data.userId)
  return i === -1 ? null : waiting.splice(i, 1)[0]
}

// Every path that finishes a game routes through here, so a clock timer can never outlive it.
function endGame(gameId) {
  const game = games.get(gameId)
  if (game) clearTimeout(game.timer)
  games.delete(gameId)
}

// One timeout per game, armed for exactly the mover's remaining time — no polling interval.
function armClock(gameId) {
  const game = games.get(gameId)
  if (!game) return
  clearTimeout(game.timer)
  game.lastTickAt = Date.now()
  const left = game.chess.turn() === 'w' ? game.whiteMs : game.blackMs
  game.timer = setTimeout(() => {
    flag(gameId).catch((e) => console.error('flag failed:', e.message))
  }, Math.max(0, left))
}

// The armed timer fired: whoever is on move never played in time.
async function flag(gameId) {
  const game = games.get(gameId)
  if (!game) return
  const loser = game.chess.turn() === 'w' ? 'white' : 'black'
  const winner = loser === 'white' ? 'black' : 'white'
  if (loser === 'white') game.whiteMs = 0
  else game.blackMs = 0
  endGame(gameId)
  const status = `${cap(loser)} ran out of time — ${cap(winner)} wins`
  await persistGame({ ...playersOf(game), result: 'timeout', winner }) // save before clients refetch
  game.white.emit('ended', { status })
  game.black.emit('ended', { status })
}

// ponytail: server owns the real game; every move re-validated here. Never trust the client.
function stateOf(game) {
  const { chess } = game
  const turn = chess.turn() === 'w' ? 'white' : 'black'
  let status
  if (chess.isCheckmate()) status = `Checkmate — ${turn === 'white' ? 'Black' : 'White'} wins`
  else if (chess.isStalemate()) status = 'Stalemate — draw'
  else if (chess.isDraw()) status = 'Draw'
  else status = `${cap(turn)} to move${chess.inCheck() ? ' — check!' : ''}`
  return {
    fen: chess.fen(),
    turn,
    status,
    over: chess.isGameOver(),
    lastMove: game.lastMove ?? null, // so clients can tint the squares just used
    history: chess.history(), // SAN, in play order
    whiteMs: Math.max(0, game.whiteMs),
    blackMs: Math.max(0, game.blackMs),
  }
}

function resultOf(chess) {
  if (chess.isCheckmate()) {
    const loser = chess.turn() === 'w' ? 'white' : 'black'
    return { result: 'checkmate', winner: loser === 'white' ? 'black' : 'white' }
  }
  return { result: 'draw', winner: null } // stalemate / insufficient / repetition / 50-move
}

function playersOf(game) {
  return { whiteId: game.white.data.userId, blackId: game.black.data.userId, pgn: game.chess.pgn() }
}

io.on('connection', (socket) => {
  const opponent = takeOpponent(socket)
  if (opponent) {
    const white = opponent
    const black = socket

    const gameId = String(nextGameId++)
    const game = {
      chess: new Chess(),
      white,
      black,
      whiteMs: START_MS,
      blackMs: START_MS,
      lastMove: null,
      lastTickAt: 0,
      timer: null,
    }
    games.set(gameId, game)
    armClock(gameId)

    for (const [s, color] of [[white, 'white'], [black, 'black']]) {
      s.data.gameId = gameId
      s.data.color = color
      s.emit('start', { gameId, color, ...stateOf(game) })
    }
  } else {
    waiting.push(socket)
    socket.emit('waiting')
  }

  socket.on('move', async (msg) => {
    const { from, to, promotion } = msg || {} // a bare emit('move') must not crash the server
    const game = games.get(socket.data.gameId)
    if (!game) return
    const myTurn = game.chess.turn() === (socket.data.color === 'white' ? 'w' : 'b')
    // Send the authoritative position back so a client that guessed wrong can re-sync.
    if (!myTurn) return socket.emit('rejected', { fen: game.chess.fen() })

    let applied
    try {
      // chess.js rejects a bad promotion letter; default to queen when none sent.
      applied = game.chess.move({ from, to, promotion: promotion || 'q' })
    } catch {
      return socket.emit('rejected', { fen: game.chess.fen() }) // illegal move
    }

    // Charge the mover for the time they took. The armed timer is the authority on
    // flagging, so a move that lands before it fires is in time by definition.
    const spent = Date.now() - game.lastTickAt
    if (socket.data.color === 'white') game.whiteMs -= spent
    else game.blackMs -= spent
    game.lastMove = { from: applied.from, to: applied.to }

    const state = stateOf(game)
    if (state.over) {
      endGame(socket.data.gameId)
      const { result, winner } = resultOf(game.chess)
      await persistGame({ ...playersOf(game), result, winner }) // save before clients refetch
    } else {
      armClock(socket.data.gameId) // the opponent clock starts now
    }
    game.white.emit('state', state)
    game.black.emit('state', state)
  })

  socket.on('resign', async () => {
    const game = games.get(socket.data.gameId)
    if (!game) return
    const loser = socket.data.color
    const winner = loser === 'white' ? 'black' : 'white'
    endGame(socket.data.gameId)
    const status = `${cap(loser)} resigned — ${cap(winner)} wins`
    await persistGame({ ...playersOf(game), result: 'resign', winner }) // save before clients refetch
    game.white.emit('ended', { status })
    game.black.emit('ended', { status })
  })

  socket.on('disconnect', async () => {
    const queued = waiting.indexOf(socket)
    if (queued !== -1) waiting.splice(queued, 1)
    const game = games.get(socket.data.gameId)
    if (!game) return
    const other = game.white.id === socket.id ? game.black : game.white
    // Leaving an unfinished game = forfeit.
    const winner = game.white.id === socket.id ? 'black' : 'white'
    endGame(socket.data.gameId)
    await persistGame({ ...playersOf(game), result: 'abandon', winner }) // save before clients refetch
    other.emit('opponentLeft')
  })
})

initDb().catch((e) => console.error('DB init failed:', e.message))
httpServer.listen(PORT, () => console.log(`Chess server on :${PORT} (client ${CLIENT_ORIGIN})`))
