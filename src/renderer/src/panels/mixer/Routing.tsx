import { useMemo, useRef, useState } from 'react'
import { wouldLoop } from '@/audio/mixer-graph'
import { cn } from '@/lib/utils'
import { useProject } from '@/state/project'
import { toast } from '@/state/toasts'
import { useTransportUi } from '@/state/transport-ui'
import { useMixerUi } from './Mixer'

/**
 * Visual patching: channels → inserts → Master as animated cables (the
 * InkOrbit `.cable` style). Drag from a node's port onto another node to route
 * a channel or add a send (Shift = sidechain send). Right-click a cable to remove it.
 */

const NODE_W = 150
const NODE_H = 28
const GAP = 12
const PAD = 24

type NodeRef = { kind: 'channel'; id: string } | { kind: 'insert'; index: number }
interface Placed {
  ref: NodeRef
  label: string
  sub?: string
  x: number
  y: number
}

export function Routing() {
  const channels = useProject((s) => s.channels)
  const mixer = useProject((s) => s.mixer)
  const playing = useTransportUi((s) => s.playing)
  const selected = useMixerUi((s) => s.selected)
  const svg = useRef<SVGSVGElement>(null)
  const [draft, setDraft] = useState<{ from: Placed; x: number; y: number } | null>(null)

  // inserts worth showing: used ones, the selected one, and one spare to drag onto
  const shown = useMemo(() => {
    const used = new Set<number>([selected].filter((i) => i > 0))
    channels.forEach((c) => c.mixerTarget > 0 && used.add(c.mixerTarget))
    mixer.forEach((ins, i) => {
      if (i === 0) return
      if (ins.fx.length || ins.sends.some((s) => s.target !== 0 || s.sidechain)) used.add(i)
      ins.sends.forEach((s) => s.target > 0 && used.add(s.target))
    })
    const spare = mixer.findIndex((_, i) => i > 0 && !used.has(i))
    if (spare > 0) used.add(spare)
    return [...used].sort((a, b) => a - b)
  }, [channels, mixer, selected])

  const colX = [PAD, PAD + NODE_W + 160, PAD + 2 * (NODE_W + 160)]
  const nodes: Placed[] = [
    ...channels.map((c, i) => ({ ref: { kind: 'channel', id: c.id } as NodeRef, label: c.name, x: colX[0], y: PAD + i * (NODE_H + GAP) })),
    ...shown.map((idx, i) => ({
      ref: { kind: 'insert', index: idx } as NodeRef,
      label: `${idx} ${mixer[idx].name}`,
      sub: mixer[idx].fx.length ? `${mixer[idx].fx.length} fx` : undefined,
      x: colX[1],
      y: PAD + i * (NODE_H + GAP)
    })),
    { ref: { kind: 'insert', index: 0 }, label: 'Master', x: colX[2], y: PAD }
  ]
  const insertNode = (i: number) => nodes.find((n) => n.ref.kind === 'insert' && n.ref.index === i)
  const height = PAD * 2 + Math.max(channels.length, shown.length, 1) * (NODE_H + GAP)
  const width = colX[2] + NODE_W + PAD

  const out = (n: Placed) => ({ x: n.x + NODE_W, y: n.y + NODE_H / 2 })
  const inn = (n: Placed) => ({ x: n.x, y: n.y + NODE_H / 2 })
  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = Math.max(40, (b.x - a.x) / 2)
    return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`
  }

  type Edge = { key: string; d: string; side: boolean; on: boolean; arrow?: boolean; remove(): void }
  const edges: Edge[] = []
  channels.forEach((c) => {
    const from = nodes.find((n) => n.ref.kind === 'channel' && n.ref.id === c.id)!
    const to = insertNode(c.mixerTarget) ?? insertNode(0)!
    edges.push({
      key: 'c' + c.id,
      d: curve(out(from), inn(to)),
      side: false,
      on: c.mixerTarget === selected,
      remove: () => useProject.getState().updateChannel(c.id, { mixerTarget: 0 })
    })
  })
  /** insert → insert in the same column: an arc on the right side, arrow into the target's edge */
  const sideArc = (a: Placed, b: Placed) => {
    const p = out(a)
    const q = { x: b.x + NODE_W + 6, y: b.y + NODE_H / 2 }
    const bulge = 40 + Math.min(80, Math.abs(q.y - p.y) / 3)
    return `M${p.x},${p.y} C${p.x + bulge},${p.y} ${q.x + bulge},${q.y} ${q.x},${q.y}`
  }
  mixer.forEach((ins, i) => {
    const from = insertNode(i)
    if (!from || i === 0) return
    ins.sends.forEach((s) => {
      const to = insertNode(s.target)
      if (!to) return
      edges.push({
        key: `s${i}-${s.target}`,
        d: to.x === from.x ? sideArc(from, to) : curve(out(from), inn(to)),
        arrow: to.x === from.x,
        side: s.sidechain,
        on: i === selected || s.target === selected,
        remove: () => useProject.getState().removeSend(i, s.target)
      })
    })
  })

  const local = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const nodeAt = (p: { x: number; y: number }) => nodes.find((n) => p.x >= n.x && p.x <= n.x + NODE_W && p.y >= n.y && p.y <= n.y + NODE_H)

  const connect = (from: Placed, to: Placed, sidechain: boolean) => {
    const st = useProject.getState()
    if (to.ref.kind !== 'insert') return
    if (from.ref.kind === 'channel') {
      st.updateChannel(from.ref.id, { mixerTarget: to.ref.index })
      return
    }
    const a = from.ref.index
    const b = to.ref.index
    if (a === b || a === 0) return
    if (wouldLoop(st.mixer, a, b)) return toast('That connection would create a feedback loop.', 'error')
    if (!st.addSend(a, b, sidechain && b !== 0)) toast('Already connected.', 'error')
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <svg
        ref={svg}
        width={width}
        height={height}
        className="block select-none"
        onPointerMove={(e) => draft && setDraft({ ...draft, ...local(e) })}
        onPointerUp={(e) => {
          if (!draft) return
          const target = nodeAt(local(e))
          if (target && target !== draft.from) connect(draft.from, target, e.shiftKey)
          setDraft(null)
        }}
      >
        <defs>
          <marker id="dm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M8,4 L0,0 L0,8 z" className="fill-ink" />
          </marker>
        </defs>
        <text x={colX[0]} y={14} className="fill-faint font-mono text-[10px]">CHANNELS</text>
        <text x={colX[1]} y={14} className="fill-faint font-mono text-[10px]">INSERTS</text>
        <text x={colX[2]} y={14} className="fill-faint font-mono text-[10px]">OUT</text>

        {edges.map((e) => (
          <g key={e.key}>
            {/* wide invisible stroke so the cable is easy to right-click */}
            <path
              d={e.d}
              stroke="transparent"
              strokeWidth={10}
              fill="none"
              className="cursor-pointer"
              onContextMenu={(ev) => {
                ev.preventDefault()
                e.remove()
              }}
            >
              <title>Right-click to disconnect</title>
            </path>
            <path
              d={e.d}
              className={cn('cable pointer-events-none', (playing || e.on) && 'cable-on', playing && 'cable-flow')}
              strokeDasharray={e.side ? '2 5' : undefined}
              markerEnd={e.arrow ? 'url(#dm-arrow)' : undefined}
            />
          </g>
        ))}
        {draft && <path d={curve(out(draft.from), draft)} className="cable cable-on cable-flow pointer-events-none" />}

        {nodes.map((n) => {
          const isSel = n.ref.kind === 'insert' && n.ref.index === selected
          return (
            <g key={n.ref.kind === 'channel' ? 'c' + n.ref.id : 'i' + n.ref.index} transform={`translate(${n.x},${n.y})`}>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={3}
                className={cn(isSel ? 'fill-raise stroke-ink' : 'fill-card stroke-line-strong', 'cursor-pointer')}
                onClick={() => {
                  if (n.ref.kind === 'insert') useMixerUi.setState({ selected: n.ref.index })
                  else useProject.getState().selectChannel(n.ref.id)
                }}
              />
              <text x={8} y={NODE_H / 2 + 4} className="pointer-events-none fill-ink text-[11px]">
                {n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label}
              </text>
              {n.sub && (
                <text x={NODE_W - 8} y={NODE_H / 2 + 4} textAnchor="end" className="pointer-events-none fill-faint text-[10px]">
                  {n.sub}
                </text>
              )}
              {!(n.ref.kind === 'insert' && n.ref.index === 0) && (
                <circle
                  cx={NODE_W}
                  cy={NODE_H / 2}
                  r={5}
                  className="cursor-crosshair fill-paper stroke-ink"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setDraft({ from: n, ...local(e) })
                  }}
                >
                  <title>Drag to connect (Shift = sidechain)</title>
                </circle>
              )}
            </g>
          )
        })}
      </svg>
      <p className="px-6 pb-4 text-[11px] text-faint">Drag a port onto a node to connect · Shift = sidechain send · right-click a cable to remove it</p>
    </div>
  )
}
