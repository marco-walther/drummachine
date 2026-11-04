import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Ghost, MousePointer2, Pencil, TrendingUp, Wand2, ZoomIn, ZoomOut } from 'lucide-react'
import { RecordToggle } from '@/components/RecordToggle'
import { engine, useHeldKeys } from '@/audio/engine'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { noteName } from '@/input/notes'
import { cn } from '@/lib/utils'
import { arpeggiate, chop, CHORDS, legato, quantize, stampChord, strum, transpose } from '@/music/noteTools'
import { SourceIcon } from '@/panels/ChannelSettings'
import { beginGesture, endGesture } from '@/state/history'
import { makeNote, selectCurrentPattern, useProject } from '@/state/project'
import { useTransportUi } from '@/state/transport-ui'
import { STEP_TICKS, type Channel, type Note } from '@/state/types'
import { addGlobalListener } from '@/workspace/windows'
import {
  BAR_TICKS,
  hitNote,
  KEY_H,
  KEYS_W,
  keyToY,
  LANE_H,
  moveNotes,
  notesInBox,
  resizeNotes,
  RULER_H,
  SNAPS,
  snapFloor,
  yToKey
} from './geometry'
import { LANES, usePianoRollUi, type Lane } from './ui-state'

const BLACK = new Set([1, 3, 6, 8, 10])

/** Keep receiving moves outside the element while dragging (no-op if the pointer is gone). */
function capture(e: React.PointerEvent) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch {
    /* pointer no longer active */
  }
}
const EMPTY: Note[] = []

/**
 * Piano Roll for the selected channel in the current pattern. Same notes as the
 * step sequencer. Draw tool: click empty = new note (drag sets length), drag a
 * note = move, drag its right edge = resize, right-click/drag = delete,
 * Ctrl+drag = box select. Keys: Delete, Ctrl+A, arrows (Shift = octave / bar).
 */
export function PianoRoll() {
  const channel = useProject((s) => s.channels.find((c) => c.id === s.selectedChannelId) ?? null)
  if (!channel) {
    return (
      <div className="hatch grid h-full place-items-center p-6 text-center text-[12px] text-muted">
        Select a channel in the Channel Rack to edit its notes.
      </div>
    )
  }
  return <Editor channel={channel} />
}

function useChannelNotes(channelId: string) {
  return useProject((s) => selectCurrentPattern(s).notes[channelId] ?? EMPTY)
}

/** Apply a tool to the selection (or every note when nothing is selected). */
function applyTool(channelId: string, fn: (target: Note[]) => Note[]) {
  const notes = selectCurrentPattern(useProject.getState()).notes[channelId] ?? []
  const sel = new Set(usePianoRollUi.getState().selected)
  const useSel = sel.size > 0
  const target = useSel ? notes.filter((n) => sel.has(n.id)) : notes
  const rest = useSel ? notes.filter((n) => !sel.has(n.id)) : []
  const result = fn(target)
  useProject.getState().setChannelNotes(channelId, [...rest, ...result])
  if (useSel) usePianoRollUi.setState({ selected: result.map((n) => n.id) })
}

function previewNote(channelId: string, key: number) {
  const id = engine.noteOn(channelId, key, 0.7)
  setTimeout(() => engine.noteOff(id), 160)
}

function Editor({ channel }: { channel: Channel }) {
  const notes = useChannelNotes(channel.id)
  const pattern = useProject(selectCurrentPattern)
  const zoom = usePianoRollUi((s) => s.zoom)
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)

  // prune selection when notes disappear (undo, other edits)
  useEffect(() => {
    const ids = new Set(notes.map((n) => n.id))
    const sel = usePianoRollUi.getState().selected
    if (sel.some((id) => !ids.has(id))) usePianoRollUi.setState({ selected: sel.filter((id) => ids.has(id)) })
  }, [notes])

  // scroll to the notes (or C5) when the channel changes
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const keys = (selectCurrentPattern(useProject.getState()).notes[channel.id] ?? []).map((n) => n.key)
    const center = keys.length ? (Math.min(...keys) + Math.max(...keys)) / 2 : 60
    el.scrollTop = RULER_H + keyToY(center) - el.clientHeight / 2
  }, [channel.id])

  const endTick = Math.max(pattern.lengthSteps * STEP_TICKS, ...notes.map((n) => n.tick + n.length))
  const gridTicks = Math.ceil(endTick / BAR_TICKS) * BAR_TICKS + BAR_TICKS
  const gridW = gridTicks * zoom

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-paper text-[12px] outline-none"
      tabIndex={0}
      onKeyDown={(e) => onEditorKey(e, channel.id)}
    >
      <Toolbar channel={channel} />
      <div
        ref={scroller}
        className="relative min-h-0 flex-1 overflow-auto"
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
        onWheel={(e) => {
          if (!e.ctrlKey) return
          const z = usePianoRollUi.getState().zoom
          usePianoRollUi.setState({ zoom: Math.min(4, Math.max(0.25, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))) })
        }}
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `${KEYS_W}px ${gridW}px`, gridTemplateRows: `${RULER_H}px ${128 * KEY_H}px` }}
        >
          <div className="sticky top-0 left-0 z-30 border-r border-b border-line bg-card" />
          <Ruler gridTicks={gridTicks} zoom={zoom} patternEnd={pattern.lengthSteps * STEP_TICKS} />
          <Keys channelId={channel.id} />
          <Grid channelId={channel.id} notes={notes} gridTicks={gridTicks} zoom={zoom} patternEnd={pattern.lengthSteps * STEP_TICKS} />
        </div>
      </div>
      <ExpressionLane channelId={channel.id} notes={notes} zoom={zoom} scrollLeft={scrollLeft} />
    </div>
  )
}

function onEditorKey(e: React.KeyboardEvent, channelId: string) {
  const ui = usePianoRollUi.getState()
  const sel = new Set(ui.selected)
  const notes = selectCurrentPattern(useProject.getState()).notes[channelId] ?? []
  const set = (next: Note[]) => useProject.getState().setChannelNotes(channelId, next)
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (!sel.size) return
    set(notes.filter((n) => !sel.has(n.id)))
    usePianoRollUi.setState({ selected: [] })
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    usePianoRollUi.setState({ selected: notes.map((n) => n.id) })
  } else if (e.key === 'Escape') {
    usePianoRollUi.setState({ selected: [] })
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    if (!sel.size) return
    const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1)
    applyTool(channelId, (t) => transpose(t, d))
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (!sel.size) return
    const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? BAR_TICKS : ui.snap)
    applyTool(channelId, (t) => {
      const min = Math.min(...t.map((n) => n.tick))
      const dd = Math.max(d, -min)
      return t.map((n) => ({ ...n, tick: n.tick + dd }))
    })
  } else return
  e.preventDefault()
}

// ---------------------------------------------------------------- toolbar

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-sm transition-colors',
        active ? 'bg-inv text-inv-ink' : 'text-muted hover:bg-card hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}

const menuButton = 'flex h-7 shrink-0 items-center gap-1 rounded-sm px-2 text-muted hover:bg-card hover:text-ink data-[state=open]:bg-card data-[state=open]:text-ink'

function Toolbar({ channel }: { channel: Channel }) {
  const ui = usePianoRollUi()
  const snapLabel = SNAPS.find((s) => s.ticks === ui.snap)?.label ?? 'Custom'
  const tool = (fn: (t: Note[]) => Note[]) => () => applyTool(channel.id, fn)
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2">
      <div className="mr-1 flex min-w-0 items-center gap-1.5 pr-2">
        <SourceIcon source={channel.source} />
        <span className="max-w-32 truncate text-ink">{channel.name}</span>
      </div>
      <ToolButton label="Draw (click to add, drag to move/resize)" active={ui.tool === 'draw'} onClick={() => usePianoRollUi.setState({ tool: 'draw' })}>
        <Pencil size={14} />
      </ToolButton>
      <ToolButton label="Select (drag a box)" active={ui.tool === 'select'} onClick={() => usePianoRollUi.setState({ tool: 'select' })}>
        <MousePointer2 size={14} />
      </ToolButton>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={menuButton} title="Snap">
            <span className="text-faint">Snap</span> {snapLabel}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {SNAPS.map((s) => (
            <DropdownMenuItem key={s.label} onSelect={() => usePianoRollUi.setState({ snap: s.ticks })}>
              {s.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(menuButton, ui.chord && 'bg-inv text-inv-ink hover:bg-inv hover:text-inv-ink')} title="Chord stamp: new notes become this chord">
            <span className={ui.chord ? '' : 'text-faint'}>Chord</span> {ui.chord ? CHORDS[ui.chord].label : 'off'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => usePianoRollUi.setState({ chord: null })}>Off (single notes)</DropdownMenuItem>
          <DropdownMenuSeparator />
          {Object.entries(CHORDS).map(([id, c]) => (
            <DropdownMenuItem key={id} onSelect={() => usePianoRollUi.setState({ chord: id })}>
              {c.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ToolButton label="Slide notes: new notes glide the previous note's pitch" active={ui.slide} onClick={() => usePianoRollUi.setState({ slide: !ui.slide })}>
        <TrendingUp size={14} />
      </ToolButton>
      <ToolButton label="Ghost notes: show other channels' notes" active={ui.ghosts} onClick={() => usePianoRollUi.setState({ ghosts: !ui.ghosts })}>
        <Ghost size={14} />
      </ToolButton>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={menuButton} title="Tools (apply to the selection, or all notes)">
            <Wand2 size={14} /> Tools
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-[11px] font-normal text-muted">
            {ui.selected.length ? `${ui.selected.length} selected notes` : 'All notes'}
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={tool((t) => quantize(t, ui.snap))}>Quantize to {snapLabel}</DropdownMenuItem>
          <DropdownMenuItem onSelect={tool((t) => chop(t, ui.snap))}>Chop into {snapLabel}</DropdownMenuItem>
          <DropdownMenuItem onSelect={tool((t) => strum(t, 4, 'down'))}>Strum down</DropdownMenuItem>
          <DropdownMenuItem onSelect={tool((t) => strum(t, 4, 'up'))}>Strum up</DropdownMenuItem>
          <DropdownMenuItem onSelect={tool((t) => arpeggiate(t, ui.snap, 'up'))}>Arpeggiate up ({snapLabel})</DropdownMenuItem>
          <DropdownMenuItem onSelect={tool((t) => arpeggiate(t, ui.snap, 'down'))}>Arpeggiate down</DropdownMenuItem>
          <DropdownMenuItem onSelect={tool((t) => arpeggiate(t, ui.snap, 'updown'))}>Arpeggiate up-down</DropdownMenuItem>
          <DropdownMenuItem onSelect={tool(legato)}>Legato</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={tool((t) => transpose(t, 12))}>Octave up</DropdownMenuItem>
          <DropdownMenuItem onSelect={tool((t) => transpose(t, -12))}>Octave down</DropdownMenuItem>
          <DropdownMenuItem onSelect={tool((t) => t.map((n) => ({ ...n, slide: !n.slide })))}>Toggle slide</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => applyTool(channel.id, () => [])}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RecordToggle label className="ml-1" />

      <div className="flex-1" />
      <ToolButton label="Zoom out (Ctrl+wheel)" onClick={() => usePianoRollUi.setState({ zoom: Math.max(0.25, ui.zoom / 1.25) })}>
        <ZoomOut size={14} />
      </ToolButton>
      <ToolButton label="Zoom in (Ctrl+wheel)" onClick={() => usePianoRollUi.setState({ zoom: Math.min(4, ui.zoom * 1.25) })}>
        <ZoomIn size={14} />
      </ToolButton>
    </div>
  )
}

// ---------------------------------------------------------------- ruler / keys

function Ruler({ gridTicks, zoom, patternEnd }: { gridTicks: number; zoom: number; patternEnd: number }) {
  const step = useTransportUi((s) => s.step)
  const bars = gridTicks / BAR_TICKS
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-card" style={{ height: RULER_H }}>
      {Array.from({ length: bars }, (_, i) => (
        <div
          key={i}
          className={cn('absolute top-0 h-full border-l pl-1 font-mono text-[10px] leading-[22px]', i * BAR_TICKS < patternEnd ? 'border-line-strong text-muted' : 'border-line text-faint')}
          style={{ left: i * BAR_TICKS * zoom }}
        >
          {i + 1}
        </div>
      ))}
      {step >= 0 && <div className="absolute top-0 h-full w-px bg-ink" style={{ left: step * STEP_TICKS * zoom }} />}
    </div>
  )
}

function Keys({ channelId }: { channelId: string }) {
  const held = useHeldKeys((s) => s.keys)
  const ids = useRef(new Map<number, number | null>())
  useEffect(
    () =>
      addGlobalListener('pointerup', () => {
        for (const id of ids.current.values()) engine.noteOff(id)
        ids.current.clear()
      }),
    []
  )
  return (
    <div className="sticky left-0 z-20 border-r border-line" style={{ width: KEYS_W }}>
      {Array.from({ length: 128 }, (_, i) => {
        const key = 127 - i
        const black = BLACK.has(key % 12)
        return (
          <div
            key={key}
            onPointerDown={(e) => {
              e.preventDefault()
              ids.current.set(key, engine.noteOn(channelId, key, 0.8))
            }}
            className={cn(
              'flex items-center justify-end pr-1 text-[9px]',
              held.includes(key)
                ? 'bg-muted text-paper'
                : black
                  ? 'bg-inv text-inv-ink/50 dark:bg-page dark:text-faint'
                  : 'bg-raise text-faint dark:bg-soft dark:text-line-strong',
              key % 12 === 0 && 'border-b border-line-strong',
              key % 12 === 5 && 'border-b border-line'
            )}
            style={{ height: KEY_H }}
          >
            {key % 12 === 0 ? noteName(key) : ''}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- grid

type Drag =
  | { kind: 'move'; x0: number; y0: number; orig: Note[]; lead: Note; lastKey: number }
  /** just drew a note: dragging puts its end at the pointer (a plain click keeps the last length) */
  | { kind: 'create'; x0: number; orig: Note[]; lead: Note }
  | { kind: 'resize'; x0: number; orig: Note[]; lead: Note }
  | { kind: 'box'; t0: number; k0: number; t1: number; k1: number; base: string[] }
  | { kind: 'erase' }

function Grid({ channelId, notes, gridTicks, zoom, patternEnd }: { channelId: string; notes: Note[]; gridTicks: number; zoom: number; patternEnd: number }) {
  const ui = usePianoRollUi()
  const selected = useMemo(() => new Set(ui.selected), [ui.selected])
  // select stable references; derive the list in a memo (a selector returning a
  // fresh array each time would re-render forever)
  const pattern = useProject(selectCurrentPattern)
  const channels = useProject((s) => s.channels)
  const ghosts = useMemo(
    () => (ui.ghosts ? channels.filter((c) => c.id !== channelId).flatMap((c) => pattern.notes[c.id] ?? EMPTY) : EMPTY),
    [ui.ghosts, channels, channelId, pattern]
  )
  const step = useTransportUi((s) => s.step)
  const drag = useRef<Drag | null>(null)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const pos = useCallback(
    (e: React.PointerEvent) => {
      const r = ref.current!.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      return { x, y, tick: Math.max(0, x / zoom), key: yToKey(y) }
    },
    [zoom]
  )

  const current = () => selectCurrentPattern(useProject.getState()).notes[channelId] ?? []
  const write = (next: Note[]) => useProject.getState().setChannelNotes(channelId, next)

  const onPointerDown = (e: React.PointerEvent) => {
    const ui = usePianoRollUi.getState() // fresh, not the last render's
    const selected = new Set(ui.selected)
    const p = pos(e)
    const all = current()
    const hit = hitNote(all, p.tick, p.key)
    capture(e)
    beginGesture()

    if (e.button === 2) {
      drag.current = { kind: 'erase' }
      if (hit) write(all.filter((n) => n.id !== hit.id))
      return
    }
    if (e.button !== 0) return

    if (hit) {
      let sel = ui.selected
      if (!selected.has(hit.id)) sel = e.shiftKey ? [...sel, hit.id] : [hit.id]
      usePianoRollUi.setState({ selected: sel })
      const set = new Set(sel)
      const orig = all.filter((n) => set.has(n.id))
      const nearEnd = p.x > (hit.tick + hit.length) * zoom - 6
      drag.current = nearEnd ? { kind: 'resize', x0: p.x, orig, lead: hit } : { kind: 'move', x0: p.x, y0: p.y, orig, lead: hit, lastKey: hit.key }
      if (!nearEnd) previewNote(channelId, hit.key)
      return
    }

    if (ui.tool === 'select' || e.ctrlKey || e.metaKey) {
      drag.current = { kind: 'box', t0: p.tick, k0: p.key, t1: p.tick, k1: p.key, base: e.shiftKey ? ui.selected : [] }
      if (!e.shiftKey) usePianoRollUi.setState({ selected: [] })
      return
    }

    // draw: new note (or chord); keep dragging to set its length
    const tick = snapFloor(p.tick, ui.snap)
    const length = ui.lastLength
    const base: Partial<Note> = { slide: ui.slide }
    const created = ui.chord ? stampChord(ui.chord, p.key, tick, length, base) : [makeNote(tick, { ...base, key: p.key, length })]
    write([...all, ...created])
    usePianoRollUi.setState({ selected: created.map((n) => n.id) })
    drag.current = { kind: 'create', x0: p.x, orig: created, lead: created[0] }
    previewNote(channelId, p.key)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const ui = usePianoRollUi.getState()
    const p = pos(e)
    const all = current()
    if (d.kind === 'erase') {
      const hit = hitNote(all, p.tick, p.key)
      if (hit) write(all.filter((n) => n.id !== hit.id))
    } else if (d.kind === 'move') {
      const dKeys = Math.round((d.y0 - p.y) / KEY_H)
      const moved = moveNotes(d.orig, d.lead, (p.x - d.x0) / zoom, dKeys, ui.snap)
      const ids = new Set(d.orig.map((n) => n.id))
      write([...all.filter((n) => !ids.has(n.id)), ...moved])
      const leadKey = moved.find((n) => n.id === d.lead.id)!.key
      if (leadKey !== d.lastKey) {
        d.lastKey = leadKey
        previewNote(channelId, leadKey)
      }
    } else if (d.kind === 'create') {
      if (Math.abs(p.x - d.x0) < 4) return // a click, not a drag
      const length = Math.max(ui.snap, Math.round((p.tick - d.lead.tick) / ui.snap) * ui.snap)
      const ids = new Set(d.orig.map((n) => n.id))
      write([...all.filter((n) => !ids.has(n.id)), ...d.orig.map((n) => ({ ...n, length }))])
      usePianoRollUi.setState({ lastLength: length })
    } else if (d.kind === 'resize') {
      const resized = resizeNotes(d.orig, d.lead, (p.x - d.x0) / zoom, ui.snap)
      const ids = new Set(d.orig.map((n) => n.id))
      write([...all.filter((n) => !ids.has(n.id)), ...resized])
      usePianoRollUi.setState({ lastLength: resized.find((n) => n.id === d.lead.id)!.length })
    } else if (d.kind === 'box') {
      d.t1 = p.tick
      d.k1 = p.key
      const inBox = notesInBox(all, d.t0, d.t1, d.k0, d.k1).map((n) => n.id)
      usePianoRollUi.setState({ selected: [...new Set([...d.base, ...inBox])] })
      const x0 = Math.min(d.t0, d.t1) * zoom
      const y0 = keyToY(Math.max(d.k0, d.k1))
      setBox({ x: x0, y: y0, w: Math.abs(d.t1 - d.t0) * zoom, h: (Math.abs(d.k1 - d.k0) + 1) * KEY_H })
    }
  }

  const onPointerUp = () => {
    if (drag.current?.kind === 'resize') {
      const lead = current().find((n) => n.id === (drag.current as { lead: Note }).lead.id)
      if (lead) usePianoRollUi.setState({ lastLength: lead.length })
    }
    drag.current = null
    setBox(null)
    endGesture()
  }

  const stepPx = STEP_TICKS * zoom
  const beatPx = stepPx * 4
  const barPx = beatPx * 4
  return (
    <div
      ref={ref}
      data-piano-grid
      className="relative cursor-crosshair overflow-hidden"
      style={{ width: gridTicks * zoom, height: 128 * KEY_H }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* key rows */}
      {Array.from({ length: 128 }, (_, i) => {
        const key = 127 - i
        return (
          <div
            key={key}
            className={cn('absolute right-0 left-0', BLACK.has(key % 12) ? 'bg-card' : 'bg-paper', key % 12 === 0 && 'border-b border-line')}
            style={{ top: i * KEY_H, height: KEY_H }}
          />
        )
      })}
      {/* beat/bar lines */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, var(--line-strong) 0 1px, transparent 1px ${barPx}px), repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px ${beatPx}px)${stepPx >= 10 ? `, repeating-linear-gradient(90deg, color-mix(in srgb, var(--line) 50%, transparent) 0 1px, transparent 1px ${stepPx}px)` : ''}`
        }}
      />
      {/* beyond the pattern end */}
      <div className="hatch pointer-events-none absolute top-0 bottom-0 opacity-60" style={{ left: patternEnd * zoom, right: 0 }} />

      {/* ghost notes of other channels */}
      {ghosts.map((n) => (
        <div
          key={'g' + n.id}
          className="pointer-events-none absolute rounded-[2px] border border-faint/50"
          style={{ left: n.tick * zoom, top: keyToY(n.key) + 1, width: Math.max(2, n.length * zoom - 1), height: KEY_H - 2 }}
        />
      ))}

      {/* this channel's notes */}
      {notes.map((n) => {
        const sel = selected.has(n.id)
        const w = Math.max(3, n.length * zoom - 1)
        return (
          <div
            key={n.id}
            data-note={n.id}
            className={cn(
              'pointer-events-none absolute flex items-center overflow-hidden rounded-[2px] border pl-1 text-[9px] leading-none',
              sel ? 'border-ink bg-ink text-paper' : 'border-muted bg-muted text-paper'
            )}
            style={{
              left: n.tick * zoom,
              top: keyToY(n.key) + 1,
              width: w,
              height: KEY_H - 2,
              opacity: 0.45 + n.velocity * 0.55,
              backgroundImage: n.slide ? 'repeating-linear-gradient(135deg, transparent 0 3px, color-mix(in srgb, var(--paper) 45%, transparent) 3px 5px)' : undefined
            }}
          >
            {w > 26 && (n.slide ? '↗ ' : '') + noteName(n.key)}
            <span className="absolute top-0 right-0 bottom-0 w-[3px] bg-paper/25" />
          </div>
        )
      })}

      {box && <div className="pointer-events-none absolute border border-dashed border-ink bg-ink/5" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      {step >= 0 && <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink/70" style={{ left: step * STEP_TICKS * zoom }} />}
    </div>
  )
}

// ---------------------------------------------------------------- expression lane

function ExpressionLane({ channelId, notes, zoom, scrollLeft }: { channelId: string; notes: Note[]; zoom: number; scrollLeft: number }) {
  const lane = usePianoRollUi((s) => s.lane)
  const selected = usePianoRollUi((s) => s.selected)
  const snap = usePianoRollUi((s) => s.snap)
  const def = LANES[lane]
  const ref = useRef<HTMLDivElement>(null)
  const painting = useRef(false)
  const [hover, setHover] = useState<string | null>(null)

  const toValue = (y: number) => {
    const v = def.max - (y / LANE_H) * (def.max - def.min)
    return Math.min(def.max, Math.max(def.min, v))
  }
  const toY = (v: number) => ((def.max - v) / (def.max - def.min)) * LANE_H

  const paint = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const x = e.clientX - r.left + scrollLeft
    const value = toValue(e.clientY - r.top)
    const sel = new Set(selected)
    const all = selectCurrentPattern(useProject.getState()).notes[channelId] ?? []
    const reach = Math.max(4, (snap * zoom) / 2)
    const affected = all.filter((n) => Math.abs(n.tick * zoom - x) <= reach && (sel.size === 0 || sel.has(n.id)))
    if (!affected.length) return
    const ids = new Set(affected.map((n) => n.id))
    useProject.getState().setChannelNotes(
      channelId,
      all.map((n) => (ids.has(n.id) ? { ...n, [lane]: lane === 'finePitch' ? Math.round(value) : value } : n))
    )
    setHover(def.format(value))
  }

  return (
    <div className="flex shrink-0 border-t border-line bg-paper" style={{ height: LANE_H + 1 }}>
      <div className="flex shrink-0 flex-col justify-between border-r border-line p-1" style={{ width: KEYS_W }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="truncate rounded-sm px-1 text-left text-[10.5px] text-muted hover:bg-card hover:text-ink" title="Choose which per-note value to edit">
              {def.short} ▾
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.keys(LANES) as Lane[]).map((l) => (
              <DropdownMenuItem key={l} onSelect={() => usePianoRollUi.setState({ lane: l })}>
                {LANES[l].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="px-1 font-mono text-[10px] text-faint">{hover ?? ''}</span>
      </div>
      <div
        ref={ref}
        data-piano-lane
        className="relative min-w-0 flex-1 cursor-ns-resize overflow-hidden"
        onPointerDown={(e) => {
          capture(e)
          painting.current = true
          beginGesture()
          paint(e)
        }}
        onPointerMove={(e) => painting.current && paint(e)}
        onPointerUp={() => {
          painting.current = false
          endGesture()
          setHover(null)
        }}
      >
        {def.bipolar && <div className="absolute right-0 left-0 border-t border-dashed border-line" style={{ top: LANE_H / 2 }} />}
        <div className="absolute top-0 left-0 h-full" style={{ transform: `translateX(${-scrollLeft}px)` }}>
          {notes.map((n) => {
            const v = n[lane] as number
            const y = toY(v)
            const base = def.bipolar ? LANE_H / 2 : LANE_H
            const sel = selected.includes(n.id)
            return (
              <div key={n.id} className="absolute" style={{ left: n.tick * zoom, top: Math.min(y, base), height: Math.max(1, Math.abs(base - y)) }}>
                <div className={cn('h-full w-[2px]', sel ? 'bg-ink' : 'bg-soft')} />
                <div className={cn('absolute -left-[3px] size-2 rounded-full border', sel ? 'border-ink bg-ink' : 'border-soft bg-paper')} style={{ top: y <= base ? -4 : undefined, bottom: y > base ? -4 : undefined }} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
