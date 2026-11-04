import { writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'

/** Audio export: save dialog + writing the rendered WAV files. */
export function registerExportIpc() {
  ipcMain.handle('export:pick-wav-path', async (e, suggested: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showSaveDialog(win, {
      title: 'Export audio',
      defaultPath: `${String(suggested || 'Untitled')}.wav`,
      filters: [{ name: 'WAV audio', extensions: ['wav'] }]
    })
    return r.canceled || !r.filePath ? null : r.filePath
  })
  ipcMain.handle('export:write-wav', async (_e, path: string, data: Uint8Array) => {
    const p = String(path)
    if (extname(p).toLowerCase() !== '.wav') throw new Error('Exports must be .wav files')
    await writeFile(p, Buffer.from(data))
  })
  ipcMain.on('export:reveal', (_e, path: string) => shell.showItemInFolder(String(path)))
}
