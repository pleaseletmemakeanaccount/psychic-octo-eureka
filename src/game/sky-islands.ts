import * as THREE from "three";
import { B } from "./blocks";
import { meshCartesian } from "./mesher";
import { Perlin, mulberry32 } from "./noise";
import { H, L, N, R, SUN_RADIUS } from "./world";

export const ORBIT_PERIOD = 32 * 60;
const MAX_ISLANDS = 4;

export const SKY_ISLAND_BIOMES = [
  { name: "Verdant Terrace", top: B.GRASS, soil: B.DIRT, rock: B.STONE, accent: B.LEAVES, trunk: B.LOG },
  { name: "Emberglass Drift", top: B.ASH, soil: B.BASALT, rock: B.OBSIDIAN, accent: B.MAGMA, trunk: B.BASALT },
  { name: "Frostpetal Shelf", top: B.SNOW, soil: B.FROST_STONE, rock: B.PALE_STONE, accent: B.ICE, trunk: B.FROST_STONE },
  { name: "Sporebloom Reach", top: B.MOSS_STONE, soil: B.PEAT, rock: B.DARK_STONE, accent: B.FUNGUS, trunk: B.LOG },
];

// Shared so terrain chunks, the horizon LOD and the islands sample identical shadows.
export const skyShadowUniform = { value: Array.from({ length: MAX_ISLANDS }, () => new THREE.Vector4(0, 0, 0, 0)) };
export const SKY_SHADOW_GLSL = `
uniform vec4 uSkyShadows[${MAX_ISLANDS}];
float skyShadowFactor(vec3 p) {
  float light = 1.0;
  float pl = max(length(p), 0.001);
  for (int i = 0; i < ${MAX_ISLANDS}; i++) {
    vec4 s = uSkyShadows[i];
    if (s.w <= 0.0) continue;
    float d = length(s.xyz);
    if (d < 1.0 || pl <= d || dot(s.xyz, p) <= 0.0) continue;
    float perp = length(cross(s.xyz, p)) / pl;
    light = min(light, 1.0 - 0.86 * (1.0 - smoothstep(s.w * 0.55, s.w, perp)));
  }
  return light;
}`;

export function skyShadowLight(point: THREE.Vector3) {
  let light = 1;
  const pl = Math.max(point.length(), 0.001);
  for (const s of skyShadowUniform.value) {
    if (s.w <= 0) continue;
    const d = Math.hypot(s.x, s.y, s.z);
    if (d < 1 || pl <= d || s.x * point.x + s.y * point.y + s.z * point.z <= 0) continue;
    const cx = s.y * point.z - s.z * point.y;
    const cy = s.z * point.x - s.x * point.z;
    const cz = s.x * point.y - s.y * point.x;
    const perp = Math.hypot(cx, cy, cz) / pl;
    light = Math.min(light, 1 - 0.86 * (1 - THREE.MathUtils.smoothstep(perp, s.w * 0.55, s.w)));
  }
  return light;
}

export function applySkyShadow(material: THREE.Material, cacheKey: string) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSkyShadows = skyShadowUniform;
    shader.vertexShader = `varying vec3 vSkyWorld;\n${shader.vertexShader}`.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\nvSkyWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
    shader.fragmentShader = `varying vec3 vSkyWorld;\n${SKY_SHADOW_GLSL}\n${shader.fragmentShader}`.replace(
      "#include <tonemapping_fragment>",
      "gl_FragColor.rgb *= skyShadowFactor(vSkyWorld);\n#include <tonemapping_fragment>",
    );
  };
  material.customProgramCacheKey = () => cacheKey;
}

export interface Island {
  angle: number;
  orbit: number;
  worldZ: number;
  radius: number;
  size: number;
  voxels: Uint8Array;
  group: THREE.Group;
  biome: string;
  deltaU: number;
}

const _local = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _east = new THREE.Vector3();
const _up = new THREE.Vector3();
const _north = new THREE.Vector3(0, 0, 1);

export class SkyIslands {
  islands: Island[] = [];
  private material: THREE.MeshLambertMaterial;

  constructor(private scene: THREE.Scene, atlas: THREE.Texture) {
    this.material = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
    applySkyShadow(this.material, "ernas-sky-island-v1");
  }

  async build(onProgress: (fraction: number) => void = () => {}) {
    const random = mulberry32(5150);
    const cloudRadius = R - (H - 14);
    for (let i = 0; i < MAX_ISLANDS; i++) {
      const palette = SKY_ISLAND_BIOMES[i % SKY_ISLAND_BIOMES.length];
      const noise = new Perlin(1200 + i * 97);
      const radius = 30 + random() * 14;
      // Inner-to-mid orbits widen each shadow cone, so a pass reads as a real night.
      const orbit = THREE.MathUtils.lerp(SUN_RADIUS + radius + 55, cloudRadius * 0.55, random());
      const size = Math.ceil(radius * 2) + 10;
      const c = size / 2;
      const voxels = new Uint8Array(size * size * size);
      for (let x = 0; x < size; x++)
        for (let y = 0; y < size; y++)
          for (let z = 0; z < size; z++) {
            const dx = x + 0.5 - c, dy = y + 0.5 - c, dz = z + 0.5 - c;
            const warp = noise.fbm(dx * 0.045, dy * 0.03, dz * 0.045, 3) * 0.42;
            const edge = Math.hypot(dx, dz) / radius + warp;
            if (edge > 1) continue;
            const crown = (1 - edge * edge) * radius * 0.3 + noise.fbm(dx * 0.08, 4, dz * 0.08, 2) * 4;
            const keel = -(1 - edge) * radius * (0.85 + warp) - 2;
            if (dy > crown || dy < keel) continue;
            const depth = crown - dy;
            const speck = noise.noise3(dx * 0.6, dy * 0.6, dz * 0.6);
            voxels[(x * size + y) * size + z] =
              depth < 1 ? (speck > 0.36 ? palette.accent : palette.top)
                : depth < 4 ? palette.soil
                  : speck > 0.45 ? palette.accent : palette.rock;
          }
      // Surface growth so each island reads as its own biome from the ground.
      for (let trunk = 0; trunk < 10; trunk++) {
        const a = random() * Math.PI * 2, rr = random() * radius * 0.7;
        const tx = Math.round(c + Math.cos(a) * rr), tz = Math.round(c + Math.sin(a) * rr);
        if (tx < 2 || tz < 2 || tx >= size - 2 || tz >= size - 2) continue;
        let top = -1;
        for (let y = size - 1; y >= 0; y--) if (voxels[(tx * size + y) * size + tz]) { top = y; break; }
        if (top < 0) continue;
        const height = 4 + Math.floor(random() * 5);
        for (let y = top + 1; y <= top + height && y < size; y++) voxels[(tx * size + y) * size + tz] = palette.trunk;
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++)
            for (let dy = 0; dy <= 2; dy++) {
              const y = top + height + dy, x = tx + dx, z = tz + dz;
              if (Math.abs(dx) + Math.abs(dz) + dy > 4 || y >= size || x < 0 || x >= size || z < 0 || z >= size) continue;
              const at = (x * size + y) * size + z;
              if (!voxels[at]) voxels[at] = palette.accent;
            }
      }
      const geometry = meshCartesian(size, (x, y, z) => voxels[(x * size + y) * size + z]);
      const group = new THREE.Group();
      if (geometry) group.add(new THREE.Mesh(geometry, this.material));
      group.frustumCulled = false;
      this.scene.add(group);
      this.islands.push({
        angle: (i / MAX_ISLANDS) * Math.PI * 2 + random() * 0.6,
        orbit, worldZ: (random() - 0.5) * L * 0.62, radius, size, voxels, group,
        biome: palette.name, deltaU: 0,
      });
      onProgress((i + 1) / MAX_ISLANDS);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  update(dt: number) {
    const step = (dt / ORBIT_PERIOD) * Math.PI * 2;
    this.islands.forEach((island, i) => {
      island.angle = (island.angle + step) % (Math.PI * 2);
      island.deltaU = (step / (Math.PI * 2)) * N;
      const cos = Math.cos(island.angle), sin = Math.sin(island.angle);
      island.group.position.set(cos * island.orbit, sin * island.orbit, island.worldZ);
      // Up points at the axis so island gravity matches the ring's outward pull.
      _east.set(-sin, cos, 0);
      _up.set(-cos, -sin, 0);
      island.group.quaternion.setFromRotationMatrix(_basis.makeBasis(_east, _up, _north));
      island.group.updateMatrixWorld();
      skyShadowUniform.value[i].set(island.group.position.x, island.group.position.y, island.group.position.z, island.radius * 1.12);
    });
  }

  /** Island voxel lookup in world space; drives collision and platform carry. */
  solidAt(world: THREE.Vector3): Island | null {
    for (const island of this.islands) {
      if (world.distanceToSquared(island.group.position) > (island.radius + 14) ** 2) continue;
      _local.copy(world);
      island.group.worldToLocal(_local);
      const half = island.size / 2;
      const x = Math.floor(_local.x + half), y = Math.floor(_local.y + half), z = Math.floor(_local.z + half);
      if (x < 0 || y < 0 || z < 0 || x >= island.size || y >= island.size || z >= island.size) continue;
      if (island.voxels[(x * island.size + y) * island.size + z]) return island;
    }
    return null;
  }

  nearest(world: THREE.Vector3) {
    let best: Island | null = null, bestDistance = Infinity;
    for (const island of this.islands) {
      const d = world.distanceToSquared(island.group.position);
      if (d < bestDistance) { bestDistance = d; best = island; }
    }
    return best && bestDistance < (best.radius + 28) ** 2 ? best : null;
  }

  dispose() {
    for (const island of this.islands) {
      this.scene.remove(island.group);
      island.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    }
    this.material.dispose();
    this.islands = [];
  }
}
