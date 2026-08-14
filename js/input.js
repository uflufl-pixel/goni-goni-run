// Keyboard state tracker. Exposes left/right/up/down as booleans plus an
// onConfirm callback for Enter/Space (menus & restart).
export class Input {
  constructor() {
    this.left = false;
    this.right = false;
    this.up = false;
    this.down = false;
    this.jump = false;
    this._confirm = null;
    this._mute = null;

    const set = (e, down) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this.left = down; break;
        case 'ArrowRight': case 'KeyD': this.right = down; break;
        case 'ArrowUp': case 'KeyW': this.up = down; break;
        case 'ArrowDown': case 'KeyS': this.down = down; break;
        case 'KeyZ': case 'KeyX': this.jump = down; break;
        case 'Enter':
          if (down && this._confirm) this._confirm();
          break;
        case 'Space': // jump during play; also confirms on menus (harmless in play)
          this.jump = down;
          if (down && this._confirm) this._confirm();
          break;
        case 'KeyM':
          if (down && !e.repeat && this._mute) this._mute();
          break;
        default: return;
      }
      // Stop arrows/space from scrolling the page.
      e.preventDefault();
    };

    window.addEventListener('keydown', (e) => set(e, true));
    window.addEventListener('keyup', (e) => set(e, false));
  }

  onConfirm(fn) { this._confirm = fn; }
  onMute(fn) { this._mute = fn; }
}
