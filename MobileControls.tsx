import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { engine } from "../game/engine";
import { sortInventory, store } from "../game/state";
import { useGame } from "./common";

type Stick = { x: number; y: number };

function holdHandlers(start: () => void, end: () => void) {
  const stop = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      stop(e);
      e.currentTarget.setPointerCapture(e.pointerId);
      start();
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      stop(e);
      end();
    },
    onPointerCancel: end,
    onLostPointerCapture: end,
    onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault(),
  };
}

export function MobileControls() {
  const s = useGame();
  const [stick, setStick] = useState<Stick>({ x: 0, y: 0 });
  const stickPointer = useRef<number | null>(null);
  const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const reset = () => {
      stickPointer.current = null; lookPointer.current = null;
      setStick({ x: 0, y: 0 }); engine.setTouchMove(0, 0);
      for (const code of ["Space", "ShiftLeft", "ControlLeft"]) engine.setTouchKey(code, false);
      engine.setTouchMine(false);
    };
    window.addEventListener("blur", reset);
    window.addEventListener("orientationchange", reset);
    return () => { reset(); window.removeEventListener("blur", reset); window.removeEventListener("orientationchange", reset); };
  }, []);
  useEffect(() => {
    if (s.ui !== "none") {
      stickPointer.current = null; lookPointer.current = null;
      setStick({ x: 0, y: 0 });
    }
  }, [s.ui]);

  if (!engine.touchDevice || s.ui !== "none" || s.phase !== "playing") return null;

  const updateStick = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const radius = rect.width * 0.34;
    const dx = (e.clientX - (rect.left + rect.width / 2)) / radius;
    const dy = (e.clientY - (rect.top + rect.height / 2)) / radius;
    const len = Math.hypot(dx, dy);
    const scale = len > 1 ? 1 / len : 1;
    const next = { x: dx * scale, y: dy * scale };
    setStick(next);
    engine.setTouchMove(next.x, -next.y);
  };

  const startStick = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (stickPointer.current !== null) return;
    stickPointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateStick(e);
  };
  const moveStick = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickPointer.current === e.pointerId) updateStick(e);
  };
  const endStick = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickPointer.current !== e.pointerId) return;
    stickPointer.current = null;
    setStick({ x: 0, y: 0 });
    engine.setTouchMove(0, 0);
  };

  const startLook = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (lookPointer.current !== null) return;
    lookPointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveLook = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = lookPointer.current;
    if (!prev || prev.id !== e.pointerId) return;
    engine.lookBy(e.clientX - prev.x, e.clientY - prev.y);
    lookPointer.current = { id: prev.id, x: e.clientX, y: e.clientY };
  };
  const endLook = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointer.current?.id === e.pointerId) lookPointer.current = null;
  };

  const btn = "touch-control-button";
  const mine = holdHandlers(() => engine.setTouchMine(true), () => engine.setTouchMine(false));
  const jump = holdHandlers(() => engine.setTouchKey("Space", true), () => engine.setTouchKey("Space", false));
  const down = holdHandlers(() => engine.setTouchKey("ShiftLeft", true), () => engine.setTouchKey("ShiftLeft", false));
  const sprint = holdHandlers(() => engine.setTouchKey("ControlLeft", true), () => engine.setTouchKey("ControlLeft", false));

  const openInventory = () => {
    sortInventory(store.s);
    engine.openUI("inventory");
  };
  const openRunes = () => {
    if (s.armorGold) engine.openUI("runes");
    else store.say("Runes need Gold Armor. Chisel a Gold Chestplate first.", "#ffd23a");
  };

  return (
    <div className="mobile-controls absolute inset-0 z-20 pointer-events-none select-none" aria-label="Touch game controls">
      <div
        className="touch-look-zone"
        aria-label="Drag to look around"
        onPointerDown={startLook}
        onPointerMove={moveLook}
        onPointerUp={endLook}
        onPointerCancel={endLook}
        onLostPointerCapture={endLook}
      />

      <div className="mobile-quickbar pointer-events-auto">
        <button onClick={openInventory}>BAG</button>
        <button onClick={() => engine.openUI("chisel")}>CHISEL</button>
        <button onClick={openRunes}>RUNES</button>
        <button onClick={() => engine.openUI("chat")}>CHAT</button>
        <button onClick={() => engine.openUI("help")}>HELP</button>
        <button onClick={() => engine.openUI("world")}>WORLD</button>
        <button className={s.mode === "creative" ? "touch-selected" : ""} aria-pressed={s.mode === "creative"} onClick={() => engine.setMode(s.mode === "creative" ? "survival" : "creative")}>
          {s.mode === "creative" ? "CREATIVE ON" : "CREATIVE"}
        </button>
        {s.mode === "creative" && <button aria-pressed={engine.flying} className={engine.flying ? "touch-selected" : ""} onClick={() => engine.toggleFlight()}>{engine.flying ? "FLIGHT ON" : "FLIGHT OFF"}</button>}
        {s.mounted && <button onClick={() => engine.dismount()}>DISMOUNT</button>}
      </div>

      <div
        className="touch-joystick pointer-events-auto"
        onPointerDown={startStick}
        onPointerMove={moveStick}
        onPointerUp={endStick}
        onPointerCancel={endStick}
        onLostPointerCapture={endStick}
        aria-label="Movement joystick"
      >
        <div className="touch-joystick-cross touch-joystick-cross-x" />
        <div className="touch-joystick-cross touch-joystick-cross-y" />
        <div className="touch-joystick-thumb" style={{ transform: `translate(${stick.x * 37}px, ${stick.y * 37}px)` }} />
        <span className="touch-joystick-label">MOVE</span>
      </div>

      <div className="touch-actions pointer-events-auto">
        <button className={`${btn} touch-mine`} {...mine} aria-label="Hold to mine or attack">MINE</button>
        <button className={`${btn} touch-use`} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); engine.touchUse(); }} aria-label="Use or place">USE</button>
        <button className={`${btn} touch-jump`} {...jump} aria-label="Hold to jump or flutter">JUMP</button>
        <button className={`${btn} touch-down`} {...down} aria-label="Hold to descend or sneak">DOWN</button>
        <button className={`${btn} touch-sprint`} {...sprint} aria-label="Hold to sprint">RUN</button>
      </div>
      {s.mode === "creative" && <div className="mobile-mode-label">{engine.flying ? "FLYING / HOLD JUMP TO RISE" : "WALKING / TAP FLIGHT TO FLY"}</div>}
    </div>
  );
}