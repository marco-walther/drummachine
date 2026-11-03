import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

let next = 1
export const useToasts = create<{ items: Toast[] }>(() => ({ items: [] }))

export function toast(text: string, kind: Toast['kind'] = 'info', ms = kind === 'error' ? 7000 : 3500) {
  const id = next++
  useToasts.setState((s) => ({ items: [...s.items, { id, text, kind }].slice(-4) }))
  setTimeout(() => dismissToast(id), ms)
}

export function dismissToast(id: number) {
  useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) }))
}
