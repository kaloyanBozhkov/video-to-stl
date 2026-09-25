"use client";

import { useEffect, useRef, useState } from "react";
import { runPipeline, defaultOptions, type PipelineOptions, type PipelineResult, type Stage } from "@/lib/pipeline";
import { StlViewer } from "@/components/StlViewer";
import { MaskStrip } from "@/components/MaskStrip";
import { makeDemoPenVideo } from "@/lib/demoVideo";

const stageLabel: Record<Stage, string> = {
  frames: "Extracting frames",
  segment: "Finding the object",
  carve: "Carving the 3D shape",
  mesh: "Building the mesh",
  export: "Writing the STL",
};

type Field = { key: keyof PipelineOptions; label: string; min: number; max: number; step: number; hint: string };
const fields: Field[] = [
  { key: "targetMm", label: "Real length (mm)", min: 10, max: 300, step: 1, hint: "Longest side of the real object. A pen is ~140mm" },
  { key: "rotationDegrees", label: "Rotation in video (°)", min: 90, max: 720, step: 10, hint: "How far the object turns over the whole clip" },
  { key: "threshold", label: "Background threshold", min: 10, max: 200, step: 5, hint: "Raise it if background leaks into the masks" },
  { key: "frames", label: "Frames", min: 8, max: 120, step: 4, hint: "More frames give a tighter hull but run slower" },
  { key: "resolution", label: "Voxel resolution", min: 32, max: 256, step: 16, hint: "Voxels along the longest side" },
  { key: "smoothing", label: "Smoothing", min: 0, max: 30, step: 1, hint: "Taubin passes" },
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [opts, setOpts] = useState<PipelineOptions>(defaultOptions);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<PipelineResult | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // On phones the results are below the fold, so bring them into view.
  useEffect(() => {
    if (result) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  async function run() {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await runPipeline(file, opts, (stage, f) =>
        setStatus(`${stageLabel[stage]}${f ? ` ${Math.round(f * 100)}%` : "…"}`),
      );
      setResult(r);
      setStatus(`Done in ${(r.stats.ms / 1000).toFixed(1)}s: ${r.stats.triangles.toLocaleString()} triangles`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function demo() {
    setBusy(true);
    setError("");
    setStatus("Recording a synthetic pen video…");
    try {
      setFile(await makeDemoPenVideo());
      setStatus("Demo video ready. Hit Generate STL");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.stl], { type: "model/stl" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file?.name.replace(/\.[^.]+$/, "") || "scan"}.stl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <h1>Video → STL</h1>
      <p className="lead">
        Film your pen spinning on a turntable, or walk a steady circle around it, against a plain, contrasting
        background. We carve a 3D model from its silhouettes and give you a printable STL. Everything runs in your
        browser, and nothing is uploaded.
      </p>

      <section className="card">
        <div className="uploads">
          <label className="upload">
            <input
              type="file"
              accept="video/*"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <span>🎥 Record video</span>
          </label>
          <label className="upload">
            <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <span>📁 Choose file</span>
          </label>
        </div>
        <p className="filename">{file ? `Selected: ${file.name}` : "No video selected yet"}</p>

        <div className="grid">
          {fields.map((f) => (
            <label key={f.key} title={f.hint}>
              <span>
                {f.label} <b>{opts[f.key]}</b>
              </span>
              <input
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={opts[f.key]}
                onChange={(e) => setOpts({ ...opts, [f.key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>

        <div className="actions">
          <button onClick={run} disabled={!file || busy}>
            {busy ? "Working…" : "Generate STL"}
          </button>
          <button onClick={demo} disabled={busy} className="secondary">
            No video? Use a demo pen
          </button>
          <button onClick={download} disabled={!result} className="secondary">
            Download STL
          </button>
          <span className="status">{status}</span>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <div ref={resultsRef}>
          <section className="card">
            <h2>Silhouettes</h2>
            <p className="hint">The object should be white and the background black. If it isn&apos;t, adjust the threshold.</p>
            <MaskStrip masks={result.masks} />
          </section>
          <section className="card">
            <h2>Model</h2>
            <StlViewer mesh={result.mesh} />
          </section>
        </div>
      )}

      <section className="card tips">
        <h2>Tips for a good scan</h2>
        <ul>
          <li>Use a plain background (white paper behind a dark pen, or the other way round).</li>
          <li>Keep the camera still and level. Let the object rotate one full turn at a steady speed.</li>
          <li>Keep the whole object in frame the entire time.</li>
          <li>This method can&apos;t see concavities. For real detail, swap in COLMAP + OpenMVS (see README).</li>
        </ul>
      </section>
    </main>
  );
}
