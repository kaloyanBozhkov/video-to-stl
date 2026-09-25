// Sanity check without a browser: synthetic silhouettes of an upright cylinder
// (a "pen") → carve → mesh → STL. Checks watertightness and outward normals.
import { carveVisualHull } from "../src/lib/carve";
import { voxelsToMesh, scaleToMillimetres } from "../src/lib/mesh";
import { meshToBinaryStl } from "../src/lib/stl";
import type { Mask } from "../src/lib/segment";

const W = 120, H = 200;
const masks: Mask[] = Array.from({ length: 24 }, () => {
  const data = new Uint8Array(W * H);
  for (let y = 20; y < 180; y++) for (let x = 54; x < 66; x++) data[y * W + x] = 1;
  return { width: W, height: H, data };
});

const grid = carveVisualHull(masks, { resolution: 128, rotationDegrees: 360, tolerance: 0 });
const mesh = scaleToMillimetres(voxelsToMesh(grid, 6), 140);
const { positions: p, indices: ix } = mesh;

// Signed volume (positive ⇒ outward winding) and edge manifoldness.
let vol = 0;
const edges = new Map<string, number>();
for (let t = 0; t < ix.length; t += 3) {
  const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]];
  const A = [p[a*3], p[a*3+1], p[a*3+2]], B = [p[b*3], p[b*3+1], p[b*3+2]], C = [p[c*3], p[c*3+1], p[c*3+2]];
  vol += (A[0]*(B[1]*C[2]-B[2]*C[1]) - A[1]*(B[0]*C[2]-B[2]*C[0]) + A[2]*(B[0]*C[1]-B[1]*C[0])) / 6;
  for (const [u, v] of [[a, b], [b, c], [c, a]]) {
    const k = `${u}>${v}`;
    edges.set(k, (edges.get(k) ?? 0) + 1);
  }
}
let open = 0;
for (const k of edges.keys()) {
  const [u, v] = k.split(">");
  if (!edges.has(`${v}>${u}`)) open++;
}
let maxY = 0;
for (let i = 1; i < p.length; i += 3) maxY = Math.max(maxY, p[i]);
const stl = meshToBinaryStl(mesh);

console.log({ grid: [grid.nx, grid.ny, grid.nz], triangles: ix.length / 3, volumeMm3: vol.toFixed(0), heightMm: maxY.toFixed(1), openEdges: open, stlBytes: stl.byteLength });
if (vol <= 0) throw new Error("normals point inward");
if (open) throw new Error("mesh is not watertight");
if (Math.abs(maxY - 140) > 2) throw new Error("scaling is off");
console.log("OK");
