// Solmar Heat — the screenshot scenes behind ?shot=cover|drive|mission|chase.
// Each one plays the real rules forward from a fresh game for a fixed number
// of steps, steered by a small autopilot (drive toward a point, walk toward a
// point), so the frame is what real play looks like and the same seed always
// gives the same frame. The cover must show at once: the police heli, the
// wanted stars, the minimap and the mission objective.

import { STEP } from './config.js';
import { SCREEN_PLAY } from './render.js';

// Steering input toward (tx, ty) from wherever the player is right now.
function driveInput(game, tx, ty) {
  const s = game.state;
  const p = s.player;
  const pv = s.playerVehicle;
  if (pv) {
    const want = Math.atan2(ty - pv.y, tx - pv.x);
    let d = want - pv.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d <= -Math.PI) d += Math.PI * 2;
    return { up: true, left: d < -0.12, right: d > 0.12 };
  }
  const dx = tx - p.x;
  const dy = ty - p.y;
  return {
    up: dy < -8, down: dy > 8, left: dx < -8, right: dx > 8,
    run: Math.hypot(dx, dy) > 120,
  };
}

function driveFor(game, tx, ty, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP, driveInput(game, tx, ty));
}

function walkFor(game, tx, ty, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP, driveInput(game, tx, ty));
}

function boardOwned(game, type) {
  game.state.player.rep = 25;
  game.giveCash(3000);
  game.buyCar(type);
  const car = game.state.vehicles[game.state.vehicles.length - 1];
  game.teleport(car.x, car.y - 30);
  game.step(STEP, { enter: true });
  return car;
}

function stageCover(game) {
  // Dusk, sports car, wanted 3, mission 1 live, police heli overhead.
  // Tide first: setTide also resets the clock, so the clock goes last.
  game.setTide(0.5);
  game.setClock(18.2);
  const car = boardOwned(game, 'sports');
  game.startMission(1);
  game.setWanted(3);
  const stand = game.state.places.taxiStand;
  // Drive toward the fare for 10s: cruisers and the heli close in on the way.
  driveFor(game, stand.x, stand.y, 10);
  if (game.state.busted || game.state.wasted) {
    // The chase caught Rico during staging — put him back in the sports car
    // with the heat back on so the cover still shows the chase.
    game.respawn();
    game.teleport(car.x, car.y - 30);
    game.step(STEP, { enter: true });
    game.setWanted(3);
    game.step(STEP, {});
    game.step(STEP, {});
  }
  if (game.state.playerVehicle) {
    game.state.playerVehicle.speed = Math.max(game.state.playerVehicle.speed, 120);
  }
  return { screen: SCREEN_PLAY };
}

function stageDrive(game) {
  // Bright morning, taxi in traffic, clean record.
  game.setClock(10.0);
  boardOwned(game, 'taxi');
  const s = game.state;
  driveFor(game, s.places.fishMarket.x, s.places.fishMarket.y, 12);
  if (game.state.playerVehicle) {
    game.state.playerVehicle.speed = Math.max(game.state.playerVehicle.speed, 150);
  }
  return { screen: SCREEN_PLAY };
}

function stageMission(game) {
  // Afternoon at the fish market: the heist is live, crates on the ground.
  game.setClock(15.5);
  game.startMission(6);
  const m = game.state.places.fishMarket;
  game.teleport(m.x - 120, m.y - 60);
  walkFor(game, m.x, m.y, 3.5);
  return { screen: SCREEN_PLAY };
}

function stageChase(game) {
  // Night, five stars, cruisers on the tail and the heli above.
  game.setClock(22.0);
  const car = boardOwned(game, 'sports');
  game.setWanted(5);
  const s = game.state;
  driveFor(game, s.places.oldTown.x, s.places.oldTown.y, 12);
  if (game.state.busted || game.state.wasted) {
    // The chase caught Rico during staging — put him back in the sports car
    // with the heat back on for a short burst so the frame shows the chase.
    game.respawn();
    game.teleport(car.x, car.y - 30);
    game.step(STEP, { enter: true });
    game.setWanted(5);
    driveFor(game, s.places.oldTown.x, s.places.oldTown.y, 3);
  }
  if (game.state.busted || game.state.wasted) {
    // Last resort: the car, parked with five stars and the heli overhead.
    game.respawn();
    game.teleport(car.x, car.y - 30);
    game.step(STEP, { enter: true });
    game.setWanted(5);
    game.step(STEP, {});
    game.step(STEP, {});
  }
  if (game.state.playerVehicle) {
    game.state.playerVehicle.speed = Math.max(game.state.playerVehicle.speed, 120);
  }
  return { screen: SCREEN_PLAY };
}

export function stageShot(name, game) {
  if (name === 'drive') return stageDrive(game);
  if (name === 'mission') return stageMission(game);
  if (name === 'chase') return stageChase(game);
  return stageCover(game);
}
