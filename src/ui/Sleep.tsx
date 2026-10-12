import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { engine } from "../game/engine";
import { Perlin } from "../game/noise";

function makeRock() {
  const geo = new THREE.IcosahedronGeometry(1.4, 6);
  const p = new Perlin(Math.floor(Math.random() * 1e6));
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const stretch = new THREE.Vector3(1 + Math.random() * 0.4, 0.8 + Math.random() * 0.3, 1 + Math.random() * 0.2);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const big = p.fbm(v.x * 1.2, v.y * 1.2, v.z * 1.2, 3) * 0.45;
    const mid = p.fbm(v.x * 4 + 9, v.y * 4, v.z * 4, 4) * 0.16;
    const fine = p.noise3(v.x * 18, v.y * 18, v.z * 18) * 0.025;
    const facet = Math.abs(p.noise3(v.x * 2.5 + 30, v.y * 2.5, v.z * 2.5)) < 0.05 ? -0.05 : 0;
    const r = 1.4 * (1 + big + mid + fine + facet);
    v.multiply(stretch).multiplyScalar(r);
    pos.setXYZ(i, v.x, v.y, v.z);
    const strata = 0.5 + 0.5 * Math.sin(v.y * 9 + big * 10);
    const lichen = p.noise3(v.x * 3 + 70, v.y * 3, v.z * 3) > 0.3 ? 1 : 0;
    const base = 0.38 + mid * 1.2 + strata * 0.08;
    colors[i * 3] = base * (lichen ? 0.75 : 1.02);
    colors[i * 3 + 1] = base * (lichen ? 1.05 : 0.97);
    colors[i * 3 + 2] = base * (lichen ? 0.55 : 0.9);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.05, flatShading: true }));
}

export function SleepPanel() {
  const mount = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [spin, setSpin] = useState(0);
  useEffect(() => {
    const el = mount.current!;
    const w = el.clientWidth, h = el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    const observer = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      cam.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      cam.updateProjectionMatrix();
    });
    observer.observe(el);
    cam.position.set(0, 0.6, 7);
    cam.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0x9ab0ff, 0x2a1a10, 0.6));
    const key = new THREE.DirectionalLight(0xffe0b0, 2.2);
    key.position.set(3, 4, 5);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7a8aff, 1.2);
    rim.position.set(-4, 1, -3);
    scene.add(rim);
    const rock = makeRock();
    rock.castShadow = true;
    scene.add(rock);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.2;
    floor.receiveShadow = true;
    scene.add(floor);

    // rigid-body-ish rotation: angular velocity with damping, drag applies torque
    const omega = new THREE.Vector3(0.3, 0.6, 0);
    let dragging = false;
    let lx = 0, ly = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      omega.y += dx * 0.012;
      omega.x += dy * 0.012;
    };
    const up = () => (dragging = false);
    const wheel = (e: WheelEvent) => {
      omega.z += e.deltaY * -0.002;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: true });
    let raf = 0, last = performance.now(), total = 0, prog = 0;
    const q = new THREE.Quaternion();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const speed = omega.length();
      if (speed > 1e-4) {
        q.setFromAxisAngle(omega.clone().normalize(), speed * dt);
        rock.quaternion.premultiply(q);
      }
      omega.multiplyScalar(1 - 0.6 * dt);
      total += speed * dt;
      prog = Math.min(1, prog + dt / 6);
      setProgress(prog);
      setSpin(total);
      rock.position.y = Math.sin(t / 900) * 0.08;
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      renderer.dispose();
      observer.disconnect();
      rock.geometry.dispose();
      (rock.material as THREE.Material).dispose();
      floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[radial-gradient(circle,#1a1530,#050308)] font-mono text-white">
      <div className="text-sm tracking-[0.4em] text-[#9ab0ff] mb-1">SLEEPING</div>
      <div className="text-xs text-white/50 mb-3">Input focus locked to the rock. Drag to apply torque · wheel to roll.</div>
      <div ref={mount} className="cursor-grab active:cursor-grabbing border-2 border-white/10" style={{ width: "min(560px, 88vw)", height: "min(420px, 52dvh)", touchAction: "none" }} />
      <div className="w-[560px] max-w-[88vw] mt-3">
        <div className="flex justify-between text-xs text-white/60">
          <span>Limb integrity recovering...</span>
          <span>rock rotation: {(spin / (Math.PI * 2)).toFixed(1)} rev</span>
        </div>
        <div className="h-2 bg-black border border-white/20 mt-1">
          <div className="h-full bg-gradient-to-r from-[#3a4aff] to-[#9ab0ff]" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <button disabled={progress < 1} onClick={() => engine.finishSleep()} className="mt-5 px-8 py-2 border-4 border-[#9ab0ff] text-[#9ab0ff] tracking-[0.3em] hover:bg-[#9ab0ff] hover:text-black disabled:opacity-30">
        {progress < 1 ? "RESTING..." : "WAKE UP"}
      </button>
    </div>
  );
}
