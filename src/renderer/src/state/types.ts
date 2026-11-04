/** Ticks per quarter note. All positions/lengths in the project are in ticks. */
export const PPQ = 96
/** One step-sequencer step = a 16th note. */
export const STEP_TICKS = PPQ / 4
/** Default key for step-sequencer notes (C5, FL convention). */
export const ROOT_KEY = 60

export type DrumPreset = 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'tom'

export type InstrumentKind = 'piano' | 'synth' | 'bass' | 'pad' | 'pluck'

/** Common, instrument-agnostic sound controls (each instrument maps them). */
export interface InstrumentParams {
  /** seconds */
  attack: number
  /** seconds */
  release: number
  /** 0..1: filter/modulation brightness */
  brightness: number
  /** seconds of pitch glide between notes (mono instruments) */
  glide: number
}

export interface SampleSource {
  type: 'sample'
  sampleId: string
  /** MIDI key that plays the file at its recorded pitch (60 = C5) */
  root: number
  /** true: always play the whole file (drums); false: stop at note end (instrument use) */
  oneShot: boolean
  /** seconds */
  attack: number
  /** seconds (used when not one-shot) */
  release: number
}

export type ChannelSource =
  | { type: 'synth'; preset: DrumPreset }
  | SampleSource
  | { type: 'instrument'; kind: InstrumentKind; params: InstrumentParams }

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

/** A Playlist lane. Tracks are not tied to an instrument: any clip can go anywhere. */
export interface PlaylistTrack {
  id: string
  name: string
  muted: boolean
}

/**
 * A parameter that automation/controllers can move, as a path:
 *   ch.<channelId>.volume | ch.<channelId>.pan
 *   inst.<channelId>.attack|release|brightness|glide
 *   mix.<insert>.volume | mix.<insert>.pan
 *   fx.<insert>.<fxId>.<param>
 * Values travel normalized 0..1 and are mapped to the parameter's range.
 */
export type ParamRef = string

export interface AutomationPoint {
  /** ticks from the clip start */
  t: number
  /** 0..1 */
  v: number
}

export interface Automation {
  id: string
  name: string
  /** one curve can drive several parameters */
  targets: ParamRef[]
  points: AutomationPoint[]
  /** smooth (eased) curves between points instead of straight lines */
  smooth: boolean
}

export type LfoShape = 'sine' | 'triangle' | 'square' | 'saw' | 'random'

interface ControllerBase {
  id: string
  name: string
  enabled: boolean
  targets: ParamRef[]
}
export interface LfoController extends ControllerBase {
  kind: 'lfo'
  shape: LfoShape
  /** true: `rate` is beats per cycle (tempo synced); false: `rate` is Hz */
  sync: boolean
  rate: number
  /** 0..1 swing around the center */
  depth: number
  /** 0..1 */
  center: number
}
export interface PeakController extends ControllerBase {
  kind: 'peak'
  /** what it listens to: ch.<channelId> or mix.<insert> */
  source: string
  /** value when silent, 0..1 */
  base: number
  /** -1..1: how far the level pushes the value (negative = ducks) */
  amount: number
  /** seconds for the level to fall back */
  release: number
}
export type Controller = LfoController | PeakController

export interface Clip {
  id: string
  trackId: string
  /** position on the timeline, ticks */
  start: number
  /** visible length, ticks */
  length: number
  kind: 'pattern' | 'audio' | 'automation'
  /** automation clips: which automation curve */
  automationId?: string
  /** pattern clips: which pattern (loops if the clip is longer) */
  patternId?: string
  /** pattern clips: ticks into the pattern where the clip begins (left trim) */
  offset: number
  /** audio clips: which sample/track file */
  sampleId?: string
  /** audio clips: seconds into the file where the clip begins (left trim) */
  sourceOffset: number
  /** audio clips: 0..1 */
  gain: number
  /** audio clips: semitones */
  pitch: number
  /** audio clips: playback speed (1 = original) */
  rate: number
  /** audio clips: true = time-stretch (speed independent of pitch); false = resample (speed changes pitch) */
  stretch: boolean
}

export type FxSlotType = 'eq' | 'compressor' | 'ducker' | 'filter' | 'delay' | 'reverb' | 'distortion' | 'limiter'

export interface FxSlot {
  id: string
  type: FxSlotType
  enabled: boolean
  params: Record<string, number>
}

export interface MixerSend {
  /** target insert index (0 = Master) */
  target: number
  /** 0..1 */
  amount: number
  /** feeds the target's sidechain input (for its Sidechain duck) instead of its audio */
  sidechain: boolean
}

/** A mixer track. Index 0 in ProjectData.mixer is the Master. */
export interface MixerInsert {
  name: string
  /** 0..1.25 linear gain (0.8 ≈ 0 dB-ish default) */
  volume: number
  pan: number
  muted: boolean
  /** up to 10 effect slots, processed top to bottom */
  fx: FxSlot[]
  /** where this insert's output goes (Master by default) */
  sends: MixerSend[]
}

export interface ProjectData {
  /** automation curves by id (placed in the Playlist by automation clips) */
  automations: Record<string, Automation>
  /** internal controllers (LFO, peak follower) linked to parameters */
  controllers: Controller[]
  /** mixer tracks: [0] = Master, then inserts 1…N (channels route here by mixerTarget) */
  mixer: MixerInsert[]
  /** samples by id, referenced by sample channels and audio clips */
  samples: Record<string, SampleRef>
  tracks: PlaylistTrack[]
  clips: Clip[]
  /** false = loop the current pattern (PAT), true = play the Playlist (SONG) */
  songMode: boolean
  /** song loop region in ticks, or null */
  loop: { start: number; end: number } | null
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
