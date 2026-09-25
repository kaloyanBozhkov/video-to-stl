// End-to-end headless check: ray-traced views of a Ø10×130mm pen on the mat,
// camera circling around it → markers → self-calibration → carve → STL.
import { render, lookAt, PEN } from "./synth";
import { processFrame, reconstruct, defaultReconstructOptions, type View } from "../src/lib/reconstruct";
import { meshToBinaryStl } from "../src/lib/stl";
import { writeFileSync } from "node:fs";

const W = 960, H = 720, F = 0.85 * W;
const views: View[] = [];
const t0 = Date.now();
const N = 24;
for (let i = 0; i < N; i++) {
  const az = (i / N) * Math.PI * 2;
  const el = (40 + 15 * Math.sin(az * 2)) * (Math.PI / 180);
  const dist = 330;
  const target: [number, number, number] = [105, 148, 0];
  const eye: [number, number, number] = [
    target[0] + dist * Math.cos(el) * Math.cos(az),
    target[1] + dist * Math.cos(el) * Math.sin(az),
    dist * Math.sin(el),
  ];
  const cam = lookAt(eye, target, F, W, H);
  const v = processFrame(W, H, render(cam, W, H), defaultReconstructOptions);
  if (v) views.push(v);
}
console.log(`rendered+detected ${views.length}/${N} frames in ${Date.now() - t0}ms; markers/frame:`, views.map((v) => v.markers).join(","));

const t1 = Date.now();
const r = reconstruct(views, W, H, defaultReconstructOptions);
const stl = meshToBinaryStl(r.mesh);
writeFileSync("/tmp/selftest.stl", Buffer.from(stl));
const [sx, sy, sz] = r.sizeMm;
console.log({
  focal: `${r.focalPx.toFixed(1)} (true ${F})`,
  reprojPx: r.reprojErrorPx.toFixed(2),
  usedFrames: r.used.length,
  sizeMm: r.sizeMm.map((x) => x.toFixed(1)).join(" × "),
  expected: `${PEN.r * 2} × ${PEN.r * 2} (height) × ${PEN.y1 - PEN.y0}`,
  triangles: r.mesh.indices.length / 3,
  ms: Date.now() - t1,
});
const fail = (m: string) => { console.error("FAIL:", m); process.exit(1); };
if (Math.abs(r.focalPx - F) / F > 0.05) fail("focal length off by >5%");
if (Math.abs(sz - (PEN.y1 - PEN.y0)) > 3) fail("length off by >3mm");
if (Math.abs(sx - 2 * PEN.r) > 2 || Math.abs(sy - 2 * PEN.r) > 2.5) fail("diameter off");
console.log("OK");
