import { useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark' | 'auto'

/** Toggles the `.dark` class on <html>. `auto` follows the OS setting. */
export function useTheme(initial: ThemeMode = 'auto') {
  const [mode, setMode] = useState<ThemeMode>(initial)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = mode === 'auto' ? mq.matches : mode === 'dark'
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [mode])

  return [mode, setMode] as const
}
