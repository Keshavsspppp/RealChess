// Thin wrapper around Stockfish (lite single-threaded WASM) running in a Web Worker.
// Engine files are vendored in public/engine/ (from the `stockfish` npm package, v18 lite-single).
const ENGINE_URL = '/engine/stockfish-18-lite-single.js'

export type Difficulty = { skill: number; movetime: number } // skill 0-20, think time ms

export type Engine = {
  bestMove: (fen: string, diff: Difficulty) => Promise<string | null>
  quit: () => void
}

export function createEngine(): Engine {
  const worker = new Worker(ENGINE_URL)
  let onBest: ((move: string | null) => void) | null = null

  worker.onmessage = (e: MessageEvent) => {
    const line: string = typeof e.data === 'string' ? e.data : (e.data?.data ?? '')
    if (line.startsWith('bestmove')) {
      const move = line.split(' ')[1]
      const cb = onBest
      onBest = null
      cb?.(move && move !== '(none)' ? move : null)
    }
  }

  worker.postMessage('uci')
  worker.postMessage('isready')

  return {
    bestMove(fen, { skill, movetime }) {
      return new Promise((resolve) => {
        onBest = resolve
        worker.postMessage(`setoption name Skill Level value ${skill}`)
        worker.postMessage(`position fen ${fen}`)
        worker.postMessage(`go movetime ${movetime}`)
      })
    },
    quit() {
      worker.postMessage('quit')
      worker.terminate()
    },
  }
}
