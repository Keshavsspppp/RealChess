import { useEffect, useRef } from 'react'

// SAN moves in play order, rendered as numbered pairs the way a scoresheet reads.
export default function MoveList({ moves }: { moves: string[] }) {
  const boxRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const box = boxRef.current
    if (box) box.scrollTop = box.scrollHeight // a long game must still show the latest move
  }, [moves.length])

  if (moves.length === 0) return null

  return (
    <ol className="moves" ref={boxRef}>
      {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => (
        <li key={i}>
          <span>{moves[i * 2]}</span>
          <span>{moves[i * 2 + 1] ?? ''}</span>
        </li>
      ))}
    </ol>
  )
}
