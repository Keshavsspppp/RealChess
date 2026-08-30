import type { CSSProperties } from 'react'

const LAST_MOVE: CSSProperties = { background: 'rgba(255, 255, 0, 0.35)' }

export type LastMove = { from: string; to: string } | null | undefined

// Tints the squares a move came from and landed on. Without this you cannot tell
// what the opponent (or the engine) just played — the board simply changes.
export function lastMoveStyles(move: LastMove): Record<string, CSSProperties> {
  return move ? { [move.from]: LAST_MOVE, [move.to]: LAST_MOVE } : {}
}
