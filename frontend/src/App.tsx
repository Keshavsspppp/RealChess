import { useState } from 'react'
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'
import ChessGame from './ChessGame'
import OnlineGame from './OnlineGame'
import BotGame from './BotGame'
import './App.css'

type Mode = 'local' | 'bot' | 'online'

function App() {
  const [mode, setMode] = useState<Mode>('local')

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">♟ Chess</span>
        <SignedIn>
          <nav className="modes">
            {([['local', 'Local'], ['bot', 'Play computer'], ['online', 'Play online']] as const).map(
              ([m, label]) => (
                <button
                  key={m}
                  className={`btn ${mode === m ? 'btn-active' : ''}`}
                  onClick={() => setMode(m)}
                >
                  {label}
                </button>
              ),
            )}
          </nav>
        </SignedIn>
        <div className="auth">
          <SignedIn>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="btn">Sign in</button>
            </SignInButton>
          </SignedOut>
        </div>
      </header>

      <main className="content">
        <SignedIn>
          {mode === 'local' && <ChessGame />}
          {mode === 'bot' && <BotGame key="bot" />}
          {mode === 'online' && <OnlineGame key="online" />}
        </SignedIn>
        <SignedOut>
          <div className="gate">
            <h1>Play chess</h1>
            <p>Sign in to start a game.</p>
            <SignInButton mode="modal">
              <button className="btn btn-primary">Sign in to play</button>
            </SignInButton>
          </div>
        </SignedOut>
      </main>
    </div>
  )
}

export default App
