// Rival gangs: the Sharks and the Vipers hold corners of Palmera Bay,
// and they do not like Marco Solano.
//
// A gang member is a pedestrian with a crew colour and a temper. Left
// alone they loiter on their turf, but when the player gets close —
// especially with heat on them — they close in and swing. Knocking
// one down pays a little cash and a little heat, like any other fight,
// and scares the rest of the crew off for a while.
//
// Gang members live apart from the crowd: they spawn on turf, never
// despawn by distance, and the game caps how many can be out at once.
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
const MAX_MEMBERS = 6;

export class GangMember extends Ped {
  constructor(x, y, rng, crew) {
    super(x, y, rng, 'walker');
    this.crew = crew; // {name, color, turf}
    this.color = crew.color;
    this.speed = 95;
    this.attackTimer = 0;
    this.state = 'stroll';
  }

  // A gang member chases the player when close and the heat is on,
  // or when the player has already swung at their crew.
  update(dt, game, rng) {
    if (this.state === 'down') return;
    if (this.attackTimer > 0) this.attackTimer -= dt;
    const p = game.player;
    const near = distSq(this.x, this.y, p.x, p.y) < AGGRO_RANGE * AGGRO_RANGE;
    const provoked = game.wanted > 0 || p.weapon === 'pistol';
    if (near && provoked && !p.inCar) {
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
  }

  // Cheap deterministic roll, so spawns do not touch the shared rng.
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

  update(dt, game, rng) {
    for (const member of this.members) member.update(dt, game, rng);
    const px = game.player.x;
    const py = game.player.y;
    this.members = this.members.filter((m) => {
      if (m.state === 'down') return distSq(m.x, m.y, px, py) < 700 * 700;
      return true;
    });
  }

  // The crew scatters when one of theirs goes down in front of them.
  scatterNear(x, y, radius) {
    for (const member of this.members) {
      if (member.state === 'down') continue;
      if (distSq(member.x, member.y, x, y) < radius * radius) member.scare(x, y);
    }
  }
}
