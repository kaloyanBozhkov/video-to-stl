// Typed wrapper around a vendored ESM copy of js-aruco2. The npm build is
// CommonJS that assigns to top-level `this`, which breaks in the browser bundle.
import { AR as RawAR } from "@/vendor/js-aruco2/aruco.js";

interface ArucoNS {
  Detector: new (config?: { dictionaryName?: string; maxHammingDistance?: number }) => {
    detectImage(width: number, height: number, data: Uint8ClampedArray): { id: number; corners: { x: number; y: number }[] }[];
  };
  Dictionary: new (name: string) => { codeList: string[]; markSize: number };
}

export const AR = RawAR as ArucoNS;
export const DICTIONARY = "ARUCO_MIP_36h12";
