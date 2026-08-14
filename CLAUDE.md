# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**달려라 고니고니** — a browser arcade game whose hero is a crowned goni (swan,
`image/goni.png`), built on the mechanics of the classic **너구리 (Ponpoko,
1982)**: the goni starts at the bottom-right, climbs between horizontal floors on
vines collecting fruit while avoiding snakes, then — once at least half the fruit
is gathered — returns to the den at the top-left to clear the stage. Pure **HTML5
Canvas + vanilla JavaScript (ES modules)** — no framework, no build step, no
dependencies.

## Running

ES modules require serving over HTTP (opening `index.html` via `file://` fails
because module imports are blocked). Start any static server from the repo root:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173/`. A `.claude/launch.json` is wired for the
Claude Code preview browser (`preview_start` with name `study-game`).

There are no tests, linter, or package manager configured — it is intentionally
zero-toolchain.

## Controls

Handled in `js/input.js` (arrows + WASD, plus a few action keys):

| Key | Action |
| --- | --- |
| ← → / A D | Walk left/right |
| ↑ ↓ / W S | Climb a vine up/down |
| Space / Z / X | Jump (Space also confirms on menus) |
| Enter | Confirm — start, retry, skip win delay |
| M | Toggle mute |

## Architecture

The engine is **pixel-based**; the grid only defines terrain. Update flow each
frame (`Game._frame` → `update` → `render`):

- **`js/config.js`** — all tuning constants (tile size, speeds, gravity, points).
  `TILE = 32`, grid is `COLS×ROWS = 20×15` → 640×480 canvas.
- **`js/level.js`** — `Level` parses the `LEVEL_MAP` ASCII grid into terrain +
  entity spawns. This is the single source of truth for layout; edit the ASCII,
  not the physics. `solidAt(col,row)` / `vineAt(col,row)` are the queries the
  physics runs against.
- **`js/player.js`** — the goni (player). A two-mode state machine: `_walk` (gravity +
  land on floor beneath, plus a small `JUMP_SPEED` hop with a fresh-press latch
  and air control) and `_climb` (move along a vine, auto-land on the floor at
  either end). Grabs a vine only from the ground via `_grab`.
- **`js/enemy.js`** — `Snake`. By default it just `_patrol`s its floor left/right,
  bouncing at the walls (no climbing). A `red` snake is an ordinary patroller that
  moves `RED_SNAKE_SPEED_MULT`× faster (rendered with a red tint in `drawSnakes`).
  Vine-climbing pursuit (`_hunt`/`_climb`, gated by `canClimb`, reusing the
  player's `nearestFloorRow` + `startFloorRow` model) still exists but is a
  **dormant capability** — nothing enables it right now. (That snake code keeps
  its own `startFloorRow`; the player no longer uses one.)
- **`js/game.js`** — owns state (`ready`/`playing`/`dead`/`gameover`/`win`),
  score/lives/level, the rAF loop, AABB collision (fruit + snakes), HUD sync,
  overlays, and all canvas drawing. Two flow details live here: the **den/goal**
  (`level.goal`, authored `G`) opens (`goalOpen`) once at least
  `GOAL_FRUIT_FRACTION` of the fruit is collected (half, not all; the HUD shows an
  `eaten/needed` counter), and reaching it clears the stage — the `win` state then
  auto-advances to the next level after `WIN_DELAY` (`winTimer`), or Enter skips
  the wait via
  `onConfirm`. A **spawn/respawn grace** (`graceTimer`, `START_GRACE`) freezes
  snakes so the player can leave the start tile — the "준비!" cue is drawn while
  it counts down.
- **`js/input.js`** — keyboard tracker; arrows + WASD move/climb, Space/Z/X →
  jump (Space also confirms on menus), Enter → confirm, `M` → mute (via
  `onConfirm` / `onMute` callbacks). On-screen touch controls (jump button + a
  d-pad, shown on coarse-pointer/narrow screens) set the same flags — wired in
  `Game._setupTouch` via pointer events.
- **`js/sprites.js`** — `Sprite`: loads a character image (`image/goni.png` for
  the player, `image/crab.png` for the enemies) and strips its near-white studio
  background to transparency at load time via a border flood-fill (keeps the warm
  body + interior details; a no-op on already-transparent PNGs), then auto-crops.
  Used instead of emoji so characters look identical on every system; `drawPlayer`
  / `drawSnakes` fall back to the 🦢 / 🐍 emoji until the image is ready. `facing`
  records which way the art points so it can flip to face travel.
- **`js/audio.js`** — `Sound`: retro SFX synthesized with the Web Audio API (no
  asset files). The `AudioContext` is created/resumed on the first user gesture
  (`start()`), per autoplay rules; `fruit`/`grab`/`denOpen`/`start`/`win`/`die`/
  `gameover` are short oscillator blips, and `toggleMute` gates them. `Game`
  fires these at the matching events and owns the 🔊/🔇 button.
- **`js/main.js`** — boots `Game`, exposes it as `window.__game` for debugging.

### The terrain / vine model (important)

This is the crux and where the physics correctness lives. Floors are on rows
**2, 5, 8, 11, 14** (three rows apart) and are **fully solid and walkable** —
there are no gaps in a floor. A vine (`H`) lives only in the **two empty rows
between two adjacent floors** and joins them.

- The player's body occupies the row *directly above* the floor it stands on
  (the "body row"). Fruit (`o`), player (`P`), and snakes (`S`) are authored in
  body rows.
- **Climb up**: standing on floor row `R`, a vine at `R-1` is grabbable → climbs
  to the floor at `R-3`.
- **Climb down**: a vine at `R+1` is grabbable → passes down through the floor
  and lands on `R+3`. Holding down through stacked vine columns (e.g. col 9/10)
  chains through multiple floors — this is intended.
- On grab, `_grab` records the vine's two end-floor rows (`climbTopFloor` /
  `climbBotFloor`); `_climb` clamps the feet between them, so a climb can never
  pass beyond either end — notably it can't punch **down through the bottom
  floor** into the void (the old `startFloorRow` guard could, stranding the
  goni below row 14).

Each stage's layout is **procedurally generated** by `generateLevelMap(levelNum)`
(seeded by the level number, so a stage is reproducible but every stage differs):
it randomizes vine columns/counts per gap while preserving the invariants —
2–3 vines per gap (so floors stay connected), **no column reused by the gap
directly above** (vines never stack straight through a floor, so every climb ends
at a floor you can step off and walk on), a right-side bottom vine near the start,
den top-left / start bottom-right, and valid fruit/snake placement. It
also scatters a few **obstacles** (`X`, ramping with `levelNum`) — static floor
hazards the player must jump over; touching one costs a life (`checkObstacles`),
their short collision box (`OBSTACLE_W`/`H`) gives a forgiving hop window. `Game`
rebuilds the `Level` from a fresh map each stage via `_buildLevel()`. `LEVEL_MAP`
remains as a hand-authored reference/fallback (the `Level` default).

When editing `LEVEL_MAP` (or the generator): **every row must be exactly 20 chars**,
vines must occupy both empty rows between the floors they connect, and fruit/spawns
go in body rows on solid columns. `Level.totalFruit` and win detection derive from
the `o` count, so a level stays completable as long as the vine graph is connected.

## Known constraints / extension points

- The requestAnimationFrame loop and keyboard input only run when the browser
  tab is focused (normal browser throttling). For automated/headless testing,
  drive the sim directly: `window.__game.update(1/60)` with `__game.input.*`
  flags set, and call `__game.render()` to repaint.
- Snake pursuit picks the vine nearest the snake heading toward the player's
  floor; it does not path-plan around the whole level. A `climbCooldown` makes it
  walk briefly after landing so it stays beatable — tune in `enemy.js`.
- Difficulty scales via `_spawnSnakes` (`levelNum`): every snake's patrol speed
  ramps each level, and from `RED_SNAKE_FROM_LEVEL` a fast red snake (authored `R`,
  parsed into `level.redStarts`) joins. Stage layouts differ every level —
  `generateLevelMap` produces a fresh vine arrangement per stage (see the vine
  model section).
