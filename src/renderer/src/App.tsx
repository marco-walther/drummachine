import { Moon, Sun, SunMoon } from 'lucide-react'
import { Brackets } from '@/components/ui/brackets'
import { useTheme, type ThemeMode } from '@/hooks/use-theme'

const NEXT: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' }
const ICON = { auto: SunMoon, light: Sun, dark: Moon }

export default function App() {
  const [mode, setMode] = useTheme()
  const ThemeIcon = ICON[mode]

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-paper px-3">
        <span className="font-mono text-[11px] tracking-[0.14em] text-soft">DRUMMACHINE</span>
        <div className="flex-1" />
        <button
          className="grid size-7 place-items-center rounded-sm text-muted hover:bg-card hover:text-ink"
          onClick={() => setMode(NEXT[mode])}
          title={`Theme: ${mode}`}
        >
          <ThemeIcon size={15} />
        </button>
      </header>

      <main className="hatch grid flex-1 place-items-center p-6">
        <div className="bracket-frame reveal">
          <Brackets />
          <div className="border border-line bg-paper px-10 py-8 text-center shadow-ink">
            <p className="font-mono text-[11px] text-faint">PHASE 0</p>
            <p className="mt-1 text-soft">Workspace scaffold. The Channel Rack lands in Phase 1.</p>
          </div>
        </div>
      </main>
    </div>
  )
}
