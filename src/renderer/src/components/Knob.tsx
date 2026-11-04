import { useRef } from 'react'
import { ParamMenu } from '@/components/ParamMenu'
import { cn } from '@/lib/utils'

export interface KnobProps {
  value: number
  onChange(value: number): void
  min?: number
  max?: number
  /** double-click resets to this */
  defaultValue?: number
  /** arc grows from the center (pan, pitch) */
  bipolar?: boolean
  size?: number
  label: string
  format?(value: number): string
  className?: string
  /** automatable parameter: right-click offers automation clip / controller link */
  param?: string
}

const SWEEP = 135 // degrees each side of 12 o'clock

function polar(c: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180
  return [c + r * Math.cos(a), c + r * Math.sin(a)]
}

function arc(c: number, r: number, from: number, to: number): string {
  if (Math.abs(to - from) < 0.01) return ''
  const [a, b] = from < to ? [from, to] : [to, from]
  const [x1, y1] = polar(c, r, a)
  const [x2, y2] = polar(c, r, b)
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`
}

/** Drag up/down (Shift = fine), wheel, double-click to reset. */
export function Knob({
  value,
  onChange,
  min = 0,
  max = 1,
  defaultValue,
  bipolar = false,
  size = 22,
  label,
  format,
  className,
  param
}: KnobProps) {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const range = max - min
  const clampV = (v: number) => Math.min(max, Math.max(min, v))
  const norm = (value - min) / range
  const angle = -SWEEP + norm * SWEEP * 2
  const c = size / 2
  const r = c - 2.5
  const [px, py] = polar(c, r - 3, angle)
  const text = `${label}: ${format ? format(value) : value.toFixed(2)}`

  return (
    <ParamMenu param={param}>
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={text}
      tabIndex={0}
      className={cn('shrink-0 cursor-ns-resize touch-none text-ink outline-none', className)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { y: e.clientY, v: value }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const px = drag.current.y - e.clientY
        onChange(clampV(drag.current.v + (px * range) / (e.shiftKey ? 800 : 160)))
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
      onWheel={(e) => onChange(clampV(value - Math.sign(e.deltaY) * (range / (e.shiftKey ? 200 : 40))))}
      onKeyDown={(e) => {
        const stepSize = range / (e.shiftKey ? 200 : 40)
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clampV(value + stepSize))
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clampV(value - stepSize))
        else return
        e.preventDefault()
      }}
    >
      <title>{text}</title>
      <path d={arc(c, r, -SWEEP, SWEEP)} fill="none" stroke="var(--line-strong)" strokeWidth={2} strokeLinecap="round" />
      <path
        d={arc(c, r, bipolar ? 0 : -SWEEP, angle)}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <line x1={c} y1={c} x2={px} y2={py} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
    </ParamMenu>
  )
}
