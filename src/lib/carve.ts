import type { Mask } from "./segment";

/** Occupancy grid: 1 = solid. Indexed [ix + iy*nx + iz*nx*ny], iy = 0 is the top. */
export interface VoxelGrid {
  nx: number;
  ny: number;
  nz: number;
  data: Uint8Array;
}

export interface CarveOptions {
  /** Voxels along the object's longest dimension (height or diameter). */
  resolution: number;
  /** Total rotation covered by the video, in degrees (360 = one full turn). */
  rotationDegrees: number;
  /** Fraction of frames allowed to disagree before a voxel is carved away (noise tolerance). */
  tolerance: number;
}

/**
 * Shape-from-silhouette (visual hull).
 *
 * Model: object turns at constant speed about a vertical axis (turntable, or the
 * user walking a steady circle around it), camera roughly level and far enough
 * away that projection is ~orthographic. Every voxel that falls outside the
 * silhouette in a frame is carved away; what survives is the hull.
 *
 * This is the "quick demo" reconstructor. For real scans, replace it with
 * COLMAP (SfM + MVS) → OpenMVS / Poisson meshing on a server.
 */
export function carveVisualHull(masks: Mask[], opts: CarveOptions): VoxelGrid {
  if (masks.length === 0) throw new Error("No frames to carve");
  const { width: w, height: h } = masks[0];

  // Rotation axis = average horizontal centre of the silhouette bounding boxes.
  let axisSum = 0;
  let yMin = h;
  let yMax = -1;
  const boxes = masks.map((m) => bbox(m));
  for (const b of boxes) {
    if (!b) throw new Error("Object not found in a frame — raise contrast with the background or lower the threshold");
    axisSum += (b.minX + b.maxX) / 2;
    yMin = Math.min(yMin, b.minY);
    yMax = Math.max(yMax, b.maxY);
  }
  const axisX = axisSum / boxes.length;
  let radius = 1;
  for (const b of boxes) if (b) radius = Math.max(radius, axisX - b.minX + 1, b.maxX - axisX + 1);

  // Cubic voxels sized off the longest side, so a thin upright pen gets its
  // resolution along its length instead of wasting it on empty width.
  const voxel = Math.max(2 * radius, yMax - yMin + 1) / opts.resolution; // pixels per voxel
  const nx = Math.max(1, Math.ceil((2 * radius) / voxel));
  const nz = nx;
  const ny = Math.max(1, Math.ceil((yMax - yMin + 1) / voxel));
  radius = (nx * voxel) / 2;

  const misses = new Uint16Array(nx * ny * nz);
  const plane = nx * ny;
  const totalRot = (opts.rotationDegrees * Math.PI) / 180;

  masks.forEach((mask, f) => {
    const theta = (f / masks.length) * totalRot;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    for (let iz = 0; iz < nz; iz++) {
      const z = (iz + 0.5) * voxel - radius;
      for (let ix = 0; ix < nx; ix++) {
        const x = (ix + 0.5) * voxel - radius;
        const u = Math.round(axisX + x * c - z * s);
        const base = ix + iz * plane;
        if (u < 0 || u >= w) {
          for (let iy = 0; iy < ny; iy++) misses[base + iy * nx]++;
          continue;
        }
        for (let iy = 0; iy < ny; iy++) {
          const v = Math.min(h - 1, Math.round(yMin + (iy + 0.5) * voxel));
          if (!mask.data[v * w + u]) misses[base + iy * nx]++;
        }
      }
    }
  });

  const allowed = Math.floor(opts.tolerance * masks.length);
  const data = new Uint8Array(misses.length);
  for (let i = 0; i < data.length; i++) data[i] = misses[i] <= allowed ? 1 : 0;
  return { nx, ny, nz, data };
}

function bbox(m: Mask) {
  let minX = m.width;
  let maxX = -1;
  let minY = m.height;
  let maxY = -1;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      if (!m.data[y * m.width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, maxX, minY, maxY };
}
