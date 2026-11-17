// People: the player on foot, pedestrians with somewhere to be,
// and the fists-and-pistol combat between them.
import { PLAYER_STATS, PED_NAMES, clamp, distSq } from './config.js';
import { AVENUES, STREETS } from './city.js';
import { seeded, choose, between } from './rng.js';

let nextPedId = 1;

const SHIRT_COLORS = ['#d94f70', '#4f7fd9', '#e8b23f', '#58a86b', '#9a5fd0', '#d97b4f'];
const SKIN_TONES = ['#f0c8a0', '#c98d5f', '#8a5a3b', '#f5d7b0'];

export class Ped {
  constructor(x, y, rng) {
    this.id = nextPedId++;
    this.x = x;
    this.y = y;
    this.name = choose(rng, PED_NAMES);
    this.color = SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)];
    this.skin = SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)];
    this.angle = rng() * Math.PI * 2;
    this.speed = between(rng, 35, 70);
    this.state = 'walk'; // walk | flee | down
    this.target = null;
    this.fleeTimer = 0;
    this.r = 11;
  }

  // Stroll along a sidewalk: pick a point on a nearby road, offset to one side.
  pickTarget(rng) {
    if (rng() < 0.5) {
      const avenue = choose(rng, AVENUES);
      this.target = { x: avenue + (rng() < 0.5 ? -1 : 1) * 46, y: between(rng, 120, 2200) };
    } else {
      const street = choose(rng, STREETS);
      this.target = { x: between(rng, 120, 3400), y: street + (rng() < 0.5 ? -1 : 1) * 46 };
    }
  }

  update(dt, game, rng) {
    if (this.state === 'down') return;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) {
        this.state = 'walk';
        this.target = null;
      }
    }
    if (!this.target) this.pickTarget(rng);
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 12) {
      this.target = null;
      return;
    }
    const want = Math.atan2(dy, dx);
    this.angle += clamp(wrapAngleDelta(want - this.angle), -3 * dt, 3 * dt);
    const speed = this.state === 'flee' ? this.speed * 2.4 : this.speed;
    this.x += Math.cos(this.angle) * speed * dt;
    this.y += Math.sin(this.angle) * speed * dt;
    const push = game.city.collideCircle(this.x, this.y, this.r);
    if (push) {
      this.x += push.x;
      this.y += push.y;
    }
  }

  scare(fromX, fromY) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.fleeTimer = 3 + Math.random() * 2;
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    this.target = { x: this.x + (dx / d) * 320, y: this.y + (dy / d) * 320 };
  }

  knockDown() {
    this.state = 'down';
    this.target = null;
  }
}

function wrapAngleDelta(d) {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = -Math.PI / 2;
    this.vx = 0;
    this.vy = 0;
    this.health = PLAYER_STATS.health;
    this.money = 250;
    this.weapon = 'fists'; // fists | pistol
    this.ammo = 0;
    this.inCar = false;
    this.r = PLAYER_STATS.radius;
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.hurtFlash = 0;
    this.sprint = false;
  }

  move(keys, dt, game) {
    let ix = 0;
    let iy = 0;
    if (keys.KeyW || keys.ArrowUp) iy -= 1;
    if (keys.KeyS || keys.ArrowDown) iy += 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    const len = Math.hypot(ix, iy);
    if (len > 0) {
      ix /= len;
      iy /= len;
      this.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
      const speed = this.sprint ? PLAYER_STATS.sprint : PLAYER_STATS.walk;
      this.vx = ix * speed;
      this.vy = iy * speed;
      this.angle = Math.atan2(iy, ix);
    } else {
      // Friction: coast to a stop.
      const damp = Math.max(0, 1 - 10 * dt);
      this.vx *= damp;
      this.vy *= damp;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, 20, 3580);
    this.y = clamp(this.y, 20, 2580);
    const push = game.city.collideCircle(this.x, this.y, this.r);
    if (push) {
      this.x += push.x;
      this.y += push.y;
    }
    if (this.punchCooldown > 0) this.punchCooldown -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
  }

  // When armed, the player faces the mouse cursor.
  aimAt(wx, wy) {
    this.angle = Math.atan2(wy - this.y, wx - this.x);
  }

  punch(game) {
    if (this.punchCooldown > 0) return false;
    this.punchCooldown = 0.35;
    game.sounds.punch();
    const fx = this.x + Math.cos(this.angle) * 26;
    const fy = this.y + Math.sin(this.angle) * 26;
    let landed = false;
    for (const ped of game.crowd.peds) {
      if (ped.state === 'down') continue;
      if (distSq(fx, fy, ped.x, ped.y) < 30 * 30) {
        ped.knockDown();
        game.addCrime(1, 'You knocked out a pedestrian!');
        game.addParticles(ped.x, ped.y, 8, '#ffd23f');
        game.addCash(20, ped.x, ped.y);
        landed = true;
      }
    }
    for (const cop of game.cops) {
      if (cop.state === 'down') continue;
      if (distSq(fx, fy, cop.x, cop.y) < 30 * 30) {
        cop.knockDown();
        game.addCrime(2, 'You floored a cop! The precinct will hear about this.');
        landed = true;
      }
    }
    return landed;
  }

  shoot(game, wx, wy) {
    if (this.weapon !== 'pistol' || this.ammo <= 0 || this.shootCooldown > 0) return false;
    this.shootCooldown = 0.28;
    this.ammo -= 1;
    this.aimAt(wx, wy);
    game.sounds.gunshot();
    game.addMuzzle(this.x + Math.cos(this.angle) * 20, this.y + Math.sin(this.angle) * 20, this.angle);
    const rangePx = 520;
    const endX = this.x + Math.cos(this.angle) * rangePx;
    const endY = this.y + Math.sin(this.angle) * rangePx;
    game.addTracer(this.x, this.y, endX, endY);
    // Hit the first person or car along the shot line.
    let best = null;
    let bestAlong = rangePx;
    const consider = (ox, oy, r, obj) => {
      const dx = ox - this.x;
      const dy = oy - this.y;
      const along = dx * Math.cos(this.angle) + dy * Math.sin(this.angle);
      if (along < 0 || along > bestAlong) return;
      const perp = Math.abs(-dx * Math.sin(this.angle) + dy * Math.cos(this.angle));
      if (perp < r + 6) {
        bestAlong = along;
        best = obj;
      }
    };
    for (const ped of game.crowd.peds) {
      if (ped.state !== 'down') consider(ped.x, ped.y, ped.r, { kind: 'ped', ped });
    }
    for (const cop of game.cops) {
      if (cop.state !== 'down') consider(cop.x, cop.y, cop.r, { kind: 'cop', cop });
    }
    for (const car of game.traffic.cars) {
      if (!car.dead) consider(car.x, car.y, 24, { kind: 'car', car });
    }
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

  heal(amount) {
    this.health = Math.min(PLAYER_STATS.health, this.health + amount);
  }
}

export class Crowd {
  constructor(city) {
    this.city = city;
    this.peds = [];
    this.rng = seeded(4242);
  }

  spawn(count, nearX, nearY) {
    for (let i = 0; i < count; i++) {
      const x = nearX + (this.rng() - 0.5) * 1500;
      const y = nearY + (this.rng() - 0.5) * 1100;
      this.peds.push(new Ped(x, y, this.rng));
    }
  }

  update(dt, game) {
    for (const ped of this.peds) ped.update(dt, game, this.rng);
    const px = game.player.x;
    const py = game.player.y;
    this.peds = this.peds.filter((ped) => {
      const limit = ped.state === 'down' ? 900 : 1300;
      return distSq(ped.x, ped.y, px, py) < limit * limit;
    });
  }

  scareNear(x, y, radius) {
    for (const ped of this.peds) {
      if (distSq(ped.x, ped.y, x, y) < radius * radius) ped.scare(x, y);
    }
  }
}
