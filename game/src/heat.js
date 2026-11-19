// Palmera Bay — District heat & reputation.
//
// The city remembers where Marco makes trouble. Six districts each carry
// their own heat from 0 to 100: it climbs when the wanted level climbs
// inside them, cools slowly when Marco behaves, and changes how the
// police answer. Hot districts send more cruisers; a boiling district
// locks down and will not let the wanted level drop below two stars
// while Marco is inside it. A cop can be bribed — for a price that
// grows with the stars — and the most-wanted board keeps score of the
// whole career.
//
// v7: written from scratch in this session. Every district name, bound,
// threshold, price and line below was invented here. The module only
// touches the game through the public surface it was given:
// game.player, game.wanted, game.setWanted, game.traffic.spawnPolice,
// game.hud.toast, game.input and the canvas context.

// ---------------------------------------------------------------------------
// Districts. The bounds are invented rectangles over the world map; the
// last district is the catch-all for anywhere the others do not cover.
// ---------------------------------------------------------------------------

const DISTRICTS = [
  { id: 'bay', name: 'Coral Bay', x0: -99999, y0: 1400, x1: 400, y1: 99999, color: '#2ec4b6' },
  { id: 'downtown', name: 'Downtown', x0: -400, y0: -400, x1: 600, y1: 900, color: '#ffd94d' },
  { id: 'docks', name: 'The Docks', x0: 600, y0: 400, x1: 99999, y1: 99999, color: '#7fb2ff' },
  { id: 'hills', name: 'North Hills', x0: -99999, y0: -99999, x1: 600, y1: -400, color: '#8ef0c1' },
  { id: 'oldtown', name: 'Old Town', x0: -99999, y0: 900, x1: -400, y1: 1400, color: '#c9a7ff' },
  { id: 'strip', name: 'Airport Strip', x0: 600, y0: -99999, x1: 99999, y1: 400, color: '#ffb347' },
];

const HEAT_PER_STAR = 16; // heat gained in a district per wanted star gained
const HEAT_COOL_PER_SEC = 0.55; // heat lost per second while calm
const HOT_AT = 60; // at this heat the district sends extra cruisers
const LOCKDOWN_AT = 85; // at this heat the district locks down
const CRUISER_EVERY = 26; // seconds between extra cruisers in a hot district
const BRIBE_BASE = 100; // dollars for the first star
const BRIBE_PER_STAR = 75; // extra dollars per star above the first
const BRIBE_COOLDOWN = 20; // seconds between bribes
const BRIBE_HEAT_CUT = 25; // heat removed from the district by a bribe

// District events: when a district gets hot, the street talks. An
// informant may offer a tip, a roadblock may go up, or the local news
// van may start circling. Each event is a small choice with a price.
const DISTRICT_EVENTS = [
  {
    id: 'informant',
    title: 'INFORMANT',
    text: 'A nervous man in a raincoat offers the patrol schedule for $80.',
    cost: 80,
    apply: 'cool',
  },
  {
    id: 'roadblock',
    title: 'ROADBLOCK',
    text: 'Cruisers are blocking the avenue ahead. Slip around them or pay the toll.',
    cost: 0,
    apply: 'block',
  },
  {
    id: 'newsvan',
    title: 'NEWS VAN',
    text: 'A news van is circling, camera out. Smash it or smile for it?',
    cost: 0,
    apply: 'news',
  },
  {
    id: 'lookout',
    title: 'LOOKOUT',
    text: 'A kid on a corner offers to watch your back for $50 while you work.',
    cost: 50,
    apply: 'lookout',
  },
];

const EVENT_ROLL_EVERY = 40; // seconds between district-event rolls

export class DistrictHeat {
  constructor(game) {
    this.g = game;
    this.heat = {}; // district id -> 0..100
    for (const d of DISTRICTS) this.heat[d.id] = 0;
    this.lastWanted = 0;
    this.cruiserT = 0;
    this.bribeT = 0;
    this.boardOpen = false;
    this.notoriety = 0; // lifetime score: heat gained + stars outrun
    this.bribesPaid = 0;
    this.bribesTotal = 0;
    this.lockdownsSeen = 0;
    this._lockdownHere = null; // district id currently locking Marco down
    this._toastCd = 0;
    this.anchor = null;
    // District events and the wanted history log.
    this.event = null; // { def, district, t }
    this.eventT = EVENT_ROLL_EVERY;
    this.lookoutT = 0; // seconds of lookout cover left
    this.newsT = 0; // seconds the news van is filming
    this.history = []; // { text, t } — the last few heat moments, newest first
    this.eventsSeen = 0;
    this.tipsBought = 0;
  }

  // -- districts ---------------------------------------------------------------

  districtAt(x, y) {
    for (const d of DISTRICTS) {
      if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
    }
    return DISTRICTS[1]; // downtown is the fallback
  }

  currentDistrict() {
    const p = this.g && this.g.player;
    if (!p || typeof p.x !== 'number') return DISTRICTS[1];
    return this.districtAt(p.x, p.y);
  }

  heatOf(id) {
    return Math.max(0, Math.min(100, this.heat[id] || 0));
  }

  _addHeat(id, amount) {
    const before = this.heatOf(id);
    this.heat[id] = Math.max(0, Math.min(100, before + amount));
    this.notoriety += Math.max(0, amount);
    return this.heat[id];
  }

  // -- bribes -------------------------------------------------------------------

  bribeCost() {
    const w = this.g ? this.g.wanted || 0 : 0;
    if (w <= 0) return 0;
    return BRIBE_BASE + BRIBE_PER_STAR * (w - 1);
  }

  tryBribe() {
    const w = this.g ? this.g.wanted || 0 : 0;
    if (w <= 0) {
      this.boardOpen = !this.boardOpen;
      return;
    }
    if (this.bribeT > 0) {
      this._toast('TOO SOON', `The cops are still counting the last envelope. ${Math.ceil(this.bribeT)}s.`);
      return;
    }
    const cost = this.bribeCost();
    const p = this.g && this.g.player;
    if (!p || typeof p.money !== 'number' || p.money < cost) {
      this._toast('NOT ENOUGH CASH', `A bribe for ${w} star${w > 1 ? 's' : ''} costs $${cost}.`);
      return;
    }
    p.money -= cost;
    this.bribesPaid += 1;
    this.bribesTotal += cost;
    this.bribeT = BRIBE_COOLDOWN;
    const d = this.currentDistrict();
    this._addHeat(d.id, -BRIBE_HEAT_CUT);
    if (this.g && typeof this.g.setWanted === 'function') {
      this.g.setWanted(w - 1);
    }
    this._toast('BRIBED', `One star walks away for $${cost}. ${d.name} cools down a little.`);
  }

  // -- district events ---------------------------------------------------------

  _log(text) {
    this.history.unshift({ text, t: Date.now() });
    if (this.history.length > 6) this.history.length = 6;
  }

  _rollDistrictEvent() {
    const d = this.currentDistrict();
    const h = this.heatOf(d.id);
    if (h < 30) return; // quiet districts have nothing to say
    const def = DISTRICT_EVENTS[Math.floor(Math.random() * DISTRICT_EVENTS.length)];
    this.event = { def, district: d, t: 18 };
    this.eventsSeen += 1;
    this._toast(def.title, `${def.text} Press Enter to take it, 3 to ignore it.`, 6);
  }

  _resolveDistrictEvent(take) {
    const ev = this.event;
    this.event = null;
    if (!ev) return;
    const p = this.g && this.g.player;
    if (!take) {
      this._toast('IGNORED', 'The street moves on without you.');
      return;
    }
    const cost = ev.def.cost || 0;
    if (cost > 0) {
      if (!p || typeof p.money !== 'number' || p.money < cost) {
        this._toast('NOT ENOUGH CASH', `That costs $${cost}. The street moves on.`);
        return;
      }
      p.money -= cost;
    }
    const d = ev.district;
    if (ev.def.apply === 'cool') {
      this._addHeat(d.id, -30);
      this.tipsBought += 1;
      this._log(`Bought the patrol schedule in ${d.name} (-30 heat)`);
      this._toast('TIP BOUGHT', `You know where the patrols are. ${d.name} cools by 30.`);
    } else if (ev.def.apply === 'block') {
      // A roadblock goes up ahead: two cruisers appear on the avenue.
      this._sendCruiser();
      this._sendCruiser();
      this._log(`Roadblock went up in ${d.name}`);
      this._toast('ROADBLOCK', 'Two cruisers block the avenue. Find another way around.');
    } else if (ev.def.apply === 'news') {
      this.newsT = 30;
      this._addHeat(d.id, 10);
      this._log(`News van filmed Marco in ${d.name} (+10 heat)`);
      this._toast('ON CAMERA', 'The news van got your face. The whole city just got hotter.');
    } else if (ev.def.apply === 'lookout') {
      this.lookoutT = 90;
      this._log(`Hired a lookout in ${d.name} for 90s`);
      this._toast('LOOKOUT HIRED', 'A kid on the corner watches your back for 90 seconds.');
    }
  }

  // A lookout on the corner spots patrols early: while cover lasts, the
  // district cools twice as fast and no extra cruisers are sent.
  _lookoutCover() {
    return this.lookoutT > 0;
  }

  // -- police response -----------------------------------------------------------

  _sendCruiser() {
    const p = this.g && this.g.player;
    const traffic = this.g && this.g.traffic;
    if (!p || !traffic || typeof traffic.spawnPolice !== 'function') return;
    const ang = Math.random() * Math.PI * 2;
    const dist = 420 + Math.random() * 200;
    const x = p.x + Math.cos(ang) * dist;
    const y = p.y + Math.sin(ang) * dist;
    traffic.spawnPolice(x, y, ang + Math.PI);
  }

  _toast(title, body) {
    if (this._toastCd > 0) return;
    this._toastCd = 0.4;
    if (this.g && this.g.hud && typeof this.g.hud.toast === 'function') {
      this.g.hud.toast(title, body, 4);
    }
  }

  // -- frame update ---------------------------------------------------------

  update(dt) {
    if (!this.g || !this.g.player) return;
    if (this._toastCd > 0) this._toastCd -= dt;
    if (this.bribeT > 0) this.bribeT -= dt;
    const pad = this.g.input;
    if (pad && typeof pad.wasPressed === 'function') {
      if (this.event) {
        if (pad.wasPressed('Enter')) this._resolveDistrictEvent(true);
        else if (pad.wasPressed('Digit3')) this._resolveDistrictEvent(false);
      } else if (pad.wasPressed('KeyV')) {
        this.tryBribe();
      }
      // No Escape handling here: the game's pause menu eats Escape first.
      // V with no stars toggles the board open and closed.
    }

    // District events roll on their own schedule while Marco is out.
    if (this.lookoutT > 0) this.lookoutT -= dt;
    if (this.newsT > 0) this.newsT -= dt;
    this.eventT -= dt;
    if (this.eventT <= 0) {
      this.eventT = EVENT_ROLL_EVERY + Math.random() * 20;
      if (!this.event) this._rollDistrictEvent();
    }
    if (this.event) {
      this.event.t -= dt;
      if (this.event.t <= 0) {
        this.event = null;
        this._toast('TOO LATE', 'The moment passed. The street moved on.');
      }
    }

    const wanted = this.g.wanted || 0;
    const d = this.currentDistrict();

    // Heat follows the wanted level: every star gained inside a district
    // heats that district up. Stars lost do not cool anything by
    // themselves — cooling takes time.
    if (wanted > this.lastWanted) {
      const gained = (wanted - this.lastWanted) * HEAT_PER_STAR;
      const now = this._addHeat(d.id, gained);
      if (now >= LOCKDOWN_AT && this._lockdownHere !== d.id) {
        this._lockdownHere = d.id;
        this.lockdownsSeen += 1;
        this._toast('LOCKDOWN', `${d.name} is locked down. The cops will not let the heat drop here.`);
      } else if (now >= HOT_AT) {
        this._toast('HOT DISTRICT', `${d.name} is running hot. Expect extra cruisers.`);
      }
    }
    this.lastWanted = wanted;

    // Calm cooling: a district sheds heat slowly while Marco is not
    // wanted inside it. A lookout on the corner doubles the cooling.
    if (wanted === 0) {
      const cool = HEAT_COOL_PER_SEC * (this._lookoutCover() ? 2 : 1);
      for (const dist of DISTRICTS) {
        if (this.heat[dist.id] > 0) {
          this.heat[dist.id] = Math.max(0, this.heat[dist.id] - cool * dt);
        }
      }
      if (this._lockdownHere) this._lockdownHere = null;
    }

    // A hot district answers with cruisers on its own schedule — unless
    // a lookout is covering Marco, in which case the patrols never come.
    const heat = this.heatOf(d.id);
    if (heat >= HOT_AT && wanted > 0 && !this._lookoutCover()) {
      this.cruiserT -= dt;
      if (this.cruiserT <= 0) {
        this.cruiserT = CRUISER_EVERY;
        this._sendCruiser();
        this._toast('BACKUP CALLED', `Another cruiser rolls into ${d.name}.`);
      }
    } else {
      this.cruiserT = Math.min(this.cruiserT, 4);
    }

    // Lockdown holds the floor: inside a boiling district the wanted
    // level cannot fall below two stars while the heat lasts.
    if (this._lockdownHere === d.id && heat >= LOCKDOWN_AT && wanted < 2) {
      if (this.g && typeof this.g.setWanted === 'function') {
        this.g.setWanted(2);
      }
    }
  }

  // -- drawing ---------------------------------------------------------------

  _heatColor(h) {
    if (h >= LOCKDOWN_AT) return '#ff3b30';
    if (h >= HOT_AT) return '#ff9500';
    if (h >= 30) return '#ffd94d';
    return '#8ef0c1';
  }

  drawStrip(ctx) {
    if (!ctx) return;
    const d = this.currentDistrict();
    const h = this.heatOf(d.id);
    const label = `${d.name} — heat ${Math.round(h)}`;
    ctx.font = 'bold 13px sans-serif';
    const w = ctx.measureText(label).width + 24;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.8)';
    ctx.fillRect(20, 76, w, 24);
    ctx.fillStyle = this._heatColor(h);
    ctx.textAlign = 'left';
    ctx.fillText(label, 32, 93);
    // A thin heat bar under the label.
    ctx.fillStyle = '#222a33';
    ctx.fillRect(20, 102, w, 5);
    ctx.fillStyle = this._heatColor(h);
    ctx.fillRect(20, 102, w * (h / 100), 5);
  }

  drawBoard(ctx) {
    if (!this.boardOpen || !ctx) return;
    const W = 560;
    const H = 500;
    const x0 = (1280 - W) / 2;
    const y0 = (800 - H) / 2;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.94)';
    ctx.fillRect(x0, y0, W, H);
    ctx.strokeStyle = '#ff9500';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, W, H);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff9500';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('MOST WANTED — PALMERA BAY', x0 + 24, y0 + 40);
    ctx.fillStyle = '#e8ecf1';
    ctx.font = '15px sans-serif';
    ctx.fillText(`Notoriety: ${Math.round(this.notoriety)}    Bribes paid: ${this.bribesPaid} ($${this.bribesTotal})`, x0 + 24, y0 + 66);
    ctx.fillText(`Lockdowns survived: ${this.lockdownsSeen}`, x0 + 24, y0 + 90);
    ctx.fillStyle = '#9aa3ad';
    ctx.font = '13px sans-serif';
    ctx.fillText('Press V with no stars to open this board. Press V with stars to bribe a cop.', x0 + 24, y0 + 112);
    const sorted = DISTRICTS.slice().sort((a, b) => this.heatOf(b.id) - this.heatOf(a.id));
    let y = y0 + 150;
    for (const dist of sorted) {
      const h = this.heatOf(dist.id);
      ctx.fillStyle = dist.color;
      ctx.fillRect(x0 + 24, y - 12, 12, 12);
      ctx.fillStyle = '#e8ecf1';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(dist.name, x0 + 46, y);
      ctx.fillStyle = '#222a33';
      ctx.fillRect(x0 + 220, y - 12, 220, 14);
      ctx.fillStyle = this._heatColor(h);
      ctx.fillRect(x0 + 220, y - 12, 220 * (h / 100), 14);
      ctx.fillStyle = '#e8ecf1';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'right';
      const tag = h >= LOCKDOWN_AT ? 'LOCKDOWN' : h >= HOT_AT ? 'HOT' : h >= 30 ? 'WARM' : 'CALM';
      ctx.fillText(`${Math.round(h)} — ${tag}`, x0 + W - 24, y);
      ctx.textAlign = 'left';
      y += 34;
    }
    const footY = y0 + H - 18;
    ctx.fillStyle = '#9aa3ad';
    ctx.font = '13px sans-serif';
    ctx.fillText('Heat cools when you lay low. Bribes cost more the hotter you are.', x0 + 24, footY);
    // Recent heat history, newest first, under the district list.
    if (this.history.length > 0) {
      ctx.fillStyle = '#ff9500';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('RECENT:', x0 + 24, y + 8);
      ctx.fillStyle = '#9aa3ad';
      ctx.font = '12px sans-serif';
      let hy = y + 26;
      for (const h of this.history.slice(0, 3)) {
        ctx.fillText(`• ${h.text}`, x0 + 24, hy);
        hy += 16;
      }
    }
    if (this._lookoutCover()) {
      ctx.fillStyle = '#8ef0c1';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`Lookout cover: ${Math.ceil(this.lookoutT)}s — patrols will not find you.`, x0 + 24, y0 + H - 40);
    }
    if (this.newsT > 0) {
      ctx.fillStyle = '#ff3b30';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`News van filming: ${Math.ceil(this.newsT)}s — keep your head down.`, x0 + 24, y0 + H - 40);
    }
  }

  draw(ctx, cam) {
    if (typeof window !== 'undefined' && window.__shot) return;
    this.drawStrip(ctx);
    this.drawBoard(ctx);
  }

  // -- save -------------------------------------------------------------------

  toJSON() {
    return {
      heat: this.heat,
      notoriety: Math.round(this.notoriety),
      bribesPaid: this.bribesPaid,
      bribesTotal: this.bribesTotal,
      lockdownsSeen: this.lockdownsSeen,
      eventsSeen: this.eventsSeen,
      tipsBought: this.tipsBought,
    };
  }

  fromJSON(d) {
    if (!d || typeof d !== 'object') return;
    if (d.heat && typeof d.heat === 'object') {
      for (const dist of DISTRICTS) {
        if (typeof d.heat[dist.id] === 'number') this.heat[dist.id] = d.heat[dist.id];
      }
    }
    if (typeof d.notoriety === 'number') this.notoriety = d.notoriety;
    if (typeof d.bribesPaid === 'number') this.bribesPaid = d.bribesPaid;
    if (typeof d.bribesTotal === 'number') this.bribesTotal = d.bribesTotal;
    if (typeof d.lockdownsSeen === 'number') this.lockdownsSeen = d.lockdownsSeen;
    if (typeof d.eventsSeen === 'number') this.eventsSeen = d.eventsSeen;
    if (typeof d.tipsBought === 'number') this.tipsBought = d.tipsBought;
  }
}
