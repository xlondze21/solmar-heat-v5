// Solmar Heat — traffic AI and pedestrians (pure logic, no drawing).
// Cars drive the road graph on right-hand lanes, stop at red lights, queue
// behind each other, and never deadlock head-on: a collision only damps speed
// and nudges the cars sideways instead of swapping velocities.

import { CAR_TYPES, CELL, GRID, ROAD0 } from './config.js';
import { angleDiff, clamp, dist2, int, pick, range } from './random.js';
import { lightIsGreenNS, nearestLight, roadCenter, drivable } from './world.js';

const DIRS = [
  { dx: 1, dy: 0 }, // east
  { dx: 0, dy: 1 }, // south
  { dx: -1, dy: 0 }, // west
  { dx: 0, dy: -1 }, // north
];
const LANE = 14; // right-hand lane offset from the road centre

export function lanePoint(car) {
  const d = DIRS[car.dir];
  const ox = d.dy === 0 ? 0 : (d.dy > 0 ? -LANE : LANE);
  const oy = d.dx === 0 ? 0 : (d.dx > 0 ? LANE : -LANE);
  return { x: car.tx + ox, y: car.ty + oy };
}

export function spawnTrafficCar(state, rng) {
  const i = int(rng, 0, GRID);
  const j = int(rng, 0, GRID);
  const dir = int(rng, 0, 3);
  const d = DIRS[dir];
  const ni = Math.max(0, Math.min(GRID, i + d.dx));
  const nj = Math.max(0, Math.min(GRID, j + d.dy));
  const type = pick(rng, ['sedan', 'sedan', 'taxi', 'truck']);
  const spec = CAR_TYPES[type];
  const x = roadCenter(i) - d.dx * range(rng, 60, 300);
  const y = roadCenter(j) - d.dy * range(rng, 60, 300);
  return {
    kind: 'traffic', type, x, y,
    angle: Math.atan2(d.dy, d.dx),
    speed: range(rng, 60, spec.top * 0.45),
    top: spec.top * range(rng, 0.4, 0.55),
    dir, ti: ni, tj: nj,
    tx: roadCenter(ni), ty: roadCenter(nj),
    color: pick(rng, ['#7d8aa0', '#a08a7d', '#5f7d8a', '#8a7d5f', '#6f8a6f']),
    wait: 0, brake: 0,
  };
}

function chooseNextDir(car, rng) {
  // At an intersection: mostly straight, sometimes turn, never U-turn unless
  // at the map edge where there is nowhere else to go.
  const options = [];
  for (let d = 0; d < 4; d += 1) {
    if (d === (car.dir + 2) % 4) continue;
    const ni = car.ti + DIRS[d].dx;
    const nj = car.tj + DIRS[d].dy;
    if (ni < 0 || ni > GRID || nj < 0 || nj > GRID) continue;
    options.push(d);
  }
  if (options.length === 0) return (car.dir + 2) % 4;
  if (options.includes(car.dir) && rng() < 0.6) return car.dir;
  return pick(rng, options);
}

export function updateTraffic(state, dt) {
  const rng = state.rng;
  const cars = state.traffic;
  for (const car of cars) {
    const d = DIRS[car.dir];
    const lp = lanePoint(car);
    // Steer toward the lane point.
    const want = Math.atan2(lp.y - car.y, lp.x - car.x);
    car.angle += clamp(angleDiff(car.angle, want), -2.4 * dt, 2.4 * dt);
    const distToTarget = Math.hypot(car.tx - car.x, car.ty - car.y);

    // Red light: stop before the intersection if the light is against us.
    let blocked = false;
    const light = nearestLight(state.city, car.tx, car.ty);
    if (light && distToTarget < 64) {
      const nsGreen = lightIsGreenNS(light, state.time);
      const nsCar = car.dir === 1 || car.dir === 3;
      if (nsGreen !== nsCar) blocked = true;
    }
    // Queue: a slower car ahead in the same lane caps our speed.
    let cap = car.top;
    for (const other of cars) {
      if (other === car || other.dir !== car.dir) continue;
      const ahead = (other.x - car.x) * d.dx + (other.y - car.y) * d.dy;
      const side = Math.abs((other.x - car.x) * d.dy - (other.y - car.y) * d.dx);
      if (ahead > 0 && ahead < 52 && side < 26) {
        cap = Math.min(cap, other.speed * 0.9);
        if (ahead < 34) blocked = true;
      }
    }
    // Player's car ahead also makes traffic brake.
    const pv = state.playerVehicle;
    if (pv) {
      const ahead = (pv.x - car.x) * d.dx + (pv.y - car.y) * d.dy;
      const side = Math.abs((pv.x - car.x) * d.dy - (pv.y - car.y) * d.dx);
      if (ahead > 0 && ahead < 56 && side < 30) {
        cap = Math.min(cap, Math.max(0, pv.speed * 0.8));
        if (ahead < 36) blocked = true;
      }
    }

    if (blocked) {
      car.speed = Math.max(0, car.speed - 320 * dt);
    } else {
      car.speed = Math.min(cap, car.speed + 170 * dt);
    }
    // Traffic stays on the roads: a turn that would cut a block corner is
    // refused instead of letting the car drive through a building.
    const ox = car.x;
    const oy = car.y;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (!drivable(car.x, car.y, state.tidePhase)) {
      car.x = ox;
      car.y = oy;
      car.speed *= 0.5;
    }

    if (distToTarget < 10) {
      car.dir = chooseNextDir(car, rng);
      const nd = DIRS[car.dir];
      car.ti = Math.max(0, Math.min(GRID, car.ti + nd.dx));
      car.tj = Math.max(0, Math.min(GRID, car.tj + nd.dy));
      car.tx = roadCenter(car.ti);
      car.ty = roadCenter(car.tj);
    }
  }
  // Soft collisions: damp speed, nudge sideways, never swap velocity.
  for (let a = 0; a < cars.length; a += 1) {
    for (let b = a + 1; b < cars.length; b += 1) {
      const A = cars[a];
      const B = cars[b];
      const d2 = dist2(A.x, A.y, B.x, B.y);
      if (d2 < 30 * 30 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const nx = (B.x - A.x) / d;
        const ny = (B.y - A.y) / d;
        const push = (30 - d) * 0.5;
        A.x -= nx * push; A.y -= ny * push;
        B.x += nx * push; B.y += ny * push;
        // Lateral nudge only — speeds just bleed off.
        A.speed *= 0.86; B.speed *= 0.86;
        A.angle += 0.02; B.angle -= 0.02;
      }
    }
  }
}

export function spawnPed(state, rng) {
  const i = int(rng, 0, GRID - 1);
  const j = int(rng, 0, GRID - 1);
  const edge = int(rng, 0, 3);
  const bx = roadCenter(i) + ROAD0 * 0 + 40;
  const by = roadCenter(j) + 40;
  let x = bx;
  let y = by;
  if (edge === 0) { x = roadCenter(i) + 40; y = roadCenter(j) + 40; }
  if (edge === 1) { x = roadCenter(i + 1) - 40; y = roadCenter(j) + 40; }
  if (edge === 2) { x = roadCenter(i) + 40; y = roadCenter(j + 1) - 40; }
  if (edge === 3) { x = roadCenter(i + 1) - 40; y = roadCenter(j + 1) - 40; }
  return {
    x, y, angle: range(rng, 0, Math.PI * 2),
    speed: range(rng, 34, 62), tx: x, ty: y,
    color: pick(rng, ['#e8c07a', '#7ab5e8', '#e87a9a', '#9ae87a', '#d8d8d8']),
    flee: 0, wait: range(rng, 0, 2),
  };
}

function pedTarget(state, ped, rng) {
  const i = int(rng, 0, GRID - 1);
  const j = int(rng, 0, GRID - 1);
  const side = rng() < 0.5 ? 40 : -40;
  if (rng() < 0.5) {
    ped.tx = roadCenter(i) + side;
    ped.ty = roadCenter(j) + range(rng, -70, 70);
  } else {
    ped.tx = roadCenter(i) + range(rng, -70, 70);
    ped.ty = roadCenter(j) + side;
  }
}

export function updatePeds(state, dt) {
  const rng = state.rng;
  const p = state.player;
  for (const ped of state.peds) {
    const dPlayer = Math.hypot(p.x - ped.x, p.y - ped.y);
    const playerCar = state.playerVehicle;
    const threat = (playerCar && playerCar.speed > 120 && dPlayer < 110)
      || (!playerCar && state.shotsFiredAt > state.time - 1 && dPlayer < 160);
    if (threat) ped.flee = 1.6;
    if (ped.flee > 0) {
      ped.flee -= dt;
      const away = Math.atan2(ped.y - p.y, ped.x - p.x);
      ped.angle = away;
      ped.x += Math.cos(away) * 150 * dt;
      ped.y += Math.sin(away) * 150 * dt;
      continue;
    }
    if (ped.wait > 0) { ped.wait -= dt; continue; }
    const dx = ped.tx - ped.x;
    const dy = ped.ty - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 8) {
      ped.wait = range(rng, 1, 4);
      pedTarget(state, ped, rng);
      continue;
    }
    ped.angle = Math.atan2(dy, dx);
    ped.x += (dx / d) * ped.speed * dt;
    ped.y += (dy / d) * ped.speed * dt;
  }
}
