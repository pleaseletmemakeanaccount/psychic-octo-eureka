import * as THREE from "three";
import { B, BLOCKS, ITEMS, isFluid, isSolid, type ToolKind } from "./blocks";
import {
  Butterfly, Chill, DanceSpider, Entity, Forg, gdelta, Hostile, Mob, Obil, placeObject, RemoteMoth, Warper, type Ctx,
} from "./entities";
import { meshCartesian, meshChunk } from "./mesher";
import { mothModel } from "./models";
import { auroraMaterial, glowSpriteTexture, sunMaterial, voidSkyMaterial } from "./shaders";
import { TerrainLOD } from "./terrain-lod";
import { SkyIslands, skyShadowLight, type Island } from "./sky-islands";
import { WeatherSystem } from "./weather";
import { BoneThief, DoomWalker, Fish, RoundGolem, SkyCreature } from "./ecology";
import { AdvancedBoss, BOSS_ORDER, BOSS_TIPS, type BossName } from "./bosses";
import { checkSkyIslands, checkWorld } from "./regression";
import {
  addItem, consumeSelected, LIMB_MAX, LIMB_NAMES, removeItem, resetLimbs, RUNES, sortInventory, stackName, store, type ItemStack, type LimbKey, type RuneId,
} from "./state";
import { buildAtlas, setAtlasCanvas } from "./textures";
import { basisAt, Biome, BIOME_NAMES, CH, colOf, CW, fromWorld, H, L, N, R, S, SEA, SUN_RADIUS, toWorld, uOf, World, wrapX, xScale, ZERO_G_RADIUS } from "./world";

const DAY_LEN = 600;
const REACH = 6;
const VIEW_CHUNKS = 7;
const TOOL_TIER: Record<number, number> = { [B.PLANKS]: 1, [B.LOG]: 1, [B.COBBLE]: 1.5, [B.STONE]: 1.5, [B.IRON_ORE]: 2.6, [B.GOLD_ORE]: 2.2, [B.CRYSTAL]: 3.2, [B.URANIUM]: 3.6, [B.IRON_CRUST]: 4 };
export const CHISEL_MATERIALS = Object.keys(TOOL_TIER).map(Number);

type ChunkMeshes = { o?: THREE.Mesh; e?: THREE.Mesh; t?: THREE.Mesh };

const _probe = new THREE.Vector3();

export class Engine {
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, 1, 0.05, 6000);
  world = new World();
  atlas!: THREE.Texture;
  chunks = new Map<string, ChunkMeshes>();
  terrainLOD = new TerrainLOD();
  skyIslands!: SkyIslands;
  skyLight = 1;
  carrying: Island | null = null;
  meshTick = 0;
  matOpaque!: THREE.MeshLambertMaterial;
  matEmit!: THREE.MeshBasicMaterial;
  matTrans!: THREE.MeshLambertMaterial;
  sun!: THREE.Mesh;
  sunMat = sunMaterial();
  sunGlow!: THREE.Sprite;
  voidSky!: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  auroraMat = auroraMaterial();
  aurora!: THREE.Mesh;
  sunLight = new THREE.PointLight(0xfff0d0, 2.4, 0, 0);
  ambient = new THREE.AmbientLight(0xffffff, 0.45);
  glowLight = new THREE.PointLight(0xff7ad1, 0, 14, 1.5);
  fog = new THREE.FogExp2(0x9ab8d8, 0.011);
  buildQueue: string[] = [];
  selection!: THREE.LineSegments;
  steam!: THREE.Points;
  steamP: { x: number; y: number; z: number; life: number }[] = [];
  steamSources: THREE.Vector3[] = [];
  bridgeIslands: { u: number; centerY: number; topY: number; z: number; rx: number; rz: number }[] = [];
  lodMeshes: THREE.Mesh[] = [];
  lodMaterials: THREE.ShaderMaterial[] = [];

  // player (grid space)
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  flying = false;
  inFluid = false;
  mothBody!: THREE.Group;
  mountForg: Forg | null = null;

  keys = new Set<string>();
  mouseL = false;
  mouseR = false;
  attackCd = 0;
  placeCd = 0;
  mineTarget = "";
  mineProgress = 0;

  entities: Entity[] = [];
  chill: Chill | null = null;
  boss: Entity | null = null;
  bossesDefeated = new Set<string>();
  machines = { cranks: new Set<string>(), pistons: new Set<string>() };
  sandQueue = new Set<string>();
  sandT = 0;
  spawnT = 0;
  slowT = 0;
  steamScanT = 0;
  weather!: WeatherSystem;
  shrinesLit = 0;
  litShrines = new Set<string>();
  lan: BroadcastChannel | null = null;
  peerId = Math.random().toString(36).slice(2, 10);
  lanT = 0;
  peers = new Map<string, RemoteMoth>();
  raf = 0;
  last = 0;
  container!: HTMLElement;
  disposed = false;
  fpsAcc = 0;
  fpsN = 0;
  hit: { col: number; y: number; z: number; pcol: number; py: number; pz: number; dist: number } | null = null;
  ctx!: Ctx;
  pendingWarper = -1;
  touchMoveX = 0;
  touchMoveForward = 0;

  init(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.touchDevice ? 1.1 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.resize();
    window.addEventListener("resize", this.resize);

    const { texture, canvas } = buildAtlas();
    this.atlas = texture;
    setAtlasCanvas(canvas);
    this.matOpaque = new THREE.MeshLambertMaterial({ map: texture, vertexColors: true, alphaTest: 0.5 });
    this.matEmit = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true });
    this.matTrans = new THREE.MeshLambertMaterial({ map: texture, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.matTrans.forceSinglePass = true;
    this.terrainLOD.decorate(this.matOpaque);
    this.terrainLOD.decorate(this.matEmit);
    this.terrainLOD.decorate(this.matTrans);

    const s = this.scene;
    s.fog = this.fog;
    s.background = new THREE.Color(0x9ab8d8);
    s.add(this.sunLight, this.ambient, this.glowLight);

    // Central Sun Biome: a perfect non-voxel sphere on the axis
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 64, 48), this.sunMat);
    s.add(this.sun);
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSpriteTexture("rgba(255,240,180,0.9)", "rgba(255,140,40,0.35)"), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.sunGlow.scale.set(SUN_RADIUS * 7, SUN_RADIUS * 7, 1);
    s.add(this.sunGlow);
    this.voidSky = new THREE.Mesh(new THREE.SphereGeometry(4000, 24, 16), voidSkyMaterial());
    this.voidSky.renderOrder = -10;
    this.voidSky.visible = false;
    this.voidSky.frustumCulled = false;
    s.add(this.voidSky);

    // End caps of the cylinder
    const capMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47, side: THREE.DoubleSide });
    for (const z of [-L / 2, L / 2]) {
      const cap = new THREE.Mesh(new THREE.RingGeometry(0, R + 0.5, 96, 1), capMat);
      cap.position.z = z;
      s.add(cap);
      // rivet rings
      for (let r = 24; r < R; r += 24) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.4, 96), new THREE.MeshBasicMaterial({ color: 0x23262b, side: THREE.DoubleSide }));
        ring.position.z = z + (z < 0 ? 0.02 : -0.02);
        s.add(ring);
      }
    }

    // Aurora Borealis ribbon around the axis
    const ag = new THREE.CylinderGeometry(ZERO_G_RADIUS * 2.2, ZERO_G_RADIUS * 2.2, L - 4, 96, 1, true);
    ag.rotateX(Math.PI / 2);
    this.aurora = new THREE.Mesh(ag, this.auroraMat);
    this.aurora.visible = false;
    s.add(this.aurora);

    // selection box
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    this.selection = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 }));
    this.selection.frustumCulled = false;
    s.add(this.selection);

    // steam particles
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
    this.steam = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xf0f4ff, size: 0.6, transparent: true, opacity: 0.55, depthWrite: false }));
    this.steam.frustumCulled = false;
    s.add(this.steam);

    this.mothBody = mothModel(false);
    this.mothBody.visible = false;
    s.add(this.mothBody);

    this.ctx = this.makeCtx();
    this.weather = new WeatherSystem(this.ctx);
    this.skyIslands = new SkyIslands(this.scene, this.atlas);
    this.bindInput();
  }

  buildSkyIslands() {
    const bands = 6;
    const chains = 8;
    for (let chain = 0; chain < chains; chain++) {
      for (let band = 0; band < bands; band++) {
        const t = band / (bands - 1);
        const centerY = Math.floor(H + 28 + t * (R - H - SUN_RADIUS - 65));
        const u = wrapX((chain / chains) * N + Math.sin(band * 1.4 + chain) * N * 0.018);
        const z = Math.max(18, Math.min(L - 18, L / 2 + Math.sin(chain * 1.9 + band * 0.65) * L * 0.31));
        const size = 32;
        const c = size / 2;
        const rx = 9 + (chain % 3) * 2;
        const rz = 8 + (band % 3) * 2;
        const geo = meshCartesian(size, (x, y, zz) => {
          const dx = x + 0.5 - c, dy = y + 0.5 - c, dz = zz + 0.5 - c;
          const ellipse = dx * dx / (rx * rx) + dz * dz / (rz * rz);
          if (ellipse > 1 || dy < -8 || dy > 5 - ellipse * 4) return B.AIR;
          if (dy > 2.4 - ellipse * 2) return dy > 3.4 - ellipse * 2 ? B.GRASS : B.DIRT;
          return dy < -5 ? B.DARK_STONE : B.STONE;
        });
        if (!geo) continue;
        const group = new THREE.Group();
        const east = new THREE.Vector3(), up = new THREE.Vector3(), north = new THREE.Vector3();
        basisAt(u, east, up, north);
        group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, up, north));
        toWorld(u, centerY, z, group.position);
        group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true })));
        this.scene.add(group);
        this.bridgeIslands.push({ u, centerY, topY: centerY + 4, z, rx: rx + 1, rz: rz + 1 });
      }
    }
  }

  biomeColor(biome: Biome) {
    const hex = [
      "#638a4d", "#82909a", "#334d7a", "#2b9b9e", "#506536", "#70618e", "#82906c", "#c5a565",
      "#b67945", "#6f8760", "#59603e", "#70574a", "#b5ced5", "#315c3c", "#876bba", "#a69a49",
      "#387b3d", "#d48aab", "#a95537", "#999487", "#867e70", "#ded5b0", "#ad6941",
      "#d4dce0", "#bb92db", "#256c36", "#513b40", "#a84736",
      "#14223d", "#5c5855", "#cc4a23", "#4ab8ff", "#2eb36c", "#91c6d8",
    ][biome] ?? "#688052";
    return new THREE.Color(hex);
  }

  buildSurfaceLOD(step: number, minDistance: number, maxDistance: number) {
    const nx = N / step, nz = L / step;
    const count = (nx + 1) * (nz + 1);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const indices = new Uint32Array(nx * nz * 6);
    let vertex = 0;
    for (let ix = 0; ix <= nx; ix++) {
      const u = ix * step;
      for (let iz = 0; iz <= nz; iz++) {
        const z = Math.min(L - 1, iz * step);
        const y = Math.max(this.world.smoothHeightAt(u, z), 30) + 0.8;
        const p = toWorld(u, y, iz * step);
        positions[vertex * 3] = p.x;
        positions[vertex * 3 + 1] = p.y;
        positions[vertex * 3 + 2] = p.z;
        const c = this.biomeColor(this.world.biomeAt(u, z));
        const shade = 0.82 + ((ix + iz) % 3) * 0.06;
        colors[vertex * 3] = c.r * shade;
        colors[vertex * 3 + 1] = c.g * shade;
        colors[vertex * 3 + 2] = c.b * shade;
        vertex++;
      }
    }
    let ii = 0;
    const stride = nz + 1;
    for (let ix = 0; ix < nx; ix++)
      for (let iz = 0; iz < nz; iz++) {
        const a = ix * stride + iz, b = a + stride;
        indices[ii++] = a; indices[ii++] = b; indices[ii++] = a + 1;
        indices[ii++] = a + 1; indices[ii++] = b; indices[ii++] = b + 1;
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const material = this.terrainLOD.material(minDistance, maxDistance);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -2;
    this.scene.add(mesh);
    this.lodMeshes.push(mesh);
    this.lodMaterials.push(material);
  }

  buildWorldLOD() {
    this.buildSurfaceLOD(8, 0, R * 2.6);
    this.buildSurfaceLOD(32, R * 2.6, 5000);
  }

  async generate(onProgress: (f: number, label: string) => void = () => {}) {
    await this.world.generate((f, label) => onProgress(f * 0.82, label));
    onProgress(0.84, "checking ground, aligned grids, event timers and remote storm damage");
    checkWorld(this.world);
    onProgress(0.91, "building full-world terrain LODs");
    this.buildWorldLOD();
    onProgress(0.93, "raising the sky-island bridges");
    this.buildSkyIslands();
    await this.skyIslands.build((f) => onProgress(0.945 + f * 0.02, `shaping orbiting sky islands ${Math.round(f * 100)}%`));
    this.skyIslands.update(0);
    checkSkyIslands(this.skyIslands);
    this.world.onSet = (col, y, z, id) => this.onBlockSet(col, y, z, id);
    // index machines
    this.world.scanMachines((col, y, z, id) => {
      if (id === B.PISTON) this.machines.pistons.add(`${col},${y},${z}`);
      else this.machines.cranks.add(`${col},${y},${z}`);
    }, 8, L / 2, 28);
    this.world.dirty.clear();
    this.pos.copy(this.world.spawn);
    this.yaw = 0;
    this.pitch = 0.1;
    // stream in the chunks around spawn before the first frame
    for (let i = 0; i < 6; i++) {
      this.ensureChunks(6);
      this.terrainLOD.update(0.2);
      onProgress(0.94 + i * 0.01, "meshing the starting area");
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    // initial fauna
    for (let i = 0; i < 10; i++) this.trySpawnPassive();
    this.setupLan();
  }

  chunkKeyAt(u: number, z: number) {
    return `${Math.floor(wrapX(u) / CH) % S},${Math.max(0, Math.min(L / CH - 1, Math.floor(z / CH)))}`;
  }

  /** Refine the always-visible horizon with local voxel meshes. */
  ensureChunks(budget: number) {
    const pcx = Math.floor(wrapX(this.pos.x) / CH) % S;
    const pcz = Math.max(0, Math.min(L / CH - 1, Math.floor(this.pos.z / CH)));
    const wanted = new Map<string, number>();
    for (let dx = -VIEW_CHUNKS; dx <= VIEW_CHUNKS; dx++)
      for (let dz = -VIEW_CHUNKS; dz <= VIEW_CHUNKS; dz++) {
        const cz = pcz + dz;
        if (cz < 0 || cz >= L / CH) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 > (VIEW_CHUNKS + 0.5) * (VIEW_CHUNKS + 0.5)) continue;
        wanted.set(`${(pcx + dx + S) % S},${cz}`, d2);
      }
    for (const key of [...this.chunks.keys()]) {
      if (!wanted.has(key)) {
        const [cx, cz] = key.split(",").map(Number);
        let ddx = Math.abs(cx - pcx);
        ddx = Math.min(ddx, S - ddx);
        if (ddx > VIEW_CHUNKS + 1 || Math.abs(cz - pcz) > VIEW_CHUNKS + 1) {
          this.terrainLOD.target(key, false);
          if (this.terrainLOD.amount(key) < 0.001) this.unloadChunk(key);
        }
      }
    }
    for (const key of wanted.keys()) if (this.chunks.has(key)) this.terrainLOD.target(key, true);
    const missing = [...wanted.entries()].filter(([k]) => !this.chunks.has(k)).sort((a, b) => a[1] - b[1]);
    let built = 0;
    for (const [key] of missing) {
      if (built >= budget) break;
      const [cx, cz] = key.split(",").map(Number);
      this.buildChunk(cx, cz);
      this.world.dirty.delete(key);
      built++;
    }
    return built;
  }

  unloadChunk(key: string) {
    const old = this.chunks.get(key);
    if (!old) return;
    for (const m of [old.o, old.e, old.t]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    this.chunks.delete(key);
  }

  buildChunk(cx: number, cz: number) {
    const key = cx + "," + cz;
    const old = this.chunks.get(key);
    if (old) for (const m of [old.o, old.e, old.t]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    const g = meshChunk(this.world, cx, cz);
    const cm: ChunkMeshes = {};
    if (g.opaque) { cm.o = new THREE.Mesh(g.opaque, this.matOpaque); this.scene.add(cm.o); }
    if (g.emissive) { cm.e = new THREE.Mesh(g.emissive, this.matEmit); this.scene.add(cm.e); }
    if (g.trans) { cm.t = new THREE.Mesh(g.trans, this.matTrans); cm.t.renderOrder = 1; this.scene.add(cm.t); }
    this.chunks.set(key, cm);
    this.terrainLOD.target(key, true);
  }

  start() {
    this.last = performance.now();
    const loop = (t: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const wallDt = Math.max(0, (t - this.last) / 1000);
      const dt = Math.min(0.05, wallDt);
      this.last = t;
      this.weather.advance(wallDt);
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.fpsAcc += dt;
      this.fpsN++;
      if (this.fpsAcc > 0.5) {
        store.s.fps = Math.round(this.fpsN / this.fpsAcc);
        this.fpsAcc = 0;
        this.fpsN = 0;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("blur", this.resetInput);
    window.removeEventListener("wheel", this.onWheel);
    this.lan?.close();
    this.terrainLOD.dispose();
    this.weather.dispose();
    this.skyIslands.dispose();
    this.voidSky.geometry.dispose(); this.voidSky.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ================= INPUT =================
  bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("blur", this.resetInput);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    this.renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
    this.renderer.domElement.addEventListener("click", () => {
      if (store.s.ui === "none" && store.s.phase === "playing") this.lock();
    });
  }
  resetInput = () => {
    this.keys.clear(); this.setTouchMove(0, 0);
    this.setTouchMine(false); this.mouseR = false;
  };
  lock() {
    if (this.touchDevice) return;
    try {
      const p = this.renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* needs a user gesture */
    }
  }
  get touchDevice() {
    return typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches);
  }
  lookBy(dx: number, dy: number) {
    this.yaw -= dx * 0.004;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * 0.004));
  }
  setTouchMove(x: number, forward: number) {
    this.touchMoveX = x;
    this.touchMoveForward = forward;
  }
  setTouchKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }
  setTouchMine(down: boolean) {
    this.mouseL = down;
    if (!down) {
      this.mineProgress = 0;
      store.s.mining = 0;
    }
  }
  touchUse() {
    if (store.s.phase !== "playing" || store.s.ui !== "none") return;
    this.placeCd = 0;
    const hb = this.raycastBlock();
    const he = this.raycastEntity(hb ? hb.dist : REACH);
    this.rightClick(hb, he?.e ?? null);
  }
  get locked() {
    return document.pointerLockElement === this.renderer.domElement;
  }
  openUI(ui: typeof store.s.ui) {
    store.s.ui = ui;
    if (ui !== "none") document.exitPointerLock?.();
    this.resetInput();
    store.bump();
  }
  closeUI() {
    store.s.ui = "none";
    store.bump();
    this.lock();
  }
  onKeyDown = (e: KeyboardEvent) => {
    const s = store.s;
    if (s.phase !== "playing") return;
    if (s.ui === "chat" || s.ui === "sleep") {
      if (e.key === "Escape" && s.ui === "chat") this.closeUI();
      return;
    }
    if (s.ui !== "none") {
      if (e.key === "Escape" || (e.code === "KeyE" && s.ui === "inventory") || (e.code === "KeyR" && s.ui === "runes") || (e.code === "KeyH" && s.ui === "help") || (e.code === "KeyM" && s.ui === "world")) this.closeUI();
      return;
    }
    this.keys.add(e.code);
    if (e.code.startsWith("Digit")) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 9) { s.selected = n - 1; store.bump(); }
    }
    if (e.code === "KeyE") { sortInventory(s); this.openUI("inventory"); }
    if (e.code === "KeyT" || e.code === "Enter" || e.code === "Slash") { e.preventDefault(); this.openUI("chat"); }
    if (e.code === "KeyH") this.openUI("help");
    if (e.code === "KeyR") {
      if (s.armorGold) this.openUI("runes");
      else store.say("Runes can only be inscribed onto Gold Armor. Chisel a Gold Chestplate first.", "#ffd23a");
    }
    if (e.code === "KeyV") { s.thirdPerson = !s.thirdPerson; store.bump(); }
    if (e.code === "KeyG" && !e.repeat) this.setMode(s.mode === "creative" ? "survival" : "creative");
    if (e.code === "KeyF" && !e.repeat) this.toggleFlight();
    if (e.code === "KeyM") this.openUI("world");
    if (e.code === "KeyC") this.openUI("chisel");
    if (e.code === "KeyX" && this.mountForg) this.dismount();
  };
  onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  onMouseDown = (e: MouseEvent) => {
    if (!this.locked || store.s.ui !== "none") return;
    if (e.button === 0) this.mouseL = true;
    if (e.button === 2) { this.mouseR = true; this.placeCd = 0; }
  };
  onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) { this.mouseL = false; this.mineProgress = 0; store.s.mining = 0; }
    if (e.button === 2) this.mouseR = false;
  };
  onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.yaw -= e.movementX * 0.0022;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - e.movementY * 0.0022));
  };
  onWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    store.s.selected = (store.s.selected + (e.deltaY > 0 ? 1 : 8)) % 9;
    store.bump();
  };

  setMode(m: "survival" | "creative") {
    store.s.mode = m;
    this.flying = m === "creative";
    this.vel.set(0, 0, 0);
    store.say(`Game mode: ${m.toUpperCase()}${m === "creative" ? " (unrestricted flight [F], instant mining)" : ""}`, "#8af");
  }
  toggleFlight() {
    if (store.s.mode !== "creative") return;
    this.flying = !this.flying;
    this.vel.y = 0;
    store.say(this.flying ? "Flight: ON" : "Flight: OFF", "#aaccee");
  }

  // ================= CONTEXT FOR ENTITIES =================
  makeCtx(): Ctx {
    const eng = this;
    return {
      world: this.world,
      scene: this.scene,
      player: this.pos,
      playerVel: this.vel,
      get isNight() { return eng.isNight; },
      get time() { return store.s.time; },
      damagePlayer: (a, src, limb) => this.damagePlayer(a, src, limb),
      spawn: (e) => this.addEntity(e),
      breakBlock: (x, y, z) => { const b = this.world.get(x, y, z); this.breakBlockU(x, y, z, false); return b; },
      say: (t, c, f) => store.say(t, c, f),
      toast: (t, s) => store.toast(t, s),
      atlas: this.atlas,
      onBossDefeated: (n) => this.onBossDefeated(n),
      setBoss: (b) => { store.s.boss = b; store.bump(); },
      killLog: store.s.killLog,
    };
  }
  addEntity(e: Entity) {
    this.entities.push(e);
    this.scene.add(e.group);
  }

  /** The sun never switches off: daylight is whatever the orbiting islands do not block. */
  get brightness() {
    return Math.max(0.05, this.skyLight * (1 - (this.weather?.model.darkness ?? 0)));
  }
  get isNight() {
    return this.brightness < 0.45;
  }

  // ================= DAMAGE =================
  damagePlayer(amount: number, source: string, limb?: LimbKey) {
    const s = store.s;
    if (s.mode === "creative" || s.ui === "death" || s.ui === "sleep") return;
    const guard = this.runeLevel("guard");
    amount *= Math.max(0.35, 1 - guard * 0.15);
    if (!limb) {
      const w: [LimbKey, number][] = [["torso", 3], ["head", 1], ["lwing", 1], ["rwing", 1], ["lleg", 1.4], ["rleg", 1.4], ["leye", 0.35], ["reye", 0.35]];
      const tot = w.reduce((a, b) => a + b[1], 0);
      let r = Math.random() * tot;
      limb = "torso";
      for (const [k, v] of w) { r -= v; if (r <= 0) { limb = k; break; } }
    }
    let L2 = s.limbs[limb];
    if (L2.lost) { limb = "torso"; L2 = s.limbs.torso; }
    L2.hp -= amount;
    if (L2.hp <= 0) {
      L2.hp = 0;
      if (limb !== "torso" && limb !== "head") {
        L2.lost = true;
        store.say(`☠ Your ${LIMB_NAMES[limb].toUpperCase()} has been permanently destroyed (${source}).`, "#ff4040");
        if (limb === "leye" || limb === "reye") store.toast("EYE DESTROYED", `The ${limb === "leye" ? "left" : "right"} half of your vision is gone for this run.`);
        if (s.limbs.lleg.lost && s.limbs.rleg.lost) store.say("Both legs lost. You are now rolling prone.", "#ff8040");
      } else this.die(source);
    }
    s.flight = Math.min(s.flight, 100 * this.wingFactor());
    store.bump();
  }
  wingFactor() {
    const l = store.s.limbs;
    return ((l.lwing.lost ? 0 : l.lwing.hp / LIMB_MAX.lwing) + (l.rwing.lost ? 0 : l.rwing.hp / LIMB_MAX.rwing)) / 2;
  }
  die(source: string) {
    const s = store.s;
    store.say(`You died: ${source}.`, "#ff3030");
    // cache the physical damage map → scars on next avatar
    (Object.keys(s.limbs) as LimbKey[]).forEach((k) => {
      const l = s.limbs[k];
      if (l.lost) s.scars[k] = 2;
      else if (l.hp < LIMB_MAX[k] * 0.5) s.scars[k] = Math.max(s.scars[k] ?? 0, 1);
    });
    s.deaths++;
    localStorage.setItem("ernas_scars", JSON.stringify({ scars: s.scars, deaths: s.deaths }));
    if (this.mountForg) this.dismount();
    this.openUI("death");
  }
  respawn() {
    const s = store.s;
    resetLimbs(s);
    s.hunger = 100;
    s.thirst = 100;
    s.poison = 0;
    s.radiation = 0;
    s.crushed = 0;
    s.flight = 100;
    this.pos.copy(this.world.spawn);
    this.pos.y = this.world.surfaceY(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 1;
    this.vel.set(0, 0, 0);
    this.closeUI();
  }

  // ================= RUNES =================
  runeLevel(id: RuneId) {
    const s = store.s;
    if (!s.armorGold || s.runeEnergy <= 0) return 0;
    let lvl = 0;
    for (let i = 0; i < 25; i++) {
      if (s.runes[i] !== id) continue;
      lvl += 1;
      const x = i % 5, y = Math.floor(i / 5);
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 5 && ny < 5 && s.runes[ny * 5 + nx] === id) lvl += 0.5; // linked runes resonate
      }
    }
    return lvl;
  }

  // ================= MAIN UPDATE =================
  update(dt: number) {
    const s = store.s;
    if (s.phase !== "playing") return;
    const paused = s.ui === "sleep" || s.ui === "death";
    s.time = (s.time + dt / DAY_LEN) % 1;
    if (s.time < dt / DAY_LEN) { s.day++; store.say(`Day ${s.day} dawns.`, "#ffd23a"); }
    this.updateEnvironment(dt);
    if (!paused) {
      this.updatePlayer(dt);
      this.weather.applyToPlayer(dt, s.mode === "creative");
      this.updateMetabolism(dt);
      this.updateInteraction(dt);
    }
    this.updateEntities(dt);
    this.updateWorldSystems(dt);
    this.updateCamera();
    this.terrainLOD.update(dt);
    this.meshTick -= dt;
    // rebuild dirty (loaded) chunks, then stream in new ones
    let n = 0;
    for (const key of this.world.dirty) {
      this.world.dirty.delete(key);
      if (!this.chunks.has(key)) continue;
      const [cx, cz] = key.split(",").map(Number);
      this.buildChunk(cx, cz);
      if (++n >= 1) break;
    }
    if (!n && this.meshTick <= 0) {
      this.ensureChunks(1);
      this.meshTick = 0.06;
    }
    this.slowT += dt;
    if (this.slowT > 0.1) {
      this.slowT = 0;
      const b = this.world.biomeAt(this.pos.x, this.pos.z);
      const cave = this.world.caveLayerAt(this.pos.x, this.pos.y, this.pos.z);
      const island = this.carrying ?? this.skyIslands.nearest(this.eyeWorld(_probe));
      s.biome = island
        ? `Sky Island · ${island.biome}`
        : this.pos.y < 0
          ? "The Volumetric Void · free drift"
          : cave
            ? `Caves · ${cave}`
            : R - this.pos.y < ZERO_G_RADIUS
              ? "Solar Deadzone (0g)"
              : this.pos.y > H - 12
                ? "Sky Ring"
                : BIOME_NAMES[b];
      s.skyLight = this.skyLight;
      s.coords = `θ ${((this.pos.x / N) * 360).toFixed(1)}°  h ${this.pos.y.toFixed(1)}  z ${this.pos.z.toFixed(1)}`;
      s.lowLight = this.isNight;
      s.weatherLabel = this.weather.describe();
      s.eclipse = this.weather.model.tideActive;
      s.submerged = this.weather.submerged;
      s.worldSeconds = this.weather.model.elapsed;
      store.bump();
    }
  }

  updateEnvironment(dt: number) {
    const s = store.s;
    this.skyIslands.update(dt);
    this.skyLight = skyShadowLight(this.eyeWorld(_probe));
    const br = this.brightness;
    this.weather.render(dt);
    const dark = this.weather.model.darkness;
    const t = performance.now() / 1000;
    this.sunMat.uniforms.uTime.value = t;
    this.sunMat.uniforms.uBright.value = br;
    this.sunMat.uniforms.uEclipse.value = dark;
    this.voidSky.visible = s.inVoid;
    this.voidSky.material.uniforms.uTime.value = t;
    this.auroraMat.uniforms.uTime.value = t;
    this.aurora.visible = s.aurora;
    this.sunLight.intensity = 0.25 + br * 2.4;
    this.sunLight.color.setHSL(0.08 + br * 0.04, 0.8, 0.5 + br * 0.2);
    this.ambient.intensity = 0.1 + br * 0.4 + (s.aurora ? 0.12 : 0) + this.weather.flash;
    this.sunGlow.material.opacity = 0.35 + Math.max(0, 1 - dark) * 0.65;
    s.storm = this.weather.rainAmount;
    const storm = s.storm;
    const day = new THREE.Color().setHSL(0.58, 0.45, 0.72);
    const night = new THREE.Color(0x0a0c18);
    const stormC = new THREE.Color(0x4a505a);
    const fc = night.clone().lerp(day, br).lerp(stormC, storm * 0.6);
    fc.lerp(new THREE.Color(0x010207), dark);
    if (this.pos.y < 0) fc.set(0x3a3550);
    if (this.inFluid) {
      const f = this.world.getF(this.pos.x, this.pos.y + 1.5, this.pos.z);
      if (f === B.WATER) fc.set(0x1a4a8a);
      if (f === B.BLOOD) fc.set(0x5a0008);
      if (this.weather.submerged) fc.set(0x091a31);
    }
    this.fog.color.copy(fc);
    (this.scene.background as THREE.Color).copy(fc);
    // Keep long sightlines clear enough for the outer sphere and horizon LODs.
    this.fog.density = this.inFluid ? 0.09 : this.pos.y < 0 ? 0.00022 : 0.00055 + storm * 0.0003;
    // rune glow
    const glow = this.runeLevel("glow");
    this.glowLight.intensity = glow > 0 ? 1.5 + glow : 0;
    // The LOD mesh applies island shadows in its own shader, so only global light is sent here.
    for (const material of this.lodMaterials) material.uniforms.uLight.value = (0.25 + Math.max(0, 1 - dark) * 0.75);
  }

  updatePlayer(dt: number) {
    const s = store.s;
    const w = this.world;
    const creative = s.mode === "creative";
    const limbs = s.limbs;
    const prone = limbs.lleg.lost && limbs.rleg.lost;
    const oneLeg = limbs.lleg.lost !== limbs.rleg.lost;
    const crushed = s.crushed > 0;
    const hh = prone ? 0.6 : crushed ? 0.45 : 1.75;
    const r = R - this.pos.y;
    const inVoid = this.pos.y < -0.5;
    s.inVoid = inVoid;
    const feet = w.getF(this.pos.x, this.pos.y + 0.3, this.pos.z);
    const body = w.getF(this.pos.x, this.pos.y + 1.0, this.pos.z);
    this.inFluid = isFluid(feet) || isFluid(body) || this.weather.flooded;

    // movement wish
    let fx = 0, fz = 0;
    const k = this.keys;
    const fwd = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0) + this.touchMoveForward;
    const str = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0) + this.touchMoveX;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    fx = sy * fwd - cy * str;
    fz = cy * fwd + sy * str;
    let voidVertical = 0;
    if (inVoid) {
      const forwardScale = Math.cos(this.pitch);
      fx = sy * fwd * forwardScale - cy * str;
      fz = cy * fwd * forwardScale + sy * str;
      voidVertical = Math.sin(this.pitch) * fwd + (k.has("Space") ? 1 : 0) - (k.has("ShiftLeft") ? 1 : 0);
    }
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    let speed = 4.3;
    if (k.has("ControlLeft") || k.has("ControlRight")) speed = 6.6;
    if (!inVoid && prone) speed = 1.6;
    else if (!inVoid && oneLeg) speed *= 0.55;
    if (!inVoid && crushed) speed = 1.2;
    if (this.inFluid) speed *= 0.55;
    speed *= 1 + this.runeLevel("swift") * 0.18;
    if (this.mountForg) speed = 7;
    if (creative && this.flying) speed = k.has("ControlLeft") ? 22 : 11;
    if (s.poison > 0) speed *= 0.85;

    if (inVoid) {
      // Open space uses thrust and very light drag, preserving momentum instead of pulling back to the shell.
      const thrust = speed * 2.2;
      this.vel.x += fx * thrust * dt;
      this.vel.z += fz * thrust * dt;
      this.vel.y += voidVertical * thrust * dt;
      this.vel.multiplyScalar(Math.exp(-0.06 * dt));
      this.vel.clampLength(0, 30);
    } else {
      const accel = this.onGround || this.flying || this.inFluid ? 14 : 3.5;
      this.vel.x += (fx * speed - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (fz * speed - this.vel.z) * Math.min(1, accel * dt);
    }

    // gravity: radiates outward from the longitudinal axis (centrifugal) ∝ r; zero-g deadzone near the sun
    let g = r > ZERO_G_RADIUS ? 24 * xScale(this.pos.y) : 0;
    if (inVoid) g = 0;
    const zeroG = r <= ZERO_G_RADIUS;
    if (inVoid) {
      // Free-flight thrust was integrated above; no radial gravity or shell attraction here.
    } else if (this.flying) {
      g = 0;
      const vy = (k.has("Space") ? 1 : 0) - (k.has("ShiftLeft") ? 1 : 0);
      this.vel.y += (vy * speed - this.vel.y) * Math.min(1, 10 * dt);
    } else if (zeroG) {
      const vy = (k.has("Space") ? 1 : 0) - (k.has("ShiftLeft") ? 1 : 0);
      this.vel.y += vy * 6 * dt;
      this.vel.multiplyScalar(1 - 0.4 * dt);
    } else if (this.inFluid) {
      this.vel.y -= g * 0.25 * dt;
      this.vel.y *= 1 - 2.5 * dt;
      if (k.has("Space")) this.vel.y += 14 * dt;
    } else {
      this.vel.y -= g * dt;
      if (k.has("Space")) {
        if (this.onGround) {
          this.vel.y = (prone ? 4 : crushed ? 3 : 8.2) * (1 + this.runeLevel("leap") * 0.12) * (this.mountForg ? 2.2 : 1);
          this.onGround = false;
        } else if (!this.mountForg && s.flight > 0 && this.vel.y < 6) {
          // moth flutter — capacity scales with wing integrity
          const wf = creative ? 1 : this.wingFactor();
          const thrust = 31 * wf * (1 + this.runeLevel("leap") * 0.1);
          this.vel.y += thrust * dt;
          s.flight = Math.max(0, s.flight - dt * 14);
        }
      }
    }
    if (this.onGround) s.flight = Math.min(100 * (creative ? 1 : this.wingFactor()), s.flight + dt * 25);
    this.vel.y = Math.max(-40, Math.min(30, this.vel.y));

    // Orbiting islands carry whatever is standing on them.
    this.carrying = this.skyIslands.solidAt(toWorld(this.pos.x, this.pos.y - 0.25, this.pos.z, _probe));
    if (this.carrying) this.pos.x = wrapX(this.pos.x + this.carrying.deltaU);

    // integrate with collision
    const preVy = this.vel.y;
    this.onGround = false;
    this.moveAxis(0, (this.vel.x * dt) / xScale(this.pos.y), hh);
    this.moveAxis(2, this.vel.z * dt, hh);
    this.moveAxis(1, this.vel.y * dt, hh);
    this.pos.x = (this.pos.x + N) % N;

    // fall damage / crushing
    if (this.onGround && preVy < -15 && !creative && !this.inFluid && !this.mountForg) {
      const impact = -preVy;
      const dmg = (impact - 15) * 2.6;
      this.damagePlayer(dmg * 0.5, "fall", "lleg");
      this.damagePlayer(dmg * 0.5, "fall", "rleg");
      if (impact > 25) {
        s.crushed = 12;
        this.damagePlayer(dmg * 0.4, "crushing impact", "torso");
        store.say("💥 CRUSHED! Your body has been flattened by the impact.", "#ff8040");
      }
    }
    if (s.crushed > 0) s.crushed = Math.max(0, s.crushed - dt);

    // sun contact
    if (r < SUN_RADIUS + 1.6) {
      this.damagePlayer(25 * dt, "the Central Sun");
      this.vel.y -= 20 * dt;
    }
    if (this.pos.y > R - 1) { this.pos.y = R - 1; this.vel.y = Math.min(0, this.vel.y); }
    if (!inVoid) {
      if (this.pos.z < 0.5) this.pos.z = 0.5;
      if (this.pos.z > L - 0.5) this.pos.z = L - 0.5;
    }
  }

  collides(px: number, py: number, pz: number, hh: number) {
    const sc = xScale(py);
    const hw = 0.3;
    const hwx = hw / sc;
    const w = this.world;
    // columns are ≥ 1 shell unit wide and the player is 0.6 wide, so sampling both edges catches every overlapped column
    const y0 = Math.floor(py), y1 = Math.floor(py + hh - 0.01);
    for (const u of [px - hwx, px, px + hwx])
      for (let y = y0; y <= y1; y++)
        for (const z of [pz - hw, pz + hw]) if (isSolid(w.get(u, y, z))) return true;
    for (const island of this.bridgeIslands) {
      let du = px - island.u;
      if (du > N / 2) du -= N;
      if (du < -N / 2) du += N;
      const dx = du * xScale((py + island.topY) * 0.5);
      if (Math.abs(dx) < island.rx && Math.abs(pz - island.z) < island.rz && py < island.topY && py + hh > island.topY) return true;
    }
    for (const sample of [0.1, hh * 0.5, hh - 0.05]) {
      if (this.skyIslands.solidAt(toWorld(px, py + sample, pz, _probe))) return true;
    }
    return false;
  }

  moveAxis(axis: 0 | 1 | 2, amount: number, hh: number) {
    if (amount === 0) return;
    const steps = Math.ceil(Math.abs(amount) / 0.25);
    const d = amount / steps;
    for (let i = 0; i < steps; i++) {
      const p = this.pos.clone();
      p.setComponent(axis, p.getComponent(axis) + d);
      if (this.collides(p.x, p.y, p.z, hh)) {
        if (axis === 1) {
          if (d < 0) {
            this.onGround = true;
            const snap = Math.floor(p.y) + 1;
            if (!this.collides(this.pos.x, snap, this.pos.z, hh) && snap <= this.pos.y) this.pos.y = snap;
          }
          this.vel.y = 0;
        } else {
          if (axis === 0) this.vel.x = 0;
          else this.vel.z = 0;
        }
        return;
      }
      this.pos.copy(p);
    }
  }

  updateMetabolism(dt: number) {
    const s = store.s;
    if (s.mode === "creative") return;
    // multi-day drain: hunger over ~3 days, thirst over ~2 days
    s.hunger = Math.max(0, s.hunger - (dt * 100) / (DAY_LEN * 3));
    s.thirst = Math.max(0, s.thirst - (dt * 100) / (DAY_LEN * 2) * (this.world.biomeAt(this.pos.x, this.pos.z) === Biome.SPIKED ? 2 : 1));
    if (s.hunger <= 0) this.damagePlayer(dt * 0.6, "starvation", "torso");
    if (s.thirst <= 0) this.damagePlayer(dt * 0.9, "dehydration", "head");
    if (s.poison > 0) {
      s.poison = Math.max(0, s.poison - dt);
      if (Math.random() < dt * 1.2) this.damagePlayer(1.2, "meat poisoning");
    }
    // passive regen when fed & watered
    const vigor = this.runeLevel("vigor");
    if (s.hunger > 60 && s.thirst > 60 && s.poison <= 0) {
      (Object.keys(s.limbs) as LimbKey[]).forEach((k) => {
        const l = s.limbs[k];
        if (!l.lost) l.hp = Math.min(LIMB_MAX[k], l.hp + dt * (0.08 + vigor * 0.4));
      });
    }
    // runic energy drain
    const active = s.runes.filter(Boolean).length;
    if (s.armorGold && active > 0 && s.runeEnergy > 0) s.runeEnergy = Math.max(0, s.runeEnergy - dt * active * 0.05);
  }

  // ================= RAYCAST & INTERACT =================
  eyeHeight() {
    const s = store.s;
    if (s.limbs.lleg.lost && s.limbs.rleg.lost) return 0.45;
    if (s.crushed > 0) return 0.32;
    return 1.6;
  }
  forward(out = new THREE.Vector3()) {
    const e = new THREE.Vector3(), u = new THREE.Vector3(), n = new THREE.Vector3();
    basisAt(this.pos.x, e, u, n);
    const cp = Math.cos(this.pitch);
    return out.set(0, 0, 0).addScaledVector(e, Math.sin(this.yaw) * cp).addScaledVector(n, Math.cos(this.yaw) * cp).addScaledVector(u, Math.sin(this.pitch)).normalize();
  }
  eyeWorld(out = new THREE.Vector3()) {
    return toWorld(this.pos.x, this.pos.y + this.eyeHeight(), this.pos.z, out);
  }
  raycastBlock() {
    const o = this.eyeWorld();
    const d = this.forward();
    const p = new THREE.Vector3(), g = new THREE.Vector3();
    let pcol = NaN, py = NaN, pz = NaN;
    let lcol = -1, ly = -1, lz = -1;
    for (let t = 0; t < REACH; t += 0.02) {
      p.copy(o).addScaledVector(d, t);
      fromWorld(p, g);
      const y = Math.floor(g.y), z = Math.floor(g.z);
      if (y < 0 || y >= H) {
        pcol = NaN; py = NaN; pz = NaN;
        continue;
      }
      const col = colOf(g.x, y);
      if (col === lcol && y === ly && z === lz) continue;
      const b = this.world.getC(col, y, z);
      if (b !== B.AIR && !isFluid(b)) return { col, y, z, pcol, py, pz, dist: t, id: b, u: g.x };
      lcol = col; ly = y; lz = z;
      pcol = col; py = y; pz = z;
    }
    return null;
  }

  raycastFluid() {
    const o = this.eyeWorld();
    const d = this.forward();
    const p = new THREE.Vector3(), g = new THREE.Vector3();
    for (let t = 0; t < REACH; t += 0.05) {
      p.copy(o).addScaledVector(d, t);
      fromWorld(p, g);
      const b = this.world.getF(g.x, g.y, g.z);
      if (isFluid(b)) return { x: Math.floor(g.x), y: Math.floor(g.y), z: Math.floor(g.z), id: b, dist: t };
      if (isSolid(b)) return null;
    }
    return null;
  }
  raycastEntity(maxDist: number) {
    const o = this.eyeWorld();
    const d = this.forward();
    let best: Entity | null = null, bd = maxDist;
    const c = new THREE.Vector3();
    for (const e of this.entities) {
      if (e.dead || e.kind === "peer") continue;
      if (e.kind === "forg" && (e as Forg).mounted) continue;
      toWorld(e.pos.x, e.pos.y + e.height / 2, e.pos.z, c);
      const rad = Math.max(0.55, e.radius, e.height / 2.2);
      const oc = c.sub(o);
      const tca = oc.dot(d);
      if (tca < 0) continue;
      const d2 = oc.lengthSq() - tca * tca;
      if (d2 > rad * rad) continue;
      const t = tca - Math.sqrt(rad * rad - d2);
      if (t < bd) { bd = t; best = e; }
    }
    return best ? { e: best, dist: bd } : null;
  }

  heldStack(): ItemStack | null {
    return store.s.inventory[store.s.selected];
  }
  toolMult(blockId: number) {
    const st = this.heldStack();
    const def = BLOCKS[blockId];
    if (store.s.mode === "creative") return 1000;
    if (st?.kind === "tool") {
      const tier = TOOL_TIER[st.material] ?? 1;
      const match = (def.tool === "pick" && st.tool === "pickaxe") || (def.tool === "axe" && st.tool === "axe") || (def.tool === "shovel" && st.tool === "shovel");
      if (match) return 1 + tier * st.quality * 2;
      return 1.1;
    }
    return 1;
  }
  weaponDamage() {
    const st = this.heldStack();
    if (store.s.mode === "creative") return 999;
    if (st?.kind === "tool") {
      const tier = TOOL_TIER[st.material] ?? 1;
      if (st.tool === "sword") return 3 + tier * 4.5 * st.quality;
      return 2 + tier * st.quality;
    }
    return 2;
  }

  updateInteraction(dt: number) {
    const s = store.s;
    this.attackCd -= dt;
    this.placeCd -= dt;
    const hb = this.raycastBlock();
    const he = this.raycastEntity(hb ? hb.dist : REACH);
    this.hit = hb;
    // selection outline
    const arr = (this.selection.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    if (hb && !he) {
      this.selection.visible = true;
      const c = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
      const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      const v = new THREE.Vector3();
      const [u0, u1] = this.world.uBounds(hb.col, hb.y);
      const uw = u1 - u0;
      let i = 0;
      for (const [a, b2] of edges) {
        for (const q of [c[a], c[b2]]) {
          toWorld(u0 + uw * 0.5 + (q[0] - 0.5) * uw * 1.004, hb.y + (q[1] - 0.5) * 1.004 + 0.5, hb.z + (q[2] - 0.5) * 1.004 + 0.5, v);
          arr[i++] = v.x; arr[i++] = v.y; arr[i++] = v.z;
        }
      }
      this.selection.geometry.getAttribute("position").needsUpdate = true;
    } else this.selection.visible = false;
    s.lookingAt = he ? he.e.label : hb ? BLOCKS[hb.id]?.name ?? "" : "";

    // LEFT: attack / mine
    if (this.mouseL) {
      if (he && this.attackCd <= 0) {
        this.attackCd = 0.4;
        this.attackEntity(he.e);
      } else if (!he && hb) {
        const key = `${hb.col},${hb.y},${hb.z}`;
        if (key !== this.mineTarget) { this.mineTarget = key; this.mineProgress = 0; }
        const def = BLOCKS[hb.id];
        const time = s.mode === "creative" ? 0.12 : def.hardness / this.toolMult(hb.id);
        this.mineProgress += dt;
        s.mining = Math.min(1, this.mineProgress / Math.max(0.05, time));
        if (this.mineProgress >= time) {
          this.mineProgress = 0;
          s.mining = 0;
          this.breakBlock(hb.col, hb.y, hb.z, true);
        }
      }
    }
    // RIGHT: interact / use / place
    if (this.mouseR && this.placeCd <= 0) {
      this.placeCd = 0.25;
      this.rightClick(hb, he?.e ?? null);
    }
  }

  attackEntity(e: Entity) {
    const s = store.s;
    const dmg = this.weaponDamage();
    e.hurt(dmg, this.ctx);
    // knockback
    const d = gdelta(this.pos.x, this.pos.y, this.pos.z, e.pos.x, e.pos.y, e.pos.z);
    if (d.dist > 0.01 && !(e instanceof Obil) && !(e instanceof Warper)) {
      e.vel.x += (d.dx / d.dist) * 5;
      e.vel.z += (d.dz / d.dist) * 5;
      e.vel.y += 3;
    }
    const st = this.heldStack();
    if (st?.kind === "tool" && s.mode === "survival") {
      st.durability -= 1;
      if (st.durability <= 0) { store.say(`Your ${stackName(st)} shattered.`, "#f88"); consumeSelected(s); }
    }
    if (e.dead) this.onEntityKilled(e);
  }
  onEntityKilled(e: Entity) {
    const s = store.s;
    s.killLog.push(e.kind);
    for (const dr of e.drops()) {
      if (dr.item) addItem(s, { kind: "item", key: dr.item, count: dr.count });
      if (dr.block) addItem(s, { kind: "block", id: dr.block, count: dr.count });
    }
    const st = this.heldStack();
    // swords auto-recharge runic energy unless only slaying skeletons
    if (st?.kind === "tool" && st.tool === "sword" && s.armorGold && e.kind !== "skeleton" && e.kind !== "debris") {
      s.runeEnergy = Math.min(100, s.runeEnergy + 15);
      store.say("Your sword drinks the kill: +15 runic energy.", "#ff7ad1");
    }
    if (e.kind === "false_player") store.say("The False Player dissolves into inverted static.", "#ccc");
    store.bump();
  }

  breakBlockU(u: number, y: number, z: number, drop: boolean) {
    y = Math.floor(y);
    if (y < 0 || y >= H) return;
    this.breakBlock(colOf(u, y), y, Math.floor(z), drop);
  }
  breakBlock(col: number, y: number, z: number, drop: boolean) {
    const s = store.s;
    const id = this.world.getC(col, y, z);
    if (id === B.AIR) return;
    if (id === B.OBELISK && s.mode !== "creative") { store.say("The Obelisk Seal cannot be broken. Right-click it... if you dare.", "#f48"); return; }
    this.world.setC(col, y, z, B.AIR);
    if (drop && s.mode === "survival") {
      const def = BLOCKS[id];
      const d = def.drop === undefined ? id : def.drop;
      if (d !== null && d !== undefined) {
        if (id === B.URANIUM) addItem(s, { kind: "item", key: "uranium_dust", count: 2 });
        addItem(s, { kind: "block", id: d, count: 1 });
      }
      const st = this.heldStack();
      if (st?.kind === "tool") {
        st.durability -= 1;
        if (st.durability <= 0) { store.say(`Your ${stackName(st)} shattered.`, "#f88"); consumeSelected(s); }
      }
    }
    if (id === B.IRON_CRUST && y === 0) {
      store.toast("THE CRUST RUPTURES", "Beyond the iron shell: open, gravity-free void.");
    }
    this.afterBreak(col, y, z, id);
    store.bump();
  }
  afterBreak(col: number, y: number, z: number, id: number) {
    if (y + 1 < H) this.sandQueue.add(`${this.world.above(col, y)},${y + 1},${z}`);
    if (id === B.PYLON) {
      const u = uOf(col, y);
      this.world.pylons = this.world.pylons.filter((p) => !(Math.abs(p.x - u) < CW[y] && (p.y === y || p.y + 1 === y) && p.z === z));
    }
  }

  onBlockSet(col: number, y: number, z: number, id: number) {
    const key = `${col},${y},${z}`;
    this.machines.cranks.delete(key);
    this.machines.pistons.delete(key);
    if (id === B.CRANK || id === B.CRANK_ON) this.machines.cranks.add(key);
    if (id === B.PISTON) this.machines.pistons.add(key);
    if (id === B.SAND) this.sandQueue.add(key);
    if (this.lan && !this.applyingRemote) this.lan.postMessage({ t: "block", col, y, z, id, from: this.peerId });
  }
  applyingRemote = false;

  rightClick(hb: ReturnType<Engine["raycastBlock"]>, ent: Entity | null) {
    const s = store.s;
    const st = this.heldStack();
    const heldKey = st?.kind === "item" ? st.key : st?.kind === "block" ? "block:" + st.id : null;
    // entity interaction
    if (ent) {
      const r = ent.interact(this.ctx, heldKey);
      if (r === "consume") { consumeSelected(s); store.bump(); return; }
      if (r === "milk") { consumeSelected(s); addItem(s, { kind: "item", key: "milk", count: 1, age: 0 }); store.bump(); return; }
      if (r === "mount" && ent instanceof Forg) { this.mount(ent); return; }
      if (ent instanceof Chill) { this.chillSays("Hey :] Type 'recipes' in chat and I'll tell you what I know."); return; }
    }
    // block interaction
    const sneaking = this.keys.has("ShiftLeft");
    if (hb && !sneaking) {
      const id = hb.id;
      if (BLOCKS[id]?.interact) {
        if (this.interactBlock(hb.col, hb.y, hb.z, id, st)) return;
      }
    }
    // fluids: buckets, drinking, steaming
    const fl = this.raycastFluid();
    if (fl && (!hb || fl.dist < hb.dist)) {
      if (heldKey === "bucket") {
        consumeSelected(s);
        addItem(s, { kind: "item", key: fl.id === B.BLOOD ? "blood_bucket" : "water_bucket", count: 1 });
        store.say(`Filled bucket with ${fl.id === B.BLOOD ? "liquid blood" : "water"}.`, fl.id === B.BLOOD ? "#f44" : "#6af");
        store.bump();
        return;
      }
      if (heldKey === "processed_pork" && fl.id === B.WATER && this.isSteaming(fl.x, fl.y, fl.z)) {
        consumeSelected(s);
        addItem(s, { kind: "item", key: "steamed_pork", count: 1 });
        this.unlockAchievement();
        return;
      }
      if (heldKey === "processed_pork" && fl.id === B.WATER) {
        store.say("The water needs to be steaming (heat it with magma underneath) to steam the pork.", "#ccc");
        return;
      }
      if (!st && fl.id === B.WATER) {
        s.thirst = Math.min(100, s.thirst + 12);
        store.say("You sip the water. (+thirst)", "#6af");
        store.bump();
        return;
      }
    }
    if (!st) return;
    // consumables
    if (st.kind === "item") {
      const def = ITEMS[st.key];
      if (st.key === "blood_bucket") {
        if (s.armorGold) { s.runeEnergy = 100; consumeSelected(s); addItem(s, { kind: "item", key: "bucket", count: 1 }); store.say("Liquid blood surges through your gold armor. Runic energy restored.", "#ff3040"); store.bump(); return; }
        store.say("Liquid blood recharges runic sigils on Gold Armor. You have none equipped.", "#f66");
        return;
      }
      if (st.key === "water_bucket") {
        if (sneaking && hb && !isNaN(hb.pcol)) { this.placeAt(hb.pcol, hb.py, hb.pz, B.WATER); consumeSelected(s); addItem(s, { kind: "item", key: "bucket", count: 1 }); return; }
        s.thirst = Math.min(100, s.thirst + (def.drink ?? 0));
        consumeSelected(s);
        addItem(s, { kind: "item", key: "bucket", count: 1 });
        store.say("Gulp. (+40 thirst) — sneak+right-click to pour instead.", "#6af");
        store.bump();
        return;
      }
      if (hb && hb.id === B.MAGMA && def?.poison) {
        consumeSelected(s);
        addItem(s, { kind: "item", key: "cooked_meat", count: 1 });
        store.say("Seared on magma. Safe to eat.", "#fa4");
        store.bump();
        return;
      }
      if (def?.food || def?.drink) {
        s.hunger = Math.min(100, s.hunger + (def.food ?? 0));
        s.thirst = Math.min(100, s.thirst + (def.drink ?? 0));
        if (def.poison) { s.poison += 25; store.say(`You ate ${def.name}. Raw meat infests you with POISON.`, "#7f4"); }
        else store.say(`You ate ${def.name}.`, "#fc8");
        if (st.key === "steamed_pork") store.say("An Albany Expression of flavour.", "#ffd23a");
        consumeSelected(s);
        store.bump();
        return;
      }
    }
    if (st.kind === "tool" && st.tool === "chestplate") {
      if (st.material === B.GOLD_ORE) {
        s.armorGold = true;
        consumeSelected(s);
        store.toast("GOLD ARMOR EQUIPPED", "Press R to open the Runic Grid. Recharge with liquid blood.");
      } else store.say("Only gold acts as a magic conduit. This chestplate is purely decorative.", "#ccc");
      store.bump();
      return;
    }
    // placing blocks
    if (st.kind === "block" && hb && !isNaN(hb.pcol)) {
      if (this.placeAt(hb.pcol, hb.py, hb.pz, st.id)) {
        if (s.mode === "survival") consumeSelected(s);
        store.bump();
      }
    }
  }

  placeAt(col: number, y: number, z: number, id: number) {
    const w = this.world;
    if (y < 0 || y >= H || z < 0 || z >= L) return false;
    const cur = w.getC(col, y, z);
    if (cur !== B.AIR && !isFluid(cur)) return false;
    const u = uOf(col, y);
    if (isSolid(id)) {
      const hh = this.eyeHeight() + 0.15;
      const sc = xScale(this.pos.y);
      let dx = u - this.pos.x;
      if (dx > N / 2) dx -= N;
      if (dx < -N / 2) dx += N;
      if (Math.abs(dx * sc) < 0.8 && Math.abs(z + 0.5 - this.pos.z) < 0.8 && y + 1 > this.pos.y && y < this.pos.y + hh) return false;
    }
    w.setC(col, y, z, id);
    w.recordBuild(col, y, z);
    if (id === B.PYLON) {
      const name = `Pylon #${w.pylons.length + 1} (${BIOME_NAMES[w.biomeAt(u, z)]})`;
      w.pylons.push({ x: u, y, z, name });
      store.say(`Pylon linked to the network: ${name}`, "#c8f");
    }
    if (id === B.WIRE || id === B.PISTON || id === B.CRANK) this.updatePower();
    return true;
  }

  interactBlock(col: number, y: number, z: number, id: number, st: ItemStack | null): boolean {
    const s = store.s;
    const x = uOf(col, y);
    switch (id) {
      case B.PYLON:
        this.openUI("pylon");
        return true;
      case B.BED:
        if (!this.isNight && s.mode === "survival" && s.time > 0.05 && s.time < 0.45) {
          store.say("You can rest at any time, but the moth in you prefers the dark. (Sleeping anyway.)", "#aaa");
        }
        this.openUI("sleep");
        return true;
      case B.WORKBENCH:
        if (st?.kind === "item" && st.key === "raw_pork") {
          consumeSelected(s);
          addItem(s, { kind: "item", key: "processed_pork", count: 1 });
          store.say("You process the raw pork into a dense Pork Loaf. Now find steam...", "#fc8");
          store.bump();
          return true;
        }
        this.openUI("chisel");
        return true;
      case B.TOILET: {
        if (Math.random() < 0.0001) this.spawnSpider(x, y, z);
        else store.say("*flush*", "#9cf");
        return true;
      }
      case B.CRANK:
      case B.CRANK_ON:
        this.world.setC(col, y, z, id === B.CRANK ? B.CRANK_ON : B.CRANK);
        store.say(id === B.CRANK ? "Crank engaged ⟳" : "Crank released", "#e0b040");
        this.updatePower();
        return true;
      case B.GOLEM_CORE:
        this.world.setC(col, y, z, B.AIR);
        this.addEntity(new RoundGolem(x, y + 1, z + 0.5));
        store.say("The round golem awakens. Conduit Arrays increase its gathering reach; its shell is capped at 128 blocks.", "#b8d9b1");
        return true;
      case B.OBELISK:
        if (this.boss) { store.say("A boss is already active.", "#f48"); return true; }
        this.summonEncounter(this.nextBoss, x, z);
        return true;
      case B.SHRINE: {
        const key = `${col},${y},${z}`;
        if (this.litShrines.has(key)) { store.say("This shrine already burns.", "#d8c27a"); return true; }
        this.litShrines.add(key);
        if (this.world.get(x, y + 1, z) === B.AIR) this.world.set(x, y + 1, z, B.MAGMA);
        this.shrinesLit++;
        store.toast("ANCIENT SHRINE LIT", `${this.shrinesLit} shrine(s) burn against the coming corruption.`);
        return true;
      }
    }
    return false;
  }

  isSteaming(u: number, y: number, z: number) {
    for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -2, 0]]) if (this.world.getRel(u, y, z, dx, dy, dz) === B.MAGMA) return true;
    return false;
  }

  unlockAchievement() {
    const s = store.s;
    s.aurora = true;
    localStorage.setItem("ernas_aurora", "1");
    if (!s.achievement) {
      s.achievement = true;
      localStorage.setItem("ernas_achievement", "1");
      store.toast("🏆 ACHIEVEMENT: An Albany Expression", "You steamed processed pig meat. The Aurora Borealis now haunts the sky... forever?");
    } else store.toast("An Albany Expression", "The aurora returns.");
    store.say("A permanent Aurora Borealis ignites around the axis. Only the Chill Entity can turn it off.", "#7fffb0");
  }

  spawnSpider(x: number, y: number, z: number) {
    this.addEntity(new DanceSpider(x + 0.5, y + 0.3, z + 0.5));
    store.toast("🕷 ???", "Something emerges from the toilet...");
  }

  mount(f: Forg) {
    this.mountForg = f;
    f.mounted = true;
    store.s.mounted = true;
    this.pos.copy(f.pos);
    this.pos.y += 1.7;
    store.say("You mount THE FORG. Space for colossal leaps. X to dismount.", "#7dff4a");
  }
  dismount() {
    if (!this.mountForg) return;
    this.mountForg.mounted = false;
    this.mountForg.pos.copy(this.pos);
    this.mountForg.pos.y -= 1.6;
    this.mountForg = null;
    store.s.mounted = false;
    store.say("Dismounted.", "#7dff4a");
  }

  // ================= BOSSES =================
  get nextBoss(): BossName {
    return BOSS_ORDER.find((name) => !this.bossesDefeated.has(name)) ?? BOSS_ORDER[0];
  }
  summonEncounter(name: BossName = this.nextBoss, u = wrapX(this.pos.x + 12 / xScale(this.pos.y)), z = Math.max(4, Math.min(L - 5, this.pos.z + 6))) {
    if (this.boss && !this.boss.dead) { store.say("An encounter is already active.", "#ffb97d"); return; }
    if (store.s.mode !== "creative" && name !== this.nextBoss) { store.say(`The seal calls for ${this.nextBoss} first.`, "#ffb97d"); return; }
    this.pendingWarper = -1;
    if (name === "OBIL") { this.summonObil(u, this.world.heightAt(u, z) + 1, z); return; }
    if (name === "THE WARPER") { this.summonWarper(); return; }
    const boss = new AdvancedBoss(u, this.world.heightAt(u, z) + 2, z, name);
    this.boss = boss; this.addEntity(boss);
    store.s.boss = { name, hp: boss.hp, max: boss.maxHp };
    store.toast(name, BOSS_TIPS[name]);
  }
  summonObil(u: number, y: number, z: number) {
    const o = new Obil(wrapX(u + 5), y + 2, Math.floor(z) + 0.5);
    this.boss = o;
    this.addEntity(o);
    store.s.boss = { name: "OBIL — The Gravity Obelisk", hp: o.hp, max: o.maxHp };
    store.toast("PHASE I: OBIL", "Swat its flying debris (left-click) to charge it. When the vortex reverses, charged debris deals 33.3% to its core.");
    store.say("OBIL awakens. Terrain dislodges in expanding spheres...", "#ff2850");
  }
  onBossDefeated(name: string) {
    this.bossesDefeated.add(name);
    this.boss = null;
    store.s.boss = null;
    if (name === "OBIL") {
      store.toast("OBIL HAS FALLEN", "Phase I complete. Something parses your kill log...");
      this.pendingWarper = 20;
    } else if (name === "THE WARPER") {
      store.toast("THE WARPER IS UNSTITCHED", "The seal now calls THE SCRUNCLE. Activate it when you are ready.");
    } else if (name === "THE DIMENSIONAL CORE") {
      store.toast("THE CORE FALLS", "All six ring encounters are complete. The outer sphere and moons remain absent.");
    } else {
      store.toast(`${name} DEFEATED`, `Return to the seal for ${this.nextBoss}.`);
    }
    store.s.runeEnergy = Math.min(100, store.s.runeEnergy + 35);
    addItem(store.s, { kind: "block", id: B.GOLD_ORE, count: 4 });
    store.bump();
  }
  summonWarper() {
    const w = new Warper(this.pos.x, this.pos.y + 6, Math.min(L - 10, this.pos.z + 10), store.s.killLog);
    this.boss = w;
    this.addEntity(w);
    store.s.boss = { name: "THE WARPER", hp: w.hp, max: w.maxHp };
    store.toast("PHASE II: THE WARPER", `It stitched ${Math.min(24, store.s.killLog.length || 4)} of your past kills into a fleshy shield.`);
  }

  // ================= WORLD SYSTEMS =================
  updateEntities(dt: number) {
    for (const e of this.entities) {
      if (!e.dead) {
        const distance = gdelta(this.pos.x, this.pos.y, this.pos.z, e.pos.x, e.pos.y, e.pos.z).dist;
        e.group.visible = distance < 650 || e === this.boss;
        e.update(dt, this.ctx);
      }
    }
    const dead = this.entities.filter((e) => e.dead);
    if (dead.length) {
      for (const e of dead) {
        e.dispose(this.scene);
        if (e === this.boss) { this.boss = null; }
        if (e instanceof RemoteMoth) this.peers.delete(e.peerId);
      }
      this.entities = this.entities.filter((e) => !e.dead);
    }
    if (this.pendingWarper > 0) {
      this.pendingWarper -= dt;
      if (this.pendingWarper <= 0) this.summonWarper();
    }
    if (this.mountForg) {
      this.mountForg.pos.copy(this.pos);
      this.mountForg.pos.y -= 1.6;
      this.mountForg.yaw = this.yaw;
    }
    // spawning
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2.5;
      const passive = this.entities.filter((e) => e instanceof Mob || e instanceof Butterfly || e instanceof Fish).length;
      if (passive < 22) this.trySpawnPassive();
      this.trySpawnEcology();
      // despawn far passive mobs
      for (const e of this.entities) {
        if ((e instanceof Mob && !e.tamed) || e instanceof Butterfly || e instanceof Fish || (e instanceof SkyCreature && !e.tamed) || e instanceof BoneThief || e instanceof DoomWalker) {
          if (gdelta(this.pos.x, this.pos.y, this.pos.z, e.pos.x, e.pos.y, e.pos.z).dist > 170) e.dead = true;
        }
      }
      if (this.isNight && !store.s.inVoid) {
        const hostiles = this.entities.filter((e) => e instanceof Hostile);
        if (hostiles.filter((h) => (h as Hostile).type === "skeleton").length < 6 && Math.random() < 0.6) this.spawnNear((x, y, z) => new Hostile(x, y, z, "skeleton"));
        if (!hostiles.some((h) => (h as Hostile).type === "false_player") && Math.random() < 0.08) {
          this.spawnNear((x, y, z) => new Hostile(x, y, z, "false_player"));
          store.say("Something that looks exactly like you — but inverted — is approaching your base.", "#ddd");
        }
      }
      const b = this.world.biomeAt(this.pos.x, this.pos.z);
      if ((b === Biome.REEF || b === Biome.BROKEN) && Math.random() < 0.05 && !this.entities.some((e) => e instanceof Hostile && e.type === "flamingo")) {
        this.spawnNear((x, y, z) => new Hostile(x, y, z, "flamingo"));
      }
    }
  }
  spawnNear(make: (x: number, y: number, z: number) => Entity, minD = 16, maxD = 32) {
    if (store.s.inVoid) return null;
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = minD + Math.random() * (maxD - minD);
      const x = Math.floor(this.pos.x + (Math.cos(a) * d) / xScale(this.pos.y) + N) % N;
      const z = Math.floor(this.pos.z + Math.sin(a) * d);
      if (z < 3 || z > L - 4) continue;
      const y = this.world.heightAt(x, z);
      if (!isSolid(this.world.get(x, y, z)) || isSolid(this.world.get(x, y + 1, z)) || isSolid(this.world.get(x, y + 2, z))) continue;
      if (isFluid(this.world.get(x, y + 1, z))) continue;
      if (y > H - 5) continue;
      const e = make(x + 0.5, y + 1.05, z + 0.5);
      this.addEntity(e);
      return e;
    }
    return null;
  }
  trySpawnPassive() {
    const b = this.world.biomeAt(this.pos.x, this.pos.z);
    let types = ["pig", "cow", "chicken", "dog", "cat", "mouse"];
    if (b === Biome.TAIGA || b === Biome.MOUNTAIN) types = ["kiwi", "cow", "dog", "mouse"];
    if (b === Biome.REEF || b === Biome.OCEAN || b === Biome.MARSH) types = ["frog", "frog", "chicken", "cat"];
    if (b === Biome.SPIKED || b === Biome.BROKEN) types = ["pig", "frog"];
    if (!this.isNight && Math.random() < 0.3) {
      this.spawnNear((x, y, z) => new Butterfly(x, y + 2, z), 8, 24);
      return;
    }
    const t = types[Math.floor(Math.random() * types.length)];
    this.spawnNear((x, y, z) => new Mob(x, y, z, t), 12, 30);
  }

  trySpawnEcology() {
    if (store.s.inVoid) return;
    const fishCount = this.entities.filter((e) => e instanceof Fish).length;
    if (fishCount < 7) {
      for (let i = 0; i < 5; i++) {
        const u = wrapX(this.pos.x + (Math.random() - 0.5) * 70), z = Math.floor(this.pos.z + (Math.random() - 0.5) * 70);
        const y = Math.min(SEA - 1.5, this.world.heightAt(u, z) + 2);
        if (this.world.getF(u, y, z) !== B.WATER) continue;
        this.addEntity(new Fish(u, y, z, Math.random() < 0.5 ? "cod" : "salmon")); break;
      }
    }
    const flying = this.entities.filter((e) => e instanceof SkyCreature).length;
    if (flying < 5 && Math.random() < 0.35) {
      // Owls are the only flyers now: sky squirrels, cloud serpents, wyrms and geometric watchers were removed.
      const u = wrapX(this.pos.x + (Math.random() - 0.5) * 60);
      const z = Math.max(3, Math.min(L - 3, this.pos.z + (Math.random() - 0.5) * 60));
      this.addEntity(new SkyCreature(u, Math.max(this.pos.y + 9, this.world.heightAt(u, z) + 9), z));
    }
    if (this.isNight && !this.entities.some((e) => e instanceof BoneThief) && Math.random() < 0.18) this.spawnNear((x, y, z) => new BoneThief(x, y, z), 18, 34);
    if ((this.weather.model.tideActive || store.s.day >= 3) && !this.entities.some((e) => e instanceof DoomWalker) && Math.random() < 0.04) this.spawnNear((x, y, z) => new DoomWalker(x, y, z), 38, 60);
  }

  updateWorldSystems(dt: number) {
    const s = store.s;
    // sand falling physics
    this.sandT -= dt;
    if (this.sandT <= 0 && this.sandQueue.size) {
      this.sandT = 0.06;
      const q = [...this.sandQueue];
      this.sandQueue.clear();
      const w = this.world;
      for (const k of q.slice(0, 200)) {
        const [col, y, z] = k.split(",").map(Number);
        if (y <= 0 || y >= H || w.getC(col, y, z) !== B.SAND) continue;
        const bcol = w.below(col, y);
        const below = w.getC(bcol, y - 1, z);
        if (below === B.AIR || isFluid(below)) {
          w.setC(col, y, z, B.AIR);
          w.setC(bcol, y - 1, z, B.SAND);
          this.sandQueue.add(`${bcol},${y - 1},${z}`);
          if (y + 1 < H) this.sandQueue.add(`${w.above(col, y)},${y + 1},${z}`);
        }
      }
      for (const k of q.slice(200)) this.sandQueue.add(k);
    }
    // milk ages into cheese
    for (let i = 0; i < s.inventory.length; i++) {
      const st = s.inventory[i];
      if (st?.kind === "item" && st.key === "milk") {
        st.age = (st.age ?? 0) + dt;
        if (st.age > 45) { s.inventory[i] = { kind: "item", key: "cheese", count: st.count }; store.say("Your milk has aged into cheese. 🧀 Frogs love it.", "#ffd84a"); }
      }
    }
    // steam & radiation scanning
    this.steamScanT += dt;
    if (this.steamScanT > 0.6) {
      this.steamScanT = 0;
      this.steamSources = [];
      let rad = 0;
      const px = Math.floor(this.pos.x), py = Math.floor(this.pos.y), pz = Math.floor(this.pos.z);
      for (let dx = -10; dx <= 10; dx++)
        for (let dz = -10; dz <= 10; dz++)
          for (let dy = -6; dy <= 6; dy++) {
            const x = px + dx, y = py + dy, z = pz + dz;
            const b = this.world.get(x, y, z);
            if (b === B.WATER && this.world.get(x, y + 1, z) === B.AIR && this.isSteaming(x, y, z)) this.steamSources.push(new THREE.Vector3(x, y, z));
            if ((b === B.CRYSTAL || b === B.URANIUM) && Math.abs(dx) < 5 && Math.abs(dz) < 5 && Math.abs(dy) < 5) rad++;
            // balloon buoyancy: steam under balloon cloth lifts it
            if (b === B.BALLOON && this.world.get(x, y + 1, z) === B.AIR && Math.random() < 0.3) {
              for (let k = 1; k < 8; k++) {
                const bb = this.world.get(x, y - k, z);
                if (bb === B.WATER && this.isSteaming(x, y - k, z)) {
                  // lift balloon and the column hanging below it (until the steam gap)
                  const col: number[] = [];
                  for (let j = 0; j < k; j++) col.push(this.world.get(x, y - j, z));
                  for (let j = k - 1; j >= 0; j--) this.world.set(x, y - j + 1, z, col[j]);
                  this.world.set(x, y - k + 1, z, B.AIR);
                  break;
                }
                if (bb !== B.AIR) break;
              }
            }
          }
      s.radiation = rad;
      if (rad > 0 && s.mode === "survival") this.damagePlayer(Math.min(6, rad * 0.35), "proximity radiation");
    }
    // steam particles
    for (const src of this.steamSources) {
      if (this.steamP.length < 400 && Math.random() < 0.5) this.steamP.push({ x: src.x + Math.random(), y: src.y + 1, z: src.z + Math.random(), life: 2 + Math.random() * 2 });
    }
    const arr = (this.steam.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const v = new THREE.Vector3();
    this.steamP = this.steamP.filter((p) => (p.life -= dt) > 0);
    for (let i = 0; i < 400; i++) {
      const p = this.steamP[i];
      if (p) {
        p.y += dt * 2.2; // steam rises toward the axis
        p.x += (Math.random() - 0.5) * dt;
        p.z += (Math.random() - 0.5) * dt;
        toWorld(p.x, p.y, p.z, v);
        arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
      } else { arr[i * 3] = 0; arr[i * 3 + 1] = 0; arr[i * 3 + 2] = 9999; }
    }
    this.steam.geometry.getAttribute("position").needsUpdate = true;
    // LAN
    this.lanT -= dt;
    if (this.lan && this.lanT <= 0) {
      this.lanT = 0.1;
      this.lan.postMessage({ t: "pos", from: this.peerId, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw });
      s.peers = this.peers.size;
    }
  }

  // ================= POWER: wires, cranks, pistons =================
  updatePower() {
    const w = this.world;
    const powered = new Set<string>();
    const queue: [number, number, number][] = []; // u, y, z
    for (const k of this.machines.cranks) {
      const [col, y, z] = k.split(",").map(Number);
      if (w.getC(col, y, z) === B.CRANK_ON) { powered.add(k); queue.push([uOf(col, y), y, z]); }
    }
    const nbrs: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]];
    const nbrKey = (u: number, y: number, z: number, dx: number, dy: number, dz: number) => {
      const ny = y + dy;
      if (ny < 0 || ny >= H) return null;
      const nu = wrapX(u + dx * CW[ny]);
      return { col: colOf(nu, ny), ny, nz: z + dz };
    };
    let guard = 0;
    while (queue.length && guard++ < 2000) {
      const [u, y, z] = queue.shift()!;
      for (const [dx, dy, dz] of nbrs) {
        const nb = nbrKey(u, y, z, dx, dy, dz);
        if (!nb) continue;
        const k = `${nb.col},${nb.ny},${nb.nz}`;
        if (powered.has(k)) continue;
        const b = w.getC(nb.col, nb.ny, nb.nz);
        if (b === B.WIRE || b === B.WIRE_ON) { powered.add(k); queue.push([uOf(nb.col, nb.ny), nb.ny, nb.nz]); }
      }
    }
    // update wire visuals in a radius around powered/unpowered wires
    const px = Math.floor(this.pos.x), pz = Math.floor(this.pos.z);
    for (let dx = -24; dx <= 24; dx++)
      for (let dz = -24; dz <= 24; dz++)
        for (let y = 1; y < H; y++) {
          const x = (px + dx + N) % N, z = pz + dz;
          const b = w.get(x, y, z);
          if (b === B.WIRE || b === B.WIRE_ON) {
            const want = powered.has(`${colOf(x, y)},${y},${z}`) ? B.WIRE_ON : B.WIRE;
            if (want !== b) w.set(x, y, z, want, true);
          }
        }
    // pistons
    for (const k of this.machines.pistons) {
      const [col, y, z] = k.split(",").map(Number);
      const x = uOf(col, y);
      let on = false;
      for (const [dx, dy, dz] of nbrs) {
        const nb = nbrKey(x, y, z, dx, dy, dz);
        if (nb && powered.has(`${nb.col},${nb.ny},${nb.nz}`)) { on = true; break; }
      }
      const head = w.get(x, y + 1, z) === B.PISTON_HEAD;
      if (on && !head) {
        // push column up to 12 voxels toward the axis
        let n = 0;
        while (n < 13 && w.get(x, y + 1 + n, z) !== B.AIR && !isFluid(w.get(x, y + 1 + n, z))) n++;
        if (n > 12 || y + 1 + n >= H) { store.say("Piston jammed: column exceeds 12 voxels.", "#f88"); continue; }
        for (let i = n; i >= 1; i--) w.set(x, y + 1 + i, z, w.get(x, y + i, z));
        w.set(x, y + 1, z, B.PISTON_HEAD);
      } else if (!on && head) {
        w.set(x, y + 1, z, B.AIR);
      }
    }
  }

  // ================= CAMERA =================
  updateCamera() {
    const s = store.s;
    const e = new THREE.Vector3(), u = new THREE.Vector3(), n = new THREE.Vector3();
    basisAt(this.pos.x, e, u, n);
    const eye = this.eyeWorld();
    const f = this.forward();
    if (s.thirdPerson) {
      const back = eye.clone().addScaledVector(f, -4.2).addScaledVector(u, 0.6);
      this.camera.position.copy(back);
    } else this.camera.position.copy(eye);
    this.camera.up.copy(u);
    this.camera.lookAt(eye.clone().addScaledVector(f, 10));
    this.voidSky.position.copy(this.camera.position);
    this.glowLight.position.copy(eye);
    for (const material of this.lodMaterials) material.uniforms.uPlayer.value.copy(this.camera.position);
    // moth body (3rd person)
    const mb = this.mothBody;
    mb.visible = s.thirdPerson && s.phase === "playing";
    if (mb.visible) {
      placeObject(mb, this.pos.x, this.pos.y, this.pos.z, this.yaw);
      const L2 = s.limbs;
      (["head", "lwing", "rwing", "lleg", "rleg"] as LimbKey[]).forEach((k) => {
        const o = mb.getObjectByName(k);
        if (o) o.visible = !L2[k].lost;
      });
      for (const k of ["leye", "reye"] as LimbKey[]) {
        const o = mb.getObjectByName(k) as THREE.Mesh | undefined;
        if (o) o.visible = !L2[k].lost && (s.scars[k] ?? 0) < 2;
      }
      const prone = L2.lleg.lost && L2.rleg.lost;
      mb.scale.set(1, s.crushed > 0 ? 0.22 : 1, s.crushed > 0 ? 1.3 : 1);
      if (prone) mb.rotateX(Math.PI / 2 - 0.2);
      const flap = !this.onGround ? Math.sin(performance.now() / 40) * 0.7 : 0.15;
      const lw = mb.getObjectByName("lwing"), rw = mb.getObjectByName("rwing");
      if (lw) lw.rotation.y = flap;
      if (rw) rw.rotation.y = -flap;
    }
  }

  // ================= CHAT & CHILL =================
  chillSays(t: string) {
    store.say(t, "#9fd8ff", "Chill :]");
  }
  handleChat(text: string) {
    const s = store.s;
    const msg = text.trim();
    if (!msg) return;
    store.say(msg, "#fff", "You");
    if (this.lan) this.lan.postMessage({ t: "chat", from: this.peerId, text: msg });
    const low = msg.toLowerCase();
    if (low === "hey") {
      if (!this.chill || this.chill.dead) {
        const c = new Chill(this.pos.x, this.pos.y + 0.5, Math.min(L - 3, this.pos.z + 2));
        this.chill = c;
        this.addEntity(c);
        s.chillSpawned = true;
        this.chillSays("hey :]");
      } else this.chillSays("hey again :]");
      return;
    }
    if (low === "nyc") {
      if (this.chill && !this.chill.dead) {
        if (s.aurora) { s.aurora = false; localStorage.removeItem("ernas_aurora"); this.chillSays("ok :] the aurora is off."); }
        else this.chillSays("nyc :]");
      } else if (s.aurora) store.say("The aurora does not listen to you. Perhaps someone chill could help... (say hey)", "#7fffb0");
      store.bump();
      return;
    }
    if (low === "g'day" || low === "gday") {
      this.spawnSpider(this.pos.x + 2, this.pos.y, this.pos.z);
      return;
    }
    if (this.chill && !this.chill.dead && (low.includes("recipe") || low.includes("help") || low.includes("how"))) {
      [
        "Recipes I know :]",
        "• Tools: hold Stone/Cobble/Iron/Gold/Crystal, press C (or use a Chisel Bench), chisel the 8×8 sub-voxel silhouette. Accuracy = quality.",
        "• Gold Chestplate → right-click to equip → R opens the Runic Grid. Blood bucket refuels it.",
        "• Processed Pork: right-click a Chisel Bench holding Raw Pork.",
        "• Steam: water with magma underneath. Right-click steaming water with Processed Pork for something special :]",
        "• Cheese: milk a cow with a bucket, wait ~45s. Feed cheese to a frog to tame it.",
        "• Cook raw meat by right-clicking magma with it. Raw meat = poison.",
        "• Crank + Wire + Piston: pistons push up to 12 voxels. Balloons rise over steam.",
        "• Obelisk Seal (near camp) awakens OBIL.",
      ].forEach((l) => this.chillSays(l));
      return;
    }
    if (low.startsWith("/")) {
      const [cmd, arg] = low.slice(1).split(/\s+/);
      if (cmd === "creative" || cmd === "survival") this.setMode(cmd);
      else if (cmd === "time") { s.time = arg === "night" ? 0.7 : 0.25; store.say(`Time set to ${arg === "night" ? "night" : "day"}.`, "#aaa"); }
      else if (cmd === "tornado") this.weather.model.startTornado();
      else if (cmd === "farbreaker") this.summonEncounter("THE FARBREAKER");
      else if (cmd === "scruncle") this.summonEncounter("THE SCRUNCLE");
      else if (cmd === "moonholder") this.summonEncounter("THE MOONHOLDER");
      else if (cmd === "core") this.summonEncounter("THE DIMENSIONAL CORE");
      else if (cmd === "world") this.openUI("world");
      else if (cmd === "storm" || cmd === "rain") this.weather.model.addRain();
      else if (cmd === "darktide") this.weather.model.startTide();
      else if (cmd === "clearweather") this.weather.model.clear();
      else if (cmd === "obil") this.summonEncounter("OBIL");
      else if (cmd === "warper") this.summonEncounter("THE WARPER");
      else if (cmd === "kill") this.die("command");
      else if (cmd === "spawn") { this.pos.copy(this.world.spawn); this.vel.set(0, 0, 0); }
      else if (cmd === "heal") { resetLimbs(s); store.say("Healed (lost limbs restored).", "#8f8"); }
      else if (cmd === "give" && arg) { const id = Number(arg); if (BLOCKS[id]) addItem(s, { kind: "block", id, count: 64 }); else if (ITEMS[arg]) addItem(s, { kind: "item", key: arg, count: 4 }); }
      else store.say("Commands: /creative /survival /world /time day|night /rain /tornado /darktide /clearweather /obil /warper /scruncle /farbreaker /moonholder /core /spawn /heal /give <id|item>", "#aaa");
      store.bump();
    }
  }

  teleport(p: { x: number; y: number; z: number; name: string }) {
    this.pos.set(wrapX(p.x + 1.6 / xScale(p.y)), p.y + 0.1, p.z + 0.5);
    while (this.collides(this.pos.x, this.pos.y, this.pos.z, 1.75) && this.pos.y < H) this.pos.y += 1;
    this.vel.set(0, 0, 0);
    store.say(`Teleported to ${p.name}.`, "#c8f");
    this.closeUI();
  }

  finishSleep() {
    const s = store.s;
    (Object.keys(s.limbs) as LimbKey[]).forEach((k) => {
      const l = s.limbs[k];
      if (!l.lost) l.hp = Math.min(LIMB_MAX[k], l.hp + LIMB_MAX[k] * 0.7);
    });
    s.poison = 0;
    s.hunger = Math.max(0, s.hunger - 8);
    s.thirst = Math.max(0, s.thirst - 10);
    if (s.time > 0.5 || s.time < 0.05) { if (s.time > 0.5) s.day++; s.time = 0.08; }
    store.say("You wake, limbs knitted. (Lost limbs never return.)", "#ffd23a");
    this.closeUI();
  }

  craftTool(tool: ToolKind, material: number, quality: number) {
    const s = store.s;
    const canFreeSlot = s.mode === "survival" && s.inventory.some((st) => st?.kind === "block" && st.id === material && st.count === 1);
    if (!s.inventory.some((st) => !st) && !canFreeSlot) {
      store.say("Make room in your inventory before committing a tool.", "#ffaa88");
      return false;
    }
    if (s.mode === "survival" && !removeItem(s, (st) => st.kind === "block" && st.id === material)) {
      store.say("You need the raw material block in your inventory.", "#f88");
      return false;
    }
    addItem(s, { kind: "tool", tool, material, quality, durability: Math.round(40 + 200 * quality * (TOOL_TIER[material] ?? 1)), count: 1 });
    store.say(`Chiseled: ${BLOCKS[material].name.replace(" Ore", "")} ${tool} — silhouette accuracy ${Math.round(quality * 100)}%`, "#ffd23a");
    store.bump();
    return true;
  }

  setRune(i: number, r: RuneId | null) {
    store.s.runes[i] = r;
    store.bump();
  }
  get runeList() {
    return RUNES;
  }

  // ================= LAN (BroadcastChannel peer-to-peer between local sessions) =================
  setupLan() {
    if (typeof BroadcastChannel === "undefined") return;
    this.lan = new BroadcastChannel("ernas-aligned-weather-2400-v1");
    this.lan.onmessage = (ev) => {
      const m = ev.data;
      if (!m || m.from === this.peerId) return;
      if (m.t === "pos") {
        let p = this.peers.get(m.from);
        if (!p) {
          p = new RemoteMoth(m.from);
          p.pos.set(m.x, m.y, m.z);
          this.peers.set(m.from, p);
          this.addEntity(p);
          store.say(`A LAN moth joined (${m.from.slice(0, 4)}).`, "#8af");
        }
        p.target.set(m.x, m.y, m.z);
        p.targetYaw = m.yaw;
        p.lastSeen = performance.now();
      } else if (m.t === "block") {
        this.applyingRemote = true;
        this.world.setC(m.col, m.y, m.z, m.id);
        if (m.id !== B.AIR) this.world.recordBuild(m.col, m.y, m.z);
        this.applyingRemote = false;
      } else if (m.t === "chat") {
        store.say(m.text, "#bdf", "Moth " + m.from.slice(0, 4));
      }
    };
  }
}

export const engine = new Engine();
