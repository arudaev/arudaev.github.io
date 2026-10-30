# Webkeeper – the couch game, in the repo

The game on the couch's TV (design: [`design/couch-games/`](../../design/couch-games/README.md)). It started in
Claude Design (the Webkeeper Design System project, synced from here by `design/build-wk-bundle.sh` –
[DESIGN-SYSTEM.md](../../design/couch-games/DESIGN-SYSTEM.md)); since 27 October 2026 it's built here, where it can be
run, measured and fixed on real devices. The project's handback it came from is kept unchanged in
[`design/exports/2026-10-26-webkeeper-r2/`](../../design/exports/2026-10-26-webkeeper-r2/).

## Run it

- **On its own:** `npm run dev`, then <http://localhost:5173/webkeeper/index.html>.
- **On the couch:** <http://localhost:5173/#/couch> – Harold climbs aboard, the TV shows the title, and the
  first time he leans in by himself; `[ start ]` plays, full screen (after `sit back`, START on the TV leans
  him in again).
- **The puzzle lab:** <http://localhost:5173/webkeeper/index.html?lab>, or `puzzle lab` in the game's menu on its own page – four areas of test stations (the third: one cell per push, undo, streams that carry letters to their marks, words taken apart and crossed; the fourth: streams that sort two words, a wall that is the word rearranged, a row pushed in whole), the second
  one Bug the thief's
  ([04 – Puzzles](../../design/couch-games/04-PUZZLES.md)).
- **Debug panel:** `debug: on` in the game's menu on its own page (the device remembers it, so it stays on across
  a reload and the lab), or add `?debug` (on its own) or `?wkdebug` (on the couch, since `?debug` is Voyager's own
  debug mode; there Voyager's settings have `debug mode`). On a phone too: that's the point.

## What's here

| file | what it is |
| --- | --- |
| `index.html` | the page: loads the scripts below in order and starts the meadow |
| `lib/webkeeper.js` | the base: palette, the glyph atlas, `screen()` (a canvas in cells), the visible-page check |
| `lib/decisions.js` | the numbers decided in design: grid, motion rate, wind, the ring |
| `lib/brushes.js` | every brush: grass, flowers, water, stone, soil, light; the wind field |
| `lib/tree.js`, `lib/cast/*.js` | the trees, and the cast's sprites (Harold, Bug, Mishka, Malifex, the UNIClones, friends) |
| `lib/actors.js` | the cast baked into sprites |
| `lib/bear.js` | Mishka, as the sketch drew him: a small 3D bear in characters, humming |
| `lib/layers.js` | the nine layers, their baking and caching |
| `lib/place.js` | place files → layers (build in slices) |
| `lib/room.js` | one area's simulation: walking, the ring, words becoming things |
| `lib/marks.js` | every grass, flower and leaf mark drawn on the GPU (WebGL2), the wind in its vertex shader |
| `lib/world.js` | the meadow: areas joined at their edges, the camera, input, the title and menu, the frame loop |
| `lib/host.js` | the bridge to Voyager on the couch (messages, both ways – the list is at its top) |
| `lib/debug.js` | the debug panel (only loaded with `?debug` or the menu's `debug: on`) |
| (scenes) | a place's `scenes`: the book's scripts (`design/couch-games/book`), run by `lib/world.js` – lines, bubbles, waits, room events, thoughts in the sky, title cards |
| `lib/sound.js` | the sound, synthesized but for one sample: letters are notes (a pentatonic scale, so any order sounds right and a word is a tune), a word chimes when it becomes, the quack, Mishka's hum, Harold's theme on NES-style voices (two pulse waves, a triangle, noise); on the couch it follows Voyager's sound setting |
| `sounds/mew-1.wav`, `mew-2.wav` | Mishka's mews: the two mews in a real cat's recording, "Cat purr & meow" by Kerzoven on OpenGameArt (CC0), each cut out and crushed to 8 bits at 8 kHz (2 KB each) |
| `places/*.json` | the place files: `0.1-couch.json`, the prologue: the party round the TV (the couch, four beanbags and the snack table, framed as one picture); one per area of chapter 0 (0.2–0.7, and 0.6i, the room inside the yard's homepage: its door leads in, Bug's tunnel leads on to 0.7, the hermit's clearing), `lab.json` + `lab-2.json` + `lab-3.json` + `lab-4.json`, the puzzle lab (`lab-3` and `lab-4` have `"cells": true`: letters one cell per push, undo, unmaking, crossings, and `"streams"` that carry letters to their x's – lib/room.js); and `cast.json`, the cast at size in the world – a test place for the Webkeeper Design System's card (`cards/cast/world.html`), not loaded by the game |
| `fonts/vt323.woff2` | VT323 (SIL Open Font License), served from here so the game never waits on another site |

Plain scripts, each setting one global (`WK_WORLD`, `WK_BRUSH`, …) – how Claude Design wrote them. They're
served as they are, not bundled, and loaded only when Harold sits down, so the sea's own load doesn't grow.

## The debug panel

Everything it shows is measured on the device it runs on:

- **frames:** frames a second; each frame's bake and draw time (median, p90, worst over the last 4 s); a graph
  with the 60 and 30 a second lines; how many frames took over 33 ms
- **the world:** mode, clock, area, Harold's cell, the view in big cells, the zoom, device pixels, GPU marks or
  not, baked memory
- **the areas:** built or not, how long each took, the worst slice, and what's in it (trees, bushes, water,
  reeds, flowers, lamps, light pools, fireflies, the light) counted from its place file
- **the clock:** pause, one frame, ¼× to 4×
- **Harold:** to the start of any area (its name is a button; one not built yet is built first, then he goes)
- **overlays:** the big-cell grid, where Harold can walk (in rooms with streams, the cells a letter can't be left on in red), the area seams, Harold's box and cells – his feet's
  cells in green (two side by side: his sprite's width) (walls, pushes and exits are decided there, not by the sprite) and the grass his walk parts in grey
- **save:** a picture of the canvas; the whole report as JSON (copy or save) – send it with a bug
- **errors:** every error and warning as it happens

` (backquote) folds it away.

## The headless check

```bash
npm run build && npx vite preview --port 4173 &
node scripts/webkeeper-check.mjs --url http://localhost:4173            # the game on its own
node scripts/webkeeper-check.mjs --url http://localhost:4173 --couch    # through the couch
```

Six screen shapes (desk, very wide, phone and tablet both ways): the time to the title, a walk east of a few game
seconds, the debug panel's numbers, every console error, and a picture of each step, written to
`design/couch-games/checks/latest/` (`report.md`, `report.json`, `sheet.png`). It needs Playwright with its
Chromium (`npm i --no-save playwright`, or `PW=/path/to/node_modules/playwright`).

A shape fails – and the run exits with 1 – when a step times out, the page throws, or PLAY on a fresh night doesn't
start on the couch (0.1). CI (`.github/workflows/check.yml`, the `webkeeper` job) runs it on the phone shape for every
PR; software WebGL builds the desk-sized rooms too slowly there to wait for.

Headless Chromium draws WebGL in software, so its frame rate is a slow machine's, not a phone's: it catches
errors, broken flows and layout, and compares one change with the next. Speed is judged with the debug panel on
real devices.
