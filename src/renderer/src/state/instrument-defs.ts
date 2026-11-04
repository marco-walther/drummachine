import type { InstrumentKind, InstrumentParams } from './types'

/** Built-in instrument names and default settings (shared by channels and the Patcher). */

export const INSTRUMENT_NAMES: Record<InstrumentKind, string> = {
  piano: 'Piano',
  synth: 'Synth',
  bass: 'Bass',
  pad: 'Pad',
  pluck: 'Pluck'
}

export const INSTRUMENT_DEFAULTS: Record<InstrumentKind, InstrumentParams> = {
  piano: { attack: 0.002, release: 1.2, brightness: 0.45, glide: 0 },
  synth: { attack: 0.005, release: 0.25, brightness: 0.6, glide: 0 },
  bass: { attack: 0.003, release: 0.12, brightness: 0.35, glide: 0.04 },
  pad: { attack: 0.6, release: 1.8, brightness: 0.4, glide: 0 },
  pluck: { attack: 0.001, release: 0.6, brightness: 0.6, glide: 0 }
}

export const INSTRUMENT_KINDS = Object.keys(INSTRUMENT_DEFAULTS) as InstrumentKind[]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Keep instrument params in range (store edits and file loading). */
export function clampInstrumentParams(p: InstrumentParams): InstrumentParams {
  return {
    attack: clamp(p.attack, 0.001, 5),
    release: clamp(p.release, 0.01, 10),
    brightness: clamp(p.brightness, 0, 1),
    glide: clamp(p.glide, 0, 1)
  }
}
