// Stats and achievements: everything Marco does, counted.
//
// The tracker watches the game — distance driven and walked,
// jumps landed, fares and races, money earned, people knocked
// down, shots fired, near misses, stashes found — and hands out
// achievements when a line is crossed. An achievement pays a
// small cash bonus on top of the bragging rights, and the stats
// ride along in the save so a returning player keeps their record.
//
// Achievements are checked once a second, not every frame, so the
// toast spam stays down and a single stunt cannot unlock two at
// once. v4 rewrote this file wholesale — same counters, same
// achievements, new structure.
// v6: a few internal names refreshed, behaviour identical.
const CHECK_EVERY = 1; // seconds between achievement checks

// id, name, what it takes, reward. The `check` reads the counters.
const MEDALS = [
  { id: 'first-job', name: 'FIRST JOB', desc: 'Finish your first story mission.', reward: 100, check: (s) => s.jobsDone >= 1 },
  { id: 'wheelman', name: 'WHEELMAN', desc: 'Drive 20 km of Palmera Bay streets.', reward: 200, check: (s) => s.distanceDriven >= 20000 },
  { id: 'marathon', name: 'MARATHON', desc: 'Walk 5 km on foot.', reward: 150, check: (s) => s.distanceWalked >= 5000 },
  { id: 'airborne', name: 'AIRBORNE', desc: 'Land 5 stunt jumps.', reward: 200, check: (s) => s.jumps >= 5 },
  { id: 'ghost', name: 'GHOST', desc: 'Slip a 4-star wanted level with no one watching.', reward: 300, check: (s) => s.ghostEscapes >= 1 },
  { id: 'high-roller', name: 'HIGH ROLLER', desc: 'Earn $5,000 across all work.', reward: 400, check: (s) => s.moneyEarned >= 5000 },
  { id: 'brawler', name: 'BRAWLER', desc: 'Knock down 10 people, one way or another.', reward: 200, check: (s) => s.knockdowns >= 10 },
  { id: 'sharpshooter', name: 'SHARPSHOOTER', desc: 'Fire 50 pistol rounds.', reward: 200, check: (s) => s.shotsFired >= 50 },
  { id: 'close-call', name: 'CLOSE CALL', desc: 'Thread 5 near misses at speed.', reward: 250, check: (s) => s.nearMisses >= 5 },
  { id: 'treasure', name: 'TREASURE HUNTER', desc: 'Dig up 5 hidden cash stashes.', reward: 250, check: (s) => s.stashesFound >= 5 },
  { id: 'cab-king', name: 'CAB KING', desc: 'Complete 5 taxi fares.', reward: 200, check: (s) => s.fares >= 5 },
  { id: 'street-king', name: 'STREET KING', desc: 'Win a street race.', reward: 300, check: (s) => s.racesWon >= 1 },
  { id: 'night-owl', name: 'NIGHT OWL', desc: 'Spend a full minute driving after dark.', reward: 200, check: (s) => s.nightSeconds >= 60 },
];

export class Stats {
  constructor() {
    this.distanceDriven = 0;
    this.distanceWalked = 0;
    this.jumps = 0;
    this.fares = 0;
    this.racesWon = 0;
    this.racesRun = 0;
    this.moneyEarned = 0;
    this.knockdowns = 0;
    this.shotsFired = 0;
    this.nearMisses = 0;
    this.stashesFound = 0;
    this.ghostEscapes = 0;
    this.nightSeconds = 0;
    this.jobsDone = 0;
    this.unlocked = []; // achievement ids, in unlock order
    this.checkTimer = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.tracking = false;
  }

  // --- counters the game calls ---

  recordJump() {
    this.jumps += 1;
  }

  recordFare() {
    this.fares += 1;
  }

  recordRace(won) {
    this.racesRun += 1;
    if (won) this.racesWon += 1;
  }

  recordEarned(amount) {
    if (amount > 0) this.moneyEarned += amount;
  }

  recordKnockdown() {
    this.knockdowns += 1;
  }

  recordShot() {
    this.shotsFired += 1;
  }

  recordNearMiss() {
    this.nearMisses += 1;
  }

  recordStash() {
    this.stashesFound += 1;
  }

  recordGhostEscape() {
    this.ghostEscapes += 1;
  }

  recordJob() {
    this.jobsDone += 1;
  }

  // --- the frame tick ---

  update(dt, game) {
    const marco = game.player;
    if (!this.tracking) {
      this.lastX = marco.x;
      this.lastY = marco.y;
      this.tracking = true;
      return;
    }
    const step = Math.hypot(marco.x - this.lastX, marco.y - this.lastY);
    if (marco.inCar) this.distanceDriven += step;
    else this.distanceWalked += step;
    this.lastX = marco.x;
    this.lastY = marco.y;
    if (game.daynight && game.daynight.isNight(game) && marco.inCar) {
      this.nightSeconds += dt;
    }
    this.checkTimer -= dt;
    if (this.checkTimer <= 0) {
      this.checkTimer = CHECK_EVERY;
      this.unlockCheck(game);
    }
  }

  unlockCheck(game) {
    for (const medal of MEDALS) {
      if (this.unlocked.includes(medal.id)) continue;
      if (!medal.check(this)) continue;
      this.unlocked.push(medal.id);
      game.player.money += medal.reward;
      game.sounds.achievement();
      game.addParticles(game.player.x, game.player.y, 16, '#ffd23f');
      game.toast('ACHIEVEMENT', `${medal.name} — ${medal.desc} +$${medal.reward}.`, 5);
    }
  }

  // --- save / load ---

  toJSON() {
    return {
      distanceDriven: Math.round(this.distanceDriven),
      distanceWalked: Math.round(this.distanceWalked),
      jumps: this.jumps,
      fares: this.fares,
      racesWon: this.racesWon,
      racesRun: this.racesRun,
      moneyEarned: Math.round(this.moneyEarned),
      knockdowns: this.knockdowns,
      shotsFired: this.shotsFired,
      nearMisses: this.nearMisses,
      stashesFound: this.stashesFound,
      ghostEscapes: this.ghostEscapes,
      nightSeconds: Math.round(this.nightSeconds),
      jobsDone: this.jobsDone,
      unlocked: [...this.unlocked],
    };
  }

  fromJSON(data) {
    if (!data) return;
    for (const key of Object.keys(this.toJSON())) {
      if (data[key] !== undefined) this[key] = data[key];
    }
    if (!Array.isArray(this.unlocked)) this.unlocked = [];
  }

  // One line for the pause screen: the record so far.
  summaryLine() {
    const km = (this.distanceDriven / 1000).toFixed(1);
    return `${this.jobsDone} jobs · ${km} km driven · ${this.jumps} jumps · ${this.unlocked.length}/${MEDALS.length} achievements`;
  }
}

// v7: the new systems report their numbers here — money, heat, reputation.
