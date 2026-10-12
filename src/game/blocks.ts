export const B = {
  AIR: 0,
  IRON_CRUST: 1,
  STONE: 2,
  DIRT: 3,
  GRASS: 4,
  SAND: 5,
  WATER: 6,
  BLOOD: 7,
  LOG: 8,
  LEAVES: 9,
  SPRUCE: 10,
  SNOW: 11,
  GOLD_ORE: 12,
  IRON_ORE: 13,
  COAL: 14,
  CLOUD: 15,
  CORAL_PINK: 16,
  CORAL_BLUE: 17,
  CRYSTAL: 18,
  URANIUM: 19,
  MAGMA: 20,
  PLANKS: 21,
  COBBLE: 22,
  GLASS: 23,
  PYLON: 24,
  TOILET: 25,
  BED: 26,
  WIRE: 27,
  CRANK: 28,
  CRANK_ON: 29,
  PISTON: 30,
  PISTON_HEAD: 31,
  BALLOON: 32,
  BROKEN: 33,
  ICE: 34,
  OBELISK: 35,
  WORKBENCH: 36,
  SHRINE: 37,
  WIRE_ON: 38,
  CORAL_YELLOW: 39,
  DARK_STONE: 40,
  MOSS_STONE: 41,
  BASALT: 42,
  GLOWSTONE: 43,
  FUNGUS: 44,
  SANDSTONE: 45,
  FROST_STONE: 46,
  AUTUMN_GRASS: 47,
  AUTUMN_LEAVES: 48,
  PEAT: 49,
  SULFUR_ORE: 50,
  PALE_STONE: 51,
  SALT: 52,
  ASH: 53,
  REDWOOD_LOG: 54,
  PURPLE_CRYSTAL: 55,
  DRY_GRASS: 56,
  JUNGLE_LEAVES: 57,
  CHERRY_LEAVES: 58,
  TERRACOTTA: 59,
  TERRACOTTA_DARK: 60,
  BONE_BLOCK: 61,
  OBSIDIAN: 62,
  TUNDRA_SOIL: 63,
  CRYSTAL_BLUE: 64,
  REINFORCED_IRON: 65,
  GOLEM_CORE: 66,
  CONDUIT: 67,
} as const;

export type BlockId = number;

export interface BlockDef {
  name: string;
  color: string; // base color for texture & item icon
  solid: boolean;
  transparent: boolean; // rendered in transparent pass / does not cull neighbors
  fluid?: boolean;
  emissive?: boolean;
  cutout?: boolean;
  hardness: number; // seconds by hand
  tool?: "pick" | "axe" | "shovel";
  drop?: number | null;
  interact?: boolean;
  category: string;
}

const d = (o: Partial<BlockDef> & { name: string; color: string }): BlockDef => ({
  solid: true,
  transparent: false,
  hardness: 1,
  category: "terrain",
  ...o,
});

export const BLOCKS: Record<number, BlockDef> = {
  [B.AIR]: d({ name: "Air", color: "#000", solid: false, transparent: true, hardness: 0 }),
  [B.IRON_CRUST]: d({ name: "Iron Crust", color: "#4a4f57", hardness: 18, tool: "pick", category: "metal" }),
  [B.STONE]: d({ name: "Stone", color: "#7c7c80", hardness: 2.2, tool: "pick", drop: B.COBBLE }),
  [B.DIRT]: d({ name: "Dirt", color: "#7a5332", hardness: 0.7, tool: "shovel" }),
  [B.GRASS]: d({ name: "Grass", color: "#4f9a3a", hardness: 0.8, tool: "shovel", drop: B.DIRT }),
  [B.SAND]: d({ name: "Sand", color: "#dcc98a", hardness: 0.6, tool: "shovel" }),
  [B.WATER]: d({ name: "Water", color: "#2b6fd6", solid: false, transparent: true, fluid: true, hardness: 0, category: "fluid" }),
  [B.BLOOD]: d({ name: "Liquid Blood", color: "#8a0b14", solid: false, transparent: true, fluid: true, hardness: 0, category: "fluid" }),
  [B.LOG]: d({ name: "Log", color: "#6b4a2a", hardness: 2, tool: "axe", category: "wood" }),
  [B.LEAVES]: d({ name: "Leaves", color: "#3d8a2e", cutout: true, hardness: 0.3, category: "plant" }),
  [B.SPRUCE]: d({ name: "Spruce Needles", color: "#2a5a3a", cutout: true, hardness: 0.3, category: "plant" }),
  [B.SNOW]: d({ name: "Snow", color: "#eef4fa", hardness: 0.5, tool: "shovel" }),
  [B.GOLD_ORE]: d({ name: "Gold Ore", color: "#7c7c80", hardness: 3, tool: "pick", category: "ore" }),
  [B.IRON_ORE]: d({ name: "Iron Ore", color: "#7c7c80", hardness: 3, tool: "pick", category: "ore" }),
  [B.COAL]: d({ name: "Coal Ore", color: "#7c7c80", hardness: 2.5, tool: "pick", category: "ore" }),
  [B.CLOUD]: d({ name: "Cloud", color: "#f4f6ff", transparent: true, hardness: 0.2, category: "sky" }),
  [B.CORAL_PINK]: d({ name: "Pink Coral", color: "#ff5fa2", hardness: 0.5, category: "plant" }),
  [B.CORAL_BLUE]: d({ name: "Blue Coral", color: "#35d0ff", hardness: 0.5, category: "plant" }),
  [B.CORAL_YELLOW]: d({ name: "Yellow Coral", color: "#ffd23a", hardness: 0.5, category: "plant" }),
  [B.CRYSTAL]: d({ name: "Toxic Crystal", color: "#7dff4a", emissive: true, hardness: 2.5, tool: "pick", category: "ore" }),
  [B.URANIUM]: d({ name: "Uranium Fragment", color: "#3b5a2a", emissive: true, hardness: 4, tool: "pick", category: "ore" }),
  [B.MAGMA]: d({ name: "Magma", color: "#ff5a12", emissive: true, hardness: 2, tool: "pick", category: "terrain" }),
  [B.PLANKS]: d({ name: "Planks", color: "#b0844c", hardness: 1.5, tool: "axe", category: "wood" }),
  [B.COBBLE]: d({ name: "Cobblestone", color: "#6d6d70", hardness: 2.2, tool: "pick" }),
  [B.GLASS]: d({ name: "Glass", color: "#bfe8ff", transparent: true, hardness: 0.4, category: "build" }),
  [B.PYLON]: d({ name: "Pylon", color: "#8a3cff", emissive: true, hardness: 5, interact: true, category: "machine" }),
  [B.TOILET]: d({ name: "Toilet", color: "#f2f2f2", hardness: 1, interact: true, category: "machine" }),
  [B.BED]: d({ name: "Bed", color: "#c4283a", hardness: 0.8, interact: true, category: "machine" }),
  [B.WIRE]: d({ name: "Wire", color: "#6a1010", hardness: 0.2, category: "machine" }),
  [B.WIRE_ON]: d({ name: "Wire (Powered)", color: "#ff3030", emissive: true, hardness: 0.2, drop: B.WIRE, category: "machine" }),
  [B.CRANK]: d({ name: "Crank", color: "#8a6a3a", hardness: 0.6, interact: true, category: "machine" }),
  [B.CRANK_ON]: d({ name: "Crank (On)", color: "#e0b040", emissive: true, hardness: 0.6, interact: true, drop: B.CRANK, category: "machine" }),
  [B.PISTON]: d({ name: "Piston", color: "#8f8f7a", hardness: 1.5, category: "machine" }),
  [B.PISTON_HEAD]: d({ name: "Piston Head", color: "#c9a56a", hardness: 1.5, drop: null, category: "machine" }),
  [B.BALLOON]: d({ name: "Balloon Cloth", color: "#e8e0c8", hardness: 0.4, category: "build" }),
  [B.BROKEN]: d({ name: "Broken Land", color: "#5a5070", hardness: 2, tool: "pick" }),
  [B.ICE]: d({ name: "Ice", color: "#9fd6ff", transparent: true, hardness: 0.6, tool: "pick" }),
  [B.OBELISK]: d({ name: "Obelisk Seal", color: "#1a1a22", emissive: true, hardness: 30, interact: true, category: "machine" }),
  [B.WORKBENCH]: d({ name: "Chisel Bench", color: "#9a6a3a", hardness: 1.5, interact: true, category: "machine" }),
  [B.SHRINE]: d({ name: "Ancient Shrine", color: "#d8c27a", emissive: true, hardness: 6, interact: true, category: "machine" }),
  [B.DARK_STONE]: d({ name: "Dirty Stone", color: "#3e3a34", hardness: 2.5, tool: "pick" }),
  [B.MOSS_STONE]: d({ name: "Mossstone", color: "#566849", hardness: 2, tool: "pick", drop: B.COBBLE }),
  [B.BASALT]: d({ name: "Basalt", color: "#343641", hardness: 3, tool: "pick", drop: B.COBBLE }),
  [B.GLOWSTONE]: d({ name: "Cave Glowstone", color: "#9df3c3", emissive: true, hardness: 2.2, tool: "pick", category: "ore" }),
  [B.FUNGUS]: d({ name: "Cave Fungus", color: "#c45393", hardness: 0.5, category: "plant" }),
  [B.SANDSTONE]: d({ name: "Sandstone", color: "#c8a36a", hardness: 1.6, tool: "pick" }),
  [B.FROST_STONE]: d({ name: "Glacier Stone", color: "#91b5c6", hardness: 2.4, tool: "pick" }),
  [B.AUTUMN_GRASS]: d({ name: "Autumn Grass", color: "#ad6533", hardness: 0.8, tool: "shovel", drop: B.DIRT }),
  [B.AUTUMN_LEAVES]: d({ name: "Copper Leaves", color: "#c34d24", cutout: true, hardness: 0.3, category: "plant" }),
  [B.PEAT]: d({ name: "Marsh Peat", color: "#514536", hardness: 0.7, tool: "shovel" }),
  [B.SULFUR_ORE]: d({ name: "Sulfur Ore", color: "#d8d05c", hardness: 2.8, tool: "pick", category: "ore" }),
  [B.PALE_STONE]: d({ name: "Pale Cave Limestone", color: "#b5a99b", hardness: 2.2, tool: "pick" }),
  [B.SALT]: d({ name: "Saltstone", color: "#e7e8dc", hardness: 1.5, tool: "pick" }),
  [B.ASH]: d({ name: "Volcanic Ash", color: "#51494d", hardness: 1.1, tool: "shovel" }),
  [B.REDWOOD_LOG]: d({ name: "Redwood Heartwood", color: "#593923", hardness: 2.8, tool: "axe", category: "wood" }),
  [B.PURPLE_CRYSTAL]: d({ name: "Amethyst Shardstone", color: "#bd6dff", emissive: true, hardness: 3.2, tool: "pick", category: "ore" }),
  [B.DRY_GRASS]: d({ name: "Savanna Grass", color: "#b8a24a", hardness: 0.8, tool: "shovel", drop: B.DIRT }),
  [B.JUNGLE_LEAVES]: d({ name: "Jungle Canopy", color: "#2f8f3a", cutout: true, hardness: 0.3, category: "plant" }),
  [B.CHERRY_LEAVES]: d({ name: "Cherry Blossom", color: "#ffb3d9", cutout: true, hardness: 0.3, category: "plant" }),
  [B.TERRACOTTA]: d({ name: "Terracotta", color: "#b5602f", hardness: 1.8, tool: "pick" }),
  [B.TERRACOTTA_DARK]: d({ name: "Umber Terracotta", color: "#7a3a22", hardness: 1.8, tool: "pick" }),
  [B.BONE_BLOCK]: d({ name: "Bone Block", color: "#e9e4d2", hardness: 1.6, tool: "pick" }),
  [B.OBSIDIAN]: d({ name: "Ironroot Obsidian", color: "#1d1826", hardness: 8, tool: "pick" }),
  [B.TUNDRA_SOIL]: d({ name: "Frozen Tundra Soil", color: "#6f6a5a", hardness: 0.9, tool: "shovel" }),
  [B.CRYSTAL_BLUE]: d({ name: "Deep Sapphire Crystal", color: "#4ab8ff", emissive: true, hardness: 3.6, tool: "pick", category: "ore" }),
  [B.REINFORCED_IRON]: d({ name: "Reinforced Iron", color: "#596879", hardness: 14, tool: "pick", category: "build" }),
  [B.GOLEM_CORE]: d({ name: "Round Golem Core", color: "#df9757", emissive: true, hardness: 4, interact: true, category: "machine" }),
  [B.CONDUIT]: d({ name: "Conduit Array", color: "#50b4a3", emissive: true, hardness: 3, category: "machine" }),
};

// Seconds of sustained exposure. The same rules apply to off-screen construction.
export function weatherResistance(id: number) {
  if (id === B.IRON_CRUST || id === B.REINFORCED_IRON || id === B.OBSIDIAN || id === B.OBELISK || id === B.PYLON || id === B.SHRINE) return Infinity;
  if (id === B.STONE || id === B.COBBLE || id === B.BASALT || id === B.DARK_STONE) return 22;
  if (id === B.PLANKS || id === B.LOG || id === B.REDWOOD_LOG) return 4;
  return Math.max(0.3, (BLOCKS[id]?.hardness ?? 1) * 1.8);
}

export const isSolid = (id: number) => id !== 0 && BLOCKS[id]?.solid !== false;
export const isFluid = (id: number) => !!BLOCKS[id]?.fluid;
export const isTransparent = (id: number) => id === 0 || !!BLOCKS[id]?.transparent || !!BLOCKS[id]?.cutout;

// Atlas tile indices; most blocks use tile == id. Extra tiles:
export const TILE_GRASS_TOP = 240;
export const TILE_LOG_TOP = 241;
export const TILE_BED_TOP = 242;
export const TILE_TOILET_TOP = 243;
export const TILE_PISTON_TOP = 244;
export const TILE_WORKBENCH_TOP = 245;
export const TILE_DRY_GRASS_TOP = 246;

export function tileFor(id: number, face: "top" | "bottom" | "side"): number {
  if (id === B.GRASS) return face === "top" ? TILE_GRASS_TOP : face === "bottom" ? B.DIRT : B.GRASS;
  if (id === B.AUTUMN_GRASS) return face === "bottom" ? B.DIRT : B.AUTUMN_GRASS;
  if (id === B.DRY_GRASS) return face === "top" ? TILE_DRY_GRASS_TOP : face === "bottom" ? B.DIRT : B.DRY_GRASS;
  if (id === B.LOG || id === B.REDWOOD_LOG) return face === "side" ? id : TILE_LOG_TOP;
  if (id === B.BED) return face === "top" ? TILE_BED_TOP : B.BED;
  if (id === B.TOILET) return face === "top" ? TILE_TOILET_TOP : B.TOILET;
  if (id === B.PISTON) return face === "top" ? TILE_PISTON_TOP : B.PISTON;
  if (id === B.WORKBENCH) return face === "top" ? TILE_WORKBENCH_TOP : B.WORKBENCH;
  return id;
}

// ===== Items (non-block) =====
export interface ItemDef {
  name: string;
  color: string;
  category: string;
  icon: string;
  food?: number;
  drink?: number;
  poison?: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
  raw_pork: { name: "Raw Pork", color: "#f39aa0", category: "food", icon: "🥩", food: 20, poison: true },
  processed_pork: { name: "Processed Pork Loaf", color: "#d7867e", category: "food", icon: "🍖", food: 30 },
  steamed_pork: { name: "Steamed Pork (Albany)", color: "#f1c9a8", category: "food", icon: "🍱", food: 60 },
  raw_beef: { name: "Raw Beef", color: "#c03a3a", category: "food", icon: "🥩", food: 25, poison: true },
  raw_chicken: { name: "Raw Chicken", color: "#f5d0b0", category: "food", icon: "🍗", food: 15, poison: true },
  cooked_meat: { name: "Seared Meat", color: "#8a4a2a", category: "food", icon: "🍖", food: 45 },
  bone: { name: "Bone", color: "#eee", category: "material", icon: "🦴" },
  bucket: { name: "Bucket", color: "#999", category: "tool", icon: "🪣" },
  water_bucket: { name: "Water Bucket", color: "#2b6fd6", category: "fluid", icon: "💧", drink: 40 },
  blood_bucket: { name: "Blood Bucket", color: "#8a0b14", category: "fluid", icon: "🩸" },
  milk: { name: "Milk (aging)", color: "#fff", category: "food", icon: "🥛", drink: 25 },
  cheese: { name: "Aged Cheese", color: "#ffd84a", category: "food", icon: "🧀", food: 20 },
  feather: { name: "Feather", color: "#fff", category: "material", icon: "🪶" },
  uranium_dust: { name: "Uranium Dust", color: "#7dff4a", category: "material", icon: "☢️" },
  raw_fish: { name: "Raw Fish", color: "#779dab", category: "food", icon: "F", food: 15, poison: true },
  mouse: { name: "Field Mouse", color: "#a89782", category: "material", icon: "M" },
};

export type ToolKind = "sword" | "pickaxe" | "axe" | "shovel" | "chestplate";
