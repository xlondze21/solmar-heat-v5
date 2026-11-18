// Solmar Heat — boot and the one loop. Input is read every frame, the game
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. Screens: title, play, paused,
// busted, wasted.
//
// ?seed=N fixes the world. ?shot=cover|drive|mission|chase (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createGame } from './game.js';
import {
  ACTION_ENTER, ACTION_PAUSE, ACTION_PUNCH, ACTION_RADIO, ACTION_SHOOT,
  ACTION_START, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  SCREEN_WASTED,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) game.loadData(JSON.parse(raw));
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}

function persist() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(game.saveData()));
  } catch {
    // Ignore: see loadSave.
  }
}

function runShot(name) {
  const scene = stageShot(name, game);
  let painted = 0;
  function paint() {
    renderer.draw(game.state, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput();
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let sirenTimer = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    loadSave();
    game.state.screen = 'play';
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startRadio();
    announce('Playing Solmar Heat. WASD to move, E to enter a car.');
  }

  function handleActions(actions) {
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_TITLE && (actions & (ACTION_ENTER | ACTION_START))) {
      startGame();
      return;
    }
    if ((screen === SCREEN_BUSTED || screen === SCREEN_WASTED) && (actions & ACTION_ENTER)) {
      game.respawn();
      screen = SCREEN_PLAY;
      announce('Back on the streets.');
    }
  }

  function stepGame(actions) {
    const held = input.held;
    const stepInput = {
      up: held.up, down: held.down, left: held.left, right: held.right,
      run: held.run, ascend: held.ascend, descend: held.descend,
      enter: !!(actions & ACTION_ENTER),
      punch: !!(actions & ACTION_PUNCH),
      shoot: !!(actions & ACTION_SHOOT),
      radio: !!(actions & ACTION_RADIO),
    };
    // Mission key: start the next mission from anywhere.
    if (actions & ACTION_START && !game.state.mission && game.state.nextMission <= 10) {
      game.startMission(game.state.nextMission);
    }
    // Garage keys: buy a car while standing at the garage.
    const p = game.state.player;
    const g = game.state.places.garage;
    const nearGarage = (p.x - g.x) ** 2 + (p.y - g.y) ** 2 < 90 * 90;
    game.step(STEP, stepInput);
    // Number-key purchases (read straight from the keyboard each frame).
    if (nearGarage && !game.state.playerVehicle) {
      if (window.__buyKey) {
        const key = window.__buyKey;
        window.__buyKey = null;
        if (key === '1') game.buyCar('taxi');
        else if (key === '2') game.buyCar('truck');
        else if (key === '3') game.buyCar('sports');
      }
    }
    // Sound + save reactions to what just happened.
    for (const e of game.drainEvents()) {
      if (e.type === 'shoot') audio.shot();
      else if (e.type === 'punch') audio.punch();
      else if (e.type === 'missionComplete') { audio.jingle(); persist(); }
      else if (e.type === 'missionFail') audio.fail();
      else if (e.type === 'safehouse') persist();
      else if (e.type === 'busted' || e.type === 'wasted') { audio.fail(); persist(); }
      else if (e.type === 'ram' || e.type === 'carWrecked') audio.crash();
      else if (e.type === 'heliDown') game.state.stats.heliDown += 1;
    }
    if (game.state.player.wanted > 0) {
      sirenTimer -= STEP;
      if (sirenTimer <= 0) { audio.siren(); sirenTimer = 2.2; }
    }
    const pv = game.state.playerVehicle;
    audio.setEngine(pv ? Math.abs(pv.speed || 0) : 0, 560);
    audio.setStation(game.state.radio);
    if (game.state.busted) {
      screen = SCREEN_BUSTED;
      announce(`Busted. The police took their cut.`);
    } else if (game.state.wasted) {
      screen = SCREEN_WASTED;
      announce('Wasted. The hospital patched you up.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_PLAY) {
      // Edge actions (enter / punch / shoot / radio) fire once: only the
      // first fixed sub-step of this frame sees them.
      let first = true;
      while (accumulator >= STEP) {
        stepGame(first ? actions : 0);
        first = false;
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) { accumulator = 0; break; }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(game.state, screen);
  }

  // Number keys for the garage (kept outside createInput's held set).
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
      window.__buyKey = event.code.slice(-1);
    }
  });

  // Leaving the tab pauses a running game rather than letting the heat build unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Heat. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
