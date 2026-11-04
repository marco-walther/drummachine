import { FX, formatParam, fromNorm, toNorm, type FxType } from './fx-defs'
import { INSTRUMENT_NAMES } from '@/state/instrument-defs'
import type { InstrumentParams, ParamRef, ProjectData } from '@/state/types'

/**
 * Automatable parameters: what a ParamRef means, its label, and how a
 * normalized 0..1 value maps onto the real value. Pure (unit-tested).
 */

export interface ParamInfo {
  ref: ParamRef
  label: string
  group: string
  /** normalized 0..1 → real value */
  toValue(n: number): number
  /** real value → normalized 0..1 */
  toNorm(v: number): number
  format(n: number): string
}

const lin = (min: number, max: number) => ({
  toValue: (n: number) => min + Math.min(1, Math.max(0, n)) * (max - min),
  toNorm: (v: number) => (v - min) / (max - min)
})
const pct = (n: number) => `${Math.round(n * 100)}%`
const panFmt = (v: number) => (Math.abs(v) < 0.01 ? 'C' : `${Math.round(Math.abs(v) * 100)}${v < 0 ? 'L' : 'R'}`)

const INST_RANGES: Record<keyof InstrumentParams, { label: string; min: number; max: number }> = {
  attack: { label: 'Attack', min: 0.001, max: 2 },
  release: { label: 'Release', min: 0.01, max: 4 },
  brightness: { label: 'Brightness', min: 0, max: 1 },
  glide: { label: 'Glide', min: 0, max: 0.4 }
}

type State = Pick<ProjectData, 'channels' | 'mixer'>

export function paramInfo(state: State, ref: ParamRef): ParamInfo | null {
  const [kind, a, b, c] = ref.split('.')
  if (kind === 'ch') {
    const ch = state.channels.find((x) => x.id === a)
    if (!ch) return null
    if (b === 'volume') return { ref, group: ch.name, label: `${ch.name} volume`, ...lin(0, 1), format: pct }
    if (b === 'pan') {
      const m = lin(-1, 1)
      return { ref, group: ch.name, label: `${ch.name} pan`, ...m, format: (n) => panFmt(m.toValue(n)) }
    }
    return null
  }
  if (kind === 'inst') {
    const ch = state.channels.find((x) => x.id === a)
    const r = INST_RANGES[b as keyof InstrumentParams]
    if (!ch || ch.source.type !== 'instrument' || !r) return null
    const m = lin(r.min, r.max)
    return {
      ref,
      group: ch.name,
      label: `${ch.name} ${r.label.toLowerCase()}`,
      ...m,
      format: (n) => (b === 'brightness' ? pct(n) : `${m.toValue(n).toFixed(2)} s`)
    }
  }
  if (kind === 'patch') {
    const ch = state.channels.find((x) => x.id === a)
    const node = ch?.source.type === 'patcher' ? ch.source.nodes.find((n) => n.id === b) : undefined
    if (!ch || !node || node.kind === 'out') return null
    const title = node.kind === 'inst' ? INSTRUMENT_NAMES[node.instrument] : FX[node.fx].label
    if (node.kind === 'fx') {
      const def = FX[node.fx].params[c]
      if (!def) return null
      return {
        ref,
        group: ch.name,
        label: `${ch.name} ${title} ${def.label.toLowerCase()}`,
        toValue: (n) => fromNorm(def, n),
        toNorm: (v) => toNorm(def, v),
        format: (n) => formatParam(def, fromNorm(def, n))
      }
    }
    if (c === 'level') return { ref, group: ch.name, label: `${ch.name} ${title} level`, ...lin(0, 1.5), format: (n) => pct(n * 1.5) }
    const r = INST_RANGES[c as keyof InstrumentParams]
    if (!r) return null
    const m = lin(r.min, r.max)
    return {
      ref,
      group: ch.name,
      label: `${ch.name} ${title} ${r.label.toLowerCase()}`,
      ...m,
      format: (n) => (c === 'brightness' ? pct(n) : `${m.toValue(n).toFixed(2)} s`)
    }
  }
  if (kind === 'mix') {
    const i = Number(a)
    const ins = state.mixer[i]
    if (!ins) return null
    const name = i === 0 ? 'Master' : `${i} ${ins.name}`
    if (b === 'volume') return { ref, group: name, label: `${name} volume`, ...lin(0, 1.25), format: (n) => pct(n * 1.25) }
    if (b === 'pan') {
      const m = lin(-1, 1)
      return { ref, group: name, label: `${name} pan`, ...m, format: (n) => panFmt(m.toValue(n)) }
    }
    return null
  }
  if (kind === 'fx') {
    const i = Number(a)
    const slot = state.mixer[i]?.fx.find((f) => f.id === b)
    const def = slot && FX[slot.type as FxType]?.params[c]
    if (!slot || !def) return null
    const name = i === 0 ? 'Master' : `${i} ${state.mixer[i].name}`
    return {
      ref,
      group: name,
      label: `${name} ${FX[slot.type as FxType].label} ${def.label.toLowerCase()}`,
      toValue: (n) => fromNorm(def, n),
      toNorm: (v) => toNorm(def, v),
      format: (n) => formatParam(def, fromNorm(def, n))
    }
  }
  return null
}

/** The parameter's current (saved) value, normalized: where a new automation starts. */
export function currentNorm(state: State, ref: ParamRef): number {
  const info = paramInfo(state, ref)
  if (!info) return 0.5
  const [kind, a, b, c] = ref.split('.')
  let v: number | undefined
  if (kind === 'ch') v = state.channels.find((x) => x.id === a)?.[b as 'volume' | 'pan']
  else if (kind === 'inst') {
    const src = state.channels.find((x) => x.id === a)?.source
    v = src?.type === 'instrument' ? src.params[b as keyof InstrumentParams] : undefined
  } else if (kind === 'patch') {
    const src = state.channels.find((x) => x.id === a)?.source
    const node = src?.type === 'patcher' ? src.nodes.find((n) => n.id === b) : undefined
    if (node?.kind === 'inst') v = c === 'level' ? node.level : node.params[c as keyof InstrumentParams]
    else if (node?.kind === 'fx') v = node.params[c]
  } else if (kind === 'mix') v = state.mixer[Number(a)]?.[b as 'volume' | 'pan']
  else if (kind === 'fx') v = state.mixer[Number(a)]?.fx.find((f) => f.id === b)?.params[c]
  return v === undefined ? 0.5 : Math.min(1, Math.max(0, info.toNorm(v)))
}

/** Everything a controller could be linked to, for pickers. */
export function listParams(state: State): ParamInfo[] {
  const refs: ParamRef[] = []
  for (const ch of state.channels) {
    refs.push(`ch.${ch.id}.volume`, `ch.${ch.id}.pan`)
    if (ch.source.type === 'instrument') for (const k of Object.keys(INST_RANGES)) refs.push(`inst.${ch.id}.${k}`)
    if (ch.source.type === 'patcher')
      for (const n of ch.source.nodes) {
        if (n.kind === 'inst') for (const k of ['level', ...Object.keys(INST_RANGES)]) refs.push(`patch.${ch.id}.${n.id}.${k}`)
        if (n.kind === 'fx') for (const k of Object.keys(FX[n.fx].params)) refs.push(`patch.${ch.id}.${n.id}.${k}`)
      }
  }
  state.mixer.forEach((ins, i) => {
    refs.push(`mix.${i}.volume`, `mix.${i}.pan`)
    for (const f of ins.fx) for (const k of Object.keys(FX[f.type as FxType].params)) refs.push(`fx.${i}.${f.id}.${k}`)
  })
  return refs.map((r) => paramInfo(state, r)).filter((p): p is ParamInfo => !!p)
}
