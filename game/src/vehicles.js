// Vehicles: arcade driving, route-following traffic, patrol
// cruisers, police chases, and the two new rides — a motorcycle
// (fast, fragile) and a city bus (slow, nearly unkillable).
// Traffic follows waypoint loops on the road grid; police cars
// steer at Marco and ram.
import { WORLD, CAR_STATS, CAR_CATALOG, ARMORED_VAN, clamp, wrapAngle, distSq } from './config.js';
import { AVENUES, STREETS, onRoad, roadPointNear } from './city.js';
import { seeded, choose, between } from './rng.js';

let nextCarId = 1;

// A loop of waypoints on the grid: alternate avenues and streets.
function planRoute(rng, startX, startY) {
  const points = [{ x: startX, y: startY }];
  let x = startX;
  let y = startY;
  const legs = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < legs; i++) {
    if (i % 2 === 0) x = choose(rng, AVENUES);
    else y = choose(rng, STREETS);
    points.push({ x, y });
  }
  points.push({ x: startX, y: startY });
  return points;
}

function gridHeading(rng, alongAvenue) {
  if (alongAvenue) return rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  return rng() < 0.5 ? 0 : Math.PI;
}

export class Car {
  constructor(x, y, angle, modelIndex, opts = {}) {
    this.id = nextCarId++;
    this.x = x;
    this.y = y;
    this.angle = angle;
    // A custom model (armored van, or a named model for a job) bypasses the catalogue.
    this.model = opts.model || CAR_CATALOG[modelIndex % CAR_CATALOG.length];
    this.speed = 0;
    this.color = opts.color || this.model.color;
    this.police = !!opts.police;
    this.taxi = !!this.model.taxi;
    this.van = !!this.model.van;
    this.bike = !!this.model.bike; // motorcycle: fast, fragile, rider exposed
    this.bus = !!this.model.bus; // city bus: slow, long, hard to kill
    this.patrol = !!opts.patrol;
    this.w = this.bus ? 64 : this.bike ? 34 : 44;
    this.h = this.bus ? 26 : this.bike ? 12 : 22;
    this.health = this.bus ? 220 : this.bike ? 50 : 100;
    this.maxHealth = this.health;
    this.dead = false;
    this.smoke = 0;
    this.driver = opts.driver ?? null; // 'traffic' | 'patrol' | 'police' | 'roadblock' | 'taxiWait' | 'racer' | 'parked' | null (player)
    this.brain = null; // traffic AI state: {route, leg, cruise}
    this.siren = this.police;
    this.skid = 0;
    this.stuckTimer = 0;
    this.crashCooldown = 0;
    this.hailed = false; // a taxi that has pulled over for Marco
    this.honkTimer = 0;
  }

  get topSpeed() {
    return this.patrol ? this.model.top * 1.1 : this.model.top;
  }

  // Arcade driving: speed builds with the throttle, steering bites
  // harder the faster you go, and the handbrake kills grip.
  // A bike turns sharper; a bus turns like a bus.
  drive(throttle, steer, handbrake, dt) {
    this.applyThrottle(throttle, handbrake, dt);
    const steerScale = this.bike ? 1.5 : this.bus ? 0.55 : 1;
    this.applySteering(steer * steerScale, handbrake, dt);
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    this.x = clamp(this.x, 30, WORLD.width - 30);
    this.y = clamp(this.y, 30, WORLD.height - 30);
    if (handbrake && Math.abs(this.speed) > 120) this.skid = 1;
    else this.skid = Math.max(0, this.skid - dt * 2);
  }

  applyThrottle(throttle, handbrake, dt) {
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
  }

  applySteering(steer, handbrake, dt) {
    const bite = clamp(Math.abs(this.speed) / 140, 0.25, 1) * (handbrake ? 1.6 : 1);
    const reverse = this.speed < 0 ? -1 : 1;
    this.angle += steer * CAR_STATS.steer * bite * Math.sign(this.speed) * dt * reverse;
  }

  damage(amount, game) {
    // The rider is exposed: a bike takes half again as much damage.
    this.health -= this.bike ? amount * 1.5 : amount;
    if (this.health < 30) this.smoke = 1;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      game.explode(this.x, this.y, 26);
    }
  }

  // Cars are circles for each other: push apart and trade speed.
  // A bus shoves lighter cars aside instead of sharing the hit.
  collideWith(other) {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    const d = Math.hypot(dx, dy);
    const minDist = this.bus || other.bus ? 44 : this.bike || other.bike ? 28 : 34;
    if (d <= 0.01 || d >= minDist) return 0;
    const push = (minDist - d) / 2;
    const nx = dx / d;
    const ny = dy / d;
    const myShare = this.bus ? 0.15 : other.bus ? 0.85 : 0.5;
    this.x -= nx * push * (1 - myShare) * 2;
    this.y -= ny * push * (1 - myShare) * 2;
    other.x += nx * push * myShare * 2;
    other.y += ny * push * myShare * 2;
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
      const angle = gridHeading(this.rng, alongAvenue);
      const isPatrol = this.rng() < 0.2;
      const car = new Car(p.x, p.y, angle, Math.floor(this.rng() * CAR_CATALOG.length), {
        driver: isPatrol ? 'patrol' : 'traffic',
        patrol: isPatrol,
        color: isPatrol ? '#2e4a6b' : undefined,
      });
      car.speed = between(this.rng, 90, 170);
      car.brain = {
        route: planRoute(this.rng, p.x, p.y),
        leg: 1,
        cruise: between(this.rng, 120, 170),
      };
      this.cars.push(car);
    }
  }

  spawnPolice(x, y, angle) {
    const car = new Car(x, y, angle, 1, { driver: 'police', police: true, color: '#20242e' });
    car.speed = 200;
    this.cars.push(car);
    return car;
  }

  spawnVan(x, y) {
    const van = new Car(x, y, 0, 0, { driver: 'parked', model: ARMORED_VAN, color: ARMORED_VAN.color });
    this.cars.push(van);
    return van;
  }

  // Park one car of a named model at a spot — a mission's ride.
  spawnModel(modelName, x, y) {
    const model = CAR_CATALOG.find((m) => m.name === modelName) || CAR_CATALOG[0];
    const car = new Car(x, y, 0, 0, { driver: 'parked', model });
    this.cars.push(car);
    return car;
  }

  // A street-race rival: a named model on the start pad, driven by
  // the race itself (races.js steers it), not by the traffic AI.
  spawnRacer(x, y, angle, modelName) {
    const model = CAR_CATALOG.find((m) => m.name === modelName) || CAR_CATALOG[0];
    const car = new Car(x, y, angle, 0, { driver: 'racer', model });
    car.speed = 0;
    this.cars.push(car);
    return car;
  }

  spawnPatrol(x, y) {
    const p = roadPointNear(x, y);
    const car = new Car(p.x, p.y, gridHeading(this.rng, true), 4, {
      driver: 'patrol',
      patrol: true,
      color: '#2e4a6b',
    });
    car.speed = 150;
    car.brain = { route: planRoute(this.rng, p.x, p.y), leg: 1, cruise: 190 };
    this.cars.push(car);
    return car;
  }

  // A taxi waiting for a fare: sits by the road until Marco walks up, then honks.
  spawnHailedTaxi(x, y) {
    const p = roadPointNear(x, y);
    const taxiModel = CAR_CATALOG.find((m) => m.taxi) || CAR_CATALOG[2];
    const car = new Car(p.x, p.y, gridHeading(this.rng, true), 0, {
      driver: 'taxiWait',
      model: taxiModel,
    });
    car.speed = 0;
    this.cars.push(car);
    return car;
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
      const angle = gridHeading(this.rng, alongAvenue);
      this.cars.push(new Car(x, y, angle, Math.floor(this.rng() * CAR_CATALOG.length), { driver: 'parked' }));
    }
  }

  update(dt, game) {
    const player = game.player;
    for (const car of this.cars) {
      if (car.dead) continue;
      if (car.crashCooldown > 0) car.crashCooldown -= dt;
      if (car.driver === 'traffic' || car.driver === 'patrol') this.followRoute(car, dt, game);
      else if (car.driver === 'police') this.chasePlayer(car, dt, game);
      else if (car.driver === 'taxiWait') this.waitForFare(car, dt, game);
      const push = this.city.collideCircle(car.x, car.y, 20);
      if (push) {
        car.x += push.x;
        car.y += push.y;
        car.speed *= 0.5;
      }
      if (car.smoke > 0) car.smoke = Math.max(0, car.smoke - dt * 0.15);
    }
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        if (a.dead || b.dead) continue;
        const impact = a.collideWith(b);
        if (impact > 60 && game) game.onCarCrash(a, b, impact);
      }
    }
    // Cull far traffic; parked cars, police, roadblocks, waiting taxis and racers stay.
    this.cars = this.cars.filter((car) => {
      if (car.driver === 'police' || car.driver === 'roadblock') return !car.dead;
      if (car === game.playerCar) return true;
      if (car.driver === 'parked' || car.driver === 'taxiWait' || car.driver === 'racer') return true;
      return distSq(car.x, car.y, player.x, player.y) < 1600 * 1600;
    });
  }

  // A waiting taxi watches for Marco on foot: honk, flag him in, fare starts on entry.
  waitForFare(car, dt, game) {
    const p = game.player;
    if (car.honkTimer > 0) car.honkTimer -= dt;
    if (p.inCar) return;
    const d = Math.hypot(p.x - car.x, p.y - car.y);
    if (d > 170) {
      car.hailed = false;
      return;
    }
    if (!car.hailed) {
      car.hailed = true;
      game.toast('TAXI!', 'A cab pulled over for you — press E to hop in and start a fare.', 4);
    }
    if (car.honkTimer <= 0) {
      car.honkTimer = 2.5;
      game.sounds.hornTaxi();
    }
  }

  carAhead(car) {
    for (const other of this.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d >= 70 || d <= 0) continue;
      const ahead = (dx * Math.cos(car.angle) + dy * Math.sin(car.angle)) / d;
      if (ahead > 0.7) return true;
    }
    return false;
  }

  // Drive the route: steer at the next waypoint, advance when close,
  // re-plan if the car ever ends up off the road.
  followRoute(car, dt, game) {
    if (!car.brain) {
      car.brain = { route: planRoute(this.rng, car.x, car.y), leg: 1, cruise: 150 };
    }
    const brain = car.brain;
    if (!brain.route || brain.route.length === 0) {
      brain.route = planRoute(this.rng, car.x, car.y);
      brain.leg = 1;
    }
    const waypoint = brain.route[brain.leg % brain.route.length];
    const dx = waypoint.x - car.x;
    const dy = waypoint.y - car.y;
    if (Math.hypot(dx, dy) < 40) {
      brain.leg += 1;
    }
    const wantAngle = Math.atan2(dy, dx);
    const steer = clamp(wrapAngle(wantAngle - car.angle) * 1.8, -1, 1);
    const blocked = this.carAhead(car);
    const cruise = blocked ? 0 : brain.cruise;
    car.drive(car.speed < cruise ? 0.7 : 0, steer, false, dt);
    const aheadX = car.x + Math.cos(car.angle) * 60;
    const aheadY = car.y + Math.sin(car.angle) * 60;
    if (!onRoad(aheadX, aheadY) && !onRoad(car.x, car.y)) {
      brain.route = planRoute(this.rng, car.x, car.y);
      brain.leg = 1;
    }
    if (game.wanted > 0 && distSq(car.x, car.y, game.player.x, game.player.y) < 220 * 220) {
      car.drive(1, 0, false, dt);
    }
  }

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
