import { AR, DICTIONARY } from "./aruco";
import { MARKER_BY_ID, markerCornersWorld } from "./mat";
import type { Correspondence } from "./geometry";

let detector: InstanceType<typeof AR.Detector> | null = null;

/** Find mat markers in an RGBA frame → world↔image correspondences. */
export function detectMat(width: number, height: number, data: Uint8ClampedArray): { pts: Correspondence[]; markers: number } {
  detector ??= new AR.Detector({ dictionaryName: DICTIONARY });
  const found = detector.detectImage(width, height, data);
  const pts: Correspondence[] = [];
  const seen = new Set<number>();
  for (const m of found) {
    const def = MARKER_BY_ID.get(m.id);
    if (!def || seen.has(m.id)) continue; // unknown id or duplicate → ignore
    seen.add(m.id);
    const world = markerCornersWorld(def);
    m.corners.forEach((c, k) => pts.push({ world: world[k], image: [c.x, c.y] }));
  }
  return { pts, markers: seen.size };
}
