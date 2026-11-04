import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { cancelExport, exportLength, runExport, useExport, type ExportOptions } from '@/workspace/export'

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange(v: T): void }) {
  return (
    <div className="flex overflow-hidden rounded-sm border border-line text-[12px]">
      {options.map(([v, label]) => (
        <button key={String(v)} onClick={() => onChange(v)} className={cn('px-2.5 py-1', value === v ? 'bg-inv text-inv-ink' : 'text-muted hover:text-ink')}>
          {label}
        </button>
      ))}
    </div>
  )
}

/** Export options + the running export's progress. */
export function ExportDialog() {
  const { dialog, running, progress, label, options: o } = useExport()
  const set = (patch: Partial<ExportOptions>) => useExport.setState({ options: { ...o, ...patch } })
  const secs = exportLength(o)
  return (
    <>
      <AlertDialog open={dialog} onOpenChange={(open) => useExport.setState({ dialog: open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export audio</AlertDialogTitle>
            <AlertDialogDescription>
              Renders in real time through the mixer, so it sounds exactly like playback (about {Math.ceil(secs + o.tail)} s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-[90px_1fr] items-center gap-x-3 gap-y-3 text-[12px]">
            <span className="text-muted">What</span>
            <div className="flex items-center gap-2">
              <Seg value={o.what} options={[['song', 'Song (Playlist)'], ['pattern', 'Current pattern']]} onChange={(what) => set({ what })} />
              {o.what === 'pattern' && (
                <Seg value={o.loops} options={[[1, '×1'], [2, '×2'], [4, '×4']]} onChange={(loops) => set({ loops })} />
              )}
            </div>
            <span className="text-muted">Files</span>
            <Seg value={o.stems ? 1 : 0} options={[[0, 'Mix only'], [1, 'Mix + stems']]} onChange={(v) => set({ stems: v === 1 })} />
            <span className="text-muted">Format</span>
            <Seg value={o.bits} options={[[16, 'WAV 16-bit'], [24, 'WAV 24-bit']]} onChange={(bits) => set({ bits })} />
            <span className="text-muted">Tail</span>
            <Seg value={o.tail} options={[[0, 'None'], [2, '2 s'], [5, '5 s']]} onChange={(tail) => set({ tail })} />
          </div>
          {o.stems && <p className="text-[11px] leading-relaxed text-faint">Stems: one file per mixer insert that makes sound, post-fader.</p>}
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => useExport.setState({ dialog: false })}>
              Cancel
            </Button>
            <Button disabled={secs <= 0} onClick={() => void runExport(o)}>
              Export…
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {running && (
        <div className="fixed right-4 bottom-4 z-50 w-80 border border-line-strong bg-raise p-3 shadow-ink" role="status" aria-live="polite">
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="text-ink">Exporting</span>
            <button onClick={cancelExport} className="text-muted hover:text-ink">
              Cancel
            </button>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-ink transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-1.5 font-mono text-[10.5px] text-faint">{label}</p>
        </div>
      )}
    </>
  )
}
