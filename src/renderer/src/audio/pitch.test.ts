import { describe, expect, it } from 'vitest'
import { detectPitchHz, hzToMidi } from './pitch'

const SR = 44100
function tone(hz: number, secs: number, harmonics: number[] = [1]) {
  const x = new Float32Array(Math.round(SR * secs))
  for (let i = 0; i < x.length; i++) {
    const t = i / SR
    let v = 0
    harmonics.forEach((amp, h) => (v += amp * Math.sin(2 * Math.PI * hz * (h + 1) * t)))
    x[i] = v * Math.exp(-t * 2) * 0.5
  }
  return x
}

describe('root note detection', () => {
  it('finds A (440 Hz) in a sine', () => {
    const hz = detectPitchHz(tone(440, 0.5), SR)!
    expect(Math.abs(hz - 440)).toBeLessThan(2)
    expect(hzToMidi(hz)).toBe(69)
  })

  it('finds the fundamental of a guitar-like tone with strong overtones (A2 = 110 Hz)', () => {
    const hz = detectPitchHz(tone(110, 0.6, [0.6, 1, 0.7, 0.5, 0.3]), SR)!
    expect(hzToMidi(hz)).toBe(hzToMidi(110))
  })

  it('gives up on noise and silence instead of guessing', () => {
    const noise = Float32Array.from({ length: SR / 2 }, () => Math.random() * 2 - 1)
    expect(detectPitchHz(noise, SR)).toBeNull()
    expect(detectPitchHz(new Float32Array(SR / 2), SR)).toBeNull()
  })
})
