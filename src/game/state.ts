import { BLOCKS, ITEMS, B, type ToolKind } from "./blocks";
import { readSet } from "../storage";

export type LimbKey = "head" | "torso" | "lwing" | "rwing" | "lleg" | "rleg" | "leye" | "reye";
export const LIMB_NAMES: Record<LimbKey, string> = {
  head: "Head",
  torso: "Torso",
  lwing: "L Wing",
  rwing: "R Wing",
  lleg: "L Leg",
  rleg: "R Leg",
  leye: "L Eye",
  reye: "R Eye",
};
export const LIMB_MAX: Record<LimbKey, number> = { head: 40, torso: 60, lwing: 30, rwing: 30, lleg: 35, rleg: 35, leye: 12, reye: 12 };

export interface Limb {
  hp: number;
  lost: boolean;
}

export type ItemStack =
  | { kind: "block"; id: number; count: number }
  | { kind: "item"; key: string; count: number; age?: number }
  | { kind: "tool"; tool: ToolKind; material: number; quality: number; durability: number; count: 1 };

export type UIMode = "none" | "inventory" | "chisel" | "pylon" | "sleep" | "chat" | "runes" | "death" | "help" | "world";

export interface ChatMsg {
  text: string;
  color?: string;
  t: number;
  from?: string;
}

export const RUNES = [
  { id: "swift", glyph: "ᚱ", name: "Swift", color: "#5ad1ff", desc: "+movement speed" },
  { id: "guard", glyph: "ᚦ", name: "Guard", color: "#ffd23a", desc: "-limb damage" },
  { id: "leap", glyph: "ᛚ", name: "Leap", color: "#7dff4a", desc: "+jump / flutter" },
  { id: "glow", glyph: "ᛋ", name: "Glow", color: "#ff7ad1", desc: "personal light" },
  { id: "vigor", glyph: "ᚢ", name: "Vigor", color: "#ff5a5a", desc: "limb regeneration" },
] as const;
export type RuneId = (typeof RUNES)[number]["id"];

export interface GameState {
  phase: "menu" | "loading" | "playing";
  mode: "survival" | "creative";
  limbs: Record<LimbKey, Limb>;
  scars: Partial<Record<LimbKey, number>>;
  deaths: number;
  hunger: number;
  thirst: number;
  poison: number;
  radiation: number;
  flight: number;
  crushed: number;
  inventory: (ItemStack | null)[];
  selected: number;
  armorGold: boolean;
  day: number;
  time: number; // 0..1, 0.25 = noon-ish
  storm: number;
  chat: ChatMsg[];
  toast: { title: string; sub: string; t: number } | null;
  aurora: boolean;
  achievement: boolean;
  ui: UIMode;
  biome: string;
  coords: string;
  boss: { name: string; hp: number; max: number } | null;
  runes: (RuneId | null)[];
  runeEnergy: number;
  killLog: string[];
  peers: number;
  thirdPerson: boolean;
  chillSpawned: boolean;
  mining: number;
  lookingAt: string;
  inVoid: boolean;
  mounted: boolean;
  fps: number;
  lowLight: boolean;
  loadProgress: number;
  loadLabel: string;
  weatherLabel: string;
  skyLight: number;
  eclipse: boolean;
  submerged: boolean;
  worldSeconds: number;
}

export const INV_SIZE = 36;

function freshLimbs(): Record<LimbKey, Limb> {
  const o = {} as Record<LimbKey, Limb>;
  (Object.keys(LIMB_MAX) as LimbKey[]).forEach((k) => (o[k] = { hp: LIMB_MAX[k], lost: false }));
  return o;
}

function loadScars(): { scars: Partial<Record<LimbKey, number>>; deaths: number } {
  try {
    const s = JSON.parse(readSet("ernas_scars") || "null");
    if (s) return s;
  } catch {
    /* ignore */
  }
  return { scars: {}, deaths: 0 };
}

export function createState(): GameState {
  const sc = loadScars();
  const inv: (ItemStack | null)[] = new Array(INV_SIZE).fill(null);
  const start: ItemStack[] = [
    { kind: "block", id: B.PLANKS, count: 32 },
    { kind: "block", id: B.COBBLE, count: 24 },
    { kind: "block", id: B.GLASS, count: 16 },
    { kind: "item", key: "bucket", count: 1 },
    { kind: "block", id: B.PYLON, count: 2 },
    { kind: "block", id: B.WIRE, count: 16 },
    { kind: "block", id: B.CRANK, count: 2 },
    { kind: "block", id: B.PISTON, count: 4 },
    { kind: "item", key: "processed_pork", count: 1 },
    { kind: "block", id: B.BED, count: 1 },
    { kind: "block", id: B.TOILET, count: 1 },
    { kind: "block", id: B.WORKBENCH, count: 1 },
    { kind: "block", id: B.BALLOON, count: 8 },
    { kind: "item", key: "raw_pork", count: 2 },
    { kind: "item", key: "water_bucket", count: 1 },
  ];
  start.forEach((s, i) => (inv[i] = s));
  return {
    phase: "menu",
    mode: "survival",
    limbs: freshLimbs(),
    scars: sc.scars,
    deaths: sc.deaths,
    hunger: 100,
    thirst: 100,
    poison: 0,
    radiation: 0,
    flight: 100,
    crushed: 0,
    inventory: inv,
    selected: 0,
    armorGold: false,
    day: 1,
    time: 0.3,
    storm: 0,
    chat: [{ text: "Welcome to ERNAS. You are a moth on the inside of the world. Press H for help.", color: "#ffd23a", t: performance.now() }],
    toast: null,
    aurora: false,
    achievement: false,
    ui: "none",
    biome: "",
    coords: "",
    boss: null,
    runes: new Array(25).fill(null),
    runeEnergy: 0,
    killLog: [],
    peers: 0,
    thirdPerson: false,
    chillSpawned: false,
    mining: 0,
    lookingAt: "",
    inVoid: false,
    mounted: false,
    fps: 0,
    lowLight: false,
    loadProgress: 0,
    loadLabel: "",
    weatherLabel: "Clear",
    skyLight: 1,
    eclipse: false,
    submerged: false,
    worldSeconds: 0,
  };
}

export function resetLimbs(s: GameState) {
  s.limbs = freshLimbs();
}

export function stackName(st: ItemStack): string {
  if (st.kind === "block") return BLOCKS[st.id]?.name ?? "?";
  if (st.kind === "item") return ITEMS[st.key]?.name ?? st.key;
  return `${BLOCKS[st.material]?.name.replace(" Ore", "") ?? "?"} ${st.tool[0].toUpperCase() + st.tool.slice(1)} (${Math.round(st.quality * 100)}%)`;
}
export function stackCategory(st: ItemStack): string {
  if (st.kind === "block") return BLOCKS[st.id]?.category ?? "terrain";
  if (st.kind === "item") return ITEMS[st.key]?.category ?? "material";
  return "tool";
}
const maxStack = (st: ItemStack) => (st.kind === "tool" ? 1 : st.kind === "item" && (st.key.includes("bucket") || st.key === "bucket") ? 1 : 64);

const sameKind = (a: ItemStack, b: ItemStack) =>
  a.kind === b.kind && ((a.kind === "block" && b.kind === "block" && a.id === b.id) || (a.kind === "item" && b.kind === "item" && a.key === b.key));

export function addItem(s: GameState, st: ItemStack): boolean {
  let remaining = st.count;
  if (st.kind !== "tool") {
    for (const slot of s.inventory) {
      if (slot && sameKind(slot, st) && slot.count < maxStack(slot)) {
        const take = Math.min(remaining, maxStack(slot) - slot.count);
        slot.count += take;
        remaining -= take;
        if (remaining <= 0) return true;
      }
    }
  }
  for (let i = 0; i < s.inventory.length; i++) {
    if (!s.inventory[i]) {
      s.inventory[i] = { ...st, count: remaining } as ItemStack;
      return true;
    }
  }
  return false;
}

export function countItem(s: GameState, pred: (st: ItemStack) => boolean) {
  return s.inventory.reduce((a, st) => a + (st && pred(st) ? st.count : 0), 0);
}

export function consumeSelected(s: GameState, n = 1) {
  const st = s.inventory[s.selected];
  if (!st) return;
  st.count -= n;
  if (st.count <= 0) s.inventory[s.selected] = null;
}

export function removeItem(s: GameState, pred: (st: ItemStack) => boolean, n = 1): boolean {
  if (countItem(s, pred) < n) return false;
  let left = n;
  for (let i = 0; i < s.inventory.length; i++) {
    const st = s.inventory[i];
    if (st && pred(st)) {
      const take = Math.min(left, st.count);
      st.count -= take;
      left -= take;
      if (st.count <= 0) s.inventory[i] = null;
      if (!left) return true;
    }
  }
  return false;
}

const CAT_ORDER = ["tool", "food", "fluid", "machine", "build", "wood", "ore", "metal", "terrain", "plant", "sky", "material"];

/** Multi-vector sort: (1) merge partial stacks, (2) category vector, (3) name vector, (4) count/quality vector. Hotbar keeps tools & machines in front. */
export function sortInventory(s: GameState) {
  const items = s.inventory.filter(Boolean) as ItemStack[];
  const merged: ItemStack[] = [];
  for (const it of items) {
    if (it.kind === "tool") {
      merged.push(it);
      continue;
    }
    let rem = it.count;
    for (const m of merged) {
      if (sameKind(m, it) && m.count < maxStack(m)) {
        const take = Math.min(rem, maxStack(m) - m.count);
        m.count += take;
        rem -= take;
      }
      if (rem <= 0) break;
    }
    if (rem > 0) merged.push({ ...it, count: rem } as ItemStack);
  }
  merged.sort((a, b) => {
    const ca = CAT_ORDER.indexOf(stackCategory(a)), cb = CAT_ORDER.indexOf(stackCategory(b));
    if (ca !== cb) return ca - cb;
    const na = stackName(a), nb = stackName(b);
    if (na !== nb) return na.localeCompare(nb);
    const qa = a.kind === "tool" ? a.quality : a.count, qb = b.kind === "tool" ? b.quality : b.count;
    return qb - qa;
  });
  s.inventory = new Array(INV_SIZE).fill(null);
  merged.forEach((m, i) => (s.inventory[i] = m));
}

// ===== tiny store =====
type Listener = () => void;
export class Store {
  s: GameState = createState();
  version = 0;
  private listeners = new Set<Listener>();
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  bump() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
  say(text: string, color?: string, from?: string) {
    this.s.chat.push({ text, color, t: performance.now(), from });
    if (this.s.chat.length > 60) this.s.chat.shift();
    this.bump();
  }
  toast(title: string, sub: string) {
    this.s.toast = { title, sub, t: performance.now() };
    this.bump();
  }
}

export const store = new Store();
