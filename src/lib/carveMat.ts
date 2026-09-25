import { project, type Camera } from "./geometry";
import { REGION } from "./mat";
import { BG, OBJ, type Mask } from "./segmentMat";

export interface VoxelGrid {
  nx: number;
  ny: number;
  nz: number;
  data: Uint8Array;
  /** Edge length of one voxel, mm. */
  voxel: number;
}

export interface CarveOptions {
  voxelMm: number;
  maxHeightMm: number;
  /** Fraction of views allowed to see a voxel as background before it's carved. */
  tolerance: number;
}

interface Box { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

/**
 * Perspective visual hull over the mat's plain area, coarse-to-fine:
 * a 2mm pass finds where the object is, then a fine pass carves only that box.
 *
 * Output grid axes are arranged for voxelsToMesh(): grid x = world X,
 * grid y = world Z descending (top first), grid z = world Y descending.
 */
export function carveOnMat(masks: Mask[], cams: Camera[], o: CarveOptions): { grid: VoxelGrid; origin: [number, number, number] } {
  const full: Box = { x0: REGION.x0, x1: REGION.x1, y0: REGION.y0, y1: REGION.y1, z0: 0, z1: o.maxHeightMm };
  const coarseMm = Math.max(o.voxelMm, 2);
  const coarse = carveBox(masks, cams, full, coarseMm, o.tolerance);
  const b = occupiedBox(coarse, full, coarseMm);
  if (!b) throw new Error("Nothing survived carving. Is the object on the plain area of the mat, and does it contrast with the paper?");
  const pad = coarseMm * 1.5;
  const box: Box = {
    x0: Math.max(full.x0, b.x0 - pad), x1: Math.min(full.x1, b.x1 + pad),
    y0: Math.max(full.y0, b.y0 - pad), y1: Math.min(full.y1, b.y1 + pad),
    z0: 0, z1: Math.min(full.z1, b.z1 + pad),
  };
  const fine = carveBox(masks, cams, box, o.voxelMm, o.tolerance);
  return { grid: fine, origin: [box.x0, box.y0, box.z0] };
}

function carveBox(masks: Mask[], cams: Camera[], box: Box, vox: number, tolerance: number): VoxelGrid {
  const nx = Math.max(1, Math.ceil((box.x1 - box.x0) / vox));
  const nzW = Math.max(1, Math.ceil((box.y1 - box.y0) / vox)); // world Y
  const nyW = Math.max(1, Math.ceil((box.z1 - box.z0) / vox)); // world Z
  const count = nx * nyW * nzW;
  const bg = new Uint16Array(count);
  const obj = new Uint16Array(count);

  for (let f = 0; f < masks.length; f++) {
    const m = masks[f], cam = cams[f];
    for (let gz = 0; gz < nzW; gz++) {
      const Y = box.y1 - (gz + 0.5) * vox;
      for (let gy = 0; gy < nyW; gy++) {
        const Z = box.z1 - (gy + 0.5) * vox;
        for (let gx = 0; gx < nx; gx++) {
          const X = box.x0 + (gx + 0.5) * vox;
          const [u, v, d] = project(cam, X, Y, Z);
          if (d <= 0) continue;
          const ui = u | 0, vi = v | 0;
          if (ui < 0 || vi < 0 || ui >= m.width || vi >= m.height) continue;
          const label = m.data[vi * m.width + ui];
          const idx = gx + gy * nx + gz * nx * nyW;
          if (label === BG) bg[idx]++;
          else if (label === OBJ) obj[idx]++;
        }
      }
    }
  }

  const data = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const seen = bg[i] + obj[i];
    data[i] = obj[i] >= 3 && bg[i] <= tolerance * seen ? 1 : 0;
  }
  return { nx, ny: nyW, nz: nzW, data, voxel: vox };
}

function occupiedBox(g: VoxelGrid, box: Box, vox: number): Box | null {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let gz = 0; gz < g.nz; gz++)
    for (let gy = 0; gy < g.ny; gy++)
      for (let gx = 0; gx < g.nx; gx++) {
        if (!g.data[gx + gy * g.nx + gz * g.nx * g.ny]) continue;
        const X = box.x0 + gx * vox, Y = box.y1 - (gz + 1) * vox, Z = box.z1 - gy * vox;
        x0 = Math.min(x0, X); x1 = Math.max(x1, X + vox);
        y0 = Math.min(y0, Y); y1 = Math.max(y1, Y + vox);
        z1 = Math.max(z1, Z);
      }
  return x1 < x0 ? null : { x0, x1, y0, y1, z0: 0, z1 };
}
