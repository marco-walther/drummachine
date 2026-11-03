import { baseName, isAudioPath } from '@shared/api'

/** Drag-and-drop of samples: from the Browser (custom type) or from the OS (Files). */

export const SAMPLE_MIME = 'application/x-dm-sample'

export interface DraggedSample {
  path: string
  name: string
}

export function startSampleDrag(e: React.DragEvent, samples: DraggedSample[]) {
  e.dataTransfer.setData(SAMPLE_MIME, JSON.stringify(samples))
  e.dataTransfer.setData('text/plain', samples.map((s) => s.path).join('\n'))
  e.dataTransfer.effectAllowed = 'copy'
}

export function isSampleDrag(e: React.DragEvent | DragEvent): boolean {
  const types = Array.from(e.dataTransfer?.types ?? [])
  return types.includes(SAMPLE_MIME) || types.includes('Files')
}

export function readSampleDrop(e: React.DragEvent): DraggedSample[] {
  const custom = e.dataTransfer.getData(SAMPLE_MIME)
  if (custom) {
    try {
      const list = JSON.parse(custom) as DraggedSample[]
      return Array.isArray(list) ? list.filter((s) => typeof s?.path === 'string') : []
    } catch {
      return []
    }
  }
  return Array.from(e.dataTransfer.files)
    .map((f) => ({ path: window.api.pathForFile(f), name: baseName(f.name) }))
    .filter((s) => s.path && isAudioPath(s.path))
}
