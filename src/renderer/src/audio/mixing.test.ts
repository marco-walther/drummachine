import { describe, expect, it } from 'vitest'
import { isSilent } from './mixing'

describe('isSilent', () => {
  it('no solo: only muted channels are silent', () => {
    expect(isSilent({ muted: false, solo: false }, false)).toBe(false)
    expect(isSilent({ muted: true, solo: false }, false)).toBe(true)
  })
  it('with a solo: non-soloed channels are silent', () => {
    expect(isSilent({ muted: false, solo: false }, true)).toBe(true)
    expect(isSilent({ muted: false, solo: true }, true)).toBe(false)
  })
  it('mute wins over solo', () => {
    expect(isSilent({ muted: true, solo: true }, true)).toBe(true)
  })
})
