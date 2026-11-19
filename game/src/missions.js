// Missions: Marco's thirteen-job story, plus taxi fares, courier runs
// and hidden cash stashes. A mission is a list of steps; every stage
// type has one handler, and the manager advances, fails or completes
// the mission as the steps resolve. v5 rewrote this file wholesale —
// new internal names, new layout — while keeping every stage, payout,
// timer and radius exactly as the story was written. One thing stays
// from v4: a cutscene briefing plays when a job starts, never while a
// screenshot is being staged.
import { distSq } from './config.js';
import { CourierRun, makeCourierJob } from './courier.js';

// The story, in order. Every stage's type, place, timer, radius, hold,
// stars, crew, count and model are load-bearing — the handlers below
// read them exactly as written.
export const STORY = [
  {
    id: 'm1', title: 'First Wheels', pay: 300,
    brief: 'Marco is back with empty pockets and a car-shaped hole in his plans. Lift any car off the street and bring it to Solano Garage.',
    steps: [
      { type: 'stealCar', text: 'Steal a car — walk up to one and press E' },
      { type: 'goto', place: 'garage', radius: 90, text: 'Take it to Solano Garage' },
    ],
  },
  {
    id: 'm2', title: 'The Pickup', pay: 450,
    brief: 'Lucia is waiting down at Coral Marina. Go and get her, then drive her to Club Flamingo before the doors fill up.',
    steps: [
      { type: 'goto', place: 'marina', radius: 80, text: 'Fetch Lucia at Coral Marina' },
      { type: 'goto', place: 'club', radius: 90, timer: 75, text: 'Drive Lucia to Club Flamingo' },
    ],
  },
  {
    id: 'm3', title: 'Hot Pursuit', pay: 500,
    brief: 'The precinct has its eye on Marco. Stir up a 3-star wanted level — then disappear.',
    steps: [
      { type: 'wanted', stars: 3, text: 'Raise your wanted level to 3 stars (make some noise!)' },
      { type: 'loseCops', text: 'Shake the cops — stay hidden until the heat dies down' },
    ],
  },
  {
    id: 'm4', title: 'The Drop', pay: 650,
    brief: 'A package for the Golden Palm Pawn, and the clock is ticking. Deliver it in one piece.',
    steps: [
      { type: 'goto', place: 'pawnshop', radius: 85, timer: 90, text: 'Take the package to Golden Palm Pawn' },
    ],
  },
  {
    id: 'm5', title: 'Bank Job', pay: 1200,
    brief: 'Palmera Reserve Bank, midday. Grab the cash, then outrun the whole precinct.',
    steps: [
      { type: 'goto', place: 'bank', radius: 85, text: 'Get to Palmera Reserve Bank' },
      { type: 'rob', place: 'bank', hold: 6, text: 'Hold up the bank — stay inside the marker 6 seconds' },
      { type: 'escape', stars: 4, radius: 0, text: 'Escape! Lose the 4-star wanted level' },
    ],
  },
  {
    id: 'm6', title: 'The Big Score', pay: 2500,
    brief: 'One last job: lift the armored van parked at Bay Sharks Stadium and run it to the South Docks. Then Marco walks free.',
    steps: [
      { type: 'goto', place: 'stadium', radius: 95, text: 'Get to Bay Sharks Stadium' },
      { type: 'stealVan', text: 'Steal the armored van' },
      { type: 'goto', place: 'docks', radius: 100, timer: 120, text: 'Run the van to the South Docks' },
    ],
  },
  {
    id: 'm7', title: 'The Getaway', pay: 1800,
    brief: 'The crew needs a fast car and a clean exit. Steal a Falcon GT — the fastest thing on the streets — and run it to Palmera Airfield before the precinct locks the city down.',
    steps: [
      { type: 'stealModel', model: 'Falcon GT', text: 'Steal a Falcon GT (the red one — fastest in town)' },
      { type: 'goto', place: 'airport', radius: 95, timer: 100, text: 'Run it to Palmera Airfield' },
      { type: 'escape', stars: 3, radius: 0, text: 'Escape! Lose the 3-star wanted level' },
    ],
  },
  {
    id: 'm8', title: 'Night Shift', pay: 950,
    brief: 'Four pickups, one night, no excuses. Lucia runs a courier ring after dark and Marco is the wheelman — marina, airfield, docks, club, against the clock.',
    steps: [
      { type: 'goto', place: 'marina', radius: 80, timer: 60, text: 'Stop 1 of 4: pickup at Coral Marina' },
      { type: 'goto', place: 'airport', radius: 85, timer: 60, text: 'Stop 2 of 4: delivery at Palmera Airfield' },
      { type: 'goto', place: 'docks', radius: 85, timer: 60, text: 'Stop 3 of 4: pickup at the South Docks' },
      { type: 'goto', place: 'club', radius: 90, timer: 60, text: 'Stop 4 of 4: final delivery at Club Flamingo' },
    ],
  },
  {
    id: 'm9', title: 'Turf War', pay: 1600,
    brief: 'The Sharks jumped a Viper runner on stadium turf. The Vipers want payback and Marco owes them — put six Sharks on the ground, then get out before the precinct arrives.',
    steps: [
      { type: 'goto', place: 'stadium', radius: 95, text: 'Get to Bay Sharks Stadium — the fight is waiting' },
      { type: 'defeat', crew: 'Sharks', count: 6, text: 'Drop 6 Sharks (fists or pistol — your call)' },
      { type: 'escape', stars: 3, radius: 0, text: 'Escape! Lose the 3-star wanted level' },
    ],
  },
  {
    id: 'm10', title: 'The Last Debt', pay: 3500,
    brief: 'The finale. The man Marco owes keeps his ledger in the docks warehouse. Lift a Midnight Van, pick up the crew at the marina, crack the warehouse hold, and walk out of a 4-star storm with the ledger.',
    steps: [
      { type: 'stealModel', model: 'Midnight Van', text: 'Steal a Midnight Van for the crew' },
      { type: 'goto', place: 'marina', radius: 85, text: 'Collect the crew at Coral Marina' },
      { type: 'rob', place: 'docks', hold: 8, text: 'Crack the warehouse hold — stay inside the marker 8 seconds' },
      { type: 'escape', stars: 4, radius: 0, text: 'Escape! Lose the 4-star wanted level' },
    ],
  },
  {
    id: 'm11', title: 'Street King', pay: 2000,
    brief: 'The stadium crowd runs an illegal street race after dark. Line up at the start pad by the stadium, beat three rivals across the city — airfield, marina, docks, club — and take the crown.',
    steps: [
      { type: 'goto', place: 'stadium', radius: 120, text: 'Get to Bay Sharks Stadium — the race begins there' },
      { type: 'race', text: 'Win the street race — press T on the start pad' },
      { type: 'escape', stars: 2, radius: 0, text: 'Escape! Lose the 2-star wanted level' },
    ],
  },
  {
    id: 'm12', title: 'Payback', pay: 2200,
    brief: 'The Vipers torched a Solano garage truck and laughed about it. Six of them are hanging around the South Docks — put them down, then disappear before the precinct arrives.',
    steps: [
      { type: 'goto', place: 'docks', radius: 100, text: 'Get to the South Docks — the Vipers are hanging around' },
      { type: 'defeat', crew: 'Vipers', count: 6, text: 'Drop 6 Vipers (fists or pistol — your call)' },
      { type: 'escape', stars: 3, radius: 0, text: 'Escape! Lose the 3-star wanted level' },
    ],
  },
  {
    id: 'm13', title: 'Clean Slate', pay: 2800,
    brief: 'One last favour for Lucia, then the debt is paid and Marco is free: lift a Coral Coupe from uptown, run it to Palmera Airfield, and lose the tail on the way.',
    steps: [
      { type: 'stealModel', model: 'Coral Coupe', text: 'Steal a Coral Coupe (the pink one — hard to miss)' },
      { type: 'goto', place: 'airport', radius: 95, timer: 100, text: 'Run it to Palmera Airfield' },
      { type: 'escape', stars: 2, radius: 0, text: 'Escape! Lose the 2-star wanted level' },
    ],
  },
];

// Where Marco is right now — the car when driving, his feet when not.
function whereIsMarco(game) {
  const p = game.player;
  if (p.inCar && game.playerCar) return { x: game.playerCar.x, y: game.playerCar.y };
  return { x: p.x, y: p.y };
}

function within(x, y, target, radius) {
  return distSq(x, y, target.x, target.y) < radius * radius;
}

// How many of a named crew are down on the ground right now.
function crewDownCount(game, crewName) {
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

  // -- story lifecycle --------------------------------------------------------

  startStory() {
    if (this.storyDone) return false;
    const job = STORY[this.storyIndex];
    this.active = { def: job, step: 0, timer: 0, holdT: 0, defeatBase: 0 };
    this._stageMissionProps(job);
    this.announce(job);
    // A scripted briefing opens over the game — never while a screenshot
    // is being staged (?shot=), or the letterbox would spoil the shot.
    const staging = new URLSearchParams(window.location.search).get('shot');
    if (!staging && this.game.cutscenes) {
      this.game.cutscenes.playBriefing(this.storyIndex);
    }
    return true;
  }

  // Park the mission's special vehicles and crews before the first stage.
  _stageMissionProps(job) {
    const gm = this.game;
    if (job.id === 'm6' && !this.vanParked) {
      const spot = gm.city.landmarks.stadium;
      gm.traffic.spawnVan(spot.x + 60, spot.y + 30);
      this.vanParked = true;
    }
    if (job.id === 'm9' && !this.sharksMustered) {
      const spot = gm.city.landmarks.stadium;
      gm.gangs.spawnCrew('Sharks', 6, spot.x, spot.y);
      this.sharksMustered = true;
    }
    if (job.id === 'm10') {
      const spot = gm.city.landmarks.garage;
      gm.traffic.spawnModel('Midnight Van', spot.x + 70, spot.y + 20);
    }
    if (job.id === 'm11') {
      // A fresh race: the win flag from any earlier race does not count.
      gm.races.won = false;
    }
    if (job.id === 'm12' && !this.vipersMustered) {
      const spot = gm.city.landmarks.docks;
      gm.gangs.spawnCrew('Vipers', 6, spot.x, spot.y);
      this.vipersMustered = true;
    }
    if (job.id === 'm13' && !this.coupeParked) {
      const spot = gm.city.landmarks.policeHQ;
      gm.traffic.spawnModel('Coral Coupe', spot.x - 80, spot.y + 40);
      this.coupeParked = true;
    }
  }

  announce(job) {
    const gm = this.game;
    gm.toast(`MISSION: ${job.title}`, job.brief, 6);
    gm.sounds.pickup();
  }

  currentStep() {
    if (!this.active) return null;
    return this.active.def.steps[this.active.step];
  }

  currentTarget() {
    const stage = this.currentStep();
    if (!stage || !stage.place) return null;
    return this.game.city.landmarks[stage.place];
  }

  fail(reason) {
    const gm = this.game;
    gm.toast('MISSION FAILED', reason, 5);
    gm.sounds.missionFail();
    this.active = null;
  }

  complete() {
    const gm = this.game;
    const job = this.active.def;
    gm.player.money += job.pay;
    if (gm.stats) {
      gm.stats.recordEarned(job.pay);
      gm.stats.recordJob();
    }
    gm.sounds.missionDone();
    gm.sounds.cash();
    gm.toast('MISSION COMPLETE', `${job.title} — earned $${job.pay}`, 6);
    this.completed += 1;
    this.storyIndex += 1;
    this.active = null;
    if (this.storyDone) {
      gm.toast(
        'PALMERA BAY IS YOURS',
        'Every job done. Marco Solano runs this city now — free roam, fares and stashes remain.',
        9,
      );
      gm.saveGame();
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
    const stage = this.currentStep();
    if (stage.type === 'defeat') {
      this.active.defeatBase = crewDownCount(this.game, stage.crew);
    }
    this.game.toast('NEW OBJECTIVE', stage.text, 5);
  }

  // One frame of the active story stage; the timer runs for steps that carry one.
  update(dt) {
    if (!this.active) return;
    const stage = this.currentStep();
    if (!stage) return;
    if (stage.timer) {
      this.active.timer += dt;
      if (this.active.timer > stage.timer) {
        this.fail('Out of time — the window closed.');
        return;
      }
    }
    const handler = this.stepHandlers[stage.type];
    if (handler) handler.call(this, dt, stage);
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

  // -- stage handlers ----------------------------------------------------------

  onGoto(dt, stage) {
    const gm = this.game;
    const pos = whereIsMarco(gm);
    const target = gm.city.landmarks[stage.place];
    if (within(pos.x, pos.y, target, stage.radius)) this.nextStep();
  }

  onStealCar() {
    if (this.game.player.inCar) this.nextStep();
  }

  onStealVan() {
    const gm = this.game;
    if (gm.player.inCar && gm.playerCar && gm.playerCar.van) this.nextStep();
  }

  onStealModel(dt, stage) {
    const gm = this.game;
    if (gm.player.inCar && gm.playerCar && gm.playerCar.model.name === stage.model) this.nextStep();
  }

  onWanted(dt, stage) {
    if (this.game.wanted >= stage.stars) this.nextStep();
  }

  onLoseCops() {
    const gm = this.game;
    if (gm.wanted === 0 && gm.cops.length === 0 && gm.police.policeCars() === 0) this.nextStep();
  }

  // Hold inside a ring to crack a target (bank, or the docks warehouse).
  onRob(dt, stage) {
    const gm = this.game;
    const pos = whereIsMarco(gm);
    const site = gm.city.landmarks[stage.place || 'bank'];
    if (!within(pos.x, pos.y, site, 100)) {
      this.active.holdT = 0;
      return;
    }
    this.active.holdT += dt;
    if (this.active.holdT < stage.hold) return;
    const take = stage.place === 'docks' ? 1500 : 800;
    gm.player.money += take;
    gm.police.addCrime(
      3,
      stage.place === 'docks'
        ? 'Warehouse cracked! $1,500 grabbed — the whole precinct is coming.'
        : 'Bank robbed! $800 grabbed — the whole precinct is coming.',
    );
    gm.sounds.cash();
    this.nextStep();
  }

  onEscape(dt, stage) {
    const gm = this.game;
    gm.police.setWanted(Math.max(gm.wanted, stage.stars));
    if (gm.wanted === 0 && gm.cops.length === 0 && gm.police.policeCars() === 0) this.nextStep();
  }

  // Count how many of the named crew are down since this stage began.
  onDefeat(dt, stage) {
    const gm = this.game;
    const dropped = crewDownCount(gm, stage.crew) - this.active.defeatBase;
    if (dropped >= stage.count) {
      gm.toast('TURF TAKEN', `The ${stage.crew} are down — now get out of there.`, 4);
      this.nextStep();
    }
  }

  // The street-race stage (m11): done the moment a race is won.
  // The race itself lives in races.js; this stage just watches the flag.
  onRace() {
    const gm = this.game;
    if (gm.races && gm.races.wonRace) {
      gm.toast('STREET KING', 'You beat the stadium field — the crown is yours.', 4);
      this.nextStep();
    }
  }

  // -- taxi fares (side activity) ---------------------------------------------

  offerTaxi() {
    const gm = this.game;
    if (this.taxi || this.active) return false;
    if (!gm.playerCar || !gm.playerCar.taxi) return false;
    const spots = Object.values(gm.city.landmarks);
    const from = spots[Math.floor(Math.random() * spots.length)];
    let to = spots[Math.floor(Math.random() * spots.length)];
    if (to === from) to = spots[(spots.indexOf(from) + 3) % spots.length];
    const pay = 60 + Math.floor(Math.random() * 60);
    this.taxi = { pickup: from, drop: to, stage: 'pickup', pay, timer: 0 };
    gm.toast('TAXI FARE', `Passenger waiting near the marker — pick them up, then drop them off. Pays $${pay}.`, 5);
    return true;
  }

  updateTaxi(dt) {
    const gm = this.game;
    if (!this.taxi || !gm.playerCar) return;
    const car = gm.playerCar;
    this.taxi.timer += dt;
    if (this.taxi.stage === 'pickup') {
      if (within(car.x, car.y, this.taxi.pickup, 80)) {
        this.taxi.stage = 'drop';
        gm.toast('PASSENGER ABOARD', 'Drive them to the drop-off marker.', 4);
        gm.sounds.pickup();
      }
    } else if (within(car.x, car.y, this.taxi.drop, 80)) {
      gm.player.money += this.taxi.pay;
      if (gm.stats) {
        gm.stats.recordEarned(this.taxi.pay);
        gm.stats.recordFare();
      }
      gm.sounds.cash();
      gm.toast('FARE PAID', `+$${this.taxi.pay} — nice driving.`, 4);
      this.taxi = null;
    }
    if (this.taxi && this.taxi.timer > 120) {
      this.taxi = null;
      gm.toast('FARE LOST', 'The passenger gave up waiting.', 4);
    }
  }

  // -- courier runs (side activity) -------------------------------------------

  offerCourier() {
    const gm = this.game;
    if (this.courier || this.taxi || this.active) return false;
    if (!gm.playerCar) return false;
    const job = makeCourierJob(Math.random, gm.city.landmarks);
    this.courier = new CourierRun(job);
    gm.toast(
      'COURIER JOB',
      `Parcel run: collect at ${this.courier.pickupName}, deliver to ${this.courier.dropName} in ${job.timeLimit}s. Pays $${job.pay}.`,
      6,
    );
    return true;
  }

  updateCourier(dt) {
    const gm = this.game;
    if (!this.courier || !gm.playerCar) return;
    const car = gm.playerCar;
    const event = this.courier.update(dt, car.x, car.y);
    if (event === 'picked') {
      gm.toast('PARCEL COLLECTED', `Now deliver it to ${this.courier.dropName} — ${Math.ceil(this.courier.timeLeft)}s left.`, 4);
      gm.sounds.pickup();
    } else if (event === 'delivered') {
      const bonus = this.courier.speedBonus;
      gm.player.money += this.courier.pay + bonus;
      if (gm.stats) gm.stats.recordEarned(this.courier.pay + bonus);
      gm.sounds.cash();
      gm.toast('DELIVERED', `+$${this.courier.pay}${bonus ? ` + $${bonus} speed bonus` : ''} — right on time.`, 4);
      this.courier = null;
    } else if (event === 'expired') {
      gm.toast('DELIVERY LATE', 'The parcel run expired — the client went elsewhere.', 4);
      this.courier = null;
    }
  }

  // -- hidden cash stashes ------------------------------------------------------

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
    const gm = this.game;
    const p = gm.player;
    for (const pkg of this.packages) {
      if (pkg.found) continue;
      if (!within(p.x, p.y, pkg, 40)) continue;
      pkg.found = true;
      this.packagesFound += 1;
      p.money += 150;
      if (gm.stats) {
        gm.stats.recordEarned(150);
        gm.stats.recordStash();
      }
      gm.sounds.cash();
      gm.toast('CASH STASH', `+$150 — stash ${this.packagesFound}/10 found.`, 4);
      gm.addParticles(pkg.x, pkg.y, 12, '#f2c230');
    }
  }
}
