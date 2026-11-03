import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { AutosaveInfo, LoadedProject, ProjectDoc } from '../shared/api'
import {
  loadProjectFile,
  parseDoc,
  removeIfExists,
  resolveSamples,
  saveProjectFile,
  writeJsonAtomic
} from './project-io'

const filters = [{ name: 'Drummachine project', extensions: ['dmproj'] }]
const userFile = (name: string) => join(app.getPath('userData'), name)
const RECENT = () => userFile('recent.json')
const AUTOSAVE = () => userFile('autosave.dmproj')

async function readRecent(): Promise<string[]> {
  try {
    const list = JSON.parse(await readFile(RECENT(), 'utf8'))
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string') : []
  } catch {
    return []
  }
}

async function addRecent(path: string) {
  const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
  const list = [path, ...(await readRecent()).filter((p) => norm(p) !== norm(path))].slice(0, 10)
  await writeJsonAtomic(RECENT(), list)
  app.addRecentDocument(path)
}

/** Unsaved-changes state reported by the renderer; used when the window closes. */
export const projectState = { dirty: false, name: 'Untitled' }

export function registerProjectIpc() {
  ipcMain.handle('project:pick-save-path', async (e, suggested: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showSaveDialog(win, {
      title: 'Save project',
      defaultPath: `${String(suggested || 'Untitled')}.dmproj`,
      filters
    })
    return r.canceled || !r.filePath ? null : r.filePath
  })
  ipcMain.handle('project:pick-open-path', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, { title: 'Open project', properties: ['openFile'], filters })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle('project:save', async (_e, path: string, doc: ProjectDoc) => {
    const saved = await saveProjectFile(String(path), doc)
    await addRecent(saved.path)
    await removeIfExists(AUTOSAVE()) // a real save supersedes the recovery copy
    return saved
  })
  ipcMain.handle('project:load', async (_e, path: string) => {
    const loaded = await loadProjectFile(String(path))
    await addRecent(loaded.path!)
    return loaded
  })
  ipcMain.handle('project:recent', async () => (await readRecent()).filter((p) => existsSync(p)))

  ipcMain.handle('project:autosave', async (_e, doc: ProjectDoc, name: string) => {
    await writeJsonAtomic(AUTOSAVE(), { ...doc, autosaveName: String(name) })
  })
  ipcMain.handle('project:autosave-info', async (): Promise<AutosaveInfo | null> => {
    try {
      const raw = JSON.parse(await readFile(AUTOSAVE(), 'utf8'))
      return { name: String(raw.autosaveName ?? 'Untitled'), savedAt: (await stat(AUTOSAVE())).mtime.toISOString() }
    } catch {
      return null
    }
  })
  ipcMain.handle('project:load-autosave', async (): Promise<LoadedProject | null> => {
    try {
      const text = await readFile(AUTOSAVE(), 'utf8')
      const doc = parseDoc(text)
      const name = String(JSON.parse(text).autosaveName ?? 'Untitled')
      const { samples, missing } = resolveSamples(null, doc.samples)
      return { path: null, name, doc: { ...doc, samples }, missing }
    } catch {
      return null
    }
  })
  ipcMain.handle('project:clear-autosave', () => removeIfExists(AUTOSAVE()))

  ipcMain.on('project:set-dirty', (_e, dirty: unknown, name: unknown) => {
    projectState.dirty = dirty === true
    projectState.name = typeof name === 'string' ? name : 'Untitled'
  })
}
