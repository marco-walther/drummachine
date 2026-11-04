/**
 * Built-in mixer effects: parameter definitions (pure data, unit-testable).
 * The audio nodes live in fx.ts. Every slot stores plain numbers; this file
 * says what each number means, its range and its default.
 */

export type FxType = 'eq' | 'compressor' | 'ducker' | 'filter' | 'delay' | 'reverb' | 'distortion' | 'limiter'

export interface ParamDef {
  label: string
  min: number
  max: number
  default: number
  /** how to show the value */
  unit: 'db' | 'hz' | 's' | 'ms' | '%' | 'ratio' | 'x' | 'choice'
  /** knob travel: exponential for frequencies/times */
  curve?: 'log'
  choices?: string[]
}

export interface FxDef {
  label: string
  /** has a dry/wet mix */
  wet: boolean
  params: Record<string, ParamDef>
}

export const FX: Record<FxType, FxDef> = {
  eq: {
    label: 'EQ (3-band)',
    wet: false,
    params: {
      low: { label: 'Low', min: -24, max: 12, default: 0, unit: 'db' },
      mid: { label: 'Mid', min: -24, max: 12, default: 0, unit: 'db' },
      high: { label: 'High', min: -24, max: 12, default: 0, unit: 'db' },
      lowFrequency: { label: 'Low/Mid', min: 60, max: 1000, default: 250, unit: 'hz', curve: 'log' },
      highFrequency: { label: 'Mid/High', min: 1000, max: 12000, default: 3000, unit: 'hz', curve: 'log' }
    }
  },
  compressor: {
    label: 'Compressor',
    wet: false,
    params: {
      threshold: { label: 'Threshold', min: -60, max: 0, default: -18, unit: 'db' },
      ratio: { label: 'Ratio', min: 1, max: 20, default: 4, unit: 'ratio' },
      attack: { label: 'Attack', min: 0.001, max: 0.3, default: 0.01, unit: 'ms', curve: 'log' },
      release: { label: 'Release', min: 0.02, max: 1, default: 0.15, unit: 'ms', curve: 'log' },
      makeup: { label: 'Makeup', min: 0, max: 24, default: 0, unit: 'db' }
    }
  },
  ducker: {
    label: 'Sidechain duck',
    wet: false,
    params: {
      depth: { label: 'Depth', min: 0, max: 1, default: 0.8, unit: '%' },
      sensitivity: { label: 'Sensitivity', min: 1, max: 20, default: 6, unit: 'x' },
      release: { label: 'Release', min: 0.02, max: 0.8, default: 0.18, unit: 'ms', curve: 'log' }
    }
  },
  filter: {
    label: 'Filter',
    wet: false,
    params: {
      mode: { label: 'Mode', min: 0, max: 2, default: 0, unit: 'choice', choices: ['Low-pass', 'High-pass', 'Band-pass'] },
      frequency: { label: 'Cutoff', min: 40, max: 18000, default: 2000, unit: 'hz', curve: 'log' },
      q: { label: 'Resonance', min: 0.3, max: 15, default: 1, unit: 'x', curve: 'log' }
    }
  },
  delay: {
    label: 'Delay',
    wet: true,
    params: {
      time: { label: 'Time', min: 0.02, max: 1.5, default: 0.375, unit: 'ms', curve: 'log' },
      feedback: { label: 'Feedback', min: 0, max: 0.9, default: 0.35, unit: '%' },
      mix: { label: 'Mix', min: 0, max: 1, default: 0.3, unit: '%' }
    }
  },
  reverb: {
    label: 'Reverb',
    wet: true,
    params: {
      decay: { label: 'Decay', min: 0.2, max: 10, default: 2.2, unit: 's', curve: 'log' },
      preDelay: { label: 'Pre-delay', min: 0, max: 0.2, default: 0.01, unit: 'ms' },
      mix: { label: 'Mix', min: 0, max: 1, default: 0.25, unit: '%' }
    }
  },
  distortion: {
    label: 'Distortion',
    wet: true,
    params: {
      drive: { label: 'Drive', min: 0, max: 1, default: 0.4, unit: '%' },
      mix: { label: 'Mix', min: 0, max: 1, default: 1, unit: '%' }
    }
  },
  limiter: {
    label: 'Limiter',
    wet: false,
    params: {
      threshold: { label: 'Ceiling', min: -24, max: 0, default: -1, unit: 'db' }
    }
  }
}

export const FX_TYPES = Object.keys(FX) as FxType[]

export function defaultParams(type: FxType): Record<string, number> {
  return Object.fromEntries(Object.entries(FX[type].params).map(([k, d]) => [k, d.default]))
}

/** Keep only known params, clamped; fill missing ones with defaults. */
export function normalizeParams(type: FxType, raw: unknown): Record<string, number> {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return Object.fromEntries(
    Object.entries(FX[type].params).map(([k, d]) => {
      const v = src[k]
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.min(d.max, Math.max(d.min, v)) : d.default
      return [k, d.unit === 'choice' ? Math.round(n) : n]
    })
  )
}

export function formatParam(def: ParamDef, v: number): string {
  switch (def.unit) {
    case 'db':
      return `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`
    case 'hz':
      return v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`
    case 's':
      return `${v.toFixed(2)} s`
    case 'ms':
      return v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`
    case '%':
      return `${Math.round(v * 100)}%`
    case 'ratio':
      return `${v.toFixed(1)}:1`
    case 'x':
      return `${v.toFixed(1)}`
    case 'choice':
      return def.choices?.[Math.round(v)] ?? String(v)
  }
}

/** Knob position 0..1 ⇄ value (log curve for frequencies/times). */
export function toNorm(def: ParamDef, v: number): number {
  if (def.curve === 'log') return Math.log(v / def.min) / Math.log(def.max / def.min)
  return (v - def.min) / (def.max - def.min)
}
export function fromNorm(def: ParamDef, n: number): number {
  const c = Math.min(1, Math.max(0, n))
  if (def.curve === 'log') return def.min * Math.pow(def.max / def.min, c)
  return def.min + c * (def.max - def.min)
}
