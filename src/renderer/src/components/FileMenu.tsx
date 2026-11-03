import { useState } from 'react'
import type { AutosaveInfo } from '@shared/api'
import { baseName } from '@shared/api'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useProjectFile } from '@/state/file'
import { redo, undo } from '@/state/history'
import {
  importSamples,
  newProject,
  openProject,
  recoverAutosave,
  saveProject,
  saveProjectAs
} from '@/workspace/project-actions'

export function FileMenu({ className }: { className: string }) {
  const [recent, setRecent] = useState<string[]>([])
  const [autosave, setAutosave] = useState<AutosaveInfo | null>(null)

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return
        void window.api.project.recent().then(setRecent)
        void window.api.project.autosaveInfo().then(setAutosave)
      }}
    >
      <DropdownMenuTrigger asChild>
        <button className={className}>File</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuItem onSelect={() => void newProject()}>
          New project
          <DropdownMenuShortcut>Ctrl+N</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void openProject()}>
          Open…
          <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={recent.length === 0}>Open recent</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-72">
            {recent.map((p) => (
              <DropdownMenuItem key={p} onSelect={() => void openProject(p)} title={p}>
                <div className="min-w-0">
                  <div className="truncate">{baseName(p)}</div>
                  <div className="truncate text-[11px] text-muted">{p}</div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => undo()}>
          Undo
          <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => redo()}>
          Redo
          <DropdownMenuShortcut>Ctrl+Y</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void saveProject()}>
          Save
          <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void saveProjectAs()}>
          Save as…
          <DropdownMenuShortcut>Ctrl+Shift+S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void importSamples()}>
          Import samples or tracks…
          <DropdownMenuShortcut>Ctrl+I</DropdownMenuShortcut>
        </DropdownMenuItem>
        {autosave && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void recoverAutosave()}>
              <div className="min-w-0">
                <div>Recover autosave</div>
                <div className="truncate text-[11px] text-muted">
                  {autosave.name} · {new Date(autosave.savedAt).toLocaleString()}
                </div>
              </div>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** "Untitled •" in the top bar: project name + unsaved marker. */
export function ProjectName() {
  const { name, dirty, path } = useProjectFile()
  return (
    <span className="max-w-56 truncate text-[12px] text-muted" title={path ?? 'Not saved yet'}>
      {name}
      {dirty && <span aria-label="unsaved changes" title="Unsaved changes"> •</span>}
    </span>
  )
}
