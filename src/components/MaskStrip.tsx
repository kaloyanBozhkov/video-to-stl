"use client";

import { useEffect, useRef } from "react";
import type { Mask } from "@/lib/segment";

/** Thumbnails of what the segmenter thinks the object is — the #1 debugging aid. */
export function MaskStrip({ masks }: { masks: Mask[] }) {
  const shown = masks.filter((_, i) => i % Math.max(1, Math.floor(masks.length / 12)) === 0).slice(0, 12);
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
      const v = mask.data[i] ? 255 : 20;
      img.data.set([v, v, v, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }, [mask]);
  return <canvas ref={ref} />;
}
