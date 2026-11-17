// Palmera Bay — tuning, palette and shared constants.
// Everything here is original: our own city, names, story and art.
export const WORLD = { w: 3600, h: 2600 };

export const ROAD_W = 72;            // road width in px
export const AVE_GAP = 340;          // vertical avenue spacing
export const ST_GAP = 300;           // horizontal street spacing
export const BEACH_Y = 2320;         // sand starts here
export const WATER_Y = 2480;         // water starts here

export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#6f9c4c',
  asphalt: '#3a3a42',
  asphaltDark: '#33333a',
  lane: '#e8d44d',
  sidewalk: '#9a938a',
  sand: '#e8cf9a',
  water: '#2e7fa8',
  waterDeep: '#256b90',
  park: '#5d9448',
  buildingRoof: ['#c96f4a', '#b85c5c', '#7d8aa8', '#d9a441', '#8a7fb8', '#5f9e8a', '#a8b8c8', '#e07a5f'],
  buildingEdge: '#2c2c34',
};

export const PLAYER = {
  walkSpeed: 170,
  sprintSpeed: 265,
  radius: 13,
  maxHealth: 100,
};

export const CAR = {
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 460,
  maxReverse: 160,
  steerRate: 2.6,
  grip: 6.5,
};

export const WANTED = {
  maxStars: 5,
  decayDelay: 12,      // seconds of no crime before stars start falling
  decayStep: 8,        // seconds per star lost while hidden
};

export const MONEY = {
  start: 250,
  taxiFare: 60,
  packageBonus: 150,
};

export const SAVE_KEY = 'palmera-bay-save-v1';

// Colour names for the in-game car catalogue (all invented models).
export const CAR_MODELS = [
  { name: 'Comet GT', color: '#e33f2f', top: 520, accel: 480 },
  { name: 'Sunrise Sedan', color: '#3f7fd0', top: 430, accel: 400 },
  { name: 'Bayside Taxi', color: '#f2c230', top: 420, accel: 390, taxi: true },
  { name: 'Harbor Truck', color: '#7a8a99', top: 380, accel: 320 },
  { name: 'Palm Cruiser', color: '#e8e4da', top: 450, accel: 410 },
  { name: 'Dune Buggy', color: '#7fc24a', top: 470, accel: 430 },
  { name: 'Night Van', color: '#5a4a7a', top: 400, accel: 360 },
  { name: 'Coral Coupe', color: '#ff7fbf', top: 500, accel: 460 },
];

export const PED_NAMES = [
  'Marta', 'Dario', 'Yusuf', 'Carmen', 'Tomas', 'Lena', 'Rafi', 'Sofia',
  'Hector', 'Nadia', 'Paco', 'Iris', 'Bruno', 'Alba', 'Kiko', 'Rosa',
];

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
