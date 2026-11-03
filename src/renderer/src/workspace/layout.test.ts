import { describe, expect, it } from 'vitest'
import { PANELS, SHORTCUTS } from './layout'

describe('panel shortcuts', () => {
  it('every shortcut maps to a panel that advertises that key', () => {
    for (const [key, id] of Object.entries(SHORTCUTS)) expect(PANELS[id].shortcut).toBe(key)
  })
  it('every panel has a unique shortcut', () => {
    const keys = Object.values(PANELS).map((p) => p.shortcut)
    expect(new Set(keys).size).toBe(keys.length)
    expect(Object.keys(SHORTCUTS).sort()).toEqual([...keys].sort())
  })
})
