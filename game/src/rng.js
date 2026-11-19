// Deterministic randomness for Palmera Bay.
//
// One seeded generator (mulberry32) drives the whole map build, so
// every load produces the same city, the same streets, the same
// parked cars — screenshots and playthroughs always show the same
// Palmera Bay. v6 rewrote this file wholesale: same generator, same
// helpers, new order and new internal names. The math is untouched —
// change a constant here and the whole city moves.

// The generator itself: mulberry32, seeded once per build.
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

// A float in [low, high).
export function between(rng, low, high) {
  return low + (high - low) * rng();
}

// An integer in [low, high], inclusive.
export function betweenInt(rng, low, high) {
  const span = high - low + 1;
  return low + Math.floor(rng() * span);
}

// Pick one element of an array, uniformly.
export function choose(rng, pool) {
  const pick = Math.floor(rng() * pool.length);
  return pool[pick];
}

// A coin flip with probability p.
export function chance(rng, p) {
  return rng() < p;
}

// A shuffled copy of an array (Fisher-Yates), driven by the game's rng.
export function shuffle(rng, pool) {
  const deck = [...pool];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

// A bell-curve sample around `mean` with spread `spread`
// (Box-Muller over the seeded generator), clamped to [low, high].
export function gauss(rng, mean, spread, low, high) {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const v = mean + n * spread;
  return Math.max(low, Math.min(high, v));
}

// Pick one element, weighted: each item is {value, weight} and the
// odds follow the weights. Weights of 0 never win; a total of 0
// falls back to a uniform pick.
export function pickWeighted(rng, entries) {
  let sum = 0;
  for (const item of entries) sum += item.weight;
  if (sum <= 0) return choose(rng, entries.map((item) => item.value));
  let dart = rng() * sum;
  for (const item of entries) {
    dart -= item.weight;
    if (dart <= 0) return item.value;
  }
  return entries[entries.length - 1].value;
}
