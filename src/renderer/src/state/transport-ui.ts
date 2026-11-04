import { create } from 'zustand'

/** Fast-changing playback state kept out of the project store (no undo, no save). */
export interface TransportUi {
  playing: boolean
  /** current step within the current pattern, -1 when stopped / not playing it */
  step: number
  /** song mode: current position in ticks, -1 when stopped */
  songTick: number
  /** song mode: where Play starts (ticks), set by clicking the Playlist ruler */
  songPosition: number
  /** record armed: live notes played while playing are written into the pattern */
  recording: boolean
}

export const useTransportUi = create<TransportUi>(() => ({
  playing: false,
  step: -1,
  songTick: -1,
  songPosition: 0,
  recording: false
}))
