// Keypad emulation. DoJa reports keys as bit positions in Canvas.getKeypadState() and as
// KEY_PRESSED_EVENT(0)/KEY_RELEASED_EVENT(1) through Canvas.processEvent().

import { wrap180 } from './camera.js';

export const KEY = {
  NUM0: 0, NUM1: 1, NUM2: 2, NUM3: 3, NUM4: 4, NUM5: 5, NUM6: 6, NUM7: 7, NUM8: 8, NUM9: 9,
  ASTERISK: 10, POUND: 11,
  LEFT: 16, UP: 17, RIGHT: 18, DOWN: 19, SELECT: 20, SOFT1: 21, SOFT2: 22,
};

// The game's default bindings (Options > Controls): Jump = 0, Buster/Confirm = 9,
// Special Weapon = 6, Lock-On = 3. Besides the raw keypad, the keyboard and gamepad get
// comfortable aliases for those four.
const JUMP = KEY.NUM0;
const BUSTER = KEY.NUM9;
const SPECIAL = KEY.NUM6;
const LOCK_ON = KEY.NUM3;

/**
 * Everything that can be bound to a keyboard key or a controller button (Settings > Controls).
 *   set:   'play' = only while playing a mission; 'menu' = only in menus, shops, dialogue and
 *          cutscenes; none = always. The two sets are separate, so one button can mean one
 *          thing in play and another in a menu (see Input.#set).
 *   keys:  phone keys the action holds down
 *   soft:  instead of fixed keys, the soft key that currently carries this label
 *   turn:  turns the view (camera, or the player with tank controls): -1 left, 1 right
 *   host:  an action handled by the page instead
 *   kb:    default KeyboardEvent.code list; pad: default standard-mapping gamepad buttons
 * The controller defaults are a modern twin-stick layout: A jump, X or RT buster, Y special
 * weapon, LT lock-on, LB/RB turn the camera, Select map, Start items; in menus A confirms,
 * B or Start goes back, LB/RB flip pages and Start skips a cutscene.
 */
export const ACTIONS = [
  { id: 'up', label: 'Up / forward', keys: [KEY.UP], kb: ['ArrowUp', 'KeyW'], pad: [12] },
  { id: 'down', label: 'Down / back', keys: [KEY.DOWN], kb: ['ArrowDown', 'KeyS'], pad: [13] },
  { id: 'left', label: 'Left', keys: [KEY.LEFT], kb: ['ArrowLeft', 'KeyA'], pad: [14] },
  { id: 'right', label: 'Right', keys: [KEY.RIGHT], kb: ['ArrowRight', 'KeyD'], pad: [15] },

  { id: 'jump', set: 'play', label: 'Jump', keys: [JUMP], kb: ['Space', 'KeyX'], pad: [0] },
  { id: 'buster', set: 'play', label: 'Buster', keys: [BUSTER], kb: ['KeyZ', 'KeyJ'], pad: [2, 7] },
  { id: 'special', set: 'play', label: 'Special weapon', keys: [SPECIAL], kb: ['KeyC', 'KeyK'], pad: [3] },
  { id: 'lock', set: 'play', label: 'Lock-on', keys: [LOCK_ON], kb: ['ShiftLeft', 'ShiftRight', 'KeyV', 'KeyL'], pad: [6] },
  // a button that both jumps and does this (A) jumps unless there is something to talk to or open
  { id: 'interact', set: 'play', label: 'Talk / open / examine', keys: [KEY.SELECT], kb: ['Enter', 'NumpadEnter'], pad: [0, 1] },
  { id: 'turnLeft', set: 'play', label: 'Turn the view left', turn: -1, kb: [], pad: [4] },
  { id: 'turnRight', set: 'play', label: 'Turn the view right', turn: 1, kb: [], pad: [5] },
  { id: 'map', set: 'play', label: 'Map', keys: [KEY.SOFT1], kb: ['KeyQ', 'Backspace'], pad: [8] },
  { id: 'items', set: 'play', label: 'Items', keys: [KEY.SOFT2], kb: ['KeyE', 'Escape'], pad: [9] },
  { id: 'recenter', set: 'play', label: 'Re-centre camera', host: true, kb: ['KeyR'], pad: [11] },

  { id: 'confirm', set: 'menu', label: 'Confirm', keys: [KEY.SELECT], kb: ['Enter', 'NumpadEnter', 'Space', 'KeyZ'], pad: [0] },
  { id: 'back', set: 'menu', label: 'Back / close', soft: 'Back', kb: ['Backspace', 'Escape', 'KeyX'], pad: [1, 9] },
  { id: 'skip', set: 'menu', label: 'Skip cutscene', soft: 'Skip', kb: ['Escape'], pad: [9] },
  { id: 'pageLeft', set: 'menu', label: 'Previous page', keys: [KEY.LEFT], kb: ['PageUp'], pad: [4] },
  { id: 'pageRight', set: 'menu', label: 'Next page', keys: [KEY.RIGHT], kb: ['PageDown'], pad: [5] },
  { id: 'soft1', set: 'menu', label: 'Left soft key', keys: [KEY.SOFT1], kb: ['KeyQ'], pad: [2, 8] },
  { id: 'soft2', set: 'menu', label: 'Right soft key', keys: [KEY.SOFT2], kb: ['KeyE'], pad: [3] },

  { id: 'fast', label: 'Fast-forward (hold)', host: true, kb: ['Tab'], pad: [10] },
  // F1 always opens the menu as well, and so does pressing both sticks in together
  { id: 'menu', label: 'Settings menu', host: true, kb: [], pad: [16] },
];

/** The sets of ACTIONS, in the order the settings menu lists them. */
export const ACTION_SETS = [
  [undefined, 'Movement'],
  ['play', 'While playing'],
  ['menu', 'In menus, shops, dialogue and cutscenes'],
];

/** Standard-mapping buttons that drive the settings menu while it is open. */
const MENU_BUTTONS = { 12: 'up', 13: 'down', 14: 'left', 15: 'right', 0: 'accept', 1: 'back', 9: 'back', 16: 'back', 4: 'prev', 5: 'next' };
const MENU_REPEAT = new Set(['up', 'down', 'left', 'right']);
const MENU_REPEAT_DELAY = 380; // ms before a held direction repeats, then every MENU_REPEAT_RATE
const MENU_REPEAT_RATE = 110;
/** Both sticks pressed in: opens the settings menu. */
const MENU_COMBO = [10, 11];

/** The phone keypad itself; an action bound to one of these codes takes precedence. */
const KEYPAD = {
  Digit0: KEY.NUM0, Digit1: KEY.NUM1, Digit2: KEY.NUM2, Digit3: KEY.NUM3, Digit4: KEY.NUM4,
  Digit5: KEY.NUM5, Digit6: KEY.NUM6, Digit7: KEY.NUM7, Digit8: KEY.NUM8, Digit9: KEY.NUM9,
  Numpad0: KEY.NUM0, Numpad1: KEY.NUM1, Numpad2: KEY.NUM2, Numpad3: KEY.NUM3, Numpad4: KEY.NUM4,
  Numpad5: KEY.NUM5, Numpad6: KEY.NUM6, Numpad7: KEY.NUM7, Numpad8: KEY.NUM8, Numpad9: KEY.NUM9,
  NumpadMultiply: KEY.ASTERISK, NumpadDivide: KEY.POUND, Minus: KEY.ASTERISK, Equal: KEY.POUND,
};

/** Default bindings: action id -> list of key codes / button indices. */
export function defaultBindings(device) {
  return Object.fromEntries(ACTIONS.map((a) => [a.id, [...(device === 'keyboard' ? a.kb : a.pad)]]));
}

const PAD_BUTTON_NAMES = ['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2',
  'Select / Share', 'Start / Options', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];

/** Short names, for the hints on the soft-key labels. */
const PAD_BUTTON_SHORT = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3', '↑', '↓', '←', '→', 'Home'];
export const padButtonShort = (index) => PAD_BUTTON_SHORT[index] ?? `B${index}`;

/** Display name of a bound key or button. */
export function bindingName(device, value) {
  if (device === 'gamepad') return PAD_BUTTON_NAMES[value] ?? `Button ${value}`;
  return String(value).replace(/^Key|^Digit/, '').replace(/^Arrow(.+)$/, '$1 arrow')
    .replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, '$2 $1').replace(/^Numpad/, 'Numpad ');
}

const MOVES = new Set(['up', 'down', 'left', 'right']);
const DIRECTIONS = [KEY.LEFT, KEY.UP, KEY.RIGHT, KEY.DOWN];
// Menus: a held direction reaches the game as one-frame presses: one at once, then, after this
// long, one in every so many game frames (see Input.gameFrame).
const KEY_REPEAT_DELAY = 400;
const KEY_REPEAT_FRAMES = 3;

/**
 * The physical key of a keyboard event. Some sources (Android key events without a scan code,
 * a few virtual keyboards) leave `code` empty and only say which character or key it was.
 */
function codeOf(e) {
  if (e.code) return e.code;
  const key = e.key ?? '';
  if (key === ' ') return 'Space';
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return key; // Enter, Escape, Tab, Backspace, ArrowUp ... are named alike
}

/**
 * Bring a controller to the Gamepad API's "standard" layout, whatever the browser reports:
 * { buttons: boolean[17], axes: [leftX, leftY, rightX, rightY] }.
 *
 * A pad the browser does not recognise comes through with `mapping` empty and its controls in
 * the driver's order. On Linux that is the evdev order of an Xbox-style pad: axes left X, left
 * Y, left trigger, right X, right Y, right trigger, d-pad X, d-pad Y; buttons A, B, X, Y, LB,
 * RB, Back, Start, Guide, left stick, right stick. Read as "standard", the right stick would be
 * the left trigger and a stick axis, which is what makes the camera drift or not turn at all.
 * Pads with only four axes keep the right stick on axes 2 and 3.
 */
function standardPad(pad) {
  const pressed = (i) => {
    const b = pad.buttons[i];
    return !!b && (b.pressed || b.value > 0.5);
  };
  if (pad.virtual || pad.mapping === 'standard' || pad.axes.length < 6) {
    const buttons = Array.from({ length: Math.max(17, pad.buttons.length) }, (_, i) => pressed(i));
    return { buttons, axes: [pad.axes[0] ?? 0, pad.axes[1] ?? 0, pad.axes[2] ?? 0, pad.axes[3] ?? 0] };
  }
  const a = pad.axes;
  const buttons = new Array(17).fill(false);
  const ORDER = [0, 1, 2, 3, 4, 5, 8, 9, 16, 10, 11]; // driver button index -> standard index
  ORDER.forEach((standard, i) => { buttons[standard] = pressed(i); });
  // triggers rest at -1 (some drivers report 0 until first touched): pressed past the midpoint
  buttons[6] = a[2] > 0.2;
  buttons[7] = a[5] > 0.2;
  if (a.length >= 8) {
    buttons[14] = a[6] < -0.5;
    buttons[15] = a[6] > 0.5;
    buttons[12] = a[7] < -0.5;
    buttons[13] = a[7] > 0.5;
  }
  return { buttons, axes: [a[0], a[1], a[3], a[4]] };
}

const STICK_DEADZONE = 0.45;
// direct stick movement (Settings > Controls)
const ANALOG_DEADZONE = 0.2;
const ANALOG_MIN_SPEED = 0.3;
const LOOK_DEADZONE = 0.2;
const LOOK_YAW_SPEED = 150; // degrees per second at full deflection
const LOOK_PITCH_SPEED = 90;
// Camera-relative steering: the game turns the player in fixed steps, so allow some slack
const AIM_TOLERANCE = 12;
const WALK_CONE = 75;

export class Input {
  /** Set by the game (rdash.Host): (type, key) => void */
  handler = null;
  #state = 0;
  #sources = new Map(); // key -> Set of source ids holding it down
  #padDown = new Set();
  #padActions = new Set();
  #rumbling = false;
  /** Called with the connected pad's name, or null when none is connected. */
  onGamepadChange = null;
  #padName = null;
  /** @type {import('./camera.js').FreeCamera|null} set by main.js */
  camera = null;
  #lastPoll = 0;
  /**
   * Direct movement: during play the left stick (`directStick`, the dual-stick layout: left
   * moves, right looks) or the movement keys (`directKeys`) turn the player to face where they
   * point (relative to the camera) at once, and the stick sets the walking speed (through the
   * camera state, read by Mods.java), instead of pressing the game's turn keys. While locked on
   * the game strafes, so they act as a d-pad there, as in menus and cutscenes.
   */
  directStick = true;
  directKeys = false;
  #stick = [0, 0];
  #dirs = new Map(); // movement action id -> Set of sources holding it
  #moveKeys = new Set(); // phone keys held for the movement actions
  #keyHeading = NaN; // direct movement from keys: world heading, NaN when not in use
  /** False while the settings menu is open: the game then sees no input at all. */
  #enabled = true;
  /**
   * Called while the settings menu is open (input disabled) with a controller's navigation:
   * 'up' | 'down' | 'left' | 'right' | 'accept' | 'back' | 'prev' | 'next'
   */
  onMenuNav = null;
  #menuHeld = new Map(); // command -> time of its next repeat
  /** the game's last frame had text on it (set by Screen) */
  textShown = false;
  #padRole = new Map(); // held button bound to both jump and interact -> which one it is this press
  #padSet = new Map(); // held button -> the set that was active when it went down
  #kbHeld = new Map(); // held key code -> the actions it pressed
  #lastSet = 'menu';
  #softHeld = new Map(); // `${action id}|${source}` -> the soft key a "soft" action is holding
  #turnHeld = new Map(); // turn action id -> Set of sources holding it
  #gap = new Set(); // direction keys shown as up for this game frame (menu key repeat)
  #repeat = new Map(); // held direction key -> { since, frames }
  #fresh = new Set(); // keys that went down since the last game frame
  #padBindings = {}; // action id -> controller buttons
  /** What the game has written on its two soft keys (set by the page). */
  softLabels = ['', ''];
  /** Called when the hint for a soft key may have changed (set, labels, bindings, controller). */
  onHints = null;
  #combo = false; // the menu combo is being held
  #padWait = false; // ignore controller buttons until they have all been released
  /** Called for page-side actions ('recenter', 'fast', 'menu'): (id, down) => void */
  onAction = null;
  #keyboard = new Map(); // KeyboardEvent.code -> actions
  #gamepad = new Map(); // button index -> actions
  #hostDown = new Map(); // host action id -> Set of sources holding it
  #capture = null; // waiting for a controller button (rebinding)
  #capturePrimed = false;

  constructor(target = window) {
    this.setBindings(null, null);
    target.addEventListener('keydown', (e) => {
      if (!this.#enabled || e.ctrlKey || e.metaKey || e.altKey) return;
      const code = codeOf(e);
      const bound = this.#keyboard.get(code);
      if (!bound && KEYPAD[code] === undefined) return;
      e.preventDefault();
      if (e.repeat || this.#kbHeld.has(code)) return;
      const source = `kb:${code}`;
      if (bound) {
        // the actions of the set that is active now; they are what the key lets go of later
        const set = this.#set();
        const actions = bound.filter((a) => !a.set || a.set === set);
        this.#kbHeld.set(code, actions);
        for (const a of actions) this.#actionDown(a, source);
      } else this.press(KEYPAD[code], source);
    });
    target.addEventListener('keyup', (e) => {
      const code = codeOf(e);
      const actions = this.#kbHeld.get(code);
      if (!actions && KEYPAD[code] === undefined && !this.#keyboard.has(code)) return;
      e.preventDefault();
      const source = `kb:${code}`;
      this.#kbHeld.delete(code);
      if (actions) for (const a of actions) this.#actionUp(a, source);
      else if (KEYPAD[code] !== undefined) this.release(KEYPAD[code], source);
    });
    target.addEventListener('blur', () => this.releaseAll());
    // Poll controllers every display frame, independently of the game's own frame rate.
    const tick = () => {
      this.pollGamepads();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  state() {
    return this.#state;
  }

  /**
   * @param {Record<string, string[]>|null} keyboard  action id -> key codes (null = defaults)
   * @param {Record<string, number[]>|null} gamepad   action id -> button indices (null = defaults)
   */
  setBindings(keyboard, gamepad) {
    this.releaseAll();
    const build = (bindings, device) => {
      const map = new Map();
      const all = { ...defaultBindings(device), ...(bindings ?? {}) };
      for (const action of ACTIONS) {
        for (const value of all[action.id] ?? []) {
          if (!map.has(value)) map.set(value, []);
          map.get(value).push(action);
        }
      }
      return map;
    };
    this.#keyboard = build(keyboard, 'keyboard');
    this.#gamepad = build(gamepad, 'gamepad');
    this.#padBindings = { ...defaultBindings('gamepad'), ...(gamepad ?? {}) };
    this.onHints?.();
  }

  /**
   * Which set of actions applies now: 'play' while a mission is being played (the follow
   * camera is reporting and no message or prompt is up), 'menu' everywhere else.
   */
  #set() {
    const cam = this.camera;
    return cam && cam.following && !this.textShown ? 'play' : 'menu';
  }

  /** The game changed what a soft key says (0 = left, 1 = right). */
  setSoftLabel(index, label) {
    this.softLabels[index] = (label ?? '').replace(/\0/g, '').trim();
    this.onHints?.();
  }

  /** The soft key (0 or 1) that currently carries `label`, or -1. */
  #softWith(label) {
    return this.softLabels.findIndex((l) => l.toLowerCase() === label.toLowerCase());
  }

  /**
   * The controller button to show next to a soft-key label: the one that does what the label
   * says in the current set. null when no controller is connected or nothing is bound.
   */
  softHint(index) {
    const label = this.softLabels[index];
    if (!this.#padName || !label) return null;
    const set = this.#set();
    const key = index === 0 ? KEY.SOFT1 : KEY.SOFT2;
    const mine = ACTIONS.filter((a) => !a.set || a.set === set);
    const action = mine.find((a) => a.soft && a.soft.toLowerCase() === label.toLowerCase() && this.#padBindings[a.id]?.length)
      ?? mine.find((a) => a.keys?.includes(key) && this.#padBindings[a.id]?.length);
    return action ? this.#padBindings[action.id][0] : null;
  }

  /**
   * Called once per game frame, after the game has read the keys for it.
   *
   * Keys that went down since the last frame have now been seen, so they may go up (#sync).
   *
   * In menus, a held direction is turned into one-frame presses: the first at once, then,
   * after a pause, one in every few frames. The game's own menus either act on a new press
   * only, so holding did nothing, or repeat from the second frame on with no pause (title,
   * options), so an ordinary press of a tenth of a second moved the cursor twice. Not on the
   * map screen, which scrolls for as long as a key is held.
   */
  gameFrame() {
    const fresh = this.#fresh;
    this.#fresh = new Set();
    for (const key of fresh) this.#sync(key);
    const pulsing = this.#enabled && this.#set() === 'menu' && !this.camera?.mapMode;
    const now = performance.now();
    for (const key of DIRECTIONS) {
      const held = (this.#sources.get(key)?.size ?? 0) > 0;
      let gap = false;
      if (!held || !pulsing) this.#repeat.delete(key);
      else {
        const r = this.#repeat.get(key);
        if (!r) {
          this.#repeat.set(key, { since: now, frames: 0 });
          gap = true; // it has had its frame
        } else if (now - r.since < KEY_REPEAT_DELAY) gap = true;
        else gap = r.frames++ % KEY_REPEAT_FRAMES !== 0;
      }
      if (gap !== this.#gap.has(key)) {
        if (gap) this.#gap.add(key);
        else this.#gap.delete(key);
        this.#sync(key);
      }
    }
  }

  /** Position of the on-screen stick (touch.js), each axis -1..1; 0, 0 when let go. */
  setStick(x, y) {
    this.#stick = [x, y];
  }

  /** The game sees no keys while disabled (the settings menu is open). */
  setEnabled(on) {
    this.#enabled = !!on;
    // the button that opened or closed the menu is still down: wait for it to be let go
    this.#padWait = true;
    this.#menuHeld.clear();
    if (on) return;
    this.releaseAll();
    if (this.camera) {
      this.camera.analogHeading = NaN;
      this.camera.analogSpeed = 1;
    }
  }

  /** Report the next controller button pressed (for rebinding) instead of acting on it. */
  captureButton(callback) {
    this.#capture = callback;
    this.#capturePrimed = false;
  }

  /** Hold / let go of an action by id (for inputs the page handles itself, e.g. mouse buttons). */
  actionDown(id, source) {
    const action = ACTIONS.find((a) => a.id === id);
    if (action && this.#enabled) this.#actionDown(action, source);
  }

  actionUp(id, source) {
    const action = ACTIONS.find((a) => a.id === id);
    if (action) this.#actionUp(action, source);
  }

  /**
   * Turn the movement actions being held into phone keys: the plain d-pad keys, or with direct
   * movement during play "walk forward" plus a heading for Mods.java. Called on every change
   * and every display frame, since play / menu / lock-on can change while keys are held.
   */
  #syncMove() {
    const held = (id) => (this.#dirs.get(id)?.size ?? 0) > 0;
    const x = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    const y = (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
    const cam = this.camera;
    const lockedOn = (this.#state & (1 << LOCK_ON)) !== 0;
    const want = new Set();
    this.#keyHeading = NaN;
    if (this.directKeys && cam && cam.following && !lockedOn) {
      if (x || y) {
        // up = away from the camera; screen-right is 90 degrees below the camera heading
        this.#keyHeading = cam.worldYaw - (Math.atan2(x, -y) * 180) / Math.PI;
        want.add(KEY.UP);
      }
    } else {
      if (held('up')) want.add(KEY.UP);
      if (held('down')) want.add(KEY.DOWN);
      if (held('left')) want.add(KEY.LEFT);
      if (held('right')) want.add(KEY.RIGHT);
    }
    for (const key of want) if (!this.#moveKeys.has(key)) this.press(key, 'move');
    for (const key of this.#moveKeys) if (!want.has(key)) this.release(key, 'move');
    this.#moveKeys = want;
  }

  #actionDown(action, source) {
    if (MOVES.has(action.id)) {
      let held = this.#dirs.get(action.id);
      if (!held) this.#dirs.set(action.id, (held = new Set()));
      held.add(source);
      this.#syncMove();
      return;
    }
    if (action.soft) {
      // whichever soft key says so now; nothing if neither does
      const index = this.#softWith(action.soft);
      if (index < 0) return;
      const key = index === 0 ? KEY.SOFT1 : KEY.SOFT2;
      this.#softHeld.set(`${action.id}|${source}`, key);
      this.press(key, `${source}:${action.id}`);
      return;
    }
    if (action.turn) {
      let held = this.#turnHeld.get(action.id);
      if (!held) this.#turnHeld.set(action.id, (held = new Set()));
      held.add(source);
      return;
    }
    if (!action.host) {
      for (const k of action.keys) this.press(k, source);
      return;
    }
    let held = this.#hostDown.get(action.id);
    if (!held) this.#hostDown.set(action.id, (held = new Set()));
    const was = held.size > 0;
    held.add(source);
    if (!was) this.onAction?.(action.id, true);
  }

  #actionUp(action, source) {
    if (MOVES.has(action.id)) {
      this.#dirs.get(action.id)?.delete(source);
      this.#syncMove();
      return;
    }
    if (action.soft) {
      const id = `${action.id}|${source}`;
      const key = this.#softHeld.get(id);
      if (key === undefined) return;
      this.#softHeld.delete(id);
      this.release(key, `${source}:${action.id}`);
      return;
    }
    if (action.turn) {
      this.#turnHeld.get(action.id)?.delete(source);
      return;
    }
    if (!action.host) {
      for (const k of action.keys) this.release(k, source);
      return;
    }
    const held = this.#hostDown.get(action.id);
    if (held && held.delete(source) && held.size === 0) this.onAction?.(action.id, false);
  }

  press(key, source = 'api') {
    let held = this.#sources.get(key);
    if (!held) this.#sources.set(key, (held = new Set()));
    held.add(source);
    this.#sync(key);
  }

  release(key, source = 'api') {
    const held = this.#sources.get(key);
    if (!held || !held.delete(source)) return;
    this.#sync(key);
  }

  /**
   * Tell the game about a key if what it should see has changed. That is "held by anything",
   * with two exceptions:
   * - Select. In the game it confirms, talks and opens, and during play it also fires the
   *   buster. Here it only does the first: while playing, a held Select is not passed on, so
   *   nothing a player confirms with (keyboard, controller, touch) shoots. The buster key
   *   still does both, as in the game.
   * - a direction between the presses of the menu key repeat (gameFrame).
   * A key that has just gone down stays down until the game has run a frame with it: the game
   * reads the keys once per frame, 15 times a second, and a quick tap would otherwise be over
   * before it looked.
   */
  #sync(key) {
    let want = (this.#sources.get(key)?.size ?? 0) > 0;
    if (want && key === KEY.SELECT) want = !this.#playing();
    if (want && this.#gap.has(key)) want = false;
    const bit = 1 << key;
    if (want === ((this.#state & bit) !== 0)) return;
    if (want) {
      this.#state |= bit;
      this.#fresh.add(key);
    } else {
      if (this.#fresh.has(key) && this.#enabled) return; // not seen yet: gameFrame() lets it go
      this.#state &= ~bit;
    }
    this.handler?.(want ? 0 : 1, key);
  }

  /**
   * "Playing": the player is free to run, jump and shoot. Not while the game shows a message
   * or prompt (text on screen), nor while something its Select key would open, press or
   * continue is in reach (camera.interact, from Mods.canInteract).
   */
  #playing() {
    const cam = this.camera;
    return !!cam && cam.following && !cam.interact && !this.textShown;
  }

  releaseAll() {
    for (const [key, held] of this.#sources) {
      if (held.size === 0) continue;
      held.clear();
      this.#sync(key);
    }
    this.#kbHeld.clear();
    this.#softHeld.clear();
    this.#turnHeld.clear();
    this.#padSet.clear();
    this.#repeat.clear();
    this.#gap.clear();
    for (const [id, held] of this.#hostDown) {
      if (held.size === 0) continue;
      held.clear();
      this.onAction?.(id, false);
    }
    this.#dirs.clear();
    this.#moveKeys.clear();
    this.#keyHeading = NaN;
    this.#padDown.clear();
    this.#padActions.clear();
  }

  pollGamepads() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.#lastPoll) / 1000);
    this.#lastPoll = now;
    const cam = this.camera;
    const raw = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    // the on-screen stick behaves like a controller's left stick
    if (this.#stick[0] || this.#stick[1]) {
      raw.push({ connected: true, virtual: true, buttons: [], axes: [this.#stick[0], this.#stick[1], 0, 0] });
    }
    // every pad in the standard layout: { id, virtual, buttons: boolean[], axes: [lx, ly, rx, ry] }
    const pads = raw.filter((pad) => pad && pad.connected)
      .map((pad) => ({ id: pad.id, virtual: !!pad.virtual, ...standardPad(pad) }));
    const down = new Set(); // phone keys held through the sticks
    const actions = new Set(); // actions held through buttons
    let name = null;
    let steering = false;
    let analogHeading = NaN;
    let analogSpeed = 1;
    let anyButton = -1;
    this.#sync(KEY.SELECT);
    const playing = this.#playing();
    const set = this.#set();
    if (set !== this.#lastSet) {
      // play <-> menu: what a held key meant in the old set ends here; it has to be pressed
      // again to mean something in the new one (closing a message must not fire a shot)
      this.#lastSet = set;
      for (const [code, held] of this.#kbHeld) {
        for (const a of held) if (a.set) this.#actionUp(a, `kb:${code}`);
        this.#kbHeld.set(code, held.filter((a) => !a.set));
      }
      this.onHints?.();
    }
    const heldNow = new Set();
    for (const pad of pads) {
      if (!pad.virtual) name ??= pad.id;
      pad.buttons.forEach((held, index) => {
        if (!held) return;
        if (anyButton < 0) anyButton = index;
        heldNow.add(index);
        const bound = this.#gamepad.get(index) ?? [];
        // a button acts in the set it was pressed in, and stops acting when that set ends
        if (!this.#padSet.has(index)) this.#padSet.set(index, set);
        const pressedIn = this.#padSet.get(index);
        // A button that both jumps and interacts (A by default) jumps when the player is free
        // to, and talks or opens when there is something in reach. Which of the two it is
        // gets decided when it goes down; an interaction ends when play resumes under the
        // still-held button.
        const both = bound.some((a) => a.id === 'jump') && bound.some((a) => a.id === 'interact');
        if (both && pressedIn === 'play') {
          const role = this.#padRole.get(index);
          if (!role) this.#padRole.set(index, playing ? 'jump' : 'interact');
          else if (role === 'interact' && playing) this.#padRole.set(index, 'spent');
        }
        const role = this.#padRole.get(index);
        for (const a of bound) {
          if (a.set && (a.set !== pressedIn || a.set !== set)) continue;
          if (both && (a.id === 'jump' || a.id === 'interact') && a.id !== role) continue;
          actions.add(a);
        }
      });
    }
    for (const index of this.#padRole.keys()) if (!heldNow.has(index)) this.#padRole.delete(index);
    for (const index of this.#padSet.keys()) if (!heldNow.has(index)) this.#padSet.delete(index);
    if (name !== this.#padName) {
      this.#padName = name;
      this.onGamepadChange?.(name);
      this.onHints?.();
    }
    if (this.#capture) {
      // rebinding: wait for all buttons to be released, then take the next one pressed
      if (anyButton < 0) this.#capturePrimed = true;
      else if (this.#capturePrimed) {
        const done = this.#capture;
        this.#capture = null;
        done(anyButton);
      }
      return;
    }
    if (this.#padWait) {
      if (anyButton >= 0) actions.clear();
      else this.#padWait = false;
    }
    if (!this.#enabled) {
      if (!this.#padWait) this.#pollMenu(pads, now);
      return;
    }
    // both sticks pressed in: the settings menu
    const combo = !this.#padWait && pads.some((pad) => !pad.virtual && MENU_COMBO.every((b) => pad.buttons[b]));
    if (combo && !this.#combo) this.onAction?.('menu', true);
    this.#combo = combo;
    if (!this.#enabled) return; // the menu just opened
    this.#syncMove();
    if (!Number.isNaN(this.#keyHeading)) {
      steering = true;
      analogHeading = this.#keyHeading;
    }
    for (const pad of pads) {
      const [x, y, rx, ry] = pad.axes;
      const following = !!cam && cam.following;
      // right stick: look around (free camera) during play, plain turning otherwise
      if (following) {
        const lx = Math.abs(rx) > LOOK_DEADZONE ? rx : 0;
        const ly = Math.abs(ry) > LOOK_DEADZONE ? ry : 0;
        if (lx || ly) cam.look(lx * LOOK_YAW_SPEED * dt, ly * LOOK_PITCH_SPEED * dt);
      } else {
        if (rx < -STICK_DEADZONE) down.add(KEY.LEFT);
        if (rx > STICK_DEADZONE) down.add(KEY.RIGHT);
      }
      // left stick: steer relative to the camera during play, d-pad otherwise
      const mag = Math.hypot(x, y);
      const lockedOn = (this.#state & (1 << LOCK_ON)) !== 0;
      const direct = this.directStick && following && !lockedOn;
      if (direct && mag > ANALOG_DEADZONE) {
        steering = true;
        // stick up = away from the camera; screen-right is 90 degrees below the camera heading
        analogHeading = cam.worldYaw - (Math.atan2(x, -y) * 180) / Math.PI;
        analogSpeed = Math.min(1, Math.max(ANALOG_MIN_SPEED, (mag - ANALOG_DEADZONE) / (0.95 - ANALOG_DEADZONE)));
        down.add(KEY.UP);
      } else if (following && !this.directStick && mag > STICK_DEADZONE) {
        steering = true;
        const want = cam.worldYaw - (Math.atan2(x, -y) * 180) / Math.PI;
        const delta = wrap180(want - cam.playerYaw);
        if (delta > AIM_TOLERANCE) down.add(KEY.LEFT);
        else if (delta < -AIM_TOLERANCE) down.add(KEY.RIGHT);
        if (Math.abs(delta) < WALK_CONE) down.add(KEY.UP);
      } else if (!following || (this.directStick && lockedOn)) {
        if (x < -STICK_DEADZONE) down.add(KEY.LEFT);
        if (x > STICK_DEADZONE) down.add(KEY.RIGHT);
        if (this.directStick && following && lockedOn) {
          if (y < -STICK_DEADZONE) down.add(KEY.DOWN);
          if (y > STICK_DEADZONE) down.add(KEY.UP);
        } else {
          if (y < -STICK_DEADZONE) down.add(KEY.UP);
          if (y > STICK_DEADZONE) down.add(KEY.DOWN);
        }
      }
    }
    // turn-the-view buttons: the camera with dual-stick movement, the player with tank controls
    let turn = 0;
    for (const a of ACTIONS) if (a.turn && (this.#turnHeld.get(a.id)?.size ?? 0) > 0) turn += a.turn;
    if (turn && cam && cam.following) {
      if (this.directStick) cam.look(turn * LOOK_YAW_SPEED * dt, 0);
      else down.add(turn < 0 ? KEY.LEFT : KEY.RIGHT);
    }
    // while steering with the stick, the camera holds its heading instead of swinging behind
    cam?.setHoldWorld(steering);
    if (cam) {
      cam.analogHeading = analogHeading;
      cam.analogSpeed = analogSpeed;
    }
    for (const key of down) if (!this.#padDown.has(key)) this.press(key, 'stick');
    for (const key of this.#padDown) if (!down.has(key)) this.release(key, 'stick');
    this.#padDown = down;
    for (const a of actions) if (!this.#padActions.has(a)) this.#actionDown(a, 'pad');
    for (const a of this.#padActions) if (!actions.has(a)) this.#actionUp(a, 'pad');
    this.#padActions = actions;
    if (this.#rumbling) this.#pulse();
  }

  /** Controller navigation of the settings menu: buttons and the left stick, with key repeat. */
  #pollMenu(pads, now) {
    const held = new Set();
    for (const pad of pads) {
      if (pad.virtual) continue;
      pad.buttons.forEach((down, index) => {
        if (down && MENU_BUTTONS[index]) held.add(MENU_BUTTONS[index]);
      });
      const [x, y] = pad.axes;
      if (y < -0.6) held.add('up');
      if (y > 0.6) held.add('down');
      if (x < -0.6) held.add('left');
      if (x > 0.6) held.add('right');
    }
    for (const command of held) {
      const next = this.#menuHeld.get(command);
      if (next === undefined) {
        this.#menuHeld.set(command, now + MENU_REPEAT_DELAY);
        this.onMenuNav?.(command);
      } else if (MENU_REPEAT.has(command) && now >= next) {
        this.#menuHeld.set(command, now + MENU_REPEAT_RATE);
        this.onMenuNav?.(command);
      }
    }
    for (const command of this.#menuHeld.keys()) if (!held.has(command)) this.#menuHeld.delete(command);
  }

  /** The phone's vibrator (PhoneSystem DEV_VIBRATOR), mapped to controller rumble. */
  vibrate(on) {
    this.#rumbling = !!on;
    if (on) {
      this.#lastPulse = 0;
      this.#pulse();
      navigator.vibrate?.(400);
    } else {
      for (const pad of navigator.getGamepads?.() ?? []) pad?.vibrationActuator?.reset?.();
      navigator.vibrate?.(0);
    }
  }

  #lastPulse = 0;

  #pulse() {
    const now = performance.now();
    if (now - this.#lastPulse < 150) return;
    this.#lastPulse = now;
    for (const pad of navigator.getGamepads?.() ?? []) {
      pad?.vibrationActuator?.playEffect?.('dual-rumble', {
        duration: 200, strongMagnitude: 0.7, weakMagnitude: 0.4,
      })?.catch?.(() => {});
    }
  }
}
