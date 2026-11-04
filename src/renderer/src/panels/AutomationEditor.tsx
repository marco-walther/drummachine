import { useEffect, useRef, useState } from 'react'
import { Spline, X } from 'lucide-react'
import { automationValueAt } from '@/audio/modulation'
import { paramInfo } from '@/audio/params'
import { ParamPicker, useAutomationUi } from '@/components/ParamMenu'
import { cn } from '@/lib/utils'
import { beginGesture, endGesture } from '@/state/history'
import { useProject } from '@/state/project'
import { STEP_TICKS, type AutomationPoint } from '@/state/types'

/**
 * Automation curve editor for the clip being edited (double-click an
 * automation clip in the Playlist). Click = add point, drag = move (snaps to
 * 1/16), right-click = delete. One curve can drive several parameters.
 */

const BAR = STEP_TICKS * 16
const PAD = 12

export function AutomationEditor() {
  const editing = useAutomationUi((s) => s.editing)
  const auto = useProject((s) => (editing ? s.automations[editing] : undefined))
  const clips = useProject((s) => s.clips)
  const channels = useProject((s) => s.channels)
  const mixer = useProject((s) => s.mixer)
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 600, h: 200 })
  const drag = useRef<{ index: number } | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  // follow the panel size (re-attached when the editor appears for a curve)
  const hasAuto = !!auto
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.max(200, r.width), h: Math.max(80, r.height) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasAuto])

  if (!auto) {
    return (
      <div className="hatch grid h-full place-items-center p-6 text-center text-[12px] text-muted">
        Right-click a knob → Create automation clip, or double-click an automation clip in the Playlist.
      </div>
    )
  }

  const st = useProject.getState()
  const clipLen = Math.max(BAR, ...clips.filter((c) => c.automationId === auto.id).map((c) => c.length), ...auto.points.map((p) => p.t))
  const W = size.w - PAD * 2
  const H = size.h - PAD * 2
  const x = (t: number) => PAD + (t / clipLen) * W
  const y = (v: number) => PAD + (1 - v) * H
  const first = auto.targets[0] ? paramInfo({ channels, mixer }, auto.targets[0]) : null
  const fmt = (v: number) => (first ? first.format(v) : `${Math.round(v * 100)}%`)

  // pointer math uses the element's live size (never a stale measurement)
  const live = () => {
    const r = box.current!.getBoundingClientRect()
    return { r, w: r.width - PAD * 2, h: r.height - PAD * 2 }
  }
  const toPoint = (e: { clientX: number; clientY: number }): AutomationPoint => {
    const { r, w, h } = live()
    const t = Math.round((((e.clientX - r.left - PAD) / w) * clipLen) / STEP_TICKS) * STEP_TICKS
    const v = 1 - (e.clientY - r.top - PAD) / h
    return { t: Math.min(clipLen, Math.max(0, t)), v: Math.min(1, Math.max(0, v)) }
  }
  const hit = (e: { clientX: number; clientY: number }) => {
    const { r, w, h } = live()
    const px = e.clientX - r.left
    const py = e.clientY - r.top
    return auto.points.findIndex((p) => Math.hypot(PAD + (p.t / clipLen) * w - px, PAD + (1 - p.v) * h - py) < 10)
  }

  // the curve, sampled
  const path = (() => {
    const n = Math.max(2, Math.floor(W / 3))
    let d = ''
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * clipLen
      const v = automationValueAt(auto.points, t, auto.smooth) ?? 0.5
      d += `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`
    }
    return d
  })()

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper text-[12px]">
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <input
          key={`${auto.id}:${auto.name}`}
          defaultValue={auto.name}
          aria-label="Automation name"
          className="h-6 w-44 rounded-sm border border-line bg-raise px-1.5 outline-none focus:border-ink"
          onBlur={(e) => e.currentTarget.value.trim() && st.updateAutomation(auto.id, { name: e.currentTarget.value.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <button
          onClick={() => st.updateAutomation(auto.id, { smooth: !auto.smooth })}
          aria-pressed={auto.smooth}
          title="Smooth curves between points"
          className={cn('flex h-6 items-center gap-1 rounded-sm border px-2', auto.smooth ? 'border-inv bg-inv text-inv-ink' : 'border-line text-muted hover:text-ink')}
        >
          <Spline size={12} /> Smooth
        </button>
        <span className="text-faint">controls:</span>
        {auto.targets.length === 0 && <span className="text-muted">nothing yet</span>}
        {auto.targets.map((ref) => (
          <span key={ref} className="flex items-center gap-1 rounded-sm border border-line bg-card py-0.5 pr-1 pl-1.5 text-[11px] text-soft">
            {paramInfo({ channels, mixer }, ref)?.label ?? 'missing parameter'}
            <button aria-label="Unlink" onClick={() => st.unlinkAutomation(auto.id, ref)} className="text-faint hover:text-ink">
              <X size={11} />
            </button>
          </span>
        ))}
        <ParamPicker label="+ Link parameter" exclude={auto.targets} onPick={(ref) => st.linkAutomation(auto.id, ref)} />
        <span className="ml-auto font-mono text-[10.5px] text-faint">{hover !== null && auto.points[hover] ? fmt(auto.points[hover].v) : ''}</span>
      </div>
      <div
        ref={box}
        className="relative min-h-0 flex-1 cursor-crosshair select-none"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* ignore */
          }
          beginGesture()
          const i = hit(e)
          if (i >= 0) {
            drag.current = { index: i }
            return
          }
          const p = toPoint(e)
          const next = [...auto.points, p].sort((a, b) => a.t - b.t)
          st.setAutomationPoints(auto.id, next)
          drag.current = { index: next.indexOf(p) }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) {
            const i = hit(e)
            setHover(i >= 0 ? i : null)
            return
          }
          const cur = useProject.getState().automations[auto.id]?.points ?? []
          const p = toPoint(e)
          const next = cur.map((q, i) => (i === d.index ? p : q))
          // keep the dragged point's identity while the list re-sorts
          const sorted = [...next].sort((a, b) => a.t - b.t)
          d.index = sorted.indexOf(p)
          setHover(d.index)
          st.setAutomationPoints(auto.id, sorted)
        }}
        onPointerUp={() => {
          drag.current = null
          endGesture()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          const i = hit(e)
          if (i >= 0 && auto.points.length > 1) st.setAutomationPoints(auto.id, auto.points.filter((_, j) => j !== i))
        }}
      >
        <svg width={size.w} height={size.h} className="absolute inset-0">
          {Array.from({ length: Math.floor(clipLen / BAR) + 1 }, (_, i) => (
            <g key={i}>
              <line x1={x(i * BAR)} x2={x(i * BAR)} y1={PAD} y2={PAD + H} className="stroke-line-strong" />
              <text x={x(i * BAR) + 3} y={PAD + 10} className="fill-faint font-mono text-[9px]">
                {i + 1}
              </text>
            </g>
          ))}
          {[0.25, 0.5, 0.75].map((v) => (
            <line key={v} x1={PAD} x2={PAD + W} y1={y(v)} y2={y(v)} className="stroke-line" strokeDasharray="2 4" />
          ))}
          <path d={`${path}L${x(clipLen)},${y(0)}L${x(0)},${y(0)}Z`} className="fill-ink/5" />
          <path d={path} fill="none" className="stroke-ink" strokeWidth={1.5} />
          {auto.points.map((p, i) => (
            <circle key={i} cx={x(p.t)} cy={y(p.v)} r={hover === i ? 5.5 : 4} className={cn('stroke-ink', hover === i ? 'fill-ink' : 'fill-paper')} strokeWidth={1.5} />
          ))}
        </svg>
      </div>
      <p className="shrink-0 border-t border-line px-3 py-1 text-[10.5px] text-faint">
        Click to add a point · drag to move · right-click to delete · plays in SONG mode where its clip sits in the Playlist
      </p>
    </div>
  )
}
