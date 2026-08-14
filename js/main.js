import { Game } from './game.js';

// Entry point: boot the game once the DOM is ready.
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  // eslint-disable-next-line no-new
  window.__game = new Game(canvas); // exposed for debugging in the console
});
