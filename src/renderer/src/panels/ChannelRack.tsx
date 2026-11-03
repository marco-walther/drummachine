import { memo, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { engine } from '@/audio/engine'
import { DragNumber } from '@/components/DragNumber'
import { Knob } from '@/components/Knob'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { notesInStep, PRESET_NAMES, selectCurrentPattern, useProject } from '@/state/project'
import { useTransportUi } from '@/state/transport-ui'
import type { Channel, DrumPreset, Note } from '@/state/types'

const LENGTHS = [16, 32, 64]

/** Click-drag painting across a row's steps: first cell decides on/off. */
let paint: { channelId: string; on: boolean } | null = null

export function ChannelRack() {
  const channels = useProject((s) => s.channels)
  const pattern = useProject(selectCurrentPattern)
  const swing = useProject((s) => s.swing)
  const setSwing = useProject((s) => s.setSwing)
  const setPatternLength = useProject((s) => s.setPatternLength)
  const addChannel = useProject((s) => s.addChannel)
  const step = useTransportUi((s) => s.step)
  const [dragFrom, setDragFrom] = useState<number | null>(null)

  useEffect(() => {
    const end = () => (paint = null)
    window.addEventListener('pointerup', end)
    return () => window.removeEventListener('pointerup', end)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      {/* header */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-3">
        <span className="font-mono text-[10.5px] tracking-[0.14em] text-muted">CHANNEL RACK</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5" title="Swing">
          <span className="text-[11px] text-muted">Swing</span>
          <Knob
            label="Swing"
            value={swing}
            onChange={setSwing}
            defaultValue={0}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
        <div className="flex overflow-hidden rounded-sm border border-line" role="group" aria-label="Pattern length">
          {LENGTHS.map((n) => (
            <button
              key={n}
              className={cn(
                'px-2 py-0.5 font-mono text-[11px] tabular-nums',
                pattern.lengthSteps === n ? 'bg-inv text-inv-ink' : 'text-muted hover:bg-card hover:text-ink'
              )}
              onClick={() => setPatternLength(pattern.id, n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* rows */}
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        <div className="inline-flex min-w-full flex-col gap-1">
          <StepRuler length={pattern.lengthSteps} step={step} />
          {channels.map((ch, i) => (
            <ChannelRow
              key={ch.id}
              channel={ch}
              index={i}
              notes={pattern.notes[ch.id]}
              length={pattern.lengthSteps}
              playStep={step}
              dragFrom={dragFrom}
              setDragFrom={setDragFrom}
            />
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="mt-1 flex h-7 w-[244px] items-center justify-center gap-1.5 rounded-sm border border-dashed border-line-strong text-[12px] text-muted hover:border-ink hover:text-ink">
                <Plus size={13} /> Add channel
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(Object.keys(PRESET_NAMES) as DrumPreset[]).map((p) => (
                <DropdownMenuItem key={p} onSelect={() => addChannel({ type: 'synth', preset: p })}>
                  {PRESET_NAMES[p]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem disabled>Your sample… (Phase 3)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

/** Left column spacer + one LED per step showing the playhead. */
function StepRuler({ length, step }: { length: number; step: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-[244px] shrink-0" />
      <Steps length={length}>
        {(i) => (
          <div className="flex h-3 w-[22px] items-center justify-center">
            <span
              className={cn(
                'block h-[3px] w-full rounded-full transition-colors duration-75',
                i === step ? 'bg-ink' : i % 4 === 0 ? 'bg-line-strong' : 'bg-line'
              )}
            />
          </div>
        )}
      </Steps>
    </div>
  )
}

/** Lays out N step slots in groups of 4. */
function Steps({ length, children }: { length: number; children(i: number): React.ReactNode }) {
  const groups = Math.ceil(length / 4)
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: groups }, (_, g) => (
        <div key={g} className="flex gap-0.5">
          {Array.from({ length: Math.min(4, length - g * 4) }, (_, k) => (
            <div key={k}>{children(g * 4 + k)}</div>
          ))}
        </div>
      ))}
    </div>
  )
}

interface RowProps {
  channel: Channel
  index: number
  notes: Note[] | undefined
  length: number
  playStep: number
  dragFrom: number | null
  setDragFrom(i: number | null): void
}

const ChannelRow = memo(function ChannelRow({
  channel: ch,
  index,
  notes,
  length,
  playStep,
  dragFrom,
  setDragFrom
}: RowProps) {
  const selected = useProject((s) => s.selectedChannelId === ch.id)
  const { updateChannel, toggleSolo, selectChannel, setStep, removeChannel, clearChannel, fillEvery, moveChannel } =
    useProject.getState()
  const [renaming, setRenaming] = useState(false)
  const [dropHover, setDropHover] = useState(false)

  return (
    <div
      className={cn('flex items-center gap-2', dropHover && dragFrom !== index && 'outline outline-1 outline-ink')}
      onDragOver={(e) => {
        if (dragFrom === null) return
        e.preventDefault()
        setDropHover(true)
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={() => {
        setDropHover(false)
        if (dragFrom !== null) moveChannel(dragFrom, index)
        setDragFrom(null)
      }}
    >
      {/* controls: 244px */}
      <div className="flex w-[244px] shrink-0 items-center gap-1.5">
        <button
          aria-label={`${ch.muted ? 'Unmute' : 'Mute'} ${ch.name} (right-click: solo)`}
          title="Click: mute · Right-click: solo"
          className={cn(
            'size-3 shrink-0 rounded-[2px] border transition-colors',
            ch.solo ? 'border-ink bg-ink ring-2 ring-line-strong' : ch.muted ? 'border-line-strong bg-transparent' : 'border-ink bg-ink'
          )}
          onClick={() => updateChannel(ch.id, { muted: !ch.muted })}
          onContextMenu={(e) => {
            e.preventDefault()
            toggleSolo(ch.id)
          }}
        />
        <Knob
          label={`${ch.name} pan`}
          bipolar
          min={-1}
          max={1}
          defaultValue={0}
          value={ch.pan}
          onChange={(v) => updateChannel(ch.id, { pan: v })}
          format={(v) => (Math.abs(v) < 0.01 ? 'C' : `${Math.round(Math.abs(v) * 100)}${v < 0 ? 'L' : 'R'}`)}
        />
        <Knob
          label={`${ch.name} volume`}
          defaultValue={0.78}
          value={ch.volume}
          onChange={(v) => updateChannel(ch.id, { volume: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Knob
          label={`${ch.name} pitch`}
          bipolar
          min={-24}
          max={24}
          defaultValue={0}
          value={ch.pitch}
          onChange={(v) => updateChannel(ch.id, { pitch: Math.round(v) })}
          format={(v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`}
        />
        <DragNumber
          label={`${ch.name} mixer track`}
          value={ch.mixerTarget}
          min={0}
          max={99}
          step={0.25}
          onChange={(v) => updateChannel(ch.id, { mixerTarget: Math.round(v) })}
          format={(v) => (Math.round(v) === 0 ? 'M' : String(Math.round(v)))}
          className="w-7 px-0 text-center text-[10.5px]"
        />

        <ContextMenu>
          <ContextMenuTrigger asChild>
            {renaming ? (
              <input
                autoFocus
                defaultValue={ch.name}
                aria-label="Channel name"
                className="h-7 min-w-0 flex-1 rounded-sm border border-ink bg-raise px-2 text-[12px] outline-none"
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => {
                  const name = e.currentTarget.value.trim()
                  if (name) updateChannel(ch.id, { name })
                  setRenaming(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setRenaming(false)
                }}
              />
            ) : (
              <button
                draggable
                onDragStart={() => setDragFrom(index)}
                onDragEnd={() => setDragFrom(null)}
                className={cn(
                  'h-7 min-w-0 flex-1 truncate rounded-sm border px-2 text-left text-[12px] transition-colors',
                  selected ? 'border-ink bg-raise text-ink' : 'border-line bg-card text-soft hover:border-line-strong'
                )}
                title="Click: select & preview · Double-click: rename · Drag: reorder"
                onClick={() => {
                  selectChannel(ch.id)
                  void engine.preview(ch.id)
                }}
                onDoubleClick={() => setRenaming(true)}
              >
                {ch.name}
              </button>
            )}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => setRenaming(true)}>Rename</ContextMenuItem>
            <ContextMenuItem onSelect={() => fillEvery(ch.id, 2)}>Fill every 2 steps</ContextMenuItem>
            <ContextMenuItem onSelect={() => fillEvery(ch.id, 4)}>Fill every 4 steps</ContextMenuItem>
            <ContextMenuItem onSelect={() => clearChannel(ch.id)}>Clear steps</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem disabled={index === 0} onSelect={() => moveChannel(index, index - 1)}>
              Move up
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => moveChannel(index, index + 1)}>Move down</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => removeChannel(ch.id)}>Delete channel</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>

      {/* steps */}
      <Steps length={length}>
        {(i) => {
          const hit = notesInStep(notes, i)
          const on = hit.length > 0
          const beatShade = Math.floor(i / 4) % 2 === 0
          return (
            <button
              aria-label={`${ch.name} step ${i + 1}`}
              aria-pressed={on}
              className={cn(
                'block h-7 w-[22px] rounded-[3px] border transition-colors duration-75',
                on
                  ? 'border-inv bg-inv'
                  : beatShade
                    ? 'border-line-strong bg-raise hover:border-ink'
                    : 'border-line bg-card hover:border-ink',
                i === playStep && 'ring-1 ring-ink ring-offset-1 ring-offset-paper'
              )}
              style={on ? { opacity: 0.4 + hit[0].velocity * 0.6 } : undefined}
              onPointerDown={(e) => {
                // right button erases, left toggles; drag paints the same value
                const value = e.button === 2 ? false : !on
                paint = { channelId: ch.id, on: value }
                setStep(ch.id, i, value)
                // let pointerenter fire on neighbouring cells while dragging
                if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
              }}
              onPointerEnter={(e) => {
                if (!paint) return
                // released outside the window → no pointerup seen; stop painting
                if (e.buttons === 0 && e.isTrusted) return void (paint = null)
                if (paint.channelId === ch.id) setStep(ch.id, i, paint.on)
              }}
              onContextMenu={(e) => e.preventDefault()}
            />
          )
        }}
      </Steps>
    </div>
  )
})
