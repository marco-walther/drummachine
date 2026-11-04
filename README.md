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
| Channel panel (⚙ on a channel) | choose Piano / Synth / Bass / Pad / Pluck, a drum, or your own sample; shape knobs; on-screen keyboard |
| Piano Roll (F7, or right-click a channel) | click = note (drag sets length), drag = move, drag right edge = resize, right-click/drag = delete, Ctrl+drag = box select; Delete, Ctrl+A, arrows (Shift = octave/bar). Toolbar: snap, chord stamp, slide notes, ghost notes, Tools (quantize, chop, strum, arpeggiate, legato, transpose). Bottom lane edits velocity / pan / fine pitch / cutoff per note |
| ⏺ Rec (top bar, Piano Roll, Channel panel) | live record on/off: notes you play on the keyboard/MIDI go into the selected channel's Piano Roll, snapped to the Piano Roll snap (None = exact) and saved with the project. Pressed while stopped, it starts the pattern after a one-bar metronome count-in; the metronome clicks while recording |
| Mixer (F9) | Master + inserts: fader (double-click = 0 dB), pan, mute, meters. Route a channel with its number in the Channel Rack or "Route … here". Selected insert: up to 10 effects (EQ, compressor, sidechain duck, filter, delay, reverb, distortion, limiter; click to edit, power = bypass), sends to other inserts and sidechain sends (loops are refused). **Routing** view: drag ports to connect (Shift = sidechain), right-click a cable to remove |
| PAT / SONG | top bar: PAT loops the current pattern, SONG plays the Playlist |
| Playlist (F5) | draw: click a track to place the current pattern; drag = move (across tracks), drag edges = resize/trim, scissors = slice, Ctrl+D duplicate, Delete; right-click a clip for options. Ruler: click = play from here, drag = loop region, right-click = clear loop. Drop audio from the Browser/Explorer to add audio clips |
| Audio clips | right-click: Resample (speed changes pitch) or Stretch (speed and pitch independent), stretch to fit the clip, speed ×2/×½, pitch ±1 / ±12 |
| Undo / redo | **Ctrl+Z** / **Ctrl+Y** (or Ctrl+Shift+Z); drags and knob turns count as one step |
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
