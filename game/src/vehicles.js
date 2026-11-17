// Vehicles: player driving physics, traffic that follows the roads,
// and police that chase the player when the heat is on.
import { WORLD, CAR, CAR_MODELS, clamp, angleLerp, dist2 } from './config.js';
import { AVENUES, STREETS, isRoad, roadPointNear } from './city.js';
import { mulberry32, pick, range } from './rng.js';

let nextId = 1;

export class Car {
  constructor(x, y, angle, modelIdx, opts = {}) {
    this.id = nextId++;
    this.x = x; this.y = y; this.angle = angle;
    this.model = CAR_MODELS[modelIdx % CAR_MODELS.length];
    this.speed = 0;
    this.color = opts.color || this.model.color;
    this.police = !!opts.police;
    this.taxi = !!this.model.taxi;
    this.w = 44; this.h = 22;           // footprint (length x width)
    this.health = 100;
    this.dead = false;
    this.smoke = 0;
    this.driver = opts.driver ?? null;  // 'traffic' | 'police' | 'parked' | null
    this.ai = null;                     // traffic brain
    this.siren = this.police;
    this.skid = 0;
    this.stuckTimer = 0;
    this.crashCooldown = 0;
  }

  get topSpeed() { return this.model.top; }

  // Arcade driving: forward speed + steering that bites harder at speed.
  drive(throttle, steer, handbrake, dt) {
    const top = this.topSpeed;
    if (throttle > 0) this.speed += this.model.accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 8) this.speed -= CAR.brake * dt;          // brake
      else this.speed += CAR.reverseAccel * throttle * dt;        // reverse
    } else {
      this.speed -= Math.sign(this.speed) * 140 * dt;             // drag
      if (Math.abs(this.speed) < 4) this.speed = 0;
    }
    if (handbrake) this.speed *= Math.max(0, 1 - 3.2 * dt);
    this.speed = clamp(this.speed, -CAR.maxReverse, top);
    const steerAmount = steer * CAR.steerRate * clamp(Math.abs(this.speed) / 140, 0.25, 1) * (handbrake ? 1.6 : 1);
    this.angle += steerAmount * Math.sign(this.speed) * dt * (this.speed < 0 ? -1 : 1);
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    this.x = clamp(this.x, 30, WORLD.w - 30);
    this.y = clamp(this.y, 30, WORLD.h - 30);
    if (handbrake && Math.abs(this.speed) > 120) this.skid = 1; else this.skid = Math.max(0, this.skid - dt * 2);
  }

  damage(amount, game) {
    this.health -= amount;
    if (this.health < 30) this.smoke = 1;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      game.explode(this.x, this.y, 26);
    }
  }

  // Simple circle-ish collision vs another car (treat as circles of r=20).
  collideWith(other) {
    const dx = other.x - this.x, dy = other.y - this.y;
    const d = Math.hypot(dx, dy);
    const min = 34;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      const nx = dx / d, ny = dy / d;
      this.x -= nx * push; this.y -= ny * push;
      other.x += nx * push; other.y += ny * push;
      const s = (this.speed + other.speed) / 2;
      this.speed = s * 0.4; other.speed = s * 0.4;
      return Math.abs(s);
    }
    return 0;
  }
}

export class Traffic {
  constructor(city) {
    this.city = city;
    this.cars = [];
    this.rng = mulberry32(777);
  }

  spawn(count, nearX, nearY) {
    for (let i = 0; i < count; i++) {
      const x = nearX + (this.rng() - 0.5) * 1600;
      const y = nearY + (this.rng() - 0.5) * 1200;
      const p = roadPointNear(x, y);
      const onAvenue = Math.abs(p.x - x) < Math.abs(p.y - y);
      const angle = onAvenue ? (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (this.rng() < 0.5 ? 0 : Math.PI);
      const c = new Car(p.x, p.y, angle, Math.floor(this.rng() * CAR_MODELS.length), { driver: 'traffic' });
      c.speed = range(this.rng, 90, 170);
      c.ai = { target: null, wait: 0 };
      this.cars.push(c);
    }
  }

  spawnPolice(x, y, angle) {
    const c = new Car(x, y, angle, 1, { driver: 'police', police: true, color: '#20242e' });
    c.speed = 200;
    this.cars.push(c);
    return c;
  }

  spawnParked(count) {
    for (let i = 0; i < count; i++) {
      const ax = pick(this.rng, AVENUES), sy = pick(this.rng, STREETS);
      const alongAve = this.rng() < 0.5;
      const x = alongAve ? ax + (this.rng() < 0.5 ? 1 : -1) * 52 : ax + range(this.rng, -200, 200);
      const y = alongAve ? sy + range(this.rng, -200, 200) : sy + (this.rng() < 0.5 ? 1 : -1) * 52;
      const angle = alongAve ? (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (this.rng() < 0.5 ? 0 : Math.PI);
      const c = new Car(x, y, angle, Math.floor(this.rng() * CAR_MODELS.length), { driver: 'parked' });
      this.cars.push(c);
    }
  }

  // Traffic follows the road grid: drive straight, turn at intersections.
  update(dt, game) {
    const player = game.player;
    for (const c of this.cars) {
      if (c.dead) continue;
      if (c.crashCooldown > 0) c.crashCooldown -= dt;
      if (c.driver === 'traffic') this.updateTrafficCar(c, dt, game);
      else if (c.driver === 'police') this.updatePoliceCar(c, dt, game);
      // Parked cars don't move; the city collision keeps them in place.
      // Keep every car inside the world and out of buildings.
      const push = this.city.collideCircle(c.x, c.y, 20);
      if (push) { c.x += push.x; c.y += push.y; c.speed *= 0.5; }
      if (c.smoke > 0) c.smoke = Math.max(0, c.smoke - dt * 0.15);
    }
    // Car-vs-car collisions.
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i], b = this.cars[j];
        if (a.dead || b.dead) continue;
        const hit = a.collideWith(b);
        if (hit > 60 && game) game.onCarCrash(a, b, hit);
      }
    }
    // Cull far-away traffic, keep the streets alive near the player.
    this.cars = this.cars.filter((c) => {
      if (c.driver === 'police') return !c.dead;
      if (c === game.playerCar) return true;
      return dist2(c.x, c.y, player.x, player.y) < 1600 * 1600 || c.driver === 'parked';
    });
  }

  updateTrafficCar(c, dt, game) {
    const ahead = { x: c.x + Math.cos(c.angle) * 60, y: c.y + Math.sin(c.angle) * 60 };
    if (!isRoad(ahead.x, ahead.y)) {
      // Reached an intersection: pick a new road direction.
      const options = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      const cur = Math.atan2(Math.sin(c.angle), Math.cos(c.angle));
      const snapped = options.reduce((best, o) => Math.abs(o - cur) < Math.abs(best - cur) ? o : best, 0);
      const turns = [snapped, snapped + Math.PI / 2, snapped - Math.PI / 2];
      const choice = pick(this.rng, turns);
      c.ai.target = choice;
    }
    if (c.ai.target != null) {
      c.angle = angleLerp(c.angle, c.ai.target, Math.min(1, dt * 3));
      if (Math.abs(c.angle - c.ai.target) < 0.05) c.ai.target = null;
    }
    // Slow down for the car ahead.
    let blocked = false;
    for (const o of this.cars) {
      if (o === c || o.dead) continue;
      const dx = o.x - c.x, dy = o.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 70) {
        const dot = (dx * Math.cos(c.angle) + dy * Math.sin(c.angle)) / d;
        if (dot > 0.7) { blocked = true; break; }
      }
    }
    const targetSpeed = blocked ? 0 : range(this.rng, 120, 170);
    const throttle = c.speed < targetSpeed ? 0.7 : 0;
    c.drive(throttle, 0, false, dt);
    // A scared driver swerves off when the player causes chaos nearby.
    if (game.wanted > 0 && dist2(c.x, c.y, game.player.x, game.player.y) < 220 * 220) {
      c.drive(1, 0, false, dt);
    }
  }

  updatePoliceCar(c, dt, game) {
    const p = game.player;
    const tx = p.inCar ? game.playerCar.x : p.x;
    const ty = p.inCar ? game.playerCar.y : p.y;
    const dx = tx - c.x, dy = ty - c.y;
    const d = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    let diff = want - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 1.6, -1, 1);
    const target = game.wanted >= 4 ? 520 : game.wanted >= 2 ? 470 : 420;
    const throttle = c.speed < target ? 1 : 0;
    c.drive(throttle, steer, false, dt);
    if (d < 46) {
      // Ram the player: damage their car or bust them on foot.
      if (p.inCar) game.playerCar.damage(18 * dt * 10, game);
      else game.bustPlayer();
    }
    if (d > 1400) { // lost the trail: despawn far police so the chase can end
      c.dead = true;
    }
  }

  nearestCar(x, y, maxDist, predicate) {
    let best = null, bd = maxDist * maxDist;
    for (const c of this.cars) {
      if (c.dead) continue;
      if (predicate && !predicate(c)) continue;
      const d = dist2(x, y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
}
