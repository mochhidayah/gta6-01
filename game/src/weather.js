// Weather over Palmera Bay: clear skies, and sudden tropical
// downpours that roll in off Coral Bay.
//
// The weather is a slow state machine. It starts clear; every minute
// or two it rolls the dice, and sometimes the rain comes in for half
// a minute or so. Rain is visual only — streaks across the screen
// and a darker sky — so it never changes how the game plays, only
// how it feels. The HUD announces a change with a toast.
const CLEAR_MIN = 75; // seconds of clear sky before the next roll
const CLEAR_MAX = 150;
const RAIN_MIN = 25; // seconds a downpour lasts
const RAIN_MAX = 60;
const RAIN_CHANCE = 0.35; // odds the sky breaks after a clear spell
const DROP_COUNT = 140;

export class Weather {
  constructor() {
    this.state = 'clear'; // clear | rain
    this.timer = CLEAR_MIN + Math.random() * (CLEAR_MAX - CLEAR_MIN);
    this.intensity = 0; // 0 = dry, 1 = full downpour; ramps smoothly
    this.flash = 0; // lightning flash, fading out (0..1)
    this.flashTimer = 0;
    this.drops = [];
    for (let i = 0; i < DROP_COUNT; i++) {
      this.drops.push({ x: Math.random(), y: Math.random(), speed: 900 + Math.random() * 500 });
    }
  }

  // One frame: count down the current spell, maybe change the sky,
  // and ease the rain in or out.
  update(dt, game) {
    this.timer -= dt;
    if (this.timer <= 0) this.rollWeather(game);
    const target = this.state === 'rain' ? 1 : 0;
    const step = dt * 0.8;
    if (this.intensity < target) this.intensity = Math.min(target, this.intensity + step);
    else if (this.intensity > target) this.intensity = Math.max(target, this.intensity - step);
    for (const drop of this.drops) {
      drop.y += (drop.speed * dt) / 800;
      if (drop.y > 1) {
        drop.y = -0.05;
        drop.x = Math.random();
      }
    }
    // Lightning during a downpour: a rare flash, then a fast fade.
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
    if (this.state === 'rain') {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flashTimer = 6 + Math.random() * 14;
        this.flash = 0.55 + Math.random() * 0.3;
        game.sounds.thunder();
      }
    }
  }

  // The current spell ended: pick the next one.
  rollWeather(game) {
    if (this.state === 'clear') {
      if (Math.random() < RAIN_CHANCE) {
        this.state = 'rain';
        this.timer = RAIN_MIN + Math.random() * (RAIN_MAX - RAIN_MIN);
        game.toast('RAIN MOVING IN', 'A downpour rolls in off Coral Bay — drive careful.', 4);
      } else {
        this.state = 'clear';
        this.timer = CLEAR_MIN + Math.random() * (CLEAR_MAX - CLEAR_MIN);
      }
    } else {
      this.state = 'clear';
      this.timer = CLEAR_MIN + Math.random() * (CLEAR_MAX - CLEAR_MIN);
      game.toast('RAIN CLEARING', 'The storm passes — Palmera Bay dries out.', 4);
    }
  }

  get raining() {
    return this.state === 'rain';
  }

  // Paint the rain over the viewport: diagonal streaks whose opacity
  // follows the intensity, plus a dark tint while it pours — and a
  // lightning flash, fading fast, when the sky cracks.
  draw(ctx, view) {
    if (this.flash > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(230, 240, 255, ${this.flash * 0.35})`;
      ctx.fillRect(view.x, view.y, view.w, view.h);
      ctx.restore();
    }
    if (this.intensity <= 0.01) return;
    ctx.save();
    ctx.fillStyle = `rgba(20, 30, 60, ${0.12 * this.intensity})`;
    ctx.fillRect(view.x, view.y, view.w, view.h);
    ctx.strokeStyle = `rgba(180, 210, 255, ${0.45 * this.intensity})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const drop of this.drops) {
      const x = view.x + drop.x * view.w;
      const y = view.y + drop.y * view.h;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + 16);
    }
    ctx.stroke();
    ctx.restore();
  }
}
