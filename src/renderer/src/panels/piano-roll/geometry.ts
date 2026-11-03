import { PPQ, STEP_TICKS, type Note } from '@/state/types'

/** Piano Roll layout constants and pure coordinate math (unit-tested). */

export const KEY_H = 14
export const KEYS_W = 56
export const RULER_H = 22
export const LANE_H = 92
export const BAR_TICKS = PPQ * 4

export const SNAPS = [
  { label: '1 bar', ticks: BAR_TICKS },
  { label: '1/4', ticks: PPQ },
  { label: '1/8', ticks: PPQ / 2 },
  { label: '1/16', ticks: STEP_TICKS },
  { label: '1/32', ticks: STEP_TICKS / 2 },
  { label: 'None', ticks: 1 }
] as const

export const keyToY = (key: number) => (127 - key) * KEY_H
export const yToKey = (y: number) => Math.min(127, Math.max(0, 127 - Math.floor(y / KEY_H)))

export const snapRound = (tick: number, snap: number) => Math.round(tick / snap) * snap
export const snapFloor = (tick: number, snap: number) => Math.floor(tick / snap) * snap

/** Topmost note under a point (later notes are drawn on top). */
export function hitNote(notes: Note[], tick: number, key: number): Note | undefined {
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]
    if (n.key === key && tick >= n.tick && tick < n.tick + n.length) return n
  }
  return undefined
}

/** Notes intersecting a tick/key rectangle (box select). */
export function notesInBox(notes: Note[], t0: number, t1: number, k0: number, k1: number): Note[] {
  const [ta, tb] = t0 < t1 ? [t0, t1] : [t1, t0]
  const [ka, kb] = k0 < k1 ? [k0, k1] : [k1, k0]
  return notes.filter((n) => n.key >= ka && n.key <= kb && n.tick < tb && n.tick + n.length > ta)
}

/**
 * Move a group: the grabbed note's new start snaps to the grid and all others
 * keep their offsets. Never moves before tick 0 or outside the key range.
 */
export function moveNotes(orig: Note[], lead: Note, dTicks: number, dKeys: number, snap: number): Note[] {
  const minTick = Math.min(...orig.map((n) => n.tick))
  let delta = snapRound(lead.tick + dTicks, snap) - lead.tick
  delta = Math.max(delta, -minTick)
  const minKey = Math.min(...orig.map((n) => n.key))
  const maxKey = Math.max(...orig.map((n) => n.key))
  const dk = Math.min(127 - maxKey, Math.max(-minKey, dKeys))
  return orig.map((n) => ({ ...n, tick: n.tick + delta, key: n.key + dk }))
}

/** Resize a group by the same amount; lengths snap and never go below one snap (min 1 tick). */
export function resizeNotes(orig: Note[], lead: Note, dTicks: number, snap: number): Note[] {
  const newLead = Math.max(snap, snapRound(lead.length + dTicks, snap))
  const delta = newLead - lead.length
  return orig.map((n) => ({ ...n, length: Math.max(Math.min(snap, n.length), n.length + delta) }))
}
