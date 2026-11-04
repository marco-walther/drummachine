import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Cable, Columns3, Link2, Plus, Power, X } from 'lucide-react'
import { create } from 'zustand'
import { FX, FX_TYPES, formatParam, fromNorm, toNorm, type FxType } from '@/audio/fx-defs'
import { meterLevels } from '@/audio/mixer-engine'
import { insertDefaultVolume, MAX_FX, sendTargets } from '@/audio/mixer-graph'
import { gainToDb } from '@/audio/timing'
import { Knob } from '@/components/Knob'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { beginGesture, endGesture } from '@/state/history'
import { useProject } from '@/state/project'
import type { FxSlot, MixerInsert } from '@/state/types'
import { Routing } from './Routing'

/**
 * Mixer: Master + inserts. Channels route to an insert (its number in the
 * Channel Rack, or "Route selected channel here"); inserts send to others,
 * including sidechain sends. The selected insert's effects and sends are on the right.
 */

export const useMixerUi = create<{ selected: number; view: 'strips' | 'routing'; openFx: string | null }>(() => ({
  selected: 1,
  view: 'strips',
  openFx: null
}))

/** Meter levels polled while the Mixer is mounted (works in hidden/popped-out windows too). */
export function useMeters(): number[] {
  const [levels, setLevels] = useState<number[]>([])
  useEffect(() => {
    const t = setInterval(() => setLevels(meterLevels()), 60)
    return () => clearInterval(t)
  }, [])
  return levels
}

export function Mixer() {
  const view = useMixerUi((s) => s.view)
  const count = useProject((s) => s.mixer.length)
  const btn = (active: boolean) =>
    cn('flex h-7 items-center gap-1.5 rounded-sm px-2', active ? 'bg-inv text-inv-ink' : 'text-muted hover:bg-card hover:text-ink')
  return (
    <div className="flex h-full min-h-0 flex-col bg-paper text-[12px]">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <button className={btn(view === 'strips')} onClick={() => useMixerUi.setState({ view: 'strips' })}>
          <Columns3 size={14} /> Strips
        </button>
        <button className={btn(view === 'routing')} onClick={() => useMixerUi.setState({ view: 'routing' })}>
          <Cable size={14} /> Routing
        </button>
        <div className="flex-1" />
        <button className={btn(false)} onClick={() => useProject.getState().addInsert()} disabled={count > 99}>
          <Plus size={13} /> Insert
        </button>
      </div>
      {view === 'strips' ? (
        <div className="flex min-h-0 flex-1">
          <Strips />
          <Detail />
        </div>
      ) : (
        <Routing />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- strips

function Strips() {
  const mixer = useProject((s) => s.mixer)
  const channels = useProject((s) => s.channels)
  const selected = useMixerUi((s) => s.selected)
  const levels = useMeters()
  return (
    <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto overflow-y-hidden p-2">
      {mixer.map((ins, i) => (
        <Strip
          key={i}
          index={i}
          insert={ins}
          level={levels[i] ?? 0}
          selected={selected === i}
          inputs={channels.filter((c) => c.mixerTarget === i).length}
        />
      ))}
    </div>
  )
}

function Strip({ index, insert, level, selected, inputs }: { index: number; insert: MixerInsert; level: number; selected: boolean; inputs: number }) {
  const [renaming, setRenaming] = useState(false)
  const { updateInsert } = useProject.getState()
  const routes = insert.sends.filter((s) => !s.sidechain).map((s) => (s.target === 0 ? 'M' : String(s.target)))
  return (
    <div
      onClick={() => useMixerUi.setState({ selected: index })}
      className={cn(
        'flex w-16 shrink-0 cursor-default flex-col items-center gap-1.5 rounded-sm border px-1 py-1.5',
        selected ? 'border-ink bg-raise' : 'border-line bg-card hover:border-line-strong',
        index === 0 && 'mr-2 w-[72px]'
      )}
    >
      <span className="font-mono text-[10px] text-faint">{index === 0 ? 'M' : index}</span>
      {renaming ? (
        <input
          autoFocus
          defaultValue={insert.name}
          aria-label="Insert name"
          className="h-5 w-full rounded-sm border border-ink bg-raise px-1 text-[11px] outline-none"
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            if (e.currentTarget.value.trim()) updateInsert(index, { name: e.currentTarget.value.trim() })
            setRenaming(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setRenaming(false)
          }}
        />
      ) : (
        <span className={cn('w-full truncate text-center text-[11px]', inputs || index === 0 ? 'text-ink' : 'text-muted')} title={`${insert.name} (double-click to rename)`} onDoubleClick={() => setRenaming(true)}>
          {insert.name}
        </span>
      )}
      <Knob label={`${insert.name} pan`} size={22} bipolar min={-1} max={1} defaultValue={0} value={insert.pan} onChange={(v) => updateInsert(index, { pan: v })} format={(v) => (Math.abs(v) < 0.01 ? 'C' : `${Math.round(Math.abs(v) * 100)}${v < 0 ? 'L' : 'R'}`)} />
      <div className="flex min-h-0 flex-1 items-stretch gap-1.5">
        <Meter level={insert.muted ? 0 : level} />
        <Fader
          value={insert.volume}
          unity={insertDefaultVolume(index === 0)}
          onChange={(v) => updateInsert(index, { volume: v })}
          label={`${insert.name} volume`}
        />
      </div>
      <span className="font-mono text-[9.5px] text-faint">{formatDb(insert.volume)}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          updateInsert(index, { muted: !insert.muted })
        }}
        className={cn('h-5 w-full rounded-sm border text-[10px]', insert.muted ? 'border-line text-faint' : 'border-line-strong text-ink')}
        title={insert.muted ? 'Unmute' : 'Mute'}
        aria-pressed={!insert.muted}
      >
        {insert.muted ? 'muted' : 'on'}
      </button>
      <span className="h-3 w-full truncate text-center font-mono text-[9px] text-faint" title="Sends to">
        {index === 0 ? 'out' : routes.length ? `→ ${routes.join(' ')}` : 'no output'}
        {insert.fx.length ? ` · ${insert.fx.length}fx` : ''}
      </span>
    </div>
  )
}

const formatDb = (v: number) => {
  const db = gainToDb(v)
  return db === -Infinity ? '−∞' : `${db > 0 ? '+' : ''}${db.toFixed(1)}`
}

function Meter({ level }: { level: number }) {
  return (
    <div className="relative w-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div className="absolute right-0 bottom-0 left-0 bg-ink transition-[height] duration-75" style={{ height: `${level * 100}%` }} />
    </div>
  )
}

/** Vertical fader: drag (Shift = fine), wheel, double-click resets to the default. */
function Fader({ value, unity, onChange, label }: { value: number; unity: number; onChange(v: number): void; label: string }) {
  const MAX = 1.25
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; v: number } | null>(null)
  const norm = value / MAX
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={MAX}
      aria-valuenow={value}
      tabIndex={0}
      className="relative w-4 cursor-ns-resize touch-none"
      onPointerDown={(e) => {
        e.stopPropagation()
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        drag.current = { y: e.clientY, v: value }
        beginGesture()
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const h = ref.current!.clientHeight
        const dv = ((drag.current.y - e.clientY) / h) * MAX * (e.shiftKey ? 0.2 : 1)
        onChange(Math.min(MAX, Math.max(0, drag.current.v + dv)))
      }}
      onPointerUp={() => {
        drag.current = null
        endGesture()
      }}
      onDoubleClick={() => onChange(unity)}
      onWheel={(e) => onChange(Math.min(MAX, Math.max(0, value - Math.sign(e.deltaY) * 0.02)))}
    >
      <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-line-strong" />
      <div className="absolute right-0 left-0 h-px bg-faint" style={{ bottom: `${(unity / MAX) * 100}%` }} title="default" />
      <div className="absolute left-0 h-2.5 w-4 -translate-y-1/2 rounded-[2px] border border-ink bg-raise" style={{ bottom: `calc(${norm * 100}% - 5px)` }} />
    </div>
  )
}

// ---------------------------------------------------------------- detail (selected insert)

function Detail() {
  const index = useMixerUi((s) => s.selected)
  const mixer = useProject((s) => s.mixer)
  const channels = useProject((s) => s.channels)
  const selectedChannel = useProject((s) => s.channels.find((c) => c.id === s.selectedChannelId))
  const ins = mixer[index] ?? mixer[0]
  const st = useProject.getState()
  const routed = channels.filter((c) => c.mixerTarget === index)
  const targets = sendTargets(mixer, index)
  const name = (i: number) => (i === 0 ? 'Master' : `${i} ${mixer[i]?.name ?? ''}`)

  return (
    <div className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-line">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="font-mono text-[10px] text-faint">{index === 0 ? 'M' : index}</span>
        <span className="truncate text-ink">{ins.name}</span>
      </div>

      <section className="border-b border-line p-3">
        <h3 className="mb-1.5 font-mono text-[10px] tracking-[0.12em] text-faint">INPUTS</h3>
        <div className="flex flex-wrap gap-1">
          {routed.length === 0 && <span className="text-faint">No channels routed here.</span>}
          {routed.map((c) => (
            <span key={c.id} className="rounded-sm border border-line bg-card px-1.5 py-0.5 text-[11px] text-soft">
              {c.name}
            </span>
          ))}
        </div>
        {selectedChannel && selectedChannel.mixerTarget !== index && (
          <button
            onClick={() => st.updateChannel(selectedChannel.id, { mixerTarget: index })}
            className="mt-2 flex h-7 items-center gap-1.5 rounded-sm border border-line px-2 text-muted hover:border-ink hover:text-ink"
          >
            <Link2 size={13} /> Route “{selectedChannel.name}” here
          </button>
        )}
      </section>

      <section className="border-b border-line p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="font-mono text-[10px] tracking-[0.12em] text-faint">
            EFFECTS {ins.fx.length}/{MAX_FX}
          </h3>
          {ins.fx.length < MAX_FX && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-6 items-center gap-1 rounded-sm px-1.5 text-muted hover:bg-card hover:text-ink">
                  <Plus size={12} /> Add
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {FX_TYPES.map((t) => (
                  <DropdownMenuItem key={t} onSelect={() => st.addFx(index, t)}>
                    {FX[t].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {ins.fx.length === 0 && <p className="text-faint">No effects. Add one; they run top to bottom.</p>}
        <div className="flex flex-col gap-1">
          {ins.fx.map((slot, i) => (
            <FxRow key={slot.id} index={index} slot={slot} position={i} count={ins.fx.length} />
          ))}
        </div>
      </section>

      {index !== 0 && (
        <section className="p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="font-mono text-[10px] tracking-[0.12em] text-faint">SENDS</h3>
            {targets.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-6 items-center gap-1 rounded-sm px-1.5 text-muted hover:bg-card hover:text-ink">
                    <Plus size={12} /> Send
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                  <DropdownMenuLabel className="text-[11px] font-normal text-muted">Audio send to</DropdownMenuLabel>
                  {targets.map((t) => (
                    <DropdownMenuItem key={'a' + t} onSelect={() => st.addSend(index, t, false)}>
                      {name(t)}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuLabel className="text-[11px] font-normal text-muted">Sidechain to (for its Sidechain duck)</DropdownMenuLabel>
                  {targets
                    .filter((t) => t !== 0)
                    .map((t) => (
                      <DropdownMenuItem key={'s' + t} onSelect={() => st.addSend(index, t, true)}>
                        {name(t)}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {ins.sends.length === 0 && <p className="text-faint">Not connected: this insert is silent.</p>}
          {ins.sends.map((s) => (
            <div key={s.target} className="flex items-center gap-2 py-1">
              <span className={cn('min-w-0 flex-1 truncate', s.sidechain ? 'text-muted italic' : 'text-soft')}>
                {s.sidechain ? 'sidechain → ' : '→ '}
                {name(s.target)}
              </span>
              <Knob label={`Send to ${name(s.target)}`} size={20} value={s.amount} defaultValue={1} onChange={(v) => st.updateSend(index, s.target, { amount: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <button aria-label={`Remove send to ${name(s.target)}`} onClick={() => st.removeSend(index, s.target)} className="text-faint hover:text-ink">
                <X size={13} />
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function FxRow({ index, slot, position, count }: { index: number; slot: FxSlot; position: number; count: number }) {
  const open = useMixerUi((s) => s.openFx === slot.id)
  const def = FX[slot.type as FxType]
  const st = useProject.getState()
  return (
    <div className={cn('rounded-sm border', open ? 'border-line-strong bg-raise' : 'border-line bg-card')}>
      <div className="flex h-7 items-center gap-1 px-1.5">
        <button
          aria-label={slot.enabled ? 'Bypass' : 'Enable'}
          title={slot.enabled ? 'On (click to bypass)' : 'Bypassed (click to enable)'}
          onClick={() => st.updateFx(index, slot.id, { enabled: !slot.enabled })}
          className={cn('grid size-5 place-items-center rounded-sm', slot.enabled ? 'text-ink' : 'text-faint')}
        >
          <Power size={12} />
        </button>
        <button onClick={() => useMixerUi.setState({ openFx: open ? null : slot.id })} className={cn('min-w-0 flex-1 truncate text-left', slot.enabled ? 'text-ink' : 'text-faint line-through')}>
          {position + 1}. {def.label}
        </button>
        <button aria-label="Move up" disabled={position === 0} onClick={() => st.moveFx(index, position, position - 1)} className="text-faint hover:text-ink disabled:opacity-30">
          <ArrowUp size={12} />
        </button>
        <button aria-label="Move down" disabled={position === count - 1} onClick={() => st.moveFx(index, position, position + 1)} className="text-faint hover:text-ink disabled:opacity-30">
          <ArrowDown size={12} />
        </button>
        <button aria-label="Remove effect" onClick={() => st.removeFx(index, slot.id)} className="text-faint hover:text-ink">
          <X size={12} />
        </button>
      </div>
      {open && (
        <div className="flex flex-wrap gap-2 border-t border-line px-2 py-2">
          {Object.entries(def.params).map(([key, p]) => (
            <div key={key} className="flex w-14 flex-col items-center gap-0.5">
              <Knob
                label={p.label}
                size={26}
                min={0}
                max={1}
                value={toNorm(p, slot.params[key])}
                defaultValue={toNorm(p, p.default)}
                onChange={(n) => {
                  let v = fromNorm(p, n)
                  if (p.unit === 'choice') v = Math.round(v)
                  st.updateFx(index, slot.id, { params: { [key]: v } })
                }}
                format={(n) => formatParam(p, fromNorm(p, n))}
              />
              <span className="text-[10px] text-muted">{p.label}</span>
              <span className="font-mono text-[9.5px] text-faint">{formatParam(p, slot.params[key])}</span>
            </div>
          ))}
          {slot.type === 'ducker' && <p className="w-full text-[10.5px] leading-relaxed text-faint">Ducks this insert when audio arrives on its sidechain. Add a sidechain send to it from e.g. the kick’s insert.</p>}
        </div>
      )}
    </div>
  )
}
