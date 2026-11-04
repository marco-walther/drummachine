import * as Tone from 'tone'
import type { FxSlot, MixerInsert } from '@/state/types'
import { createFx, type FxNode } from './fx'
import { gainToDb } from './timing'

/**
 * The mixer's audio graph, kept in sync with ProjectData.mixer.
 *
 *   input ─► fx 1 … fx 10 (enabled ones) ─► fader/pan/mute ─► meter
 *                                                  └─► sends (gain) ─► other inserts' input
 *                                                                     (or their sidechain input)
 * Insert 0 (Master) goes to the speakers. Input nodes are stable, so channel
 * strips can stay connected while effects and sends change.
 */

interface InsertNode {
  input: Tone.Gain
  sidechainIn: Tone.Gain
  fader: Tone.Channel
  meter: Tone.Meter
  fx: Map<string, { slot: FxSlot; node: FxNode }>
  chainKey: string
  sends: Map<string, Tone.Gain>
  sendsKey: string
  applied: { volume: number; pan: number; muted: boolean }
}

const inserts: InsertNode[] = []

function createInsert(index: number): InsertNode {
  const input = new Tone.Gain(1)
  const sidechainIn = new Tone.Gain(1)
  const fader = new Tone.Channel()
  const meter = new Tone.Meter({ smoothing: 0.6 })
  fader.connect(meter)
  if (index === 0) fader.toDestination()
  input.connect(fader)
  return {
    input,
    sidechainIn,
    fader,
    meter,
    fx: new Map(),
    chainKey: '',
    sends: new Map(),
    sendsKey: '',
    applied: { volume: NaN, pan: NaN, muted: false }
  }
}

function disposeInsert(n: InsertNode) {
  for (const { node } of n.fx.values()) node.dispose()
  for (const g of n.sends.values()) g.dispose()
  n.input.dispose()
  n.sidechainIn.dispose()
  n.fader.dispose()
  n.meter.dispose()
}

function syncFx(n: InsertNode, slots: FxSlot[]) {
  // create / update / remove effect nodes by slot id
  const keep = new Set<string>()
  for (const slot of slots) {
    keep.add(slot.id)
    const have = n.fx.get(slot.id)
    if (have && have.slot.type === slot.type) {
      if (have.slot.params !== slot.params) have.node.update(slot.params)
      have.slot = slot
    } else {
      have?.node.dispose()
      n.fx.set(slot.id, { slot, node: createFx(slot.type, slot.params, n.sidechainIn) })
    }
  }
  for (const [id, { node }] of n.fx) {
    if (!keep.has(id)) {
      node.dispose()
      n.fx.delete(id)
    }
  }
  // rewire the chain only when its order/enabled set changed
  const chain = slots.filter((s) => s.enabled).map((s) => s.id)
  const key = chain.join(',')
  if (key === n.chainKey) return
  n.chainKey = key
  n.input.disconnect()
  for (const { node } of n.fx.values()) node.output.disconnect()
  let prev: Tone.ToneAudioNode = n.input
  for (const id of chain) {
    const node = n.fx.get(id)!.node
    prev.connect(node.input)
    prev = node.output
  }
  prev.connect(n.fader)
}

function syncSends(index: number, ins: MixerInsert) {
  const n = inserts[index]
  const key = ins.sends.map((s) => `${s.target}${s.sidechain ? 's' : ''}`).join(',')
  if (key !== n.sendsKey) {
    for (const g of n.sends.values()) g.dispose()
    n.sends.clear()
    for (const s of ins.sends) {
      const target = inserts[s.target]
      if (!target || s.target === index) continue
      const g = new Tone.Gain(s.amount)
      n.fader.connect(g)
      g.connect(s.sidechain ? target.sidechainIn : target.input)
      n.sends.set(`${s.target}${s.sidechain ? 's' : ''}`, g)
    }
    n.sendsKey = key
  } else {
    for (const s of ins.sends) n.sends.get(`${s.target}${s.sidechain ? 's' : ''}`)?.gain.rampTo(s.amount, 0.02)
  }
}

export function syncMixer(mixer: MixerInsert[]) {
  while (inserts.length < mixer.length) inserts.push(createInsert(inserts.length))
  while (inserts.length > mixer.length) disposeInsert(inserts.pop()!)
  mixer.forEach((ins, i) => {
    const n = inserts[i]
    syncFx(n, ins.fx)
    const a = n.applied
    if (a.volume !== ins.volume) n.fader.volume.value = gainToDb((a.volume = ins.volume))
    if (a.pan !== ins.pan) n.fader.pan.value = a.pan = ins.pan
    if (a.muted !== ins.muted) n.fader.mute = a.muted = ins.muted
  })
  // sends after all inserts exist (targets may be later in the list)
  mixer.forEach((ins, i) => syncSends(i, ins))
}

/** Where a channel (or audio clip) plugs in. Unknown index → Master. */
export function insertInput(index: number): Tone.Gain {
  return (inserts[index] ?? inserts[0]).input
}

/** Post-fader peak level per insert, 0..1 (for meters). */
export function meterLevels(): number[] {
  return inserts.map((n) => {
    const v = n.meter.getValue()
    const db = Array.isArray(v) ? Math.max(...v) : v
    return Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 60) / 66)) : 0
  })
}
