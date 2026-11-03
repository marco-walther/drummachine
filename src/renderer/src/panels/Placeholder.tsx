import { Brackets } from '@/components/ui/brackets'

/** Stand-in for panels that arrive in a later phase. */
export function Placeholder({ phase, title, text }: { phase: number; title: string; text: string }) {
  return (
    <div className="hatch grid h-full place-items-center p-6">
      <div className="bracket-frame">
        <Brackets />
        <div className="max-w-64 border border-line bg-paper px-6 py-5 text-center">
          <p className="font-mono text-[10.5px] tracking-[0.14em] text-faint">PHASE {phase}</p>
          <p className="mt-1 text-[13px] text-ink">{title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">{text}</p>
        </div>
      </div>
    </div>
  )
}
