// Rival gangs: the Sharks and the Vipers hold corners of Palmera Bay.
// A member is a pedestrian with a crew colour and a temper: left
// alone they loiter on turf, close in and swing when the player gets
// near — especially with heat on. Knocking one down pays a little
// cash and heat, and scares the crew off. Missions can muster a
// named crew at a spot (the Turf War calls the Sharks to the stadium).
// v4 rewrote this file wholesale — same crews, same tempers, new names.
import { distSq } from './config.js';
import { Ped } from './people.js';

const CREWS = [
  { name: 'Sharks', color: '#2e6bff', turf: 'stadium' },
  { name: 'Vipers', color: '#37c24a', turf: 'docks' },
];

const AGGRO_RANGE = 320;
const ATTACK_RANGE = 28;
const ATTACK_DAMAGE = 8;
const ATTACK_COOLDOWN = 1.1;
const MAX_MEMBERS = 10;

export function crewByName(name) {
  return CREWS.find((c) => c.name === name) || CREWS[0];
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
    const p = game.player;
    const near = distSq(this.x, this.y, p.x, p.y) < AGGRO_RANGE * AGGRO_RANGE;
    const warOn = game.missions.active && game.missions.active.def.id === 'm9';
    const provoked = game.wanted > 0 || p.weapon === 'pistol' || warOn || this.retaliating;
    if (near && provoked && (!p.inCar || this.retaliating)) {
      this.chasePlayer(dt, game);
      return;
    }
    super.update(dt, game, rng);
  }

  chasePlayer(dt, game) {
    const p = game.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
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
    if (d < ATTACK_RANGE && this.attackTimer <= 0) {
      this.attackTimer = ATTACK_COOLDOWN;
      p.hurt(ATTACK_DAMAGE, game);
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
    this.rngState = 987654321;
    this.retaliationTimer = 0; // cooldown between retaliation squads
  }

  roll() {
    this.rngState = (this.rngState * 1103515245 + 12345) % 2147483648;
    return this.rngState / 2147483648;
  }

  spawn(count, nearX, nearY) {
    for (let i = 0; i < count && this.members.length < MAX_MEMBERS; i++) {
      const crew = CREWS[Math.floor(this.roll() * CREWS.length)];
      const turf = this.city.landmarks[crew.turf];
      const x = turf.x + (this.roll() - 0.5) * 500;
      const y = turf.y + (this.roll() - 0.5) * 500;
      const member = new GangMember(x, y, () => this.roll(), crew);
      this.members.push(member);
    }
  }

  spawnCrew(crewName, count, x, y) {
    const crew = crewByName(crewName);
    for (let i = 0; i < count && this.members.length < MAX_MEMBERS; i++) {
      const member = new GangMember(
        x + (this.roll() - 0.5) * 320,
        y + (this.roll() - 0.5) * 320,
        () => this.roll(),
        crew,
      );
      this.members.push(member);
    }
    return this.members.filter((m) => m.crew.name === crewName);
  }

  // Drop a member of the named crew at the drop point and send them
  // after the player: knocking a gang member down has consequences.
  // On a cooldown so one fight does not summon the whole city.
  retaliate(crewName, game) {
    if (this.retaliationTimer > 0) return;
    this.retaliationTimer = 45;
    const crew = crewByName(crewName);
    const p = game.player;
    const spawned = [];
    for (let i = 0; i < 3 && this.members.length < MAX_MEMBERS; i++) {
      const member = new GangMember(
        p.x + (this.roll() - 0.5) * 500,
        p.y + (this.roll() - 0.5) * 500,
        () => this.roll(),
        crew,
      );
      member.retaliating = true;
      this.members.push(member);
      spawned.push(member);
    }
    if (spawned.length > 0) {
      game.hud.toast(
        `${crew.name.toUpperCase()} RETALIATION`,
        `You dropped one of theirs — ${spawned.length} of them are coming for you.`,
        4,
      );
    }
  }

  update(dt, game, rng) {
    if (this.retaliationTimer > 0) this.retaliationTimer -= dt;
    for (const member of this.members) member.update(dt, game, rng);
    const px = game.player.x;
    const py = game.player.y;
    this.members = this.members.filter((m) => {
      if (m.state === 'down') return distSq(m.x, m.y, px, py) < 700 * 700;
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
