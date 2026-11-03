import { useState } from 'react'
import {
  ChevronDown,
  Circle,
  Keyboard,
  LayoutPanelTop,
  Moon,
  Play,
  RotateCcw,
  Square,
  Sun,
  SunMoon
} from 'lucide-react'
import { useTypingKeyboard } from '@/input/keyboard'
import { engine } from '@/audio/engine'
import { DragNumber } from '@/components/DragNumber'
import { FileMenu, ProjectName } from '@/components/FileMenu'
import { Knob } from '@/components/Knob'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { ThemeMode } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'
import { selectCurrentPattern, useProject } from '@/state/project'
import { useTransportUi } from '@/state/transport-ui'
import { PANELS, resetLayout, showPanel, type PanelId } from '@/workspace/layout'
import { startFromScratch } from '@/workspace/reset'

const NEXT_THEME: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' }
const THEME_ICON = { auto: SunMoon, light: Sun, dark: Moon }

export function TransportBar({ theme, setTheme }: { theme: ThemeMode; setTheme(m: ThemeMode): void }) {
  const playing = useTransportUi((s) => s.playing)
  const recording = useTransportUi((s) => s.recording)
  const typing = useTypingKeyboard((s) => s.enabled)
  const bpm = useProject((s) => s.bpm)
  const setBpm = useProject((s) => s.setBpm)
  const masterVolume = useProject((s) => s.masterVolume)
  const setMasterVolume = useProject((s) => s.setMasterVolume)
  const ThemeIcon = THEME_ICON[theme]

  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-line bg-paper px-3">
      <span className="font-mono text-[11px] tracking-[0.14em] text-soft">DRUMMACHINE</span>
      <FileMenu className={barButton} />

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
        <button
          aria-label={recording ? 'Stop recording' : 'Record notes you play'}
          aria-pressed={recording}
          title="Record: notes you play (keyboard / MIDI) while playing are written into the pattern"
          onClick={() => useTransportUi.setState({ recording: !recording })}
          className={cn(
            'grid size-7 place-items-center rounded-sm border transition-colors',
            recording ? 'border-inv bg-inv text-inv-ink' : 'border-line-strong text-ink hover:border-ink'
          )}
        >
          <Circle size={11} fill={recording ? 'currentColor' : 'none'} strokeWidth={2.4} />
        </button>
        <button
          aria-label="Typing keyboard plays notes"
          aria-pressed={typing}
          title={`Typing keyboard plays notes (piano layout: A–' white keys, W E T Y U O P ] black keys, Z/X octave): ${typing ? 'on' : 'off'}`}
          onClick={() => useTypingKeyboard.setState({ enabled: !typing })}
          className={cn(
            'grid size-7 place-items-center rounded-sm border transition-colors',
            typing ? 'border-line-strong text-ink hover:border-ink' : 'border-line text-faint hover:text-muted'
          )}
        >
          <Keyboard size={14} />
        </button>
      </div>

      <label className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted">BPM</span>
        <DragNumber label="Tempo" value={bpm} min={20} max={400} step={0.5} decimals={1} onChange={setBpm} className="w-14" />
      </label>

      <PatternMenu />

      <div className="flex-1" />
      <ProjectName />
      <div className="flex-1" />

      <ViewMenu />
      <ResetMenu />

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

const barButton =
  'flex h-7 items-center gap-1.5 rounded-sm px-2 text-[12px] text-muted hover:bg-card hover:text-ink data-[state=open]:bg-card data-[state=open]:text-ink'

function ViewMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={barButton} title="Show panels">
          <LayoutPanelTop size={14} /> View
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {(Object.keys(PANELS) as PanelId[]).map((id) => (
          <DropdownMenuItem key={id} onSelect={() => showPanel(id)}>
            {PANELS[id].title}
            <DropdownMenuShortcut>{PANELS[id].shortcut}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Full reset: layout only, or everything (with confirmation; there is no undo yet). */
function ResetMenu() {
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={barButton} title="Reset">
            <RotateCcw size={14} /> Reset
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-[11px] font-normal text-muted">Start over</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => resetLayout()}>
            <div>
              <div>Reset layout</div>
              <div className="text-[11px] text-muted">Default panels, close popouts. Keeps your beat.</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setTimeout(() => setConfirming(true), 0)}>
            <div>
              <div>Start from scratch…</div>
              <div className="text-[11px] text-muted">New empty project and default layout.</div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start from scratch?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears every pattern, channel and setting, and resets the layout. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => startFromScratch()}>Clear everything</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
