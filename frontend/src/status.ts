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
