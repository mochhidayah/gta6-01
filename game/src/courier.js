// Courier runs: timed parcel deliveries, a side activity for drivers.
//
// A courier job picks two of the city's landmarks — collect the parcel
// at one, drop it at the other before the clock runs out. Pay scales
// with the distance, and the deadline is generous enough to drive
// there, but not to sightsee on the way. The run is a small state
// machine: pickup, then deliver, then done or expired.
import { distSq } from './config.js';

const MARKER_RADIUS = 80;
const MIN_TIME = 45; // seconds, even for a trip across the street
const MAX_TIME = 150; // seconds, even for a trip across the city

// Pick two different landmarks and price the job from the distance
// between them. Returns {pickup, drop, pickupName, dropName, pay, timeLimit}.
export function makeCourierJob(rng, landmarks) {
  const names = Object.keys(landmarks);
  const pickupName = names[Math.floor(rng() * names.length)];
  let dropName = names[Math.floor(rng() * names.length)];
  if (dropName === pickupName) {
    const next = (names.indexOf(pickupName) + 4) % names.length;
    dropName = names[next];
  }
  const pickup = landmarks[pickupName];
  const drop = landmarks[dropName];
  const distance = Math.hypot(drop.x - pickup.x, drop.y - pickup.y);
  const pay = 80 + Math.round(distance / 12);
  const timeLimit = Math.max(MIN_TIME, Math.min(MAX_TIME, Math.round(distance / 14)));
  return { pickup, drop, pickupName, dropName, pay, timeLimit };
}

// Turn a landmark key like 'policeHQ' into 'Police HQ' for the HUD.
function prettyName(key) {
  const spaced = key.replace(/([A-Z])/g, ' $1');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).trim();
}

function near(px, py, spot) {
  return distSq(px, py, spot.x, spot.y) < MARKER_RADIUS * MARKER_RADIUS;
}

export class CourierRun {
  constructor(job) {
    this.pickup = job.pickup;
    this.drop = job.drop;
    this.pickupName = prettyName(job.pickupName);
    this.dropName = prettyName(job.dropName);
    this.pay = job.pay;
    this.timeLimit = job.timeLimit;
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

  get label() {
    if (this.stage === 'pickup') return `COURIER: collect the parcel at ${this.pickupName}`;
    if (this.stage === 'deliver') return `COURIER: deliver to ${this.dropName}`;
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
      if (near(px, py, this.pickup)) {
        this.stage = 'deliver';
        return 'picked';
      }
      return null;
    }
    if (near(px, py, this.drop)) {
      this.stage = 'done';
      return 'delivered';
    }
    return null;
  }
}
