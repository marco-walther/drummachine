import { describe, expect, it } from 'vitest'
import { PROJECT_FORMAT, type ProjectDoc } from '@shared/api'
import { fromDoc, toDoc } from './persistence'
import { initialProject, makeChannel, makeNote } from './project'
import { STEP_TICKS, type ProjectData } from './types'

function sampleProject(): ProjectData {
  const p = initialProject()
  const sampleCh = makeChannel({ type: 'sample', sampleId: 's1' }, 'My kick')
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

  it('keeps sample channels whose sample entry exists', () => {
    const p = fromDoc(
      doc({ channels: [{ id: 'x', name: 'Loop', source: { type: 'sample', sampleId: 's' } }] }, [
        { id: 's', name: 'Loop', absPath: '/a/loop.wav', relPath: 'samples/loop.wav' }
      ])
    )
    expect(p.channels[0].source).toEqual({ type: 'sample', sampleId: 's' })
    expect(p.samples.s.path).toBe('/a/loop.wav')
  })
})
