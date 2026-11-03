import * as Tone from 'tone'
import { selectCurrentPattern, useProject } from '@/state/project'
import { useTransportUi } from '@/state/transport-ui'
import { PPQ, ROOT_KEY, STEP_TICKS, type Channel, type ProjectData } from '@/state/types'
import { isSilent } from './mixing'
import { ensureSamples } from './samples'
import { gainToDb, notesInWindow, secondsPerTick, stepInPattern, swingDelayTicks } from './timing'
import { createVoice, sourceKey, type Voice } from './voices'

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
  channel: Tone.Channel
  key: string
  /** last values pushed to the audio params (avoid re-scheduling on every state change) */
  applied: { volume: number; pan: number; silent: boolean }
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
    strip.voice.output.connect(strip.channel)
    strip.key = key
  }
  if (!strip) {
    // Mixer routing (ch.mixerTarget) is applied in Phase 6; until then → master.
    const channel = new Tone.Channel().toDestination()
    const voice = createVoice(ch.source)
    voice.output.connect(channel)
    strip = { voice, channel, key, applied: { volume: NaN, pan: NaN, silent: false } }
    strips.set(ch.id, strip)
  }
  const a = strip.applied
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
  Tone.getDestination().volume.value = gainToDb(state.masterVolume)

  const ids = new Set(state.channels.map((c) => c.id))
  for (const [id, strip] of strips) {
    if (!ids.has(id)) {
      strip.voice.dispose()
      strip.channel.dispose()
      strips.delete(id)
    }
  }
  ensureSamples(state.samples)
  const anySolo = state.channels.some((c) => c.solo)
  for (const ch of state.channels) syncChannel(ch, anySolo)
}

function tick(time: number) {
  const state = useProject.getState()
  const pattern = selectCurrentPattern(state)
  const step = stepInPattern(absStep++, pattern.lengthSteps)
  const windowStart = step * STEP_TICKS
  const spt = secondsPerTick(state.bpm)

  for (const ch of state.channels) {
    const strip = strips.get(ch.id)
    if (!strip) continue
    for (const note of notesInWindow(pattern.notes[ch.id], windowStart, STEP_TICKS)) {
      const offset = note.tick - windowStart + swingDelayTicks(note.tick, state.swing)
      strip.voice.trigger(time + offset * spt, note.velocity, ch.pitch + (note.key - ROOT_KEY))
    }
  }

  // UI playhead: a timer aligned to the audio time. Not Tone.Draw — that uses
  // requestAnimationFrame, which stops when this window is hidden/covered.
  setTimeout(
    () => {
      if (useTransportUi.getState().playing) useTransportUi.setState({ step })
    },
    Math.max(0, (time - Tone.immediate()) * 1000)
  )
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
    sync(useProject.getState())
    useProject.subscribe((s) => sync(s))
  },

  async play() {
    await Tone.start()
    if (useTransportUi.getState().playing) return
    const t = transport()
    absStep = 0
    t.position = 0
    repeatId = t.scheduleRepeat(tick, '16n', 0)
    t.start('+0.05')
    useTransportUi.setState({ playing: true, step: 0 })
  },

  stop() {
    const t = transport()
    t.stop()
    if (repeatId !== null) t.clear(repeatId)
    repeatId = null
    t.cancel(0)
    useTransportUi.setState({ playing: false, step: -1 })
  },

  toggle() {
    if (useTransportUi.getState().playing) engine.stop()
    else void engine.play()
  },

  /** Audition a channel immediately (clicking its name). */
  async preview(channelId: string) {
    await Tone.start()
    const ch = useProject.getState().channels.find((c) => c.id === channelId)
    const strip = strips.get(channelId)
    if (ch && strip) strip.voice.trigger(Tone.now() + 0.01, 0.8, ch.pitch)
  }
}
