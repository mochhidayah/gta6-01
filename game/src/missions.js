// Missions: Marco's thirteen-job story, plus taxi fares, courier runs
// and hidden cash stashes. A mission is a list of steps; every step type
// has one handler, and the manager advances, fails or completes the
// mission as the steps resolve. v4 rewrote this file wholesale — new
// internal names and structure — while keeping every step, payout,
// timer and radius exactly as the story was written, and added one
// thing: a cutscene briefing plays when a job starts (never while a
// screenshot is being staged).
import { distSq } from './config.js';
import { CourierRun, makeCourierJob } from './courier.js';

export const STORY = [
  {
    id: 'm1',
    title: 'First Wheels',
    pay: 300,
    brief: 'Marco needs wheels. Lift any car off the street and bring it to Solano Garage.',
    steps: [
      {
        type: 'stealCar',
        text: 'Steal a car (walk up to one and press E)',
      },
      {
        type: 'goto',
        place: 'garage',
        text: 'Drive it to Solano Garage',
        radius: 90,
      },
    ],
  },
  {
    id: 'm2',
    title: 'The Pickup',
    pay: 450,
    brief: 'Lucia is waiting down at Coral Marina. Fetch her and get her to Club Flamingo before the doors fill up.',
    steps: [
      {
        type: 'goto',
        place: 'marina',
        text: 'Pick up Lucia at Coral Marina',
        radius: 80,
      },
      {
        type: 'goto',
        place: 'club',
        text: 'Drive Lucia to Club Flamingo',
        radius: 90,
        timer: 75,
      },
    ],
  },
  {
    id: 'm3',
    title: 'Hot Pursuit',
    pay: 500,
    brief: 'The precinct has Marco in its sights. Stir up a 3-star wanted level — then vanish.',
    steps: [
      {
        type: 'wanted',
        stars: 3,
        text: 'Raise your wanted level to 3 stars (cause chaos!)',
      },
      {
        type: 'loseCops',
        text: 'Lose the cops — stay out of sight until the heat dies down',
      },
    ],
  },
  {
    id: 'm4',
    title: 'The Drop',
    pay: 650,
    brief: 'A package for the Golden Palm Pawn, and the clock is running. Deliver it in one piece.',
    steps: [
      {
        type: 'goto',
        place: 'pawnshop',
        text: 'Deliver the package to Golden Palm Pawn',
        radius: 85,
        timer: 90,
      },
    ],
  },
  {
    id: 'm5',
    title: 'Bank Job',
    pay: 1200,
    brief: 'Palmera Reserve Bank, midday. Grab the cash, then outrun a 4-star response.',
    steps: [
      {
        type: 'goto',
        place: 'bank',
        text: 'Reach Palmera Reserve Bank',
        radius: 85,
      },
      {
        type: 'rob',
        place: 'bank',
        text: 'Hold up the bank — stay inside the marker 6 seconds',
        hold: 6,
      },
      {
        type: 'escape',
        stars: 4,
        text: 'Escape! Lose the 4-star wanted level',
        radius: 0,
      },
    ],
  },
  {
    id: 'm6',
    title: 'The Big Score',
    pay: 2500,
    brief: 'One last job: lift the armored van parked at Bay Sharks Stadium and run it to the South Docks. Then Marco walks free.',
    steps: [
      {
        type: 'goto',
        place: 'stadium',
        text: 'Reach Bay Sharks Stadium',
        radius: 95,
      },
      {
        type: 'stealVan',
        text: 'Steal the armored van',
      },
      {
        type: 'goto',
        place: 'docks',
        text: 'Deliver the van to the South Docks',
        radius: 100,
        timer: 120,
      },
    ],
  },
  {
    id: 'm7',
    title: 'The Getaway',
    pay: 1800,
    brief: 'The crew needs a fast car and a clean exit. Steal a Falcon GT — the fastest thing on the streets — and run it to Palmera Airfield before the precinct locks the city down.',
    steps: [
      {
        type: 'stealModel',
        model: 'Falcon GT',
        text: 'Steal a Falcon GT (the red one — fastest in town)',
      },
      {
        type: 'goto',
        place: 'airport',
        text: 'Run it to Palmera Airfield',
        radius: 95,
        timer: 100,
      },
      {
        type: 'escape',
        stars: 3,
        text: 'Escape! Lose the 3-star wanted level',
        radius: 0,
      },
    ],
  },
  {
    id: 'm8',
    title: 'Night Shift',
    pay: 950,
    brief: 'Four pickups, one night, no excuses. Lucia runs a courier ring after dark and Marco is the wheelman — marina, airfield, docks, club, against the clock.',
    steps: [
      {
        type: 'goto',
        place: 'marina',
        text: 'Stop 1 of 4: collect at Coral Marina',
        radius: 80,
        timer: 60,
      },
      {
        type: 'goto',
        place: 'airport',
        text: 'Stop 2 of 4: drop at Palmera Airfield',
        radius: 85,
        timer: 60,
      },
      {
        type: 'goto',
        place: 'docks',
        text: 'Stop 3 of 4: collect at the South Docks',
        radius: 85,
        timer: 60,
      },
      {
        type: 'goto',
        place: 'club',
        text: 'Stop 4 of 4: final drop at Club Flamingo',
        radius: 90,
        timer: 60,
      },
    ],
  },
  {
    id: 'm9',
    title: 'Turf War',
    pay: 1600,
    brief: 'The Sharks jumped a Viper runner on stadium turf. The Vipers want payback and Marco owes them — put six Sharks on the ground, then get out before the precinct arrives.',
    steps: [
      {
        type: 'goto',
        place: 'stadium',
        text: 'Get to Bay Sharks Stadium — the fight is on',
        radius: 95,
      },
      {
        type: 'defeat',
        crew: 'Sharks',
        count: 6,
        text: 'Drop 6 Sharks (fists or pistol — your call)',
      },
      {
        type: 'escape',
        stars: 3,
        text: 'Escape! Lose the 3-star wanted level',
        radius: 0,
      },
    ],
  },
  {
    id: 'm10',
    title: 'The Last Debt',
    pay: 3500,
    brief: 'The finale. The man Marco owes keeps his ledger in the docks warehouse. Lift a Midnight Van, pick up the crew at the marina, crack the warehouse hold, and walk out of a 4-star storm with the ledger.',
    steps: [
      {
        type: 'stealModel',
        model: 'Midnight Van',
        text: 'Steal a Midnight Van for the crew',
      },
      {
        type: 'goto',
        place: 'marina',
        text: 'Pick up the crew at Coral Marina',
        radius: 85,
      },
      {
        type: 'rob',
        place: 'docks',
        text: 'Crack the warehouse hold — stay inside the marker 8 seconds',
        hold: 8,
      },
      {
        type: 'escape',
        stars: 4,
        text: 'Escape! Lose the 4-star wanted level',
        radius: 0,
      },
    ],
  },
  {
    id: 'm11',
    title: 'Street King',
    pay: 2000,
    brief: 'The stadium crowd runs an illegal street race after dark. Line up at the start pad by the stadium, beat three rivals across the city — airfield, marina, docks, club — and take the crown.',
    steps: [
      {
        type: 'goto',
        place: 'stadium',
        text: 'Get to Bay Sharks Stadium — the race starts there',
        radius: 120,
      },
      {
        type: 'race',
        text: 'Win the street race — press T on the start pad',
      },
      {
        type: 'escape',
        stars: 2,
        text: 'Escape! Lose the 2-star wanted level',
        radius: 0,
      },
    ],
  },
  {
    id: 'm12',
    title: 'Payback',
    pay: 2200,
    brief: 'The Vipers torched a Solano garage truck and laughed about it. Six of them are hanging around the South Docks — put them down, then disappear before the precinct arrives.',
    steps: [
      {
        type: 'goto',
        place: 'docks',
        text: 'Get to the South Docks — the Vipers are waiting',
        radius: 100,
      },
      {
        type: 'defeat',
        crew: 'Vipers',
        count: 6,
        text: 'Drop 6 Vipers (fists or pistol — your call)',
      },
      {
        type: 'escape',
        stars: 3,
        text: 'Escape! Lose the 3-star wanted level',
        radius: 0,
      },
    ],
  },
  {
    id: 'm13',
    title: 'Clean Slate',
    pay: 2800,
    brief: 'One last favour for Lucia, then the debt is paid and Marco is free: lift a Coral Coupe from uptown, run it to Palmera Airfield, and lose the tail on the way.',
    steps: [
      {
        type: 'stealModel',
        model: 'Coral Coupe',
        text: 'Steal a Coral Coupe (the pink one — hard to miss)',
      },
      {
        type: 'goto',
        place: 'airport',
        text: 'Run it to Palmera Airfield',
        radius: 95,
        timer: 100,
      },
      {
        type: 'escape',
        stars: 2,
        text: 'Escape! Lose the 2-star wanted level',
        radius: 0,
      },
    ],
  },
];

// Where Marco is right now — the car when driving, his feet when not.
function playerPos(game) {
  const p = game.player;
  if (p.inCar && game.playerCar) return { x: game.playerCar.x, y: game.playerCar.y };
  return { x: p.x, y: p.y };
}

function insideRadius(x, y, target, radius) {
  return distSq(x, y, target.x, target.y) < radius * radius;
}

// How many of a named crew are down on the ground right now.
function crewDown(game, crewName) {
  let n = 0;
  for (const m of game.gangs.members) {
    if (m.crew.name === crewName && m.state === 'down') n += 1;
  }
  return n;
}

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.storyIndex = 0; // next story mission (0..STORY.length)
    this.active = null; // {def, step, timer, holdT, defeatBase}
    this.taxi = null; // active fare {pickup, drop, stage, pay, timer}
    this.courier = null; // active courier run (CourierRun) or null
    this.completed = 0;
    this.packagesFound = 0;
    this.packages = []; // hidden cash stashes {x, y, found}
    this.vanParked = false; // the m6 armored van has been parked at the stadium
    this.sharksMustered = false; // the m9 Sharks have been mustered at the stadium
    this.vipersMustered = false; // the m12 Vipers have been mustered at the docks
    this.coupeParked = false; // the m13 Coral Coupe has been parked uptown
  }

  get storyDone() {
    return this.storyIndex >= STORY.length;
  }

  // How many story jobs the game holds (the HUD counts down from this).
  get total() {
    return STORY.length;
  }

  startStory() {
    if (this.storyDone) return false;
    const def = STORY[this.storyIndex];
    this.active = { def, step: 0, timer: 0, holdT: 0, defeatBase: 0 };
    if (def.id === 'm6' && !this.vanParked) {
      const spot = this.game.city.landmarks.stadium;
      this.game.traffic.spawnVan(spot.x + 60, spot.y + 30);
      this.vanParked = true;
    }
    if (def.id === 'm9' && !this.sharksMustered) {
      const spot = this.game.city.landmarks.stadium;
      this.game.gangs.spawnCrew('Sharks', 6, spot.x, spot.y);
      this.sharksMustered = true;
    }
    if (def.id === 'm10') {
      const spot = this.game.city.landmarks.garage;
      this.game.traffic.spawnModel('Midnight Van', spot.x + 70, spot.y + 20);
    }
    if (def.id === 'm11') {
      // A fresh race: the win flag from any earlier race does not count.
      this.game.races.won = false;
    }
    if (def.id === 'm12' && !this.vipersMustered) {
      const spot = this.game.city.landmarks.docks;
      this.game.gangs.spawnCrew('Vipers', 6, spot.x, spot.y);
      this.vipersMustered = true;
    }
    if (def.id === 'm13' && !this.coupeParked) {
      const spot = this.game.city.landmarks.policeHQ;
      this.game.traffic.spawnModel('Coral Coupe', spot.x - 80, spot.y + 40);
      this.coupeParked = true;
    }
    this.announce(def);
    // A scripted briefing opens over the game — never while a screenshot
    // is being staged (?shot=), or the letterbox would spoil the shot.
    const staging = new URLSearchParams(window.location.search).get('shot');
    if (!staging && this.game.cutscenes) {
      this.game.cutscenes.playBriefing(this.storyIndex);
    }
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
    if (g.stats) {
      g.stats.recordEarned(def.pay);
      g.stats.recordJob();
    }
    g.sounds.missionDone();
    g.sounds.cash();
    g.toast('MISSION COMPLETE', `${def.title} — earned $${def.pay}`, 6);
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
    const step = this.currentStep();
    if (step.type === 'defeat') {
      this.active.defeatBase = crewDown(this.game, step.crew);
    }
    this.game.toast('NEW OBJECTIVE', step.text, 5);
  }

  // One frame of the active story step; the timer runs for steps that carry one.
  update(dt) {
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

  get stepHandlers() {
    return {
      goto: this.onGoto,
      stealCar: this.onStealCar,
      stealVan: this.onStealVan,
      stealModel: this.onStealModel,
      wanted: this.onWanted,
      loseCops: this.onLoseCops,
      rob: this.onRob,
      escape: this.onEscape,
      defeat: this.onDefeat,
      race: this.onRace,
    };
  }

  onGoto(dt, step) {
    const g = this.game;
    const pos = playerPos(g);
    const target = g.city.landmarks[step.place];
    if (insideRadius(pos.x, pos.y, target, step.radius)) this.nextStep();
  }

  onStealCar() {
    if (this.game.player.inCar) this.nextStep();
  }

  onStealVan() {
    const g = this.game;
    if (g.player.inCar && g.playerCar && g.playerCar.van) this.nextStep();
  }

  onStealModel(dt, step) {
    const g = this.game;
    if (g.player.inCar && g.playerCar && g.playerCar.model.name === step.model) this.nextStep();
  }

  onWanted(dt, step) {
    if (this.game.wanted >= step.stars) this.nextStep();
  }

  onLoseCops() {
    const g = this.game;
    if (g.wanted === 0 && g.cops.length === 0 && g.police.policeCars() === 0) this.nextStep();
  }

  // Hold inside a ring to crack a target (bank, or the docks warehouse).
  onRob(dt, step) {
    const g = this.game;
    const pos = playerPos(g);
    const site = g.city.landmarks[step.place || 'bank'];
    if (!insideRadius(pos.x, pos.y, site, 100)) {
      this.active.holdT = 0;
      return;
    }
    this.active.holdT += dt;
    if (this.active.holdT < step.hold) return;
    const take = step.place === 'docks' ? 1500 : 800;
    g.player.money += take;
    g.police.addCrime(
      3,
      step.place === 'docks'
        ? 'Warehouse cracked! $1,500 grabbed — the whole precinct is coming.'
        : 'Bank robbed! $800 grabbed — the whole precinct is coming.',
    );
    g.sounds.cash();
    this.nextStep();
  }

  onEscape(dt, step) {
    const g = this.game;
    g.police.setWanted(Math.max(g.wanted, step.stars));
    if (g.wanted === 0 && g.cops.length === 0 && g.police.policeCars() === 0) this.nextStep();
  }

  // Count how many of the named crew are down since this step began.
  onDefeat(dt, step) {
    const g = this.game;
    const dropped = crewDown(g, step.crew) - this.active.defeatBase;
    if (dropped >= step.count) {
      g.toast('TURF TAKEN', `The ${step.crew} are down — now get out of there.`, 4);
      this.nextStep();
    }
  }

  // The street-race step (m11): done the moment a race is won.
  // The race itself lives in races.js; this step just watches the flag.
  onRace() {
    const g = this.game;
    if (g.races && g.races.wonRace) {
      g.toast('STREET KING', 'You beat the stadium field — the crown is yours.', 4);
      this.nextStep();
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
      if (insideRadius(car.x, car.y, this.taxi.pickup, 80)) {
        this.taxi.stage = 'drop';
        g.toast('PASSENGER ABOARD', 'Drive them to the drop-off marker.', 4);
        g.sounds.pickup();
      }
    } else if (insideRadius(car.x, car.y, this.taxi.drop, 80)) {
      g.player.money += this.taxi.pay;
      if (g.stats) {
        g.stats.recordEarned(this.taxi.pay);
        g.stats.recordFare();
      }
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
      const bonus = this.courier.speedBonus;
      g.player.money += this.courier.pay + bonus;
      if (g.stats) g.stats.recordEarned(this.courier.pay + bonus);
      g.sounds.cash();
      g.toast('DELIVERED', `+$${this.courier.pay}${bonus ? ` + $${bonus} speed bonus` : ''} — right on time.`, 4);
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
      if (!insideRadius(p.x, p.y, pkg, 40)) continue;
      pkg.found = true;
      this.packagesFound += 1;
      p.money += 150;
      if (g.stats) {
        g.stats.recordEarned(150);
        g.stats.recordStash();
      }
      g.sounds.cash();
      g.toast('CASH STASH', `+$150 — stash ${this.packagesFound}/10 found.`, 4);
      g.addParticles(pkg.x, pkg.y, 12, '#f2c230');
    }
  }
}
