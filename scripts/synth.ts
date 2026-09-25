// Tiny ray-caster: renders the printed mat with a pen lying on it from any camera.
// Used to test the whole marker → pose → carve pipeline without a browser.
import { matBlackRects, SHEET } from "../src/lib/mat";
import type { Camera, Vec3 } from "../src/lib/geometry";

const RES = 4; // bitmap px per mm
const bmp = (() => {
  const w = SHEET.width * RES, h = SHEET.height * RES;
  const b = new Uint8Array(w * h);
  for (const r of matBlackRects())
    for (let y = Math.floor(r.y * RES); y < Math.ceil((r.y + r.h) * RES); y++)
      for (let x = Math.floor(r.x * RES); x < Math.ceil((r.x + r.w) * RES); x++) b[y * w + x] = 1;
  return { w, h, b };
})();

export const PEN = { x: 105, y0: 80, y1: 210, r: 5 };

export function lookAt(eye: Vec3, target: Vec3, f: number, w: number, h: number): Camera {
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nrm = (a: Vec3): Vec3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const zc = nrm(sub(target, eye));
  const xc = nrm(cross(zc, [0, 0, 1]));
  const yc = cross(zc, xc);
  const R = [...xc, ...yc, ...zc];
  const t: Vec3 = [
    -(R[0] * eye[0] + R[1] * eye[1] + R[2] * eye[2]),
    -(R[3] * eye[0] + R[4] * eye[1] + R[5] * eye[2]),
    -(R[6] * eye[0] + R[7] * eye[1] + R[8] * eye[2]),
  ];
  return { f, cx: w / 2, cy: h / 2, R, t };
}

export function render(cam: Camera, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const { R, t, f, cx, cy } = cam;
  // camera centre C = -Rᵀt
  const C: Vec3 = [
    -(R[0] * t[0] + R[3] * t[1] + R[6] * t[2]),
    -(R[1] * t[0] + R[4] * t[1] + R[7] * t[2]),
    -(R[2] * t[0] + R[5] * t[1] + R[8] * t[2]),
  ];
  const light = [0.3, -0.4, 0.87];
  for (let v = 0; v < h; v++)
    for (let u = 0; u < w; u++) {
      const a = (u + 0.5 - cx) / f, b = (v + 0.5 - cy) / f;
      const d: Vec3 = [R[0] * a + R[3] * b + R[6], R[1] * a + R[4] * b + R[7], R[2] * a + R[5] * b + R[8]];
      let col: [number, number, number] = [120, 110, 100]; // table
      let best = Infinity;
      // pen cylinder along Y
      const ox = C[0] - PEN.x, oz = C[2] - PEN.r;
      const A = d[0] * d[0] + d[2] * d[2], B = 2 * (ox * d[0] + oz * d[2]), Cc = ox * ox + oz * oz - PEN.r * PEN.r;
      const disc = B * B - 4 * A * Cc;
      if (disc > 0) {
        const s = (-B - Math.sqrt(disc)) / (2 * A);
        const y = C[1] + s * d[1];
        if (s > 0 && y >= PEN.y0 && y <= PEN.y1) {
          best = s;
          const nx = (ox + s * d[0]) / PEN.r, nz = (oz + s * d[2]) / PEN.r;
          const k = 0.35 + 0.65 * Math.max(0, nx * light[0] + nz * light[2]);
          col = [30 * k + 10, 55 * k + 10, 150 * k + 15];
        }
      }
      for (const yc of [PEN.y0, PEN.y1]) {
        const s = (yc - C[1]) / d[1];
        if (s > 0 && s < best) {
          const x = C[0] + s * d[0] - PEN.x, z = C[2] + s * d[2] - PEN.r;
          if (x * x + z * z <= PEN.r * PEN.r) { best = s; col = [25, 40, 110]; }
        }
      }
      if (best === Infinity && d[2] < 0) {
        const s = -C[2] / d[2];
        const X = C[0] + s * d[0], Y = C[1] + s * d[1];
        const sx = X, sy = SHEET.height - Y;
        if (sx >= 0 && sy >= 0 && sx < SHEET.width && sy < SHEET.height) {
          const black = bmp.b[Math.floor(sy * RES) * bmp.w + Math.floor(sx * RES)];
          col = black ? [20, 20, 20] : [238, 236, 230];
        }
      }
      const p = (v * w + u) * 4;
      out[p] = col[0]; out[p + 1] = col[1]; out[p + 2] = col[2]; out[p + 3] = 255;
    }
  return out;
}
