// Daily challenges: three small jobs that reset with the day.
//
// Every session draws three challenges from the pool, seeded by the
// calendar date, so every player in Palmera Bay chases the same
// three on the same day. Each one pays cash on completion and feeds
// the stats the achievements watch. The tracker shows the first
// unfinished challenge while the player free-roams.
//
// A challenge watches a counter: jobs done, jumps landed, fares,
// races won, distance driven, stashes found, knockdowns, money
// earned, or heat lost. The check runs once a second alongside the
// achievements, and a finished challenge stays finished for the day.
import { seeded } from './rng.js';

const POOL = [
  { id: 'job-2', label: 'Finish 2 story jobs', reward: 300, check: (s) => s.jobsDone >= 2 },
  { id: 'job-4', label: 'Finish 4 story jobs', reward: 600, check: (s) => s.jobsDone >= 4 },
  { id: 'jump-3', label: 'Land 3 stunt jumps', reward: 250, check: (s) => s.jumps >= 3 },
  { id: 'fare-3', label: 'Complete 3 taxi fares', reward: 250, check: (s) => s.fares >= 3 },
  { id: 'drive-10', label: 'Drive 10 km through the city', reward: 300, check: (s) => s.distanceDriven >= 10000 },
  { id: 'walk-2', label: 'Walk 2 km on foot', reward: 150, check: (s) => s.distanceWalked >= 2000 },
  { id: 'stash-3', label: 'Find 3 hidden cash stashes', reward: 300, check: (s) => s.stashesFound >= 3 },
  { id: 'knock-5', label: 'Knock down 5 people', reward: 250, check: (s) => s.knockdowns >= 5 },
  { id: 'earn-1500', label: 'Earn $1,500 in one session', reward: 350, check: (s) => s.moneyEarned >= 1500 },
  { id: 'race-1', label: 'Win a street race', reward: 400, check: (s) => s.racesWon >= 1 },
  { id: 'ghost-1', label: 'Slip a 4-star wanted level', reward: 400, check: (s) => s.ghostEscapes >= 1 },
  { id: 'night-60', label: 'Drive for a minute after dark', reward: 250, check: (s) => s.nightSeconds >= 60 },
];

const PER_DAY = 3;

// The day's seed: year, month and day, so the three challenges are
// the same for everyone until midnight.
function daySeed() {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

export class DailyChallenges {
  constructor() {
    const rng = seeded(daySeed());
    const pool = [...POOL];
    this.list = [];
    while (this.list.length < PER_DAY && pool.length > 0) {
      const i = Math.floor(rng() * pool.length);
      this.list.push({ ...pool.splice(i, 1)[0], done: false });
    }
    this.checkTimer = 0;
  }

  // The first challenge still open, for the HUD tracker.
  get current() {
    return this.list.find((c) => !c.done) || null;
  }

  get doneCount() {
    return this.list.filter((c) => c.done).length;
  }

  update(dt, game) {
    this.checkTimer -= dt;
    if (this.checkTimer > 0) return;
    this.checkTimer = 1;
    const stats = game.stats;
    if (!stats) return;
    for (const challenge of this.list) {
      if (challenge.done) continue;
      if (!challenge.check(stats)) continue;
      challenge.done = true;
      game.player.money += challenge.reward;
      game.sounds.achievement();
      game.addParticles(game.player.x, game.player.y, 14, '#7dff8a');
      game.toast('CHALLENGE DONE', `${challenge.label} — +$${challenge.reward}. ${this.doneCount} of ${this.list.length} today.`, 5);
    }
  }
}
