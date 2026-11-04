import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import {
  ROOT_KEY,
  STEP_TICKS,
  type Channel,
  type ChannelSource,
  type Clip,
  type DrumPreset,
  type PlaylistTrack,
  type InstrumentKind,
  type InstrumentParams,
  type Note,
  type Pattern,
  type ProjectData,
  type SampleSource
} from './types'

export const uid = (): string => crypto.randomUUID().slice(0, 8)

/**
 * Project fields that are saved, undoable and make the project "dirty".
 * (selectedChannelId is view state and deliberately not listed.)
 */
export const SAVED_KEYS = [
  'samples',
  'tracks',
  'clips',
  'songMode',
  'loop',
  'bpm',
  'swing',
  'masterVolume',
  'channels',
  'patterns',
  'currentPatternId'
] as const satisfies readonly (keyof ProjectData)[]

export type SavedData = Pick<ProjectData, (typeof SAVED_KEYS)[number]>

export const savedDataChanged = (a: ProjectData, b: ProjectData) => SAVED_KEYS.some((k) => a[k] !== b[k])

export const pickSaved = (s: ProjectData): SavedData =>
  Object.fromEntries(SAVED_KEYS.map((k) => [k, s[k]])) as unknown as SavedData

export const PRESET_NAMES: Record<DrumPreset, string> = {
  kick: 'Kick',
  snare: 'Snare',
  clap: 'Clap',
  hat: 'Hat',
  openhat: 'Open hat',
  tom: 'Tom'
}

export const INSTRUMENT_NAMES: Record<InstrumentKind, string> = {
  piano: 'Piano',
  synth: 'Synth',
  bass: 'Bass',
  pad: 'Pad',
  pluck: 'Pluck'
}

export const INSTRUMENT_DEFAULTS: Record<InstrumentKind, InstrumentParams> = {
  piano: { attack: 0.002, release: 1.2, brightness: 0.45, glide: 0 },
  synth: { attack: 0.005, release: 0.25, brightness: 0.6, glide: 0 },
  bass: { attack: 0.003, release: 0.12, brightness: 0.35, glide: 0.04 },
  pad: { attack: 0.6, release: 1.8, brightness: 0.4, glide: 0 },
  pluck: { attack: 0.001, release: 0.6, brightness: 0.6, glide: 0 }
}

export function sampleSource(sampleId: string, partial: Partial<Omit<SampleSource, 'type' | 'sampleId'>> = {}): SampleSource {
  return { type: 'sample', sampleId, root: ROOT_KEY, oneShot: true, attack: 0, release: 0.08, ...partial }
}

export function instrumentSource(kind: InstrumentKind): ChannelSource {
  return { type: 'instrument', kind, params: { ...INSTRUMENT_DEFAULTS[kind] } }
}

export function sourceName(source: ChannelSource): string {
  if (source.type === 'synth') return PRESET_NAMES[source.preset]
  if (source.type === 'instrument') return INSTRUMENT_NAMES[source.kind]
  return 'Sample'
}

export function makeChannel(source: ChannelSource, name?: string): Channel {
  return {
    id: uid(),
    name: name ?? sourceName(source),
    source,
    volume: 0.78,
    pan: 0,
    pitch: 0,
    muted: false,
    solo: false,
    mixerTarget: 0
  }
}

export function makeNote(tick: number, partial: Partial<Note> = {}): Note {
  return {
    id: uid(),
    tick,
    length: STEP_TICKS,
    key: ROOT_KEY,
    velocity: 0.78,
    pan: 0,
    finePitch: 0,
    cutoff: 1,
    slide: false,
    ...partial
  }
}

export function makePattern(name: string, lengthSteps = 16): Pattern {
  return { id: uid(), name, lengthSteps, notes: {} }
}

/** Notes of one channel that start inside the given step. */
export function notesInStep(notes: Note[] | undefined, step: number): Note[] {
  if (!notes) return []
  const start = step * STEP_TICKS
  return notes.filter((n) => n.tick >= start && n.tick < start + STEP_TICKS)
}

export function makeTrack(name: string): PlaylistTrack {
  return { id: uid(), name, muted: false }
}

export function makeClip(partial: Pick<Clip, 'trackId' | 'start' | 'length' | 'kind'> & Partial<Clip>): Clip {
  return { id: uid(), offset: 0, sourceOffset: 0, gain: 0.8, pitch: 0, rate: 1, stretch: false, ...partial }
}

/** Split a clip at an absolute tick into two clips (null if the tick is not inside it). */
export function splitClip(clip: Clip, at: number, secondsPerTick: number): [Clip, Clip] | null {
  if (at <= clip.start || at >= clip.start + clip.length) return null
  const left = { ...clip, length: at - clip.start }
  const into = at - clip.start
  const speed = clip.stretch ? clip.rate : clip.rate * Math.pow(2, clip.pitch / 12)
  const right: Clip = {
    ...clip,
    id: uid(),
    start: at,
    length: clip.length - into,
    offset: clip.offset + into,
    sourceOffset: clip.sourceOffset + into * secondsPerTick * speed
  }
  return [left, right]
}

export function initialProject(): ProjectData {
  // FL's empty-project default kit order.
  const channels = (['kick', 'clap', 'hat', 'snare'] as DrumPreset[]).map((preset) =>
    makeChannel({ type: 'synth', preset })
  )
  const pattern = makePattern('Pattern 1')
  return {
    samples: {},
    tracks: Array.from({ length: 8 }, (_, i) => makeTrack(`Track ${i + 1}`)),
    clips: [],
    songMode: false,
    loop: null,
    bpm: 130,
    swing: 0,
    masterVolume: 0.8,
    channels,
    patterns: [pattern],
    currentPatternId: pattern.id,
    selectedChannelId: channels[0].id
  }
}

export interface ProjectActions {
  // transport
  setBpm(bpm: number): void
  setSwing(swing: number): void
  setMasterVolume(v: number): void
  // samples
  /** Register a file (reusing the existing entry for the same path). Returns its id. */
  addSample(path: string, name: string): string
  /** New channel playing the file. Returns the channel id. */
  addSampleChannel(path: string, name: string): string
  /** Swap the sound of an existing channel for the file (FL: drop onto a channel). */
  setChannelSample(channelId: string, path: string, name: string): void
  /** Point a sample at a new location (after saving into the project folder). */
  relinkSamples(paths: Record<string, string>): void
  /** Switch what a channel plays (drum preset, instrument, …). */
  setChannelSource(channelId: string, source: ChannelSource, rename?: boolean): void
  updateSampleSettings(channelId: string, patch: Partial<Omit<SampleSource, 'type' | 'sampleId'>>): void
  updateInstrumentParams(channelId: string, patch: Partial<InstrumentParams>): void
  /** Add a note to the current pattern (live recording). */
  addNote(channelId: string, note: Note): void
  /** Replace a channel's notes in the current pattern (Piano Roll edits); grows the pattern to fit. */
  setChannelNotes(channelId: string, notes: Note[]): void
  // channels
  addChannel(source: ChannelSource, name?: string): string
  removeChannel(id: string): void
  updateChannel(id: string, patch: Partial<Omit<Channel, 'id'>>): void
  moveChannel(from: number, to: number): void
  selectChannel(id: string | null): void
  toggleSolo(id: string): void
  // steps
  setStep(channelId: string, step: number, on: boolean): void
  toggleStep(channelId: string, step: number): void
  clearChannel(channelId: string): void
  fillEvery(channelId: string, every: number): void
  // patterns
  addPattern(): string
  clonePattern(id: string): string
  renamePattern(id: string, name: string): void
  deletePattern(id: string): void
  selectPattern(id: string): void
  setPatternLength(id: string, steps: number): void
  // playlist
  setSongMode(on: boolean): void
  setLoop(loop: { start: number; end: number } | null): void
  addTrack(): void
  updateTrack(id: string, patch: Partial<Omit<PlaylistTrack, 'id'>>): void
  /** Returns the new clip's id. */
  addClip(clip: Clip): string
  updateClip(id: string, patch: Partial<Omit<Clip, 'id' | 'kind'>>): void
  /** Replace several clips at once (drag of a selection). */
  setClips(clips: Clip[]): void
  removeClips(ids: string[]): void
}

export type ProjectStore = ProjectData & ProjectActions

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const useProject = create<ProjectStore>()(
  immer((set, get) => {
    const current = (s: ProjectData) => s.patterns.find((p) => p.id === s.currentPatternId)!

    return {
      ...initialProject(),

      setBpm: (bpm) => set((s) => void (s.bpm = clamp(Math.round(bpm * 10) / 10, 20, 400))),
      setSwing: (swing) => set((s) => void (s.swing = clamp(swing, 0, 1))),
      setMasterVolume: (v) => set((s) => void (s.masterVolume = clamp(v, 0, 1))),

      addSample: (path, name) => {
        const existing = Object.values(get().samples).find((s) => s.path === path)
        if (existing) return existing.id
        const id = uid()
        set((s) => void (s.samples[id] = { id, name, path }))
        return id
      },
      addSampleChannel: (path, name) => {
        const sampleId = get().addSample(path, name)
        return get().addChannel(sampleSource(sampleId), name)
      },
      setChannelSample: (channelId, path, name) => {
        const sampleId = get().addSample(path, name)
        set((s) => {
          const ch = s.channels.find((c) => c.id === channelId)
          if (!ch) return
          // keep how the channel plays (one-shot/envelope); the new file gets a fresh root
          const prev = ch.source.type === 'sample' ? ch.source : undefined
          ch.source = sampleSource(sampleId, prev ? { oneShot: prev.oneShot, attack: prev.attack, release: prev.release } : {})
          ch.name = name
        })
      },
      setChannelSource: (channelId, source, rename = true) =>
        set((s) => {
          const ch = s.channels.find((c) => c.id === channelId)
          if (!ch) return
          // rename only if the user hasn't: name is still the old default (or the old file's name)
          const old = ch.source
          const defaultName = old.type === 'sample' ? (s.samples[old.sampleId]?.name ?? 'Sample') : sourceName(old)
          if (rename && ch.name === defaultName && source.type !== 'sample') ch.name = sourceName(source)
          ch.source = source
        }),
      updateSampleSettings: (channelId, patch) =>
        set((s) => {
          const src = s.channels.find((c) => c.id === channelId)?.source
          if (src?.type !== 'sample') return
          Object.assign(src, patch)
          src.root = clamp(Math.round(src.root), 0, 127)
          src.attack = clamp(src.attack, 0, 5)
          src.release = clamp(src.release, 0, 10)
        }),
      updateInstrumentParams: (channelId, patch) =>
        set((s) => {
          const src = s.channels.find((c) => c.id === channelId)?.source
          if (src?.type !== 'instrument') return
          const p = Object.assign(src.params, patch)
          p.attack = clamp(p.attack, 0.001, 5)
          p.release = clamp(p.release, 0.01, 10)
          p.brightness = clamp(p.brightness, 0, 1)
          p.glide = clamp(p.glide, 0, 1)
        }),
      addNote: (channelId, note) =>
        set((s) => {
          const p = current(s)
          if (!s.channels.some((c) => c.id === channelId)) return
          const notes = (p.notes[channelId] ??= [])
          notes.push(note)
          notes.sort((a, b) => a.tick - b.tick)
        }),
      setChannelNotes: (channelId, notes) =>
        set((s) => {
          const p = current(s)
          if (!s.channels.some((c) => c.id === channelId)) return
          p.notes[channelId] = [...notes].sort((a, b) => a.tick - b.tick || a.key - b.key)
          // FL-style: a pattern grows (in whole bars) to hold its notes
          const end = Math.max(0, ...notes.map((n) => n.tick + n.length))
          const bar = 16 * STEP_TICKS
          if (end > p.lengthSteps * STEP_TICKS) p.lengthSteps = Math.min(256, Math.ceil(end / bar) * 16)
        }),
      relinkSamples: (paths) =>
        set((s) => {
          for (const [id, path] of Object.entries(paths)) if (s.samples[id]) s.samples[id].path = path
        }),

      addChannel: (source, name) => {
        const ch = makeChannel(source, name)
        set((s) => {
          s.channels.push(ch)
          s.selectedChannelId = ch.id
        })
        return ch.id
      },
      removeChannel: (id) =>
        set((s) => {
          s.channels = s.channels.filter((c) => c.id !== id)
          for (const p of s.patterns) delete p.notes[id]
          if (s.selectedChannelId === id) s.selectedChannelId = s.channels[0]?.id ?? null
        }),
      updateChannel: (id, patch) =>
        set((s) => {
          const ch = s.channels.find((c) => c.id === id)
          if (!ch) return
          Object.assign(ch, patch)
          ch.volume = clamp(ch.volume, 0, 1)
          ch.pan = clamp(ch.pan, -1, 1)
          ch.pitch = clamp(Math.round(ch.pitch), -24, 24)
        }),
      moveChannel: (from, to) =>
        set((s) => {
          if (from === to || from < 0 || from >= s.channels.length) return
          const [ch] = s.channels.splice(from, 1)
          s.channels.splice(clamp(to, 0, s.channels.length), 0, ch)
        }),
      selectChannel: (id) => set((s) => void (s.selectedChannelId = id)),
      toggleSolo: (id) =>
        set((s) => {
          // FL-style exclusive solo: soloing one un-solos the rest.
          const target = s.channels.find((c) => c.id === id)
          if (!target) return
          const next = !target.solo
          for (const c of s.channels) c.solo = false
          target.solo = next
        }),

      setStep: (channelId, step, on) =>
        set((s) => {
          const p = current(s)
          if (step < 0 || step >= p.lengthSteps) return
          const notes = (p.notes[channelId] ??= [])
          const start = step * STEP_TICKS
          const inStep = (n: Note) => n.tick >= start && n.tick < start + STEP_TICKS
          const has = notes.some(inStep)
          if (on && !has) {
            notes.push(makeNote(start))
            notes.sort((a, b) => a.tick - b.tick)
          } else if (!on && has) {
            p.notes[channelId] = notes.filter((n) => !inStep(n))
          }
        }),
      toggleStep: (channelId, step) => {
        const p = current(get())
        get().setStep(channelId, step, notesInStep(p.notes[channelId], step).length === 0)
      },
      clearChannel: (channelId) => set((s) => void (current(s).notes[channelId] = [])),
      fillEvery: (channelId, every) =>
        set((s) => {
          const p = current(s)
          const notes: Note[] = []
          for (let step = 0; step < p.lengthSteps; step += every) notes.push(makeNote(step * STEP_TICKS))
          p.notes[channelId] = notes
        }),

      addPattern: () => {
        const p = makePattern(`Pattern ${get().patterns.length + 1}`, current(get()).lengthSteps)
        set((s) => {
          s.patterns.push(p)
          s.currentPatternId = p.id
        })
        return p.id
      },
      clonePattern: (id) => {
        const src = get().patterns.find((p) => p.id === id)
        if (!src) return id
        const copy: Pattern = {
          id: uid(),
          name: `${src.name} copy`,
          lengthSteps: src.lengthSteps,
          notes: Object.fromEntries(
            Object.entries(src.notes).map(([ch, ns]) => [ch, ns.map((n) => ({ ...n, id: uid() }))])
          )
        }
        set((s) => {
          s.patterns.splice(s.patterns.findIndex((p) => p.id === id) + 1, 0, copy)
          s.currentPatternId = copy.id
        })
        return copy.id
      },
      renamePattern: (id, name) =>
        set((s) => {
          const p = s.patterns.find((x) => x.id === id)
          if (p && name.trim()) p.name = name.trim()
        }),
      setSongMode: (on) => set((s) => void (s.songMode = on)),
      setLoop: (loop) =>
        set((s) => {
          s.loop = loop && loop.end - loop.start >= STEP_TICKS ? { start: Math.max(0, loop.start), end: loop.end } : null
        }),
      addTrack: () => set((s) => void s.tracks.push(makeTrack(`Track ${s.tracks.length + 1}`))),
      updateTrack: (id, patch) =>
        set((s) => {
          const t = s.tracks.find((x) => x.id === id)
          if (t) Object.assign(t, patch)
        }),
      addClip: (clip) => {
        set((s) => void s.clips.push(clip))
        return clip.id
      },
      updateClip: (id, patch) =>
        set((s) => {
          const c = s.clips.find((x) => x.id === id)
          if (!c) return
          Object.assign(c, patch)
          c.start = Math.max(0, Math.round(c.start))
          c.length = Math.max(STEP_TICKS, Math.round(c.length))
          c.gain = clamp(c.gain, 0, 1)
          c.rate = clamp(c.rate, 0.25, 4)
          c.pitch = clamp(Math.round(c.pitch), -24, 24)
        }),
      setClips: (clips) =>
        set((s) => {
          const byId = new Map(clips.map((c) => [c.id, c]))
          s.clips = s.clips.map((c) => byId.get(c.id) ?? c)
          for (const c of clips) if (!s.clips.some((x) => x.id === c.id)) s.clips.push(c)
        }),
      removeClips: (ids) =>
        set((s) => {
          const gone = new Set(ids)
          s.clips = s.clips.filter((c) => !gone.has(c.id))
        }),

      deletePattern: (id) =>
        set((s) => {
          if (s.patterns.length <= 1) return
          const i = s.patterns.findIndex((p) => p.id === id)
          if (i < 0) return
          s.clips = s.clips.filter((c) => c.patternId !== id) // its clips go with it
          s.patterns.splice(i, 1)
          if (s.currentPatternId === id) s.currentPatternId = s.patterns[Math.max(0, i - 1)].id
        }),
      selectPattern: (id) =>
        set((s) => {
          if (s.patterns.some((p) => p.id === id)) s.currentPatternId = id
        }),
      setPatternLength: (id, steps) =>
        set((s) => {
          const p = s.patterns.find((x) => x.id === id)
          if (!p) return
          p.lengthSteps = clamp(Math.round(steps), 1, 256)
        })
    }
  })
)

export const selectCurrentPattern = (s: ProjectData): Pattern =>
  s.patterns.find((p) => p.id === s.currentPatternId)!
