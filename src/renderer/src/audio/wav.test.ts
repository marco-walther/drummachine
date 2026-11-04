import { describe, expect, it } from 'vitest'
import { concatBlocks, encodeWav, peakOf } from './wav'

const str = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.slice(o, o + n))

describe('WAV encoding', () => {
  it('writes a valid 16-bit stereo header and interleaved samples', () => {
    const L = Float32Array.from([0, 0.5, -1])
    const R = Float32Array.from([1, -0.5, 0])
    const wav = encodeWav([L, R], 48000, 16)
    const v = new DataView(wav.buffer)
    expect(str(wav, 0, 4)).toBe('RIFF')
    expect(str(wav, 8, 4)).toBe('WAVE')
    expect(v.getUint16(22, true)).toBe(2) // channels
    expect(v.getUint32(24, true)).toBe(48000)
    expect(v.getUint16(34, true)).toBe(16)
    expect(v.getUint32(40, true)).toBe(3 * 2 * 2)
    expect(wav.length).toBe(44 + 12)
    // frame 0: L=0, R=1 ; frame 1: L=0.5, R=-0.5 ; frame 2: L=-1 (clamped), R=0
    expect([v.getInt16(44, true), v.getInt16(46, true)]).toEqual([0, 32767])
    // ±0.5 × 32767 = ±16383.5; JS rounds halves up → 16384 / −16383
    expect([v.getInt16(48, true), v.getInt16(50, true)]).toEqual([16384, -16383])
    expect(v.getInt16(52, true)).toBe(-32767)
  })

  it('writes 24-bit little-endian samples', () => {
    const wav = encodeWav([Float32Array.from([1, -1])], 44100, 24)
    const v = new DataView(wav.buffer)
    expect(v.getUint16(34, true)).toBe(24)
    expect(v.getUint32(40, true)).toBe(2 * 3)
    const s0 = wav[44] | (wav[45] << 8) | (wav[46] << 16)
    expect(s0).toBe(0x7fffff)
  })

  it('joins captured blocks and finds silent stems', () => {
    const blocks = [
      [Float32Array.from([0.1, 0.2]), Float32Array.from([0, 0])],
      [Float32Array.from([0.3]), Float32Array.from([-0.9])]
    ]
    const [l, r] = concatBlocks(blocks)
    expect([...l].map((x) => +x.toFixed(1))).toEqual([0.1, 0.2, 0.3])
    expect(peakOf([l, r])).toBeCloseTo(0.9)
    expect(peakOf([new Float32Array(4)])).toBe(0)
  })
})
