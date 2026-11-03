import { engine } from '@/audio/engine'
import { initialProject, useProject } from '@/state/project'
import { resetLayout } from './layout'

/** Trash everything: stop playback, new empty project (default kit), default layout. */
export function startFromScratch() {
  engine.stop()
  useProject.setState(initialProject())
  resetLayout()
}
