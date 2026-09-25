/**
 * Pull evenly spaced frames out of a video file using a hidden <video> + canvas.
 * Runs entirely in the browser — no ffmpeg needed for the demo.
 */
export interface Frame {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export async function extractFrames(
  file: File,
  count: number,
  maxSize: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Frame[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await once(video, "loadedmetadata");
    // Some browsers report Infinity for freshly recorded webm; force a duration.
    if (!Number.isFinite(video.duration)) {
      video.currentTime = 1e9;
      await once(video, "seeked");
    }
    const duration = video.duration;
    const scale = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    const frames: Frame[] = [];
    for (let i = 0; i < count; i++) {
      // Sample across [0, duration) so frame 0 and frame N don't duplicate the same pose.
      video.currentTime = Math.min(duration - 0.001, (i / count) * duration);
      await once(video, "seeked");
      ctx.drawImage(video, 0, 0, width, height);
      frames.push({ width, height, data: ctx.getImageData(0, 0, width, height).data });
      onProgress?.(i + 1, count);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function once(el: HTMLElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      el.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      el.removeEventListener(event, ok);
      reject(new Error("Could not decode video — try an MP4 (H.264) or WebM file"));
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener("error", fail, { once: true });
  });
}
