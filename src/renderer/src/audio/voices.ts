import * as Tone from 'tone'
import { ROOT_KEY, type ChannelSource, type DrumPreset, type SampleSource } from '@/state/types'
import { patchKey } from '@/state/patch'
import { createInstrumentVoice } from './instruments'
import { createPatcherVoice } from './patcher'
import { monotonic, ratio } from './util'

/**
 * A sound generator for one channel; its output feeds the channel strip.
 * Pitches are absolute MIDI numbers (may be fractional: cents), 60 = C5.
 */
export interface Voice {
  readonly output: Tone.ToneAudioNode
  /** scheduled note (sequencer / Piano Roll) */
  play(time: number, midi: number, velocity: number, duration: number): void
  /** live note (keyboard / MIDI): returns a function that releases it */
  hold(time: number, midi: number, velocity: number): (time: number) => void
  /**
   * Slide note: glide the sounding note(s) to `midi` over `duration` instead of
   * starting a new note. Instruments without pitch (drums) ignore it.
   */
  glide(time: number, midi: number, duration: number): void
  /** apply changed settings in place (no rebuild, no dropped notes) */
  update(source: ChannelSource): void
  dispose(): void
}

const noop = () => {}

/** Drums ignore duration and note-off; pitch is relative to C5. */
function drum(trigger: (time: number, vel: number, semis: number) => void, output: Tone.ToneAudioNode, dispose: () => void): Voice {
  return {
    output,
    play: (time, midi, vel) => trigger(time, vel, midi - ROOT_KEY),
    hold: (time, midi, vel) => {
      trigger(time, vel, midi - ROOT_KEY)
      return noop
    },
    glide: noop,
    update: noop,
    dispose
  }
}

type MembraneOpts = ConstructorParameters<typeof Tone.MembraneSynth>[0]

function membrane(baseHz: number, opts: MembraneOpts) {
  const out = new Tone.Gain(1)
  const synth = new Tone.MembraneSynth(opts).connect(out)
  const at = monotonic()
  const trigger = (time: number, vel: number, semis: number) =>
    synth.triggerAttackRelease(baseHz * ratio(semis), 0.05, at(time), vel)
  return {
    out,
    trigger,
    dispose: () => {
      synth.dispose()
      out.dispose()
    }
  }
}

function noise(filter: { type: BiquadFilterType; hz: number; q?: number }, decay: number, bursts: number[] = [0]) {
  const out = new Tone.Gain(1)
  const f = new Tone.Filter({ type: filter.type, frequency: filter.hz, Q: filter.q ?? 0.8 }).connect(out)
  const synth = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay, sustain: 0, release: 0.02 }
  }).connect(f)
  const at = monotonic()
  const trigger = (time: number, vel: number, semis: number) => {
    f.frequency.setValueAtTime(filter.hz * ratio(semis), time)
    bursts.forEach((offset, i) => synth.triggerAttackRelease(decay, at(time + offset), vel * (i === bursts.length - 1 ? 1 : 0.6)))
  }
  return {
    out,
    trigger,
    dispose: () => {
      synth.dispose()
      f.dispose()
      out.dispose()
    }
  }
}

function drumParts(preset: DrumPreset) {
  switch (preset) {
    case 'kick':
      return membrane(48, { pitchDecay: 0.05, octaves: 6, envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.1 } })
    case 'tom':
      return membrane(110, { pitchDecay: 0.08, octaves: 2.5, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 } })
    case 'snare': {
      const out = new Tone.Gain(1)
      const body = membrane(185, { pitchDecay: 0.02, octaves: 1.5, envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 } })
      const rattle = noise({ type: 'highpass', hz: 1400 }, 0.18)
      body.out.connect(out)
      rattle.out.connect(out)
      return {
        out,
        trigger: (time: number, vel: number, semis: number) => {
          body.trigger(time, vel * 0.7, semis)
          rattle.trigger(time, vel, semis)
        },
        dispose: () => {
          body.dispose()
          rattle.dispose()
          out.dispose()
        }
      }
    }
    case 'clap':
      return noise({ type: 'bandpass', hz: 1200, q: 1.2 }, 0.16, [0, 0.011, 0.022, 0.033])
    case 'hat':
      return noise({ type: 'highpass', hz: 8000 }, 0.05)
    case 'openhat':
      return noise({ type: 'highpass', hz: 7500 }, 0.38)
  }
}

export function createDrumVoice(preset: DrumPreset): Voice {
  const p = drumParts(preset)
  return drum(p.trigger, p.out, p.dispose)
}

/** Decoded user samples by id (filled by audio/samples.ts). */
export const sampleBuffers = new Map<string, Tone.ToneAudioBuffer>()

/**
 * A user sample played at any pitch: `root` is the key that plays it as
 * recorded. One-shot plays the whole file; otherwise it stops at note end with
 * a release fade (instrument use, e.g. a guitar note on the keyboard).
 */
function sampleVoice(initial: SampleSource): Voice {
  let s = initial
  const out = new Tone.Gain(1)
  /** sources still playing (slides bend them) */
  const active = new Set<Tone.ToneBufferSource>()

  function start(time: number, midi: number, vel: number) {
    const buffer = sampleBuffers.get(s.sampleId)
    if (!buffer?.loaded) return null
    const node = new Tone.ToneBufferSource({ url: buffer, playbackRate: ratio(midi - s.root) })
    const g = new Tone.Gain(0).connect(out)
    node.connect(g)
    g.gain.setValueAtTime(0, time)
    g.gain.linearRampToValueAtTime(vel, time + Math.max(0.002, s.attack))
    active.add(node)
    node.onended = () => {
      active.delete(node)
      node.dispose()
      g.dispose()
    }
    node.start(time)
    return (t: number) => {
      const r = Math.max(0.005, s.release)
      g.gain.cancelAndHoldAtTime(t)
      g.gain.linearRampToValueAtTime(0, t + r)
      node.stop(t + r + 0.01)
    }
  }

  return {
    output: out,
    play: (time, midi, vel, duration) => {
      const stop = start(time, midi, vel)
      if (stop && !s.oneShot) stop(time + duration)
    },
    hold: (time, midi, vel) => {
      const stop = start(time, midi, vel)
      return (t) => {
        if (stop && !s.oneShot) stop(t)
      }
    },
    glide: (time, midi, duration) => {
      const target = ratio(midi - s.root)
      for (const node of active) node.playbackRate.exponentialRampTo(target, Math.max(0.005, duration), time)
    },
    update: (src) => {
      if (src.type === 'sample') s = src
    },
    dispose: () => out.dispose()
  }
}

export function createVoice(source: ChannelSource): Voice {
  switch (source.type) {
    case 'synth':
      return createDrumVoice(source.preset)
    case 'sample':
      return sampleVoice(source)
    case 'instrument':
      return createInstrumentVoice(source.kind, source.params)
    case 'patcher':
      return createPatcherVoice(source)
  }
}

/** Voices are rebuilt only when this changes; other settings go through update(). */
export function sourceKey(source: ChannelSource): string {
  switch (source.type) {
    case 'synth':
      return `synth:${source.preset}`
    case 'sample':
      return `sample:${source.sampleId}`
    case 'instrument':
      return `inst:${source.kind}`
    case 'patcher':
      return patchKey(source)
  }
}
