import { useRef, useState, type CSSProperties } from 'react'
import { Chess, type Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import PromotionPicker, { type Promo } from './PromotionPicker'
import MoveList from './MoveList'
import { statusOf } from './status'
import { lastMoveStyles, type LastMove } from './boardStyles'

const HIGHLIGHT: CSSProperties = { background: 'rgba(255, 255, 0, 0.4)' }

export default function ChessGame() {
  const gameRef = useRef(new Chess())
  const game = gameRef.current
  const [fen, setFen] = useState(game.fen())
  const [moveFrom, setMoveFrom] = useState<Square | ''>('')
  const [optionSquares, setOptionSquares] = useState<Record<string, CSSProperties>>({})
  const [pending, setPending] = useState<{ from: Square; to: Square } | null>(null) // awaiting promotion choice
  const [lastMove, setLastMove] = useState<LastMove>(null)
  const [moves, setMoves] = useState<string[]>([])

  function applyMove(from: Square, to: Square, promotion?: Promo): boolean {
    let applied
    try {
      applied = game.move({ from, to, promotion: promotion || 'q' })
    } catch {
      return false // illegal move
    }
    // Take from/to and SAN off the returned move rather than re-deriving history() each render.
    setLastMove({ from: applied.from, to: applied.to })
    setMoves((m) => [...m, applied.san])
    setFen(game.fen())
    setMoveFrom('')
    setOptionSquares({})
    setPending(null)
    return true
  }

  // Is from→to a legal pawn promotion right now?
  function isPromotion(from: Square, to: Square): boolean {
    return game.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion)
  }

  // Dots on squares this piece can legally move to. Returns false if none.
  function showMoveOptions(square: Square): boolean {
    const moves = game.moves({ square, verbose: true })
    if (moves.length === 0) return false

    const styles: Record<string, CSSProperties> = {}
    for (const m of moves) {
      const isCapture = game.get(m.to)
      styles[m.to] = {
        background: isCapture
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
    const sq = square as Square
    if (!moveFrom) {
      if (showMoveOptions(sq)) setMoveFrom(sq)
      return
    }
    if (isPromotion(moveFrom, sq)) {
      setPending({ from: moveFrom, to: sq }) // ask which piece before committing
      setMoveFrom('')
      setOptionSquares({})
      return
    }
    // Second click: try the move; if it fails, treat click as picking a new piece.
    if (!applyMove(moveFrom, sq)) {
      if (showMoveOptions(sq)) setMoveFrom(sq)
      else {
        setMoveFrom('')
        setOptionSquares({})
      }
    }
  }

  function onPieceDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
    if (!targetSquare) return false
    const from = sourceSquare as Square
    const to = targetSquare as Square
    if (isPromotion(from, to)) {
      setPending({ from, to })
      return false // snap back; the picker will apply the move
    }
    return applyMove(from, to)
  }

  function choosePromotion(piece: Promo) {
    if (!pending) return
    if (!applyMove(pending.from, pending.to, piece)) setPending(null)
  }

  function reset() {
    game.reset()
    setFen(game.fen())
    setMoveFrom('')
    setOptionSquares({})
    setPending(null)
    setLastMove(null)
    setMoves([])
  }

  const turn = game.turn() === 'w' ? 'White' : 'Black'
  const status = statusOf(game)

  return (
    <div className="game">
      <div className="board">
        <Chessboard
          options={{
            id: 'main-board',
            position: fen,
            onPieceDrop,
            onSquareClick,
            // selection dots sit on top of the last-move tint
            squareStyles: { ...lastMoveStyles(lastMove), ...optionSquares },
            allowDragging: !pending,
            darkSquareStyle: { backgroundColor: '#779556' },
            lightSquareStyle: { backgroundColor: '#ebecd0' },
          }}
        />
        {pending && <PromotionPicker color={turn === 'White' ? 'white' : 'black'} onPick={choosePromotion} />}
      </div>
      <div className="panel">
        <p className="status">{status}</p>
        <button className="btn" onClick={reset}>New game</button>
        <MoveList moves={moves} />
      </div>
    </div>
  )
}
