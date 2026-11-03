import { create } from 'zustand'
import { engine } from '@/audio/engine'
import { useProject } from '@/state/project'

import { parseMidi } from './notes'

/** MIDI keyboards (Web MIDI) → notes on the selected channel. */

export const useMidi = create<{ supported: boolean; devices: string[] }>(() => ({ supported: false, devices: [] }))

const held = new Map<number, number | null>() // MIDI key → live note id

function onMessage(e: MIDIMessageEvent) {
  if (!e.data) return
  const ev = parseMidi(e.data)
  if (!ev) return
  if (ev.type === 'on') {
    engine.noteOff(held.get(ev.key) ?? null) // retrigger
    const channelId = useProject.getState().selectedChannelId
    held.set(ev.key, channelId ? engine.noteOn(channelId, ev.key, ev.velocity) : null)
  } else {
    engine.noteOff(held.get(ev.key) ?? null)
    held.delete(ev.key)
  }
}

let started = false
export async function initMidi() {
  if (started || !navigator.requestMIDIAccess) return
  started = true
  try {
    const access = await navigator.requestMIDIAccess()
    const attach = () => {
      const names: string[] = []
      access.inputs.forEach((input) => {
        input.onmidimessage = onMessage
        names.push(input.name ?? 'MIDI input')
      })
      useMidi.setState({ supported: true, devices: names })
    }
    attach()
    access.onstatechange = attach // hot-plug
  } catch {
    useMidi.setState({ supported: false, devices: [] })
  }
}
