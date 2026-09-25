import { calibrate, homography, type Camera, type Correspondence, type Mat3 } from "./geometry";
import { detectMat } from "./detect";
import { segmentOnMat, type Mask } from "./segmentMat";
import { carveOnMat } from "./carveMat";
import { largestBlob, toMillimetres, voxelsToMesh, meshSize, type Mesh } from "./mesh";

/** DOM-free core, shared by the browser pipeline and the headless test. */

export interface ReconstructOptions {
  sensitivity: number; // 0–1: how much darker than paper counts as object
  voxelMm: number;
  maxHeightMm: number;
  tolerance: number;
  smoothing: number;
  minMarkers: number;
}

export const defaultReconstructOptions: ReconstructOptions = {
  sensitivity: 0.35,
  voxelMm: 0.5,
  maxHeightMm: 40,
  tolerance: 0.08,
  smoothing: 6,
  minMarkers: 4,
};

export interface View {
  pts: Correspondence[];
  H: Mat3;
  mask: Mask;
  markers: number;
}

/** Per-frame work: markers → homography → silhouette. Returns null if the mat isn't visible enough. */
export function processFrame(width: number, height: number, rgba: Uint8ClampedArray, o: ReconstructOptions): View | null {
  const { pts, markers } = detectMat(width, height, rgba);
  if (markers < o.minMarkers) return null;
  const H = homography(pts);
  return { pts, H, markers, mask: segmentOnMat(width, height, rgba, H, o.sensitivity) };
}

export interface Reconstruction {
  mesh: Mesh;
  cams: Camera[];
  used: View[];
  focalPx: number;
  reprojErrorPx: number;
  sizeMm: [number, number, number];
}

export function reconstruct(views: View[], width: number, height: number, o: ReconstructOptions): Reconstruction {
  if (views.length < 6) throw new Error(`Only ${views.length} frames showed the mat clearly. Need at least 6: keep more of the mat in view and move slower.`);
  const { cams, errors, f } = calibrate(views, width, height);

  // Drop frames whose pose doesn't fit (motion blur, mis-detected marker).
  const sorted = [...errors].sort((a, b) => a - b);
  const limit = Math.max(2, sorted[sorted.length >> 1] * 3);
  const keep = views.map((_, i) => i).filter((i) => errors[i] <= limit);
  const used = keep.map((i) => views[i]);
  const usedCams = keep.map((i) => cams[i]);
  const rms = Math.sqrt(keep.reduce((a, i) => a + errors[i] ** 2, 0) / keep.length);

  const { grid } = carveOnMat(used.map((v) => v.mask), usedCams, o);
  const solid = largestBlob(grid);
  const mesh = toMillimetres(voxelsToMesh(solid, o.smoothing), grid.voxel);
  return { mesh, cams: usedCams, used, focalPx: f, reprojErrorPx: rms, sizeMm: meshSize(mesh) };
}
