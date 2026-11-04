import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus, Trash2, Workflow } from 'lucide-react'
import { create } from 'zustand'
import { FX, formatParam, fromNorm, toNorm } from '@/audio/fx-defs'
import { DragNumber } from '@/components/DragNumber'
import { Knob } from '@/components/Knob'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { noteName } from '@/input/keyboard'
import { cn } from '@/lib/utils'
import { beginGesture, endGesture } from '@/state/history'
import { INSTRUMENT_DEFAULTS, INSTRUMENT_KINDS, INSTRUMENT_NAMES } from '@/state/instrument-defs'
import {
  audibleNodes,
  defaultPatch,
  freeSpot,
  makeFxNode,
  makeInstNode,
  nodeTitle,
  PATCH_FX_TYPES,
  PATCH_OUT,
  hasInput,
  hasOutput
} from '@/state/patch'
import { useProject } from '@/state/project'
import { toast } from '@/state/toasts'
import { useTransportUi } from '@/state/transport-ui'
import type { Channel, PatchFxNode, PatchInstNode, PatchNode, PatcherSource } from '@/state/types'

/**
 * Patcher (FL-style): build one channel's sound from generators and effects.
 * Every note on the channel plays each generator (in its key range); wires
 * carry audio from a node's right port into another node's left port, ending
 * at Output. Drag a port onto a node to connect, right-click a cable to remove it.
 */

const NODE_W = 168
const NODE_H = 50
const PAD = 40

export const usePatcherUi = create<{ selected: string | null }>(() => ({ selected: null }))

type Pt = { x: number; y: number }
const outPort = (n: PatchNode): Pt => ({ x: n.x + NODE_W, y: n.y + NODE_H / 2 })
const inPort = (n: PatchNode): Pt => ({ x: n.x, y: n.y + NODE_H / 2 })
const curve = (a: Pt, b: Pt) => {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2)
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`
}

export function Patcher() {
  const channel = useProject((s) => s.channels.find((c) => c.id === s.selectedChannelId) ?? null)

  if (!channel || channel.source.type !== 'patcher') {
    return (
      <div className="hatch grid h-full place-items-center p-6 text-center text-[12px] text-muted">
        <div className="flex max-w-xs flex-col items-center gap-3">
          <Workflow size={18} className="text-faint" />
          <p>
            {channel ? `“${channel.name}” isn’t a Patcher.` : 'No channel selected.'} A Patcher layers built-in instruments
            and runs them through effects, all on one channel.
          </p>
          <div className="flex gap-2">
            {channel && (
              <button
                onClick={() => useProject.getState().setChannelSource(channel.id, defaultPatch())}
                className="h-7 rounded-sm border border-line bg-raise px-2 text-soft hover:border-ink hover:text-ink"
              >
                Turn “{channel.name}” into a Patcher
              </button>
            )}
            <button
              onClick={() => useProject.getState().addChannel(defaultPatch())}
              className="h-7 rounded-sm border border-line bg-raise px-2 text-soft hover:border-ink hover:text-ink"
            >
              New Patcher channel
            </button>
          </div>
        </div>
      </div>
    )
  }
  return <PatchEditor channel={channel} patch={channel.source} />
}

function PatchEditor({ channel, patch }: { channel: Channel; patch: PatcherSource }) {
  const selectedId = usePatcherUi((s) => s.selected)
  const selected = patch.nodes.find((n) => n.id === selectedId) ?? null
  const add = (node: PatchNode) => {
    if (!useProject.getState().addPatchNode(channel.id, node)) return toast('This Patcher is full (16 nodes).', 'error')
    usePatcherUi.setState({ selected: node.id })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper text-[12px]">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <Workflow size={13} className="text-muted" />
        <span className="truncate text-ink">{channel.name}</span>
        <div className="ml-auto flex gap-1">
          <AddMenu label="Generator">
            {INSTRUMENT_KINDS.map((k) => (
              <DropdownMenuItem key={k} onSelect={() => add(makeInstNode(k, ...xy(freeSpot(patch.nodes, 'inst'))))}>
                {INSTRUMENT_NAMES[k]}
              </DropdownMenuItem>
            ))}
          </AddMenu>
          <AddMenu label="Effect">
            {PATCH_FX_TYPES.map((t) => (
              <DropdownMenuItem key={t} onSelect={() => add(makeFxNode(t, ...xy(freeSpot(patch.nodes, 'fx'))))}>
                {FX[t].label}
              </DropdownMenuItem>
            ))}
          </AddMenu>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <Canvas channel={channel} patch={patch} />
        <aside className="w-64 shrink-0 overflow-auto border-l border-line p-3">
          {selected ? <Inspector channelId={channel.id} node={selected} /> : <Help />}
        </aside>
      </div>
    </div>
  )
}

const xy = (p: Pt) => [p.x, p.y] as const

function AddMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-6 items-center gap-1 rounded-sm border border-line px-2 text-muted hover:border-ink hover:text-ink">
          <Plus size={12} /> {label} <ChevronDown size={11} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

function Canvas({ channel, patch }: { channel: Channel; patch: PatcherSource }) {
  const playing = useTransportUi((s) => s.playing)
  const selected = usePatcherUi((s) => s.selected)
  const area = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<{ from: PatchNode; to: Pt } | null>(null)
  const move = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const audible = useMemo(() => audibleNodes(patch), [patch])

  const width = Math.max(...patch.nodes.map((n) => n.x)) + NODE_W + PAD
  const height = Math.max(...patch.nodes.map((n) => n.y)) + NODE_H + PAD
  const byId = (id: string) => patch.nodes.find((n) => n.id === id)

  /** pointer position in canvas coordinates (scroll included) */
  const local = (e: React.PointerEvent): Pt => {
    const r = area.current!.getBoundingClientRect()
    return { x: e.clientX - r.left + area.current!.scrollLeft, y: e.clientY - r.top + area.current!.scrollTop }
  }
  const nodeAt = (p: Pt) => patch.nodes.find((n) => p.x >= n.x - 8 && p.x <= n.x + NODE_W && p.y >= n.y && p.y <= n.y + NODE_H)

  const onPointerMove = (e: React.PointerEvent) => {
    if (draft) setDraft({ ...draft, to: local(e) })
    else if (move.current) {
      const p = local(e)
      useProject.getState().updatePatchNode(channel.id, move.current.id, {
        x: Math.max(0, p.x - move.current.dx),
        y: Math.max(0, p.y - move.current.dy)
      })
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (draft) {
      const target = nodeAt(local(e))
      if (target && target.id !== draft.from.id) {
        const res = useProject.getState().connectPatch(channel.id, draft.from.id, target.id)
        if (res === 'loop') toast('That connection would create a feedback loop.', 'error')
        else if (res === 'invalid') toast(`${nodeTitle(target, INSTRUMENT_NAMES)} has no input.`, 'error')
      }
      setDraft(null)
    }
    if (move.current) {
      move.current = null
      endGesture()
    }
  }

  return (
    <div
      ref={area}
      tabIndex={0}
      className="hatch relative min-w-0 flex-1 overflow-auto outline-none select-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) usePatcherUi.setState({ selected: null })
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selected && selected !== PATCH_OUT) {
          e.preventDefault()
          useProject.getState().removePatchNode(channel.id, selected)
          usePatcherUi.setState({ selected: null })
        }
      }}
    >
      <svg width={width} height={height} className="pointer-events-none absolute top-0 left-0 overflow-visible">
        {patch.wires.map((w) => {
          const a = byId(w.from)
          const b = byId(w.to)
          if (!a || !b) return null
          const d = curve(outPort(a), inPort(b))
          const on = audible.has(w.from)
          return (
            <g key={`${w.from}>${w.to}`}>
              <path
                d={d}
                stroke="transparent"
                strokeWidth={12}
                fill="none"
                className="pointer-events-auto cursor-pointer"
                onContextMenu={(ev) => {
                  ev.preventDefault()
                  useProject.getState().disconnectPatch(channel.id, w.from, w.to)
                }}
              >
                <title>Right-click to disconnect</title>
              </path>
              <path d={d} className={cn('cable', on && 'cable-on', on && playing && 'cable-flow')} />
            </g>
          )
        })}
        {draft && <path d={curve(outPort(draft.from), draft.to)} className="cable cable-on cable-flow" />}
      </svg>

      {/* keeps the scroll area as large as the graph */}
      <div style={{ width, height }} className="pointer-events-none" />

      {patch.nodes.map((n) => (
        <div
          key={n.id}
          data-node={n.id}
          style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
          className={cn(
            'absolute flex cursor-grab flex-col justify-center rounded-sm border px-3 shadow-ink active:cursor-grabbing',
            n.id === selected ? 'border-ink bg-raise' : 'border-line-strong bg-card',
            !audible.has(n.id) && n.kind !== 'out' && 'opacity-55'
          )}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            usePatcherUi.setState({ selected: n.id })
            area.current?.focus()
            const p = local(e)
            move.current = { id: n.id, dx: p.x - n.x, dy: p.y - n.y }
            beginGesture()
            area.current?.setPointerCapture(e.pointerId)
          }}
        >
          <span className="truncate text-ink">{nodeTitle(n, INSTRUMENT_NAMES)}</span>
          <span className="truncate font-mono text-[10px] text-faint">{nodeSub(n, audible.has(n.id))}</span>
          {hasInput(n) && <Port side="in" />}
          {hasOutput(n) && (
            <Port
              side="out"
              onPointerDown={(e) => {
                e.stopPropagation()
                setDraft({ from: n, to: local(e) })
                area.current?.setPointerCapture(e.pointerId)
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function nodeSub(n: PatchNode, audible: boolean): string {
  if (n.kind === 'out') return 'to the channel strip'
  if (!audible) return 'not connected'
  if (n.kind === 'fx') return 'effect'
  const parts = [`${Math.round(n.level * 100)}%`]
  if (n.transpose) parts.push(`${n.transpose > 0 ? '+' : ''}${n.transpose} st`)
  if (n.lo > 0 || n.hi < 127) parts.push(`${noteName(n.lo)}–${noteName(n.hi)}`)
  return parts.join(' · ')
}

function Port({ side, onPointerDown }: { side: 'in' | 'out'; onPointerDown?: (e: React.PointerEvent) => void }) {
  return (
    <span
      onPointerDown={onPointerDown}
      title={side === 'out' ? 'Drag onto another node to connect' : undefined}
      className={cn(
        'absolute top-1/2 size-[11px] -translate-y-1/2 rounded-full border border-ink bg-paper',
        side === 'in' ? '-left-[6px]' : '-right-[6px] cursor-crosshair hover:bg-ink'
      )}
    />
  )
}

function Help() {
  return (
    <div className="flex flex-col gap-2 text-[11.5px] leading-relaxed text-muted">
      <h3 className="font-mono text-[10px] tracking-[0.12em] text-faint">PATCHER</h3>
      <p>Every note on this channel plays all generators (within their key range), layered.</p>
      <p>Drag from a node’s right port onto another node to send its sound there. Chains end at Output.</p>
      <p>Right-click a cable to remove it. Select a node and press Delete to remove it.</p>
      <p>Right-click a knob to automate it or link a controller.</p>
    </div>
  )
}

const seconds = (v: number) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`)

function Field(props: React.ComponentProps<typeof Knob> & { caption: string; shown: string }) {
  const { caption, shown, ...knob } = props
  return (
    <div className="flex w-14 flex-col items-center gap-1">
      <Knob size={28} {...knob} />
      <span className="text-[10.5px] text-muted">{caption}</span>
      <span className="font-mono text-[10px] text-faint">{shown}</span>
    </div>
  )
}

function Inspector({ channelId, node }: { channelId: string; node: PatchNode }) {
  const remove = () => {
    useProject.getState().removePatchNode(channelId, node.id)
    usePatcherUi.setState({ selected: null })
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-[10px] tracking-[0.12em] text-faint">{nodeTitle(node, INSTRUMENT_NAMES).toUpperCase()}</h3>
        {node.kind !== 'out' && (
          <button onClick={remove} aria-label="Remove node" title="Remove node (Delete)" className="grid size-6 place-items-center rounded-sm text-muted hover:bg-card hover:text-ink">
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {node.kind === 'inst' && <InstInspector channelId={channelId} node={node} />}
      {node.kind === 'fx' && <FxInspector channelId={channelId} node={node} />}
      {node.kind === 'out' && <p className="text-[11.5px] leading-relaxed text-muted">Everything wired here plays through the channel’s volume, pan and mixer insert.</p>}
    </div>
  )
}

function InstInspector({ channelId, node }: { channelId: string; node: PatchInstNode }) {
  const set = (patch: Parameters<ReturnType<typeof useProject.getState>['updatePatchNode']>[2]) =>
    useProject.getState().updatePatchNode(channelId, node.id, patch)
  const d = INSTRUMENT_DEFAULTS[node.instrument]
  const p = node.params
  const ref = (k: string) => `patch.${channelId}.${node.id}.${k}`
  return (
    <>
      <div className="flex flex-wrap gap-1">
        {INSTRUMENT_KINDS.map((k) => (
          <button
            key={k}
            aria-pressed={node.instrument === k}
            onClick={() => set({ instrument: k })}
            className={cn(
              'h-6 rounded-sm border px-1.5 text-[11.5px]',
              node.instrument === k ? 'border-inv bg-inv text-inv-ink' : 'border-line bg-raise text-soft hover:border-ink hover:text-ink'
            )}
          >
            {INSTRUMENT_NAMES[k]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Field caption="Level" label="Level" param={ref('level')} min={0} max={1.5} value={node.level} defaultValue={0.8} onChange={(v) => set({ level: v })} shown={`${Math.round(node.level * 100)}%`} />
        <Field caption="Transpose" label="Transpose" bipolar min={-24} max={24} value={node.transpose} defaultValue={0} onChange={(v) => set({ transpose: v })} shown={`${node.transpose > 0 ? '+' : ''}${Math.round(node.transpose)} st`} />
        <Field caption="Attack" label="Attack" param={ref('attack')} min={0.001} max={2} value={p.attack} defaultValue={d.attack} onChange={(v) => set({ params: { attack: v } })} shown={seconds(p.attack)} />
        <Field caption="Release" label="Release" param={ref('release')} min={0.01} max={4} value={p.release} defaultValue={d.release} onChange={(v) => set({ params: { release: v } })} shown={seconds(p.release)} />
        <Field caption="Bright" label="Brightness" param={ref('brightness')} value={p.brightness} defaultValue={d.brightness} onChange={(v) => set({ params: { brightness: v } })} shown={`${Math.round(p.brightness * 100)}%`} />
        {node.instrument === 'bass' && (
          <Field caption="Glide" label="Glide" param={ref('glide')} min={0} max={0.4} value={p.glide} defaultValue={d.glide} onChange={(v) => set({ params: { glide: v } })} shown={seconds(p.glide)} />
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 text-muted">Key range</span>
        <DragNumber label="Lowest key" value={node.lo} min={0} max={127} step={0.25} onChange={(v) => set({ lo: v })} format={(v) => noteName(Math.round(v))} className="w-12 text-center" />
        <span className="text-faint">–</span>
        <DragNumber label="Highest key" value={node.hi} min={0} max={127} step={0.25} onChange={(v) => set({ hi: v })} format={(v) => noteName(Math.round(v))} className="w-12 text-center" />
      </div>
    </>
  )
}

function FxInspector({ channelId, node }: { channelId: string; node: PatchFxNode }) {
  const def = FX[node.fx]
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(def.params).map(([key, pd]) => (
        <Field
          key={key}
          caption={pd.label}
          label={pd.label}
          param={`patch.${channelId}.${node.id}.${key}`}
          min={0}
          max={1}
          value={toNorm(pd, node.params[key])}
          defaultValue={toNorm(pd, pd.default)}
          onChange={(n) => {
            let v = fromNorm(pd, n)
            if (pd.unit === 'choice') v = Math.round(v)
            useProject.getState().updatePatchNode(channelId, node.id, { params: { [key]: v } })
          }}
          shown={formatParam(pd, node.params[key])}
        />
      ))}
    </div>
  )
}
