import {
  TILE, COLS, ROWS, CANVAS_W, CANVAS_H, START_LIVES,
  FRUIT_POINTS, CLEAR_BONUS, START_GRACE, WIN_DELAY, RED_SNAKE_FROM_LEVEL,
  GOAL_FRUIT_FRACTION,
} from './config.js';
import { Level, generateLevelMap } from './level.js';
import { Player } from './player.js';
import { Snake } from './enemy.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Sprite } from './sprites.js';

// Game states: 'ready' (menu), 'playing', 'dead' (brief pause), 'gameover', 'win'
export class Game {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    this.input = new Input();
    this.sound = new Sound();
    this.snakes = [];

    // The player is a custom goni sprite (the artwork faces left).
    this.playerSprite = new Sprite('image/goni.png', { facing: -1 });
    // Enemies ("snakes") are a custom crab sprite (front view, ~symmetric).
    this.snakeSprite = new Sprite('image/crab.png', { facing: 1 });

    this.state = 'ready';
    this.score = 0;
    this.lives = START_LIVES;
    this.levelNum = 1;
    this.deathTimer = 0;
    this.graceTimer = 0;   // snakes frozen while > 0 (spawn/respawn grace)
    this.winTimer = 0;     // countdown to auto-advance after reaching the den
    this.goalOpen = false; // den opens once every fruit is collected

    this.el = {
      score: document.getElementById('score'),
      fruit: document.getElementById('fruit'),
      level: document.getElementById('level'),
      lives: document.getElementById('lives'),
      msg: document.getElementById('msg'),
      overlay: document.getElementById('overlay'),
      panel: document.querySelector('#overlay .panel'),
      startBtn: document.getElementById('startBtn'),
      mute: document.getElementById('mute'),
    };

    this.input.onConfirm(() => this.onConfirm());
    this.input.onMute(() => this.toggleMute());
    this.el.startBtn.addEventListener('click', () => this.onConfirm());
    this.el.mute.addEventListener('click', () => this.toggleMute());
    this._setupTouch();

    this._buildLevel();
    this.syncHud();
    this._last = performance.now();
    requestAnimationFrame(this._frame);
  }

  // Build a fresh procedurally-generated layout for the current level.
  _buildLevel() {
    this.level = new Level(generateLevelMap(this.levelNum));
    this.player = new Player(this.level);
    this._spawnSnakes();
  }

  _spawnSnakes() {
    const scale = 1 + (this.levelNum - 1) * 0.18;
    // All snakes patrol horizontally (no vine climbing).
    const snakes = this.level.snakeStarts.map((s) => new Snake(this.level, s, scale));
    // From level 2, add the fast red snake(s) for difficulty.
    if (this.levelNum >= RED_SNAKE_FROM_LEVEL) {
      for (const r of this.level.redStarts) {
        snakes.push(new Snake(this.level, r, scale, false, true));
      }
    }
    this.snakes = snakes;
  }

  onConfirm() {
    if (this.state === 'ready') this.start();
    else if (this.state === 'win') this.nextLevel(); // skip the auto-advance wait
    else if (this.state === 'gameover') this.restart();
  }

  start() {
    this.state = 'playing';
    this.graceTimer = START_GRACE;
    this.hideOverlay();
    this.el.msg.textContent = '';
    this.sound.resume(); // first user gesture — unlock audio
    this.sound.start();
  }

  toggleMute() {
    this.sound.resume();
    const muted = this.sound.toggleMute();
    this.el.mute.textContent = muted ? '🔇' : '🔊';
  }

  // Wire the on-screen touch controls to the same input flags as the keyboard.
  // Pointer events cover both touch and mouse; the jump latch handles single hops.
  _setupTouch() {
    const hold = (el, on, off) => {
      if (!el) return;
      const start = (e) => { e.preventDefault(); this.sound.resume(); on(); };
      const stop = (e) => { e.preventDefault(); off(); };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', stop);
      el.addEventListener('pointerleave', stop);
      el.addEventListener('pointercancel', stop);
    };
    document.querySelectorAll('.tc-dbtn').forEach((el) => {
      const dir = el.dataset.dir;
      hold(el, () => { this.input[dir] = true; }, () => { this.input[dir] = false; });
    });
    hold(document.getElementById('btn-jump'),
      () => { this.input.jump = true; },
      () => { this.input.jump = false; });
  }

  restart() {
    this.score = 0;
    this.lives = START_LIVES;
    this.levelNum = 1;
    this.loadLevel();
    this.start();
  }

  loadLevel() {
    this._buildLevel();
    this.goalOpen = false;
    this.el.msg.textContent = '';
    this.syncHud();
  }

  nextLevel() {
    this.levelNum++;
    this.score += CLEAR_BONUS;
    this.loadLevel();
    this.hideOverlay();
    this.graceTimer = START_GRACE;
    this.state = 'playing';
    this.el.msg.textContent = '';
  }

  loseLife() {
    this.lives--;
    this.syncHud();
    this.sound.die();
    if (this.lives <= 0) {
      this.state = 'gameover';
      this.sound.gameover();
      this.showOverlay('게임 오버', `점수 ${this.score}`, '다시 하기 (Enter)');
    } else {
      this.state = 'dead';
      this.deathTimer = 0.9;
    }
  }

  // --- Main loop ------------------------------------------------------------
  _frame = (now) => {
    const dt = Math.min((now - this._last) / 1000, 1 / 30); // clamp big gaps
    this._last = now;
    this.update(dt);
    this.render();
    requestAnimationFrame(this._frame);
  };

  update(dt) {
    if (this.state === 'win') {
      this.winTimer -= dt;
      if (this.winTimer <= 0) this.nextLevel();
      return;
    }
    if (this.state === 'dead') {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        this.player.reset();
        for (const s of this.snakes) s.reset();
        this.graceTimer = START_GRACE; // breathing room on respawn too
        this.state = 'playing';
      }
      return;
    }
    if (this.state !== 'playing') return;

    if (this.graceTimer > 0) this.graceTimer -= dt;
    const grace = this.graceTimer > 0;

    const wasOnLadder = this.player.onLadder;
    this.player.update(dt, this.input);
    if (!wasOnLadder && this.player.onLadder) this.sound.grab();
    if (this.player.jumped) { this.player.jumped = false; this.sound.jump(); }
    if (!grace) for (const s of this.snakes) s.update(dt, this.player);

    this.collectFruit();
    if (!grace) {
      this.checkSnakes();
      if (this.state === 'playing') this.checkObstacles();
    }
    if (this.state !== 'playing') return; // a hazard may have ended the frame

    // Half the fruit eaten → the den at the top-left opens; return there to clear.
    if (!this.goalOpen && this._fruitGoalReached()) {
      this.goalOpen = true;
      this.el.msg.textContent = '🌾 좌측 상단 갈대숲으로 들어가세요!';
      this.sound.denOpen();
    }
    if (this.goalOpen && this._atGoal()) {
      this.state = 'win';
      this.winTimer = WIN_DELAY; // auto-advance to the next stage
      this.el.msg.textContent = '';
      this.sound.win();
      this.showOverlay('스테이지 클리어! 🎉', `+${CLEAR_BONUS} 보너스 · 다음 스테이지로…`, '다음 레벨 (Enter)');
    }
  }

  _atGoal() {
    const g = this.level.goal;
    if (!g) return false;
    const p = this.player.bounds;
    // The den sits in the top-left corner, so pushing into the wall lands the
    // goni squarely on its tile — a simple tile overlap is exact here.
    const gx = g.col * TILE, gy = g.row * TILE;
    return p.x < gx + TILE && p.x + p.w > gx && p.y < gy + TILE && p.y + p.h > gy;
  }

  // How many fruit must be collected before the den opens (half, rounded up).
  _fruitNeeded() {
    return Math.ceil(this.level.totalFruit * GOAL_FRUIT_FRACTION);
  }

  _fruitEaten() {
    return this.level.totalFruit - this.level.remainingFruit;
  }

  _fruitGoalReached() {
    return this._fruitEaten() >= this._fruitNeeded();
  }

  collectFruit() {
    const p = this.player.bounds;
    for (const f of this.level.fruits) {
      if (f.eaten) continue;
      if (f.x > p.x && f.x < p.x + p.w && f.y > p.y && f.y < p.y + p.h) {
        f.eaten = true;
        this.score += FRUIT_POINTS;
        this.sound.fruit();
        this.syncHud();
      }
    }
  }

  checkSnakes() {
    const p = this.player.bounds;
    for (const s of this.snakes) {
      const b = s.bounds;
      if (p.x < b.x + b.w - 6 && p.x + p.w - 6 > b.x &&
          p.y < b.y + b.h - 6 && p.y + p.h - 6 > b.y) {
        this.loseLife();
        return;
      }
    }
  }

  checkObstacles() {
    const p = this.player.bounds;
    for (const o of this.level.obstacles) {
      // Small insets so grazing an edge (or clearing the top mid-jump) is safe.
      if (p.x < o.x + o.w - 3 && p.x + p.w - 3 > o.x &&
          p.y < o.y + o.h && p.y + p.h - 3 > o.y) {
        this.loseLife();
        return;
      }
    }
  }

  syncHud() {
    this.el.score.textContent = this.score;
    this.el.level.textContent = this.levelNum;
    this.el.lives.textContent = this.lives;
    const needed = this._fruitNeeded();
    this.el.fruit.textContent = `${Math.min(this._fruitEaten(), needed)}/${needed}`;
  }

  // --- Overlay helpers ------------------------------------------------------
  showOverlay(title, sub, btn) {
    this.el.panel.innerHTML =
      `<h1>${title}</h1><p class="sub">${sub}</p>` +
      `<button id="startBtn" class="btn">${btn}</button>`;
    this.el.startBtn = document.getElementById('startBtn');
    this.el.startBtn.addEventListener('click', () => this.onConfirm());
    this.el.overlay.classList.remove('hidden');
  }

  hideOverlay() {
    this.el.overlay.classList.add('hidden');
  }

  // --- Rendering ------------------------------------------------------------
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    this.drawTerrain(ctx);
    this.drawGoal(ctx);
    this.drawObstacles(ctx);
    this.drawFruit(ctx);
    this.drawSnakes(ctx);
    this.drawPlayer(ctx);
    if (this.state === 'playing' && this.graceTimer > 0) this.drawGrace(ctx);
  }

  drawObstacles(ctx) {
    ctx.save();
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const o of this.level.obstacles) {
      const e = OBSTACLE_EMOJI[(o.col * 2 + o.row) % OBSTACLE_EMOJI.length];
      ctx.fillText(e, o.drawX, o.feetY + FOOT_NUDGE);
    }
    ctx.restore();
  }

  drawGrace(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = getVar('--accent');
    ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 180));
    ctx.font = 'bold 30px monospace';
    ctx.fillText('준비!', CANVAS_W / 2, CANVAS_H / 2 - 30);
    ctx.restore();
  }

  drawGoal(ctx) {
    const g = this.level.goal;
    if (!g) return;
    const cx = g.x;
    const baseY = (g.row + 1) * TILE; // floor surface under the goal (reeds grow up)
    ctx.save();
    if (this.goalOpen) {
      // pulsing ring to signal the reed field is open
      const r = 15 + Math.sin(performance.now() / 200) * 3;
      ctx.beginPath();
      ctx.arc(cx, baseY - 16, r, 0, Math.PI * 2);
      ctx.strokeStyle = getVar('--accent');
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.5; // dimmed while still locked
    }
    this._drawReeds(ctx, cx, baseY);
    ctx.restore();
  }

  // A little cluster of reeds (갈대숲) marking the goal, growing from the floor.
  _drawReeds(ctx, cx, baseY) {
    const stalks = 6;
    const green = getVar('--vine');
    const greenDark = getVar('--vine-dark');
    ctx.lineCap = 'round';
    for (let i = 0; i < stalks; i++) {
      const t = i - (stalks - 1) / 2;                 // fan out around center
      const baseX = cx + t * 3;
      const topX = cx + t * 5;
      const topY = baseY - (26 - Math.abs(t) * 2.5);  // shorter toward the sides
      ctx.strokeStyle = i % 2 ? greenDark : green;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo((baseX + topX) / 2 + t, baseY - 14, topX, topY);
      ctx.stroke();
      // feathery reed plume on top
      ctx.fillStyle = '#caa46a';
      ctx.beginPath();
      ctx.ellipse(topX, topY - 3, 2.4, 6, t * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTerrain(ctx) {
    const g = this.level.grid;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = g[r][c];
        const x = c * TILE, y = r * TILE;
        if (ch === '#') {
          ctx.fillStyle = getVar('--floor');
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = getVar('--floor-top');
          ctx.fillRect(x, y, TILE, 5);
        } else if (ch === 'H') {
          // vine: two rails + rungs
          ctx.strokeStyle = getVar('--vine');
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x + 9, y); ctx.lineTo(x + 9, y + TILE);
          ctx.moveTo(x + TILE - 9, y); ctx.lineTo(x + TILE - 9, y + TILE);
          ctx.stroke();
          ctx.strokeStyle = getVar('--vine-dark');
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x + 9, y + 10); ctx.lineTo(x + TILE - 9, y + 10);
          ctx.moveTo(x + 9, y + 24); ctx.lineTo(x + TILE - 9, y + 24);
          ctx.stroke();
        }
      }
    }
  }

  drawFruit(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '22px serif';
    for (const f of this.level.fruits) {
      if (f.eaten) continue;
      ctx.fillText('🍒', f.x, f.y);
    }
  }

  drawSnakes(ctx) {
    const spr = this.snakeSprite;
    for (const s of this.snakes) {
      const b = s.bounds;
      const cx = b.x + b.w / 2;
      const feetY = b.y + b.h + FOOT_NUDGE;
      if (spr.ready) {
        ctx.save();
        // The fast variant is tinted a deeper red to stand out from the others.
        if (s.red) ctx.filter = 'saturate(1.7) hue-rotate(-16deg) brightness(0.82)';
        spr.draw(ctx, cx, feetY, s.dir, SNAKE_SPRITE_H);
        ctx.restore();
      } else {
        // Fallback emoji until the crab image has loaded.
        ctx.save();
        ctx.font = '26px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        if (s.red) ctx.filter = 'sepia(1) saturate(7) hue-rotate(-38deg) brightness(1.05)';
        ctx.translate(cx, feetY);
        ctx.scale(faceScale(s.dir, SNAKE_FACING), 1);
        ctx.fillText('🐍', 0, 0);
        ctx.restore();
      }
    }
  }

  drawPlayer(ctx) {
    const p = this.player;
    const cx = p.x + p.w / 2;
    const feetY = p.y + p.h + FOOT_NUDGE;
    // Custom sprite, drawn a bit taller than the hitbox so it reads clearly.
    if (this.playerSprite.draw(ctx, cx, feetY, p.facing, PLAYER_SPRITE_H)) return;
    // Fallback until the image has loaded.
    ctx.save();
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.translate(cx, feetY);
    ctx.scale(faceScale(p.facing, PLAYER_EMOJI_FACING), 1);
    ctx.fillText('🦢', 0, 0);
    ctx.restore();
  }
}

// Fine vertical tweak so an emoji glyph's feet land flush on the floor line
// (its box bottom sits exactly on the floor surface).
const FOOT_NUDGE = 0;

// Which way each emoji glyph naturally points (+1 = right) at scaleX +1. The
// 🦢 goni-fallback and 🐍 snake glyphs both naturally face left, so we flip
// relative to these to make a character face the way it's moving.
const PLAYER_EMOJI_FACING = -1;
const SNAKE_FACING = -1;

// scaleX that turns an emoji whose natural facing is `natural` to point `dir`.
function faceScale(dir, natural) {
  return (dir >= 0 ? 1 : -1) * natural;
}

// Obstacle glyphs; each obstacle picks one deterministically from its position.
const OBSTACLE_EMOJI = ['🌵', '🪨', '🔥', '🧱'];

// On-screen heights of the character sprites (a bit larger than their hitboxes).
const PLAYER_SPRITE_H = 40;
const SNAKE_SPRITE_H = 34;

// Read a CSS custom property so canvas colors track the stylesheet theme.
const _root = getComputedStyle(document.documentElement);
function getVar(name) { return _root.getPropertyValue(name).trim(); }
