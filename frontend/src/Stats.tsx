import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

type Me = { rating: number; wins: number; losses: number; draws: number }
type Game = {
  id: number
  white_id: string
  black_id: string
  winner: 'white' | 'black' | null
  result: string
  played_at: string
  white_rating_after: number
  black_rating_after: number
}

// refresh: bump this number to re-fetch (e.g. when a game ends).
export default function Stats({ refresh }: { refresh: number }) {
  const { getToken, userId } = useAuth()
  const [me, setMe] = useState<Me | null>(null)
  const [games, setGames] = useState<Game[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}` }
      const [m, g] = await Promise.all([
        fetch(`${SERVER_URL}/api/me`, { headers }).then((r) => r.json()),
        fetch(`${SERVER_URL}/api/games`, { headers }).then((r) => r.json()),
      ])
      if (cancelled) return
      setMe(m)
      setGames(Array.isArray(g) ? g : [])
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [getToken, refresh])

  if (!me) return null

  return (
    <div className="stats">
      <p className="rating">
        Rating {me.rating} · {me.wins}W {me.losses}L {me.draws}D
      </p>
      {games.length > 0 && (
        <ul className="history">
          {games.map((g) => {
            const iWasWhite = g.white_id === userId
            const outcome = g.winner === null ? 'Draw' : g.winner === (iWasWhite ? 'white' : 'black') ? 'Won' : 'Lost'
            const myRating = iWasWhite ? g.white_rating_after : g.black_rating_after
            return (
              <li key={g.id} className={`h-${outcome.toLowerCase()}`}>
                {outcome} · {g.result} → {myRating}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
