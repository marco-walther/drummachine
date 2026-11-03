import { describe, expect, it } from 'vitest'
import { makeNote } from '@/state/project'
import { arpeggiate, chop, legato, quantize, stampChord, strum, transpose } from './noteTools'

const n = (tick: number, key: number, length = 96) => makeNote(tick, { key, length })
const shape = (notes: { tick: number; key: number; length: number }[]) =>
  notes.map((x) => [x.tick, x.key, x.length]).sort((a, b) => a[0] - b[0] || a[1] - b[1])

describe('riff tools', () => {
  it('stamps chords on the clicked root', () => {
    expect(stampChord('min7', 57, 0, 96).map((x) => x.key)).toEqual([57, 60, 64, 67])
    expect(stampChord('power', 40, 24, 48).map((x) => [x.key, x.tick, x.length])).toEqual([
      [40, 24, 48],
      [47, 24, 48],
      [52, 24, 48]
    ])
    expect(stampChord('nope', 60, 0, 24)).toHaveLength(1)
  })

  it('quantizes starts; strength 0.5 moves halfway', () => {
    expect(quantize([n(30, 60)], 24).map((x) => x.tick)).toEqual([24])
    expect(quantize([n(30, 60)], 24, 0.5).map((x) => x.tick)).toEqual([27])
    expect(quantize([n(30, 60, 30)], 24, 1, true)[0].length).toBe(24)
  })

  it('chops notes into grid-sized pieces', () => {
    expect(shape(chop([n(0, 60, 60)], 24))).toEqual([
      [0, 60, 24],
      [24, 60, 24],
      [48, 60, 12]
    ])
  })

  it('strums chords and keeps note ends', () => {
    const out = strum([n(0, 60), n(0, 64), n(0, 67)], 6)
    expect(shape(out)).toEqual([
      [0, 60, 96],
      [6, 64, 90],
      [12, 67, 84]
    ])
    expect(shape(strum([n(0, 60), n(0, 64)], 6, 'up'))).toEqual([
      [0, 64, 96],
      [6, 60, 90]
    ])
  })

  it('arpeggiates a chord over its length', () => {
    const out = arpeggiate([n(0, 60, 96), n(0, 64, 96), n(0, 67, 96)], 24, 'up')
    expect(shape(out)).toEqual([
      [0, 60, 24],
      [24, 64, 24],
      [48, 67, 24],
      [72, 60, 24]
    ])
    const ud = arpeggiate([n(0, 60, 96), n(0, 64, 96), n(0, 67, 96)], 24, 'updown').map((x) => x.key)
    expect(ud).toEqual([60, 64, 67, 64])
  })

  it('transposes within MIDI range and makes lines legato', () => {
    expect(transpose([n(0, 126)], 5)[0].key).toBe(127)
    expect(shape(legato([n(0, 60, 10), n(48, 62, 10)]))).toEqual([
      [0, 60, 48],
      [48, 62, 10]
    ])
  })
})
