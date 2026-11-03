import { create } from 'zustand'
import { STEP_TICKS } from '@/state/types'

/** Piano Roll view state (not saved in the project, not undoable). */

export type Lane = 'velocity' | 'pan' | 'finePitch' | 'cutoff'
export type Tool = 'draw' | 'select'

export interface PianoRollUi {
  tool: Tool
  snap: number
  chord: string | null
  slide: boolean
  ghosts: boolean
  lane: Lane
  /** pixels per tick */
  zoom: number
  selected: string[]
  /** length used for new notes (FL: the last length you set) */
  lastLength: number
}

export const usePianoRollUi = create<PianoRollUi>(() => ({
  tool: 'draw',
  snap: STEP_TICKS,
  chord: null,
  slide: false,
  ghosts: true,
  lane: 'velocity',
  zoom: 1,
  selected: [],
  lastLength: STEP_TICKS * 2
}))

export const LANES: Record<Lane, { label: string; short: string; min: number; max: number; bipolar: boolean; format(v: number): string }> = {
  velocity: { label: 'Velocity', short: 'Vel', min: 0, max: 1, bipolar: false, format: (v) => `${Math.round(v * 100)}%` },
  pan: { label: 'Pan', short: 'Pan', min: -1, max: 1, bipolar: true, format: (v) => (Math.abs(v) < 0.01 ? 'C' : `${Math.round(Math.abs(v) * 100)}${v < 0 ? 'L' : 'R'}`) },
  finePitch: { label: 'Fine pitch', short: 'Pitch', min: -100, max: 100, bipolar: true, format: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct` },
  cutoff: { label: 'Cutoff', short: 'Cutoff', min: 0, max: 1, bipolar: false, format: (v) => `${Math.round(v * 100)}%` }
}
