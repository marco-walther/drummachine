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
| Anywhere (also in popouts) | **Space** play / stop · **F5** Playlist · **F6** Channel Rack · **F7** Piano Roll · **F8** Browser · **F9** Mixer |
| Panel tab bar | ⤢ maximize · ⧉ pop out into its own window (drag it to another monitor) |
| Popped-out window | 📌 keep on top · ⤓ dock back (or just close the window) |
| Top bar | **View** reopens closed panels · **Reset** → reset layout, or start from scratch (confirms first) |
| File | **Ctrl+N** new · **Ctrl+O** open · **Ctrl+S** save · **Ctrl+Shift+S** save as · **Ctrl+I** import samples/tracks · Open recent · Recover autosave |
| Browser | add folders, search · click = listen · double-click = new channel · drag onto the Channel Rack (new channel) or onto a channel (replace its sound) |
| Explorer | drag audio files straight onto the Channel Rack |
| Typing keyboard | plays the selected channel like a piano: white keys `A S D F G H J K L ; '`, black keys `W E T Y U O P ]`, **Z/X** octave (toggle with the keyboard button; Enter is never an action key while it's on) |
| ⏺ Record | arm, press play, and notes you play (keyboard or MIDI) are written into the pattern, snapped to 1/16 |
| Channel panel (⚙ on a channel) | choose Piano / Synth / Bass / Pad / Pluck, a drum, or your own sample; shape knobs; on-screen keyboard |
| Samples as instruments | in the Channel panel: **Detect** the root note, choose **Note length** playback, then play the sample at any pitch (e.g. a guitar note) |

Saving copies every sample a project uses into a `samples/` folder next to the `.dmproj` file, so a project folder can be moved or shared as a whole. Unsaved work is autosaved every minute (File → Recover autosave).
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
| 4 | Instruments (synth, keys, pluck, bass, pad, piano, your own multi-samples), MIDI input, computer-keyboard piano (piano layout: white keys `A S D F G H J K L ; '`, black keys `W E T Y U O P ]`, Z/X octave), Piano Roll (slides, ghost notes, per-note expression, riff tools) |
| 5 | Playlist (pattern/audio/automation clips, warping) |
| 6 | Mixer (inserts, routing, sends, sidechain, FX slots, visual patching) |
| 7 | Automation clips and internal controllers (LFO, peak) |
| 8 | Patcher, WAV export, Windows installer |

Your own samples and project files are git-ignored and are never committed.
