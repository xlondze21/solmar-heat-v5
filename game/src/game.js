// Solmar Heat — the pure game core: no DOM, no canvas, no audio.
// createGame(seed) returns { state, step, ... }. The browser shell (main.js)
// wires keyboard + canvas + sound around it; the headless autopilot sim
// drives the same step() with scripted inputs. Everything the game promises
// — stealing, wanted, police, heli, boats, missions, garage, tide, day/night
// — lives here and is testable from a terminal.

import {
  BEACH_H, BEACH_TOP, CAR_TYPES, CITY, ECONOMY, PLAYER, RADIO, SAVE_KEY, SEA_TOP,
  STEP, TIDE, WANTED, WORLD_H, WORLD_W,
} from './config.js';
import { clamp, createRandom, dist2, int, normalizeAngle, pick, range } from './random.js';
import {
  buildCity, drivable, inRivalTurf, isSandbar, isSea, isWater, nearestRoadPoint,
  roadCenter, sandbarDry, walkable,
} from './world.js';
import { spawnPed, spawnTrafficCar, updatePeds, updateTraffic } from './traffic.js';
import { addWanted, updatePolice, updatePoliceHeli } from './police.js';
import { buildMissions, missionById } from './missions.js';

export function createGame(seed = 1) {
  const rng = createRandom(seed);
  const city = buildCity(seed);
  const places = city.places;
  const missions = buildMissions(places);

  const state = {
    seed, rng, city, places, missions,
    time: 0, clock: 17.4, tidePhase: 0.5, // start at dusk, mid tide
    screen: 'title', // title | play | pause | busted | wasted
    player: {
      x: places.spawn.x, y: places.spawn.y, angle: -Math.PI / 2,
      health: PLAYER.health, cash: ECONOMY.startCash, rep: 0,
      ammo: 0, wanted: 0, onFoot: true,
    },
    vehicles: [], // parked / owned / stolen cars the player has used
    traffic: [],
    peds: [],
    police: [],
    heli: { active: false, x: 0, y: 0, angle: 0, alt: 120, health: WANTED.heliHealth, respawnTimer: 0, orbit: 0, callTimer: 0, falling: false },
    playerHeli: { x: places.helipad.x, y: places.helipad.y, angle: 0, alt: 0, speed: 0, kind: 'heli', parked: true, health: 100 },
    boat: { x: places.boatDock.x, y: places.boatDock.y, angle: -Math.PI / 2, speed: 0, kind: 'boat', parked: true, health: 100 },
    playerVehicle: null, // the vehicle object the player is driving, or null
    crates: [],
    particles: [],
    skids: [],
    toasts: [],
    events: [],
    mission: null, // { def, stepIndex, timer, survive, collected }
    nextMission: 1,
    missionsDone: 0,
    radio: 0,
    shake: 0,
    safeTimer: 0,
    quietTimer: 0,
    spawnTimer: 0,
    bustTimer: 0,
    busted: false,
    wasted: false,
    shotsFiredAt: -99,
    owned: [], // [{type, color}] cars bought at the garage
    stats: { stolen: 0, busted: 0, heliDown: 0, missions: 0 },
  };

  for (let i = 0; i < 14; i += 1) state.traffic.push(spawnTrafficCar(state, rng));
  for (let i = 0; i < 16; i += 1) state.peds.push(spawnPed(state, rng));
  // One parked sedan near the safehouse so the world never feels empty.
  state.vehicles.push({
    kind: 'car', type: 'sedan', x: places.safehouse.x - 90, y: places.safehouse.y + 40,
    angle: 0, speed: 0, color: '#7d8aa0', fromGarage: false, stolen: false, health: 100, owned: false,
  });

  function toast(text, kind = 'info') {
    state.toasts.push({ text, kind, t: 0 });
    if (state.toasts.length > 4) state.toasts.shift();
  }
  state.toast = toast;

  function sparks(x, y, n = 6) {
    for (let i = 0; i < n; i += 1) {
      state.particles.push({
        x, y, vx: range(rng, -140, 140), vy: range(rng, -140, 140),
        life: range(rng, 0.2, 0.5), max: 0.5, kind: 'spark', color: '#ffd94a',
      });
    }
  }
  state.sparks = sparks;

  function smoke(x, y, n = 8) {
    for (let i = 0; i < n; i += 1) {
      state.particles.push({
        x: x + range(rng, -14, 14), y: y + range(rng, -14, 14),
        vx: range(rng, -24, 24), vy: range(rng, -50, -10),
        life: range(rng, 0.6, 1.4), max: 1.4, kind: 'smoke', color: '#8a8a8a',
      });
    }
  }
  state.smoke = smoke;

  function addSkid(x, y, angle) {
    state.skids.push({ x, y, angle, life: 6 });
    if (state.skids.length > 240) state.skids.shift();
  }

  // ---- save / load -------------------------------------------------------
  function saveData() {
    return {
      cash: state.player.cash, rep: state.player.rep, ammo: state.player.ammo,
      owned: state.owned, missionsDone: state.missionsDone, nextMission: state.nextMission,
      x: state.player.x, y: state.player.y, health: state.player.health,
    };
  }
  function loadData(d) {
    if (!d) return false;
    state.player.cash = d.cash ?? ECONOMY.startCash;
    state.player.rep = d.rep ?? 0;
    state.player.ammo = d.ammo ?? 0;
    state.owned = d.owned ?? [];
    state.missionsDone = d.missionsDone ?? 0;
    state.nextMission = d.nextMission ?? 1;
    if (typeof d.x === 'number') { state.player.x = d.x; state.player.y = d.y; }
    if (typeof d.health === 'number') state.player.health = d.health;
    // Re-park owned cars on the road west of the garage.
    for (const o of state.owned) {
      if (!state.vehicles.some((v) => v.owned && v.type === o.type)) {
        state.vehicles.push({
          kind: 'car', type: o.type, x: roadCenter(4) + range(rng, -8, 8),
          y: places.garage.y + range(rng, -30, 30), angle: 0, speed: 0,
          color: o.color, fromGarage: true, stolen: false, health: 100, owned: true,
        });
      }
    }
    return true;
  }

  // ---- missions ----------------------------------------------------------
  function currentStep() {
    if (!state.mission) return null;
    return state.mission.def.steps[state.mission.stepIndex] || null;
  }
  function startMission(id) {
    const def = missionById(missions, id);
    if (!def) return false;
    if (state.mission) return false;
    state.mission = { def, stepIndex: 0, timer: def.timeLimit || 0, survive: 0, collected: 0 };
    state.crates = [];
    toast(`Mission: ${def.name} — ${def.brief}`, 'mission');
    state.events.push({ type: 'missionStart', id });
    return true;
  }
  function spawnCrates(step) {
    state.crates = [];
    for (let i = 0; i < step.count; i += 1) {
      const a = (i / step.count) * Math.PI * 2;
      const r = step.spread ? range(rng, 30, step.spread) : 0;
      state.crates.push({ x: step.x + Math.cos(a) * r, y: step.y + Math.sin(a) * r, taken: false });
    }
  }
  function completeStep() {
    const m = state.mission;
    m.stepIndex += 1;
    state.crates = [];
    if (m.stepIndex >= m.def.steps.length) {
      const reward = m.def.reward;
      state.player.cash += reward;
      state.player.rep += 10;
      state.missionsDone += 1;
      state.nextMission = Math.min(11, m.def.id + 1);
      state.stats.missions += 1;
      toast(`Mission complete: ${m.def.name}  +$${reward}  +10 REP`, 'good');
      state.events.push({ type: 'missionComplete', id: m.def.id, reward });
      state.mission = null;
    } else {
      const s = currentStep();
      if (s && s.kind === 'pickup') spawnCrates(s);
      toast(`Objective: ${s ? s.label : ''}`, 'mission');
    }
  }
  function failMission(reason) {
    const m = state.mission;
    toast(`Mission failed: ${m.def.name} — ${reason}`, 'danger');
    state.events.push({ type: 'missionFail', id: m.def.id, reason });
    state.mission = null;
    state.crates = [];
  }

  // ---- shops / garage ----------------------------------------------------
  function buyCar(type) {
    const spec = CAR_TYPES[type];
    if (!spec) return 'unknown car';
    if (type === 'sports' && state.player.rep < ECONOMY.sportsRepLock) {
      return `Sports car locked — needs REP ${ECONOMY.sportsRepLock} (you have ${state.player.rep})`;
    }
    if (state.player.cash < spec.price) return `Need $${spec.price} for a ${spec.name}`;
    if (state.owned.some((o) => o.type === type)) return `You already own a ${spec.name}`;
    state.player.cash -= spec.price;
    const color = pick(rng, ['#c0392b', '#2c6ec9', '#e8e8e8', '#222222', '#7a2cc9']);
    state.owned.push({ type, color });
    // Parked on the road west of the garage — never inside the building.
    state.vehicles.push({
      kind: 'car', type, x: roadCenter(4), y: places.garage.y,
      angle: 0, speed: 0, color,
      fromGarage: true, stolen: false, health: 100, owned: true,
    });
    toast(`Bought a ${spec.name} — parked at the Garage`, 'good');
    state.events.push({ type: 'buyCar', car: type });
    return null;
  }
  function buyAmmo() {
    if (state.player.cash < ECONOMY.ammoCost) return 'Need $30 for ammo';
    state.player.cash -= ECONOMY.ammoCost;
    state.player.ammo += ECONOMY.ammoPack;
    toast(`Bought ${ECONOMY.ammoPack} rounds`, 'good');
    state.events.push({ type: 'buyAmmo' });
    return null;
  }
  function paintCar() {
    const v = state.playerVehicle;
    if (!v || v.kind !== 'car') return 'Get in a car first';
    if (state.player.cash < ECONOMY.paintCost) return 'Need $50 for a paint job';
    state.player.cash -= ECONOMY.paintCost;
    v.color = pick(rng, ['#c0392b', '#2c6ec9', '#e8e8e8', '#f2b705', '#2cc98a', '#7a2cc9']);
    toast('Fresh paint job!', 'good');
    state.events.push({ type: 'paint' });
    return null;
  }

  // ---- helpers -----------------------------------------------------------
  // Where the player's car may be: anywhere on land, never the sea (the dry
  // sandbar counts as land). Traffic is stricter — see drivable() in world.js.
  function carCanBe(x, y, tidePhase) {
    if (x < 8 || y < 8 || x > WORLD_W - 8 || y > WORLD_H - 8) return false;
    if (isSea(x, y)) return isSandbar(x, y) && sandbarDry(tidePhase);
    return true;
  }
  // Push an entity out of building rectangles along the axis of least
  // penetration, so a car sliding along a wall keeps moving instead of
  // wedging into a corner.
  function pushOutOfBuildings(e, radius) {
    for (const b of city.buildings) {
      if (b.kind === 'park') continue;
      const overlapX = Math.min(e.x + radius - b.x, b.x + b.w - (e.x - radius));
      const overlapY = Math.min(e.y + radius - b.y, b.y + b.h - (e.y - radius));
      if (overlapX > 0 && overlapY > 0) {
        let px = 0;
        let py = 0;
        if (overlapX < overlapY) {
          px = e.x < b.x + b.w / 2 ? -overlapX : overlapX;
          e.x += px;
        } else {
          py = e.y < b.y + b.h / 2 ? -overlapY : overlapY;
          e.y += py;
        }
        // Only bleed speed when the shove fights a substantial part of the
        // motion: sliding sideways along a wall (a small opposing component)
        // should not grind the car to a halt.
        if (e.speed !== undefined && e.angle !== undefined) {
          const vx = Math.cos(e.angle) * e.speed;
          const vy = Math.sin(e.angle) * e.speed;
          const len = Math.hypot(px, py) || 1;
          const along = (px * vx + py * vy) / len;
          if (along < -0.3 * Math.abs(e.speed)) e.speed *= 0.6;
        }
      }
    }
  }
  function nearestVehicle(x, y, maxD) {
    let best = null;
    let bestD = maxD * maxD;
    for (const v of state.vehicles) {
      const d2 = dist2(x, y, v.x, v.y);
      if (d2 < bestD) { bestD = d2; best = v; }
    }
    return best;
  }
  function nearestTraffic(x, y, maxD) {
    let best = null;
    let bestD = maxD * maxD;
    for (const c of state.traffic) {
      const d2 = dist2(x, y, c.x, c.y);
      if (d2 < bestD) { bestD = d2; best = c; }
    }
    return best;
  }

  function enterVehicle() {
    const p = state.player;
    if (state.playerVehicle) {
      // Exit: step out to the side.
      const v = state.playerVehicle;
      v.speed = 0;
      p.x = v.x + Math.cos(v.angle + Math.PI / 2) * 34;
      p.y = v.y + Math.sin(v.angle + Math.PI / 2) * 34;
      p.onFoot = true;
      state.playerVehicle = null;
      return;
    }
    // Heli at the helipad.
    if (dist2(p.x, p.y, state.playerHeli.x, state.playerHeli.y) < 64 * 64 && state.playerHeli.alt === 0) {
      state.playerVehicle = state.playerHeli;
      state.playerHeli.parked = false;
      p.onFoot = false;
      toast('Helicopter — W/S thrust, A/D turn, Shift up, C down', 'info');
      return;
    }
    // Boat at the dock.
    if (dist2(p.x, p.y, state.boat.x, state.boat.y) < 64 * 64 && state.boat.parked) {
      state.playerVehicle = state.boat;
      state.boat.parked = false;
      p.onFoot = false;
      toast('Boat — W/S throttle, A/D steer', 'info');
      return;
    }
    const v = nearestVehicle(p.x, p.y, 74);
    if (v) {
      state.playerVehicle = v;
      p.onFoot = false;
      return;
    }
    const t = nearestTraffic(p.x, p.y, 74);
    if (t) {
      state.traffic.splice(state.traffic.indexOf(t), 1);
      const car = {
        kind: 'car', type: t.type, x: t.x, y: t.y, angle: t.angle, speed: 0,
        color: t.color, fromGarage: false, stolen: true, health: 100, owned: false,
      };
      state.vehicles.push(car);
      state.playerVehicle = car;
      p.onFoot = false;
      state.stats.stolen += 1;
      addWanted(state, 1, 'Stole a car');
      return;
    }
    // Mission start: near the current mission's first objective.
    if (!state.mission && state.nextMission <= 10) {
      const def = missionById(missions, state.nextMission);
      const s0 = def.steps[0];
      if (s0 && s0.x !== undefined && dist2(p.x, p.y, s0.x, s0.y) < 130 * 130) {
        startMission(def.id);
        return;
      }
    }
    // Shops.
    if (dist2(p.x, p.y, places.paintshop.x, places.paintshop.y) < 70 * 70) {
      const err = paintCar();
      if (err) toast(err, 'danger');
      return;
    }
    if (dist2(p.x, p.y, places.gunshop.x, places.gunshop.y) < 70 * 70) {
      const err = buyAmmo();
      if (err) toast(err, 'danger');
    }
  }

  function punch() {
    const p = state.player;
    let hit = false;
    for (let i = state.peds.length - 1; i >= 0; i -= 1) {
      const ped = state.peds[i];
      const d = Math.hypot(ped.x - p.x, ped.y - p.y);
      if (d < PLAYER.punchRange) {
        const a = Math.atan2(ped.y - p.y, ped.x - p.x);
        if (Math.abs(normalizeAngle(a - p.angle)) < PLAYER.punchArc) {
          state.peds.splice(i, 1);
          sparks(ped.x, ped.y, 4);
          hit = true;
        }
      }
    }
    if (hit) state.events.push({ type: 'punch' });
  }

  function shoot() {
    const p = state.player;
    if (p.ammo <= 0) { toast('No ammo — buy some at the Gun Shop', 'danger'); return; }
    p.ammo -= 1;
    state.shotsFiredAt = state.time;
    state.events.push({ type: 'shoot' });
    // Police heli first: it is the big target in the sky.
    if (state.heli.active) {
      const d = Math.hypot(state.heli.x - p.x, state.heli.y - p.y);
      const aim = Math.atan2(state.heli.y - p.y, state.heli.x - p.x);
      if (d < 460 && Math.abs(normalizeAngle(aim - p.angle)) < 0.7) {
        state.heli.health -= 1;
        state.events.push({ type: 'heliHit', health: state.heli.health });
        sparks(state.heli.x, state.heli.y, 5);
        return;
      }
    }
    // Nearest ped / cruiser in the firing cone.
    let best = null;
    let bestD = PLAYER.shootRange;
    const consider = (x, y, kind, ref) => {
      const d = Math.hypot(x - p.x, y - p.y);
      const a = Math.atan2(y - p.y, x - p.x);
      if (d < bestD && Math.abs(normalizeAngle(a - p.angle)) < PLAYER.shootArc) {
        bestD = d; best = { kind, ref, x, y };
      }
    };
    for (const ped of state.peds) consider(ped.x, ped.y, 'ped', ped);
    for (const c of state.police) consider(c.x, c.y, 'cruiser', c);
    if (best) {
      sparks(best.x, best.y, 5);
      if (best.kind === 'ped') {
        state.peds.splice(state.peds.indexOf(best.ref), 1);
        addWanted(state, 1, 'Shot a pedestrian');
      } else {
        best.ref.speed *= 0.4;
        addWanted(state, 1, 'Shot at police');
      }
    }
  }

  // ---- per-step movement -------------------------------------------------
  function stepOnFoot(dt, input) {
    const p = state.player;
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len; my /= len;
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      p.angle = Math.atan2(my, mx);
      const nx = p.x + mx * speed * dt;
      const ny = p.y + my * speed * dt;
      if (walkable(nx, p.y, state.tidePhase)) p.x = nx;
      if (walkable(p.x, ny, state.tidePhase)) p.y = ny;
      p.x = clamp(p.x, 10, WORLD_W - 10);
      p.y = clamp(p.y, 10, WORLD_H - 10);
      pushOutOfBuildings(p, PLAYER.radius);
    }
  }

  function stepCar(dt, input, v) {
    const spec = CAR_TYPES[v.type] || CAR_TYPES.sedan;
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (input.up) v.speed += spec.accel * dt;
    else if (input.down) v.speed -= (v.speed > 10 ? spec.accel * 1.4 : spec.reverse * 1.6) * dt * (v.speed > 10 ? 1 : 1);
    else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 220 * dt);
    v.speed = clamp(v.speed, -spec.reverse, spec.top);
    const grip = spec.grip;
    // Steering keeps a little authority even at crawling speed, so a
    // three-point turn is possible instead of a dead stop. The rate saturates
    // above ~90 px/s, so the turning radius stays tight (~40px) instead of
    // growing with speed and throwing the car past its intersection.
    v.angle += steer * spec.turn * dt * clamp(Math.abs(v.speed) / 90, 0.35, 1) * (v.speed >= 0 ? 1 : -1) * grip;
    v.angle = normalizeAngle(v.angle);
    const nx = v.x + Math.cos(v.angle) * v.speed * dt;
    const ny = v.y + Math.sin(v.angle) * v.speed * dt;
    // The player's car may leave the asphalt — sidewalks, grass, the beach —
    // but never the sea (unless the sandbar is dry). Buildings still stop it.
    if (carCanBe(nx, v.y, state.tidePhase)) v.x = nx; else v.speed *= 0.5;
    if (carCanBe(v.x, ny, state.tidePhase)) v.y = ny; else v.speed *= 0.5;
    v.x = clamp(v.x, 10, WORLD_W - 10);
    v.y = clamp(v.y, 10, CITY + BEACH_H + 40); // cars never enter the sea
    pushOutOfBuildings(v, 20);
    if (Math.abs(steer) > 0 && Math.abs(v.speed) > 260) {
      addSkid(v.x - Math.cos(v.angle) * 14, v.y - Math.sin(v.angle) * 14, v.angle);
      if (state.rng() < 0.3) state.smoke(v.x, v.y, 1);
    }
    if (v.health < 40 && state.rng() < 0.2) state.smoke(v.x, v.y, 1);
    if (v.health <= 0) {
      state.smoke(v.x, v.y, 10);
      state.events.push({ type: 'carWrecked' });
      state.vehicles.splice(state.vehicles.indexOf(v), 1);
      state.playerVehicle = null;
      state.player.onFoot = true;
      state.player.x = v.x + 30;
      state.player.y = v.y + 30;
    }
  }

  function stepBoat(dt, input, b) {
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (input.up) b.speed += 260 * dt;
    else if (input.down) b.speed -= 300 * dt;
    else b.speed -= Math.sign(b.speed) * Math.min(Math.abs(b.speed), 160 * dt);
    b.speed = clamp(b.speed, -90, 380);
    b.angle += steer * 1.9 * dt * clamp(Math.abs(b.speed) / 120, 0, 1);
    b.angle = normalizeAngle(b.angle);
    const nx = b.x + Math.cos(b.angle) * b.speed * dt;
    const ny = b.y + Math.sin(b.angle) * b.speed * dt;
    // Boats live on water; the shoreline and the dry sandbar stop them.
    if (isWater(nx, b.y, state.tidePhase)) b.x = nx; else b.speed *= 0.4;
    if (isWater(b.x, ny, state.tidePhase)) b.y = ny; else b.speed *= 0.4;
    b.x = clamp(b.x, 10, WORLD_W - 10);
    b.y = clamp(b.y, SEA_TOP - 4, WORLD_H - 10);
  }

  function stepHeli(dt, input, h) {
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    h.angle += steer * 2.2 * dt;
    h.angle = normalizeAngle(h.angle);
    if (input.up) h.speed = Math.min(320, h.speed + 240 * dt);
    else if (input.down) h.speed = Math.max(-120, h.speed - 240 * dt);
    else h.speed -= Math.sign(h.speed) * Math.min(Math.abs(h.speed), 200 * dt);
    if (input.ascend) h.alt = Math.min(260, h.alt + 70 * dt);
    if (input.descend) h.alt = Math.max(0, h.alt - 80 * dt);
    const fly = clamp(h.alt / 60, 0, 1);
    h.x += Math.cos(h.angle) * h.speed * fly * dt;
    h.y += Math.sin(h.angle) * h.speed * fly * dt;
    h.x = clamp(h.x, 10, WORLD_W - 10);
    h.y = clamp(h.y, 10, WORLD_H - 10);
    if (h.alt <= 0) h.speed *= 0.9;
  }

  // ---- main step ---------------------------------------------------------
  function step(dt, input = {}) {
    state.time += dt;
    state.clock = (17.4 + state.time / 240 * 24) % 24;
    state.tidePhase = (state.time / TIDE.lengthSeconds) % 1;
    for (const t of state.toasts) t.t += dt;
    state.toasts = state.toasts.filter((t) => t.t < 4);
    for (const pt of state.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const s of state.skids) s.life -= dt;
    state.skids = state.skids.filter((s) => s.life > 0);
    state.shake = Math.max(0, state.shake - dt * 22);

    if (state.busted || state.wasted) return;
    const p = state.player;

    if (input.radio) {
      state.radio = (state.radio + 1) % RADIO.length;
      toast(`Radio: ${RADIO[state.radio].name} — ${RADIO[state.radio].desc}`, 'info');
      state.events.push({ type: 'radio', station: state.radio });
    }
    if (input.enter) enterVehicle();
    if (input.punch && p.onFoot) punch();
    if (input.shoot && p.onFoot) shoot();

    if (state.playerVehicle) {
      const v = state.playerVehicle;
      p.x = v.x; p.y = v.y; p.angle = v.angle;
      if (v.kind === 'heli') stepHeli(dt, input, v);
      else if (v.kind === 'boat') stepBoat(dt, input, v);
      else stepCar(dt, input, v);
      p.x = v.x; p.y = v.y; p.angle = v.angle;
    } else {
      stepOnFoot(dt, input);
    }

    updateTraffic(state, dt);
    updatePeds(state, dt);
    updatePolice(state, dt);
    updatePoliceHeli(state, dt);

    // Player car vs traffic: bump, sparks, damage — no velocity swap, and
    // damage at most once per half second so a long overlap cannot shred the car.
    const pv = state.playerVehicle;
    if (pv && pv.kind === 'car') {
      if (pv.bumpTimer > 0) pv.bumpTimer -= dt;
      for (const c of state.traffic) {
        const d2 = dist2(pv.x, pv.y, c.x, c.y);
        if (d2 < 32 * 32) {
          const d = Math.sqrt(d2) || 1;
          const nx = (c.x - pv.x) / d;
          const ny = (c.y - pv.y) / d;
          // Separate by the full overlap at once: a head-on must glance off,
          // not grind both cars to a stop while overlapped.
          const push = (32 - d) / 2 + 1;
          pv.x -= nx * push; pv.y -= ny * push;
          c.x += nx * push; c.y += ny * push;
          pv.speed *= 0.95; c.speed *= 0.5;
          if ((pv.bumpTimer || 0) <= 0 && Math.abs(pv.speed) > 60) {
            pv.health = Math.max(0, pv.health - 2);
            pv.bumpTimer = 0.5;
            sparks(pv.x, pv.y, 3);
          }
        }
      }
      // Running over a pedestrian.
      for (let i = state.peds.length - 1; i >= 0; i -= 1) {
        const ped = state.peds[i];
        if (dist2(pv.x, pv.y, ped.x, ped.y) < 26 * 26 && Math.abs(pv.speed) > 60) {
          state.peds.splice(i, 1);
          sparks(ped.x, ped.y, 5);
          addWanted(state, 1, 'Ran over a pedestrian');
        }
      }
    }

    // Safehouse: 3s inside clears the heat and saves.
    if (dist2(p.x, p.y, places.safehouse.x, places.safehouse.y) < 70 * 70) {
      state.safeTimer += dt;
      if (state.safeTimer >= 3 && p.wanted > 0) {
        p.wanted = 0;
        state.police.length = 0;
        state.heli.active = false;
        state.safeTimer = 0;
        toast('Safehouse — heat cleared, progress saved', 'good');
        state.events.push({ type: 'safehouse' });
      }
    } else {
      state.safeTimer = Math.max(0, state.safeTimer - dt);
    }

    // Health regen when calm.
    if (p.wanted === 0 && p.health < PLAYER.health) p.health = Math.min(PLAYER.health, p.health + 2 * dt);

    // Missions.
    if (state.mission) {
      const m = state.mission;
      const s = currentStep();
      if (m.def.timeLimit) {
        m.timer -= dt;
        if (m.timer <= 0) { failMission('ran out of time'); }
      }
      if (s && !state.busted) {
        if (s.kind === 'goto' || s.kind === 'deliver') {
          const needVeh = s.kind === 'deliver' || s.needVehicle;
          const okVeh = !needVeh || !!state.playerVehicle;
          const okTide = !s.needLowTide || sandbarDry(state.tidePhase);
          if (okVeh && okTide && dist2(p.x, p.y, s.x, s.y) < s.r * s.r) completeStep();
        } else if (s.kind === 'pickup') {
          if (state.crates.length === 0) spawnCrates(s);
          for (const c of state.crates) {
            if (!c.taken && dist2(p.x, p.y, c.x, c.y) < 44 * 44) {
              c.taken = true;
              m.collected += 1;
              if (s.alarm && m.collected === 1) addWanted(state, s.alarm, 'Alarm tripped');
              toast(`Crate ${m.collected}/${s.count}`, 'mission');
            }
          }
          if (m.collected >= s.count) completeStep();
        } else if (s.kind === 'survive') {
          if (p.wanted >= (s.needWanted || 1)) m.survive += dt;
          if (m.survive >= s.seconds) completeStep();
        } else if (s.kind === 'boat') {
          const b = state.playerVehicle;
          if (b && b.kind === 'boat' && dist2(p.x, p.y, s.x, s.y) < s.r * s.r) completeStep();
        } else if (s.kind === 'fly') {
          const h = state.playerVehicle;
          if (h && h.kind === 'heli' && h.alt < 60 && dist2(p.x, p.y, s.x, s.y) < s.r * s.r) completeStep();
        } else if (s.kind === 'buy') {
          if (dist2(p.x, p.y, s.x, s.y) < s.r * s.r) {
            if (p.cash >= s.cost) {
              p.cash -= s.cost;
              p.ammo += s.ammo;
              toast(`Bought ${s.ammo} rounds`, 'good');
              completeStep();
            }
          }
        }
      }
    }

    // Busted / wasted.
    if (state.busted) {
      state.stats.busted += 1;
      const fine = Math.floor(p.cash * ECONOMY.bustedFine);
      p.cash -= fine;
      p.wanted = 0;
      state.police.length = 0;
      state.heli.active = false;
      if (state.playerVehicle) { state.playerVehicle.speed = 0; state.playerVehicle = null; }
      p.onFoot = true;
      p.x = places.safehouse.x; p.y = places.safehouse.y;
      p.health = PLAYER.health;
      state.events.push({ type: 'busted', fine });
    }
    if (p.health <= 0 && !state.wasted) {
      state.wasted = true;
      p.cash = Math.max(0, p.cash - 50);
      p.wanted = 0;
      state.police.length = 0;
      state.heli.active = false;
      if (state.playerVehicle) { state.playerVehicle = null; }
      p.onFoot = true;
      p.x = places.hospital.x; p.y = places.hospital.y;
      p.health = PLAYER.health;
      state.events.push({ type: 'wasted' });
    }
  }

  function drainEvents() {
    const e = state.events;
    state.events = [];
    return e;
  }

  function respawn() {
    state.busted = false;
    state.wasted = false;
    state.screen = 'play';
  }

  // Test / shot helpers (also used by the autopilot sim).
  function teleport(x, y) {
    const p = state.player;
    p.x = x; p.y = y;
    if (state.playerVehicle) {
      state.playerVehicle.x = x;
      state.playerVehicle.y = y;
      state.playerVehicle.speed = 0;
    }
  }
  function setWanted(n) { state.player.wanted = n; }
  function setTide(phase) { state.tidePhase = phase; state.time = phase * TIDE.lengthSeconds; }
  function setClock(h) { state.clock = h; state.time = ((h - 17.4 + 24) % 24) / 24 * 240; }
  function giveCash(n) { state.player.cash += n; }
  function setAmmo(n) { state.player.ammo = n; }
  function spawnOwnedCar(type) {
    const spec = CAR_TYPES[type];
    const car = {
      kind: 'car', type, x: state.player.x + 40, y: state.player.y, angle: 0, speed: 0,
      color: spec.color, fromGarage: true, stolen: false, health: 100, owned: true,
    };
    state.vehicles.push(car);
    return car;
  }

  return {
    state, step, startMission, buyCar, buyAmmo, paintCar,
    saveData, loadData, drainEvents, respawn, teleport,
    setWanted, setTide, setClock, giveCash, setAmmo, spawnOwnedCar,
    SAVE_KEY,
  };
}
