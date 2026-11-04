import { PPQ, STEP_TICKS, type Note } from '@/state/types'

export function secondsPerTick(bpm: number): number {
  return 60 / (bpm * PPQ)
}

/**
 * Swing delay in ticks for a note start. Only notes that fall exactly on an
 * off-beat 16th (2nd, 4th, … step) are pushed late; swing 1 = half a step.
 */
export function swingDelayTicks(tick: number, swing: number): number {
  if (swing <= 0) return 0
  return tick % (STEP_TICKS * 2) === STEP_TICKS ? swing * STEP_TICKS * 0.5 : 0
}

/** Step index inside a pattern for an absolute step counter (pattern loops). */
export function stepInPattern(absoluteStep: number, lengthSteps: number): number {
  return ((absoluteStep % lengthSteps) + lengthSteps) % lengthSteps
}

/** Notes starting in [startTick, startTick + span). */
export function notesInWindow(notes: Note[] | undefined, startTick: number, span: number): Note[] {
  if (!notes || notes.length === 0) return []
  const end = startTick + span
  return notes.filter((n) => n.tick >= startTick && n.tick < end)
}

/**
 * Live-recorded note → pattern note: start snaps to the nearest `snap` (the
 * Piano Roll's snap; 1 = exact), wrapping at the pattern end; length snaps to
 * whole snaps, at least one snap and at most the pattern length.
 */
export function quantizeRecorded(
  startTick: number,
  heldTicks: number,
  patternLength: number,
  snap = STEP_TICKS
): { tick: number; length: number } {
  const s = Math.max(1, snap)
  const tick = (Math.round(startTick / s) * s) % patternLength
  const length = Math.min(patternLength, Math.max(s, Math.round(heldTicks / s) * s))
  return { tick, length }
}

/** Linear gain → decibels for Tone volume params. */
export function gainToDb(g: number): number {
  return g <= 0 ? -Infinity : 20 * Math.log10(g)
}
