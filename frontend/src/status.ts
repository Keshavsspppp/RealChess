import type { Chess } from 'chess.js'

// Shared by the local and bot boards, and mirrors the server's stateOf() wording.
// Order matters: chess.js isDraw() is also true for stalemate, so stalemate must be
// tested first or its branch is unreachable.
export function statusOf(game: Chess): string {
  const turn = game.turn() === 'w' ? 'White' : 'Black'
  if (game.isCheckmate()) return `Checkmate — ${turn === 'White' ? 'Black' : 'White'} wins`
  if (game.isStalemate()) return 'Stalemate — draw'
  if (game.isDraw()) return 'Draw'
  return `${turn} to move${game.inCheck() ? ' — check!' : ''}`
}

// Clock readout as m:ss. Ceil so a clock one millisecond into its first tick still
// reads its full starting time rather than jumping a second the instant play begins.
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
