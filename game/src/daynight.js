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
// glow, how far the headlights reach.
import { NIGHT } from './config.js';

const DAY_START_HOUR = 17; // the clock starts here, every session
const DUSK_START = 18.5; // the sky starts to warm
const NIGHT_START = 20; // full dark from here
const NIGHT_END = 5; // dark until here
const DAWN_END = 7; // fully light again from here
const DUSK_ALPHA = 0.16; // how warm dusk gets

// Fixed stars, scattered once per page load across the sky.
function makeStars(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: Math.random(),
      y: Math.random() * 0.55,
      r: 0.6 + Math.random() * 1.3,
      twinkle: Math.random() * Math.PI * 2,
    });
  }
  return out;
}

// Smooth ramp between two hours: 0 before `from`, 1 after `to`.
function ramp(hour, from, to) {
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
    return (DAY_START_HOUR + game.clock / 3600) % 24;
  }

  // 0 in daylight, 1 at full night. Dusk and dawn ease in and out.
  darkness(game) {
    const h = this.hourOf(game);
    if (h >= NIGHT_START || h < NIGHT_END) return 1;
    if (h >= DUSK_START && h < NIGHT_START) return ramp(h, DUSK_START, NIGHT_START) * 0.85;
    if (h >= NIGHT_END && h < DAWN_END) return 1 - ramp(h, NIGHT_END, DAWN_END);
    return 0;
  }

  // How warm the dusk light is: 0 by day, 1 at the orange hour.
  duskWarmth(game) {
    const h = this.hourOf(game);
    if (h >= DUSK_START && h < NIGHT_START) return ramp(h, DUSK_START, NIGHT_START);
    if (h >= NIGHT_END && h < DAWN_END) return 1 - ramp(h, NIGHT_END, DAWN_END);
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
    const dark = this.darkness(game);
    const dusk = this.duskWarmth(game);
    if (dark <= 0.01 && dusk <= 0.01) return;
    ctx.save();
    if (dusk > 0.01) {
      ctx.fillStyle = `rgba(255,110,40,${DUSK_ALPHA * dusk})`;
      ctx.fillRect(view.x, view.y, view.w, view.h);
    }
    if (dark > 0.01) {
      ctx.fillStyle = `rgba(8,12,38,${NIGHT.fullDarkAlpha * dark})`;
      ctx.fillRect(view.x, view.y, view.w, view.h);
      this.drawStars(ctx, view, dark);
      this.drawLampGlow(ctx, view, game, dark);
      this.drawHeadlights(ctx, game, dark);
    }
    ctx.restore();
  }

  drawStars(ctx, view, dark) {
    ctx.fillStyle = '#ffffff';
    for (const s of this.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(this.time * 2 + s.twinkle);
      ctx.globalAlpha = dark * twinkle;
      ctx.beginPath();
      ctx.arc(view.x + s.x * view.w, view.y + s.y * view.h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Street lamps bloom into warm pools of light after dark.
  drawLampGlow(ctx, view, game, dark) {
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
  drawHeadlights(ctx, game, dark) {
    const cars = [];
    if (game.playerCar) cars.push(game.playerCar);
    for (const car of game.traffic.cars) {
      if (car.police && !car.dead) cars.push(car);
    }
    for (const car of cars) {
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const noseX = car.x + fx * (car.w / 2);
      const noseY = car.y + fy * (car.h / 2);
      const reach = NIGHT.headlightReach;
      const spread = 0.42;
      const leftX = noseX + Math.cos(car.angle - spread) * reach;
      const leftY = noseY + Math.sin(car.angle - spread) * reach;
      const rightX = noseX + Math.cos(car.angle + spread) * reach;
      const rightY = noseY + Math.sin(car.angle + spread) * reach;
      ctx.fillStyle = `rgba(255,240,180,${0.13 * dark})`;
      ctx.beginPath();
      ctx.moveTo(noseX, noseY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.fill();
    }
  }
}
