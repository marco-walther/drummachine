/**
 * Registry of every window the UI lives in: the main window plus popped-out
 * panels. Popouts share this JS context (same-origin `window.open`), so the
 * store and audio engine are shared; what is NOT shared is per-document state:
 *   - the `.dark` class on <html>            → applied to every window here
 *   - window-level listeners (keys, pointerup) → `addGlobalListener`
 *   - where menus/dialogs should portal to   → `portalContainer()`
 */

interface GlobalListener {
  type: string
  handler: EventListener
  options?: AddEventListenerOptions
}

const windows = new Set<Window>()
const listeners = new Set<GlobalListener>()
let dark = false
let activeDoc: Document = document

const trackActive = (e: Event) => {
  const doc = (e.target as Node | null)?.ownerDocument
  if (doc) activeDoc = doc
}

function applyTheme(win: Window) {
  win.document.documentElement.classList.toggle('dark', dark)
}

/** Start treating `win` as part of the app. Returns an unregister function. */
export function registerWindow(win: Window): () => void {
  if (windows.has(win)) return () => {}
  windows.add(win)
  applyTheme(win)
  win.addEventListener('pointerdown', trackActive, true)
  win.addEventListener('keydown', trackActive, true)
  win.addEventListener('focus', () => (activeDoc = win.document))
  for (const l of listeners) win.addEventListener(l.type, l.handler, l.options)
  return () => {
    windows.delete(win)
    for (const l of listeners) win.removeEventListener(l.type, l.handler, l.options)
    if (activeDoc === win.document) activeDoc = document
  }
}

/** Listen on every app window, including popouts opened later. */
export function addGlobalListener<K extends keyof WindowEventMap>(
  type: K,
  handler: (e: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions
): () => void {
  const l: GlobalListener = { type, handler: handler as EventListener, options }
  listeners.add(l)
  for (const w of windows) w.addEventListener(type, l.handler, options)
  return () => {
    listeners.delete(l)
    for (const w of windows) w.removeEventListener(type, l.handler, options)
  }
}

export function setThemeDark(value: boolean) {
  dark = value
  for (const w of windows) applyTheme(w)
}

/** Body of the window the user last interacted with: menus open there. */
export function portalContainer(): HTMLElement {
  return activeDoc.body ?? document.body
}

export function appWindows(): Window[] {
  return [...windows]
}

registerWindow(window)
