// People: the player on foot, and pedestrians with somewhere to be.
// State machine — stroll, chat, flee, down — in five kinds: walkers,
// joggers, loiterers, vendors at a food stall, taxi drivers by the
// kerb. Vendors never move: walk up, press E, snack $15, +25 HP.
// v6 touched this file lightly: same people, same behaviour,
// a few internal names refreshed.
import { PLAYER_STATS, PED_NAMES, SHORE, SNACK, clamp, distSq } from './config.js';
import { AVENUES, STREETS } from './city.js';
import { seeded, choose, between } from './rng.js';

let nextId = 1;

const TOP_COLORS = ['#d94f70', '#4f7fd9', '#e8b23f', '#58a86b', '#9a5fd0', '#d97b4f'];
const SKIN_TONES = ['#f0c8a0', '#c98d5f', '#8a5a3b', '#f5d7b0'];

// Fixed stalls: one on the Marina strip, one outside Club Flamingo.
export const VENDOR_SPOTS = [
  { x: 2900, y: 2290, angle: -Math.PI / 2 },
  { x: 2100, y: 700, angle: Math.PI / 2 },
];

function wrapDelta(delta) {
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function readInputDir(keys) {
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
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.kind = kind; // walker | jogger | loiterer | vendor | taxiDriver | tourist
    this.name = choose(rng, PED_NAMES);
    this.color = TOP_COLORS[Math.floor(rng() * TOP_COLORS.length)];
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
    this.isCop = false;
  }

  // Destination by kind: joggers the beach, loiterers nearby, walkers the city.
  chooseSpot(rng) {
    if (this.kind === 'jogger') {
      this.target = {
        x: between(rng, 120, 3400),
        y: SHORE.sandY + between(rng, 20, 120),
      };
      return;
    }
    // Tourists drift between the sights: the marina, the park, the
    // beachfront — camera out, stopping to take in the view.
    if (this.kind === 'tourist') {
      const stops = [
        { x: 2900, y: 2260 },
        { x: 1560, y: 800 },
        { x: 800, y: 2400 },
      ];
      const stop = stops[Math.floor(rng() * stops.length)];
      this.target = {
        x: stop.x + between(rng, -120, 120),
        y: stop.y + between(rng, -120, 120),
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
    if (this.kind === 'vendor' || this.kind === 'taxiDriver') {
      this.target = null;
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
    // A vendor minds the stall: only a knockdown moves them.
    if (this.kind === 'vendor') return;
    if (this.kind === 'taxiDriver') {
      this.idleTimer -= dt;
      if (this.idleTimer <= 0) {
        this.idleTimer = 1.5 + Math.random();
        this.angle += (Math.random() - 0.5) * 1.2;
      }
      return;
    }
    // A tourist pauses at every sight to take a photo, then drifts on.
    if (this.kind === 'tourist' && this.idleTimer > 0) {
      this.idleTimer -= dt;
      if (this.idleTimer <= 0) this.chooseSpot(rng);
      return;
    }
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
      if (this.idleTimer <= 0) this.chooseSpot(rng);
      return;
    }
    if (!this.target) this.chooseSpot(rng);
    this.stepToTarget(dt, game);
  }

  // Step toward the target, turning smoothly, sliding out of buildings.
  stepToTarget(dt, game) {
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const gap = Math.hypot(dx, dy);
    if (gap < 12) {
      this.target = null;
      if (this.kind === 'loiterer') this.idleTimer = between(Math.random, 3, 9);
      // A tourist who arrives at a sight stops to take a photo.
      if (this.kind === 'tourist') this.idleTimer = between(Math.random, 2, 5);
      return true;
    }
    const heading = Math.atan2(dy, dx);
    const turn = this.state === 'flee' ? 4 : 3;
    this.angle += clamp(wrapDelta(heading - this.angle), -turn * dt, turn * dt);
    const pace = this.state === 'flee' ? this.speed * 2.4 : this.speed;
    this.x += Math.cos(this.angle) * pace * dt;
    this.y += Math.sin(this.angle) * pace * dt;
    const push = game.city.collideCircle(this.x, this.y, this.r);
    if (push) {
      this.x += push.x;
      this.y += push.y;
    }
    return false;
  }

  tryChat(other, rng) {
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
    if (this.kind === 'vendor') return; // the stall stays put
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
    const dir = readInputDir(keys);
    if (dir) {
      this.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
      const pace = this.sprint ? PLAYER_STATS.sprint : PLAYER_STATS.walk;
      this.vx = dir.x * pace;
      this.vy = dir.y * pace;
      this.angle = Math.atan2(dir.y, dir.x);
    } else {
      // Friction: coast to a stop.
      const friction = Math.max(0, 1 - 10 * dt);
      this.vx *= friction;
      this.vy *= friction;
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

  aimAt(wx, wy) {
    this.angle = Math.atan2(wy - this.y, wx - this.x);
  }

  punch(game) {
    if (this.punchCooldown > 0) return false;
    this.punchCooldown = 0.35;
    game.sounds.punch();
    const tx = this.x + Math.cos(this.angle) * 26;
    const ty = this.y + Math.sin(this.angle) * 26;
    let landed = false;
    for (const ped of game.crowd.peds) {
      if (ped.state === 'down') continue;
      if (distSq(tx, ty, ped.x, ped.y) < 30 * 30) {
        ped.knockDown();
        game.addCrime(1, 'You knocked out a pedestrian!');
        game.addParticles(ped.x, ped.y, 8, '#ffd23f');
        game.addCash(20, ped.x, ped.y);
        landed = true;
      }
    }
    for (const cop of game.cops) {
      if (cop.state === 'down') continue;
      if (distSq(tx, ty, cop.x, cop.y) < 30 * 30) {
        cop.knockDown();
        game.addCrime(2, 'You floored a cop! The precinct will hear about this.');
        landed = true;
      }
    }
    for (const member of game.gangs.members) {
      if (member.state === 'down') continue;
      if (distSq(tx, ty, member.x, member.y) < 30 * 30) {
        member.knockDown();
        game.addCrime(1, `You dropped a ${member.crew.name}! Their crew saw that.`);
        game.addParticles(member.x, member.y, 8, '#ffd23f');
        game.addCash(30, member.x, member.y);
        game.gangs.retaliate(member.crew.name, game);
        game.gangs.scatterNear(member.x, member.y, 200);
        landed = true;
      }
    }
    if (landed && game.stats) game.stats.recordKnockdown();
    return landed;
  }

  firstOnRay(game, x, y, angle, rangePx) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let best = null;
    let bestDist = rangePx;
    const scan = (ox, oy, r, obj) => {
      const dx = ox - x;
      const dy = oy - y;
      const depth = dx * cos + dy * sin;
      if (depth < 0 || depth > bestDist) return;
      const side = Math.abs(-dx * sin + dy * cos);
      if (side < r + 6) {
        bestDist = depth;
        best = obj;
      }
    };
    for (const ped of game.crowd.peds) {
      if (ped.state !== 'down') scan(ped.x, ped.y, ped.r, { kind: 'ped', ped });
    }
    for (const cop of game.cops) {
      if (cop.state !== 'down') scan(cop.x, cop.y, cop.r, { kind: 'cop', cop });
    }
    for (const member of game.gangs.members) {
      if (member.state !== 'down') scan(member.x, member.y, member.r, { kind: 'gang', member });
    }
    for (const car of game.traffic.cars) {
      if (!car.dead) scan(car.x, car.y, 24, { kind: 'car', car });
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
    const range = 520;
    const tipX = this.x + Math.cos(this.angle) * range;
    const tipY = this.y + Math.sin(this.angle) * range;
    game.addTracer(this.x, this.y, tipX, tipY);
    const hit = this.firstOnRay(game, this.x, this.y, this.angle, range);
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
      } else if (hit.kind === 'gang') {
        hit.member.knockDown();
        game.addCrime(1, `You shot a ${hit.member.crew.name}! Their crew saw that.`);
        game.addParticles(hit.member.x, hit.member.y, 10, '#e33f2f');
        game.addCash(30, hit.member.x, hit.member.y);
        game.gangs.retaliate(hit.member.crew.name, game);
        game.gangs.scatterNear(hit.member.x, hit.member.y, 200);
      } else {
        hit.car.damage(34, game);
        game.addCrime(1, 'You shot at a car!');
        game.addParticles(hit.car.x, hit.car.y, 8, '#f2c230');
      }
    }
    if (hit && hit.kind !== 'car' && game.stats) game.stats.recordKnockdown();
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

  // Buy a snack at a stall ($15, +25 HP). Returns true if it went through.
  buySnack(game) {
    const vendor = game.crowd.nearestVendor(this.x, this.y, 64);
    if (!vendor || vendor.state === 'down') return false;
    if (this.money < SNACK.price) {
      game.hud.toast('NO CASH', `A snack costs $${SNACK.price} — you're short.`, 3);
      return false;
    }
    if (this.health >= PLAYER_STATS.health) {
      game.hud.toast('ALREADY FULL', "You're at full health — save your money, Marco.", 3);
      return false;
    }
    this.money -= SNACK.price;
    this.heal(SNACK.heal);
    game.sounds.snack();
    game.addParticles(vendor.x, vendor.y, 8, '#58d068');
    game.hud.toast('SNACK', `+$${SNACK.price} well spent — +${SNACK.heal} HP. Best arepas in the Bay.`, 3);
    return true;
  }
}

export class Crowd {
  constructor(city) {
    this.city = city;
    this.peds = [];
    this.rng = seeded(4242);
    this.vendorsPlaced = false;
  }

  spawn(count, nearX, nearY) {
    for (let i = 0; i < count; i++) {
      const roll = this.rng();
      const x = nearX + (this.rng() - 0.5) * 1500;
      const y = nearY + (this.rng() - 0.5) * 1100;
      if (roll < 0.15) {
        this.peds.push(new Ped(between(this.rng, 200, 3400), SHORE.sandY + between(this.rng, 25, 110), this.rng, 'jogger'));
      } else if (roll < 0.3) {
        const places = Object.values(this.city.landmarks);
        const place = places[Math.floor(this.rng() * places.length)];
        this.peds.push(new Ped(place.x + between(this.rng, -90, 90), place.y + between(this.rng, -90, 90), this.rng, 'loiterer'));
      } else if (roll < 0.42) {
        // Tourists with cameras, drifting between the sights.
        this.peds.push(new Ped(between(this.rng, 200, 3400), between(this.rng, 200, 2200), this.rng, 'tourist'));
      } else {
        this.peds.push(new Ped(x, y, this.rng, 'walker'));
      }
    }
  }

  // Put the stalls out once: a vendor per fixed spot, a taxi driver by the club.
  spawnVendors() {
    if (this.vendorsPlaced) return;
    this.vendorsPlaced = true;
    for (const spot of VENDOR_SPOTS) {
      const vendor = new Ped(spot.x, spot.y, this.rng, 'vendor');
      vendor.angle = spot.angle;
      vendor.color = '#e8e4da';
      this.peds.push(vendor);
    }
    const club = this.city.landmarks.club;
    const driver = new Ped(club.x + 60, club.y + 120, this.rng, 'taxiDriver');
    driver.color = '#f2c230';
    this.peds.push(driver);
  }

  nearestVendor(x, y, maxDist) {
    let best = null;
    let bestDist = maxDist * maxDist;
    for (const ped of this.peds) {
      if (ped.kind !== 'vendor' || ped.state === 'down') continue;
      const d = distSq(x, y, ped.x, ped.y);
      if (d < bestDist) {
        bestDist = d;
        best = ped;
      }
    }
    return best;
  }

  update(dt, game) {
    for (const ped of this.peds) ped.update(dt, game, this.rng);
    this.pairChatters();
    const px = game.player.x;
    const py = game.player.y;
    this.peds = this.peds.filter((ped) => {
      // Vendors and taxi drivers are fixtures: they never despawn.
      if (ped.kind === 'vendor' || ped.kind === 'taxiDriver') return true;
      const limit = ped.state === 'down' ? 900 : 1300;
      return distSq(ped.x, ped.y, px, py) < limit * limit;
    });
  }

  pairChatters() {
    const walkers = this.peds.filter((ped) => ped.state === 'stroll' && ped.kind === 'walker');
    for (let i = 0; i < walkers.length; i++) {
      for (let j = i + 1; j < walkers.length; j++) {
        const a = walkers[i];
        const b = walkers[j];
        if (a.state !== 'stroll' || b.state !== 'stroll') continue;
        if (distSq(a.x, a.y, b.x, b.y) < 40 * 40) a.tryChat(b, this.rng);
      }
    }
  }

  scareNear(x, y, radius) {
    for (const ped of this.peds) {
      if (distSq(ped.x, ped.y, x, y) < radius * radius) ped.scare(x, y);
    }
  }
}
