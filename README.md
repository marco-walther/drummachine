# Drummachine

A pattern-based desktop beat maker (Electron + React + Web Audio). It is organized around a
Channel Rack, a Piano Roll, a Playlist and a Mixer, and any panel can be docked or popped out
into its own window.

## Develop

```bash
npm install
npm run dev        # launch the app with hot reload
npm run typecheck
npm run lint
npm test
npm run build
```

## Controls

| Where | Action |
| ----- | ------ |
| Anywhere | **Space** play / stop |
| BPM, mixer # | drag up/down (Shift = fine), double-click to type |
| Knobs | drag up/down (Shift = fine), wheel, double-click to reset |
| Step grid | click toggles, drag paints, right-click/drag erases |
| Channel LED | click mutes, right-click solos |
| Channel name | click selects + previews, double-click renames, drag to reorder, right-click for menu (fill, clear, delete…) |
| Pattern menu | new / clone / rename / delete; double-click the name to rename |

## Theme

All colors live in [`src/renderer/src/styles/theme.css`](src/renderer/src/styles/theme.css)
and are defined for light and dark mode. The base is monochrome. Active states use ink
inversion, and `--accent-user` is a spare hook for your own accent color. Motion utilities
(bracket hovers, routing cables, reveal) are in `styles/motion.css`.

## Roadmap

| Phase | Scope |
| ----- | ----- |
| 0 | Scaffold, theme tokens, CI |
| 1 | Audio engine, transport, Channel Rack / step sequencer |
| 2 | Dockable workspace and pop-out panels |
| 3 | Import your own samples/tracks, sample browser, save/load |
| 4 | Piano Roll (slides, ghost notes, per-note expression, riff tools) |
| 5 | Playlist (pattern/audio/automation clips, warping) |
| 6 | Mixer (inserts, routing, sends, sidechain, FX slots, visual patching) |
| 7 | Automation clips and internal controllers (LFO, peak) |
| 8 | Patcher, WAV export, Windows installer |

Your own samples and project files are git-ignored and are never committed.
