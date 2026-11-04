import { describe, expect, it } from 'vitest'
import { PROJECT_FORMAT, type ProjectDoc } from '@shared/api'
import { fromDoc, toDoc } from './persistence'
import { initialProject, instrumentSource, makeChannel, makeClip, makeNote, sampleSource } from './project'
import { STEP_TICKS, type ProjectData } from './types'

function sampleProject(): ProjectData {
  const p = initialProject()
  const sampleCh = makeChannel(sampleSource('s1', { root: 57, oneShot: false, release: 0.3 }), 'My kick')
  p.channels.push(makeChannel(instrumentSource('bass')))
  p.channels.push(sampleCh)
  p.samples = {
    s1: { id: 's1', name: 'My kick', path: 'C:\\samples\\kick.wav' },
    unused: { id: 'unused', name: 'Old', path: 'C:\\samples\\old.wav' }
  }
  p.patterns[0].notes[p.channels[0].id] = [makeNote(0), makeNote(4 * STEP_TICKS)]
  p.patterns[0].notes[sampleCh.id] = [makeNote(STEP_TICKS * 2, { velocity: 0.5 })]
  p.bpm = 142
  p.swing = 0.3
  return p
}

describe('project file round trip', () => {
  it('keeps everything that matters', () => {
    const p = sampleProject()
    const back = fromDoc(JSON.parse(JSON.stringify(toDoc(p))))
    expect(back.bpm).toBe(142)
    expect(back.swing).toBe(0.3)
    expect(back.channels).toEqual(p.channels)
    expect(back.patterns).toEqual(p.patterns)
    expect(back.currentPatternId).toBe(p.currentPatternId)
    expect(back.samples.s1).toEqual(p.samples.s1)
  })

  it('keeps the playlist: tracks, clips (pattern + audio with warp), song mode and loop', () => {
    const p = sampleProject()
    p.samples.track = { id: 'track', name: 'Vocals', path: 'C:\\v.wav' }
    p.clips = [
      makeClip({ trackId: p.tracks[0].id, kind: 'pattern', patternId: p.patterns[0].id, start: 384, length: 768, offset: 96 }),
      makeClip({ trackId: p.tracks[2].id, kind: 'audio', sampleId: 'track', start: 0, length: 300, sourceOffset: 1.5, pitch: -3, rate: 1.25, stretch: true })
    ]
    p.tracks[1].muted = true
    p.songMode = true
    p.loop = { start: 0, end: 768 }
    const doc = toDoc(p)
    expect(doc.samples.map((s) => s.id).sort()).toEqual(['s1', 'track']) // audio clip samples are saved too
    const back = fromDoc(JSON.parse(JSON.stringify(doc)))
    expect(back.clips).toEqual(p.clips)
    expect(back.tracks).toEqual(p.tracks)
    expect([back.songMode, back.loop]).toEqual([true, { start: 0, end: 768 }])
  })

  it('drops clips that point at missing tracks, patterns or samples', () => {
    const p = sampleProject()
    p.clips = [
      makeClip({ trackId: 'nope', kind: 'pattern', patternId: p.patterns[0].id, start: 0, length: 384 }),
      makeClip({ trackId: p.tracks[0].id, kind: 'pattern', patternId: 'gone', start: 0, length: 384 }),
      makeClip({ trackId: p.tracks[0].id, kind: 'audio', sampleId: 'gone', start: 0, length: 384 })
    ]
    expect(fromDoc(JSON.parse(JSON.stringify(toDoc(p)))).clips).toEqual([])
  })

  it('older files without a playlist get the default empty tracks', () => {
    const doc = toDoc(sampleProject())
    const old = { ...doc, project: { ...(doc.project as object), tracks: undefined, clips: undefined } }
    const back = fromDoc(old)
    expect(back.tracks).toHaveLength(8)
    expect(back.clips).toEqual([])
    expect(back.songMode).toBe(false)
  })

  it('keeps automation clips + curves and controllers; drops unused curves', () => {
    const p = sampleProject()
    p.automations = {
      a1: { id: 'a1', name: 'Filter sweep', targets: ['mix.1.volume'], points: [{ t: 0, v: 0.2 }, { t: 384, v: 0.9 }], smooth: true },
      orphan: { id: 'orphan', name: 'x', targets: [], points: [], smooth: false }
    }
    p.clips = [makeClip({ trackId: p.tracks[3].id, kind: 'automation', automationId: 'a1', start: 0, length: 384 })]
    p.controllers = [
      { id: 'l', kind: 'lfo', name: 'LFO 1', enabled: true, targets: ['mix.2.pan'], shape: 'triangle', sync: true, rate: 2, depth: 0.7, center: 0.4 },
      { id: 'k', kind: 'peak', name: 'Peak 1', enabled: false, targets: [], source: 'mix.1', base: 1, amount: -0.5, release: 0.3 }
    ]
    const back = fromDoc(JSON.parse(JSON.stringify(toDoc(p))))
    expect(Object.keys(back.automations)).toEqual(['a1'])
    expect(back.automations.a1).toEqual(p.automations.a1)
    expect(back.clips).toEqual(p.clips)
    expect(back.controllers).toEqual(p.controllers)
  })

  it('keeps the mixer and refuses looping sends from a file', () => {
    const p = sampleProject()
    p.mixer[1].fx.push({ id: 'f1', type: 'delay', enabled: false, params: { time: 0.25, feedback: 0.5, mix: 0.4 } })
    p.mixer[1].sends.push({ target: 2, amount: 0.5, sidechain: false })
    p.mixer[2].sends.push({ target: 1, amount: 1, sidechain: true }) // loop: must be dropped
    p.mixer[3].volume = 9
    p.channels[0].mixerTarget = 1
    const back = fromDoc(JSON.parse(JSON.stringify(toDoc(p))))
    expect(back.mixer[1].fx).toEqual(p.mixer[1].fx)
    expect(back.mixer[1].sends).toEqual([
      { target: 0, amount: 1, sidechain: false },
      { target: 2, amount: 0.5, sidechain: false }
    ])
    expect(back.mixer[2].sends).toEqual([{ target: 0, amount: 1, sidechain: false }])
    expect(back.mixer[3].volume).toBe(1.25)
    expect(back.channels[0].mixerTarget).toBe(1)
  })

  it('only saves samples that channels use', () => {
    const doc = toDoc(sampleProject())
    expect(doc.samples.map((s) => s.id)).toEqual(['s1'])
    expect(doc.format).toBe(PROJECT_FORMAT)
  })
})

describe('fromDoc is defensive', () => {
  const doc = (project: unknown, samples: ProjectDoc['samples'] = []): ProjectDoc => ({
    format: PROJECT_FORMAT,
    version: 1,
    savedAt: '',
    project,
    samples
  })

  it('rejects files that are not projects', () => {
    expect(() => fromDoc({ format: 'something-else' } as unknown as ProjectDoc)).toThrow(/not a Drummachine/)
  })

  it('fills defaults for an empty project', () => {
    const p = fromDoc(doc({}))
    expect(p.patterns).toHaveLength(1)
    expect(p.channels).toEqual([])
    expect(p.bpm).toBe(130)
    expect(p.currentPatternId).toBe(p.patterns[0].id)
  })

  it('clamps values, drops broken channels/notes and notes of unknown channels', () => {
    const p = fromDoc(
      doc({
        bpm: 9999,
        channels: [
          { id: 'a', name: 'Kick', source: { type: 'synth', preset: 'kick' }, volume: 7, pan: -9, pitch: 99 },
          { id: 'b', source: { type: 'synth', preset: 'theremin' } },
          { id: 'c', source: { type: 'sample', sampleId: 'nope' } },
          'garbage'
        ],
        patterns: [{ id: 'p', name: 'P', lengthSteps: 16, notes: { a: [{ tick: 0 }, { tick: -5 }, 'x'], ghost: [{ tick: 0 }] } }],
        currentPatternId: 'missing'
      })
    )
    expect(p.bpm).toBe(400)
    expect(p.channels.map((c) => c.id)).toEqual(['a'])
    expect([p.channels[0].volume, p.channels[0].pan, p.channels[0].pitch]).toEqual([1, -1, 24])
    expect(p.patterns[0].notes.a.map((n) => n.tick)).toEqual([0])
    expect(p.patterns[0].notes.ghost).toBeUndefined()
    expect(p.currentPatternId).toBe('p')
  })

  it('instrument params are clamped and defaulted', () => {
    const p = fromDoc(
      doc({ channels: [{ id: 'i', name: 'Keys', source: { type: 'instrument', kind: 'piano', params: { attack: -1, brightness: 9 } } }] })
    )
    const src = p.channels[0].source
    expect(src.type === 'instrument' && src.params).toEqual({ attack: 0.001, release: 1.2, brightness: 1, glide: 0 })
  })

  it('Phase 3 sample channels (no root/oneShot) load as one-shot at C5', () => {
    const p = fromDoc(
      doc({ channels: [{ id: 'x', name: 'Old', source: { type: 'sample', sampleId: 's' } }] }, [
        { id: 's', name: 'Old', absPath: '/a.wav', relPath: null }
      ])
    )
    expect(p.channels[0].source).toEqual({ type: 'sample', sampleId: 's', root: 60, oneShot: true, attack: 0, release: 0.08 })
  })

  it('keeps sample channels whose sample entry exists', () => {
    const p = fromDoc(
      doc({ channels: [{ id: 'x', name: 'Loop', source: { type: 'sample', sampleId: 's' } }] }, [
        { id: 's', name: 'Loop', absPath: '/a/loop.wav', relPath: 'samples/loop.wav' }
      ])
    )
    expect(p.channels[0].source).toMatchObject({ type: 'sample', sampleId: 's' })
    expect(p.samples.s.path).toBe('/a/loop.wav')
  })
})
