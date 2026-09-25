import { matSvg } from "@/lib/mat";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Scan mat: print at 100%" };

export default function MatPage() {
  const svg = matSvg();
  return (
    <div className="mat-page">
      <div className="mat-toolbar no-print">
        <a href="/">← Back</a>
        <span>Print on A4 at <b>100% / actual size</b> (not &quot;fit to page&quot;).</span>
        <a download="scan-mat.svg" href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}>
          Download SVG
        </a>
        <PrintButton />
      </div>
      <div className="mat-sheet" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
