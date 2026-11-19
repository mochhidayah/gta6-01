// Palmera Bay — tuning, palette and shared constants.
//
// Every number that shapes the game lives here, so the rest of the
// code reads like the design: the city is a grid of avenues and
// streets, the beach runs along the south edge, and the sun never
// quite sets.
export const WORLD = { width: 3600, height: 2600 };

// The road grid: avenue spacing, street spacing, road width.
export const ROAD = { width: 72, avenueGap: 340, streetGap: 300 };

// Where the sand starts and where the water starts, in world pixels.
export const SHORE = { sandY: 2320, waterY: 2480 };

// Palette — sun-soaked: warm grass, grey asphalt, pastel rooftops.
export const COLORS = {
  grass: '#7fae5a',
  grassShade: '#6f9c4c',
  asphalt: '#3a3a42',
  asphaltShade: '#33333a',
  laneMark: '#e8d44d',
  sidewalk: '#9a938a',
  sand: '#e8cf9a',
  sea: '#2e7fa8',
  seaDeep: '#256b90',
  parkGreen: '#5d9448',
  roofs: ['#c96f4a', '#b85c5c', '#7d8aa8', '#d9a441', '#8a7fb8', '#5f9e8a', '#a8b8c8', '#e07a5f'],
  buildingLine: '#2c2c34',
};

// How Marco moves on foot.
export const PLAYER_STATS = { walk: 170, sprint: 265, radius: 13, health: 100 };

// How cars handle: braking, reversing, steering bite and grip.
export const CAR_STATS = { brake: 700, reverseAccel: 260, topReverse: 160, steer: 2.6, grip: 6.5 };

// The wanted ladder: five stars, and how the heat cools off.
// Heat only falls while no police, foot cop or helicopter can see
// Marco — the PoliceDirector in police.js enforces that.
export const WANTED_RULES = {
  stars: 5,
  coolOffDelay: 12, // quiet seconds, unseen, before stars start to fall
  coolOffStep: 8, // seconds per star lost while hidden
};

// The starting economy: pocket cash, taxi fares and stash value.
export const ECONOMY = { startCash: 250, taxiMin: 60, taxiMax: 120, stashCash: 150 };

export const SNACK = { price: 15, heal: 25 };

// --- v3 systems: night driving, races, pickups, photo mode ---

// Night driving: the headlights reach this far down the road.
export const NIGHT = { headlightReach: 190, lampGlow: 46, fullDarkAlpha: 0.42 };

// Street racing: the stadium pad, the prize ladder, rival pace.
export const RACE = {
  padRadius: 150,
  checkRadius: 95,
  countdown: 3,
  rivals: 3,
  prizes: [800, 400, 150, 50],
  rivalTop: [392, 408, 425],
  heatOnFinish: 1,
};

// Pickups lying around the city: what they give, how fast they return.
export const PICKUP_RULES = { ammoRounds: 24, healthAmount: 50, cashAmount: 100, respawnSeconds: 50 };

// Photo mode: how fast the frozen camera pans across the city.
export const PHOTO = { panSpeed: 420 };

// Near misses: how close and how fast a pass has to be to pay.
export const NEAR_MISS = { range: 34, minSpeed: 300, reward: 10, cooldown: 2 };

export const SAVE_KEY = 'palmera-bay-save-v1';

// The car catalogue — every model invented for this game. Top speed
// and acceleration are in the game's own units; a taxi earns fares,
// a bike is fast and fragile, a bus is slow and nearly unkillable.
export const CAR_CATALOG = [
  { name: 'Falcon GT', color: '#e33f2f', top: 520, accel: 480 },
  { name: 'Marina Sedan', color: '#3f7fd0', top: 430, accel: 400 },
  { name: 'Harbor Taxi', color: '#f2c230', top: 420, accel: 390, taxi: true },
  { name: 'Dock Truck', color: '#7a8a99', top: 380, accel: 320 },
  { name: 'Palma Cruiser', color: '#e8e4da', top: 450, accel: 410 },
  { name: 'Sand Buggy', color: '#7fc24a', top: 470, accel: 430 },
  { name: 'Midnight Van', color: '#5a4a7a', top: 400, accel: 360 },
  { name: 'Coral Coupe', color: '#ff7fbf', top: 500, accel: 460 },
  { name: 'Bay Runner', color: '#ff8c1a', top: 560, accel: 560, bike: true },
  { name: 'City Bus', color: '#2e9e6b', top: 320, accel: 240, bus: true },
  { name: 'Sunset Pickup', color: '#d9a441', top: 460, accel: 430 },
];

// The armored van for the final job — slow, heavy, worth a fortune.
export const ARMORED_VAN = { name: 'Armadillo Van', color: '#8a8f7a', top: 360, accel: 300, van: true };

// First names for the pedestrians of Palmera Bay.
export const PED_NAMES = [
  'Marta', 'Dario', 'Yusuf', 'Carmen', 'Tomas', 'Lena', 'Rafi', 'Sofia',
  'Hector', 'Nadia', 'Paco', 'Iris', 'Bruno', 'Alba', 'Kiko', 'Rosa',
];

// Small math helpers used across the game.
export function clamp(value, low, high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

export function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

// Wrap an angle into [-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
