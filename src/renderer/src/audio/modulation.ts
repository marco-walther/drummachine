import type { Automation, AutomationPoint, Clip, LfoShape, ParamRef, PlaylistTrack } from '@/state/types'

/** Automation curves and LFO shapes, pure (unit-tested). */

/** Curve value at `t` ticks into the clip (flat before the first / after the last point). */
export function automationValueAt(points: AutomationPoint[], t: number, smooth: boolean): number | null {
  if (points.length === 0) return null
  if (t <= points[0].t) return points[0].v
  const last = points[points.length - 1]
  if (t >= last.t) return last.v
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (t <= b.t) {
      const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t)
      const e = smooth ? (1 - Math.cos(f * Math.PI)) / 2 : f
      return a.v + (b.v - a.v) * e
    }
  }
  return last.v
}

export interface AutomationEvent {
  ref: ParamRef
  /** value at the window start / end (0..1) */
  from: number
  to: number
}

/** For a song window [T, T+span): what every playing automation clip sets. */
export function automationEvents(
  clips: Clip[],
  tracks: PlaylistTrack[],
  automations: Record<string, Automation>,
  T: number,
  span: number
): AutomationEvent[] {
  const muted = new Set(tracks.filter((t) => t.muted).map((t) => t.id))
  const out: AutomationEvent[] = []
  for (const c of clips) {
    if (c.kind !== 'automation' || !c.automationId || muted.has(c.trackId)) continue
    if (T + span <= c.start || T >= c.start + c.length) continue
    const auto = automations[c.automationId]
    if (!auto || auto.targets.length === 0) continue
    const into = (x: number) => Math.min(c.length, Math.max(0, x - c.start)) + c.offset
    const from = automationValueAt(auto.points, into(T), auto.smooth)
    const to = automationValueAt(auto.points, into(T + span), auto.smooth)
    if (from === null || to === null) continue
    for (const ref of auto.targets) out.push({ ref, from, to })
  }
  return out
}

/** A cheap repeatable "random" per cycle (sample & hold LFO). */
function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** LFO shape at phase (cycles; any real number), 0..1. */
export function lfoShape(shape: LfoShape, phase: number): number {
  const p = phase - Math.floor(phase)
  switch (shape) {
    case 'sine':
      return 0.5 - 0.5 * Math.cos(2 * Math.PI * p)
    case 'triangle':
      return p < 0.5 ? p * 2 : 2 - p * 2
    case 'square':
      return p < 0.5 ? 1 : 0
    case 'saw':
      return p
    case 'random':
      return hash01(Math.floor(phase))
  }
}

/** Controller output 0..1 from shape value, depth and center. */
export function lfoOutput(shape: LfoShape, phase: number, depth: number, center: number): number {
  return Math.min(1, Math.max(0, center + (lfoShape(shape, phase) - 0.5) * depth))
}

/** Peak follower step: rises instantly, falls with `release` seconds (exponential). */
export function followPeak(prev: number, level: number, dt: number, release: number): number {
  if (level >= prev) return level
  return level + (prev - level) * Math.exp(-dt / Math.max(0.005, release))
}
