// Solmar Heat — wanted level, police cruisers and the police helicopter.
// Pure logic: cruisers pathfind on the road graph toward the player, ram with
// a 0.5s cooldown each, and hold the player still to bust them. The heli only
// shows up at 3+ stars, calls in ground units, can be shot down, and comes
// back after a 45s delay.

import { CAR_TYPES, WANTED } from './config.js';
import { angleDiff, clamp, dist2, range } from './random.js';
import { nearestRoadPoint, roadCenter } from './world.js';

export function addWanted(state, stars, reason) {
  const before = state.player.wanted;
  state.player.wanted = Math.min(WANTED.max, state.player.wanted + stars);
  if (state.player.wanted > before) {
    state.toast(`${reason} — wanted ${'★'.repeat(state.player.wanted)}`, 'danger');
    state.events.push({ type: 'wanted', stars: state.player.wanted });
  }
}

export function policeAggression(state) {
  // Noon heat (11:00-15:00) makes the police faster and more numerous.
  const hour = state.clock;
  const heat = hour >= 11 && hour <= 15 ? 1.18 : 1;
  return heat;
}

export function spawnCruiser(state) {
  const p = state.player;
  // Spawn on a ring 450-700px out, on a road, so the player gets a chance
  // to run — cruisers close in fast enough on their own.
  const a = state.rng() * Math.PI * 2;
  const d = range(state.rng, 450, 700);
  const near = nearestRoadPoint(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
  const angle = Math.atan2(p.y - near.y, p.x - near.x);
  state.police.push({
    kind: 'police', type: 'sedan',
    x: near.x, y: near.y, angle, speed: 0,
    top: Math.min(470, CAR_TYPES.sedan.top * 1.08 * policeAggression(state)),
    ramCooldown: 0, siren: state.rng() * 2,
  });
}

export function updatePolice(state, dt) {
  const p = state.player;
  const want = p.wanted;
  // Keep one cruiser per star, spawn a little away from the player.
  if (want > 0) {
    state.spawnTimer -= dt;
    if (state.police.length < want && state.spawnTimer <= 0) {
      spawnCruiser(state);
      state.spawnTimer = 1.6;
    }
  }
  // Wanted decays only when the coast is clear.
  let nearest = Infinity;
  for (const c of state.police) nearest = Math.min(nearest, Math.hypot(c.x - p.x, c.y - p.y));
  if (want > 0 && nearest > 520) {
    state.quietTimer += dt;
    if (state.quietTimer >= WANTED.decaySeconds) {
      state.player.wanted -= 1;
      state.quietTimer = 0;
      state.toast('Heat cooling off…', 'info');
    }
  } else {
    state.quietTimer = 0;
  }

  const pv = state.playerVehicle;
  const targetSpeed = pv ? Math.abs(pv.speed) : 0;
  // One ram at a time: after any cruiser rams the player, no cruiser can
  // ram again for 0.8s, so five cruisers cannot juggle the car to a stop.
  if (pv && pv.ramImmune > 0) pv.ramImmune -= dt;
  for (const c of state.police) {
    c.siren += dt;
    if (c.ramCooldown > 0) c.ramCooldown -= dt;
    // Chase: steer at the player, cut corners by aiming slightly ahead.
    const lead = 0.35;
    const tx = p.x + (pv ? Math.cos(pv.angle) * pv.speed * lead : 0);
    const ty = p.y + (pv ? Math.sin(pv.angle) * pv.speed * lead : 0);
    const wantAngle = Math.atan2(ty - c.y, tx - c.x);
    c.angle += clamp(angleDiff(c.angle, wantAngle), -3.2 * dt, 3.2 * dt);
    const dist = Math.hypot(tx - c.x, ty - c.y);
    // Close in fast from afar, but crawl once on top of the player — a
    // cruiser that orbits at its turning radius can never pin anyone.
    const cruise = dist > 300 ? c.top : dist > 120 ? Math.max(120, targetSpeed + 40) : 60;
    c.speed = Math.min(cruise, c.speed + 380 * dt);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    // Ram: only a real hit at speed counts — a slow nudge is not a ram.
    // The global ram immunity (set below) caps rams at ~1.25/s in total.
    if (pv && dist2(c.x, c.y, pv.x, pv.y) < 34 * 34 && c.ramCooldown <= 0 && c.speed > 120 && !(pv.ramImmune > 0)) {
      c.ramCooldown = WANTED.ramCooldown;
      pv.ramImmune = 0.8;
      pv.speed *= 0.94;
      pv.health = Math.max(0, (pv.health ?? 100) - 3);
      p.health = Math.max(0, p.health - 2);
      const d = Math.hypot(pv.x - c.x, pv.y - c.y) || 1;
      pv.x += ((pv.x - c.x) / d) * 8;
      pv.y += ((pv.y - c.y) / d) * 8;
      c.speed *= 0.45;
      c.angle += (state.rng() < 0.5 ? -1 : 1) * 0.5;
      // Being rammed counts toward being pinned: repeated rams end in a bust.
      state.bustTimer += 0.3;
      state.shake = Math.min(10, state.shake + 5);
      state.sparks(c.x, c.y, 6);
      state.events.push({ type: 'ram' });
      if (pv.health <= 0) state.events.push({ type: 'carWrecked' });
    }
    // On foot, a cruiser nudging the player hurts too.
    if (!pv && dist2(c.x, c.y, p.x, p.y) < 30 * 30 && c.ramCooldown <= 0) {
      c.ramCooldown = WANTED.ramCooldown;
      p.health = Math.max(0, p.health - 5);
      state.shake = Math.min(10, state.shake + 5);
    }
  }
  // Bust: a cruiser sits on a slow player for 2s.
  if (want > 0 && nearest < WANTED.bustRange && targetSpeed < WANTED.bustSpeed) {
    state.bustTimer += dt;
    if (state.bustTimer >= WANTED.bustHoldSeconds) {
      state.busted = true;
      state.bustTimer = 0;
    }
  } else {
    state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
  }
  // Drop cruisers that fell far behind when wanted is gone.
  if (want === 0 && state.police.length > 0) {
    state.police.length = 0;
  }
  // Cruisers keep their distance from each other instead of dogpiling on
  // one point on top of the player.
  for (let a = 0; a < state.police.length; a += 1) {
    for (let b = a + 1; b < state.police.length; b += 1) {
      const A = state.police[a];
      const B = state.police[b];
      const d2 = dist2(A.x, A.y, B.x, B.y);
      if (d2 < 44 * 44 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const nx = (B.x - A.x) / d;
        const ny = (B.y - A.y) / d;
        const push = (44 - d) / 2;
        A.x -= nx * push; A.y -= ny * push;
        B.x += nx * push; B.y += ny * push;
      }
    }
  }
}

export function updatePoliceHeli(state, dt) {
  const p = state.player;
  const heli = state.heli;
  if (p.wanted >= WANTED.heliAt) {
    if (!heli.active && heli.respawnTimer <= 0) {
      heli.active = true;
      heli.health = WANTED.heliHealth;
      heli.x = p.x + 260;
      heli.y = p.y - 260;
      heli.angle = 0;
      heli.alt = 120;
      heli.spot = 0;
      state.toast('Police helicopter overhead!', 'danger');
      state.events.push({ type: 'heliSpawn' });
    }
  }
  if (heli.respawnTimer > 0) heli.respawnTimer -= dt;
  if (!heli.active) return;
  // Circle the player, spotlight on them, call in ground units.
  heli.orbit += dt * 0.55;
  const R = 190;
  heli.x = p.x + Math.cos(heli.orbit) * R;
  heli.y = p.y + Math.sin(heli.orbit) * R;
  heli.angle += dt;
  heli.callTimer -= dt;
  if (heli.callTimer <= 0) {
    heli.callTimer = 6;
    if (state.police.length < WANTED.max) spawnCruiser(state);
  }
  if (heli.health <= 0) {
    heli.active = false;
    heli.respawnTimer = WANTED.heliRespawn;
    heli.falling = true;
    state.toast('Police heli shot down! It will be back in 45s.', 'good');
    state.events.push({ type: 'heliDown' });
    state.smoke(heli.x, heli.y, 14);
  }
}

// Player shooting the police heli: needs ammo, line of sight and aim.
export function shootAtHeli(state) {
  const heli = state.heli;
  const p = state.player;
  if (!heli.active || p.ammo <= 0) return false;
  const d = Math.hypot(heli.x - p.x, heli.y - p.y);
  if (d > 420) return false;
  const aim = Math.atan2(heli.y - p.y, heli.x - p.x);
  if (Math.abs(angleDiff(p.angle, aim)) > 0.7) return false;
  heli.health -= 1;
  state.events.push({ type: 'heliHit', health: heli.health });
  return true;
}
