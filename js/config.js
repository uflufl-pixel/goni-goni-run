// Central tuning knobs and geometry for the game.
// All positions in the engine are pixel-based; TILE maps grid cells to pixels.

export const TILE = 32;
export const COLS = 20;
export const ROWS = 15;
export const CANVAS_W = COLS * TILE; // 640
export const CANVAS_H = ROWS * TILE; // 480

// Player physics (pixels per second)
export const WALK_SPEED = 135;
export const CLIMB_SPEED = 115;
export const GRAVITY = 1100;
export const MAX_FALL = 680;

export const PLAYER_W = 26;
export const PLAYER_H = 30;

// Jump: a small hop (floors are only 2 rows apart, so headroom is tight) — just
// enough to clear a floor obstacle.
export const JUMP_SPEED = 300;

// Obstacles: static hazards sitting on a floor that must be hopped over. The
// collision box is deliberately short so a jump clears it with a forgiving
// timing window (the drawn glyph is a bit taller).
export const OBSTACLE_W = 12;
export const OBSTACLE_H = 11;

// Enemies
export const SNAKE_SPEED = 60; // base speed; scales up per level
export const SNAKE_W = 26;
export const SNAKE_H = 28;

export const START_LIVES = 3;
export const FRUIT_POINTS = 100;
export const CLEAR_BONUS = 1000;

// Breathing room at spawn/respawn: snakes hold still so the player can move off
// the start tile before the chase begins.
export const START_GRACE = 1.4;

// How long the "stage clear" banner shows before auto-advancing to the next
// level (Enter skips the wait).
export const WIN_DELAY = 1.8;

// A single fast "red" snake joins from this level onward for extra difficulty.
// It behaves like the others (horizontal patrol) but moves faster.
export const RED_SNAKE_FROM_LEVEL = 2;
export const RED_SNAKE_SPEED_MULT = 1.7;

// The den opens once at least this fraction of the fruit has been collected
// (0.5 = half or more), not necessarily every last one.
export const GOAL_FRUIT_FRACTION = 0.5;
