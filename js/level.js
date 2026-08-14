import { TILE, COLS, ROWS, PLAYER_W, PLAYER_H, OBSTACLE_W, OBSTACLE_H } from './config.js';

// ---------------------------------------------------------------------------
// Level is authored as an ASCII map (20 wide x 15 tall). Legend:
//   '#'  solid floor tile (floors are continuous & fully walkable)
//   'H'  vine / ladder — lives in the empty rows between two ADJACENT floors
//   'o'  fruit to collect (sits in the "body row" just above a floor)
//   'P'  player start — bottom-right of the board
//   'G'  goal / goni den — top-left; reach it (after all fruit) to clear
//   'S'  snake spawn (body row above the floor it patrols)
//   'R'  fast "red" snake spawn — only used from level 2 (see game.js)
//   'X'  obstacle — a static hazard on the floor to jump over
//   ' '  empty
//
// Stage flow: start bottom-right, work up-and-left collecting every fruit, then
// return to the den at the top-left to finish.
//
// Floors sit on rows 2, 5, 8, 11, 14 (three rows apart). A vine column joins a
// floor to the one directly above it, occupying the two empty rows between.
// The engine reads solid/vine tiles generically, so the layout is data-only —
// edit freely, just keep every row exactly 20 chars.
// ---------------------------------------------------------------------------
export const LEVEL_MAP = [
  "                    ",
  "G    o  o   o   o   ",
  "####################",
  "   H      H     H   ",
  "   H  o R H  o  H o ",
  "####################",
  "      H      H      ",
  " S o  H   o  H   o  ",
  "####################",
  "    H    H     H    ",
  " o  H  o H So  H  o ",
  "####################",
  "         HH     H   ",
  "   o So  HH    oH P ",
  "####################",
];

export class Level {
  constructor(map = LEVEL_MAP) {
    this.grid = map.map((row) => row.padEnd(COLS, ' ').slice(0, COLS).split(''));
    this.fruits = [];
    this.playerStart = { x: TILE, y: 0 };
    this.snakeStarts = [];
    this.redStarts = [];
    this.obstacles = [];
    this.goal = null;
    this.totalFruit = 0;
    // Floor rows are the fully-solid rows; the AI reasons in terms of these.
    this.floorRows = [];
    for (let r = 0; r < ROWS; r++) {
      if (this.grid[r].every((ch) => ch === '#')) this.floorRows.push(r);
    }
    this._scan();
  }

  _scan() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = this.grid[r][c];
        if (ch === 'o') {
          this.fruits.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, eaten: false });
          this.totalFruit++;
        } else if (ch === 'P') {
          // Feet rest on the floor tile directly below this body row.
          this.playerStart = {
            x: c * TILE + (TILE - PLAYER_W) / 2,
            y: (r + 1) * TILE - PLAYER_H,
          };
        } else if (ch === 'S') {
          this.snakeStarts.push({ col: c, row: r });
        } else if (ch === 'R') {
          this.redStarts.push({ col: c, row: r });
        } else if (ch === 'X') {
          const floorY = (r + 1) * TILE; // obstacle rests on the floor below its body row
          this.obstacles.push({
            col: c, row: r,
            x: c * TILE + (TILE - OBSTACLE_W) / 2,
            y: floorY - OBSTACLE_H,
            w: OBSTACLE_W, h: OBSTACLE_H,
            drawX: c * TILE + TILE / 2,
            feetY: floorY,
          });
        } else if (ch === 'G') {
          this.goal = { col: c, row: r, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
        }
      }
    }
  }

  // Cells that are not part of the terrain read as empty.
  solidAt(col, row) {
    if (row >= ROWS) return true; // invisible floor beneath the map
    if (col < 0 || col >= COLS || row < 0) return false;
    return this.grid[row][col] === '#';
  }

  vineAt(col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    return this.grid[row][col] === 'H';
  }

  // The floor row whose surface is closest to a given world-y (feet position).
  // Used by enemy AI to tell which floor the player is on/nearest to.
  nearestFloorRow(pixelY) {
    let best = this.floorRows[0];
    let bestD = Infinity;
    for (const r of this.floorRows) {
      const d = Math.abs(r * TILE - pixelY);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  reset() {
    for (const f of this.fruits) f.eaten = false;
  }

  get remainingFruit() {
    return this.fruits.reduce((n, f) => n + (f.eaten ? 0 : 1), 0);
  }
}

// ---------------------------------------------------------------------------
// Procedural per-stage layout. `LEVEL_MAP` above is the reference/fallback; the
// game builds each stage with `generateLevelMap(levelNum)` so vine positions and
// counts differ every stage. Seeded by the level number, so a given stage always
// generates the same layout. The generator preserves every invariant the engine
// relies on: fixed floors, vines spanning both rows of a gap, connectivity
// (each gap gets ≥2 vines and floors are fully walkable), a right-side vine near
// the bottom-right start, den top-left, and valid fruit/snake placement.
// ---------------------------------------------------------------------------
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateLevelMap(levelNum) {
  const rng = makeRng(levelNum * 2654435761);
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
  const FLOORS = [2, 5, 8, 11, 14];
  for (const r of FLOORS) for (let c = 0; c < COLS; c++) grid[r][c] = '#';

  // Each gap between adjacent floors occupies two empty rows; `body` is the row
  // just above the lower floor (where its fruit/snakes live, shared with a vine).
  const gaps = [
    { rows: [3, 4], body: 4 },
    { rows: [6, 7], body: 7 },
    { rows: [9, 10], body: 10 },
    { rows: [12, 13], body: 13 },
  ];

  const pickDistinct = (candidates, n) => {
    const pool = candidates.slice();
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    return out;
  };

  // A vine column is never reused by the gap directly above, so no ladder ever
  // stacks straight through a floor. Every vine ends at a floor — you step off
  // and walk to the next vine to keep climbing, so a middle floor is traversable.
  let prevCols = [];
  const vineCols = gaps.map((g, gi) => {
    const candidates = [];
    for (let c = 1; c <= 17; c++) if (!prevCols.includes(c)) candidates.push(c);
    const cols = pickDistinct(candidates, 2 + Math.floor(rng() * 2)); // 2 or 3 vines
    // Bottom gap: guarantee a vine in the right half, near the start tile.
    if (gi === gaps.length - 1 && !cols.some((c) => c >= 12)) {
      const right = [];
      for (let c = 12; c <= 17; c++) if (!cols.includes(c) && !prevCols.includes(c)) right.push(c);
      if (right.length) cols.push(right[Math.floor(rng() * right.length)]);
    }
    for (const c of cols) for (const r of g.rows) grid[r][c] = 'H';
    prevCols = cols;
    return cols;
  });

  grid[1][0] = 'G';   // den, top-left
  grid[13][18] = 'P'; // start, bottom-right

  const bodyToGap = { 4: 0, 7: 1, 10: 2, 13: 3 };
  const freeOn = (bodyRow, taken) => {
    const blocked = new Set(taken);
    const gi = bodyToGap[bodyRow];
    if (gi !== undefined) for (const c of vineCols[gi]) blocked.add(c);
    for (let c = 0; c < COLS; c++) if (grid[bodyRow][c] !== ' ') blocked.add(c);
    const out = [];
    for (let c = 0; c < COLS; c++) if (!blocked.has(c)) out.push(c);
    return out;
  };
  const draw = (cols, rng2) => cols[Math.floor(rng2() * cols.length)];

  // Snakes: three green (floors 8/11/14) + one red (floor 5). Keep the floor-14
  // snake on the left half, clear of the bottom-right spawn.
  const left14 = freeOn(13, [18, 19]).filter((c) => c <= 10);
  grid[13][left14.length ? draw(left14, rng) : draw(freeOn(13, [18, 19]), rng)] = 'S';
  grid[10][draw(freeOn(10, []), rng)] = 'S';
  grid[7][draw(freeOn(7, []), rng)] = 'S';
  grid[4][draw(freeOn(4, []), rng)] = 'R';

  // Fruit spread across the floors (16 total → den opens at 8).
  const perRow = { 1: 4, 4: 3, 7: 3, 10: 3, 13: 3 };
  for (const [rowStr, count] of Object.entries(perRow)) {
    const row = +rowStr;
    const free = freeOn(row, []);
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    for (const c of free.slice(0, count)) grid[row][c] = 'o';
  }

  // Obstacles to hop over — a few per stage, ramping up with the level. Keep them
  // clear of the board edges (need runway), the den corner, and the start tile.
  const obsCount = Math.min(6, 2 + Math.floor((levelNum - 1) / 2));
  const spots = [];
  for (const row of [1, 4, 7, 10, 13]) {
    for (const c of freeOn(row, [])) {
      if (c <= 1 || c >= 18) continue;          // need room on both sides
      if (row === 1 && c <= 3) continue;         // clear of the den
      if (row === 13 && c >= 13) continue;       // clear of the bottom-right start
      spots.push([row, c]);
    }
  }
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (const [row, c] of spots.slice(0, obsCount)) grid[row][c] = 'X';

  return grid.map((row) => row.join(''));
}
