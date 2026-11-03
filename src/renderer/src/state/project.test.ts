import { beforeEach, describe, expect, it } from 'vitest'
import { initialProject, instrumentSource, makeNote, notesInStep, selectCurrentPattern, useProject } from './project'
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

  it('switching a default-named channel to an instrument renames it; a renamed one keeps its name', () => {
    const [kick, clap] = s().channels
    s().setChannelSource(kick.id, instrumentSource('piano'))
    s().updateChannel(clap.id, { name: 'My clap' })
    s().setChannelSource(clap.id, instrumentSource('bass'))
    expect(s().channels[0].name).toBe('Piano')
    expect(s().channels[1].name).toBe('My clap')
    expect(s().channels[1].source).toMatchObject({ type: 'instrument', kind: 'bass' })
  })

  it('sample settings are clamped; replacing the file keeps how it plays', () => {
    const id = s().addSampleChannel('/g/guitar A2.wav', 'guitar A2')
    s().updateSampleSettings(id, { root: 45.4, oneShot: false, attack: -1, release: 99 })
    let src = s().channels.find((c) => c.id === id)!.source
    expect(src).toMatchObject({ root: 45, oneShot: false, attack: 0, release: 10 })
    s().setChannelSample(id, '/g/guitar E2.wav', 'guitar E2')
    src = s().channels.find((c) => c.id === id)!.source
    expect(src).toMatchObject({ oneShot: false, root: 60 }) // new file: fresh root, same playback mode
  })

  it('instrument params are clamped', () => {
    const id = s().addChannel(instrumentSource('synth'))
    s().updateInstrumentParams(id, { brightness: 3, attack: 0 })
    const src = s().channels.find((c) => c.id === id)!.source
    expect(src.type === 'instrument' && [src.params.brightness, src.params.attack]).toEqual([1, 0.001])
  })

  it('addNote records into the current pattern in time order', () => {
    const kick = s().channels[0].id
    s().addNote(kick, makeNote(48, { key: 64 }))
    s().addNote(kick, makeNote(0, { key: 60 }))
    expect(notes(kick).map((n) => [n.tick, n.key])).toEqual([
      [0, 60],
      [48, 64]
    ])
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
