import { useMemo, useRef, useState } from "react";
import { B, BLOCKS, type ToolKind } from "../game/blocks";
import { CHISEL_MATERIALS, engine } from "../game/engine";
import { countItem } from "../game/state";
import { blockIcon } from "../game/textures";
import { Panel, useGame } from "./common";

const T = (rows: string[]) => rows.map((r) => r.split("").map((c) => c === "#"));
export const TEMPLATES: Record<ToolKind, boolean[][]> = {
  sword: T(["......##", ".....###", "....###.", "#..###..", ".####...", "..##....", ".##.#...", "##......"]),
  pickaxe: T([".######.", "##..#.##", "#...#..#", "....#...", "....#...", "....#...", "....#...", "....#..."]),
  axe: T([".###....", "#####...", "######..", ".####...", "...##...", "....#...", "....#...", "....#..."]),
  shovel: T(["..###...", "..###...", "..###...", "...#....", "...#....", "...#....", "...#....", "..###..."]),
  chestplate: T(["##....##", "###..###", "########", ".######.", ".######.", ".######.", ".######.", "..####.."]),
};
const SUB = 8; // 1/8th sub-voxel partitions

function iou(grid: boolean[][], t: boolean[][]) {
  let inter = 0, uni = 0;
  for (let y = 0; y < SUB; y++)
    for (let x = 0; x < SUB; x++) {
      if (grid[y][x] && t[y][x]) inter++;
      if (grid[y][x] || t[y][x]) uni++;
    }
  return uni ? inter / uni : 0;
}

export function ChiselPanel() {
  const s = useGame();
  const available = CHISEL_MATERIALS.filter((m) => s.mode === "creative" || countItem(s, (st) => st.kind === "block" && st.id === m) > 0);
  const heldSt = s.inventory[s.selected];
  const initial = heldSt?.kind === "block" && CHISEL_MATERIALS.includes(heldSt.id) ? heldSt.id : available[0] ?? B.COBBLE;
  const [material, setMaterial] = useState<number>(initial);
  const [grid, setGrid] = useState<boolean[][]>(() => Array.from({ length: SUB }, () => new Array(SUB).fill(true)));
  const [target, setTarget] = useState<ToolKind>("pickaxe");
  const [guide, setGuide] = useState(true);
  const [restore, setRestore] = useState(false);
  const dragging = useRef<null | boolean>(null);
  const [chips, setChips] = useState<{ id: number; x: number; y: number }[]>([]);

  const scores = useMemo(() => (Object.keys(TEMPLATES) as ToolKind[]).map((k) => ({ k, v: iou(grid, TEMPLATES[k]) })).sort((a, b) => b.v - a.v), [grid]);
  const targetScore = iou(grid, TEMPLATES[target]);
  const has = s.mode === "creative" || available.includes(material);

  const chisel = (x: number, y: number, val: boolean) => {
    if (grid[y][x] === val) return;
    setGrid((current) => { const g = current.map((r) => r.slice()); g[y][x] = val; return g; });
    if (!val) {
      const id = Math.random();
      setChips((c) => [...c.slice(-10), { id, x, y }]);
      setTimeout(() => setChips((c) => c.filter((q) => q.id !== id)), 500);
    }
  };

  const tex = blockIcon(material);
  return (
    <Panel title="Sub-Voxel Chisel" onClose={() => engine.closeUI()} wide>
      <div className="text-[11px] text-white/60 mb-3">
        Chisel 1/8th sub-voxels to shape a tool. Accuracy determines quality. Drag to chisel; choose RESTORE to put a voxel back. Right-drag also restores on desktop.
      </div>
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="shrink-0">
          <div
            className="relative grid select-none"
            style={{ gridTemplateColumns: `repeat(${SUB}, 1fr)`, background: "#0b0910", border: "4px solid #3a3048", width: "min(352px, 82vw)", touchAction: "none" }}
            onPointerDown={(e) => {
              e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
              dragging.current = e.button === 2 || restore;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = Math.max(0, Math.min(7, Math.floor((e.clientX - rect.left) / rect.width * 8)));
              const y = Math.max(0, Math.min(7, Math.floor((e.clientY - rect.top) / rect.height * 8)));
              chisel(x, y, dragging.current);
            }}
            onPointerMove={(e) => {
              if (dragging.current === null) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = Math.floor((e.clientX - rect.left) / rect.width * 8), y = Math.floor((e.clientY - rect.top) / rect.height * 8);
              if (x >= 0 && x < 8 && y >= 0 && y < 8) chisel(x, y, dragging.current);
            }}
            onPointerUp={() => (dragging.current = null)}
            onPointerCancel={() => (dragging.current = null)}
            onLostPointerCapture={() => (dragging.current = null)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {grid.map((row, y) =>
              row.map((on, x) => {
                const tg = TEMPLATES[target][y][x];
                return (
                  <div
                    key={`${x},${y}`}
                    className="aspect-square relative cursor-crosshair"
                    style={{
                      backgroundImage: on ? `url(${tex})` : undefined,
                      backgroundSize: "352px 352px",
                      backgroundPosition: `${-x * 44}px ${-y * 44}px`,
                      imageRendering: "pixelated",
                      boxShadow: on ? "inset -3px -3px 0 rgba(0,0,0,0.35), inset 3px 3px 0 rgba(255,255,255,0.18)" : "inset 0 0 0 1px #1a1622",
                    }}
                  >
                    {guide && tg && <div className={`absolute inset-1 border-2 border-dashed ${on ? "border-[#ffd23a]/60" : "border-[#ffd23a]/35"}`} />}
                    {guide && !tg && on && <div className="absolute inset-0 bg-red-500/20" />}
                  </div>
                );
              })
            )}
            {chips.map((c) => (
              <span key={c.id} className="absolute w-2 h-2 pointer-events-none animate-ping" style={{ left: c.x * 44 + 18, top: c.y * 44 + 18, background: BLOCKS[material]?.color }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="px-3 py-2 border-2 border-[#5a4a6a] text-sm" aria-pressed={restore} onClick={() => setRestore(!restore)}>{restore ? "RESTORE" : "CHISEL"}</button>
            <button className="px-3 py-1 border-2 border-[#5a4a6a] hover:bg-[#3a3048] text-sm" onClick={() => setGrid(Array.from({ length: SUB }, () => new Array(SUB).fill(true)))}>
              New block
            </button>
            <button className="px-3 py-1 border-2 border-[#5a4a6a] hover:bg-[#3a3048] text-sm" onClick={() => setGuide(!guide)}>
              Guide: {guide ? "on" : "off"}
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-4 text-sm">
          <div>
            <div className="text-white/50 text-xs mb-1">RAW MATERIAL</div>
            <div className="flex flex-wrap gap-1">
              {CHISEL_MATERIALS.map((m) => {
                const n = countItem(s, (st) => st.kind === "block" && st.id === m);
                const ok = s.mode === "creative" || n > 0;
                return (
                  <button key={m} disabled={!ok} onClick={() => setMaterial(m)} className={`p-1 border-2 ${material === m ? "border-[#ffd23a]" : "border-[#3a3048]"} ${ok ? "" : "opacity-25"}`} title={`${BLOCKS[m].name} (${n})`}>
                    <img src={blockIcon(m)} className="w-8 h-8" style={{ imageRendering: "pixelated" }} alt="" />
                  </button>
                );
              })}
            </div>
            <div className="text-xs mt-1 text-white/60">{BLOCKS[material]?.name}{material === B.GOLD_ORE ? " — magic conduit (runes)" : ""}</div>
          </div>
          <div>
            <div className="text-white/50 text-xs mb-1">TARGET PROFILE</div>
            <div className="grid grid-cols-5 gap-1">
              {(Object.keys(TEMPLATES) as ToolKind[]).map((k) => (
                <button key={k} onClick={() => setTarget(k)} className={`p-1 border-2 ${target === k ? "border-[#ffd23a]" : "border-[#3a3048]"}`}>
                  <div className="grid grid-cols-8 w-12 h-12 mx-auto">
                    {TEMPLATES[k].flat().map((on, i) => (
                      <div key={i} style={{ background: on ? "#d8d0e8" : "transparent" }} />
                    ))}
                  </div>
                  <div className="text-[10px] mt-1 capitalize">{k}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-white/50 text-xs mb-1">SILHOUETTE MATCH</div>
            {scores.map(({ k, v }) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-20 capitalize">{k}</span>
                <div className="flex-1 h-2 bg-black">
                  <div className="h-full" style={{ width: `${v * 100}%`, background: k === target ? "#ffd23a" : "#6a5a7a" }} />
                </div>
                <span className="w-10 text-right">{Math.round(v * 100)}%</span>
              </div>
            ))}
          </div>
          <button
            disabled={!has || targetScore < 0.45}
            onClick={() => {
              if (engine.craftTool(target, material, targetScore)) setGrid(Array.from({ length: SUB }, () => new Array(SUB).fill(true)));
            }}
            className="w-full py-3 border-4 border-[#ffd23a] text-[#ffd23a] tracking-[0.25em] hover:bg-[#ffd23a] hover:text-black disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#ffd23a]"
          >
            COMMIT {target.toUpperCase()} · {Math.round(targetScore * 100)}%
          </button>
          {targetScore < 0.45 && <div className="text-xs text-white/40 -mt-2">Chisel closer to the profile (≥45%) to commit.</div>}
        </div>
      </div>
    </Panel>
  );
}
