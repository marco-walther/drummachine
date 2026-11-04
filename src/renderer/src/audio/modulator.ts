import * as Tone from 'tone'
import { useProject } from '@/state/project'
import { useTransportUi } from '@/state/transport-ui'
import type { ParamRef } from '@/state/types'
import { insertParams, meterLevels, setFxParam } from './mixer-engine'
import { automationEvents, followPeak, lfoOutput } from './modulation'
import { currentNorm, paramInfo } from './params'
import { gainToDb } from './timing'
import type { Voice } from './voices'

/**
 * Moves parameters for automation clips and controllers, without changing the
 * saved project (FL behaviour: the automation drives the knob while playing).
 * Values are normalized 0..1; params.ts maps them to real values.
 */

export interface StripAccess {
  channel: Tone.Channel
  voice: Voice
  silent: boolean
}

/** level meters on channel strips, created when a peak controller listens to one */
const channelMeters = new Map<string, { channel: Tone.Channel; meter: Tone.Meter }>

let getStrip: (channelId: string) => StripAccess | undefined = () => undefined

export function connectStrips(fn: (channelId: string) => StripAccess | undefined) {
  getStrip = fn
}

/**
 * Values automation/controllers currently hold on instrument and Patcher
 * settings. Several can move one voice at once, so each update is the saved
 * settings plus every held value, never just one of them.
 */
const held = new Map<ParamRef, number>()

function applyHeld(channelId: string, voice: Voice) {
  const src = useProject.getState().channels.find((x) => x.id === channelId)?.source
  if (!src) return
  const mine = [...held].map(([ref, v]) => [ref.split('.'), v] as const).filter(([[, ch]]) => ch === channelId)
  if (src.type === 'instrument') {
    const params = { ...src.params }
    for (const [[k, , p], v] of mine) if (k === 'inst') params[p as keyof typeof params] = v
    voice.update({ ...src, params })
  } else if (src.type === 'patcher') {
    voice.update({
      ...src,
      nodes: src.nodes.map((n) => {
        if (n.kind === 'out') return n
        let next = n
        for (const [[k, , id, p], v] of mine) {
          if (k !== 'patch' || id !== n.id) continue
          if (next.kind === 'inst' && p === 'level') next = { ...next, level: v }
          else next = { ...next, params: { ...next.params, [p]: v } } as typeof n
        }
        return next
      })
    })
  }
}

type ParamTarget =
  | { kind: 'param'; param: Tone.Param<'decibels'> | Tone.Param<'audioRange'>; map(v: number): number }
  | { kind: 'set'; set(v: number): void }

function target(ref: ParamRef): ParamTarget | null {
  const state = useProject.getState()
  const [kind, a, b, c] = ref.split('.')
  if (kind === 'ch') {
    const strip = getStrip(a)
    if (!strip || (b === 'volume' && strip.silent)) return null // never un-mute by automating volume
    return b === 'volume'
      ? { kind: 'param', param: strip.channel.volume, map: (v) => gainToDb(Math.max(0.0001, v)) }
      : { kind: 'param', param: strip.channel.pan, map: (v) => v }
  }
  if (kind === 'mix') {
    const i = Number(a)
    const p = insertParams(i)
    if (!p || (b === 'volume' && state.mixer[i]?.muted)) return null
    return b === 'volume' ? { kind: 'param', param: p.volume, map: (v) => gainToDb(Math.max(0.0001, v)) } : { kind: 'param', param: p.pan, map: (v) => v }
  }
  if (kind === 'inst' || kind === 'patch') {
    const ch = state.channels.find((x) => x.id === a)
    const strip = getStrip(a)
    if (!ch || !strip || ch.source.type !== (kind === 'inst' ? 'instrument' : 'patcher')) return null
    return {
      kind: 'set',
      set: (v) => {
        held.set(ref, v)
        applyHeld(a, strip.voice)
      }
    }
  }
  if (kind === 'fx') return { kind: 'set', set: (v) => setFxParam(Number(a), b, c, v) }
  return null
}

/** Ramp a parameter from → to (normalized) over [time, time + dur]. */
function rampParam(ref: ParamRef, from: number, to: number, time: number, dur: number) {
  const info = paramInfo(useProject.getState(), ref)
  const t = info && target(ref)
  if (!info || !t) return
  if (t.kind === 'param') {
    t.param.setValueAtTime(t.map(info.toValue(from)), time)
    t.param.linearRampToValueAtTime(t.map(info.toValue(to)), time + dur)
  } else {
    // not an audio-rate param: apply at the right moment (step resolution is enough)
    const timers = pending.get(ref) ?? new Set()
    pending.set(ref, timers)
    const h = setTimeout(() => {
      timers.delete(h)
      t.set(info.toValue(to))
    }, Math.max(0, (time - Tone.immediate()) * 1000))
    timers.add(h)
  }
}

/** queued (look-ahead) sets of non-audio-rate params, so a restore can cancel them */
const pending = new Map<ParamRef, Set<ReturnType<typeof setTimeout>>>()

/**
 * Put a parameter back to its saved value. Ramps already queued ahead by the
 * scheduler (look-ahead) are cancelled first, or they would land afterwards.
 */
function restore(ref: ParamRef) {
  const state = useProject.getState()
  const info = paramInfo(state, ref)
  const t = info && target(ref)
  if (!info || !t) return
  const value = info.toValue(currentNorm(state, ref))
  if (t.kind === 'param') {
    const now = Tone.immediate()
    t.param.cancelScheduledValues(now)
    t.param.setValueAtTime(t.map(value), now + 0.005)
  } else {
    // like cancelScheduledValues above: queued sets must not land afterwards
    for (const h of pending.get(ref) ?? []) clearTimeout(h)
    pending.delete(ref)
    t.set(value)
    // back on the saved value: later edits to the knob must not be overridden
    held.delete(ref)
  }
}

// ---- automation clips (song mode, called from the scheduler) ----

const automated = new Set<ParamRef>()

export function applyAutomation(T: number, span: number, time: number, spt: number) {
  const state = useProject.getState()
  for (const e of automationEvents(state.clips, state.tracks, state.automations, T, span)) {
    automated.add(e.ref)
    rampParam(e.ref, e.from, e.to, time, span * spt)
  }
}

/** Transport stopped: automated parameters go back to their saved values. */
export function endAutomation() {
  for (const ref of automated) restore(ref)
  automated.clear()
}

// ---- controllers (LFO, peak), control rate ~30 ms ----

const driven = new Set<ParamRef>()
const peaks = new Map<string, number>()
let lastTick = 0

function sourceLevel(source: string): number {
  const [kind, id] = source.split('.')
  if (kind === 'mix') return meterLevels()[Number(id)] ?? 0
  const strip = getStrip(id)
  if (!strip) return 0
  let m = channelMeters.get(id)
  if (!m || m.channel !== strip.channel) {
    m?.meter.dispose()
    m = { channel: strip.channel, meter: new Tone.Meter({ smoothing: 0.3 }) }
    strip.channel.connect(m.meter)
    channelMeters.set(id, m)
  }
  const db = m.meter.getValue() as number
  return Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 60) / 66)) : 0
}

function controlTick() {
  const state = useProject.getState()
  const nowWall = performance.now() / 1000
  const dt = lastTick ? nowWall - lastTick : 0.03
  lastTick = nowWall
  const now = Tone.immediate()
  const transport = Tone.getTransport()
  const playing = useTransportUi.getState().playing
  const active = new Set<ParamRef>()

  for (const c of state.controllers) {
    if (!c.enabled || c.targets.length === 0) continue
    let value: number
    if (c.kind === 'lfo') {
      // tempo-synced LFOs follow the song position while playing
      const seconds = playing ? transport.seconds : nowWall
      const phase = c.sync ? (seconds * state.bpm) / 60 / c.rate : seconds * c.rate
      value = lfoOutput(c.shape, phase, c.depth, c.center)
    } else {
      const level = followPeak(peaks.get(c.id) ?? 0, sourceLevel(c.source), dt, c.release)
      peaks.set(c.id, level)
      value = Math.min(1, Math.max(0, c.base + c.amount * level))
    }
    for (const ref of c.targets) {
      active.add(ref)
      rampParam(ref, value, value, now + 0.03, 0.001)
    }
  }
  // targets no controller drives any more go back to their saved values
  for (const ref of driven) if (!active.has(ref) && !automated.has(ref)) restore(ref)
  driven.clear()
  for (const ref of active) driven.add(ref)
}

let timer: ReturnType<typeof setInterval> | null = null
export function startControllers() {
  timer ??= setInterval(controlTick, 30)
}
