"use client";

import { useEffect, useRef, useState } from "react";
import { runPipeline, defaultOptions, type PipelineOptions, type PipelineResult, type Stage } from "@/lib/pipeline";
import { StlViewer } from "@/components/StlViewer";
import { MaskStrip } from "@/components/MaskStrip";
import { makeDemoPenVideo } from "@/lib/demoVideo";

const stageLabel: Record<Stage, string> = {
  frames: "Reading frames and finding the mat",
  calibrate: "Solving the camera and carving",
  export: "Writing the STL",
};

type Field = { key: keyof PipelineOptions; label: string; min: number; max: number; step: number; hint: string; unit?: string };
const fields: Field[] = [
  { key: "sensitivity", label: "Object sensitivity", min: 0.1, max: 0.7, step: 0.05, hint: "Raise it if parts of the object are missing. Lower it if shadows get included" },
  { key: "voxelMm", label: "Detail", min: 0.3, max: 2, step: 0.1, unit: "mm", hint: "Voxel size. Smaller means finer detail but slower" },
  { key: "frames", label: "Frames", min: 16, max: 120, step: 8, hint: "Frames sampled from the video" },
  { key: "tolerance", label: "Noise tolerance", min: 0, max: 0.3, step: 0.02, hint: "Raise it if thin parts get eaten away" },
  { key: "maxHeightMm", label: "Max object height", min: 10, max: 120, step: 5, unit: "mm", hint: "How tall the object can be" },
  { key: "smoothing", label: "Smoothing", min: 0, max: 20, step: 1, hint: "Surface smoothing passes" },
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [opts, setOpts] = useState<PipelineOptions>(defaultOptions);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
      setStatus(`Done in ${(r.ms / 1000).toFixed(1)}s`);
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
    setStatus("Filming a virtual pen on the mat (6s)…");
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

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError("");
  };

  return (
    <main>
      <h1>Video → STL</h1>
      <p className="lead">
        Put your pen on the printed scan mat, walk your phone around it, and get a true-to-size, printable STL.
        Everything runs in your browser, and nothing is uploaded.
      </p>

      <section className="card steps">
        <ol>
          <li>
            <b>Print the mat.</b> Use A4 at 100% scale. <a href="/mat">Open the scan mat →</a>
          </li>
          <li>
            <b>Lay the object in the plain middle area.</b> A dark or coloured object works best on the white paper.
          </li>
          <li>
            <b>Film a slow full circle around it</b> (10–20s), looking down at about 30–60°. Keep most of the mat
            in frame.
          </li>
        </ol>
      </section>

      <section className="card">
        <div className="uploads">
          <label className="upload">
            <input type="file" accept="video/*" capture="environment" onChange={pick} />
            <span>🎥 Record video</span>
          </label>
          <label className="upload">
            <input type="file" accept="video/*" onChange={pick} />
            <span>📁 Choose file</span>
          </label>
        </div>
        <p className="filename">{file ? `Selected: ${file.name}` : "No video selected yet"}</p>

        <button className="link" onClick={() => setShowAdvanced((s) => !s)}>
          {showAdvanced ? "Hide" : "Show"} advanced settings
        </button>
        {showAdvanced && (
          <div className="grid">
            {fields.map((f) => (
              <label key={f.key} title={f.hint}>
                <span>
                  {f.label}{" "}
                  <b>
                    {opts[f.key]}
                    {f.unit}
                  </b>
                </span>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={opts[f.key]}
                  onChange={(e) => setOpts({ ...opts, [f.key]: Number(e.target.value) })}
                />
                <small>{f.hint}</small>
              </label>
            ))}
          </div>
        )}

        <div className="actions">
          <button onClick={run} disabled={!file || busy}>
            {busy ? "Working…" : "Generate STL"}
          </button>
          <button onClick={demo} disabled={busy} className="secondary">
            No video? Use a demo pen
          </button>
          <span className="status">{status}</span>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <div ref={resultsRef}>
          <section className="card">
            <h2>Model</h2>
            <div className="stats">
              <div>
                <b>
                  {result.sizeMm
                    .slice()
                    .sort((a, b) => b - a)
                    .map((x) => x.toFixed(1))
                    .join(" × ")}
                </b>
                <span>size (mm)</span>
              </div>
              <div>
                <b>
                  {result.used.length}/{result.framesTotal}
                </b>
                <span>frames used</span>
              </div>
              <div>
                <b>{result.reprojErrorPx.toFixed(2)}px</b>
                <span>tracking error</span>
              </div>
              <div>
                <b>{(result.mesh.indices.length / 3).toLocaleString()}</b>
                <span>triangles</span>
              </div>
            </div>
            <StlViewer mesh={result.mesh} />
            <button onClick={download} className="download">
              ⬇ Download STL
            </button>
          </section>
          <section className="card">
            <h2>What the scanner saw</h2>
            <p className="hint">
              Orange = object, dark = paper, grey = ignored (off the plain area). If the orange shapes don&apos;t match
              the object, adjust <i>Object sensitivity</i> in advanced settings.
            </p>
            <MaskStrip masks={result.used.map((v) => v.mask)} />
          </section>
        </div>
      )}

      <section className="card tips">
        <h2>Tips</h2>
        <ul>
          <li>Use even, soft light. Hard shadows next to the object can get added to the model.</li>
          <li>Move slowly, since motion blur hides the markers. Aim for at least half the mat in every frame.</li>
          <li>Film from high and low angles. Low angles define the height, high angles define the outline.</li>
          <li>Shiny, white or transparent objects are hard. Cover them in matte tape or dry shampoo spray.</li>
          <li>Silhouettes can&apos;t see dents or holes. Concave areas come out filled in.</li>
        </ul>
      </section>
    </main>
  );
}
