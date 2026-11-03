import { beforeEach, describe, expect, it, vi } from 'vitest'
import { beginGesture, endGesture, redo, resetHistory, undo, useHistory } from './history'
import { initialProject, useProject } from './project'

const s = () => useProject.getState()
const kick = () => s().channels[0].id
const steps = () => (s().patterns[0].notes[kick()] ?? []).length

beforeEach(() => {
  vi.useFakeTimers()
  useProject.setState(initialProject())
  resetHistory()
})

describe('undo / redo', () => {
  it('undoes and redoes separate edits', () => {
    s().toggleStep(kick(), 0)
    vi.advanceTimersByTime(1000)
    s().toggleStep(kick(), 4)
    expect(steps()).toBe(2)
    undo()
    expect(steps()).toBe(1)
    undo()
    expect(steps()).toBe(0)
    expect(undo()).toBe(false)
    redo()
    redo()
    expect(steps()).toBe(2)
  })

  it('rapid changes (a knob drag) become one step', () => {
    for (let i = 0; i < 20; i++) {
      s().setBpm(100 + i)
      vi.advanceTimersByTime(16)
    }
    expect(useHistory.getState().past).toHaveLength(1)
    undo()
    expect(s().bpm).toBe(130)
  })

  it('a gesture is one step even when slow', () => {
    beginGesture()
    s().toggleStep(kick(), 0)
    vi.advanceTimersByTime(2000)
    s().toggleStep(kick(), 1)
    endGesture()
    s().toggleStep(kick(), 2)
    expect(useHistory.getState().past).toHaveLength(2)
    undo()
    undo()
    expect(steps()).toBe(0)
  })

  it('a new edit clears redo', () => {
    s().toggleStep(kick(), 0)
    undo()
    vi.advanceTimersByTime(1000)
    s().setBpm(99)
    expect(redo()).toBe(false)
  })
})
