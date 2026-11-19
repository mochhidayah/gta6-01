// Rival gangs: the Sharks and the Vipers hold corners of Palmera Bay.
// A member is a pedestrian with a crew colour and a temper: left
// alone they loiter on turf, close in and swing when the player gets
// near — especially with heat on. Knocking one down pays a little
// cash and heat, and scares the crew off. Missions can muster a
// named crew at a spot (the Turf War calls the Sharks to the stadium).
// v6 touched this file lightly: same crews, same tempers,
// a few internal names refreshed.
import { distSq } from './config.js';
import { Ped } from './people.js';

const GANG_CREWS = [
  { name: 'Sharks', color: '#2e6bff', turf: 'stadium' },
  { name: 'Vipers', color: '#37c24a', turf: 'docks' },
];

const CHASE_R = 320;
const SWING_R = 28;
const SWING_DMG = 8;
const SWING_CD = 1.1;
const CREW_CAP = 10;

export function crewByName(name) {
  return GANG_CREWS.find((c) => c.name === name) || GANG_CREWS[0];
}

export class GangMember extends Ped {
  constructor(x, y, rng, crew) {
    super(x, y, rng, 'walker');
    this.crew = crew; // {name, color, turf}
    this.color = crew.color;
    this.speed = 95;
    this.attackTimer = 0;
    this.state = 'stroll';
    this.retaliating = false; // sent by a retaliation squad — hunts the player
  }

  // Chases when close and provoked (heat, pistol, or a turf-war mission).
  // A retaliating member hunts the player on sight, car or no car.
  update(dt, game, rng) {
    if (this.state === 'down') return;
    if (this.attackTimer > 0) this.attackTimer -= dt;
    const marco = game.player;
    const close = distSq(this.x, this.y, marco.x, marco.y) < CHASE_R * CHASE_R;
    const turfWar = game.missions.active && game.missions.active.def.id === 'm9';
    const provoked = game.wanted > 0 || marco.weapon === 'pistol' || turfWar || this.retaliating;
    if (close && provoked && (!marco.inCar || this.retaliating)) {
      this.chasePlayer(dt, game);
      return;
    }
    super.update(dt, game, rng);
  }

  chasePlayer(dt, game) {
    const marco = game.player;
    const dx = marco.x - this.x;
    const dy = marco.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    this.angle = Math.atan2(dy, dx);
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    const push = game.city.collideCircle(this.x, this.y, this.r);
    if (push) {
      this.x += push.x;
      this.y += push.y;
    }
    if (d < SWING_R && this.attackTimer <= 0) {
      this.attackTimer = SWING_CD;
      marco.hurt(SWING_DMG, game);
      game.sounds.punch();
      game.addParticles(this.x, this.y, 6, '#e33f2f');
    }
  }

  scare(fromX, fromY) {
    // Gang members stand their ground longer than civilians.
    if (this.state === 'down') return;
    if (Math.random() < 0.5) {
      super.scare(fromX, fromY);
    }
  }
}

export class Gangs {
  constructor(city) {
    this.city = city;
    this.members = [];
    this.seedState = 987654321;
    this.paybackTimer = 0; // cooldown between retaliation squads
  }

  nextRand() {
    this.seedState = (this.seedState * 1103515245 + 12345) % 2147483648;
    return this.seedState / 2147483648;
  }

  spawn(count, nearX, nearY) {
    for (let i = 0; i < count && this.members.length < CREW_CAP; i++) {
      const crew = GANG_CREWS[Math.floor(this.nextRand() * GANG_CREWS.length)];
      const turf = this.city.landmarks[crew.turf];
      const x = turf.x + (this.nextRand() - 0.5) * 500;
      const y = turf.y + (this.nextRand() - 0.5) * 500;
      const member = new GangMember(x, y, () => this.nextRand(), crew);
      this.members.push(member);
    }
  }

  spawnCrew(crewName, count, x, y) {
    const crew = crewByName(crewName);
    for (let i = 0; i < count && this.members.length < CREW_CAP; i++) {
      const member = new GangMember(
        x + (this.nextRand() - 0.5) * 320,
        y + (this.nextRand() - 0.5) * 320,
        () => this.nextRand(),
        crew,
      );
      this.members.push(member);
    }
    return this.members.filter((member) => member.crew.name === crewName);
  }

  // Drop a member of the named crew at the drop point and send them
  // after the player: knocking a gang member down has consequences.
  // On a cooldown so one fight does not summon the whole city.
  retaliate(crewName, game) {
    if (this.paybackTimer > 0) return;
    this.paybackTimer = 45;
    const crew = crewByName(crewName);
    const marco = game.player;
    const squad = [];
    for (let i = 0; i < 3 && this.members.length < CREW_CAP; i++) {
      const member = new GangMember(
        marco.x + (this.nextRand() - 0.5) * 500,
        marco.y + (this.nextRand() - 0.5) * 500,
        () => this.nextRand(),
        crew,
      );
      member.retaliating = true;
      this.members.push(member);
      squad.push(member);
    }
    if (squad.length > 0) {
      game.hud.toast(
        `${crew.name.toUpperCase()} RETALIATION`,
        `You dropped one of theirs — ${squad.length} of them are coming for you.`,
        4,
      );
    }
  }

  update(dt, game, rng) {
    if (this.paybackTimer > 0) this.paybackTimer -= dt;
    for (const member of this.members) member.update(dt, game, rng);
    const px = game.player.x;
    const py = game.player.y;
    this.members = this.members.filter((member) => {
      if (member.state === 'down') return distSq(member.x, member.y, px, py) < 700 * 700;
      return true;
    });
  }

  scatterNear(x, y, radius) {
    for (const member of this.members) {
      if (member.state === 'down') continue;
      if (distSq(member.x, member.y, x, y) < radius * radius) member.scare(x, y);
    }
  }
}

// v7: gangs watch the new empire turf — expansion has eyes on it.
