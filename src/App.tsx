import { useEffect, useRef, useState } from "react";
import { engine } from "./game/engine";
import { store } from "./game/state";
import { ChiselPanel } from "./ui/Chisel";
import { useGame } from "./ui/common";
import { HUD } from "./ui/HUD";
import { Menu } from "./ui/Menu";
import { MobileControls } from "./ui/MobileControls";
import { ChatInput, DeathPanel, HelpPanel, InventoryPanel, PylonPanel, RunePanel } from "./ui/Panels";
import { SleepPanel } from "./ui/Sleep";
import { WorldPanel } from "./ui/WorldPanel";
import { BIOME_NAMES, H, L, N } from "./game/world";
import { safeStorage } from "./safe-storage";

let initialized = false;

export default function App() {
  const mount = useRef<HTMLDivElement>(null);
  const s = useGame();
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialized || !mount.current) return;
    initialized = true;
    engine.init(mount.current);
    store.s.achievement = safeStorage.getItem("ernas_achievement") === "1";
    store.s.aurora = safeStorage.getItem("ernas_aurora") === "1";
  }, []);

  const start = async () => {
    if (store.s.phase === "loading") return;
    setError("");
    store.s.phase = "loading";
    store.bump();
    await new Promise((r) => setTimeout(r, 30));
    let lastBump = 0;
    try {
      await engine.generate((f, label) => {
      store.s.loadProgress = f;
      store.s.loadLabel = label;
      const now = performance.now();
      if (now - lastBump > 80 || f >= 1) {
        lastBump = now;
        store.bump();
      }
      });
      store.s.phase = "playing";
      store.bump();
      engine.start();
      engine.lock();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "World generation failed.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none">
      <div ref={mount} className="absolute inset-0" />
      {s.phase === "menu" && <Menu onStart={start} />}
      {s.phase === "loading" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black font-mono text-white">
          <div className="tracking-[0.2em] text-center text-[#ffd23a] animate-pulse">{error ? "WORLD COULD NOT START" : "FOLDING THE INVERTED CYLINDER..."}</div>
          <div className="w-[420px] max-w-[80vw] h-3 mt-5 bg-white/10 border border-white/20">
            <div className="h-full bg-gradient-to-r from-[#8a3cff] to-[#ffd23a] transition-[width] duration-100" style={{ width: `${Math.round(s.loadProgress * 100)}%` }} />
          </div>
          <div className="text-xs text-white/50 mt-2">{s.loadLabel || "preparing"} · {Math.round(s.loadProgress * 100)}%</div>
          <div className="text-[10px] text-white/40 text-center mt-4">{L} long / {N} around / {H} layers / {BIOME_NAMES.length} biomes / eroded valleys / 4 orbiting sky islands</div>
          {error && <div className="mt-4 max-w-md text-center text-sm"><p role="alert" className="text-red-300">{error}</p><button className="mt-3 border px-4 py-2" onClick={() => window.location.reload()}>Reload</button></div>}
        </div>
      )}
      {s.phase === "playing" && (
        <>
          <HUD />
          <MobileControls />
          {s.ui === "inventory" && <InventoryPanel />}
          {s.ui === "chat" && <ChatInput />}
          {s.ui === "pylon" && <PylonPanel />}
          {s.ui === "runes" && <RunePanel />}
          {s.ui === "chisel" && <ChiselPanel />}
          {s.ui === "sleep" && <SleepPanel />}
          {s.ui === "death" && <DeathPanel />}
          {s.ui === "help" && <HelpPanel />}
          {s.ui === "world" && <WorldPanel />}
        </>
      )}
    </div>
  );
}
