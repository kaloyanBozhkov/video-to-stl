import { AR, DICTIONARY } from "./aruco";

/**
 * The printable calibration mat: A4 portrait, ArUco markers around the border,
 * plain paper in the middle where the object goes.
 *
 * World frame (mm): origin at the sheet's bottom-left corner, X right, Y up the
 * sheet, Z up out of the paper. So the object sits at Z ≥ 0.
 */
export const SHEET = { width: 210, height: 297 };
export const MARKER_MM = 30; // black square edge, incl. the 1-cell black border
const CELLS = 8; // 6×6 data bits + border

/** Plain area where the object may sit (world mm). */
export const REGION = { x0: 48, x1: 162, y0: 48, y1: 249 };

export interface MatMarker {
  id: number;
  /** Top-left of the black square in sheet coords (mm, y down, as printed). */
  sx: number;
  sy: number;
}

export const MARKERS: MatMarker[] = (() => {
  const out: MatMarker[] = [];
  const top = [10, 50, 90, 130, 170];
  const side = Array.from({ length: 7 }, (_, k) => 10 + (k * (SHEET.height - 20 - MARKER_MM)) / 6);
  let id = 0;
  for (const x of top) out.push({ id: id++, sx: x, sy: 10 });
  for (const y of side.slice(1, -1)) out.push({ id: id++, sx: 170, sy: y });
  for (const x of [...top].reverse()) out.push({ id: id++, sx: x, sy: SHEET.height - 10 - MARKER_MM });
  for (const y of side.slice(1, -1).reverse()) out.push({ id: id++, sx: 10, sy: y });
  return out;
})();

export const MARKER_BY_ID = new Map(MARKERS.map((m) => [m.id, m]));

/** Sheet (y down) → world (y up). */
export const sheetToWorld = (sx: number, sy: number): [number, number] => [sx, SHEET.height - sy];

/**
 * World-space corners of a marker, in the same order js-aruco2 reports image
 * corners: top-left, top-right, bottom-right, bottom-left of the printed marker.
 */
export function markerCornersWorld(m: MatMarker): [number, number][] {
  const s = MARKER_MM;
  return [
    sheetToWorld(m.sx, m.sy),
    sheetToWorld(m.sx + s, m.sy),
    sheetToWorld(m.sx + s, m.sy + s),
    sheetToWorld(m.sx, m.sy + s),
  ];
}

/** Black rectangles (sheet mm) that make up the mat — shared by SVG, textures and tests. */
export function matBlackRects(): { x: number; y: number; w: number; h: number }[] {
  const dict = new AR.Dictionary(DICTIONARY);
  const cell = MARKER_MM / CELLS;
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (const m of MARKERS) {
    const code = dict.codeList[m.id];
    const bits = CELLS - 2;
    // Border
    rects.push({ x: m.sx, y: m.sy, w: MARKER_MM, h: cell });
    rects.push({ x: m.sx, y: m.sy + MARKER_MM - cell, w: MARKER_MM, h: cell });
    rects.push({ x: m.sx, y: m.sy + cell, w: cell, h: MARKER_MM - 2 * cell });
    rects.push({ x: m.sx + MARKER_MM - cell, y: m.sy + cell, w: cell, h: MARKER_MM - 2 * cell });
    for (let r = 0; r < bits; r++)
      for (let c = 0; c < bits; c++)
        if (code[r * bits + c] === "0")
          rects.push({ x: m.sx + (c + 1) * cell, y: m.sy + (r + 1) * cell, w: cell, h: cell });
  }
  return rects;
}

export function matSvg(): string {
  const rects = matBlackRects()
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w + 0.02}" height="${r.h + 0.02}"/>`)
    .join("");
  const { x0, x1, y0, y1 } = REGION;
  const [rx, ry] = [x0, SHEET.height - y1];
  const tick = 4;
  const corners = [
    [rx, ry, 1, 1], [x1, ry, -1, 1], [x1, SHEET.height - y0, -1, -1], [rx, SHEET.height - y0, 1, -1],
  ]
    .map(([x, y, dx, dy]) => `<path d="M${x + dx * tick} ${y} H${x} V${y + dy * tick}" />`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET.width}mm" height="${SHEET.height}mm" viewBox="0 0 ${SHEET.width} ${SHEET.height}">
<rect width="100%" height="100%" fill="#fff"/>
<g fill="#000">${rects}</g>
<g fill="none" stroke="#ddd" stroke-width="0.4">${corners}</g>
</svg>`;
}
