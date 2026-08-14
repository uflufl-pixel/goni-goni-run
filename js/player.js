import {
  TILE, PLAYER_W, PLAYER_H, WALK_SPEED, CLIMB_SPEED,
  GRAVITY, MAX_FALL, CANVAS_W, CANVAS_H, JUMP_SPEED,
} from './config.js';

// The player (goni). Movement is a small state machine over two modes:
//   - grounded / falling  (walk left-right, gravity pulls down, land on floors)
//   - on ladder           (climb up/down a vine, passing through floors)
// A player standing over a vine with no floor support auto-grabs the vine so
// they hang instead of dropping.
export class Player {
  constructor(level) {
    this.level = level;
    this.w = PLAYER_W;
    this.h = PLAYER_H;
    this.reset();
  }

  reset() {
    this.x = this.level.playerStart.x;
    this.y = this.level.playerStart.y;
    this.vx = 0;
    this.vy = 0;
    this.onLadder = false;
    this.onGround = true;
    // While on a vine, feet are clamped between these two end-floor rows.
    this.climbTopFloor = 0;
    this.climbBotFloor = 0;
    this.jumpLatched = false; // require a fresh press per jump (no auto-bounce)
    this.jumped = false;      // set the frame a jump launches (for the sound)
    this.facing = 1; // 1 right, -1 left
  }

  update(dt, input) {
    const lv = this.level;
    const col = Math.floor((this.x + this.w / 2) / TILE);
    const feetRow = Math.floor((this.y + this.h + 1) / TILE);

    if (input.left) this.facing = -1;
    else if (input.right) this.facing = 1;

    // --- Try to grab a vine from a floor ----------------------------------
    if (!this.onLadder && this.onGround) {
      const R = feetRow; // the floor row under our feet
      if (input.up && lv.vineAt(col, R - 1)) this._grab(col, R, -1);
      else if (input.down && lv.vineAt(col, R + 1)) this._grab(col, R, +1);
    }

    if (this.onLadder) {
      this._climb(dt, input, col);
    } else {
      this._walk(dt, input, lv);
    }

    // Keep inside the play field.
    this.x = Math.max(0, Math.min(CANVAS_W - this.w, this.x));
    if (this.y < 0) { this.y = 0; this.vy = 0; }
    if (this.y > CANVAS_H - this.h) { this.y = CANVAS_H - this.h; this.vy = 0; }
  }

  _grab(col, floorRow, dir) {
    this.onLadder = true;
    this.onGround = false;
    this.vx = 0;
    this.vy = 0;
    // Center on the vine column.
    this.x = col * TILE + (TILE - this.w) / 2;
    // A vine links this floor to the adjacent one (floors are always 3 rows
    // apart). Remember both ends so climbing can never pass beyond them —
    // in particular it can't punch down through the bottom floor.
    const target = floorRow + dir * 3;
    this.climbTopFloor = Math.min(floorRow, target);
    this.climbBotFloor = Math.max(floorRow, target);
  }

  // Climbing along a vine; auto-lands when feet reach the floor at either end.
  _climb(dt, input, col) {
    // Snap horizontally onto the vine column.
    const targetX = col * TILE + (TILE - this.w) / 2;
    this.x += (targetX - this.x) * Math.min(1, dt * 22);

    this.vy = 0;
    if (input.up) this.vy = -CLIMB_SPEED;
    else if (input.down) this.vy = CLIMB_SPEED;
    this.y += this.vy * dt;

    // Feet stay within the vine's two end floors; touching an end lands there.
    const topY = this.climbTopFloor * TILE - this.h;
    const botY = this.climbBotFloor * TILE - this.h;
    if (this.y <= topY) { this.y = topY; this._land(); }
    else if (this.y >= botY) { this.y = botY; this._land(); }
  }

  _land() {
    this.vy = 0;
    this.onLadder = false;
    this.onGround = true;
  }

  // Walking on floors with gravity; lands on the solid floor beneath.
  _walk(dt, input, lv) {
    this.vx = (input.right ? WALK_SPEED : 0) - (input.left ? WALK_SPEED : 0);
    this.x += this.vx * dt;

    // Jump: an upward launch from the ground on a fresh press (air control keeps
    // horizontal movement, so you can hop forward over an obstacle).
    if (input.jump && this.onGround && !this.jumpLatched) {
      this.vy = -JUMP_SPEED;
      this.onGround = false;
      this.jumpLatched = true;
      this.jumped = true;
    }
    if (!input.jump) this.jumpLatched = false;

    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
    const oldBottom = this.y + this.h;
    this.y += this.vy * dt;
    const newBottom = this.y + this.h;

    this.onGround = false;
    if (this.vy >= 0) {
      const fr = Math.floor(newBottom / TILE);
      const nc = Math.floor((this.x + this.w / 2) / TILE);
      if (lv.solidAt(nc, fr)) {
        const floorTop = fr * TILE;
        if (oldBottom <= floorTop + 8 && newBottom >= floorTop) {
          this.y = floorTop - this.h;
          this.vy = 0;
          this.onGround = true;
        }
      }
    }
  }

  get bounds() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}
