import type { Mesh } from "./mesh";

/**
 * Binary STL. Our mesh is Y-up (three.js convention); slicers expect Z-up,
 * so we rotate on export: (x, y, z) → (x, -z, y).
 */
export function meshToBinaryStl(mesh: Mesh): ArrayBuffer {
  const { positions: p, indices } = mesh;
  const triCount = indices.length / 3;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buf);
  const header = "video-to-stl demo";
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(80, triCount, true);

  const v = (i: number): [number, number, number] => [p[i * 3], -p[i * 3 + 2], p[i * 3 + 1]];
  let o = 84;
  for (let t = 0; t < indices.length; t += 3) {
    const a = v(indices[t]);
    const b = v(indices[t + 1]);
    const c = v(indices[t + 2]);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const f of [nx, ny, nz, ...a, ...b, ...c]) {
      view.setFloat32(o, f, true);
      o += 4;
    }
    view.setUint16(o, 0, true);
    o += 2;
  }
  return buf;
}
