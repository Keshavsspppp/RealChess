import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Chess, type Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { io, type Socket } from 'socket.io-client'
import Stats from './Stats'
import PromotionPicker, { type Promo } from './PromotionPicker'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

type Phase = 'connecting' | 'waiting' | 'playing' | 'ended' | 'error'
type Pending = { from: Square; to: Square }

export default function OnlineGame() {
  const { getToken } = useAuth()
  const socketRef = useRef<Socket | null>(null)
  const gameRef = useRef(new Chess())

  const [phase, setPhase] = useState<Phase>('connecting')
  const [color, setColor] = useState<'white' | 'black'>('white')
  const [fen, setFen] = useState(gameRef.current.fen())
  const [status, setStatus] = useState('Connecting…')
  const [pending, setPending] = useState<Pending | null>(null) // awaiting promotion choice
  const [endCount, setEndCount] = useState(0) // bumps when a game finishes → refresh stats
  const [sessionId, setSessionId] = useState(0) // bump to reconnect for a new game

  useEffect(() => {
    let socket: Socket | undefined
    let cancelled = false

    ;(async () => {
      const token = await getToken()
      if (cancelled) return
      socket = io(SERVER_URL, { auth: { token } })
      socketRef.current = socket

      socket.on('connect_error', () => setPhase('error'))
      socket.on('waiting', () => { setPhase('waiting'); setStatus('Waiting for an opponent…') })
      socket.on('start', ({ color, fen, status }) => {
        gameRef.current.load(fen)
        setColor(color)
        setFen(fen)
        setStatus(status)
        setPhase('playing')
      })
      socket.on('state', ({ fen, status, over }) => {
        gameRef.current.load(fen)
        setFen(fen)
        setStatus(status)
        if (over) { setPhase('ended'); setEndCount((c) => c + 1) }
      })
      socket.on('rejected', ({ fen }) => {
        // Server refused our move. We had already applied it optimistically, so the
        // local board is the wrong one — reload the server's position, not ours.
        if (fen) gameRef.current.load(fen)
        setFen(gameRef.current.fen())
      })
      socket.on('ended', ({ status }) => {
        setPhase('ended')
        setStatus(status)
        setEndCount((c) => c + 1)
      })
      socket.on('opponentLeft', () => {
        setPhase('ended')
        setStatus('Opponent left — you win')
        setEndCount((c) => c + 1)
      })
    })()

    return () => {
      cancelled = true
      socket?.disconnect()
    }
  }, [getToken, sessionId])

  // Is moving from→to a pawn promotion that's actually legal right now?
  function isPromotion(from: Square, to: Square) {
    return gameRef.current
      .moves({ square: from, verbose: true })
      .some((m) => m.to === to && m.promotion)
  }

  function sendMove(from: Square, to: Square, promotion?: Promo) {
    gameRef.current.move({ from, to, promotion: promotion || 'q' })
    setFen(gameRef.current.fen())
    socketRef.current?.emit('move', { from, to, promotion })
  }

  function onPieceDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
    if (phase !== 'playing' || pending || !targetSquare) return false
    const from = sourceSquare as Square
    const to = targetSquare as Square
    if (gameRef.current.turn() !== (color === 'white' ? 'w' : 'b')) return false // not your turn

    if (isPromotion(from, to)) {
      setPending({ from, to }) // ask which piece before committing
      return false // snap back; the picker will apply the move
    }
    try {
      sendMove(from, to)
    } catch {
      return false // illegal — snap back
    }
    return true
  }

  function choosePromotion(piece: Promo) {
    if (!pending) return
    setPending(null)
    if (phase !== 'playing') return // game ended while the picker was open — drop the move
    try {
      sendMove(pending.from, pending.to, piece)
    } catch {
      setFen(gameRef.current.fen()) // shouldn't happen (legality pre-checked); re-sync if it does
    }
  }

  function resign() {
    if (window.confirm('Resign this game?')) socketRef.current?.emit('resign')
  }

  function newOpponent() {
    gameRef.current.reset()
    setFen(gameRef.current.fen())
    setPending(null)
    setStatus('Connecting…')
    setPhase('connecting')
    setSessionId((s) => s + 1) // re-runs the effect → new socket → re-queued
  }

  return (
    <div className="game">
      <div className="board">
        <Chessboard
          options={{
            id: 'online-board',
            position: fen,
            boardOrientation: color,
            onPieceDrop,
            allowDragging: phase === 'playing' && !pending,
            darkSquareStyle: { backgroundColor: '#779556' },
            lightSquareStyle: { backgroundColor: '#ebecd0' },
          }}
        />
        {pending && <PromotionPicker color={color} onPick={choosePromotion} />}
      </div>
      <div className="panel">
        <p className="status">{status}</p>
        {phase === 'playing' && <p className="muted">You are {color}</p>}
        {phase === 'playing' && <button className="btn" onClick={resign}>Resign</button>}
        {(phase === 'ended' || phase === 'error') && (
          <button className="btn btn-primary" onClick={newOpponent}>Find new opponent</button>
        )}
        {phase === 'error' && <p className="muted">Can't reach the server. Is it running on {SERVER_URL}?</p>}
        <Stats refresh={endCount} />
      </div>
    </div>
  )
}
