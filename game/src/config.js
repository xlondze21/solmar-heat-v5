// Solmar Heat — all tuning numbers and colours in one place.
// Top-down open world: a 12x12 block city grid, a beach and the sea to the south.
// World units are pixels; the camera follows the player and the renderer scales
// the 1280x720 view to the window, so no rule below depends on screen size.

export const STEP = 1 / 60;

// City geometry: 12 blocks of 160px separated by 64px roads.
export const BLOCK = 160;
export const ROAD = 64;
export const CELL = BLOCK + ROAD; // 224
export const GRID = 12; // blocks per side
export const ROAD0 = 64; // centre of the first road
export const CITY = ROAD0 + (GRID - 1) * CELL + ROAD / 2; // far edge of last road (2784)
export const BEACH_TOP = CITY + 8;
export const BEACH_H = 176;
export const SEA_TOP = BEACH_TOP + BEACH_H;
export const WORLD_W = CITY + 64;
export const WORLD_H = SEA_TOP + 640;

export const PLAYER = {
  walkSpeed: 210,
  runSpeed: 300,
  radius: 14,
  health: 100,
  punchDamage: 12,
  punchRange: 46,
  punchArc: 1.1,
  shootRange: 340,
  shootArc: 0.35,
  gunDamage: 34,
};

// Four stealable car types. speed = top speed px/s, accel, grip = steering authority.
export const CAR_TYPES = {
  sedan:  { name: 'Sedan',  top: 430, accel: 300, reverse: 150, turn: 2.6, grip: 0.92, color: '#7d8aa0', price: 0 },
  taxi:   { name: 'Taxi',   top: 450, accel: 320, reverse: 160, turn: 2.8, grip: 0.94, color: '#f2b705', price: 400 },
  truck:  { name: 'Truck',  top: 360, accel: 210, reverse: 130, turn: 2.4, grip: 0.98, color: '#5b7d4f', price: 700 },
  sports: { name: 'Sports', top: 560, accel: 430, reverse: 180, turn: 3.4, grip: 0.86, color: '#c0392b', price: 1500 },
};

export const WANTED = {
  max: 5,
  decaySeconds: 6, // quiet seconds with no cruiser near before a star drops
  bustHoldSeconds: 2.0, // pinned by a cruiser this long while slow = busted
  bustRange: 64,
  bustSpeed: 26,
  heliAt: 3,
  heliRespawn: 45,
  heliHealth: 3,
  ramCooldown: 0.5,
};

export const DAY = {
  lengthSeconds: 240, // one full day/night cycle
};

export const TIDE = {
  lengthSeconds: 150, // one full tide cycle
  lowFrom: 0.35, // phase window where the sandbar road is dry
  lowTo: 0.65,
};

export const ECONOMY = {
  startCash: 150,
  paintCost: 50,
  ammoCost: 30,
  ammoPack: 12,
  repPerMission: 10,
  sportsRepLock: 20,
  bustedFine: 0.1, // fraction of cash lost when busted
};

export const RADIO = [
  { name: 'SOLMAR FM', desc: 'sunset synth', bpm: 96 },
  { name: 'GULL ROCK', desc: 'garage rock', bpm: 132 },
  { name: 'TIDE LINE', desc: 'lo-fi dusk', bpm: 72 },
];

export const PALETTE = {
  grass: '#3d6b35',
  block: '#4a4a52',
  building: '#6b6f7d',
  buildingRoof: '#8a8fa0',
  road: '#2b2d33',
  roadLine: '#c8b45a',
  sidewalk: '#7a7d84',
  sand: '#d9c08a',
  sea: '#1d5f7a',
  seaDeep: '#144a61',
  seaFoam: '#bfe3ea',
  marina: '#3a3f4a',
  park: '#2f7a3d',
  market: '#a06a2c',
  hospital: '#cfd6dd',
  rival: '#7a2430',
  safehouse: '#2c6e4f',
  garage: '#5a4a7a',
  gunshop: '#7a5a2c',
  paintshop: '#2c5a7a',
  text: '#eef1f5',
  muted: '#9aa3b0',
  star: '#ffd94a',
  cash: '#7ddc8a',
  danger: '#e5534b',
  dusk: 'rgba(255, 122, 40, 0.16)',
  night: 'rgba(8, 12, 40, 0.42)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'solmar-heat.save.v5';
