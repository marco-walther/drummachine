import './styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

if (import.meta.env.DEV) {
  // Dev-only handle for debugging/verification from DevTools or CDP.
  void Promise.all([
    import('tone'),
    import('./audio/engine'),
    import('./state/project'),
    import('./state/transport-ui'),
    import('./workspace/layout'),
    import('./workspace/windows')
  ]).then(([Tone, { engine }, { useProject }, { useTransportUi }, layout, windows]) => {
    Object.assign(window, { __dm: { Tone, engine, useProject, useTransportUi, layout, windows } })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
