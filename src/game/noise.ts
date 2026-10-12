// Deterministic seeded Perlin noise (3D) + helpers
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Perlin {
  p: Uint8Array;
  constructor(seed: number) {
    const rnd = mulberry32(seed);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  private static fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  private static grad(h: number, x: number, y: number, z: number) {
    const hh = h & 15;
    const u = hh < 8 ? x : y;
    const v = hh < 4 ? y : hh === 12 || hh === 14 ? x : z;
    return ((hh & 1) === 0 ? u : -u) + ((hh & 2) === 0 ? v : -v);
  }
  noise3(x: number, y: number, z: number) {
    const p = this.p;
    const X = Math.floor(x) & 255,
      Y = Math.floor(y) & 255,
      Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = Perlin.fade(x),
      v = Perlin.fade(y),
      w = Perlin.fade(z);
    const A = p[X] + Y,
      AA = p[A] + Z,
      AB = p[A + 1] + Z,
      B = p[X + 1] + Y,
      BA = p[B] + Z,
      BB = p[B + 1] + Z;
    const g = Perlin.grad;
    const lerp = (t: number, a: number, b: number) => a + t * (b - a);
    return lerp(
      w,
      lerp(v, lerp(u, g(p[AA], x, y, z), g(p[BA], x - 1, y, z)), lerp(u, g(p[AB], x, y - 1, z), g(p[BB], x - 1, y - 1, z))),
      lerp(
        v,
        lerp(u, g(p[AA + 1], x, y, z - 1), g(p[BA + 1], x - 1, y, z - 1)),
        lerp(u, g(p[AB + 1], x, y - 1, z - 1), g(p[BB + 1], x - 1, y - 1, z - 1))
      )
    );
  }
  fbm(x: number, y: number, z: number, oct = 4) {
    let a = 1,
      f = 1,
      s = 0,
      n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.noise3(x * f, y * f, z * f);
      n += a;
      a *= 0.5;
      f *= 2;
    }
    return s / n;
  }
}

export function hash3(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
