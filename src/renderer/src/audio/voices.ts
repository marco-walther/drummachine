import * as Tone from 'tone'
import type { ChannelSource, DrumPreset } from '@/state/types'

/** A sound generator for one channel. Output feeds the channel strip. */
export interface Voice {
  readonly output: Tone.ToneAudioNode
  trigger(time: number, velocity: number, semitones: number): void
  dispose(): void
}

const ratio = (semis: number) => Math.pow(2, semis / 12)

/** Mono Tone synths throw if two starts share a timestamp; nudge forward. */
function monotonic() {
  let last = -1
  return (t: number) => (last = t <= last ? last + 1e-4 : t)
}

type MembraneOpts = ConstructorParameters<typeof Tone.MembraneSynth>[0]

function membrane(baseHz: number, opts: MembraneOpts): Voice {
  const out = new Tone.Gain(1)
  const synth = new Tone.MembraneSynth(opts).connect(out)
  const at = monotonic()
  return {
    output: out,
    trigger: (time, vel, semis) => synth.triggerAttackRelease(baseHz * ratio(semis), 0.05, at(time), vel),
    dispose: () => {
      synth.dispose()
      out.dispose()
    }
  }
}

function noise(
  filter: { type: BiquadFilterType; hz: number; q?: number },
  decay: number,
  bursts: number[] = [0]
): Voice {
  const out = new Tone.Gain(1)
  const f = new Tone.Filter({ type: filter.type, frequency: filter.hz, Q: filter.q ?? 0.8 }).connect(out)
  const synth = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay, sustain: 0, release: 0.02 }
  }).connect(f)
  const at = monotonic()
  return {
    output: out,
    trigger: (time, vel, semis) => {
      f.frequency.setValueAtTime(filter.hz * ratio(semis), time)
      bursts.forEach((offset, i) =>
        synth.triggerAttackRelease(decay, at(time + offset), vel * (i === bursts.length - 1 ? 1 : 0.6))
      )
    },
    dispose: () => {
      synth.dispose()
      f.dispose()
      out.dispose()
    }
  }
}

function snare(): Voice {
  const out = new Tone.Gain(1)
  const body = membrane(185, {
    pitchDecay: 0.02,
    octaves: 1.5,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 }
  })
  const rattle = noise({ type: 'highpass', hz: 1400 }, 0.18)
  body.output.connect(out)
  rattle.output.connect(out)
  return {
    output: out,
    trigger: (time, vel, semis) => {
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

export function createDrumVoice(preset: DrumPreset): Voice {
  switch (preset) {
    case 'kick':
      return membrane(48, {
        pitchDecay: 0.05,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.1 }
      })
    case 'tom':
      return membrane(110, {
        pitchDecay: 0.08,
        octaves: 2.5,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 }
      })
    case 'snare':
      return snare()
    case 'clap':
      return noise({ type: 'bandpass', hz: 1200, q: 1.2 }, 0.16, [0, 0.011, 0.022, 0.033])
    case 'hat':
      return noise({ type: 'highpass', hz: 8000 }, 0.05)
    case 'openhat':
      return noise({ type: 'highpass', hz: 7500 }, 0.38)
  }
}

/** Decoded user samples by id. Filled by the sample browser (Phase 3). */
export const sampleBuffers = new Map<string, Tone.ToneAudioBuffer>()

function sampleVoice(sampleId: string): Voice {
  const out = new Tone.Gain(1)
  return {
    output: out,
    trigger: (time, vel, semis) => {
      const buffer = sampleBuffers.get(sampleId)
      if (!buffer?.loaded) return
      const src = new Tone.ToneBufferSource({ url: buffer, playbackRate: ratio(semis) })
      const g = new Tone.Gain(vel).connect(out)
      src.connect(g)
      src.onended = () => {
        src.dispose()
        g.dispose()
      }
      src.start(time)
    },
    dispose: () => out.dispose()
  }
}

export function createVoice(source: ChannelSource): Voice {
  return source.type === 'synth' ? createDrumVoice(source.preset) : sampleVoice(source.sampleId)
}

export function sourceKey(source: ChannelSource): string {
  return source.type === 'synth' ? `synth:${source.preset}` : `sample:${source.sampleId}`
}
