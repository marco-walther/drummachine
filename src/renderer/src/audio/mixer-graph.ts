import type { MixerInsert } from '@/state/types'

/**
 * Mixer routing rules, pure. Index 0 is the Master; every other insert sends
 * somewhere (Master by default). Sends must never form a loop: audio (and
 * sidechain) signals would feed back forever.
 */

export const MAX_FX = 10
export const MAX_INSERTS = 99
export const DEFAULT_INSERTS = 16

/** Inserts default to unity gain (0 dB) so routing through one doesn't change the level; the Master to 0.8. */
export const insertDefaultVolume = (isMaster: boolean) => (isMaster ? 0.8 : 1)

export function makeInsert(name: string, toMaster = true): MixerInsert {
  return {
    name,
    volume: insertDefaultVolume(!toMaster),
    pan: 0,
    muted: false,
    fx: [],
    sends: toMaster ? [{ target: 0, amount: 1, sidechain: false }] : []
  }
}

export function defaultMixer(): MixerInsert[] {
  return [makeInsert('Master', false), ...Array.from({ length: DEFAULT_INSERTS }, (_, i) => makeInsert(`Insert ${i + 1}`))]
}

/** Every insert reachable from `from` by following sends. */
function reachable(mixer: MixerInsert[], from: number): Set<number> {
  const seen = new Set<number>()
  const stack = [from]
  while (stack.length) {
    const i = stack.pop()!
    for (const s of mixer[i]?.sends ?? []) {
      if (!seen.has(s.target)) {
        seen.add(s.target)
        stack.push(s.target)
      }
    }
  }
  return seen
}

/** Would a send from → to create a loop? (Also refuses self-sends and sends out of the Master.) */
export function wouldLoop(mixer: MixerInsert[], from: number, to: number): boolean {
  if (from === to || from === 0) return true
  return to === from || reachable(mixer, to).has(from)
}

/** Inserts `from` may send to (no loops, no duplicates). */
export function sendTargets(mixer: MixerInsert[], from: number): number[] {
  const existing = new Set(mixer[from]?.sends.map((s) => s.target))
  return mixer.map((_, i) => i).filter((i) => !existing.has(i) && !wouldLoop(mixer, from, i))
}

/** Processing order: an insert comes after everything that sends into it (Master last). */
export function processingOrder(mixer: MixerInsert[]): number[] {
  const order: number[] = []
  const state = new Map<number, 'visiting' | 'done'>()
  const visit = (i: number) => {
    if (state.get(i) === 'done') return
    if (state.get(i) === 'visiting') return // defensive: ignore a loop rather than recurse forever
    state.set(i, 'visiting')
    mixer.forEach((ins, j) => {
      if (ins.sends.some((s) => s.target === i)) visit(j)
    })
    state.set(i, 'done')
    order.push(i)
  }
  mixer.forEach((_, i) => visit(i))
  return order
}
