// Palmera Bay side work — everything Marco can do between story jobs:
// cab fares with chatty passengers and tips, vigilante takedowns,
// pizza runs, and 30 hidden packages stashed all over the city.
//
// v5 rewrote this file end to end: new dialogue, new structure, new
// internal names. The work itself is unchanged — same fares, same
// rewards, same package spots, same timers.
//
// Wiring (main.js): `new SideJobs(game)` once, `jobs.update(dt)` every
// frame, `jobs.draw(ctx, cam)` from the renderer after the world, and
// `jobs.blips()` for the minimap. All state lives here; the game is
// only touched through small guarded helpers, so a missing field can
// never crash the frame.
//
// Controls: drive up to a waiting passenger and press E to take them.
// Vigilante targets and pizza runs show up as map markers; drive into
// the marker to start. Hidden packages are picked up by walking or
// driving over them.

import { AVENUES, STREETS } from './city.js';

// ---------------------------------------------------------------------------
// Dialogue. Passengers, pizza customers and dispatch all talk through the
// HUD toast, so the lines stay readable at speed.
// ---------------------------------------------------------------------------

const CAB_HELLOS = [
  'Club Flamingo, please. Step on it — I am late for my own birthday party.',
  'Airport, terminal two. Miss that flight and you are buying me a new ticket.',
  'The docks. No questions, driver. I tip well for silence.',
  'Coral Avenue bank, quick — before the shutters come down.',
  'Beachfront, please. I need the water in front of me before I lose it.',
  'Stadium, gate three. My team is losing without me out there.',
  'Just circle the block a few times. I am avoiding someone right now.',
  'The bay hotel. And easy on the brakes, please.',
];

const CAB_NAGS = [
  'Come on — the meter is running and so is my patience.',
  'Faster! I have a dinner table waiting in ten minutes.',
  'You drive like my grandmother. And she is scared of cars.',
  'Left! No — right! Just go that way. You know the way.',
];

const CAB_THANKS = [
  'Not bad at all. Keep the change — you earned every cent.',
  'Five stars. I never hand out five stars. Do not tell a soul.',
  'Smooth ride. A little extra, for the air conditioning.',
  'Best driver in Palmera Bay. That is a low bar, but take the win.',
];

const CAB_FURY = [
  'I am walking from here. This whole ride was a disaster.',
  'My aunt drives faster than you, and she is terrified of cars.',
  'Unbelievable. I could have swum there quicker.',
];

const PIZZA_GREETS = [
  'Extra cheese, no anchovies. Mix it up and we have a problem.',
  'Thirty minutes or it is free, pal. The clock is already running.',
  'Careful with that box! If it flips, so do you.',
  'Mamma mia, at last. I was about to eat the menu itself.',
];

const DISPATCH_CALLS = [
  'Dispatch: a Sharks getaway car is tearing down the avenues. Stop it.',
  'Dispatch: Vipers courier on the run with a trunk full of trouble. Bring it down.',
  'Dispatch: stolen Coral Coupe spotted near the docks. Ram it till it stops.',
  'Dispatch: getaway driver heading for the bridge. Do not let him cross.',
];

// Hidden package spots: fixed intersections across the whole map, picked
// so a player who explores will keep stumbling on them. Each entry is
// [avenueIndex, streetIndex, dx, dy] in world coordinates.
const STASH_SPOTS = [
  { a: 0, s: 0, x: 40, y: 30 }, { a: 1, s: 0, x: -50, y: 60 },
  { a: 2, s: 0, x: 30, y: -40 }, { a: 3, s: 0, x: -30, y: 20 },
  { a: 4, s: 0, x: 50, y: -60 }, { a: 5, s: 0, x: -40, y: 40 },
  { a: 6, s: 0, x: 20, y: -30 }, { a: 0, s: 1, x: -60, y: 10 },
  { a: 1, s: 1, x: 45, y: -25 }, { a: 2, s: 1, x: -35, y: 55 },
  { a: 3, s: 1, x: 60, y: 30 }, { a: 4, s: 1, x: -45, y: -45 },
  { a: 5, s: 1, x: 25, y: 60 }, { a: 6, s: 1, x: -20, y: -55 },
  { a: 0, s: 2, x: 55, y: -35 }, { a: 1, s: 2, x: -25, y: 45 },
  { a: 2, s: 2, x: 40, y: 20 }, { a: 3, s: 2, x: -55, y: -20 },
  { a: 4, s: 2, x: 30, y: -50 }, { a: 5, s: 2, x: -30, y: 35 },
  { a: 6, s: 2, x: 45, y: 45 }, { a: 0, s: 3, x: -40, y: -30 },
  { a: 1, s: 3, x: 35, y: 55 }, { a: 2, s: 3, x: -50, y: 25 },
  { a: 3, s: 3, x: 55, y: -55 }, { a: 4, s: 3, x: -35, y: 40 },
  { a: 5, s: 3, x: 20, y: -40 }, { a: 6, s: 3, x: -45, y: 60 },
  { a: 1, s: 0, x: 0, y: 0 }, { a: 5, s: 2, x: 0, y: 0 },
];

function squaredDist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function randomLine(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

export class SideJobs {
  constructor(game) {
    this.game = game;
    this.packages = STASH_SPOTS.map((spot, i) => ({
      id: i,
      x: AVENUES[spot.a] + spot.x,
      y: STREETS[spot.s] + spot.y,
      found: false,
      bob: Math.random() * Math.PI * 2,
    }));
    this.packagesFound = 0;
    // Cab fare state machine: idle -> offered -> aboard -> done.
    this.taxi = {
      state: 'idle',
      px: 0, py: 0, dx: 0, dy: 0,
      timer: 0, limit: 0, fare: 0, tip: 0,
      passengerLine: '',
      offerTimer: 12 + Math.random() * 10,
      destName: '',
    };
    // Vigilante state machine: idle -> active -> done.
    this.vigilante = {
      state: 'idle',
      target: null,
      timer: 0, limit: 75,
      offerTimer: 25 + Math.random() * 20,
      brief: '',
    };
    // Pizza run: idle -> pickup -> delivering (3 stops) -> done.
    this.pizza = {
      state: 'idle',
      stops: [],
      stopIndex: 0,
      timer: 0, limit: 0,
      offerTimer: 20 + Math.random() * 15,
      pay: 0,
    };
    this._listenKeys();
  }

  // -- frame ----------------------------------------------------------------

  update(dt) {
    this._taxiTick(dt);
    this._vigilanteTick(dt);
    this._pizzaTick(dt);
    this._stashTick(dt);
  }

  // -- drawing (called by the renderer, screen-space via camera) ------------

  draw(ctx, cam) {
    // Hidden packages: glowing amber parcels that bob gently.
    for (const pkg of this.packages) {
      if (pkg.found) continue;
      const sx = pkg.x - cam.x;
      const sy = pkg.y - cam.y + Math.sin(pkg.bob) * 4;
      if (sx < -40 || sx > 1320 || sy < -40 || sy > 840) continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = 'rgba(255,180,60,0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffb43c';
      ctx.fillRect(-8, -6, 16, 12);
      ctx.fillStyle = '#7a4d00';
      ctx.fillRect(-8, -1, 16, 2);
      ctx.fillRect(-1, -6, 2, 12);
      ctx.restore();
    }
    // Cab passenger marker.
    if (this.taxi.state === 'offered') {
      this._paintMarker(ctx, cam, this.taxi.px, this.taxi.py, '#ffd32a', 'TAXI');
    }
    if (this.taxi.state === 'aboard') {
      this._paintMarker(ctx, cam, this.taxi.dx, this.taxi.dy, '#ffd32a', 'DROP');
      const left = Math.max(0, Math.ceil(this.taxi.limit - this.taxi.timer));
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillText(`${left}s`, this.taxi.dx - cam.x + 14, this.taxi.dy - cam.y - 14);
      ctx.restore();
    }
    // Vigilante target marker.
    if (this.vigilante.state === 'active' && this.vigilante.target) {
      const fare = this.vigilante.target;
      this._paintMarker(ctx, cam, fare.x, fare.y, '#ff4757', 'TARGET');
    }
    // Pizza dest marker.
    if (this.pizza.state === 'delivering') {
      const dest = this.pizza.stops[this.pizza.stopIndex];
      if (dest) this._paintMarker(ctx, cam, dest.x, dest.y, '#ff9f43', 'PIZZA');
    }
  }

  _paintMarker(ctx, cam, x, y, color, label) {
    const sx = x - cam.x;
    const sy = y - cam.y;
    if (sx < -60 || sx > 1340 || sy < -60 || sy > 860) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, 18 + Math.sin(Date.now() / 200) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx, sy - 26);
    ctx.lineTo(sx - 8, sy - 12);
    ctx.lineTo(sx + 8, sy - 12);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, sx, sy - 32);
    ctx.restore();
  }

  // -- minimap blips (called by the renderer) -------------------------------

  blips() {
    const out = [];
    if (this.taxi.state === 'offered') out.push({ x: this.taxi.px, y: this.taxi.py, color: '#ffd32a' });
    if (this.taxi.state === 'aboard') out.push({ x: this.taxi.dx, y: this.taxi.dy, color: '#ffd32a' });
    if (this.vigilante.state === 'active' && this.vigilante.target) {
      out.push({ x: this.vigilante.target.x, y: this.vigilante.target.y, color: '#ff4757' });
    }
    if (this.pizza.state === 'delivering') {
      const dest = this.pizza.stops[this.pizza.stopIndex];
      if (dest) out.push({ x: dest.x, y: dest.y, color: '#ff9f43' });
    }
    for (const pkg of this.packages) {
      if (!pkg.found) out.push({ x: pkg.x, y: pkg.y, color: '#ffb43c', small: true });
    }
    return out;
  }

  // -- cab fares ------------------------------------------------------------

  _taxiTick(dt) {
    const fare = this.taxi;
    if (fare.state === 'idle') {
      fare.offerTimer -= dt;
      if (fare.offerTimer <= 0) {
        fare.offerTimer = 25 + Math.random() * 20;
        this._offerFare();
      }
      return;
    }
    if (fare.state === 'offered') {
      // Offer expires if the player ignores it for a while.
      fare.offerTimer -= dt;
      if (fare.offerTimer <= -25) {
        fare.state = 'idle';
        fare.offerTimer = 15 + Math.random() * 10;
        this._toast('TAXI FARE', 'The passenger gave up and flagged another cab.', 3);
      }
      return;
    }
    // aboard: timer runs, passenger nags, arrival pays.
    fare.timer += dt;
    const { x, y } = this._whereAmI();
    const d = Math.sqrt(squaredDist(x, y, fare.dx, fare.dy));
    if (fare.timer > fare.limit * 0.6 && fare.timer < fare.limit * 0.6 + dt + 0.01) {
      this._toast('PASSENGER', randomLine(CAB_NAGS), 3);
    }
    if (d < 70) {
      const timeBonus = Math.max(0, Math.round((fare.limit - fare.timer) * 0.5));
      fare.tip = 5 + Math.floor(Math.random() * 15) + timeBonus;
      this._pay(fare.fare, `Fare to ${fare.destName}`);
      this._pay(fare.tip, 'Tip');
      this._toast('PASSENGER', randomLine(CAB_THANKS), 4);
      if (this.game.stats && typeof this.game.stats.add === 'function') {
        this.game.stats.add('faresDone', 1);
        this.game.stats.add('tipsEarned', fare.tip);
      }
      fare.state = 'idle';
      fare.offerTimer = 18 + Math.random() * 15;
      return;
    }
    if (fare.timer > fare.limit) {
      this._toast('PASSENGER', randomLine(CAB_FURY), 4);
      fare.state = 'idle';
      fare.offerTimer = 20 + Math.random() * 10;
    }
  }

  _offerFare() {
    const { x, y } = this._whereAmI();
    const spot = this._farRoadPoint(x, y, 300, 900);
    const dest = this._farRoadPoint(spot.x, spot.y, 700, 1600);
    const d = Math.sqrt(squaredDist(spot.x, spot.y, dest.x, dest.y));
    this.taxi.state = 'offered';
    this.taxi.px = spot.x;
    this.taxi.py = spot.y;
    this.taxi.dx = dest.x;
    this.taxi.dy = dest.y;
    this.taxi.fare = 40 + Math.round(d / 50);
    this.taxi.destName = this._nearestPlace(dest.x, dest.y);
    this.taxi.passengerLine = randomLine(CAB_HELLOS);
    this._toast('TAXI FARE', `Passenger waiting — drive to the marker and press E. Destination: ${this.taxi.destName}.`, 6);
  }

  _pickupFare() {
    this.taxi.state = 'aboard';
    this.taxi.timer = 0;
    this.taxi.limit = 45 + Math.sqrt(squaredDist(this.taxi.px, this.taxi.py, this.taxi.dx, this.taxi.dy)) / 22;
    this._toast('PASSENGER', this.taxi.passengerLine, 5);
    if (this.game.stats && typeof this.game.stats.add === 'function') {
      this.game.stats.add('faresStarted', 1);
    }
  }

  // -- vigilante ------------------------------------------------------------

  _vigilanteTick(dt) {
    const job = this.vigilante;
    if (job.state === 'idle') {
      job.offerTimer -= dt;
      if (job.offerTimer <= 0) {
        job.offerTimer = 35 + Math.random() * 25;
        this._offerVigilante();
      }
      return;
    }
    job.timer += dt;
    const target = job.target;
    if (!target || target.wrecked || target.hp <= 0) {
      this._pay(300, 'Vigilante reward');
      this._toast('DISPATCH', 'Target down. The streets are a little safer. $300.', 4);
      if (this.game.stats && typeof this.game.stats.add === 'function') {
        this.game.stats.add('vigilanteTakedowns', 1);
      }
      job.state = 'idle';
      job.target = null;
      job.offerTimer = 30 + Math.random() * 20;
      return;
    }
    // Fleeing target: keep it moving away from the player along the roads.
    const { x, y } = this._whereAmI();
    const d = Math.sqrt(squaredDist(target.x, target.y, x, y));
    if (d < 120 && typeof target.speed === 'number') {
      target.speed = Math.min(420, target.speed + 120 * dt);
    }
    if (job.timer > job.limit) {
      this._toast('DISPATCH', 'Target got away. It happens — next time, drive angrier.', 4);
      if (target) target.isVigilanteTarget = false;
      job.state = 'idle';
      job.target = null;
      job.offerTimer = 30 + Math.random() * 20;
    }
  }

  _offerVigilante() {
    const { x, y } = this._whereAmI();
    const spot = this._farRoadPoint(x, y, 400, 1000);
    let target = null;
    if (this.game.traffic && typeof this.game.traffic.spawn === 'function') {
      this.game.traffic.spawn(1, spot.x, spot.y);
      const cars = this.game.traffic.cars;
      if (cars && cars.length) target = cars[cars.length - 1];
    }
    if (!target) return;
    target.isVigilanteTarget = true;
    target.speed = 260;
    this.vigilante.state = 'active';
    this.vigilante.target = target;
    this.vigilante.timer = 0;
    this.vigilante.brief = randomLine(DISPATCH_CALLS);
    this._toast('DISPATCH', `${this.vigilante.brief} Reward $300.`, 6);
  }

  // -- pizza delivery -------------------------------------------------------

  _pizzaTick(dt) {
    const run = this.pizza;
    if (run.state === 'idle') {
      run.offerTimer -= dt;
      if (run.offerTimer <= 0) {
        run.offerTimer = 35 + Math.random() * 20;
        this._offerPizza();
      }
      return;
    }
    run.timer += dt;
    const { x, y } = this._whereAmI();
    const dest = run.stops[run.stopIndex];
    if (dest && squaredDist(x, y, dest.x, dest.y) < 70 * 70) {
      const bonus = run.timer < 60 ? 20 : 0;
      this._pay(run.pay + bonus, `Pizza delivery ${run.stopIndex + 1}/3`);
      run.stopIndex += 1;
      if (run.stopIndex >= run.stops.length) {
        this._toast('PIZZA RUN', 'All deliveries done! The shop loves you. Come back for the next shift.', 4);
        if (this.game.stats && typeof this.game.stats.add === 'function') {
          this.game.stats.add('pizzasDelivered', 3);
        }
        run.state = 'idle';
        run.offerTimer = 30 + Math.random() * 20;
        return;
      }
      this._toast('PIZZA RUN', `Delivery ${run.stopIndex + 1}/3 — next customer is waiting.`, 3);
    }
    if (run.timer > run.limit) {
      this._toast('PIZZA RUN', 'Too slow — the pizzas went cold and the customers complained.', 4);
      run.state = 'idle';
      run.offerTimer = 30 + Math.random() * 20;
    }
  }

  _offerPizza() {
    const { x, y } = this._whereAmI();
    const stops = [];
    for (let i = 0; i < 3; i++) {
      stops.push(this._farRoadPoint(x, y, 400, 1500));
    }
    this.pizza.state = 'delivering';
    this.pizza.stops = stops;
    this.pizza.stopIndex = 0;
    this.pizza.timer = 0;
    this.pizza.limit = 150;
    this.pizza.pay = 60;
    this._toast('PIZZA RUN', `${randomLine(PIZZA_GREETS)} 3 deliveries, $60 each. Follow the marker!`, 6);
  }

  // -- hidden packages ------------------------------------------------------

  _stashTick(dt) {
    const { x, y } = this._whereAmI();
    for (const pkg of this.packages) {
      if (pkg.found) continue;
      pkg.bob += dt * 2;
      if (squaredDist(x, y, pkg.x, pkg.y) < 34 * 34) {
        pkg.found = true;
        this.packagesFound += 1;
        this._pay(100, `Hidden package ${this.packagesFound}/30`);
        if (this.packagesFound === 10) {
          this._toast('COLLECTOR', '10 packages! The old smuggler would be proud.', 4);
        } else if (this.packagesFound === 20) {
          this._toast('COLLECTOR', '20 packages! Only 10 left out there.', 4);
        } else if (this.packagesFound === 30) {
          this._pay(1000, 'ALL 30 packages — collector bonus');
          this._toast('COLLECTOR', 'ALL 30 PACKAGES! $1,000 bonus. You know this city better than the mayor.', 6);
        }
        if (this.game.stats && typeof this.game.stats.add === 'function') {
          this.game.stats.add('packagesFound', 1);
        }
      }
    }
  }

  // -- small guarded game helpers -------------------------------------------

  _whereAmI() {
    const run = this.game.player;
    if (!run) return { x: 0, y: 0 };
    return { x: run.x || 0, y: run.y || 0 };
  }

  _riding() {
    return !!(this.game.player && this.game.player.inCar);
  }

  _pay(amount, label) {
    const g = this.game;
    if (typeof g.addCash === 'function') g.addCash(amount);
    else if (typeof g.money === 'number') g.money += amount;
    else if (typeof g.cash === 'number') g.cash += amount;
    if (label) this._toast('CASH', `${label} +$${amount}`);
    if (g.stats && typeof g.stats.add === 'function') g.stats.add('cashEarned', amount);
  }

  _toast(title, text, secs = 4) {
    const g = this.game;
    if (g.hud && typeof g.hud.toast === 'function') g.hud.toast(title, text, secs);
  }

  _setHeat(n) {
    if (typeof this.game.setWanted === 'function') this.game.setWanted(n);
  }

  _farRoadPoint(x, y, minD = 500, maxD = 1400) {
    // A random road point at a reasonable distance from (x, y).
    for (let tries = 0; tries < 12; tries++) {
      const ax = AVENUES[Math.floor(Math.random() * AVENUES.length)];
      const sy = STREETS[Math.floor(Math.random() * STREETS.length)];
      const d = Math.sqrt(squaredDist(ax, sy, x, y));
      if (d >= minD && d <= maxD) return { x: ax, y: sy };
    }
    return { x: AVENUES[2], y: STREETS[1] };
  }

  _nearestPlace(x, y) {
    const names = [
      ['the docks', 0, 3], ['the airport', 6, 0], ['the stadium', 5, 2],
      ['Club Flamingo', 4, 1], ['the bank', 3, 1], ['Coral Beach', 2, 3],
      ['the hotel', 5, 0], ['the market', 1, 2], ['the bridge', 6, 3],
    ];
    let best = names[0];
    let bestD = Infinity;
    for (const [name, ai, si] of names) {
      const d = squaredDist(AVENUES[ai], STREETS[si], x, y);
      if (d < bestD) { bestD = d; best = [name, ai, si]; }
    }
    return best[0];
  }

  _listenKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyE') this._onInteract();
    });
  }

  _onInteract() {
    if (this.taxi.state === 'offered') {
      const { x, y } = this._whereAmI();
      if (squaredDist(x, y, this.taxi.px, this.taxi.py) < 90 * 90) this._pickupFare();
    }
  }
}
