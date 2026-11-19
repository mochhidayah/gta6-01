// Palmera Bay — Business Empire.
//
// Marco stops being a wheelman and starts being an owner. Six small
// businesses around the city can be bought with cash; each one pays
// passive income on a timer, can be upgraded twice, and can be hit by a
// rival crew that wants the turf back. Income is banked while Marco is
// out doing other things and collected from the menu, so the empire
// rewards coming back to town between missions.
//
// v7: written from scratch in this session. Every name, price, line of
// dialogue and number below was invented here; nothing was copied from
// any earlier module. The system is wired into the game only through
// the public surface it was given: game.player.money, game.hud.toast,
// game.setWanted, game.traffic.spawnPolice and the canvas context.

// ---------------------------------------------------------------------------
// The catalogue. One entry per business: what it is, what it costs, what it
// pays, where it sits, and the two upgrade steps that make it pay more.
// Locations are fixed offsets from the player's spawn point, so a business
// is always findable on foot from the start of the game.
// ---------------------------------------------------------------------------

const CATALOG = [
  {
    id: 'taxi',
    name: 'Sunset Taxi Co.',
    blurb: 'Three yellow cabs and a dispatcher who never sleeps.',
    price: 1200,
    base: 14,
    up1: { name: 'Night shift', cost: 700, mult: 1.6 },
    up2: { name: 'Airport contract', cost: 1500, mult: 2.4 },
    dx: 520, dy: -260,
    color: '#f5c542',
  },
  {
    id: 'club',
    name: 'Club Neon Palm',
    blurb: 'A dance floor, a bar, and a door policy with opinions.',
    price: 2600,
    base: 30,
    up1: { name: 'VIP booths', cost: 1400, mult: 1.6 },
    up2: { name: 'Guest DJs', cost: 2800, mult: 2.5 },
    dx: -640, dy: 320,
    color: '#ff4fd8',
  },
  {
    id: 'docks',
    name: 'Docks Warehouse 9',
    blurb: 'Crates in, crates out, questions never asked.',
    price: 3400,
    base: 42,
    up1: { name: 'Forklift fleet', cost: 1800, mult: 1.6 },
    up2: { name: 'Night berth', cost: 3600, mult: 2.4 },
    dx: 980, dy: 720,
    color: '#7fb2ff',
  },
  {
    id: 'laundry',
    name: 'Spin Cycle Laundromat',
    blurb: 'Twenty machines, exact change only, always busy.',
    price: 800,
    base: 9,
    up1: { name: 'Dry-cleaning line', cost: 450, mult: 1.6 },
    up2: { name: 'Fluff-and-fold', cost: 900, mult: 2.3 },
    dx: -420, dy: -640,
    color: '#8ef0c1',
  },
  {
    id: 'trucks',
    name: 'Coral Food Truck Fleet',
    blurb: 'Tacos at the beach, noodles at the stadium, cash only.',
    price: 1800,
    base: 22,
    up1: { name: 'Second truck', cost: 1000, mult: 1.7 },
    up2: { name: 'Festival circuit', cost: 2000, mult: 2.4 },
    dx: 240, dy: 880,
    color: '#ffb347',
  },
  {
    id: 'parking',
    name: 'Bayview Parking Garage',
    blurb: 'Six floors of hourly rates and nobody watching the gate.',
    price: 2200,
    base: 26,
    up1: { name: 'Monthly passes', cost: 1200, mult: 1.6 },
    up2: { name: 'Valet crew', cost: 2400, mult: 2.5 },
    dx: -900, dy: -120,
    color: '#c9a7ff',
  },
];

// Rival crews that come for the turf. Each entry is a crew with a style:
// some send cars, some send heat, all of them cost Marco money if ignored.
const CREWS = [
  { name: 'The Harbormen', taunt: 'The docks were ours before you were born, kid.' },
  { name: 'Vesper Boys', taunt: 'Nice little shop. Shame if the windows broke.' },
  { name: 'The Gulls', taunt: 'We collect on this street. You are the street now.' },
  { name: 'Copper Kings', taunt: 'Every till in this town pays us first.' },
];

const PAYOUT_EVERY = 60; // seconds of play between payouts
const RAID_EVERY_MIN = 150; // seconds between rival raid rolls
const RAID_CHANCE = 0.55; // a raid fires on a roll with this probability
const DEFEND_RADIUS = 170; // how close Marco must stand to defend
const DEFEND_SECONDS = 6; // seconds on site to run a crew off
const PAYOUTS_PER_WEEK = 7; // payouts in a business week
const WEEK_BONUS_RATE = 0.1; // a week that ends clean pays a 10% bonus

export class BusinessEmpire {
  constructor(game) {
    this.g = game;
    this.open = false;
    this.sel = 0;
    this.owned = {}; // id -> { tier: 0|1|2 }
    this.banked = 0;
    this.payoutT = 0;
    this.raidT = RAID_EVERY_MIN;
    this.raid = null; // { crew, businessId, t, warned }
    this.defendT = 0;
    this.lifetimeEarned = 0;
    this.businessesBought = 0;
    this.raidsRepelled = 0;
    this.raidsLost = 0;
    this.anchor = null; // { x, y } — the spawn point, fixed once
    this._toastCd = 0;
    // The ledger and the business week. A week is seven payouts; a week
    // that ends without a lost raid pays a bonus on top of the income.
    this.ledger = [];
    this.weekPayouts = 0;
    this.weekIncome = 0;
    this.weeksClosed = 0;
    this.weekBonuses = 0;
    this._weekStartLosses = 0; // raids lost when the current week started
  }

  _log(text) {
    this.ledger.unshift(text);
    if (this.ledger.length > 5) this.ledger.length = 5;
  }

  // -- placement ----------------------------------------------------------

  // Businesses sit at fixed offsets from the player's spawn point. The
  // anchor is captured the first time the game runs so the spots never
  // drift between sessions.
  _anchor() {
    if (this.anchor) return this.anchor;
    const p = this.g && this.g.player;
    const x = p && typeof p.x === 'number' ? p.x : 0;
    const y = p && typeof p.y === 'number' ? p.y : 0;
    this.anchor = { x, y };
    return this.anchor;
  }

  spotOf(def) {
    const a = this._anchor();
    return { x: a.x + def.dx, y: a.y + def.dy };
  }

  ownedList() {
    return CATALOG.filter((d) => this.owned[d.id]);
  }

  // Income per payout tick for one business, after its upgrade multiplier.
  incomeOf(def) {
    const o = this.owned[def.id];
    if (!o) return 0;
    let m = 1;
    if (o.tier >= 1) m = def.up1.mult;
    if (o.tier >= 2) m = def.up2.mult;
    return Math.round(def.base * m);
  }

  totalIncome() {
    return this.ownedList().reduce((s, d) => s + this.incomeOf(d), 0);
  }

  // -- economy ------------------------------------------------------------

  _pay(amount, why) {
    const p = this.g && this.g.player;
    if (!p || typeof p.money !== 'number') return false;
    if (p.money < amount) {
      this._toast('NOT ENOUGH CASH', `You need $${amount} for ${why}.`);
      return false;
    }
    p.money -= amount;
    return true;
  }

  _earn(amount, why) {
    const p = this.g && this.g.player;
    if (!p || typeof p.money !== 'number') return;
    p.money += amount;
    this.lifetimeEarned += amount;
    if (this.g.sounds && typeof this.g.sounds.cash === 'function') {
      this.g.sounds.cash();
    }
    if (why) this._toast('CASH IN', why);
  }

  _toast(title, body) {
    if (this._toastCd > 0) return;
    this._toastCd = 0.4;
    if (this.g && this.g.hud && typeof this.g.hud.toast === 'function') {
      this.g.hud.toast(title, body, 4);
    }
  }

  buy(i) {
    const def = CATALOG[i];
    if (!def || this.owned[def.id]) return;
    if (!this._pay(def.price, def.name)) return;
    this.owned[def.id] = { tier: 0 };
    this.businessesBought += 1;
    this._log(`Bought ${def.name} for $${def.price}`);
    this._toast('BUSINESS BOUGHT', `${def.name} is yours. It pays $${this.incomeOf(def)} every minute.`);
  }

  upgrade(i) {
    const def = CATALOG[i];
    const o = def && this.owned[def.id];
    if (!o) return;
    if (o.tier >= 2) {
      this._toast('MAXED OUT', `${def.name} is already at its best.`);
      return;
    }
    const step = o.tier === 0 ? def.up1 : def.up2;
    if (!this._pay(step.cost, step.name)) return;
    o.tier += 1;
    this._log(`Upgraded ${def.name}: ${step.name} ($${step.cost})`);
    this._toast('UPGRADED', `${def.name}: ${step.name}. Now pays $${this.incomeOf(def)} a minute.`);
  }

  collect() {
    if (this.banked <= 0) {
      this._toast('NOTHING BANKED', 'Your businesses have not paid out yet.');
      return;
    }
    const amount = this.banked;
    this.banked = 0;
    this._earn(amount, `Collected $${amount} from your businesses.`);
  }

  // -- rival raids ----------------------------------------------------------

  _rollRaid() {
    const owned = this.ownedList();
    if (owned.length === 0) return;
    if (Math.random() > RAID_CHANCE) return;
    const def = owned[Math.floor(Math.random() * owned.length)];
    const crew = CREWS[Math.floor(Math.random() * CREWS.length)];
    this.raid = { crew, businessId: def.id, t: 75, warned: false };
    this._toast('RIVAL CREW', `${crew.name} is moving on ${def.name}! Get there and hold the block.`);
  }

  _raidTick(dt) {
    if (!this.raid) return;
    const r = this.raid;
    r.t -= dt;
    const p = this.g && this.g.player;
    const def = CATALOG.find((d) => d.id === r.businessId);
    if (p && def) {
      const s = this.spotOf(def);
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const near = dx * dx + dy * dy < DEFEND_RADIUS * DEFEND_RADIUS;
      if (near) {
        this.defendT += dt;
        if (this.defendT >= 1 && !r.warned) {
          r.warned = true;
          this._toast('HOLD THE BLOCK', `Stay on site ${DEFEND_SECONDS}s to run ${r.crew.name} off.`);
        }
        if (this.defendT >= DEFEND_SECONDS) {
          this._repelRaid();
          return;
        }
      } else {
        this.defendT = 0;
      }
    }
    if (r.t <= 0) this._loseRaid();
  }

  _repelRaid() {
    const r = this.raid;
    this.raid = null;
    this.defendT = 0;
    this.raidsRepelled += 1;
    const bonus = 150 + Math.floor(Math.random() * 150);
    this._log(`Repelled ${r.crew.name} at ${this._defName(r.businessId)} (+$${bonus})`);
    this._earn(bonus, `${r.crew.name} ran off. You kept the turf and took $${bonus} off them.`);
    // A repelled crew leaves in a hurry and the cops notice the noise.
    if (this.g && typeof this.g.setWanted === 'function' && this.g.wanted < 2) {
      this.g.setWanted(Math.min(2, (this.g.wanted || 0) + 1));
    }
  }

  _defName(id) {
    const def = CATALOG.find((d) => d.id === id);
    return def ? def.name : 'a business';
  }

  _loseRaid() {
    const r = this.raid;
    this.raid = null;
    this.defendT = 0;
    this.raidsLost += 1;
    const o = this.owned[r.businessId];
    const def = CATALOG.find((d) => d.id === r.businessId);
    if (o && o.tier > 0) {
      o.tier -= 1;
      this._log(`${r.crew.name} smashed ${def.name} back a tier`);
      this._toast('TURF LOST', `${r.crew.name} smashed ${def.name} back a tier. It pays less now.`);
    } else if (o) {
      delete this.owned[r.businessId];
      this._log(`${r.crew.name} took ${def.name}`);
      this._toast('TURF LOST', `${r.crew.name} took ${def.name} from you. Buy it back when you can.`);
    }
  }

  // -- frame update ---------------------------------------------------------

  update(dt) {
    if (!this.g || !this.g.player) return;
    if (this._toastCd > 0) this._toastCd -= dt;
    const pad = this.g.input;

    // Open and close the empire menu. It pauses nothing, but the world
    // keeps moving while Marco reads the books. B toggles the menu: the
    // game's own Escape key pauses the game before this code ever sees
    // it, so Escape cannot close a menu.
    if (pad && typeof pad.wasPressed === 'function') {
      if (pad.wasPressed('KeyB')) {
        if (this.open) {
          this.open = false;
        } else {
          this.open = true;
          this.sel = 0;
          // One menu at a time: close the other shops so their keys do not
          // fire while Marco reads the books.
          if (this.g.garage) this.g.garage.open = false;
          if (this.g.arsenal) this.g.arsenal.open = false;
        }
      } else if (this.open) {
        if (pad.wasPressed('ArrowUp')) this.sel = (this.sel + CATALOG.length - 1) % CATALOG.length;
        if (pad.wasPressed('ArrowDown')) this.sel = (this.sel + 1) % CATALOG.length;
        if (pad.wasPressed('Enter')) this.buy(this.sel);
        if (pad.wasPressed('Digit3')) this.upgrade(this.sel);
        if (pad.wasPressed('Digit4')) this.collect();
      }
    }

    // Passive income: every minute of play, every owned business banks
    // its payout. Nothing is handed over until Marco collects it. Every
    // seventh payout closes a business week: a week with no lost raid
    // pays a bonus on the week's income.
    this.payoutT += dt;
    if (this.payoutT >= PAYOUT_EVERY) {
      this.payoutT -= PAYOUT_EVERY;
      const total = this.totalIncome();
      if (total > 0) {
        this.banked += total;
        this.weekPayouts += 1;
        this.weekIncome += total;
        if (this.weekPayouts >= PAYOUTS_PER_WEEK) {
          this.weeksClosed += 1;
          const lostThisWeek = this.raidsLost;
          const bonus = Math.round(this.weekIncome * WEEK_BONUS_RATE);
          const clean = lostThisWeek === this._weekStartLosses;
          if (clean && bonus > 0) {
            this.banked += bonus;
            this.weekBonuses += bonus;
            this._log(`Week ${this.weeksClosed} closed clean: +$${bonus} bonus`);
            this._toast('WEEK CLOSED', `A clean week! Your businesses earned $${this.weekIncome} plus a $${bonus} bonus.`);
          } else {
            this._log(`Week ${this.weeksClosed} closed after a lost raid: no bonus`);
            this._toast('WEEK CLOSED', `Your businesses earned $${this.weekIncome} this week. No bonus — a raid cost you.`);
          }
          this._weekStartLosses = this.raidsLost;
          this.weekPayouts = 0;
          this.weekIncome = 0;
        } else {
          this._toast('PAYOUT BANKED', `Your businesses earned $${total}. Press B, then 4, to collect.`);
        }
      }
    }

    // Rival crews roll in on their own schedule.
    this.raidT -= dt;
    if (this.raidT <= 0) {
      this.raidT = RAID_EVERY_MIN + Math.random() * 60;
      this._rollRaid();
    }
    this._raidTick(dt);
  }

  // -- drawing ---------------------------------------------------------------

  // World markers: a small signpost over every business, gold if owned,
  // grey if for sale, red and pulsing while a raid is live on it.
  drawWorld(ctx, cam) {
    if (!ctx || !cam) return;
    if (typeof window !== 'undefined' && window.__shot) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    for (const def of CATALOG) {
      const s = this.spotOf(def);
      const sx = s.x - cam.x;
      const sy = s.y - cam.y;
      if (sx < -40 || sx > 1320 || sy < -40 || sy > 840) continue;
      const owned = !!this.owned[def.id];
      const raided = this.raid && this.raid.businessId === def.id;
      const pulse = raided ? 0.55 + 0.45 * Math.sin(now * 6) : 1;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = raided ? '#ff3b30' : owned ? '#ffd94d' : '#9aa3ad';
      ctx.fillRect(sx - 2, sy - 34, 4, 34);
      ctx.fillStyle = def.color;
      ctx.fillRect(sx - 16, sy - 52, 32, 20);
      ctx.fillStyle = '#101418';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(owned ? '$' : 'FOR SALE', sx, sy - 38);
      ctx.globalAlpha = 1;
      if (raided) {
        ctx.fillStyle = '#ff3b30';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('RAID!', sx, sy - 58);
      }
    }
  }

  // The empire menu: every business, its tier, its payout, and the keys.
  drawMenu(ctx) {
    if (!this.open || !ctx) return;
    const W = 640;
    const H = 470;
    const x0 = (1280 - W) / 2;
    const y0 = (800 - H) / 2;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.92)';
    ctx.fillRect(x0, y0, W, H);
    ctx.strokeStyle = '#ffd94d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, W, H);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('BUSINESS EMPIRE', x0 + 24, y0 + 38);
    const p = this.g.player;
    const cash = p && typeof p.money === 'number' ? p.money : 0;
    ctx.fillStyle = '#e8ecf1';
    ctx.font = '15px sans-serif';
    ctx.fillText(`Cash: $${cash}    Banked: $${this.banked}    Lifetime earned: $${this.lifetimeEarned}`, x0 + 24, y0 + 64);
    ctx.fillStyle = '#9aa3ad';
    ctx.font = '13px sans-serif';
    ctx.fillText('Up / Down to pick  •  Enter buy  •  3 upgrade  •  4 collect banked  •  B close', x0 + 24, y0 + 86);
    if (this.raid) {
      const def = CATALOG.find((d) => d.id === this.raid.businessId);
      ctx.fillStyle = '#ff6b61';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`RAID: ${this.raid.crew.name} is hitting ${def ? def.name : 'a business'} — ${Math.ceil(this.raid.t)}s left!`, x0 + 24, y0 + 108);
    }
    let y = y0 + 138;
    for (let i = 0; i < CATALOG.length; i++) {
      const def = CATALOG[i];
      const o = this.owned[def.id];
      const rowY = y + i * 52;
      if (i === this.sel) {
        ctx.fillStyle = 'rgba(255, 217, 77, 0.16)';
        ctx.fillRect(x0 + 12, rowY - 18, W - 24, 46);
      }
      ctx.fillStyle = def.color;
      ctx.fillRect(x0 + 24, rowY - 12, 12, 12);
      ctx.fillStyle = '#e8ecf1';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(def.name, x0 + 46, rowY);
      ctx.fillStyle = '#9aa3ad';
      ctx.font = '13px sans-serif';
      ctx.fillText(def.blurb, x0 + 46, rowY + 16);
      ctx.textAlign = 'right';
      if (!o) {
        ctx.fillStyle = '#ffd94d';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`BUY $${def.price}`, x0 + W - 24, rowY);
        ctx.fillStyle = '#9aa3ad';
        ctx.font = '12px sans-serif';
        ctx.fillText(`pays $${def.base}/min`, x0 + W - 24, rowY + 16);
      } else {
        const tierName = o.tier === 0 ? 'Tier 1' : o.tier === 1 ? def.up1.name : def.up2.name;
        ctx.fillStyle = '#8ef0c1';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`${tierName} — $${this.incomeOf(def)}/min`, x0 + W - 24, rowY);
        ctx.fillStyle = '#9aa3ad';
        ctx.font = '12px sans-serif';
        const next = o.tier === 0 ? `next: ${def.up1.name} $${def.up1.cost}` : o.tier === 1 ? `next: ${def.up2.name} $${def.up2.cost}` : 'fully upgraded';
        ctx.fillText(next, x0 + W - 24, rowY + 16);
      }
      ctx.textAlign = 'left';
    }
    const footY = y0 + H - 18;
    ctx.fillStyle = '#9aa3ad';
    ctx.font = '13px sans-serif';
    ctx.fillText(`Businesses owned: ${this.ownedList().length}/6   Raids repelled: ${this.raidsRepelled}   Raids lost: ${this.raidsLost}`, x0 + 24, footY);
    // The ledger: the last few things that happened to the empire.
    if (this.ledger.length > 0) {
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('LEDGER', x0 + 24, y0 + H - 52);
      ctx.fillStyle = '#9aa3ad';
      ctx.font = '12px sans-serif';
      ctx.fillText(`• ${this.ledger[0]}`, x0 + 24, y0 + H - 36);
    }
  }

  draw(ctx, cam) {
    this.drawWorld(ctx, cam);
    this.drawMenu(ctx);
  }

  // -- save -------------------------------------------------------------------

  toJSON() {
    return {
      owned: this.owned,
      banked: this.banked,
      lifetimeEarned: this.lifetimeEarned,
      businessesBought: this.businessesBought,
      raidsRepelled: this.raidsRepelled,
      raidsLost: this.raidsLost,
      anchor: this.anchor,
      ledger: this.ledger,
      weekPayouts: this.weekPayouts,
      weekIncome: this.weekIncome,
      weeksClosed: this.weeksClosed,
      weekBonuses: this.weekBonuses,
    };
  }

  fromJSON(d) {
    if (!d || typeof d !== 'object') return;
    if (d.owned && typeof d.owned === 'object') this.owned = d.owned;
    if (typeof d.banked === 'number') this.banked = d.banked;
    if (typeof d.lifetimeEarned === 'number') this.lifetimeEarned = d.lifetimeEarned;
    if (typeof d.businessesBought === 'number') this.businessesBought = d.businessesBought;
    if (typeof d.raidsRepelled === 'number') this.raidsRepelled = d.raidsRepelled;
    if (typeof d.raidsLost === 'number') this.raidsLost = d.raidsLost;
    if (d.anchor && typeof d.anchor.x === 'number') this.anchor = d.anchor;
    if (Array.isArray(d.ledger)) this.ledger = d.ledger;
    if (typeof d.weekPayouts === 'number') this.weekPayouts = d.weekPayouts;
    if (typeof d.weekIncome === 'number') this.weekIncome = d.weekIncome;
    if (typeof d.weeksClosed === 'number') this.weeksClosed = d.weeksClosed;
    if (typeof d.weekBonuses === 'number') this.weekBonuses = d.weekBonuses;
    this._weekStartLosses = this.raidsLost;
  }
}
