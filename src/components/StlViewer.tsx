"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Mesh } from "@/lib/mesh";

export function StlViewer({ mesh }: { mesh: Mesh }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const { clientWidth: w, clientHeight: h } = el;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f1115");
    scene.add(new THREE.HemisphereLight("#ffffff", "#334", 1.2));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(1, 2, 1.5);
    scene.add(sun);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const model = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#f5a524", roughness: 0.55, metalness: 0.05 }));
    scene.add(model);

    const r = geo.boundingSphere?.radius ?? 50;
    const centre = geo.boundingSphere?.center ?? new THREE.Vector3();
    const grid = new THREE.GridHelper(r * 3, 20, "#444", "#222");
    scene.add(grid);

    const camera = new THREE.PerspectiveCamera(40, w / h, r / 100, r * 20);
    camera.position.set(centre.x + r * 1.8, centre.y + r * 0.9, centre.z + r * 2.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(centre);
    controls.autoRotate = true;
    controls.enableDamping = true;

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      controls.dispose();
      geo.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [mesh]);

  return <div ref={host} className="viewer" />;
}
