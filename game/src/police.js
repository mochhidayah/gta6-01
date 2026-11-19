// PoliceDirector: the wanted level, cruisers, foot cops, the
// helicopter, and roadblocks. Stars only fall while nobody can
// see Marco: sight is distance plus a building check, so walls
// and alleys are real cover. v6 rewrote this file wholesale — same
// heat, same chases, new internal names.
import { WANTED_RULES, distSq } from './config.js';
import { Ped } from './people.js';

const CRUISER_SIGHT = 620; // how far a patrol car can spot Marco
const COP_SIGHT = 380; // how far a foot cop can spot him
const HELI_SIGHT = 820; // the helicopter sees almost everything
const HELI_ORBIT = 250; // how far out the helicopter circles
const HELI_STARS = 4; // stars needed before the helicopter lifts off
const BLOCK_STARS = 3; // stars needed before roadblocks go up
const BLOCK_EVERY = 14; // seconds between roadblock attempts
const SPIKE_STARS = 5; // stars needed before spike strips go down
const SPIKE_EVERY = 20; // seconds between spike-strip attempts
const SPIKE_DAMAGE = 45; // health a strip takes off the car
const QUIET_SECONDS = WANTED_RULES.coolOffDelay;
const SECONDS_PER_STAR = WANTED_RULES.coolOffStep;

// Sight check: sample points along the line; any inside a building blocks the view.
function wallBetween(game, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const cuts = Math.max(1, Math.floor(dist / 45));
  for (let i = 1; i < cuts; i++) {
    const f = i / cuts;
    const sx = x1 + dx * f;
    const sy = y1 + dy * f;
    for (const b of game.city.buildings) {
      if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return true;
    }
  }
  return false;
}

// Can this watcher see Marco? Close, no wall between. The helicopter sees over rooftops.
function canSee(game, wx, wy, range, fromAir) {
  const marco = game.player;
  const tx = marco.inCar && game.playerCar ? game.playerCar.x : marco.x;
  const ty = marco.inCar && game.playerCar ? game.playerCar.y : marco.y;
  if (distSq(wx, wy, tx, ty) > range * range) return false;
  if (fromAir) return true;
  return !wallBetween(game, wx, wy, tx, ty);
}

export class PoliceDirector {
  constructor(game) {
    this.game = game;
    this.heli = null; // {x, y, angle, orbit, watching} or null
    this.blocks = []; // roadblocks: {cars:[a,b], x, y, age}
    this.spikes = []; // spike strips: {x, y, angle, age} — 5 stars only
    this.quietFor = 0; // seconds Marco has been unseen
    this.seen = false; // anyone watching this frame?
    this.watched = false; // the helicopter has eyes on him
    this.spawnTimer = 0;
    this.copTimer = 0;
    this.blockTimer = 0;
    this.spikeTimer = 0;
    this.heliToasted = false;
    this.peakWanted = 0; // the highest star count this chase reached
  }

  playerPos() {
    const g = this.game;
    const marco = g.player;
    if (marco.inCar && g.playerCar) return { x: g.playerCar.x, y: g.playerCar.y };
    return { x: marco.x, y: marco.y };
  }

  policeCars() {
    return this.game.traffic.cars.filter((car) => car.police && !car.dead).length;
  }

  // --- crime and stars ---

  addCrime(stars, message, silent = false) {
    const g = this.game;
    if (g.state !== 'playing') return;
    g.crimeHeat += stars;
    g.lastCrimeAt = g.elapsed;
    this.quietFor = 0;
    if (!silent && message) g.hud.toast('WANTED', message, 3);
    const level = Math.min(5, Math.floor(g.crimeHeat));
    if (level > g.wanted) {
      g.wanted = level;
      this.peakWanted = Math.max(this.peakWanted, level);
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
    this.updateSpikes(dt);
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
    const level = Math.max(0, Math.floor(g.crimeHeat));
    if (level < g.wanted) {
      g.wanted = level;
      if (g.wanted === 0) {
        g.sounds.setSiren(false);
        this.heliToasted = false;
        // Slipping a 4-star chase clean is the GHOST achievement.
        if (this.peakWanted >= 4 && g.stats) g.stats.recordGhostEscape();
        this.peakWanted = 0;
        g.hud.toast('CLEAN', 'You slipped away. The heat is off — for now.', 4);
        this.clearForces();
      }
    }
  }

  // --- cruisers ---

  spawnCruisers(dt) {
    const g = this.game;
    this.spawnTimer -= dt;
    const count = g.wanted >= 4 ? 4 : g.wanted >= 2 ? 3 : 1;
    if (this.spawnTimer > 0 || this.policeCars() >= count) return;
    this.spawnTimer = 2.5;
    const at = this.playerPos();
    const angle = Math.random() * Math.PI * 2;
    const away = 700 + Math.random() * 300;
    const place = g.roadPointNear(at.x + Math.cos(angle) * away, at.y + Math.sin(angle) * away);
    const car = g.traffic.spawnPolice(place.x, place.y, Math.atan2(at.y - place.y, at.x - place.x));
    car.siren = true;
    g.sounds.horn();
  }

  // Foot cops run Marco down and bust him on contact.

  spawnFootCops(dt) {
    const g = this.game;
    const marco = g.player;
    this.copTimer -= dt;
    if (marco.inCar || g.wanted < 1) return;
    if (this.copTimer > 0 || g.cops.length >= Math.min(3, g.wanted)) return;
    this.copTimer = 4;
    const angle = Math.random() * Math.PI * 2;
    const cop = new Ped(marco.x + Math.cos(angle) * 380, marco.y + Math.sin(angle) * 380, g.rng);
    cop.color = '#20242e';
    cop.speed = 125 + g.wanted * 14; // faster than a stroll, slower than a sprint
    cop.state = 'stroll';
    cop.isCop = true;
    g.cops.push(cop);
  }

  updateCops(dt) {
    const g = this.game;
    const marco = g.player;
    for (const cop of g.cops) {
      if (cop.state === 'down') continue;
      const dx = marco.x - cop.x;
      const dy = marco.y - cop.y;
      const d = Math.hypot(dx, dy);
      if (d < 26) {
        g.bustPlayer();
        return;
      }
      cop.angle = Math.atan2(dy, dx);
      const pace = marco.inCar ? cop.speed * 0.4 : cop.speed * 1.25;
      cop.x += Math.cos(cop.angle) * pace * dt;
      cop.y += Math.sin(cop.angle) * pace * dt;
      const push = g.city.collideCircle(cop.x, cop.y, cop.r);
      if (push) {
        cop.x += push.x;
        cop.y += push.y;
      }
    }
    g.cops = g.cops.filter((cop) => cop.state !== 'down' || distSq(cop.x, cop.y, marco.x, marco.y) < 700 * 700);
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
      const at = this.playerPos();
      this.heli = { x: at.x + HELI_ORBIT, y: at.y - HELI_ORBIT, angle: 0, orbit: 0, watching: false };
      g.sounds.heliBuzz();
    }
    const at = this.playerPos();
    const h = this.heli;
    h.orbit += dt * 0.55; // slow circle overhead
    const goalX = at.x + Math.cos(h.orbit) * HELI_ORBIT;
    const goalY = at.y + Math.sin(h.orbit) * HELI_ORBIT;
    h.x += (goalX - h.x) * Math.min(1, dt * 2);
    h.y += (goalY - h.y) * Math.min(1, dt * 2);
    h.angle = Math.atan2(at.y - h.y, at.x - h.x);
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
    const at = this.playerPos();
    for (const block of this.blocks) {
      const past = (at.x - block.x) * Math.cos(block.angle) + (at.y - block.y) * Math.sin(block.angle);
      if (past > 320) block.passed = true;
    }
    this.blocks = this.blocks.filter((b) => !b.passed);
    if (this.blockTimer > 0 || this.blocks.length >= 1) return;
    this.blockTimer = BLOCK_EVERY;
    this.layBlock(at);
  }

  // Two cruisers parked across the road ahead of Marco.
  layBlock(pos) {
    const g = this.game;
    const marco = g.player;
    const heading = marco.inCar && g.playerCar ? g.playerCar.angle : marco.angle;
    const far = 520;
    const bx = pos.x + Math.cos(heading) * far;
    const by = pos.y + Math.sin(heading) * far;
    const place = g.roadPointNear(bx, by);
    const across = heading + Math.PI / 2; // park across the road
    const cars = [];
    for (const gap of [-30, 30]) {
      const car = g.traffic.spawnPolice(
        place.x + Math.cos(across) * gap,
        place.y + Math.sin(across) * gap,
        across,
      );
      car.driver = 'roadblock';
      car.speed = 0;
      cars.push(car);
    }
    this.blocks.push({ cars, x: place.x, y: place.y, angle: heading, age: 0, passed: false });
    g.hud.toast('ROADBLOCK AHEAD', 'Cruisers parked across the road — go around or through.', 4);
    g.sounds.horn();
  }

  clearBlocks() {
    for (const b of this.blocks) {
      for (const c of b.cars) c.dead = true;
    }
    this.blocks = [];
  }

  // --- spike strips (5 stars) ---

  // At five stars the precinct drops spike strips ahead of Marco:
  // drive over one and the car takes damage and loses half its speed.
  updateSpikes(dt) {
    const g = this.game;
    if (g.wanted < SPIKE_STARS) {
      this.spikes = [];
      return;
    }
    this.spikeTimer -= dt;
    const car = g.playerCar;
    for (const strip of this.spikes) {
      strip.age += dt;
      if (!car || !g.player.inCar) continue;
      const along = (car.x - strip.x) * Math.cos(strip.angle) + (car.y - strip.y) * Math.sin(strip.angle);
      const across = Math.abs(-(car.x - strip.x) * Math.sin(strip.angle) + (car.y - strip.y) * Math.cos(strip.angle));
      if (Math.abs(along) < 24 && across < 40) {
        car.damage(SPIKE_DAMAGE, g);
        car.speed *= 0.5;
        strip.age = 999; // spent — one strip, one car
        g.hud.toast('SPIKE STRIP', 'Tires shredded on a police spike strip — get off the road!', 4);
        g.sounds.crash();
        g.addParticles(car.x, car.y, 10, '#888');
      }
    }
    this.spikes = this.spikes.filter((strip) => strip.age < 25);
    if (this.spikeTimer > 0 || this.spikes.length >= 1) return;
    this.spikeTimer = SPIKE_EVERY;
    const at = this.playerPos();
    const marco = g.player;
    const heading = marco.inCar && car ? car.angle : marco.angle;
    const place = g.roadPointNear(at.x + Math.cos(heading) * 480, at.y + Math.sin(heading) * 480);
    this.spikes.push({ x: place.x, y: place.y, angle: heading + Math.PI / 2, age: 0 });
    g.hud.toast('SPIKES AHEAD', 'The precinct laid spike strips down the road — steer around them.', 4);
  }

  clearForces() {
    for (const car of this.game.traffic.cars) if (car.police) car.dead = true;
    this.game.cops = [];
    this.heli = null;
    this.clearBlocks();
    this.spikes = [];
  }
}
