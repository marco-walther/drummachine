import { describe, expect, it } from 'vitest'
import { makeClip, makeNote, makePattern, makeTrack, splitClip } from '@/state/project'
import { audioClipStarts, songEnd, songNoteEvents, songTickAt } from './song'

const S = 24
const pattern = makePattern('P', 16) // 384 ticks
pattern.notes.kick = [makeNote(0), makeNote(8 * S)]
const track = makeTrack('T1')
const muted = { ...makeTrack('T2'), muted: true }

const at = (clips: ReturnType<typeof makeClip>[], T: number) =>
  songNoteEvents(clips, [track, muted], [pattern], T).map((e) => `${e.channelId}@${T + e.offset}`)

describe('song scheduling', () => {
  it('plays a pattern clip at its position', () => {
    const clip = makeClip({ trackId: track.id, kind: 'pattern', patternId: pattern.id, start: 384, length: 384 })
    expect(at([clip], 0)).toEqual([])
    expect(at([clip], 384)).toEqual(['kick@384'])
    expect(at([clip], 384 + 8 * S)).toEqual(['kick@576'])
    expect(at([clip], 768)).toEqual([]) // clip ended
  })

  it('loops the pattern when the clip is longer, and honours the left trim offset', () => {
    const long = makeClip({ trackId: track.id, kind: 'pattern', patternId: pattern.id, start: 0, length: 768 })
    expect(at([long], 384)).toEqual(['kick@384'])
    const trimmed = makeClip({ trackId: track.id, kind: 'pattern', patternId: pattern.id, start: 0, length: 384, offset: 8 * S })
    expect(at([trimmed], 0)).toEqual(['kick@0']) // the note at step 8 now starts the clip
    expect(at([trimmed], 8 * S)).toEqual(['kick@192']) // pattern wrapped: its step 0
  })

  it('skips muted tracks and unknown patterns', () => {
    const onMuted = makeClip({ trackId: muted.id, kind: 'pattern', patternId: pattern.id, start: 0, length: 384 })
    const ghost = makeClip({ trackId: track.id, kind: 'pattern', patternId: 'nope', start: 0, length: 384 })
    expect(at([onMuted, ghost], 0)).toEqual([])
  })

  it('starts audio clips on time, or mid-clip on the first window', () => {
    const a = makeClip({ trackId: track.id, kind: 'audio', sampleId: 's', start: 96, length: 192 })
    expect(audioClipStarts([a], [track], 96, S, false).map((x) => [x.delay, x.into])).toEqual([[0, 0]])
    expect(audioClipStarts([a], [track], 144, S, false)).toEqual([])
    expect(audioClipStarts([a], [track], 144, S, true).map((x) => [x.delay, x.into])).toEqual([[0, 48]])
  })

  it('wraps inside the loop region', () => {
    const loop = { start: 384, end: 768 }
    expect(songTickAt(384, 0, S, loop)).toBe(384)
    expect(songTickAt(384, 16, S, loop)).toBe(384) // wrapped after one bar
    expect(songTickAt(0, 20, S, null)).toBe(480)
  })

  it('splits clips keeping content aligned', () => {
    const c = makeClip({ trackId: track.id, kind: 'pattern', patternId: pattern.id, start: 0, length: 384 })
    const [l, r] = splitClip(c, 96, 0.005)!
    expect([l.start, l.length, r.start, r.length, r.offset]).toEqual([0, 96, 96, 288, 96])
    expect(splitClip(c, 0, 0.005)).toBeNull()
    expect(songEnd([c, r])).toBe(384)
  })
})
