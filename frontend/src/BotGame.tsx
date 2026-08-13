import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Chess, type Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import PromotionPicker, { type Promo } from './PromotionPicker'
import { createEngine, type Engine, type Difficulty } from './engine'

const HIGHLIGHT: CSSProperties = { background: 'rgba(255, 255, 0, 0.4)' }

const LEVELS: Record<string, Difficulty> = {
  Easy: { skill: 2, movetime: 300 },
  Medium: { skill: 8, movetime: 600 },
  Hard: { skill: 18, movetime: 1000 },
}

export default function BotGame() {
  const gameRef = useRef(new Chess())
  const game = gameRef.current
  const engineRef = useRef<Engine | null>(null)

  const [fen, setFen] = useState(game.fen())
  const [moveFrom, setMoveFrom] = useState<Square | ''>('')
  const [optionSquares, setOptionSquares] = useState<Record<string, CSSProperties>>({})
  const [pending, setPending] = useState<{ from: Square; to: Square } | null>(null)
  const [thinking, setThinking] = useState(false)
  const [color, setColor] = useState<'white' | 'black'>('white')
  const [level, setLevel] = useState<keyof typeof LEVELS>('Medium')

  // Spin up the engine once.
  useEffect(() => {
    const engine = createEngine()
    engineRef.current = engine
    return () => {
      engine.quit()
      engineRef.current = null
    }
  }, [])

  // When it's the engine's turn, ask it for a move.
  useEffect(() => {
    const g = gameRef.current
    if (g.isGameOver()) return
    const humanTurn = g.turn() === (color === 'white' ? 'w' : 'b')
    if (humanTurn || !engineRef.current) return

    let cancelled = false
    setThinking(true)
    engineRef.current.bestMove(g.fen(), LEVELS[level]).then((uci) => {
      if (cancelled) return
      if (uci) {
        try {
          g.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: (uci[4] as Promo) || undefined })
          setFen(g.fen())
        } catch { /* engine move should always be legal; ignore if not */ }
      }
      setThinking(false)
    })
    return () => { cancelled = true }
  }, [fen, color, level])

  function humanTurn() {
    return !thinking && !game.isGameOver() && game.turn() === (color === 'white' ? 'w' : 'b')
  }

  function applyMove(from: Square, to: Square, promotion?: Promo): boolean {
    try {
      game.move({ from, to, promotion: promotion || 'q' })
    } catch {
      return false
    }
    setFen(game.fen())
    setMoveFrom('')
    setOptionSquares({})
    setPending(null)
    return true
  }

  function isPromotion(from: Square, to: Square): boolean {
    return game.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion)
  }

  function showMoveOptions(square: Square): boolean {
    const moves = game.moves({ square, verbose: true })
    if (moves.length === 0) return false
    const styles: Record<string, CSSProperties> = {}
    for (const m of moves) {
      styles[m.to] = {
        background: game.get(m.to)
          ? 'radial-gradient(circle, transparent 55%, rgba(0,0,0,.2) 56%)'
          : 'radial-gradient(circle, rgba(0,0,0,.2) 22%, transparent 24%)',
        borderRadius: '50%',
      }
    }
    styles[square] = HIGHLIGHT
    setOptionSquares(styles)
    return true
  }

  function onSquareClick({ square }: { square: string }) {
    if (!humanTurn()) return
    const sq = square as Square
    if (!moveFrom) {
      if (showMoveOptions(sq)) setMoveFrom(sq)
      return
    }
    if (isPromotion(moveFrom, sq)) {
      setPending({ from: moveFrom, to: sq })
      setMoveFrom('')
      setOptionSquares({})
      return
    }
    if (!applyMove(moveFrom, sq)) {
      if (showMoveOptions(sq)) setMoveFrom(sq)
      else {
        setMoveFrom('')
        setOptionSquares({})
      }
    }
  }

  function onPieceDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
    if (!humanTurn() || !targetSquare) return false
    const from = sourceSquare as Square
    const to = targetSquare as Square
    if (isPromotion(from, to)) {
      setPending({ from, to })
      return false
    }
    return applyMove(from, to)
  }

  function choosePromotion(piece: Promo) {
    if (pending) applyMove(pending.from, pending.to, piece)
    setPending(null)
  }

  function newGame(nextColor: 'white' | 'black' = color) {
    game.reset()
    setFen(game.fen())
    setMoveFrom('')
    setOptionSquares({})
    setPending(null)
    setThinking(false)
    setColor(nextColor) // fen change + color triggers the engine effect (opens if you're black)
  }

  const turn = game.turn() === 'w' ? 'White' : 'Black'
  let status: string
  if (game.isCheckmate()) status = `Checkmate — ${turn === 'White' ? 'Black' : 'White'} wins`
  else if (game.isDraw()) status = 'Draw'
  else if (game.isStalemate()) status = 'Stalemate'
  else if (thinking) status = 'Computer is thinking…'
  else status = `${turn} to move${game.inCheck() ? ' — check!' : ''}`

  return (
    <div className="game">
      <div className="board">
        <Chessboard
          options={{
            id: 'bot-board',
            position: fen,
            boardOrientation: color,
            onPieceDrop,
            onSquareClick,
            squareStyles: optionSquares,
            allowDragging: humanTurn() && !pending,
            darkSquareStyle: { backgroundColor: '#779556' },
            lightSquareStyle: { backgroundColor: '#ebecd0' },
          }}
        />
        {pending && <PromotionPicker color={color} onPick={choosePromotion} />}
      </div>
      <div className="panel">
        <p className="status">{status}</p>

        <label className="field">
          Difficulty
          <select value={level} onChange={(e) => setLevel(e.target.value as keyof typeof LEVELS)}>
            {Object.keys(LEVELS).map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>

        <label className="field">
          Play as
          <select value={color} onChange={(e) => newGame(e.target.value as 'white' | 'black')}>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </label>

        <button className="btn" onClick={() => newGame()}>New game</button>
      </div>
    </div>
  )
}
