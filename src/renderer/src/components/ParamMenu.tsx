import { create } from 'zustand'
import { currentNorm, listParams, paramInfo } from '@/audio/params'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useProject } from '@/state/project'
import { toast } from '@/state/toasts'
import { useTransportUi } from '@/state/transport-ui'
import type { ParamRef } from '@/state/types'
import { showPanel } from '@/workspace/layout'

/** Which automation the Automation panel edits. */
export const useAutomationUi = create<{ editing: string | null }>(() => ({ editing: null }))

const BAR = 384

export function createAutomationFor(ref: ParamRef) {
  const state = useProject.getState()
  const info = paramInfo(state, ref)
  if (!info) return
  const start = Math.floor(useTransportUi.getState().songPosition / BAR) * BAR
  const id = state.createAutomation(ref, info.label, currentNorm(state, ref), start)
  useAutomationUi.setState({ editing: id })
  showPanel('automation')
  toast(`Automation clip for “${info.label}” added to the Playlist (plays in SONG mode)`)
}

/**
 * Right-click menu for anything automatable (knobs, faders): create an
 * automation clip or link a controller. `children` is the control itself.
 */
export function ParamMenu({ param, children }: { param?: ParamRef; children: React.ReactElement }) {
  const controllers = useProject((s) => s.controllers)
  if (!param) return children
  const st = useProject.getState()
  const link = (id: string) => {
    st.linkController(id, param)
    showPanel('controllers')
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ContextMenuLabel className="truncate text-[11px] font-normal text-muted">{paramInfo(st, param)?.label}</ContextMenuLabel>
        <ContextMenuItem onSelect={() => createAutomationFor(param)}>Create automation clip</ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Link to controller</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {controllers.map((c) => (
              <ContextMenuItem key={c.id} onSelect={() => link(c.id)}>
                {c.name}
                {c.targets.includes(param) ? ' ✓' : ''}
              </ContextMenuItem>
            ))}
            {controllers.length > 0 && <ContextMenuSeparator />}
            <ContextMenuItem onSelect={() => link(st.addController('lfo'))}>New LFO controller</ContextMenuItem>
            <ContextMenuItem onSelect={() => link(st.addController('peak'))}>New Peak controller</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Dropdown listing every automatable parameter, grouped. */
export function ParamPicker({ label, exclude = [], onPick }: { label: string; exclude?: ParamRef[]; onPick(ref: ParamRef): void }) {
  const channels = useProject((s) => s.channels)
  const mixer = useProject((s) => s.mixer)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-6 items-center gap-1 rounded-sm border border-line px-2 text-[11.5px] text-muted hover:border-ink hover:text-ink">{label}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 w-72 overflow-y-auto">
        {(() => {
          const params = listParams({ channels, mixer }).filter((p) => !exclude.includes(p.ref))
          const groups = [...new Set(params.map((p) => p.group))]
          return groups.map((g) => (
            <div key={g}>
              <DropdownMenuLabel className="text-[10.5px] font-normal text-faint">{g}</DropdownMenuLabel>
              {params
                .filter((p) => p.group === g)
                .map((p) => (
                  <DropdownMenuItem key={p.ref} onSelect={() => onPick(p.ref)}>
                    {p.label.startsWith(g) ? p.label.slice(g.length).trim() : p.label}
                  </DropdownMenuItem>
                ))}
            </div>
          ))
        })()}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
