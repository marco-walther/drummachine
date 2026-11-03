/**
 * Root-note detection for samples: normalized autocorrelation (McLeod-style
 * peak picking) on a window after the attack transient.
 */

export function detectPitchHz(samples: Float32Array, sampleRate: number): number | null {
  // skip the attack (pick/hit noise), analyse ~93 ms
  const skip = Math.min(Math.floor(sampleRate * 0.05), Math.max(0, samples.length - 4096))
  const size = Math.min(4096, samples.length - skip)
  if (size < 512) return null
  const x = samples.subarray(skip, skip + size)

  let energy = 0
  for (let i = 0; i < size; i++) energy += x[i] * x[i]
  if (energy / size < 1e-6) return null // silence

  const minLag = Math.floor(sampleRate / 2000) // up to 2 kHz
  const maxLag = Math.min(Math.floor(sampleRate / 40), size - 1) // down to 40 Hz
  const nsdf = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acf = 0
    let m = 0
    for (let i = 0; i + lag < size; i++) {
      acf += x[i] * x[i + lag]
      m += x[i] * x[i] + x[i + lag] * x[i + lag]
    }
    nsdf[lag] = m > 0 ? (2 * acf) / m : 0
  }

  // first peak (after the curve dips below zero) that reaches 90% of the best peak
  let best = 0
  for (let lag = minLag; lag <= maxLag; lag++) best = Math.max(best, nsdf[lag])
  if (best < 0.5) return null // too noisy / unpitched
  let lag = minLag
  while (lag < maxLag && nsdf[lag] > 0) lag++ // leave the zero-lag lobe
  for (; lag < maxLag; lag++) {
    if (nsdf[lag] >= 0.9 * best && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
      // parabolic interpolation for sub-sample accuracy
      const a = nsdf[lag - 1]
      const b = nsdf[lag]
      const c = nsdf[lag + 1]
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1)
      return sampleRate / (lag + shift)
    }
  }
  return null
}

/**
 * Hz → nearest MIDI key. Keys are standard MIDI numbers (440 Hz = 69); note
 * names use FL's octave numbering, where 60 is "C5", so 69 displays as "A5".
 */
export function hzToMidi(hz: number): number {
  return Math.round(69 + 12 * Math.log2(hz / 440))
}
