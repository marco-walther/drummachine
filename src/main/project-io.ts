import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  baseName,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  type LoadedProject,
  type ProjectDoc,
  type SampleDocEntry,
  type SavedProject
} from '../shared/api'

/** Plain file I/O for projects (no Electron imports, so it is unit-testable). */

export const SAMPLES_DIR = 'samples'

const toPosix = (p: string) => p.split(sep).join('/')

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel)
}

async function sameSize(a: string, b: string): Promise<boolean> {
  try {
    return (await stat(a)).size === (await stat(b)).size
  } catch {
    return false
  }
}

/** Destination in samplesDir for `src`: reuse an identical-looking file, else "name (2).wav". */
async function destinationFor(src: string, samplesDir: string): Promise<string> {
  const ext = extname(src)
  const stem = basename(src, ext)
  for (let i = 1; i < 1000; i++) {
    const candidate = join(samplesDir, i === 1 ? `${stem}${ext}` : `${stem} (${i})${ext}`)
    if (!existsSync(candidate)) return candidate
    if (await sameSize(src, candidate)) return candidate // already copied earlier
  }
  throw new Error(`Too many files named ${stem}${ext}`)
}

/**
 * Copy every sample into `<project dir>/samples/` (unless already there) and
 * record relative paths, so the project folder is self-contained and portable.
 * Samples whose file is missing are kept as they are.
 */
export async function collectSamples(projectPath: string, samples: SampleDocEntry[]): Promise<SampleDocEntry[]> {
  const dir = dirname(projectPath)
  const samplesDir = join(dir, SAMPLES_DIR)
  const out: SampleDocEntry[] = []
  for (const s of samples) {
    const src = resolve(s.absPath)
    if (!existsSync(src)) {
      out.push(s)
      continue
    }
    let dest = src
    if (!isInside(src, samplesDir)) {
      await mkdir(samplesDir, { recursive: true })
      dest = await destinationFor(src, samplesDir)
      if (!existsSync(dest)) await copyFile(src, dest)
    }
    out.push({ ...s, absPath: dest, relPath: toPosix(relative(dir, dest)) })
  }
  return out
}

/** Write atomically: temp file + rename, so a crash never leaves half a project. */
export async function writeJsonAtomic(path: string, data: unknown) {
  const tmp = `${path}.tmp-${process.pid}`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, path)
}

export async function saveProjectFile(path: string, doc: ProjectDoc): Promise<SavedProject> {
  const samples = await collectSamples(path, doc.samples)
  await writeJsonAtomic(path, { ...doc, format: PROJECT_FORMAT, version: PROJECT_VERSION, samples })
  return { path, samples }
}

export function parseDoc(text: string): ProjectDoc {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    throw new Error('The file is not a valid project (bad JSON).')
  }
  const d = doc as Partial<ProjectDoc> | null
  if (!d || d.format !== PROJECT_FORMAT) throw new Error('This is not a Drummachine project.')
  if (typeof d.version !== 'number' || d.version > PROJECT_VERSION) {
    throw new Error('This project was made with a newer version of Drummachine.')
  }
  return { ...(d as ProjectDoc), samples: Array.isArray(d.samples) ? d.samples : [] }
}

/** Find each sample: next to the project first (portable), then its last absolute path. */
export function resolveSamples(projectPath: string | null, samples: SampleDocEntry[]) {
  const dir = projectPath ? dirname(projectPath) : null
  const missing: string[] = []
  const resolved = samples.map((s) => {
    const candidates = [s.relPath && dir ? join(dir, s.relPath) : null, s.absPath].filter(Boolean) as string[]
    const found = candidates.find((c) => existsSync(c))
    if (!found) missing.push(s.id)
    return { ...s, absPath: found ?? s.absPath }
  })
  return { samples: resolved, missing }
}

export async function loadProjectFile(path: string): Promise<LoadedProject> {
  const doc = parseDoc(await readFile(path, 'utf8'))
  const { samples, missing } = resolveSamples(path, doc.samples)
  return { path, name: baseName(path), doc: { ...doc, samples }, missing }
}

export async function removeIfExists(path: string) {
  try {
    await unlink(path)
  } catch {
    /* not there */
  }
}
