// Palmera Bay — Ambient city life.
//
// The city does not wait for Marco. Five regulars keep their own
// schedules, the streets throw up random events — a car meet, a
// performer, a march, a food truck — and strangers walk up with small
// choices that pay or cost cash. Street reputation grows when Marco
// helps people and shrinks when he walks past; a good reputation makes
// every event pay better.
//
// v7: written from scratch in this session. Every regular, schedule,
// event, line and number below was invented here. The module only
// touches the game through the public surface it was given:
// game.player, game.crowd.spawn, game.traffic.spawn, game.hud.toast,
// game.input and the canvas context.

// ---------------------------------------------------------------------------
// The regulars. Each one has a name, a line, and a day plan: four slots
// (morning, midday, evening, night) with a place and something to do.
// Places are offsets from the player's spawn point, as in the empire.
// ---------------------------------------------------------------------------

const REGULARS = [
  {
    id: 'finn',
    name: 'Old Finn',
    job: 'fisherman',
    line: '"The bay gives, the bay takes. Mostly it takes my lures."',
    plan: [
      { slot: 'morning', dx: 980, dy: 720, doing: 'mending nets at the docks' },
      { slot: 'midday', dx: -420, dy: -640, doing: 'selling the catch at the market' },
      { slot: 'evening', dx: 240, dy: 880, doing: 'watching the boats come in' },
      { slot: 'night', dx: -640, dy: 320, doing: 'asleep in his shack' },
    ],
  },
  {
    id: 'ada',
    name: 'Sister Ada',
    job: 'chapel keeper',
    line: '"Even thieves need a quiet place, dear. Sit a while."',
    plan: [
      { slot: 'morning', dx: -640, dy: 320, doing: 'opening the old chapel' },
      { slot: 'midday', dx: -420, dy: 320, doing: 'feeding the pigeons' },
      { slot: 'evening', dx: -640, dy: 320, doing: 'lighting candles' },
      { slot: 'night', dx: -640, dy: 320, doing: 'praying for the city' },
    ],
  },
  {
    id: 'marlow',
    name: 'DJ Marlow',
    job: 'club DJ',
    line: '"You look like a man with a song stuck in his head."',
    plan: [
      { slot: 'morning', dx: 520, dy: -260, doing: 'sleeping off the night' },
      { slot: 'midday', dx: -900, dy: -120, doing: 'digging for records' },
      { slot: 'evening', dx: -640, dy: 320, doing: 'setting up at the club' },
      { slot: 'night', dx: -640, dy: 320, doing: 'playing till sunrise' },
    ],
  },
  {
    id: 'bao',
    name: 'Chef Bao',
    job: 'food truck',
    line: '"Noodles fix everything except a wanted level."',
    plan: [
      { slot: 'morning', dx: 240, dy: 880, doing: 'prepping at the beach' },
      { slot: 'midday', dx: 520, dy: -260, doing: 'serving the stadium crowd' },
      { slot: 'evening', dx: -420, dy: -640, doing: 'parking by the market' },
      { slot: 'night', dx: 980, dy: 720, doing: 'feeding the dock workers' },
    ],
  },
  {
    id: 'rosa',
    name: 'Rosa',
    job: 'florist',
    line: '"Flowers for a lady, or for an apology? Same price."',
    plan: [
      { slot: 'morning', dx: -420, dy: -640, doing: 'opening the flower stall' },
      { slot: 'midday', dx: -420, dy: 320, doing: 'delivering bouquets' },
      { slot: 'evening', dx: 240, dy: 880, doing: 'closing up at the beach' },
      { slot: 'night', dx: -420, dy: -640, doing: 'counting the till' },
    ],
  },
];

// Street events. Each one spawns something near Marco, stays a while,
// and leaves a small choice or payout behind.
const EVENTS = [
  {
    id: 'carmeet',
    name: 'Car meet',
    text: 'A car meet rolls in — engines revving, music up, everybody showing off.',
    dur: 45,
    cars: 3,
    peds: 6,
    pay: 40,
  },
  {
    id: 'performer',
    name: 'Street performer',
    text: 'A sax player sets up on the corner. The crowd gathers, coins drop.',
    dur: 35,
    cars: 0,
    peds: 5,
    pay: 25,
  },
  {
    id: 'march',
    name: 'Protest march',
    text: 'A march comes down the avenue — signs, chants, and very slow traffic.',
    dur: 50,
    cars: 0,
    peds: 10,
    pay: 0,
  },
  {
    id: 'foodtruck',
    name: 'Food truck stop',
    text: 'Chef Bao’s truck parks up. The smell of noodles drifts down the street.',
    dur: 60,
    cars: 1,
    peds: 4,
    pay: 15,
  },
  {
    id: 'busker',
    name: 'Busker battle',
    text: 'Two buskers face off with guitars. The crowd picks a winner with cash.',
    dur: 40,
    cars: 0,
    peds: 7,
    pay: 30,
  },
];

const ENCOUNTERS = [
  { text: 'A kid asks for $10 to fix his bike.', good: 'You hand over $10. The kid grins and pedals off.', cost: 10, rep: 4 },
  { text: 'A tourist lost her map asks the way to the beach.', good: 'You point her the right way. She tips you $15.', cost: 0, rep: 3, gain: 15 },
  { text: 'An old man drops his groceries in the road.', good: 'You help him gather them. He presses $20 into your hand.', cost: 0, rep: 4, gain: 20 },
  { text: 'A street vendor’s cart tips over in front of you.', good: 'You right the cart. The vendor slips you $25.', cost: 0, rep: 4, gain: 25 },
  { text: 'A runaway dog bolts past, its owner shouting after it.', good: 'You catch the dog by the collar. The owner pays you $30.', cost: 0, rep: 5, gain: 30 },
  { text: 'A busker’s hat blows off and coins scatter everywhere.', good: 'You gather the coins and hand them back. He plays you a song.', cost: 0, rep: 3, gain: 10 },
];

const SLOT_LENGTH = 45; // real seconds per game slot (morning/midday/evening/night)
const EVENT_EVERY_MIN = 45; // seconds between event rolls
const EVENT_EVERY_MAX = 90;
const ENCOUNTER_EVERY_MIN = 70;
const ENCOUNTER_EVERY_MAX = 140;
const SNACK_PRICE = 12;
const SNACK_HEAL = 20;

export class CityLife {
  constructor(game) {
    this.g = game;
    this.clock = 17 * 3600; // the city starts at 17:00, like the day/night cycle
    this.rep = 0; // street reputation, 0..100
    this.event = null; // { def, t, x, y }
    this.eventT = EVENT_EVERY_MIN;
    this.encounter = null; // { def, t }
    this.encounterT = ENCOUNTER_EVERY_MIN;
    this.truck = null; // { x, y, t } — the food truck, buyable with L
    this.eventsSeen = 0;
    this.encountersHelped = 0;
    this.encountersIgnored = 0;
    this.tipsEarned = 0;
    this.met = {}; // regular id -> times met
    this.anchor = null;
    this._toastCd = 0;
  }

  _anchor() {
    if (this.anchor) return this.anchor;
    const p = this.g && this.g.player;
    const x = p && typeof p.x === 'number' ? p.x : 0;
    const y = p && typeof p.y === 'number' ? p.y : 0;
    this.anchor = { x, y };
    return this.anchor;
  }

  _slot() {
    const h = Math.floor(this.clock / 3600) % 24;
    if (h >= 6 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'midday';
    if (h >= 17 && h < 22) return 'evening';
    return 'night';
  }

  _clockText() {
    const h = Math.floor(this.clock / 3600) % 24;
    const m = Math.floor((this.clock % 3600) / 60);
    const hh = h < 10 ? `0${h}` : `${h}`;
    const mm = m < 10 ? `0${m}` : `${m}`;
    return `${hh}:${mm}`;
  }

  _toast(title, body, seconds) {
    if (this._toastCd > 0) return;
    this._toastCd = 0.4;
    if (this.g && this.g.hud && typeof this.g.hud.toast === 'function') {
      this.g.hud.toast(title, body, seconds || 4);
    }
  }

  _near(x, y, r) {
    const p = this.g && this.g.player;
    if (!p) return false;
    const dx = p.x - x;
    const dy = p.y - y;
    return dx * dx + dy * dy < r * r;
  }

  // -- regulars ---------------------------------------------------------------

  regularSpot(reg) {
    const slot = this._slot();
    const step = reg.plan.find((s) => s.slot === slot) || reg.plan[0];
    const a = this._anchor();
    return { x: a.x + step.dx, y: a.y + step.dy, doing: step.doing };
  }

  _meetCheck() {
    // Standing near a regular for the first time in a slot greets Marco.
    for (const reg of REGULARS) {
      const s = this.regularSpot(reg);
      if (this._near(s.x, s.y, 90)) {
        const key = `${reg.id}:${this._slot()}`;
        if (!this.met[key]) {
          this.met[key] = 1;
          this.rep = Math.min(100, this.rep + 2);
          this._toast(reg.name.toUpperCase(), `${reg.line} (${reg.doing}.)`, 5);
          return;
        }
      }
    }
  }

  // -- street events ------------------------------------------------------------

  _rollEvent() {
    const def = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    const p = this.g && this.g.player;
    if (!p) return;
    const ang = Math.random() * Math.PI * 2;
    const dist = 260 + Math.random() * 200;
    const x = p.x + Math.cos(ang) * dist;
    const y = p.y + Math.sin(ang) * dist;
    this.event = { def, t: def.dur, x, y };
    this.eventsSeen += 1;
    if (def.cars > 0 && this.g.traffic && typeof this.g.traffic.spawn === 'function') {
      this.g.traffic.spawn(def.cars, x, y);
    }
    if (def.peds > 0 && this.g.crowd && typeof this.g.crowd.spawn === 'function') {
      this.g.crowd.spawn(def.peds, x, y);
    }
    if (def.id === 'foodtruck') {
      this.truck = { x, y, t: def.dur };
    }
    this._toast(def.name.toUpperCase(), def.text, 5);
  }

  _eventTick(dt) {
    if (!this.event) return;
    this.event.t -= dt;
    const p = this.g && this.g.player;
    if (p && this._near(this.event.x, this.event.y, 110) && this.event.def.pay > 0 && !this.event.paid) {
      // Showing up to the event pays a little — the crowd likes an audience.
      this.event.paid = true;
      const mult = this.rep >= 50 ? 1.5 : 1;
      const amount = Math.round(this.event.def.pay * mult);
      p.money = (typeof p.money === 'number' ? p.money : 0) + amount;
      this.tipsEarned += amount;
      this._toast('STREET LIFE', `You hung around the ${this.event.def.name.toLowerCase()} and pocketed $${amount}.`);
    }
    if (this.event.t <= 0) {
      if (this.event.def.id === 'foodtruck') this.truck = null;
      this.event = null;
    }
  }

  // -- encounters -----------------------------------------------------------------

  _rollEncounter() {
    const def = ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)];
    this.encounter = { def, t: 14 };
    this._toast('SOMEBODY NEEDS A HAND', `${def.text} Press 1 to help, 2 to walk on.`, 6);
  }

  _resolveEncounter(help) {
    const enc = this.encounter;
    this.encounter = null;
    if (!enc) return;
    const p = this.g && this.g.player;
    if (!p) return;
    if (help) {
      const cost = enc.def.cost || 0;
      if (typeof p.money === 'number' && p.money < cost) {
        this._toast('TOO BROKE', 'You wanted to help, but the wallet says no.');
        return;
      }
      if (cost > 0) p.money -= cost;
      if (enc.def.gain) {
        p.money = (typeof p.money === 'number' ? p.money : 0) + enc.def.gain;
        this.tipsEarned += enc.def.gain;
      }
      this.rep = Math.min(100, this.rep + (enc.def.rep || 3));
      this.encountersHelped += 1;
      this._toast('GOOD DEED', enc.def.good, 5);
    } else {
      this.rep = Math.max(0, this.rep - 2);
      this.encountersIgnored += 1;
      this._toast('WALKED ON', 'You kept walking. The street noticed.', 4);
    }
  }

  // -- the food truck ------------------------------------------------------------

  _buySnack() {
    if (!this.truck) return;
    if (!this._near(this.truck.x, this.truck.y, 120)) return;
    const p = this.g && this.g.player;
    if (!p || typeof p.money !== 'number' || p.money < SNACK_PRICE) {
      this._toast('NOT ENOUGH CASH', `Chef Bao’s noodles cost $${SNACK_PRICE}.`);
      return;
    }
    p.money -= SNACK_PRICE;
    if (typeof p.hp === 'number') {
      const max = typeof p.maxHp === 'number' ? p.maxHp : 100;
      p.hp = Math.min(max, p.hp + SNACK_HEAL);
    }
    this._toast('NOODLES', `Chef Bao hands over a bowl. +${SNACK_HEAL} health, -$${SNACK_PRICE}.`);
  }

  // -- frame update ---------------------------------------------------------

  update(dt) {
    if (!this.g || !this.g.player) return;
    if (typeof window !== 'undefined' && window.__shot) return;
    if (this._toastCd > 0) this._toastCd -= dt;
    // One game hour every 45 real seconds.
    this.clock += (3600 / SLOT_LENGTH) * dt;

    const pad = this.g.input;
    if (pad && typeof pad.wasPressed === 'function') {
      if (this.encounter) {
        if (pad.wasPressed('Digit1')) this._resolveEncounter(true);
        else if (pad.wasPressed('Digit2')) this._resolveEncounter(false);
      } else if (pad.wasPressed('KeyL')) {
        this._buySnack();
      }
    }

    this._meetCheck();

    this.eventT -= dt;
    if (this.eventT <= 0) {
      this.eventT = EVENT_EVERY_MIN + Math.random() * (EVENT_EVERY_MAX - EVENT_EVERY_MIN);
      if (!this.event) this._rollEvent();
    }
    this._eventTick(dt);

    if (this.encounter) {
      this.encounter.t -= dt;
      if (this.encounter.t <= 0) {
        this.encounter = null;
        this.encountersIgnored += 1;
        this.rep = Math.max(0, this.rep - 1);
      }
    } else {
      this.encounterT -= dt;
      if (this.encounterT <= 0) {
        this.encounterT = ENCOUNTER_EVERY_MIN + Math.random() * (ENCOUNTER_EVERY_MAX - ENCOUNTER_EVERY_MIN);
        this._rollEncounter();
      }
    }

    if (this.truck) {
      this.truck.t -= dt;
      if (this.truck.t <= 0) this.truck = null;
    }
  }

  // -- drawing ---------------------------------------------------------------

  drawWorld(ctx, cam) {
    if (!ctx || !cam) return;
    if (typeof window !== 'undefined' && window.__shot) return;
    // Regulars get a small teal dot with their initial, so the city feels
    // lived in instead of random.
    for (const reg of REGULARS) {
      const s = this.regularSpot(reg);
      const sx = s.x - cam.x;
      const sy = s.y - cam.y;
      if (sx < -30 || sx > 1310 || sy < -30 || sy > 830) continue;
      ctx.fillStyle = '#2ec4b6';
      ctx.beginPath();
      ctx.arc(sx, sy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#101418';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(reg.name[0], sx, sy + 4);
      ctx.textAlign = 'left';
    }
    // The active event gets a ring so Marco can find the fun.
    if (this.event) {
      const sx = this.event.x - cam.x;
      const sy = this.event.y - cam.y;
      if (sx > -200 && sx < 1480 && sy > -200 && sy < 1000) {
        ctx.strokeStyle = '#2ec4b6';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(sx, sy, 90, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#2ec4b6';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.event.def.name.toUpperCase(), sx, sy - 100);
        ctx.textAlign = 'left';
      }
    }
    // The food truck is a little orange square with a smell line.
    if (this.truck) {
      const sx = this.truck.x - cam.x;
      const sy = this.truck.y - cam.y;
      if (sx > -40 && sx < 1320 && sy > -40 && sy < 840) {
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(sx - 14, sy - 10, 28, 20);
        ctx.fillStyle = '#101418';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('L', sx, sy + 4);
        ctx.fillStyle = '#ffb347';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('NOODLES — press L', sx, sy - 20);
        ctx.textAlign = 'left';
      }
    }
  }

  drawHudLine(ctx) {
    if (!ctx) return;
    if (typeof window !== 'undefined' && window.__shot) return;
    const label = `${this._clockText()}  •  ${this._slot()}  •  street rep ${Math.round(this.rep)}`;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.8)';
    ctx.fillRect(20, 140, ctx.measureText(label).width + 24, 24);
    ctx.fillStyle = '#2ec4b6';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, 32, 157);
  }

  draw(ctx, cam) {
    this.drawWorld(ctx, cam);
    this.drawHudLine(ctx);
  }

  // -- save -------------------------------------------------------------------

  toJSON() {
    return {
      rep: Math.round(this.rep),
      clock: Math.round(this.clock),
      eventsSeen: this.eventsSeen,
      encountersHelped: this.encountersHelped,
      encountersIgnored: this.encountersIgnored,
      tipsEarned: this.tipsEarned,
    };
  }

  fromJSON(d) {
    if (!d || typeof d !== 'object') return;
    if (typeof d.rep === 'number') this.rep = d.rep;
    if (typeof d.clock === 'number') this.clock = d.clock;
    if (typeof d.eventsSeen === 'number') this.eventsSeen = d.eventsSeen;
    if (typeof d.encountersHelped === 'number') this.encountersHelped = d.encountersHelped;
    if (typeof d.encountersIgnored === 'number') this.encountersIgnored = d.encountersIgnored;
    if (typeof d.tipsEarned === 'number') this.tipsEarned = d.tipsEarned;
  }
}
