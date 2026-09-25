# video-to-stl

Record a video of an object (like a pen), get a 3D-printable STL. It's a barebones Next.js + TypeScript demo.

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm selftest   # headless check: synthetic pen → watertight STL
```

No video handy? Click **"No video? Use a demo pen"**. The app renders and records a synthetic turntable clip, then runs it through the pipeline.

## How it works (all in the browser)

```
video ─▶ frames ─▶ silhouettes ─▶ visual hull ─▶ mesh ─▶ STL
        frames.ts  segment.ts     carve.ts       mesh.ts  stl.ts
```

| Stage | Demo implementation | Production swap |
|---|---|---|
| Frames | `<video>` seek + canvas | ffmpeg |
| Segmentation | border-colour key, largest blob, hole fill | SAM 2 / rembg |
| Reconstruction | shape-from-silhouette voxel carving (turntable model) | COLMAP (SfM + MVS), OpenMVS, or nerfstudio / 2DGS |
| Meshing | voxel faces + Taubin smoothing | marching cubes on a TSDF / Poisson (Open3D) |
| Export | binary STL, scaled to the real length in mm, Z-up | + trimesh / PyMeshLab repair |

`src/app/api/reconstruct/route.ts` is the stub for a server-side reconstructor. It returns 501 for now.

## Filming tips

- Use a plain background with strong contrast (a dark pen on white paper).
- Keep the camera fixed and level. Turn the object one full revolution at a steady speed (a lazy susan works).
- Keep the object fully in frame.
- If the clip covers more or less than one turn, set **Rotation in video** to match.

## Known limits

- A visual hull can't recover concavities. For example, the gap under a pen clip gets filled in.
- It assumes constant rotation speed and a roughly orthographic camera, with no camera pose estimation.
- Glossy or transparent objects break the background keying.
