import { create } from 'zustand'
import { engine } from '@/audio/engine'
import { useProject } from '@/state/project'
import { keyToMidi, MAX_OCTAVE, MIN_OCTAVE } from './notes'

/** Computer keyboard → notes on the selected channel (piano layout in ./notes.ts). Z / X shift the octave. */

export { noteName, OFFSET_LABELS } from './notes'

export const useTypingKeyboard = create<{ enabled: boolean; octave: number }>(() => ({ enabled: true, octave: 5 }))

export function shiftOctave(delta: number) {
  useTypingKeyboard.setState((s) => ({ octave: Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, s.octave + delta)) }))
}

/** physical key code → live note id (so key-up releases the right note after an octave change) */
const held = new Map<string, number | null>()

/** Returns true when the event was used as a note/octave key. */
export function handleNoteKeyDown(e: KeyboardEvent): boolean {
  const { enabled, octave } = useTypingKeyboard.getState()
  if (!enabled) return false
  if (e.code === 'KeyZ' || e.code === 'KeyX') {
    if (!e.repeat) shiftOctave(e.code === 'KeyZ' ? -1 : 1)
    return true
  }
  const midi = keyToMidi(e.code, octave)
  if (midi === null) return false
  if (e.repeat || held.has(e.code)) return true
  const channelId = useProject.getState().selectedChannelId
  held.set(e.code, channelId ? engine.noteOn(channelId, midi, 0.8) : null)
  return true
}

export function handleNoteKeyUp(e: KeyboardEvent): boolean {
  if (!held.has(e.code)) return false
  engine.noteOff(held.get(e.code)!)
  held.delete(e.code)
  return true
}

/** Window lost focus: release everything so no note hangs. */
export function releaseAllKeys() {
  for (const id of held.values()) engine.noteOff(id)
  held.clear()
}
