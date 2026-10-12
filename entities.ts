import * as THREE from "three";
import { B, BLOCKS, isSolid, weatherResistance } from "./blocks";
import {
  birdModel, box, butterflyModel, chillModel, flamingoModel, forgModel, frogModel, mat, mothModel, obilModel, quadruped,
  rainbowTextSprite, skeletonModel, spiderModel, warperModel,
} from "./models";
import type { LimbKey } from "./state";
import { ATLAS_TILES } from "./textures";
import { basisAt, H, L, N, toWorld, World, xScale, ZERO_G_RADIUS, R } from "./world";

export interface Ctx {
  world: World;
  scene: THREE.Scene;
  player: THREE.Vector3; // grid feet pos
  playerVel: THREE.Vector3;
  isNight: boolean;
  time: number;
  damagePlayer(amount: number, source: string, limb?: LimbKey): void;
  spawn(e: Entity): void;
  breakBlock(x: number, y: number, z: number, drop: boolean): number;
  say(text: string, color?: string, from?: string): void;
  toast(t: string, s: string): void;
  atlas: THREE.Texture;
  onBossDefeated(name: string): void;
  setBoss(b: { name: string; hp: number; max: number } | null): void;
  killLog: string[];
}

const _e = new THREE.Vector3(), _u = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4(), _r = new THREE.Matrix4();

export function placeObject(obj: THREE.Object3D, x: number, y: number, z: number, yaw: number, pitch = 0) {
  toWorld(x, y, z, obj.position);
  basisAt(x, _e, _u, _n);
  _m.makeBasis(_e, _u, _n);
  _r.makeRotationY(yaw);
  _m.multiply(_r);
  if (pitch) _m.multiply(new THREE.Matrix4().makeRotationX(pitch));
  obj.quaternion.setFromRotationMatrix(_m);
}

/** grid-space delta with wrap, x scaled to arc length */
export function gdelta(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  let dx = bx - ax;
  if (dx > N / 2) dx -= N;
  if (dx < -N / 2) dx += N;
  const sc = xScale((ay + by) / 2);
  return { dx: dx * sc, dy: by - ay, dz: bz - az, rawDx: dx, dist: Math.hypot(dx * sc, by - ay, bz - az) };
}

let NEXT_ID = 1;

export abstract class Entity {
  id = NEXT_ID++;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = Math.random() * Math.PI * 2;
  group = new THREE.Group();
  hp = 10;
  maxHp = 10;
  radius = 0.4;
  height = 1;
  dead = false;
  onGround = false;
  hostile = false;
  invulnerable = false;
  kind = "entity";
  label = "Entity";
  hurtT = 0;
  animT = Math.random() * 10;
  gravity = true;
  constructor(x: number, y: number, z: number) {
    this.pos.set(x, y, z);
  }
  abstract update(dt: number, ctx: Ctx): void;
  physics(dt: number, ctx: Ctx) {
    const w = ctx.world;
    const r = R - this.pos.y;
    if (this.gravity && this.pos.y >= 0 && r > ZERO_G_RADIUS) this.vel.y -= 24 * xScale(this.pos.y) * dt;
    this.vel.y = Math.max(-30, this.vel.y);
    const sc = xScale(this.pos.y);
    // X
    const nx = this.pos.x + (this.vel.x * dt) / sc;
    if (!this.blocked(w, nx, this.pos.y, this.pos.z)) this.pos.x = (nx + N) % N;
    else this.vel.x = 0;
    const nz = this.pos.z + this.vel.z * dt;
    if (!this.blocked(w, this.pos.x, this.pos.y, nz)) this.pos.z = nz;
    else this.vel.z = 0;
    const ny = this.pos.y + this.vel.y * dt;
    if (this.vel.y < 0 && isSolid(w.getF(this.pos.x, ny, this.pos.z))) {
      this.pos.y = Math.floor(ny) + 1;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.vel.y > 0 && isSolid(w.getF(this.pos.x, ny + this.height, this.pos.z))) {
      this.vel.y = 0;
    } else {
      this.pos.y = ny;
      this.onGround = false;
    }
    if (this.pos.y < -30) this.dead = true;
    if (this.pos.y > H + 4) this.pos.y = H + 4;
  }
  blocked(w: World, x: number, y: number, z: number) {
    for (let h = 0.1; h < this.height; h += 0.9) if (isSolid(w.getF(x, y + h, z))) return true;
    return false;
  }
  walk(speed: number) {
    this.vel.x = Math.sin(this.yaw) * speed;
    this.vel.z = Math.cos(this.yaw) * speed;
  }
  jumpIfBlocked(ctx: Ctx, force = 7.5) {
    const fx = this.pos.x + (Math.sin(this.yaw) * 0.7) / xScale(this.pos.y);
    const fz = this.pos.z + Math.cos(this.yaw) * 0.7;
    if (this.onGround && isSolid(ctx.world.getF(fx, this.pos.y + 0.2, fz))) this.vel.y = force;
  }
  faceToward(tx: number, tz: number) {
    const d = gdelta(this.pos.x, this.pos.y, this.pos.z, tx, this.pos.y, tz);
    this.yaw = Math.atan2(d.dx, d.dz);
  }
  sync() {
    placeObject(this.group, this.pos.x, this.pos.y, this.pos.z, this.yaw);
    if (this.hurtT > 0) {
      const s = 1 + Math.sin(this.hurtT * 40) * 0.08;
      this.group.scale.setScalar(s);
    } else this.group.scale.setScalar(1);
  }
  animateLegs(speed: number) {
    const sw = Math.sin(this.animT * 10) * 0.6 * Math.min(1, speed);
    let i = 0;
    this.group.traverse((o) => {
      if (o.name === "leg") {
        o.rotation.x = i % 2 === 0 ? sw : -sw;
        i++;
      }
    });
  }
  hurt(amount: number, ctx: Ctx, _source = "player") {
    if (this.invulnerable || this.dead) return;
    this.hp -= amount;
    this.hurtT = 0.3;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.onDeath(ctx);
    }
  }
  onDeath(_ctx: Ctx) {}
  drops(): { item?: string; block?: number; count: number }[] {
    return [];
  }
  interact(_ctx: Ctx, _held: string | null): string | void {}
  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) {
        if (!o.geometry.userData.shared) geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!m.userData.shared) materials.add(m);
      } else if (o instanceof THREE.Sprite) materials.add(o.material);
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => {
      const map = (m as THREE.MeshBasicMaterial).map;
      if (map && !map.userData.shared) map.dispose();
      m.dispose();
    });
  }
}

// ===== Passive fauna =====
export class Mob extends Entity {
  speed = 1.2;
  wanderT = 0;
  moving = false;
  dropList: { item?: string; block?: number; count: number }[] = [];
  constructor(x: number, y: number, z: number, public type: string) {
    super(x, y, z);
    this.kind = type;
    switch (type) {
      case "pig":
        this.group.add(quadruped("#f0a0b0", "#e08898", 0.9, { snout: "#ff7a90" }));
        this.label = "Pig";
        this.dropList = [{ item: "raw_pork", count: 2 }];
        break;
      case "cow":
        this.group.add(quadruped("#f4f4f0", "#3a3a3a", 1.2, { spots: "#2a2a2a", snout: "#f0b0a0" }));
        this.label = "Cow";
        this.hp = this.maxHp = 14;
        this.height = 1.4;
        this.dropList = [{ item: "raw_beef", count: 2 }];
        break;
      case "chicken":
        this.group.add(birdModel("#ffffff", "#f0a020"));
        this.label = "Chicken";
        this.hp = this.maxHp = 5;
        this.dropList = [{ item: "raw_chicken", count: 1 }, { item: "feather", count: 1 }];
        break;
      case "kiwi":
        this.group.add(birdModel("#7a5a32", "#d8c090", true));
        this.label = "Kiwi Bird";
        this.hp = this.maxHp = 5;
        this.speed = 2.2;
        this.dropList = [{ item: "feather", count: 2 }];
        break;
      case "frog":
        this.group.add(frogModel());
        this.label = "Frog";
        this.hp = this.maxHp = 6;
        this.height = 0.5;
        break;
      case "dog": {
        const model = quadruped("#ab9274", "#745a3d", 0.8, { snout: "#292822" });
        box(model, 0.14, 0.3, 0.12, "#745a3d", -0.16, 1, 0.5);
        box(model, 0.14, 0.3, 0.12, "#745a3d", 0.16, 1, 0.5);
        this.group.add(model); this.label = "Dog"; this.speed = 2.6; break;
      }
      case "cat": {
        const model = quadruped("#d09351", "#8a622e", 0.55, { spots: "#684425" });
        box(model, 0.08, 0.16, 0.1, "#ba6b42", -0.09, 0.65, 0.36);
        box(model, 0.08, 0.16, 0.1, "#ba6b42", 0.09, 0.65, 0.36);
        this.group.add(model); this.label = "Cat"; this.speed = 2.5; this.height = 0.65; break;
      }
      case "mouse":
        this.group.add(quadruped("#9a8c80", "#ddaca3", 0.24));
        this.label = "Field Mouse"; this.height = 0.3; this.hp = this.maxHp = 3; this.speed = 2;
        this.dropList = [{ item: "mouse", count: 1 }]; break;
    }
    this.hp = this.maxHp;
  }
  tamed = false;
  update(dt: number, ctx: Ctx) {
    this.animT += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.wanderT -= dt;
    const pd = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y, ctx.player.z);
    if (this.tamed) {
      if (pd.dist > 3) {
        this.faceToward(ctx.player.x, ctx.player.z);
        this.moving = true;
      } else this.moving = false;
      if (pd.dist > 30) this.pos.copy(ctx.player).add(new THREE.Vector3(0, 1, 1));
    } else if (this.hurtT > 0) {
      this.yaw = Math.atan2(-pd.dx, -pd.dz);
      this.moving = true;
    } else if (this.wanderT <= 0) {
      this.wanderT = 2 + Math.random() * 4;
      this.moving = Math.random() < 0.6;
      this.yaw += (Math.random() - 0.5) * 3;
    }
    const sp = this.hurtT > 0 ? this.speed * 2.5 : this.speed * (this.tamed ? 2.4 : 1);
    if (this.moving) {
      this.walk(sp);
      this.jumpIfBlocked(ctx, this.type === "frog" ? 9 : 7.5);
      if (this.type === "frog" && this.onGround && Math.random() < 0.02) this.vel.y = 6;
    } else {
      this.vel.x *= 0.8;
      this.vel.z *= 0.8;
    }
    // avoid water edges mildly
    const wb = ctx.world.getF(this.pos.x, this.pos.y + 0.2, this.pos.z);
    if (BLOCKS[wb]?.fluid) this.vel.y = Math.max(this.vel.y, 2.5);
    this.physics(dt, ctx);
    this.animateLegs(this.moving ? 1 : 0);
    this.sync();
  }
  drops() {
    return this.dropList;
  }
  onDeath(ctx: Ctx) {
    if (this.type === "frog" && this.tamed) {
      const f = new Forg(this.pos.x, this.pos.y, this.pos.z);
      ctx.spawn(f);
      ctx.toast("THE FORG", "Your tamed frog has ascended into a mountable mega-frog.");
      ctx.say("The frog died... and became THE FORG. Right-click to mount.", "#7dff4a");
    }
  }
  interact(ctx: Ctx, held: string | null) {
    if (!this.tamed && ((this.type === "dog" && held === "bone") || (this.type === "cat" && held === "raw_fish"))) {
      this.tamed = true;
      this.label = `Pet ${this.type}`;
      ctx.say(`The ${this.type} trusts you and will follow.`, "#9dddac");
      return "consume";
    }
    if (this.type === "frog" && held === "cheese" && !this.tamed) {
      this.tamed = true;
      box(this.group, 0.15, 0.15, 0.05, "#ff3060", 0, 0.9, 0);
      ctx.say("The frog accepts your aged cheese. It is now your pet. 🐸", "#7dff4a");
      return "consume";
    }
    if (this.type === "cow" && held === "bucket") {
      ctx.say("You milk the cow. Leave the milk in your inventory to age into cheese.", "#fff");
      return "milk";
    }
  }
}

export class Butterfly extends Entity {
  color: string;
  phase = Math.random() * 10;
  constructor(x: number, y: number, z: number) {
    super(x, y, z);
    this.kind = "butterfly";
    this.label = "Butterfly";
    this.color = ["#ff6ad5", "#5ad1ff", "#ffd23a", "#ff8a3a", "#c06aff"][Math.floor(Math.random() * 5)];
    this.group.add(butterflyModel(this.color));
    this.gravity = false;
    this.hp = this.maxHp = 2;
    this.height = 0.3;
  }
  update(dt: number, ctx: Ctx) {
    this.animT += dt;
    this.phase += dt;
    this.yaw += Math.sin(this.phase * 0.7) * dt * 1.5;
    this.walk(1.5);
    const ground = ctx.world.surfaceY(Math.floor(this.pos.x), Math.floor(this.pos.z));
    const target = ground + 2.5 + Math.sin(this.phase) * 1;
    this.vel.y = (target - this.pos.y) * 1.5;
    this.physics(dt, ctx);
    const f = Math.sin(this.animT * 25) * 0.9;
    const w1 = this.group.getObjectByName("bw1"), w2 = this.group.getObjectByName("bw2");
    if (w1) w1.rotation.z = f;
    if (w2) w2.rotation.z = -f;
    this.sync();
  }
}

// ===== Hostiles =====
export class Hostile extends Entity {
  attackCd = 0;
  breakT = 0;
  speed = 2.4;
  damage = 5;
  constructor(x: number, y: number, z: number, public type: "skeleton" | "false_player" | "flamingo") {
    super(x, y, z);
    this.hostile = true;
    this.kind = type;
    if (type === "skeleton") {
      this.group.add(skeletonModel());
      this.label = "Skeleton";
      this.hp = this.maxHp = 16;
      this.height = 1.8;
    } else if (type === "false_player") {
      this.group.add(mothModel(true));
      this.label = "The False Player";
      this.hp = this.maxHp = 40;
      this.height = 1.8;
      this.speed = 3.4;
      this.damage = 8;
    } else {
      this.group.add(flamingoModel());
      this.label = "Two-Headed Flamingo";
      this.hp = this.maxHp = 24;
      this.height = 2.4;
      this.speed = 3;
      this.damage = 6;
    }
  }
  update(dt: number, ctx: Ctx) {
    this.animT += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.attackCd -= dt;
    const pd = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y, ctx.player.z);
    // burn away in daylight
    if (!ctx.isNight && (this.type === "false_player" || this.type === "skeleton") && Math.random() < dt * 0.15) {
      this.dead = true;
      return;
    }
    let moving = false;
    if (pd.dist < 40) {
      this.faceToward(ctx.player.x, ctx.player.z);
      if (pd.dist > 1.3) {
        this.walk(this.speed);
        moving = true;
        this.jumpIfBlocked(ctx);
        // False player breaks into bases
        if (this.type === "false_player") {
          const fx = this.pos.x + (Math.sin(this.yaw) * 0.8) / xScale(this.pos.y);
          const fz = this.pos.z + Math.cos(this.yaw) * 0.8;
          for (const h of [0.5, 1.5]) {
            const bx = Math.floor(fx), by = Math.floor(this.pos.y + h), bz = Math.floor(fz);
            const b = ctx.world.get(bx, by, bz);
            if (isSolid(b) && Number.isFinite(weatherResistance(b))) {
              this.breakT += dt;
              if (this.breakT > Math.max(0.9, BLOCKS[b].hardness * 0.7)) {
                ctx.breakBlock(bx, by, bz, false);
                this.breakT = 0;
              }
              break;
            }
          }
        }
      } else if (this.attackCd <= 0) {
        this.attackCd = 1.1;
        ctx.damagePlayer(this.damage, this.label);
      }
    } else {
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
    }
    if (pd.dist > 80) this.dead = true;
    this.physics(dt, ctx);
    this.animateLegs(moving ? 1 : 0);
    this.sync();
  }
  drops() {
    if (this.type === "skeleton") return [{ item: "bone", count: 2 }];
    if (this.type === "flamingo") return [{ item: "feather", count: 3 }, { item: "raw_chicken", count: 2 }];
    return [{ block: B.GLASS, count: 4 }];
  }
}

// ===== The Chill Entity :] =====
export class Chill extends Entity {
  constructor(x: number, y: number, z: number) {
    super(x, y, z);
    this.kind = "chill";
    this.label = "Chill Entity :]";
    this.invulnerable = true;
    this.group.add(chillModel());
  }
  update(dt: number, ctx: Ctx) {
    this.animT += dt;
    const pd = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y, ctx.player.z);
    let moving = false;
    if (pd.dist > 3.5) {
      this.faceToward(ctx.player.x, ctx.player.z);
      this.walk(Math.min(5, pd.dist));
      moving = true;
      this.jumpIfBlocked(ctx);
    } else {
      this.vel.x *= 0.7;
      this.vel.z *= 0.7;
      this.faceToward(ctx.player.x, ctx.player.z);
    }
    if (pd.dist > 40) this.pos.set(ctx.player.x, ctx.player.y + 1, ctx.player.z + 2);
    this.physics(dt, ctx);
    this.animateLegs(moving ? 1 : 0.1);
    this.sync();
    this.group.children[0].position.y = Math.sin(this.animT * 3) * 0.05;
  }
}

// ===== AUSTRALIA spider =====
export class DanceSpider extends Entity {
  t = 0;
  text: ReturnType<typeof rainbowTextSprite>;
  home: THREE.Vector3;
  constructor(x: number, y: number, z: number) {
    super(x, y, z);
    this.home = new THREE.Vector3(x, y, z);
    this.kind = "spider";
    this.label = "Stylish Spider";
    this.invulnerable = true;
    this.gravity = false;
    this.group.add(spiderModel());
    this.text = rainbowTextSprite("AUSTRALIA");
    this.text.sprite.position.y = 2.2;
    this.group.add(this.text.sprite);
  }
  update(dt: number) {
    this.t += dt;
    const frame = Math.floor(this.t * 8) % 8; // 8-frame dance
    const phase = this.t < 0.6 ? "emerge" : this.t < 6 ? "dance" : this.t < 6.8 ? "return" : "gone";
    if (phase === "gone") {
      this.dead = true;
      return;
    }
    let lift = 0.6;
    if (phase === "emerge") lift = 0.2 + this.t * 1.5;
    if (phase === "return") lift = 1.1 - (this.t - 6) * 1.5;
    const legs: THREE.Object3D[] = [];
    this.group.traverse((o) => o.name === "sleg" && legs.push(o));
    const poses = [0, 0.6, 1.0, 0.6, 0, -0.6, -1.0, -0.6];
    legs.forEach((l, i) => {
      l.rotation.y = poses[(frame + i) % 8] * 0.6;
      l.rotation.z = (i < 4 ? 1 : -1) * poses[(frame + i * 2) % 8] * 0.5;
    });
    this.yaw = phase === "dance" ? frame * (Math.PI / 4) : this.yaw;
    const bob = phase === "dance" ? Math.abs(Math.sin(frame * (Math.PI / 4))) * 0.25 : 0;
    this.pos.set(this.home.x, this.home.y + lift + bob, this.home.z);
    this.text.update(this.t);
    this.text.sprite.visible = phase === "dance";
    this.sync();
  }
}

// ===== flying debris (tornado / OBIL) =====
export class FlyingBlock extends Entity {
  life = 8;
  owner: Entity | null = null;
  charged = false;
  blockId: number;
  constructor(x: number, y: number, z: number, id: number, atlas: THREE.Texture) {
    super(x, y, z);
    this.kind = "debris";
    this.label = "Flying " + (BLOCKS[id]?.name ?? "block");
    this.blockId = id;
    this.gravity = false;
    this.height = 0.6;
    this.hp = 1;
    const tile = id;
    const g = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    const ts = 1 / ATLAS_TILES;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, ((tile % ATLAS_TILES) + uv.getX(i)) * ts, 1 - (Math.floor(tile / ATLAS_TILES) + 1 - uv.getY(i)) * ts);
    }
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: atlas }));
    this.group.add(m);
  }
  hurt(_a: number, ctx: Ctx) {
    // swatting debris charges it with player energy
    if (this.charged) return;
    this.charged = true;
    ((this.group.children[0] as THREE.Mesh).material as THREE.Material).dispose();
    (this.group.children[0] as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: "#ffee55" });
    ctx.say("Debris charged!", "#ffee55");
  }
  update(dt: number, ctx: Ctx) {
    this.life -= dt;
    this.animT += dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    if (!this.owner) this.vel.y -= 14 * dt;
    const sc = xScale(this.pos.y);
    this.pos.x = (this.pos.x + (this.vel.x * dt) / sc + N) % N;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    if (!this.owner && isSolid(ctx.world.getF(this.pos.x, this.pos.y, this.pos.z)) && this.vel.y < 0) {
      const bx = Math.floor(this.pos.x), by = Math.floor(this.pos.y) + 1, bz = Math.floor(this.pos.z);
      if (ctx.world.get(bx, by, bz) === B.AIR && Math.random() < 0.6) ctx.world.set(bx, by, bz, this.blockId);
      this.dead = true;
      return;
    }
    const pd = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y + 0.9, ctx.player.z);
    if (pd.dist < 0.9 && !this.charged) {
      ctx.damagePlayer(6, "flying debris");
      this.dead = true;
      return;
    }
    this.group.rotation.x += dt * 5;
    placeObject(this.group, this.pos.x, this.pos.y, this.pos.z, this.animT * 4, this.animT * 3);
  }
}

// ===== Rankine vortex tornado =====
export class Tornado extends Entity {
  life = 45;
  points: THREE.Points;
  pdata: Float32Array;
  rc = 2.2; // core radius
  vmax = 14;
  ripT = 0;
  small: boolean;
  constructor(x: number, y: number, z: number, small = false) {
    super(x, y, z);
    this.small = small;
    this.kind = "tornado";
    this.label = small ? "Farbreaker Twister" : "Storm Tornado";
    this.invulnerable = true;
    this.gravity = false;
    if (small) {
      this.rc = 1.2;
      this.vmax = 8;
      this.life = 15;
    }
    const count = small ? 500 : 1400;
    this.pdata = new Float32Array(count * 3); // angle, height, radius
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.pdata[i * 3] = Math.random() * Math.PI * 2;
      this.pdata[i * 3 + 1] = Math.random() * (small ? 7 : 22);
      this.pdata[i * 3 + 2] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: small ? "#d0a0ff" : "#b8b8c0", size: 0.35, transparent: true, opacity: 0.75, depthWrite: false }));
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }
  update(dt: number, ctx: Ctx) {
    this.life -= dt;
    this.animT += dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    this.yaw += (Math.random() - 0.5) * dt;
    const pd = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y, ctx.player.z);
    // Twisters follow their own wind, not the player.
    const sp = this.small ? 3 : 2.2;
    this.pos.x = (this.pos.x + (Math.sin(this.yaw) * sp * dt) / xScale(this.pos.y) + N) % N;
    this.pos.z = Math.max(4, Math.min(L - 4, this.pos.z + Math.cos(this.yaw) * sp * dt));
    this.pos.y = ctx.world.surfaceY(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 1;
    // particles: Rankine profile v(r) = vmax*r/rc (r<rc), vmax*rc/r (r>=rc)
    const arr = (this.points.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const maxH = this.small ? 7 : 22;
    for (let i = 0; i < arr.length / 3; i++) {
      const hgt = this.pdata[i * 3 + 1];
      const rr = (0.3 + hgt * (this.small ? 0.25 : 0.32)) * (0.6 + this.pdata[i * 3 + 2] * 0.6);
      const v = rr < this.rc ? (this.vmax * rr) / this.rc : (this.vmax * this.rc) / rr;
      this.pdata[i * 3] += (v / Math.max(0.3, rr)) * dt;
      this.pdata[i * 3 + 1] = (hgt + dt * 3) % maxH;
      arr[i * 3] = Math.cos(this.pdata[i * 3]) * rr;
      arr[i * 3 + 1] = hgt;
      arr[i * 3 + 2] = Math.sin(this.pdata[i * 3]) * rr;
    }
    this.points.geometry.getAttribute("position").needsUpdate = true;
    // rip blocks
    this.ripT -= dt;
    if (this.ripT <= 0) {
      this.ripT = this.small ? 0.8 : 0.25;
      const ax = Math.floor(this.pos.x + (Math.random() - 0.5) * 5), az = Math.floor(this.pos.z + (Math.random() - 0.5) * 5);
      const ay = ctx.world.surfaceY(ax, az);
      const b = ctx.world.get(ax, ay, az);
      if (ay > 2 && isSolid(b) && weatherResistance(b) < (this.small ? 8 : 24)) {
        ctx.breakBlock(ax, ay, az, false);
        const fb = new FlyingBlock(ax + 0.5, ay + 1, az + 0.5, b, ctx.atlas);
        const ang = Math.random() * Math.PI * 2;
        fb.vel.set(Math.cos(ang) * 9, 10 + Math.random() * 6, Math.sin(ang) * 9);
        ctx.spawn(fb);
      }
    }
    // pull player (Rankine tangential + inflow + lift)
    if (pd.dist < 10) {
      const r = Math.max(0.3, Math.hypot(pd.dx, pd.dz));
      const v = r < this.rc ? (this.vmax * r) / this.rc : (this.vmax * this.rc) / r;
      const tx = -pd.dz / r, tz = pd.dx / r;
      ctx.playerVel.x += (tx * v - (pd.dx / r) * 3) * dt * 2;
      ctx.playerVel.z += (tz * v - (pd.dz / r) * 3) * dt * 2;
      if (r < this.rc * 1.5) ctx.playerVel.y += 30 * dt;
    }
    placeObject(this.group, this.pos.x, this.pos.y, this.pos.z, 0);
  }
}

// ===== FORG =====
export class Forg extends Entity {
  mounted = false;
  constructor(x: number, y: number, z: number) {
    super(x, y, z);
    this.kind = "forg";
    this.label = "THE FORG";
    this.invulnerable = true;
    this.group.add(forgModel());
    this.height = 2;
  }
  update(dt: number, ctx: Ctx) {
    this.animT += dt;
    if (this.mounted) {
      this.pos.copy(ctx.player);
      this.pos.y -= 1.6;
    } else {
      this.vel.x *= 0.8;
      this.vel.z *= 0.8;
      this.physics(dt, ctx);
    }
    this.sync();
  }
  interact() {
    return "mount";
  }
}

// ===== BOSS 1: OBIL =====
export class Obil extends Entity {
  cycle = 0;
  debris: FlyingBlock[] = [];
  shellR = 2;
  emitT = 0;
  constructor(x: number, y: number, z: number) {
    super(x, y, z);
    this.kind = "obil";
    this.label = "OBIL";
    this.hp = this.maxHp = 300;
    this.gravity = false;
    this.group.add(obilModel());
    this.height = 7;
    this.radius = 1.2;
  }
  hurt(amount: number, ctx: Ctx) {
    // shielded: melee does little
    super.hurt(amount * 0.15, ctx);
    if (!this.dead) ctx.setBoss({ name: "OBIL - The Gravity Obelisk", hp: this.hp, max: this.maxHp });
  }
  onDeath(ctx: Ctx) {
    this.debris.forEach((d) => (d.owner = null));
    ctx.onBossDefeated("OBIL");
  }
  update(dt: number, ctx: Ctx) {
    this.animT += dt;
    this.cycle = (this.cycle + dt) % 16;
    this.hurtT = Math.max(0, this.hurtT - dt);
    const ground = ctx.world.surfaceY(Math.floor(this.pos.x), Math.floor(this.pos.z));
    this.pos.y += (ground + 3 + Math.sin(this.animT) * 0.5 - this.pos.y) * dt;
    const phase = this.cycle < 7 ? "dislodge" : this.cycle < 12 ? "reverse" : "rest";
    const pd = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y, ctx.player.z);
    this.yaw = Math.atan2(pd.dx, pd.dz);
    if (phase === "dislodge") {
      this.shellR = 2 + this.cycle * 1.4;
      this.emitT -= dt;
      if (this.emitT <= 0 && this.debris.length < 40) {
        this.emitT = 0.18;
        // dislodge terrain on expanding sphere shell
        const a = Math.random() * Math.PI * 2;
        const bx = Math.floor(this.pos.x + (Math.cos(a) * this.shellR) / xScale(this.pos.y));
        const bz = Math.floor(this.pos.z + Math.sin(a) * this.shellR);
        if (bz > 2 && bz < L - 3) {
          const by = ctx.world.surfaceY(bx, bz);
          const b = ctx.world.get(bx, by, bz);
          if (by > 2 && isSolid(b) && b !== B.IRON_CRUST && b !== B.PYLON) {
            ctx.breakBlock(bx, by, bz, false);
            const fb = new FlyingBlock(bx + 0.5, by + 1, bz + 0.5, b, ctx.atlas);
            fb.owner = this;
            fb.life = 20;
            this.debris.push(fb);
            ctx.spawn(fb);
          }
        }
      }
      // gravity shift: push player outward in a spiral
      if (pd.dist < 14) {
        const r = Math.max(0.5, Math.hypot(pd.dx, pd.dz));
        ctx.playerVel.x += ((pd.dx / r) * 6 - (pd.dz / r) * 4) * dt;
        ctx.playerVel.z += ((pd.dz / r) * 6 + (pd.dx / r) * 4) * dt;
      }
    }
    // debris motion
    this.debris = this.debris.filter((d) => !d.dead);
    for (const d of this.debris) {
      if (this.dead) break;
      const dd = gdelta(this.pos.x, this.pos.y + 3, this.pos.z, d.pos.x, d.pos.y, d.pos.z);
      const r = Math.max(0.3, Math.hypot(dd.dx, dd.dz));
      if (phase === "reverse") {
        // vortex reverses, pulling projectiles inward
        const distance = Math.max(0.01, dd.dist);
        d.vel.set((-dd.dx / distance) * 9 + (-dd.dz / r) * 3, (-dd.dy / distance) * 9, (-dd.dz / distance) * 9 + (dd.dx / r) * 3);
        if (dd.dist < 1.4) {
          d.dead = true;
          if (d.charged) {
            this.hp -= this.maxHp * 0.333;
            this.hurtT = 0.5;
            ctx.say("OBIL's core collides with charged debris! (-33.3%)", "#ff2850");
            ctx.setBoss({ name: "OBIL — The Gravity Obelisk", hp: Math.max(0, this.hp), max: this.maxHp });
            if (this.hp <= 1 && !this.dead) {
              this.dead = true;
              this.onDeath(ctx);
            }
          }
        }
      } else {
        // outward spiral orbit
        const targetR = Math.min(this.shellR + 2, 14);
        const tx = -dd.dz / r, tz = dd.dx / r;
        d.vel.set(tx * 6 + (dd.dx / r) * (targetR - r), (4 + Math.sin(this.animT + d.id) * 2 - dd.dy) * 1.5, tz * 6 + (dd.dz / r) * (targetR - r));
      }
    }
    const eye = this.group.getObjectByName("eye");
    if (eye) eye.scale.setScalar(phase === "rest" ? 1.6 : 1);
    this.group.rotation.y = 0;
    this.sync();
  }
}

// ===== BOSS 2: THE WARPER =====
export class Warper extends Entity {
  shield: THREE.Mesh[] = [];
  shieldHp: number[] = [];
  pikeT = 3;
  pike: THREE.Mesh;
  pikeExt = 0;
  pikeDir = new THREE.Vector3();
  constructor(x: number, y: number, z: number, killLog: string[]) {
    super(x, y, z);
    this.kind = "warper";
    this.label = "THE WARPER";
    this.hp = this.maxHp = 200;
    this.gravity = false;
    this.group.add(warperModel());
    this.radius = 2.5;
    this.height = 3;
    // stitch the assets of all killed enemies into a fleshy shield
    const colors: Record<string, string> = { pig: "#f0a0b0", cow: "#f4f4f0", chicken: "#fff", skeleton: "#e8e4d8", false_player: "#000", flamingo: "#ff7aa8", kiwi: "#7a5a32", frog: "#5aa83a", obil: "#14141c" };
    const log = killLog.length ? killLog.slice(-24) : ["skeleton", "pig", "cow", "chicken"];
    log.forEach((k, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshLambertMaterial({ color: colors[k] ?? "#a04060", emissive: "#300010" }));
      const phi = Math.acos(1 - (2 * (i + 0.5)) / log.length), th = Math.PI * (1 + Math.sqrt(5)) * i;
      m.position.set(Math.sin(phi) * Math.cos(th) * 2.4, Math.cos(phi) * 2.4, Math.sin(phi) * Math.sin(th) * 2.4);
      m.userData.kind = k;
      this.group.add(m);
      this.shield.push(m);
      this.shieldHp.push(6);
    });
    this.pike = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 1, 6), mat("#e8d0c0"));
    this.pike.visible = false;
    this.group.add(this.pike);
  }
  hurt(amount: number, ctx: Ctx) {
    const alive = this.shieldHp.findIndex((h) => h > 0);
    if (alive >= 0) {
      this.shieldHp[alive] -= amount;
      if (this.shieldHp[alive] <= 0) {
        this.shield[alive].visible = false;
        ctx.say(`Ripped a stitched ${this.shield[alive].userData.kind} from the Warper's flesh shield.`, "#ff7a9a");
      }
      this.hurtT = 0.2;
      return;
    }
    super.hurt(amount, ctx);
    if (!this.dead) ctx.setBoss({ name: "THE WARPER", hp: this.hp, max: this.maxHp });
  }
  onDeath(ctx: Ctx) {
    ctx.onBossDefeated("THE WARPER");
  }
  update(dt: number, ctx: Ctx) {
    this.animT += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    const pd = gdelta(this.pos.x, this.pos.y, this.pos.z, ctx.player.x, ctx.player.y + 1, ctx.player.z);
    this.yaw = Math.atan2(pd.dx, pd.dz);
    const ground = ctx.world.surfaceY(Math.floor(this.pos.x), Math.floor(this.pos.z));
    this.pos.y += (ground + 5 - this.pos.y) * dt;
    if (pd.dist > 8) {
      this.pos.x = (this.pos.x + ((pd.dx / pd.dist) * 2 * dt) / xScale(this.pos.y) + N) % N;
      this.pos.z += (pd.dz / pd.dist) * 2 * dt;
    }
    this.shield.forEach((m, i) => {
      m.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * (0.6 + (i % 3) * 0.2));
    });
    // skewer pikes
    this.pikeT -= dt;
    if (this.pikeT <= 0 && this.pikeExt === 0) {
      this.pikeT = 2.6;
      this.pikeExt = 0.001;
      const pitch = Math.atan2(pd.dy, Math.hypot(pd.dx, pd.dz));
      this.pikeDir.set(pitch, pd.dist, 0);
    }
    if (this.pikeExt > 0) {
      this.pikeExt += dt * 1.6;
      const len = Math.min(1, this.pikeExt < 0.5 ? this.pikeExt * 2 : 2 - this.pikeExt * 2) * (this.pikeDir.y + 2);
      this.pike.visible = true;
      this.pike.scale.y = Math.max(0.01, len);
      this.pike.rotation.set(Math.PI / 2 - this.pikeDir.x, 0, 0);
      this.pike.position.set(0, Math.sin(this.pikeDir.x) * len * 0.5, Math.cos(this.pikeDir.x) * len * 0.5);
      if (len > this.pikeDir.y - 0.5 && pd.dist < this.pikeDir.y + 1.5 && Math.abs(pd.dist - this.pikeDir.y) < 1.5 && this.pikeExt > 0.45 && this.pikeExt < 0.55) {
        ctx.damagePlayer(12, "Warper skewer pike");
      }
      if (this.pikeExt >= 1) {
        this.pikeExt = 0;
        this.pike.visible = false;
      }
    }
    this.sync();
  }
}

export class RemoteMoth extends Entity {
  target = new THREE.Vector3();
  targetYaw = 0;
  lastSeen = performance.now();
  constructor(public peerId: string) {
    super(0, 0, 0);
    this.kind = "peer";
    this.label = "LAN Moth " + peerId.slice(0, 4);
    this.invulnerable = true;
    this.group.add(mothModel(false));
    this.gravity = false;
  }
  update(dt: number) {
    let dx = this.target.x - this.pos.x;
    if (dx > N / 2) this.pos.x += N;
    if (dx < -N / 2) this.pos.x -= N;
    dx = this.target.x - this.pos.x;
    this.pos.x += dx * Math.min(1, dt * 10);
    this.pos.y += (this.target.y - this.pos.y) * Math.min(1, dt * 10);
    this.pos.z += (this.target.z - this.pos.z) * Math.min(1, dt * 10);
    this.yaw = this.targetYaw;
    if (performance.now() - this.lastSeen > 5000) this.dead = true;
    this.sync();
  }
}
