import { memo, useMemo, useRef, useState } from 'react'
import { AudioLines, Grid3x3, MousePointer2, Pencil, Plus, Scissors, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react'
import { baseName } from '@shared/api'
import { computePeaks } from '@/audio/peaks'
import { loadBuffer, useSampleStatus } from '@/audio/samples'
import { secondsPerTick } from '@/audio/timing'
import { sampleBuffers } from '@/audio/voices'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { beginGesture, endGesture } from '@/state/history'
import { makeClip, splitClip, uid, useProject } from '@/state/project'
import { toast } from '@/state/toasts'
import { useTransportUi } from '@/state/transport-ui'
import { PPQ, STEP_TICKS, type Clip, type Pattern, type PlaylistTrack } from '@/state/types'
import { isSampleDrag, readSampleDrop } from '@/workspace/dnd'
import { showPanel } from '@/workspace/layout'
import { create } from 'zustand'

/**
 * Playlist: free tracks holding pattern clips and audio clips (FL: tracks are
 * not tied to an instrument). Draw tool paints the current pattern; drag to
 * move, drag edges to trim/resize, slice tool splits, right-click for options.
 * Ruler: click = play-from position, drag = loop region, right-click = clear loop.
 */

const TRACK_W = 132
const TRACK_H = 44
const RULER_H = 24
const BAR = PPQ * 4

const SNAPS = [
  { label: 'Bar', ticks: BAR },
  { label: 'Beat', ticks: PPQ },
  { label: 'Step', ticks: STEP_TICKS }
]

type Tool = 'draw' | 'select' | 'slice'
const usePlaylistUi = create<{ tool: Tool; snap: number; zoom: number; selected: string[] }>(() => ({
  tool: 'draw',
  snap: BAR,
  zoom: 0.25,
  selected: []
}))

const snapRound = (t: number, s: number) => Math.round(t / s) * s
const snapFloor = (t: number, s: number) => Math.floor(t / s) * s

export function Playlist() {
  const tracks = useProject((s) => s.tracks)
  const clips = useProject((s) => s.clips)
  const patterns = useProject((s) => s.patterns)
  const ui = usePlaylistUi()
  const endTick = clips.reduce((m, c) => Math.max(m, c.start + c.length), 0)
  const bars = Math.max(32, Math.ceil(endTick / BAR) + 8)
  const width = bars * BAR * ui.zoom

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-paper text-[12px] outline-none"
      tabIndex={0}
      onKeyDown={onPlaylistKey}
    >
      <Toolbar />
      <div
        className="relative min-h-0 flex-1 overflow-auto"
        onWheel={(e) => {
          if (!e.ctrlKey) return
          const z = usePlaylistUi.getState().zoom
          usePlaylistUi.setState({ zoom: Math.min(2, Math.max(0.05, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))) })
        }}
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `${TRACK_W}px ${width}px`, gridTemplateRows: `${RULER_H}px auto` }}
        >
          <div className="sticky top-0 left-0 z-30 border-r border-b border-line bg-card" />
          <Ruler bars={bars} zoom={ui.zoom} />
          <TrackHeaders tracks={tracks} />
          <Lanes tracks={tracks} clips={clips} patterns={patterns} width={width} />
        </div>
      </div>
    </div>
  )
}

function onPlaylistKey(e: React.KeyboardEvent) {
  const sel = usePlaylistUi.getState().selected
  if (!sel.length) return
  const st = useProject.getState()
  if (e.key === 'Delete' || e.key === 'Backspace') {
    st.removeClips(sel)
    usePlaylistUi.setState({ selected: [] })
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    duplicateClips(sel)
  } else return
  e.preventDefault()
}

function duplicateClips(ids: string[]) {
  const st = useProject.getState()
  const chosen = st.clips.filter((c) => ids.includes(c.id))
  if (!chosen.length) return
  const start = Math.min(...chosen.map((c) => c.start))
  const end = Math.max(...chosen.map((c) => c.start + c.length))
  // same clip, fresh id, placed right after the selection
  const copies = chosen.map((c) => ({ ...c, id: uid(), start: c.start + (end - start) }))
  st.setClips(copies)
  usePlaylistUi.setState({ selected: copies.map((c) => c.id) })
}

// ---------------------------------------------------------------- toolbar

function Toolbar() {
  const ui = usePlaylistUi()
  const songMode = useProject((s) => s.songMode)
  const current = useProject((s) => s.patterns.find((p) => p.id === s.currentPatternId))
  const btn = (active: boolean) =>
    cn('grid size-7 shrink-0 place-items-center rounded-sm transition-colors', active ? 'bg-inv text-inv-ink' : 'text-muted hover:bg-card hover:text-ink')
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2">
      <button className={btn(ui.tool === 'draw')} title={`Draw: click to place "${current?.name}"`} onClick={() => usePlaylistUi.setState({ tool: 'draw' })}>
        <Pencil size={14} />
      </button>
      <button className={btn(ui.tool === 'select')} title="Select / move" onClick={() => usePlaylistUi.setState({ tool: 'select' })}>
        <MousePointer2 size={14} />
      </button>
      <button className={btn(ui.tool === 'slice')} title="Slice: click a clip to cut it" onClick={() => usePlaylistUi.setState({ tool: 'slice' })}>
        <Scissors size={14} />
      </button>
      <div className="ml-2 flex overflow-hidden rounded-sm border border-line" role="group" aria-label="Snap">
        {SNAPS.map((s) => (
          <button
            key={s.label}
            onClick={() => usePlaylistUi.setState({ snap: s.ticks })}
            className={cn('px-2 py-0.5 text-[11px]', ui.snap === s.ticks ? 'bg-inv text-inv-ink' : 'text-muted hover:bg-card hover:text-ink')}
          >
            {s.label}
          </button>
        ))}
      </div>
      <span className="ml-2 truncate text-faint">
        Painting <span className="text-soft">{current?.name}</span>
      </span>
      <div className="flex-1" />
      {!songMode && (
        <button className="mr-1 rounded-sm border border-line px-2 py-0.5 text-[11px] text-muted hover:border-ink hover:text-ink" onClick={() => useProject.getState().setSongMode(true)}>
          Play the Playlist (SONG)
        </button>
      )}
      <button className={btn(false)} title="Zoom out (Ctrl+wheel)" onClick={() => usePlaylistUi.setState({ zoom: Math.max(0.05, ui.zoom / 1.25) })}>
        <ZoomOut size={14} />
      </button>
      <button className={btn(false)} title="Zoom in (Ctrl+wheel)" onClick={() => usePlaylistUi.setState({ zoom: Math.min(2, ui.zoom * 1.25) })}>
        <ZoomIn size={14} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- ruler

function Ruler({ bars, zoom }: { bars: number; zoom: number }) {
  const loop = useProject((s) => s.loop)
  const position = useTransportUi((s) => s.songPosition)
  const songTick = useTransportUi((s) => s.songTick)
  const drag = useRef<{ from: number } | null>(null)
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null)
  const tickAt = (e: React.PointerEvent) => Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom)
  const snap = usePlaylistUi((s) => s.snap)
  const shown = draft ?? loop
  return (
    <div
      className="sticky top-0 z-20 cursor-pointer border-b border-line bg-card select-none"
      style={{ height: RULER_H }}
      title="Click: play from here · Drag: loop region · Right-click: clear loop"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        drag.current = { from: snapFloor(tickAt(e), snap) }
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const t = snapRound(tickAt(e), snap)
        if (Math.abs(t - drag.current.from) >= snap) setDraft({ start: Math.min(drag.current.from, t), end: Math.max(drag.current.from, t) })
      }}
      onPointerUp={() => {
        const d = drag.current
        drag.current = null
        if (!d) return
        if (draft) useProject.getState().setLoop(draft)
        else useTransportUi.setState({ songPosition: d.from })
        setDraft(null)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        useProject.getState().setLoop(null)
      }}
    >
      {shown && (
        <div className="absolute top-0 bottom-0 border-x border-ink bg-ink/15" style={{ left: shown.start * zoom, width: (shown.end - shown.start) * zoom }} />
      )}
      {Array.from({ length: bars }, (_, i) => (
        <div key={i} className="absolute top-0 h-full border-l border-line-strong pl-1 font-mono text-[10px] leading-[24px] text-muted" style={{ left: i * BAR * zoom }}>
          {i + 1}
        </div>
      ))}
      <div className="absolute top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-ink" style={{ left: position * zoom - 5 }} />
      {songTick >= 0 && <div className="absolute top-0 h-full w-px bg-ink" style={{ left: songTick * zoom }} />}
    </div>
  )
}

// ---------------------------------------------------------------- tracks

function TrackHeaders({ tracks }: { tracks: PlaylistTrack[] }) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const { updateTrack, addTrack } = useProject.getState()
  return (
    <div className="sticky left-0 z-20 border-r border-line bg-card">
      {tracks.map((t) => (
        <div key={t.id} className="flex items-center gap-1 border-b border-line px-2" style={{ height: TRACK_H }}>
          <button
            aria-label={t.muted ? `Unmute ${t.name}` : `Mute ${t.name}`}
            title={t.muted ? 'Unmute track' : 'Mute track'}
            onClick={() => updateTrack(t.id, { muted: !t.muted })}
            className={cn('grid size-6 shrink-0 place-items-center rounded-sm', t.muted ? 'text-faint' : 'text-soft hover:text-ink')}
          >
            {t.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
          {renaming === t.id ? (
            <input
              autoFocus
              defaultValue={t.name}
              aria-label="Track name"
              className="h-6 min-w-0 flex-1 rounded-sm border border-ink bg-raise px-1 text-[12px] outline-none"
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                if (e.currentTarget.value.trim()) updateTrack(t.id, { name: e.currentTarget.value.trim() })
                setRenaming(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <span className={cn('min-w-0 flex-1 truncate', t.muted ? 'text-faint' : 'text-soft')} onDoubleClick={() => setRenaming(t.id)} title="Double-click to rename">
              {t.name}
            </span>
          )}
        </div>
      ))}
      <button onClick={addTrack} className="flex h-8 w-full items-center gap-1.5 px-2 text-muted hover:text-ink">
        <Plus size={12} /> Track
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- lanes + clips

type Drag =
  | { kind: 'move'; x0: number; y0: number; orig: Clip[]; lead: Clip }
  | { kind: 'right'; x0: number; orig: Clip }
  | { kind: 'left'; x0: number; orig: Clip }

function Lanes({ tracks, clips, patterns, width }: { tracks: PlaylistTrack[]; clips: Clip[]; patterns: Pattern[]; width: number }) {
  const zoom = usePlaylistUi((s) => s.zoom)
  const selected = usePlaylistUi((s) => s.selected)
  const songTick = useTransportUi((s) => s.songTick)
  const loop = useProject((s) => s.loop)
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [dropHover, setDropHover] = useState(false)
  const height = tracks.length * TRACK_H

  const at = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    const tick = Math.max(0, (clientX - r.left) / zoom)
    const row = Math.min(tracks.length - 1, Math.max(0, Math.floor((clientY - r.top) / TRACK_H)))
    return { tick, row, x: clientX - r.left }
  }
  const clipAt = (tick: number, row: number) => {
    const trackId = tracks[row]?.id
    const fresh = useProject.getState().clips // not the last render's props
    for (let i = fresh.length - 1; i >= 0; i--) {
      const c = fresh[i]
      if (c.trackId === trackId && tick >= c.start && tick < c.start + c.length) return c
    }
    return undefined
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const ui = usePlaylistUi.getState()
    const p = at(e.clientX, e.clientY)
    const hit = clipAt(p.tick, p.row)
    const st = useProject.getState()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    beginGesture()

    if (ui.tool === 'slice') {
      if (hit) {
        const parts = splitClip(hit, snapRound(p.tick, ui.snap), secondsPerTick(st.bpm))
        if (parts) {
          st.removeClips([hit.id])
          st.setClips(parts)
        }
      }
      return
    }
    if (hit) {
      const sel = ui.selected.includes(hit.id) ? ui.selected : e.shiftKey ? [...ui.selected, hit.id] : [hit.id]
      usePlaylistUi.setState({ selected: sel })
      const edgeL = p.x < hit.start * zoom + 6
      const edgeR = p.x > (hit.start + hit.length) * zoom - 6
      if (edgeR) drag.current = { kind: 'right', x0: p.x, orig: hit }
      else if (edgeL) drag.current = { kind: 'left', x0: p.x, orig: hit }
      else drag.current = { kind: 'move', x0: p.x, y0: e.clientY, orig: st.clips.filter((c) => sel.includes(c.id)), lead: hit }
      return
    }
    usePlaylistUi.setState({ selected: [] })
    if (ui.tool !== 'draw') return
    // paint the current pattern
    const pattern = st.patterns.find((x) => x.id === st.currentPatternId)!
    const clip = makeClip({
      trackId: tracks[p.row].id,
      kind: 'pattern',
      patternId: pattern.id,
      start: snapFloor(p.tick, ui.snap),
      length: pattern.lengthSteps * STEP_TICKS
    })
    const first = st.clips.length === 0
    st.addClip(clip)
    usePlaylistUi.setState({ selected: [clip.id] })
    drag.current = { kind: 'move', x0: p.x, y0: e.clientY, orig: [clip], lead: clip }
    if (first && !st.songMode) {
      st.setSongMode(true)
      toast('Switched to SONG: Play now plays the Playlist (toggle PAT/SONG in the top bar).')
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const ui = usePlaylistUi.getState()
    const p = at(e.clientX, e.clientY)
    const st = useProject.getState()
    const dTicks = (p.x - d.x0) / zoom
    if (d.kind === 'move') {
      const leadStart = Math.max(0, snapRound(d.lead.start + dTicks, ui.snap))
      const delta = Math.max(leadStart - d.lead.start, -Math.min(...d.orig.map((c) => c.start)))
      const dRows = Math.round((e.clientY - d.y0) / TRACK_H)
      const rowOf = (id: string) => tracks.findIndex((t) => t.id === id)
      const rows = d.orig.map((c) => rowOf(c.trackId))
      const dr = Math.min(tracks.length - 1 - Math.max(...rows), Math.max(-Math.min(...rows), dRows))
      st.setClips(d.orig.map((c, i) => ({ ...c, start: c.start + delta, trackId: tracks[rows[i] + dr].id })))
    } else if (d.kind === 'right') {
      const end = Math.max(d.orig.start + ui.snap, snapRound(d.orig.start + d.orig.length + dTicks, ui.snap))
      st.updateClip(d.orig.id, { length: end - d.orig.start })
    } else if (d.kind === 'left') {
      const start = Math.min(d.orig.start + d.orig.length - ui.snap, Math.max(0, snapRound(d.orig.start + dTicks, ui.snap)))
      const into = start - d.orig.start
      const speed = d.orig.stretch ? d.orig.rate : d.orig.rate * Math.pow(2, d.orig.pitch / 12)
      st.updateClip(d.orig.id, {
        start,
        length: d.orig.length - into,
        offset: Math.max(0, d.orig.offset + into),
        sourceOffset: Math.max(0, d.orig.sourceOffset + into * secondsPerTick(st.bpm) * speed)
      })
    }
  }

  const onPointerUp = () => {
    drag.current = null
    endGesture()
  }

  const onDrop = async (e: React.DragEvent) => {
    setDropHover(false)
    if (!isSampleDrag(e)) return
    e.preventDefault()
    const files = readSampleDrop(e)
    const p = at(e.clientX, e.clientY)
    const st = useProject.getState()
    let start = snapFloor(p.tick, usePlaylistUi.getState().snap)
    for (const f of files) {
      const sampleId = st.addSample(f.path, f.name ?? baseName(f.path))
      let length: number
      try {
        const buf = await loadBuffer(f.path)
        // the clip shows the whole file at the current tempo, rounded up to a step
        length = Math.max(STEP_TICKS, Math.ceil(buf.duration / secondsPerTick(useProject.getState().bpm) / STEP_TICKS) * STEP_TICKS)
      } catch {
        toast(`Couldn't read ${baseName(f.path, false)}`, 'error')
        continue
      }
      const clip = makeClip({ trackId: tracks[p.row].id, kind: 'audio', sampleId, start, length })
      useProject.getState().addClip(clip)
      start += length
    }
    if (!useProject.getState().songMode) useProject.getState().setSongMode(true)
  }

  return (
    <div
      ref={ref}
      className={cn('relative', usePlaylistUi.getState().tool === 'slice' ? 'cursor-col-resize' : 'cursor-default', dropHover && 'outline-1 -outline-offset-2 outline-ink outline-dashed')}
      style={{ width, height: height + 32 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDragOver={(e) => {
        if (!isSampleDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDropHover(true)
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => void onDrop(e)}
    >
      {tracks.map((t, i) => (
        <div key={t.id} className={cn('absolute right-0 left-0 border-b border-line', i % 2 ? 'bg-paper' : 'bg-card/40')} style={{ top: i * TRACK_H, height: TRACK_H }} />
      ))}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, var(--line-strong) 0 1px, transparent 1px ${BAR * zoom}px)${PPQ * zoom >= 12 ? `, repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px ${PPQ * zoom}px)` : ''}`
        }}
      />
      {loop && <div className="pointer-events-none absolute top-0 bg-ink/5" style={{ left: loop.start * zoom, width: (loop.end - loop.start) * zoom, height }} />}
      {clips.map((c) => {
        const row = tracks.findIndex((t) => t.id === c.trackId)
        if (row < 0) return null
        return (
          <ClipView
            key={c.id}
            clip={c}
            row={row}
            zoom={zoom}
            selected={selected.includes(c.id)}
            muted={tracks[row].muted}
            pattern={c.patternId ? patterns.find((p) => p.id === c.patternId) : undefined}
          />
        )
      })}
      {songTick >= 0 && <div className="pointer-events-none absolute top-0 w-px bg-ink" style={{ left: songTick * zoom, height }} />}
      {clips.length === 0 && (
        <div className="pointer-events-none absolute top-3 left-3 max-w-md text-[12px] leading-relaxed text-faint">
          Click a track to place the current pattern. Drag audio from the Browser or Explorer to add it as a clip.
        </div>
      )}
    </div>
  )
}

const ClipView = memo(function ClipView({
  clip,
  row,
  zoom,
  selected,
  muted,
  pattern
}: {
  clip: Clip
  row: number
  zoom: number
  selected: boolean
  muted: boolean
  pattern?: Pattern
}) {
  const sample = useProject((s) => (clip.sampleId ? s.samples[clip.sampleId] : undefined))
  const status = useSampleStatus((s) => (clip.sampleId ? s[clip.sampleId] : undefined))
  const w = Math.max(4, clip.length * zoom - 1)
  const name = clip.kind === 'pattern' ? (pattern?.name ?? 'Pattern') : (sample?.name ?? 'Audio')
  const st = useProject.getState()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'absolute flex flex-col overflow-hidden rounded-[3px] border text-[10.5px]',
            selected ? 'border-ink bg-raise text-ink ring-1 ring-ink' : 'border-line-strong bg-raise text-soft',
            muted && 'opacity-40'
          )}
          style={{ left: clip.start * zoom, top: row * TRACK_H + 2, width: w, height: TRACK_H - 4 }}
          onDoubleClick={() => {
            if (clip.kind === 'pattern' && clip.patternId) {
              st.selectPattern(clip.patternId)
              showPanel('channelRack')
            }
          }}
        >
          <div className={cn('flex shrink-0 items-center gap-1 truncate px-1.5 leading-[16px]', selected ? 'bg-inv text-inv-ink' : 'bg-card')}>
            {clip.kind === 'pattern' ? <Grid3x3 size={10} /> : <AudioLines size={10} />}
            <span className="truncate">{name}</span>
            {clip.kind === 'audio' && w > 110 && (clip.pitch !== 0 || clip.rate !== 1) && (
              <span className="ml-auto shrink-0 font-mono opacity-70">
                {clip.stretch ? 'str ' : ''}
                {clip.rate !== 1 ? `×${clip.rate.toFixed(2)} ` : ''}
                {clip.pitch !== 0 ? `${clip.pitch > 0 ? '+' : ''}${clip.pitch}st` : ''}
              </span>
            )}
          </div>
          <div className="relative min-h-0 flex-1">
            {clip.kind === 'pattern' && pattern && <PatternPreview clip={clip} pattern={pattern} width={w} zoom={zoom} />}
            {clip.kind === 'audio' && <Waveform clip={clip} width={w} missing={status === 'missing'} />}
          </div>
          <span className="absolute top-0 right-0 bottom-0 w-1 cursor-ew-resize" />
          <span className="absolute top-0 bottom-0 left-0 w-1 cursor-ew-resize" />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {clip.kind === 'pattern' && (
          <ContextMenuItem
            onSelect={() => {
              if (clip.patternId) st.selectPattern(clip.patternId)
              showPanel('channelRack')
            }}
          >
            Edit pattern
          </ContextMenuItem>
        )}
        {clip.kind === 'audio' && (
          <>
            <ContextMenuItem onSelect={() => st.updateClip(clip.id, { stretch: !clip.stretch })}>
              {clip.stretch ? 'Mode: Stretch (pitch stays) ✓' : 'Mode: Resample (speed = pitch) ✓'}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => fitToClip(clip)}>Stretch audio to fit clip length</ContextMenuItem>
            <ContextMenuItem onSelect={() => st.updateClip(clip.id, { rate: clip.rate * 2 })}>Speed ×2</ContextMenuItem>
            <ContextMenuItem onSelect={() => st.updateClip(clip.id, { rate: clip.rate / 2 })}>Speed ×½</ContextMenuItem>
            <ContextMenuItem onSelect={() => st.updateClip(clip.id, { pitch: clip.pitch + 1 })}>Pitch +1 semitone</ContextMenuItem>
            <ContextMenuItem onSelect={() => st.updateClip(clip.id, { pitch: clip.pitch - 1 })}>Pitch −1 semitone</ContextMenuItem>
            <ContextMenuItem onSelect={() => st.updateClip(clip.id, { pitch: clip.pitch + 12 })}>Pitch +1 octave</ContextMenuItem>
            <ContextMenuItem onSelect={() => st.updateClip(clip.id, { pitch: clip.pitch - 12 })}>Pitch −1 octave</ContextMenuItem>
            <ContextMenuItem onSelect={() => st.updateClip(clip.id, { pitch: 0, rate: 1 })}>Reset pitch & speed</ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => duplicateClips([clip.id])}>Duplicate</ContextMenuItem>
        <ContextMenuItem onSelect={() => st.removeClips([clip.id])}>Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})

/** Warp: make the rest of the file exactly fill the clip, keeping pitch (stretch mode). */
function fitToClip(clip: Clip) {
  const buf = clip.sampleId ? sampleBuffers.get(clip.sampleId) : undefined
  if (!buf?.loaded) return toast('The audio is not loaded yet.', 'error')
  const st = useProject.getState()
  const clipSeconds = clip.length * secondsPerTick(st.bpm)
  const rate = (buf.duration - clip.sourceOffset) / clipSeconds
  if (rate < 0.25 || rate > 4) return toast('That would need more than 4× stretching.', 'error')
  st.updateClip(clip.id, { stretch: true, rate })
  toast(`Stretched to fit (×${rate.toFixed(2)}, pitch unchanged)`)
}

function PatternPreview({ clip, pattern, width, zoom }: { clip: Clip; pattern: Pattern; width: number; zoom: number }) {
  const channels = useProject((s) => s.channels)
  const marks = useMemo(() => {
    const L = pattern.lengthSteps * STEP_TICKS
    const used = channels.filter((c) => (pattern.notes[c.id] ?? []).length > 0)
    const all = used.flatMap((c, row) => (pattern.notes[c.id] ?? []).map((n) => ({ n, row })))
    if (!all.length) return []
    const keys = all.map((x) => x.n.key)
    const lo = Math.min(...keys)
    const span = Math.max(...keys) - lo
    // one pitch everywhere (drums/step patterns): a row per channel; else by pitch
    const yOf = span === 0 ? (row: number) => (used.length > 1 ? row / (used.length - 1) : 0.5) : (key: number) => 1 - (key - lo) / span
    const out: { x: number; y: number; w: number }[] = []
    for (let k = Math.floor(clip.offset / L) - 1; k * L - clip.offset < clip.length; k++) {
      for (const { n, row } of all) {
        const t = k * L + n.tick - clip.offset
        if (t < 0 || t >= clip.length) continue
        out.push({ x: t * zoom, y: yOf(span === 0 ? row : n.key), w: Math.max(1.5, Math.min(n.length, clip.length - t) * zoom - 1) })
        if (out.length > 800) return out
      }
    }
    return out
  }, [clip.offset, clip.length, pattern, zoom, channels])
  return (
    <svg className="absolute inset-0 h-full" width={width} preserveAspectRatio="none">
      {marks.map((m, i) => (
        <rect key={i} x={m.x} y={`${4 + m.y * 70}%`} width={m.w} height={2} fill="currentColor" opacity={0.7} />
      ))}
    </svg>
  )
}

function Waveform({ clip, width, missing }: { clip: Clip; width: number; missing: boolean }) {
  const bpm = useProject((s) => s.bpm)
  const ready = useSampleStatus((s) => (clip.sampleId ? s[clip.sampleId] === 'ready' : false))
  const path = useMemo(() => {
    const buf = clip.sampleId ? sampleBuffers.get(clip.sampleId) : undefined
    if (!ready || !buf?.loaded) return ''
    const speed = clip.stretch ? clip.rate : clip.rate * Math.pow(2, clip.pitch / 12)
    const to = clip.sourceOffset + clip.length * secondsPerTick(bpm) * speed
    const n = Math.max(2, Math.floor(width / 2))
    const peaks = computePeaks(buf, clip.sourceOffset, Math.min(buf.duration, to), n, clip.sampleId)
    const visible = Math.min(1, (buf.duration - clip.sourceOffset) / Math.max(1e-6, to - clip.sourceOffset))
    let d = ''
    peaks.forEach((p, i) => {
      const x = (i / n) * width * visible
      d += `M${x.toFixed(1)},${(50 - p * 46).toFixed(1)}V${(50 + p * 46).toFixed(1)}`
    })
    return d
  }, [clip.sampleId, clip.sourceOffset, clip.length, clip.rate, clip.pitch, clip.stretch, bpm, width, ready])
  if (missing) return <div className="px-1.5 text-[10px] text-faint">missing file</div>
  return (
    <svg className="absolute inset-0 h-full" width={width} viewBox={`0 0 ${width} 100`} preserveAspectRatio="none">
      <path d={path} stroke="currentColor" strokeWidth={1} opacity={0.75} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
