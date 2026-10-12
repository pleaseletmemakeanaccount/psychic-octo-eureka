import * as THREE from "three";
import { B, weatherResistance } from "./blocks";
import { Entity, Tornado, gdelta, type Ctx } from "./entities";
import { fireAtPlayer } from "./ecology";
import { box, mat } from "./models";
import { L, R, wrapX, xScale } from "./world";

export const BOSS_ORDER = ["OBIL", "THE WARPER", "THE SCRUNCLE", "THE FARBREAKER", "THE MOONHOLDER", "THE DIMENSIONAL CORE"] as const;
export type BossName = (typeof BOSS_ORDER)[number];
export const BOSS_TIPS: Record<BossName, string> = {
  OBIL: "Strike flying debris to charge it; the reversed vortex returns it to the core.",
  "THE WARPER": "Break the stitched kill-log shield, then strike the orb. Sidestep its pikes.",
  "THE SCRUNCLE": "A teleporting hat gunslinger. Dodge the amber wind-up and close the distance.",
  "THE FARBREAKER": "Twisters are independent hazards. Circle behind the anomaly between casts.",
  "THE MOONHOLDER": "Without moons, it calls down stone from the sky. Move out of the marked impact zones.",
  "THE DIMENSIONAL CORE": "Its white core opens between purple gravity pulses. Strike during that window.",
};

class FallingStrike extends Entity {
  private timer = 1.8;
  private baseY: number;
  private rock: THREE.Mesh;
  constructor(x: number, y: number, z: number) {
    super(x, y, z); this.baseY = y; this.kind = "impact_marker"; this.invulnerable = true;
    this.label = "Incoming stone strike"; this.gravity = false;
    const warning = new THREE.Mesh(new THREE.RingGeometry(3.5, 4, 28), mat("#ff6644", { emissive: true, side: THREE.DoubleSide }));
    warning.rotation.x = -Math.PI / 2; warning.position.y = 0.1; this.group.add(warning);
    this.rock = box(this.group, 3, 3, 3, "#79797e", 0, 55, 0);
  }
  update(dt: number, ctx: Ctx) {
    this.timer -= dt;
    if (this.timer < 0) this.rock.position.y = Math.max(1.5, this.rock.position.y - dt * 48);
    this.rock.rotation.y += dt;
    this.group.children[0].scale.setScalar(1 + Math.sin(this.timer * 20) * 0.04);
    if (this.rock.position.y <= 1.5) {
      const d = gdelta(this.pos.x, this.baseY, this.pos.z, ctx.player.x, ctx.player.y, ctx.player.z);
      if (d.dist < 4.2) ctx.damagePlayer(18, "Moonholder stone strike");
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const u = this.pos.x + dx, z = Math.floor(this.pos.z + dz);
        const y = ctx.world.surfaceY(u, z);
        if (weatherResistance(ctx.world.get(u, y, z)) < 24) ctx.breakBlock(u, y, z, false);
      }
      this.dead = true;
    }
    this.sync();
  }
}

export class AdvancedBoss extends Entity {
  private clock = 0;
  private attack = 2;
  private teleport = 3;
  private warning = new THREE.Group();
  private core: THREE.Mesh;
  private spawnedTwisters: Tornado[] = [];
  constructor(x: number, y: number, z: number, public bossName: Exclude<BossName, "OBIL" | "THE WARPER">) {
    super(x, y, z);
    this.label = bossName; this.kind = bossName.toLowerCase().replace(/ /g, "_");
    this.hostile = true; this.gravity = false;
    this.hp = this.maxHp = { "THE SCRUNCLE": 140, "THE FARBREAKER": 230, "THE MOONHOLDER": 280, "THE DIMENSIONAL CORE": 360 }[bossName];
    this.height = bossName === "THE SCRUNCLE" ? 2 : 3.2;
    this.radius = bossName === "THE SCRUNCLE" ? 1 : 1.8;
    if (bossName === "THE SCRUNCLE") {
      box(this.group, 2, 0.18, 1.8, "#15131d", 0, 0.4, 0);
      box(this.group, 1.35, 1.7, 1.3, "#241c2d", 0, 1.2, 0);
      box(this.group, 1.4, 0.26, 1.34, "#97333d", 0, 0.75, 0);
      box(this.group, 0.3, 0.25, 1.3, "#878b95", 0.8, 1, 0.7);
      this.core = box(this.group, 0.2, 0.18, 0.06, mat("#ffd599", { emissive: true }), 0, 1.35, 0.68);
    } else if (bossName === "THE FARBREAKER") {
      this.core = new THREE.Mesh(new THREE.OctahedronGeometry(1.6), mat("#a2b5c5", { emissive: true }));
      this.core.position.y = 1.6; this.group.add(this.core);
      for (let i = 0; i < 6; i++) box(this.warning, 0.4, 2, 0.4, "#785a9b", Math.sin(i) * 2, 1.7, Math.cos(i) * 2);
    } else if (bossName === "THE MOONHOLDER") {
      this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), mat("#d0a763"));
      this.core.position.y = 1.5; this.group.add(this.core);
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        box(this.warning, 0.24, 3.3, 0.24, "#7b8b9a", Math.sin(a) * 2.1, 2, Math.cos(a) * 2.1);
      }
    } else {
      this.core = new THREE.Mesh(new THREE.SphereGeometry(1.3, 32, 24), mat("#eee7ce", { emissive: true }));
      this.core.position.y = 1.6; this.group.add(this.core);
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 8, 48), mat("#a886ed", { emissive: true }));
        ring.rotation.set(i * 1.05, i * 0.7, 0); ring.position.y = 1.6; this.warning.add(ring);
      }
    }
    this.group.add(this.warning);
  }
  hurt(amount: number, ctx: Ctx) {
    const exposed = this.clock % 8 > 4;
    super.hurt(this.bossName === "THE DIMENSIONAL CORE" && !exposed ? amount * 0.15 : amount, ctx);
    if (!this.dead) ctx.setBoss({ name: this.label, hp: this.hp, max: this.maxHp });
  }
  onDeath(ctx: Ctx) {
    this.spawnedTwisters.forEach((t) => { t.life = Math.min(t.life, 2); });
    ctx.onBossDefeated(this.bossName);
  }
  update(dt: number, ctx: Ctx) {
    this.clock += dt; this.attack -= dt; this.teleport -= dt; this.hurtT = Math.max(0, this.hurtT - dt);
    const d = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y, ctx.player.z);
    this.faceToward(ctx.player.x, ctx.player.z);
    if (d.dist > 4.5 && d.dist < 180) {
      const speed = this.bossName === "THE SCRUNCLE" ? 4.5 : 2.2;
      this.pos.x = wrapX(this.pos.x + Math.sin(this.yaw) * speed * dt / xScale(this.pos.y));
      this.pos.z = THREE.MathUtils.clamp(this.pos.z + Math.cos(this.yaw) * speed * dt, 3, L - 3);
    }
    const ground = ctx.world.heightAt(this.pos.x, this.pos.z) + 1;
    this.pos.y += (ground + (this.bossName === "THE SCRUNCLE" ? 0.4 : 1.4) + Math.sin(this.clock * 1.5) * 0.4 - this.pos.y) * Math.min(1, dt * 4);
    if (this.bossName === "THE SCRUNCLE" && this.teleport <= 0 && d.dist < 140) {
      const a = this.clock * 1.71;
      this.pos.x = wrapX(ctx.player.x + Math.sin(a) * 10 / xScale(ctx.player.y));
      this.pos.z = THREE.MathUtils.clamp(ctx.player.z + Math.cos(a) * 10, 3, L - 3);
      this.pos.y = ctx.world.surfaceY(this.pos.x, this.pos.z) + 1.5;
      this.teleport = 3.5; this.attack = 1;
    }
    if (this.attack <= 0 && d.dist < 100) {
      if (this.bossName === "THE SCRUNCLE") {
        this.attack = 0.85; fireAtPlayer(this, ctx, 6, 32, "#ffcd88");
      } else if (this.bossName === "THE FARBREAKER") {
        this.attack = 5;
        this.spawnedTwisters = this.spawnedTwisters.filter((t) => !t.dead);
        if (this.spawnedTwisters.length < 3) {
          const u = wrapX(ctx.player.x + Math.sin(this.clock) * 7), z = Math.max(3, Math.min(L - 3, ctx.player.z + Math.cos(this.clock) * 7));
          const tornado = new Tornado(u, ctx.world.heightAt(u, z) + 1, z, true);
          ctx.spawn(tornado); this.spawnedTwisters.push(tornado);
        }
        fireAtPlayer(this, ctx, 7, 16, "#c9a6ef");
      } else if (this.bossName === "THE MOONHOLDER") {
        this.attack = 4;
        for (let i = 0; i < 3; i++) {
          const u = wrapX(ctx.player.x + Math.sin(this.clock + i) * i * 4);
          const z = Math.max(3, Math.min(L - 3, Math.floor(ctx.player.z + Math.cos(this.clock + i) * i * 4)));
          ctx.spawn(new FallingStrike(u, ctx.world.surfaceY(u, z) + 1, z));
        }
      } else {
        this.attack = this.hp < this.maxHp / 2 ? 1 : 1.8;
        fireAtPlayer(this, ctx, 10, 21, "#ba94ff");
        if (this.clock % 8 < 4 && ctx.player.y < R - 20) ctx.playerVel.y += 4;
      }
    }
    this.sync();
    this.warning.rotation.y = this.clock * 0.5;
    if (this.bossName !== "THE SCRUNCLE") this.core.rotation.y = this.clock;
    if (this.bossName === "THE DIMENSIONAL CORE") (this.core.material as THREE.MeshBasicMaterial).color.set(this.clock % 8 > 4 ? "#fff1ca" : "#7854b0");
    if (this.bossName === "THE SCRUNCLE") this.core.scale.setScalar(this.attack < 0.3 ? 2 : 1);
  }
  drops() { return [{ block: B.GOLD_ORE, count: 8 }, { block: B.REINFORCED_IRON, count: 12 }]; }
}