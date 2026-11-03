import { describe, expect, it } from 'vitest'
import { makeNote } from '@/state/project'
import { STEP_TICKS } from '@/state/types'
import { gainToDb, notesInWindow, secondsPerTick, stepInPattern, swingDelayTicks } from './timing'

describe('timing', () => {
  it('secondsPerTick: a quarter note at 120 bpm is 0.5s', () => {
    expect(secondsPerTick(120) * 96).toBeCloseTo(0.5)
  })

  it('swing only delays off-beat 16ths', () => {
    expect(swingDelayTicks(0, 1)).toBe(0)
    expect(swingDelayTicks(STEP_TICKS, 1)).toBe(STEP_TICKS / 2)
    expect(swingDelayTicks(STEP_TICKS * 2, 1)).toBe(0)
    expect(swingDelayTicks(STEP_TICKS * 3, 0.5)).toBe(STEP_TICKS / 4)
    expect(swingDelayTicks(STEP_TICKS + 1, 1)).toBe(0) // off-grid notes are untouched
    expect(swingDelayTicks(STEP_TICKS, 0)).toBe(0)
  })

  it('stepInPattern wraps', () => {
    expect(stepInPattern(0, 16)).toBe(0)
    expect(stepInPattern(17, 16)).toBe(1)
    expect(stepInPattern(63, 32)).toBe(31)
  })

  it('notesInWindow is start-inclusive, end-exclusive', () => {
    const notes = [makeNote(0), makeNote(23), makeNote(24), makeNote(48)]
    expect(notesInWindow(notes, 0, STEP_TICKS).map((n) => n.tick)).toEqual([0, 23])
    expect(notesInWindow(notes, 24, STEP_TICKS).map((n) => n.tick)).toEqual([24])
    expect(notesInWindow(undefined, 0, 24)).toEqual([])
  })

  it('gainToDb', () => {
    expect(gainToDb(1)).toBe(0)
    expect(gainToDb(0)).toBe(-Infinity)
    expect(gainToDb(0.5)).toBeCloseTo(-6.02, 1)
  })
})
