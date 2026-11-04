import { create } from 'zustand'
import { pickSaved, savedDataChanged, useProject, type SavedData } from './project'

/**
 * Undo/redo for project data. Snapshots are cheap: the store is immutable
 * (immer), so unchanged parts are shared. Rapid changes (a knob or note drag)
 * collapse into one step: a new step starts only after a pause, or when a
 * gesture (beginGesture/endGesture) ends.
 */

type Snapshot = SavedData

const LIMIT = 200
const MERGE_MS = 400

const snap = pickSaved
const changed = savedDataChanged

export const useHistory = create<{ past: Snapshot[]; future: Snapshot[] }>(() => ({ past: [], future: [] }))

let applying = false
let lastChange = 0
let inGesture = false
let gestureRecorded = false

useProject.subscribe((s, prev) => {
  if (applying || !changed(s, prev)) return
  const now = Date.now()
  const merge = inGesture ? gestureRecorded : now - lastChange < MERGE_MS
  lastChange = now
  if (inGesture) gestureRecorded = true
  if (merge) {
    if (useHistory.getState().future.length) useHistory.setState({ future: [] })
    return
  }
  useHistory.setState((h) => ({ past: [...h.past, snap(prev)].slice(-LIMIT), future: [] }))
})

/** Group everything until endGesture() into one undo step (e.g. a mouse drag). */
export function beginGesture() {
  inGesture = true
  gestureRecorded = false
}
export function endGesture() {
  inGesture = false
  lastChange = 0 // the next change starts a new step
}

function apply(target: Snapshot) {
  applying = true
  try {
    const st = useProject.getState()
    const current = snap(st)
    const channelIds = new Set(target.channels.map((c) => c.id))
    useProject.setState({
      ...target,
      selectedChannelId: st.selectedChannelId && channelIds.has(st.selectedChannelId) ? st.selectedChannelId : (target.channels[0]?.id ?? null)
    })
    return current
  } finally {
    applying = false
    lastChange = 0
  }
}

export function undo() {
  const { past, future } = useHistory.getState()
  const prev = past.at(-1)
  if (!prev) return false
  const current = apply(prev)
  useHistory.setState({ past: past.slice(0, -1), future: [current, ...future] })
  return true
}

export function redo() {
  const { past, future } = useHistory.getState()
  const next = future[0]
  if (!next) return false
  const current = apply(next)
  useHistory.setState({ past: [...past, current], future: future.slice(1) })
  return true
}

/** New/opened project: history starts over. */
export function resetHistory() {
  useHistory.setState({ past: [], future: [] })
  lastChange = 0
}
