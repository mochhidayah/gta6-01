// Palmera Bay — Garage & vehicle customization.
//
// A lock-up under the Coral Bay overpass where Marco can spend money on
// the cars he steals. Paint, wheels, engine work, armour plating and a
// nitro tank, saved per car model so a build follows the car, not the
// driver. Nitro is the part that changes how the game feels: a tank of
// it, a key to burn it, and a very visible burst of speed down the
// boulevard. Everything else is honest bookkeeping — the build is real
// even when the part is cosmetic.
//
// v7: written from scratch in this session. Every paint name, price,
// part name and number below was invented here. The module only touches
// the game through the public surface it was given: game.player,
// game.playerCar, game.hud.toast, game.input and the canvas context.

// ---------------------------------------------------------------------------
// The parts catalogue. Paints are named after the bay; wheels after the
// shops that sell them; engines, armour and nitro are sold in tiers so a
// build has somewhere to grow.
// ---------------------------------------------------------------------------

const PAINTS = [
  { name: 'Bay Mint', hex: '#7fe0b2', price: 150 },
  { name: 'Coral Sunset', hex: '#ff7a59', price: 150 },
  { name: 'Midnight Palm', hex: '#2b3a67', price: 200 },
  { name: 'Taxi Yellow', hex: '#f5c542', price: 120 },
  { name: 'Shark Grey', hex: '#8d99ae', price: 120 },
  { name: 'Neon Pink', hex: '#ff4fd8', price: 250 },
  { name: 'Harbour Teal', hex: '#2ec4b6', price: 200 },
  { name: 'Ghost White', hex: '#eef1f4', price: 180 },
];

const WHEELS = [
  { name: 'Steel stock', price: 0, grip: 0 },
  { name: 'Chrome rims', price: 220, grip: 1 },
  { name: 'Lowriders', price: 380, grip: 2 },
  { name: 'Track slicks', price: 520, grip: 3 },
  { name: 'Gold spinners', price: 900, grip: 2 },
];

const ENGINES = [
  { name: 'Stock block', price: 0, boost: 0 },
  { name: 'Tuned intake', price: 600, boost: 1 },
  { name: 'Twin turbo', price: 1400, boost: 2 },
  { name: 'Race crate motor', price: 2600, boost: 3 },
];

const ARMOUR = [
  { name: 'Factory panels', price: 0, plates: 0 },
  { name: 'Door bars', price: 500, plates: 1 },
  { name: 'Full plating', price: 1100, plates: 2 },
  { name: 'Armoured shell', price: 2000, plates: 3 },
];

const NITRO_TANK = 100; // one full tank, in percent
const NITRO_REFILL = 180; // dollars to fill a tank
const NITRO_DRAIN = 34; // percent per second while burning
const NITRO_ACCEL = 620; // extra speed per second while burning
const REPAIR_COST = 240;

// Selling a fitted part back returns half what it cost. The shop keeps
// the other half — that is the business model.
const SELLBACK_RATE = 0.5;

function freshBuild() {
  return { paint: 0, wheels: 0, engine: 0, armour: 0, nitro: 0 };
}

export class Garage {
  constructor(game) {
    this.g = game;
    this.open = false;
    this.tab = 0; // 0 paint, 1 wheels, 2 engine, 3 armour, 4 nitro
    this.sel = 0;
    this.builds = {}; // model key -> build
    this.carsCustomized = 0;
    this.nitroBurned = 0; // total seconds of nitro burned, lifetime
    this.boostT = 0; // seconds of boost left in the current burn
    this._toastCd = 0;
    this._seenModels = {}; // model key -> true, for the customized count
    // The showroom log: the last few things fitted, newest first, so a
    // build has a history instead of just a state.
    this.log = [];
    this.cashEarnedSelling = 0;
    this.repairsDone = 0;
  }

  _log(text) {
    this.log.unshift(text);
    if (this.log.length > 5) this.log.length = 5;
  }

  // Sell the fitted part on the current tab back to the shop for half
  // its price. The car falls back to the stock part.
  _sellBack() {
    const car = this._car();
    if (!car) return;
    const b = this.buildFor(car);
    const lists = [PAINTS, WHEELS, ENGINES, ARMOUR];
    if (this.tab >= 4) {
      this._toast('NOTHING TO SELL', 'Nitro cannot be sold back — it is already in the tank.');
      return;
    }
    const list = lists[this.tab];
    const ownedIdx = [b.paint, b.wheels, b.engine, b.armour][this.tab];
    const part = list[ownedIdx];
    if (!part || part.price === 0) {
      this._toast('NOTHING TO SELL', 'The stock part has no resale value.');
      return;
    }
    const refund = Math.floor(part.price * SELLBACK_RATE);
    const p = this.g && this.g.player;
    if (p && typeof p.money === 'number') p.money += refund;
    this.cashEarnedSelling += refund;
    if (this.tab === 0) b.paint = 0;
    else if (this.tab === 1) b.wheels = 0;
    else if (this.tab === 2) b.engine = 0;
    else b.armour = 0;
    this._apply(car);
    this._log(`Sold ${part.name} back for $${refund}`);
    this._toast('SOLD', `${part.name} sold back for $${refund}. Stock part refitted.`);
  }

  // -- helpers ---------------------------------------------------------------

  _car() {
    const p = this.g && this.g.player;
    if (!p || !p.inCar) return null;
    return this.g.playerCar || null;
  }

  _modelKey(car) {
    if (!car) return 'foot';
    const m = typeof car.modelIndex === 'number' ? car.modelIndex : 0;
    return `m${m}`;
  }

  buildFor(car) {
    const k = this._modelKey(car);
    if (!this.builds[k]) this.builds[k] = freshBuild();
    return this.builds[k];
  }

  _toast(title, body) {
    if (this._toastCd > 0) return;
    this._toastCd = 0.4;
    if (this.g && this.g.hud && typeof this.g.hud.toast === 'function') {
      this.g.hud.toast(title, body, 4);
    }
  }

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

  _noteCustomized(car) {
    const k = this._modelKey(car);
    if (!this._seenModels[k]) {
      this._seenModels[k] = true;
      this.carsCustomized += 1;
    }
  }

  // Apply a build to the live car object. The renderer reads the colour
  // field if it has one; setting an unknown field is harmless in JS, so
  // this works whether or not the car model exposes paint.
  _apply(car) {
    if (!car) return;
    const b = this.buildFor(car);
    const paint = PAINTS[b.paint] || PAINTS[0];
    car.color = paint.hex;
    car.paint = paint.hex;
    car.paintName = paint.name;
    car.wheelGrip = (WHEELS[b.wheels] || WHEELS[0]).grip;
    car.engineTier = (ENGINES[b.engine] || ENGINES[0]).boost;
    car.armourPlates = (ARMOUR[b.armour] || ARMOUR[0]).plates;
  }

  // -- buying -----------------------------------------------------------------

  _buyCurrent() {
    const car = this._car();
    if (!car) {
      this._toast('NO CAR', 'Get in a car first, then open the garage.');
      return;
    }
    const b = this.buildFor(car);
    if (this.tab === 0) {
      const part = PAINTS[this.sel];
      if (!part || b.paint === this.sel) return;
      if (!this._pay(part.price, part.name)) return;
      b.paint = this.sel;
      this._apply(car);
      this._noteCustomized(car);
      this._log(`Painted a car ${part.name}`);
      this._toast('PAINTED', `This ride is now ${part.name}.`);
    } else if (this.tab === 1) {
      const part = WHEELS[this.sel];
      if (!part || b.wheels === this.sel) return;
      if (!this._pay(part.price, part.name)) return;
      b.wheels = this.sel;
      this._apply(car);
      this._noteCustomized(car);
      this._log(`Fitted ${part.name}`);
      this._toast('WHEELS FITTED', `${part.name} are on. Grip feels better already.`);
    } else if (this.tab === 2) {
      const part = ENGINES[this.sel];
      if (!part || b.engine === this.sel) return;
      if (!this._pay(part.price, part.name)) return;
      b.engine = this.sel;
      this._apply(car);
      this._noteCustomized(car);
      this._log(`Swapped in a ${part.name}`);
      this._toast('ENGINE SWAPPED', `${part.name} is in. The nitro hits harder now.`);
    } else if (this.tab === 3) {
      const part = ARMOUR[this.sel];
      if (!part || b.armour === this.sel) return;
      if (!this._pay(part.price, part.name)) return;
      b.armour = this.sel;
      this._apply(car);
      this._noteCustomized(car);
      this._log(`Bolted on ${part.name}`);
      this._toast('ARMOURED', `${part.name} bolted on. Cops will have to work for it.`);
    } else if (this.tab === 4) {
      if (b.nitro >= NITRO_TANK) {
        this._toast('TANK FULL', 'The nitro tank is already full.');
        return;
      }
      if (!this._pay(NITRO_REFILL, 'a nitro refill')) return;
      b.nitro = NITRO_TANK;
      this._toast('NITRO FILLED', 'Tank full. Hold F while driving to burn it.');
    }
  }

  _repair() {
    const car = this._car();
    if (!car) return;
    if (!this._pay(REPAIR_COST, 'a full repair')) return;
    if (typeof car.hp === 'number') {
      const max = typeof car.maxHp === 'number' ? car.maxHp : car.hp + 200;
      car.hp = max;
    }
    car.smoke = false;
    car.wrecked = false;
    this.repairsDone += 1;
    this._log('Repaired a car to showroom condition');
    this._toast('REPAIRED', 'Good as new. Try not to scratch it this time.');
  }

  // -- nitro -------------------------------------------------------------------

  _tryBoost() {
    const car = this._car();
    if (!car) return;
    const b = this.buildFor(car);
    if (b.nitro <= 0) {
      this._toast('NO NITRO', 'The tank is empty. Buy a refill in the garage.');
      return;
    }
    if (this.boostT > 0) return;
    this.boostT = 0.9;
  }

  _boostTick(dt) {
    const car = this._car();
    if (!car) {
      this.boostT = 0;
      return;
    }
    const b = this.buildFor(car);
    if (this.boostT > 0 && b.nitro > 0 && typeof car.speed === 'number') {
      const engine = (ENGINES[b.engine] || ENGINES[0]).boost;
      const accel = NITRO_ACCEL * (1 + engine * 0.45);
      car.speed += accel * dt;
      b.nitro = Math.max(0, b.nitro - NITRO_DRAIN * dt);
      this.nitroBurned += dt;
      this.boostT -= dt;
      // Sparks and a little shake sell the burn; the speed does the rest.
      if (Math.random() < 0.6 && this.g.hud) {
        // No HUD spam: the exhaust flash is drawn by drawWorld below.
      }
    } else {
      this.boostT = 0;
    }
  }

  // -- frame update ---------------------------------------------------------

  update(dt) {
    if (!this.g || !this.g.player) return;
    if (this._toastCd > 0) this._toastCd -= dt;
    const pad = this.g.input;
    if (pad && typeof pad.wasPressed === 'function') {
      if (pad.wasPressed('KeyG') && !this.open) {
        if (!this._car()) {
          this._toast('NO CAR', 'Get in a car first, then press G for the garage.');
        } else {
          this.open = true;
          this.tab = 0;
          this.sel = 0;
        }
      } else if (pad.wasPressed('Escape') && this.open) {
        this.open = false;
      } else if (this.open) {
        const lists = [PAINTS, WHEELS, ENGINES, ARMOUR, [null]];
        const list = lists[this.tab];
        if (pad.wasPressed('ArrowLeft')) this.tab = (this.tab + 4) % 5;
        if (pad.wasPressed('ArrowRight')) this.tab = (this.tab + 1) % 5;
        if (pad.wasPressed('ArrowUp')) this.sel = (this.sel + list.length - 1) % list.length;
        if (pad.wasPressed('ArrowDown')) this.sel = (this.sel + 1) % list.length;
        if (pad.wasPressed('Digit1')) this._buyCurrent();
        if (pad.wasPressed('Digit2')) this._repair();
        if (pad.wasPressed('Digit3')) this._sellBack();
      } else if (pad.wasPressed('KeyF')) {
        this._tryBoost();
      }
    }
    this._boostTick(dt);
  }

  // -- drawing ---------------------------------------------------------------

  _tabList() {
    return [PAINTS, WHEELS, ENGINES, ARMOUR, null];
  }

  _tabNames() {
    return ['PAINT', 'WHEELS', 'ENGINE', 'ARMOUR', 'NITRO'];
  }

  drawWorld(ctx, cam) {
    if (!ctx || !cam) return;
    if (typeof window !== 'undefined' && window.__shot) return;
    // Nitro exhaust flash while burning.
    const car = this._car();
    if (!car || this.boostT <= 0) return;
    const sx = car.x - cam.x;
    const sy = car.y - cam.y;
    if (sx < -40 || sx > 1320 || sy < -40 || sy > 840) return;
    const ang = typeof car.angle === 'number' ? car.angle : 0;
    const bx = sx - Math.cos(ang) * 26;
    const by = sy - Math.sin(ang) * 26;
    ctx.fillStyle = '#66d9ff';
    ctx.beginPath();
    ctx.arc(bx, by, 7 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.arc(bx, by, 3 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  drawMenu(ctx) {
    if (!this.open || !ctx) return;
    const car = this._car();
    const W = 620;
    const H = 440;
    const x0 = (1280 - W) / 2;
    const y0 = (800 - H) / 2;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.92)';
    ctx.fillRect(x0, y0, W, H);
    ctx.strokeStyle = '#66d9ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, W, H);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#66d9ff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('CORAL BAY GARAGE', x0 + 24, y0 + 38);
    const p = this.g.player;
    const cash = p && typeof p.money === 'number' ? p.money : 0;
    ctx.fillStyle = '#e8ecf1';
    ctx.font = '15px sans-serif';
    ctx.fillText(`Cash: $${cash}`, x0 + 24, y0 + 64);
    if (!car) {
      ctx.fillStyle = '#ff6b61';
      ctx.font = '15px sans-serif';
      ctx.fillText('You walked out of the car. The menu stays open — get back in to fit parts.', x0 + 24, y0 + 92);
    }
    const names = this._tabNames();
    let tx = x0 + 24;
    for (let i = 0; i < names.length; i++) {
      const w = ctx.measureText(names[i]).width + 18;
      if (i === this.tab) {
        ctx.fillStyle = '#66d9ff';
        ctx.fillRect(tx - 6, y0 + 78, w, 26);
        ctx.fillStyle = '#101418';
      } else {
        ctx.fillStyle = '#9aa3ad';
      }
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(names[i], tx, y0 + 97);
      tx += w + 14;
    }
    ctx.fillStyle = '#9aa3ad';
    ctx.font = '13px sans-serif';
    ctx.fillText('Left / Right tabs  •  Up / Down pick  •  1 buy or fill  •  2 repair ($240)  •  3 sell fitted part back  •  Esc close', x0 + 24, y0 + 122);
    const b = car ? this.buildFor(car) : freshBuild();
    if (this.tab === 4) {
      ctx.fillStyle = '#e8ecf1';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText('NITRO TANK', x0 + 24, y0 + 170);
      ctx.fillStyle = '#222a33';
      ctx.fillRect(x0 + 24, y0 + 186, W - 48, 26);
      ctx.fillStyle = '#66d9ff';
      ctx.fillRect(x0 + 24, y0 + 186, (W - 48) * (b.nitro / NITRO_TANK), 26);
      ctx.fillStyle = '#e8ecf1';
      ctx.font = '15px sans-serif';
      ctx.fillText(`${Math.round(b.nitro)}% full — press 1 to refill for $${NITRO_REFILL}`, x0 + 24, y0 + 236);
      ctx.fillStyle = '#9aa3ad';
      ctx.font = '14px sans-serif';
      ctx.fillText('Burn it with F while driving. A bigger engine makes the burn hit harder.', x0 + 24, y0 + 262);
      ctx.fillText(`Lifetime nitro burned: ${Math.round(this.nitroBurned)}s`, x0 + 24, y0 + 288);
      ctx.fillText(`Cars customized: ${this.carsCustomized}`, x0 + 24, y0 + 314);
      return;
    }
    const list = this._tabList()[this.tab];
    const ownedIdx = [b.paint, b.wheels, b.engine, b.armour][this.tab];
    let y = y0 + 160;
    for (let i = 0; i < list.length; i++) {
      const part = list[i];
      const rowY = y + i * 40;
      if (i === this.sel) {
        ctx.fillStyle = 'rgba(102, 217, 255, 0.16)';
        ctx.fillRect(x0 + 12, rowY - 18, W - 24, 34);
      }
      if (this.tab === 0) {
        ctx.fillStyle = part.hex;
        ctx.fillRect(x0 + 24, rowY - 12, 18, 14);
      }
      ctx.fillStyle = '#e8ecf1';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(part.name, x0 + (this.tab === 0 ? 52 : 24), rowY);
      ctx.textAlign = 'right';
      if (i === ownedIdx) {
        ctx.fillStyle = '#8ef0c1';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('FITTED', x0 + W - 24, rowY);
      } else {
        ctx.fillStyle = '#ffd94d';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(part.price === 0 ? 'FREE' : `$${part.price}`, x0 + W - 24, rowY);
      }
      ctx.textAlign = 'left';
      if (this.tab === 1) {
        ctx.fillStyle = '#9aa3ad';
        ctx.font = '12px sans-serif';
        ctx.fillText(`grip +${part.grip}`, x0 + W - 150, rowY);
      }
      if (this.tab === 2) {
        ctx.fillStyle = '#9aa3ad';
        ctx.font = '12px sans-serif';
        ctx.fillText(`nitro power +${part.boost}`, x0 + W - 150, rowY);
      }
      if (this.tab === 3) {
        ctx.fillStyle = '#9aa3ad';
        ctx.font = '12px sans-serif';
        ctx.fillText(`plates ${part.plates}`, x0 + W - 150, rowY);
      }
    }
    const footY = y0 + H - 18;
    ctx.fillStyle = '#9aa3ad';
    ctx.font = '13px sans-serif';
    const cur = list[ownedIdx];
    ctx.fillText(`On this car now: ${cur ? cur.name : '—'}   •   Repair the car any time with 2 ($${REPAIR_COST})`, x0 + 24, footY);
    // Showroom log: the most recent thing fitted to any car.
    if (this.log.length > 0) {
      ctx.fillStyle = '#66d9ff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('SHOWROOM LOG', x0 + 24, y0 + H - 52);
      ctx.fillStyle = '#9aa3ad';
      ctx.font = '12px sans-serif';
      ctx.fillText(`• ${this.log[0]}`, x0 + 24, y0 + H - 36);
    }
  }

  draw(ctx, cam) {
    this.drawWorld(ctx, cam);
    this.drawMenu(ctx);
  }

  // -- save -------------------------------------------------------------------

  toJSON() {
    return {
      builds: this.builds,
      carsCustomized: this.carsCustomized,
      nitroBurned: Math.round(this.nitroBurned),
      log: this.log,
      cashEarnedSelling: this.cashEarnedSelling,
      repairsDone: this.repairsDone,
    };
  }

  fromJSON(d) {
    if (!d || typeof d !== 'object') return;
    if (d.builds && typeof d.builds === 'object') this.builds = d.builds;
    if (typeof d.carsCustomized === 'number') this.carsCustomized = d.carsCustomized;
    if (typeof d.nitroBurned === 'number') this.nitroBurned = d.nitroBurned;
    if (Array.isArray(d.log)) this.log = d.log;
    if (typeof d.cashEarnedSelling === 'number') this.cashEarnedSelling = d.cashEarnedSelling;
    if (typeof d.repairsDone === 'number') this.repairsDone = d.repairsDone;
  }
}
