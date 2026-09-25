"use client";

import { useEffect, useRef } from "react";
import { OBJ, BG, type Mask } from "@/lib/segmentMat";

/** What the segmenter saw: object = orange, paper = dark, off-mat (ignored) = grey. */
export function MaskStrip({ masks }: { masks: Mask[] }) {
  const step = Math.max(1, Math.floor(masks.length / 10));
  const shown = masks.filter((_, i) => i % step === 0).slice(0, 10);
  return (
    <div className="strip">
      {shown.map((m, i) => (
        <MaskThumb key={i} mask={m} />
      ))}
    </div>
  );
}

function MaskThumb({ mask }: { mask: Mask }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = mask.width;
    c.height = mask.height;
    const img = ctx.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i++) {
      const l = mask.data[i];
      const rgb = l === OBJ ? [245, 165, 36] : l === BG ? [24, 26, 32] : [70, 74, 82];
      img.data.set([...rgb, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }, [mask]);
  return <canvas ref={ref} />;
}
