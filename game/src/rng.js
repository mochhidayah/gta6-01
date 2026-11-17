// Deterministic randomness for Palmera Bay.
//
// One seeded generator (mulberry32) drives the whole map build, so every
// load produces the same city, the same streets, the same parked cars —
// screenshots and playthroughs always show the same Palmera Bay.
export function seeded(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick one element of an array, uniformly.
export function choose(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// A float in [low, high).
export function between(rng, low, high) {
  return low + rng() * (high - low);
}

// An integer in [low, high], inclusive.
export function betweenInt(rng, low, high) {
  return low + Math.floor(rng() * (high - low + 1));
}

// A coin flip with probability p.
export function chance(rng, p) {
  return rng() < p;
}
