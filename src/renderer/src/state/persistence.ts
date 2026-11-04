import { PROJECT_FORMAT, PROJECT_VERSION, type ProjectDoc, type SampleDocEntry } from '@shared/api'
import { FX_TYPES, normalizeParams, type FxType } from '@/audio/fx-defs'
import { defaultMixer, makeInsert, MAX_FX, MAX_INSERTS, wouldLoop } from '@/audio/mixer-graph'
import {
  INSTRUMENT_DEFAULTS,
  initialProject,
  makeChannel,
  makeClip,
  makeNote,
  makePattern,
  sampleSource,
  uid
} from './project'
import {
  STEP_TICKS,
  type Channel,
  type ChannelSource,
  type Clip,
  type DrumPreset,
  type FxSlot,
  type InstrumentKind,
  type MixerInsert,
  type Note,
  type Pattern,
  type PlaylistTrack,
  type ProjectData,
  type SampleRef
} from './types'

/**
 * Project ⇄ file document. Loading is defensive: anything missing or malformed
 * falls back to defaults rather than failing, except a wrong format/version.
 */

const PRESETS: DrumPreset[] = ['kick', 'snare', 'clap', 'hat', 'openhat', 'tom']

export function toDoc(state: ProjectData): ProjectDoc {
  const used = new Set([
    ...state.channels.flatMap((c) => (c.source.type === 'sample' ? [c.source.sampleId] : [])),
    ...state.clips.flatMap((c) => (c.kind === 'audio' && c.sampleId ? [c.sampleId] : []))
  ])
  const samples: SampleDocEntry[] = Object.values(state.samples)
    .filter((s) => used.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, absPath: s.path, relPath: null }))
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    project: {
      mixer: state.mixer,
      tracks: state.tracks,
      clips: state.clips,
      songMode: state.songMode,
      loop: state.loop,
      bpm: state.bpm,
      swing: state.swing,
      masterVolume: state.masterVolume,
      channels: state.channels,
      patterns: state.patterns,
      currentPatternId: state.currentPatternId
    },
    samples
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d
const str = (v: unknown, d: string) => (typeof v === 'string' && v.length > 0 ? v : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

const KINDS = Object.keys(INSTRUMENT_DEFAULTS) as InstrumentKind[]

function readSource(v: unknown, samples: Record<string, SampleRef>): ChannelSource | null {
  if (!isObj(v)) return null
  if (v.type === 'synth' && PRESETS.includes(v.preset as DrumPreset)) return { type: 'synth', preset: v.preset as DrumPreset }
  if (v.type === 'sample' && typeof v.sampleId === 'string' && samples[v.sampleId]) {
    // Phase 3 files have no root/oneShot/envelope: defaults keep them sounding the same
    const d = sampleSource(v.sampleId)
    return sampleSource(v.sampleId, {
      root: Math.round(num(v.root, d.root, 0, 127)),
      oneShot: bool(v.oneShot, d.oneShot),
      attack: num(v.attack, d.attack, 0, 5),
      release: num(v.release, d.release, 0, 10)
    })
  }
  if (v.type === 'instrument' && KINDS.includes(v.kind as InstrumentKind)) {
    const kind = v.kind as InstrumentKind
    const d = INSTRUMENT_DEFAULTS[kind]
    const p = isObj(v.params) ? v.params : {}
    return {
      type: 'instrument',
      kind,
      params: {
        attack: num(p.attack, d.attack, 0.001, 5),
        release: num(p.release, d.release, 0.01, 10),
        brightness: num(p.brightness, d.brightness, 0, 1),
        glide: num(p.glide, d.glide, 0, 1)
      }
    }
  }
  return null
}

function readChannel(v: unknown, samples: Record<string, SampleRef>): Channel | null {
  if (!isObj(v)) return null
  const source = readSource(v.source, samples)
  if (!source) return null
  const base = makeChannel(source)
  return {
    id: str(v.id, base.id),
    name: str(v.name, base.name),
    source,
    volume: num(v.volume, base.volume, 0, 1),
    pan: num(v.pan, 0, -1, 1),
    pitch: Math.round(num(v.pitch, 0, -24, 24)),
    muted: bool(v.muted, false),
    solo: bool(v.solo, false),
    mixerTarget: Math.round(num(v.mixerTarget, 0, 0, 999))
  }
}

function readNote(v: unknown): Note | null {
  if (!isObj(v) || typeof v.tick !== 'number' || !Number.isFinite(v.tick) || v.tick < 0) return null
  const d = makeNote(v.tick)
  return {
    id: str(v.id, d.id),
    tick: Math.round(v.tick),
    length: Math.max(1, Math.round(num(v.length, d.length))),
    key: Math.round(num(v.key, d.key, 0, 127)),
    velocity: num(v.velocity, d.velocity, 0, 1),
    pan: num(v.pan, 0, -1, 1),
    finePitch: num(v.finePitch, 0, -100, 100),
    cutoff: num(v.cutoff, 1, 0, 1),
    slide: bool(v.slide, false)
  }
}

function readPattern(v: unknown, channelIds: Set<string>): Pattern | null {
  if (!isObj(v)) return null
  const p = makePattern(str(v.name, 'Pattern'))
  const notes: Record<string, Note[]> = {}
  if (isObj(v.notes)) {
    for (const [ch, list] of Object.entries(v.notes)) {
      if (!channelIds.has(ch) || !Array.isArray(list)) continue // notes of deleted/unknown channels
      notes[ch] = list.map(readNote).filter((n): n is Note => !!n).sort((a, b) => a.tick - b.tick)
    }
  }
  return {
    id: str(v.id, p.id),
    name: p.name,
    lengthSteps: Math.round(num(v.lengthSteps, 16, 1, 256)),
    notes
  }
}

/** Mixer from a file: unknown effects dropped, params clamped, sends that would loop discarded. */
function readMixer(v: unknown): MixerInsert[] {
  if (!Array.isArray(v) || v.length === 0) return defaultMixer()
  const list = v.slice(0, MAX_INSERTS + 1)
  const mixer: MixerInsert[] = list.map((x, i) => {
    const o = isObj(x) ? x : {}
    const base = makeInsert(i === 0 ? 'Master' : `Insert ${i}`, i !== 0)
    const fx: FxSlot[] = (Array.isArray(o.fx) ? o.fx : [])
      .filter(isObj)
      .filter((f) => FX_TYPES.includes(f.type as FxType))
      .slice(0, MAX_FX)
      .map((f) => ({ id: str(f.id, uid()), type: f.type as FxType, enabled: bool(f.enabled, true), params: normalizeParams(f.type as FxType, f.params) }))
    // sends are added below (validated against loops), so start empty
    return { ...base, sends: [], name: str(o.name, base.name), volume: num(o.volume, base.volume, 0, 1.25), pan: num(o.pan, 0, -1, 1), muted: bool(o.muted, false), fx }
  })
  // add sends one by one, refusing anything invalid or looping
  list.forEach((x, i) => {
    if (i === 0 || !isObj(x) || !Array.isArray(x.sends)) return
    for (const s of x.sends) {
      if (!isObj(s) || typeof s.target !== 'number' || !mixer[s.target]) continue
      if (mixer[i].sends.some((e) => e.target === s.target) || wouldLoop(mixer, i, s.target)) continue
      mixer[i].sends.push({ target: s.target, amount: num(s.amount, 1, 0, 1), sidechain: bool(s.sidechain, false) })
    }
  })
  return mixer
}

/** Build project state from a (validated-format) document. Throws only on a non-project. */
export function fromDoc(doc: ProjectDoc): ProjectData {
  if (!doc || doc.format !== PROJECT_FORMAT) throw new Error('This is not a Drummachine project.')
  const raw = isObj(doc.project) ? doc.project : {}
  const fallback = initialProject()

  const samples: Record<string, SampleRef> = {}
  for (const s of doc.samples ?? []) {
    if (isObj(s) && typeof s.id === 'string' && typeof s.absPath === 'string') {
      samples[s.id] = { id: s.id, name: str(s.name, 'Sample'), path: s.absPath }
    }
  }

  const channels: Channel[] = []
  const seen = new Set<string>()
  for (const c of Array.isArray(raw.channels) ? raw.channels : []) {
    const ch = readChannel(c, samples)
    if (!ch) continue
    if (seen.has(ch.id)) ch.id = uid()
    seen.add(ch.id)
    channels.push(ch)
  }

  const ids = new Set(channels.map((c) => c.id))
  let patterns = (Array.isArray(raw.patterns) ? raw.patterns : [])
    .map((p) => readPattern(p, ids))
    .filter((p): p is Pattern => !!p)
  if (patterns.length === 0) patterns = [makePattern('Pattern 1')]
  const current = typeof raw.currentPatternId === 'string' && patterns.some((p) => p.id === raw.currentPatternId)

  // playlist (absent in Phase 1–4 files → default empty tracks)
  let tracks: PlaylistTrack[] = (Array.isArray(raw.tracks) ? raw.tracks : [])
    .filter(isObj)
    .map((t, i) => ({ id: str(t.id, uid()), name: str(t.name, `Track ${i + 1}`), muted: bool(t.muted, false) }))
  if (tracks.length === 0) tracks = fallback.tracks
  const trackIds = new Set(tracks.map((t) => t.id))
  const patternIds = new Set(patterns.map((p) => p.id))
  const clips: Clip[] = (Array.isArray(raw.clips) ? raw.clips : []).filter(isObj).flatMap((c) => {
    const kind = c.kind === 'audio' ? 'audio' : c.kind === 'pattern' ? 'pattern' : null
    if (!kind || typeof c.trackId !== 'string' || !trackIds.has(c.trackId)) return []
    if (kind === 'pattern' && !(typeof c.patternId === 'string' && patternIds.has(c.patternId))) return []
    if (kind === 'audio' && !(typeof c.sampleId === 'string' && samples[c.sampleId])) return []
    return [
      makeClip({
        id: str(c.id, uid()),
        trackId: c.trackId,
        kind,
        start: Math.max(0, Math.round(num(c.start, 0))),
        length: Math.max(STEP_TICKS, Math.round(num(c.length, STEP_TICKS * 16))),
        patternId: kind === 'pattern' ? (c.patternId as string) : undefined,
        sampleId: kind === 'audio' ? (c.sampleId as string) : undefined,
        offset: Math.max(0, Math.round(num(c.offset, 0))),
        sourceOffset: Math.max(0, num(c.sourceOffset, 0)),
        gain: num(c.gain, 0.8, 0, 1),
        pitch: Math.round(num(c.pitch, 0, -24, 24)),
        rate: num(c.rate, 1, 0.25, 4),
        stretch: bool(c.stretch, false)
      })
    ]
  })
  const mixer = readMixer(raw.mixer)
  // files from before the Mixer: their master volume becomes the Master fader
  if (!Array.isArray(raw.mixer)) mixer[0].volume = num(raw.masterVolume, mixer[0].volume, 0, 1.25)
  for (const ch of channels) if (ch.mixerTarget >= mixer.length) ch.mixerTarget = 0

  const loopRaw = isObj(raw.loop) ? raw.loop : null
  const loop =
    loopRaw && typeof loopRaw.start === 'number' && typeof loopRaw.end === 'number' && loopRaw.end > loopRaw.start
      ? { start: Math.max(0, loopRaw.start), end: loopRaw.end }
      : null

  return {
    mixer,
    tracks,
    clips,
    songMode: bool(raw.songMode, false),
    loop,
    samples,
    bpm: num(raw.bpm, fallback.bpm, 20, 400),
    swing: num(raw.swing, 0, 0, 1),
    masterVolume: num(raw.masterVolume, fallback.masterVolume, 0, 1),
    channels,
    patterns,
    currentPatternId: current ? (raw.currentPatternId as string) : patterns[0].id,
    selectedChannelId: channels[0]?.id ?? null
  }
}
