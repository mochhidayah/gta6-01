// Vehicles: arcade driving physics, traffic that follows the road grid,
// and police cars that chase the player when the heat is on.
import { WORLD, CAR_STATS, CAR_CATALOG, ARMORED_VAN, clamp, turnToward, wrapAngle, distSq } from './config.js';
import { AVENUES, STREETS, onRoad, roadPointNear } from './city.js';
import { seeded, choose, between } from './rng.js';

let nextCarId = 1;

export class Car {
  constructor(x, y, angle, modelIndex, opts = {}) {
    this.id = nextCarId++;
    this.x = x;
    this.y = y;
    this.angle = angle;
    // A custom model (the armored van) bypasses the catalogue.
    this.model = opts.model || CAR_CATALOG[modelIndex % CAR_CATALOG.length];
    this.speed = 0;
    this.color = opts.color || this.model.color;
    this.police = !!opts.police;
    this.taxi = !!this.model.taxi;
    this.van = !!this.model.van;
    this.w = 44; // footprint: length x width
    this.h = 22;
    this.health = 100;
    this.dead = false;
    this.smoke = 0;
    this.driver = opts.driver ?? null; // 'traffic' | 'police' | 'parked' | null (player)
    this.brain = null; // traffic AI state
    this.siren = this.police;
    this.skid = 0;
    this.stuckTimer = 0;
    this.crashCooldown = 0;
  }

  get topSpeed() {
    return this.model.top;
  }

  // Arcade driving: speed builds with the throttle, steering bites
  // harder the faster you go, and the handbrake kills grip for slides.
  drive(throttle, steer, handbrake, dt) {
    if (throttle > 0) {
      this.speed += this.model.accel * throttle * dt;
    } else if (throttle < 0) {
      if (this.speed > 8) this.speed -= CAR_STATS.brake * dt; // braking
      else this.speed += CAR_STATS.reverseAccel * throttle * dt; // reversing
    } else {
      this.speed -= Math.sign(this.speed) * 140 * dt; // rolling drag
      if (Math.abs(this.speed) < 4) this.speed = 0;
    }
    if (handbrake) this.speed *= Math.max(0, 1 - 3.2 * dt);
    this.speed = clamp(this.speed, -CAR_STATS.topReverse, this.topSpeed);
    const bite = clamp(Math.abs(this.speed) / 140, 0.25, 1) * (handbrake ? 1.6 : 1);
    this.angle += steer * CAR_STATS.steer * bite * Math.sign(this.speed) * dt * (this.speed < 0 ? -1 : 1);
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    this.x = clamp(this.x, 30, WORLD.width - 30);
    this.y = clamp(this.y, 30, WORLD.height - 30);
    if (handbrake && Math.abs(this.speed) > 120) this.skid = 1;
    else this.skid = Math.max(0, this.skid - dt * 2);
  }

  damage(amount, game) {
    this.health -= amount;
    if (this.health < 30) this.smoke = 1;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      game.explode(this.x, this.y, 26);
    }
  }

  // Cars are circles of r=20 for each other: push apart and trade speed.
  collideWith(other) {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    const d = Math.hypot(dx, dy);
    const minDist = 34;
    if (d <= 0.01 || d >= minDist) return 0;
    const push = (minDist - d) / 2;
    const nx = dx / d;
    const ny = dy / d;
    this.x -= nx * push;
    this.y -= ny * push;
    other.x += nx * push;
    other.y += ny * push;
    const shared = (this.speed + other.speed) / 2;
    this.speed = shared * 0.4;
    other.speed = shared * 0.4;
    return Math.abs(shared);
  }
}

export class Traffic {
  constructor(city) {
    this.city = city;
    this.cars = [];
    this.rng = seeded(777);
  }

  spawn(count, nearX, nearY) {
    for (let i = 0; i < count; i++) {
      const x = nearX + (this.rng() - 0.5) * 1600;
      const y = nearY + (this.rng() - 0.5) * 1200;
      const p = roadPointNear(x, y);
      const alongAvenue = Math.abs(p.x - x) < Math.abs(p.y - y);
      const angle = alongAvenue
        ? (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
        : (this.rng() < 0.5 ? 0 : Math.PI);
      const car = new Car(p.x, p.y, angle, Math.floor(this.rng() * CAR_CATALOG.length), { driver: 'traffic' });
      car.speed = between(this.rng, 90, 170);
      car.brain = { target: null };
      this.cars.push(car);
    }
  }

  spawnPolice(x, y, angle) {
    const car = new Car(x, y, angle, 1, { driver: 'police', police: true, color: '#20242e' });
    car.speed = 200;
    this.cars.push(car);
    return car;
  }

  // The armored van for the final job, parked at the stadium.
  spawnVan(x, y) {
    const van = new Car(x, y, 0, 0, { driver: 'parked', model: ARMORED_VAN, color: ARMORED_VAN.color });
    this.cars.push(van);
    return van;
  }

  spawnParked(count) {
    for (let i = 0; i < count; i++) {
      const avenue = choose(this.rng, AVENUES);
      const street = choose(this.rng, STREETS);
      const alongAvenue = this.rng() < 0.5;
      const x = alongAvenue
        ? avenue + (this.rng() < 0.5 ? 1 : -1) * 52
        : avenue + between(this.rng, -200, 200);
      const y = alongAvenue
        ? street + between(this.rng, -200, 200)
        : street + (this.rng() < 0.5 ? 1 : -1) * 52;
      const angle = alongAvenue
        ? (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
        : (this.rng() < 0.5 ? 0 : Math.PI);
      this.cars.push(new Car(x, y, angle, Math.floor(this.rng() * CAR_CATALOG.length), { driver: 'parked' }));
    }
  }

  update(dt, game) {
    const player = game.player;
    for (const car of this.cars) {
      if (car.dead) continue;
      if (car.crashCooldown > 0) car.crashCooldown -= dt;
      if (car.driver === 'traffic') this.steerTraffic(car, dt, game);
      else if (car.driver === 'police') this.chasePlayer(car, dt, game);
      // Parked cars never move; the city keeps them out of buildings.
      const push = this.city.collideCircle(car.x, car.y, 20);
      if (push) {
        car.x += push.x;
        car.y += push.y;
        car.speed *= 0.5;
      }
      if (car.smoke > 0) car.smoke = Math.max(0, car.smoke - dt * 0.15);
    }
    // Car-vs-car collisions.
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        if (a.dead || b.dead) continue;
        const impact = a.collideWith(b);
        if (impact > 60 && game) game.onCarCrash(a, b, impact);
      }
    }
    // Cull traffic far from the player; parked cars and police stay.
    this.cars = this.cars.filter((car) => {
      if (car.driver === 'police') return !car.dead;
      if (car === game.playerCar) return true;
      if (car.driver === 'parked') return true;
      return distSq(car.x, car.y, player.x, player.y) < 1600 * 1600;
    });
  }

  // Traffic drives straight along the grid and turns at intersections.
  steerTraffic(car, dt, game) {
    const aheadX = car.x + Math.cos(car.angle) * 60;
    const aheadY = car.y + Math.sin(car.angle) * 60;
    if (!onRoad(aheadX, aheadY)) {
      // About to leave the road: pick a turn at the intersection.
      const options = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      const current = wrapAngle(car.angle);
      const snapped = options.reduce(
        (best, opt) => (Math.abs(opt - current) < Math.abs(best - current) ? opt : best),
        0,
      );
      const turns = [snapped, snapped + Math.PI / 2, snapped - Math.PI / 2];
      car.brain.target = choose(this.rng, turns);
    }
    if (car.brain.target != null) {
      car.angle = turnToward(car.angle, car.brain.target, Math.min(1, dt * 3));
      if (Math.abs(wrapAngle(car.angle - car.brain.target)) < 0.05) car.brain.target = null;
    }
    // Brake for the car ahead.
    let blocked = false;
    for (const other of this.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 70 && d > 0) {
        const ahead = (dx * Math.cos(car.angle) + dy * Math.sin(car.angle)) / d;
        if (ahead > 0.7) {
          blocked = true;
          break;
        }
      }
    }
    const cruise = blocked ? 0 : between(this.rng, 120, 170);
    car.drive(car.speed < cruise ? 0.7 : 0, 0, false, dt);
    // A frightened driver floors it when the player causes chaos nearby.
    if (game.wanted > 0 && distSq(car.x, car.y, game.player.x, game.player.y) < 220 * 220) {
      car.drive(1, 0, false, dt);
    }
  }

  // A police car steers at the player and rams them.
  chasePlayer(car, dt, game) {
    const p = game.player;
    const tx = p.inCar ? game.playerCar.x : p.x;
    const ty = p.inCar ? game.playerCar.y : p.y;
    const dx = tx - car.x;
    const dy = ty - car.y;
    const d = Math.hypot(dx, dy);
    const wantAngle = Math.atan2(dy, dx);
    const steer = clamp(wrapAngle(wantAngle - car.angle) * 1.6, -1, 1);
    const topSpeed = game.wanted >= 4 ? 520 : game.wanted >= 2 ? 470 : 420;
    car.drive(car.speed < topSpeed ? 1 : 0, steer, false, dt);
    if (d < 46) {
      if (p.inCar) game.playerCar.damage(180 * dt, game);
      else game.bustPlayer();
    }
    // Too far behind: give up so the chase can end.
    if (d > 1400) car.dead = true;
  }

  nearestCar(x, y, maxDist, predicate) {
    let best = null;
    let bestDist = maxDist * maxDist;
    for (const car of this.cars) {
      if (car.dead) continue;
      if (predicate && !predicate(car)) continue;
      const d = distSq(x, y, car.x, car.y);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }
}
