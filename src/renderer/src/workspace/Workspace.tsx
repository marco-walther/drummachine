import { useEffect, useReducer, useState } from 'react'
import {
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelProps
} from 'dockview-react'
import { ArrowDownToLine, Maximize2, Minimize2, PictureInPicture2, Pin, PinOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Browser } from '@/panels/Browser'
import { ChannelRack } from '@/panels/ChannelRack'
import { ChannelSettings } from '@/panels/ChannelSettings'
import { PianoRoll } from '@/panels/piano-roll/PianoRoll'
import { Playlist } from '@/panels/playlist/Playlist'
import { Placeholder } from '@/panels/Placeholder'
import { dockBack, popOut, restoreLayout, scheduleSave, useWorkspace, type PanelId } from './layout'
import { registerWindow } from './windows'

const themeInk: DockviewTheme = { name: 'ink', className: 'dockview-theme-ink' }

const components: Record<PanelId, React.FunctionComponent<IDockviewPanelProps>> = {
  channelRack: () => <ChannelRack />,
  pianoRoll: () => <PianoRoll />,
  playlist: () => <Playlist />,
  browser: () => <Browser />,
  channel: () => <ChannelSettings />,
  mixer: () => <Placeholder phase={6} title="Mixer" text="Inserts, routing cables, sends, sidechain and effect slots." />
}

const unregister = new Map<Window, () => void>()

function onReady({ api }: DockviewReadyEvent) {
  useWorkspace.setState({ api })

  // Popouts: give each new window our theme, shortcuts and listeners.
  api.onDidAddPopoutGroup(({ window: win, group }) => {
    unregister.set(win, registerWindow(win))
    win.document.title = `${group.panels.map((p) => p.title).join(' · ')} · Drummachine`
  })
  api.onDidRemovePopoutGroup(({ window: win }) => {
    unregister.get(win)?.()
    unregister.delete(win)
  })
  api.onDidOpenPopoutWindowFail((failure) => console.warn('Popout failed:', failure))

  restoreLayout(api)
  api.onDidLayoutChange(() => scheduleSave())
}

export function Workspace() {
  return (
    <DockviewReact
      className="h-full"
      components={components}
      theme={themeInk}
      onReady={onReady}
      rightHeaderActionsComponent={HeaderActions}
    />
  )
}

function IconButton({
  label,
  onClick,
  active,
  children
}: {
  label: string
  onClick(): void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'grid size-6 place-items-center rounded-sm transition-colors',
        active ? 'bg-inv text-inv-ink' : 'text-muted hover:bg-line hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}

/** Right side of every tab strip: maximize + pop out (grid) or pin + dock back (popout). */
function HeaderActions({ group, containerApi, location }: IDockviewHeaderActionsProps) {
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const [onTop, setOnTop] = useState(false)

  useEffect(() => {
    const a = containerApi.onDidMaximizedGroupChange(rerender)
    const b = group.api.onDidLocationChange(rerender)
    return () => {
      a.dispose()
      b.dispose()
    }
  }, [containerApi, group])

  const loc = location ?? group.api.location

  if (loc.type === 'popout') {
    return (
      <div className="flex h-full items-center gap-0.5 px-1.5">
        <IconButton
          label={onTop ? 'Stop keeping on top' : 'Keep on top of other windows'}
          active={onTop}
          onClick={() => {
            const next = !onTop
            window.api.setPopoutOnTop(loc.getWindow().name, next)
            setOnTop(next)
          }}
        >
          {onTop ? <PinOff size={13} /> : <Pin size={13} />}
        </IconButton>
        <IconButton label="Dock back into main window" onClick={() => dockBack(group)}>
          <ArrowDownToLine size={13} />
        </IconButton>
      </div>
    )
  }

  const maximized = group.api.isMaximized()
  return (
    <div className="flex h-full items-center gap-0.5 px-1.5">
      {loc.type === 'grid' && (
        <IconButton
          label={maximized ? 'Restore' : 'Maximize'}
          onClick={() => (maximized ? group.api.exitMaximized() : group.api.maximize())}
        >
          {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </IconButton>
      )}
      <IconButton label="Pop out into its own window" onClick={() => popOut(group)}>
        <PictureInPicture2 size={13} />
      </IconButton>
    </div>
  )
}
