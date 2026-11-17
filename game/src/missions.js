// Missions: a six-job story for Marco Solano, plus taxi fares and
// hidden cash stashes for free-roam progression.
import { dist2 } from './config.js';

export const STORY = [
  {
    id: 'm1', title: 'First Wheels', pay: 300,
    brief: 'Marco needs a ride. Steal any car and bring it to Solano Garage.',
    steps: [
      { type: 'stealCar', text: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', place: 'garage', text: 'Drive it to Solano Garage', radius: 90 },
    ],
  },
  {
    id: 'm2', title: 'The Pickup', pay: 450,
    brief: 'Lucia is waiting at Coral Marina. Pick her up and drive her to Club Flamingo before the club fills up.',
    steps: [
      { type: 'goto', place: 'marina', text: 'Pick up Lucia at Coral Marina', radius: 80 },
      { type: 'goto', place: 'club', text: 'Drive Lucia to Club Flamingo', radius: 90, timer: 75 },
    ],
  },
  {
    id: 'm3', title: 'Hot Pursuit', pay: 500,
    brief: 'The precinct is onto Marco. Get a 3-star wanted level, then lose the cops.',
    steps: [
      { type: 'wanted', stars: 3, text: 'Raise your wanted level to 3 stars (cause chaos!)' },
      { type: 'loseCops', text: 'Lose the cops — stay out of sight until the heat dies down' },
    ],
  },
  {
    id: 'm4', title: 'The Drop', pay: 650,
    brief: 'A package for the Golden Palm Pawn. Deliver it — and mind the checkpoints.',
    steps: [
      { type: 'goto', place: 'pawnshop', text: 'Deliver the package to Golden Palm Pawn', radius: 85, timer: 90 },
    ],
  },
  {
    id: 'm5', title: 'Bank Job', pay: 1200,
    brief: 'Palmera Reserve Bank, midday. Grab the cash, then outrun a 4-star response.',
    steps: [
      { type: 'goto', place: 'bank', text: 'Reach Palmera Reserve Bank', radius: 85 },
      { type: 'rob', text: 'Hold up the bank — stay inside the marker 6 seconds', hold: 6 },
      { type: 'escape', stars: 4, text: 'Escape! Lose the 4-star wanted level', radius: 0 },
    ],
  },
  {
    id: 'm6', title: 'The Big Score', pay: 2500,
    brief: 'One last job: steal the armored van at the stadium and bring it to the South Docks. Then Marco is free.',
    steps: [
      { type: 'goto', place: 'stadium', text: 'Reach Bay Sharks Stadium', radius: 95 },
      { type: 'stealVan', text: 'Steal the armored van' },
      { type: 'goto', place: 'docks', text: 'Deliver the van to the South Docks', radius: 100, timer: 120 },
    ],
  },
];

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.storyIndex = 0;      // next story mission (0..STORY.length)
    this.active = null;       // {def, step, timer, holdT, ...}
    this.taxi = null;         // active taxi fare {pickup, drop, pay}
    this.completed = 0;
    this.packagesFound = 0;
    this.packages = [];       // hidden cash stashes {x,y,found}
  }

  get storyDone() { return this.storyIndex >= STORY.length; }

  startStory() {
    if (this.storyDone) return false;
    const def = STORY[this.storyIndex];
    this.active = { def, step: 0, timer: 0, holdT: 0, started: true };
    this.announce(def);
    return true;
  }

  announce(def) {
    const g = this.game;
    g.toast(`MISSION: ${def.title}`, def.brief, 6);
    g.sounds.pickup();
  }

  currentStep() {
    return this.active ? this.active.def.steps[this.active.step] : null;
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
      g.toast('PALMERA BAY IS YOURS', 'Every job done. Marco Solano runs this city now — free roam, fares and stashes remain.', 9);
      g.saveGame();
    }
  }

  nextStep() {
    this.active.step += 1;
    this.active.timer = 0;
    this.active.holdT = 0;
    if (this.active.step >= this.active.def.steps.length) this.complete();
    else {
      const step = this.currentStep();
      this.game.toast('NEW OBJECTIVE', step.text, 5);
    }
  }

  update(dt) {
    const g = this.game;
    if (!this.active) return;
    const step = this.currentStep();
    if (!step) return;
    const p = g.player;
    const px = p.inCar ? g.playerCar.x : p.x;
    const py = p.inCar ? g.playerCar.y : p.y;

    if (step.timer) {
      this.active.timer += dt;
      if (this.active.timer > step.timer) {
        this.fail('Out of time — the window closed.');
        return;
      }
    }

    switch (step.type) {
      case 'goto': {
        const t = g.city.landmarks[step.place];
        if (dist2(px, py, t.x, t.y) < step.radius * step.radius) this.nextStep();
        break;
      }
      case 'stealCar': {
        if (p.inCar) this.nextStep();
        break;
      }
      case 'stealVan': {
        if (p.inCar && g.playerCar && g.playerCar.van) this.nextStep();
        break;
      }
      case 'wanted': {
        if (g.wanted >= step.stars) this.nextStep();
        break;
      }
      case 'loseCops': {
        if (g.wanted === 0 && g.cops.length === 0 && g.policeCars() === 0) this.nextStep();
        break;
      }
      case 'rob': {
        const t = g.city.landmarks.bank;
        if (dist2(px, py, t.x, t.y) < 100 * 100) {
          this.active.holdT += dt;
          if (this.active.holdT >= step.hold) {
            g.player.money += 800;
            g.addCrime(3, 'Bank robbed! $800 grabbed — the whole precinct is coming.');
            g.sounds.cash();
            this.nextStep();
          }
        } else this.active.holdT = 0;
        break;
      }
      case 'escape': {
        g.setWanted(Math.max(g.wanted, step.stars));
        if (g.wanted === 0 && g.cops.length === 0 && g.policeCars() === 0) this.nextStep();
        break;
      }
      default: break;
    }
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
    this.taxi = { pickup: from, drop: to, stage: 'pickup', pay: 60 + Math.floor(Math.random() * 60), timer: 0 };
    g.toast('TAXI FARE', `Passenger waiting near the marker — pick them up, then drop them off. Pays $${this.taxi.pay}.`, 5);
    return true;
  }

  updateTaxi(dt) {
    const g = this.game;
    if (!this.taxi || !g.playerCar) return;
    const car = g.playerCar;
    this.taxi.timer += dt;
    if (this.taxi.stage === 'pickup') {
      if (dist2(car.x, car.y, this.taxi.pickup.x, this.taxi.pickup.y) < 80 * 80) {
        this.taxi.stage = 'drop';
        g.toast('PASSENGER ABOARD', 'Drive them to the drop-off marker.', 4);
        g.sounds.pickup();
      }
    } else if (dist2(car.x, car.y, this.taxi.drop.x, this.taxi.drop.y) < 80 * 80) {
      g.player.money += this.taxi.pay;
      g.sounds.cash();
      g.toast('FARE PAID', `+$${this.taxi.pay} — nice driving.`, 4);
      this.taxi = null;
    }
    if (this.taxi && this.taxi.timer > 120) { this.taxi = null; g.toast('FARE LOST', 'The passenger gave up waiting.', 4); }
  }

  // --- Hidden cash stashes ---
  placePackages(rng) {
    const spots = [
      { x: 500, y: 2400 }, { x: 1500, y: 2450 }, { x: 2800, y: 2400 },
      { x: 3200, y: 1800 }, { x: 300, y: 900 }, { x: 2400, y: 500 },
      { x: 1800, y: 1500 }, { x: 900, y: 1900 }, { x: 2600, y: 1100 },
      { x: 1300, y: 700 },
    ];
    this.packages = spots.map((s) => ({ ...s, found: false }));
  }

  checkPackages() {
    const g = this.game;
    const p = g.player;
    for (const pkg of this.packages) {
      if (pkg.found) continue;
      if (dist2(p.x, p.y, pkg.x, pkg.y) < 40 * 40) {
        pkg.found = true;
        this.packagesFound += 1;
        p.money += 150;
        g.sounds.cash();
        g.toast('CASH STASH', `+$150 — stash ${this.packagesFound}/10 found.`, 4);
        g.addParticles(pkg.x, pkg.y, 12, '#f2c230');
      }
    }
  }
}
