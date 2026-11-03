import { describe, expect, it } from 'vitest'
import { makeNote } from '@/state/project'
import { hitNote, keyToY, moveNotes, notesInBox, resizeNotes, snapFloor, snapRound, yToKey } from './geometry'

const n = (tick: number, key: number, length = 24) => makeNote(tick, { key, length })

describe('piano roll geometry', () => {
  it('keys ⇄ y round-trip, clamped', () => {
    expect(yToKey(keyToY(60) + 3)).toBe(60)
    expect(yToKey(-50)).toBe(127)
    expect(yToKey(99999)).toBe(0)
  })

  it('snaps', () => {
    expect(snapRound(37, 24)).toBe(48)
    expect(snapFloor(47, 24)).toBe(24)
    expect(snapRound(37, 1)).toBe(37)
  })

  it('hits the topmost note under the pointer, start-inclusive end-exclusive', () => {
    const a = n(0, 60, 48)
    const b = n(24, 60, 48)
    expect(hitNote([a, b], 30, 60)).toBe(b)
    expect(hitNote([a, b], 10, 60)).toBe(a)
    expect(hitNote([a, b], 72, 60)).toBeUndefined()
    expect(hitNote([a, b], 10, 61)).toBeUndefined()
  })

  it('box-selects intersecting notes in any drag direction', () => {
    const notes = [n(0, 60), n(48, 64), n(96, 70)]
    expect(notesInBox(notes, 60, 10, 65, 59).map((x) => x.key)).toEqual([60, 64])
  })

  it('moves a group by the grabbed note, snapped, never below 0 or outside keys', () => {
    const a = n(24, 60)
    const b = n(48, 64)
    expect(moveNotes([a, b], a, 30, 2, 24).map((x) => [x.tick, x.key])).toEqual([
      [48, 62],
      [72, 66]
    ])
    expect(moveNotes([a, b], b, -500, 0, 24).map((x) => x.tick)).toEqual([0, 24])
    expect(moveNotes([a, b], a, 0, 100, 24).map((x) => x.key)).toEqual([123, 127])
  })

  it('resizes a group, snapped, with a minimum of one snap', () => {
    const a = n(0, 60, 24)
    const b = n(0, 64, 48)
    expect(resizeNotes([a, b], a, 30, 24).map((x) => x.length)).toEqual([48, 72])
    expect(resizeNotes([a, b], a, -100, 24).map((x) => x.length)).toEqual([24, 48])
  })
})
