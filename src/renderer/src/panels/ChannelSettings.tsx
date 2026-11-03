import { useCallback, useRef } from 'react'
import { AudioLines, ChevronDown, Drum, KeyboardMusic, Minus, Plus, ScanSearch } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { baseName } from '@shared/api'
import { engine } from '@/audio/engine'
import { detectPitchHz, hzToMidi } from '@/audio/pitch'
import { sampleBuffers } from '@/audio/voices'
import { useSampleStatus } from '@/audio/samples'
import { DragNumber } from '@/components/DragNumber'
import { Knob } from '@/components/Knob'
import { PianoKeyboard } from '@/components/PianoKeyboard'
import { noteName, shiftOctave, useTypingKeyboard } from '@/input/keyboard'
import { useMidi } from '@/input/midi'
import { cn } from '@/lib/utils'
import { INSTRUMENT_DEFAULTS, INSTRUMENT_NAMES, PRESET_NAMES, instrumentSource, useProject } from '@/state/project'
import { toast } from '@/state/toasts'
import type { Channel, ChannelSource, DrumPreset, InstrumentKind, SampleSource } from '@/state/types'

/**
 * Settings of the selected channel (FL "Channel settings"): what it plays and
 * how, plus a keyboard to play it. Lives in a dock panel, so it can pop out.
 */
export function ChannelSettings() {
  const channel = useProject((s) => s.channels.find((c) => c.id === s.selectedChannelId) ?? null)

  if (!channel) {
    return (
      <div className="hatch grid h-full place-items-center p-6 text-center text-[12px] text-muted">
        Select a channel in the Channel Rack.
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-paper text-[12px]">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <SourceIcon source={channel.source} />
        <span className="truncate text-ink">{channel.name}</span>
      </div>
      <div className="flex flex-col gap-4 p-3">
        <SourcePicker channel={channel} />
        <PlayArea channel={channel} />
        {channel.source.type === 'instrument' && <InstrumentControls channel={channel} />}
        {channel.source.type === 'sample' && <SampleControls channel={channel} source={channel.source} />}
      </div>
    </div>
  )
}

export function SourceIcon({ source, className }: { source: ChannelSource; className?: string }) {
  const Icon = source.type === 'synth' ? Drum : source.type === 'instrument' ? KeyboardMusic : AudioLines
  return <Icon size={13} className={cn('shrink-0 text-muted', className)} />
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="font-mono text-[10px] tracking-[0.12em] text-faint">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

function Choice({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-7 rounded-sm border px-2 text-[12px] transition-colors',
        active ? 'border-inv bg-inv text-inv-ink' : 'border-line bg-raise text-soft hover:border-ink hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}

function SourcePicker({ channel }: { channel: Channel }) {
  const { setChannelSource, setChannelSample } = useProject.getState()
  const src = channel.source
  const pickSample = async () => {
    const [path] = await window.api.library.pickFiles()
    if (path) setChannelSample(channel.id, path, baseName(path))
  }
  return (
    <Section title="SOUND">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(INSTRUMENT_NAMES) as InstrumentKind[]).map((k) => (
            <Choice
              key={k}
              active={src.type === 'instrument' && src.kind === k}
              onClick={() => setChannelSource(channel.id, instrumentSource(k))}
            >
              {INSTRUMENT_NAMES[k]}
            </Choice>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-pressed={src.type === 'synth'}
                className={cn(
                  'flex h-7 items-center gap-1 rounded-sm border px-2 text-[12px] transition-colors',
                  src.type === 'synth'
                    ? 'border-inv bg-inv text-inv-ink'
                    : 'border-line bg-raise text-soft hover:border-ink hover:text-ink'
                )}
              >
                {src.type === 'synth' ? `Drum: ${PRESET_NAMES[src.preset]}` : 'Drum'}
                <ChevronDown size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(Object.keys(PRESET_NAMES) as DrumPreset[]).map((p) => (
                <DropdownMenuItem key={p} onSelect={() => setChannelSource(channel.id, { type: 'synth', preset: p })}>
                  {PRESET_NAMES[p]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Choice active={src.type === 'sample'} onClick={() => void pickSample()}>
            {src.type === 'sample' ? 'Replace sample…' : 'Your sample…'}
          </Choice>
        </div>
      </div>
    </Section>
  )
}

const seconds = (v: number) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`)

function LabeledKnob(props: React.ComponentProps<typeof Knob> & { caption: string }) {
  const { caption, ...knob } = props
  return (
    <div className="flex w-14 flex-col items-center gap-1">
      <Knob size={28} {...knob} />
      <span className="text-[10.5px] text-muted">{caption}</span>
      <span className="font-mono text-[10px] text-faint">{knob.format ? knob.format(knob.value) : knob.value}</span>
    </div>
  )
}

function InstrumentControls({ channel }: { channel: Channel }) {
  if (channel.source.type !== 'instrument') return null
  const { params, kind } = channel.source
  const d = INSTRUMENT_DEFAULTS[kind]
  const set = useProject.getState().updateInstrumentParams
  return (
    <Section title="SHAPE">
      <div className="flex flex-wrap gap-2">
        <LabeledKnob caption="Attack" label="Attack" min={0.001} max={2} value={params.attack} defaultValue={d.attack} onChange={(v) => set(channel.id, { attack: v })} format={seconds} />
        <LabeledKnob caption="Release" label="Release" min={0.01} max={4} value={params.release} defaultValue={d.release} onChange={(v) => set(channel.id, { release: v })} format={seconds} />
        <LabeledKnob caption="Bright" label="Brightness" value={params.brightness} defaultValue={d.brightness} onChange={(v) => set(channel.id, { brightness: v })} format={(v) => `${Math.round(v * 100)}%`} />
        {kind === 'bass' && (
          <LabeledKnob caption="Glide" label="Glide" min={0} max={0.4} value={params.glide} defaultValue={d.glide} onChange={(v) => set(channel.id, { glide: v })} format={seconds} />
        )}
      </div>
    </Section>
  )
}

function SampleControls({ channel, source }: { channel: Channel; source: SampleSource }) {
  const sample = useProject((s) => s.samples[source.sampleId])
  const status = useSampleStatus((s) => s[source.sampleId])
  const set = useProject.getState().updateSampleSettings

  const detect = () => {
    const buf = sampleBuffers.get(source.sampleId)
    if (!buf?.loaded) return toast('The sample is not loaded yet.', 'error')
    const hz = detectPitchHz(buf.getChannelData(0), buf.sampleRate)
    if (!hz) return toast("Couldn't find a clear pitch in this sample (drums often have none).", 'error')
    const root = hzToMidi(hz)
    set(channel.id, { root })
    toast(`Root note set to ${noteName(root)} (${hz.toFixed(1)} Hz)`)
  }

  return (
    <Section title="SAMPLE">
      <div className="flex flex-col gap-3">
        <div className="truncate text-soft" title={sample?.path}>
          {sample?.name ?? 'Sample'}
          {status === 'missing' && <span className="ml-2 font-mono text-[10px] text-muted">missing</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 text-muted">Root note</span>
          <DragNumber
            label="Root note"
            value={source.root}
            min={0}
            max={127}
            step={0.25}
            onChange={(v) => set(channel.id, { root: Math.round(v) })}
            format={(v) => noteName(v)}
            className="w-12 text-center"
          />
          <button
            onClick={detect}
            title="Detect the sample's pitch and use it as root note"
            className="flex h-6 items-center gap-1 rounded-sm border border-line px-2 text-muted hover:border-ink hover:text-ink"
          >
            <ScanSearch size={12} /> Detect
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 text-muted">Play</span>
          <div className="flex gap-1">
            <Choice active={source.oneShot} onClick={() => set(channel.id, { oneShot: true })}>
              Whole sample
            </Choice>
            <Choice active={!source.oneShot} onClick={() => set(channel.id, { oneShot: false })}>
              Note length
            </Choice>
          </div>
        </div>
        <div className="flex gap-2">
          <LabeledKnob caption="Attack" label="Sample attack" min={0} max={1} value={source.attack} defaultValue={0} onChange={(v) => set(channel.id, { attack: v })} format={seconds} />
          {!source.oneShot && (
            <LabeledKnob caption="Release" label="Sample release" min={0.005} max={3} value={source.release} defaultValue={0.08} onChange={(v) => set(channel.id, { release: v })} format={seconds} />
          )}
        </div>
      </div>
    </Section>
  )
}

function PlayArea({ channel }: { channel: Channel }) {
  const octave = useTypingKeyboard((s) => s.octave)
  const enabled = useTypingKeyboard((s) => s.enabled)
  const devices = useMidi((s) => s.devices)
  const ids = useRef(new Map<number, number | null>())
  const onDown = useCallback(
    (key: number) => ids.current.set(key, engine.noteOn(channel.id, key, 0.8)),
    [channel.id]
  )
  const onUp = useCallback((key: number) => {
    engine.noteOff(ids.current.get(key) ?? null)
    ids.current.delete(key)
  }, [])

  return (
    <Section
      title="PLAY"
      right={
        <div className="flex items-center gap-1 text-[11px] text-muted">
          <button aria-label="Octave down (Z)" title="Octave down (Z)" onClick={() => shiftOctave(-1)} className="grid size-5 place-items-center rounded-sm hover:bg-card hover:text-ink">
            <Minus size={11} />
          </button>
          <span className="w-14 text-center font-mono">{noteName(octave * 12)}</span>
          <button aria-label="Octave up (X)" title="Octave up (X)" onClick={() => shiftOctave(1)} className="grid size-5 place-items-center rounded-sm hover:bg-card hover:text-ink">
            <Plus size={11} />
          </button>
        </div>
      }
    >
      <PianoKeyboard from={octave * 12} octaves={2} onDown={onDown} onUp={onUp} typingOctave={enabled ? octave : undefined} />
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        {enabled ? (
          <>
            Play like a piano: <span className="font-mono text-muted">A S D F G H J K L ; &apos;</span> are the white
            keys, <span className="font-mono text-muted">W E T Y U O P ]</span> the black keys. Z / X change the octave.{' '}
          </>
        ) : (
          'Typing keyboard is off. '
        )}
        {devices.length > 0 ? `MIDI: ${devices.join(', ')}.` : 'No MIDI keyboard connected.'}
      </p>
    </Section>
  )
}
