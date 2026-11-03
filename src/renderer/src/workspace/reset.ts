import { engine } from '@/audio/engine'
import { replaceProject } from '@/state/file'
import { initialProject } from '@/state/project'
import { resetLayout } from './layout'

/** Trash everything: stop playback, new untitled project (default kit), default layout. */
export function startFromScratch() {
  engine.stop()
  replaceProject(initialProject(), { path: null, name: 'Untitled' })
  resetLayout()
}
