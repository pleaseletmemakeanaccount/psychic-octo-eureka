import { mulberry32 } from "./noise";
import { L, N, SEA, wrapX } from "./world";

export const DARK_TIDE_INTERVAL = 45 * 60;
export const TORNADO_INTERVAL = 80 * 60;
export const WAVE_HEIGHT = 400;
export const WAVE_HALF_WIDTH = 90;
export const WAVE_SPEED = 22;
export const TIDE_DURATION = (L + 1000) / WAVE_SPEED + 15;
export const WEATHER_STEP = 0.25;

export interface RainFront {
  id: number; x: number; z: number; rx: number; rz: number;
  vx: number; vz: number; age: number; life: number; strength: number;
}
export interface StormTrack {
  id: number; x: number; z: number; heading: number;
  age: number; life: number; radius: number; speed: number; destroyed: number;
}
export const wrappedDelta = (a: number, b: number) => ((a - b + N * 1.5) % N) - N / 2;
export function frontIntensity(front: RainFront, x: number, z: number) {
  const d = Math.hypot(wrappedDelta(x, front.x) / front.rx, (z - front.z) / front.rz);
  const edge = Math.max(0, 1 - d * d);
  const fade = Math.min(1, front.age / 14, (front.life - front.age) / 20);
  return edge * Math.max(0, fade) * front.strength;
}
export function waveProfile(offset: number) {
  const t = Math.abs(offset) / WAVE_HALF_WIDTH;
  return t >= 1 ? 0 : (1 - t * t) ** 2;
}

// World coordinates and event deadlines never depend on the camera or loaded chunks.
export class WeatherModel {
  elapsed = 0;
  nextDarkTide = DARK_TIDE_INTERVAL;
  nextTornado = TORNADO_INTERVAL;
  nextRain = 90;
  darkStart = -Infinity;
  direction = 1;
  fronts: RainFront[] = [];
  tornadoes: StormTrack[] = [];
  private random = mulberry32(90741);
  private id = 0;
  onEvent: (event: "rain" | "tide" | "tornado") => void = () => {};
  constructor() {
    for (let i = 0; i < 5; i++) this.addRain();
  }
  get tideAge() { return this.elapsed - this.darkStart; }
  get tideActive() { return this.tideAge >= 0 && this.tideAge < TIDE_DURATION; }
  get darkness() {
    if (!this.tideActive) return 0;
    return Math.max(0, Math.min(1, this.tideAge / 5, (TIDE_DURATION - this.tideAge) / 8));
  }
  rainAt(x: number, z: number) {
    return Math.min(1, this.fronts.reduce((v, f) => v + frontIntensity(f, x, z), 0));
  }
  waveCenters() {
    if (!this.tideActive) return [];
    return [0, 1, 2].map((i) => {
      const travel = (this.tideAge - 6) * WAVE_SPEED - 180 - i * 280;
      return this.direction === 1 ? travel : L - travel;
    });
  }
  floodLevel(z: number) {
    if (!this.tideActive) return -Infinity;
    const height = Math.max(0, ...this.waveCenters().map((c) => waveProfile(z - c))) * WAVE_HEIGHT;
    return height > 0 ? SEA + height : -Infinity;
  }
  addRain(x = this.random() * N, z = this.random() * L) {
    const front: RainFront = {
      id: ++this.id, x, z, rx: 220 + this.random() * 320, rz: 150 + this.random() * 330,
      vx: (this.random() - 0.5) * 3.5, vz: (this.random() - 0.5) * 2.5,
      age: 0, life: 220 + this.random() * 300, strength: 0.6 + this.random() * 0.4,
    };
    if (this.fronts.length >= 8) this.fronts.shift();
    this.fronts.push(front);
    return front;
  }
  startTide() {
    this.darkStart = this.elapsed;
    this.direction = this.random() < 0.5 ? -1 : 1;
    this.nextDarkTide = this.elapsed + DARK_TIDE_INTERVAL + (this.random() - 0.5) * 360;
    this.onEvent("tide");
  }
  startTornado(x = this.random() * N, z = this.random() * L) {
    const track: StormTrack = {
      id: ++this.id, x, z, heading: this.random() * Math.PI * 2,
      age: 0, life: 200 + this.random() * 180, radius: 10 + this.random() * 12,
      speed: 4 + this.random() * 4, destroyed: 0,
    };
    if (this.tornadoes.length >= 6) return this.tornadoes[0];
    this.tornadoes.push(track);
    this.onEvent("tornado");
    return track;
  }
  clear() {
    this.fronts = []; this.tornadoes = []; this.darkStart = -Infinity;
    this.nextRain = this.elapsed + 90;
  }
  step(dt: number) {
    this.elapsed += dt;
    if (this.elapsed >= this.nextDarkTide) this.startTide();
    if (this.elapsed >= this.nextTornado) {
      for (let i = 0; i < 3; i++) this.startTornado();
      this.nextTornado = this.elapsed + TORNADO_INTERVAL;
    }
    if (this.elapsed >= this.nextRain) {
      this.addRain();
      this.nextRain = this.elapsed + 80 + this.random() * 100;
      this.onEvent("rain");
    }
    for (const front of this.fronts) {
      front.age += dt;
      front.x = wrapX(front.x + front.vx * dt);
      front.z += front.vz * dt;
      if (front.z < 0 || front.z > L) { front.vz *= -1; front.z = Math.max(0, Math.min(L, front.z)); }
    }
    this.fronts = this.fronts.filter((f) => f.age < f.life);
    for (const storm of this.tornadoes) {
      storm.age += dt;
      storm.heading += Math.sin(storm.age * 0.017 + storm.id) * dt * 0.06;
      storm.x = wrapX(storm.x + Math.sin(storm.heading) * storm.speed * dt);
      storm.z += Math.cos(storm.heading) * storm.speed * dt;
      if (storm.z < 12 || storm.z > L - 12) { storm.heading = Math.PI - storm.heading; storm.z = Math.max(12, Math.min(L - 12, storm.z)); }
    }
    this.tornadoes = this.tornadoes.filter((t) => t.age < t.life);
  }
}