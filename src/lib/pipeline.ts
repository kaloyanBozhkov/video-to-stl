import { extractFrames } from "./frames";
import { segment, type Mask } from "./segment";
import { carveVisualHull } from "./carve";
import { voxelsToMesh, scaleToMillimetres, type Mesh } from "./mesh";
import { meshToBinaryStl } from "./stl";

export interface PipelineOptions {
  frames: number;
  maxFrameSize: number;
  threshold: number;
  resolution: number;
  rotationDegrees: number;
  tolerance: number;
  smoothing: number;
  targetMm: number;
}

export const defaultOptions: PipelineOptions = {
  frames: 36,
  maxFrameSize: 480,
  threshold: 60,
  resolution: 128,
  rotationDegrees: 360,
  tolerance: 0.05,
  smoothing: 8,
  targetMm: 140, // a typical ballpoint pen
};

export interface PipelineResult {
  masks: Mask[];
  mesh: Mesh;
  stl: ArrayBuffer;
  stats: { triangles: number; voxels: number; ms: number };
}

export type Stage = "frames" | "segment" | "carve" | "mesh" | "export";
export type ProgressFn = (stage: Stage, fraction: number) => void;

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * video → frames → silhouettes → visual hull → mesh → STL.
 * Each stage is a separate module so any one of them can be replaced by a
 * server-side implementation (see src/app/api/reconstruct/route.ts).
 */
export async function runPipeline(file: File, o: PipelineOptions, progress: ProgressFn): Promise<PipelineResult> {
  const t0 = performance.now();
  const frames = await extractFrames(file, o.frames, o.maxFrameSize, (d, n) => progress("frames", d / n));

  progress("segment", 0);
  await tick();
  const masks = frames.map((f) => segment(f, o.threshold));

  progress("carve", 0);
  await tick();
  const grid = carveVisualHull(masks, o);
  const voxels = grid.data.reduce((a, b) => a + b, 0);
  if (voxels === 0) throw new Error("Everything got carved away — check the rotation setting and that the object stays in frame");

  progress("mesh", 0);
  await tick();
  const mesh = scaleToMillimetres(voxelsToMesh(grid, o.smoothing), o.targetMm);

  progress("export", 0);
  await tick();
  const stl = meshToBinaryStl(mesh);

  return { masks, mesh, stl, stats: { triangles: mesh.indices.length / 3, voxels, ms: performance.now() - t0 } };
}
