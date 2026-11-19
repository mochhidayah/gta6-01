// Palmera Bay side activities — the things to do between story missions:
// taxi fares with passenger dialogue and tips, vigilante takedowns,
// pizza delivery runs, and 30 hidden packages scattered across the city.
//
// Wiring (main.js): const jobs = new SideJobs(game); jobs.update(dt) every
// frame; jobs.draw(ctx, cam) from the renderer after the world is drawn.
// All state lives here; the game object is only read through small guarded
// helpers, so this module never crashes if a field is missing.
//
// Controls: drive near a waiting passenger and press E to pick them up.
// Vigilante targets and pizza runs appear as map markers; drive into the
// marker to start. Hidden packages are picked up by walking or driving
// over them.

import { AVENUES, STREETS } from './city.js';

// ---------------------------------------------------------------------------
// Dialogue banks. Passengers, pizza customers and vigilante dispatch all
// talk through the HUD toast, so the lines stay readable while driving.
// ---------------------------------------------------------------------------

const TAXI_GREETINGS = [
  'To the club, please. And step on it — I am late for my own birthday.',
  'Airport, terminal two. If we miss the flight, you are paying for it.',
  'Take me to the docks. No questions. I will tip for the silence.',
  'The bank on Coral Avenue. Quickly, before it closes.',
  'Beachfront, please. I need to see the water before I lose my mind.',
  'Stadium, gate three. My team is already losing without me.',
  'Just drive around the block a few times. I am avoiding someone.',
  'To the hotel on the bay. And please, no sudden stops.',
];

const TAXI_HURRY = [
  'Come on, my meter is running and so is my patience.',
  'Faster! I have a dinner reservation in ten minutes.',
  'You drive like my grandmother. No offence to grandmothers.',
  'Left! No — right! Just… go that way. You know the way.',
];

const TAXI_THANKS = [
  'Not bad. Keep the change — you earned it.',
  'Five stars. I never give five stars. Do not tell anyone.',
  'Smooth ride. Here is a little extra for the air conditioning.',
  'You are my favourite driver in this city. That is not saying much, but still.',
];

const TAXI_ANGRY = [
  'I am walking from here. This is a disaster.',
  'My aunt drives faster than you, and she is afraid of cars.',
  'Unbelievable. I could have swum there faster.',
];

const PIZZA_LINES = [
  'Extra cheese, no anchovies. Do not mix it up this time.',
  'Thirty minutes or it is free, pal. The clock is ticking.',
  'Careful with the box! If it is upside down, so are you.',
  'Mamma mia, finally. I was about to eat the menu.',
];

const VIGILANTE_BRIEFS = [
  'Dispatch: a Sharks getaway car is fleeing down the avenues. Stop it.',
  'Dispatch: Vipers courier on the run with a trunk full of trouble. Bring it down.',
  'Dispatch: stolen Coral Coupe spotted near the docks. Ram it till it stops.',
  'Dispatch: getaway driver heading for the bridge. Do not let him cross.',
];

// Hidden package spots: fixed intersections across the whole map, chosen so
// a player who explores the city will stumble on them. Each entry is
// [avenueIndex, streetIndex, dx, dy] in world coordinates.
const PACKAGE_SPOTS = [
  [0, 0, 40, 30], [1, 0, -50, 60], [2, 0, 30, -40], [3, 0, -30, 20], [4, 0, 50, -60],
  [5, 0, -40, 40], [6, 0, 20, -30], [0, 1, -60, 10], [1, 1, 45, -25], [2, 1, -35, 55],
  [3, 1, 60, 30], [4, 1, -45, -45], [5, 1, 25, 60], [6, 1, -20, -55], [0, 2, 55, -35],
  [1, 2, -25, 45], [2, 2, 40, 20], [3, 2, -55, -20], [4, 2, 30, -50], [5, 2, -30, 35],
  [6, 2, 45, 45], [0, 3, -40, -30], [1, 3, 35, 55], [2, 3, -50, 25], [3, 3, 55, -55],
  [4, 3, -35, 40], [5, 3, 20, -40], [6, 3, -45, 60], [1, 0, 0, 0], [5, 2, 0, 0],
];

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class SideJobs {
  constructor(game) {
    this.game = game;
    this.packages = PACKAGE_SPOTS.map(([ai, si, dx, dy], i) => ({
      id: i,
      x: AVENUES[ai] + dx,
      y: STREETS[si] + dy,
      found: false,
      bob: Math.random() * Math.PI * 2,
    }));
    this.packagesFound = 0;
    // Taxi fare state machine: idle -> offered -> aboard -> done.
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
    this._bindKeys();
  }

  // -- small guarded game helpers ------------------------------------------
  _playerPos() {
    const p = this.game.player;
    if (!p) return { x: 0, y: 0 };
    return { x: p.x || 0, y: p.y || 0 };
  }

  _inCar() {
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

  _wanted(n) {
    if (typeof this.game.setWanted === 'function') this.game.setWanted(n);
  }

  _roadPointNear(x, y, minD = 500, maxD = 1400) {
    // A random road point at a reasonable distance from (x, y).
    for (let tries = 0; tries < 12; tries++) {
      const ax = AVENUES[Math.floor(Math.random() * AVENUES.length)];
      const sy = STREETS[Math.floor(Math.random() * STREETS.length)];
      const d = Math.sqrt(dist2(ax, sy, x, y));
      if (d >= minD && d <= maxD) return { x: ax, y: sy };
    }
    return { x: AVENUES[2], y: STREETS[1] };
  }

  _placeName(x, y) {
    const names = [
      ['the docks', 0, 3], ['the airport', 6, 0], ['the stadium', 5, 2],
      ['Club Flamingo', 4, 1], ['the bank', 3, 1], ['Coral Beach', 2, 3],
      ['the hotel', 5, 0], ['the market', 1, 2], ['the bridge', 6, 3],
    ];
    let best = names[0];
    let bestD = Infinity;
    for (const [name, ai, si] of names) {
      const d = dist2(AVENUES[ai], STREETS[si], x, y);
      if (d < bestD) { bestD = d; best = [name, ai, si]; }
    }
    return best[0];
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyE') this._onInteract();
    });
  }

  _onInteract() {
    if (this.taxi.state === 'offered') {
      const { x, y } = this._playerPos();
      if (dist2(x, y, this.taxi.px, this.taxi.py) < 90 * 90) this._taxiPickup();
    }
  }

  // -- taxi fares -------------------------------------------------------------
  _taxiOffer() {
    const { x, y } = this._playerPos();
    const spot = this._roadPointNear(x, y, 300, 900);
    const dest = this._roadPointNear(spot.x, spot.y, 700, 1600);
    const d = Math.sqrt(dist2(spot.x, spot.y, dest.x, dest.y));
    this.taxi.state = 'offered';
    this.taxi.px = spot.x;
    this.taxi.py = spot.y;
    this.taxi.dx = dest.x;
    this.taxi.dy = dest.y;
    this.taxi.fare = 40 + Math.round(d / 50);
    this.taxi.destName = this._placeName(dest.x, dest.y);
    this.taxi.passengerLine = pick(TAXI_GREETINGS);
    this._toast('TAXI FARE', `Passenger waiting — drive to the marker and press E. Destination: ${this.taxi.destName}.`, 6);
  }

  _taxiPickup() {
    this.taxi.state = 'aboard';
    this.taxi.timer = 0;
    this.taxi.limit = 45 + Math.sqrt(dist2(this.taxi.px, this.taxi.py, this.taxi.dx, this.taxi.dy)) / 22;
    this._toast('PASSENGER', this.taxi.passengerLine, 5);
    if (this.game.stats && typeof this.game.stats.add === 'function') {
      this.game.stats.add('faresStarted', 1);
    }
  }

  _taxiUpdate(dt) {
    const t = this.taxi;
    if (t.state === 'idle') {
      t.offerTimer -= dt;
      if (t.offerTimer <= 0) {
        t.offerTimer = 25 + Math.random() * 20;
        this._taxiOffer();
      }
      return;
    }
    if (t.state === 'offered') {
      // Offer expires if the player ignores it for a while.
      t.offerTimer -= dt;
      if (t.offerTimer <= -25) {
        t.state = 'idle';
        t.offerTimer = 15 + Math.random() * 10;
        this._toast('TAXI FARE', 'The passenger gave up and flagged another cab.', 3);
      }
      return;
    }
    // aboard: timer runs, passenger nags, arrival pays.
    t.timer += dt;
    const { x, y } = this._playerPos();
    const d = Math.sqrt(dist2(x, y, t.dx, t.dy));
    if (t.timer > t.limit * 0.6 && t.timer < t.limit * 0.6 + dt + 0.01) {
      this._toast('PASSENGER', pick(TAXI_HURRY), 3);
    }
    if (d < 70) {
      const timeBonus = Math.max(0, Math.round((t.limit - t.timer) * 0.5));
      t.tip = 5 + Math.floor(Math.random() * 15) + timeBonus;
      this._pay(t.fare, `Fare to ${t.destName}`);
      this._pay(t.tip, 'Tip');
      this._toast('PASSENGER', pick(TAXI_THANKS), 4);
      if (this.game.stats && typeof this.game.stats.add === 'function') {
        this.game.stats.add('faresDone', 1);
        this.game.stats.add('tipsEarned', t.tip);
      }
      t.state = 'idle';
      t.offerTimer = 18 + Math.random() * 15;
      return;
    }
    if (t.timer > t.limit) {
      this._toast('PASSENGER', pick(TAXI_ANGRY), 4);
      t.state = 'idle';
      t.offerTimer = 20 + Math.random() * 10;
    }
  }

  // -- vigilante ---------------------------------------------------------------
  _vigilanteOffer() {
    const { x, y } = this._playerPos();
    const spot = this._roadPointNear(x, y, 400, 1000);
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
    this.vigilante.brief = pick(VIGILANTE_BRIEFS);
    this._toast('DISPATCH', `${this.vigilante.brief} Reward $300.`, 6);
  }

  _vigilanteUpdate(dt) {
    const v = this.vigilante;
    if (v.state === 'idle') {
      v.offerTimer -= dt;
      if (v.offerTimer <= 0) {
        v.offerTimer = 35 + Math.random() * 25;
        this._vigilanteOffer();
      }
      return;
    }
    v.timer += dt;
    const target = v.target;
    if (!target || target.wrecked || target.hp <= 0) {
      this._pay(300, 'Vigilante reward');
      this._toast('DISPATCH', 'Target down. The streets are a little safer. $300.', 4);
      if (this.game.stats && typeof this.game.stats.add === 'function') {
        this.game.stats.add('vigilanteTakedowns', 1);
      }
      v.state = 'idle';
      v.target = null;
      v.offerTimer = 30 + Math.random() * 20;
      return;
    }
    // Fleeing target: keep it moving away from the player along the roads.
    const { x, y } = this._playerPos();
    const d = Math.sqrt(dist2(target.x, target.y, x, y));
    if (d < 120 && typeof target.speed === 'number') {
      target.speed = Math.min(420, target.speed + 120 * dt);
    }
    if (v.timer > v.limit) {
      this._toast('DISPATCH', 'Target got away. It happens — next time, drive angrier.', 4);
      if (target) target.isVigilanteTarget = false;
      v.state = 'idle';
      v.target = null;
      v.offerTimer = 30 + Math.random() * 20;
    }
  }

  // -- pizza delivery ------------------------------------------------------------
  _pizzaOffer() {
    const { x, y } = this._playerPos();
    const stops = [];
    for (let i = 0; i < 3; i++) {
      stops.push(this._roadPointNear(x, y, 400, 1500));
    }
    this.pizza.state = 'delivering';
    this.pizza.stops = stops;
    this.pizza.stopIndex = 0;
    this.pizza.timer = 0;
    this.pizza.limit = 150;
    this.pizza.pay = 60;
    this._toast('PIZZA RUN', `${pick(PIZZA_LINES)} 3 deliveries, $60 each. Follow the marker!`, 6);
  }

  _pizzaUpdate(dt) {
    const p = this.pizza;
    if (p.state === 'idle') {
      p.offerTimer -= dt;
      if (p.offerTimer <= 0) {
        p.offerTimer = 35 + Math.random() * 20;
        this._pizzaOffer();
      }
      return;
    }
    p.timer += dt;
    const { x, y } = this._playerPos();
    const stop = p.stops[p.stopIndex];
    if (stop && dist2(x, y, stop.x, stop.y) < 70 * 70) {
      const bonus = p.timer < 60 ? 20 : 0;
      this._pay(p.pay + bonus, `Pizza delivery ${p.stopIndex + 1}/3`);
      p.stopIndex += 1;
      if (p.stopIndex >= p.stops.length) {
        this._toast('PIZZA RUN', 'All deliveries done! The shop loves you. Come back for the next shift.', 4);
        if (this.game.stats && typeof this.game.stats.add === 'function') {
          this.game.stats.add('pizzasDelivered', 3);
        }
        p.state = 'idle';
        p.offerTimer = 30 + Math.random() * 20;
        return;
      }
      this._toast('PIZZA RUN', `Delivery ${p.stopIndex + 1}/3 — next customer is waiting.`, 3);
    }
    if (p.timer > p.limit) {
      this._toast('PIZZA RUN', 'Too slow — the pizzas went cold and the customers complained.', 4);
      p.state = 'idle';
      p.offerTimer = 30 + Math.random() * 20;
    }
  }

  // -- hidden packages ------------------------------------------------------------
  _packagesUpdate(dt) {
    const { x, y } = this._playerPos();
    for (const pkg of this.packages) {
      if (pkg.found) continue;
      pkg.bob += dt * 2;
      if (dist2(x, y, pkg.x, pkg.y) < 34 * 34) {
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

  // -- frame -----------------------------------------------------------------------
  update(dt) {
    this._taxiUpdate(dt);
    this._vigilanteUpdate(dt);
    this._pizzaUpdate(dt);
    this._packagesUpdate(dt);
  }

  // -- drawing (called by the renderer, screen-space via camera) --------------------
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
    // Taxi passenger marker.
    if (this.taxi.state === 'offered') {
      this._drawMarker(ctx, cam, this.taxi.px, this.taxi.py, '#ffd32a', 'TAXI');
    }
    if (this.taxi.state === 'aboard') {
      this._drawMarker(ctx, cam, this.taxi.dx, this.taxi.dy, '#ffd32a', 'DROP');
      const left = Math.max(0, Math.ceil(this.taxi.limit - this.taxi.timer));
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillText(`${left}s`, this.taxi.dx - cam.x + 14, this.taxi.dy - cam.y - 14);
      ctx.restore();
    }
    // Vigilante target marker.
    if (this.vigilante.state === 'active' && this.vigilante.target) {
      const t = this.vigilante.target;
      this._drawMarker(ctx, cam, t.x, t.y, '#ff4757', 'TARGET');
    }
    // Pizza stop marker.
    if (this.pizza.state === 'delivering') {
      const stop = this.pizza.stops[this.pizza.stopIndex];
      if (stop) this._drawMarker(ctx, cam, stop.x, stop.y, '#ff9f43', 'PIZZA');
    }
  }

  _drawMarker(ctx, cam, x, y, color, label) {
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

  // -- minimap blips (called by the renderer) ---------------------------------------
  blips() {
    const out = [];
    if (this.taxi.state === 'offered') out.push({ x: this.taxi.px, y: this.taxi.py, color: '#ffd32a' });
    if (this.taxi.state === 'aboard') out.push({ x: this.taxi.dx, y: this.taxi.dy, color: '#ffd32a' });
    if (this.vigilante.state === 'active' && this.vigilante.target) {
      out.push({ x: this.vigilante.target.x, y: this.vigilante.target.y, color: '#ff4757' });
    }
    if (this.pizza.state === 'delivering') {
      const stop = this.pizza.stops[this.pizza.stopIndex];
      if (stop) out.push({ x: stop.x, y: stop.y, color: '#ff9f43' });
    }
    for (const pkg of this.packages) {
      if (!pkg.found) out.push({ x: pkg.x, y: pkg.y, color: '#ffb43c', small: true });
    }
    return out;
  }
}
