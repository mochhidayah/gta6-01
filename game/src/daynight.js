// Day and night over Palmera Bay.
//
// The in-game clock starts at 17:00 and runs in real time, so an
// evening drive slides into dusk, then a proper night, then dawn.
// Night is visual only: a dark wash over the world, lamps that glow,
// stars overhead, and headlight cones from the cars. The wanted
// system does not change at night — the precinct works all hours —
// but hiding is easier to feel when the streets go dark.
//
// The cycle is deliberately slow: a full day takes about 40 minutes
// of play, so a single session can watch the sun go down, and the
// screenshots (taken at 17:00) always show the bright city.
// Tuning lives in config.js (NIGHT): how dark, how far the lamps
// glow, how far the headlights reach. v4 rewrote this file wholesale
// — same clock, same light, new internal names.
import { NIGHT } from './config.js';

const FIRST_HOUR = 17; // the clock starts here, every session
const DUSK_HOUR = 18.5; // the sky starts to warm
const DARK_HOUR = 20; // full dark from here
const DARK_TIL = 5; // dark until here
const DAWN_HOUR = 7; // fully light again from here
const DUSK_GLOW = 0.16; // how warm dusk gets

// Fixed stars, scattered once per page load across the sky.
function makeStars(count) {
  const sky = [];
  for (let i = 0; i < count; i++) {
    sky.push({
      x: Math.random(),
      y: Math.random() * 0.55,
      r: 0.6 + Math.random() * 1.3,
      twinkle: Math.random() * Math.PI * 2,
    });
  }
  return sky;
}

// Smooth ramp between two hours: 0 before `from`, 1 after `to`.
function rampBetween(hour, from, to) {
  if (hour <= from) return 0;
  if (hour >= to) return 1;
  return (hour - from) / (to - from);
}

export class DayNight {
  constructor() {
    this.stars = makeStars(90);
    this.time = 0;
  }

  // The hour of day, from the game's clock (seconds since 17:00).
  hourOf(game) {
    return (FIRST_HOUR + game.clock / 3600) % 24;
  }

  // 0 in daylight, 1 at full night. Dusk and dawn ease in and out.
  darkness(game) {
    const h = this.hourOf(game);
    if (h >= DARK_HOUR || h < DARK_TIL) return 1;
    if (h >= DUSK_HOUR && h < DARK_HOUR) return rampBetween(h, DUSK_HOUR, DARK_HOUR) * 0.85;
    if (h >= DARK_TIL && h < DAWN_HOUR) return 1 - rampBetween(h, DARK_TIL, DAWN_HOUR);
    return 0;
  }

  // How warm the dusk light is: 0 by day, 1 at the orange hour.
  duskWarmth(game) {
    const h = this.hourOf(game);
    if (h >= DUSK_HOUR && h < DARK_HOUR) return rampBetween(h, DUSK_HOUR, DARK_HOUR);
    if (h >= DARK_TIL && h < DAWN_HOUR) return 1 - rampBetween(h, DARK_TIL, DAWN_HOUR);
    return 0;
  }

  isNight(game) {
    return this.darkness(game) > 0.6;
  }

  // Paint the night over the viewport: a blue wash, stars, lamp
  // glow, and headlight cones from the cars that have lights on.
  // Called by the renderer after the sunset wash, before the rain.
  draw(ctx, view, game) {
    this.time += 1 / 60;
    const shade = this.darkness(game);
    const warm = this.duskWarmth(game);
    if (shade <= 0.01 && warm <= 0.01) return;
    ctx.save();
    if (warm > 0.01) {
      ctx.fillStyle = `rgba(255,110,40,${DUSK_GLOW * warm})`;
      ctx.fillRect(view.x, view.y, view.w, view.h);
    }
    if (shade > 0.01) {
      ctx.fillStyle = `rgba(8,12,38,${NIGHT.fullDarkAlpha * shade})`;
      ctx.fillRect(view.x, view.y, view.w, view.h);
      this.paintStars(ctx, view, shade);
      this.paintLamps(ctx, view, game, shade);
      this.paintBeams(ctx, game, shade);
    }
    ctx.restore();
  }

  paintStars(ctx, view, dark) {
    ctx.fillStyle = '#ffffff';
    for (const star of this.stars) {
      const blink = 0.55 + 0.45 * Math.sin(this.time * 2 + star.twinkle);
      ctx.globalAlpha = dark * blink;
      ctx.beginPath();
      ctx.arc(view.x + star.x * view.w, view.y + star.y * view.h, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Street lamps bloom into warm pools of light after dark.
  paintLamps(ctx, view, game, dark) {
    for (const lamp of game.city.lamps) {
      if (lamp.x < view.x - 60 || lamp.x > view.x + view.w + 60) continue;
      if (lamp.y < view.y - 60 || lamp.y > view.y + view.h + 60) continue;
      const glow = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, NIGHT.lampGlow);
      glow.addColorStop(0, `rgba(255,214,120,${0.5 * dark})`);
      glow.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, NIGHT.lampGlow, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,230,160,${0.9 * dark})`;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Headlight cones: the player's car and nearby police cruisers
  // throw a wedge of light down the road at night.
  paintBeams(ctx, game, dark) {
    const lit = [];
    if (game.playerCar) lit.push(game.playerCar);
    for (const car of game.traffic.cars) {
      if (car.police && !car.dead) lit.push(car);
    }
    for (const car of lit) {
      const ux = Math.cos(car.angle);
      const uy = Math.sin(car.angle);
      const noseX = car.x + ux * (car.w / 2);
      const noseY = car.y + uy * (car.h / 2);
      const reach = NIGHT.headlightReach;
      const spread = 0.42;
      const lx = noseX + Math.cos(car.angle - spread) * reach;
      const ly = noseY + Math.sin(car.angle - spread) * reach;
      const rx = noseX + Math.cos(car.angle + spread) * reach;
      const ry = noseY + Math.sin(car.angle + spread) * reach;
      ctx.fillStyle = `rgba(255,240,180,${0.13 * dark})`;
      ctx.beginPath();
      ctx.moveTo(noseX, noseY);
      ctx.lineTo(lx, ly);
      ctx.lineTo(rx, ry);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// v7: the day-night cycle keeps turning over the new businesses and events.
