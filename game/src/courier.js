// Courier runs: timed parcel deliveries, a side activity for drivers.
//
// A courier run picks two of the city's landmarks — collect the parcel
// at one, drop it at the other before the clock runs out. Pay scales
// with the distance, and the deadline is generous enough to drive
// there, but not to sightsee on the way. The run is a small state
// machine: pickup, then deliver, then done or expired. v6 rewrote
// this file wholesale — same jobs, same payouts, new internal names.
import { distSq } from './config.js';
import { shuffle } from './rng.js';

const SPOT_R = 80;
const MIN_SECS = 45; // seconds, even for a trip across the street
const MAX_SECS = 150; // seconds, even for a trip across the city
const FRAGILE_ODDS = 0.35; // odds a parcel is marked fragile
const FRAGILE_PAY = 1.5; // fragile jobs pay half again

// Turn a landmark key like 'policeHQ' into 'Police HQ' for the HUD.
function prettyName(key) {
  const words = key.replace(/([A-Z])/g, ' $1');
  return words.charAt(0).toUpperCase() + words.slice(1).trim();
}

function onMark(px, py, mark) {
  return distSq(px, py, mark.x, mark.y) < SPOT_R * SPOT_R;
}

// Pick two different landmarks and price the run from the distance
// between them. Returns {pickup, drop, pickupName, dropName, pay, timeLimit}.
export function makeCourierJob(dice, landmarks) {
  const keys = shuffle(dice, Object.keys(landmarks));
  const first = keys[0];
  let second = keys[1];
  if (second === first) {
    const next = (keys.indexOf(first) + 4) % keys.length;
    second = keys[next];
  }
  const pickup = landmarks[first];
  const drop = landmarks[second];
  const span = Math.hypot(drop.x - pickup.x, drop.y - pickup.y);
  // About a third of the parcels are fragile: a hard crash smashes
  // them, but the client pays half again for the careful drive.
  const breakable = dice() < FRAGILE_ODDS;
  const pay = Math.round((80 + Math.round(span / 12)) * (breakable ? FRAGILE_PAY : 1));
  const timeLimit = Math.max(MIN_SECS, Math.min(MAX_SECS, Math.round(span / 14)));
  return { pickup, drop, pickupName: first, dropName: second, pay, timeLimit, fragile: breakable };
}

export class CourierRun {
  constructor(run) {
    this.pickup = run.pickup;
    this.drop = run.drop;
    this.pickupName = prettyName(run.pickupName);
    this.dropName = prettyName(run.dropName);
    this.pay = run.pay;
    this.timeLimit = run.timeLimit;
    this.fragile = !!run.fragile; // fragile: a hard crash smashes the parcel
    this.elapsed = 0;
    this.stage = 'pickup'; // pickup | deliver | done | expired
  }

  // Where the marker should point right now.
  get target() {
    if (this.stage === 'pickup') return this.pickup;
    return this.drop;
  }

  get timeLeft() {
    const left = this.timeLimit - this.elapsed;
    return left > 0 ? left : 0;
  }

  // A fast delivery pays a speed bonus: half the time left, in
  // dollars, when more than half the clock is still on it.
  get speedBonus() {
    if (this.stage !== 'done') return 0;
    const left = this.timeLeft;
    if (left < this.timeLimit / 2) return 0;
    return Math.round(left / 2);
  }

  get label() {
    const mark = this.fragile ? ' (FRAGILE — no crashes!)' : '';
    if (this.stage === 'pickup') return `COURIER: collect the parcel at ${this.pickupName}${mark}`;
    if (this.stage === 'deliver') return `COURIER: deliver to ${this.dropName}${mark}`;
    return 'COURIER';
  }

  // Advance the run one frame. Returns 'picked', 'delivered',
  // 'expired', or null when nothing changed this frame.
  update(dt, px, py) {
    if (this.stage === 'done' || this.stage === 'expired') return null;
    this.elapsed += dt;
    if (this.elapsed > this.timeLimit) {
      this.stage = 'expired';
      return 'expired';
    }
    if (this.stage === 'pickup') {
      if (onMark(px, py, this.pickup)) {
        this.stage = 'deliver';
        return 'picked';
      }
      return null;
    }
    if (onMark(px, py, this.drop)) {
      this.stage = 'done';
      return 'delivered';
    }
    return null;
  }
}

// v7: courier runs now share the streets with empire delivery vans.
