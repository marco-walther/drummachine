import { useState } from 'react'
import { ChevronDown, Moon, Play, Square, Sun, SunMoon } from 'lucide-react'
import { engine } from '@/audio/engine'
import { DragNumber } from '@/components/DragNumber'
import { Knob } from '@/components/Knob'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { ThemeMode } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'
import { selectCurrentPattern, useProject } from '@/state/project'
import { useTransportUi } from '@/state/transport-ui'

const NEXT_THEME: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' }
const THEME_ICON = { auto: SunMoon, light: Sun, dark: Moon }

export function TransportBar({ theme, setTheme }: { theme: ThemeMode; setTheme(m: ThemeMode): void }) {
  const playing = useTransportUi((s) => s.playing)
  const bpm = useProject((s) => s.bpm)
  const setBpm = useProject((s) => s.setBpm)
  const masterVolume = useProject((s) => s.masterVolume)
  const setMasterVolume = useProject((s) => s.setMasterVolume)
  const ThemeIcon = THEME_ICON[theme]

  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-line bg-paper px-3">
      <span className="font-mono text-[11px] tracking-[0.14em] text-soft">DRUMMACHINE</span>

      <div className="flex items-center gap-1">
        <button
          aria-label={playing ? 'Stop' : 'Play'}
          title="Play / Stop (Space)"
          onClick={() => engine.toggle()}
          className={cn(
            'grid size-7 place-items-center rounded-sm border transition-colors',
            playing ? 'border-inv bg-inv text-inv-ink' : 'border-line-strong text-ink hover:border-ink'
          )}
        >
          {playing ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        </button>
      </div>

      <label className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted">BPM</span>
        <DragNumber label="Tempo" value={bpm} min={20} max={400} step={0.5} decimals={1} onChange={setBpm} className="w-14" />
      </label>

      <PatternMenu />

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted">Master</span>
        <Knob
          label="Master volume"
          size={24}
          value={masterVolume}
          defaultValue={0.8}
          onChange={setMasterVolume}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </div>

      <button
        className="grid size-7 place-items-center rounded-sm text-muted hover:bg-card hover:text-ink"
        onClick={() => setTheme(NEXT_THEME[theme])}
        title={`Theme: ${theme}`}
        aria-label={`Theme: ${theme}`}
      >
        <ThemeIcon size={15} />
      </button>
    </header>
  )
}

function PatternMenu() {
  const patterns = useProject((s) => s.patterns)
  const current = useProject(selectCurrentPattern)
  const { selectPattern, addPattern, clonePattern, renamePattern, deletePattern } = useProject.getState()
  const [renaming, setRenaming] = useState(false)

  if (renaming) {
    return (
      <input
        autoFocus
        aria-label="Pattern name"
        defaultValue={current.name}
        className="h-7 w-40 rounded-sm border border-ink bg-raise px-2 text-[12px] outline-none"
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          renamePattern(current.id, e.currentTarget.value)
          setRenaming(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setRenaming(false)
        }}
      />
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-7 w-40 items-center justify-between gap-2 rounded-sm border border-line bg-raise px-2 text-[12px] text-ink hover:border-line-strong"
          onDoubleClick={() => setRenaming(true)}
          title="Pattern (double-click to rename)"
        >
          <span className="truncate">{current.name}</span>
          <ChevronDown size={13} className="text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {patterns.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={() => selectPattern(p.id)}
            className={cn(p.id === current.id && 'font-medium text-ink')}
          >
            <span className={cn('size-1.5 rounded-full', p.id === current.id ? 'bg-ink' : 'bg-transparent')} />
            {p.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => addPattern()}>New pattern</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => clonePattern(current.id)}>Clone pattern</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTimeout(() => setRenaming(true), 0)}>Rename…</DropdownMenuItem>
        <DropdownMenuItem disabled={patterns.length <= 1} onSelect={() => deletePattern(current.id)}>
          Delete pattern
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
