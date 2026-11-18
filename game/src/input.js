// Solmar Heat — keyboard input. Held keys give movement/steering; one-shot
// presses (enter, punch, shoot, radio, pause, start) are queued as flags and
// taken once by the loop, so a press between frames is never lost or double
// counted. A key released while the tab is hidden never sends keyup, so blur
// lets go of everything.

export const ACTION_ENTER = 1;
export const ACTION_PUNCH = 2;
export const ACTION_SHOOT = 4;
export const ACTION_RADIO = 8;
export const ACTION_PAUSE = 16;
export const ACTION_START = 32;

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyC: 'descend',
};

export function createInput() {
  const held = { up: false, down: false, left: false, right: false, run: false, descend: false };
  let actions = 0;

  function onKeyDown(event) {
    const name = KEYMAP[event.code];
    if (name) {
      held[name] = true;
      // Shift doubles as "ascend" for the helicopter.
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.ascend = true;
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    if (event.code === 'KeyE' || event.code === 'Enter') actions |= ACTION_ENTER;
    else if (event.code === 'KeyF') actions |= ACTION_PUNCH;
    else if (event.code === 'Space') { actions |= ACTION_SHOOT; event.preventDefault(); }
    else if (event.code === 'KeyR') actions |= ACTION_RADIO;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyM') actions |= ACTION_START;
  }
  function onKeyUp(event) {
    const name = KEYMAP[event.code];
    if (name) held[name] = false;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.ascend = false;
  }
  function onBlur() {
    for (const k of Object.keys(held)) held[k] = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    held,
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
