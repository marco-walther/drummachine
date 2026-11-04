/** PCM WAV encoding (pure, unit-tested). Interleaves channels; 16- or 24-bit integer. */

export type BitDepth = 16 | 24

export function encodeWav(channels: Float32Array[], sampleRate: number, bits: BitDepth = 16): Uint8Array {
  const numCh = Math.max(1, channels.length)
  const frames = channels[0]?.length ?? 0
  const bytesPer = bits / 8
  const dataSize = frames * numCh * bytesPer
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, 36 + dataSize, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, numCh, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * numCh * bytesPer, true)
  v.setUint16(32, numCh * bytesPer, true)
  v.setUint16(34, bits, true)
  text(36, 'data')
  v.setUint32(40, dataSize, true)
  let o = 44
  const max = bits === 16 ? 0x7fff : 0x7fffff
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]?.[i] ?? 0))
      const n = Math.round(s * max)
      if (bits === 16) {
        v.setInt16(o, n, true)
      } else {
        v.setUint8(o, n & 0xff)
        v.setUint8(o + 1, (n >> 8) & 0xff)
        v.setUint8(o + 2, (n >> 16) & 0xff)
      }
      o += bytesPer
    }
  }
  return new Uint8Array(buf)
}

/** Join captured blocks into one buffer per channel. */
export function concatBlocks(blocks: Float32Array[][], numCh = 2): Float32Array[] {
  const total = blocks.reduce((n, b) => n + (b[0]?.length ?? 0), 0)
  const out = Array.from({ length: numCh }, () => new Float32Array(total))
  let o = 0
  for (const b of blocks) {
    const len = b[0]?.length ?? 0
    for (let c = 0; c < numCh; c++) out[c].set(b[c] ?? b[0], o)
    o += len
  }
  return out
}

/** Peak absolute sample (0 = silent): stems that never made a sound are skipped. */
export function peakOf(channels: Float32Array[]): number {
  let p = 0
  for (const ch of channels) for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i]))
  return p
}
