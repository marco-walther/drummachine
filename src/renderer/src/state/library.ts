import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** Sample folders shown in the Browser. Per machine (not part of a project). */
export interface LibraryState {
  roots: string[]
  addRoots(paths: string[]): void
  removeRoot(path: string): void
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      roots: [],
      addRoots: (paths) => set((s) => ({ roots: [...new Set([...s.roots, ...paths])] })),
      removeRoot: (path) => set((s) => ({ roots: s.roots.filter((r) => r !== path) }))
    }),
    { name: 'dm.library', storage: createJSONStorage(() => localStorage), partialize: (s) => ({ roots: s.roots }) }
  )
)
