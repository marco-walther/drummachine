import { useEffect } from 'react'
import { engine } from '@/audio/engine'
import { TransportBar } from '@/components/TransportBar'
import { useTheme } from '@/hooks/use-theme'
import { SHORTCUTS, showPanel } from '@/workspace/layout'
import { addGlobalListener } from '@/workspace/windows'
import { Workspace } from '@/workspace/Workspace'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export default function App() {
  const [theme, setTheme] = useTheme()

  useEffect(() => {
    engine.init()
    // Registered on every window, so shortcuts also work inside popped-out panels.
    return addGlobalListener('keydown', (e) => {
      if (isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey) return
      if (e.code === 'Space') {
        e.preventDefault()
        engine.toggle()
      } else if (SHORTCUTS[e.key]) {
        e.preventDefault()
        showPanel(SHORTCUTS[e.key])
      }
    })
  }, [])

  return (
    <div className="flex h-full flex-col">
      <TransportBar theme={theme} setTheme={setTheme} />
      <main className="min-h-0 flex-1 bg-page">
        <Workspace />
      </main>
    </div>
  )
}
