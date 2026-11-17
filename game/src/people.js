// People: the player on foot, pedestrians with somewhere to be,
// and the fists-and-pistol combat between them.
import { PLAYER, PED_NAMES, clamp, dist2 } from './config.js';
import { AVENUES, STREETS, isRoad } from './city.js';
import { mulberry32, pick, range } from './rng.js';

let nextPedId = 1;

export class Ped {
  constructor(x, y, rng) {
    this.id = nextPedId++;
    this.x = x; this.y = y;
    this.name = pick(rng, PED_NAMES);
    this.color = ['#d94f70', '#4f7fd9', '#e8b23f', '#58a86b', '#9a5fd0', '#d97b4f'][Math.floor(rng() * 6)];
    this.skin = ['#f0c8a0', '#c98d5f', '#8a5a3b', '#f5d7b0'][Math.floor(rng() * 4)];
    this.angle = rng() * Math.PI * 2;
    this.speed = range(rng, 35, 70);
    this.state = 'walk';   // walk | flee | down
    this.target = null;
    this.fleeTimer = 0;
    this.panicked = false;
    this.r = 11;
  }

  pickTarget(rng) {
    // Stroll along a sidewalk: pick a point on a nearby road, offset to the side.
    const onAve = rng() < 0.5;
    if (onAve) {
      const ax = pick(rng, AVENUES);
      this.target = { x: ax + (rng() < 0.5 ? -1 : 1) * 46, y: range(rng, 120, 2200) };
    } else {
      const sy = pick(rng, STREETS);
      this.target = { x: range(rng, 120, 3400), y: sy + (rng() < 0.5 ? -1 : 1) * 46 };
    }
  }

  update(dt, game, rng) {
    if (this.state === 'down') return;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) { this.state = 'walk'; this.target = null; }
    }
    if (!this.target) this.pickTarget(rng);
    const dx = this.target.x - this.x, dy = this.target.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 12) { this.target = null; return; }
    const want = Math.atan2(dy, dx);
    let diff = want - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.angle += clamp(diff, -3 * dt, 3 * dt);
    const sp = this.state === 'flee' ? this.speed * 2.4 : this.speed;
    this.x += Math.cos(this.angle) * sp * dt;
    this.y += Math.sin(this.angle) * sp * dt;
    const push = game.city.collideCircle(this.x, this.y, this.r);
    if (push) { this.x += push.x; this.y += push.y; }
  }

  scare(fromX, fromY) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.fleeTimer = 3 + Math.random() * 2;
    const dx = this.x - fromX, dy = this.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    this.target = { x: this.x + (dx / d) * 320, y: this.y + (dy / d) * 320 };
  }

  knockDown() { this.state = 'down'; this.target = null; }
}

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.angle = -Math.PI / 2;
    this.vx = 0; this.vy = 0;
    this.health = PLAYER.maxHealth;
    this.money = 250;
    this.weapon = 'fists';      // fists | pistol
    this.ammo = 0;
    this.inCar = false;
    this.r = PLAYER.radius;
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.hurtFlash = 0;
    this.sprint = false;
  }

  move(keys, dt, game) {
    let ix = 0, iy = 0;
    if (keys['KeyW'] || keys['ArrowUp']) iy -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) iy += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
    const len = Math.hypot(ix, iy);
    if (len > 0) {
      ix /= len; iy /= len;
      this.sprint = !!(keys['ShiftLeft'] || keys['ShiftRight']);
      const sp = this.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      this.vx = ix * sp; this.vy = iy * sp;
      this.angle = Math.atan2(iy, ix);
    } else {
      this.vx *= Math.max(0, 1 - 10 * dt);
      this.vy *= Math.max(0, 1 - 10 * dt);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, 20, 3580);
    this.y = clamp(this.y, 20, 2580);
    const push = game.city.collideCircle(this.x, this.y, this.r);
    if (push) { this.x += push.x; this.y += push.y; }
    if (this.punchCooldown > 0) this.punchCooldown -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
  }

  // Aim follows the mouse when armed; on foot the player faces the cursor.
  aimAt(wx, wy) { this.angle = Math.atan2(wy - this.y, wx - this.x); }

  punch(game) {
    if (this.punchCooldown > 0) return false;
    this.punchCooldown = 0.35;
    game.sounds.punch();
    const px = this.x + Math.cos(this.angle) * 26;
    const py = this.y + Math.sin(this.angle) * 26;
    let hit = false;
    for (const ped of game.crowd.peds) {
      if (ped.state === 'down') continue;
      if (dist2(px, py, ped.x, ped.y) < 30 * 30) {
        ped.knockDown();
        game.addCrime(1, 'You knocked out a pedestrian!');
        game.addParticles(ped.x, ped.y, 8, '#ffd23f');
        game.addCash(20, ped.x, ped.y);
        hit = true;
      }
    }
    for (const cop of game.cops) {
      if (cop.state === 'down') continue;
      if (dist2(px, py, cop.x, cop.y) < 30 * 30) {
        cop.knockDown();
        game.addCrime(2, 'You floored a cop! The precinct will hear about this.');
        hit = true;
      }
    }
    return hit;
  }

  shoot(game, wx, wy) {
    if (this.weapon !== 'pistol' || this.ammo <= 0 || this.shootCooldown > 0) return false;
    this.shootCooldown = 0.28;
    this.ammo -= 1;
    this.aimAt(wx, wy);
    game.sounds.gunshot();
    game.addMuzzle(this.x + Math.cos(this.angle) * 20, this.y + Math.sin(this.angle) * 20, this.angle);
    const rangePx = 520;
    const ex = this.x + Math.cos(this.angle) * rangePx;
    const ey = this.y + Math.sin(this.angle) * rangePx;
    game.addTracer(this.x, this.y, ex, ey);
    // Hit the first person or car along the shot line.
    let best = null, bd = rangePx;
    const consider = (ox, oy, r, obj) => {
      const dx = ox - this.x, dy = oy - this.y;
      const along = dx * Math.cos(this.angle) + dy * Math.sin(this.angle);
      if (along < 0 || along > bd) return;
      const perp = Math.abs(-dx * Math.sin(this.angle) + dy * Math.cos(this.angle));
      if (perp < r + 6) { bd = along; best = obj; }
    };
    for (const ped of game.crowd.peds) if (ped.state !== 'down') consider(ped.x, ped.y, ped.r, { kind: 'ped', ped });
    for (const cop of game.cops) if (cop.state !== 'down') consider(cop.x, cop.y, cop.r, { kind: 'cop', cop });
    for (const car of game.traffic.cars) if (!car.dead) consider(car.x, car.y, 24, { kind: 'car', car });
    if (best) {
      if (best.kind === 'ped') {
        best.ped.knockDown();
        game.addCrime(1, 'Pedestrian down! A witness called it in.');
        game.addParticles(best.ped.x, best.ped.y, 10, '#e33f2f');
        game.addCash(25, best.ped.x, best.ped.y);
      } else if (best.kind === 'cop') {
        best.cop.knockDown();
        game.addCrime(2, 'You shot a cop! Wanted level way up.');
        game.addParticles(best.cop.x, best.cop.y, 10, '#e33f2f');
      } else {
        best.car.damage(34, game);
        game.addCrime(1, 'You shot at a car!');
        game.addParticles(best.car.x, best.car.y, 8, '#f2c230');
      }
    }
    game.addCrime(0.4, '', true); // gunfire alone draws a little heat
    return true;
  }

  hurt(amount, game) {
    this.health -= amount;
    this.hurtFlash = 0.4;
    if (this.health <= 0) {
      this.health = 0;
      game.wasted();
    }
  }

  heal(amount) { this.health = Math.min(PLAYER.maxHealth, this.health + amount); }
}

export class Crowd {
  constructor(city) {
    this.city = city;
    this.peds = [];
    this.rng = mulberry32(4242);
  }

  spawn(count, nearX, nearY) {
    for (let i = 0; i < count; i++) {
      const x = nearX + (this.rng() - 0.5) * 1500;
      const y = nearY + (this.rng() - 0.5) * 1100;
      const p = new Ped(x, y, this.rng);
      this.peds.push(p);
    }
  }

  update(dt, game) {
    for (const p of this.peds) p.update(dt, game, this.rng);
    const px = game.player.x, py = game.player.y;
    this.peds = this.peds.filter((p) => {
      if (p.state === 'down') return dist2(p.x, p.y, px, py) < 900 * 900;
      return dist2(p.x, p.y, px, py) < 1300 * 1300;
    });
  }

  scareNear(x, y, radius) {
    for (const p of this.peds) {
      if (dist2(p.x, p.y, x, y) < radius * radius) p.scare(x, y);
    }
  }
}
