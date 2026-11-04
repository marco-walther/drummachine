import { describe, expect, it } from 'vitest'
import { initialProject, instrumentSource, makeChannel, makeClip, makeTrack } from '@/state/project'
import { automationEvents, automationValueAt, followPeak, lfoOutput, lfoShape } from './modulation'
import { currentNorm, listParams, paramInfo } from './params'

const pts = [
  { t: 0, v: 0 },
  { t: 100, v: 1 },
  { t: 200, v: 0.5 }
]

describe('automation curves', () => {
  it('interpolates linearly or smoothly, flat outside the points', () => {
    expect(automationValueAt(pts, -5, false)).toBe(0)
    expect(automationValueAt(pts, 50, false)).toBeCloseTo(0.5)
    expect(automationValueAt(pts, 25, true)).toBeLessThan(0.25) // eased start
    expect(automationValueAt(pts, 150, false)).toBeCloseTo(0.75)
    expect(automationValueAt(pts, 999, false)).toBe(0.5)
    expect(automationValueAt([], 0, false)).toBeNull()
  })

  it('emits events only for automation clips under the window, per target', () => {
    const track = makeTrack('T')
    const auto = { id: 'a', name: 'A', targets: ['mix.1.volume', 'ch.x.pan'], points: pts, smooth: false }
    const clip = makeClip({ trackId: track.id, kind: 'automation', automationId: 'a', start: 384, length: 200 })
    expect(automationEvents([clip], [track], { a: auto }, 0, 24)).toEqual([])
    const ev = automationEvents([clip], [track], { a: auto }, 384 + 48, 24)
    expect(ev.map((e) => e.ref)).toEqual(['mix.1.volume', 'ch.x.pan'])
    expect(ev[0].from).toBeCloseTo(0.48)
    expect(ev[0].to).toBeCloseTo(0.72)
    const muted = { ...track, muted: true }
    expect(automationEvents([clip], [muted], { a: auto }, 384, 24)).toEqual([])
  })
})

describe('LFO and peak follower', () => {
  it('shapes span 0..1', () => {
    expect(lfoShape('sine', 0)).toBeCloseTo(0)
    expect(lfoShape('sine', 0.5)).toBeCloseTo(1)
    expect(lfoShape('triangle', 0.25)).toBeCloseTo(0.5)
    expect(lfoShape('square', 0.75)).toBe(0)
    expect(lfoShape('saw', 1.25)).toBeCloseTo(0.25)
    const r = lfoShape('random', 3.2)
    expect(r).toBe(lfoShape('random', 3.9)) // holds within a cycle
    expect(r).toBeGreaterThanOrEqual(0)
  })
  it('depth and center scale the output, clamped', () => {
    expect(lfoOutput('sine', 0.5, 0.4, 0.5)).toBeCloseTo(0.7)
    expect(lfoOutput('sine', 0.5, 1, 0.9)).toBe(1)
  })
  it('peak follower: instant attack, exponential release', () => {
    expect(followPeak(0.2, 0.9, 0.03, 0.2)).toBe(0.9)
    const next = followPeak(0.9, 0, 0.2, 0.2)
    expect(next).toBeCloseTo(0.9 * Math.exp(-1))
  })
})

describe('automatable parameters', () => {
  const p = initialProject()
  const synth = makeChannel(instrumentSource('synth'), 'Lead')
  p.channels.push(synth)
  p.mixer[2].fx.push({ id: 'f', type: 'filter', enabled: true, params: { mode: 0, frequency: 2000, q: 1 } })

  it('labels and maps every kind of parameter', () => {
    expect(paramInfo(p, `ch.${synth.id}.volume`)?.label).toBe('Lead volume')
    expect(paramInfo(p, `inst.${synth.id}.brightness`)?.toValue(0.5)).toBe(0.5)
    expect(paramInfo(p, 'mix.0.volume')?.label).toBe('Master volume')
    const f = paramInfo(p, 'fx.2.f.frequency')!
    expect(f.label).toBe('2 Insert 2 Filter cutoff')
    expect(f.toValue(f.toNorm(2000))).toBeCloseTo(2000)
    expect(paramInfo(p, 'fx.2.nope.frequency')).toBeNull()
    expect(paramInfo(p, `inst.${p.channels[0].id}.brightness`)).toBeNull() // drums have no instrument params
  })
  it('current values seed new automation; the list covers channels, instruments, mixer and fx', () => {
    expect(currentNorm(p, 'mix.1.volume')).toBeCloseTo(1 / 1.25)
    const refs = listParams(p).map((x) => x.ref)
    expect(refs).toContain(`inst.${synth.id}.glide`)
    expect(refs).toContain('fx.2.f.q')
  })
})
