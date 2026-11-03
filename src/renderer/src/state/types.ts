/** Ticks per quarter note. All positions/lengths in the project are in ticks. */
export const PPQ = 96
/** One step-sequencer step = a 16th note. */
export const STEP_TICKS = PPQ / 4
/** Default key for step-sequencer notes (C5, FL convention). */
export const ROOT_KEY = 60

export type DrumPreset = 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'tom'

export type ChannelSource =
  | { type: 'synth'; preset: DrumPreset }
  | { type: 'sample'; sampleId: string }

export interface Channel {
  id: string
  name: string
  source: ChannelSource
  /** 0..1 linear gain (FL default ≈ 0.78) */
  volume: number
  /** -1 (L) .. 1 (R) */
  pan: number
  /** semitones */
  pitch: number
  muted: boolean
  solo: boolean
  /** Mixer insert index; 0 = master. Routing is applied once the Mixer exists. */
  mixerTarget: number
}

export interface Note {
  id: string
  tick: number
  length: number
  /** MIDI key, 60 = C5 */
  key: number
  /** 0..1 */
  velocity: number
  /** -1..1 */
  pan: number
  /** cents */
  finePitch: number
  /** 0..1, 1 = fully open */
  cutoff: number
  /** slide note: glides from the previous note's pitch */
  slide: boolean
}

export interface Pattern {
  id: string
  name: string
  /** length in steps (16th notes) */
  lengthSteps: number
  /** notes per channel id */
  notes: Record<string, Note[]>
}

/** A user audio file used by the project (sample or track). */
export interface SampleRef {
  id: string
  name: string
  /** absolute path on disk */
  path: string
}

export interface ProjectData {
  /** samples by id, referenced by channels with source.type === 'sample' */
  samples: Record<string, SampleRef>
  bpm: number
  /** 0..1 */
  swing: number
  /** 0..1 linear gain */
  masterVolume: number
  channels: Channel[]
  patterns: Pattern[]
  currentPatternId: string
  selectedChannelId: string | null
}
