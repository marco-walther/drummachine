import { describe, expect, it } from 'vitest'
import { lastPhrase, logPlayed, phraseToNotes, takePhrase, type PlayedNote } from './capture'

const p = (start: number, dur: number, key = 60, channelId = 'c'): PlayedNote => ({ channelId, key, velocity: 0.8, start, end: start + dur })

describe('score log capture', () => {
  it('finds the last phrase after a long pause', () => {
    const events = [p(0, 0.2, 48), p(0.5, 0.2, 50), p(10, 0.2, 60), p(10.5, 0.2, 62), p(11, 0.4, 64)]
    expect(lastPhrase(events).map((e) => e.key)).toEqual([60, 62, 64])
    expect(lastPhrase(events, 20).map((e) => e.key)).toEqual([48, 50, 60, 62, 64])
  })

  it('a held note bridges the gap (still the same phrase)', () => {
    expect(lastPhrase([p(0, 5, 40), p(6, 0.2, 60)]).map((e) => e.key)).toEqual([40, 60])
  })

  it('converts to snapped notes at the tempo, starting at 0', () => {
    // 120 bpm: 1/16 = 0.125 s = 24 ticks
    const notes = phraseToNotes([p(10, 0.24, 60), p(10.26, 0.1, 64), p(10.5, 0.5, 67)], 120, 24)
    expect(notes.map((n) => [n.tick, n.key, n.length])).toEqual([
      [0, 60, 48],
      [48, 64, 24], // slightly late → snapped; too short → one step
      [96, 67, 96]
    ])
  })

  it('takePhrase only returns notes not captured before, per channel', () => {
    logPlayed(p(100, 0.2, 60, 'x'))
    logPlayed(p(100.3, 0.2, 62, 'x'))
    logPlayed(p(100.3, 0.2, 70, 'other'))
    expect(takePhrase('x').map((e) => e.key)).toEqual([60, 62])
    expect(takePhrase('x')).toEqual([])
    logPlayed(p(101, 0.2, 65, 'x'))
    expect(takePhrase('x').map((e) => e.key)).toEqual([65])
  })
})
