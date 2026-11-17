// Palmera Bay — tuning, palette and shared constants.
//
// Every number that shapes the game lives here, so the rest of the code
// reads like the design: the city is a grid of avenues and streets, the
// beach runs along the south edge, and the sun never quite sets.
export const WORLD = { width: 3600, height: 2600 };

// Road grid.
export const ROAD = { width: 72, avenueGap: 340, streetGap: 300 };
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

export const PLAYER_STATS = {
  walk: 170,
  sprint: 265,
  radius: 13,
  health: 100,
};

export const CAR_STATS = {
  brake: 700,
  reverseAccel: 260,
  topReverse: 160,
  steer: 2.6,
  grip: 6.5,
};

export const WANTED_RULES = {
  stars: 5,
  coolOffDelay: 12, // quiet seconds before stars start to fall
  coolOffStep: 8, // seconds per star lost while hidden
};

export const ECONOMY = {
  startCash: 250,
  taxiMin: 60,
  taxiMax: 120,
  stashCash: 150,
};

export const SAVE_KEY = 'palmera-bay-save-v1';

// The car catalogue — every model invented for this game.
export const CAR_CATALOG = [
  { name: 'Falcon GT', color: '#e33f2f', top: 520, accel: 480 },
  { name: 'Marina Sedan', color: '#3f7fd0', top: 430, accel: 400 },
  { name: 'Harbor Taxi', color: '#f2c230', top: 420, accel: 390, taxi: true },
  { name: 'Dock Truck', color: '#7a8a99', top: 380, accel: 320 },
  { name: 'Palma Cruiser', color: '#e8e4da', top: 450, accel: 410 },
  { name: 'Sand Buggy', color: '#7fc24a', top: 470, accel: 430 },
  { name: 'Midnight Van', color: '#5a4a7a', top: 400, accel: 360 },
  { name: 'Coral Coupe', color: '#ff7fbf', top: 500, accel: 460 },
];

// The armored van for the final job — slow, heavy, worth a fortune.
export const ARMORED_VAN = { name: 'Armadillo Van', color: '#8a8f7a', top: 360, accel: 300, van: true };

export const PED_NAMES = [
  'Marta', 'Dario', 'Yusuf', 'Carmen', 'Tomas', 'Lena', 'Rafi', 'Sofia',
  'Hector', 'Nadia', 'Paco', 'Iris', 'Bruno', 'Alba', 'Kiko', 'Rosa',
];

// Small math helpers used across the game.
export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

// Shortest-arc interpolation between two angles.
export function turnToward(from, to, t) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

// Wrap an angle into [-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
