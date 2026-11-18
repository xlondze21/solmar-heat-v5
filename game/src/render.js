// Solmar Heat — drawing only: game state in, pixels out.
// The 1280x720 logical view is scaled to fit the window and centred. The
// camera follows the player across the city, beach and sea; the HUD carries
// wanted stars, cash, health, speed, the mission tracker, the radio station,
// the tide gauge and the clock; the minimap shows roads, the sea, rival turf,
// the player, the police and the current objective.

import { BLOCK, CELL, CITY, FONT, GRID, PALETTE, RADIO, ROAD, ROAD0, SEA_TOP, TIDE } from './config.js';
import { blockRect, isSea, roadCenter, sandbarDry, SANDBAR } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

export function dayFactor(clock) {
  // 1.0 at midday, 0.0 at midnight; dusk/dawn sit in between.
  const h = clock;
  if (h >= 6 && h <= 17) return 1;
  if (h >= 18 && h <= 19.5) return 1 - (h - 18) / 1.5 * 0.85;
  if (h >= 5 && h < 6) return 0.15 + (h - 5) * 0.85;
  if (h > 19.5 || h < 5) return 0.15;
  return 1;
}

export function dayLabel(clock) {
  if (clock >= 5 && clock < 7) return 'Dawn';
  if (clock >= 7 && clock < 11) return 'Morning';
  if (clock >= 11 && clock < 15) return 'Midday — hot';
  if (clock >= 15 && clock < 18) return 'Afternoon';
  if (clock >= 18 && clock < 20) return 'Dusk';
  return 'Night';
}

function fmtClock(clock) {
  const h = Math.floor(clock);
  const m = Math.floor((clock - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, w: 1280, h: 720 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * ratio);
    const h = Math.round(window.innerHeight * ratio);
    canvas.width = w;
    canvas.height = h;
    view.scale = Math.min(w / 1280, h / 720);
    view.w = w / view.scale;
    view.h = h / view.scale;
    view.x = (w - 1280 * view.scale) / 2;
    view.y = (h - 720 * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', baseline = 'alphabetic') {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    ctx.font = fonts.get(size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(value, x, y);
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCarShape(x, y, angle, type, color, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    const len = type === 'truck' ? 62 : type === 'sports' ? 46 : 50;
    const wid = type === 'truck' ? 26 : 22;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(-len / 2 + 2, -wid / 2 + 3, len, wid, 6);
    ctx.fill();
    ctx.fillStyle = color;
    rr(-len / 2, -wid / 2, len, wid, 6);
    ctx.fill();
    // Cabin / windshield.
    ctx.fillStyle = '#1c2733';
    if (type === 'truck') {
      ctx.fillRect(len / 2 - 16, -wid / 2 + 3, 12, wid - 6);
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(-len / 2 + 2, -wid / 2 + 3, 18, wid - 6);
    } else {
      rr(-4, -wid / 2 + 3, 16, wid - 6, 4);
      ctx.fill();
    }
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(len / 2 - 2, -wid / 2 + 2, 3, 5);
    ctx.fillRect(len / 2 - 2, wid / 2 - 7, 3, 5);
    if (type === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.fillRect(-8, -wid / 2 + 2, 16, 4);
      ctx.fillRect(-8, wid / 2 - 6, 16, 4);
      ctx.fillStyle = '#f2b705';
      ctx.fillRect(-4, -5, 9, 10);
    }
    ctx.restore();
  }

  function drawHeliShape(x, y, angle, alt, isPolice) {
    ctx.save();
    ctx.translate(x, y);
    const shadowScale = 1 - Math.min(0.4, alt / 600);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(6, 8, 26 * shadowScale, 12 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    // Rotor disc — the big readable circle that says "helicopter".
    ctx.fillStyle = 'rgba(220,220,220,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 44, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,240,240,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-44, 0); ctx.lineTo(44, 0);
    ctx.moveTo(0, -10); ctx.lineTo(0, 10);
    ctx.stroke();
    ctx.fillStyle = isPolice ? '#1d3f8a' : '#c0392b';
    rr(-22, -9, 44, 18, 8);
    ctx.fill();
    ctx.fillStyle = '#bfe3ea';
    rr(8, -6, 10, 12, 4);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(-30, -2, 10, 4); // tail
    ctx.restore();
    if (isPolice) {
      // Spotlight cone on the ground below.
      ctx.fillStyle = 'rgba(255, 244, 180, 0.20)';
      ctx.beginPath();
      ctx.arc(x, y, 90, 0, Math.PI * 2);
      ctx.fill();
    }
    text(isPolice ? 'POLICE HELI' : 'HELI', x, y - 52, 13, '#fff', 'center');
  }

  function drawBoatShape(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#e8e8e8';
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(10, -11);
    ctx.lineTo(-24, -9);
    ctx.lineTo(-24, 9);
    ctx.lineTo(10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2c6ec9';
    ctx.fillRect(-12, -6, 16, 12);
    ctx.restore();
  }

  function drawWorld(state) {
    const s = state;
    const cam = s.camera;
    const x0 = Math.max(0, cam.x - 40);
    const y0 = Math.max(0, cam.y - 40);
    const x1 = Math.min(3200, cam.x + cam.w + 40);
    const y1 = Math.min(3800, cam.y + cam.h + 40);

    // Ground.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Sea.
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(x0, Math.max(y0, SEA_TOP), x1 - x0, y1 - Math.max(y0, SEA_TOP));
    ctx.fillStyle = PALETTE.seaDeep;
    ctx.fillRect(x0, Math.max(y0, SEA_TOP + 300), x1 - x0, y1 - Math.max(y0, SEA_TOP + 300));
    // Foam line where the waves meet the sand.
    ctx.strokeStyle = PALETTE.seaFoam;
    ctx.lineWidth = 3;
    const wave = Math.sin(s.time * 1.4) * 5;
    ctx.beginPath();
    ctx.moveTo(x0, SEA_TOP + wave);
    ctx.lineTo(x1, SEA_TOP + wave);
    ctx.stroke();
    // Beach.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(x0, Math.max(y0, CITY + 8), x1 - x0, Math.min(y1, SEA_TOP) - Math.max(y0, CITY + 8));
    // Sandbar: dry at low tide, submerged at high tide.
    if (sandbarDry(s.tidePhase)) {
      ctx.fillStyle = '#e3cd96';
      ctx.fillRect(SANDBAR.x0, SANDBAR.y0, SANDBAR.x1 - SANDBAR.x0, SANDBAR.y1 - SANDBAR.y0);
    }
    // Marina docks.
    ctx.fillStyle = PALETTE.marina;
    ctx.fillRect(roadCenter(10) - 90, SEA_TOP - 6, 190, 16);
    ctx.fillRect(roadCenter(11) - 60, SEA_TOP - 6, 130, 16);

    // Roads.
    ctx.fillStyle = PALETTE.road;
    for (let k = 0; k <= GRID; k += 1) {
      ctx.fillRect(roadCenter(k) - ROAD / 2, 0, ROAD, CITY + ROAD / 2);
      ctx.fillRect(0, roadCenter(k) - ROAD / 2, CITY + ROAD / 2, ROAD);
    }
    // Promenade along the beachfront.
    ctx.fillRect(0, CITY, CITY + ROAD / 2, 10);
    // Centre dashes.
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 22]);
    for (let k = 0; k <= GRID; k += 1) {
      ctx.beginPath(); ctx.moveTo(roadCenter(k), 0); ctx.lineTo(roadCenter(k), CITY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, roadCenter(k)); ctx.lineTo(CITY, roadCenter(k)); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Traffic lights.
    for (const l of s.city.lights) {
      if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
      const nsGreen = ((Math.floor(s.time / 8 + l.i * 0.37 + l.j * 0.53) % 2) === 0);
      ctx.fillStyle = '#111';
      ctx.fillRect(l.x - 4, l.y - 26, 8, 14);
      ctx.fillStyle = nsGreen ? '#37d67a' : '#e5534b';
      ctx.beginPath(); ctx.arc(l.x, l.y - 19, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Blocks + buildings.
    for (const b of s.city.buildings) {
      if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
      if (b.kind === 'park') {
        ctx.fillStyle = PALETTE.park;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#2f7a3d';
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.arc(b.x + 30 + i * 48, b.y + 40 + (i % 2) * 50, 14, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      ctx.fillStyle = b.kind === 'hospital' ? PALETTE.hospital : b.kind === 'market' ? PALETTE.market : PALETTE.building;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = PALETTE.buildingRoof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      if (b.kind === 'hospital') {
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(b.x + b.w / 2 - 4, b.y + b.h / 2 - 14, 8, 28);
        ctx.fillRect(b.x + b.w / 2 - 14, b.y + b.h / 2 - 4, 28, 8);
      }
    }
    // Rival turf tint (north-east blocks).
    const t = s.places.rivalTurf;
    const b0 = blockRect(t.c0, t.r0);
    const b1 = blockRect(t.c1, t.r1);
    ctx.fillStyle = 'rgba(122, 36, 48, 0.20)';
    ctx.fillRect(b0.x, b0.y, b1.x + b1.w - b0.x, b1.y + b1.h - b0.y);
    // Place labels.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const label = (txt, x, y) => {
      const w = ctx.measureText(txt).width + 12;
      rr(x - w / 2, y - 11, w, 20, 9);
      ctx.fill();
      text(txt, x, y + 4, 12, '#fff', 'center');
    };
    label('SAFEHOUSE', s.places.safehouse.x, s.places.safehouse.y - 44);
    label('GARAGE', s.places.garage.x, s.places.garage.y - 44);
    label('FISH MARKET', s.places.fishMarket.x, s.places.fishMarket.y - 48);
    label('MARINA', s.places.marina.x, s.places.marina.y - 70);
    label('OLD TOWN', s.places.oldTown.x, s.places.oldTown.y - 48);
    label('HOSPITAL', s.places.hospital.x, s.places.hospital.y - 52);
    // Helipad: painted H circle so it reads in a screenshot.
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.places.helipad.x, s.places.helipad.y, 46, 0, Math.PI * 2);
    ctx.stroke();
    text('H', s.places.helipad.x, s.places.helipad.y + 12, 34, '#fff', 'center');

    // Skid marks.
    ctx.strokeStyle = 'rgba(10,10,10,0.45)';
    ctx.lineWidth = 4;
    for (const sk of s.skids) {
      ctx.beginPath();
      ctx.moveTo(sk.x - Math.cos(sk.angle) * 10, sk.y - Math.sin(sk.angle) * 10);
      ctx.lineTo(sk.x + Math.cos(sk.angle) * 10, sk.y + Math.sin(sk.angle) * 10);
      ctx.stroke();
    }
    // Mission crates.
    for (const c of s.crates) {
      if (c.taken) continue;
      ctx.fillStyle = '#f2b705';
      ctx.fillRect(c.x - 9, c.y - 9, 18, 18);
      ctx.strokeStyle = '#7a5a00';
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x - 9, c.y - 9, 18, 18);
      ctx.beginPath(); ctx.moveTo(c.x - 9, c.y); ctx.lineTo(c.x + 9, c.y); ctx.stroke();
    }
    // Mission objective marker (pulsing).
    if (s.mission) {
      const step = s.mission.def.steps[s.mission.stepIndex];
      if (step && step.x !== undefined) {
        const pulse = 26 + Math.sin(s.time * 4) * 5;
        ctx.strokeStyle = '#ffd94a';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(step.x, step.y, pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffd94a';
        ctx.beginPath(); ctx.arc(step.x, step.y, 6, 0, Math.PI * 2); ctx.fill();
        text('!', step.x, step.y - pulse - 6, 20, '#ffd94a', 'center');
      }
    }
    // Parked / owned cars.
    for (const v of s.vehicles) {
      if (v === s.playerVehicle) continue;
      drawCarShape(v.x, v.y, v.angle, v.type, v.color);
    }
    // Traffic.
    for (const c of s.traffic) drawCarShape(c.x, c.y, c.angle, c.type, c.color);
    // Police cruisers (black & white + light bar).
    for (const c of s.police) {
      drawCarShape(c.x, c.y, c.angle, 'sedan', '#20242c');
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillStyle = (Math.floor(c.siren * 3) % 2 === 0) ? '#e5534b' : '#3a7bff';
      ctx.fillRect(-4, -9, 8, 6);
      ctx.fillRect(-4, 3, 8, 6);
      ctx.restore();
    }
    // Pedestrians.
    for (const ped of s.peds) {
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(ped.x, ped.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(ped.x, ped.y - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Boat.
    drawBoatShape(s.boat.x, s.boat.y, s.boat.angle);
    if (!s.boat.parked) text('BOAT', s.boat.x, s.boat.y - 26, 12, '#fff', 'center');
    // Player helicopter (parked or flown).
    const ph = s.playerHeli;
    if (s.playerVehicle !== ph) drawHeliShape(ph.x, ph.y, ph.angle, ph.alt, false);
    // Player vehicle / player on foot.
    const p = s.player;
    const pv = s.playerVehicle;
    if (pv) {
      if (pv.kind === 'car') drawCarShape(pv.x, pv.y, pv.angle, pv.type, pv.color);
      else if (pv.kind === 'boat') drawBoatShape(pv.x, pv.y, pv.angle);
      else drawHeliShape(pv.x, pv.y, pv.angle, pv.alt, false);
      // Speed lines when fast.
      if (pv.speed && Math.abs(pv.speed) > 380) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i += 1) {
          const a = pv.angle + (i - 1) * 0.3;
          ctx.beginPath();
          ctx.moveTo(pv.x - Math.cos(a) * 40, pv.y - Math.sin(a) * 40);
          ctx.lineTo(pv.x - Math.cos(a) * 70, pv.y - Math.sin(a) * 70);
          ctx.stroke();
        }
      }
    } else {
      // Rico on foot.
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = '#2c6ec9';
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath(); ctx.arc(4, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(10, -3, 10, 6); // facing tick
      ctx.restore();
      text('RICO', p.x, p.y - 24, 12, '#fff', 'center');
    }
    // Particles.
    for (const pt of s.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      if (pt.kind === 'smoke') {
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
      }
    }
    ctx.globalAlpha = 1;
    // Police heli (drawn last so its spotlight sits over the scene).
    if (s.heli.active) drawHeliShape(s.heli.x, s.heli.y, s.heli.angle, s.heli.alt, true);

    // Dusk / night lighting.
    const df = dayFactor(s.clock);
    if (df < 1) {
      ctx.fillStyle = `rgba(8, 12, 40, ${(1 - df) * 0.42})`;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    if (s.clock >= 17 && s.clock < 19.5) {
      ctx.fillStyle = 'rgba(255, 122, 40, 0.10)';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  function drawMinimap(state) {
    const s = state;
    const mw = 208;
    const mh = 148;
    const mx = 1280 - mw - 14;
    const my = 14;
    const sx = mw / 2900;
    const sy = mh / 3650;
    ctx.fillStyle = 'rgba(10, 14, 22, 0.82)';
    rr(mx - 6, my - 6, mw + 12, mh + 12, 10);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    rr(mx, my, mw, mh, 8);
    ctx.clip();
    // Sea + beach.
    ctx.fillStyle = '#1d5f7a';
    ctx.fillRect(mx, my + (SEA_TOP - 8) * sy, mw, mh);
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(mx, my + (CITY + 8) * sy, mw, (SEA_TOP - CITY - 8) * sy);
    ctx.fillStyle = '#3d6b35';
    ctx.fillRect(mx, my, mw, (CITY + 8) * sy);
    // Rival turf.
    const t = s.places.rivalTurf;
    const b0 = blockRect(t.c0, t.r0);
    const b1 = blockRect(t.c1, t.r1);
    ctx.fillStyle = 'rgba(229, 83, 75, 0.55)';
    ctx.fillRect(mx + b0.x * sx, my + b0.y * sy, (b1.x + b1.w - b0.x) * sx, (b1.y + b1.h - b0.y) * sy);
    // Roads.
    ctx.strokeStyle = 'rgba(220,220,220,0.75)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k <= GRID; k += 1) {
      ctx.beginPath(); ctx.moveTo(mx + roadCenter(k) * sx, my); ctx.lineTo(mx + roadCenter(k) * sx, my + CITY * sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, my + roadCenter(k) * sy); ctx.lineTo(mx + CITY * sx, my + roadCenter(k) * sy); ctx.stroke();
    }
    const dot = (x, y, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2); ctx.fill();
    };
    dot(s.places.safehouse.x, s.places.safehouse.y, 3, '#2ecc71');
    dot(s.places.garage.x, s.places.garage.y, 3, '#b07fe8');
    dot(s.places.helipad.x, s.places.helipad.y, 3, '#fff');
    if (s.mission) {
      const step = s.mission.def.steps[s.mission.stepIndex];
      if (step && step.x !== undefined) dot(step.x, step.y, 5, '#ffd94a');
    }
    for (const c of s.police) dot(c.x, c.y, 3, '#3a7bff');
    if (s.heli.active) dot(s.heli.x, s.heli.y, 4, '#7ab5ff');
    dot(s.player.x, s.player.y, 4.5, '#fff');
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mx + s.player.x * sx, my + s.player.y * sy, 4.5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    text('SOLMAR', mx + 4, my + mh - 6, 11, '#fff');
    text('RIVAL TURF', mx + mw - 4, my + mh - 6, 10, '#ff9a94', 'right');
  }

  function drawHud(state) {
    const s = state;
    const p = s.player;
    // Top-left: wanted stars, cash, REP, health.
    const stars = '★'.repeat(p.wanted) + '☆'.repeat(5 - p.wanted);
    text(stars, 16, 34, 26, p.wanted > 0 ? PALETTE.star : 'rgba(255,255,255,0.35)');
    text(`$${p.cash}`, 16, 66, 22, PALETTE.cash);
    text(`REP ${p.rep}`, 110, 66, 18, '#fff');
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    rr(16, 76, 170, 14, 7);
    ctx.fill();
    ctx.fillStyle = p.health > 40 ? '#37d67a' : '#e5534b';
    rr(18, 78, 166 * (p.health / 100), 10, 5);
    ctx.fill();
    text(`HP ${Math.round(p.health)}`, 196, 89, 14, '#fff');
    text(`Ammo ${p.ammo}`, 16, 112, 15, '#fff');
    // Top-centre: clock + day/night label + tide gauge (label kept clear of toasts).
    text(`${fmtClock(s.clock)}  ${dayLabel(s.clock)}`, 640, 30, 18, '#fff', 'center');
    const tideLow = sandbarDry(s.tidePhase);
    text(`TIDE ${tideLow ? 'LOW — sandbar open' : 'HIGH'}`, 640, 54, 14, tideLow ? '#7ddc8a' : '#9aa3b0', 'center');
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    rr(580, 62, 120, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#4aa3c9';
    rr(582, 64, 116 * s.tidePhase, 4, 2);
    ctx.fill();
    // Bottom-left: speed (pinned, so the chase HUD reads in a still frame) + radio.
    const pv = s.playerVehicle;
    const speed = pv ? Math.round(Math.abs(pv.speed || 0) * 0.22) : 0;
    text(pv ? `${speed} km/h` : 'ON FOOT', 16, 690, 26, '#fff');
    if (pv && pv.kind === 'heli') text(`ALT ${Math.round(pv.alt)}m`, 16, 660, 16, '#fff');
    if (pv && pv.kind === 'boat') text('BOAT', 16, 660, 16, '#fff');
    text(`♪ ${RADIO[s.radio].name}`, 16, 630, 15, '#ffd94a');
    text('R = radio', 16, 610, 12, 'rgba(255,255,255,0.6)');
    // Bottom-centre: mission tracker.
    if (s.mission) {
      const step = s.mission.def.steps[s.mission.stepIndex];
      const d = step && step.x !== undefined ? Math.round(Math.hypot(step.x - p.x, step.y - p.y) / 10) : null;
      const timer = s.mission.def.timeLimit ? `  ⏱ ${Math.max(0, Math.ceil(s.mission.timer))}s` : '';
      const surv = step && step.kind === 'survive' ? `  (${Math.floor(s.mission.survive)}/${step.seconds}s)` : '';
      const line = `${s.mission.def.name}: ${step ? step.label : ''}${d !== null ? ` — ${d}m` : ''}${timer}${surv}`;
      const w = ctx.measureText(line).width + 24;
      ctx.fillStyle = 'rgba(10, 14, 22, 0.78)';
      rr(640 - w / 2, 648, w, 34, 10);
      ctx.fill();
      text(line, 640, 672, 15, '#ffd94a', 'center');
    } else if (s.nextMission <= 10) {
      const def = s.missions[s.nextMission - 1];
      const line = `Next mission: ${def.name} — press M or walk to the marker and press E`;
      const w = ctx.measureText(line).width + 24;
      ctx.fillStyle = 'rgba(10, 14, 22, 0.6)';
      rr(640 - w / 2, 648, w, 34, 10);
      ctx.fill();
      text(line, 640, 672, 14, '#fff', 'center');
    } else {
      text('All missions complete — Solmar is yours, Rico.', 640, 672, 15, '#7ddc8a', 'center');
    }
    // Toasts (stacked under the top-left block, clear of the clock label).
    let ty = 132;
    for (const t of s.toasts) {
      const color = t.kind === 'danger' ? '#ff8a80' : t.kind === 'good' ? '#7ddc8a' : t.kind === 'mission' ? '#ffd94a' : '#fff';
      ctx.fillStyle = 'rgba(10, 14, 22, 0.72)';
      const w = ctx.measureText(t.text).width + 18;
      rr(16, ty, w, 26, 8);
      ctx.fill();
      text(t.text, 25, ty + 18, 14, color);
      ty += 32;
    }
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt) {
    ctx.fillStyle = 'rgba(6, 8, 14, 0.72)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#181d29';
    rr(340, 190, 600, 330, 16);
    ctx.fill();
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 2;
    rr(340, 190, 600, 330, 16);
    ctx.stroke();
    text(title, 640, 258, 44, '#ffd94a', 'center');
    let y = 310;
    for (const line of lines) {
      text(line, 640, y, 18, '#eef1f5', 'center');
      y += 30;
    }
    text(prompt, 640, 478, 20, '#7ddc8a', 'center');
  }

  function draw(state, screen) {
    const s = state;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = view.scale;
    ctx.setTransform(scale, 0, 0, scale, view.x, view.y);
    // Camera follows the player, clamped to the world.
    const shakeX = s.shake ? (Math.random() - 0.5) * s.shake : 0;
    const shakeY = s.shake ? (Math.random() - 0.5) * s.shake : 0;
    const camW = 1280;
    const camH = 720;
    const camX = Math.max(0, Math.min(2900 - camW, s.player.x - camW / 2 + shakeX));
    const camY = Math.max(0, Math.min(3650 - camH, s.player.y - camH / 2 + shakeY));
    s.camera = { x: camX, y: camY, w: camW, h: camH };
    ctx.save();
    ctx.translate(-camX, -camY);
    drawWorld(state);
    ctx.restore();
    if (screen === SCREEN_TITLE) {
      drawPanel('SOLMAR HEAT', [
        'Top-down open-world crime in the city of Solmar.',
        'Steal cars, outrun the police, fly the heli, sail the marina.',
        '10 story missions as Rico — cash, REP and the whole city to lose.',
        '',
        'WASD move / drive   E enter car, boat or heli   F punch   Space shoot',
        'R radio   M mission   P pause   1/2/3 buy car at the Garage',
      ], 'Press Enter to start');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The heat waits for no one — except now.', ''], 'Press P to resume');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Solmar PD finally got you.', `Fine paid. The city is still out there, Rico.`], 'Press Enter to walk free');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Rico went down. The hospital patched him up.', ''], 'Press Enter to get back out there');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
