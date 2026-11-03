/** Pure note helpers for input (no audio imports, so they are unit-testable). */

/**
 * Typing keyboard, laid out like a piano (user spec): white keys on the home
 * row, black keys on the row above where they sit on a real keyboard.
 *
 *      W   E       T   Y   U       O   P       ]
 *    A   S   D   F   G   H   J   K   L   ;   '
 *    C C# D D# E F F# G G# A A# B  C C# D D# E F F#
 *
 * R, I and [ are the gaps (no black key between E–F and B–C), so they do nothing.
 * Enter is not a note key. Z / X shift the octave.
 */
export const KEY_OFFSETS: Readonly<Record<string, number>> = {
  KeyA: 0, // C
  KeyW: 1, // C#
  KeyS: 2, // D
  KeyE: 3, // D#
  KeyD: 4, // E
  KeyF: 5, // F
  KeyT: 6, // F#
  KeyG: 7, // G
  KeyY: 8, // G#
  KeyH: 9, // A
  KeyU: 10, // A#
  KeyJ: 11, // B
  KeyK: 12, // C
  KeyO: 13, // C#
  KeyL: 14, // D
  KeyP: 15, // D#
  Semicolon: 16, // E
  Quote: 17, // F
  BracketRight: 18 // F#
}

/** Label printed on each on-screen key, by offset from the octave's C. */
export const OFFSET_LABELS: readonly string[] = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', ';', "'", ']']

export const MIN_OCTAVE = 0
export const MAX_OCTAVE = 9

/** MIDI key for a physical key in the given octave (FL numbering: C5 = 60), or null. */
export function keyToMidi(code: string, octave: number): number | null {
  const offset = KEY_OFFSETS[code]
  if (offset === undefined) return null
  const midi = octave * 12 + offset
  return midi >= 0 && midi <= 127 ? midi : null
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** 60 → "C5" (FL numbering) */
export function noteName(midi: number): string {
  const m = Math.round(midi)
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12)}`
}

export type MidiEvent = { type: 'on'; key: number; velocity: number } | { type: 'off'; key: number } | null

/** Parse a raw MIDI message (any channel). Note-on with velocity 0 is a note-off. */
export function parseMidi(data: ArrayLike<number>): MidiEvent {
  if (data.length < 3) return null
  const cmd = data[0] & 0xf0
  const key = data[1] & 0x7f
  const vel = data[2] & 0x7f
  if (cmd === 0x90 && vel > 0) return { type: 'on', key, velocity: vel / 127 }
  if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) return { type: 'off', key }
  return null
}
