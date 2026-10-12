const FONT: Record<string, string[]> = {
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
};

export function Menu({ onStart }: { onStart: () => void }) {
  const word = "ERNAS";
  const px = "clamp(8px, 2.6vw, 18px)";
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black overflow-hidden">
      <div className="relative">
        <h1 className="sr-only">ERNAS</h1>
        <div className="flex" style={{ gap: px }} aria-hidden="true">
          {word.split("").map((ch, ci) => (
            <div key={ci} className="grid" style={{ gridTemplateColumns: `repeat(5, ${px})` }}>
              {FONT[ch].flatMap((row, y) =>
                row.split("").map((c, x) => (
                  <div
                    key={`${x}-${y}`}
                    style={{
                      width: px,
                      height: px,
                      background: c === "#" ? `hsl(${40 + y * 4 - ci * 3}, 100%, ${62 - y * 3}%)` : "transparent",
                      boxShadow: c === "#" ? `4px 4px 0 #3a1a00` : undefined,
                    }}
                  />
                ))
              )}
            </div>
          ))}
        </div>
        <button
          onClick={onStart}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-10 py-3 bg-black text-white font-mono text-xl tracking-[0.5em] border-4 border-white hover:bg-white hover:text-black transition-colors shadow-[6px_6px_0_#000]"
        >
          START
        </button>
      </div>
    </div>
  );
}
