// Character sprites loaded from image files (so they look identical on every
// system, unlike emoji). The near-white studio background is stripped to
// transparency at load time with a border flood-fill — no image tooling needed,
// and interior light details (e.g. the pearl necklace) are preserved because the
// fill can't reach them through the character's silhouette. The result is
// auto-cropped to the character's bounding box.
export class Sprite {
  constructor(src, { facing = -1 } = {}) {
    this.ready = false;
    this.canvas = null;
    this.w = 0;
    this.h = 0;
    this.facing = facing; // which way the artwork points (+1 right, -1 left)

    const img = new Image();
    img.onload = () => this._process(img);
    img.onerror = () => { /* stay not-ready; callers fall back to an emoji */ };
    img.src = src;
  }

  _process(img) {
    const w = img.width, h = img.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;

    // Background (and its soft grey shadow) = near-neutral, low saturation. The
    // cream body stays warm (a wide max-min spread), so it survives regardless of
    // brightness. Only border-connected neutral pixels are cleared, so interior
    // near-white details (the pearl necklace) are safe.
    const isBg = (i) => {
      if (d[i + 3] === 0) return false;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
      return mn > 172 && mx - mn < 22;
    };

    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x * 4); stack.push(((h - 1) * w + x) * 4); }
    for (let y = 0; y < h; y++) { stack.push(y * w * 4); stack.push((y * w + w - 1) * 4); }
    while (stack.length) {
      const i = stack.pop();
      if (d[i + 3] === 0 || !isBg(i)) continue;
      d[i + 3] = 0;
      const p = i >> 2, x = p % w, y = (p / w) | 0;
      if (x > 0) stack.push(i - 4);
      if (x < w - 1) stack.push(i + 4);
      if (y > 0) stack.push(i - w * 4);
      if (y < h - 1) stack.push(i + w * 4);
    }
    ctx.putImageData(id, 0, 0);

    // Auto-crop to the opaque bounding box.
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[((y * w + x) << 2) + 3] > 10) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const pad = 2;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const cw = maxX - minX + 1, ch = maxY - minY + 1;

    const out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    out.getContext('2d').drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);

    this.canvas = out; this.w = cw; this.h = ch; this.ready = true;
  }

  // Draw standing on `feetY`, centered on `cx`, facing `dir`, at pixel height `dh`.
  draw(ctx, cx, feetY, dir, dh) {
    if (!this.ready) return false;
    const dw = dh * this.w / this.h;
    ctx.save();
    ctx.translate(cx, feetY);
    ctx.scale((dir >= 0 ? 1 : -1) * this.facing, 1);
    ctx.drawImage(this.canvas, -dw / 2, -dh, dw, dh);
    ctx.restore();
    return true;
  }
}
