import { secondsPerTick } from '@/audio/timing'
import { makeNote } from '@/state/project'
import type { Note } from '@/state/types'

/**
 * Score log: every key you play (typing keyboard, on-screen keys, MIDI) is
 * remembered, even when nothing is playing or recording. "Capture" turns your
 * last phrase into Piano Roll notes (FL: "dump score log"). Times are seconds
 * on the audio clock.
 */

export interface PlayedNote {
  channelId: string
  key: number
  velocity: number
  start: number
  end: number
}

const MAX_EVENTS = 4000
const log: PlayedNote[] = []
/** per channel: notes that started at or before this time were already captured */
const capturedUntil = new Map<string, number>()

export function logPlayed(n: PlayedNote) {
  log.push(n)
  if (log.length > MAX_EVENTS) log.splice(0, log.length - MAX_EVENTS)
}

/** The most recent phrase: walk back from the last note while the pauses are shorter than `gap` seconds. */
export function lastPhrase(events: PlayedNote[], gap = 3): PlayedNote[] {
  if (events.length === 0) return []
  const sorted = [...events].sort((a, b) => a.start - b.start)
  let first = sorted.length - 1
  let phraseStart = sorted[first].start
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (phraseStart - sorted[i].end > gap && phraseStart - sorted[i].start > gap) break
    first = i
    phraseStart = Math.min(phraseStart, sorted[i].start)
  }
  return sorted.slice(first)
}

/** Played times → notes at `bpm`, snapped to `snap` ticks, starting at tick 0. */
export function phraseToNotes(phrase: PlayedNote[], bpm: number, snap: number): Note[] {
  if (phrase.length === 0) return []
  const spt = secondsPerTick(bpm)
  const t0 = Math.min(...phrase.map((p) => p.start))
  const snapTo = (ticks: number) => Math.round(ticks / snap) * snap
  return phrase.map((p) =>
    makeNote(Math.max(0, snapTo((p.start - t0) / spt)), {
      key: p.key,
      velocity: p.velocity,
      length: Math.max(snap, snapTo((p.end - p.start) / spt))
    })
  )
}

/** Take (and mark as captured) the last uncaptured phrase played on a channel. */
export function takePhrase(channelId: string, gap = 3): PlayedNote[] {
  const since = capturedUntil.get(channelId) ?? -Infinity
  const phrase = lastPhrase(log.filter((e) => e.channelId === channelId && e.start > since), gap)
  if (phrase.length) capturedUntil.set(channelId, Math.max(...phrase.map((p) => p.start)))
  return phrase
}

/** How many notes are waiting to be captured on a channel (for the button state). */
export function pendingCount(channelId: string): number {
  const since = capturedUntil.get(channelId) ?? -Infinity
  return log.filter((e) => e.channelId === channelId && e.start > since).length
}
