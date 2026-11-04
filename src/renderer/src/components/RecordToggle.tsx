import { Circle } from 'lucide-react'
import { engine } from '@/audio/engine'
import { cn } from '@/lib/utils'
import { useTransportUi } from '@/state/transport-ui'

/**
 * Live record on/off (same state everywhere it appears). On while stopped:
 * the pattern starts after a one-bar metronome count-in. Notes you play
 * (keyboard / MIDI) go into the selected channel's Piano Roll, snapped to the
 * Piano Roll's snap, and are saved with the project.
 */
export function RecordToggle({ label = false, className }: { label?: boolean; className?: string }) {
  const recording = useTransportUi((s) => s.recording)
  return (
    <button
      aria-label={recording ? 'Stop recording' : 'Record'}
      aria-pressed={recording}
      title={
        recording
          ? 'Recording: notes you play go into the Piano Roll (click to stop)'
          : 'Record: notes you play go into the Piano Roll (starts with a 1-bar count-in when stopped)'
      }
      onClick={() => engine.setRecording(!recording)}
      className={cn(
        'flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-sm border transition-colors',
        label ? 'px-2' : 'w-7',
        recording ? 'border-inv bg-inv text-inv-ink' : 'border-line-strong text-ink hover:border-ink',
        className
      )}
    >
      <Circle size={11} fill={recording ? 'currentColor' : 'none'} strokeWidth={2.4} className={cn(recording && 'animate-pulse')} />
      {label && (recording ? 'Recording' : 'Rec')}
    </button>
  )
}
