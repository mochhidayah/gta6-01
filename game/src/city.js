// Palmera Bay — the city, built as districts.
//
// The map still comes from one fixed seed, so it never changes between
// loads. But the town is no longer a uniform grid of identical blocks.
// Five districts shape it: Downtown towers in the middle, Old Town
// cottages on the west side, Uptown houses to the north-east, a low
// Marina strip along the sand, and two parks where the grid breathes.
// The roads stay a grid of avenues and streets, so driving, missions
// and the minimap all work exactly as before.
import { WORLD, ROAD, SHORE, COLORS } from './config.js';
import { seeded, choose, between, betweenInt, chance } from './rng.js';

const SEED = 20261117;

// Build the road centre lines: avenues run north-south, streets run
// east-west, and the grid stops short of the beach.
function buildGrid() {
  const avenues = [];
  const streets = [];
  for (let x = 220; x < WORLD.width - 120; x += ROAD.avenueGap) avenues.push(x);
  for (let y = 200; y < SHORE.sandY - 120; y += ROAD.streetGap) streets.push(y);
  return { avenues, streets };
}

const grid = buildGrid();
export const AVENUES = grid.avenues;
export const STREETS = grid.streets;

// District names, by block column and row. Downtown sits in the middle
// of the map, the Marina hugs the shore, Old Town holds the west edge,
// and everything else is Uptown.
export function districtAt(x, y) {
  const col = columnOf(x);
  const row = rowOf(y);
  if (row >= STREETS.length - 3) return 'marina';
  if (col >= 3 && col <= 6 && row >= 1 && row <= 3) return 'downtown';
  if (col <= 2) return 'oldtown';
  return 'uptown';
}

function columnOf(x) {
  let col = 0;
  for (let i = 0; i < AVENUES.length - 1; i++) {
    if (x >= AVENUES[i]) col = i;
  }
  return col;
}

function rowOf(y) {
  let row = 0;
  for (let i = 0; i < STREETS.length - 1; i++) {
    if (y >= STREETS[i]) row = i;
  }
  return row;
}

// Is this point on asphalt (not on the beach)?
export function onRoad(x, y) {
  if (y > SHORE.sandY) return false;
  const half = ROAD.width / 2;
  for (const ax of AVENUES) if (Math.abs(x - ax) < half) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) < half) return true;
  return false;
}

export function inWater(x, y) {
  return y > SHORE.waterY;
}

export function onSand(x, y) {
  return y > SHORE.sandY && y <= SHORE.waterY;
}

// The point on the nearest road centre line to (x, y).
export function snapToRoad(x, y) {
  let bestAve = AVENUES[0];
  let bestAveDist = Infinity;
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < bestAveDist) {
      bestAveDist = d;
      bestAve = ax;
    }
  }
  let bestStreet = STREETS[0];
  let bestStreetDist = Infinity;
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d < bestStreetDist) {
      bestStreetDist = d;
      bestStreet = sy;
    }
  }
  if (bestAveDist <= bestStreetDist) return { x: bestAve, y };
  return { x, y: bestStreet };
}

// Snap onto a road, then keep the point inside the drivable city.
export function roadPointNear(x, y) {
  const p = snapToRoad(x, y);
  return {
    x: Math.max(60, Math.min(WORLD.width - 60, p.x)),
    y: Math.max(60, Math.min(SHORE.sandY - 60, p.y)),
  };
}

const ROOF_SIGNS = ['HOTEL', 'CAFÉ', 'MARKET', 'OFFICE', 'APTS', 'SHOP', 'GYM', 'DINER', 'BAR', 'STUDIO'];
const DOWNTOWN_SIGNS = ['TOWER', 'PLAZA', 'SUITES', 'CORP', 'HOTEL', 'CASINO'];

// How each district fills a block: footprint style, roof signs, trees.
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
    const rng = seeded(SEED);
    this.buildings = []; // {x, y, w, h, color, sign, vents[], district, stories}
    this.trees = []; // {x, y, r}
    this.lamps = []; // {x, y}
    this.hydrants = []; // {x, y}
    this.benches = []; // {x, y, angle} — park benches
    this.park = null; // {x, y, w, h} — Central Park, the one the renderer draws
    this.parks = []; // both parks
    this.landmarks = {}; // named places the missions use
    this.build(rng);
  }

  build(rng) {
    const halfRoad = ROAD.width / 2;
    for (let col = 0; col < AVENUES.length - 1; col++) {
      for (let row = 0; row < STREETS.length - 1; row++) {
        const x0 = AVENUES[col] + halfRoad + 10;
        const x1 = AVENUES[col + 1] - halfRoad - 10;
        const y0 = STREETS[row] + halfRoad + 10;
        const y1 = STREETS[row + 1] - halfRoad - 10;
        const parkCell = PARK_CELLS.find((p) => p.col === col && p.row === row);
        if (parkCell) {
          this.makePark(rng, parkCell, x0, y0, x1, y1);
          continue;
        }
        this.fillBlock(rng, districtAt(x0 + 10, y0 + 10), x0, y0, x1, y1);
      }
    }
    this.placeLandmarks();
    this.plantBeachPalms(rng);
  }

  // A park block: grass, scattered trees and a few benches facing the paths.
  makePark(rng, cell, x0, y0, x1, y1) {
    const park = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    this.parks.push(park);
    if (cell.big) this.park = park;
    const treeCount = cell.big ? 16 : 8;
    for (let i = 0; i < treeCount; i++) {
      this.trees.push({
        x: between(rng, x0 + 16, x1 - 16),
        y: between(rng, y0 + 16, y1 - 16),
        r: between(rng, 9, 16),
      });
    }
    const benchCount = cell.big ? 6 : 3;
    for (let i = 0; i < benchCount; i++) {
      this.benches.push({
        x: between(rng, x0 + 20, x1 - 20),
        y: between(rng, y0 + 20, y1 - 20),
        angle: choose(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]),
      });
    }
  }

  // One city block, filled the way its district fills blocks.
  fillBlock(rng, district, x0, y0, x1, y1) {
    const style = DISTRICT_STYLE[district];
    const pieces = betweenInt(rng, style.minSplit, style.maxSplit);
    if (pieces === 1) {
      this.addBuilding(rng, district, style, x0, y0, x1 - x0, y1 - y0);
    } else if (pieces === 2) {
      if (chance(rng, 0.5)) {
        const midX = (x0 + x1) / 2;
        this.addBuilding(rng, district, style, x0, y0, midX - x0 - 8, y1 - y0);
        this.addBuilding(rng, district, style, midX + 8, y0, x1 - midX - 8, y1 - y0);
      } else {
        const midY = (y0 + y1) / 2;
        this.addBuilding(rng, district, style, x0, y0, x1 - x0, midY - y0 - 8);
        this.addBuilding(rng, district, style, x0, midY + 8, x1 - x0, y1 - midY - 8);
      }
    } else {
      const midX = (x0 + x1) / 2;
      const midY = (y0 + y1) / 2;
      this.addBuilding(rng, district, style, x0, y0, midX - x0 - 8, midY - y0 - 8);
      this.addBuilding(rng, district, style, midX + 8, y0, x1 - midX - 8, midY - y0 - 8);
      this.addBuilding(rng, district, style, x0, midY + 8, x1 - x0, y1 - midY - 8);
    }
    if (chance(rng, style.lamps)) this.lamps.push({ x: x0 - 4, y: y0 - 4 });
    if (chance(rng, 0.5)) this.hydrants.push({ x: x1 + 2, y: y1 + 2 });
    for (let i = 0; i < style.trees; i++) {
      if (chance(rng, 0.6)) {
        this.trees.push({ x: between(rng, x0, x1), y: y0 - 6, r: between(rng, 7, 11) });
      }
    }
  }

  addBuilding(rng, district, style, x, y, w, h) {
    if (w < 40 || h < 40) return;
    const vents = [];
    const ventCount = betweenInt(rng, 0, district === 'downtown' ? 4 : 3);
    for (let i = 0; i < ventCount; i++) {
      vents.push({
        x: between(rng, x + 10, x + w - 18),
        y: between(rng, y + 10, y + h - 18),
        s: between(rng, 6, 12),
      });
    }
    this.buildings.push({
      x,
      y,
      w,
      h,
      color: choose(rng, COLORS.roofs),
      sign: chance(rng, style.signChance) ? choose(rng, style.signs) : '',
      vents,
      district,
      stories: district === 'downtown' ? betweenInt(rng, 8, 20) : betweenInt(rng, 1, 4),
    });
  }

  // Named landmarks — every one invented for this game.
  placeLandmarks() {
    this.landmarks = {
      garage: roadPointNear(AVENUES[1], STREETS[1]), // Solano Garage
      marina: { x: AVENUES[8], y: SHORE.sandY - 90 }, // Coral Marina
      club: roadPointNear(AVENUES[6], STREETS[2]), // Club Flamingo
      bank: roadPointNear(AVENUES[3], STREETS[3]), // Palmera Reserve Bank
      docks: { x: AVENUES[9], y: SHORE.sandY - 70 }, // South Docks
      hospital: roadPointNear(AVENUES[2], STREETS[5]), // Santa Luz Hospital
      policeHQ: roadPointNear(AVENUES[5], STREETS[1]), // Bay Precinct HQ
      pawnshop: roadPointNear(AVENUES[7], STREETS[4]), // Golden Palm Pawn
      airport: { x: AVENUES[0], y: STREETS[0] }, // Palmera Airfield
      stadium: roadPointNear(AVENUES[8], STREETS[5]), // Bay Sharks Stadium
    };
  }

  // Palm rows along the beach, plus a few palms shading the Marina strip.
  plantBeachPalms(rng) {
    for (let x = 80; x < WORLD.width - 80; x += 90) {
      if (chance(rng, 0.8)) {
        this.trees.push({ x: x + between(rng, -20, 20), y: SHORE.sandY + 46, r: between(rng, 10, 15) });
      }
    }
  }

  // Push a circle out of any building it overlaps; null when clear.
  // Returns the smallest push-out vector.
  collideCircle(x, y, r) {
    for (const b of this.buildings) {
      // Quick reject: circle clear of the building's expanded box.
      if (x + r <= b.x || x - r >= b.x + b.w || y + r <= b.y || y - r >= b.y + b.h) continue;
      const cx = Math.max(b.x, Math.min(x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 === 0) {
        // Centre inside the building: leave along the nearest face.
        const gaps = [
          { x: -(x - b.x + r), y: 0 },
          { x: b.x + b.w - x + r, y: 0 },
          { x: 0, y: -(y - b.y + r) },
          { x: 0, y: b.y + b.h - y + r },
        ];
        let best = gaps[0];
        let bestLen = Math.abs(best.x) + Math.abs(best.y);
        for (const g of gaps) {
          const len = Math.abs(g.x) + Math.abs(g.y);
          if (len < bestLen) {
            bestLen = len;
            best = g;
          }
        }
        return best;
      }
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      return { x: dx * push, y: dy * push };
    }
    return null;
  }

  inPark(x, y) {
    const p = this.park;
    return x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h;
  }

  inAnyPark(x, y) {
    return this.parks.some((p) => x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h);
  }
}
