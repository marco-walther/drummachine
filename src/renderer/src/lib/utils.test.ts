import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('merges conflicting tailwind classes, last wins', () => {
    const hidden = false
    expect(cn('px-2 text-ink', hidden && 'hidden', 'px-4')).toBe('text-ink px-4')
  })
})
