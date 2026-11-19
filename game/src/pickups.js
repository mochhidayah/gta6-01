// World pickups: ammo boxes, medkits and cash drops lying around
// Palmera Bay for a Marco on foot.
//
// The pawnshop pistol is the only gun in the city, and its 48
// rounds run out — so ammo boxes sit near the places a shooter
// goes: the pawnshop, the stadium, the docks. Medkits wait outside
// the hospital and the club for a Marco who picked the wrong fight.
// Cash drops are pure luck: a dropped wallet on a street corner.
// Every pickup comes back about a minute after it is taken, so the
// city never runs dry.
import { distSq, PICKUP_RULES } from './config.js';
import { gauss } from './rng.js';

const PICKUP_RADIUS = 40;
// What each pickup gives and how fast it returns lives in
// config.js (PICKUP_RULES).
const AMMO_ROUNDS = PICKUP_RULES.ammoRounds;
const HEALTH_AMOUNT = PICKUP_RULES.healthAmount;
const CASH_AMOUNT = PICKUP_RULES.cashAmount;
const RESPAWN_SECONDS = PICKUP_RULES.respawnSeconds;

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
    this.items = PICKUP_SPOTS.map((s) => {
      const spot = city.landmarks[s.place];
      return {
        kind: s.kind,
        x: spot.x + s.dx,
        y: spot.y + s.dy,
        taken: false,
        respawn: 0,
      };
    });
  }

  update(dt, game) {
    const p = game.player;
    for (const item of this.items) {
      if (item.taken) {
        item.respawn -= dt;
        if (item.respawn <= 0) item.taken = false;
        continue;
      }
      if (p.inCar) continue;
      if (distSq(p.x, p.y, item.x, item.y) > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      this.collect(item, game);
    }
  }

  collect(item, game) {
    const p = game.player;
    item.taken = true;
    // The respawn delay wobbles around 50 seconds so the city never
    // feels metronomic.
    item.respawn = gauss(game.rng, RESPAWN_SECONDS, 5, 40, 60);
    if (item.kind === 'ammo') {
      if (p.weapon !== 'pistol') {
        p.weapon = 'pistol';
        p.ammo = AMMO_ROUNDS;
        game.hud.toast('PISTOL FOUND', `An ammo box with a pistol inside — ${AMMO_ROUNDS} rounds. Press 2 to draw it.`, 4);
      } else {
        p.ammo += AMMO_ROUNDS;
        game.hud.toast('AMMO', `+${AMMO_ROUNDS} rounds — ${p.ammo} in the mag.`, 3);
      }
      game.sounds.pickup();
      game.addParticles(item.x, item.y, 8, '#f2c230');
      return;
    }
    if (item.kind === 'health') {
      if (p.health >= 100) {
        // Full health: leave the kit where it is.
        item.taken = false;
        item.respawn = 0;
        return;
      }
      p.heal(HEALTH_AMOUNT);
      game.sounds.pickup();
      game.addParticles(item.x, item.y, 8, '#58d068');
      game.hud.toast('MEDKIT', `+${HEALTH_AMOUNT} HP — patched up and back in the fight.`, 3);
      return;
    }
    // Cash: a dropped wallet, finders keepers.
    p.money += CASH_AMOUNT;
    if (game.stats) game.stats.recordEarned(CASH_AMOUNT);
    game.sounds.cash();
    game.addParticles(item.x, item.y, 10, '#7dff8a');
    game.hud.toast('FOUND CASH', `+$${CASH_AMOUNT} — someone's wallet, now yours.`, 3);
  }
}
