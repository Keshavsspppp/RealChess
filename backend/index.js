import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { Chess } from 'chess.js'
import { verifyToken } from '@clerk/backend'
import { initDb, persistGame, getMe, getGames } from './db.js'

const PORT = process.env.PORT || 3001
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
const SECRET_KEY = process.env.CLERK_SECRET_KEY

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
const games = new Map() // gameId -> { chess, white, black }
let nextGameId = 1

// Oldest queued socket that is still connected and belongs to a different account.
// Two tabs of one account must never be paired: persistGame would then read and
// write the same players row twice in one transaction and corrupt that rating.
function takeOpponent(socket) {
  const i = waiting.findIndex((s) => s.connected && s.data.userId !== socket.data.userId)
  return i === -1 ? null : waiting.splice(i, 1)[0]
}

// ponytail: server owns the real game; every move re-validated here. Never trust the client.
function stateOf(chess) {
  const turn = chess.turn() === 'w' ? 'white' : 'black'
  let status
  if (chess.isCheckmate()) status = `Checkmate — ${turn === 'white' ? 'Black' : 'White'} wins`
  else if (chess.isStalemate()) status = 'Stalemate — draw'
  else if (chess.isDraw()) status = 'Draw'
  else status = `${turn[0].toUpperCase() + turn.slice(1)} to move${chess.inCheck() ? ' — check!' : ''}`
  return { fen: chess.fen(), turn, status, over: chess.isGameOver() }
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
    const chess = new Chess()
    games.set(gameId, { chess, white, black })

    for (const [s, color] of [[white, 'white'], [black, 'black']]) {
      s.data.gameId = gameId
      s.data.color = color
      s.emit('start', { gameId, color, ...stateOf(chess) })
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
    try {
      // chess.js rejects a bad promotion letter; default to queen when none sent.
      game.chess.move({ from, to, promotion: promotion || 'q' })
    } catch {
      return socket.emit('rejected', { fen: game.chess.fen() }) // illegal move
    }
    const state = stateOf(game.chess)
    if (state.over) {
      games.delete(socket.data.gameId)
      const { result, winner } = resultOf(game.chess)
      await persistGame({ ...playersOf(game), result, winner }) // save before clients refetch
    }
    game.white.emit('state', state)
    game.black.emit('state', state)
  })

  socket.on('resign', async () => {
    const game = games.get(socket.data.gameId)
    if (!game) return
    const loser = socket.data.color
    const winner = loser === 'white' ? 'black' : 'white'
    games.delete(socket.data.gameId)
    const status = `${loser[0].toUpperCase() + loser.slice(1)} resigned — ${winner === 'white' ? 'White' : 'Black'} wins`
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
    games.delete(socket.data.gameId)
    await persistGame({ ...playersOf(game), result: 'abandon', winner }) // save before clients refetch
    other.emit('opponentLeft')
  })
})

initDb().catch((e) => console.error('DB init failed:', e.message))
httpServer.listen(PORT, () => console.log(`Chess server on :${PORT} (client ${CLIENT_ORIGIN})`))
