// Missions: a seven-job story for Marco Solano, plus taxi fares,
// courier runs and hidden cash stashes to chase while free-roaming.
import { distSq } from './config.js';
import { CourierRun, makeCourierJob } from './courier.js';

export const STORY = [
  {
    id: 'm1',
    title: 'First Wheels',
    pay: 300,
    brief: 'Marco needs wheels. Lift any car off the street and bring it to Solano Garage.',
    steps: [
      { type: 'stealCar', text: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', place: 'garage', text: 'Drive it to Solano Garage', radius: 90 },
    ],
  },
  {
    id: 'm2',
    title: 'The Pickup',
    pay: 450,
    brief: 'Lucia is waiting down at Coral Marina. Fetch her and get her to Club Flamingo before the doors fill up.',
    steps: [
      { type: 'goto', place: 'marina', text: 'Pick up Lucia at Coral Marina', radius: 80 },
      { type: 'goto', place: 'club', text: 'Drive Lucia to Club Flamingo', radius: 90, timer: 75 },
    ],
  },
  {
    id: 'm3',
    title: 'Hot Pursuit',
    pay: 500,
    brief: 'The precinct has Marco in its sights. Stir up a 3-star wanted level — then vanish.',
    steps: [
      { type: 'wanted', stars: 3, text: 'Raise your wanted level to 3 stars (cause chaos!)' },
      { type: 'loseCops', text: 'Lose the cops — stay out of sight until the heat dies down' },
    ],
  },
  {
    id: 'm4',
    title: 'The Drop',
    pay: 650,
    brief: 'A package for the Golden Palm Pawn, and the clock is running. Deliver it in one piece.',
    steps: [
      { type: 'goto', place: 'pawnshop', text: 'Deliver the package to Golden Palm Pawn', radius: 85, timer: 90 },
    ],
  },
  {
    id: 'm5',
    title: 'Bank Job',
    pay: 1200,
    brief: 'Palmera Reserve Bank, midday. Grab the cash, then outrun a 4-star response.',
    steps: [
      { type: 'goto', place: 'bank', text: 'Reach Palmera Reserve Bank', radius: 85 },
      { type: 'rob', text: 'Hold up the bank — stay inside the marker 6 seconds', hold: 6 },
      { type: 'escape', stars: 4, text: 'Escape! Lose the 4-star wanted level', radius: 0 },
    ],
  },
  {
    id: 'm6',
    title: 'The Big Score',
    pay: 2500,
    brief: 'One last job: lift the armored van parked at Bay Sharks Stadium and run it to the South Docks. Then Marco walks free.',
    steps: [
      { type: 'goto', place: 'stadium', text: 'Reach Bay Sharks Stadium', radius: 95 },
      { type: 'stealVan', text: 'Steal the armored van' },
      { type: 'goto', place: 'docks', text: 'Deliver the van to the South Docks', radius: 100, timer: 120 },
    ],
  },
  {
    id: 'm7',
    title: 'The Getaway',
    pay: 1800,
    brief: 'The crew needs a fast car and a clean exit. Steal a Falcon GT — the fastest thing on the streets — and run it to Palmera Airfield before the precinct locks the city down.',
    steps: [
      { type: 'stealModel', model: 'Falcon GT', text: 'Steal a Falcon GT (the red one — fastest in town)' },
      { type: 'goto', place: 'airport', text: 'Run it to Palmera Airfield', radius: 95, timer: 100 },
      { type: 'escape', stars: 3, text: 'Escape! Lose the 3-star wanted level', radius: 0 },
    ],
  },
];

// Where Marco is right now, in the car or on foot.
function positionOf(game) {
  const p = game.player;
  if (p.inCar && game.playerCar) return { x: game.playerCar.x, y: game.playerCar.y };
  return { x: p.x, y: p.y };
}

function within(x, y, target, radius) {
  return distSq(x, y, target.x, target.y) < radius * radius;
}

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.storyIndex = 0; // next story mission (0..STORY.length)
    this.active = null; // {def, step, timer, holdT}
    this.taxi = null; // active fare {pickup, drop, stage, pay, timer}
    this.courier = null; // active courier run (CourierRun) or null
    this.completed = 0;
    this.packagesFound = 0;
    this.packages = []; // hidden cash stashes {x, y, found}
    this.vanReady = false; // the m6 armored van has been parked at the stadium
  }

  get storyDone() {
    return this.storyIndex >= STORY.length;
  }

  startStory() {
    if (this.storyDone) return false;
    const def = STORY[this.storyIndex];
    this.active = { def, step: 0, timer: 0, holdT: 0 };
    if (def.id === 'm6' && !this.vanReady) {
      // Park the armored van at the stadium before the job begins.
      const spot = this.game.city.landmarks.stadium;
      this.game.traffic.spawnVan(spot.x + 60, spot.y + 30);
      this.vanReady = true;
    }
    this.announce(def);
    return true;
  }

  announce(def) {
    const g = this.game;
    g.toast(`MISSION: ${def.title}`, def.brief, 6);
    g.sounds.pickup();
  }

  currentStep() {
    if (!this.active) return null;
    return this.active.def.steps[this.active.step];
  }

  currentTarget() {
    const step = this.currentStep();
    if (!step || !step.place) return null;
    return this.game.city.landmarks[step.place];
  }

  fail(reason) {
    const g = this.game;
    g.toast('MISSION FAILED', reason, 5);
    g.sounds.missionFail();
    this.active = null;
  }

  complete() {
    const g = this.game;
    const def = this.active.def;
    g.player.money += def.pay;
    g.sounds.missionDone();
    g.sounds.cash();
    g.toast('MISSION COMPLETE', `${def.title} — earned $${def.pay}`, 6);
    g.addCash(0, g.player.x, g.player.y);
    this.completed += 1;
    this.storyIndex += 1;
    this.active = null;
    if (this.storyDone) {
      g.toast(
        'PALMERA BAY IS YOURS',
        'Every job done. Marco Solano runs this city now — free roam, fares and stashes remain.',
        9,
      );
      g.saveGame();
    }
  }

  nextStep() {
    this.active.step += 1;
    this.active.timer = 0;
    this.active.holdT = 0;
    if (this.active.step >= this.active.def.steps.length) {
      this.complete();
      return;
    }
    this.game.toast('NEW OBJECTIVE', this.currentStep().text, 5);
  }

  // One frame of the active story step. Each step type has its own
  // handler below; the timer runs for every step that carries one.
  update(dt) {
    const g = this.game;
    if (!this.active) return;
    const step = this.currentStep();
    if (!step) return;
    if (step.timer) {
      this.active.timer += dt;
      if (this.active.timer > step.timer) {
        this.fail('Out of time — the window closed.');
        return;
      }
    }
    const handler = this.stepHandlers[step.type];
    if (handler) handler.call(this, dt, step);
  }

  // Dispatch table: one method per step type.
  get stepHandlers() {
    return {
      goto: this.stepGoto,
      stealCar: this.stepStealCar,
      stealVan: this.stepStealVan,
      stealModel: this.stepStealModel,
      wanted: this.stepWanted,
      loseCops: this.stepLoseCops,
      rob: this.stepRob,
      escape: this.stepEscape,
    };
  }

  stepGoto(dt, step) {
    const g = this.game;
    const pos = positionOf(g);
    const target = g.city.landmarks[step.place];
    if (within(pos.x, pos.y, target, step.radius)) this.nextStep();
  }

  stepStealCar() {
    if (this.game.player.inCar) this.nextStep();
  }

  stepStealVan() {
    const g = this.game;
    if (g.player.inCar && g.playerCar && g.playerCar.van) this.nextStep();
  }

  stepStealModel(dt, step) {
    const g = this.game;
    if (g.player.inCar && g.playerCar && g.playerCar.model.name === step.model) this.nextStep();
  }

  stepWanted(dt, step) {
    if (this.game.wanted >= step.stars) this.nextStep();
  }

  stepLoseCops() {
    const g = this.game;
    if (g.wanted === 0 && g.cops.length === 0 && g.policeCars() === 0) this.nextStep();
  }

  stepRob(dt, step) {
    const g = this.game;
    const pos = positionOf(g);
    const bank = g.city.landmarks.bank;
    if (!within(pos.x, pos.y, bank, 100)) {
      this.active.holdT = 0;
      return;
    }
    this.active.holdT += dt;
    if (this.active.holdT < step.hold) return;
    g.player.money += 800;
    g.addCrime(3, 'Bank robbed! $800 grabbed — the whole precinct is coming.');
    g.sounds.cash();
    this.nextStep();
  }

  stepEscape(dt, step) {
    const g = this.game;
    g.setWanted(Math.max(g.wanted, step.stars));
    if (g.wanted === 0 && g.cops.length === 0 && g.policeCars() === 0) this.nextStep();
  }

  // --- Taxi fares (side activity) ---

  offerTaxi() {
    const g = this.game;
    if (this.taxi || this.active) return false;
    if (!g.playerCar || !g.playerCar.taxi) return false;
    const spots = Object.values(g.city.landmarks);
    const from = spots[Math.floor(Math.random() * spots.length)];
    let to = spots[Math.floor(Math.random() * spots.length)];
    if (to === from) to = spots[(spots.indexOf(from) + 3) % spots.length];
    const pay = 60 + Math.floor(Math.random() * 60);
    this.taxi = { pickup: from, drop: to, stage: 'pickup', pay, timer: 0 };
    g.toast('TAXI FARE', `Passenger waiting near the marker — pick them up, then drop them off. Pays $${pay}.`, 5);
    return true;
  }

  updateTaxi(dt) {
    const g = this.game;
    if (!this.taxi || !g.playerCar) return;
    const car = g.playerCar;
    this.taxi.timer += dt;
    if (this.taxi.stage === 'pickup') {
      if (within(car.x, car.y, this.taxi.pickup, 80)) {
        this.taxi.stage = 'drop';
        g.toast('PASSENGER ABOARD', 'Drive them to the drop-off marker.', 4);
        g.sounds.pickup();
      }
    } else if (within(car.x, car.y, this.taxi.drop, 80)) {
      g.player.money += this.taxi.pay;
      g.sounds.cash();
      g.toast('FARE PAID', `+$${this.taxi.pay} — nice driving.`, 4);
      this.taxi = null;
    }
    if (this.taxi && this.taxi.timer > 120) {
      this.taxi = null;
      g.toast('FARE LOST', 'The passenger gave up waiting.', 4);
    }
  }

  // --- Courier runs (side activity) ---

  offerCourier() {
    const g = this.game;
    if (this.courier || this.taxi || this.active) return false;
    if (!g.playerCar) return false;
    const job = makeCourierJob(Math.random, g.city.landmarks);
    this.courier = new CourierRun(job);
    g.toast(
      'COURIER JOB',
      `Parcel run: collect at ${this.courier.pickupName}, deliver to ${this.courier.dropName} in ${job.timeLimit}s. Pays $${job.pay}.`,
      6,
    );
    return true;
  }

  updateCourier(dt) {
    const g = this.game;
    if (!this.courier || !g.playerCar) return;
    const car = g.playerCar;
    const event = this.courier.update(dt, car.x, car.y);
    if (event === 'picked') {
      g.toast('PARCEL COLLECTED', `Now deliver it to ${this.courier.dropName} — ${Math.ceil(this.courier.timeLeft)}s left.`, 4);
      g.sounds.pickup();
    } else if (event === 'delivered') {
      g.player.money += this.courier.pay;
      g.sounds.cash();
      g.toast('DELIVERED', `+$${this.courier.pay} — right on time.`, 4);
      this.courier = null;
    } else if (event === 'expired') {
      g.toast('DELIVERY LATE', 'The parcel run expired — the client went elsewhere.', 4);
      this.courier = null;
    }
  }

  // --- Hidden cash stashes ---

  placePackages() {
    const spots = [
      { x: 500, y: 2400 },
      { x: 1500, y: 2450 },
      { x: 2800, y: 2400 },
      { x: 3200, y: 1800 },
      { x: 300, y: 900 },
      { x: 2400, y: 500 },
      { x: 1800, y: 1500 },
      { x: 900, y: 1900 },
      { x: 2600, y: 1100 },
      { x: 1300, y: 700 },
    ];
    this.packages = spots.map((s) => ({ ...s, found: false }));
  }

  checkPackages() {
    const g = this.game;
    const p = g.player;
    for (const pkg of this.packages) {
      if (pkg.found) continue;
      if (!within(p.x, p.y, pkg, 40)) continue;
      pkg.found = true;
      this.packagesFound += 1;
      p.money += 150;
      g.sounds.cash();
      g.toast('CASH STASH', `+$150 — stash ${this.packagesFound}/10 found.`, 4);
      g.addParticles(pkg.x, pkg.y, 12, '#f2c230');
    }
  }
}
