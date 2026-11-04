import * as Tone from 'tone'
import { create } from 'zustand'
import { engine } from '@/audio/engine'
import { insertOutputs } from '@/audio/mixer-engine'
import { startRecorder } from '@/audio/recorder'
import { songEnd } from '@/audio/song'
import { secondsPerTick } from '@/audio/timing'
import { encodeWav, peakOf, type BitDepth } from '@/audio/wav'
import { useProjectFile } from '@/state/file'
import { selectCurrentPattern, useProject } from '@/state/project'
import { toast } from '@/state/toasts'
import { STEP_TICKS } from '@/state/types'

/**
 * Export to WAV. Renders in real time through the real mixer (so automation,
 * controllers and effects sound exactly as when you play), capturing the
 * Master and, for stems, every insert at once.
 */

export interface ExportOptions {
  what: 'song' | 'pattern'
  loops: number
  stems: boolean
  bits: BitDepth
  /** seconds recorded after the music ends (reverb/delay tails) */
  tail: number
}

export const useExport = create<{
  dialog: boolean
  running: boolean
  progress: number
  label: string
  options: ExportOptions
}>(() => ({
  dialog: false,
  running: false,
  progress: 0,
  label: '',
  options: { what: 'song', loops: 2, stems: false, bits: 16, tail: 2 }
}))

let cancelled = false
export function cancelExport() {
  cancelled = true
}

function exportTicks(o: ExportOptions): number {
  const st = useProject.getState()
  return o.what === 'song' ? songEnd(st.clips) : selectCurrentPattern(st).lengthSteps * STEP_TICKS * o.loops
}

/** Seconds of music to render for the options (excluding the tail). */
export function exportLength(o: ExportOptions): number {
  return exportTicks(o) * secondsPerTick(useProject.getState().bpm)
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Untitled'

/** Ask where to save, then export. */
export async function runExport(o: ExportOptions) {
  if (exportLength(o) <= 0) return toast(o.what === 'song' ? 'The Playlist is empty: nothing to export in SONG.' : 'The pattern is empty.', 'error')
  const name = useProjectFile.getState().name.replace(/ \(recovered\)$/, '')
  const path = await window.api.export.pickWavPath(name)
  if (path) await exportTo(path, o)
}

/** Render and write `path` (stems next to it as "<name> - NN <insert>.wav"). */
export async function exportTo(path: string, o: ExportOptions) {
  const music = exportLength(o)
  if (music <= 0) return
  cancelled = false
  useExport.setState({ dialog: false, running: true, progress: 0, label: 'Starting…' })
  engine.stop()
  const outs = insertOutputs()
  const taps = o.stems ? outs : outs.slice(0, 1)
  let recorder: Awaited<ReturnType<typeof startRecorder>> | null = null
  try {
    recorder = await startRecorder(taps)
    const startAt = await engine.play(0, { songMode: o.what === 'song', start: 0, noLoop: true, length: exportTicks(o) })
    const total = music + o.tail
    // wait in real time, updating progress; stop the transport when the music ends
    let stopped = false
    while (!cancelled) {
      const elapsed = Tone.immediate() - startAt
      if (!stopped && elapsed >= music) {
        engine.stop()
        stopped = true
      }
      if (elapsed >= total) break
      useExport.setState({
        progress: Math.max(0, Math.min(1, elapsed / total)),
        label: stopped ? 'Recording the tail…' : `Rendering ${Math.max(0, elapsed).toFixed(1)} / ${music.toFixed(1)} s`
      })
      await new Promise((r) => setTimeout(r, 100))
    }
    if (!stopped) engine.stop()
    const caps = await recorder.stop()
    recorder = null
    if (cancelled) return toast('Export cancelled.')

    useExport.setState({ label: 'Writing files…', progress: 1 })
    const mixer = useProject.getState().mixer
    const files: { path: string; data: Uint8Array }[] = []
    caps.forEach((c, i) => {
      // trim to the exact musical start and length
      const from = Math.max(0, Math.round(startAt * c.sampleRate) - c.firstFrame)
      const len = Math.round(total * c.sampleRate)
      const ch = [c.left.subarray(from, from + len), c.right.subarray(from, from + len)]
      if (i > 0 && peakOf(ch) < 1e-5) return // silent insert: no stem
      const file = i === 0 ? path : path.replace(/\.wav$/i, ` - ${String(i).padStart(2, '0')} ${safe(mixer[i]?.name ?? '')}.wav`)
      files.push({ path: file, data: encodeWav(ch, c.sampleRate, o.bits) })
    })
    for (const f of files) await window.api.export.writeWav(f.path, f.data)
    window.api.export.reveal(path)
    toast(files.length > 1 ? `Exported the mix and ${files.length - 1} stem${files.length > 2 ? 's' : ''}.` : 'Exported the mix.')
  } catch (e) {
    toast(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
  } finally {
    if (recorder) await recorder.stop().catch(() => {})
    engine.stop()
    useExport.setState({ running: false, progress: 0, label: '' })
  }
}
