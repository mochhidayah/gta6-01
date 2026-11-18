// PoliceDirector: the wanted level, cruisers, foot cops, the
// helicopter, and roadblocks. Stars only fall while nobody can
// see Marco: sight is distance plus a building check, so walls
// and alleys are real cover.
import { WANTED_RULES, distSq } from './config.js';
import { Ped } from './people.js';

const CRUISER_SIGHT = 620; // how far a patrol car can spot Marco
const COP_SIGHT = 380; // how far a foot cop can spot him
const HELI_SIGHT = 820; // the helicopter sees almost everything
const HELI_ORBIT = 250; // how far out the helicopter circles
const HELI_STARS = 4; // stars needed before the helicopter lifts off
const BLOCK_STARS = 3; // stars needed before roadblocks go up
const BLOCK_EVERY = 14; // seconds between roadblock attempts
const QUIET_SECONDS = WANTED_RULES.coolOffDelay;
const SECONDS_PER_STAR = WANTED_RULES.coolOffStep;

// Sight check: sample points along the line; any inside a building blocks the view.
function blockedByBuilding(game, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.floor(len / 45));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    for (const b of game.city.buildings) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return true;
    }
  }
  return false;
}

// Can this watcher see Marco? Close, no wall between. The helicopter sees over rooftops.
function canSee(game, wx, wy, range, fromAir) {
  const p = game.player;
  const px = p.inCar && game.playerCar ? game.playerCar.x : p.x;
  const py = p.inCar && game.playerCar ? game.playerCar.y : p.y;
  if (distSq(wx, wy, px, py) > range * range) return false;
  if (fromAir) return true;
  return !blockedByBuilding(game, wx, wy, px, py);
}

export class PoliceDirector {
  constructor(game) {
    this.game = game;
    this.heli = null; // {x, y, angle, orbit, watching} or null
    this.blocks = []; // roadblocks: {cars:[a,b], x, y, age}
    this.quietFor = 0; // seconds Marco has been unseen
    this.seen = false; // anyone watching this frame?
    this.watched = false; // the helicopter has eyes on him
    this.spawnTimer = 0;
    this.copTimer = 0;
    this.blockTimer = 0;
    this.heliToasted = false;
  }

  playerPos() {
    const g = this.game;
    const p = g.player;
    if (p.inCar && g.playerCar) return { x: g.playerCar.x, y: g.playerCar.y };
    return { x: p.x, y: p.y };
  }

  policeCars() {
    return this.game.traffic.cars.filter((c) => c.police && !c.dead).length;
  }

  // --- crime and stars ---

  addCrime(stars, message, silent = false) {
    const g = this.game;
    if (g.state !== 'playing') return;
    g.crimeHeat += stars;
    g.lastCrimeAt = g.elapsed;
    this.quietFor = 0;
    if (!silent && message) g.hud.toast('WANTED', message, 3);
    const target = Math.min(5, Math.floor(g.crimeHeat));
    if (target > g.wanted) {
      g.wanted = target;
      g.sounds.setSiren(g.wanted > 0);
      if (g.wanted >= 3) {
        g.hud.toast('HEAT IS ON', `${g.wanted}-star wanted level — the precinct is coming.`, 4);
      }
      if (g.wanted >= HELI_STARS && !this.heliToasted) {
        this.heliToasted = true;
        g.hud.toast('HELICOPTER UP', 'A police helicopter is overhead — it sees everything. Get under cover.', 5);
      }
    }
  }

  setWanted(n) {
    const g = this.game;
    g.wanted = Math.max(0, Math.min(5, n));
    g.crimeHeat = Math.max(g.crimeHeat, g.wanted);
    g.sounds.setSiren(g.wanted > 0);
    if (g.wanted === 0) this.clearForces();
  }

  // Fraction of the way from the current star count to the next one
  // down. Drives the heat bar under the stars in the HUD.
  heatFrac() {
    const g = this.game;
    if (g.wanted === 0) return 0;
    return 1 - (g.crimeHeat - Math.floor(g.crimeHeat));
  }

  // --- the frame tick ---

  update(dt) {
    const g = this.game;
    if (g.wanted === 0) {
      this.seen = false;
      this.watched = false;
      this.quietFor = 0;
      if (this.heli) this.standDownHeli(dt);
      this.clearBlocks();
      return;
    }
    this.updateSight();
    this.updateHeat(dt);
    this.spawnCruisers(dt);
    this.spawnFootCops(dt);
    this.updateCops(dt);
    this.updateHeli(dt);
    this.updateBlocks(dt);
  }

  updateSight() {
    const g = this.game;
    let seen = false;
    for (const car of g.traffic.cars) {
      if (car.police && !car.dead && canSee(g, car.x, car.y, CRUISER_SIGHT, false)) {
        seen = true;
        break;
      }
    }
    if (!seen) {
      for (const cop of g.cops) {
        if (cop.state !== 'down' && canSee(g, cop.x, cop.y, COP_SIGHT, false)) {
          seen = true;
          break;
        }
      }
    }
    this.watched = !!this.heli && canSee(g, this.heli.x, this.heli.y, HELI_SIGHT, true);
    if (this.watched) seen = true;
    this.seen = seen;
  }

  // Heat only falls after a stretch unseen; the helicopter freezes decay while it watches.
  updateHeat(dt) {
    const g = this.game;
    if (this.seen) {
      this.quietFor = 0;
      return;
    }
    this.quietFor += dt;
    if (this.quietFor < QUIET_SECONDS) return;
    g.crimeHeat -= dt / SECONDS_PER_STAR;
    const target = Math.max(0, Math.floor(g.crimeHeat));
    if (target < g.wanted) {
      g.wanted = target;
      if (g.wanted === 0) {
        g.sounds.setSiren(false);
        this.heliToasted = false;
        g.hud.toast('CLEAN', 'You slipped away. The heat is off — for now.', 4);
        this.clearForces();
      }
    }
  }

  // --- cruisers ---

  spawnCruisers(dt) {
    const g = this.game;
    this.spawnTimer -= dt;
    const want = g.wanted >= 4 ? 4 : g.wanted >= 2 ? 3 : 1;
    if (this.spawnTimer > 0 || this.policeCars() >= want) return;
    this.spawnTimer = 2.5;
    const pos = this.playerPos();
    const angle = Math.random() * Math.PI * 2;
    const dist = 700 + Math.random() * 300;
    const spot = g.roadPointNear(pos.x + Math.cos(angle) * dist, pos.y + Math.sin(angle) * dist);
    const car = g.traffic.spawnPolice(spot.x, spot.y, Math.atan2(pos.y - spot.y, pos.x - spot.x));
    car.siren = true;
    g.sounds.horn();
  }

  // Foot cops run Marco down and bust him on contact.

  spawnFootCops(dt) {
    const g = this.game;
    const p = g.player;
    this.copTimer -= dt;
    if (p.inCar || g.wanted < 1) return;
    if (this.copTimer > 0 || g.cops.length >= Math.min(3, g.wanted)) return;
    this.copTimer = 4;
    const angle = Math.random() * Math.PI * 2;
    const cop = new Ped(p.x + Math.cos(angle) * 380, p.y + Math.sin(angle) * 380, g.rng);
    cop.color = '#20242e';
    cop.speed = 125 + g.wanted * 14; // faster than a stroll, slower than a sprint
    cop.state = 'stroll';
    cop.isCop = true;
    g.cops.push(cop);
  }

  updateCops(dt) {
    const g = this.game;
    const p = g.player;
    for (const cop of g.cops) {
      if (cop.state === 'down') continue;
      const dx = p.x - cop.x;
      const dy = p.y - cop.y;
      const d = Math.hypot(dx, dy);
      if (d < 26) {
        g.bustPlayer();
        return;
      }
      cop.angle = Math.atan2(dy, dx);
      const speed = p.inCar ? cop.speed * 0.4 : cop.speed * 1.25;
      cop.x += Math.cos(cop.angle) * speed * dt;
      cop.y += Math.sin(cop.angle) * speed * dt;
      const push = g.city.collideCircle(cop.x, cop.y, cop.r);
      if (push) {
        cop.x += push.x;
        cop.y += push.y;
      }
    }
    g.cops = g.cops.filter((c) => c.state !== 'down' || distSq(c.x, c.y, p.x, p.y) < 700 * 700);
  }

  // --- helicopter ---

  forceHeli(x, y) {
    this.heli = { x, y, angle: 0, orbit: 0, watching: true };
  }

  updateHeli(dt) {
    const g = this.game;
    if (g.wanted < HELI_STARS) {
      if (this.heli) this.standDownHeli(dt);
      return;
    }
    if (!this.heli) {
      const pos = this.playerPos();
      this.heli = { x: pos.x + HELI_ORBIT, y: pos.y - HELI_ORBIT, angle: 0, orbit: 0, watching: false };
      g.sounds.heliBuzz();
    }
    const pos = this.playerPos();
    const h = this.heli;
    h.orbit += dt * 0.55; // slow circle overhead
    const wantX = pos.x + Math.cos(h.orbit) * HELI_ORBIT;
    const wantY = pos.y + Math.sin(h.orbit) * HELI_ORBIT;
    h.x += (wantX - h.x) * Math.min(1, dt * 2);
    h.y += (wantY - h.y) * Math.min(1, dt * 2);
    h.angle = Math.atan2(pos.y - h.y, pos.x - h.x);
    h.watching = this.watched;
  }

  standDownHeli(dt) {
    const h = this.heli;
    if (!h) return;
    h.y -= 260 * dt;
    h.x += 120 * dt;
    if (h.y < -200 || this.game.wanted === 0) this.heli = null;
  }

  // --- roadblocks ---

  updateBlocks(dt) {
    const g = this.game;
    if (g.wanted < BLOCK_STARS) {
      this.clearBlocks();
      return;
    }
    this.blockTimer -= dt;
    const pos = this.playerPos();
    for (const block of this.blocks) {
      const behind = (pos.x - block.x) * Math.cos(block.angle) + (pos.y - block.y) * Math.sin(block.angle);
      if (behind > 320) block.passed = true;
    }
    this.blocks = this.blocks.filter((b) => !b.passed);
    if (this.blockTimer > 0 || this.blocks.length >= 1) return;
    this.blockTimer = BLOCK_EVERY;
    this.layBlock(pos);
  }

  // Two cruisers parked across the road ahead of Marco.
  layBlock(pos) {
    const g = this.game;
    const p = g.player;
    const heading = p.inCar && g.playerCar ? g.playerCar.angle : p.angle;
    const ahead = 520;
    const cx = pos.x + Math.cos(heading) * ahead;
    const cy = pos.y + Math.sin(heading) * ahead;
    const spot = g.roadPointNear(cx, cy);
    const across = heading + Math.PI / 2; // park across the road
    const cars = [];
    for (const off of [-30, 30]) {
      const car = g.traffic.spawnPolice(
        spot.x + Math.cos(across) * off,
        spot.y + Math.sin(across) * off,
        across,
      );
      car.driver = 'roadblock';
      car.speed = 0;
      cars.push(car);
    }
    this.blocks.push({ cars, x: spot.x, y: spot.y, angle: heading, age: 0, passed: false });
    g.hud.toast('ROADBLOCK AHEAD', 'Cruisers parked across the road — go around or through.', 4);
    g.sounds.horn();
  }

  clearBlocks() {
    for (const block of this.blocks) {
      for (const car of block.cars) car.dead = true;
    }
    this.blocks = [];
  }

  clearForces() {
    for (const c of this.game.traffic.cars) if (c.police) c.dead = true;
    this.game.cops = [];
    this.heli = null;
    this.clearBlocks();
  }
}
