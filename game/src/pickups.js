// World pickups: ammo boxes, medkits and cash drops lying around
// Palmera Bay for a Marco on foot.
//
// The pawnshop pistol is the only gun in the city, and its 48
// rounds run out — so ammo boxes sit near the places a shooter
// goes: the pawnshop, the stadium, the docks. Medkits wait outside
// the hospital and the club for a Marco who picked the wrong fight.
// Cash drops are pure luck: a dropped wallet on a street corner.
// Every pickup comes back about a minute after it is taken, so the
// city never runs dry. v4 rewrote this file wholesale — same spots,
// same payouts, new internal names.
import { distSq, PICKUP_RULES } from './config.js';
import { gauss } from './rng.js';

const TAKE_R = 40;
// What each pickup gives and how fast it returns lives in
// config.js (PICKUP_RULES).
const AMMO = PICKUP_RULES.ammoRounds;
const HEAL = PICKUP_RULES.healthAmount;
const CASH = PICKUP_RULES.cashAmount;
const RESPAWN = PICKUP_RULES.respawnSeconds;

// Fixed spots: what waits there, and where.
const PICKUP_SPOTS = [
  { kind: 'ammo', place: 'pawnshop', dx: -70, dy: 40 },
  { kind: 'ammo', place: 'stadium', dx: 90, dy: -60 },
  { kind: 'ammo', place: 'docks', dx: -80, dy: 30 },
  { kind: 'ammo', place: 'policeHQ', dx: 80, dy: 60 },
  { kind: 'health', place: 'hospital', dx: -60, dy: -40 },
  { kind: 'health', place: 'club', dx: -90, dy: 50 },
  { kind: 'health', place: 'marina', dx: 70, dy: -30 },
  { kind: 'cash', place: 'garage', dx: 60, dy: -70 },
  { kind: 'cash', place: 'airport', dx: -60, dy: 70 },
  { kind: 'cash', place: 'bank', dx: 90, dy: 60 },
];

export class Pickups {
  constructor(city) {
    this.items = PICKUP_SPOTS.map((spec) => {
      const mark = city.landmarks[spec.place];
      return {
        kind: spec.kind,
        x: mark.x + spec.dx,
        y: mark.y + spec.dy,
        taken: false,
        respawn: 0,
      };
    });
  }

  update(dt, game) {
    const marco = game.player;
    for (const item of this.items) {
      if (item.taken) {
        item.respawn -= dt;
        if (item.respawn <= 0) item.taken = false;
        continue;
      }
      if (marco.inCar) continue;
      if (distSq(marco.x, marco.y, item.x, item.y) > TAKE_R * TAKE_R) continue;
      this.grab(item, game);
    }
  }

  grab(item, game) {
    const marco = game.player;
    item.taken = true;
    // The respawn delay wobbles around 50 seconds so the city never
    // feels metronomic.
    item.respawn = gauss(game.rng, RESPAWN, 5, 40, 60);
    if (item.kind === 'ammo') {
      if (marco.weapon !== 'pistol') {
        marco.weapon = 'pistol';
        marco.ammo = AMMO;
        game.hud.toast('PISTOL FOUND', `An ammo box with a pistol inside — ${AMMO} rounds. Press 2 to draw it.`, 4);
      } else {
        marco.ammo += AMMO;
        game.hud.toast('AMMO', `+${AMMO} rounds — ${marco.ammo} in the mag.`, 3);
      }
      game.sounds.pickup();
      game.addParticles(item.x, item.y, 8, '#f2c230');
      return;
    }
    if (item.kind === 'health') {
      if (marco.health >= 100) {
        // Full health: leave the kit where it is.
        item.taken = false;
        item.respawn = 0;
        return;
      }
      marco.heal(HEAL);
      game.sounds.pickup();
      game.addParticles(item.x, item.y, 8, '#58d068');
      game.hud.toast('MEDKIT', `+${HEAL} HP — patched up and back in the fight.`, 3);
      return;
    }
    // Cash: a dropped wallet, finders keepers.
    marco.money += CASH;
    if (game.stats) game.stats.recordEarned(CASH);
    game.sounds.cash();
    game.addParticles(item.x, item.y, 10, '#7dff8a');
    game.hud.toast('FOUND CASH', `+$${CASH} — someone's wallet, now yours.`, 3);
  }
}
