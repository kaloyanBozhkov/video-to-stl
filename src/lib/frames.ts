/**
 * Walk evenly spaced frames of a video file using a hidden <video> + canvas.
 * Frames are handed to `onFrame` one at a time so we never hold them all in memory.
 */
export async function forEachFrame(
  file: File,
  count: number,
  maxSize: number,
  onFrame: (width: number, height: number, rgba: Uint8ClampedArray, index: number) => void | Promise<void>,
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await once(video, "loadedmetadata");
    // iOS Safari won't decode frames for seeking until playback has been started once.
    try {
      await video.play();
      video.pause();
    } catch {
      /* autoplay refused — seeking still works on most browsers */
    }
    // Freshly recorded webm can report Infinity; seeking far forces a real duration.
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

    for (let i = 0; i < count; i++) {
      video.currentTime = Math.min(duration - 0.05, ((i + 0.5) / count) * duration);
      await once(video, "seeked");
      ctx.drawImage(video, 0, 0, width, height);
      await onFrame(width, height, ctx.getImageData(0, 0, width, height).data, i);
    }
    return { width, height };
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
      reject(new Error("Could not decode video. Try an MP4 (H.264) or WebM file"));
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener("error", fail, { once: true });
  });
}
