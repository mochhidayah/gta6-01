// Deterministic randomness for Palmera Bay.
//
// One seeded generator (mulberry32) drives the whole map build, so
// every load produces the same city, the same streets, the same
// parked cars — screenshots and playthroughs always show the same
// Palmera Bay. v5 rewrote this file wholesale: same generator, same
// helpers, new order and new internal names. The math is untouched —
// change a constant here and the whole city moves.

// The generator itself: mulberry32, seeded once per build.
export function seeded(seed) {
  let acc = seed >>> 0;
  return function next() {
    acc |= 0;
    acc = (acc + 0x6d2b79f5) | 0;
    let mix = Math.imul(acc ^ (acc >>> 15), 1 | acc);
    mix = (mix + Math.imul(mix ^ (mix >>> 7), 61 | mix)) ^ mix;
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
  };
}

// A bell-curve sample around `mean` with spread `spread`
// (Box-Muller over the seeded generator), clamped to [low, high].
export function gauss(rng, mean, spread, low, high) {
  const first = Math.max(rng(), 1e-9);
  const second = rng();
  const z = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
  const sampled = mean + z * spread;
  return Math.max(low, Math.min(high, sampled));
}

// Pick one element, weighted: each item is {value, weight} and the
// odds follow the weights. Weights of 0 never win; a total of 0
// falls back to a uniform pick.
export function pickWeighted(rng, entries) {
  let total = 0;
  for (const item of entries) total += item.weight;
  if (total <= 0) return choose(rng, entries.map((item) => item.value));
  let roll = rng() * total;
  for (const item of entries) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return entries[entries.length - 1].value;
}

// A shuffled copy of an array (Fisher-Yates), driven by the game's rng.
export function shuffle(rng, pool) {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const held = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = held;
  }
  return shuffled;
}

// A coin flip with probability p.
export function chance(rng, p) {
  return rng() < p;
}

// Pick one element of an array, uniformly.
export function choose(rng, pool) {
  const slot = Math.floor(rng() * pool.length);
  return pool[slot];
}

// An integer in [low, high], inclusive.
export function betweenInt(rng, low, high) {
  const range = high - low + 1;
  return low + Math.floor(rng() * range);
}

// A float in [low, high).
export function between(rng, low, high) {
  return low + (high - low) * rng();
}
