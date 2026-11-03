import { useEffect } from 'react'
import { engine } from '@/audio/engine'
import { Brackets } from '@/components/ui/brackets'
import { TransportBar } from '@/components/TransportBar'
import { useTheme } from '@/hooks/use-theme'
import { ChannelRack } from '@/panels/ChannelRack'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export default function App() {
  const [theme, setTheme] = useTheme()

  useEffect(() => {
    engine.init()
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        e.preventDefault()
        engine.toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <TransportBar theme={theme} setTheme={setTheme} />
      {/* Phase 2 replaces this with the dockable workspace. */}
      <main className="hatch min-h-0 flex-1 p-6">
        <div className="bracket-frame reveal h-full max-h-[460px]" data-active="true">
          <Brackets />
          <div className="h-full overflow-hidden border border-line shadow-ink">
            <ChannelRack />
          </div>
        </div>
      </main>
    </div>
  )
}
