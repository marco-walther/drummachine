import { phraseToNotes, takePhrase } from '@/input/capture'
import { selectCurrentPattern, useProject } from '@/state/project'
import { toast } from '@/state/toasts'
import { BAR_TICKS } from './geometry'
import { usePianoRollUi } from './ui-state'

/**
 * "Add what I just played": the last phrase played on the channel becomes
 * Piano Roll notes (snapped to the Piano Roll snap) — at the start of the
 * pattern if the channel has no notes yet, otherwise after them on the next
 * bar, so nothing is overwritten. Saved with the project like any notes.
 */
export function captureToPianoRoll(channelId: string): number {
  const phrase = takePhrase(channelId)
  if (phrase.length === 0) {
    toast('Nothing new played on this channel. Play some keys, then press Capture.', 'error')
    return 0
  }
  const state = useProject.getState()
  const snap = usePianoRollUi.getState().snap
  const captured = phraseToNotes(phrase, state.bpm, snap)
  const existing = selectCurrentPattern(state).notes[channelId] ?? []
  const end = existing.reduce((m, n) => Math.max(m, n.tick + n.length), 0)
  const at = existing.length ? Math.ceil(end / BAR_TICKS) * BAR_TICKS : 0
  const placed = captured.map((n) => ({ ...n, tick: n.tick + at }))
  state.setChannelNotes(channelId, [...existing, ...placed])
  usePianoRollUi.setState({ selected: placed.map((n) => n.id) })
  toast(`Added ${placed.length} played note${placed.length === 1 ? '' : 's'} to the Piano Roll`)
  return placed.length
}
