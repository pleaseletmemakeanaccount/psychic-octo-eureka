import * as THREE from "three";
import { B, BLOCKS, TILE_BED_TOP, TILE_DRY_GRASS_TOP, TILE_GRASS_TOP, TILE_LOG_TOP, TILE_PISTON_TOP, TILE_TOILET_TOP, TILE_WORKBENCH_TOP } from "./blocks";
import { mulberry32 } from "./noise";

export const ATLAS_TILES = 16;
export const TILE_PX = 16;

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  if (h.length === 4) {
    const r = (n >> 8) & 15, g = (n >> 4) & 15, b = n & 15;
    return [r * 17, g * 17, b * 17];
  }
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

type Painter = (x: number, y: number, r: () => number) => [number, number, number, number] | null;

function shade(c: [number, number, number], f: number): [number, number, number, number] {
  return [Math.max(0, Math.min(255, c[0] * f)), Math.max(0, Math.min(255, c[1] * f)), Math.max(0, Math.min(255, c[2] * f)), 255];
}

export function buildAtlas(): { texture: THREE.CanvasTexture; canvas: HTMLCanvasElement } {
  const size = ATLAS_TILES * TILE_PX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);

  const paintTile = (tile: number, painter: Painter, seed = tile * 77) => {
    const r = mulberry32(seed + 13);
    const tx = (tile % ATLAS_TILES) * TILE_PX;
    const ty = Math.floor(tile / ATLAS_TILES) * TILE_PX;
    for (let y = 0; y < TILE_PX; y++)
      for (let x = 0; x < TILE_PX; x++) {
        const c = painter(x, y, r);
        const i = ((ty + y) * size + tx + x) * 4;
        if (!c) {
          img.data[i + 3] = 0;
          continue;
        }
        img.data[i] = c[0];
        img.data[i + 1] = c[1];
        img.data[i + 2] = c[2];
        img.data[i + 3] = c[3];
      }
  };

  const noisy = (hex: string, amp = 0.18): Painter => {
    const c = hexToRgb(hex);
    return (_x, _y, r) => shade(c, 1 - amp + r() * amp * 2);
  };
  const ore = (speck: string): Painter => {
    const s = hexToRgb(speck);
    const base = hexToRgb("#7c7c80");
    return (x, y, r) => {
      const v = r();
      const blob = ((x * 7 + y * 13) % 11 < 2 && (x + y) % 3 !== 0) || ((x * 3 + y * 5) % 17 === 0);
      if (blob && v > 0.2) return shade(s, 0.85 + r() * 0.3);
      return shade(base, 0.85 + v * 0.3);
    };
  };

  for (const idStr of Object.keys(BLOCKS)) {
    const id = Number(idStr);
    const def = BLOCKS[id];
    if (id === 0) continue;
    paintTile(id, noisy(def.color));
  }

  // custom painters
  paintTile(B.GRASS, (x, y, r) => {
    const g = hexToRgb("#4f9a3a"), dirt = hexToRgb("#7a5332");
    const edge = 3 + ((x * 5) % 3 === 0 ? 2 : 0);
    // top of the side texture (y small) is grass; in grid "up" means toward the axis -> v=1 at top
    return y < edge ? shade(g, 0.85 + r() * 0.3) : shade(dirt, 0.82 + r() * 0.3);
  });
  paintTile(TILE_GRASS_TOP, noisy("#4f9a3a", 0.22));
  paintTile(B.LOG, (x, _y, r) => {
    const c = hexToRgb("#6b4a2a");
    return shade(c, (x % 4 === 0 ? 0.7 : 1) * (0.88 + r() * 0.2));
  });
  paintTile(TILE_LOG_TOP, (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    const ring = Math.floor(d) % 3 === 0;
    return shade(hexToRgb(d > 6.5 ? "#5a3c20" : "#b08a55"), (ring ? 0.8 : 1) * (0.9 + r() * 0.15));
  });
  paintTile(B.LEAVES, (_x, _y, r) => (r() < 0.18 ? null : shade(hexToRgb("#3d8a2e"), 0.7 + r() * 0.5)));
  paintTile(B.SPRUCE, (_x, _y, r) => (r() < 0.12 ? null : shade(hexToRgb("#2a5a3a"), 0.7 + r() * 0.5)));
  paintTile(B.GOLD_ORE, ore("#ffd23a"));
  paintTile(B.IRON_ORE, ore("#d8a88a"));
  paintTile(B.COAL, ore("#1a1a1a"));
  paintTile(B.URANIUM, (x, y, r) => {
    const glow = (x * 3 + y * 7) % 9 < 2;
    return glow ? shade(hexToRgb("#9aff5a"), 0.9 + r() * 0.2) : shade(hexToRgb("#2a3a22"), 0.8 + r() * 0.4);
  });
  paintTile(B.CRYSTAL, (x, y, r) => {
    const facet = Math.abs(((x + y) % 8) - 4) < 1 || Math.abs(((x - y + 16) % 8) - 4) < 1;
    return shade(hexToRgb("#7dff4a"), facet ? 1.3 : 0.75 + r() * 0.15);
  });
  paintTile(B.MAGMA, (x, y, r) => {
    const crack = (x * 5 + y * 3) % 7 === 0 || (x * 2 + y * 9) % 11 === 0;
    return crack ? shade(hexToRgb("#3a1208"), 1) : shade(hexToRgb("#ff6a12"), 0.8 + r() * 0.4);
  });
  paintTile(B.PLANKS, (x, y, r) => {
    const line = y % 4 === 3 || (x === (y < 4 ? 3 : y < 8 ? 11 : y < 12 ? 6 : 14) && y % 4 !== 3);
    return shade(hexToRgb("#b0844c"), line ? 0.6 : 0.9 + r() * 0.15);
  });
  paintTile(B.COBBLE, (x, y, r) => {
    const edge = (x * 7 + y * 3) % 6 === 0 || (x + y * 5) % 7 === 0;
    return shade(hexToRgb("#6d6d70"), edge ? 0.55 : 0.85 + r() * 0.3);
  });
  paintTile(B.GLASS, (x, y) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    const glint = x - y === 4 || x - y === 6;
    return edge ? [220, 245, 255, 255] : glint ? [255, 255, 255, 180] : [190, 230, 255, 50];
  });
  paintTile(B.WATER, (_x, y, r) => [40 + r() * 20, 100 + r() * 30 + (y % 5 === 0 ? 20 : 0), 210 + r() * 30, 170]);
  paintTile(B.BLOOD, (_x, y, r) => [120 + r() * 40 + (y % 4 === 0 ? 30 : 0), 6, 18, 215]);
  paintTile(B.CLOUD, (_x, _y, r) => [240, 244, 255, 190 + r() * 40]);
  paintTile(B.ICE, (_x, _y, r) => [160, 214, 255, 170 + r() * 50]);
  paintTile(B.PYLON, (x, y, r) => {
    const rune = (x === 7 || x === 8) && y > 2 && y < 13 || (y === 5 && x > 4 && x < 11) || (y === 10 && (x === 5 || x === 10));
    return rune ? [255, 200, 255, 255] : shade(hexToRgb("#4a1a8a"), 0.8 + r() * 0.4);
  });
  paintTile(B.TOILET, (x, y, r) => {
    const tank = y < 5;
    return shade(hexToRgb(tank ? "#dcdcdc" : "#f4f4f4"), (x === 0 || x === 15 ? 0.8 : 1) * (0.95 + r() * 0.05));
  });
  paintTile(TILE_TOILET_TOP, (x, y) => {
    const d = Math.hypot(x - 7.5, y - 8.5);
    if (d < 3.5) return [60, 120, 200, 255];
    if (d < 5.5) return [250, 250, 250, 255];
    return y < 4 ? [210, 210, 210, 255] : [235, 235, 235, 255];
  });
  paintTile(B.BED, (x, y, r) => (y < 5 ? shade(hexToRgb("#eeeeee"), 0.95 + r() * 0.05) : y > 13 ? shade(hexToRgb("#6b4a2a"), 1) : shade(hexToRgb("#c4283a"), (x % 4 === 0 ? 0.85 : 1))));
  paintTile(TILE_BED_TOP, (x, y, r) => (y < 5 ? shade(hexToRgb("#ffffff"), 0.95 + r() * 0.05) : shade(hexToRgb("#c4283a"), (x + y) % 6 === 0 ? 0.8 : 1)));
  paintTile(B.WIRE, (x, y, r) => (Math.abs(x - 7.5) < 2 || Math.abs(y - 7.5) < 2 ? shade(hexToRgb("#7a1010"), 0.9 + r() * 0.2) : shade(hexToRgb("#3a3a3a"), 0.9 + r() * 0.2)));
  paintTile(B.WIRE_ON, (x, y, r) => (Math.abs(x - 7.5) < 2 || Math.abs(y - 7.5) < 2 ? shade(hexToRgb("#ff4040"), 0.9 + r() * 0.2) : shade(hexToRgb("#4a2a2a"), 0.9 + r() * 0.2)));
  const crankP = (on: boolean): Painter => (x, y, r) => {
    const lever = on ? Math.abs(x - y) < 2 && x > 3 : Math.abs(x + y - 15) < 2 && x > 3;
    if (lever) return shade(hexToRgb(on ? "#ffe060" : "#c0a060"), 1);
    return shade(hexToRgb("#5a5a5a"), 0.85 + r() * 0.2);
  };
  paintTile(B.CRANK, crankP(false));
  paintTile(B.CRANK_ON, crankP(true));
  paintTile(B.PISTON, (x, y, r) => shade(hexToRgb(y < 4 ? "#b08a55" : "#7a7a6a"), (x === 0 || x === 15 ? 0.7 : 1) * (0.9 + r() * 0.15)));
  paintTile(TILE_PISTON_TOP, (x, y, r) => shade(hexToRgb("#b08a55"), (x % 5 === 0 || y % 5 === 0 ? 0.75 : 1) * (0.9 + r() * 0.1)));
  paintTile(B.PISTON_HEAD, (x, y, r) => shade(hexToRgb("#c9a56a"), (x % 5 === 0 || y % 5 === 0 ? 0.75 : 1) * (0.9 + r() * 0.1)));
  paintTile(B.BALLOON, (x, y, r) => shade(hexToRgb("#e8e0c8"), ((x + y) % 4 === 0 ? 0.85 : 1) * (0.95 + r() * 0.08)));
  paintTile(B.BROKEN, (x, y, r) => {
    const stripe = (x + y * 3) % 5 === 0 || x % 8 === 0;
    return shade(hexToRgb(stripe ? "#c050ff" : "#4a4060"), 0.85 + r() * 0.3);
  });
  paintTile(B.OBELISK, (x, y, r) => {
    const glyph = (x * 7 + y * 11) % 13 === 0 || (x === 7 && y % 3 === 0);
    return glyph ? [255, 40, 80, 255] : shade(hexToRgb("#16161e"), 0.8 + r() * 0.4);
  });
  paintTile(B.WORKBENCH, (x, y, r) => shade(hexToRgb(y < 3 ? "#c08a4a" : "#7a5332"), (x % 5 === 0 ? 0.75 : 1) * (0.9 + r() * 0.15)));
  paintTile(TILE_WORKBENCH_TOP, (x, y, r) => {
    const tool = (x === y && x > 2 && x < 13) || (x + y === 15 && x > 8);
    return tool ? [200, 200, 210, 255] : shade(hexToRgb("#c08a4a"), (x % 4 === 0 ? 0.8 : 1) * (0.9 + r() * 0.1));
  });
  paintTile(B.SHRINE, (x, y, r) => {
    const rune = (x === 7 || x === 8 || y === 7 || y === 8) && Math.hypot(x - 7.5, y - 7.5) < 6;
    return rune ? [255, 250, 200, 255] : shade(hexToRgb("#a08a4a"), 0.8 + r() * 0.3);
  });
  paintTile(B.IRON_CRUST, (x, y, r) => {
    const rivet = (x % 8 === 2 && y % 8 === 2);
    const seam = x % 8 === 0 || y % 8 === 0;
    return shade(hexToRgb("#4a4f57"), rivet ? 1.5 : seam ? 0.65 : 0.85 + r() * 0.25);
  });
  paintTile(B.SNOW, noisy("#eef4fa", 0.06));
  paintTile(B.CORAL_PINK, (x, y, r) => ((x * 3 + y) % 5 < 1 ? shade(hexToRgb("#ffb0d0"), 1) : shade(hexToRgb("#ff5fa2"), 0.8 + r() * 0.3)));
  paintTile(B.CORAL_BLUE, (x, y, r) => ((x + y * 3) % 6 < 1 ? shade(hexToRgb("#c0f4ff"), 1) : shade(hexToRgb("#35d0ff"), 0.8 + r() * 0.3)));
  paintTile(B.CORAL_YELLOW, (x, y, r) => ((x * 2 + y * 2) % 7 < 1 ? shade(hexToRgb("#fff0a0"), 1) : shade(hexToRgb("#ffc21a"), 0.8 + r() * 0.3)));

  paintTile(B.MOSS_STONE, (x, y, r) => {
    const fleck = (x * 7 + y * 11) % 9 < 2;
    return shade(hexToRgb(fleck ? "#82966a" : "#566849"), 0.8 + r() * 0.3);
  });
  paintTile(B.BASALT, (x, y, r) => {
    const seam = x % 5 === 0 || (y + x * 2) % 9 === 0;
    return shade(hexToRgb(seam ? "#55535d" : "#292a33"), 0.85 + r() * 0.25);
  });
  paintTile(B.GLOWSTONE, (x, y, r) => {
    const veins = Math.abs((x * 3 + y * 5) % 11 - 5) < 2;
    return veins ? shade(hexToRgb("#e3ffe0"), 0.95 + r() * 0.1) : shade(hexToRgb("#80d5a4"), 0.8 + r() * 0.25);
  });
  paintTile(B.FUNGUS, (x, y, r) => {
    const cap = y < 7 && Math.abs(x - 7.5) < 6;
    const spots = (x * 3 + y * 7) % 13 < 2;
    return shade(hexToRgb(cap ? (spots ? "#f1d3bc" : "#c45393") : "#e3b5cf"), 0.85 + r() * 0.25);
  });
  paintTile(B.SANDSTONE, (x, y, r) => {
    const band = y % 5 === 0 || (x + y) % 13 === 0;
    return shade(hexToRgb(band ? "#9d7849" : "#c8a36a"), 0.85 + r() * 0.2);
  });
  paintTile(B.FROST_STONE, (x, y, r) => {
    const vein = (x * 5 + y * 3) % 11 < 2;
    return shade(hexToRgb(vein ? "#d8f4fa" : "#91b5c6"), 0.9 + r() * 0.2);
  });
  paintTile(B.AUTUMN_GRASS, (_x, y, r) => {
    const top = y < 4;
    return shade(hexToRgb(top ? "#c08039" : "#8e5030"), 0.85 + r() * 0.3);
  });
  paintTile(B.AUTUMN_LEAVES, (_x, _y, r) => (r() < 0.15 ? null : shade(hexToRgb(["#c34d24", "#e08a32", "#893b2e"][Math.floor(r() * 3)]), 0.75 + r() * 0.45)));
  paintTile(B.PEAT, (x, y, r) => {
    const reed = (x * 5 + y * 2) % 17 < 2;
    return shade(hexToRgb(reed ? "#72734a" : "#514536"), 0.82 + r() * 0.3);
  });
  paintTile(B.SULFUR_ORE, (x, y, r) => {
    const vein = (x * 5 + y * 7) % 13 < 3;
    return shade(hexToRgb(vein ? "#e8df62" : "#4a4542"), 0.82 + r() * 0.3);
  });
  paintTile(B.PALE_STONE, (x, y, r) => {
    const fossil = (x * 7 + y * 3) % 19 < 2;
    return shade(hexToRgb(fossil ? "#786e67" : "#b5a99b"), 0.84 + r() * 0.28);
  });
  paintTile(B.SALT, (x, y, r) => {
    const crystal = (x + y) % 6 === 0 || (x - y + 16) % 7 === 0;
    return shade(hexToRgb(crystal ? "#ffffff" : "#d7d9cf"), 0.9 + r() * 0.15);
  });
  paintTile(B.ASH, (x, y, r) => {
    const ember = (x * 3 + y * 11) % 29 === 0;
    return shade(hexToRgb(ember ? "#df6730" : "#51494d"), 0.8 + r() * 0.35);
  });
  paintTile(B.REDWOOD_LOG, (x, _y, r) => {
    const grain = x % 3 === 0 || x % 7 === 0;
    return shade(hexToRgb(grain ? "#38251d" : "#593923"), 0.85 + r() * 0.2);
  });
  paintTile(B.PURPLE_CRYSTAL, (x, y, r) => {
    const facet = Math.abs(((x + y * 2) % 9) - 4) < 2;
    return shade(hexToRgb(facet ? "#edb5ff" : "#8c45c3"), 0.9 + r() * 0.25);
  });
  paintTile(B.DRY_GRASS, (x, y, r) => (y < 3 + ((x * 3) % 3 === 0 ? 1 : 0) ? shade(hexToRgb("#b8a24a"), 0.85 + r() * 0.3) : shade(hexToRgb("#8a5a34"), 0.82 + r() * 0.3)));
  paintTile(TILE_DRY_GRASS_TOP, (x, y, r) => shade(hexToRgb((x * 5 + y * 3) % 7 === 0 ? "#d2bd63" : "#b8a24a"), 0.8 + r() * 0.3));
  paintTile(B.JUNGLE_LEAVES, (_x, _y, r) => (r() < 0.12 ? null : shade(hexToRgb(r() < 0.1 ? "#7fd14a" : "#2f8f3a"), 0.7 + r() * 0.5)));
  paintTile(B.CHERRY_LEAVES, (_x, _y, r) => (r() < 0.14 ? null : shade(hexToRgb(r() < 0.3 ? "#ffd1e8" : "#ffb3d9"), 0.8 + r() * 0.3)));
  paintTile(B.TERRACOTTA, (_x, y, r) => shade(hexToRgb(y % 6 < 2 ? "#c9733c" : y % 6 < 4 ? "#b5602f" : "#d99a5a"), 0.9 + r() * 0.12));
  paintTile(B.TERRACOTTA_DARK, (_x, y, r) => shade(hexToRgb(y % 5 < 2 ? "#7a3a22" : "#914a2c"), 0.9 + r() * 0.12));
  paintTile(B.BONE_BLOCK, (x, y, r) => {
    const seam = y % 8 === 3 || (x % 8 === 1 && y % 8 > 3);
    return shade(hexToRgb(seam ? "#b9b2a0" : "#e9e4d2"), 0.9 + r() * 0.12);
  });
  paintTile(B.OBSIDIAN, (x, y, r) => {
    const sheen = (x * 3 + y * 5) % 17 === 0;
    return shade(hexToRgb(sheen ? "#6a4aa0" : "#1d1826"), 0.85 + r() * 0.3);
  });
  paintTile(B.TUNDRA_SOIL, (x, y, r) => {
    const frost = (x * 7 + y * 3) % 11 < 2;
    return shade(hexToRgb(frost ? "#cfd6dc" : "#6f6a5a"), 0.85 + r() * 0.25);
  });
  paintTile(B.CRYSTAL_BLUE, (x, y, r) => {
    const facet = Math.abs(((x * 2 - y + 16) % 9) - 4) < 2;
    return shade(hexToRgb(facet ? "#cfefff" : "#2a86d8"), 0.9 + r() * 0.25);
  });
  paintTile(B.REINFORCED_IRON, (x, y, r) => {
    const brace = Math.abs(x - y) < 2 || Math.abs(x + y - 15) < 2;
    const rivet = (x === 2 || x === 13) && (y === 2 || y === 13);
    return shade(hexToRgb(rivet ? "#dce2e5" : brace ? "#8797a5" : "#3e4d5c"), 0.9 + r() * 0.2);
  });
  paintTile(B.GOLEM_CORE, (x, y, r) => {
    const eye = (x === 5 || x === 10) && y > 5 && y < 9;
    return shade(hexToRgb(eye ? "#efffc7" : "#ad753f"), 0.8 + r() * 0.3);
  });
  paintTile(B.CONDUIT, (x, y, r) => shade(hexToRgb(x % 5 === 2 || y % 5 === 2 ? "#a4e4d1" : "#31695f"), 0.85 + r() * 0.25));
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.shared = true;
  return { texture, canvas };
}

// Data-URL icons for UI (rendered from the atlas)
const iconCache = new Map<number, string>();
let atlasCanvas: HTMLCanvasElement | null = null;
export function setAtlasCanvas(c: HTMLCanvasElement) {
  atlasCanvas = c;
  iconCache.clear();
}
export function blockIcon(id: number, tile?: number): string {
  if (iconCache.has(id)) return iconCache.get(id)!;
  if (!atlasCanvas) return "";
  const t = tile ?? (id === B.GRASS ? TILE_GRASS_TOP : id === B.LOG ? TILE_LOG_TOP : id === B.TOILET ? TILE_TOILET_TOP : id === B.WORKBENCH ? TILE_WORKBENCH_TOP : id);
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const cx = c.getContext("2d")!;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(atlasCanvas, (t % ATLAS_TILES) * TILE_PX, Math.floor(t / ATLAS_TILES) * TILE_PX, TILE_PX, TILE_PX, 0, 0, 32, 32);
  const url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}
