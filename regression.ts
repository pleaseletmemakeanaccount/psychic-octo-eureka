import * as THREE from "three";
import { B, isSolid, weatherResistance } from "./blocks";
import type { Ctx } from "./entities";
import { WeatherSystem } from "./weather";
import { DARK_TIDE_INTERVAL, TORNADO_INTERVAL, WAVE_HEIGHT, WEATHER_STEP, WeatherModel } from "./weather-model";
import { ORBIT_PERIOD, skyShadowLight, type SkyIslands } from "./sky-islands";
import { Biome, CH, CLIMATE_X, CLIMATE_Z, CW, H, L, MY, N, R, SEA, SUN_RADIUS, World, colOf, fromWorld, toWorld, uOf } from "./world";

/** Verifies the live orbit: four islands, a 32-minute period, and real shadow coverage. */
export function checkSkyIslands(sky: SkyIslands) {
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`Sky island check failed: ${message}`);
  };
  check(sky.islands.length === 4, "four orbiting sky islands");
  check(
    sky.islands.every((i) => i.orbit - i.radius > SUN_RADIUS + 20 && i.orbit + i.radius < R - (H - 14)),
    "islands must orbit between the sun and the cloud ring",
  );
  const first = sky.islands[0];
  const startAngle = first.angle;
  sky.update(ORBIT_PERIOD / 4);
  const quarter = (first.angle - startAngle + Math.PI * 2) % (Math.PI * 2);
  check(Math.abs(quarter - Math.PI / 2) < 0.02, "a quarter orbit should take a quarter of 32 minutes");
  // Ground directly outward from an island must fall into night-like shadow.
  const shaded = first.group.position.clone().multiplyScalar(1.9);
  const lit = shaded.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
  check(skyShadowLight(shaded) < 0.3, "island must cast a night-like shadow outward");
  check(skyShadowLight(lit) > 0.95, "the far side of the ring must stay sunlit");
  check(sky.solidAt(first.group.position.clone()) === first, "island voxels must be solid for collision");
  sky.update(ORBIT_PERIOD * 0.75);
}

const HOT = new Set([Biome.DESERT, Biome.SCORCHED_DUNES, Biome.SALT_FLATS, Biome.MESA, Biome.BADLANDS, Biome.SAVANNA]);
const COLD = new Set([Biome.GLACIER, Biome.FROZEN_PEAKS, Biome.TUNDRA, Biome.ALPINE]);

// Run once before entering a world, so a column/coordinate regression fails visibly instead of spawning in air.
export function checkWorld(world: World) {
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`World check failed: ${message}`);
  };
  check(L === 2400, "cylinder length");
  check(CW.every((w) => w === CW[0]) && MY.every((m) => m === MY[0]), "radial columns must not change grid at spawn height");
  for (const u of [0.5, 8.5, 32.1, N - 0.1]) for (const y of [0, 15, 46, 47, 78, H - 1]) {
    const col = colOf(u, y);
    check(col === colOf(u, 0), "vertical stack alignment");
    const p = fromWorld(toWorld(u, y + 0.5, L / 2));
    const angularError = Math.min(Math.abs(p.x - u), Math.abs(N - Math.abs(p.x - u)));
    check(Math.abs(p.y - y - 0.5) < 0.00001 && angularError < 0.00001, "coordinate round trip");
  }
  check(Math.abs(MY[0] * CW[0] - CH) < 0.00001, "chunk boundary meets adjacent chunk");
  check(world.get(world.spawn.x, 0, world.spawn.z) === B.IRON_CRUST, "generated columns must store the iron shell");
  check(isSolid(world.get(world.spawn.x, world.spawn.y - 0.04, world.spawn.z)), "spawn must have solid ground");
  check(Math.abs(world.smoothHeightAt(0.000001, L / 2) - world.smoothHeightAt(N - 0.000001, L / 2)) < 0.001, "periodic terrain seam");

  // Climate bands must keep scorching and frozen ground apart, and erosion must leave varied relief.
  let clashes = 0, slopes = 0, samples = 0;
  for (let ix = 0; ix < CLIMATE_X; ix++)
    for (let iz = 0; iz < CLIMATE_Z - 1; iz++) {
      const here = world.biomeMap[ix * CLIMATE_Z + iz] as Biome;
      const ahead = world.biomeMap[((ix + 1) % CLIMATE_X) * CLIMATE_Z + iz] as Biome;
      const below = world.biomeMap[ix * CLIMATE_Z + iz + 1] as Biome;
      for (const other of [ahead, below]) if ((HOT.has(here) && COLD.has(other)) || (COLD.has(here) && HOT.has(other))) clashes++;
      const drop = Math.abs(world.heightMap[ix * CLIMATE_Z + iz] - world.heightMap[ix * CLIMATE_Z + iz + 1]);
      if (drop > 0) slopes++;
      samples++;
    }
  check(clashes / samples < 0.0005, `desert/arctic borders must be separated by temperate bands (found ${clashes})`);
  check(slopes / samples > 0.1, "eroded height field should keep varied slopes");


  check(weatherResistance(B.REINFORCED_IRON) === Infinity && weatherResistance(B.COBBLE) > weatherResistance(B.PLANKS), "fortification resistance");

  const clock = new WeatherModel();
  clock.elapsed = DARK_TIDE_INTERVAL - WEATHER_STEP;
  clock.step(WEATHER_STEP);
  check(clock.tideActive, "dark tide starts at 45 minutes");
  clock.step(30);
  check(clock.floodLevel(clock.waveCenters()[0]) === SEA + WAVE_HEIGHT && WAVE_HEIGHT === 400, "400-block crest");
  clock.elapsed = TORNADO_INTERVAL - WEATHER_STEP;
  clock.step(WEATHER_STEP);
  check(clock.tornadoes.length === 3, "80-minute world tornado outbreak");
  check(clock.tornadoes.every((t) => t.x >= 0 && t.x < N && t.z >= 0 && t.z < L), "global storm coordinates");
  clock.clear();
  check(!clock.tideActive && !clock.tornadoes.length, "weather clear");

  // Use a separate, unmeshed world: storm damage must not depend on rendering or player proximity.
  const remoteWorld = new World();
  remoteWorld.heightMap.fill(40);
  const col = colOf(N / 2, 100), u = uOf(col, 100), z = L / 2;
  remoteWorld.setC(col, 100, z, B.PLANKS);
  remoteWorld.recordBuild(col, 100, z);
  remoteWorld.setC(col, 100, z + 5, B.REINFORCED_IRON);
  remoteWorld.recordBuild(col, 100, z + 5);
  const scene = new THREE.Scene();
  const texture = new THREE.Texture();
  const noop = () => {};
  const ctx: Ctx = {
    world: remoteWorld, scene, player: new THREE.Vector3(8, 42, 8), playerVel: new THREE.Vector3(),
    isNight: false, time: 0, atlas: texture, killLog: [], damagePlayer: noop, spawn: noop,
    say: noop, toast: noop, onBossDefeated: noop, setBoss: noop,
    breakBlock: (x, y, zz) => { const id = remoteWorld.get(x, y, zz); remoteWorld.set(x, y, zz, B.AIR); return id; },
  };
  const storm = new WeatherSystem(ctx);
  try {
    void SUN_RADIUS;
    const track = storm.model.startTornado(u, z);
    track.speed = 0; track.heading = 0;
    for (let i = 0; i < 12; i++) storm.advance(1);
    remoteWorld.columnCache.clear();
    check(remoteWorld.getC(col, 100, z) === B.AIR, "remote wooden build should be destroyed and stay destroyed after cache eviction");
    check(remoteWorld.getC(col, 100, z + 5) === B.REINFORCED_IRON, "remote reinforced block should survive");
  } finally {
    storm.dispose(); texture.dispose();
  }
}