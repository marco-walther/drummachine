import type { Channel } from '@/state/types'

/**
 * FL-style solo: soloing a channel mutes every non-soloed channel.
 * (Implemented here instead of Tone's global Solo node, which proved unreliable.)
 */
/** Per-note cutoff 0..1 → lowpass Hz, exponential (1 = fully open). */
export function noteCutoffHz(cutoff: number): number {
  const c = Math.min(1, Math.max(0, cutoff))
  return 60 * Math.pow(20000 / 60, c)
}

export function isSilent(ch: Pick<Channel, 'muted' | 'solo'>, anySolo: boolean): boolean {
  return ch.muted || (anySolo && !ch.solo)
}
