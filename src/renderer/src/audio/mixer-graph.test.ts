import { describe, expect, it } from 'vitest'
import { defaultParams, formatParam, FX, fromNorm, normalizeParams, toNorm } from './fx-defs'
import { defaultMixer, processingOrder, sendTargets, wouldLoop } from './mixer-graph'

describe('mixer routing', () => {
  it('default: master + 16 inserts, each sending to master', () => {
    const m = defaultMixer()
    expect(m).toHaveLength(17)
    expect(m[0].sends).toEqual([])
    expect(m[5].sends).toEqual([{ target: 0, amount: 1, sidechain: false }])
  })

  it('refuses loops, self-sends and sends out of the master', () => {
    const m = defaultMixer()
    m[1].sends.push({ target: 2, amount: 1, sidechain: false }) // 1 → 2
    m[2].sends.push({ target: 3, amount: 1, sidechain: false }) // 2 → 3
    expect(wouldLoop(m, 3, 1)).toBe(true) // 3 → 1 would close 1→2→3→1
    expect(wouldLoop(m, 3, 4)).toBe(false)
    expect(wouldLoop(m, 4, 4)).toBe(true)
    expect(wouldLoop(m, 0, 4)).toBe(true)
    // sidechain sends count too
    m[4].sends.push({ target: 1, amount: 1, sidechain: true })
    expect(wouldLoop(m, 3, 4)).toBe(true)
  })

  it('lists valid targets without duplicates or loops', () => {
    const m = defaultMixer().slice(0, 4)
    m[1].sends.push({ target: 2, amount: 1, sidechain: false })
    expect(sendTargets(m, 2)).toEqual([3]) // 0 already a target, 1 would loop, 2 is self
    expect(sendTargets(m, 1)).toEqual([3])
  })

  it('processes senders before their targets, master last', () => {
    const m = defaultMixer().slice(0, 4)
    m[3].sends = [{ target: 1, amount: 1, sidechain: false }]
    const order = processingOrder(m)
    expect(order.indexOf(3)).toBeLessThan(order.indexOf(1))
    expect(order.at(-1)).toBe(0)
  })
})

describe('fx parameters', () => {
  it('normalizes: clamps, fills defaults, drops unknown keys', () => {
    expect(normalizeParams('delay', { time: 99, junk: 1 })).toEqual({ ...defaultParams('delay'), time: 1.5 })
    expect(normalizeParams('filter', { mode: 1.6 }).mode).toBe(2)
  })
  it('log knobs round-trip and format readably', () => {
    const f = FX.filter.params.frequency
    expect(fromNorm(f, toNorm(f, 1234))).toBeCloseTo(1234)
    expect(fromNorm(f, 0.5)).toBeCloseTo(Math.sqrt(40 * 18000))
    expect(formatParam(f, 2500)).toBe('2.5 kHz')
    expect(formatParam(FX.compressor.params.ratio, 4)).toBe('4.0:1')
    expect(formatParam(FX.filter.params.mode, 1)).toBe('High-pass')
  })
})
