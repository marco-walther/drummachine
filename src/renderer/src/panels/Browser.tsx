import { useEffect, useMemo, useState } from 'react'
import {
  AudioLines,
  ChevronRight,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Search,
  X
} from 'lucide-react'
import { baseName, type DirEntry } from '@shared/api'
import { audition, useSampleStatus } from '@/audio/samples'
import { Brackets } from '@/components/ui/brackets'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { useLibrary } from '@/state/library'
import { useProject } from '@/state/project'
import { toast } from '@/state/toasts'
import { startSampleDrag } from '@/workspace/dnd'
import { addSampleChannels, importSamples } from '@/workspace/project-actions'

/**
 * Sample browser: your folders (lazy tree), search, and the samples used by the
 * current project. Click = listen, double-click = new channel, drag = drop on the
 * Channel Rack (new channel, or onto a channel to replace its sound).
 */

const dirCache = new Map<string, DirEntry[]>()

async function listDir(path: string, refresh = false): Promise<DirEntry[]> {
  if (!refresh && dirCache.has(path)) return dirCache.get(path)!
  const entries = await window.api.library.listDir(path)
  dirCache.set(path, entries)
  return entries
}

export function Browser() {
  const roots = useLibrary((s) => s.roots)
  const addRoots = useLibrary((s) => s.addRoots)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const onPick = (path: string) => {
    setSelected(path)
    audition(path).catch((e) => toast(`Can't play ${baseName(path, false)}: ${e?.message ?? e}`, 'error'))
  }

  const addFolders = async () => {
    const paths = await window.api.library.pickFolders()
    if (paths.length) addRoots(paths)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper text-[12px]">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <ToolButton label="Add sample folder" onClick={addFolders}>
          <FolderPlus size={14} />
        </ToolButton>
        <ToolButton label="Import files into the Channel Rack" onClick={() => void importSamples()}>
          <FilePlus2 size={14} />
        </ToolButton>
        <ToolButton
          label="Refresh folders"
          onClick={() => {
            dirCache.clear()
            setRefreshKey((k) => k + 1)
          }}
        >
          <RefreshCw size={13} />
        </ToolButton>
        <label className="ml-1 flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-sm border border-line bg-raise px-1.5 focus-within:border-ink">
          <Search size={12} className="shrink-0 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search samples"
            aria-label="Search samples"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-faint"
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery('')} className="text-faint hover:text-ink">
              <X size={12} />
            </button>
          )}
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1" key={refreshKey}>
        {query.trim().length >= 2 ? (
          <SearchResults query={query} roots={roots} selected={selected} onPick={onPick} />
        ) : (
          <>
            <ProjectSamples selected={selected} onPick={onPick} />
            {roots.map((r) => (
              <RootFolder key={r} path={r} selected={selected} onPick={onPick} />
            ))}
            {roots.length === 0 && <EmptyLibrary onAdd={addFolders} />}
          </>
        )}
      </div>
    </div>
  )
}

function ToolButton({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-6 shrink-0 place-items-center rounded-sm text-muted hover:bg-card hover:text-ink"
    >
      {children}
    </button>
  )
}

function EmptyLibrary({ onAdd }: { onAdd(): void }) {
  return (
    <div className="grid place-items-center px-4 py-8">
      <div className="bracket-frame w-full max-w-56">
        <Brackets />
        <div className="border border-line bg-raise px-4 py-4 text-center">
          <p className="text-ink">No sample folders yet</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Add a folder of samples, or drag audio files from Explorer onto the Channel Rack.
          </p>
          <button
            onClick={onAdd}
            className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-sm bg-inv px-3 text-inv-ink hover:opacity-90"
          >
            <FolderPlus size={13} /> Add folder
          </button>
        </div>
      </div>
    </div>
  )
}

interface RowProps {
  selected: string | null
  onPick(path: string): void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pt-2 pb-1 font-mono text-[10px] tracking-[0.12em] text-faint">{children}</div>
}

function ProjectSamples({ selected, onPick }: RowProps) {
  const samples = useProject((s) => s.samples)
  const channels = useProject((s) => s.channels)
  const status = useSampleStatus()
  const used = useMemo(() => {
    const ids = new Set(channels.flatMap((c) => (c.source.type === 'sample' ? [c.source.sampleId] : [])))
    return Object.values(samples).filter((s) => ids.has(s.id))
  }, [samples, channels])
  if (used.length === 0) return null
  return (
    <div className="mb-1">
      <SectionLabel>CURRENT PROJECT</SectionLabel>
      {used.map((s) => (
        <FileRow
          key={s.id}
          entry={{ name: s.name, path: s.path, dir: false }}
          depth={0}
          missing={status[s.id] === 'missing'}
          selected={selected}
          onPick={onPick}
        />
      ))}
    </div>
  )
}

function RootFolder({ path, selected, onPick }: { path: string } & RowProps) {
  const removeRoot = useLibrary((s) => s.removeRoot)
  return (
    <DirNode
      entry={{ name: baseName(path, false) || path, path, dir: true }}
      depth={0}
      root
      onRemove={() => removeRoot(path)}
      selected={selected}
      onPick={onPick}
    />
  )
}

function DirNode({
  entry,
  depth,
  root,
  onRemove,
  selected,
  onPick
}: { entry: DirEntry; depth: number; root?: boolean; onRemove?(): void } & RowProps) {
  const [open, setOpen] = useState(!!root)
  const [children, setChildren] = useState<DirEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || children) return
    listDir(entry.path)
      .then(setChildren)
      .catch(() => setError("Can't open this folder (moved or deleted?)"))
  }, [open, children, entry.path])

  return (
    <div>
      <div
        className="group flex h-6 cursor-default items-center gap-1 pr-2 hover:bg-card"
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => setOpen(!open)}
        title={entry.path}
      >
        <ChevronRight size={12} className={cn('shrink-0 text-faint transition-transform', open && 'rotate-90')} />
        {open ? <FolderOpen size={13} className="shrink-0 text-muted" /> : <Folder size={13} className="shrink-0 text-muted" />}
        <span className={cn('min-w-0 flex-1 truncate', root ? 'text-ink' : 'text-soft')}>{entry.name}</span>
        {onRemove && (
          <button
            aria-label={`Remove ${entry.name} from the browser`}
            title="Remove from browser (files are not deleted)"
            className="hidden size-5 place-items-center rounded-sm text-faint group-hover:grid hover:text-ink"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>
      {open && (
        <div>
          {error && (
            <div className="h-6 text-[11px] text-faint" style={{ paddingLeft: 8 + (depth + 1) * 12 + 17 }}>
              {error}
            </div>
          )}
          {children?.length === 0 && (
            <div className="h-6 text-[11px] text-faint" style={{ paddingLeft: 8 + (depth + 1) * 12 + 17 }}>
              No audio files
            </div>
          )}
          {children?.map((c) =>
            c.dir ? (
              <DirNode key={c.path} entry={c} depth={depth + 1} selected={selected} onPick={onPick} />
            ) : (
              <FileRow key={c.path} entry={c} depth={depth + 1} selected={selected} onPick={onPick} />
            )
          )}
        </div>
      )}
    </div>
  )
}

function FileRow({
  entry,
  depth,
  detail,
  missing,
  selected,
  onPick
}: { entry: DirEntry; depth: number; detail?: string; missing?: boolean } & RowProps) {
  const name = baseName(entry.name)
  const isSel = selected === entry.path
  const selectedChannelId = useProject((s) => s.selectedChannelId)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          draggable={!missing}
          onDragStart={(e) => startSampleDrag(e, [{ path: entry.path, name }])}
          onClick={() => !missing && onPick(entry.path)}
          onDoubleClick={() => !missing && addSampleChannels([{ path: entry.path, name }])}
          title={missing ? `Missing: ${entry.path}` : entry.path}
          className={cn(
            'flex h-6 cursor-default items-center gap-1.5 pr-2',
            isSel ? 'bg-inv text-inv-ink' : 'text-soft hover:bg-card hover:text-ink',
            missing && 'text-faint line-through'
          )}
          style={{ paddingLeft: 8 + depth * 12 + 13 }}
        >
          <AudioLines size={12} className={cn('shrink-0', isSel ? 'text-inv-ink' : 'text-faint')} />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          {detail && <span className={cn('truncate text-[10.5px]', isSel ? 'text-inv-ink/70' : 'text-faint')}>{detail}</span>}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={missing} onSelect={() => onPick(entry.path)}>
          Listen
        </ContextMenuItem>
        <ContextMenuItem disabled={missing} onSelect={() => addSampleChannels([{ path: entry.path, name }])}>
          Add to Channel Rack
        </ContextMenuItem>
        <ContextMenuItem
          disabled={missing || !selectedChannelId}
          onSelect={() => selectedChannelId && useProject.getState().setChannelSample(selectedChannelId, entry.path, name)}
        >
          Replace selected channel&apos;s sound
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => window.api.library.reveal(entry.path)}>Show in folder</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function SearchResults({ query, roots, selected, onPick }: { query: string; roots: string[] } & RowProps) {
  const [results, setResults] = useState<DirEntry[] | null>(null)
  useEffect(() => {
    let alive = true
    setResults(null)
    const t = setTimeout(() => {
      window.api.library
        .search(roots, query.trim())
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults([]))
    }, 220)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, roots])

  if (roots.length === 0) return <div className="px-3 py-2 text-faint">Add a folder to search it.</div>
  if (!results) return <div className="px-3 py-2 text-faint">Searching…</div>
  if (results.length === 0) return <div className="px-3 py-2 text-faint">No samples match “{query.trim()}”.</div>
  return (
    <div>
      <SectionLabel>{results.length >= 200 ? '200+ RESULTS' : `${results.length} RESULTS`}</SectionLabel>
      {results.map((r) => (
        <FileRow
          key={r.path}
          entry={r}
          depth={0}
          detail={baseName(r.path.slice(0, r.path.length - r.name.length - 1), false)}
          selected={selected}
          onPick={onPick}
        />
      ))}
    </div>
  )
}
