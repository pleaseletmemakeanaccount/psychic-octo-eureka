import { useEffect, useRef, useState } from "react";
import { engine } from "../game/engine";
import { RUNES, sortInventory, stackName, store, type RuneId } from "../game/state";
import { ItemIcon, Panel, useGame } from "./common";
import { BIOME_NAMES, H, L, N } from "../game/world";
import { B, BLOCKS } from "../game/blocks";

export function InventoryPanel() {
  const s = useGame();
  const [held, setHeld] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const click = (i: number) => {
    if (held === null) {
      if (s.inventory[i]) setHeld(i);
      return;
    }
    const inv = s.inventory;
    const a = inv[held], b = inv[i];
    inv[held] = b;
    inv[i] = a;
    setHeld(null);
    store.bump();
  };
  return (
    <Panel title="Inventory · auto-sorted" onClose={() => engine.closeUI()}>
      <div className="text-[11px] text-white/60 mb-3">
        Multi-vector sort applied on open: merge stacks → category → name → count/quality. Click two slots to swap. Top row = hotbar.
      </div>
      <div className="inventory-grid grid grid-cols-9 gap-1">
        {s.inventory.map((st, i) => (
          <button
            key={i}
            onClick={() => click(i)}
            className={`w-14 h-14 flex items-center justify-center border-2 ${held === i ? "border-[#ffd23a] bg-[#ffd23a]/20" : i < 9 ? "border-[#6a5a7a] bg-black/40" : "border-[#3a3048] bg-black/30"} hover:border-white/60`}
            title={st ? stackName(st) : ""}
          >
            <ItemIcon stack={st} size={46} />
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-4 items-center">
        <button
          className="px-3 py-1 border-2 border-[#5a4a6a] hover:bg-[#3a3048]"
          onClick={() => {
            sortInventory(store.s);
            store.bump();
          }}
        >
          Re-sort
        </button>
        <div className="text-xs text-white/50 ml-auto">Gold armor: {s.armorGold ? "equipped ✦" : "none"} · Kills logged: {s.killLog.length}</div>
      </div>
      {s.mode === "creative" && <div className="mt-4">
        <label className="text-xs text-[#ffd23a]">Creative blocks: tap to fill the selected hotbar slot</label>
        <input className="w-full my-2 p-2 bg-black border border-white/25 text-base" placeholder="Search blocks..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <div className="grid grid-cols-5 sm:grid-cols-8 gap-1 max-h-48 overflow-y-auto">
          {Object.entries(BLOCKS).filter(([id, def]) => Number(id) !== B.AIR && def.drop !== null && def.name.toLowerCase().includes(query.toLowerCase())).map(([id, def]) => <button key={id} className="flex justify-center border border-white/20 hover:border-[#ffd23a]" title={def.name} onClick={() => { s.inventory[s.selected] = { kind: "block", id: Number(id), count: 64 }; store.bump(); }}><ItemIcon stack={{ kind: "block", id: Number(id), count: 1 }} size={42} /></button>)}
        </div>
      </div>}
    </Panel>
  );
}

export function ChatInput() {
  const [v, setV] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 10);
  }, []);
  return (
    <form className="chat-input absolute left-3 bottom-20 z-30 w-[460px] max-w-[94vw] flex gap-1" onSubmit={(e) => { e.preventDefault(); engine.handleChat(v); if (store.s.ui === "chat") engine.closeUI(); }}>
      <input
        ref={ref}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") engine.closeUI();
        }}
        placeholder="say something... (try: hey)"
        className="min-w-0 flex-1 bg-black/75 border-2 border-white/30 px-2 py-1.5 font-mono text-base text-white outline-none focus:border-[#ffd23a]"
      />
      <button type="submit" className="bg-black/80 border border-[#ffd23a] text-[#ffd23a] px-2">Send</button>
      <button type="button" className="bg-black/80 border border-white/40 text-white px-2" onClick={() => engine.closeUI()}>Close</button>
    </form>
  );
}

export function PylonPanel() {
  const pylons = engine.world.pylons;
  useGame();
  return (
    <Panel title="Pylon Network" onClose={() => engine.closeUI()}>
      <div className="text-[11px] text-white/60 mb-3">Global fast-travel. Place more Pylon blocks anywhere to extend the network.</div>
      <div className="relative h-40 mb-4 border-2 border-[#3a3048] bg-[radial-gradient(circle,#2a1a40,#0a0810)] overflow-hidden">
        {/* unrolled cylinder map */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
        {pylons.map((p, i) => (
          <button
            key={i}
            onClick={() => engine.teleport(p)}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#c87aff] border-2 border-white shadow-[0_0_12px_#c87aff] hover:scale-150 transition-transform"
            style={{ left: `${(p.x / N) * 100}%`, top: `${(p.z / L) * 100}%` }}
            title={p.name}
          />
        ))}
        <div className="absolute left-2 bottom-1 text-[10px] text-white/40">0°</div>
        <div className="absolute right-2 bottom-1 text-[10px] text-white/40">360°</div>
      </div>
      <div className="space-y-1">
        {pylons.map((p, i) => (
          <button key={i} onClick={() => engine.teleport(p)} className="w-full text-left px-3 py-2 border-2 border-[#3a3048] hover:border-[#c87aff] hover:bg-[#c87aff]/10 flex justify-between">
            <span>✦ {p.name}</span>
            <span className="text-white/40 text-xs">
              θ {((p.x / N) * 360).toFixed(0)}° · z {p.z}
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

export function RunePanel() {
  const s = useGame();
  const [pick, setPick] = useState<RuneId>("swift");
  return (
    <Panel title="Runic Grid · Gold Armor" onClose={() => engine.closeUI()}>
      <div className="text-[11px] text-white/60 mb-3">
        Inscribe runes onto your gold chestplate. Adjacent identical runes link and resonate (+50%). Energy drains per active rune — refuel with a Blood Bucket (right-click). Swords recharge runes on kills, except skeletons.
      </div>
      <div className="flex flex-col sm:flex-row gap-6">
        <div>
          <div className="grid grid-cols-5 gap-1 p-2 bg-[#2a2210] border-4 border-[#c8a030] shadow-[inset_0_0_20px_#000]">
            {s.runes.map((r, i) => {
              const def = RUNES.find((x) => x.id === r);
              const x = i % 5, y = Math.floor(i / 5);
              const linkR = r && x < 4 && s.runes[i + 1] === r;
              const linkD = r && y < 4 && s.runes[i + 5] === r;
              return (
                <button
                  key={i}
                  onClick={() => engine.setRune(i, r === pick ? null : pick)}
                  className="relative w-12 h-12 sm:w-14 sm:h-14 bg-[#1a1408] border-2 border-[#5a4818] hover:border-[#ffd23a] text-3xl flex items-center justify-center"
                  style={{ color: def?.color, textShadow: def ? `0 0 10px ${def.color}` : undefined }}
                >
                  {def?.glyph}
                  {linkR && <span className="absolute -right-[7px] top-1/2 w-3 h-1 -translate-y-1/2 z-10" style={{ background: def?.color, boxShadow: `0 0 6px ${def?.color}` }} />}
                  {linkD && <span className="absolute -bottom-[7px] left-1/2 h-3 w-1 -translate-x-1/2 z-10" style={{ background: def?.color, boxShadow: `0 0 6px ${def?.color}` }} />}
                </button>
              );
            })}
          </div>
          <div className="mt-3 h-3 bg-black border border-[#ff7ad1]/40">
            <div className="h-full bg-gradient-to-r from-[#8a0b14] to-[#ff7ad1]" style={{ width: `${s.runeEnergy}%` }} />
          </div>
          <div className="text-xs text-white/60 mt-1">Runic energy: {s.runeEnergy.toFixed(1)}%</div>
        </div>
        <div className="flex-1 space-y-1">
          {RUNES.map((r) => (
            <button
              key={r.id}
              onClick={() => setPick(r.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 border-2 ${pick === r.id ? "border-[#ffd23a] bg-[#ffd23a]/10" : "border-[#3a3048]"}`}
            >
              <span className="text-2xl w-8" style={{ color: r.color, textShadow: `0 0 8px ${r.color}` }}>
                {r.glyph}
              </span>
              <span className="text-left">
                <div>{r.name} <span className="text-white/40 text-xs">lvl {engine.runeLevel(r.id).toFixed(1)}</span></div>
                <div className="text-xs text-white/50">{r.desc}</div>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export function DeathPanel() {
  const s = useGame();
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#2a0004]/85 font-mono text-white">
      <div className="text-5xl tracking-[0.4em] text-[#ff3040] [text-shadow:4px_4px_0_#000]">YOU DIED</div>
      <div className="mt-4 text-sm text-white/70 max-w-md text-center">
        Your physical damage map has been cached. The next moth will carry the scars
        {Object.values(s.scars).some((v) => v === 2) ? " — including missing-eye textures" : ""}.
      </div>
      <div className="mt-2 text-xs text-white/50">Deaths this world: {s.deaths}</div>
      <button onClick={() => engine.respawn()} className="mt-8 px-8 py-3 border-4 border-white hover:bg-white hover:text-black tracking-[0.3em]">
        RESPAWN
      </button>
    </div>
  );
}

export function HelpPanel() {
  const rows: [string, string][] = [
    ["WASD / Mouse", "steer / look (gravity points outward to the iron shell)"],
    ["Space", "jump / flutter inside · thrust inward in the void"],
    ["Ctrl / Shift", "sprint / sneak · Shift thrusts outward in the void"],
    ["Outside crust", "WASD steers with your look pitch; momentum persists in zero gravity"],
    ["Left mouse", "mine (hold) / attack · swat flying debris to charge it"],
    ["Right mouse", "place · interact · eat · drink · fill bucket"],
    ["1–9 / Wheel", "hotbar"],
    ["E", "inventory (auto multi-vector sort)"],
    ["C", "chisel sub-voxel tools (or right-click Chisel Bench)"],
    ["R", "runic grid (needs gold armor)"],
    ["T / Enter", "chat — try 'hey', 'recipes', 'nyc', '/help'"],
    ["V", "third-person moth view"],
    ["G / F", "toggle creative mode / creative flight"],
    ["M / WORLD", "weather map, boss guide, fortification workshop"],
    ["X", "dismount THE FORG"],
  ];
  return (
    <Panel title="Field Manual" onClose={() => engine.closeUI()} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
        <div className="space-y-1">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <span className="w-28 shrink-0 text-[#ffd23a]">{k}</span>
              <span className="text-white/75">{v}</span>
            </div>
          ))}
        </div>
        <div className="text-white/70 text-xs space-y-2 leading-relaxed">
          <p><b className="text-white">World.</b> The cylinder is {N} shell units around (a wider diameter than before), {L} blocks long and {H} layers deep. A single aligned radial lattice keeps structures continuous across height layers, and detailed chunks fade into the horizon LOD. {BIOME_NAMES.length} biomes and the mountain ranges remain.</p>
          <p><b className="text-white">Climate and erosion.</b> Temperature and moisture each come from a slow macro band plus a small local map, with mountains adding altitude cooling and rain shadow, so scorched ground never borders glaciers. A light hydraulic erosion pass then runs droplets over the height field, cutting valleys and depositing sediment in basins.</p>
          <p><b className="text-white">Day and night.</b> The sun never switches off. Four large procedural sky islands orbit the axis once every 32 minutes between the cloud ring and the sun; when one passes between you and the sun its shadow sweeps the ring and brings night. Each island is its own biome (Verdant Terrace, Emberglass Drift, Frostpetal Shelf, Sporebloom Reach), is solid enough to land on, and carries you along its orbit while you stand on it. They are decorative terrain, not editable voxels.</p>
          <p><b className="text-white">Weather.</b> Rain fronts drift across the whole world; cold biomes get snow. About every 45 real session minutes the sun blacks out and three 400-block wave crests travel through the cylinder. Tornado outbreaks occur every 80 minutes, with locations and paths independent of you. They damage off-screen builds too. Reinforced iron and obsidian withstand them; masonry is tougher than wood and glass. Open WORLD to see storm locations and timers. Creative mode offers previews at a selected map location.</p>
          <p><b className="text-white">Caves.</b> Six strata descend from the surface: Upper Rootways, Luminous Mycelium, Basalt Vaults, Amethyst Hollows, Magma Veins and the Ironroot Deep (obsidian, sapphire crystal and a lava sea at the shell). Chambers widen the deeper you go.</p>
          <p><b className="text-white">The void.</b> Rupture the iron crust and push past its outer face. Beyond is open, gravity-free space: Space/Shift thrust inward and outward, WASD steers, and momentum carries you through the cloud-dark void. No outer shell or anchor moons are present.</p>
          <p><b className="text-white">Sky bridges.</b> Static island chains still fill the gap to the sun. Wyrms are now calm drifters that only retaliate if you attack them; cloud serpents, sky squirrels and gravity-manipulating geometric watchers remain hostile.</p>
          <p><b className="text-white">Body.</b> Each limb has its own HP. Lost limbs are gone for the run: lose an eye and half your screen goes dark; lose both legs and you roll prone. Hard falls crush you flat. Deaths leave scars on the next avatar.</p>
          <p><b className="text-white">Survival.</b> Hunger and thirst drain over days. Raw meat poisons — sear it on magma. Sleep in a bed to knit limbs (and spin a rock).</p>
          <p><b className="text-white">Camp.</b> Near spawn: Pylon, Bed, Toilet, Chisel Bench, steam pool (water over magma), a crank→wire→piston rig, a blood font, and the Obelisk Seal that awakens OBIL.</p>
          <p><b className="text-white">Encounters.</b> The camp seal unlocks OBIL, the Warper, the Scruncle, the Farbreaker, the Moonholder and the Dimensional Core. The Moonholder calls down stone strikes without adding moons. WORLD includes fight tips and Creative summons. Alternate-dimension topology changes, the Solar Battle and the Black Hole Era are not implemented.</p>
          <p><b className="text-white">Restored fauna.</b> Land animals, cod, salmon, owls, dogs, cats and mice inhabit the ring. Tame dogs with bones, cats with fish, and owls with mice. Bone Thieves and Doom Walkers join the existing hostiles. Round Golem Cores and Conduit Arrays can be assembled in WORLD's workshop.</p>
          <p><b className="text-white">Mobile.</b> CREATIVE switches modes and enables flight. FLIGHT toggles walking/flying; hold JUMP to ascend or DOWN to descend. BAG includes a searchable Creative block catalog. Weather and damage continue while panels are open and catch up after a backgrounded tab resumes. World saving and offline simulation after closing the app are not provided.</p>
        </div>
      </div>
    </Panel>
  );
}
