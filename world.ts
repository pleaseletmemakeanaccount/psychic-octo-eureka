import * as THREE from "three";
import { B, isSolid } from "./blocks";
import { Perlin, hash3, mulberry32 } from "./noise";

// Keep one angular lattice through the crust, surface, and build height.
// Changing column counts per height used to shift entire structures at ring boundaries.
export const N = 4096;
export const H = 112;
export const L = 2400;
export const CH = 16;
export const S = N / CH;
export const R = N / (2 * Math.PI);
export const SEA = 30;
export const SUN_RADIUS = 14;
export const ZERO_G_RADIUS = 30;
// How hard the local noise field pushes surface elevation. Every biome scales `detail`
// by its own factor, so this single knob raises or lowers noise-driven relief everywhere.
export const ELEVATION_NOISE = 3.5;

export const NY: number[] = [];
export const MY: number[] = [];
export const CW: number[] = [];
export const OFF: number[] = [0];
export const ALIGNED_COLUMNS = Math.round((2 * Math.PI * (R - H / 2)) / S);
for (let y = 0; y < H; y++) {
  const m = ALIGNED_COLUMNS;
  MY.push(m);
  NY.push(m * S);
  CW.push(N / (m * S));
  OFF.push(OFF[y] + m * S * L);
}

// Climate is stored at 6x6 resolution; block columns are generated only as chunk LODs need them.
export const CLIMATE_STEP = 6;
export const CLIMATE_X = Math.ceil(N / CLIMATE_STEP);
export const CLIMATE_Z = Math.ceil(L / CLIMATE_STEP);
export const CLIMATE_SIZE = CLIMATE_X * CLIMATE_Z;
export const WORLD_SEED = 1337;

export enum Biome {
  PLAINS,
  TAIGA,
  OCEAN,
  REEF,
  SPIKED,
  BROKEN,
  MOUNTAIN,
  DESERT,
  AUTUMN,
  MUSHROOM,
  MARSH,
  VOLCANIC,
  GLACIER,
  REDWOOD,
  CRYSTAL_HIGHLANDS,
  SAVANNA,
  JUNGLE,
  CHERRY,
  BADLANDS,
  TUNDRA,
  BONE_WASTES,
  SALT_FLATS,
  MESA,
  ALPINE,
  LAVENDER_MOOR,
  RAINFOREST,
  GLASS_CRATER,
  CANYON,
  SUNKEN_ABYSS,
  PETRIFIED_WOODS,
  SCORCHED_DUNES,
  BIO_SPIRES,
  SKY_OASIS,
  FROZEN_PEAKS,
}

export const BIOME_NAMES = [
  "Verdant Ring", "Taiga & Sinkholes", "Abyssal Ocean", "Coral Reef Shelf", "Spiked Forest Rift",
  "Broken Lands", "Mountains & Sky Ring", "Glasswind Desert", "Copperfall Autumnwood", "Luminous Mycelium Forest",
  "Sinking Peat Marsh", "Cindercone Volcanic Reach", "Blue Ice Glacier", "Oldgrowth Redwood Reach", "Amethyst Highlands",
  "Sunbaked Savanna", "Tanglevine Jungle", "Blossomfall Cherry Grove", "Striated Badlands", "Frozen Tundra",
  "Bone Wastes", "Mirror Salt Flats", "Grand Mesa Sea", "Cloudcrown Alpine", "Lavender Shard Moor",
  "Emerald Rainforest", "Obsidian Glass Crater", "Redrock Slot Canyon",
  "Abyssal Trench of Luminescence", "Petrified Ashwoods", "Scorched Ember-Dunes",
  "Bioluminescent Crystal Spires", "Hanging Sky Oasis", "Frail-Peak Ice Spires",
];

export const CAVE_LAYERS = [
  { maxDepth: 8, name: "Upper Rootways" },
  { maxDepth: 16, name: "Luminous Mycelium" },
  { maxDepth: 26, name: "Basalt Vaults" },
  { maxDepth: 36, name: "Amethyst Hollows" },
  { maxDepth: 46, name: "Magma Veins" },
  { maxDepth: Infinity, name: "Ironroot Deep" },
] as const;

export const wrapX = (u: number) => ((u % N) + N) % N;
const clampY = (y: number) => Math.max(0, Math.min(H - 1, y | 0));
export function colOf(u: number, y: number) {
  const yy = clampY(y);
  const c = Math.floor(wrapX(u) / CW[yy]);
  return c >= NY[yy] ? 0 : c;
}
export const uOf = (col: number, y: number) => (col + 0.5) * CW[clampY(y)];
export const wrapCol = (col: number, y: number) => ((col % NY[y]) + NY[y]) % NY[y];

export function toWorld(gx: number, gy: number, gz: number, out = new THREE.Vector3()) {
  const t = (gx / N) * Math.PI * 2;
  const r = R - gy;
  return out.set(r * Math.cos(t), r * Math.sin(t), gz - L / 2);
}
export function fromWorld(p: THREE.Vector3, out = new THREE.Vector3()) {
  let t = Math.atan2(p.y, p.x);
  if (t < 0) t += Math.PI * 2;
  return out.set((t / (Math.PI * 2)) * N, R - Math.hypot(p.x, p.y), p.z + L / 2);
}
export function basisAt(gx: number, east: THREE.Vector3, up: THREE.Vector3, north: THREE.Vector3) {
  const t = (gx / N) * Math.PI * 2;
  east.set(-Math.sin(t), Math.cos(t), 0);
  up.set(-Math.cos(t), -Math.sin(t), 0);
  north.set(0, 0, 1);
}
export const xScale = (gy: number) => Math.max(0.05, (R - gy) / R);

const F_BLOOD = 1, F_SINK = 2, F_VENT = 4, F_SALT = 8;
type TreeKind = "oak" | "spruce" | "autumn" | "redwood" | "fungus" | "jungle" | "cherry" | "acacia";
const MAX_COLUMN_CACHE = 76000;

export class World {
  // Only small climate maps and sparse edits are resident. Voxel columns are generated and cached near loaded chunks.
  biomeMap = new Uint8Array(CLIMATE_SIZE);
  heightMap = new Uint8Array(CLIMATE_SIZE);
  flagMap = new Uint8Array(CLIMATE_SIZE);
  coralMap = new Uint8Array(CLIMATE_SIZE);
  islandMap = new Uint8Array(CLIMATE_SIZE);
  edits = new Map<number, number>();
  builtVoxels = new Map<number, { col: number; y: number; z: number }>();
  columnTops = new Map<number, number>();
  columnCache = new Map<number, Uint8Array>();
  dirty = new Set<string>();
  perlin = new Perlin(WORLD_SEED);
  perlin2 = new Perlin(4242);
  perlin3 = new Perlin(9001);
  seed = WORLD_SEED;
  pylons: { x: number; y: number; z: number; name: string }[] = [];
  spawn = new THREE.Vector3(8, 50, L / 2);
  onSet?: (col: number, y: number, z: number, id: number) => void;

  // Logical index is below 2^32 for this topology, but is only used as a sparse Map key.
  idx(col: number, y: number, z: number) {
    return OFF[y] + col * L + z;
  }
  private climateIndex(u: number, z: number) {
    const x = Math.floor(wrapX(u) / CLIMATE_STEP) % CLIMATE_X;
    const cz = Math.max(0, Math.min(CLIMATE_Z - 1, Math.floor(z / CLIMATE_STEP)));
    return x * CLIMATE_Z + cz;
  }
  getC(col: number, y: number, z: number): number {
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0 || y >= H) return B.AIR;
    if (z < 0 || z >= L) return B.IRON_CRUST;
    col = wrapCol(col, y);
    const i = this.idx(col, y, z);
    const edit = this.edits.get(i);
    if (edit !== undefined) return edit;
    const u = uOf(col, y);
    return this.getColumn(u, z)[y];
  }
  get(u: number, y: number, z: number): number {
    y = Math.floor(y);
    if (y < 0 || y >= H) return B.AIR;
    if (z < 0 || z >= L) return B.IRON_CRUST;
    return this.getC(colOf(u, y), y, z);
  }
  getF(u: number, y: number, z: number) {
    return this.get(u, y, z);
  }
  getRel(u: number, y: number, z: number, dx: number, dy: number, dz: number) {
    const ny = Math.floor(y) + dy;
    if (ny < 0 || ny >= H) return B.AIR;
    return this.get(u + dx * CW[ny], ny, Math.floor(z) + dz);
  }
  solidAt(u: number, y: number, z: number) {
    return isSolid(this.get(u, y, z));
  }
  above(col: number, y: number) {
    return colOf(uOf(col, y), Math.min(H - 1, y + 1));
  }
  below(col: number, y: number) {
    return colOf(uOf(col, y), Math.max(0, y - 1));
  }
  uBounds(col: number, y: number): [number, number] {
    const w = CW[clampY(y)];
    return [col * w, (col + 1) * w];
  }
  setC(col: number, y: number, z: number, id: number, silent = false) {
    y = Math.floor(y);
    z = Math.floor(z);
    if (z < 0 || z >= L || y < 0 || y >= H) return;
    col = wrapCol(col, y);
    const i = this.idx(col, y, z);
    if (this.getC(col, y, z) === id) return;
    this.edits.set(i, id);
    const topKey = col * L + z;
    if (isSolid(id)) this.columnTops.set(topKey, Math.max(y, this.columnTops.get(topKey) ?? -1));
    if (id === B.AIR) this.builtVoxels.delete(i);
    const m = MY[y];
    const cx = Math.floor(col / m), cz = Math.floor(z / CH);
    this.markDirty(cx, cz);
    const lc = col % m, lz = z % CH;
    if (lc === 0) this.markDirty(cx - 1, cz);
    if (lc === m - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CH - 1) this.markDirty(cx, cz + 1);
    if (!silent && this.onSet) this.onSet(col, y, z, id);
  }
  set(u: number, y: number, z: number, id: number, silent = false) {
    y = Math.floor(y);
    if (y < 0 || y >= H) return;
    this.setC(colOf(u, y), y, Math.floor(z), id, silent);
  }
  markDirty(cx: number, cz: number) {
    cx = ((cx % S) + S) % S;
    if (cz < 0 || cz >= L / CH) return;
    this.dirty.add(cx + "," + cz);
  }
  biomeAt(u: number, z: number): Biome {
    return this.biomeMap[this.climateIndex(u, z)] as Biome;
  }
  smoothHeightAt(u: number, z: number) {
    const x = wrapX(u) / CLIMATE_STEP - 0.5;
    const zz = Math.max(0, Math.min(CLIMATE_Z - 1, z / CLIMATE_STEP - 0.5));
    const ix = Math.floor(x), iz = Math.floor(zz);
    const tx = x - ix, tz = zz - iz;
    const at = (a: number, b: number) => this.heightMap[((a + CLIMATE_X) % CLIMATE_X) * CLIMATE_Z + Math.min(CLIMATE_Z - 1, b)];
    const a = at(ix, iz) * (1 - tx) + at(ix + 1, iz) * tx;
    const b = at(ix, iz + 1) * (1 - tx) + at(ix + 1, iz + 1) * tx;
    return a * (1 - tz) + b * tz;
  }
  heightAt(u: number, z: number) {
    return Math.floor(this.smoothHeightAt(u, z));
  }
  recordBuild(col: number, y: number, z: number) {
    this.builtVoxels.set(this.idx(col, y, z), { col, y, z });
  }
  roofAt(u: number, z: number) {
    const col = colOf(u, 0);
    const start = Math.min(H - 1, Math.max(this.heightAt(u, z) + 22, this.columnTops.get(col * L + Math.floor(z)) ?? 0));
    for (let y = start; y >= 0; y--) {
      const b = this.get(u, y, z);
      if (isSolid(b) && b !== B.CLOUD) return y;
    }
    return 0;
  }
  surfaceY(u: number, z: number) {
    const start = Math.max(0, this.heightAt(u, z) + 24, this.columnTops.get(colOf(u, 0) * L + Math.floor(z)) ?? 0);
    for (let y = Math.min(H - 1, start); y >= 0; y--) {
      const b = this.get(u, y, z);
      if (isSolid(b) && b !== B.CLOUD && b !== B.LEAVES && b !== B.SPRUCE && b !== B.AUTUMN_LEAVES && b !== B.JUNGLE_LEAVES && b !== B.CHERRY_LEAVES) return y;
    }
    return 0;
  }
  caveLayerAt(u: number, y: number, z: number): string | null {
    const depth = this.heightAt(u, z) - y;
    if (depth < 4 || y <= 2) return null;
    const block = this.get(u, y, z);
    if (block !== B.AIR && block !== B.WATER && block !== B.BLOOD) return null;
    return CAVE_LAYERS.find((layer) => depth < layer.maxDepth)?.name ?? "Ironroot Deep";
  }

  private getColumn(u: number, z: number): Uint8Array {
    const col = colOf(u, 0);
    const zz = Math.floor(z);
    const key = col * L + zz;
    const cached = this.columnCache.get(key);
    if (cached) return cached;
    const column = this.generateColumn(uOf(col, 0), zz);
    if (this.columnCache.size > MAX_COLUMN_CACHE) {
      // Drop the oldest third of the cache in one go instead of churning on every access.
      let drop = Math.floor(MAX_COLUMN_CACHE / 3);
      for (const k of this.columnCache.keys()) {
        if (drop-- <= 0) break;
        this.columnCache.delete(k);
      }
    }
    this.columnCache.set(key, column);
    return column;
  }

  private treeKind(biome: Biome, roll: number): TreeKind | null {
    if (biome === Biome.PLAINS && roll < 0.012) return "oak";
    if ((biome === Biome.TAIGA || biome === Biome.ALPINE) && roll < 0.045) return "spruce";
    if (biome === Biome.MOUNTAIN && roll < 0.018) return "spruce";
    if (biome === Biome.AUTUMN && roll < 0.034) return "autumn";
    if (biome === Biome.REDWOOD && roll < 0.03) return "redwood";
    if (biome === Biome.MUSHROOM && roll < 0.01) return "fungus";
    if ((biome === Biome.JUNGLE || biome === Biome.RAINFOREST) && roll < 0.055) return "jungle";
    if (biome === Biome.CHERRY && roll < 0.034) return "cherry";
    if (biome === Biome.SAVANNA && roll < 0.006) return "acacia";
    return null;
  }

  private treeInfo(kind: TreeKind) {
    switch (kind) {
      case "oak": return { h: 5, leaf: B.LEAVES };
      case "spruce": return { h: 8, leaf: B.SPRUCE };
      case "autumn": return { h: 6, leaf: B.AUTUMN_LEAVES };
      case "redwood": return { h: 16, leaf: B.LEAVES };
      case "fungus": return { h: 7, leaf: B.FUNGUS };
      case "jungle": return { h: 12, leaf: B.JUNGLE_LEAVES };
      case "cherry": return { h: 6, leaf: B.CHERRY_LEAVES };
      case "acacia": return { h: 6, leaf: B.LEAVES };
    }
  }

  private generateColumn(u: number, z: number): Uint8Array {
    const column = new Uint8Array(H);
    column.fill(B.AIR);
    const ci = this.climateIndex(u, z);
    const biome = this.biomeMap[ci] as Biome;
    const hi = this.heightAt(u, z);
    const flags = this.flagMap[ci];
    const p = this.perlin, p2 = this.perlin2, p3 = this.perlin3;
    const theta = (u / N) * Math.PI * 2;
    const cx = Math.cos(theta), sx = Math.sin(theta);
    for (let y = 0; y < H; y++) {
      let id: number = B.AIR;
      if (y > hi) {
        if ((flags & F_BLOOD) && (y === hi + 1 || y === hi + 2)) id = B.BLOOD;
        else if (y <= SEA && (biome === Biome.OCEAN || biome === Biome.REEF || biome === Biome.MARSH || (hi < SEA && biome !== Biome.BROKEN && biome !== Biome.SPIKED && biome !== Biome.VOLCANIC))) {
          const coral = this.coralMap[ci];
          if (coral && y <= Math.min(SEA - 1, hi + 1 + Math.floor(hash3(z, 3, Math.floor(u)) * 2))) id = [B.CORAL_PINK, B.CORAL_BLUE, B.CORAL_YELLOW][coral - 1];
          else id = B.WATER;
        } else if (y >= H - 13 && y <= H - 6) {
          const cloud = p.fbm(cx * R * 0.05, sx * R * 0.05 + y * 0.13, z * 0.05, 2);
          if (cloud > 0.3 - Math.abs(y - (H - 9.5)) * 0.02) id = B.CLOUD;
        } else {
          const island = this.islandMap[ci];
          if (island && y <= H - 17 && y >= H - 17 - island && y > hi + 3) id = y === H - 17 ? B.GRASS : y > H - 19 ? B.DIRT : B.STONE;
        }
      } else if (y < 2) {
        id = B.IRON_CRUST;
      } else {
        const depth = hi - y;
        const r = hash3(Math.floor(u), y, z);
        id = B.STONE;
        switch (biome) {
          case Biome.PLAINS:
          case Biome.REDWOOD:
          case Biome.CHERRY:
          case Biome.RAINFOREST:
            id = depth === 0 ? (hi <= SEA ? B.SAND : B.GRASS) : depth < 3 ? (hi <= SEA ? B.SAND : B.DIRT) : B.STONE;
            break;
          case Biome.TAIGA:
            id = depth === 0 ? B.SNOW : depth < 3 ? B.DIRT : B.STONE;
            break;
          case Biome.GLACIER:
          case Biome.ALPINE:
            id = depth === 0 ? B.SNOW : depth < 2 ? B.ICE : depth < 5 ? B.FROST_STONE : B.STONE;
            break;
          case Biome.TUNDRA:
            id = depth === 0 ? (r < 0.3 ? B.SNOW : B.TUNDRA_SOIL) : depth < 4 ? B.TUNDRA_SOIL : B.FROST_STONE;
            break;
          case Biome.OCEAN:
          case Biome.REEF:
            id = depth < 3 ? B.SAND : B.STONE;
            break;
          case Biome.SPIKED:
            id = depth < 2 ? (r < 0.5 ? B.SAND : B.DARK_STONE) : B.DARK_STONE;
            break;
          case Biome.BROKEN:
            id = depth < 3 ? B.BROKEN : B.STONE;
            break;
          case Biome.MOUNTAIN:
            id = depth === 0 ? (hi > 74 ? B.SNOW : hi > 58 ? B.PALE_STONE : B.GRASS) : depth < 3 && hi < 58 ? B.DIRT : B.STONE;
            break;
          case Biome.DESERT:
            id = depth === 0 ? B.SAND : depth < 5 ? B.SANDSTONE : B.STONE;
            break;
          case Biome.SALT_FLATS:
            id = depth === 0 ? B.SALT : depth < 3 ? B.SAND : B.SANDSTONE;
            break;
          case Biome.BADLANDS:
          case Biome.CANYON:
            id = depth < 10 ? ((Math.floor(y / 2) % 3 === 0) ? B.TERRACOTTA_DARK : B.TERRACOTTA) : B.STONE;
            break;
          case Biome.MESA:
            id = depth < 18 ? (Math.floor(y / 2) % 4 === 0 ? B.TERRACOTTA_DARK : Math.floor(y / 2) % 4 === 2 ? B.SANDSTONE : B.TERRACOTTA) : B.DARK_STONE;
            break;
          case Biome.GLASS_CRATER:
            id = depth === 0 ? B.GLASS : depth < 4 ? B.OBSIDIAN : B.BASALT;
            break;
          case Biome.SAVANNA:
            id = depth === 0 ? B.DRY_GRASS : depth < 3 ? B.DIRT : B.STONE;
            break;
          case Biome.AUTUMN:
            id = depth === 0 ? B.AUTUMN_GRASS : depth < 4 ? B.DIRT : B.STONE;
            break;
          case Biome.JUNGLE:
            id = depth === 0 ? (hi <= SEA ? B.SAND : B.GRASS) : depth < 4 ? B.PEAT : B.MOSS_STONE;
            break;
          case Biome.MUSHROOM:
            id = depth < 4 ? B.MOSS_STONE : B.STONE;
            break;
          case Biome.MARSH:
            id = depth === 0 ? B.PEAT : depth < 5 ? B.MOSS_STONE : B.STONE;
            break;
          case Biome.VOLCANIC:
            id = depth === 0 ? B.ASH : depth < 6 ? B.BASALT : B.DARK_STONE;
            break;
          case Biome.CRYSTAL_HIGHLANDS:
            id = depth === 0 ? B.PURPLE_CRYSTAL : depth < 4 ? B.PALE_STONE : B.DARK_STONE;
            break;
          case Biome.BONE_WASTES:
            id = depth === 0 ? (r < 0.35 ? B.BONE_BLOCK : B.SAND) : depth < 3 ? B.SAND : B.DARK_STONE;
            break;
          case Biome.LAVENDER_MOOR:
            id = depth === 0 ? B.AUTUMN_GRASS : depth < 4 ? B.PALE_STONE : B.MOSS_STONE;
            break;
          case Biome.SUNKEN_ABYSS:
            id = depth < 2 ? B.SAND : B.DARK_STONE;
            break;
          case Biome.PETRIFIED_WOODS:
            id = depth === 0 ? B.ASH : depth < 4 ? B.DIRT : B.DARK_STONE;
            break;
          case Biome.SCORCHED_DUNES:
            id = depth === 0 ? B.SAND : depth < 5 ? B.TERRACOTTA_DARK : B.MAGMA;
            break;
          case Biome.BIO_SPIRES:
            id = depth === 0 ? B.MOSS_STONE : depth < 4 ? B.MOSS_STONE : B.STONE;
            break;
          case Biome.SKY_OASIS:
            id = depth === 0 ? B.GRASS : depth < 3 ? B.DIRT : B.PALE_STONE;
            break;
          case Biome.FROZEN_PEAKS:
            id = depth === 0 ? B.SNOW : depth < 3 ? B.ICE : B.FROST_STONE;
            break;
        }

        if (id === B.STONE) {
          if (depth >= 5 && depth < 11) id = B.MOSS_STONE;
          else if (depth >= 11 && depth < 21) id = B.BASALT;
          else if (depth >= 21 && depth < 32) id = B.DARK_STONE;
          else if (depth >= 32 && depth < 42) id = B.PALE_STONE;
          else if (depth >= 42) id = B.OBSIDIAN;
        }

        if (id === B.STONE || id === B.DARK_STONE || id === B.MOSS_STONE || id === B.BASALT || id === B.FROST_STONE || id === B.PALE_STONE || id === B.OBSIDIAN) {
          if (r < 0.022 && depth > 2 && depth < 30) id = B.COAL;
          else if (r < 0.034 && depth > 5) id = B.IRON_ORE;
          else if (r < 0.042 && depth > 12) id = B.GOLD_ORE;
          else if (r < 0.05 && depth > 36) id = B.MAGMA;
          else if (r < 0.056 && depth > 30) id = B.PURPLE_CRYSTAL;
          else if (r < 0.06 && depth > 40) id = B.CRYSTAL_BLUE;
          if (depth > 7 && r > 0.996) id = B.GLOWSTONE;
          if (biome === Biome.TAIGA && depth < 5 && r > 0.94) id = B.GOLD_ORE;
          if (biome === Biome.SPIKED && r > 0.96) id = B.URANIUM;
          if (biome === Biome.VOLCANIC && depth > 4 && r > 0.94) id = B.SULFUR_ORE;
          if (biome === Biome.CRYSTAL_HIGHLANDS && depth > 4 && r > 0.965) id = B.PURPLE_CRYSTAL;
        }

        if (y >= 3 && depth > 4) {
          const n = p3.noise3(cx * R * 0.075 + 20, sx * R * 0.075 + y * 0.095, z * 0.075);
          const n2 = p2.noise3(cx * R * 0.048 + 50, sx * R * 0.048, z * 0.048 + y * 0.08);
          let carve = Math.abs(n) < 0.095 && Math.abs(n2) < 0.34;
          if (!carve && depth > 8) {
            const chamber = p.noise3(cx * R * 0.028 + y * 0.025, sx * R * 0.028 - y * 0.018, z * 0.028 + y * 0.035);
            carve = chamber > 0.44 - Math.min(0.14, (depth - 8) * 0.004) && Math.abs(n2) < 0.5;
          }
          if (carve || ((flags & F_SINK) && y >= Math.max(4, hi - 32))) id = B.AIR;
        }
        if (flags & F_VENT) {
          const vd = 2 + Math.floor(hash3(Math.floor(u), 71, z) * 4);
          if (depth <= vd) id = depth === 0 ? B.MAGMA : B.BASALT;
        }
        if ((flags & F_SALT) && depth === 0) id = B.SALT;
        if (id === B.AIR && y <= 5) id = B.MAGMA;
      }
      column[y] = id;
    }

    // Procedural trees are overlaid onto local columns without storing every world voxel.
    const shellX = Math.floor(u);
    for (let tx = shellX - 5; tx <= shellX + 5; tx++) {
      const centerU = wrapX(tx + 0.5);
      const du = shellX + 0.5 - centerU;
      const wrappedDu = du > N / 2 ? du - N : du < -N / 2 ? du + N : du;
      for (let tz = Math.floor(z) - 5; tz <= Math.floor(z) + 5; tz++) {
        if (tz < 0 || tz >= L) continue;
        if (Math.min(centerU, N - centerU) < 30 && Math.abs(tz - L / 2) < 28) continue;
        const treeBiome = this.biomeAt(centerU, tz);
        const kind = this.treeKind(treeBiome, hash3(tx, 331, tz));
        if (!kind) continue;
        const base = this.heightAt(centerU, tz);
        const spec = this.treeInfo(kind);
        const top = base + spec.h;
        const dz = z - tz;
        for (let y = Math.max(0, base + 1); y < Math.min(H, top + 3); y++) {
          const dy = y - top;
          let radius = -1;
          if (kind === "spruce") {
            if (y >= base + 2 && y <= top + 1) radius = Math.max(0, Math.floor((top + 1 - y) / 2.3)) + (y === top + 1 ? 0 : 1);
          } else if (kind === "redwood") {
            if (dy >= -3 && dy <= 2) radius = dy >= 1 ? 2 : dy >= -1 ? 4 : 2;
          } else if (kind === "jungle") {
            if (dy >= -3 && dy <= 2) radius = dy >= 1 ? 2 : 3;
          } else if (kind === "fungus") {
            if (dy >= -1 && dy <= 2) radius = dy >= 1 ? 2 : 3;
          } else if (kind === "acacia") {
            if (dy >= -1 && dy <= 1) radius = dy === 0 ? 3 : 2;
          } else if (dy >= -2 && dy <= 1) {
            radius = dy >= 0 ? 1 : 2;
          }
          const bx = wrappedDu / CW[y];
          if (Math.abs(bx) > Math.max(0, radius) || Math.abs(dz) > Math.max(0, radius)) continue;
          if (kind === "spruce" && Math.abs(bx) + Math.abs(dz) > radius + 0.5) continue;
          const trunk = Math.abs(wrappedDu) < CW[y] * 0.55 && dz === 0 && y < top;
          if (trunk) column[y] = kind === "redwood" ? B.REDWOOD_LOG : B.LOG;
          else if (radius >= 0 && column[y] === B.AIR) column[y] = spec.leaf;
        }
      }
    }

    if (biome === Biome.MOUNTAIN && hash3(shellX, 771, z) < 0.035) {
      const height = 4 + Math.floor(hash3(shellX, 772, z) * 11);
      for (let y = hi + 1; y <= Math.min(H - 1, hi + height); y++) column[y] = y > hi + height - 2 ? B.SNOW : B.PALE_STONE;
    }
    if (biome === Biome.MESA && hash3(shellX, 991, z) < 0.025) {
      const height = 3 + Math.floor(hash3(shellX, 992, z) * 8);
      for (let y = hi + 1; y <= Math.min(H - 1, hi + height); y++) column[y] = Math.floor(y / 2) % 2 ? B.TERRACOTTA : B.SANDSTONE;
    }
    if (biome === Biome.SPIKED && hash3(shellX, 771, z) < 0.012) {
      const height = 3 + Math.floor(hash3(shellX, 772, z) * 7);
      for (let y = hi + 1; y <= Math.min(H - 1, hi + height); y++) column[y] = B.CRYSTAL;
    }
    if (biome === Biome.CRYSTAL_HIGHLANDS && hash3(shellX, 781, z) < 0.025) {
      const height = 2 + Math.floor(hash3(shellX, 782, z) * 7);
      for (let y = hi + 1; y <= Math.min(H - 1, hi + height); y++) column[y] = B.PURPLE_CRYSTAL;
    }
    return column;
  }

  scanMachines(cb: (col: number, y: number, z: number, id: number) => void, centerU = this.spawn.x, centerZ = Math.floor(this.spawn.z), radius = 28) {
    for (const [key, id] of this.edits) {
      if (id !== B.CRANK && id !== B.CRANK_ON && id !== B.PISTON) continue;
      const y = Math.floor(key / (NY[0] * L));
      const local = key - OFF[y], col = Math.floor(local / L), z = local % L;
      const du = Math.abs(uOf(col, y) - centerU);
      if (Math.min(du, N - du) <= radius && Math.abs(z - centerZ) <= radius) {
        cb(col, y, z, id);
      }
    }
  }

  async generate(onProgress: (f: number, label: string) => void = () => {}) {
    const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    this.edits.clear();
    this.builtVoxels.clear();
    this.columnTops.clear();
    this.columnCache.clear();
    this.dirty.clear();
    this.pylons = [];
    const p = this.perlin, p2 = this.perlin2, p3 = this.perlin3;
    const spawnZ = Math.floor(L / 2);

    for (let ix = 0; ix < CLIMATE_X; ix++) {
      const u = Math.min(N - 1, (ix + 0.5) * CLIMATE_STEP);
      const theta = (u / N) * Math.PI * 2;
      const cx = Math.cos(theta), sx = Math.sin(theta);
      const spawnDistance = Math.min(u, N - u);
      for (let iz = 0; iz < CLIMATE_Z; iz++) {
        const z = Math.min(L - 1, (iz + 0.5) * CLIMATE_STEP);
        const bn = p.fbm(cx * 0.72 + 10, sx * 0.72, z * 0.00135, 3) * 1.6;
        const bn2 = p2.fbm(cx * 1.04, sx * 1.04 + 5, z * 0.0021, 2) * 1.5;
        const roughness = p.fbm(cx * R * 0.035, sx * R * 0.035, z * 0.035, 3);
        // Elevation only: ELEVATION_NOISE lifts how much of the relief comes from noise.
        const detail = roughness * ELEVATION_NOISE;
        const region = p2.fbm(cx * 0.95 + 16, sx * 0.95 - 23, z * 0.00155, 3) * 1.75;
        // Separate macro and local maps: climate zones drift slowly so hot and frozen
        // regions are always separated by temperate ground instead of touching.
        const thermalBand = p2.fbm(cx * 0.26 + 71, sx * 0.26 + 18, z * 0.00035, 2) * 2.3;
        const thermalLocal = p3.fbm(cx * 1.7 + 12, sx * 1.7 - 6, z * 0.0024, 2) * 1.2;
        const wetBand = p3.fbm(cx * 0.31 - 31, sx * 0.31 + 9, z * 0.00045, 2) * 2.2;
        const wetLocal = p.fbm(cx * 1.9 + 54, sx * 1.9 + 31, z * 0.0027, 2) * 1.2;
        const relief = Math.max(0, bn) + Math.max(0, bn2) * 0.6;
        const temperature = THREE.MathUtils.clamp(thermalBand * 0.82 + thermalLocal * 0.18 - relief * 0.26, -1, 1);
        // Rain shadow: tall, continental ground dries out; low coastal ground stays wet.
        const moisture = THREE.MathUtils.clamp(wetBand * 0.78 + wetLocal * 0.22 - relief * 0.3 - Math.max(0, region) * 0.12, -1, 1);
        let biome: Biome;
        if (spawnDistance < 32 && Math.abs(z - spawnZ) < 42) biome = Biome.PLAINS;
        else if (temperature < -0.55 && bn2 > 0.3) biome = Biome.FROZEN_PEAKS;
        else if (bn < -0.42) biome = Biome.SUNKEN_ABYSS;
        else if (bn < -0.28) biome = Biome.OCEAN;
        else if (bn < -0.16 && moisture > -0.48) biome = Biome.REEF;
        else if (temperature < -0.47) biome = Biome.GLACIER;
        else if (temperature < -0.32 && bn > 0.06) biome = Biome.ALPINE;
        else if (temperature < -0.28 && moisture < 0.1) biome = Biome.TUNDRA;
        else if (moisture < -0.5 && temperature > 0.42) biome = Biome.SCORCHED_DUNES;
        else if (region > 0.42 && temperature > -0.1) biome = Biome.VOLCANIC;
        else if (moisture < -0.54 && temperature > 0.05 && Math.abs(region) < 0.15) biome = Biome.SALT_FLATS;
        // Arid ground needs clearly warm air, leaving temperate bands between dunes and ice.
        else if (moisture < -0.42 && temperature > 0.05) {
          if (region < -0.52) biome = Biome.GLASS_CRATER;
          else if (region < -0.36) biome = Biome.MESA;
          else if (region < -0.2) biome = Biome.BADLANDS;
          else if (Math.abs(region) < 0.08) biome = Biome.CANYON;
          else if (temperature > 0.1 && region > 0.35) biome = Biome.PETRIFIED_WOODS;
          else biome = Biome.DESERT;
        } else if (region < -0.42 && moisture > 0.38) biome = Biome.BIO_SPIRES;
        else if (temperature > 0.32 && moisture > 0.45 && bn > 0.35) biome = Biome.SKY_OASIS;
        else if (moisture > 0.5 && temperature > 0.2 && bn < 0.3) biome = Biome.RAINFOREST;
        else if (moisture > 0.42 && bn < 0.28) biome = Biome.MARSH;
        else if (moisture > 0.3 && temperature > 0.3) biome = Biome.JUNGLE;
        else if (region < -0.34 && moisture > 0.08 && bn > 0.02) biome = Biome.CRYSTAL_HIGHLANDS;
        else if (moisture > 0.18 && region > 0.08 && temperature > -0.2) biome = Biome.MUSHROOM;
        else if (temperature > 0.35 && moisture < -0.05) biome = Biome.SAVANNA;
        else if (temperature > 0.22 && moisture > -0.05 && region > -0.42 && region < -0.15) biome = Biome.LAVENDER_MOOR;
        else if (temperature > 0.28 && moisture > -0.22 && region < 0.32) biome = Biome.AUTUMN;
        else if (temperature > 0.1 && moisture > 0.05 && region > -0.05 && region < 0.2 && bn2 > 0.3) biome = Biome.CHERRY;
        else if (temperature > 0.2 && region < -0.17) biome = Biome.REDWOOD;
        else if (bn > 0.42 && moisture < 0.08) biome = Biome.BROKEN;
        else if (bn > 0.34 && temperature > 0 && moisture < -0.1) biome = Biome.BONE_WASTES;
        else if (bn > 0.28 && moisture > 0.02) biome = Biome.SPIKED;
        else if (bn > 0.2) biome = Biome.TAIGA;
        else if (bn > 0.04 && bn2 > -0.05) biome = Biome.MOUNTAIN;
        else biome = Biome.PLAINS;

        const cb = Math.max(-0.55, Math.min(0.55, bn));
        let h = 46 + cb * 29 + detail * 7;
        switch (biome) {
          case Biome.SUNKEN_ABYSS: h = 3 + (bn + 0.6) * 12 + detail * 2; break;
          case Biome.OCEAN: h = 10 + (bn + 0.6) * 18 + detail * 3; break;
          case Biome.REEF: h = SEA - 4 + detail * 3; break;
          case Biome.MARSH: h = SEA - 5 + detail * 2; break;
          case Biome.SALT_FLATS: h = SEA + 2 + detail * 0.6; break;
          case Biome.DESERT: h = 44 + cb * 12 + detail * 7; break;
          case Biome.BADLANDS: h = 45 + cb * 14 + Math.floor(detail * 4) * 3; break;
          case Biome.MESA: h = 58 + cb * 10 + Math.floor(detail * 5) * 4 + Math.max(0, bn2) * 11; break;
          case Biome.CANYON: h = 47 + cb * 12 + detail * 3; break;
          case Biome.GLASS_CRATER: h = 42 + cb * 8 + detail * 2; break;
          case Biome.SAVANNA: h = 45 + cb * 10 + detail * 3; break;
          case Biome.GLACIER: h = 47 + cb * 18 + detail * 5; break;
          case Biome.ALPINE: h = 75 + cb * 22 + detail * 6; break;
          case Biome.TUNDRA: h = 43 + cb * 10 + detail * 3; break;
          case Biome.MUSHROOM: h = 43 + cb * 14 + detail * 5; break;
          case Biome.JUNGLE:
          case Biome.RAINFOREST: h = 44 + cb * 16 + detail * 6; break;
          case Biome.LAVENDER_MOOR: h = 50 + cb * 12 + detail * 3; break;
          case Biome.CHERRY: h = 48 + cb * 12 + detail * 4; break;
          case Biome.VOLCANIC: h = 50 + cb * 18 + Math.max(0, bn2) * 16 + detail * 5; break;
          case Biome.CRYSTAL_HIGHLANDS: h = 54 + cb * 17 + detail * 6; break;
          case Biome.BONE_WASTES: h = 48 + cb * 10 + detail * 4; break;
          case Biome.PETRIFIED_WOODS: h = 42 + cb * 12 + detail * 4; break;
          case Biome.SCORCHED_DUNES: h = 45 + cb * 12 + detail * 5; break;
          case Biome.BIO_SPIRES: h = 46 + cb * 14 + detail * 6; break;
          case Biome.SKY_OASIS: h = 62 + cb * 18 + detail * 4; break;
          case Biome.FROZEN_PEAKS: h = 85 + cb * 25 + Math.pow(1 - Math.abs(p2.fbm(cx * 4.2, sx * 4.2, z * 0.015, 2)), 2) * 45 + detail * 5; break;
          case Biome.MOUNTAIN: {
            const ridge = 1 - Math.abs(p3.fbm(cx * 2.4 + 3, sx * 2.4 - 8, z * 0.006, 3));
            const alpineRidge = 1 - Math.abs(p2.fbm(cx * 6.2 + 70, sx * 6.2, z * 0.018, 2));
            const ridgeStrength = Math.min(1, Math.max(0, (bn2 + 0.35) * 1.5));
            h = 48 + cb * 19 + Math.pow(ridge, 1.7) * 58 * ridgeStrength + Math.pow(alpineRidge, 4) * 32 + detail * 4;
            break;
          }
          case Biome.BROKEN: {
            const stripe = ((Math.floor(u) * 13 + (Math.floor(z) >> 1) * 7) % 11) + ((Math.floor(z) * 5 + (Math.floor(u) >> 2) * 3) % 7);
            h = 40 + (stripe % 15) + ((Math.floor(u) >> 3) % 2) * 6;
            break;
          }
        }
        const spawnX = Math.min(u, N - u);
        const campDistance = Math.max(spawnX / 24, Math.abs(z - spawnZ) / 24);
        const blend = THREE.MathUtils.smoothstep(campDistance, 0.75, 2.2);
        h = THREE.MathUtils.lerp(46, h, blend);
        const hi = Math.max(5, Math.min(H - 20, Math.floor(h)));
        let flags = 0;
        if ((biome === Biome.SPIKED || biome === Biome.BROKEN || biome === Biome.VOLCANIC) && roughness < -0.28) flags |= F_BLOOD;
        if ((biome === Biome.TAIGA || biome === Biome.REDWOOD || biome === Biome.JUNGLE || biome === Biome.RAINFOREST) && hash3(ix, 7, iz) < 0.08) flags |= F_SINK;
        if (biome === Biome.VOLCANIC && hash3(ix, 73, iz) < 0.025) flags |= F_VENT;
        if ((biome === Biome.DESERT && hash3(ix, 83, iz) < 0.07) || biome === Biome.SALT_FLATS) flags |= F_SALT;

        const ci = ix * CLIMATE_Z + iz;
        this.biomeMap[ci] = biome;
        this.heightMap[ci] = hi;
        this.flagMap[ci] = flags;
        this.coralMap[ci] = biome === Biome.REEF && hash3(ix, 99, iz) < 0.18 && hi < SEA - 1 ? 1 + Math.floor(hash3(ix, 5, iz) * 3) : 0;
        if (biome === Biome.MOUNTAIN || biome === Biome.CRYSTAL_HIGHLANDS || biome === Biome.ALPINE) {
          const islandNoise = p2.fbm(cx * 4.6 + 33, sx * 4.6, z * 0.018, 2);
          this.islandMap[ci] = islandNoise > 0.24 ? Math.min(20, Math.floor((islandNoise - 0.24) * 26) + 1) : 0;
        }
      }
      if (ix % 4 === 3) {
        onProgress((ix / CLIMATE_X) * 0.7, `mapping continent climates ${ix + 1}/${CLIMATE_X}`);
        await yieldFrame();
      }
    }

    await this.hydraulicErosion(onProgress, yieldFrame);
    this.buildCamp();
    onProgress(1, "climate ready; terrain will stream at LOD");
  }

  /** Light droplet erosion: cuts valleys and drops sediment without flattening the ranges. */
  private async hydraulicErosion(onProgress: (f: number, label: string) => void, yieldFrame: () => Promise<void>) {
    const width = CLIMATE_X, depth = CLIMATE_Z;
    const field = new Float32Array(width * depth);
    for (let i = 0; i < field.length; i++) field[i] = this.heightMap[i];
    const at = (x: number, z: number) => (((x % width) + width) % width) * depth + Math.max(0, Math.min(depth - 1, z));
    const random = mulberry32(24601);
    const droplets = Math.min(34000, Math.floor(field.length * 0.12));
    for (let drop = 0; drop < droplets; drop++) {
      let x = random() * width, z = 1 + random() * (depth - 2);
      let vx = 0, vz = 0, water = 1, sediment = 0;
      for (let step = 0; step < 24; step++) {
        const xi = Math.floor(x), zi = Math.floor(z);
        const here = field[at(xi, zi)];
        const gx = (field[at(xi + 1, zi)] - field[at(xi - 1, zi)]) * 0.5;
        const gz = (field[at(xi, zi + 1)] - field[at(xi, zi - 1)]) * 0.5;
        vx = vx * 0.8 - gx;
        vz = vz * 0.8 - gz;
        const speed = Math.hypot(vx, vz);
        if (speed < 0.0008) break;
        vx /= speed; vz /= speed;
        const nx = x + vx, nz = z + vz;
        if (nz < 1 || nz >= depth - 1) break;
        const drift = field[at(Math.floor(nx), Math.floor(nz))] - here;
        const capacity = Math.max(-drift, 0.012) * 2.6 * water;
        if (drift > 0 || sediment > capacity) {
          const give = drift > 0 ? Math.min(drift, sediment) : (sediment - capacity) * 0.4;
          field[at(xi, zi)] += give;
          sediment -= give;
        } else {
          const take = Math.min((capacity - sediment) * 0.28, -drift);
          field[at(xi, zi)] -= take;
          sediment += take;
        }
        water *= 0.985;
        x = nx; z = nz;
        if (water < 0.05) break;
      }
      if (drop % 6000 === 5999) {
        onProgress(0.7 + (drop / droplets) * 0.12, `eroding river valleys ${Math.round((drop / droplets) * 100)}%`);
        await yieldFrame();
      }
    }
    const spawnZ = L / 2;
    for (let ix = 0; ix < width; ix++) {
      const u = (ix + 0.5) * CLIMATE_STEP;
      const spawnX = Math.min(u, N - u);
      for (let iz = 0; iz < depth; iz++) {
        const ci = ix * depth + iz;
        const z = (iz + 0.5) * CLIMATE_STEP;
        // Keep the camp terrace level after erosion.
        const campBlend = THREE.MathUtils.smoothstep(Math.max(spawnX / 24, Math.abs(z - spawnZ) / 24), 0.75, 2.2);
        const eroded = THREE.MathUtils.lerp(46, field[ci], campBlend);
        this.heightMap[ci] = Math.max(5, Math.min(H - 20, Math.round(eroded)));
      }
    }
  }

  private buildCamp() {
    const set = (u: number, y: number, z: number, id: number) => this.set(u, y, z, id, true);
    const top = (u: number, z: number) => this.heightAt(u, z) + 1;
    const centerZ = Math.floor(L / 2);
    const U = (k: number) => uOf(wrapCol(k, 0), 0);
    const py = top(U(6), centerZ - 4);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) set(U(6 + dx), py - 1, centerZ - 4 + dz, B.COBBLE);
    set(U(6), py, centerZ - 4, B.PYLON);
    set(U(6), py + 1, centerZ - 4, B.PYLON);
    this.pylons.push({ x: U(6), y: py, z: centerZ - 4, name: "Genesis Camp" });
    set(U(9), top(U(9), centerZ + 2), centerZ + 2, B.BED);
    set(U(3), top(U(3), centerZ + 2), centerZ + 2, B.TOILET);
    set(U(6), top(U(6), centerZ + 4), centerZ + 4, B.WORKBENCH);
    const sy = top(U(12), centerZ - 1) - 1;
    for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) {
      set(U(12 + dx), sy - 1, centerZ - 2 + dz, B.MAGMA);
      set(U(12 + dx), sy, centerZ - 2 + dz, B.WATER);
    }
    set(U(-2), top(U(-2), centerZ + 6), centerZ + 6, B.CRANK);
    set(U(-1), top(U(-1), centerZ + 6), centerZ + 6, B.WIRE);
    set(U(0), top(U(0), centerZ + 6), centerZ + 6, B.WIRE);
    set(U(1), top(U(1), centerZ + 6), centerZ + 6, B.PISTON);
    const pistonY = top(U(1), centerZ + 6);
    for (let i = 1; i <= 4; i++) set(U(1), pistonY + i, centerZ + 6, i % 2 ? B.PLANKS : B.GLASS);
    const obeliskY = top(U(18), centerZ);
    for (let i = 0; i < 4; i++) set(U(18), obeliskY + i, centerZ, B.OBELISK);
    const bloodY = top(U(9), centerZ - 6) - 1;
    set(U(9), bloodY, centerZ - 6, B.BLOOD);
    set(U(10), bloodY, centerZ - 6, B.BLOOD);
    this.spawn.set(U(6), top(U(6), centerZ) + 0.01, centerZ + 0.5);
  }
}