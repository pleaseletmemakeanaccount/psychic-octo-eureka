import { useSyncExternalStore } from "react";
import { BLOCKS, ITEMS } from "../game/blocks";
import { store, stackName, type ItemStack } from "../game/state";
import { blockIcon } from "../game/textures";

export function useGame() {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store.s;
}

const TOOL_EMOJI: Record<string, string> = { sword: "🗡️", pickaxe: "⛏️", axe: "🪓", shovel: "🥄", chestplate: "🛡️" };

export function ItemIcon({ stack, size = 36 }: { stack: ItemStack | null; size?: number }) {
  if (!stack) return null;
  let inner: React.ReactNode;
  if (stack.kind === "block") {
    inner = <img src={blockIcon(stack.id)} alt="" style={{ width: size * 0.8, height: size * 0.8, imageRendering: "pixelated" }} draggable={false} />;
  } else if (stack.kind === "item") {
    inner = <span style={{ fontSize: size * 0.6, lineHeight: 1 }}>{ITEMS[stack.key]?.icon ?? "?"}</span>;
  } else {
    inner = (
      <span className="relative flex items-center justify-center" style={{ width: size * 0.8, height: size * 0.8 }}>
        <img src={blockIcon(stack.material)} alt="" className="absolute inset-0 w-full h-full opacity-50" style={{ imageRendering: "pixelated" }} draggable={false} />
        <span style={{ fontSize: size * 0.5, lineHeight: 1 }} className="relative drop-shadow">
          {TOOL_EMOJI[stack.tool]}
        </span>
      </span>
    );
  }
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} title={stackName(stack)}>
      {inner}
      {stack.count > 1 && <span className="absolute bottom-0 right-0.5 text-[11px] font-bold text-white [text-shadow:1px_1px_0_#000] font-mono">{stack.count}</span>}
      {stack.kind === "tool" && (
        <span className="absolute bottom-0 left-0.5 right-0.5 h-[3px] bg-black/60">
          <span className="block h-full" style={{ width: `${Math.round(stack.quality * 100)}%`, background: stack.quality > 0.8 ? "#5f5" : stack.quality > 0.6 ? "#fd4" : "#f64" }} />
        </span>
      )}
    </div>
  );
}

export function blockColor(id: number) {
  return BLOCKS[id]?.color ?? "#888";
}

export function Panel({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-[2px]" onMouseDown={(e) => e.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`ernas-panel relative bg-[#16131c] border-4 border-[#3a3048] shadow-[0_0_0_4px_#000,0_20px_60px_rgba(0,0,0,0.6)] text-[#e8e0f0] font-mono p-3 sm:p-5 ${wide ? "w-[860px]" : "w-[620px]"} max-w-[95vw] max-h-[92dvh] overflow-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg tracking-[0.3em] text-[#ffd23a] uppercase">{title}</h2>
          {onClose && (
            <button onClick={onClose} title="Close (Escape)" className="px-3 py-2 border-2 border-[#5a4a6a] hover:bg-[#3a3048] text-sm">
              CLOSE
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
