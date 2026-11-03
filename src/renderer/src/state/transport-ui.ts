import { create } from 'zustand'

/** Fast-changing playback state kept out of the project store (no undo, no save). */
export interface TransportUi {
  playing: boolean
  /** current step within the pattern, -1 when stopped */
  step: number
}

export const useTransportUi = create<TransportUi>(() => ({ playing: false, step: -1 }))
