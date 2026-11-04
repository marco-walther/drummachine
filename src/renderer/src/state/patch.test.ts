import { beforeEach, describe, expect, it } from 'vitest'
import { fromDoc, toDoc } from './persistence'
import {
  audibleNodes,
  canConnect,
  defaultPatch,
  makeFxNode,
  makeInstNode,
  MAX_PATCH_NODES,
  normalizePatch,
  PATCH_OUT,
  patchKey
} from './patch'
import { initialProject, useProject } from './project'
import type { PatcherSource } from './types'

const graph = (): PatcherSource => {
  const a = makeInstNode('synth', 0, 0, 'a')
  const b = makeInstNode('pad', 0, 0, 'b')
  const f = makeFxNode('reverb', 0, 0, 'f')
  const g = makeFxNode('delay', 0, 0, 'g')
  return {
    type: 'patcher',
    nodes: [a, b, f, g, { id: PATCH_OUT, kind: 'out', x: 0, y: 0 }],
    wires: [
      { from: 'a', to: 'f' },
      { from: 'f', to: 'g' },
      { from: 'g', to: PATCH_OUT }
    ]
  }
}

describe('patch graph', () => {
  it('default patch: one generator wired to the output', () => {
    const p = defaultPatch()
    expect(p.nodes.filter((n) => n.kind === 'out')).toHaveLength(1)
    expect(p.wires).toEqual([{ from: p.nodes[0].id, to: PATCH_OUT }])
  })

  it('connect rules: direction, duplicates, loops', () => {
    const p = graph()
    expect(canConnect(p, 'b', 'f')).toBe('ok') // fan-in
    expect(canConnect(p, 'a', PATCH_OUT)).toBe('ok') // fan-out
    expect(canConnect(p, 'a', 'f')).toBe('exists')
    expect(canConnect(p, 'g', 'f')).toBe('loop')
    expect(canConnect(p, 'f', 'f')).toBe('invalid')
    expect(canConnect(p, 'f', 'a')).toBe('invalid') // generators have no input
    expect(canConnect(p, PATCH_OUT, 'f')).toBe('invalid') // output has no output
    expect(canConnect(p, 'a', 'nope')).toBe('invalid')
  })

  it('audible nodes are the ones that reach the output', () => {
    expect([...audibleNodes(graph())].sort()).toEqual(['a', 'f', 'g', PATCH_OUT].sort())
  })

  it('key changes with shape, not with knobs or position', () => {
    const p = graph()
    const moved: PatcherSource = { ...p, nodes: p.nodes.map((n) => (n.id === 'a' ? { ...n, x: 300, level: 0.2 } : n)) }
    expect(patchKey(moved)).toBe(patchKey(p))
    expect(patchKey({ ...p, wires: p.wires.slice(1) })).not.toBe(patchKey(p))
    const swapped: PatcherSource = { ...p, nodes: p.nodes.map((n) => (n.id === 'a' ? { ...n, instrument: 'bass' } as typeof n : n)) }
    expect(patchKey(swapped)).not.toBe(patchKey(p))
  })

  it('loading drops bad nodes and wires, clamps values, keeps one output, refuses loops', () => {
    const p = normalizePatch({
      nodes: [
        { id: 'a', kind: 'inst', instrument: 'synth', level: 9, transpose: 3.6, lo: 90, hi: 10, params: { brightness: 4 } },
        { id: 'a', kind: 'inst', instrument: 'pad' }, // duplicate id
        { id: 'x', kind: 'inst', instrument: 'theremin' },
        { id: 'f', kind: 'fx', fx: 'delay', params: { feedback: 5 } },
        { id: 'g', kind: 'fx', fx: 'ducker' }, // no sidechain in a Patcher
        { id: 'h', kind: 'fx', fx: 'filter' }
      ],
      wires: [
        { from: 'a', to: 'f' },
        { from: 'f', to: 'h' },
        { from: 'h', to: 'f' }, // loop
        { from: 'x', to: 'f' }, // unknown node
        { from: 'h', to: PATCH_OUT }
      ]
    })
    expect(p.nodes.map((n) => n.id)).toEqual(['a', 'f', 'h', PATCH_OUT])
    const a = p.nodes[0]
    expect(a.kind === 'inst' && [a.level, a.transpose, a.lo, a.hi, a.params.brightness]).toEqual([1.5, 4, 90, 90, 1])
    const f = p.nodes[1]
    expect(f.kind === 'fx' && f.params.feedback).toBe(0.9)
    expect(p.wires).toEqual([
      { from: 'a', to: 'f' },
      { from: 'f', to: 'h' },
      { from: 'h', to: PATCH_OUT }
    ])
    expect(normalizePatch({}).nodes).toEqual([{ id: PATCH_OUT, kind: 'out', x: 460, y: 40 }])
  })
})

describe('patcher store actions', () => {
  const s = () => useProject.getState()
  let id: string
  beforeEach(() => {
    useProject.setState(initialProject())
    id = s().addChannel(defaultPatch())
  })
  const patch = () => s().channels.find((c) => c.id === id)!.source as PatcherSource

  it('adds, edits, wires and removes nodes', () => {
    const inst = patch().nodes[0].id
    const fx = makeFxNode('reverb')
    expect(s().addPatchNode(id, fx)).toBe(true)
    expect(s().connectPatch(id, inst, fx.id)).toBe('ok')
    expect(s().connectPatch(id, fx.id, PATCH_OUT)).toBe('ok')
    expect(s().connectPatch(id, fx.id, PATCH_OUT)).toBe('exists')

    s().updatePatchNode(id, inst, { level: 3, transpose: -100, hi: 40, lo: 50, params: { attack: 0 } })
    const n = patch().nodes.find((x) => x.id === inst)!
    expect(n.kind === 'inst' && [n.level, n.transpose, n.hi, n.lo, n.params.attack]).toEqual([1.5, -48, 50, 50, 0.001]) // range never inverts

    s().updatePatchNode(id, inst, { instrument: 'pluck' })
    const p2 = patch().nodes.find((x) => x.id === inst)!
    expect(p2.kind === 'inst' && p2.instrument).toBe('pluck')

    s().updatePatchNode(id, fx.id, { params: { mix: 0.5, bogus: 1 } })
    const f = patch().nodes.find((x) => x.id === fx.id)!
    expect(f.kind === 'fx' && [f.params.mix, 'bogus' in f.params]).toEqual([0.5, false])

    s().disconnectPatch(id, inst, fx.id)
    expect(patch().wires).toHaveLength(2)
    s().removePatchNode(id, fx.id)
    expect(patch().nodes.some((x) => x.id === fx.id)).toBe(false)
    expect(patch().wires).toEqual([{ from: inst, to: PATCH_OUT }])
    s().removePatchNode(id, PATCH_OUT)
    expect(patch().nodes.some((x) => x.id === PATCH_OUT)).toBe(true)
  })

  it('refuses nodes beyond the limit', () => {
    for (let i = 1; i < MAX_PATCH_NODES; i++) expect(s().addPatchNode(id, makeInstNode('synth'))).toBe(true)
    expect(s().addPatchNode(id, makeInstNode('synth'))).toBe(false)
  })

  it('survives a save/load round trip', () => {
    const fx = makeFxNode('delay')
    s().addPatchNode(id, fx)
    s().connectPatch(id, patch().nodes[0].id, fx.id)
    const loaded = fromDoc(JSON.parse(JSON.stringify(toDoc(s()))))
    expect(loaded.channels.find((c) => c.id === id)!.source).toEqual(patch())
  })
})
