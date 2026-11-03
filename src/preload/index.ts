import { contextBridge, ipcRenderer } from 'electron'

// Typed bridge between renderer and main. File/sample APIs land here in Phase 3.
const api = {
  platform: process.platform,
  /** Keep a popped-out panel window above other windows. */
  setPopoutOnTop(frameName: string, onTop: boolean) {
    ipcRenderer.send('popout:set-on-top', frameName, onTop)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
