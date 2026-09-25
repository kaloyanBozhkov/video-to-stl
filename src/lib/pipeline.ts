import { forEachFrame } from "./frames";
import { processFrame, reconstruct, defaultReconstructOptions, type ReconstructOptions, type Reconstruction, type View } from "./reconstruct";
import { meshToBinaryStl } from "./stl";

export interface PipelineOptions extends ReconstructOptions {
  frames: number;
  maxFrameSize: number;
}

export const defaultOptions: PipelineOptions = {
  ...defaultReconstructOptions,
  frames: 48,
  maxFrameSize: 1280,
};

export interface PipelineResult extends Reconstruction {
  stl: ArrayBuffer;
  framesTotal: number;
  framesWithMat: number;
  ms: number;
}

export type Stage = "frames" | "calibrate" | "export";
export type ProgressFn = (stage: Stage, fraction: number) => void;

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * video → (per frame) markers + homography + silhouette → self-calibrate camera
 * → perspective visual hull → mesh (mm) → STL.
 */
export async function runPipeline(file: File, o: PipelineOptions, progress: ProgressFn): Promise<PipelineResult> {
  const t0 = performance.now();
  const views: View[] = [];
  const { width, height } = await forEachFrame(file, o.frames, o.maxFrameSize, async (w, h, rgba, i) => {
    const v = processFrame(w, h, rgba, o);
    if (v) views.push(v);
    progress("frames", (i + 1) / o.frames);
    await tick();
  });

  progress("calibrate", 0);
  await tick();
  const r = reconstruct(views, width, height, o);

  progress("export", 0);
  await tick();
  return {
    ...r,
    stl: meshToBinaryStl(r.mesh),
    framesTotal: o.frames,
    framesWithMat: views.length,
    ms: performance.now() - t0,
  };
}
