import type { Frame } from "./frames";

/** Binary silhouette: 1 = object, 0 = background. */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Background-colour segmentation. Assumes a plain backdrop: the background colour
 * is estimated from the frame border, and anything far enough from it is "object".
 * The largest connected blob is kept so stray noise doesn't get carved into the model.
 *
 * Swap this for SAM 2 / rembg on a server for real-world backgrounds.
 */
export function segment(frame: Frame, threshold: number): Mask {
  const { width, height, data } = frame;
  const [br, bg, bb] = borderMedian(frame);
  const raw = new Uint8Array(width * height);
  const t2 = threshold * threshold;

  for (let i = 0, p = 0; i < raw.length; i++, p += 4) {
    const dr = data[p] - br;
    const dg = data[p + 1] - bg;
    const db = data[p + 2] - bb;
    raw[i] = dr * dr + dg * dg + db * db > t2 ? 1 : 0;
  }

  return { width, height, data: fillHoles(largestComponent(raw, width, height), width, height) };
}

function borderMedian({ width, height, data }: Frame): [number, number, number] {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const push = (x: number, y: number) => {
    const p = (y * width + x) * 4;
    r.push(data[p]);
    g.push(data[p + 1]);
    b.push(data[p + 2]);
  };
  for (let x = 0; x < width; x += 2) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 2) {
    push(0, y);
    push(width - 1, y);
  }
  const med = (a: number[]) => a.sort((m, n) => m - n)[a.length >> 1];
  return [med(r), med(g), med(b)];
}

/** Keep only the biggest 4-connected foreground blob. */
function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(mask.length);
  const stack = new Int32Array(mask.length);
  let best = 0;
  let bestSize = 0;
  let next = 0;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue;
    next++;
    let size = 0;
    let sp = 0;
    stack[sp++] = start;
    label[start] = next;
    while (sp) {
      const i = stack[--sp];
      size++;
      const x = i % w;
      const neighbours = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const n of neighbours) {
        if (n >= 0 && n < mask.length && mask[n] && !label[n]) {
          label[n] = next;
          stack[sp++] = n;
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
  }

  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = label[i] === best && best ? 1 : 0;
  return out;
}

/** Fill interior holes (e.g. specular highlights that matched the background). */
function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const outside = new Uint8Array(mask.length);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < mask.length - w) seed(i + w);
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}
