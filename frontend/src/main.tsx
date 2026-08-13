import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const root = createRoot(document.getElementById('root')!)

// No key yet → show setup instructions instead of a cryptic Clerk crash.
if (!PUBLISHABLE_KEY || PUBLISHABLE_KEY.includes('YOUR_KEY')) {
  root.render(
    <div className="setup-notice">
      <h1>♟ Almost there</h1>
      <p>
        Add your Clerk publishable key to <code>.env.local</code>:
      </p>
      <pre>VITE_CLERK_PUBLISHABLE_KEY=pk_test_...</pre>
      <p>
        Get it from{' '}
        <a href="https://dashboard.clerk.com" target="_blank" rel="noreferrer">
          dashboard.clerk.com
        </a>{' '}
        → your app → API Keys, then restart <code>npm run dev</code>.
      </p>
    </div>,
  )
} else {
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <App />
      </ClerkProvider>
    </StrictMode>,
  )
}
