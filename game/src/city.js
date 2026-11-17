// Palmera Bay — the city itself: roads, blocks, buildings, beach, park and props.
// All geometry is generated from a fixed seed, so the map never changes.
import { WORLD, ROAD_W, AVE_GAP, ST_GAP, BEACH_Y, WATER_Y, PALETTE } from './config.js';
import { mulberry32, pick, range, rangeInt } from './rng.js';

export const AVENUES = [];   // x-centres of vertical roads
export const STREETS = [];   // y-centres of horizontal roads
for (let x = 220; x < WORLD.w - 120; x += AVE_GAP) AVENUES.push(x);
for (let y = 200; y < BEACH_Y - 120; y += ST_GAP) STREETS.push(y);

export function isRoad(x, y) {
  if (y > BEACH_Y) return false;
  for (const ax of AVENUES) if (Math.abs(x - ax) < ROAD_W / 2) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) < ROAD_W / 2) return true;
  return false;
}

export function isWater(x, y) { return y > WATER_Y; }
export function isSand(x, y) { return y > BEACH_Y && y <= WATER_Y; }

export function nearestRoadPoint(x, y) {
  let bx = AVENUES[0], bd = Infinity;
  for (const ax of AVENUES) { const d = Math.abs(x - ax); if (d < bd) { bd = d; bx = ax; } }
  let by = STREETS[0]; bd = Infinity;
  for (const sy of STREETS) { const d = Math.abs(y - sy); if (d < bd) { bd = d; by = sy; } }
  // Snap to whichever road axis is closer to the point.
  if (Math.abs(x - bx) <= Math.abs(y - by)) return { x: bx, y };
  return { x, y: by };
}

// Snap a point onto the nearest road centre line, then clamp inside the city.
export function roadPointNear(x, y) {
  const p = nearestRoadPoint(x, y);
  return { x: Math.max(60, Math.min(WORLD.w - 60, p.x)), y: Math.max(60, Math.min(BEACH_Y - 60, p.y)) };
}

export class City {
  constructor() {
    const rng = mulberry32(20261117);
    this.buildings = [];   // {x,y,w,h,color,roof, sign}
    this.trees = [];       // {x,y,r}
    this.lamps = [];       // {x,y}
    this.hydrants = [];    // {x,y}
    this.park = null;      // {x,y,w,h}
    this.landmarks = {};   // named places for missions
    this.generate(rng);
  }

  generate(rng) {
    // One park block in the middle of town.
    const parkCol = 4, parkRow = 2;
    const px0 = AVENUES[parkCol] + ROAD_W / 2 + 8;
    const px1 = AVENUES[parkCol + 1] - ROAD_W / 2 - 8;
    const py0 = STREETS[parkRow] + ROAD_W / 2 + 8;
    const py1 = STREETS[parkRow + 1] - ROAD_W / 2 - 8;
    this.park = { x: px0, y: py0, w: px1 - px0, h: py1 - py0 };

    for (let ci = 0; ci < AVENUES.length - 1; ci++) {
      for (let ri = 0; ri < STREETS.length - 1; ri++) {
        const x0 = AVENUES[ci] + ROAD_W / 2 + 10;
        const x1 = AVENUES[ci + 1] - ROAD_W / 2 - 10;
        const y0 = STREETS[ri] + ROAD_W / 2 + 10;
        const y1 = STREETS[ri + 1] - ROAD_W / 2 - 10;
        if (ci === parkCol && ri === parkRow) {
          for (let i = 0; i < 14; i++) {
            this.trees.push({ x: range(rng, x0 + 14, x1 - 14), y: range(rng, y0 + 14, y1 - 14), r: range(rng, 9, 15) });
          }
          continue;
        }
        // 1-3 buildings per block, with a gap between them.
        const n = rangeInt(rng, 1, 3);
        if (n === 1) {
          this.addBuilding(rng, x0, y0, x1 - x0, y1 - y0);
        } else if (n === 2) {
          const vertical = rng() < 0.5;
          if (vertical) {
            const mid = (x0 + x1) / 2;
            this.addBuilding(rng, x0, y0, mid - x0 - 8, y1 - y0);
            this.addBuilding(rng, mid + 8, y0, x1 - mid - 8, y1 - y0);
          } else {
            const mid = (y0 + y1) / 2;
            this.addBuilding(rng, x0, y0, x1 - x0, mid - y0 - 8);
            this.addBuilding(rng, x0, mid + 8, x1 - x0, y1 - mid - 8);
          }
        } else {
          const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
          this.addBuilding(rng, x0, y0, mx - x0 - 8, my - y0 - 8);
          this.addBuilding(rng, mx + 8, y0, x1 - mx - 8, my - y0 - 8);
          this.addBuilding(rng, x0, my + 8, x1 - x0, y1 - my - 8);
        }
        // Street props along the block edges.
        if (rng() < 0.7) this.lamps.push({ x: x0 - 4, y: y0 - 4 });
        if (rng() < 0.5) this.hydrants.push({ x: x1 + 2, y: y1 + 2 });
        for (let i = 0; i < 2; i++) {
          if (rng() < 0.6) this.trees.push({ x: range(rng, x0, x1), y: y0 - 6, r: range(rng, 7, 11) });
        }
      }
    }

    // Named landmarks (mission destinations) — all invented places.
    this.landmarks = {
      garage: roadPointNear(AVENUES[1], STREETS[1]),                 // Solano Garage
      marina: { x: AVENUES[8], y: BEACH_Y - 90 },                    // Coral Marina
      club: roadPointNear(AVENUES[6], STREETS[2]),                   // Club Flamingo
      bank: roadPointNear(AVENUES[3], STREETS[3]),                   // Palmera Reserve Bank
      docks: { x: AVENUES[9], y: BEACH_Y - 70 },                     // South Docks
      hospital: roadPointNear(AVENUES[2], STREETS[5]),               // Santa Luz Hospital
      policeHQ: roadPointNear(AVENUES[5], STREETS[1]),               // Bay Precinct HQ
      pawnshop: roadPointNear(AVENUES[7], STREETS[4]),               // Golden Palm Pawn
      airport: { x: AVENUES[0], y: STREETS[0] },                     // Palmera Airfield
      stadium: roadPointNear(AVENUES[8], STREETS[5]),                // Bay Sharks Stadium
    };
    // Beach palm rows.
    for (let x = 80; x < WORLD.w - 80; x += 90) {
      if (rng() < 0.8) this.trees.push({ x: x + range(rng, -20, 20), y: BEACH_Y + 46, r: range(rng, 10, 15) });
    }
  }

  addBuilding(rng, x, y, w, h) {
    if (w < 40 || h < 40) return;
    const color = pick(rng, PALETTE.buildingRoof);
    const signs = ['HOTEL', 'CAFÉ', 'MARKET', 'OFFICE', 'APTS', 'SHOP', 'GYM', 'DINER', 'BAR', 'STUDIO'];
    this.buildings.push({
      x, y, w, h, color,
      sign: rng() < 0.55 ? pick(rng, signs) : '',
      // Rooftop clutter: AC units / vents, deterministic per building.
      vents: Array.from({ length: rangeInt(rng, 0, 3) }, () => ({
        x: range(rng, x + 10, x + w - 18), y: range(rng, y + 10, y + h - 18), s: range(rng, 6, 12),
      })),
    });
  }

  // Circle vs building AABB; returns the push-out vector or null.
  collideCircle(x, y, r) {
    for (const b of this.buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) {
        const cx = Math.max(b.x, Math.min(x, b.x + b.w));
        const cy = Math.max(b.y, Math.min(y, b.y + b.h));
        let dx = x - cx, dy = y - cy;
        let d = Math.hypot(dx, dy);
        if (d === 0) { // centre inside the block: push out along the smallest axis
          const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bot = b.y + b.h - y;
          const m = Math.min(left, right, top, bot);
          if (m === left) return { x: -(left + r), y: 0 };
          if (m === right) return { x: right + r, y: 0 };
          if (m === top) return { x: 0, y: -(top + r) };
          return { x: 0, y: bot + r };
        }
        const push = (r - d) / d;
        return { x: dx * push, y: dy * push };
      }
    }
    return null;
  }

  inPark(x, y) {
    const p = this.park;
    return x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h;
  }
}
