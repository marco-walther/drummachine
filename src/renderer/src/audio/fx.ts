import * as Tone from 'tone'
import type { FxType } from './fx-defs'

/** Audio nodes for the built-in mixer effects (parameters are defined in fx-defs.ts). */

export interface FxNode {
  input: Tone.ToneAudioNode
  output: Tone.ToneAudioNode
  update(params: Record<string, number>): void
  dispose(): void
}

const FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass']

/**
 * Create an effect. `sidechain` is the insert's sidechain input (fed by
 * sidechain sends); only the Sidechain duck listens to it.
 */
export function createFx(type: FxType, params: Record<string, number>, sidechain: Tone.ToneAudioNode): FxNode {
  switch (type) {
    case 'eq': {
      const eq = new Tone.EQ3()
      const update = (p: Record<string, number>) => {
        eq.low.value = p.low
        eq.mid.value = p.mid
        eq.high.value = p.high
        eq.lowFrequency.value = p.lowFrequency
        eq.highFrequency.value = p.highFrequency
      }
      update(params)
      return { input: eq, output: eq, update, dispose: () => eq.dispose() }
    }
    case 'compressor': {
      const comp = new Tone.Compressor()
      const makeup = new Tone.Gain(1)
      comp.connect(makeup)
      const update = (p: Record<string, number>) => {
        comp.threshold.value = p.threshold
        comp.ratio.value = p.ratio
        comp.attack.value = p.attack
        comp.release.value = p.release
        makeup.gain.value = Tone.dbToGain(p.makeup)
      }
      update(params)
      return {
        input: comp,
        output: makeup,
        update,
        dispose: () => {
          comp.dispose()
          makeup.dispose()
        }
      }
    }
    case 'ducker': {
      // gain = 1 − min(depth, envelope × sensitivity), envelope from the sidechain input
      const duck = new Tone.Gain(1)
      const follower = new Tone.Follower(params.release)
      const shaper = new Tone.WaveShaper()
      const map = (p: Record<string, number>) => shaper.setMap((x) => -Math.min(p.depth, Math.max(0, x) * p.sensitivity))
      map(params)
      sidechain.connect(follower)
      follower.connect(shaper)
      shaper.connect(duck.gain)
      return {
        input: duck,
        output: duck,
        update: (p) => {
          map(p)
          follower.smoothing = p.release
        },
        dispose: () => {
          sidechain.disconnect(follower)
          follower.dispose()
          shaper.dispose()
          duck.dispose()
        }
      }
    }
    case 'filter': {
      const f = new Tone.Filter({ rolloff: -24 })
      const update = (p: Record<string, number>) => {
        f.type = FILTER_TYPES[Math.round(p.mode)] ?? 'lowpass'
        f.frequency.value = p.frequency
        f.Q.value = p.q
      }
      update(params)
      return { input: f, output: f, update, dispose: () => f.dispose() }
    }
    case 'delay': {
      const d = new Tone.FeedbackDelay({ maxDelay: 2 })
      const update = (p: Record<string, number>) => {
        d.delayTime.value = p.time
        d.feedback.value = p.feedback
        d.wet.value = p.mix
      }
      update(params)
      return { input: d, output: d, update, dispose: () => d.dispose() }
    }
    case 'reverb': {
      const r = new Tone.Reverb({ decay: params.decay, preDelay: params.preDelay, wet: params.mix })
      let decay = params.decay
      let pre = params.preDelay
      return {
        input: r,
        output: r,
        update: (p) => {
          r.wet.value = p.mix
          // changing the size re-renders the impulse response; only when it really changed
          if (Math.abs(p.decay - decay) > 0.05) r.decay = decay = p.decay
          if (Math.abs(p.preDelay - pre) > 0.002) r.preDelay = pre = p.preDelay
        },
        dispose: () => r.dispose()
      }
    }
    case 'distortion': {
      const d = new Tone.Distortion({ distortion: params.drive, wet: params.mix, oversample: '2x' })
      return {
        input: d,
        output: d,
        update: (p) => {
          d.distortion = p.drive
          d.wet.value = p.mix
        },
        dispose: () => d.dispose()
      }
    }
    case 'limiter': {
      const l = new Tone.Limiter(params.threshold)
      return { input: l, output: l, update: (p) => void (l.threshold.value = p.threshold), dispose: () => l.dispose() }
    }
  }
}
