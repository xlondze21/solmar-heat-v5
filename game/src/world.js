// Solmar Heat — the city of Solmar, built fresh from a seed.
// 12x12 blocks, roads on a grid, beach + sea to the south, a marina on the
// south-east shore, an old town in the north-west, a rival-gang turf in the
// north-east. No drawing here: this file only answers "what is at (x, y)?"
// and hands out the road graph traffic drives on.

import {
  BEACH_H, BEACH_TOP, BLOCK, CELL, CITY, GRID, ROAD, ROAD0, SEA_TOP,
  WORLD_H, WORLD_W,
} from './config.js';
import { createRandom, int, pick, range } from './random.js';

export function roadCenter(k) {
  return ROAD0 + k * CELL;
}

// Block (col,row) spans between road col and col+1, row and row+1.
export function blockRect(col, row) {
  return {
    x: roadCenter(col) + ROAD / 2,
    y: roadCenter(row) + ROAD / 2,
    w: BLOCK,
    h: BLOCK,
  };
}

export function isOnRoad(x, y) {
  if (y >= CITY) return y < BEACH_TOP; // the beachfront promenade
  // Distance to the nearest road centre line, in each axis: the road band is
  // 64px wide and centred on the line, so it wraps the cell boundary.
  const rx = (((x - ROAD0) % CELL) + CELL) % CELL;
  const ry = (((y - ROAD0) % CELL) + CELL) % CELL;
  const dx = Math.min(rx, CELL - rx);
  const dy = Math.min(ry, CELL - ry);
  return dx <= ROAD / 2 || dy <= ROAD / 2;
}

export function isBeach(x, y) {
  return y >= BEACH_TOP && y < SEA_TOP;
}

export function isSea(x, y) {
  return y >= SEA_TOP;
}

// The sandbar: a dry strip across the shallows at low tide. At high tide it is
// water again and only boats cross. x band near the marina, y just past the beach.
export const SANDBAR = { x0: 1500, x1: 1750, y0: SEA_TOP, y1: SEA_TOP + 260 };

export function sandbarDry(tidePhase) {
  return tidePhase >= 0.35 && tidePhase <= 0.65;
}

export function isSandbar(x, y) {
  return x >= SANDBAR.x0 && x <= SANDBAR.x1 && y >= SANDBAR.y0 && y <= SANDBAR.y1;
}

export function isWater(x, y, tidePhase) {
  if (!isSea(x, y)) return false;
  if (isSandbar(x, y) && sandbarDry(tidePhase)) return false;
  return true;
}

// Can a car / a pedestrian stand at (x, y)? Cars stay on roads, beach and the
// dry sandbar; pedestrians also walk the sidewalks inside blocks' edges.
export function drivable(x, y, tidePhase) {
  if (x < 8 || y < 8 || x > WORLD_W - 8 || y > WORLD_H - 8) return false;
  if (isSea(x, y)) return isSandbar(x, y) && sandbarDry(tidePhase);
  if (y >= CITY) return true; // promenade + beach
  return isOnRoad(x, y);
}

export function walkable(x, y, tidePhase) {
  if (x < 8 || y < 8 || x > WORLD_W - 8 || y > WORLD_H - 8) return false;
  if (isSea(x, y)) return isSandbar(x, y) && sandbarDry(tidePhase);
  return true;
}

export function nearestRoadPoint(x, y) {
  const kx = Math.round((x - ROAD0) / CELL);
  const ky = Math.round((y - ROAD0) / CELL);
  const cx = Math.max(0, Math.min(GRID, kx));
  const cy = Math.max(0, Math.min(GRID, ky));
  return { x: roadCenter(cx), y: roadCenter(cy), i: cx, j: cy };
}

// Fixed places of interest. Coordinates are computed from the grid so the map
// stays consistent if the geometry ever changes.
export function buildPlaces() {
  const bc = (c, r) => {
    const b = blockRect(c, r);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  };
  const rc = (c, r) => ({ x: roadCenter(c), y: roadCenter(r) });
  return {
    spawn: rc(5, 8), // Rico starts on foot near the safehouse
    safehouse: { ...bc(5, 8), label: 'Safehouse', r: 70 },
    garage: { ...bc(4, 8), label: 'Garage', r: 70 },
    paintshop: { ...bc(6, 8), label: 'Paint Shop', r: 56 },
    gunshop: { ...bc(5, 7), label: 'Gun Shop', r: 56 },
    hospital: { ...bc(2, 2), label: 'Hospital', r: 78 },
    helipad: { ...bc(2, 2), label: 'HELI', r: 52, x: bc(2, 2).x + 30, y: bc(2, 2).y + 30 },
    fishMarket: { ...bc(5, 11), label: 'Fish Market', r: 78 },
    marina: { x: roadCenter(11) + 10, y: SEA_TOP + 60, label: 'Marina', r: 80 },
    boatDock: { x: roadCenter(10), y: SEA_TOP + 40, label: 'Boat', r: 48 },
    oldTown: { ...bc(1, 1), label: 'Old Town', r: 90 },
    taxiStand: { ...rc(3, 6), label: 'Taxi Stand', r: 48 },
    beachShack: { x: 1625, y: SEA_TOP + 170, label: 'Beach Shack', r: 46 },
    seaBuoy: { x: 2050, y: SEA_TOP + 420, label: 'Buoy', r: 50 },
    rooftop: { ...bc(8, 3), label: 'Rooftop', r: 60 },
    // Rival gang turf: north-east blocks, drawn red on the minimap.
    rivalTurf: { c0: 8, r0: 0, c1: 11, r1: 2 },
  };
}

export function inRivalTurf(x, y, places) {
  const t = places.rivalTurf;
  const b0 = blockRect(t.c0, t.r0);
  const b1 = blockRect(t.c1, t.r1);
  return x >= b0.x && x <= b1.x + b1.w && y >= b0.y && y <= b1.y + b1.h;
}

// Buildings: one or two per block, seeded. Special blocks get a landmark kind.
export function buildCity(seed) {
  const rng = createRandom(seed);
  const places = buildPlaces();
  const buildings = [];
  const landmark = {};
  const mark = (c, r, kind) => { landmark[`${c},${r}`] = kind; };
  mark(5, 8, 'safehouse'); mark(4, 8, 'garage'); mark(6, 8, 'paintshop');
  mark(5, 7, 'gunshop'); mark(2, 2, 'hospital'); mark(5, 11, 'market');
  mark(1, 1, 'oldtown'); mark(0, 0, 'park'); mark(11, 0, 'park');
  mark(3, 3, 'park'); mark(7, 6, 'park');
  for (let c = 0; c < GRID; c += 1) {
    for (let r = 0; r < GRID; r += 1) {
      const kind = landmark[`${c},${r}`] || 'house';
      const b = blockRect(c, r);
      if (kind === 'park') {
        buildings.push({ x: b.x + 14, y: b.y + 14, w: b.w - 28, h: b.h - 28, kind });
        continue;
      }
      const n = kind === 'house' ? (rng() < 0.5 ? 2 : 1) : 1;
      for (let k = 0; k < n; k += 1) {
        const w = kind === 'house' ? range(rng, 56, 96) : b.w - 36;
        const h = kind === 'house' ? range(rng, 56, 96) : b.h - 36;
        const x = b.x + (n === 1 ? 18 : 14 + k * (b.w / 2));
        const y = b.y + (n === 1 ? 18 : 18 + (k % 2) * 0);
        buildings.push({
          x: Math.min(x, b.x + b.w - w - 8),
          y: Math.min(y, b.y + b.h - h - 8),
          w, h, kind,
        });
      }
    }
  }
  // Traffic lights: intersections where (i+j) % 3 === 0 get a signal.
  const lights = [];
  for (let i = 0; i <= GRID; i += 1) {
    for (let j = 0; j <= GRID; j += 1) {
      if ((i + j) % 3 === 0) lights.push({ i, j, x: roadCenter(i), y: roadCenter(j) });
    }
  }
  return { places, buildings, lights, seed };
}

// Traffic-light state: NS green for 8s, then EW green for 8s, offset by index.
export function lightIsGreenNS(light, time) {
  const cycle = Math.floor(time / 8 + light.i * 0.37 + light.j * 0.53) % 2;
  return cycle === 0;
}

export function nearestLight(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const l of city.lights) {
    const d = (l.x - x) ** 2 + (l.y - y) ** 2;
    if (d < bestD) { bestD = d; best = l; }
  }
  return bestD < 90 * 90 ? best : null;
}

export { int, pick, range };
