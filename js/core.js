'use strict';
/* ===== Core: constants, math helpers, definitions ===== */
const TS = 8;            // tile size in world pixels
const YEAR = 240;        // sim ticks per year
const TPS = 30;          // sim ticks per second at 1x

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = Math.random;
const ri = n => (Math.random() * n) | 0;
const rr = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s | 0, 974634533)) | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct) {
  let v = 0, amp = .5, f = 1, tot = 0;
  for (let o = 0; o < oct; o++) { v += vnoise(x * f, y * f, s + o * 101) * amp; tot += amp; amp *= .5; f *= 2; }
  return v / tot;
}

/* ----- Terrain ----- */
const T_DEEP = 0, T_OCEAN = 1, T_SHALLOW = 2, T_SAND = 3, T_GRASS = 4, T_FOREST = 5, T_DESERT = 6,
  T_SNOW = 7, T_TAIGA = 8, T_HILL = 9, T_MOUNT = 10, T_PEAK = 11, T_LAVA = 12, T_ASH = 13;
const TERR_KEYS = ['deep', 'ocean', 'shallow', 'sand', 'grass', 'forest', 'desert', 'snow', 'taiga', 'hill', 'mount', 'peak', 'lava', 'ash'];
//                             deep oc  sh  sand grs for des snow tai hill mnt peak lava ash
const WALK = new Uint8Array([0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1]);
const WATER = new Uint8Array([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const BUILDOK = new Uint8Array([0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1]);
const MOVE = [.5, .5, .55, .9, 1, .7, .85, .7, .6, .65, 0, 0, 0, .9];
const FLAM = [0, 0, 0, 0, .018, .13, 0, 0, .07, .008, 0, 0, 0, 0];
const FERT = [0, 0, 0, .25, 1, .9, .2, .25, .45, .5, 0, 0, 0, .4];

/* ----- Tile features (resources) ----- */
const F_NONE = 0, F_BERRY = 1, F_STONE = 2, F_ORE = 3, F_GOLD = 4, F_COPPER = 5, F_COAL = 6, F_GEM = 7;
const FEAT_RES = [-1, -1, 2, 3, 4, 5, 6, 7];     // feature → resource
const RES_FEAT = [0, 0, 2, 3, 4, 5, 6, 7];       // resource → feature
const FEAT_YIELD = [0, 0, 4, 3, 2, 3, 3, 1];
const FEAT_AMT = [0, 3, 30, 20, 12, 20, 24, 8];

/* ----- Resources ----- */
const R_FOOD = 0, R_WOOD = 1, R_STONE = 2, R_ORE = 3, R_GOLD = 4, R_COPPER = 5, R_COAL = 6, R_GEM = 7, NRES = 8;
const RES_KEYS = ['food', 'wood', 'stone', 'ore', 'gold', 'copper', 'coal', 'gem'];
const RES_ICON = ['🍖', '🪵', '🪨', '⛓️', '🪙', '🟠', '⚫', '💎'];

/* ----- Creature kinds ----- */
const K_HUMAN = 0, K_ELF = 1, K_ORC = 2, K_DWARF = 3, K_SHEEP = 4, K_RABBIT = 5, K_WOLF = 6, K_BEAR = 7, K_SKEL = 8, K_DRAGON = 9, K_DEER = 10, K_COW = 11, K_FOX = 12, K_BOAR = 13;
const KIND = [
  { key: 'human', civ: 1, hp: 100, dmg: 10, spd: .055, life: [60, 80], mature: 14, fert: 1.0, range: 1.3, aggr: .35, icon: '🧑' },
  { key: 'elf', civ: 1, hp: 80, dmg: 9, spd: .065, life: [130, 190], mature: 18, fert: .55, range: 5, aggr: .15, icon: '🧝' },
  { key: 'orc', civ: 1, hp: 130, dmg: 14, spd: .055, life: [40, 56], mature: 10, fert: 1.4, range: 1.3, aggr: .6, icon: '👹' },
  { key: 'dwarf', civ: 1, hp: 140, dmg: 12, spd: .05, life: [90, 130], mature: 15, fert: .95, range: 1.3, aggr: .3, icon: '🧔' },
  { key: 'sheep', animal: 1, prey: 1, herd: 1, breed: .035, cap: 130, hp: 30, dmg: 0, spd: .03, life: [10, 16], food: 8, range: 1, icon: '🐑' },
  { key: 'rabbit', animal: 1, prey: 1, small: 1, breed: .05, cap: 190, hp: 10, dmg: 0, spd: .07, life: [5, 9], food: 3, range: 1, icon: '🐇' },
  { key: 'wolf', animal: 1, pred: 1, herd: 1, cap: 800, hp: 60, dmg: 9, spd: .07, life: [12, 18], food: 4, range: 1.3, icon: '🐺' },
  { key: 'bear', animal: 1, pred: 1, cap: 1700, hp: 170, dmg: 18, spd: .05, life: [20, 30], food: 10, range: 1.3, icon: '🐻' },
  { key: 'skeleton', monster: 1, hp: 70, dmg: 9, spd: .045, life: [12, 20], range: 1.3, icon: '💀' },
  { key: 'dragon', monster: 1, fly: 1, hp: 900, dmg: 45, spd: .1, life: [250, 400], range: 2.5, icon: '🐉' },
  { key: 'deer', animal: 1, prey: 1, herd: 1, breed: .03, cap: 260, hp: 35, dmg: 0, spd: .075, life: [12, 18], food: 9, range: 1, icon: '🦌' },
  { key: 'cow', animal: 1, prey: 1, herd: 1, breed: .028, cap: 320, hp: 70, dmg: 0, spd: .028, life: [14, 20], food: 14, range: 1, icon: '🐄' },
  { key: 'fox', animal: 1, pred: 1, small: 1, cap: 900, hp: 28, dmg: 5, spd: .075, life: [8, 13], food: 2, range: 1.3, icon: '🦊' },
  { key: 'boar', animal: 1, tough: 1, breed: .03, cap: 600, hp: 80, dmg: 11, spd: .055, life: [10, 16], food: 10, range: 1.3, icon: '🐗' }
];
const ANIMAL_KINDS = [K_SHEEP, K_RABBIT, K_DEER, K_COW, K_BOAR, K_FOX, K_WOLF, K_BEAR];
/** Where each animal likes to live. */
function habitatOK(kind, t) {
  switch (kind) {
    case K_SHEEP: case K_RABBIT: case K_COW: return t === T_GRASS;
    case K_DEER: case K_BOAR: return t === T_FOREST || t === T_GRASS;
    case K_FOX: return t === T_FOREST || t === T_GRASS || t === T_TAIGA;
    case K_WOLF: return t === T_FOREST || t === T_TAIGA || t === T_SNOW;
    case K_BEAR: return t === T_FOREST || t === T_TAIGA || t === T_HILL;
  }
  return WALK[t] === 1;
}
/* ----- Professions ----- */
const JOB_FARMER = 0, JOB_HUNTER = 1, JOB_LUMBER = 2, JOB_MINER = 3, JOB_BUILDER = 4;
const JOB_KEYS = ['farmer', 'hunter', 'lumber', 'miner', 'builder'];
// race affinity matrix (base opinion between civilised races)
const RACE_AFF = [
  [25, 5, -15, 10],
  [5, 30, -35, -5],
  [-15, -35, 10, -30],
  [10, -5, -30, 30]
];

/* ----- Roles / states / tasks ----- */
const RL_WORKER = 0, RL_SOLDIER = 1, RL_KING = 2, RL_SETTLER = 3, RL_TRADER = 4;
const ROLE_KEYS = ['worker', 'soldier', 'king', 'settler', 'trader'];
const ST_IDLE = 0, ST_GO = 1, ST_WORK = 2, ST_RETURN = 3, ST_FIGHT = 4, ST_FLEE = 5, ST_WANDER = 6, ST_HUNT = 7;
const TK_NONE = 0, TK_CHOP = 1, TK_STONE = 2, TK_ORE = 3, TK_GOLD = 4, TK_BERRY = 5, TK_FARM = 6, TK_FISH = 7,
  TK_HUNT = 8, TK_BUILD = 9, TK_SETTLE = 10, TK_TRADE = 11, TK_EAT = 12, TK_REST = 13;
const TASK_KEYS = ['none', 'chop', 'stone', 'ore', 'gold', 'berry', 'farm', 'fish', 'hunt', 'build', 'settle', 'trade', 'eat', 'rest'];

/* ----- Buildings ----- */
const B_HALL = 0, B_HOUSE = 1, B_FARM = 2, B_BARRACKS = 3, B_MARKET = 4, B_TOWER = 5, B_TEMPLE = 6, B_SMITHY = 7, B_MINE = 8, B_SAWMILL = 9, B_DOCK = 10;
const BLD = [
  { key: 'hall', hp: 400, cost: [0, 0, 0, 0, 0] },
  { key: 'house', hp: 120, cost: [0, 8, 0, 0, 0] },
  { key: 'farm', hp: 30, cost: [0, 3, 0, 0, 0] },
  { key: 'barracks', hp: 220, cost: [0, 20, 8, 0, 0] },
  { key: 'market', hp: 160, cost: [0, 20, 10, 0, 0] },
  { key: 'tower', hp: 260, cost: [0, 5, 18, 0, 0] },
  { key: 'temple', hp: 240, cost: [0, 15, 30, 0, 8] },
  { key: 'smithy', hp: 180, cost: [0, 10, 15, 6, 0] },
  { key: 'mine', hp: 200, cost: [0, 12, 6, 0, 0] },
  { key: 'sawmill', hp: 140, cost: [0, 14, 0, 0, 0] },
  { key: 'dock', hp: 140, cost: [0, 12, 0, 0, 0] }
];

const KCOLORS = ['#e6483f', '#3f7fe6', '#f2c230', '#8e4fd6', '#2fb8a0', '#f08a2e', '#e66bb4', '#7ec83f',
  '#c9c9d6', '#8a5a36', '#41d4f0', '#b83a6a', '#5a6ee0', '#d8e05a', '#3fa35a', '#f0a0a0'];

/* ----- Names ----- */
const NAME_SYL = [
  { a: ['Al', 'Ber', 'Ced', 'Dan', 'Ed', 'Gar', 'Hal', 'Ro', 'Wil', 'Mar', 'Jo', 'Lu', 'Tho', 'An', 'Os', 'Ral'], b: ['ric', 'wyn', 'bert', 'mund', 'ia', 'na', 'ton', 'las', 'vin', 'ra', 'den', 'ley', 'mar'], p: ['ia', 'land', 'mark', 'shire', 'ford', 'burg', 'vale'] },
  { a: ['Ae', 'Lia', 'Syl', 'Tha', 'Elo', 'Fae', 'Ili', 'Nae', 'Ari', 'Cae', 'Lo', 'Mi'], b: ['ria', 'nor', 'las', 'wen', 'thil', 'riel', 'dor', 'vyn', 'lith', 'ndil'], p: ['lorien', 'thal', 'nael', 'wood', 'lindë', 'mir'] },
  { a: ['Gro', 'Ug', 'Mok', 'Zug', 'Dra', 'Kra', 'Gul', 'Sha', 'Bor', 'Naz', 'Ur', 'Gra'], b: ['gash', 'nak', 'thar', 'mok', 'gul', 'rok', 'zag', 'dush', 'bag', 'kk'], p: ['gor', 'ruk', 'dush', 'gash', 'mok', 'zar'] },
  { a: ['Tho', 'Bal', 'Dur', 'Gim', 'Bro', 'Kaz', 'Dwa', 'Fun', 'Glo', 'Nor', 'Bof', 'Thra'], b: ['rin', 'din', 'li', 'grim', 'bur', 'dal', 'in', 'ak', 'mir', 'or'], p: ['heim', 'grad', 'dur', 'hold', 'delve', 'barak'] }
];
function unitName(race) { const s = NAME_SYL[race] || NAME_SYL[0]; return pick(s.a) + pick(s.b); }
function placeName(race) {
  const s = NAME_SYL[race] || NAME_SYL[0];
  let n = pick(s.a) + (rnd() < .5 ? pick(s.b) : '') + pick(s.p);
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}
function worldName(r) {
  const a = ['Aer', 'Val', 'Nor', 'Eld', 'Myr', 'Zan', 'Ost', 'Ith', 'Kal', 'Tyr', 'Ul', 'Sar'], b = ['dor', 'ia', 'heim', 'gard', 'ora', 'uin', 'eth', 'aria', 'mund', 'os'];
  return a[(r() * a.length) | 0] + b[(r() * b.length) | 0];
}
