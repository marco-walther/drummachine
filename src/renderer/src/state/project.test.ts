import { beforeEach, describe, expect, it } from 'vitest'
import { initialProject, notesInStep, selectCurrentPattern, useProject } from './project'
import { STEP_TICKS } from './types'

const s = () => useProject.getState()
const notes = (chId: string) => selectCurrentPattern(s()).notes[chId] ?? []

beforeEach(() => useProject.setState(initialProject()))

describe('project store', () => {
  it('starts with the 4-channel default kit and one pattern', () => {
    expect(s().channels.map((c) => c.name)).toEqual(['Kick', 'Clap', 'Hat', 'Snare'])
    expect(s().patterns).toHaveLength(1)
  })

  it('toggleStep adds then removes a step note', () => {
    const kick = s().channels[0].id
    s().toggleStep(kick, 4)
    expect(notes(kick).map((n) => n.tick)).toEqual([4 * STEP_TICKS])
    s().toggleStep(kick, 4)
    expect(notes(kick)).toEqual([])
  })

  it('setStep is idempotent and ignores out-of-range steps', () => {
    const kick = s().channels[0].id
    s().setStep(kick, 0, true)
    s().setStep(kick, 0, true)
    s().setStep(kick, 99, true)
    expect(notes(kick)).toHaveLength(1)
  })

  it('fillEvery(4) gives four-on-the-floor in 16 steps', () => {
    const kick = s().channels[0].id
    s().fillEvery(kick, 4)
    expect(notes(kick).map((n) => n.tick / STEP_TICKS)).toEqual([0, 4, 8, 12])
  })

  it('removeChannel deletes its notes from every pattern', () => {
    const kick = s().channels[0].id
    s().setStep(kick, 0, true)
    s().clonePattern(s().currentPatternId)
    s().removeChannel(kick)
    expect(s().channels).toHaveLength(3)
    for (const p of s().patterns) expect(p.notes[kick]).toBeUndefined()
  })

  it('clonePattern deep-copies notes', () => {
    const kick = s().channels[0].id
    const original = s().currentPatternId
    s().setStep(kick, 0, true)
    s().clonePattern(original)
    s().setStep(kick, 1, true) // edits the clone (now current)
    const orig = s().patterns.find((p) => p.id === original)!
    expect(notesInStep(orig.notes[kick], 1)).toEqual([])
    expect(notes(kick)).toHaveLength(2)
  })

  it('cannot delete the last pattern', () => {
    s().deletePattern(s().currentPatternId)
    expect(s().patterns).toHaveLength(1)
  })

  it('toggleSolo is exclusive', () => {
    const [a, b] = s().channels
    s().toggleSolo(a.id)
    s().toggleSolo(b.id)
    expect(s().channels.filter((c) => c.solo).map((c) => c.id)).toEqual([b.id])
  })

  it('moveChannel reorders', () => {
    const ids = s().channels.map((c) => c.id)
    s().moveChannel(0, 2)
    expect(s().channels.map((c) => c.id)).toEqual([ids[1], ids[2], ids[0], ids[3]])
  })

  it('sample channels reuse one sample entry per file', () => {
    const a = s().addSampleChannel('C:\\s\\kick.wav', 'kick')
    const b = s().addSampleChannel('C:\\s\\kick.wav', 'kick')
    const ids = s().channels.filter((c) => c.id === a || c.id === b).map((c) => c.source)
    expect(ids[0]).toEqual(ids[1])
    expect(Object.keys(s().samples)).toHaveLength(1)
  })

  it('setChannelSample replaces a channel sound and name', () => {
    const kick = s().channels[0].id
    s().setChannelSample(kick, '/x/boom.wav', 'boom')
    const ch = s().channels[0]
    expect(ch.name).toBe('boom')
    expect(ch.source.type).toBe('sample')
  })

  it('relinkSamples updates paths', () => {
    const ch = s().addSampleChannel('/old/a.wav', 'a')
    const src = s().channels.find((c) => c.id === ch)!.source
    const id = src.type === 'sample' ? src.sampleId : ''
    s().relinkSamples({ [id]: '/project/samples/a.wav' })
    expect(s().samples[id].path).toBe('/project/samples/a.wav')
  })

  it('clamps bpm and channel params', () => {
    s().setBpm(1000)
    expect(s().bpm).toBe(400)
    const ch = s().channels[0].id
    s().updateChannel(ch, { volume: 2, pan: -3, pitch: 30.4 })
    const c = s().channels[0]
    expect([c.volume, c.pan, c.pitch]).toEqual([1, -1, 24])
  })
})
