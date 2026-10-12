import * as THREE from "three";
import { B, isSolid, weatherResistance } from "./blocks";
import { FlyingBlock, placeObject, type Ctx } from "./entities";
import { hash3 } from "./noise";
import { Biome, H, L, N, R, SEA, colOf, toWorld, uOf, wrapX } from "./world";
import { WeatherModel, WEATHER_STEP, WAVE_HALF_WIDTH, WAVE_HEIGHT, waveProfile, wrappedDelta } from "./weather-model";

export class WeatherSystem {
  model = new WeatherModel();
  rainAmount = 0;
  snow = false;
  flash = 0;
  submerged = false;
  damageCount = 0;
  private pending = 0;
  private erosion = new Map<number, number>();
  private funnels = new Map<number, THREE.Group>();
  private waveMeshes: THREE.Mesh[] = [];
  private rain: THREE.LineSegments;
  private snowPoints: THREE.Points;
  private clouds: THREE.InstancedMesh;
  private precipitation = new Float32Array(700 * 6);
  private snowPositions = new Float32Array(700 * 3);
  private roofTimer = 0;
  private sheltered = false;
  private sealed = false;
  private breath = 14;
  private damageTimer = 0;
  private waveTick = 0;
  private scratch = new THREE.Vector3();
  private transform = new THREE.Object3D();

  constructor(private ctx: Ctx) {
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(this.precipitation, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: "#91bfe0", transparent: true, opacity: 0.6, depthWrite: false }));
    this.rain.frustumCulled = false;
    ctx.scene.add(this.rain);
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute("position", new THREE.BufferAttribute(this.snowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.snowPoints = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: "#e3efff", size: 0.16, transparent: true, opacity: 0.85, depthWrite: false }));
    this.snowPoints.frustumCulled = false;
    ctx.scene.add(this.snowPoints);
    this.clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: "#677484", transparent: true, opacity: 0.58, depthWrite: false }), 64);
    this.clouds.frustumCulled = false;
    ctx.scene.add(this.clouds);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BufferGeometry();
      const width = 32, around = 192;
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((width + 1) * (around + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("color", new THREE.BufferAttribute(new Float32Array((width + 1) * (around + 1) * 3), 3));
      const indices: number[] = [];
      for (let a = 0; a < around; a++) for (let z = 0; z < width; z++) {
        const v = a * (width + 1) + z;
        indices.push(v, v + 1, v + width + 1, v + 1, v + width + 2, v + width + 1);
      }
      g.setIndex(indices);
      const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
      material.forceSinglePass = true;
      const mesh = new THREE.Mesh(g, material);
      mesh.visible = false; mesh.frustumCulled = false;
      this.waveMeshes.push(mesh);
      ctx.scene.add(mesh);
    }
    this.model.onEvent = (event) => {
      if (event === "tide") ctx.toast("DARK TIDE", "The sun is going dark. Three 400-block wave fronts are crossing the entire cylinder. Seek reinforced shelter or fly above the crest.");
      if (event === "tornado") {
        const t = this.model.tornadoes[this.model.tornadoes.length - 1];
        ctx.say(`Tornado detected at ${Math.round(t.x / N * 360)} degrees, z ${Math.round(t.z)}. Check the WORLD map.`, "#c7c2e4");
      }
    };
  }

  advance(realDt: number) {
    this.pending += Math.max(0, realDt);
    // Work through elapsed time without skipping remote damage, even after a slow frame.
    let steps = 0;
    while (this.pending >= WEATHER_STEP && steps++ < 24) {
      this.pending -= WEATHER_STEP;
      this.model.step(WEATHER_STEP);
      this.simulateDamage();
    }
  }

  private erode(u: number, y: number, z: number, force: number, visual: boolean) {
    const world = this.ctx.world;
    if (y < 2 || y >= H || z < 0 || z >= L) return;
    const col = colOf(u, y);
    const id = world.getC(col, y, z);
    if (!isSolid(id) || id === B.CLOUD) return;
    const resistance = weatherResistance(id);
    if (!Number.isFinite(resistance)) return;
    const key = world.idx(col, y, z);
    const exposure = (this.erosion.get(key) ?? 0) + force;
    if (exposure < resistance) { this.erosion.set(key, exposure); return; }
    this.erosion.delete(key);
    this.ctx.breakBlock(u, y, z, false);
    this.damageCount++;
    if (visual && hash3(col, y, z) < 0.3) {
      const fb = new FlyingBlock(uOf(col, y), y + 1, z + 0.5, id, this.ctx.atlas);
      fb.vel.set(Math.sin(this.model.elapsed + col) * 12, 14, Math.cos(col) * 10);
      this.ctx.spawn(fb);
    }
  }

  private simulateDamage() {
    const world = this.ctx.world;
    const player = this.ctx.player;
    const tick = Math.floor(this.model.elapsed / WEATHER_STEP);
    for (const storm of this.model.tornadoes) {
      for (let i = 0; i < 5; i++) {
        const a = hash3(storm.id, tick, i) * Math.PI * 2;
        const rad = Math.sqrt(hash3(tick, i, storm.id)) * storm.radius;
        const u = wrapX(storm.x + Math.cos(a) * rad);
        const z = Math.floor(storm.z + Math.sin(a) * rad);
        const y = world.surfaceY(u, z);
        const nearby = Math.hypot(wrappedDelta(player.x, u), player.z - z) < 140;
        const before = this.damageCount;
        this.erode(u, y, z, 1.5, nearby);
        storm.destroyed += this.damageCount - before;
      }
    }
    // Construction is checked regardless of chunk residency. Roofs and upwind walls shield inner blocks.
    for (const voxel of world.builtVoxels.values()) {
      const u = uOf(voxel.col, voxel.y);
      for (const storm of this.model.tornadoes) {
        const distance = Math.hypot(wrappedDelta(storm.x, u), storm.z - voxel.z);
        if (distance > storm.radius) continue;
        const dx = Math.sin(storm.heading), dz = Math.cos(storm.heading);
        if (this.hasWindbreak(u, voxel.y, voxel.z, dx, dz)) continue;
        const nearby = Math.hypot(wrappedDelta(player.x, u), player.z - voxel.z) < 140;
        const before = this.damageCount;
        this.erode(u, voxel.y, voxel.z, WEATHER_STEP * (1.5 - distance / storm.radius), nearby);
        storm.destroyed += this.damageCount - before;
      }
      if (this.model.floodLevel(voxel.z) > voxel.y) {
        if (!this.hasWindbreak(u, voxel.y, voxel.z, 0, this.model.direction)) this.erode(u, voxel.y, voxel.z, WEATHER_STEP * 1.6, false);
      }
    }
    if (this.erosion.size > 18000) this.erosion.clear();
    if (this.model.tideActive && tick % 4 === 0) {
      for (const center of this.model.waveCenters()) {
        if (center < 0 || center >= L) continue;
        for (let i = 0; i < 20; i++) {
          const u = hash3(tick, i, Math.floor(center)) * N;
          const z = Math.floor(center + (hash3(i, tick, 61) - 0.5) * 24);
          this.erode(u, world.surfaceY(u, z), z, 1.2, false);
        }
      }
    }
  }

  private hasWindbreak(u: number, y: number, z: number, dx: number, dz: number) {
    for (let step = 1; step <= 12; step++) {
      const id = this.ctx.world.get(u - dx * step * 1.15, y, z - dz * step);
      if (isSolid(id) && weatherResistance(id) >= 22) return true;
    }
    return false;
  }
  get flooded() {
    const p = this.ctx.player;
    return p.y >= 0 && p.y + 0.3 < this.model.floodLevel(p.z) && !this.sealed;
  }

  applyToPlayer(dt: number, creative: boolean) {
    const p = this.ctx.player, vel = this.ctx.playerVel;
    this.submerged = this.flooded && p.y + 1.6 < this.model.floodLevel(p.z);
    if (this.submerged && !creative) {
      vel.z += this.model.direction * 18 * dt;
      vel.y += 7 * dt;
      this.breath = Math.max(0, this.breath - dt);
      this.damageTimer -= dt;
      if (this.breath === 0 && this.damageTimer <= 0) {
        this.ctx.damagePlayer(4, "dark-tide drowning", "torso");
        this.damageTimer = 1;
      }
    } else this.breath = Math.min(14, this.breath + dt * 3);
    if (creative || p.y < 0) return;
    for (const storm of this.model.tornadoes) {
      const dx = wrappedDelta(p.x, storm.x), dz = p.z - storm.z;
      const d = Math.hypot(dx, dz);
      if (d > storm.radius * 1.4 || p.y > H + 180) continue;
      const force = Math.max(0, 1 - d / (storm.radius * 1.4));
      vel.x += (-dz - dx * 0.8) / Math.max(1, d) * force * 30 * dt;
      vel.z += (dx - dz * 0.8) / Math.max(1, d) * force * 30 * dt;
      vel.y += force * 45 * dt;
    }
  }

  render(dt: number) {
    const p = this.ctx.player, time = this.model.elapsed;
    this.rainAmount += (this.model.rainAt(p.x, p.z) - this.rainAmount) * Math.min(1, dt * 2);
    const biome = this.ctx.world.biomeAt(p.x, p.z);
    this.snow = [Biome.TAIGA, Biome.GLACIER, Biome.ALPINE, Biome.FROZEN_PEAKS, Biome.TUNDRA].some((b) => b === biome);
    this.flash = this.rainAmount > 0.55 && !this.snow && Math.sin(time * 0.29) > 0.998 ? 1 : 0;
    this.roofTimer -= dt;
    if (this.roofTimer <= 0) {
      const roofY = this.ctx.world.roofAt(p.x, p.z);
      this.sheltered = p.y + 1.5 < roofY;
      this.sealed = this.sheltered && weatherResistance(this.ctx.world.get(p.x, roofY, p.z)) >= 22 &&
        [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => this.hasWindbreak(p.x, p.y + 1, p.z, dx, dz));
      this.roofTimer = 0.5;
    }
    const wet = this.rainAmount > 0.04 && p.y >= 0 && p.y < H + 20 && !this.sheltered;
    this.rain.visible = wet && !this.snow;
    this.snowPoints.visible = wet && this.snow;
    if (wet) {
      const amount = Math.floor(700 * this.rainAmount);
      for (let i = 0; i < amount; i++) {
        const phase = (hash3(i, 11, 4) + time * (this.snow ? 0.075 : 0.65)) % 1;
        const u = p.x + (hash3(i, 23, 8) - 0.5) * 80 + Math.sin(time * 0.8 + i) * (this.snow ? 2 : 0.3);
        const z = p.z + (hash3(i, 33, 9) - 0.5) * 80;
        const y = Math.max(this.ctx.world.heightAt(u, z) + 1, p.y - 16 + (1 - phase) * 62);
        const a = toWorld(u, y, z, this.scratch);
        this.precipitation.set([a.x, a.y, a.z], i * 6);
        this.snowPositions.set([a.x, a.y, a.z], i * 3);
        const b = toWorld(u + 0.05, y - 1.6, z + 0.1, this.scratch);
        this.precipitation.set([b.x, b.y, b.z], i * 6 + 3);
      }
      this.rain.geometry.setDrawRange(0, amount * 2);
      this.snowPoints.geometry.setDrawRange(0, amount);
      this.rain.geometry.getAttribute("position").needsUpdate = true;
      this.snowPoints.geometry.getAttribute("position").needsUpdate = true;
    }
    let cloudI = 0;
    for (const front of this.model.fronts) {
      for (let i = 0; i < 8; i++) {
        const u = front.x + (hash3(front.id, i, 0) - 0.5) * front.rx;
        const z = front.z + (hash3(front.id, i, 1) - 0.5) * front.rz;
        placeObject(this.transform, u, H + 30 + i * 1.5, z, 0);
        this.transform.scale.set(front.rx * 0.55, 6 + i, front.rz * 0.4);
        this.transform.updateMatrix();
        this.clouds.setMatrixAt(cloudI++, this.transform.matrix);
      }
    }
    this.clouds.count = cloudI;
    this.clouds.instanceMatrix.needsUpdate = true;
    const liveIds = new Set(this.model.tornadoes.map((s) => s.id));
    for (const [id, g] of this.funnels) if (!liveIds.has(id)) {
      this.ctx.scene.remove(g);
      g.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      this.funnels.delete(id);
    }
    for (const storm of this.model.tornadoes) {
      let group = this.funnels.get(storm.id);
      if (!group) {
        group = new THREE.Group();
        for (let layer = 0; layer < 11; layer++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 5, 20), new THREE.MeshBasicMaterial({ color: layer < 3 ? "#766756" : "#82909e", transparent: true, opacity: 0.75 - layer * 0.03, depthWrite: false }));
          ring.rotation.x = Math.PI / 2;
          group.add(ring);
        }
        this.ctx.scene.add(group);
        this.funnels.set(storm.id, group);
      }
      placeObject(group, storm.x, this.ctx.world.heightAt(storm.x, storm.z) + 1, storm.z, 0);
      group.children.forEach((ring, i) => {
        const scale = 2 + i * 2.4;
        ring.scale.setScalar(scale);
        ring.position.set(Math.sin(time + i * 0.2) * i * 0.3, i * 10, Math.cos(time * 0.7 + i) * i * 0.2);
        ring.rotation.z = time * 2 + i * 0.3;
      });
    }
    this.waveTick -= dt;
    const centers = this.model.waveCenters();
    this.waveMeshes.forEach((mesh, i) => {
      const center = centers[i];
      mesh.visible = center !== undefined && center > -WAVE_HALF_WIDTH && center < L + WAVE_HALF_WIDTH;
      if (!mesh.visible || this.waveTick > 0) return;
      const positions = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      const colors = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
      for (let a = 0; a <= 192; a++) for (let z = 0; z <= 32; z++) {
        const offset = (z / 32 * 2 - 1) * WAVE_HALF_WIDTH;
        const profile = waveProfile(offset);
        const height = Math.min(R - 20, SEA + WAVE_HEIGHT * profile);
        const point = toWorld(a / 192 * N, height, Math.max(0, Math.min(L, center + offset)), this.scratch);
        const index = a * 33 + z;
        positions.setXYZ(index, point.x, point.y, point.z);
        const foam = profile > 0.98 ? 0.65 + Math.sin(a * 8 + time) * 0.13 : 0;
        colors.setXYZ(index, 0.025 + foam, 0.11 + foam, 0.22 + foam);
      }
      positions.needsUpdate = colors.needsUpdate = true;
    });
    if (this.waveTick <= 0) this.waveTick = 0.04;
  }

  describe() {
    if (this.model.tideActive) return "DARK TIDE / 400-block waves";
    if (this.rainAmount > 0.1) return this.snow ? "Snow" : this.rainAmount > 0.6 ? "Thunderstorm" : "Rain";
    return "Clear";
  }
  dispose() {
    for (const o of [this.rain, this.snowPoints, this.clouds, ...this.waveMeshes]) {
      this.ctx.scene.remove(o); o.geometry.dispose(); (o.material as THREE.Material).dispose();
    }
    for (const g of this.funnels.values()) {
      this.ctx.scene.remove(g);
      g.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
    }
  }
}