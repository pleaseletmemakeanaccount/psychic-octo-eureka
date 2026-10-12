import * as THREE from "three";

const matCache = new Map<string, THREE.Material>();
export function mat(color: string, opts: { emissive?: boolean; transparent?: number; side?: THREE.Side } = {}) {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    if (opts.emissive) m = new THREE.MeshBasicMaterial({ color, transparent: opts.transparent !== undefined, opacity: opts.transparent ?? 1, side: opts.side ?? THREE.FrontSide });
    else m = new THREE.MeshLambertMaterial({ color, transparent: opts.transparent !== undefined, opacity: opts.transparent ?? 1, side: opts.side ?? THREE.FrontSide });
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
boxGeo.userData.shared = true;
export function box(parent: THREE.Object3D, w: number, h: number, d: number, color: string | THREE.Material, x: number, y: number, z: number, name?: string) {
  const m = new THREE.Mesh(boxGeo, typeof color === "string" ? mat(color) : color);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  if (name) m.name = name;
  parent.add(m);
  return m;
}

function wingTexture(invert: boolean) {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const g = c.getContext("2d")!;
  const base = invert ? "#ffffff" : "#8a6a48";
  const dark = invert ? "#000000" : "#3a2a1a";
  const eye = invert ? "#00ffff" : "#e8d0a0";
  g.fillStyle = base;
  g.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = Math.random() < 0.5 ? dark : base;
    g.fillRect(Math.floor(Math.random() * 16) * 2, Math.floor(Math.random() * 16) * 2, 2, 2);
  }
  g.fillStyle = dark;
  g.fillRect(14, 10, 8, 8);
  g.fillStyle = eye;
  g.fillRect(16, 12, 4, 4);
  g.fillStyle = dark;
  g.fillRect(0, 0, 32, 2);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Moth humanoid. Named parts: head, torso, lwing, rwing, lleg, rleg, leye, reye */
export function mothModel(invert = false): THREE.Group {
  const g = new THREE.Group();
  const fur = invert ? "#f0f0f0" : "#b89a72";
  const furDark = invert ? "#202020" : "#7a5e40";
  const eyeC = invert ? "#ffffff" : "#111111";
  const torso = new THREE.Group();
  torso.name = "torso";
  g.add(torso);
  box(torso, 0.5, 0.75, 0.32, fur, 0, 0.95, 0);
  box(torso, 0.56, 0.18, 0.38, invert ? "#000" : "#efe6d0", 0, 1.3, 0); // fluffy collar
  box(torso, 0.15, 0.55, 0.15, furDark, -0.33, 0.95, 0);
  box(torso, 0.15, 0.55, 0.15, furDark, 0.33, 0.95, 0);
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 1.55, 0);
  g.add(head);
  box(head, 0.42, 0.36, 0.36, fur, 0, 0, 0);
  const le = box(head, 0.16, 0.2, 0.12, eyeC, -0.17, 0.02, 0.15, "leye");
  const re = box(head, 0.16, 0.2, 0.12, eyeC, 0.17, 0.02, 0.15, "reye");
  le.name = "leye";
  re.name = "reye";
  const ant = mat(furDark);
  for (const s of [-1, 1]) {
    const a = box(head, 0.04, 0.4, 0.04, ant, 0.1 * s, 0.35, 0.05);
    a.rotation.z = -0.4 * s;
    box(head, 0.18, 0.06, 0.04, ant, 0.2 * s, 0.52, 0.05);
  }
  for (const [name, s] of [["lleg", -1], ["rleg", 1]] as const) {
    const leg = new THREE.Group();
    leg.name = name;
    leg.position.set(0.13 * s, 0.6, 0);
    g.add(leg);
    box(leg, 0.15, 0.6, 0.15, furDark, 0, -0.3, 0);
  }
  const wt = wingTexture(invert);
  const wmat = new THREE.MeshLambertMaterial({ map: wt, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
  for (const [name, s] of [["lwing", -1], ["rwing", 1]] as const) {
    const w = new THREE.Group();
    w.name = name;
    w.position.set(0.08 * s, 1.15, -0.18);
    g.add(w);
    const up = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), wmat);
    up.position.set(0.45 * s, 0.2, 0);
    up.rotation.y = Math.PI / 2 - 0.0;
    up.rotation.set(0, 0, 0);
    w.add(up);
    const lo = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.55), wmat);
    lo.position.set(0.3 * s, -0.35, 0);
    w.add(lo);
  }
  return g;
}

export function quadruped(body: string, accent: string, size = 1, opts: { snout?: string; spots?: string } = {}): THREE.Group {
  const g = new THREE.Group();
  const s = size;
  box(g, 0.7 * s, 0.55 * s, 1.0 * s, body, 0, 0.65 * s, 0);
  if (opts.spots) {
    box(g, 0.72 * s, 0.3 * s, 0.3 * s, opts.spots, 0, 0.75 * s, 0.1 * s);
    box(g, 0.72 * s, 0.25 * s, 0.25 * s, opts.spots, 0, 0.6 * s, -0.3 * s);
  }
  const head = new THREE.Group();
  head.name = "headp";
  head.position.set(0, 0.85 * s, 0.6 * s);
  g.add(head);
  box(head, 0.5 * s, 0.45 * s, 0.45 * s, body, 0, 0, 0);
  box(head, 0.28 * s, 0.2 * s, 0.1 * s, opts.snout ?? accent, 0, -0.08 * s, 0.25 * s);
  box(head, 0.08 * s, 0.08 * s, 0.05 * s, "#111", -0.14 * s, 0.08 * s, 0.23 * s);
  box(head, 0.08 * s, 0.08 * s, 0.05 * s, "#111", 0.14 * s, 0.08 * s, 0.23 * s);
  for (const [lx, lz] of [[-0.22, 0.35], [0.22, 0.35], [-0.22, -0.35], [0.22, -0.35]]) {
    const leg = new THREE.Group();
    leg.name = "leg";
    leg.position.set(lx * s, 0.4 * s, lz * s);
    g.add(leg);
    box(leg, 0.2 * s, 0.4 * s, 0.2 * s, accent, 0, -0.2 * s, 0);
  }
  return g;
}

export function birdModel(body: string, beak: string, kiwi = false): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.4, 0.38, kiwi ? 0.5 : 0.45, body, 0, 0.4, 0);
  box(g, 0.28, 0.28, 0.28, body, 0, kiwi ? 0.5 : 0.7, kiwi ? 0.25 : 0.22);
  const bk = box(g, 0.06, 0.06, kiwi ? 0.45 : 0.15, beak, 0, kiwi ? 0.42 : 0.68, kiwi ? 0.55 : 0.42);
  if (kiwi) bk.rotation.x = 0.4;
  box(g, 0.05, 0.05, 0.03, "#111", -0.1, kiwi ? 0.55 : 0.75, kiwi ? 0.38 : 0.36);
  box(g, 0.05, 0.05, 0.03, "#111", 0.1, kiwi ? 0.55 : 0.75, kiwi ? 0.38 : 0.36);
  if (!kiwi) box(g, 0.08, 0.12, 0.12, "#e22", 0, 0.88, 0.25);
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = "leg";
    leg.position.set(0.1 * s, 0.22, 0);
    g.add(leg);
    box(leg, 0.05, 0.22, 0.05, "#e0a020", 0, -0.11, 0);
  }
  return g;
}

export function skeletonModel(): THREE.Group {
  const g = new THREE.Group();
  const bone = "#e8e4d8";
  box(g, 0.4, 0.4, 0.4, bone, 0, 1.6, 0);
  box(g, 0.1, 0.1, 0.05, "#111", -0.1, 1.62, 0.2);
  box(g, 0.1, 0.1, 0.05, "#111", 0.1, 1.62, 0.2);
  box(g, 0.12, 0.6, 0.12, bone, 0, 1.1, 0);
  for (let i = 0; i < 3; i++) box(g, 0.44, 0.06, 0.2, bone, 0, 1.3 - i * 0.14, 0);
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = "leg";
    arm.position.set(0.3 * s, 1.35, 0);
    g.add(arm);
    box(arm, 0.08, 0.6, 0.08, bone, 0, -0.3, 0);
    const leg = new THREE.Group();
    leg.name = "leg";
    leg.position.set(0.12 * s, 0.75, 0);
    g.add(leg);
    box(leg, 0.09, 0.75, 0.09, bone, 0, -0.37, 0);
  }
  return g;
}

export function frogModel(size = 1, color = "#5aa83a"): THREE.Group {
  const g = new THREE.Group();
  const s = size;
  box(g, 0.6 * s, 0.35 * s, 0.6 * s, color, 0, 0.25 * s, 0);
  box(g, 0.62 * s, 0.1 * s, 0.5 * s, "#e8e0a0", 0, 0.12 * s, 0.05 * s);
  box(g, 0.18 * s, 0.18 * s, 0.18 * s, color, -0.2 * s, 0.48 * s, 0.18 * s);
  box(g, 0.18 * s, 0.18 * s, 0.18 * s, color, 0.2 * s, 0.48 * s, 0.18 * s);
  box(g, 0.1 * s, 0.1 * s, 0.05 * s, "#111", -0.2 * s, 0.5 * s, 0.28 * s);
  box(g, 0.1 * s, 0.1 * s, 0.05 * s, "#111", 0.2 * s, 0.5 * s, 0.28 * s);
  box(g, 0.4 * s, 0.03 * s, 0.05 * s, "#3a2020", 0, 0.28 * s, 0.31 * s);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = "leg";
    leg.position.set(0.32 * sx * s, 0.12 * s, -0.15 * s);
    g.add(leg);
    box(leg, 0.15 * s, 0.15 * s, 0.4 * s, color, 0, 0, 0);
  }
  return g;
}

function faceTexture(text: string, bg: string, fg: string) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = 4;
  g.strokeRect(2, 2, 60, 60);
  if (text) {
    g.fillStyle = fg;
    g.font = "bold 34px monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.save();
    g.translate(32, 34);
    g.rotate(Math.PI / 2);
    g.fillText(text, 0, 0);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The Chill Entity :] */
export function chillModel(): THREE.Group {
  const g = new THREE.Group();
  const side = new THREE.MeshLambertMaterial({ map: faceTexture("", "#9fd8ff", "#000") });
  const face = new THREE.MeshLambertMaterial({ map: faceTexture(":]", "#9fd8ff", "#1a2a3a") });
  const mats = [side, side, side, side, face, side];
  const cube = new THREE.Mesh(boxGeo, mats);
  cube.scale.set(0.8, 0.8, 0.8);
  cube.position.y = 0.85;
  g.add(cube);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = "leg";
    leg.position.set(0.2 * sx, 0.45, 0);
    g.add(leg);
    box(leg, 0.1, 0.45, 0.1, "#6aa8d0", 0, -0.22, 0);
    box(leg, 0.16, 0.06, 0.22, "#4a88b0", 0, -0.44, 0.04);
  }
  return g;
}

export function spiderModel(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.35, 0.25, 0.45, "#1a1a1a", 0, 0.3, -0.1);
  box(g, 0.25, 0.2, 0.22, "#2a2a2a", 0, 0.3, 0.22);
  box(g, 0.05, 0.05, 0.02, "#f22", -0.06, 0.34, 0.34);
  box(g, 0.05, 0.05, 0.02, "#f22", 0.06, 0.34, 0.34);
  box(g, 0.15, 0.06, 0.02, "#ffd23a", 0, 0.42, 0.33); // stylish hat brim
  box(g, 0.1, 0.1, 0.1, "#ffd23a", 0, 0.48, 0.28);
  for (let i = 0; i < 8; i++) {
    const s = i < 4 ? -1 : 1;
    const k = i % 4;
    const leg = new THREE.Group();
    leg.name = "sleg";
    leg.position.set(0.15 * s, 0.3, 0.15 - k * 0.12);
    g.add(leg);
    const l = box(leg, 0.4, 0.04, 0.04, "#111", 0.2 * s, 0.05, 0);
    l.rotation.z = -0.5 * s;
  }
  return g;
}

export function obilModel(): THREE.Group {
  const g = new THREE.Group();
  const m = mat("#14141c");
  const glow = mat("#ff2850", { emissive: true });
  const core = box(g, 1.4, 6, 1.4, m, 0, 3, 0);
  core.name = "core";
  for (let i = 0; i < 6; i++) {
    box(g, 1.45, 0.12, 1.45, glow, 0, 0.6 + i * 0.95, 0);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(1, 1.6, 4), m);
  tip.position.y = 6.8;
  tip.rotation.y = Math.PI / 4;
  g.add(tip);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), glow);
  eye.position.set(0, 4.2, 0.72);
  eye.name = "eye";
  g.add(eye);
  return g;
}

export function warperModel(): THREE.Group {
  const g = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.6, 32, 24), new THREE.MeshLambertMaterial({ color: "#c84a6a", emissive: "#3a0010" }));
  orb.name = "orb";
  g.add(orb);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), mat("#ffffaa", { emissive: true }));
  eye.position.z = 1.3;
  g.add(eye);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), mat("#000"));
  pupil.position.z = 1.75;
  g.add(pupil);
  return g;
}

export function forgModel(): THREE.Group {
  const g = frogModel(4, "#3a8a2a");
  box(g, 1.2, 0.3, 1.0, "#8a3a2a", 0, 1.5, -0.2); // saddle
  return g;
}

export function flamingoModel(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.5, 0.4, 0.7, "#ff7aa8", 0, 1.3, 0);
  for (const s of [-1, 1]) {
    const neck = box(g, 0.1, 0.8, 0.1, "#ff7aa8", 0.15 * s, 1.85, 0.3);
    neck.rotation.z = 0.2 * s;
    box(g, 0.22, 0.2, 0.25, "#ff9ac0", 0.24 * s, 2.3, 0.35);
    box(g, 0.08, 0.08, 0.22, "#222", 0.24 * s, 2.25, 0.55);
    const leg = new THREE.Group();
    leg.name = "leg";
    leg.position.set(0.1 * s, 1.1, 0);
    g.add(leg);
    box(leg, 0.05, 1.1, 0.05, "#e05a8a", 0, -0.55, 0);
  }
  return g;
}

export function butterflyModel(color: string): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.05, 0.05, 0.25, "#222", 0, 0, 0);
  const wm = mat(color, { side: THREE.DoubleSide });
  for (const [name, s] of [["bw1", -1], ["bw2", 1]] as const) {
    const w = new THREE.Group();
    w.name = name;
    g.add(w);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.3), wm);
    p.rotation.x = -Math.PI / 2;
    p.position.x = 0.13 * s;
    w.add(p);
  }
  return g;
}

export function rainbowTextSprite(text: string): { sprite: THREE.Sprite; update: (t: number) => void } {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(5, 0.95, 1);
  const update = (t: number) => {
    g.clearRect(0, 0, 512, 96);
    g.font = "bold 64px monospace";
    g.textBaseline = "middle";
    const w = g.measureText(text).width;
    let x = 256 - w / 2;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      g.fillStyle = `hsl(${(i * 40 + t * 300) % 360},100%,60%)`;
      g.strokeStyle = "#000";
      g.lineWidth = 6;
      const y = 48 + Math.sin(t * 8 + i * 0.7) * 10;
      g.strokeText(ch, x, y);
      g.fillText(ch, x, y);
      x += g.measureText(ch).width;
    }
    tex.needsUpdate = true;
  };
  update(0);
  return { sprite, update };
}
