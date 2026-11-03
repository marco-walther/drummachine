import { useEffect, useState } from 'react'
import { setThemeDark } from '@/workspace/windows'

export type ThemeMode = 'light' | 'dark' | 'auto'

const KEY = 'dm.theme'

function load(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch {
    /* storage unavailable */
  }
  return 'auto'
}

/** Applies `.dark` to the main window and every popout. `auto` follows the OS. */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, mode)
    } catch {
      /* ignore */
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => setThemeDark(mode === 'auto' ? mq.matches : mode === 'dark')
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [mode])

  return [mode, setMode] as const
}
