import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { AUDIO_EXTENSIONS, isAudioPath, type DirEntry } from '../shared/api'

const MAX_AUDIO_BYTES = 1024 * 1024 * 1024 // 1 GB
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Sub-folders and audio files of `dir`, folders first, natural sort. */
export async function listDir(dir: string): Promise<DirEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: DirEntry[] = []
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('$')) continue
    if (e.isDirectory()) out.push({ name: e.name, path: join(dir, e.name), dir: true })
    else if (e.isFile() && isAudioPath(e.name)) out.push({ name: e.name, path: join(dir, e.name), dir: false })
  }
  return out.sort((a, b) => (a.dir === b.dir ? collator.compare(a.name, b.name) : a.dir ? -1 : 1))
}

/** Breadth-first name search for audio files under the roots (bounded). */
export async function search(roots: string[], query: string, limit = 200): Promise<DirEntry[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const results: DirEntry[] = []
  const queue = [...roots]
  let visited = 0
  while (queue.length && results.length < limit && visited < 5000) {
    const dir = queue.shift()!
    visited++
    let entries: DirEntry[]
    try {
      entries = await listDir(dir)
    } catch {
      continue // unreadable folder
    }
    for (const e of entries) {
      if (e.dir) queue.push(e.path)
      else if (e.name.toLowerCase().includes(q)) {
        results.push(e)
        if (results.length >= limit) break
      }
    }
  }
  return results
}

export async function readAudio(path: string): Promise<Uint8Array> {
  if (!isAudioPath(path)) throw new Error('Not an audio file')
  const s = await stat(path)
  if (!s.isFile()) throw new Error('Not a file')
  if (s.size > MAX_AUDIO_BYTES) throw new Error('File too large')
  return readFile(path)
}

const audioFilter = { name: 'Audio', extensions: AUDIO_EXTENSIONS.map((e) => e.slice(1)) }

export function registerFileIpc() {
  ipcMain.handle('library:pick-folders', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: 'Add sample folders',
      properties: ['openDirectory', 'multiSelections']
    })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('library:pick-files', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: 'Import samples or tracks',
      properties: ['openFile', 'multiSelections'],
      filters: [audioFilter]
    })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('library:list-dir', (_e, dir: string) => listDir(String(dir)))
  ipcMain.handle('library:search', (_e, roots: string[], query: string, limit?: number) =>
    search(roots.map(String), String(query), typeof limit === 'number' ? limit : 200)
  )
  ipcMain.handle('library:read-audio', (_e, path: string) => readAudio(String(path)))
  ipcMain.on('library:reveal', (_e, path: string) => shell.showItemInFolder(String(path)))
}
