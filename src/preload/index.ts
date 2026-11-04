import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api } from '../shared/api'

const api: Api = {
  platform: process.platform,
  setPopoutOnTop: (frameName, onTop) => ipcRenderer.send('popout:set-on-top', frameName, onTop),
  pathForFile: (file) => webUtils.getPathForFile(file),

  library: {
    pickFolders: () => ipcRenderer.invoke('library:pick-folders'),
    pickFiles: () => ipcRenderer.invoke('library:pick-files'),
    listDir: (dir) => ipcRenderer.invoke('library:list-dir', dir),
    search: (roots, query, limit) => ipcRenderer.invoke('library:search', roots, query, limit),
    readAudio: (path) => ipcRenderer.invoke('library:read-audio', path),
    reveal: (path) => ipcRenderer.send('library:reveal', path)
  },

  export: {
    pickWavPath: (name) => ipcRenderer.invoke('export:pick-wav-path', name),
    writeWav: (path, data) => ipcRenderer.invoke('export:write-wav', path, data),
    reveal: (path) => ipcRenderer.send('export:reveal', path)
  },

  project: {
    pickSavePath: (name) => ipcRenderer.invoke('project:pick-save-path', name),
    pickOpenPath: () => ipcRenderer.invoke('project:pick-open-path'),
    save: (path, doc) => ipcRenderer.invoke('project:save', path, doc),
    load: (path) => ipcRenderer.invoke('project:load', path),
    recent: () => ipcRenderer.invoke('project:recent'),
    autosave: (doc, name) => ipcRenderer.invoke('project:autosave', doc, name),
    autosaveInfo: () => ipcRenderer.invoke('project:autosave-info'),
    loadAutosave: () => ipcRenderer.invoke('project:load-autosave'),
    clearAutosave: () => ipcRenderer.invoke('project:clear-autosave'),
    setDirty: (dirty, name) => ipcRenderer.send('project:set-dirty', dirty, name),
    onSaveBeforeQuit: (cb) => {
      const listener = () => cb()
      ipcRenderer.on('project:save-before-quit', listener)
      return () => ipcRenderer.removeListener('project:save-before-quit', listener)
    },
    quitNow: () => ipcRenderer.send('project:quit-now'),
    takeLaunchFile: () => ipcRenderer.invoke('project:take-launch-file'),
    onOpenFile: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, path: string) => cb(path)
      ipcRenderer.on('project:open-file', listener)
      return () => ipcRenderer.removeListener('project:open-file', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
