import type { Channel } from '@/state/types'

/**
 * FL-style solo: soloing a channel mutes every non-soloed channel.
 * (Implemented here instead of Tone's global Solo node, which proved unreliable.)
 */
export function isSilent(ch: Pick<Channel, 'muted' | 'solo'>, anySolo: boolean): boolean {
  return ch.muted || (anySolo && !ch.solo)
}
