/**
 * Contract between the main process (files, dialogs) and the renderer, exposed
 * as `window.api` by the preload. Shared so all three sides type-check against it.
 */

export interface DirEntry {
  name: string
  path: string
  dir: boolean
}

/** A sample referenced by a project file. */
export interface SampleDocEntry {
  id: string
  name: string
  /** absolute path (where it was last found) */
  absPath: string
  /** path relative to the project file, set when saved into the project's samples/ folder */
  relPath: string | null
}

export const PROJECT_FORMAT = 'drummachine-project'
export const PROJECT_VERSION = 1

export interface ProjectDoc {
  format: typeof PROJECT_FORMAT
  version: number
  savedAt: string
  /** project data; validated/normalized by the renderer (state/persistence.ts) */
  project: unknown
  samples: SampleDocEntry[]
}

export interface LoadedProject {
  /** null for a recovered autosave (it has no file of its own) */
  path: string | null
  name: string
  doc: ProjectDoc
  /** ids of samples whose files could not be found */
  missing: string[]
}

export interface SavedProject {
  path: string
  /** samples after copying into the project folder (new absPath/relPath) */
  samples: SampleDocEntry[]
}

export interface AutosaveInfo {
  name: string
  savedAt: string
}

export interface Api {
  platform: string
  setPopoutOnTop(frameName: string, onTop: boolean): void
  /** Absolute path of a File dropped from the OS. */
  pathForFile(file: File): string

  library: {
    pickFolders(): Promise<string[]>
    pickFiles(): Promise<string[]>
    listDir(dir: string): Promise<DirEntry[]>
    search(roots: string[], query: string, limit?: number): Promise<DirEntry[]>
    readAudio(path: string): Promise<Uint8Array>
    reveal(path: string): void
  }

  project: {
    pickSavePath(suggestedName: string): Promise<string | null>
    pickOpenPath(): Promise<string | null>
    save(path: string, doc: ProjectDoc): Promise<SavedProject>
    load(path: string): Promise<LoadedProject>
    recent(): Promise<string[]>
    autosave(doc: ProjectDoc, name: string): Promise<void>
    autosaveInfo(): Promise<AutosaveInfo | null>
    loadAutosave(): Promise<LoadedProject | null>
    clearAutosave(): Promise<void>
    /** Keeps main informed so closing the window can ask to save. */
    setDirty(dirty: boolean, name: string): void
    /** Main asks the renderer to save before quitting. */
    onSaveBeforeQuit(cb: () => void): () => void
    quitNow(): void
  }
}

export const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.webm']

export function isAudioPath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  return dot >= 0 && AUDIO_EXTENSIONS.includes(path.slice(dot).toLowerCase())
}

/** "C:\\a\\Kick 01.wav" → "Kick 01" */
export function baseName(path: string, stripExt = true): string {
  const file = path.split(/[\\/]/).pop() ?? path
  if (!stripExt) return file
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(0, dot) : file
}
