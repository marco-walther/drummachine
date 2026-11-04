import type { DockviewApi, DockviewGroupPanel, IDockviewPanel } from 'dockview-react'
import { create } from 'zustand'

/**
 * Workspace layout: which panels exist, the default arrangement, persistence,
 * and the commands the UI/shortcuts call (show, pop out, dock back, reset).
 */

export type PanelId = 'browser' | 'channelRack' | 'channel' | 'pianoRoll' | 'playlist' | 'mixer' | 'automation' | 'controllers'

export const PANELS: Record<PanelId, { title: string; shortcut?: string }> = {
  playlist: { title: 'Playlist', shortcut: 'F5' },
  channelRack: { title: 'Channel Rack', shortcut: 'F6' },
  pianoRoll: { title: 'Piano Roll', shortcut: 'F7' },
  browser: { title: 'Browser', shortcut: 'F8' },
  mixer: { title: 'Mixer', shortcut: 'F9' },
  channel: { title: 'Channel' },
  automation: { title: 'Automation' },
  controllers: { title: 'Controllers' }
}

export const SHORTCUTS: Record<string, PanelId> = {
  F5: 'playlist',
  F6: 'channelRack',
  F7: 'pianoRoll',
  F8: 'browser',
  F9: 'mixer'
}

const STORAGE_KEY = 'dm.layout.v1'

/** The live dockview API (null until the workspace mounts). */
export const useWorkspace = create<{ api: DockviewApi | null }>(() => ({ api: null }))
const api = () => useWorkspace.getState().api

function add(a: DockviewApi, id: PanelId, extra: Record<string, unknown> = {}): IDockviewPanel {
  return a.addPanel({ id, component: id, title: PANELS[id].title, ...extra })
}

/**
 * Default: Browser on the left; Channel Rack (+ Piano Roll tab) on top with
 * the Channel settings beside it; Playlist (+ Mixer tab) underneath.
 */
export function applyDefaultLayout(a: DockviewApi) {
  a.clear()
  const rack = add(a, 'channelRack')
  add(a, 'pianoRoll', { position: { referencePanel: 'channelRack', direction: 'within' }, inactive: true })
  add(a, 'playlist', { position: { referencePanel: 'channelRack', direction: 'below' } })
  add(a, 'mixer', { position: { referencePanel: 'playlist', direction: 'within' }, inactive: true })
  add(a, 'automation', { position: { referencePanel: 'playlist', direction: 'within' }, inactive: true })
  add(a, 'controllers', { position: { referencePanel: 'playlist', direction: 'within' }, inactive: true })
  add(a, 'channel', { ...channelPlacement(a), inactive: true })
  add(a, 'browser', { position: { direction: 'left' }, initialWidth: 220 })
  rack.api.setActive()
}

/** The Channel panel goes to the right of the Channel Rack when the rack is docked. */
function channelPlacement(a: DockviewApi) {
  const rack = a.getPanel('channelRack')
  return rack && rack.group.api.location.type === 'grid'
    ? { position: { referencePanel: 'channelRack', direction: 'right' }, initialWidth: 340 }
    : {}
}

/** Restore the saved layout, falling back to the default. */
export function restoreLayout(a: DockviewApi) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      a.fromJSON(JSON.parse(raw))
      if (a.panels.length > 0) return
    }
  } catch (err) {
    console.warn('Saved layout could not be restored, using default.', err)
  }
  applyDefaultLayout(a)
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
export function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const a = api()
    if (!a) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(a.toJSON()))
    } catch {
      /* storage unavailable: layout just isn't remembered */
    }
  }, 300)
}

/** Open (if closed) and focus a panel, wherever it lives (grid, floating, popout). */
export function showPanel(id: PanelId) {
  const a = api()
  if (!a) return
  let panel = a.getPanel(id)
  if (!panel) {
    const ref = a.activePanel && a.activePanel.group.api.location.type === 'grid' ? a.activePanel : undefined
    const placement =
      id === 'channel' && a.getPanel('channelRack')
        ? channelPlacement(a)
        : ref
          ? { position: { referencePanel: ref.id, direction: 'within' } }
          : {}
    panel = add(a, id, placement)
  }
  panel.api.setActive()
  const loc = panel.group.api.location
  if (loc.type === 'popout') loc.getWindow().focus()
}

/** Pop the group's active panel (not its sibling tabs) into its own window. */
export function popOut(group: DockviewGroupPanel) {
  void api()?.addPopoutGroup(group.activePanel ?? group)
}

/** Return a popped-out group to the main window. */
export function dockBack(group: DockviewGroupPanel) {
  group.api.moveTo({ position: 'right' })
}

/** Close every popout and put all panels back where they start. Project untouched. */
export function resetLayout() {
  const a = api()
  if (!a) return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  applyDefaultLayout(a)
  scheduleSave()
}
