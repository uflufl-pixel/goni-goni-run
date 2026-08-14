import {
  TILE, COLS, CANVAS_W, SNAKE_W, SNAKE_H, SNAKE_SPEED, RED_SNAKE_SPEED_MULT,
} from './config.js';

// Snake: hunts the player across floors. A two-mode machine mirroring the
// player's own vine model:
//   - walk : move along a floor. If the player is on another floor, head for the
//            nearest vine that leads that way and climb it; otherwise chase the
//            player horizontally.
//   - climb: ride a vine to the adjacent floor, auto-landing at the far end.
// One floor is climbed per grab, so a snake pursues the player level by level.
//
// When `canClimb` is false (the default), the snake never climbs or chases — it
// just patrols its floor left/right, reversing at the walls. A `red` snake is an
// ordinary patroller that simply moves faster.
export class Snake {
  constructor(level, spawn, speedScale = 1, canClimb = false, red = false) {
    this.level = level;
    this.spawn = spawn;
    this.w = SNAKE_W;
    this.h = SNAKE_H;
    this.red = red;
    this.speed = SNAKE_SPEED * speedScale * (red ? RED_SNAKE_SPEED_MULT : 1);
    this.canClimb = canClimb;
    this.reset();
  }

  reset() {
    const { col, row } = this.spawn;
    this.x = col * TILE + (TILE - this.w) / 2;
    this.floorRow = row + 1; // solid floor directly beneath the body row
    this.y = this.floorRow * TILE - this.h;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.mode = 'walk';
    this.climbCol = -1;
    this.climbDir = 0;
    this.startFloorRow = -1;
    this.climbCooldown = 0; // brief walk after landing before it may climb again
  }

  update(dt, player) {
    if (this.mode === 'climb') this._climb(dt);
    else if (this.canClimb) this._hunt(dt, player);
    else this._patrol(dt);
    this.x = Math.max(0, Math.min(CANVAS_W - this.w, this.x));
  }

  // Level 1 behaviour: walk back and forth, bounce off the side walls.
  _patrol(dt) {
    this.x += this.dir * this.speed * dt;
    if (this.x <= 0) { this.x = 0; this.dir = 1; }
    else if (this.x >= CANVAS_W - this.w) { this.x = CANVAS_W - this.w; this.dir = -1; }
  }

  _hunt(dt, player) {
    if (this.climbCooldown > 0) this.climbCooldown -= dt;

    const cx = this.x + this.w / 2;
    const col = Math.floor(cx / TILE);
    const playerFloor = this.level.nearestFloorRow(player.y + player.h);

    // Which vertical direction closes on the player? -1 up, +1 down, 0 same.
    let want = 0;
    if (playerFloor < this.floorRow) want = -1;
    else if (playerFloor > this.floorRow) want = 1;

    if (want !== 0 && this.climbCooldown <= 0) {
      // Vines up from floor R live at row R-1; vines down at row R+1.
      const vineRow = want < 0 ? this.floorRow - 1 : this.floorRow + 1;
      const vineCol = this._nearestVineCol(vineRow, col);
      if (vineCol >= 0) {
        const targetCenter = vineCol * TILE + TILE / 2;
        if (Math.abs(cx - targetCenter) <= this.speed * dt + 1.5) {
          // Aligned with the vine: grab and start climbing.
          this.x = vineCol * TILE + (TILE - this.w) / 2;
          this.mode = 'climb';
          this.climbCol = vineCol;
          this.startFloorRow = this.floorRow;
          this.climbDir = want;
          return;
        }
        this.dir = cx < targetCenter ? 1 : -1;
        this.x += this.dir * this.speed * dt;
        return;
      }
    }

    // Same floor (or nowhere to climb): chase the player horizontally.
    const pcx = player.x + player.w / 2;
    if (Math.abs(pcx - cx) > 2) this.dir = pcx > cx ? 1 : -1;
    this.x += this.dir * this.speed * dt;
  }

  _climb(dt) {
    const col = this.climbCol;
    this.x = col * TILE + (TILE - this.w) / 2; // stay centered on the vine
    this.y += this.climbDir * this.speed * dt;

    const fr = Math.floor((this.y + this.h + 1) / TILE);
    if (this.level.solidAt(col, fr) && fr !== this.startFloorRow) {
      this.y = fr * TILE - this.h;
      this.floorRow = fr;
      this.mode = 'walk';
      this.climbCooldown = 0.25;
    }
  }

  // Nearest column carrying a vine on `row`, preferring ones close to `preferCol`.
  _nearestVineCol(row, preferCol) {
    let best = -1;
    let bestScore = Infinity;
    for (let c = 0; c < COLS; c++) {
      if (this.level.vineAt(c, row)) {
        const score = Math.abs(c - preferCol);
        if (score < bestScore) { bestScore = score; best = c; }
      }
    }
    return best;
  }

  get bounds() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}
