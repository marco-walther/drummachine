import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dismissToast, useToasts } from '@/state/toasts'

/** Bottom-right status messages (saved, opened, errors). */
export function Toasts() {
  const items = useToasts((s) => s.items)
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'reveal pointer-events-auto flex items-start gap-2 border px-3 py-2 text-[12px] shadow-ink',
            t.kind === 'error' ? 'border-ink bg-raise text-ink' : 'border-line bg-inv text-inv-ink'
          )}
        >
          <span className="min-w-0 flex-1 leading-relaxed">{t.text}</span>
          <button aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="mt-0.5 opacity-60 hover:opacity-100">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
