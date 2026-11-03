import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface DragNumberProps {
  value: number
  onChange(value: number): void
  min: number
  max: number
  /** value change per pixel dragged (Shift = ÷10) */
  step?: number
  decimals?: number
  label: string
  format?(value: number): string
  className?: string
}

/** FL-style numeric field: drag vertically to change, double-click to type. */
export function DragNumber({
  value,
  onChange,
  min,
  max,
  step = 1,
  decimals = 0,
  label,
  format,
  className
}: DragNumberProps) {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const clampV = (v: number) => Math.min(max, Math.max(min, v))
  const round = (v: number) => Number(v.toFixed(decimals))
  const shown = format ? format(value) : value.toFixed(decimals)

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        defaultValue={value.toFixed(decimals)}
        className={cn(
          'w-14 rounded-sm border border-ink bg-raise px-1 text-center font-mono text-xs outline-none',
          className
        )}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          const v = parseFloat(e.currentTarget.value)
          if (!Number.isNaN(v)) onChange(round(clampV(v)))
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={`${label}: drag or double-click to type`}
      className={cn(
        'cursor-ns-resize touch-none rounded-sm border border-line bg-raise px-1.5 font-mono text-xs tabular-nums text-ink hover:border-line-strong',
        className
      )}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { y: e.clientY, v: value }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const px = drag.current.y - e.clientY
        onChange(round(clampV(drag.current.v + px * (e.shiftKey ? step / 10 : step))))
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => setEditing(true)}
    >
      {shown}
    </button>
  )
}
