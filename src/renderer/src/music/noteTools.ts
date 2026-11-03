import { makeNote } from '@/state/project'
import type { Note } from '@/state/types'

/**
 * Piano Roll "riff tools": pure functions over notes (ticks, PPQ 96). Each
 * returns a new array; callers decide what to apply them to (selection or all).
 */

export const CHORDS: Record<string, { label: string; intervals: number[] }> = {
  maj: { label: 'Major', intervals: [0, 4, 7] },
  min: { label: 'Minor', intervals: [0, 3, 7] },
  '7': { label: 'Dominant 7', intervals: [0, 4, 7, 10] },
  maj7: { label: 'Major 7', intervals: [0, 4, 7, 11] },
  min7: { label: 'Minor 7', intervals: [0, 3, 7, 10] },
  sus2: { label: 'Sus 2', intervals: [0, 2, 7] },
  sus4: { label: 'Sus 4', intervals: [0, 5, 7] },
  dim: { label: 'Diminished', intervals: [0, 3, 6] },
  aug: { label: 'Augmented', intervals: [0, 4, 8] },
  power: { label: 'Power (5th)', intervals: [0, 7, 12] }
}

const clampKey = (k: number) => Math.min(127, Math.max(0, k))

/** Notes of a chord built on `root` (the clicked key). */
export function stampChord(chord: string, root: number, tick: number, length: number, base: Partial<Note> = {}): Note[] {
  const def = CHORDS[chord]
  if (!def) return [makeNote(tick, { ...base, key: clampKey(root), length })]
  return def.intervals
    .map((i) => root + i)
    .filter((k) => k >= 0 && k <= 127)
    .map((key) => makeNote(tick, { ...base, key, length }))
}

/** Snap starts to the grid (strength 1 = fully). Lengths keep their end unless `lengths` is set. */
export function quantize(notes: Note[], grid: number, strength = 1, lengths = false): Note[] {
  return notes.map((n) => {
    const target = Math.round(n.tick / grid) * grid
    const tick = Math.max(0, Math.round(n.tick + (target - n.tick) * strength))
    const length = lengths ? Math.max(grid, Math.round(n.length / grid) * grid) : n.length
    return { ...n, tick, length }
  })
}

/** Cut each note into pieces of `size` ticks (the last piece keeps the remainder). */
export function chop(notes: Note[], size: number): Note[] {
  if (size <= 0) return notes
  return notes.flatMap((n) => {
    if (n.length <= size) return [n]
    const out: Note[] = []
    for (let t = 0; t < n.length; t += size) {
      out.push({ ...n, id: t === 0 ? n.id : makeNote(0).id, tick: n.tick + t, length: Math.min(size, n.length - t) })
    }
    return out
  })
}

/** Group notes that start together (chords). */
function chordsOf(notes: Note[]): Note[][] {
  const by = new Map<number, Note[]>()
  for (const n of notes) by.set(n.tick, [...(by.get(n.tick) ?? []), n])
  return [...by.values()].map((g) => g.sort((a, b) => a.key - b.key))
}

/**
 * Strum: within each chord, delay successive notes by `spread` ticks (low → high
 * for "down", high → low for "up"), keeping every note's end where it was.
 */
export function strum(notes: Note[], spread: number, direction: 'down' | 'up' = 'down'): Note[] {
  return chordsOf(notes).flatMap((chord) => {
    const order = direction === 'down' ? chord : [...chord].reverse()
    return order.map((n, i) => {
      const delay = Math.min(i * spread, Math.max(0, n.length - 1))
      return { ...n, tick: n.tick + delay, length: n.length - delay }
    })
  })
}

export type ArpPattern = 'up' | 'down' | 'updown'

/** Replace each chord by its notes played one after another every `rate` ticks over the chord's length. */
export function arpeggiate(notes: Note[], rate: number, pattern: ArpPattern = 'up'): Note[] {
  if (rate <= 0) return notes
  return chordsOf(notes).flatMap((chord) => {
    const up = chord
    const seq =
      pattern === 'up'
        ? up
        : pattern === 'down'
          ? [...up].reverse()
          : up.length > 2
            ? [...up, ...[...up].reverse().slice(1, -1)]
            : up
    const start = chord[0].tick
    const end = Math.max(...chord.map((n) => n.tick + n.length))
    const out: Note[] = []
    for (let t = start, i = 0; t < end; t += rate, i++) {
      const src = seq[i % seq.length]
      out.push({ ...src, id: makeNote(0).id, tick: t, length: Math.min(rate, end - t) })
    }
    return out
  })
}

export function transpose(notes: Note[], semis: number): Note[] {
  return notes.map((n) => ({ ...n, key: clampKey(n.key + semis) }))
}

/** Each note lasts until the next note starts (per voice line), FL "legato". */
export function legato(notes: Note[]): Note[] {
  const starts = [...new Set(notes.map((n) => n.tick))].sort((a, b) => a - b)
  return notes.map((n) => {
    const next = starts.find((s) => s > n.tick)
    return next === undefined ? n : { ...n, length: next - n.tick }
  })
}
