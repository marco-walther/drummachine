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
    import('./workspace/windows'),
    import('./workspace/project-actions'),
    import('./state/file'),
    import('./state/library'),
    import('./audio/samples'),
    import('./state/toasts'),
    import('./input/keyboard'),
    import('./audio/engine'),
    import('./audio/pitch'),
    import('./state/project'),
    import('./audio/voices')
  ]).then(
    ([Tone, { engine }, { useProject }, { useTransportUi }, layout, windows, actions, file, library, samples, toasts, keyboard, engineModule, pitch, project, voices]) => {
      Object.assign(window, {
        __dm: { Tone, engine, useProject, useTransportUi, layout, windows, actions, file, library, samples, toasts, keyboard, engineModule, pitch, project, voices }
      })
    }
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
