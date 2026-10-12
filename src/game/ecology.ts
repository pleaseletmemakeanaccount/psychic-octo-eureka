import * as THREE from "three";
import { B, isSolid, weatherResistance } from "./blocks";
import { Entity, gdelta, type Ctx } from "./entities";
import { birdModel, box, mat, skeletonModel } from "./models";
import { L, R, SEA, wrapX, xScale } from "./world";

export class HeatBolt extends Entity {
  ttl = 4;
  constructor(x: number, y: number, z: number, velocity: THREE.Vector3, private damage: number, private source: string, color = "#ff9560") {
    super(x, y, z);
    this.kind = "projectile"; this.label = source;
    this.vel.copy(velocity); this.gravity = false; this.invulnerable = true;
    box(this.group, 0.14, 0.14, 0.5, mat(color, { emissive: true }), 0, 0, 0);
  }
  update(dt: number, ctx: Ctx) {
    this.ttl -= dt;
    if (this.ttl <= 0) { this.dead = true; return; }
    const steps = Math.max(1, Math.ceil(this.vel.length() * dt / 0.25));
    for (let i = 0; i < steps; i++) {
      this.pos.x = wrapX(this.pos.x + this.vel.x * dt / steps / xScale(this.pos.y));
      this.pos.y += this.vel.y * dt / steps;
      this.pos.z += this.vel.z * dt / steps;
      if (isSolid(ctx.world.getF(this.pos.x, this.pos.y, this.pos.z))) { this.dead = true; break; }
      const d = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y + 0.9, ctx.player.z);
      if (d.dist < 0.65) { ctx.damagePlayer(this.damage, this.source); this.dead = true; break; }
    }
    this.yaw = Math.atan2(this.vel.x, this.vel.z);
    this.sync();
  }
}

export function fireAtPlayer(e: Entity, ctx: Ctx, damage: number, speed: number, color?: string) {
  const originY = e.pos.y + e.height * 0.6;
  const d = gdelta(e.pos.x, originY, e.pos.z, ctx.player.x, ctx.player.y + 0.8, ctx.player.z);
  const velocity = new THREE.Vector3(d.dx, d.dy, d.dz).normalize().multiplyScalar(speed);
  ctx.spawn(new HeatBolt(e.pos.x, originY, e.pos.z, velocity, damage, e.label, color));
}

export class Fish extends Entity {
  private swimTime = Math.random() * 10;
  constructor(x: number, y: number, z: number, type: "cod" | "salmon") {
    super(x, y, z);
    this.kind = type; this.label = type === "cod" ? "Cod" : "Salmon";
    this.hp = this.maxHp = 4; this.height = 0.4; this.radius = 0.4; this.gravity = false;
    box(this.group, 0.22, 0.32, 0.8, type === "cod" ? "#b3ad84" : "#c77c88", 0, 0, 0);
    box(this.group, 0.4, 0.24, 0.1, "#7c939c", 0, 0, -0.45);
    box(this.group, 0.025, 0.05, 0.05, "#080a0d", -0.12, 0.09, 0.3);
    box(this.group, 0.025, 0.05, 0.05, "#080a0d", 0.12, 0.09, 0.3);
  }
  update(dt: number, ctx: Ctx) {
    this.swimTime += dt;
    this.yaw += Math.sin(this.swimTime * 0.5) * dt;
    const u = wrapX(this.pos.x + Math.sin(this.yaw) * 1.8 * dt / xScale(this.pos.y));
    const z = this.pos.z + Math.cos(this.yaw) * 1.8 * dt;
    const y = this.pos.y + Math.sin(this.swimTime * 0.8) * dt * 0.3;
    if (ctx.world.getF(u, y, z) === B.WATER && y < SEA - 0.5) this.pos.set(u, y, z);
    else this.yaw += dt * 4;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.sync();
    this.group.children[1].rotation.y = Math.sin(this.swimTime * 9) * 0.5;
  }
  drops() { return [{ item: "raw_fish", count: 1 }]; }
}

/** The only flyer left in the ring: owls. Sky squirrels, cloud serpents, wyrms and geometric watchers are gone. */
export class SkyCreature extends Entity {
  tamed = false;
  private age = Math.random() * 30;
  private home: THREE.Vector3;
  private wings: THREE.Object3D[] = [];
  constructor(x: number, y: number, z: number) {
    super(x, y, z);
    this.home = this.pos.clone(); this.kind = "owl"; this.gravity = false;
    this.height = 1; this.radius = 0.8;
    this.hostile = false;
    this.hp = this.maxHp = 24;
    this.label = "Owl";
    this.group.add(birdModel("#ad9273", "#ddcb88", true));
    for (const s of [-1, 1]) this.wings.push(box(this.group, 0.5, 0.08, 0.42, "#826646", s * 0.4, 0.45, 0));
  }
  update(dt: number, ctx: Ctx) {
    this.age += dt; this.hurtT = Math.max(0, this.hurtT - dt);
    const d = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y + 2, ctx.player.z);
    const follow = this.tamed && d.dist < 65;
    const target = follow ? ctx.player : this.home;
    this.faceToward(target.x, target.z);
    if (!follow) this.yaw += Math.sin(this.age * 0.25) * 1.8;
    const speed = 2.5;
    const destinationY = follow ? ctx.player.y + 3 : this.home.y + Math.sin(this.age * 0.3) * 5;
    const next = this.pos.clone();
    next.x = wrapX(next.x + Math.sin(this.yaw) * speed * dt / xScale(next.y));
    next.z = THREE.MathUtils.clamp(next.z + Math.cos(this.yaw) * speed * dt, 2, L - 2);
    next.y = THREE.MathUtils.clamp(next.y + (destinationY - next.y) * dt, 2, R - 20);
    if (isSolid(ctx.world.getF(next.x, next.y, next.z))) next.y += dt * 9;
    this.pos.copy(next);
    if (this.tamed && d.dist > 55) this.pos.copy(ctx.player).add(new THREE.Vector3(0, 4, 1));
    this.sync();
    this.wings.forEach((wing, i) => { wing.rotation.z = Math.sin(this.age * 12) * (i === 0 ? 1 : -1) * 0.7; });
  }
  interact(ctx: Ctx, held: string | null) {
    if (held === "mouse" && !this.tamed) {
      this.tamed = true; this.label = "Pet Owl"; ctx.say("The owl accepts the mouse and follows you.", "#d1bd92"); return "consume";
    }
  }
  drops() { return [{ item: "feather", count: 2 }]; }
}

export class BoneThief extends Entity {
  private cooldown = 0;
  constructor(x: number, y: number, z: number) {
    super(x, y, z); this.kind = "bone_thief"; this.label = "Bone Thief"; this.hostile = true;
    this.hp = this.maxHp = 28; this.height = 1.3;
    const model = skeletonModel(); model.scale.set(0.7, 0.7, 0.7); this.group.add(model);
    box(this.group, 0.6, 0.4, 0.45, "#563f35", 0, 0.7, -0.2);
  }
  update(dt: number, ctx: Ctx) {
    this.animT += dt; this.cooldown -= dt; this.hurtT = Math.max(0, this.hurtT - dt);
    const d = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y, ctx.player.z);
    this.faceToward(ctx.player.x, ctx.player.z); this.walk(d.dist > 1.5 && d.dist < 40 ? 3.8 : 0);
    this.jumpIfBlocked(ctx);
    if (d.dist < 1.6 && this.cooldown <= 0) { this.cooldown = 1.5; ctx.damagePlayer(5, "Bone Thief", Math.random() < 0.5 ? "lleg" : "rleg"); }
    this.physics(dt, ctx); this.animateLegs(this.vel.length()); this.sync();
  }
  drops() { return [{ item: "bone", count: 4 }]; }
}

export class DoomWalker extends Entity {
  private attack = 5;
  private stomp = 2;
  private legs: THREE.Object3D[] = [];
  constructor(x: number, y: number, z: number) {
    super(x, y, z); this.kind = "doom_walker"; this.label = "Doom Walker"; this.hostile = true;
    this.hp = this.maxHp = 140; this.height = 14; this.radius = 3; this.gravity = false;
    box(this.group, 5, 2.8, 4, "#343e48", 0, 12, 0);
    box(this.group, 1.6, 0.5, 0.12, mat("#ff8b44", { emissive: true }), 0, 12, 2.1);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const leg = box(this.group, 0.55, 12, 0.65, "#66727c", Math.cos(a) * 2.6, 6, Math.sin(a) * 2.6);
      this.legs.push(leg);
    }
  }
  update(dt: number, ctx: Ctx) {
    this.animT += dt; this.attack -= dt; this.stomp -= dt; this.hurtT = Math.max(0, this.hurtT - dt);
    const d = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y, ctx.player.z);
    this.faceToward(ctx.player.x, ctx.player.z);
    if (d.dist < 100 && d.dist > 10) {
      this.pos.x = wrapX(this.pos.x + Math.sin(this.yaw) * dt * 1.6 / xScale(this.pos.y));
      this.pos.z = Math.max(3, Math.min(L - 3, this.pos.z + Math.cos(this.yaw) * dt * 1.6));
    }
    this.pos.y = ctx.world.heightAt(this.pos.x, this.pos.z) + 1;
    if (this.stomp <= 0) {
      this.stomp = 1.8;
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2;
        const u = this.pos.x + Math.cos(a) * 3, z = Math.floor(this.pos.z + Math.sin(a) * 3);
        const y = ctx.world.surfaceY(u, z), b = ctx.world.get(u, y, z);
        if (weatherResistance(b) < 24) ctx.breakBlock(u, y, z, false);
      }
    }
    if (d.dist < 60 && this.attack <= 0) { this.attack = 4; fireAtPlayer(this, ctx, 14, 28); }
    this.sync(); this.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(this.animT * 2 + i * 2.1) * 0.18; });
  }
  drops() { return [{ block: B.IRON_ORE, count: 10 }, { block: B.REINFORCED_IRON, count: 6 }]; }
}

export class RoundGolem extends Entity {
  blocks = 0;
  private gather = 0;
  private shell = new THREE.Group();
  constructor(x: number, y: number, z: number) {
    super(x, y, z); this.kind = "golem"; this.label = "Round Golem (0/128)";
    this.hp = this.maxHp = 90; this.height = 1.8;
    this.group.add(this.shell);
    this.shell.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), mat("#d7955c")));
    this.shell.position.y = 0.9;
  }
  update(dt: number, ctx: Ctx) {
    this.animT += dt; this.gather -= dt; this.hurtT = Math.max(0, this.hurtT - dt);
    const d = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y, ctx.player.z);
    this.faceToward(ctx.player.x, ctx.player.z);
    this.walk(d.dist > 4 && d.dist < 45 ? 3 : 0);
    this.jumpIfBlocked(ctx, 9); this.physics(dt, ctx);
    if (this.gather <= 0 && this.blocks < 128) {
      this.gather = 1.4;
      let reach = 2;
      for (let dx = -3; dx <= 3; dx++) if (ctx.world.get(this.pos.x + dx, this.pos.y, this.pos.z) === B.CONDUIT) reach += 2;
      const a = this.animT * 2.3, u = this.pos.x + Math.cos(a) * reach, z = Math.floor(this.pos.z + Math.sin(a) * reach);
      const y = ctx.world.surfaceY(u, z), id = ctx.world.get(u, y, z);
      if ((id === B.STONE || id === B.COBBLE || id === B.DIRT || id === B.SAND || id === B.LEAVES) && y > 2) {
        ctx.breakBlock(u, y, z, false);
        this.blocks++;
        const phi = Math.acos(1 - 2 * ((this.blocks * 0.618) % 1));
        box(this.shell, 0.28, 0.28, 0.28, "#8d9488", Math.sin(phi) * Math.cos(a), Math.cos(phi), Math.sin(phi) * Math.sin(a));
        this.label = `Round Golem (${this.blocks}/128)`;
      }
    }
    this.sync(); this.shell.rotation.x += this.vel.length() * dt * 0.6;
  }
  drops() { return [{ block: B.GOLEM_CORE, count: 1 }, { block: B.COBBLE, count: Math.min(64, this.blocks) }]; }
}