# Video → STL

Film an object (like a pen) on a printed marker mat, walking your phone around it, and get a **true-to-scale** STL for 3D printing. Everything runs in the browser, and nothing is uploaded.

Live: https://video-to-stl.vercel.app · Printable mat: https://video-to-stl.vercel.app/mat

## How to scan

1. Open `/mat` and print it on A4 at **100% / actual size**.
2. Put the object in the plain middle area.
3. Film a slow full circle around it (10–20s), looking down at 30–60°, with most of the mat in view.
4. Upload the video and hit **Generate STL**. No video? The **demo pen** button renders a synthetic one.

## How it works

| Step | File |
|---|---|
| Sample N frames from the video | `src/lib/frames.ts` |
| Detect ArUco markers (MIP_36h12, 20 around the sheet border) | `src/lib/detect.ts`, `src/lib/mat.ts` |
| Homography, then camera pose, plus **focal self-calibration** (golden-section search on reprojection error), refined with Gauss–Newton | `src/lib/geometry.ts` |
| Segment the object vs. the plain paper (local paper brightness plus saturation) | `src/lib/segmentMat.ts` |
| Coarse-to-fine perspective **visual hull** in millimetres | `src/lib/carveMat.ts` |
| Largest blob, then voxel faces, then Taubin smoothing, then binary STL | `src/lib/mesh.ts`, `src/lib/stl.ts` |

The mat gives both a known scale and a camera pose for every frame, so a handheld, moving camera works and the output is in real mm.

## Develop

```bash
pnpm i
pnpm dev
pnpm selftest   # renders a synthetic pen on the mat from 24 views, checks focal + size
```

## Limits

- It is silhouette-based, so concavities (holes, dents) come out filled.
- Shiny, white or transparent objects segment badly. Matte them first.
- The object must fit in the ~114 × 200mm plain area.

`js-aruco2` (MIT) is vendored as ESM in `src/vendor/js-aruco2`.
