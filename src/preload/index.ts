import { contextBridge } from 'electron'

// Typed bridge between renderer and main. File/sample APIs land here in Phase 3.
const api = {
  platform: process.platform
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
