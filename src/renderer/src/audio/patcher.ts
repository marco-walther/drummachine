import * as Tone from 'tone'
import { PATCH_OUT } from '@/state/patch'
import type { PatchFxNode, PatchInstNode, PatcherSource } from '@/state/types'
import { createFx, type FxNode } from './fx'
import { createInstrumentVoice } from './instruments'
import type { Voice } from './voices'

/**
 * A Patcher channel's sound: built-in generators layered (each with level,
 * transpose and key range) and routed through effects to the channel output,
 * exactly as wired. The graph is built once per shape (see patchKey); knob
 * changes are applied in place.
 */
export function createPatcherVoice(initial: PatcherSource): Voice {
  let src = initial
  const out = new Tone.Gain(1)
  // effects here have no mixer sidechain; give them a silent one
  const noSidechain = new Tone.Gain(0)

  const insts = new Map<string, { node: PatchInstNode; voice: Voice; level: Tone.Gain }>()
  const fxs = new Map<string, { node: PatchFxNode; fx: FxNode }>()
  for (const n of src.nodes) {
    if (n.kind === 'inst') {
      const voice = createInstrumentVoice(n.instrument, n.params)
      const level = new Tone.Gain(n.level)
      voice.output.connect(level)
      insts.set(n.id, { node: n, voice, level })
    } else if (n.kind === 'fx') {
      fxs.set(n.id, { node: n, fx: createFx(n.fx, n.params, noSidechain) })
    }
  }
  const outputOf = (id: string) => insts.get(id)?.level ?? fxs.get(id)?.fx.output
  const inputOf = (id: string) => (id === PATCH_OUT ? out : fxs.get(id)?.fx.input)
  for (const w of src.wires) {
    const a = outputOf(w.from)
    const b = inputOf(w.to)
    if (a && b) a.connect(b)
  }

  /** generators that answer to this key */
  const layers = (midi: number) => [...insts.values()].filter(({ node }) => midi >= node.lo && midi <= node.hi)

  return {
    output: out,
    play: (time, midi, vel, duration) => {
      for (const { node, voice } of layers(midi)) voice.play(time, midi + node.transpose, vel, duration)
    },
    hold: (time, midi, vel) => {
      const releases = layers(midi).map(({ node, voice }) => voice.hold(time, midi + node.transpose, vel))
      return (t) => releases.forEach((release) => release(t))
    },
    glide: (time, midi, duration) => {
      for (const { node, voice } of insts.values()) voice.glide(time, midi + node.transpose, duration)
    },
    update: (next) => {
      if (next.type !== 'patcher' || next === src) return
      src = next
      // immer keeps unchanged nodes identical: only touch what moved
      for (const n of next.nodes) {
        if (n.kind === 'inst') {
          const e = insts.get(n.id)
          if (!e || e.node === n) continue
          if (e.node.params !== n.params) e.voice.update({ type: 'instrument', kind: n.instrument, params: n.params })
          if (e.node.level !== n.level) e.level.gain.rampTo(n.level, 0.02)
          e.node = n
        } else if (n.kind === 'fx') {
          const e = fxs.get(n.id)
          if (!e || e.node === n) continue
          if (e.node.params !== n.params) e.fx.update(n.params)
          e.node = n
        }
      }
    },
    dispose: () => {
      for (const { voice, level } of insts.values()) {
        voice.dispose()
        level.dispose()
      }
      for (const { fx } of fxs.values()) fx.dispose()
      noSidechain.dispose()
      out.dispose()
    }
  }
}
