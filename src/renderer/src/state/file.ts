import { create } from 'zustand'
import { resetHistory } from './history'
import { savedDataChanged, useProject } from './project'
import type { ProjectData } from './types'

/** Which file the project belongs to, and whether it has unsaved changes. */
export interface ProjectFile {
  path: string | null
  name: string
  dirty: boolean
}

export const useProjectFile = create<ProjectFile>(() => ({ path: null, name: 'Untitled', dirty: false }))

let tracking = true

// Any change to saved data marks the project dirty (selection/playback do not).
useProject.subscribe((s, prev) => {
  if (!tracking || useProjectFile.getState().dirty) return
  if (savedDataChanged(s, prev)) useProjectFile.setState({ dirty: true })
})

/** Change project data without marking it dirty (load, relink after save). */
export function withoutTracking(fn: () => void) {
  tracking = false
  try {
    fn()
  } finally {
    tracking = true
  }
}

/** Replace the whole project, e.g. New/Open/Recover. Undo history starts over. */
export function replaceProject(data: ProjectData, file: Omit<ProjectFile, 'dirty'>, dirty = false) {
  withoutTracking(() => useProject.setState(data))
  useProjectFile.setState({ ...file, dirty })
  resetHistory()
}
