// Palmera Bay — the city, built as districts.
//
// One fixed seed builds the whole map, so every load shows the same
// town: the same streets, the same towers, the same parks. Five
// districts give it shape — Downtown towers in the middle, Old Town
// cottages along the west edge, Uptown houses to the north-east, a
// low Marina strip along the sand, and two parks where the grid
// breathes. Under it all the roads stay a grid of avenues and
// streets, so driving, missions and the minimap all work the same.
import { WORLD, ROAD, SHORE, COLORS } from './config.js';
import { seeded, choose, between, betweenInt, chance } from './rng.js';

const SEED = 20261117;

// Avenues run north-south, streets east-west, and the grid stops
// short of the beach.
function makeGrid() {
  const avenues = [];
  const streets = [];
  let x = 220;
  while (x < WORLD.width - 120) {
    avenues.push(x);
    x += ROAD.avenueGap;
  }
  let y = 200;
  while (y < SHORE.sandY - 120) {
    streets.push(y);
    y += ROAD.streetGap;
  }
  return { avenues, streets };
}

const grid = makeGrid();
export const AVENUES = grid.avenues;
export const STREETS = grid.streets;

// Which column of the avenue grid holds this x, and which row of the
// street grid holds this y.
function columnOf(x) {
  let col = 0;
  let i = 0;
  while (i < AVENUES.length - 1) {
    if (x >= AVENUES[i]) col = i;
    i++;
  }
  return col;
}

function rowOf(y) {
  let row = 0;
  let i = 0;
  while (i < STREETS.length - 1) {
    if (y >= STREETS[i]) row = i;
    i++;
  }
  return row;
}

// District names, by block column and row. Downtown sits in the
// middle of the map, the Marina hugs the shore, Old Town holds the
// west edge, and everything else is Uptown.
export function districtAt(x, y) {
  const col = columnOf(x);
  const row = rowOf(y);
  if (row >= STREETS.length - 3) return 'marina';
  const central = col >= 3 && col <= 6 && row >= 1 && row <= 3;
  if (central) return 'downtown';
  if (col <= 2) return 'oldtown';
  return 'uptown';
}

// Is this point on asphalt (not on the beach)?
export function onRoad(x, y) {
  if (y > SHORE.sandY) return false;
  const half = ROAD.width / 2;
  let hit = false;
  for (const ax of AVENUES) if (Math.abs(x - ax) < half) hit = true;
  for (const sy of STREETS) if (Math.abs(y - sy) < half) hit = true;
  return hit;
}

export function inWater(x, y) {
  return y > SHORE.waterY;
}

export function onSand(x, y) {
  return y > SHORE.sandY && y <= SHORE.waterY;
}

// The nearest point on a road centre line to (x, y).
function nearestLine(value, lines) {
  let best = lines[0];
  let bestD = Infinity;
  for (const line of lines) {
    const d = Math.abs(value - line);
    if (d < bestD) {
      bestD = d;
      best = line;
    }
  }
  return { line: best, dist: bestD };
}

export function snapToRoad(x, y) {
  const ave = nearestLine(x, AVENUES);
  const street = nearestLine(y, STREETS);
  if (ave.dist <= street.dist) return { x: ave.line, y };
  return { x, y: street.line };
}

// Snap onto a road, then keep the point inside the drivable city.
export function roadPointNear(x, y) {
  const p = snapToRoad(x, y);
  const cx = Math.max(60, Math.min(WORLD.width - 60, p.x));
  const cy = Math.max(60, Math.min(SHORE.sandY - 60, p.y));
  return { x: cx, y: cy };
}

const ROOF_SIGNS = ['HOTEL', 'CAFÉ', 'MARKET', 'OFFICE', 'APTS', 'SHOP', 'GYM', 'DINER', 'BAR', 'STUDIO'];
const DOWNTOWN_SIGNS = ['TOWER', 'PLAZA', 'SUITES', 'CORP', 'HOTEL', 'CASINO'];

// How each district fills a block: how many buildings it splits
// into, how often they carry a roof sign, and how many trees it gets.
const DISTRICT_STYLE = {
  downtown: { minSplit: 1, maxSplit: 1, signChance: 0.8, signs: DOWNTOWN_SIGNS, trees: 0, lamps: 0.9 },
  marina: { minSplit: 1, maxSplit: 2, signChance: 0.5, signs: ROOF_SIGNS, trees: 1, lamps: 0.6 },
  oldtown: { minSplit: 2, maxSplit: 3, signChance: 0.35, signs: ROOF_SIGNS, trees: 3, lamps: 0.5 },
  uptown: { minSplit: 1, maxSplit: 2, signChance: 0.55, signs: ROOF_SIGNS, trees: 2, lamps: 0.7 },
};

// The two park blocks, by grid position.
const PARK_CELLS = [
  { col: 4, row: 2, big: true }, // Central Park, the city's green heart
  { col: 1, row: 4, big: false }, // Palm Court, a pocket park in Old Town
];

export class City {
  constructor() {
    const rand = seeded(SEED);
    this.buildings = []; // {x, y, w, h, color, sign, vents[], district, stories}
    this.trees = []; // {x, y, r}
    this.lamps = []; // {x, y}
    this.hydrants = []; // {x, y}
    this.benches = []; // {x, y, angle} — park benches
    this.park = null; // {x, y, w, h} — Central Park, the one the renderer draws
    this.parks = []; // both parks
    this.landmarks = {}; // named places the missions use
    this.build(rand);
  }

  build(rand) {
    const halfRoad = ROAD.width / 2;
    for (let col = 0; col < AVENUES.length - 1; col++) {
      for (let row = 0; row < STREETS.length - 1; row++) {
        const x0 = AVENUES[col] + halfRoad + 10;
        const x1 = AVENUES[col + 1] - halfRoad - 10;
        const y0 = STREETS[row] + halfRoad + 10;
        const y1 = STREETS[row + 1] - halfRoad - 10;
        const parkCell = PARK_CELLS.find((p) => p.col === col && p.row === row);
        if (parkCell) {
          this.makePark(rand, parkCell, x0, y0, x1, y1);
          continue;
        }
        const district = districtAt(x0 + 10, y0 + 10);
        this.fillBlock(rand, district, x0, y0, x1, y1);
      }
    }
    this.placeLandmarks();
    this.plantBeachPalms(rand);
  }

  // A park block: grass, scattered trees and a few benches facing the paths.
  makePark(rand, cell, x0, y0, x1, y1) {
    const park = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    this.parks.push(park);
    if (cell.big) this.park = park;
    const treeCount = cell.big ? 16 : 8;
    for (let i = 0; i < treeCount; i++) {
      this.trees.push({
        x: between(rand, x0 + 16, x1 - 16),
        y: between(rand, y0 + 16, y1 - 16),
        r: between(rand, 9, 16),
      });
    }
    const benchCount = cell.big ? 6 : 3;
    for (let i = 0; i < benchCount; i++) {
      this.benches.push({
        x: between(rand, x0 + 20, x1 - 20),
        y: between(rand, y0 + 20, y1 - 20),
        angle: choose(rand, [0, Math.PI / 2, Math.PI, -Math.PI / 2]),
      });
    }
  }

  // One city block, filled the way its district fills blocks: split
  // into one, two or three buildings, then a lamp, a hydrant and trees.
  fillBlock(rand, district, x0, y0, x1, y1) {
    const look = DISTRICT_STYLE[district];
    const pieces = betweenInt(rand, look.minSplit, look.maxSplit);
    switch (pieces) {
      case 1:
        this.addBuilding(rand, district, look, x0, y0, x1 - x0, y1 - y0);
        break;
      case 2: {
        if (chance(rand, 0.5)) {
          const midX = (x0 + x1) / 2;
          this.addBuilding(rand, district, look, x0, y0, midX - x0 - 8, y1 - y0);
          this.addBuilding(rand, district, look, midX + 8, y0, x1 - midX - 8, y1 - y0);
        } else {
          const midY = (y0 + y1) / 2;
          this.addBuilding(rand, district, look, x0, y0, x1 - x0, midY - y0 - 8);
          this.addBuilding(rand, district, look, x0, midY + 8, x1 - x0, y1 - midY - 8);
        }
        break;
      }
      default: {
        const midX = (x0 + x1) / 2;
        const midY = (y0 + y1) / 2;
        this.addBuilding(rand, district, look, x0, y0, midX - x0 - 8, midY - y0 - 8);
        this.addBuilding(rand, district, look, midX + 8, y0, x1 - midX - 8, midY - y0 - 8);
        this.addBuilding(rand, district, look, x0, midY + 8, x1 - x0, y1 - midY - 8);
        break;
      }
    }
    if (chance(rand, look.lamps)) this.lamps.push({ x: x0 - 4, y: y0 - 4 });
    if (chance(rand, 0.5)) this.hydrants.push({ x: x1 + 2, y: y1 + 2 });
    for (let i = 0; i < look.trees; i++) {
      if (chance(rand, 0.6)) {
        this.trees.push({ x: between(rand, x0, x1), y: y0 - 6, r: between(rand, 7, 11) });
      }
    }
  }

  addBuilding(rand, district, look, x, y, w, h) {
    if (w < 40 || h < 40) return;
    const vents = [];
    const ventCount = betweenInt(rand, 0, district === 'downtown' ? 4 : 3);
    for (let i = 0; i < ventCount; i++) {
      vents.push({
        x: between(rand, x + 10, x + w - 18),
        y: between(rand, y + 10, y + h - 18),
        s: between(rand, 6, 12),
      });
    }
    const color = choose(rand, COLORS.roofs);
    const sign = chance(rand, look.signChance) ? choose(rand, look.signs) : '';
    const stories = district === 'downtown' ? betweenInt(rand, 8, 20) : betweenInt(rand, 1, 4);
    this.buildings.push({
      x,
      y,
      w,
      h,
      color,
      sign,
      vents,
      district,
      stories,
    });
  }

  // Named landmarks — every one invented for this game.
  placeLandmarks() {
    const garage = roadPointNear(AVENUES[1], STREETS[1]);
    const club = roadPointNear(AVENUES[6], STREETS[2]);
    const bank = roadPointNear(AVENUES[3], STREETS[3]);
    const hospital = roadPointNear(AVENUES[2], STREETS[5]);
    const policeHQ = roadPointNear(AVENUES[5], STREETS[1]);
    const pawnshop = roadPointNear(AVENUES[7], STREETS[4]);
    const stadium = roadPointNear(AVENUES[8], STREETS[5]);
    this.landmarks = {
      garage, // Solano Garage
      marina: { x: AVENUES[8], y: SHORE.sandY - 90 }, // Coral Marina
      club, // Club Flamingo
      bank, // Palmera Reserve Bank
      docks: { x: AVENUES[9], y: SHORE.sandY - 70 }, // South Docks
      hospital, // Santa Luz Hospital
      policeHQ, // Bay Precinct HQ
      pawnshop, // Golden Palm Pawn
      airport: { x: AVENUES[0], y: STREETS[0] }, // Palmera Airfield
      stadium, // Bay Sharks Stadium
    };
  }

  // Palm rows along the beach, plus a few palms shading the Marina strip.
  plantBeachPalms(rand) {
    for (let x = 80; x < WORLD.width - 80; x += 90) {
      if (chance(rand, 0.8)) {
        this.trees.push({ x: x + between(rand, -20, 20), y: SHORE.sandY + 46, r: between(rand, 10, 15) });
      }
    }
  }

  // Push a circle out of any building it overlaps; null when clear.
  // Returns the smallest push-out vector.
  collideCircle(x, y, r) {
    for (const b of this.buildings) {
      // Quick reject: circle clear of the building's expanded box.
      const clear = x + r <= b.x || x - r >= b.x + b.w || y + r <= b.y || y - r >= b.y + b.h;
      if (clear) continue;
      const cx = Math.max(b.x, Math.min(x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 === 0) return this.pushFromInside(x, y, r, b);
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      return { x: dx * push, y: dy * push };
    }
    return null;
  }

  // The circle's centre is inside the building: leave along the
  // nearest face.
  pushFromInside(x, y, r, b) {
    const exits = [
      { x: -(x - b.x + r), y: 0 },
      { x: b.x + b.w - x + r, y: 0 },
      { x: 0, y: -(y - b.y + r) },
      { x: 0, y: b.y + b.h - y + r },
    ];
    let best = exits[0];
    let bestLen = Math.abs(best.x) + Math.abs(best.y);
    for (const g of exits) {
      const len = Math.abs(g.x) + Math.abs(g.y);
      if (len < bestLen) {
        bestLen = len;
        best = g;
      }
    }
    return best;
  }

  inPark(x, y) {
    const p = this.park;
    return x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h;
  }

  inAnyPark(x, y) {
    return this.parks.some((p) => x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h);
  }
}
