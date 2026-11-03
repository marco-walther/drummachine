import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import {
  ROOT_KEY,
  STEP_TICKS,
  type Channel,
  type ChannelSource,
  type DrumPreset,
  type Note,
  type Pattern,
  type ProjectData
} from './types'

export const uid = (): string => crypto.randomUUID().slice(0, 8)

export const PRESET_NAMES: Record<DrumPreset, string> = {
  kick: 'Kick',
  snare: 'Snare',
  clap: 'Clap',
  hat: 'Hat',
  openhat: 'Open hat',
  tom: 'Tom'
}

export function makeChannel(source: ChannelSource, name?: string): Channel {
  return {
    id: uid(),
    name: name ?? (source.type === 'synth' ? PRESET_NAMES[source.preset] : 'Sample'),
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

export function initialProject(): ProjectData {
  // FL's empty-project default kit order.
  const channels = (['kick', 'clap', 'hat', 'snare'] as DrumPreset[]).map((preset) =>
    makeChannel({ type: 'synth', preset })
  )
  const pattern = makePattern('Pattern 1')
  return {
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
      deletePattern: (id) =>
        set((s) => {
          if (s.patterns.length <= 1) return
          const i = s.patterns.findIndex((p) => p.id === id)
          if (i < 0) return
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
