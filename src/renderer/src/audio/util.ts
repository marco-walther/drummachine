/** Small audio helpers shared by voices and instruments. */

export const ratio = (semis: number) => Math.pow(2, semis / 12)

export const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

/** Mono Tone synths throw if two starts share a timestamp; nudge forward. */
export function monotonic() {
  let last = -1
  return (t: number) => (last = t <= last ? last + 1e-4 : t)
}
