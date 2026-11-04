/** Waveform overview for audio clips: max |amplitude| per bucket, cached. */

export interface PeakSource {
  sampleRate: number
  duration: number
  getChannelData(channel: number): Float32Array
}

const cache = new Map<string, Float32Array>()

/** `buckets` peaks (0..1) for [from, to) seconds of the source. */
export function computePeaks(src: PeakSource, from: number, to: number, buckets: number, key?: string): Float32Array {
  const id = key && `${key}|${from.toFixed(3)}|${to.toFixed(3)}|${buckets}`
  if (id && cache.has(id)) return cache.get(id)!
  const data = src.getChannelData(0)
  const out = new Float32Array(Math.max(0, buckets))
  const a = Math.max(0, Math.floor(from * src.sampleRate))
  const b = Math.min(data.length, Math.floor(to * src.sampleRate))
  const per = Math.max(1, (b - a) / Math.max(1, buckets))
  for (let i = 0; i < buckets; i++) {
    const s = Math.floor(a + i * per)
    const e = Math.min(b, Math.floor(a + (i + 1) * per))
    let m = 0
    // stride through long buckets: a peak overview doesn't need every sample
    const stride = Math.max(1, Math.floor((e - s) / 256))
    for (let j = s; j < e; j += stride) m = Math.max(m, Math.abs(data[j]))
    out[i] = Math.min(1, m)
  }
  if (id) {
    if (cache.size > 500) cache.clear()
    cache.set(id, out)
  }
  return out
}
