import pg from 'pg'

const { Pool } = pg
const DATABASE_URL = process.env.DATABASE_URL

// No DB configured → pool is null and every function below no-ops gracefully,
// so multiplayer still works; only saving/ratings are off.
export const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
    })
  : null

export async function initDb() {
  if (!pool) {
    console.warn('No DATABASE_URL set — games and ratings will NOT be saved.')
    return
  }
  // ponytail: CREATE IF NOT EXISTS on boot instead of a migration tool. Two tables don't need one.
  await pool.query(`
    create table if not exists players (
      user_id text primary key,
      rating  integer not null default 1200,
      wins    integer not null default 0,
      losses  integer not null default 0,
      draws   integer not null default 0
    );
    create table if not exists games (
      id serial primary key,
      white_id text not null,
      black_id text not null,
      winner   text,
      result   text not null,
      pgn      text not null,
      white_rating_after integer not null,
      black_rating_after integer not null,
      played_at timestamptz not null default now()
    );
  `)
  console.log('DB ready — persistence on.')
}

// Elo, K=32. sa = white's score (1 win / 0.5 draw / 0 loss). Returns [newWhite, newBlack].
// ponytail: fixed K; taper by games-played if pairing quality ever matters.
export function elo(ra, rb, sa, k = 32) {
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400))
  const na = Math.round(ra + k * (sa - ea))
  const nb = Math.round(rb + k * (1 - sa - (1 - ea)))
  return [na, nb]
}

export async function persistGame({ whiteId, blackId, pgn, result, winner }) {
  if (!pool) return
  const sa = winner === 'white' ? 1 : winner === 'black' ? 0 : 0.5
  let client
  try {
    client = await pool.connect() // inside the try: a dead pool must not reject into the caller
    await client.query('begin')
    const ra = await currentRating(client, whiteId)
    const rb = await currentRating(client, blackId)
    const [na, nb] = elo(ra, rb, sa)
    await bump(client, whiteId, na, sa)
    await bump(client, blackId, nb, 1 - sa)
    await client.query(
      `insert into games (white_id, black_id, winner, result, pgn, white_rating_after, black_rating_after)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [whiteId, blackId, winner, result, pgn, na, nb],
    )
    await client.query('commit')
  } catch (e) {
    await client?.query('rollback').catch(() => {}) // rollback can itself fail; don't mask the real error
    console.error('persist failed:', e.message)
  } finally {
    client?.release()
  }
}

async function currentRating(client, userId) {
  const r = await client.query('select rating from players where user_id = $1', [userId])
  if (r.rows[0]) return r.rows[0].rating
  await client.query('insert into players (user_id) values ($1) on conflict do nothing', [userId])
  return 1200
}

async function bump(client, userId, newRating, score) {
  const w = score === 1 ? 1 : 0
  const l = score === 0 ? 1 : 0
  const d = score === 0.5 ? 1 : 0
  await client.query(
    'update players set rating = $2, wins = wins + $3, losses = losses + $4, draws = draws + $5 where user_id = $1',
    [userId, newRating, w, l, d],
  )
}

export async function getMe(userId) {
  if (!pool) return { rating: 1200, wins: 0, losses: 0, draws: 0 }
  const r = await pool.query('select rating, wins, losses, draws from players where user_id = $1', [userId])
  return r.rows[0] || { rating: 1200, wins: 0, losses: 0, draws: 0 }
}

export async function getGames(userId) {
  if (!pool) return []
  const r = await pool.query(
    `select id, white_id, black_id, winner, result, played_at, white_rating_after, black_rating_after
     from games where white_id = $1 or black_id = $1 order by played_at desc limit 20`,
    [userId],
  )
  return r.rows
}
