import * as THREE from "three";
import { B, BLOCKS, isTransparent, tileFor } from "./blocks";
import { ATLAS_TILES } from "./textures";
import { CH, CW, H, L, MY, N, R, World } from "./world";

// face: dir, corners, shade, faceKind
const FACES: { d: [number, number, number]; c: number[][]; s: number; k: "top" | "bottom" | "side" }[] = [
  { d: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.8, k: "side" },
  { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.8, k: "side" },
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1.0, k: "top" },
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.55, k: "bottom" },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.7, k: "side" },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.7, k: "side" },
];

class Buf {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  n = 0;
}

const TWO_PI = Math.PI * 2;

function pushVert(b: Buf, u: number, gy: number, gz: number, tu: number, tv: number, c: number) {
  const t = (u / N) * TWO_PI;
  const r = R - gy;
  b.pos.push(r * Math.cos(t), r * Math.sin(t), gz - L / 2);
  b.uv.push(tu, tv);
  b.col.push(c, c, c);
}

function toGeom(b: Buf): THREE.BufferGeometry | null {
  if (b.n === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
  g.setIndex(b.idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export interface ChunkGeoms {
  opaque: THREE.BufferGeometry | null;
  emissive: THREE.BufferGeometry | null;
  trans: THREE.BufferGeometry | null;
}

function culls(id: number, fluid: boolean, nb: number) {
  if (nb === id) return true;
  if (!isTransparent(nb)) return true;
  if (fluid && nb !== 0 && BLOCKS[nb]?.fluid) return true;
  return false;
}

export function meshChunk(world: World, cx: number, cz: number): ChunkGeoms {
  const op = new Buf(), em = new Buf(), tr = new Buf();
  const z0 = cz * CH;
  const eps = 0.0015;
  const tsz = 1 / ATLAS_TILES;
  const heights = new Float32Array(MY[0] * CH);
  for (let c = 0; c < MY[0]; c++) for (let z = 0; z < CH; z++) {
    heights[c * CH + z] = world.heightAt((cx * MY[0] + c + 0.5) * CW[0], z0 + z);
  }
  for (let y = 0; y < H; y++) {
    const m = MY[y], cw = CW[y];
    for (let c = 0; c < m; c++) {
      const col = cx * m + c;
      const u0 = col * cw, u1 = u0 + cw;
      for (let lz = 0; lz < CH; lz++) {
        const z = z0 + lz;
        const id = world.getC(col, y, z);
        if (id === 0) continue;
        const def = BLOCKS[id];
        const fluid = !!def.fluid;
        const trans = def.transparent && !def.cutout;
        const buf = trans ? tr : def.emissive ? em : op;
        const depth = heights[c * CH + lz] - y;
        const expo = depth > 1 ? Math.max(0.22, 1 - (depth - 1) * 0.13) : 1;
        for (const f of FACES) {
          const dy = f.d[1];
          if (dy !== 0) {
            const ny = y + dy;
            if (ny >= 0 && ny < H && culls(id, fluid, world.getC(col, ny, z))) continue;
          } else {
            const nb = f.d[0] !== 0 ? world.getC(col + f.d[0], y, z) : world.getC(col, y, z + f.d[2]);
            if (culls(id, fluid, nb)) continue;
          }
          const tile = tileFor(id, f.k);
          const tu0 = (tile % ATLAS_TILES) * tsz + eps;
          const tv1 = 1 - Math.floor(tile / ATLAS_TILES) * tsz - eps;
          const tu1 = tu0 + tsz - eps * 2;
          const tv0 = tv1 - tsz + eps * 2;
          const shade = def.emissive ? 1 : f.s * expo;
          const fluidDrop = fluid && dy === 1 ? 0.12 : 0;
          const uvs = [[tu0, tv0], [tu1, tv0], [tu1, tv1], [tu0, tv1]];
          for (let i = 0; i < 4; i++) {
            const q = f.c[i];
            const yy = y + q[1] - (q[1] === 1 ? fluidDrop : 0);
            pushVert(buf, q[0] ? u1 : u0, yy, z + q[2], uvs[i][0], uvs[i][1], shade);
          }
          const n = buf.n;
          buf.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
          buf.n += 4;
        }
      }
    }
  }
  return { opaque: toGeom(op), emissive: toGeom(em), trans: toGeom(tr) };
}

/** Plain Cartesian voxel mesher used for local floating terrain props. */
export function meshCartesian(size: number, cell: (x: number, y: number, z: number) => number): THREE.BufferGeometry | null {
  const buf = new Buf();
  const tsz = 1 / ATLAS_TILES;
  const eps = 0.0015;
  const half = size / 2;
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size ? B.AIR : cell(x, y, z));
  for (let x = 0; x < size; x++)
    for (let y = 0; y < size; y++)
      for (let z = 0; z < size; z++) {
        const id = at(x, y, z);
        if (id === 0) continue;
        const def = BLOCKS[id];
        for (const f of FACES) {
          const nb = at(x + f.d[0], y + f.d[1], z + f.d[2]);
          if (culls(id, false, nb)) continue;
          const tile = tileFor(id, f.k);
          const tu0 = (tile % ATLAS_TILES) * tsz + eps;
          const tv1 = 1 - Math.floor(tile / ATLAS_TILES) * tsz - eps;
          const tu1 = tu0 + tsz - eps * 2;
          const tv0 = tv1 - tsz + eps * 2;
          const uvs = [[tu0, tv0], [tu1, tv0], [tu1, tv1], [tu0, tv1]];
          const shade = def.emissive ? 1 : f.s;
          for (let i = 0; i < 4; i++) {
            const q = f.c[i];
            buf.pos.push(x + q[0] - half, y + q[1] - half, z + q[2] - half);
            buf.uv.push(uvs[i][0], uvs[i][1]);
            buf.col.push(shade, shade, shade);
          }
          const n = buf.n;
          buf.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
          buf.n += 4;
        }
      }
  return toGeom(buf);
}
