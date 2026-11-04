import { FX, defaultParams, normalizeParams, type FxType } from '@/audio/fx-defs'
import { INSTRUMENT_DEFAULTS, INSTRUMENT_KINDS, clampInstrumentParams } from './instrument-defs'
import type {
  InstrumentKind,
  PatchFxNode,
  PatchInstNode,
  PatchNode,
  PatchWire,
  PatcherSource
} from './types'

/**
 * Patcher graphs (pure, unit-tested): generators → effects → output.
 * Generators have an output only, the output node an input only, effects both.
 * Fan-out and fan-in are allowed; loops are not.
 */

export const PATCH_OUT = 'out'
export const MAX_PATCH_NODES = 16
/** The sidechain duck needs a mixer sidechain input, which a Patcher doesn't have. */
export const PATCH_FX_TYPES: FxType[] = (Object.keys(FX) as FxType[]).filter((t) => t !== 'ducker')

const newId = (): string => crypto.randomUUID().slice(0, 8)

export function makeInstNode(instrument: InstrumentKind, x = 24, y = 24, id = newId()): PatchInstNode {
  return { id, kind: 'inst', instrument, params: { ...INSTRUMENT_DEFAULTS[instrument] }, level: 0.8, transpose: 0, lo: 0, hi: 127, x, y }
}

export function makeFxNode(fx: FxType, x = 240, y = 24, id = newId()): PatchFxNode {
  return { id, kind: 'fx', fx, params: defaultParams(fx), x, y }
}

/** A new Patcher: one Synth into the output. */
export function defaultPatch(): PatcherSource {
  const inst = makeInstNode('synth', 24, 40)
  return {
    type: 'patcher',
    nodes: [inst, { id: PATCH_OUT, kind: 'out', x: 460, y: 40 }],
    wires: [{ from: inst.id, to: PATCH_OUT }]
  }
}

export const hasOutput = (n: PatchNode | undefined) => !!n && n.kind !== 'out'
export const hasInput = (n: PatchNode | undefined) => !!n && n.kind !== 'inst'

/** Is `to` reachable from `from` along wires? */
function reaches(wires: PatchWire[], from: string, to: string): boolean {
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length) {
    const id = stack.pop()!
    if (id === to) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const w of wires) if (w.from === id) stack.push(w.to)
  }
  return false
}

export type ConnectResult = 'ok' | 'invalid' | 'exists' | 'loop'

export function canConnect(src: Pick<PatcherSource, 'nodes' | 'wires'>, from: string, to: string): ConnectResult {
  const a = src.nodes.find((n) => n.id === from)
  const b = src.nodes.find((n) => n.id === to)
  if (from === to || !hasOutput(a) || !hasInput(b)) return 'invalid'
  if (src.wires.some((w) => w.from === from && w.to === to)) return 'exists'
  // the new wire from→to closes a loop if `from` is already downstream of `to`
  if (reaches(src.wires, to, from)) return 'loop'
  return 'ok'
}

/** Nodes whose sound reaches the output (the others are silent). */
export function audibleNodes(src: Pick<PatcherSource, 'nodes' | 'wires'>): Set<string> {
  return new Set(src.nodes.filter((n) => reaches(src.wires, n.id, PATCH_OUT)).map((n) => n.id))
}

/** Where a new node of this kind goes: its column, under the lowest node there. */
export function freeSpot(nodes: PatchNode[], kind: 'inst' | 'fx'): { x: number; y: number } {
  const x = kind === 'inst' ? 24 : 240
  const col = nodes.filter((n) => n.kind === kind)
  return { x, y: col.length ? Math.max(...col.map((n) => n.y)) + 76 : 40 }
}

/**
 * Voices are rebuilt only when the graph's shape changes (nodes added/removed,
 * instrument/effect swapped, wires); knob moves and node dragging are applied in place.
 */
export function patchKey(src: PatcherSource): string {
  const nodes = src.nodes.map((n) => (n.kind === 'inst' ? `${n.id}:${n.instrument}` : n.kind === 'fx' ? `${n.id}:${n.fx}` : n.id))
  const wires = src.wires.map((w) => `${w.from}>${w.to}`)
  return `patch:${nodes.join(',')}|${wires.join(',')}`
}

// ---- loading ----

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, d: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d
const pos = (v: unknown, d: number) => Math.round(num(v, d, 0, 4000))

function readNode(v: unknown): PatchNode | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null
  if (v.kind === 'out') return { id: PATCH_OUT, kind: 'out', x: pos(v.x, 460), y: pos(v.y, 40) }
  if (v.id === PATCH_OUT) return null
  if (v.kind === 'inst' && INSTRUMENT_KINDS.includes(v.instrument as InstrumentKind)) {
    const instrument = v.instrument as InstrumentKind
    const d = INSTRUMENT_DEFAULTS[instrument]
    const p = isObj(v.params) ? v.params : {}
    const lo = Math.round(num(v.lo, 0, 0, 127))
    return {
      id: v.id,
      kind: 'inst',
      instrument,
      params: clampInstrumentParams({
        attack: num(p.attack, d.attack, -Infinity, Infinity),
        release: num(p.release, d.release, -Infinity, Infinity),
        brightness: num(p.brightness, d.brightness, -Infinity, Infinity),
        glide: num(p.glide, d.glide, -Infinity, Infinity)
      }),
      level: num(v.level, 0.8, 0, 1.5),
      transpose: Math.round(num(v.transpose, 0, -48, 48)),
      lo,
      hi: Math.max(lo, Math.round(num(v.hi, 127, 0, 127))),
      x: pos(v.x, 24),
      y: pos(v.y, 40)
    }
  }
  if (v.kind === 'fx' && PATCH_FX_TYPES.includes(v.fx as FxType)) {
    const fx = v.fx as FxType
    return { id: v.id, kind: 'fx', fx, params: normalizeParams(fx, v.params), x: pos(v.x, 240), y: pos(v.y, 40) }
  }
  return null
}

/** Defensive read of a saved Patcher: drops bad nodes/wires, never loops, always one output. */
export function normalizePatch(v: Record<string, unknown>): PatcherSource {
  const nodes: PatchNode[] = []
  const ids = new Set<string>()
  for (const raw of Array.isArray(v.nodes) ? v.nodes : []) {
    const n = readNode(raw)
    if (!n || ids.has(n.id)) continue
    if (n.kind !== 'out' && nodes.filter((x) => x.kind !== 'out').length >= MAX_PATCH_NODES) continue
    ids.add(n.id)
    nodes.push(n)
  }
  if (!ids.has(PATCH_OUT)) nodes.push({ id: PATCH_OUT, kind: 'out', x: 460, y: 40 })
  const src: PatcherSource = { type: 'patcher', nodes, wires: [] }
  for (const w of Array.isArray(v.wires) ? v.wires : []) {
    if (!isObj(w) || typeof w.from !== 'string' || typeof w.to !== 'string') continue
    if (canConnect(src, w.from, w.to) === 'ok') src.wires.push({ from: w.from, to: w.to })
  }
  return src
}

/** Display name for a node. */
export function nodeTitle(n: PatchNode, names: Record<InstrumentKind, string>): string {
  if (n.kind === 'inst') return names[n.instrument]
  if (n.kind === 'fx') return FX[n.fx].label
  return 'Output'
}
