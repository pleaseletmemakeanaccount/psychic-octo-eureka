import { useEffect, useState } from "react";
import { engine } from "../game/engine";
import { LIMB_MAX, LIMB_NAMES, stackName, store, type LimbKey } from "../game/state";
import { ItemIcon, useGame } from "./common";

function limbColor(hp: number, max: number, lost: boolean) {
  if (lost) return "#111";
  const r = hp / max;
  if (r > 0.66) return "#5fd35f";
  if (r > 0.33) return "#f2c94c";
  return "#eb5757";
}

function BodyDiagram() {
  const s = useGame();
  const L = s.limbs;
  const c = (k: LimbKey) => limbColor(L[k].hp, LIMB_MAX[k], L[k].lost);
  const scar = (k: LimbKey) => s.scars[k];
  const X = ({ x, y, k }: { x: number; y: number; k: LimbKey }) =>
    L[k].lost ? (
      <g stroke="#ff3030" strokeWidth={2}>
        <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} />
        <line x1={x + 5} y1={y - 5} x2={x - 5} y2={y + 5} />
      </g>
    ) : scar(k) ? (
      <line x1={x - 4} y1={y - 3} x2={x + 4} y2={y + 3} stroke="#ff9ab8" strokeWidth={1.5} strokeDasharray="2 1" />
    ) : null;
  return (
    <div className="ernas-body-hud bg-black/55 border-2 border-white/10 p-2 pointer-events-auto">
      <svg width={120} height={130} viewBox="0 0 120 130" style={{ imageRendering: "pixelated" }}>
        {/* wings */}
        <path d="M54 44 L12 18 L6 52 L30 70 L54 60 Z" fill={c("lwing")} opacity={0.85} stroke="#000" />
        <path d="M66 44 L108 18 L114 52 L90 70 L66 60 Z" fill={c("rwing")} opacity={0.85} stroke="#000" />
        {/* torso */}
        <rect x={48} y={38} width={24} height={40} fill={c("torso")} stroke="#000" />
        {/* head */}
        <rect x={47} y={14} width={26} height={22} fill={c("head")} stroke="#000" />
        <rect x={49} y={19} width={9} height={10} fill={c("leye")} stroke="#000" />
        <rect x={62} y={19} width={9} height={10} fill={c("reye")} stroke="#000" />
        <line x1={54} y1={14} x2={46} y2={3} stroke="#aaa" />
        <line x1={66} y1={14} x2={74} y2={3} stroke="#aaa" />
        {/* legs */}
        <rect x={49} y={80} width={9} height={38} fill={c("lleg")} stroke="#000" />
        <rect x={62} y={80} width={9} height={38} fill={c("rleg")} stroke="#000" />
        <X x={30} y={42} k="lwing" />
        <X x={90} y={42} k="rwing" />
        <X x={60} y={58} k="torso" />
        <X x={60} y={16} k="head" />
        <X x={53} y={24} k="leye" />
        <X x={67} y={24} k="reye" />
        <X x={53} y={100} k="lleg" />
        <X x={67} y={100} k="rleg" />
        {s.crushed > 0 && (
          <text x={60} y={128} textAnchor="middle" fontSize={9} fill="#ff8040" fontFamily="monospace">
            CRUSHED
          </text>
        )}
      </svg>
      <div className="grid grid-cols-2 gap-x-2 text-[9px] font-mono text-white/80 leading-tight">
        {(Object.keys(L) as LimbKey[]).map((k) => (
          <div key={k} className="flex justify-between">
            <span style={{ color: L[k].lost ? "#f55" : undefined }}>{LIMB_NAMES[k]}</span>
            <span>{L[k].lost ? "LOST" : Math.ceil(L[k].hp)}</span>
          </div>
        ))}
      </div>
      {s.deaths > 0 && <div className="text-[9px] text-pink-300/80 font-mono mt-1">deaths: {s.deaths} · scars carried</div>}
    </div>
  );
}

function Bar({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-mono text-white">
      <span className="w-4 text-center">{icon}</span>
      <div className="w-28 h-2.5 bg-black/70 border border-white/20">
        <div className="h-full transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
      <span className="opacity-60 w-12">{label}</span>
    </div>
  );
}

export function HUD() {
  const s = useGame();
  const [now, setNow] = useState(performance.now());
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const i = setInterval(() => setNow(performance.now()), 250);
    const f = () => setLocked(!!document.pointerLockElement);
    document.addEventListener("pointerlockchange", f);
    return () => {
      clearInterval(i);
      document.removeEventListener("pointerlockchange", f);
    };
  }, []);
  const L = s.limbs;
  const hour = Math.floor(((s.time * 24 + 6) % 24));
  const min = Math.floor(((s.time * 24 * 60) % 60));
  const held = s.inventory[s.selected];
  const chatVisible = s.chat.filter((m) => now - m.t < 9000).slice(-7);
  const prone = L.lleg.lost && L.rleg.lost;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10">
      {/* Eye occlusion — permanent 50% blackout */}
      {L.leye.lost && <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-black" />}
      {L.reye.lost && <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-black" />}
      {/* respawn scarring — cosmetic */}
      {!L.leye.lost && s.scars.leye === 2 && <div className="absolute left-0 top-0 bottom-0 w-1/3" style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.55), transparent)" }} />}
      {!L.reye.lost && s.scars.reye === 2 && <div className="absolute right-0 top-0 bottom-0 w-1/3" style={{ background: "linear-gradient(270deg, rgba(0,0,0,0.55), transparent)" }} />}
      {s.poison > 0 && <div className="absolute inset-0 animate-pulse" style={{ background: "radial-gradient(circle, transparent 40%, rgba(80,200,40,0.35))" }} />}
      {s.radiation > 0 && <div className="absolute inset-0" style={{ background: "radial-gradient(circle, transparent 30%, rgba(160,255,60,0.22))", mixBlendMode: "screen" }} />}
      {s.crushed > 0 && (
        <>
          <div className="absolute left-0 right-0 top-0 h-[22%] bg-black/80" />
          <div className="absolute left-0 right-0 bottom-0 h-[22%] bg-black/80" />
        </>
      )}
      {s.aurora && <div className="absolute inset-x-0 top-0 h-24" style={{ background: "linear-gradient(180deg, rgba(60,255,160,0.12), transparent)" }} />}
      {s.submerged && <div className="absolute inset-0 bg-[#0b3454]/45" />}

      {/* crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w-5 h-5 relative mix-blend-difference">
          <div className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 bg-white" />
          <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-white" />
        </div>
        {s.mining > 0 && (
          <svg className="absolute -left-3 -top-3" width={44} height={44}>
            <circle cx={22} cy={22} r={16} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={4} />
            <circle cx={22} cy={22} r={16} fill="none" stroke="#ffd23a" strokeWidth={4} strokeDasharray={`${s.mining * 100.5} 200`} transform="rotate(-90 22 22)" />
          </svg>
        )}
      </div>
      {s.lookingAt && <div className="absolute left-1/2 top-[54%] -translate-x-1/2 text-xs font-mono text-white/80 [text-shadow:1px_1px_0_#000]">{s.lookingAt}</div>}

      {/* top-left info */}
      <div className="absolute left-3 top-3 font-mono text-[11px] text-white [text-shadow:1px_1px_0_#000] space-y-0.5 ernas-top-info">
        <div className="text-[#ffd23a] tracking-[0.3em] text-sm">ERNAS</div>
        <div>Day {s.day} · {String(hour).padStart(2, "0")}:{String(min).padStart(2, "0")} {s.lowLight ? "Island shadow" : "Sunlit"} {Math.round(s.skyLight * 100)}%</div>
        <div className={s.eclipse ? "text-[#94beff]" : "text-white/80"}>{s.weatherLabel}</div>
        {!engine.touchDevice && <button className="pointer-events-auto border border-white/30 bg-black/45 px-2 py-1" onClick={() => engine.openUI("world")}>WORLD / M</button>}
        <div className="ernas-biome">{s.biome}</div>
        <div className="opacity-70 ernas-coordinates">{s.coords}</div>
        <div className="opacity-70 ernas-perf">
          {s.mode.toUpperCase()} · {s.fps} fps {s.peers > 0 ? `· LAN peers: ${s.peers}` : ""}
        </div>
        {prone && <div className="text-orange-300">PRONE — rolling</div>}
        {s.inVoid && <div className="text-purple-300">You drift in the volumetric void...</div>}
        {s.mounted && <div className="text-green-300">Riding THE FORG (X to dismount)</div>}
      </div>

      {/* boss bar */}
      {s.boss && (
        <div className="ernas-boss-bar absolute top-4 left-1/2 -translate-x-1/2 w-[480px] max-w-[70vw] text-center font-mono">
          <div className="text-sm tracking-[0.3em] text-[#ff4a6a] [text-shadow:2px_2px_0_#000]">{s.boss.name}</div>
          <div className="h-3 mt-1 bg-black/70 border-2 border-[#ff4a6a]/60">
            <div className="h-full bg-gradient-to-r from-[#8a0b14] to-[#ff4a6a] transition-[width]" style={{ width: `${(s.boss.hp / s.boss.max) * 100}%` }} />
          </div>
        </div>
      )}

      {/* toast */}
      {s.toast && now - s.toast.t < 6500 && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-black/80 border-2 border-[#ffd23a] px-5 py-3 font-mono text-center max-w-[560px] animate-[fadein_.3s_ease]">
          <div className="text-[#ffd23a] tracking-widest">{s.toast.title}</div>
          <div className="text-white/80 text-xs mt-1">{s.toast.sub}</div>
        </div>
      )}

      {/* right: body diagram + bars */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2 ernas-status-panel">
        <BodyDiagram />
        <div className="bg-black/55 border-2 border-white/10 p-2 space-y-1">
          <Bar label="hunger" value={s.hunger} color="#d9822b" icon="🍖" />
          <Bar label="thirst" value={s.thirst} color="#2f80ed" icon="💧" />
          <Bar label="flight" value={s.flight} color="#bb6bd9" icon="🦋" />
          {s.armorGold && <Bar label="runes" value={s.runeEnergy} color="#ff7ad1" icon="ᛋ" />}
          {s.poison > 0 && <div className="text-[10px] text-green-400 font-mono">☠ POISONED {Math.ceil(s.poison)}s</div>}
          {s.radiation > 0 && <div className="text-[10px] text-lime-300 font-mono">☢ RADIATION x{s.radiation}</div>}
        </div>
      </div>

      {/* chat feed */}
      <div className="ernas-chat-feed absolute left-3 bottom-28 w-[460px] max-w-[60vw] font-mono text-[12px] space-y-0.5">
        {(s.ui === "chat" ? s.chat.slice(-14) : chatVisible).map((m, i) => (
          <div key={i} className="bg-black/45 px-2 py-0.5 [text-shadow:1px_1px_0_#000]" style={{ color: m.color ?? "#fff" }}>
            {m.from && <span className="opacity-70">&lt;{m.from}&gt; </span>}
            {m.text}
          </div>
        ))}
      </div>

      {/* hotbar */}
      <div className="ernas-hotbar absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-auto">
        {held && <div className="text-xs font-mono text-white [text-shadow:1px_1px_0_#000]">{stackName(held)}</div>}
        <div className="flex gap-1 bg-black/50 p-1 border-2 border-white/10">
          {s.inventory.slice(0, 9).map((st, i) => (
            <button
              key={i}
              className={`ernas-hotbar-slot w-12 h-12 flex items-center justify-center border-2 ${i === s.selected ? "border-white bg-white/15" : "border-white/15 bg-black/30"}`}
              onClick={() => { store.s.selected = i; store.bump(); }}
              aria-label={`Select slot ${i + 1}${st ? `: ${stackName(st)}` : ""}`}
            >
              <ItemIcon stack={st} size={40} />
            </button>
          ))}
        </div>
      </div>

      {/* held item swing */}
      {held && s.ui === "none" && (
        <div className={`ernas-held-item absolute right-[12%] bottom-6 opacity-90 ${engine.mouseL ? "animate-[swing_.35s_ease-in-out_infinite]" : ""}`} style={{ transform: "rotate(-15deg)" }}>
          <ItemIcon stack={{ ...held, count: 1 } as typeof held} size={110} />
        </div>
      )}

      {s.ui === "none" && !locked && !engine.touchDevice && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/70 border-2 border-white/20 px-6 py-4 font-mono text-white text-center">
            <div className="tracking-[0.3em] text-[#ffd23a]">CLICK TO PLAY</div>
            <div className="text-xs opacity-70 mt-1">WASD move · Space jump/flutter · Mouse mine/place · E inventory · H help</div>
          </div>
        </div>
      )}
    </div>
  );
}
