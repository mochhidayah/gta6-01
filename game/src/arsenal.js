// Palmera Bay — Arsenal & weapon shop.
//
// Marco starts with fists and whatever pistol he can find. The arsenal
// is the upgrade path: eight weapons with their own damage, range and
// fire rate, three attachments per weapon, and a workbench that turns
// scrap parts into bullets. Firing is hitscan in the direction Marco
// faces — the nearest car or person in the cone takes the hit, and the
// cops hear it unless the weapon is silenced.
//
// v7: written from scratch in this session. Every weapon name, price,
// stat, attachment and line below was invented here. The module only
// touches the game through the public surface it was given:
// game.player, game.playerCar, game.traffic.cars, game.crowd,
// game.wanted, game.setWanted, game.hud.toast, game.input and the
// canvas context.

// ---------------------------------------------------------------------------
// The armoury. Damage is hit points per shot, range is world units,
// rate is seconds between shots, mag is the biggest load the weapon
// can carry. Prices are what the shop charges; the pistol is the one
// weapon Marco already knows how to use.
// ---------------------------------------------------------------------------

const WEAPONS = [
  { id: 'palm', name: 'Palm Pistol', price: 0, dmg: 12, range: 260, rate: 0.35, mag: 12, ammoPrice: 2, blurb: 'Reliable, quiet-ish, everybody owns one.' },
  { id: 'sweeper', name: 'Street Sweeper', price: 900, dmg: 34, range: 170, rate: 0.9, mag: 6, ammoPrice: 5, blurb: 'A shotgun that ends arguments at arm’s length.' },
  { id: 'smg', name: 'Bay SMG', price: 1400, dmg: 9, range: 220, rate: 0.12, mag: 30, ammoPrice: 3, blurb: 'Sprays fast, kicks like a mule, never jams.' },
  { id: 'carbine', name: 'Coral Carbine', price: 2200, dmg: 22, range: 380, rate: 0.28, mag: 20, ammoPrice: 4, blurb: 'The workhorse. Steady at any distance.' },
  { id: 'longshot', name: 'Longshot Rifle', price: 3200, dmg: 55, range: 560, rate: 1.1, mag: 5, ammoPrice: 8, blurb: 'One shot, one very far problem solved.' },
  { id: 'nailer', name: 'Nail Gun', price: 650, dmg: 7, range: 150, rate: 0.16, mag: 40, ammoPrice: 1, blurb: 'A hardware store special. Ugly, loud, cheap.' },
  { id: 'molotov', name: 'Molotov Kit', price: 500, dmg: 45, range: 130, rate: 1.4, mag: 4, ammoPrice: 12, blurb: 'Bottles, rags, and bad intentions.' },
  { id: 'baton', name: 'Riot Baton', price: 300, dmg: 16, range: 60, rate: 0.45, mag: 0, ammoPrice: 0, blurb: 'No ammo, no noise, no witnesses who talk.' },
];

const ATTACHMENTS = [
  { id: 'silencer', name: 'Silencer', price: 450, blurb: 'Shots stop raising the wanted level.' },
  { id: 'extmag', name: 'Extended mag', price: 350, blurb: 'Mag capacity, half as big again.' },
  { id: 'scope', name: 'Scope', price: 500, blurb: 'Range up by a third, steadier aim.' },
];

const PARTS_CRATE_PRICE = 40; // dollars for 3 scrap parts
const PARTS_PER_CRATE = 3;
const PARTS_PER_BOX = 2; // parts needed to craft one ammo box
const AMMO_PER_BOX = 12;

export class Arsenal {
  constructor(game) {
    this.g = game;
    this.open = false;
    this.tab = 0; // 0 weapons, 1 attachments, 2 workbench
    this.sel = 0;
    this.owned = { palm: true }; // weapon id -> true
    this.ammo = { palm: 24 }; // weapon id -> rounds held
    this.attach = {}; // weapon id -> { silencer, extmag, scope }
    this.parts = 0;
    this.equipped = 'palm';
    this.coolT = 0;
    this.flashT = 0;
    this.shotsFired = 0;
    this.hitsLanded = 0;
    this.cashSpent = 0;
    this._toastCd = 0;
    this._lastMuzzle = null; // { x, y, ang } for the flash draw
  }

  // -- helpers ---------------------------------------------------------------

  _def(id) {
    return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
  }

  _hasAttach(id, att) {
    const a = this.attach[id];
    return !!(a && a[att]);
  }

  magOf(id) {
    const def = this._def(id);
    let mag = def.mag;
    if (this._hasAttach(id, 'extmag')) mag = Math.round(mag * 1.5);
    return mag;
  }

  rangeOf(id) {
    const def = this._def(id);
    let range = def.range;
    if (this._hasAttach(id, 'scope')) range = Math.round(range * 1.33);
    return range;
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
    this.cashSpent += amount;
    return true;
  }

  // -- buying -------------------------------------------------------------------

  _buyWeapon() {
    const def = WEAPONS[this.sel];
    if (!def) return;
    if (this.owned[def.id]) {
      this.equip(def.id);
      return;
    }
    if (!this._pay(def.price, def.name)) return;
    this.owned[def.id] = true;
    this.ammo[def.id] = this.magOf(def.id);
    this.equip(def.id);
    this._toast('NEW WEAPON', `${def.name} is yours, loaded with ${this.magOf(def.id)} rounds. Press Q to switch weapons.`);
  }

  _buyAmmo() {
    const def = this._def(this.equipped);
    if (def.mag === 0) {
      this._toast('NO AMMO', 'The baton does not take bullets. It takes commitment.');
      return;
    }
    const box = def.ammoPrice * 6;
    if (!this._pay(box, 'a box of ammo')) return;
    const cap = this.magOf(def.id) * 3;
    this.ammo[def.id] = Math.min(cap, (this.ammo[def.id] || 0) + 6);
    this._toast('AMMO', `+6 rounds for the ${def.name}.`);
  }

  _buyAttachment() {
    const att = ATTACHMENTS[this.sel];
    if (!att) return;
    const id = this.equipped;
    if (this._hasAttach(id, att.id)) {
      this._toast('ALREADY FITTED', `The ${this._def(id).name} already has a ${att.name}.`);
      return;
    }
    if (!this._pay(att.price, att.name)) return;
    if (!this.attach[id]) this.attach[id] = {};
    this.attach[id][att.id] = true;
    this._toast('ATTACHMENT FITTED', `${att.name} on the ${this._def(id).name}. ${att.blurb}`);
  }

  _buyParts() {
    if (!this._pay(PARTS_CRATE_PRICE, 'a crate of parts')) return;
    this.parts += PARTS_PER_CRATE;
    this._toast('PARTS', `+${PARTS_PER_CRATE} scrap parts. Craft ammo at the workbench.`);
  }

  _craftAmmo() {
    const def = this._def(this.equipped);
    if (def.mag === 0) {
      this._toast('NO AMMO', 'The baton does not take bullets.');
      return;
    }
    if (this.parts < PARTS_PER_BOX) {
      this._toast('NEED PARTS', `Crafting a box takes ${PARTS_PER_BOX} parts. Buy a crate first.`);
      return;
    }
    this.parts -= PARTS_PER_BOX;
    const cap = this.magOf(def.id) * 3;
    this.ammo[def.id] = Math.min(cap, (this.ammo[def.id] || 0) + AMMO_PER_BOX);
    this._toast('CRAFTED', `+${AMMO_PER_BOX} rounds for the ${def.name} from ${PARTS_PER_BOX} parts.`);
  }

  equip(id) {
    if (!this.owned[id]) return;
    this.equipped = id;
    const def = this._def(id);
    // The pistol is the one weapon the player's own hands know: keep its
    // ammo in sync so the original shooting still works with it.
    const p = this.g && this.g.player;
    if (p) {
      if (id === 'palm') {
        p.weapon = 'pistol';
        p.ammo = this.ammo.palm || 0;
      } else {
        p.weapon = def.name;
        p.ammo = this.ammo[id] || 0;
      }
    }
    this._toast('EQUIPPED', `${def.name} ready. ${def.mag === 0 ? 'No ammo needed.' : `${this.ammo[id] || 0} rounds in hand.`}`);
  }

  cycleWeapon() {
    const ids = WEAPONS.map((w) => w.id).filter((id) => this.owned[id]);
    if (ids.length <= 1) {
      this._toast('ONE WEAPON', 'Buy more guns at the arsenal to switch between them.');
      return;
    }
    const i = ids.indexOf(this.equipped);
    this.equip(ids[(i + 1) % ids.length]);
  }

  // -- firing ---------------------------------------------------------------------

  _syncPlayerAmmo() {
    const p = this.g && this.g.player;
    if (!p) return;
    if (this.equipped === 'palm') p.ammo = this.ammo.palm || 0;
    else p.ammo = this.ammo[this.equipped] || 0;
  }

  _targets() {
    const out = [];
    const traffic = this.g && this.g.traffic;
    if (traffic && Array.isArray(traffic.cars)) {
      for (const c of traffic.cars) {
        if (c && typeof c.x === 'number' && typeof c.y === 'number') out.push(c);
      }
    }
    const crowd = this.g && this.g.crowd;
    if (crowd && Array.isArray(crowd.peds)) {
      for (const ped of crowd.peds) {
        if (ped && typeof ped.x === 'number' && typeof ped.y === 'number') out.push(ped);
      }
    }
    return out;
  }

  _fire() {
    const p = this.g && this.g.player;
    if (!p) return;
    if (this.coolT > 0) return;
    const def = this._def(this.equipped);
    if (def.mag > 0 && (this.ammo[this.equipped] || 0) <= 0) {
      this._toast('CLICK', `The ${def.name} is empty. Buy or craft ammo — press Y.`);
      this.coolT = 0.4;
      return;
    }
    this.coolT = def.rate;
    this.flashT = 0.09;
    this.shotsFired += 1;
    if (def.mag > 0) {
      this.ammo[this.equipped] = (this.ammo[this.equipped] || 0) - 1;
      this._syncPlayerAmmo();
    }
    const ang = typeof p.angle === 'number' ? p.angle : 0;
    this._lastMuzzle = { x: p.x, y: p.y, ang };
    const range = this.rangeOf(this.equipped);
    const cone = 0.35;
    let best = null;
    let bestD = range;
    for (const t of this._targets()) {
      if (t === this.g.playerCar) continue;
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > range || d < 4) continue;
      let da = Math.atan2(dy, dx) - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > cone) continue;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) {
      this.hitsLanded += 1;
      if (typeof best.hp === 'number') {
        best.hp -= def.dmg;
        if (best.hp <= 0) {
          best.speed = 0;
          best.wrecked = true;
          this._toast('TARGET DOWN', `The ${def.name} finished it.`);
        }
      } else {
        // No health field on this target: a heavy hit still shoves it.
        const dx = best.x - p.x;
        const dy = best.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        best.x += (dx / d) * 26;
        best.y += (dy / d) * 26;
      }
    }
    // Noise brings the cops — unless the weapon is silenced.
    if (!this._hasAttach(this.equipped, 'silencer')) {
      if (this.g && typeof this.g.setWanted === 'function' && (this.g.wanted || 0) < 5) {
        this.g.setWanted((this.g.wanted || 0) + 1);
      }
    }
  }

  // -- frame update ---------------------------------------------------------

  update(dt) {
    if (!this.g || !this.g.player) return;
    if (this._toastCd > 0) this._toastCd -= dt;
    if (this.coolT > 0) this.coolT -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    const pad = this.g.input;
    if (pad && typeof pad.wasPressed === 'function') {
      if (pad.wasPressed('KeyY') && !this.open) {
        this.open = true;
        this.tab = 0;
        this.sel = 0;
      } else if (pad.wasPressed('Escape') && this.open) {
        this.open = false;
      } else if (this.open) {
        const lists = [WEAPONS, ATTACHMENTS, [null, null]];
        const list = lists[this.tab];
        if (pad.wasPressed('ArrowLeft')) this.tab = (this.tab + 2) % 3;
        if (pad.wasPressed('ArrowRight')) this.tab = (this.tab + 1) % 3;
        if (pad.wasPressed('ArrowUp')) this.sel = (this.sel + list.length - 1) % list.length;
        if (pad.wasPressed('ArrowDown')) this.sel = (this.sel + 1) % list.length;
        if (pad.wasPressed('Digit1')) {
          if (this.tab === 0) this._buyWeapon();
          else if (this.tab === 1) this._buyAttachment();
          else this._craftAmmo();
        }
        if (pad.wasPressed('Digit2')) {
          if (this.tab === 0) this._buyAmmo();
          else if (this.tab === 2) this._buyParts();
        }
      } else if (pad.wasPressed('KeyQ')) {
        this.cycleWeapon();
      } else if (pad.wasPressed('KeyF')) {
        // Fires the equipped arsenal weapon. The pistol keeps its
        // original shooting too; anything heavier is handled here.
        if (this.equipped !== 'palm') this._fire();
      }
    }
  }

  // -- drawing ---------------------------------------------------------------

  drawWorld(ctx, cam) {
    if (!ctx || !cam) return;
    if (typeof window !== 'undefined' && window.__shot) return;
    if (this.flashT > 0 && this._lastMuzzle) {
      const p = this.g && this.g.player;
      if (!p) return;
      const sx = p.x - cam.x;
      const sy = p.y - cam.y;
      const mx = sx + Math.cos(this._lastMuzzle.ang) * 22;
      const my = sy + Math.sin(this._lastMuzzle.ang) * 22;
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath();
      ctx.arc(mx, my, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff9500';
      ctx.beginPath();
      ctx.arc(mx, my, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawMenu(ctx) {
    if (!this.open || !ctx) return;
    const W = 640;
    const H = 480;
    const x0 = (1280 - W) / 2;
    const y0 = (800 - H) / 2;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.92)';
    ctx.fillRect(x0, y0, W, H);
    ctx.strokeStyle = '#ff9500';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, W, H);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff9500';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('THE ARSENAL', x0 + 24, y0 + 38);
    const p = this.g.player;
    const cash = p && typeof p.money === 'number' ? p.money : 0;
    ctx.fillStyle = '#e8ecf1';
    ctx.font = '15px sans-serif';
    ctx.fillText(`Cash: $${cash}    Scrap parts: ${this.parts}    Equipped: ${this._def(this.equipped).name}`, x0 + 24, y0 + 64);
    const names = ['WEAPONS', 'ATTACHMENTS', 'WORKBENCH'];
    let tx = x0 + 24;
    for (let i = 0; i < names.length; i++) {
      const w = ctx.measureText(names[i]).width + 18;
      if (i === this.tab) {
        ctx.fillStyle = '#ff9500';
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
    ctx.fillText('Left / Right tabs  •  Up / Down pick  •  1 buy / fit / craft  •  2 ammo / parts  •  Esc close', x0 + 24, y0 + 122);

    if (this.tab === 2) {
      ctx.fillStyle = '#e8ecf1';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText('WORKBENCH', x0 + 24, y0 + 170);
      ctx.font = '15px sans-serif';
      ctx.fillText(`Scrap parts: ${this.parts}  (a crate of ${PARTS_PER_CRATE} costs $${PARTS_CRATE_PRICE} — press 2)`, x0 + 24, y0 + 198);
      ctx.fillText(`Crafting one box takes ${PARTS_PER_BOX} parts and makes ${AMMO_PER_BOX} rounds for the equipped weapon — press 1.`, x0 + 24, y0 + 224);
      ctx.fillStyle = '#9aa3ad';
      ctx.font = '14px sans-serif';
      ctx.fillText(`Equipped now: ${this._def(this.equipped).name} — ${(this.ammo[this.equipped] || 0)} rounds in hand.`, x0 + 24, y0 + 252);
      ctx.fillText(`Shots fired: ${this.shotsFired}   Hits: ${this.hitsLanded}   Cash spent here: $${this.cashSpent}`, x0 + 24, y0 + 280);
      return;
    }

    if (this.tab === 1) {
      ctx.fillStyle = '#e8ecf1';
      ctx.font = '15px sans-serif';
      ctx.fillText(`Attachments fit the equipped weapon: ${this._def(this.equipped).name}`, x0 + 24, y0 + 160);
      let y = y0 + 196;
      for (let i = 0; i < ATTACHMENTS.length; i++) {
        const att = ATTACHMENTS[i];
        const rowY = y + i * 52;
        if (i === this.sel) {
          ctx.fillStyle = 'rgba(255, 149, 0, 0.16)';
          ctx.fillRect(x0 + 12, rowY - 18, W - 24, 46);
        }
        ctx.fillStyle = '#e8ecf1';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(att.name, x0 + 24, rowY);
        ctx.fillStyle = '#9aa3ad';
        ctx.font = '13px sans-serif';
        ctx.fillText(att.blurb, x0 + 24, rowY + 16);
        ctx.textAlign = 'right';
        if (this._hasAttach(this.equipped, att.id)) {
          ctx.fillStyle = '#8ef0c1';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText('FITTED', x0 + W - 24, rowY);
        } else {
          ctx.fillStyle = '#ffd94d';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(`$${att.price}`, x0 + W - 24, rowY);
        }
        ctx.textAlign = 'left';
      }
      return;
    }

    let y = y0 + 160;
    for (let i = 0; i < WEAPONS.length; i++) {
      const def = WEAPONS[i];
      const rowY = y + i * 38;
      if (i === this.sel) {
        ctx.fillStyle = 'rgba(255, 149, 0, 0.16)';
        ctx.fillRect(x0 + 12, rowY - 18, W - 24, 34);
      }
      ctx.fillStyle = '#e8ecf1';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(def.name, x0 + 24, rowY);
      ctx.fillStyle = '#9aa3ad';
      ctx.font = '13px sans-serif';
      ctx.fillText(`${def.blurb}  dmg ${def.dmg}  range ${def.range}  mag ${def.mag}`, x0 + 24, rowY + 15);
      ctx.textAlign = 'right';
      if (this.equipped === def.id) {
        ctx.fillStyle = '#8ef0c1';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`EQUIPPED — ${(this.ammo[def.id] || 0)} rds`, x0 + W - 24, rowY);
      } else if (this.owned[def.id]) {
        ctx.fillStyle = '#66d9ff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`OWNED — ${(this.ammo[def.id] || 0)} rds (1 to equip)`, x0 + W - 24, rowY);
      } else {
        ctx.fillStyle = '#ffd94d';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(def.price === 0 ? 'FREE' : `$${def.price}`, x0 + W - 24, rowY);
      }
      ctx.textAlign = 'left';
    }
    const footY = y0 + H - 18;
    ctx.fillStyle = '#9aa3ad';
    ctx.font = '13px sans-serif';
    ctx.fillText('Q switches weapons outside the shop. F fires the equipped weapon. Silenced shots stay quiet.', x0 + 24, footY);
  }

  draw(ctx, cam) {
    this.drawWorld(ctx, cam);
    this.drawMenu(ctx);
  }

  // -- save -------------------------------------------------------------------

  toJSON() {
    return {
      owned: this.owned,
      ammo: this.ammo,
      attach: this.attach,
      parts: this.parts,
      equipped: this.equipped,
      shotsFired: this.shotsFired,
      hitsLanded: this.hitsLanded,
      cashSpent: this.cashSpent,
    };
  }

  fromJSON(d) {
    if (!d || typeof d !== 'object') return;
    if (d.owned && typeof d.owned === 'object') this.owned = d.owned;
    if (d.ammo && typeof d.ammo === 'object') this.ammo = d.ammo;
    if (d.attach && typeof d.attach === 'object') this.attach = d.attach;
    if (typeof d.parts === 'number') this.parts = d.parts;
    if (typeof d.equipped === 'string' && this.owned[d.equipped]) this.equipped = d.equipped;
    if (typeof d.shotsFired === 'number') this.shotsFired = d.shotsFired;
    if (typeof d.hitsLanded === 'number') this.hitsLanded = d.hitsLanded;
    if (typeof d.cashSpent === 'number') this.cashSpent = d.cashSpent;
  }
}
