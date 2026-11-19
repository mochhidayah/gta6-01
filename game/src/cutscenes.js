// Palmera Bay cutscenes — short scripted scenes with camera pans,
// dialogue and portraits drawn in code. No image assets anywhere: every
// face is vector art painted on a small canvas at runtime.
//
// v6 rewrote this file end to end: new dialogue, new structure, new
// internal names. The scenes play exactly as before — same shots, same
// camera targets, same mission briefings in the same order.
//
// Wiring (main.js): `new Cutscenes(game)` once, `scenes.play('intro')`
// on a new game, `scenes.playBriefing(missionIndex)` when a mission
// starts, `scenes.update(dt)` every frame, `scenes.drawTitle(ctx, w, h)`
// from the renderer. While a scene plays, game.cutsceneActive is true
// and main.js skips player input and police updates, so nothing can
// interrupt the scene.
//
// A scene is a list of shots. Each take: { cam: {x, y, zoom}, dur, lines }
// and each cue: { who, text }. The camera drifts between shots while
// the dialogue types out letter by letter; E or a click advances.

// ---------------------------------------------------------------------------
// The cast. Portraits are painted from these specs: skin tone, hair style
// and colour, and one signature feature each.
// ---------------------------------------------------------------------------

const PEOPLE = {
  marco: {
    name: 'Marco',
    role: 'You — fresh off the boat',
    skin: '#c98d64', hair: '#1c1410', hairStyle: 'short', feature: 'stubble',
  },
  lucia: {
    name: 'Lucia',
    role: 'Club Flamingo — the voice of the night',
    skin: '#e8b08a', hair: '#3a1c0d', hairStyle: 'long', feature: 'earring',
  },
  rico: {
    name: 'Rico',
    role: 'Fixer — everybody owes him a favour',
    skin: '#a9714b', hair: '#0d0d0d', hairStyle: 'slick', feature: 'scar',
  },
  dana: {
    name: 'Dana',
    role: 'Mechanic — she built half the cars in town',
    skin: '#d9a06f', hair: '#7a2e12', hairStyle: 'bun', feature: 'goggles',
  },
  vex: {
    name: 'Vex',
    role: 'Sharks — the crew that owns the docks',
    skin: '#b98a5e', hair: '#e8e8e8', hairStyle: 'mohawk', feature: 'tattoo',
  },
  kane: {
    name: 'Officer Kane',
    role: 'Palmera PD — not as clean as his uniform',
    skin: '#8a5f3d', hair: '#111111', hairStyle: 'flat', feature: 'badge',
  },
};

// Mission briefings, keyed by mission index (0-based). Missions without
// a scripted briefing fall back to the generic Rico call below.
const BRIEFINGS = {
  0: [
    { who: 'rico', text: 'First job, kid. You need wheels — lift any car off the street and bring it to Solano Garage.' },
    { who: 'marco', text: 'Steal a car. Day one. Some welcome home this is.' },
    { who: 'rico', text: 'Welcome to Palmera Bay. The garage pays for the car — the city charges for everything else.' },
  ],
  1: [
    { who: 'lucia', text: 'Marco! You actually came. The club needs a driver tonight — Lucia, remember?' },
    { who: 'marco', text: 'Hard to forget. One rule: you pay me before the cops turn up this time.' },
    { who: 'lucia', text: 'Done. Pick me up at the marina and drive like the whole city is watching. It is.' },
  ],
  3: [
    { who: 'rico', text: 'A package for the Golden Palm Pawn, and the clock is already running. One piece, no detours.' },
    { who: 'marco', text: 'A package. Sure. And if it starts ticking?' },
    { who: 'rico', text: 'Then you drive faster than the ticking.' },
  ],
  4: [
    { who: 'rico', text: 'The bank on Coral Avenue. In, out, six seconds inside the ring. No heroes, Marco.' },
    { who: 'marco', text: 'Six seconds is easy. Getting out again is the actual job.' },
    { who: 'rico', text: 'Then drive like you mean it. The whole city wakes up in about a minute.' },
  ],
  6: [
    { who: 'dana', text: 'That van is your way out, Marco. Keys are in it. Cops are everywhere, obviously.' },
    { who: 'marco', text: 'When are they not, Dana?' },
    { who: 'dana', text: 'Ha. Lose them, and the boat leaves with or without you on it.' },
  ],
  7: [
    { who: 'rico', text: 'Four stops, one night, no excuses. The couriers are all sick and you are the only driver I trust.' },
    { who: 'marco', text: 'Flattery gets you nowhere, Rico.' },
    { who: 'rico', text: 'It just got you four stops. Move.' },
  ],
  8: [
    { who: 'vex', text: 'Turf War, pretty boy. My Sharks against your little crew. Six of mine are standing between you and this street.' },
    { who: 'marco', text: 'Six? I was hoping for something that would keep me awake.' },
  ],
  9: [
    { who: 'rico', text: 'The Last Debt. Steal the Midnight Van, pick up the crew, rob the docks warehouse. After tonight, we are even.' },
    { who: 'marco', text: 'Even? Rico, after tonight YOU owe ME.' },
  ],
  10: [
    { who: 'dana', text: 'Street King. Stadium pad, three rivals, four checkpoints. Win it and the whole city learns your name.' },
    { who: 'marco', text: 'They already know it, Dana. Tonight they learn to spell it.' },
  ],
  11: [
    { who: 'vex', text: 'You embarrassed my Vipers at the docks once. Payback is six of my best waiting for you there.' },
    { who: 'marco', text: 'Six more. Tell them to bring eight next time.' },
  ],
  12: [
    { who: 'lucia', text: 'Clean Slate, Marco. Steal the Coral Coupe, reach the airport, and this city forgets your name.' },
    { who: 'marco', text: 'Let it forget. I am done being remembered by the wrong people.' },
  ],
};

const FALLBACK_SCRIPT = [
  { who: 'rico', text: 'New job, Marco. The details are on your tracker — do it clean, do it fast.' },
  { who: 'marco', text: 'Clean and fast. My two favourite words.' },
];

const INTRO = {
  title: 'PALMERA BAY',
  shots: [
    {
      cam: { x: 400, y: 2400 },
      dur: 4,
      lines: [
        { who: 'marco', text: 'Three years away. The city looks the same — same sun, same trouble, same smell of salt and petrol.' },
      ],
    },
    {
      cam: { x: 1600, y: 900 },
      dur: 4,
      lines: [
        { who: 'lucia', text: 'Marco! Over here! You look terrible. I say that with love.' },
        { who: 'marco', text: 'You look rich. I say that with envy.' },
      ],
    },
    {
      cam: { x: 900, y: 1400 },
      dur: 4,
      lines: [
        { who: 'rico', text: 'Welcome home, kid. The Sharks run the docks, the Vipers run the streets, and I run the jobs.' },
        { who: 'rico', text: 'You need money, I need a driver. Let us not pretend this is complicated.' },
      ],
    },
  ],
};

// Paint a character portrait on a 2D canvas context, centred at (x, y),
// inside a square of `size` pixels. All vector shapes, no images.
export function drawPortrait(ctx, id, x, y, size) {
  const person = PEOPLE[id] || PEOPLE.marco;
  const u = size;
  ctx.save();
  ctx.translate(x, y);
  // Backdrop disc.
  ctx.fillStyle = '#20242e';
  ctx.beginPath();
  ctx.arc(0, 0, u / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f5c542';
  ctx.lineWidth = Math.max(2, u / 28);
  ctx.stroke();
  // Shoulders.
  ctx.fillStyle = id === 'lucia' ? '#8e2f5c' : id === 'kane' ? '#1d3a5c' : id === 'vex' ? '#3d1d1d' : '#2e4a2e';
  ctx.beginPath();
  ctx.ellipse(0, u * 0.32, u * 0.34, u * 0.2, 0, Math.PI, 0);
  ctx.fill();
  // Head.
  ctx.fillStyle = person.skin;
  ctx.beginPath();
  ctx.arc(0, -u * 0.05, u * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // Hair.
  ctx.fillStyle = person.hair;
  if (person.hairStyle === 'long') {
    ctx.beginPath();
    ctx.arc(0, -u * 0.1, u * 0.23, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-u * 0.23, -u * 0.1, u * 0.09, u * 0.34);
    ctx.fillRect(u * 0.14, -u * 0.1, u * 0.09, u * 0.34);
  } else if (person.hairStyle === 'mohawk') {
    ctx.fillRect(-u * 0.04, -u * 0.36, u * 0.08, u * 0.16);
    ctx.fillRect(-u * 0.09, -u * 0.3, u * 0.05, u * 0.1);
    ctx.fillRect(u * 0.04, -u * 0.3, u * 0.05, u * 0.1);
  } else if (person.hairStyle === 'bun') {
    ctx.beginPath();
    ctx.arc(0, -u * 0.28, u * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -u * 0.1, u * 0.22, Math.PI, 0);
    ctx.fill();
  } else if (person.hairStyle === 'slick') {
    ctx.beginPath();
    ctx.ellipse(0, -u * 0.14, u * 0.2, u * 0.1, 0, Math.PI, 0);
    ctx.fill();
  } else if (person.hairStyle === 'flat') {
    ctx.fillRect(-u * 0.2, -u * 0.28, u * 0.4, u * 0.08);
  } else {
    // short
    ctx.beginPath();
    ctx.arc(0, -u * 0.11, u * 0.21, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
  }
  // Eyes.
  ctx.fillStyle = '#141414';
  ctx.beginPath();
  ctx.arc(-u * 0.08, -u * 0.04, u * 0.022, 0, Math.PI * 2);
  ctx.arc(u * 0.08, -u * 0.04, u * 0.022, 0, Math.PI * 2);
  ctx.fill();
  // Mouth.
  ctx.strokeStyle = '#5c2e1e';
  ctx.lineWidth = Math.max(1.5, u / 40);
  ctx.beginPath();
  ctx.arc(0, u * 0.05, u * 0.07, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  // Signature feature.
  if (person.feature === 'stubble') {
    ctx.fillStyle = 'rgba(20,12,8,0.35)';
    ctx.beginPath();
    ctx.arc(0, u * 0.08, u * 0.13, 0, Math.PI);
    ctx.fill();
  } else if (person.feature === 'earring') {
    ctx.fillStyle = '#f5c542';
    ctx.beginPath();
    ctx.arc(-u * 0.2, u * 0.02, u * 0.025, 0, Math.PI * 2);
    ctx.fill();
  } else if (person.feature === 'scar') {
    ctx.strokeStyle = '#7a2e2e';
    ctx.lineWidth = Math.max(1.5, u / 36);
    ctx.beginPath();
    ctx.moveTo(u * 0.1, -u * 0.16);
    ctx.lineTo(u * 0.05, u * 0.02);
    ctx.stroke();
  } else if (person.feature === 'goggles') {
    ctx.strokeStyle = '#c98d2e';
    ctx.lineWidth = Math.max(2, u / 30);
    ctx.beginPath();
    ctx.arc(0, -u * 0.24, u * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  } else if (person.feature === 'tattoo') {
    ctx.fillStyle = '#1d5c2e';
    ctx.beginPath();
    ctx.arc(u * 0.16, u * 0.08, u * 0.04, 0, Math.PI * 2);
    ctx.fill();
  } else if (person.feature === 'badge') {
    ctx.fillStyle = '#f5c542';
    ctx.beginPath();
    ctx.moveTo(-u * 0.18, u * 0.28);
    ctx.lineTo(-u * 0.12, u * 0.22);
    ctx.lineTo(-u * 0.12, u * 0.34);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export class Cutscenes {
  constructor(game) {
    this.game = game;
    this.active = null; // { shots, take, cue, shown, takeT, done }
    this.onDone = null;
    this._makeStage();
    this._bindKeys();
  }

  // -- public ---------------------------------------------------------------

  play(sceneId) {
    if (sceneId === 'intro') {
      this._start(INTRO.shots, INTRO.title, null);
    }
  }

  playBriefing(missionIndex) {
    const lines = BRIEFINGS[missionIndex] || FALLBACK_SCRIPT;
    const shots = [{ cam: null, dur: 3.5, lines }];
    this._start(shots, null, null);
  }

  advance() {
    if (!this.active) return;
    const cue = this._cueNow();
    if (this.active.shown < cue.text.length) {
      // First press: reveal the whole cue at once.
      this.active.shown = cue.text.length;
      this.textEl.textContent = cue.text;
      return;
    }
    const take = this._takeNow();
    this.active.cue += 1;
    this.active.shown = 0;
    if (this.active.cue >= take.lines.length) {
      this.active.take += 1;
      this.active.cue = 0;
      if (this.active.take >= this.active.shots.length) {
        this._end();
        return;
      }
    }
    this._showLine();
  }

  skip() {
    if (this.active) this._end();
  }

  isPlaying() {
    return !!this.active;
  }

  update(dt) {
    if (!this.active) return;
    const take = this._takeNow();
    const cue = this._cueNow();
    // Typewriter: 45 characters a second.
    if (this.active.shown < cue.text.length) {
      this.active.shown = Math.min(
        cue.text.length,
        this.active.shown + dt * 45,
      );
      this.textEl.textContent = cue.text.slice(0, Math.floor(this.active.shown));
    }
    // Camera: drift toward the take's target while the take lasts.
    this.active.takeT += dt;
    const cam = take.cam;
    const renderer = this.game.renderer;
    if (cam && renderer && renderer.cam) {
      const k = 1 - Math.exp(-dt * 1.6);
      renderer.cam.x += (cam.x - 640 - renderer.cam.x) * k;
      renderer.cam.y += (cam.y - 400 - renderer.cam.y) * k;
    }
    // Auto-advance a take whose lines are all shown and whose time is up.
    if (this.active.takeT > take.dur + take.lines.length * 2.5) {
      this.advance();
    }
  }

  // Drawn by the renderer after the world: title card for the intro.
  drawTitle(ctx, w, h) {
    if (!this.active || !this.active.title) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, h * 0.3, w, 110);
    ctx.fillStyle = '#f5c542';
    ctx.font = 'bold 52px ui-monospace, monospace';
    ctx.fillText(this.active.title, w / 2, h * 0.3 + 62);
    ctx.fillStyle = '#fff';
    ctx.font = '16px ui-monospace, monospace';
    ctx.fillText('A Palmera Bay story — an original open-world crime game', w / 2, h * 0.3 + 92);
    ctx.restore();
  }

  // -- internals ------------------------------------------------------------

  _makeStage() {
    // Letterbox bars.
    this.topBar = document.createElement('div');
    this.topBar.style.cssText = 'position:fixed;left:0;right:0;top:0;height:0;background:#000;z-index:60;transition:height .3s;';
    this.bottomBar = document.createElement('div');
    this.bottomBar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:0;background:#000;z-index:60;transition:height .3s;';
    document.body.appendChild(this.topBar);
    document.body.appendChild(this.bottomBar);
    // Dialogue box.
    this.box = document.createElement('div');
    this.box.style.cssText =
      'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:61;' +
      'width:min(680px,86vw);background:rgba(6,8,14,.88);border:1px solid rgba(245,197,66,.5);' +
      'border-radius:10px;padding:12px 16px 12px 96px;min-height:84px;display:none;' +
      'font-family:ui-monospace,Menlo,Consolas,monospace;color:#fff;cursor:pointer;';
    this.box.innerHTML =
      '<canvas width="72" height="72" style="position:absolute;left:10px;top:10px;border-radius:50%"></canvas>' +
      '<div class="cs-name" style="color:#f5c542;font-weight:700;font-size:13px;letter-spacing:1px"></div>' +
      '<div class="cs-text" style="font-size:14px;line-height:1.5;margin-top:4px"></div>' +
      '<div class="cs-hint" style="font-size:11px;opacity:.55;text-align:right;margin-top:4px">E / click — continue</div>';
    this.box.addEventListener('click', () => this.advance());
    document.body.appendChild(this.box);
    this.nameEl = this.box.querySelector('.cs-name');
    this.textEl = this.box.querySelector('.cs-text');
    this.faceCanvas = this.box.querySelector('canvas');
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyE' && this.active) this.advance();
    });
  }

  _start(shots, title, done) {
    this.active = {
      shots,
      take: 0,
      cue: 0,
      shown: 0,
      takeT: 0,
      title,
      fromCam: null,
    };
    this.onDone = done;
    this.game.cutsceneActive = true;
    this.topBar.style.height = '56px';
    this.bottomBar.style.height = '56px';
    this.box.style.display = 'block';
    this._showLine();
  }

  _takeNow() {
    return this.active.shots[this.active.take];
  }

  _cueNow() {
    const take = this._takeNow();
    return take.lines[this.active.cue];
  }

  _showLine() {
    const cue = this._cueNow();
    const ch = PEOPLE[cue.who] || PEOPLE.marco;
    this.nameEl.textContent = `${ch.name} — ${ch.role}`;
    this.textEl.textContent = '';
    this.active.shown = 0;
    const ctx = this.faceCanvas.getContext('2d');
    ctx.clearRect(0, 0, 72, 72);
    drawPortrait(ctx, cue.who, 36, 38, 68);
  }

  _end() {
    const done = this.onDone;
    this.active = null;
    this.onDone = null;
    this.game.cutsceneActive = false;
    this.topBar.style.height = '0';
    this.bottomBar.style.height = '0';
    this.box.style.display = 'none';
    if (typeof done === 'function') done();
  }
}
