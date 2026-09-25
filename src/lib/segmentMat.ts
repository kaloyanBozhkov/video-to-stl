import { applyH, inv3, type Mat3 } from "./geometry";
import { REGION } from "./mat";

export const BG = 0;
export const OBJ = 1;
export const UNKNOWN = 2;

/** Per-pixel label: BG (plain paper), OBJ (object), UNKNOWN (off the plain area — no evidence). */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Segment the object against the mat's plain paper area.
 * Because we know the mat homography, we know exactly which pixels *should* be
 * white paper; anything clearly darker or more colourful than the local paper
 * brightness is object. Pixels off the paper area are UNKNOWN and never carve.
 */
export function segmentOnMat(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
  H: Mat3,
  sensitivity: number,
): Mask {
  const n = width * height;
  const out = new Uint8Array(n).fill(UNKNOWN);
  const Hinv = inv3(H);
  const inset = 2;
  const cx = (REGION.x0 + REGION.x1) / 2, cy = (REGION.y0 + REGION.y1) / 2;
  const ref = Math.sign(1 / (H[6] * cx + H[7] * cy + H[8]));
  const lum = new Float32Array(n);
  const sat = new Float32Array(n);

  for (let v = 0; v < height; v++)
    for (let u = 0; u < width; u++) {
      const i = v * width + u;
      const w = Hinv[6] * (u + 0.5) + Hinv[7] * (v + 0.5) + Hinv[8];
      if (Math.sign(w) !== ref) continue; // above the horizon
      const [X, Y] = applyH(Hinv, u + 0.5, v + 0.5);
      if (X < REGION.x0 + inset || X > REGION.x1 - inset || Y < REGION.y0 + inset || Y > REGION.y1 - inset) continue;
      const p = i * 4;
      const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
      out[i] = BG; // provisional
    }

  // Local paper brightness: 75th percentile per block (the object is a minority of
  // any block), so lighting gradients and soft shadows don't fool a global threshold.
  const B = 24;
  const bw = Math.ceil(width / B), bh = Math.ceil(height / B);
  const paper = new Float32Array(bw * bh).fill(NaN);
  const all: number[] = [];
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      const vals: number[] = [];
      for (let v = by * B; v < Math.min(height, (by + 1) * B); v++)
        for (let u = bx * B; u < Math.min(width, (bx + 1) * B); u++) {
          const i = v * width + u;
          if (out[i] === BG) vals.push(lum[i]);
        }
      if (vals.length >= 40) {
        vals.sort((a, b) => a - b);
        paper[by * bw + bx] = vals[Math.floor(vals.length * 0.75)];
        all.push(paper[by * bw + bx]);
      }
    }
  all.sort((a, b) => a - b);
  const fallback = all.length ? all[all.length >> 1] : 200;
  const paperAt = (u: number, v: number) => {
    const bx = Math.floor(u / B), by = Math.floor(v / B);
    let s = 0, k = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = bx + dx, y = by + dy;
        if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
        const val = paper[y * bw + x];
        if (!Number.isNaN(val)) { s += val; k++; }
      }
    return k ? s / k : fallback;
  };

  const darkRatio = 1 - sensitivity;
  for (let v = 0; v < height; v++)
    for (let u = 0; u < width; u++) {
      const i = v * width + u;
      if (out[i] !== BG) continue;
      if (lum[i] < paperAt(u, v) * darkRatio || sat[i] > 70) out[i] = OBJ;
    }

  cleanup(out, width, height);
  return { width, height, data: out };
}

/** Drop speckle objects; fill small paper-coloured holes inside objects (specular highlights). */
function cleanup(m: Uint8Array, w: number, h: number) {
  const n = w * h;
  const minObj = Math.max(30, n * 0.0002);
  const maxHole = n * 0.002;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const comp: number[] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s] || m[s] === UNKNOWN) continue;
    const label = m[s];
    comp.length = 0;
    let sp = 0, touchesOther = false;
    stack[sp++] = s;
    seen[s] = 1;
    while (sp) {
      const i = stack[--sp];
      comp.push(i);
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1];
      for (const j of nb) {
        if (j < 0) { touchesOther = true; continue; }
        if (m[j] === label) {
          if (!seen[j]) { seen[j] = 1; stack[sp++] = j; }
        } else if (m[j] === UNKNOWN) touchesOther = true;
      }
    }
    if (label === OBJ && comp.length < minObj) for (const i of comp) m[i] = BG;
    else if (label === BG && !touchesOther && comp.length < maxHole) for (const i of comp) m[i] = OBJ;
  }
}
