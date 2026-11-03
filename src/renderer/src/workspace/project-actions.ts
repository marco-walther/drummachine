import { baseName, isAudioPath, type LoadedProject } from '@shared/api'
import { engine } from '@/audio/engine'
import { resetSamples } from '@/audio/samples'
import { replaceProject, useProjectFile, withoutTracking } from '@/state/file'
import { fromDoc, toDoc } from '@/state/persistence'
import { initialProject, useProject } from '@/state/project'
import { askUnsaved } from '@/state/prompts'
import { toast } from '@/state/toasts'

/** File-level commands used by the File menu, shortcuts and the quit flow. */

const errText = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

/** If there are unsaved changes, ask. Resolves true when it's OK to continue. */
async function confirmDiscard(): Promise<boolean> {
  const f = useProjectFile.getState()
  if (!f.dirty) return true
  const choice = await askUnsaved(f.name)
  if (choice === 'cancel') return false
  if (choice === 'save') return saveProject()
  return true
}

export async function newProject() {
  if (!(await confirmDiscard())) return
  engine.stop()
  replaceProject(initialProject(), { path: null, name: 'Untitled' })
}

function applyLoaded(res: LoadedProject, dirty: boolean) {
  const data = fromDoc(res.doc)
  engine.stop()
  resetSamples(res.missing.map((id) => data.samples[id]?.path).filter((p): p is string => !!p))
  replaceProject(data, { path: res.path, name: res.name }, dirty)
  if (res.missing.length > 0) {
    const names = res.missing.map((id) => data.samples[id]?.name ?? id)
    toast(`${names.length} sample${names.length > 1 ? 's' : ''} not found: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`, 'error')
  }
}

export async function openProject(path?: string) {
  if (!(await confirmDiscard())) return
  const target = path ?? (await window.api.project.pickOpenPath())
  if (!target) return
  try {
    applyLoaded(await window.api.project.load(target), false)
    toast(`Opened ${baseName(target)}`)
  } catch (e) {
    toast(`Couldn't open ${baseName(target)}: ${errText(e)}`, 'error')
  }
}

async function writeTo(path: string): Promise<boolean> {
  try {
    const res = await window.api.project.save(path, toDoc(useProject.getState()))
    // samples now live in the project's samples/ folder: point at the copies
    withoutTracking(() =>
      useProject.getState().relinkSamples(Object.fromEntries(res.samples.map((s) => [s.id, s.absPath])))
    )
    useProjectFile.setState({ path: res.path, name: baseName(res.path), dirty: false })
    toast(`Saved ${baseName(res.path)}`)
    return true
  } catch (e) {
    toast(`Couldn't save: ${errText(e)}`, 'error')
    return false
  }
}

export async function saveProjectAs(): Promise<boolean> {
  const path = await window.api.project.pickSavePath(useProjectFile.getState().name)
  return path ? writeTo(path) : false
}

export async function saveProject(): Promise<boolean> {
  const { path } = useProjectFile.getState()
  return path ? writeTo(path) : saveProjectAs()
}

export async function recoverAutosave() {
  if (!(await confirmDiscard())) return
  const res = await window.api.project.loadAutosave()
  if (!res) return toast('No autosave to recover.', 'error')
  // recovered work is unsaved by definition
  applyLoaded(res, true)
  useProjectFile.setState({ name: `${res.name} (recovered)` })
  toast('Recovered the last autosave. Save it to keep it.')
}

/** Add each audio file as a new sampler channel. */
export function addSampleChannels(files: { path: string; name?: string }[]) {
  const audio = files.filter((f) => isAudioPath(f.path))
  for (const f of audio) useProject.getState().addSampleChannel(f.path, f.name ?? baseName(f.path))
  if (audio.length < files.length) toast(`Skipped ${files.length - audio.length} file(s) that aren't audio.`, 'error')
  return audio.length
}

export async function importSamples() {
  const paths = await window.api.library.pickFiles()
  if (paths.length) addSampleChannels(paths.map((path) => ({ path })))
}

let autosaving = false
/** Write a recovery copy if there are unsaved changes (called on a timer). */
export async function autosaveIfDirty() {
  const f = useProjectFile.getState()
  if (!f.dirty || autosaving) return
  autosaving = true
  try {
    await window.api.project.autosave(toDoc(useProject.getState()), f.name)
  } finally {
    autosaving = false
  }
}
