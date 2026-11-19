// Palmera Bay cutscenes — short scripted scenes with camera pans, dialogue
// and code-drawn character portraits. No image assets: every portrait is
// vector art drawn on a small canvas at runtime.
//
// Wiring (main.js): const scenes = new Cutscenes(game); scenes.play('intro')
// on a new game, scenes.playBriefing(missionIndex) when a mission starts;
// scenes.update(dt) every frame; scenes.draw(ctx) after the world. While a
// scene plays, game.cutsceneActive is true and main.js skips player input
// and police updates, so the scene is never interrupted by gameplay.
//
// A scene is a list of shots. Each shot: { cam: {x, y, zoom}, dur, lines }
// and each line: { who, text }. The camera lerps between shots while the
// dialogue types out letter by letter; E or click advances.

// ---------------------------------------------------------------------------
// Characters. Portraits are drawn from these specs: skin tone, hair style
// and colour, and one signature feature each.
// ---------------------------------------------------------------------------

const CHARACTERS = {
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

// Dialogue is keyed by mission index (0-based). Missions without a scripted
// briefing fall back to the generic Rico call below.
const BRIEFINGS = {
  0: [
    { who: 'rico', text: 'First job, kid. You need wheels — lift any car off the street and bring it to Solano Garage.' },
    { who: 'marco', text: 'Steal a car. Day one. You really know how to welcome a guy home.' },
    { who: 'rico', text: 'Welcome to Palmera Bay. The garage pays for the car — the city pays for everything else.' },
  ],
  1: [
    { who: 'lucia', text: 'Marco! You made it. The club needs a driver tonight — Lucia, remember?' },
    { who: 'marco', text: 'I remember. One condition: you pay me before the cops show up this time.' },
    { who: 'lucia', text: 'Deal. Pick me up at the marina and drive like the city is watching. Because it is.' },
  ],
  3: [
    { who: 'rico', text: 'A package for the Golden Palm Pawn, and the clock is running. One piece, no detours.' },
    { who: 'marco', text: 'A package. Right. And if it ticks?' },
    { who: 'rico', text: 'Then you drive faster.' },
  ],
  4: [
    { who: 'rico', text: 'The bank on Coral Avenue. In, out, six seconds inside the ring. No heroes.' },
    { who: 'marco', text: 'Six seconds is nothing. Getting out is the job.' },
    { who: 'rico', text: 'Then drive like you mean it. The whole city will be awake in a minute.' },
  ],
  6: [
    { who: 'dana', text: 'That van is your ticket out, Marco. Keys are in it. Cops are everywhere.' },
    { who: 'marco', text: 'When are they not?' },
    { who: 'dana', text: 'Ha. Lose them, and the boat leaves with or without you.' },
  ],
  7: [
    { who: 'rico', text: 'Four stops, one night, no excuses. The couriers are sick and you are the only driver I trust.' },
    { who: 'marco', text: 'Flattery gets you nowhere, Rico.' },
    { who: 'rico', text: 'It got you four stops. Move.' },
  ],
  8: [
    { who: 'vex', text: 'Turf War, pretty boy. My Sharks against your little crew. Six of mine stand between you and this street.' },
    { who: 'marco', text: 'Six? I was hoping for a challenge.' },
  ],
  9: [
    { who: 'rico', text: 'The Last Debt. Steal the Midnight Van, pick up the crew, rob the docks warehouse. Then we are even.' },
    { who: 'marco', text: 'Even? Rico, after tonight, you owe ME.' },
  ],
  10: [
    { who: 'dana', text: 'Street King. Stadium pad, three rivals, four checkpoints. Win it and the whole city knows your name.' },
    { who: 'marco', text: 'They already know my name, Dana. Tonight they will spell it right.' },
  ],
  11: [
    { who: 'vex', text: 'You humiliated my Vipers at the docks once. Payback is six of my best waiting for you there.' },
    { who: 'marco', text: 'Six more. Send eight next time.' },
  ],
  12: [
    { who: 'lucia', text: 'Clean Slate, Marco. Steal the Coral Coupe, reach the airport, and this city forgets your name.' },
    { who: 'marco', text: 'Let it forget. I am done being remembered by the wrong people.' },
  ],
};

const GENERIC_BRIEFING = [
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
        { who: 'marco', text: 'Three years away. The city looks the same — same sun, same trouble.' },
      ],
    },
    {
      cam: { x: 1600, y: 900 },
      dur: 4,
      lines: [
        { who: 'lucia', text: 'Marco! Over here! You look terrible. I mean that lovingly.' },
        { who: 'marco', text: 'You look rich. I mean that jealously.' },
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

// Draw a character portrait on a 2D canvas context, centred at (x, y),
// inside a square of `size` pixels. All vector shapes, no images.
export function drawPortrait(ctx, id, x, y, size) {
  const c = CHARACTERS[id] || CHARACTERS.marco;
  const s = size;
  const hx = x;
  const hy = y;
  ctx.save();
  ctx.translate(hx, hy);
  // Backdrop disc.
  ctx.fillStyle = '#20242e';
  ctx.beginPath();
  ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f5c542';
  ctx.lineWidth = Math.max(2, s / 28);
  ctx.stroke();
  // Shoulders.
  ctx.fillStyle = id === 'lucia' ? '#8e2f5c' : id === 'kane' ? '#1d3a5c' : id === 'vex' ? '#3d1d1d' : '#2e4a2e';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.32, s * 0.34, s * 0.2, 0, Math.PI, 0);
  ctx.fill();
  // Head.
  ctx.fillStyle = c.skin;
  ctx.beginPath();
  ctx.arc(0, -s * 0.05, s * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // Hair.
  ctx.fillStyle = c.hair;
  if (c.hairStyle === 'long') {
    ctx.beginPath();
    ctx.arc(0, -s * 0.1, s * 0.23, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-s * 0.23, -s * 0.1, s * 0.09, s * 0.34);
    ctx.fillRect(s * 0.14, -s * 0.1, s * 0.09, s * 0.34);
  } else if (c.hairStyle === 'mohawk') {
    ctx.fillRect(-s * 0.04, -s * 0.36, s * 0.08, s * 0.16);
    ctx.fillRect(-s * 0.09, -s * 0.3, s * 0.05, s * 0.1);
    ctx.fillRect(s * 0.04, -s * 0.3, s * 0.05, s * 0.1);
  } else if (c.hairStyle === 'bun') {
    ctx.beginPath();
    ctx.arc(0, -s * 0.28, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -s * 0.1, s * 0.22, Math.PI, 0);
    ctx.fill();
  } else if (c.hairStyle === 'slick') {
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.14, s * 0.2, s * 0.1, 0, Math.PI, 0);
    ctx.fill();
  } else if (c.hairStyle === 'flat') {
    ctx.fillRect(-s * 0.2, -s * 0.28, s * 0.4, s * 0.08);
  } else {
    // short
    ctx.beginPath();
    ctx.arc(0, -s * 0.11, s * 0.21, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
  }
  // Eyes.
  ctx.fillStyle = '#141414';
  ctx.beginPath();
  ctx.arc(-s * 0.08, -s * 0.04, s * 0.022, 0, Math.PI * 2);
  ctx.arc(s * 0.08, -s * 0.04, s * 0.022, 0, Math.PI * 2);
  ctx.fill();
  // Mouth.
  ctx.strokeStyle = '#5c2e1e';
  ctx.lineWidth = Math.max(1.5, s / 40);
  ctx.beginPath();
  ctx.arc(0, s * 0.05, s * 0.07, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  // Signature feature.
  if (c.feature === 'stubble') {
    ctx.fillStyle = 'rgba(20,12,8,0.35)';
    ctx.beginPath();
    ctx.arc(0, s * 0.08, s * 0.13, 0, Math.PI);
    ctx.fill();
  } else if (c.feature === 'earring') {
    ctx.fillStyle = '#f5c542';
    ctx.beginPath();
    ctx.arc(-s * 0.2, s * 0.02, s * 0.025, 0, Math.PI * 2);
    ctx.fill();
  } else if (c.feature === 'scar') {
    ctx.strokeStyle = '#7a2e2e';
    ctx.lineWidth = Math.max(1.5, s / 36);
    ctx.beginPath();
    ctx.moveTo(s * 0.1, -s * 0.16);
    ctx.lineTo(s * 0.05, s * 0.02);
    ctx.stroke();
  } else if (c.feature === 'goggles') {
    ctx.strokeStyle = '#c98d2e';
    ctx.lineWidth = Math.max(2, s / 30);
    ctx.beginPath();
    ctx.arc(0, -s * 0.24, s * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  } else if (c.feature === 'tattoo') {
    ctx.fillStyle = '#1d5c2e';
    ctx.beginPath();
    ctx.arc(s * 0.16, s * 0.08, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  } else if (c.feature === 'badge') {
    ctx.fillStyle = '#f5c542';
    ctx.beginPath();
    ctx.moveTo(-s * 0.18, s * 0.28);
    ctx.lineTo(-s * 0.12, s * 0.22);
    ctx.lineTo(-s * 0.12, s * 0.34);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export class Cutscenes {
  constructor(game) {
    this.game = game;
    this.active = null; // { shots, shotIndex, lineIndex, charsShown, shotT, done }
    this.onDone = null;
    this._buildDom();
    this._bindKeys();
  }

  _buildDom() {
    // Letterbox bars.
    this.barTop = document.createElement('div');
    this.barTop.style.cssText = 'position:fixed;left:0;right:0;top:0;height:0;background:#000;z-index:60;transition:height .3s;';
    this.barBottom = document.createElement('div');
    this.barBottom.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:0;background:#000;z-index:60;transition:height .3s;';
    document.body.appendChild(this.barTop);
    document.body.appendChild(this.barBottom);
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
    this.boxName = this.box.querySelector('.cs-name');
    this.boxText = this.box.querySelector('.cs-text');
    this.boxCanvas = this.box.querySelector('canvas');
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyE' && this.active) this.advance();
    });
  }

  play(sceneId) {
    if (sceneId === 'intro') {
      this._start(INTRO.shots, INTRO.title, null);
    }
  }

  playBriefing(missionIndex) {
    const lines = BRIEFINGS[missionIndex] || GENERIC_BRIEFING;
    const shots = [{ cam: null, dur: 3.5, lines }];
    this._start(shots, null, null);
  }

  _start(shots, title, done) {
    this.active = {
      shots,
      shotIndex: 0,
      lineIndex: 0,
      charsShown: 0,
      shotT: 0,
      title,
      camFrom: null,
    };
    this.onDone = done;
    this.game.cutsceneActive = true;
    this.barTop.style.height = '56px';
    this.barBottom.style.height = '56px';
    this.box.style.display = 'block';
    this._showLine();
  }

  _currentShot() {
    return this.active.shots[this.active.shotIndex];
  }

  _currentLine() {
    const shot = this._currentShot();
    return shot.lines[this.active.lineIndex];
  }

  _showLine() {
    const line = this._currentLine();
    const ch = CHARACTERS[line.who] || CHARACTERS.marco;
    this.boxName.textContent = `${ch.name} — ${ch.role}`;
    this.boxText.textContent = '';
    this.active.charsShown = 0;
    const ctx = this.boxCanvas.getContext('2d');
    ctx.clearRect(0, 0, 72, 72);
    drawPortrait(ctx, line.who, 36, 38, 68);
  }

  advance() {
    if (!this.active) return;
    const line = this._currentLine();
    if (this.active.charsShown < line.text.length) {
      // First press: reveal the whole line at once.
      this.active.charsShown = line.text.length;
      this.boxText.textContent = line.text;
      return;
    }
    const shot = this._currentShot();
    this.active.lineIndex += 1;
    this.active.charsShown = 0;
    if (this.active.lineIndex >= shot.lines.length) {
      this.active.shotIndex += 1;
      this.active.lineIndex = 0;
      if (this.active.shotIndex >= this.active.shots.length) {
        this._end();
        return;
      }
    }
    this._showLine();
  }

  _end() {
    const done = this.onDone;
    this.active = null;
    this.onDone = null;
    this.game.cutsceneActive = false;
    this.barTop.style.height = '0';
    this.barBottom.style.height = '0';
    this.box.style.display = 'none';
    if (typeof done === 'function') done();
  }

  skip() {
    if (this.active) this._end();
  }

  isPlaying() {
    return !!this.active;
  }

  update(dt) {
    if (!this.active) return;
    const shot = this._currentShot();
    const line = this._currentLine();
    // Typewriter: 45 characters a second.
    if (this.active.charsShown < line.text.length) {
      this.active.charsShown = Math.min(
        line.text.length,
        this.active.charsShown + dt * 45,
      );
      this.boxText.textContent = line.text.slice(0, Math.floor(this.active.charsShown));
    }
    // Camera: lerp toward the shot's target while the shot lasts.
    this.active.shotT += dt;
    const cam = shot.cam;
    const renderer = this.game.renderer;
    if (cam && renderer && renderer.cam) {
      const k = 1 - Math.exp(-dt * 1.6);
      renderer.cam.x += (cam.x - 640 - renderer.cam.x) * k;
      renderer.cam.y += (cam.y - 400 - renderer.cam.y) * k;
    }
    // Auto-advance a shot whose lines are all shown and whose time is up.
    if (this.active.shotT > shot.dur + shot.lines.length * 2.5) {
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
}
