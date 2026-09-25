import * as THREE from "three";
import { matSvg, SHEET } from "./mat";

/**
 * Renders a synthetic "phone walk-around" video: a pen lying on the printed mat,
 * the camera circling it at varying height, recorded with MediaRecorder.
 * World units are mm with Z up, same as the reconstruction.
 */
export async function makeDemoPenVideo(seconds = 6): Promise<File> {
  const w = 960, h = 720;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#6e655c");
  scene.add(new THREE.AmbientLight("#ffffff", 1.1));
  const sun = new THREE.DirectionalLight("#ffffff", 1.4);
  sun.position.set(80, -120, 300);
  scene.add(sun);

  // Mat
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(matSvg())}`);
  const tex = document.createElement("canvas");
  tex.width = SHEET.width * 8;
  tex.height = SHEET.height * 8;
  tex.getContext("2d")!.drawImage(img, 0, 0, tex.width, tex.height);
  const texture = new THREE.CanvasTexture(tex);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(SHEET.width, SHEET.height), new THREE.MeshBasicMaterial({ map: texture }));
  mat.position.set(SHEET.width / 2, SHEET.height / 2, 0);
  scene.add(mat);

  // Pen, lying along Y (cylinders in three.js run along Y already)
  const penMat = new THREE.MeshLambertMaterial({ color: "#1d3a8a" });
  const pen = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 120, 48), penMat);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(5, 16, 48), penMat);
  tip.position.y = -68;
  tip.rotation.z = Math.PI;
  // Clip sits on top of the barrel (pen-local Z is world Z; the pen isn't rotated).
  const clip = new THREE.Mesh(new THREE.BoxGeometry(3, 36, 2.5), penMat);
  clip.position.set(0, 38, 6.3);
  pen.add(body, tip, clip);
  pen.position.set(105, 150, 5);
  scene.add(pen);

  const camera = new THREE.PerspectiveCamera(48, w / h, 10, 3000);
  camera.up.set(0, 0, 1);
  const target = new THREE.Vector3(105, 148, 0);

  const stream = canvas.captureStream(30);
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
  const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 12_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (recorder.onstop = r));

  recorder.start(100);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = Math.min(1, (performance.now() - start) / 1000 / seconds);
      const az = t * Math.PI * 2 - Math.PI / 2;
      const el = ((42 + 14 * Math.sin(t * Math.PI * 4)) * Math.PI) / 180;
      const dist = 340 + 20 * Math.sin(t * Math.PI * 2);
      camera.position.set(
        target.x + dist * Math.cos(el) * Math.cos(az),
        target.y + dist * Math.cos(el) * Math.sin(az),
        dist * Math.sin(el),
      );
      camera.lookAt(target);
      renderer.render(scene, camera);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    frame();
  });
  recorder.stop();
  await stopped;
  renderer.dispose();
  texture.dispose();

  const type = recorder.mimeType || "video/webm";
  return new File(chunks, `demo-pen-on-mat.${type.includes("mp4") ? "mp4" : "webm"}`, { type });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not render the mat"));
    img.src = src;
  });
}
