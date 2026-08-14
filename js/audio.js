// Retro sound effects synthesized with the Web Audio API — no asset files.
// The context is created lazily and resumed on the first user gesture (start),
// per browser autoplay rules; everything degrades to silence if unsupported.
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  // Call from a user gesture (start / unmute) so audio is allowed to play.
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  // One oscillator note. `freq` may be [from, to] to glide between pitches.
  _note(freq, startAt, dur, { type = 'square', gain = 0.2 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + startAt;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    if (Array.isArray(freq)) {
      osc.frequency.setValueAtTime(freq[0], t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq[1]), t + dur);
    } else {
      osc.frequency.setValueAtTime(freq, t);
    }
    // Quick attack, exponential decay (can't ramp to 0, so use a tiny floor).
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  // A little run of notes, one after another.
  _seq(notes, { type = 'square', gain = 0.2, step = 0.12 } = {}) {
    notes.forEach((f, i) => this._note(f, i * step, step * 0.9, { type, gain }));
  }

  fruit()    { this._note([620, 960], 0, 0.09, { gain: 0.16 }); }
  jump()     { this._note([300, 560], 0, 0.12, { gain: 0.12 }); }
  grab()     { this._note([300, 480], 0, 0.05, { type: 'triangle', gain: 0.09 }); }
  denOpen()  { this._seq([660, 880, 1180], { gain: 0.16, step: 0.1 }); }
  start()    { this._seq([523, 784], { gain: 0.16, step: 0.11 }); }
  win()      { this._seq([523, 659, 784, 1047], { gain: 0.2, step: 0.13 }); }
  die()      { this._note([520, 90], 0, 0.5, { type: 'sawtooth', gain: 0.2 }); }
  gameover() { this._seq([392, 330, 262, 196], { type: 'sawtooth', gain: 0.2, step: 0.2 }); }
}
