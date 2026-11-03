import { useEffect, useRef } from 'react'
import { useHeldKeys } from '@/audio/engine'
import { OFFSET_LABELS, noteName } from '@/input/notes'
import { cn } from '@/lib/utils'
import { addGlobalListener } from '@/workspace/windows'

const BLACK = new Set([1, 3, 6, 8, 10])
/** left offset of each black key, in white-key widths, within an octave */
const BLACK_POS: Record<number, number> = { 1: 0.65, 3: 1.75, 6: 3.6, 8: 4.68, 10: 5.75 }

interface Props {
  /** first key (should be a C) */
  from: number
  octaves: number
  onDown(key: number): void
  onUp(key: number): void
  /** octave whose keys show the typing-keyboard labels (A W S E D …) */
  typingOctave?: number
  className?: string
}

/** Clickable keyboard; slide across keys while pressed (glissando). */
export function PianoKeyboard({ from, octaves, onDown, onUp, typingOctave, className }: Props) {
  const held = useHeldKeys((s) => s.keys)
  const pressed = useRef<number | null>(null)

  useEffect(
    () =>
      addGlobalListener('pointerup', () => {
        if (pressed.current !== null) onUp(pressed.current)
        pressed.current = null
      }),
    [onUp]
  )

  const keys = Array.from({ length: octaves * 12 + 1 }, (_, i) => from + i)
  const whites = keys.filter((k) => !BLACK.has(k % 12))
  const whiteW = 100 / whites.length

  const handlers = (key: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      pressed.current = key
      onDown(key)
    },
    onPointerEnter: (e: React.PointerEvent) => {
      if (pressed.current === null || e.buttons === 0 || pressed.current === key) return
      onUp(pressed.current)
      pressed.current = key
      onDown(key)
    }
  })

  /** which computer key plays this note (piano layout spans 1½ octaves) */
  const label = (key: number) => {
    if (typingOctave === undefined) return null
    return OFFSET_LABELS[key - typingOctave * 12] ?? null
  }

  return (
    <div className={cn('relative h-24 touch-none select-none', className)} role="group" aria-label="Keyboard">
      {whites.map((k, i) => (
        <button
          key={k}
          aria-label={noteName(k)}
          {...handlers(k)}
          className={cn(
            'absolute top-0 bottom-0 flex flex-col items-center justify-end gap-0.5 rounded-b-[3px] border border-line-strong pb-1 text-[9.5px] transition-colors duration-75',
            // white keys stay light in both themes (a piano is a piano); held = mid grey
            held.includes(k)
              ? 'bg-muted text-paper'
              : 'bg-raise text-faint hover:bg-card dark:bg-soft dark:text-line-strong dark:hover:bg-faint'
          )}
          style={{ left: `${i * whiteW}%`, width: `${whiteW}%` }}
        >
          {label(k) && <span className="font-mono">{label(k)}</span>}
          {k % 12 === 0 && <span>{noteName(k)}</span>}
        </button>
      ))}
      {keys
        .filter((k) => BLACK.has(k % 12))
        .map((k) => {
          const octaveIdx = Math.floor((k - from) / 12)
          const left = (octaveIdx * 7 + BLACK_POS[k % 12]) * whiteW
          return (
            <button
              key={k}
              aria-label={noteName(k)}
              {...handlers(k)}
              className={cn(
                'absolute top-0 z-10 flex h-[60%] items-end justify-center rounded-b-[3px] border pb-1 text-[9px] transition-colors duration-75',
                held.includes(k)
                  ? 'border-muted bg-muted text-paper'
                  : 'border-inv bg-inv text-inv-ink/60 hover:opacity-85 dark:border-line-strong dark:bg-page dark:text-muted'
              )}
              style={{ left: `${left}%`, width: `${whiteW * 0.62}%` }}
            >
              {label(k) && <span className="font-mono">{label(k)}</span>}
            </button>
          )
        })}
    </div>
  )
}
