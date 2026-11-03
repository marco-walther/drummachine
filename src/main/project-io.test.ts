import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROJECT_FORMAT, type ProjectDoc } from '../shared/api'
import { collectSamples, loadProjectFile, parseDoc, resolveSamples, saveProjectFile } from './project-io'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dm-test-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const doc = (samples: ProjectDoc['samples']): ProjectDoc => ({
  format: PROJECT_FORMAT,
  version: 1,
  savedAt: 'now',
  project: { bpm: 120 },
  samples
})

async function file(path: string, bytes: number) {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, Buffer.alloc(bytes, 1))
  return path
}

describe('saving copies samples into the project folder', () => {
  it('copies, records a relative path, and reuses on the next save', async () => {
    const src = await file(join(root, 'lib', 'Kick 01.wav'), 100)
    const project = join(root, 'proj', 'beat.dmproj')
    await mkdir(join(root, 'proj'))

    const first = await collectSamples(project, [{ id: 'a', name: 'Kick', absPath: src, relPath: null }])
    expect(first[0].relPath).toBe('samples/Kick 01.wav')
    expect(existsSync(join(root, 'proj', 'samples', 'Kick 01.wav'))).toBe(true)

    const again = await collectSamples(project, first) // already inside samples/
    expect(again[0].absPath).toBe(first[0].absPath)
  })

  it('does not overwrite a different file with the same name', async () => {
    const a = await file(join(root, 'lib1', 'snare.wav'), 10)
    const b = await file(join(root, 'lib2', 'snare.wav'), 20)
    const project = join(root, 'p.dmproj')
    const out = await collectSamples(project, [
      { id: 'a', name: 'a', absPath: a, relPath: null },
      { id: 'b', name: 'b', absPath: b, relPath: null }
    ])
    expect(out.map((s) => s.relPath)).toEqual(['samples/snare.wav', 'samples/snare (2).wav'])
  })

  it('keeps missing samples as they are', async () => {
    const out = await collectSamples(join(root, 'p.dmproj'), [
      { id: 'm', name: 'gone', absPath: join(root, 'gone.wav'), relPath: null }
    ])
    expect(out[0].relPath).toBeNull()
  })
})

describe('loading', () => {
  it('round-trips through disk and prefers the project-relative copy', async () => {
    const src = await file(join(root, 'lib', 'hat.wav'), 5)
    const project = join(root, 'proj', 'song.dmproj')
    await mkdir(join(root, 'proj'))
    await saveProjectFile(project, doc([{ id: 'h', name: 'hat', absPath: src, relPath: null }]))
    await rm(join(root, 'lib'), { recursive: true }) // original gone: the copy must be used

    const loaded = await loadProjectFile(project)
    expect(loaded.name).toBe('song')
    expect(loaded.missing).toEqual([])
    expect(loaded.doc.samples[0].absPath).toBe(join(root, 'proj', 'samples', 'hat.wav'))
    expect(JSON.parse(await readFile(project, 'utf8')).project).toEqual({ bpm: 120 })
  })

  it('reports samples that cannot be found anywhere', () => {
    const r = resolveSamples(join(root, 'x.dmproj'), [{ id: 'z', name: 'z', absPath: join(root, 'no.wav'), relPath: 'samples/no.wav' }])
    expect(r.missing).toEqual(['z'])
  })

  it('rejects non-projects and newer versions with a readable message', () => {
    expect(() => parseDoc('not json')).toThrow(/bad JSON/)
    expect(() => parseDoc('{"format":"other"}')).toThrow(/not a Drummachine project/)
    expect(() => parseDoc(`{"format":"${PROJECT_FORMAT}","version":99}`)).toThrow(/newer version/)
  })
})
