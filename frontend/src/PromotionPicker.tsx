export type Promo = 'q' | 'r' | 'b' | 'n'

const PIECES: Promo[] = ['q', 'r', 'b', 'n']
const SYMBOL: Record<'white' | 'black', Record<Promo, string>> = {
  white: { q: '♕', r: '♖', b: '♗', n: '♘' },
  black: { q: '♛', r: '♜', b: '♝', n: '♞' },
}

// Overlay shown on the board when a pawn reaches the last rank.
export default function PromotionPicker({
  color,
  onPick,
}: {
  color: 'white' | 'black'
  onPick: (piece: Promo) => void
}) {
  return (
    <div className="promo">
      <p>Promote to:</p>
      <div className="promo-row">
        {PIECES.map((p) => (
          <button key={p} className="promo-btn" onClick={() => onPick(p)} aria-label={p}>
            {SYMBOL[color][p]}
          </button>
        ))}
      </div>
    </div>
  )
}
