import { useEffect, useState } from 'react'
import { formatClock } from './status'

// `ms` is the server's authoritative reading, resent with every state update — this
// only counts down between them, so local drift is corrected on the next move.
// The server owns the actual flag; this is display.
export default function Clock({
  ms,
  label,
  active,
  running,
}: {
  ms: number
  label: string
  active: boolean
  running: boolean
}) {
  const [left, setLeft] = useState(ms)

  // Re-sync only on a new server reading. Deliberately NOT tied to `running`: when a
  // game ends the clock must freeze where it ticked to, not jump back up to the last
  // value the server sent (which is seconds stale for whoever just flagged).
  useEffect(() => setLeft(ms), [ms])

  useEffect(() => {
    if (!active || !running) return
    // Measure against wall-clock rather than accumulating ticks, so a throttled
    // background tab cannot make the clock read high.
    const from = Date.now()
    const id = setInterval(() => setLeft(Math.max(0, ms - (Date.now() - from))), 200)
    return () => clearInterval(id)
  }, [ms, active, running])

  const ticking = active && running
  return (
    <div className={`clock${ticking ? ' clock-active' : ''}${left <= 30_000 ? ' clock-low' : ''}`}>
      <span className="clock-label">{label}</span>
      <span className="clock-time">{formatClock(left)}</span>
    </div>
  )
}
