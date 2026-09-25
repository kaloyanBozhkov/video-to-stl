import type { VoxelGrid } from "./carve";

export interface Mesh {
  positions: Float32Array; // xyz per vertex
  indices: Uint32Array; // 3 per triangle, CCW = outward
}

/**
 * Turn solid voxels into a closed, manifold-ish surface by emitting every face
 * between a solid and an empty cell, sharing vertices so the result is
 * watertight, then Taubin-smoothing away the blockiness (no shrinkage).
 *
 * Production swap: marching cubes on a TSDF, or Poisson reconstruction (Open3D).
 */
export function voxelsToMesh(grid: VoxelGrid, smoothIterations = 8): Mesh {
  const { nx, ny, nz, data } = grid;
  const solid = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && data[x + y * nx + z * nx * ny] === 1;

  const vertIndex = new Map<number, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  const key = (x: number, y: number, z: number) => x + (nx + 1) * (y + (ny + 1) * z);
  const vert = (x: number, y: number, z: number) => {
    const k = key(x, y, z);
    let i = vertIndex.get(k);
    if (i === undefined) {
      i = pos.length / 3;
      // Flip Y so image-top becomes model-top; centre on the origin.
      pos.push(x - nx / 2, ny - y, z - nz / 2);
      vertIndex.set(k, i);
    }
    return i;
  };
  // Corners are listed in grid space; the Y flip mirrors them, so wind the triangles reversed
  // to end up CCW-from-outside in model space.
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    const [i0, i1, i2, i3] = [a, b, c, d].map(([x, y, z]) => vert(x, y, z));
    idx.push(i0, i2, i1, i0, i3, i2);
  };

  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        if (!solid(x, y, z)) continue;
        const X = x + 1, Y = y + 1, Z = z + 1;
        if (!solid(x - 1, y, z)) quad([x, y, z], [x, y, Z], [x, Y, Z], [x, Y, z]);
        if (!solid(x + 1, y, z)) quad([X, y, z], [X, Y, z], [X, Y, Z], [X, y, Z]);
        // grid y grows downward, so "y-1" is model-up
        if (!solid(x, y - 1, z)) quad([x, y, z], [X, y, z], [X, y, Z], [x, y, Z]);
        if (!solid(x, y + 1, z)) quad([x, Y, z], [x, Y, Z], [X, Y, Z], [X, Y, z]);
        if (!solid(x, y, z - 1)) quad([x, y, z], [x, Y, z], [X, Y, z], [X, y, z]);
        if (!solid(x, y, z + 1)) quad([x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z]);
      }

  const positions = new Float32Array(pos);
  const indices = new Uint32Array(idx);
  taubinSmooth(positions, indices, smoothIterations);
  return { positions, indices };
}

function taubinSmooth(positions: Float32Array, indices: Uint32Array, iterations: number) {
  const n = positions.length / 3;
  const neighbours: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    neighbours[a].add(b).add(c);
    neighbours[b].add(a).add(c);
    neighbours[c].add(a).add(b);
  }
  const lists = neighbours.map((s) => Array.from(s));
  const tmp = new Float32Array(positions.length);

  const pass = (factor: number) => {
    for (let v = 0; v < n; v++) {
      const nb = lists[v];
      let sx = 0, sy = 0, sz = 0;
      for (const u of nb) {
        sx += positions[u * 3];
        sy += positions[u * 3 + 1];
        sz += positions[u * 3 + 2];
      }
      const k = nb.length || 1;
      tmp[v * 3] = positions[v * 3] + factor * (sx / k - positions[v * 3]);
      tmp[v * 3 + 1] = positions[v * 3 + 1] + factor * (sy / k - positions[v * 3 + 1]);
      tmp[v * 3 + 2] = positions[v * 3 + 2] + factor * (sz / k - positions[v * 3 + 2]);
    }
    positions.set(tmp);
  };
  for (let i = 0; i < iterations; i++) {
    pass(0.5); // shrink
    pass(-0.53); // inflate back (Taubin λ/μ)
  }
}

/** Uniformly scale so the longest side equals `targetMm`, and rest the model on z=0 (print bed). */
export function scaleToMillimetres(mesh: Mesh, targetMm: number): Mesh {
  const p = mesh.positions;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], p[i + a]);
      max[a] = Math.max(max[a], p[i + a]);
    }
  const longest = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const s = targetMm / longest;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    out[i] = (p[i] - (min[0] + max[0]) / 2) * s;
    out[i + 1] = (p[i + 1] - min[1]) * s;
    out[i + 2] = (p[i + 2] - (min[2] + max[2]) / 2) * s;
  }
  return { positions: out, indices: mesh.indices };
}
