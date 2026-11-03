import { useEffect } from 'react'
import { engine } from '@/audio/engine'
import { Toasts } from '@/components/Toasts'
import { TransportBar } from '@/components/TransportBar'
import { UnsavedDialog } from '@/components/UnsavedDialog'
import { useTheme } from '@/hooks/use-theme'
import { handleNoteKeyDown, handleNoteKeyUp, releaseAllKeys, useTypingKeyboard } from '@/input/keyboard'
import { initMidi } from '@/input/midi'
import { useProjectFile } from '@/state/file'
import { SHORTCUTS, showPanel } from '@/workspace/layout'
import {
  autosaveIfDirty,
  importSamples,
  newProject,
  openProject,
  saveProject,
  saveProjectAs
} from '@/workspace/project-actions'
import { addGlobalListener } from '@/workspace/windows'
import { Workspace } from '@/workspace/Workspace'

const AUTOSAVE_MS = 60_000

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** Open dialogs and menus keep normal keyboard use (Enter confirms, Space activates). */
function inModal(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest?.('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')
}

const swallow = (e: KeyboardEvent) => {
  e.preventDefault()
  e.stopPropagation()
}

/**
 * Capture phase: runs before any focused button/menu trigger sees the key, so
 * note keys, Space and Enter never "press" whatever control has focus.
 */
function onKeyCapture(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || inModal(e.target)) return
  // piano layout on the selected channel (see input/notes.ts), Z/X = octave
  if (handleNoteKeyDown(e)) return swallow(e)
  if (e.code === 'Space') {
    swallow(e)
    if (!e.repeat) engine.toggle()
    return
  }
  // keyboard mode: Enter is not an action key
  if (e.key === 'Enter' && useTypingKeyboard.getState().enabled) swallow(e)
}

function onKey(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (mod && !e.altKey) {
    const k = e.key.toLowerCase()
    const run = (fn: () => unknown) => {
      e.preventDefault()
      void fn()
    }
    if (k === 's' && e.shiftKey) return run(saveProjectAs)
    if (k === 's') return run(saveProject)
    if (k === 'o') return run(() => openProject())
    if (k === 'n') return run(newProject)
    if (k === 'i') return run(importSamples)
    return
  }
  if (isTyping(e.target) || e.altKey) return
  if (SHORTCUTS[e.key]) {
    e.preventDefault()
    showPanel(SHORTCUTS[e.key])
  }
}

export default function App() {
  const [theme, setTheme] = useTheme()

  useEffect(() => {
    engine.init()
    void initMidi()
    const offs = [
      // on every window, so shortcuts also work inside popped-out panels
      addGlobalListener('keydown', onKeyCapture, { capture: true }),
      addGlobalListener('keydown', onKey),
      addGlobalListener(
        'keyup',
        (e) => {
          if (handleNoteKeyUp(e)) swallow(e)
          // buttons fire their click on Space/Enter key-up; those keys are ours
          else if ((e.code === 'Space' || e.key === 'Enter') && !isTyping(e.target) && !inModal(e.target)) e.preventDefault()
        },
        { capture: true }
      ),
      // switching windows/apps while a key is held must not leave a note hanging
      addGlobalListener('blur', () => releaseAllKeys()),
      // a file dropped outside a drop zone must not open in the window
      addGlobalListener('dragover', (e) => {
        if (!e.defaultPrevented) {
          e.preventDefault()
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
        }
      }),
      addGlobalListener('drop', (e) => e.preventDefault()),
      // closing the window with unsaved changes → main asks → "Save" lands here
      window.api.project.onSaveBeforeQuit(async () => {
        if (await saveProject()) window.api.project.quitNow()
      })
    ]
    const timer = setInterval(() => void autosaveIfDirty(), AUTOSAVE_MS)

    // window title + tell main about unsaved changes
    const syncFile = () => {
      const { name, dirty } = useProjectFile.getState()
      document.title = `${name}${dirty ? ' •' : ''} · Drummachine`
      window.api.project.setDirty(dirty, name)
    }
    syncFile()
    const offFile = useProjectFile.subscribe(syncFile)

    return () => {
      offs.forEach((off) => off())
      offFile()
      clearInterval(timer)
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <TransportBar theme={theme} setTheme={setTheme} />
      <main className="min-h-0 flex-1 bg-page">
        <Workspace />
      </main>
      <Toasts />
      <UnsavedDialog />
    </div>
  )
}
