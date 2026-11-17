// People: the player on foot, and pedestrians with somewhere to be.
//
// Every pedestrian runs a small state machine — stroll, chat, flee,
// down — and comes in three kinds: walkers who stroll the sidewalks,
// joggers who run the beach, and loiterers who hang around the
// landmarks and talk. Two walkers who bump into each other may stop
// and chat for a while, facing each other, before moving on.
import { PLAYER_STATS, PED_NAMES, SHORE, clamp, distSq } from './config.js';
import { AVENUES, STREETS } from './city.js';
import { seeded, choose, between } from './rng.js';

let nextPedId = 1;

const SHIRT_COLORS = ['#d94f70', '#4f7fd9', '#e8b23f', '#58a86b', '#9a5fd0', '#d97b4f'];
const SKIN_TONES = ['#f0c8a0', '#c98d5f', '#8a5a3b', '#f5d7b0'];

// Turn an angle difference into the [-PI, PI] range.
function shortestTurn(d) {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Read WASD/arrows into a unit movement vector (or null when idle).
function readMoveInput(keys) {
  let ix = 0;
  let iy = 0;
  if (keys.KeyW || keys.ArrowUp) iy -= 1;
  if (keys.KeyS || keys.ArrowDown) iy += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  const len = Math.hypot(ix, iy);
  if (len === 0) return null;
  return { x: ix / len, y: iy / len };
}

export class Ped {
  constructor(x, y, rng, kind = 'walker') {
    this.id = nextPedId++;
    this.x = x;
    this.y = y;
    this.kind = kind; // walker | jogger | loiterer
    this.name = choose(rng, PED_NAMES);
    this.color = SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)];
    this.skin = SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)];
    this.angle = rng() * Math.PI * 2;
    this.speed = kind === 'jogger' ? between(rng, 110, 150) : between(rng, 35, 70);
    this.state = 'stroll'; // stroll | chat | flee | down
    this.target = null;
    this.chatTimer = 0;
    this.chatPartner = null;
    this.fleeTimer = 0;
    this.idleTimer = kind === 'loiterer' ? between(rng, 4, 10) : 0;
    this.r = 11;
  }

  // Pick a destination that fits the kind: joggers run the beach,
  // loiterers shuffle between nearby spots, walkers cross the city.
  chooseDestination(rng) {
    if (this.kind === 'jogger') {
      this.target = {
        x: between(rng, 120, 3400),
        y: SHORE.sandY + between(rng, 20, 120),
      };
      return;
    }
    if (this.kind === 'loiterer') {
      this.target = {
        x: this.x + between(rng, -160, 160),
        y: this.y + between(rng, -160, 160),
      };
      return;
    }
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
    if (this.state === 'chat') {
      this.chatTimer -= dt;
      if (this.chatPartner && this.chatPartner.state === 'chat') {
        this.angle = Math.atan2(this.chatPartner.y - this.y, this.chatPartner.x - this.x);
      }
      if (this.chatTimer <= 0) {
        this.state = 'stroll';
        this.chatPartner = null;
        this.target = null;
      }
      return;
    }
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) {
        this.state = 'stroll';
        this.target = null;
      }
    }
    if (this.kind === 'loiterer' && this.idleTimer > 0) {
      this.idleTimer -= dt;
      if (this.idleTimer <= 0) this.chooseDestination(rng);
      return;
    }
    if (!this.target) this.chooseDestination(rng);
    this.walkTowardTarget(dt, game);
  }

  // Step toward the current target, turning smoothly and sliding out
  // of buildings. Returns true when the target is reached.
  walkTowardTarget(dt, game) {
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 12) {
      this.target = null;
      if (this.kind === 'loiterer') this.idleTimer = between(Math.random, 3, 9);
      return true;
    }
    const want = Math.atan2(dy, dx);
    const turnRate = this.state === 'flee' ? 4 : 3;
    this.angle += clamp(shortestTurn(want - this.angle), -turnRate * dt, turnRate * dt);
    const speed = this.state === 'flee' ? this.speed * 2.4 : this.speed;
    this.x += Math.cos(this.angle) * speed * dt;
    this.y += Math.sin(this.angle) * speed * dt;
    const push = game.city.collideCircle(this.x, this.y, this.r);
    if (push) {
      this.x += push.x;
      this.y += push.y;
    }
    return false;
  }

  // Two strolling walkers who meet stop for a chat.
  tryChatWith(other, rng) {
    if (this.kind !== 'walker' || other.kind !== 'walker') return false;
    if (this.state !== 'stroll' || other.state !== 'stroll') return false;
    if (rng() > 0.35) return false;
    const seconds = between(rng, 3, 7);
    this.state = 'chat';
    this.chatTimer = seconds;
    this.chatPartner = other;
    this.target = null;
    other.state = 'chat';
    other.chatTimer = seconds;
    other.chatPartner = this;
    other.target = null;
    return true;
  }

  scare(fromX, fromY) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.chatPartner = null;
    this.fleeTimer = 3 + Math.random() * 2;
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    this.target = { x: this.x + (dx / d) * 320, y: this.y + (dy / d) * 320 };
  }

  knockDown() {
    this.state = 'down';
    this.target = null;
    this.chatPartner = null;
  }
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
    const dir = readMoveInput(keys);
    if (dir) {
      this.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
      const speed = this.sprint ? PLAYER_STATS.sprint : PLAYER_STATS.walk;
      this.vx = dir.x * speed;
      this.vy = dir.y * speed;
      this.angle = Math.atan2(dir.y, dir.x);
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

  // Everyone within fist range of the swing point goes down.
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

  // Find the first person or car along a ray from (x, y) at an angle.
  firstAlongRay(game, x, y, angle, rangePx) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let best = null;
    let bestAlong = rangePx;
    const consider = (ox, oy, r, obj) => {
      const dx = ox - x;
      const dy = oy - y;
      const along = dx * cos + dy * sin;
      if (along < 0 || along > bestAlong) return;
      const perp = Math.abs(-dx * sin + dy * cos);
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
    return best;
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
    const hit = this.firstAlongRay(game, this.x, this.y, this.angle, rangePx);
    if (hit) {
      if (hit.kind === 'ped') {
        hit.ped.knockDown();
        game.addCrime(1, 'Pedestrian down! A witness called it in.');
        game.addParticles(hit.ped.x, hit.ped.y, 10, '#e33f2f');
        game.addCash(25, hit.ped.x, hit.ped.y);
      } else if (hit.kind === 'cop') {
        hit.cop.knockDown();
        game.addCrime(2, 'You shot a cop! Wanted level way up.');
        game.addParticles(hit.cop.x, hit.cop.y, 10, '#e33f2f');
      } else {
        hit.car.damage(34, game);
        game.addCrime(1, 'You shot at a car!');
        game.addParticles(hit.car.x, hit.car.y, 8, '#f2c230');
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
      const roll = this.rng();
      const x = nearX + (this.rng() - 0.5) * 1500;
      const y = nearY + (this.rng() - 0.5) * 1100;
      if (roll < 0.15) {
        // A beach jogger, running the sand.
        this.peds.push(new Ped(between(this.rng, 200, 3400), SHORE.sandY + between(this.rng, 25, 110), this.rng, 'jogger'));
      } else if (roll < 0.3) {
        // A loiterer near a landmark, with nowhere urgent to be.
        const spots = Object.values(this.city.landmarks);
        const spot = spots[Math.floor(this.rng() * spots.length)];
        this.peds.push(new Ped(spot.x + between(this.rng, -90, 90), spot.y + between(this.rng, -90, 90), this.rng, 'loiterer'));
      } else {
        this.peds.push(new Ped(x, y, this.rng, 'walker'));
      }
    }
  }

  update(dt, game) {
    for (const ped of this.peds) ped.update(dt, game, this.rng);
    this.pairUpChatters();
    const px = game.player.x;
    const py = game.player.y;
    this.peds = this.peds.filter((ped) => {
      const limit = ped.state === 'down' ? 900 : 1300;
      return distSq(ped.x, ped.y, px, py) < limit * limit;
    });
  }

  // Walkers who cross paths may stop and talk for a while.
  pairUpChatters() {
    const walkers = this.peds.filter((p) => p.state === 'stroll' && p.kind === 'walker');
    for (let i = 0; i < walkers.length; i++) {
      for (let j = i + 1; j < walkers.length; j++) {
        const a = walkers[i];
        const b = walkers[j];
        if (a.state !== 'stroll' || b.state !== 'stroll') continue;
        if (distSq(a.x, a.y, b.x, b.y) < 40 * 40) a.tryChatWith(b, this.rng);
      }
    }
  }

  scareNear(x, y, radius) {
    for (const ped of this.peds) {
      if (distSq(ped.x, ped.y, x, y) < radius * radius) ped.scare(x, y);
    }
  }
}
