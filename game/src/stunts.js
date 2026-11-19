// Stunt ramps: wooden jump ramps set around the city. Hit one fast
// and lined up and the car takes off — airtime pays cash, and a long
// jump pays more. Land badly (too slow) and nothing happens; the ramp
// just bumps the car.
//
// Each ramp knows its approach angle. The car has to be travelling
// roughly along it, and fast, for the launch to trigger. While the
// car is airborne the renderer lifts the body above its shadow, and
// the car keeps its speed — it is still moving, just not touching
// the road. v4 rewrote this file wholesale — same ramps, same payouts,
// new internal names.
import { distSq } from './config.js';

const LAUNCH_MIN_SPEED = 250;
const ALIGN_COS = 0.7; // within ~45 degrees of the ramp's direction
const TRIGGER_RADIUS = 34;
const FLIGHT_SECONDS = 0.9; // seconds in the air
const PEAK_LIFT = 34; // pixels the body lifts at the top of the arc
const CASH_PER_AIR_SECOND = 120;

// Fixed ramps, one per corner of the map, each facing down a road.
const RAMP_SPOTS = [
  { x: 560, y: 500, angle: 0 }, // Old Town eastbound
  { x: 2900, y: 800, angle: Math.PI }, // Uptown westbound
  { x: 1560, y: 2050, angle: -Math.PI / 2 }, // Marina northbound
  { x: 2560, y: 1700, angle: Math.PI / 2 }, // Stadium southbound
  { x: 900, y: 1400, angle: Math.PI / 4 }, // Beach road diagonal
  { x: 2200, y: 500, angle: Math.PI }, // Docks westbound
];

export class StuntRamps {
  constructor() {
    this.ramps = RAMP_SPOTS.map((s) => ({ ...s, cooldown: 0 }));
    this.combo = 0; // jumps chained within a few seconds of each other
    this.lastJumpAt = -99;
  }

  // Called every frame while the player drives. Returns nothing; the
  // launch, the flight and the landing all happen through the car.
  update(dt, car, game) {
    for (const ramp of this.ramps) {
      if (ramp.cooldown > 0) ramp.cooldown -= dt;
    }
    if (!car || car.dead) return;
    if (car.air) {
      this.flyAirborne(dt, car, game);
      return;
    }
    for (const ramp of this.ramps) {
      if (ramp.cooldown > 0) continue;
      if (distSq(car.x, car.y, ramp.x, ramp.y) > TRIGGER_RADIUS * TRIGGER_RADIUS) continue;
      if (Math.abs(car.speed) < LAUNCH_MIN_SPEED) continue;
      const along = Math.cos(car.angle) * Math.cos(ramp.angle) + Math.sin(car.angle) * Math.sin(ramp.angle);
      if (along < ALIGN_COS) continue;
      ramp.cooldown = 3;
      car.air = { t: 0, total: FLIGHT_SECONDS };
      car.airAngle = car.angle; // the takeoff line — land straight on it for PERFECT
      game.sounds.horn();
      game.toast('STUNT RAMP', 'Airtime! Stay smooth for the landing.', 2);
      return;
    }
  }

  // The car is in the air: count the flight, lift the body on a
  // parabola, and pay out when it comes back down. Jumps chained
  // within 6 seconds multiply the payout — a combo for show-offs.
  // Land it straight (within 15 degrees of the takeoff line) and
  // the landing is PERFECT: double the reward and a clean bonus.
  flyAirborne(dt, car, game) {
    car.air.t += dt;
    const done = car.air.t / car.air.total;
    if (done >= 1) {
      const airTime = car.air.total;
      car.air = null;
      car.airHeight = 0;
      this.combo = game.elapsed - this.lastJumpAt < 6 ? this.combo + 1 : 1;
      this.lastJumpAt = game.elapsed;
      if (game.stats) game.stats.recordJump();
      const straight = Math.abs(((car.angle - car.airAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.26;
      const perfect = straight && Math.abs(car.speed) > LAUNCH_MIN_SPEED;
      let reward = Math.round(airTime * CASH_PER_AIR_SECOND * (1 + 0.5 * (this.combo - 1)));
      if (perfect) reward *= 2;
      if (game.stats) game.stats.recordEarned(reward);
      game.player.money += reward;
      game.sounds.cash();
      game.addParticles(car.x, car.y, perfect ? 24 : 14, perfect ? '#7dff8a' : '#ffd23f');
      game.toast(
        perfect ? 'PERFECT LANDING' : 'AIR TIME',
        perfect
          ? `Dead straight — +$${reward} (perfect x2${this.combo > 1 ? `, combo x${this.combo}` : ''})!`
          : this.combo > 1 ? `Clean landing — +$${reward} (combo x${this.combo})!` : `Clean landing — +$${reward}.`,
        3,
      );
      return;
    }
    // Parabola: 0 at take-off and landing, peak in the middle.
    car.airHeight = PEAK_LIFT * 4 * done * (1 - done);
  }
}
