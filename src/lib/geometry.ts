import { Matrix, SingularValueDecomposition, solve } from "ml-matrix";

export type Vec3 = [number, number, number];
export type Mat3 = number[]; // row-major 3×3

export interface Camera {
  f: number;
  cx: number;
  cy: number;
  R: Mat3;
  t: Vec3;
}

export interface Correspondence {
  world: [number, number]; // on the Z=0 plane, mm
  image: [number, number]; // px
}

/** Project a world point. Returns [u, v, depth]. OpenCV convention: x right, y down, z forward. */
export function project(cam: Camera, X: number, Y: number, Z: number): [number, number, number] {
  const { R, t, f, cx, cy } = cam;
  const x = R[0] * X + R[1] * Y + R[2] * Z + t[0];
  const y = R[3] * X + R[4] * Y + R[5] * Z + t[1];
  const z = R[6] * X + R[7] * Y + R[8] * Z + t[2];
  return [(f * x) / z + cx, (f * y) / z + cy, z];
}

/** Normalised DLT homography, plane (X,Y) → image (u,v). Row-major 3×3. */
export function homography(pts: Correspondence[]): Mat3 {
  const norm = (p: [number, number][]) => {
    const mx = p.reduce((a, q) => a + q[0], 0) / p.length;
    const my = p.reduce((a, q) => a + q[1], 0) / p.length;
    const d = p.reduce((a, q) => a + Math.hypot(q[0] - mx, q[1] - my), 0) / p.length || 1;
    const s = Math.SQRT2 / d;
    return { s, mx, my, T: [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1] };
  };
  const nw = norm(pts.map((p) => p.world));
  const ni = norm(pts.map((p) => p.image));
  const A = new Matrix(pts.length * 2, 9);
  pts.forEach((p, i) => {
    const X = (p.world[0] - nw.mx) * nw.s, Y = (p.world[1] - nw.my) * nw.s;
    const u = (p.image[0] - ni.mx) * ni.s, v = (p.image[1] - ni.my) * ni.s;
    A.setRow(2 * i, [-X, -Y, -1, 0, 0, 0, u * X, u * Y, u]);
    A.setRow(2 * i + 1, [0, 0, 0, -X, -Y, -1, v * X, v * Y, v]);
  });
  const svd = new SingularValueDecomposition(A, { autoTranspose: true });
  const h = svd.rightSingularVectors.getColumn(8);
  // H = Ti^-1 * Hn * Tw
  const TiInv = [1 / ni.s, 0, ni.mx, 0, 1 / ni.s, ni.my, 0, 0, 1];
  return mul3(mul3(TiInv, h), nw.T);
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
}

export function inv3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((x) => x / det);
}

/** Apply a homography to a 2D point. */
export function applyH(H: Mat3, x: number, y: number): [number, number] {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/** Initial pose from a plane homography given intrinsics. */
export function poseFromHomography(H: Mat3, f: number, cx: number, cy: number): Camera {
  const Kinv = [1 / f, 0, -cx / f, 0, 1 / f, -cy / f, 0, 0, 1];
  const M = mul3(Kinv, H);
  const col = (j: number): Vec3 => [M[j], M[3 + j], M[6 + j]];
  let m1 = col(0), m2 = col(1), m3 = col(2);
  const lam = 2 / (norm(m1) + norm(m2));
  let sign = m3[2] * lam > 0 ? 1 : -1; // object must be in front of the camera
  const s = lam * sign;
  m1 = scale(m1, s); m2 = scale(m2, s); m3 = scale(m3, s);
  const r3 = cross(m1, m2);
  const R0 = new Matrix([
    [m1[0], m2[0], r3[0]],
    [m1[1], m2[1], r3[1]],
    [m1[2], m2[2], r3[2]],
  ]);
  const svd = new SingularValueDecomposition(R0);
  let R = svd.leftSingularVectors.mmul(svd.rightSingularVectors.transpose());
  if (det3(R.to1DArray()) < 0) R = R.mul(-1);
  sign = 1;
  return { f, cx, cy, R: R.to1DArray(), t: m3 };
}

/** Gauss–Newton refinement of R, t minimising reprojection error. Returns RMS error (px). */
export function refinePose(cam: Camera, pts: Correspondence[], iterations = 8): number {
  const residuals = (R: Mat3, t: Vec3) => {
    const c = { ...cam, R, t };
    const r: number[] = [];
    for (const p of pts) {
      const [u, v] = project(c, p.world[0], p.world[1], 0);
      r.push(u - p.image[0], v - p.image[1]);
    }
    return r;
  };
  const apply = (d: number[]): [Mat3, Vec3] => [
    mul3(rodrigues([d[0], d[1], d[2]]), cam.R),
    [cam.t[0] + d[3], cam.t[1] + d[4], cam.t[2] + d[5]],
  ];
  let r = residuals(cam.R, cam.t);
  for (let it = 0; it < iterations; it++) {
    const J = new Matrix(r.length, 6);
    for (let k = 0; k < 6; k++) {
      const d = [0, 0, 0, 0, 0, 0];
      const eps = k < 3 ? 1e-6 : 1e-4;
      d[k] = eps;
      const [R2, t2] = apply(d);
      const r2 = residuals(R2, t2);
      for (let i = 0; i < r.length; i++) J.set(i, k, (r2[i] - r[i]) / eps);
    }
    const JT = J.transpose();
    const JTJ = JT.mmul(J);
    for (let k = 0; k < 6; k++) JTJ.set(k, k, JTJ.get(k, k) * 1.001 + 1e-9);
    const step = solve(JTJ, JT.mmul(Matrix.columnVector(r))).to1DArray().map((x) => -x);
    const [R2, t2] = apply(step);
    const r2 = residuals(R2, t2);
    if (sumSq(r2) >= sumSq(r)) break;
    cam.R = R2;
    cam.t = t2;
    r = r2;
  }
  return Math.sqrt(sumSq(r) / (r.length / 2));
}

export function rodrigues(w: Vec3): Mat3 {
  const th = norm(w);
  if (th < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const [x, y, z] = scale(w, 1 / th);
  const c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  return [
    c + x * x * C, x * y * C - z * s, x * z * C + y * s,
    y * x * C + z * s, c + y * y * C, y * z * C - x * s,
    z * x * C - y * s, z * y * C + x * s, c + z * z * C,
  ];
}

/**
 * Self-calibrate focal length: pick the f that minimises total reprojection error
 * over all frames (golden-section search). Principal point = image centre,
 * square pixels, no distortion — good enough for phone main cameras.
 */
export function calibrate(
  views: { H: Mat3; pts: Correspondence[] }[],
  width: number,
  height: number,
): { cams: Camera[]; errors: number[]; f: number } {
  const cx = width / 2, cy = height / 2;
  const cost = (f: number) => {
    let total = 0;
    for (const v of views) {
      const cam = poseFromHomography(v.H, f, cx, cy);
      const e = refinePose(cam, v.pts, 4);
      total += e * e;
    }
    return total;
  };
  const dim = Math.max(width, height);
  let a = 0.4 * dim, b = 2.5 * dim;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a);
  let fc = cost(c), fd = cost(d);
  for (let i = 0; i < 28; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = cost(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = cost(d); }
  }
  const f = (a + b) / 2;
  const cams: Camera[] = [];
  const errors: number[] = [];
  for (const v of views) {
    const cam = poseFromHomography(v.H, f, cx, cy);
    errors.push(refinePose(cam, v.pts, 15));
    cams.push(cam);
  }
  return { cams, errors, f };
}

const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const det3 = (m: number[]) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
const sumSq = (r: number[]) => r.reduce((a, x) => a + x * x, 0);
