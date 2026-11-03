import { describe, expect, it } from 'vitest'
import { KEY_OFFSETS, keyToMidi, noteName, OFFSET_LABELS, parseMidi } from './notes'

const name = (code: string, octave = 5) => noteName(keyToMidi(code, octave)!)

describe('typing keyboard (user spec: piano layout, whites on home row, blacks above)', () => {
  it('home row plays the white keys C D E F G A B C D E F', () => {
    expect(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'].map((c) => name(c))).toEqual([
      'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6', 'E6', 'F6'
    ])
  })

  it('top row plays the black keys where they sit on a piano', () => {
    expect(['KeyW', 'KeyE', 'KeyT', 'KeyY', 'KeyU', 'KeyO', 'KeyP', 'BracketRight'].map((c) => name(c))).toEqual([
      'C#5', 'D#5', 'F#5', 'G#5', 'A#5', 'C#6', 'D#6', 'F#6'
    ])
  })

  it('gaps (R, I, [) and Enter are not note keys', () => {
    for (const code of ['KeyR', 'KeyI', 'BracketLeft', 'Enter', 'Space', 'KeyQ']) expect(keyToMidi(code, 5)).toBeNull()
  })

  it('covers every semitone once, follows the octave, stays in MIDI range', () => {
    const offsets = Object.values(KEY_OFFSETS).sort((a, b) => a - b)
    expect(offsets).toEqual(Array.from({ length: 19 }, (_, i) => i))
    expect(OFFSET_LABELS).toHaveLength(19)
    expect(keyToMidi('KeyA', 3)).toBe(36)
    expect(keyToMidi('KeyJ', 10)).toBeNull() // 131
  })
})

describe('MIDI parsing', () => {
  it('note on / off on any channel; velocity 0 = off', () => {
    expect(parseMidi([0x90, 60, 127])).toEqual({ type: 'on', key: 60, velocity: 1 })
    expect(parseMidi([0x93, 64, 64])).toMatchObject({ type: 'on', key: 64 })
    expect(parseMidi([0x80, 60, 0])).toEqual({ type: 'off', key: 60 })
    expect(parseMidi([0x90, 60, 0])).toEqual({ type: 'off', key: 60 })
  })
  it('ignores other messages', () => {
    expect(parseMidi([0xb0, 1, 64])).toBeNull()
    expect(parseMidi([0xf8])).toBeNull()
  })
})
