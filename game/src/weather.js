// Weather over Palmera Bay: clear skies, and sudden tropical
// downpours that roll in off Coral Bay.
//
// The weather is a slow state machine. It starts clear; every minute
// or two it rolls the dice, and sometimes the rain comes in for half
// a minute or so. Rain is visual only — streaks across the screen
// and a darker sky — so it never changes how the game plays, only
// how it feels. The HUD announces a change with a toast. v4 rewrote
// this file wholesale — same spells, same timings, new structure.
// v6: a few internal names refreshed, behaviour identical.
const CALM_LO = 75; // seconds of clear sky before the next roll
const CALM_HI = 150;
const STORM_LO = 25; // seconds a downpour lasts
const STORM_HI = 60;
const STORM_ODDS = 0.35; // odds the sky breaks after a clear spell
const MIST_ODDS = 0.25; // odds the bay fog rolls in instead
const MIST_LO = 30; // seconds the fog hangs around
const MIST_HI = 75;
const DROP_COUNT = 140;

export class Weather {
  constructor() {
    this.state = 'clear'; // clear | rain | fog
    this.timer = CALM_LO + Math.random() * (CALM_HI - CALM_LO);
    this.intensity = 0; // 0 = dry, 1 = full downpour; ramps smoothly
    this.fog = 0; // 0 = clear air, 1 = thick bay fog; ramps smoothly
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
    if (this.timer <= 0) this.pickSky(game);
    const target = this.state === 'rain' ? 1 : 0;
    const step = dt * 0.8;
    if (this.intensity < target) this.intensity = Math.min(target, this.intensity + step);
    else if (this.intensity > target) this.intensity = Math.max(target, this.intensity - step);
    const mistGoal = this.state === 'fog' ? 1 : 0;
    if (this.fog < mistGoal) this.fog = Math.min(mistGoal, this.fog + dt * 0.5);
    else if (this.fog > mistGoal) this.fog = Math.max(mistGoal, this.fog - dt * 0.5);
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
  pickSky(game) {
    if (this.state === 'clear') {
      const roll = Math.random();
      if (roll < STORM_ODDS) {
        this.state = 'rain';
        this.timer = STORM_LO + Math.random() * (STORM_HI - STORM_LO);
        game.toast('RAIN MOVING IN', 'A downpour rolls in off Coral Bay — drive careful.', 4);
      } else if (roll < STORM_ODDS + MIST_ODDS) {
        this.state = 'fog';
        this.timer = MIST_LO + Math.random() * (MIST_HI - MIST_LO);
        game.toast('BAY FOG', 'Thick fog rolls off the water — watch the road, not the sky.', 4);
      } else {
        this.state = 'clear';
        this.timer = CALM_LO + Math.random() * (CALM_HI - CALM_LO);
      }
    } else {
      this.state = 'clear';
      this.timer = CALM_LO + Math.random() * (CALM_HI - CALM_LO);
      game.toast('SKY CLEARING', 'The weather lifts — Palmera Bay dries out.', 4);
    }
  }

  get raining() {
    return this.state === 'rain';
  }

  // Paint the rain over the viewport: diagonal streaks whose opacity
  // follows the intensity, plus a dark tint while it pours — and a
  // lightning flash, fading fast, when the sky cracks. Fog is a
  // pale wash that drifts: slow blobs of grey over the streets.
  draw(ctx, view) {
    if (this.flash > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(230, 240, 255, ${this.flash * 0.35})`;
      ctx.fillRect(view.x, view.y, view.w, view.h);
      ctx.restore();
    }
    if (this.fog > 0.01) {
      ctx.save();
      ctx.fillStyle = `rgba(200, 210, 220, ${0.22 * this.fog})`;
      ctx.fillRect(view.x, view.y, view.w, view.h);
      ctx.fillStyle = `rgba(220, 228, 235, ${0.1 * this.fog})`;
      const now = Date.now() / 1000;
      for (let i = 0; i < 5; i++) {
        const ox = view.x + ((i * 397 + now * 12) % (view.w + 300)) - 150;
        const oy = view.y + ((i * 211) % view.h);
        ctx.beginPath();
        ctx.ellipse(ox, oy, 260, 90, 0, 0, Math.PI * 2);
        ctx.fill();
      }
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
