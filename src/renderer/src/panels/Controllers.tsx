import { Activity, Plus, Power, Trash2, Waves, X } from 'lucide-react'
import { paramInfo } from '@/audio/params'
import { DragNumber } from '@/components/DragNumber'
import { Knob } from '@/components/Knob'
import { ParamPicker } from '@/components/ParamMenu'
import { cn } from '@/lib/utils'
import { useProject } from '@/state/project'
import type { Controller, LfoShape } from '@/state/types'

/**
 * Internal controllers (FL's Formula/Peak controllers): an LFO or a peak
 * follower that moves any linked parameter. Link from a knob's right-click
 * menu, or with "+ Link parameter" here.
 */

const SHAPES: LfoShape[] = ['sine', 'triangle', 'square', 'saw', 'random']

export function Controllers() {
  const controllers = useProject((s) => s.controllers)
  const st = useProject.getState()
  return (
    <div className="flex h-full min-h-0 flex-col bg-paper text-[12px]">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <button onClick={() => st.addController('lfo')} className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-muted hover:bg-card hover:text-ink">
          <Plus size={13} /> LFO
        </button>
        <button onClick={() => st.addController('peak')} className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-muted hover:bg-card hover:text-ink">
          <Plus size={13} /> Peak
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-wrap content-start gap-3 overflow-auto p-3">
        {controllers.length === 0 && (
          <p className="max-w-md leading-relaxed text-faint">
            No controllers. Add an LFO to wobble a parameter in time, or a Peak controller to make one follow the loudness of a channel or
            insert (e.g. duck a pad with the kick). Then link parameters, or right-click any knob → Link to controller.
          </p>
        )}
        {controllers.map((c) => (
          <Card key={c.id} c={c} />
        ))}
      </div>
    </div>
  )
}

function Card({ c }: { c: Controller }) {
  const st = useProject.getState()
  const channels = useProject((s) => s.channels)
  const mixer = useProject((s) => s.mixer)
  const set = (patch: Parameters<typeof st.updateController>[1]) => st.updateController(c.id, patch)
  return (
    <div className={cn('flex w-72 flex-col gap-2 rounded-sm border p-2.5', c.enabled ? 'border-line-strong bg-raise' : 'border-line bg-card opacity-70')}>
      <div className="flex items-center gap-1.5">
        {c.kind === 'lfo' ? <Waves size={13} className="text-muted" /> : <Activity size={13} className="text-muted" />}
        <input
          key={c.name}
          defaultValue={c.name}
          aria-label="Controller name"
          className="h-6 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 text-ink outline-none hover:border-line focus:border-ink"
          onBlur={(e) => e.currentTarget.value.trim() && set({ name: e.currentTarget.value.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <button aria-label={c.enabled ? 'Turn off' : 'Turn on'} onClick={() => set({ enabled: !c.enabled })} className={cn('grid size-6 place-items-center rounded-sm', c.enabled ? 'text-ink' : 'text-faint')}>
          <Power size={13} />
        </button>
        <button aria-label="Delete controller" onClick={() => st.removeController(c.id)} className="grid size-6 place-items-center rounded-sm text-faint hover:text-ink">
          <Trash2 size={13} />
        </button>
      </div>

      {c.kind === 'lfo' ? (
        <>
          <div className="flex flex-wrap gap-1">
            {SHAPES.map((s) => (
              <button key={s} onClick={() => set({ shape: s })} className={cn('h-6 rounded-sm border px-1.5 text-[11px] capitalize', c.shape === s ? 'border-inv bg-inv text-inv-ink' : 'border-line text-muted hover:text-ink')}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-sm border border-line text-[11px]">
              <button onClick={() => set({ sync: true, rate: 4 })} className={cn('px-1.5 py-0.5', c.sync ? 'bg-inv text-inv-ink' : 'text-muted')}>
                Beats
              </button>
              <button onClick={() => set({ sync: false, rate: 1 })} className={cn('px-1.5 py-0.5', !c.sync ? 'bg-inv text-inv-ink' : 'text-muted')}>
                Hz
              </button>
            </div>
            <label className="flex items-center gap-1 text-muted">
              {c.sync ? 'Cycle' : 'Rate'}
              <DragNumber
                label="LFO rate"
                value={c.rate}
                min={c.sync ? 0.25 : 0.01}
                max={c.sync ? 64 : 20}
                step={c.sync ? 0.25 : 0.05}
                decimals={2}
                onChange={(v) => set({ rate: v })}
                format={(v) => (c.sync ? `${v} beat${v === 1 ? '' : 's'}` : `${v.toFixed(2)} Hz`)}
                className="w-20"
              />
            </label>
          </div>
          <div className="flex gap-4">
            <Small label="Depth" value={c.depth} onChange={(v) => set({ depth: v })} />
            <Small label="Center" value={c.center} onChange={(v) => set({ center: v })} />
          </div>
        </>
      ) : (
        <>
          <label className="flex items-center gap-2 text-muted">
            Listens to
            <select
              value={c.source}
              onChange={(e) => set({ source: e.target.value })}
              className="h-6 min-w-0 flex-1 rounded-sm border border-line bg-raise px-1 text-[11.5px] text-ink outline-none"
            >
              <optgroup label="Channels">
                {channels.map((ch) => (
                  <option key={ch.id} value={`ch.${ch.id}`}>
                    {ch.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Mixer">
                {mixer.map((m, i) => (
                  <option key={i} value={`mix.${i}`}>
                    {i === 0 ? 'Master' : `${i} ${m.name}`}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <div className="flex gap-4">
            <Small label="Base" value={c.base} onChange={(v) => set({ base: v })} />
            <Small label="Amount" value={c.amount} min={-1} bipolar onChange={(v) => set({ amount: v })} />
            <Small label="Release" value={c.release} min={0.01} max={2} onChange={(v) => set({ release: v })} format={(v) => `${Math.round(v * 1000)} ms`} />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1 border-t border-line pt-2">
        {c.targets.map((ref) => (
          <div key={ref} className="flex items-center gap-1 text-[11.5px] text-soft">
            <span className="min-w-0 flex-1 truncate">→ {paramInfo({ channels, mixer }, ref)?.label ?? 'missing parameter'}</span>
            <button aria-label="Unlink" onClick={() => st.unlinkController(c.id, ref)} className="text-faint hover:text-ink">
              <X size={12} />
            </button>
          </div>
        ))}
        <div>
          <ParamPicker label="+ Link parameter" exclude={c.targets} onPick={(ref) => st.linkController(c.id, ref)} />
        </div>
      </div>
    </div>
  )
}

function Small({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  bipolar,
  format
}: {
  label: string
  value: number
  onChange(v: number): void
  min?: number
  max?: number
  bipolar?: boolean
  format?(v: number): string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Knob label={label} size={26} min={min} max={max} bipolar={bipolar} value={value} onChange={onChange} format={format ?? ((v) => `${Math.round(v * 100)}%`)} />
      <span className="text-[10px] text-muted">{label}</span>
      <span className="font-mono text-[9.5px] text-faint">{format ? format(value) : `${Math.round(value * 100)}%`}</span>
    </div>
  )
}
