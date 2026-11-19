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
  const index = Math.floor(rng() * list.length);
  return list[index];
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

// A coin flip with probability p.
export function chance(rng, p) {
  return rng() < p;
}

// Pick one element, weighted: each entry is {value, weight} and the
// odds follow the weights. Weights of 0 never win; a total of 0
// falls back to a uniform pick.
export function pickWeighted(rng, entries) {
  let total = 0;
  for (const e of entries) total += e.weight;
  if (total <= 0) return choose(rng, entries.map((e) => e.value));
  let roll = rng() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e.value;
  }
  return entries[entries.length - 1].value;
}

// A bell-curve sample around `mean` with spread `spread`
// (Box-Muller over the seeded generator), clamped to [low, high].
export function gauss(rng, mean, spread, low, high) {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const value = mean + z * spread;
  return Math.max(low, Math.min(high, value));
}

// A shuffled copy of an array (Fisher-Yates), driven by the game's rng.
export function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
