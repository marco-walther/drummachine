import * as Tone from 'tone'
import type { ChannelSource, InstrumentKind, InstrumentParams } from '@/state/types'
import { midiToHz, monotonic } from './util'
import type { Voice } from './voices'

/**
 * Built-in melodic instruments, all synthesized (no sample downloads):
 *   piano: FM electric-piano style keys     synth: saw lead with filter envelope
 *   bass:  mono saw bass with glide          pad:   detuned saws, slow attack
 *   pluck: Karplus-Strong string (pool)
 * Each maps the shared params (attack, release, brightness, glide).
 */

const sq = (x: number) => x * x

function pianoOptions(p: InstrumentParams) {
  return {
    harmonicity: 1,
    modulationIndex: 1.5 + p.brightness * 9,
    oscillator: { type: 'sine' as const },
    modulation: { type: 'sine' as const },
    envelope: { attack: p.attack, decay: 2.4, sustain: 0.06, release: p.release },
    modulationEnvelope: { attack: 0.002, decay: 0.5 + p.brightness * 0.6, sustain: 0.04, release: p.release * 0.6 }
  }
}

function synthOptions(p: InstrumentParams) {
  return {
    oscillator: { type: 'sawtooth' as const },
    filter: { Q: 2, type: 'lowpass' as const, rolloff: -24 as const },
    envelope: { attack: p.attack, decay: 0.2, sustain: 0.6, release: p.release },
    filterEnvelope: { attack: 0.004, decay: 0.3, sustain: 0.4, release: p.release, baseFrequency: 180 + sq(p.brightness) * 3200, octaves: 3 }
  }
}

function padOptions(p: InstrumentParams) {
  return {
    oscillator: { type: 'fatsawtooth' as const, count: 3, spread: 28 },
    filter: { Q: 1, type: 'lowpass' as const, rolloff: -12 as const },
    envelope: { attack: p.attack, decay: 0.6, sustain: 0.85, release: p.release },
    filterEnvelope: { attack: Math.max(0.2, p.attack), decay: 1, sustain: 0.7, release: p.release, baseFrequency: 140 + sq(p.brightness) * 1800, octaves: 2.5 }
  }
}

function bassOptions(p: InstrumentParams) {
  return {
    portamento: p.glide,
    oscillator: { type: 'sawtooth' as const },
    filter: { Q: 4, type: 'lowpass' as const, rolloff: -24 as const },
    envelope: { attack: p.attack, decay: 0.25, sustain: 0.55, release: p.release },
    filterEnvelope: { attack: 0.002, decay: 0.22, sustain: 0.3, release: p.release, baseFrequency: 55 + sq(p.brightness) * 1100, octaves: 3.5 }
  }
}

/** PolySynth keeps its voices private; slides need their detune. */
type DetunableVoice = { detune: Tone.Signal<'cents'> }
const voicesOf = (synth: Tone.PolySynth) => (synth as unknown as { _voices: DetunableVoice[] })._voices ?? []

/** Shared shape for PolySynth-based instruments. */
function polyVoice(synth: Tone.PolySynth, out: Tone.Gain, options: (p: InstrumentParams) => object, initial: InstrumentParams): Voice {
  let params = initial
  let lastMidi: number | null = null
  // a normal note ends any slide bend
  const unbend = (time: number) => {
    for (const v of voicesOf(synth)) v.detune.setValueAtTime(0, time)
  }
  return {
    output: out,
    play: (time, midi, vel, duration) => {
      unbend(time)
      lastMidi = midi
      synth.triggerAttackRelease(midiToHz(midi), duration, time, vel)
    },
    hold: (time, midi, vel) => {
      unbend(time)
      lastMidi = midi
      const hz = midiToHz(midi)
      synth.triggerAttack(hz, time, vel)
      return (t) => synth.triggerRelease(hz, t)
    },
    glide: (time, midi, duration) => {
      if (lastMidi === null) return
      // bend everything that is sounding by the interval from the last note
      const cents = (midi - lastMidi) * 100
      for (const v of voicesOf(synth)) v.detune.linearRampTo(cents, Math.max(0.005, duration), time)
    },
    update: (src: ChannelSource) => {
      if (src.type !== 'instrument' || src.params === params) return
      params = src.params
      synth.set(options(params))
    },
    dispose: () => {
      synth.releaseAll()
      synth.dispose()
      out.dispose()
    }
  }
}

/** Monophonic bass: a new note cuts/glides from the previous one. */
function bassVoice(initial: InstrumentParams): Voice {
  let params = initial
  const out = new Tone.Gain(1)
  const synth = new Tone.MonoSynth(bassOptions(params)).connect(out)
  synth.volume.value = -9
  const at = monotonic()
  let current = 0 // id of the live note currently sounding
  return {
    output: out,
    play: (time, midi, vel, duration) => {
      const t = at(time)
      // a later scheduled note must not be cut by an earlier note's release
      synth.envelope.cancel(t)
      synth.filterEnvelope.cancel(t)
      synth.triggerAttack(midiToHz(midi), t, vel)
      synth.triggerRelease(t + duration)
    },
    hold: (time, midi, vel) => {
      const id = ++current
      synth.triggerAttack(midiToHz(midi), at(time), vel)
      return (t) => {
        if (current === id) synth.triggerRelease(at(t))
      }
    },
    glide: (time, midi, duration) => synth.frequency.exponentialRampTo(midiToHz(midi), Math.max(0.005, duration), time),
    update: (src) => {
      if (src.type !== 'instrument' || src.params === params) return
      params = src.params
      synth.set(bassOptions(params))
    },
    dispose: () => {
      synth.dispose()
      out.dispose()
    }
  }
}

/** Karplus-Strong plucks: PluckSynth is mono, so rotate through a small pool. */
function pluckVoice(initial: InstrumentParams): Voice {
  let params = initial
  const out = new Tone.Gain(1)
  const opts = (p: InstrumentParams) => ({
    attackNoise: 1,
    dampening: 1200 + p.brightness * 6500,
    release: Math.max(0.05, p.release * 0.5)
  })
  /**
   * Karplus-Strong loses energy once per period, so a fixed feedback makes high
   * notes die much faster. Pick the feedback per note so every pitch rings for
   * about the same time (≈ -60 dB after `ring` seconds; Release sets the ring).
   */
  const resonanceFor = (hz: number) => {
    const ring = 0.4 + Math.min(params.release, 4) * 1.4
    return Math.min(0.999, Math.pow(0.001, 1 / (hz * ring)))
  }
  const pool = Array.from({ length: 8 }, () => {
    const g = new Tone.Gain(0.8).connect(out)
    const s = new Tone.PluckSynth(opts(params)).connect(g)
    return { g, s, at: monotonic() }
  })
  let next = 0
  let last: (typeof pool)[number] | null = null
  const pluck = (time: number, midi: number, vel: number) => {
    const v = pool[next]
    last = v
    next = (next + 1) % pool.length
    const t = v.at(time)
    const hz = midiToHz(midi)
    // the comb filter's damping lowpass adds ~0.83 samples to the loop, which
    // makes plucks flat (≈16 cents at A5); shorten the delay to compensate
    const sr = v.s.context.sampleRate
    const tuned = 1 / Math.max(1 / hz - 0.83 / sr, 2 / sr)
    v.g.gain.setValueAtTime(vel, t)
    v.s.resonance = resonanceFor(hz) // read by triggerAttack
    // the noise burst is attackNoise periods long; at high notes one period (~2 ms)
    // is too short to survive scheduling jitter, so keep it ≥ ~6 ms
    v.s.attackNoise = Math.max(1, hz * 0.006)
    v.s.triggerAttack(tuned, t)
    return v
  }
  return {
    output: out,
    play: (time, midi, vel, duration) => {
      // a plucked string rings past a short sequencer note, then is damped
      const v = pluck(time, midi, vel)
      v.s.triggerRelease(time + Math.max(duration, 0.15))
    },
    hold: (time, midi, vel) => {
      const v = pluck(time, midi, vel)
      return (t) => v.s.triggerRelease(t)
    },
    glide: (time, midi, duration) => {
      // bend the ringing string by changing its comb-filter delay (period = 1/f)
      const comb = last && (last.s as unknown as { _lfcf?: { delayTime: Tone.Param<'time'> } })._lfcf
      if (!comb) return
      const sr = last!.s.context.sampleRate
      comb.delayTime.exponentialRampTo(Math.max(1 / midiToHz(midi) - 0.83 / sr, 2 / sr), Math.max(0.005, duration), time)
    },
    update: (src) => {
      if (src.type !== 'instrument' || src.params === params) return
      params = src.params
      for (const v of pool) v.s.set(opts(params))
    },
    dispose: () => {
      for (const v of pool) {
        v.s.dispose()
        v.g.dispose()
      }
      out.dispose()
    }
  }
}

export function createInstrumentVoice(kind: InstrumentKind, params: InstrumentParams): Voice {
  const out = new Tone.Gain(1)
  switch (kind) {
    case 'piano': {
      const synth = new Tone.PolySynth(Tone.FMSynth, pianoOptions(params)).connect(out)
      synth.volume.value = -9
      return polyVoice(synth, out, pianoOptions, params)
    }
    case 'synth': {
      const synth = new Tone.PolySynth(Tone.MonoSynth, synthOptions(params)).connect(out)
      synth.volume.value = -13
      return polyVoice(synth, out, synthOptions, params)
    }
    case 'pad': {
      const synth = new Tone.PolySynth(Tone.MonoSynth, padOptions(params)).connect(out)
      synth.volume.value = -17
      return polyVoice(synth, out, padOptions, params)
    }
    case 'bass':
      out.dispose()
      return bassVoice(params)
    case 'pluck':
      out.dispose()
      return pluckVoice(params)
  }
}
