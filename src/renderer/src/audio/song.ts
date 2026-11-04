import { STEP_TICKS, type Clip, type Note, type Pattern, type PlaylistTrack } from '@/state/types'

/**
 * Song (Playlist) scheduling math, pure. The engine asks, once per 1/16 window
 * [T, T+span) of song time: which notes start here, and which audio clips?
 */

export interface SongNoteEvent {
  channelId: string
  note: Note
  /** ticks after the window start */
  offset: number
}

const audible = (clips: Clip[], tracks: PlaylistTrack[]) => {
  const muted = new Set(tracks.filter((t) => t.muted).map((t) => t.id))
  const known = new Set(tracks.map((t) => t.id))
  return clips.filter((c) => known.has(c.trackId) && !muted.has(c.trackId))
}

/**
 * Notes starting in [T, T+span). A pattern clip shows its pattern from `offset`
 * and loops it when the clip is longer than the pattern (FL behaviour).
 */
export function songNoteEvents(
  clips: Clip[],
  tracks: PlaylistTrack[],
  patterns: Pattern[],
  T: number,
  span = STEP_TICKS
): SongNoteEvent[] {
  const byId = new Map(patterns.map((p) => [p.id, p]))
  const out: SongNoteEvent[] = []
  for (const clip of audible(clips, tracks)) {
    if (clip.kind !== 'pattern' || !clip.patternId) continue
    const lo = Math.max(T, clip.start)
    const hi = Math.min(T + span, clip.start + clip.length)
    if (lo >= hi) continue
    const pattern = byId.get(clip.patternId)
    if (!pattern) continue
    const L = pattern.lengthSteps * STEP_TICKS
    for (const [channelId, notes] of Object.entries(pattern.notes)) {
      for (const note of notes) {
        // the note sounds at song ticks base + k·L
        const base = clip.start - clip.offset + note.tick
        const k = Math.ceil((lo - base) / L)
        const at = base + k * L
        if (at >= lo && at < hi) out.push({ channelId, note, offset: at - T })
      }
    }
  }
  return out
}

export interface AudioClipStart {
  clip: Clip
  /** ticks after the window start when it begins */
  delay: number
  /** ticks into the clip where playback begins (> 0 when starting mid-clip) */
  into: number
}

/**
 * Audio clips to start in [T, T+span). On the first window after play or a
 * loop jump (`fresh`), clips already under the playhead start mid-clip.
 */
export function audioClipStarts(clips: Clip[], tracks: PlaylistTrack[], T: number, span: number, fresh: boolean): AudioClipStart[] {
  const out: AudioClipStart[] = []
  for (const clip of audible(clips, tracks)) {
    if (clip.kind !== 'audio') continue
    const end = clip.start + clip.length
    if (clip.start >= T && clip.start < T + span) out.push({ clip, delay: clip.start - T, into: 0 })
    else if (fresh && clip.start < T && end > T) out.push({ clip, delay: 0, into: T - clip.start })
  }
  return out
}

/** Song position for the n-th window since play, wrapping inside the loop region. */
export function songTickAt(start: number, n: number, span: number, loop: { start: number; end: number } | null): number {
  const T = start + n * span
  if (!loop || T < loop.end || start >= loop.end) return T
  const len = loop.end - loop.start
  return loop.start + ((T - loop.start) % len)
}

/** End of the arrangement (last clip end), in ticks. */
export function songEnd(clips: Clip[]): number {
  return clips.reduce((m, c) => Math.max(m, c.start + c.length), 0)
}
