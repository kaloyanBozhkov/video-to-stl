import { NextResponse } from "next/server";

/**
 * Placeholder for the production reconstructor.
 *
 * The browser demo does silhouette carving, which is fast and needs no backend but
 * can't recover concave detail. The real pipeline would run here, or better, in a
 * GPU worker this route enqueues:
 *
 *   ffmpeg -i in.mp4 -vf fps=3 frames/%04d.jpg          # frames
 *   rembg / SAM 2                                        # masks (optional, helps)
 *   colmap automatic_reconstructor --workspace_path ...  # SfM + dense MVS
 *   OpenMVS: ReconstructMesh → RefineMesh                # or Open3D Poisson
 *   trimesh / PyMeshLab: fill holes, scale, export STL
 */
export async function POST() {
  return NextResponse.json(
    { error: "Server-side reconstruction is not implemented in the demo. See README." },
    { status: 501 },
  );
}
