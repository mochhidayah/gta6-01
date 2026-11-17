// Palmera Bay — the city: roads, blocks, buildings, beach, park, props.
//
// The whole map is generated from one fixed seed, so it never changes
// between loads. The city is a grid: vertical avenues and horizontal
// streets, a park block in the middle, and Coral Bay along the south edge.
import { WORLD, ROAD, SHORE, COLORS } from './config.js';
import { seeded, choose, between, betweenInt, chance } from './rng.js';

// Centre lines of the road grid, built once at import time.
export const AVENUES = [];
export const STREETS = [];
for (let x = 220; x < WORLD.width - 120; x += ROAD.avenueGap) AVENUES.push(x);
for (let y = 200; y < SHORE.sandY - 120; y += ROAD.streetGap) STREETS.push(y);

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

export class City {
  constructor() {
    const rng = seeded(20261117);
    this.buildings = []; // {x, y, w, h, color, sign, vents[]}
    this.trees = []; // {x, y, r}
    this.lamps = []; // {x, y}
    this.hydrants = []; // {x, y}
    this.park = null; // {x, y, w, h}
    this.landmarks = {}; // named places the missions use
    this.build(rng);
  }

  build(rng) {
    // One park block, right in the middle of town.
    const parkCol = 4;
    const parkRow = 2;
    const halfRoad = ROAD.width / 2;
    const park = {
      x: AVENUES[parkCol] + halfRoad + 8,
      y: STREETS[parkRow] + halfRoad + 8,
      w: AVENUES[parkCol + 1] - AVENUES[parkCol] - ROAD.width - 16,
      h: STREETS[parkRow + 1] - STREETS[parkRow] - ROAD.width - 16,
    };
    this.park = park;

    for (let col = 0; col < AVENUES.length - 1; col++) {
      for (let row = 0; row < STREETS.length - 1; row++) {
        const x0 = AVENUES[col] + halfRoad + 10;
        const x1 = AVENUES[col + 1] - halfRoad - 10;
        const y0 = STREETS[row] + halfRoad + 10;
        const y1 = STREETS[row + 1] - halfRoad - 10;
        if (col === parkCol && row === parkRow) {
          for (let i = 0; i < 14; i++) {
            this.trees.push({
              x: between(rng, x0 + 14, x1 - 14),
              y: between(rng, y0 + 14, y1 - 14),
              r: between(rng, 9, 15),
            });
          }
          continue;
        }
        this.fillBlock(rng, x0, y0, x1, y1);
      }
    }

    // Named landmarks — every one invented for this game.
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

    // Palm rows along the beach.
    for (let x = 80; x < WORLD.width - 80; x += 90) {
      if (chance(rng, 0.8)) {
        this.trees.push({ x: x + between(rng, -20, 20), y: SHORE.sandY + 46, r: between(rng, 10, 15) });
      }
    }
  }

  // One city block: 1–3 buildings, plus lamps, hydrants and trees.
  fillBlock(rng, x0, y0, x1, y1) {
    const count = betweenInt(rng, 1, 3);
    if (count === 1) {
      this.addBuilding(rng, x0, y0, x1 - x0, y1 - y0);
    } else if (count === 2) {
      if (chance(rng, 0.5)) {
        const midX = (x0 + x1) / 2;
        this.addBuilding(rng, x0, y0, midX - x0 - 8, y1 - y0);
        this.addBuilding(rng, midX + 8, y0, x1 - midX - 8, y1 - y0);
      } else {
        const midY = (y0 + y1) / 2;
        this.addBuilding(rng, x0, y0, x1 - x0, midY - y0 - 8);
        this.addBuilding(rng, x0, midY + 8, x1 - x0, y1 - midY - 8);
      }
    } else {
      const midX = (x0 + x1) / 2;
      const midY = (y0 + y1) / 2;
      this.addBuilding(rng, x0, y0, midX - x0 - 8, midY - y0 - 8);
      this.addBuilding(rng, midX + 8, y0, x1 - midX - 8, midY - y0 - 8);
      this.addBuilding(rng, x0, midY + 8, x1 - x0, y1 - midY - 8);
    }
    if (chance(rng, 0.7)) this.lamps.push({ x: x0 - 4, y: y0 - 4 });
    if (chance(rng, 0.5)) this.hydrants.push({ x: x1 + 2, y: y1 + 2 });
    for (let i = 0; i < 2; i++) {
      if (chance(rng, 0.6)) this.trees.push({ x: between(rng, x0, x1), y: y0 - 6, r: between(rng, 7, 11) });
    }
  }

  addBuilding(rng, x, y, w, h) {
    if (w < 40 || h < 40) return;
    const vents = [];
    const ventCount = betweenInt(rng, 0, 3);
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
      sign: chance(rng, 0.55) ? choose(rng, ROOF_SIGNS) : '',
      vents,
    });
  }

  // Push a circle out of any building it overlaps; null when clear.
  // Returns the smallest push-out vector.
  collideCircle(x, y, r) {
    for (const b of this.buildings) {
      if (x + r <= b.x || x - r >= b.x + b.w || y + r <= b.y || y - r >= b.y + b.h) continue;
      const cx = Math.max(b.x, Math.min(x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d === 0) {
        // Centre inside the building: leave along the nearest face.
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) return { x: -(left + r), y: 0 };
        if (m === right) return { x: right + r, y: 0 };
        if (m === top) return { x: 0, y: -(top + r) };
        return { x: 0, y: bottom + r };
      }
      const push = (r - d) / d;
      return { x: dx * push, y: dy * push };
    }
    return null;
  }

  inPark(x, y) {
    const p = this.park;
    return x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h;
  }
}
