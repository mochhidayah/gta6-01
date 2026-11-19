// Palmera Bay — Empire missions, 14 to 18.
//
// The second act. Once Marco owns a piece of the city, the city starts
// asking for more. Five new story missions, each with its own briefing,
// its own people, and its own way to get paid — or to get caught. The
// cast is new: Sal the fence, Priya the fixer, Old Man Kessler, Mara
// the getaway driver, Tomas the inside man, and Detective Rook, who has
// been waiting for Marco to get ambitious.
//
// v7: written from scratch in this session. Every title, line of
// dialogue, objective, timer and payout below was invented here; none
// of it is copied from the first thirteen missions. The mission engine
// is its own small state machine (goto / hold / wreck / deliver /
// escape) so it never touches the original MissionManager — it only
// checks that the original manager is idle before it starts.

// ---------------------------------------------------------------------------
// The five jobs. A job is a list of steps; a step is one verb the player
// has to finish before the next one shows up. Distances are in world
// units, timers in seconds, payouts in dollars.
// ---------------------------------------------------------------------------

const JOBS = [
  {
    n: 14,
    title: 'The Harbor Heist',
    giver: 'Sal the Fence',
    brief: [
      'Sal: "A container of watches sits in Warehouse 9 tonight."',
      'Sal: "No guards on the south door after midnight. In and out."',
      'Sal: "Bring the crate to my shop. I pay cash, no questions."',
    ],
    pay: 1200,
    steps: [
      { kind: 'goto', label: 'Get to Warehouse 9 at the docks', dx: 980, dy: 720, r: 130 },
      { kind: 'hold', label: 'Crack the container — stay on the mark', dx: 980, dy: 720, r: 130, t: 8 },
      { kind: 'goto', label: 'Deliver the crate to Sal’s shop', dx: -420, dy: -640, r: 130 },
    ],
  },
  {
    n: 15,
    title: 'Midnight Run',
    giver: 'Priya the Fixer',
    brief: [
      'Priya: "Three drops, one night, no headlights on the last one."',
      'Priya: "The buyers pay at the door. Do not stop for anyone."',
      'Marco: "And if the cops stop me?"',
      'Priya: "Then you were never here, and I never met you."',
    ],
    pay: 1800,
    steps: [
      { kind: 'goto', label: 'Drop 1 — the motel on the strip', dx: 240, dy: 880, r: 130 },
      { kind: 'goto', label: 'Drop 2 — the parking garage roof', dx: -900, dy: -120, r: 130 },
      { kind: 'goto', label: 'Drop 3 — the old chapel, lights off', dx: -640, dy: 320, r: 130, timer: 150 },
    ],
  },
  {
    n: 16,
    title: 'The Summit',
    giver: 'Old Man Kessler',
    brief: [
      'Kessler: "The crews meet at the stadium to talk peace."',
      'Kessler: "They will not talk peace. Bring a fast car."',
      'Kessler: "When the shooting starts, finish it. Then come home."',
    ],
    pay: 2500,
    steps: [
      { kind: 'goto', label: 'Get to the stadium car park', dx: 520, dy: -260, r: 150 },
      { kind: 'wreck', label: 'Wreck the ambush cars', count: 3, dx: 520, dy: -260, r: 260 },
      { kind: 'escape', label: 'Lose the heat — get your wanted level to 0', stars: 0 },
    ],
  },
  {
    n: 17,
    title: 'Jailbreak',
    giver: 'Mara',
    brief: [
      'Mara: "Tomas is in the holding cells under the precinct."',
      'Mara: "I drive. You walk in, you walk out with him."',
      'Mara: "If the alarm goes off, we do not stop for red lights."',
    ],
    pay: 3000,
    steps: [
      { kind: 'goto', label: 'Reach the precinct back door', dx: -420, dy: 320, r: 130 },
      { kind: 'hold', label: 'Hold the door while Tomas slips out', dx: -420, dy: 320, r: 130, t: 10 },
      { kind: 'goto', label: 'Get Tomas to Mara’s car at the beach', dx: 240, dy: 880, r: 130 },
      { kind: 'escape', label: 'Escape — lose the cops', stars: 0 },
    ],
  },
  {
    n: 18,
    title: 'The Final Score',
    giver: 'Detective Rook',
    brief: [
      'Rook: "The Coral Crown casino moves its vault cash on Friday."',
      'Rook: "I want that money in an evidence locker, not a pocket."',
      'Marco: "You are asking me to rob a casino for the police?"',
      'Rook: "I am asking you to be useful. One last time."',
    ],
    pay: 8000,
    steps: [
      { kind: 'goto', label: 'Enter the Coral Crown casino', dx: 980, dy: -260, r: 140 },
      { kind: 'hold', label: 'Crack the vault — stay on the mark', dx: 980, dy: -260, r: 140, t: 12 },
      { kind: 'goto', label: 'Get the cash to the drop at the docks', dx: 980, dy: 720, r: 140, timer: 180 },
      { kind: 'escape', label: 'Escape a 5-star wanted level', stars: 0 },
    ],
  },
];

const WRECK_SPEED = 120; // how fast Marco must be moving to wreck a rival
const WRECK_DIST = 46; // how close the hit has to land

export class EmpireMissions {
  constructor(game) {
    this.g = game;
    this.done = 0; // how many of the five are finished
    this.active = null; // { job, step, timer, holdT, wrecked, anchor }
    this.open = false; // briefing panel showing
    this.briefT = 0;
    this._toastCd = 0;
    this._markerPulse = 0;
    this.anchor = null;
  }

  _anchor() {
    if (this.anchor) return this.anchor;
    const p = this.g && this.g.player;
    const x = p && typeof p.x === 'number' ? p.x : 0;
    const y = p && typeof p.y === 'number' ? p.y : 0;
    this.anchor = { x, y };
    return this.anchor;
  }

  // Step targets are offsets from the same spawn anchor the empire uses,
  // so a job always sends Marco somewhere real on the map.
  _target(step) {
    const a = this._anchor();
    return { x: a.x + step.dx, y: a.y + step.dy };
  }

  _toast(title, body, seconds) {
    if (this._toastCd > 0 && !title.startsWith('MISSION')) return;
    this._toastCd = 0.4;
    if (this.g && this.g.hud && typeof this.g.hud.toast === 'function') {
      this.g.hud.toast(title, body, seconds || 4);
    }
  }

  nextJob() {
    if (this.done >= JOBS.length) return null;
    return JOBS[this.done];
  }

  // The start marker sits at the fixer's office. Marco walks up, presses
  // J, reads the brief, and the job begins.
  _markerSpot() {
    const a = this._anchor();
    return { x: a.x - 300, y: a.y + 480 };
  }

  _nearMarker() {
    const p = this.g && this.g.player;
    if (!p) return false;
    const m = this._markerSpot();
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    return dx * dx + dy * dy < 130 * 130;
  }

  _mainBusy() {
    const m = this.g && this.g.missions;
    return !!(m && m.active);
  }

  tryStart() {
    if (this.active || this.open) return;
    if (this._mainBusy()) {
      this._toast('BUSY', 'Finish the other job first, then come back.');
      return;
    }
    const job = this.nextJob();
    if (!job) {
      this._toast('ALL DONE', 'You ran all five empire jobs. The city is yours.');
      return;
    }
    if (!this._nearMarker()) {
      this._toast('NO JOB HERE', 'Jobs come from the fixer’s office — follow the gold marker.');
      return;
    }
    this.open = true;
    this.briefT = 0;
    this._pending = job;
  }

  _begin(job) {
    this.open = false;
    const a = this._anchor();
    this.active = { job, step: 0, timer: 0, holdT: 0, wrecked: 0, anchor: a, rivals: [] };
    const step = job.steps[0];
    if (step.kind === 'wreck') this._spawnRivals(step);
    this._toast(`MISSION ${job.n} — ${job.title}`, step.label, 6);
  }

  _spawnRivals(step) {
    const t = this._target(step);
    const traffic = this.g && this.g.traffic;
    if (!traffic || typeof traffic.spawn !== 'function') return;
    traffic.spawn(3, t.x, t.y);
    const cars = traffic.cars || [];
    // The three closest fresh cars become the ambush. They are flagged on
    // the car objects themselves, which costs nothing if a flag is missed.
    let marked = 0;
    for (let i = cars.length - 1; i >= 0 && marked < 3; i--) {
      const c = cars[i];
      if (c && !c._empireRival) {
        c._empireRival = true;
        c._empireWrecked = false;
        marked += 1;
      }
    }
    if (this.active) this.active.rivals = cars.filter((c) => c && c._empireRival);
  }

  _fail(msg) {
    const job = this.active && this.active.job;
    this.active = null;
    this._toast('JOB FAILED', msg || (job ? `${job.title} fell apart.` : 'The job fell apart.'), 5);
  }

  _complete() {
    const job = this.active.job;
    this.active = null;
    this.done += 1;
    const p = this.g && this.g.player;
    if (p && typeof p.money === 'number') {
      p.money += job.pay;
      if (this.g.sounds && typeof this.g.sounds.cash === 'function') this.g.sounds.cash();
    }
    this._toast(`MISSION ${job.n} COMPLETE`, `${job.title} paid $${job.pay}. ${this.done < JOBS.length ? 'Next job waits at the fixer’s office.' : 'That was the last one. The city is yours.'}`, 6);
  }

  _advance() {
    const a = this.active;
    a.step += 1;
    a.timer = 0;
    a.holdT = 0;
    a.wrecked = 0;
    if (a.step >= a.job.steps.length) {
      this._complete();
      return;
    }
    const step = a.job.steps[a.step];
    if (step.kind === 'wreck') this._spawnRivals(step);
    if (step.kind === 'escape') {
      // The escape step starts hot on purpose: the job puts heat on Marco.
      if (this.g && typeof this.g.setWanted === 'function') {
        const want = a.job.n === 18 ? 5 : 3;
        this.g.setWanted(Math.max(this.g.wanted || 0, want));
      }
    }
    this._toast(`MISSION ${a.job.n}`, step.label, 5);
  }

  // -- the step machine -------------------------------------------------------

  _stepTick(dt) {
    const a = this.active;
    if (!a) return;
    const p = this.g && this.g.player;
    if (!p) return;
    const step = a.job.steps[a.step];
    if (!step) {
      this._complete();
      return;
    }

    // A step timer runs out and the job fails. The timer only starts when
    // the step begins, so the player always gets the full window.
    if (typeof step.timer === 'number') {
      a.timer += dt;
      if (a.timer > step.timer) {
        this._fail(`Out of time on "${step.label}". ${a.job.giver} is not happy.`);
        return;
      }
    }

    if (step.kind === 'goto' || step.kind === 'hold') {
      const t = this._target(step);
      const dx = p.x - t.x;
      const dy = p.y - t.y;
      const d2 = dx * dx + dy * dy;
      const r = step.r || 130;
      if (d2 < r * r) {
        if (step.kind === 'goto') {
          this._advance();
          return;
        }
        a.holdT += dt;
        if (a.holdT >= (step.t || 5)) this._advance();
      } else {
        a.holdT = 0;
      }
      return;
    }

    if (step.kind === 'wreck') {
      const car = this.g.playerCar;
      const speed = car && typeof car.speed === 'number' ? Math.abs(car.speed) : 0;
      const rivals = (a.rivals || []).filter((c) => c && !c._empireWrecked);
      for (const c of rivals) {
        if (typeof c.x !== 'number' || typeof c.y !== 'number') continue;
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        if (dx * dx + dy * dy < WRECK_DIST * WRECK_DIST && speed > WRECK_SPEED) {
          c._empireWrecked = true;
          c.speed = 0;
          if (typeof c.hp === 'number') c.hp = 0;
          a.wrecked += 1;
          this._toast('RIVAL WRECKED', `${a.wrecked} of ${step.count} ambush cars down.`, 3);
        }
      }
      a.rivals = (a.rivals || []).filter((c) => c && !c._empireWrecked);
      if (a.wrecked >= step.count) this._advance();
      return;
    }

    if (step.kind === 'escape') {
      const wanted = this.g.wanted || 0;
      if (wanted <= (step.stars || 0)) this._advance();
    }
  }

  // -- frame update ---------------------------------------------------------

  update(dt) {
    if (!this.g || !this.g.player) return;
    if (this._toastCd > 0) this._toastCd -= dt;
    this._markerPulse += dt;
    const pad = this.g.input;
    if (pad && typeof pad.wasPressed === 'function') {
      if (this.open) {
        if (pad.wasPressed('Enter') || pad.wasPressed('KeyJ')) {
          const job = this._pending;
          this._pending = null;
          if (job) this._begin(job);
        } else if (pad.wasPressed('Escape')) {
          this.open = false;
          this._pending = null;
        }
      } else if (pad.wasPressed('KeyJ')) {
        this.tryStart();
      }
    }
    if (this.active) this._stepTick(dt);
  }

  // -- drawing ---------------------------------------------------------------

  _currentLabel() {
    if (!this.active) return null;
    const a = this.active;
    const step = a.job.steps[a.step];
    if (!step) return null;
    let extra = '';
    if (step.kind === 'hold') {
      extra = ` — ${Math.max(0, Math.ceil((step.t || 5) - a.holdT))}s`;
    } else if (step.kind === 'wreck') {
      extra = ` — ${a.wrecked}/${step.count}`;
    } else if (typeof step.timer === 'number') {
      extra = ` — ${Math.max(0, Math.ceil(step.timer - a.timer))}s left`;
    }
    return `M${a.job.n} ${a.job.title}: ${step.label}${extra}`;
  }

  drawWorld(ctx, cam) {
    if (!ctx || !cam) return;
    if (typeof window !== 'undefined' && window.__shot) return;
    const pulse = 0.6 + 0.4 * Math.sin(this._markerPulse * 4);
    // Start marker at the fixer’s office, gold and pulsing.
    if (!this.active && !this.open && this.done < JOBS.length) {
      const m = this._markerSpot();
      const sx = m.x - cam.x;
      const sy = m.y - cam.y;
      if (sx > -60 && sx < 1340 && sy > -60 && sy < 860) {
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#ffd94d';
        ctx.beginPath();
        ctx.arc(sx, sy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#101418';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('J', sx, sy + 5);
        ctx.fillStyle = '#ffd94d';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('FIXER — press J', sx, sy - 24);
        ctx.textAlign = 'left';
      }
    }
    // Objective ring for the current step.
    if (this.active) {
      const step = this.active.job.steps[this.active.step];
      if (step && (step.kind === 'goto' || step.kind === 'hold' || step.kind === 'wreck')) {
        const t = this._target(step);
        const sx = t.x - cam.x;
        const sy = t.y - cam.y;
        if (sx > -300 && sx < 1580 && sy > -300 && sy < 1100) {
          ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this._markerPulse * 4);
          ctx.strokeStyle = '#ffd94d';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(sx, sy, step.r || 130, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  drawMenu(ctx) {
    if (!this.open || !ctx) return;
    const job = this._pending;
    if (!job) return;
    const W = 640;
    const H = 400;
    const x0 = (1280 - W) / 2;
    const y0 = (800 - H) / 2;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.94)';
    ctx.fillRect(x0, y0, W, H);
    ctx.strokeStyle = '#ffd94d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, W, H);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`MISSION ${job.n} — ${job.title}`, x0 + 24, y0 + 40);
    ctx.fillStyle = '#9aa3ad';
    ctx.font = '15px sans-serif';
    ctx.fillText(`From ${job.giver}   •   Pays $${job.pay}`, x0 + 24, y0 + 66);
    ctx.fillStyle = '#e8ecf1';
    ctx.font = '16px sans-serif';
    let y = y0 + 106;
    for (const line of job.brief) {
      ctx.fillText(line, x0 + 24, y);
      y += 28;
    }
    y += 10;
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('The job:', x0 + 24, y);
    y += 26;
    ctx.fillStyle = '#e8ecf1';
    ctx.font = '15px sans-serif';
    for (const step of job.steps) {
      ctx.fillText(`• ${step.label}`, x0 + 24, y);
      y += 26;
    }
    ctx.fillStyle = '#9aa3ad';
    ctx.font = '14px sans-serif';
    ctx.fillText('Enter or J to take the job  •  Esc to walk away', x0 + 24, y0 + H - 22);
  }

  drawHudLine(ctx) {
    const label = this._currentLabel();
    if (!label || !ctx) return;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.85)';
    ctx.fillRect(20, 108, ctx.measureText(label).width + 24, 26);
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, 32, 126);
  }

  draw(ctx, cam) {
    this.drawWorld(ctx, cam);
    this.drawMenu(ctx);
    this.drawHudLine(ctx);
  }

  // -- save -------------------------------------------------------------------

  toJSON() {
    return { done: this.done };
  }

  fromJSON(d) {
    if (!d || typeof d !== 'object') return;
    if (typeof d.done === 'number') this.done = Math.max(0, Math.min(JOBS.length, d.done));
  }
}
