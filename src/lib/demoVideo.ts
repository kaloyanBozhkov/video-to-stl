import * as THREE from "three";

/**
 * Renders a synthetic turntable video of a pen (a body, a cone tip and a clip) and
 * records it with MediaRecorder. It lets people try the pipeline without filming
 * anything, and it gives us a known-good input for testing.
 */
export async function makeDemoPenVideo(seconds = 4): Promise<File> {
  const w = 360, h = 480;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f4f4f4");
  const camera = new THREE.OrthographicCamera(-60, 60, 80, -80, 1, 1000);
  camera.position.set(0, 0, 300);

  const pen = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: "#1d3a8a" });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 110, 32), mat);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(5, 18, 32), mat);
  tip.position.y = -64;
  tip.rotation.x = Math.PI;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 8, 32), mat);
  cap.position.y = 59;
  const clip = new THREE.Mesh(new THREE.BoxGeometry(3, 40, 3), mat);
  clip.position.set(0, 38, 7.5);
  pen.add(body, tip, cap, clip);
  scene.add(pen);

  const stream = canvas.captureStream(30);
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (recorder.onstop = r));

  recorder.start(100);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - start) / 1000;
      pen.rotation.y = Math.min(1, t / seconds) * Math.PI * 2;
      renderer.render(scene, camera);
      if (t < seconds) requestAnimationFrame(frame);
      else resolve();
    };
    frame();
  });
  recorder.stop();
  await stopped;
  renderer.dispose();

  const type = recorder.mimeType || "video/webm";
  return new File(chunks, `demo-pen.${type.includes("mp4") ? "mp4" : "webm"}`, { type });
}
