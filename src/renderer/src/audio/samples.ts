import * as Tone from 'tone'
import { create } from 'zustand'
import type { SampleRef } from '@/state/types'
import { sampleBuffers } from './voices'

/**
 * Loads user audio files (via main, which reads the disk) and decodes them into
 * buffers the sample voices play. Decoded buffers are cached by path, so the
 * browser preview and channels share them.
 */

export type SampleStatus = 'loading' | 'ready' | 'missing'
export const useSampleStatus = create<Record<string, SampleStatus>>(() => ({}))

const byPath = new Map<string, Promise<Tone.ToneAudioBuffer>>()
const loadedPath = new Map<string, string>() // sampleId → path currently loaded

export function loadBuffer(path: string): Promise<Tone.ToneAudioBuffer> {
  let p = byPath.get(path)
  if (!p) {
    p = window.api.library
      .readAudio(path)
      .then((bytes) => {
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        return Tone.getContext().decodeAudioData(ab)
      })
      .then((audio) => new Tone.ToneAudioBuffer(audio))
    p.catch(() => byPath.delete(path)) // allow retry later
    byPath.set(path, p)
  }
  return p
}

const setStatus = (id: string, status: SampleStatus) => useSampleStatus.setState({ [id]: status })

/**
 * Call before loading a project: re-resolve every sample against the disk, and
 * drop cached audio for files that are gone, so "missing" is shown truthfully
 * instead of silently playing a copy still in memory.
 */
export function resetSamples(missingPaths: string[]) {
  loadedPath.clear()
  sampleBuffers.clear()
  for (const p of missingPaths) byPath.delete(p)
  useSampleStatus.setState({}, true)
}

/** Make sure every project sample is decoded (called on every project change). */
export function ensureSamples(samples: Record<string, SampleRef>) {
  for (const s of Object.values(samples)) {
    if (loadedPath.get(s.id) === s.path) continue
    loadedPath.set(s.id, s.path)
    setStatus(s.id, 'loading')
    loadBuffer(s.path)
      .then((buf) => {
        if (loadedPath.get(s.id) !== s.path) return // relinked meanwhile
        sampleBuffers.set(s.id, buf)
        setStatus(s.id, 'ready')
      })
      .catch(() => {
        if (loadedPath.get(s.id) !== s.path) return
        sampleBuffers.delete(s.id)
        setStatus(s.id, 'missing')
      })
  }
}

// ---- browser preview ("audition") ----

let current: Tone.ToneBufferSource | null = null

export async function audition(path: string) {
  await Tone.start()
  const buf = await loadBuffer(path)
  stopAudition()
  const src = new Tone.ToneBufferSource(buf).toDestination()
  src.onended = () => {
    src.dispose()
    if (current === src) current = null
  }
  current = src
  src.start()
}

export function stopAudition() {
  if (current) {
    current.stop()
    current = null
  }
}
