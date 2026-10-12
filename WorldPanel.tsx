import { useEffect, useRef, useState } from "react";
import { B, BLOCKS } from "../game/blocks";
import { BOSS_ORDER, BOSS_TIPS } from "../game/bosses";
import { engine } from "../game/engine";
import { addItem, countItem, removeItem, store } from "../game/state";
import { L, N } from "../game/world";
import { Panel, useGame } from "./common";

function duration(seconds: number) {
  const n = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

export function WorldPanel() {
  const s = useGame();
  const [tab, setTab] = useState<"weather" | "encounters" | "workshop">("weather");
  const [selected, setSelected] = useState({ x: engine.world.spawn.x, z: engine.world.spawn.z });
  const canvas = useRef<HTMLCanvasElement>(null);
  const background = useRef<HTMLCanvasElement | null>(null);
  const model = engine.weather.model;
  const tick = Math.floor(s.worldSeconds * 4);

  useEffect(() => {
    const c = document.createElement("canvas"); c.width = 768; c.height = 480;
    const ctx = c.getContext("2d")!;
    for (let x = 0; x < c.width; x += 4) for (let z = 0; z < c.height; z += 4) {
      ctx.fillStyle = `#${engine.biomeColor(engine.world.biomeAt(x / c.width * N, z / c.height * L)).getHexString()}`;
      ctx.fillRect(x, z, 4, 4);
    }
    background.current = c;
  }, []);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !background.current) return;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(background.current, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, c.width, c.height);
    for (const front of model.fronts) {
      ctx.fillStyle = "rgba(163,193,218,0.32)"; ctx.strokeStyle = "#b4d4ee";
      for (const wrap of [-N, 0, N]) {
        ctx.beginPath(); ctx.ellipse((front.x + wrap) / N * c.width, front.z / L * c.height, front.rx / N * c.width, front.rz / L * c.height, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    for (const center of model.waveCenters()) {
      ctx.fillStyle = "rgba(93,165,239,0.65)";
      ctx.fillRect(0, (center - 25) / L * c.height, c.width, 50 / L * c.height);
    }
    for (const storm of model.tornadoes) {
      ctx.strokeStyle = "#ff7059"; ctx.lineWidth = 2;
      const x = storm.x / N * c.width, z = storm.z / L * c.height;
      ctx.beginPath(); ctx.moveTo(x - 6, z - 6); ctx.lineTo(x + 6, z + 6); ctx.moveTo(x + 6, z - 6); ctx.lineTo(x - 6, z + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, z); ctx.lineTo(x + Math.sin(storm.heading) * 25, z + Math.cos(storm.heading) * 25); ctx.stroke();
    }
    for (const p of engine.world.pylons) {
      ctx.fillStyle = "#c493ff"; ctx.fillRect(p.x / N * c.width - 3, p.z / L * c.height - 3, 6, 6);
    }
    ctx.fillStyle = "#ffd23a";
    ctx.beginPath(); ctx.arc(engine.pos.x / N * c.width, engine.pos.z / L * c.height, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.strokeRect(selected.x / N * c.width - 7, selected.z / L * c.height - 7, 14, 14);
  }, [tick, tab, selected, model]);

  const craft = (id: number, amount: number, costs: [number, number][]) => {
    if (s.mode !== "creative" && costs.some(([b, count]) => countItem(s, (st) => st.kind === "block" && st.id === b) < count)) {
      store.say("Not enough raw material for this mechanism.", "#ffc58b"); return;
    }
    if (!s.inventory.some((st) => !st || st.kind === "block" && st.id === id && st.count + amount <= 64)) { store.say("Make room in your inventory first.", "#ffc58b"); return; }
    if (s.mode !== "creative") costs.forEach(([b, n]) => removeItem(s, (st) => st.kind === "block" && st.id === b, n));
    addItem(s, { kind: "block", id, count: amount }); store.say(`Made ${amount} ${BLOCKS[id].name}.`, "#accfb2");
  };
  return (
    <Panel title="World Atlas" onClose={() => engine.closeUI()} wide>
      <nav className="atlas-tabs" aria-label="World tools">
        {(["weather", "encounters", "workshop"] as const).map((name) => <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}
      </nav>
      {tab === "weather" && <>
        <div className="atlas-times"><span>World time {duration(model.elapsed)}</span><span>Dark tide in {duration(model.nextDarkTide - model.elapsed)}</span><span>Tornado outbreak in {duration(model.nextTornado - model.elapsed)}</span></div>
        <canvas ref={canvas} width={768} height={480} className="weather-map" aria-label="Live world weather map. Tap to choose a preview location." onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setSelected({ x: Math.max(0, Math.min(N - 1, (e.clientX - r.left) / r.width * N)), z: Math.max(0, Math.min(L - 1, (e.clientY - r.top) / r.height * L)) });
        }} />
        <p className="atlas-note">Yellow: you. Purple: pylons. Pale: rain fronts. Red: tornadoes and their headings. Blue: tidal crests. The left/right edges connect.</p>
        <p className="atlas-note">Weather keeps moving and damaging exposed blocks in unloaded areas. Wood and glass are vulnerable; reinforced iron and obsidian resist storms. Timers use real elapsed session time, not the day/night cycle.</p>
        <div className="atlas-times"><span>{model.fronts.length} rain fronts</span><span>{model.tornadoes.length} tornadoes</span><span>{engine.weather.damageCount} blocks lost to weather</span></div>
        {s.mode === "creative" && <div className="atlas-actions">
          <span>Preview at {Math.round(selected.x / N * 360)} degrees / z {Math.round(selected.z)}</span>
          <button onClick={() => { model.addRain(selected.x, selected.z).age = 20; store.bump(); }}>RAIN</button>
          <button onClick={() => { model.startTornado(selected.x, selected.z); store.bump(); }}>TORNADO</button>
          <button onClick={() => model.startTide()}>DARK TIDE</button>
          <button onClick={() => { model.clear(); store.bump(); }}>CLEAR</button>
        </div>}
      </>}
      {tab === "encounters" && <>
        <p className="atlas-note">Activate the camp's Obelisk Seal with USE/right-click to start the next encounter. OBIL leads to the Warper; later fights unlock in order. Creative mode can summon any encounter here.</p>
        {BOSS_ORDER.map((boss, i) => <div className="encounter-row" key={boss}>
          <span className="encounter-index">0{i + 1}</span>
          <div><strong>{boss}</strong><p>{BOSS_TIPS[boss]}</p></div>
          <button disabled={s.mode !== "creative" || !!s.boss} onClick={() => { engine.summonEncounter(boss); engine.closeUI(); }}>{engine.bossesDefeated.has(boss) ? "REPLAY" : "SUMMON"}</button>
        </div>)}
        <p className="atlas-note">The Moonholder uses falling stone strikes in this moon-free world. The Dimensional Core is a ring encounter; alternate-dimension travel and world-unfolding are not part of this build.</p>
      </>}
      {tab === "workshop" && <>
        <p className="atlas-note">Mechanisms and storm defenses. Tools are still shaped in the chisel bench.</p>
        <div className="encounter-row"><div><strong>Reinforced Iron x4</strong><p>4 Iron Ore + 4 Cobblestone. Resists tornadoes and dark tides.</p></div><button onClick={() => craft(B.REINFORCED_IRON, 4, [[B.IRON_ORE, 4], [B.COBBLE, 4]])}>FORGE</button></div>
        <div className="encounter-row"><div><strong>Round Golem Core</strong><p>2 Gold Ore + 8 Cobblestone. Place, then USE to awaken.</p></div><button onClick={() => craft(B.GOLEM_CORE, 1, [[B.GOLD_ORE, 2], [B.COBBLE, 8]])}>ASSEMBLE</button></div>
        <div className="encounter-row"><div><strong>Conduit Array x2</strong><p>1 Gold Ore + 2 Wire. Extends a nearby golem's reach.</p></div><button onClick={() => craft(B.CONDUIT, 2, [[B.GOLD_ORE, 1], [B.WIRE, 2]])}>ASSEMBLE</button></div>
        <p className="atlas-note">Pets: bones for dogs, raw fish for cats, mice for owls, aged cheese for frogs. Milk a cow with a bucket; milk ages into cheese. A tamed frog becomes THE FORG when it dies.</p>
        <p className="atlas-note">Existing camp stations remain available: chisel bench, steam pool, crank/wire/piston, blood font, bed and pylon. Say hey for the Chill recipe companion.</p>
      </>}
    </Panel>
  );
}