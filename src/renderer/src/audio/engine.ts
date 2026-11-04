import * as Tone from 'tone'
import { create } from 'zustand'
import { makeNote, selectCurrentPattern, useProject } from '@/state/project'
import { useTransportUi } from '@/state/transport-ui'
import { PPQ, ROOT_KEY, STEP_TICKS, type Channel, type Clip, type Note, type ProjectData } from '@/state/types'
import { isSilent, noteCutoffHz } from './mixing'
import { insertInput, syncMixer } from './mixer-engine'
import { ensureSamples } from './samples'
import { audioClipStarts, songNoteEvents, songTickAt } from './song'
import { usePianoRollUi } from '@/panels/piano-roll/ui-state'
import {
  gainToDb,
  notesInWindow,
  quantizeRecorded,
  secondsPerTick,
  stepInPattern,
  swingDelayTicks
} from './timing'
import { createVoice, sampleBuffers, sourceKey, type Voice } from './voices'

/**
 * The single audio engine. Lives in the main window's renderer; pop-out panels
 * share it because they run in the same JS context (see plan, Phase 2).
 *
 * Scheduling: Tone.Transport fires a callback every 16th on the audio clock
 * (look-ahead). Each callback reads the current pattern from the store, so edits
 * made while playing are heard on the next pass.
 */

interface Strip {
  voice: Voice
  /** per-note expression stage: voice → filter (note cutoff) → panner (note pan) → channel */
  filter: Tone.Filter
  panner: Tone.Panner
  /** last per-note values scheduled, so unchanged notes schedule nothing */
  expr: { cutoff: number; pan: number }
  channel: Tone.Channel
  key: string
  /** last values pushed to the audio params (avoid re-scheduling on every state change) */
  applied: { volume: number; pan: number; silent: boolean; target: number }
}

/** Apply a note's pan and cutoff at its start (the stage is per channel). */
function applyExpression(strip: Strip, note: Note, time: number) {
  if (note.cutoff !== strip.expr.cutoff) {
    strip.filter.frequency.setValueAtTime(noteCutoffHz(note.cutoff), time)
    strip.expr.cutoff = note.cutoff
  }
  if (note.pan !== strip.expr.pan) {
    strip.panner.pan.setValueAtTime(note.pan, time)
    strip.expr.pan = note.pan
  }
}

const strips = new Map<string, Strip>()
let started = false
let repeatId: number | null = null
/** absolute step counter since play */
let absStep = 0

const transport = () => Tone.getTransport()

function syncChannel(ch: Channel, anySolo: boolean) {
  let strip = strips.get(ch.id)
  const key = sourceKey(ch.source)
  if (strip && strip.key !== key) {
    strip.voice.dispose()
    strip.voice = createVoice(ch.source)
    strip.voice.output.connect(strip.filter)
    strip.key = key
  }
  if (!strip) {
    const channel = new Tone.Channel()
    const panner = new Tone.Panner(0).connect(channel)
    const filter = new Tone.Filter({ type: 'lowpass', frequency: noteCutoffHz(1), rolloff: -12 }).connect(panner)
    const voice = createVoice(ch.source)
    voice.output.connect(filter)
    strip = { voice, filter, panner, expr: { cutoff: 1, pan: 0 }, channel, key, applied: { volume: NaN, pan: NaN, silent: false, target: -1 } }
    strips.set(ch.id, strip)
  } else {
    strip.voice.update(ch.source)
  }
  const a = strip.applied
  // route to the channel's mixer insert (0 = Master)
  if (a.target !== ch.mixerTarget) {
    strip.channel.disconnect()
    strip.channel.connect(insertInput(ch.mixerTarget))
    a.target = ch.mixerTarget
  }
  const silent = isSilent(ch, anySolo)
  if (a.silent !== silent) strip.channel.mute = a.silent = silent
  // Volume is set while unmuted only; Tone's mute restores its own pre-mute value.
  if (a.volume !== ch.volume) {
    if (silent) strip.channel.mute = false
    strip.channel.volume.value = gainToDb((a.volume = ch.volume))
    if (silent) strip.channel.mute = true
  }
  if (a.pan !== ch.pan) strip.channel.pan.value = a.pan = ch.pan
}

function sync(state: ProjectData) {
  const t = transport()
  if (t.bpm.value !== state.bpm) t.bpm.value = state.bpm
  // the Master insert's fader is the master volume (top bar knob)
  syncMixer(state.mixer)

  const ids = new Set(state.channels.map((c) => c.id))
  for (const [id, strip] of strips) {
    if (!ids.has(id)) {
      strip.voice.dispose()
      strip.filter.dispose()
      strip.panner.dispose()
      strip.channel.dispose()
      strips.delete(id)
    }
  }
  ensureSamples(state.samples)
  const anySolo = state.channels.some((c) => c.solo)
  for (const ch of state.channels) syncChannel(ch, anySolo)
}

function playNote(channelId: string, note: Note, offsetTicks: number, time: number, spt: number, swing: number) {
  const state = useProject.getState()
  const ch = state.channels.find((c) => c.id === channelId)
  const strip = strips.get(channelId)
  if (!ch || !strip) return
  const at = time + (offsetTicks + swingDelayTicks(note.tick, swing)) * spt
  const pitch = note.key + ch.pitch + note.finePitch / 100
  applyExpression(strip, note, at)
  if (note.slide) strip.voice.glide(at, pitch, note.length * spt)
  else strip.voice.play(at, pitch, note.velocity, note.length * spt)
}

/** Song mode: where play started, the previous window's position (to detect loop jumps). */
let songStart = 0
let prevSongTick = -1

/** Steps of metronome-only count-in before the music starts (record from stopped). */
let countInSteps = 0
let metronome: Tone.Synth | null = null

/** Metronome click: higher on the first beat of a bar. Straight to the speakers (not the mix). */
function click(time: number, downbeat: boolean) {
  metronome ??= new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
    volume: -10
  }).toDestination()
  metronome.triggerAttackRelease(downbeat ? 1760 : 1320, 0.03, time, downbeat ? 0.9 : 0.6)
}

function tick(time: number) {
  const state = useProject.getState()
  const spt = secondsPerTick(state.bpm)
  const raw = absStep++

  // count-in: only clicks, nothing plays yet
  if (raw < countInSteps) {
    if (raw % 4 === 0) click(time, raw % 16 === 0)
    return
  }
  const n = raw - countInSteps
  // metronome while recording
  if (useTransportUi.getState().recording && n % 4 === 0) click(time, n % 16 === 0)
  let step: number
  let songTick = -1

  if (state.songMode) {
    songTick = songTickAt(songStart, n, STEP_TICKS, state.loop)
    const fresh = songTick !== prevSongTick + STEP_TICKS
    prevSongTick = songTick
    for (const e of songNoteEvents(state.clips, state.tracks, state.patterns, songTick)) {
      playNote(e.channelId, e.note, e.offset, time, spt, state.swing)
    }
    for (const s of audioClipStarts(state.clips, state.tracks, songTick, STEP_TICKS, fresh)) {
      startAudioClip(s.clip, time + s.delay * spt, s.into, spt)
    }
    // step lights in the rack/piano roll: the current pattern, if a clip of it is playing
    const clip = state.clips.find(
      (c) => c.kind === 'pattern' && c.patternId === state.currentPatternId && songTick >= c.start && songTick < c.start + c.length
    )
    const len = selectCurrentPattern(state).lengthSteps
    step = clip ? stepInPattern((songTick - clip.start + clip.offset) / STEP_TICKS, len) : -1
  } else {
    const pattern = selectCurrentPattern(state)
    step = stepInPattern(n, pattern.lengthSteps)
    const windowStart = step * STEP_TICKS
    for (const ch of state.channels) {
      for (const note of notesInWindow(pattern.notes[ch.id], windowStart, STEP_TICKS)) {
        playNote(ch.id, note, note.tick - windowStart, time, spt, state.swing)
      }
    }
  }

  // UI playhead: a timer aligned to the audio time. Not Tone.Draw — that uses
  // requestAnimationFrame, which stops when this window is hidden/covered.
  setTimeout(
    () => {
      if (useTransportUi.getState().playing) useTransportUi.setState({ step, songTick })
    },
    Math.max(0, (time - Tone.immediate()) * 1000)
  )
}

// ---- audio clips (Playlist) ----

const clipPlayers = new Set<Tone.Player | Tone.GrainPlayer>()
let clipBus: Tone.Gain | null = null

/**
 * Start an audio clip `into` ticks after its beginning. Resample mode: speed and
 * pitch move together (Player.playbackRate). Stretch mode: speed and pitch are
 * independent (granular GrainPlayer: playbackRate + detune).
 */
function startAudioClip(clip: Clip, at: number, into: number, spt: number) {
  const buffer = clip.sampleId ? sampleBuffers.get(clip.sampleId) : undefined
  if (!buffer?.loaded) return
  clipBus ??= new Tone.Gain(1).connect(insertInput(0)) // audio clips play through the Master insert
  const speed = clip.stretch ? clip.rate : clip.rate * Math.pow(2, clip.pitch / 12)
  const offset = clip.sourceOffset + into * spt * speed
  if (offset >= buffer.duration) return
  const remaining = (clip.length - into) * spt
  const player = clip.stretch
    ? new Tone.GrainPlayer({ url: buffer, playbackRate: clip.rate, detune: clip.pitch * 100, grainSize: 0.1, overlap: 0.05 })
    : new Tone.Player({ url: buffer, playbackRate: speed })
  player.volume.value = gainToDb(clip.gain)
  player.connect(clipBus)
  player.onstop = () => {
    clipPlayers.delete(player)
    setTimeout(() => player.dispose(), 50)
  }
  clipPlayers.add(player)
  player.start(at, offset)
  player.stop(at + remaining)
}

function stopAudioClips() {
  for (const p of clipPlayers) p.stop()
  clipPlayers.clear()
}

export const engine = {
  /** For dev inspection only. */
  _strips: strips,

  /** Idempotent. Call once at app start. */
  init() {
    if (started) return
    started = true
    const t = transport()
    t.PPQ = PPQ
    t.swing = 0 // swing is applied per-note in tick(); see timing.ts
    // Tone loads its AudioWorklet module (used by the Pluck's comb filter) on first
    // use, which takes a moment; warm it up now so the first pluck isn't silent.
    const warm = new Tone.FeedbackCombFilter()
    setTimeout(() => warm.dispose(), 5000)
    sync(useProject.getState())
    useProject.subscribe((s) => sync(s))
  },

  /** Start playback; `countInBars` > 0 clicks the metronome first (used when recording from stopped). */
  async play(countInBars = 0) {
    await Tone.start()
    if (useTransportUi.getState().playing) return
    const t = transport()
    absStep = 0
    countInSteps = Math.max(0, countInBars) * 16
    // song mode starts at the loop start, else at the song position marker
    const st = useProject.getState()
    songStart = st.loop ? st.loop.start : useTransportUi.getState().songPosition
    prevSongTick = -1
    t.position = 0
    repeatId = t.scheduleRepeat(tick, '16n', 0)
    t.start('+0.05')
    useTransportUi.setState({
      playing: true,
      step: st.songMode || countInSteps ? -1 : 0,
      songTick: st.songMode && !countInSteps ? songStart : -1
    })
  },

  stop() {
    const t = transport()
    t.stop()
    if (repeatId !== null) t.clear(repeatId)
    repeatId = null
    t.cancel(0)
    stopAudioClips()
    countInSteps = 0
    useTransportUi.setState({ playing: false, step: -1, songTick: -1 })
  },

  toggle() {
    if (useTransportUi.getState().playing) engine.stop()
    else void engine.play()
  },

  /**
   * Live record toggle. Turning it on while stopped starts the pattern with a
   * one-bar metronome count-in; the metronome keeps clicking while recording.
   * Turning it off stops recording (playback continues).
   */
  setRecording(on: boolean) {
    useTransportUi.setState({ recording: on })
    if (on && !useTransportUi.getState().playing) void engine.play(1)
  },

  /** Audition a channel immediately (clicking its name). */
  async preview(channelId: string) {
    await Tone.start()
    const ch = useProject.getState().channels.find((c) => c.id === channelId)
    const strip = strips.get(channelId)
    if (ch && strip) strip.voice.play(Tone.now() + 0.01, ROOT_KEY + ch.pitch, 0.8, 0.4)
  },

  /**
   * Live note (computer keyboard, on-screen keys, MIDI) on a channel. `key` is
   * the note's key (channel pitch is added, as for sequenced notes). Returns an
   * id for noteOff. While recording, the note is written into the current
   * pattern when released (snapped to the Piano Roll's snap).
   */
  noteOn(channelId: string, key: number, velocity = 0.8): number | null {
    const ch = useProject.getState().channels.find((c) => c.id === channelId)
    const strip = strips.get(channelId)
    if (!ch || !strip) return null
    void Tone.start()
    const now = Tone.immediate()
    const release = strip.voice.hold(now + LIVE_LATENCY, key + ch.pitch, velocity)
    const id = nextLiveId++
    live.set(id, { release, channelId, key, velocity, startedAt: now, tick: patternTickNow() })
    useHeldKeys.setState((s) => ({ keys: [...s.keys, key] }))
    return id
  },

  noteOff(id: number | null) {
    if (id === null) return
    const n = live.get(id)
    if (!n) return
    live.delete(id)
    const now = Tone.immediate()
    n.release(Math.max(now, n.startedAt) + LIVE_LATENCY)
    useHeldKeys.setState((s) => {
      const i = s.keys.indexOf(n.key)
      return i < 0 ? s : { keys: [...s.keys.slice(0, i), ...s.keys.slice(i + 1)] }
    })
    if (n.tick !== null && useTransportUi.getState().recording) recordNote(n, now)
  },

  allNotesOff() {
    for (const id of [...live.keys()]) engine.noteOff(id)
  }
}

// ---- live notes & recording ----

interface LiveNote {
  release(time: number): void
  channelId: string
  key: number
  velocity: number
  startedAt: number
  /** pattern position when pressed (null when not playing) */
  tick: number | null
}

/**
 * Live notes are scheduled this far ahead of "now". Too small and the audio
 * thread may already be past the start (short events like a pluck's noise
 * burst then never sound); 15 ms is below what players notice.
 */
const LIVE_LATENCY = 0.015

const live = new Map<number, LiveNote>()
let nextLiveId = 1

/** Keys currently held (for highlighting on-screen keyboards). */
export const useHeldKeys = create<{ keys: number[] }>(() => ({ keys: [] }))

/**
 * Position inside the current pattern at the moment you hear it (not the
 * look-ahead). During the count-in: a note played just before the downbeat
 * counts as beat 1; earlier ones are not recorded.
 */
function patternTickNow(): number | null {
  if (!useTransportUi.getState().playing) return null
  const len = selectCurrentPattern(useProject.getState()).lengthSteps * STEP_TICKS
  // you play along with what you *hear*, which leaves the speakers after the output latency
  const raw = Tone.getContext().rawContext as AudioContext
  const latency = raw.outputLatency || raw.baseLatency || 0
  const heard = Math.max(0, Tone.immediate() - latency)
  const ticks = transport().getTicksAtTime(heard) - countInSteps * STEP_TICKS
  if (ticks < 0) return ticks > -2 * STEP_TICKS ? 0 : null
  return ((ticks % len) + len) % len
}

function recordNote(n: LiveNote, releasedAt: number) {
  const state = useProject.getState()
  const len = selectCurrentPattern(state).lengthSteps * STEP_TICKS
  const heldTicks = (releasedAt - n.startedAt) / secondsPerTick(state.bpm)
  const { tick, length } = quantizeRecorded(n.tick!, heldTicks, len, usePianoRollUi.getState().snap)
  state.addNote(n.channelId, makeNote(tick, { key: n.key, velocity: n.velocity, length }))
}
