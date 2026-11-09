'use strict';
/* ===== Rendering: pixel-art terrain, sprites, camera, effects ===== */
const C = hex => { const n = parseInt(hex.slice(1), 16); return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0; };
const TPAL = [
  ['#1a3766', '#1e3f73', '#16305a'], ['#2356a0', '#295fab', '#1f4d92'], ['#3f93d4', '#4fa5e0', '#3783c3'],
  ['#e8d9a0', '#f2e4b3', '#d8c78a'], ['#72b848', '#7fc554', '#65a83e'], ['#5ba23e', '#67ae48', '#4f9236'],
  ['#e8c36c', '#f1cf7e', '#d8b05a'], ['#eef3f7', '#ffffff', '#dbe5ee'], ['#e4ebf0', '#f6fafc', '#d0dce6'],
  ['#8da456', '#9cb564', '#788d44'], ['#77777f', '#86868e', '#66666e'], ['#77777f', '#86868e', '#66666e'],
  ['#f2641e', '#ffb02e', '#c9371a'], ['#4b4641', '#5a544d', '#3c3834']
].map(p => p.map(C));
const MINI_COL = ['#1a3766', '#2356a0', '#3f93d4', '#e8d9a0', '#72b848', '#3c8a3a', '#e8c36c', '#eef3f7', '#7fa79a', '#8da456', '#77777f', '#f2f2f6', '#f2641e', '#4b4641'].map(C);
const STAMP = {
  tree: ['..1111..', '.112111.', '11211111', '11111131', '.111133.', '..1133..', '...44...', '...44...'],
  tree2: ['.11.....', '1211....', '1113.11.', '.4..1211', '.4..1113', '.....4..', '.....4..', '........'],
  pine: ['...2....', '..121...', '..113...', '.12113..', '.11133..', '1211133.', '...4....', '...4....'],
  mount: ['...2....', '..221...', '..2113..', '.221133.', '.2211133', '22111333', '21111333', '11113333'],
  peak: ['...5....', '..555...', '..5553..', '.255133.', '.2211133', '22111333', '21111333', '11113333'],
  hill: ['........', '........', '..222...', '.22111..', '2211113.', '21111133', '11111333', '........'],
  rock: ['........', '........', '...22...', '..2113..', '.221133.', '.211133.', '........', '........'],
  ore: ['........', '........', '...22...', '..2613..', '.221163.', '.261133.', '........', '........'],
  bush: ['........', '..11....', '.12611..', '.116113.', '.611163.', '..1133..', '........', '........'],
  bush0: ['........', '..11....', '.12111..', '.111113.', '.111113.', '..1133..', '........', '........'],
  cactus: ['........', '...1....', '.1.1....', '.111.1..', '...111..', '...1....', '...1....', '........']
};
const SPAL = {
  treeA: ['#2f7d32', '#45a047', '#1f5c26', '#6b4a2a'], treeB: ['#3a8a30', '#58b048', '#27682a', '#6b4a2a'], treeC: ['#2a7040', '#3f9558', '#1c5230', '#5d4025'],
  pine: ['#2c5d4f', '#f4f8fa', '#1c4539', '#5d4025'], mount: ['#8b8b93', '#a8a8b0', '#65656e', '', '#f4f6fa'],
  hill: ['#8da456', '#a5bd6c', '#6d8140'], rock: ['#9a9aa2', '#b9b9c0', '#74747c'], ore: ['#8a8a92', '#a9a9b0', '#686870', '', '', '#3d5a9e'],
  gold: ['#9a9aa2', '#b9b9c0', '#74747c', '', '', '#f7c62f'], bush: ['#3c8f3c', '#52a850', '#2a6a2c', '', '', '#d8344a'], cactus: ['#3f8f4a']
};
for (const k in SPAL) SPAL[k] = SPAL[k].map(h => h ? C(h) : 0);
const FOAM = C('#bfe3f7'), FLOWERS = ['#f7e15c', '#ffffff', '#f29ac0'].map(C), DARKGRASS = C('#559636');

function stamp(buf, o, stride, rows, pal) {
  for (let y = 0; y < 8; y++) { const r = rows[y]; for (let x = 0; x < 8; x++) { const c = r.charCodeAt(x) - 49; if (c >= 0) buf[o + y * stride + x] = pal[c]; } }
}
/** Draw one 8x8 tile into a Uint32 pixel buffer. */
function tilePixels(x, y, buf, o, stride) {
  const W = G.W, H = G.H, i = y * W + x, t = G.terr[i], seed = G.seed, pal = TPAL[t];
  const bx = x * 8, by = y * 8;
  for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
    const h = hash2(bx + px, by + py, seed);
    buf[o + py * stride + px] = h < .13 ? pal[1] : h > .87 ? pal[2] : pal[0];
  }
  const th = hash2(x, y, seed + 9);
  if (WATER[t]) {
    if (t !== T_SHALLOW && th < .3) { const wy = 1 + ((th * 97) | 0) % 6, wx = ((th * 911) | 0) % 5; buf[o + wy * stride + wx] = pal[1]; buf[o + wy * stride + wx + 1] = pal[1]; buf[o + wy * stride + wx + 2] = pal[1]; }
    const n = y > 0 && !WATER[G.terr[i - W]], s = y < H - 1 && !WATER[G.terr[i + W]], w = x > 0 && !WATER[G.terr[i - 1]], e = x < W - 1 && !WATER[G.terr[i + 1]];
    if (n || s || w || e) for (let k = 0; k < 8; k++) {
      const hh = hash2(bx + k, by + k * 3, seed + 3);
      if (n && hh > .25) buf[o + k] = FOAM;
      if (s && hh < .75) buf[o + 7 * stride + k] = FOAM;
      if (w && hh > .3) buf[o + k * stride] = FOAM;
      if (e && hh < .7) buf[o + k * stride + 7] = FOAM;
    }
    return;
  }
  switch (t) {
    case T_GRASS:
      if (th < .3) { const gx = ((th * 331) | 0) % 6 + 1, gy = ((th * 877) | 0) % 5 + 1; buf[o + gy * stride + gx] = DARKGRASS; buf[o + (gy + 1) * stride + gx] = DARKGRASS; buf[o + (gy + 1) * stride + gx - 1] = DARKGRASS; }
      else if (th > .93) buf[o + (2 + ((th * 53) | 0) % 4) * stride + 2 + ((th * 71) | 0) % 4] = FLOWERS[((th * 1000) | 0) % 3];
      break;
    case T_FOREST: stamp(buf, o, stride, th < .6 ? STAMP.tree : STAMP.tree2, th < .33 ? SPAL.treeA : th < .66 ? SPAL.treeB : SPAL.treeC); break;
    case T_TAIGA: stamp(buf, o, stride, STAMP.pine, SPAL.pine); break;
    case T_DESERT:
      if (th < .045) stamp(buf, o, stride, STAMP.cactus, SPAL.cactus);
      else if (th > .7) { const dy = 2 + ((th * 97) | 0) % 5; for (let k = 1; k < 6; k++) buf[o + (dy + (k > 3 ? 1 : 0)) * stride + k] = pal[2]; }
      break;
    case T_HILL: stamp(buf, o, stride, STAMP.hill, SPAL.hill); break;
    case T_MOUNT: stamp(buf, o, stride, STAMP.mount, SPAL.mount); break;
    case T_PEAK: stamp(buf, o, stride, STAMP.peak, SPAL.mount); break;
  }
  const f = G.feat[i];
  if (f === F_BERRY) stamp(buf, o, stride, G.amt[i] > 0 ? STAMP.bush : STAMP.bush0, SPAL.bush);
  else if (f === F_STONE) stamp(buf, o, stride, STAMP.rock, SPAL.rock);
  else if (f === F_ORE) stamp(buf, o, stride, STAMP.ore, SPAL.ore);
  else if (f === F_GOLD) stamp(buf, o, stride, STAMP.ore, SPAL.gold);
}

/* ----- Sprites ----- */
function makeSprite(rows, pal, flip) {
  const w = rows[0].length, h = rows.length, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][flip ? w - 1 - x : x], col = pal[ch];
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  return c;
}
const USPR = {
  human: [['.hhh..', '.sss.x', 'cccccx', 'scccsx', '.ccc..', '.d.d..', '.d.d..'], ['.hhh..', '.sss.x', 'cccccx', 'scccsx', '.ccc..', '.dd...', '.d.d..']],
  elf: [['..h...', '.hhh.x', '.sss.x', '.ccc.x', 'scccs.', '.d.d..', '.d.d..'], ['..h...', '.hhh.x', '.sss.x', '.ccc.x', 'scccs.', '.dd...', '.d.d..']],
  orc: [['.sss..', 'tssst.', 'cccccx', 'scccsx', 'scccsx', '.d.d..', '.d.d..'], ['.sss..', 'tssst.', 'cccccx', 'scccsx', 'scccsx', '.dd...', '.d.d..']],
  dwarf: [['......', '.hhh.x', '.sss.x', '.bbb.x', 'cbbbc.', '.ccc..', '.d.d..'], ['......', '.hhh.x', '.sss.x', '.bbb.x', 'cbbbc.', '.ccc..', '..dd..']],
  sheep: [['.wwww..', 'wwwwwkk', 'wwwwwkk', '.wwww..', '.k..k..'], ['.wwww..', 'wwwwwkk', 'wwwwwkk', '.wwww..', '..kk...']],
  rabbit: [['...ee', '.bbbk', 'bbbbb', '.b.b.'], ['...ee', '.bbbk', 'bbbbb', 'b...b']],
  wolf: [['.....gg.', 'ggggggk.', 'dgggggg.', '.g...g..', '.g...g..'], ['.....gg.', 'ggggggk.', 'dgggggg.', '.g...g..', 'g.....g.']],
  bear: [['.......b.', '.bbbbbbbb', 'bbbbbbbkb', 'bbbbbbbb.', '.bb..bb..', '.bb..bb..'], ['.......b.', '.bbbbbbbb', 'bbbbbbbkb', 'bbbbbbbb.', '.bb..bb..', 'bb....bb.']],
  dragon: [
    ['....WW......', '...WWWW.....', '..WWWWWW..hh', 'rrRRRRRRRhhe', '..RRRRRRRRhh', 't..RRRRRR...', 'tt.R....R...', '.ttt........'],
    ['............', '............', '..........hh', 'rrRRRRRRRhhe', '..RRRRRRRRhh', 't.WWWWWWR...', 'tt.WWWW.R...', '.ttt.WW.....']],
  boat: [['...S....', '...SS...', '...SSS..', '...Scc..', '...K....', 'BBBBBBBB', '.BBBBBB.']]
};
const UPAL = {
  human: { h: '#6b4423', s: '#f0c8a0', d: '#3a3a4a' }, elf: { h: '#f0d878', s: '#f6dcc0', d: '#3a4a3a' }, orc: { h: '#2e2e2e', s: '#6aa84f', d: '#3a2e24', t: '#ffffff' },
  dwarf: { h: '#9aa0a8', s: '#e8b890', d: '#3a2e24', b: '#c8641e' }, skeleton: { h: '#e8e8e0', s: '#e8e8e0', d: '#b8b8b0', c: '#cfcfc6', x: '#9a9a9a' },
  sheep: { w: '#f4f4f0', k: '#3a3a3a' }, rabbit: { b: '#c9a27a', e: '#b08a64', k: '#2a2a2a' }, wolf: { g: '#8a8a94', d: '#6a6a74', k: '#2a2a2a' }, bear: { b: '#7a4a28', k: '#1a1a1a' },
  dragon: { W: '#c23a2a', R: '#e0493a', r: '#a02a20', h: '#e0493a', e: '#ffe14a', t: '#a02a20' }
};
const BSPR = {
  house0: ['........', '...RR...', '..RRRr..', '.RRRRrr.', '.RRRRrr.', '.WWDWww.', '.WWDWww.', '........'],
  house1: ['..RRRr..', '.RRRRrr.', 'RRRRRrrr', 'RRRRRrrr', '.WWWWww.', '.WGWDww.', '.WWWDww.', '........'],
  house2: ['..RRRr..', '.RRRRrr.', 'RRRRRrrr', '.WGWGww.', '.WWWWww.', 'RRRRRrrr', '.WGWWww.', '.WWDWww.', '.WWDWww.'],
  hall: ['.....KFF....', '.....KFF....', '.....K......', '...RRRRRr...', '..RRRRRRrr..', '.RRRRRRRrrr.', 'RRRRRRRRrrrr', '.WWWWWWWwww.', '.WGWWWWWGww.', '.WWWDDWWwww.', '.WWWDDWWwww.', '.SSSSSSSsss.'],
  barracks: ['.FF.....', '.K.S.S.S', '.KSSSSSs', '.SSSSSSs', '.SKSSKSs', '.SSSSSSs', '.SSDDSSs', '.SSDDSSs'],
  market: ['........', '.FYFYFY.', 'FYFYFYFY', '.K....K.', '.KWWWWK.', '.WYWOWw.', '.WWWWWw.', '........'],
  tower: ['.FF.....', '.K......', '.S.SS.S.', '.SSSSSs.', '.SSSSSs.', '..SSSs..', '..SKSs..', '..SSSs..', '..SKSs..', '.SSDSSs.', '.SSDSSs.'],
  temple: ['...YY...', '...YY...', '..SSSs..', '.SSSSSs.', 'SSSSSSSs', '.S.S.Ss.', '.S.S.Ss.', 'SSSSSSSs'],
  smithy: ['.....KK.', '.....KK.', '.rrrrKK.', 'rrrrrrr.', '.SSSSSs.', '.SOSDSs.', '.SSSDSs.', '........'],
  site: ['........', '.K....K.', '.KKKKKK.', '.K.YY.K.', '.KKKKKK.', '.K.YY.K.', '.KWWWWK.', '........']
};
const BPAL = [
  { R: '#c0473a', r: '#96362d', W: '#e8d9b0', w: '#c9b88e', D: '#5a3a22' },
  { R: '#3f9a58', r: '#2f7a45', W: '#f0ead8', w: '#d4ccb4', D: '#7a5a34' },
  { R: '#7a5a3a', r: '#5c432b', W: '#a08a6a', w: '#84705a', D: '#2e2218' },
  { R: '#4a5568', r: '#374151', W: '#b9b3ab', w: '#96908a', D: '#3a2a1a' }
];
const BCOMMON = { S: '#a9a9b3', s: '#82828c', K: '#2a2a30', Y: '#f2c230', G: '#8fd3ff', O: '#ff9a3c' };
const sprCache = new Map();
function unitSprite(u, frame, flip, boat) {
  const k = KIND[u.kind], kd = u.kid ? G.kingdoms.get(u.kid) : null, col = kd ? KCOLORS[kd.color] : '#9a8f80';
  const role = k.civ ? u.role : 0;
  const key = (boat ? 'b' : u.kind) + '|' + col + '|' + role + '|' + frame + '|' + (flip ? 1 : 0);
  let s = sprCache.get(key);
  if (!s) {
    if (boat) s = makeSprite(USPR.boat[0], { S: '#f4f0e4', c: col, K: '#5a3a22', B: '#7a5230' }, flip);
    else {
      const base = UPAL[k.key] || UPAL.human, pal = Object.assign({ c: col }, base);
      if (k.civ) {
        if (role === RL_SOLDIER) { pal.x = '#d8dce6'; pal.h = '#aab0bc'; }
        else if (role === RL_KING) { pal.h = '#ffd23c'; pal.x = '#ffd23c'; }
        else if (role === RL_TRADER) pal.x = '#b07840';
      }
      const rows = USPR[k.key === 'skeleton' ? 'human' : k.key];
      s = makeSprite(rows[frame % rows.length], pal, flip);
    }
    sprCache.set(key, s);
  }
  return s;
}
function bldSprite(b, v, kd) {
  let name;
  if (!b.built) name = 'site';
  else switch (b.type) { case B_HALL: name = 'hall'; break; case B_HOUSE: name = 'house' + Math.min(2, b.lvl); break; case B_BARRACKS: name = 'barracks'; break; case B_MARKET: name = 'market'; break; case B_TOWER: name = 'tower'; break; case B_TEMPLE: name = 'temple'; break; case B_SMITHY: name = 'smithy'; break; default: name = 'site'; }
  const race = v ? v.race : 0, col = kd ? KCOLORS[kd.color] : '#999';
  const key = 'B' + name + '|' + race + '|' + col;
  let s = sprCache.get(key);
  if (!s) { s = makeSprite(BSPR[name], Object.assign({ F: col }, BCOMMON, BPAL[race] || BPAL[0])); sprCache.set(key, s); }
  return s;
}
let farmSpr = null, flameSpr = null;
function buildMiscSprites() {
  farmSpr = [];
  const soil = ['#8a6238', '#7a5530'], crop = [null, '#6fbf4a', '#4f9f38', '#e8c64a'];
  for (let st = 0; st < 4; st++) {
    const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = soil[y & 1]; g.fillRect(x, y, 1, 1); }
    if (st) { g.fillStyle = crop[st]; for (let y = 0; y < 8; y += 2) for (let x = (st === 1 ? 1 : 0); x < 8; x += (st === 1 ? 2 : 1)) g.fillRect(x, y, 1, st === 3 ? 2 : 1); }
    if (st === 3) { g.fillStyle = '#c9a030'; for (let x = 0; x < 8; x += 2) for (let y = 1; y < 8; y += 2) g.fillRect(x, y, 1, 1); }
    farmSpr.push(c);
  }
  flameSpr = [];
  const fr = [['........', '...o....', '..oy....', '..oyo.o.', '.oyyo.o.', '.oyyyoo.', '.oyyyyo.', '..oooo..'], ['........', '....o...', '.o..yo..', '.o.oyo..', '.oooyyo.', '.oyyyyo.', '.oyyyyo.', '..oooo..'], ['...o....', '...o....', '..oyo...', '.ooyo...', '.oyyyo..', '.oyyyoo.', '.oyyyyo.', '..oooo..']];
  for (const f of fr) flameSpr.push(makeSprite(f, { o: '#f2641e', y: '#ffd23c' }));
}

/* ----- Renderer state ----- */
const RD = {
  cv: null, ctx: null, tcan: null, tctx: null, ocan: null, octx: null, mcan: null, mctx: null,
  cam: { x: 0, y: 0, z: 2, tz: 2, vx: 0, vy: 0 }, w: 0, h: 0, dpr: 1, frame: 0,
  ownerVer: -1, miniVer: -1, miniTick: 0, showTerritory: true, showNames: true, cursor: null, selId: 0, selVid: 0, follow: false
};
function initRenderer(canvas) {
  RD.cv = canvas; RD.ctx = canvas.getContext('2d', { alpha: false });
  RD.tcan = document.createElement('canvas'); RD.ocan = document.createElement('canvas'); RD.mcan = document.createElement('canvas');
  buildMiscSprites();
  resizeRenderer();
}
function resizeRenderer() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  RD.dpr = dpr; RD.w = window.innerWidth; RD.h = window.innerHeight;
  RD.cv.width = Math.round(RD.w * dpr); RD.cv.height = Math.round(RD.h * dpr);
  RD.cv.style.width = RD.w + 'px'; RD.cv.style.height = RD.h + 'px';
}
function minZoom() { return Math.max(.2, Math.min(RD.w / (G.W * TS), RD.h / (G.H * TS)) * .9); }
function attachWorld() {
  const W = G.W, H = G.H;
  RD.tcan.width = W * TS; RD.tcan.height = H * TS; RD.tctx = RD.tcan.getContext('2d');
  RD.ocan.width = W; RD.ocan.height = H; RD.octx = RD.ocan.getContext('2d');
  RD.mcan.width = W; RD.mcan.height = H; RD.mctx = RD.mcan.getContext('2d');
  redrawAllTerrain();
  RD.ownerVer = -1; RD.miniVer = -1; RD.selId = 0; RD.selVid = 0; RD.follow = false;
  sprCache.clear();
  const c = RD.cam; c.x = W * TS / 2; c.y = H * TS / 2; c.z = c.tz = Math.max(minZoom(), Math.min(1.2, minZoom() * 1.6)); c.vx = c.vy = 0;
}
function redrawAllTerrain() {
  const W = G.W, H = G.H, strip = 16;
  for (let y0 = 0; y0 < H; y0 += strip) {
    const rows = Math.min(strip, H - y0), img = RD.tctx.createImageData(W * TS, rows * TS), buf = new Uint32Array(img.data.buffer);
    for (let y = 0; y < rows; y++) for (let x = 0; x < W; x++) tilePixels(x, y0 + y, buf, y * TS * W * TS + x * TS, W * TS);
    RD.tctx.putImageData(img, 0, y0 * TS);
  }
  G.dirty.length = 0; G.dirtyFlag.fill(0);
}
let _timg = null, _tbuf = null;
function flushDirty() {
  const d = G.dirty; if (!d.length) return;
  if (d.length > 6000) { redrawAllTerrain(); return; }
  if (!_timg) { _timg = RD.tctx.createImageData(8, 8); _tbuf = new Uint32Array(_timg.data.buffer); }
  const W = G.W;
  for (let n = 0; n < d.length; n++) { const i = d[n]; G.dirtyFlag[i] = 0; tilePixels(i % W, (i / W) | 0, _tbuf, 0, 8); RD.tctx.putImageData(_timg, (i % W) * TS, ((i / W) | 0) * TS); }
  d.length = 0;
}
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rebuildOwnerOverlay() {
  const W = G.W, H = G.H, own = G.owner, img = RD.octx.createImageData(W, H), d = img.data;
  const kOf = new Map();
  for (const v of G.villages.values()) { const k = G.kingdoms.get(v.kid); kOf.set(v.id, k ? k.id : 0); }
  const cols = new Map(); for (const k of G.kingdoms.values()) cols.set(k.id, hexRGB(KCOLORS[k.color]));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = own[i]; if (!o) continue;
    const kid = kOf.get(o), c = cols.get(kid); if (!c) continue;
    const kk = j => { const oo = own[j]; return oo ? kOf.get(oo) : 0; };
    const edge = (x > 0 && kk(i - 1) !== kid) || (x < W - 1 && kk(i + 1) !== kid) || (y > 0 && kk(i - W) !== kid) || (y < H - 1 && kk(i + W) !== kid) || x === 0 || y === 0 || x === W - 1 || y === H - 1;
    const p = i * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = edge ? 170 : 44;
  }
  RD.octx.putImageData(img, 0, 0);
  RD.ownerVer = G.ownerVer;
}
function rebuildMinimap() {
  const W = G.W, H = G.H, img = RD.mctx.createImageData(W, H), buf = new Uint32Array(img.data.buffer), terr = G.terr;
  for (let i = 0; i < W * H; i++) buf[i] = MINI_COL[terr[i]];
  RD.mctx.putImageData(img, 0, 0);
  if (RD.showTerritory) { RD.mctx.globalAlpha = .75; RD.mctx.drawImage(RD.ocan, 0, 0); RD.mctx.globalAlpha = 1; }
  RD.miniVer = G.terrVer; RD.miniTick = G.tick;
}

const w2sx = wx => (wx - RD.cam.x) * RD.cam.z + RD.w / 2;
const w2sy = wy => (wy - RD.cam.y) * RD.cam.z + RD.h / 2;
const s2wx = sx => (sx - RD.w / 2) / RD.cam.z + RD.cam.x;
const s2wy = sy => (sy - RD.h / 2) / RD.cam.z + RD.cam.y;
function clampCam() {
  const c = RD.cam, mz = minZoom();
  c.tz = clamp(c.tz, mz, 7); c.z = clamp(c.z, mz, 7);
  c.x = clamp(c.x, 0, G.W * TS); c.y = clamp(c.y, 0, G.H * TS + RD.h * .3 / c.z);
}

function render(dt, paused) {
  const ctx = RD.ctx, c = RD.cam, dpr = RD.dpr, W = G.W, H = G.H;
  RD.frame++;
  // camera easing
  if (!RD.anchor) { if (Math.abs(c.tz - c.z) > .001) c.z += (c.tz - c.z) * Math.min(1, dt * 14); else c.z = c.tz; }
  if (c.vx || c.vy) { c.x += c.vx * dt; c.y += c.vy * dt; const f = Math.pow(.004, dt); c.vx *= f; c.vy *= f; if (Math.abs(c.vx) + Math.abs(c.vy) < 2) c.vx = c.vy = 0; }
  if (RD.follow && RD.selId) { const u = G.unitById.get(RD.selId); if (u) { c.x += (u.x * TS - c.x) * Math.min(1, dt * 6); c.y += (u.y * TS - c.y) * Math.min(1, dt * 6); } }
  clampCam();
  flushDirty();
  if (RD.ownerVer !== G.ownerVer) rebuildOwnerOverlay();
  const z = c.z;
  let shx = 0, shy = 0;
  if (G.quake > 0 && !paused) { const a = Math.min(6, G.quake * .25); shx = rr(-a, a); shy = rr(-a, a); }
  ctx.setTransform(dpr, 0, 0, dpr, shx * dpr, shy * dpr);
  ctx.fillStyle = '#0d1b36'; ctx.fillRect(-10, -10, RD.w + 20, RD.h + 20);
  // terrain
  const wx0 = Math.max(0, s2wx(0)), wy0 = Math.max(0, s2wy(0)), wx1 = Math.min(W * TS, s2wx(RD.w)), wy1 = Math.min(H * TS, s2wy(RD.h));
  if (wx1 > wx0 && wy1 > wy0) {
    ctx.imageSmoothingEnabled = z < .8;
    ctx.drawImage(RD.tcan, wx0, wy0, wx1 - wx0, wy1 - wy0, w2sx(wx0), w2sy(wy0), (wx1 - wx0) * z, (wy1 - wy0) * z);
    ctx.imageSmoothingEnabled = false;
    if (RD.showTerritory) ctx.drawImage(RD.ocan, wx0 / TS, wy0 / TS, (wx1 - wx0) / TS, (wy1 - wy0) / TS, w2sx(wx0), w2sy(wy0), (wx1 - wx0) * z, (wy1 - wy0) * z);
  }
  const tx0 = Math.max(0, (wx0 / TS | 0) - 1), ty0 = Math.max(0, (wy0 / TS | 0) - 2), tx1 = Math.min(W - 1, (wx1 / TS | 0) + 1), ty1 = Math.min(H - 1, (wy1 / TS | 0) + 2);
  const ts = TS * z, fr = RD.frame;
  // animated water sparkles & lava glow
  if (z >= 1.6) {
    const terr = G.terr, ph = (fr / 24) | 0;
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const t = terr[y * W + x];
      if (t <= T_SHALLOW) { const h = hash2(x, y, ph); if (h < .05) { ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(w2sx(x * TS + 1 + ((h * 997) | 0) % 5), w2sy(y * TS + 2 + ((h * 131) | 0) % 5), z * 2, z); } }
      else if (t === T_LAVA) { const h = hash2(x, y, (fr / 8) | 0); ctx.fillStyle = h < .5 ? 'rgba(255,220,80,.35)' : 'rgba(180,30,10,.25)'; ctx.fillRect(w2sx(x * TS + ((h * 97) | 0) % 5), w2sy(y * TS + ((h * 57) | 0) % 5), z * 3, z * 3); }
    }
  }
  // buildings
  const vis = [];
  for (const b of G.blds.values()) if (b.x >= tx0 && b.x <= tx1 && b.y >= ty0 && b.y <= ty1 + 1) vis.push(b);
  vis.sort((a, b) => a.y - b.y);
  for (const b of vis) {
    const sx = w2sx(b.x * TS), sy = w2sy(b.y * TS);
    if (b.type === B_FARM && b.built) { ctx.drawImage(farmSpr[b.grow >= 100 ? 3 : b.grow >= 60 ? 2 : b.grow >= 25 ? 1 : 0], sx, sy, ts, ts); continue; }
    const v = G.villages.get(b.vid), kd = v ? G.kingdoms.get(v.kid) : null, s = bldSprite(b, v, kd);
    ctx.drawImage(s, sx + (TS - s.width) / 2 * z, sy + (TS - s.height) * z, s.width * z, s.height * z);
    if (b.built && b.hp < b.mhp * .6 && z >= 2) { ctx.fillStyle = 'rgba(30,20,10,.45)'; ctx.fillRect(sx + z, sy + z * 2, z * 2, z); ctx.fillRect(sx + z * 4, sy + z * 4, z * 2, z); }
  }
  // fire
  const fs = G.fires;
  for (let n = 0; n < fs.length; n++) {
    const i = fs[n], x = i % W, y = (i / W) | 0;
    if (x < tx0 || x > tx1 || y < ty0 || y > ty1) continue;
    ctx.drawImage(flameSpr[(((fr / 6) | 0) + i) % 3], w2sx(x * TS), w2sy(y * TS - 1), ts, ts);
  }
  // units
  const us = G.units, sprites = z >= 1.15, walkPh = (fr / 9) | 0, terr = G.terr;
  const ux0 = tx0 - 1, ux1 = tx1 + 2, uy0 = ty0 - 1, uy1 = ty1 + 2;
  let sel = null;
  for (let n = 0; n < us.length; n++) {
    const u = us[n];
    if (u.x < ux0 || u.x > ux1 || u.y < uy0 || u.y > uy1) continue;
    if (u.id === RD.selId) sel = u;
    const k = KIND[u.kind], px = w2sx((u.x + u.ox) * TS), py = w2sy((u.y + u.oy) * TS);
    if (!sprites) {
      const kd = u.kid ? G.kingdoms.get(u.kid) : null;
      ctx.fillStyle = kd ? KCOLORS[kd.color] : k.monster ? '#f0f' : k.pred ? '#655' : k.animal ? '#f4f4f0' : '#ddd';
      const s = k.fly ? 5 : Math.max(1.5, z * 2.2); ctx.fillRect(px - s / 2, py - s / 2, s, s);
      continue;
    }
    const tt = terr[(u.y | 0) * W + (u.x | 0)], boat = k.civ && WATER[tt] === 1;
    const moving = u.path || k.fly;
    const s = unitSprite(u, moving && !paused ? (walkPh + u.id) & 1 : 0, u.dir < 0, boat);
    let sc = z; if (k.civ && !boat && u.age < k.mature * YEAR) sc = z * .72; else if (u.hero) sc = z * 1.2;
    let yo = 0;
    if (k.fly) { yo = -6 * z; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px - 4 * z, py + 2 * z, 8 * z, 2 * z); }
    else if (u.st === ST_WORK && !paused) yo = ((fr / 7 + u.id) & 1) ? -z : 0;
    else if (boat) yo = ((fr / 20 + u.id) & 1) ? z * .5 : 0;
    const dw = s.width * sc, dh = s.height * sc, dx = px - dw / 2, dy = py - dh + 2 * z + yo;
    if (G.tick - u.hit < 4) { ctx.globalAlpha = .55; ctx.drawImage(s, dx, dy, dw, dh); ctx.globalAlpha = 1; }
    else ctx.drawImage(s, dx, dy, dw, dh);
    if (u.sick > 0) { ctx.fillStyle = '#7fe04a'; ctx.fillRect(px - z, dy - z * 2, z * 2, z * 2); }
    else if (u.hero) { ctx.fillStyle = '#ffd23c'; ctx.fillRect(px - z * .5, dy - z * 2, z, z); }
    else if (u.bless > 0 && (fr + u.id) % 20 < 10) { ctx.fillStyle = '#fff7b0'; ctx.fillRect(px + z * 2, dy, z, z); }
    if (u.ca > 0 && z >= 2 && !boat) { ctx.fillStyle = ['#d86a4a', '#8a5a30', '#aaa', '#56729e', '#f7c62f'][u.cr]; ctx.fillRect(px - z * 3.5 * (u.dir < 0 ? -1 : 1) - z, dy + z * 2, z * 2, z * 2); }
    if (z >= 2.6 && u.hp < u.mhp * .9) { const bw = 8 * z; ctx.fillStyle = '#000a'; ctx.fillRect(px - bw / 2, dy - z * 2.5, bw, z * 1.2); ctx.fillStyle = u.hp > u.mhp * .5 ? '#5bd24a' : u.hp > u.mhp * .25 ? '#f2c230' : '#e6483f'; ctx.fillRect(px - bw / 2, dy - z * 2.5, bw * Math.max(0, u.hp / u.mhp), z * 1.2); }
  }
  if (sel) {
    const px = w2sx((sel.x + sel.ox) * TS), py = w2sy((sel.y + sel.oy) * TS), r = Math.max(8, 6 * z) + Math.sin(fr / 8) * 1.5;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(px, py - z, r, r * .8, 0, 0, 6.283); ctx.stroke();
  }
  drawEffects(ctx, z, paused, tx0, ty0, tx1, ty1);
  if (RD.showNames) drawLabels(ctx, z, tx0, ty0, tx1, ty1);
  // brush cursor
  const cu = RD.cursor;
  if (cu) {
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(w2sx((cu.x + .5) * TS), w2sy((cu.y + .5) * TS), Math.max(4, (cu.r + .5) * ts), 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
  }
  if (G.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (G.flash * .07) + ')'; ctx.fillRect(-10, -10, RD.w + 20, RD.h + 20); if (paused) G.flash--; }
}

function drawEffects(ctx, z, paused, tx0, ty0, tx1, ty1) {
  const fr = RD.frame, step = paused ? 0 : 1;
  // rain
  for (const r of G.rains) {
    const sx = w2sx((r.x - r.r) * TS), sy = w2sy((r.y - r.r) * TS), sw = r.r * 2 * TS * z;
    if (sx > RD.w || sy > RD.h || sx + sw < 0 || sy + sw < 0) continue;
    ctx.fillStyle = r.storm ? 'rgba(20,24,50,.28)' : 'rgba(40,60,110,.16)';
    ctx.beginPath(); ctx.ellipse(sx + sw / 2, sy + sw / 2, sw * .56, sw * .5, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(170,210,255,.75)'; ctx.lineWidth = Math.max(1, z * .6); ctx.beginPath();
    const n = Math.min(90, (r.r * r.r * .7) | 0);
    for (let k = 0; k < n; k++) {
      const h = hash2(k, (r.x * 7) | 0, 77), h2 = hash2(k, 5, 91), a = h * 6.283, d = Math.sqrt(h2) * sw * .5;
      const px = sx + sw / 2 + Math.cos(a) * d, py = sy + sw / 2 + Math.sin(a) * d * .9 + ((fr * 5 + k * 37) % 26 - 13) * z * .6;
      ctx.moveTo(px, py); ctx.lineTo(px - z, py + 3.5 * z);
    }
    ctx.stroke();
  }
  // particles
  const ps = FX.parts;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    if (step) { p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.life--; }
    if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
    if (p.x < tx0 - 2 || p.x > tx1 + 2 || p.y < ty0 - 4 || p.y > ty1 + 2) continue;
    ctx.globalAlpha = Math.min(1, p.life / p.max * 1.6);
    ctx.fillStyle = p.col; const s = p.size * z; ctx.fillRect(w2sx(p.x * TS) - s / 2, w2sy(p.y * TS) - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  // arrows
  for (let i = FX.arrows.length - 1; i >= 0; i--) {
    const a = FX.arrows[i]; if (step) a.life--;
    if (a.life <= 0) { FX.arrows.splice(i, 1); continue; }
    const f = 1 - a.life / 6, f2 = Math.min(1, f + .35);
    ctx.strokeStyle = a.col; ctx.lineWidth = Math.max(1, z * .7); ctx.beginPath();
    ctx.moveTo(w2sx((a.x0 + (a.x1 - a.x0) * f) * TS), w2sy((a.y0 + (a.y1 - a.y0) * f) * TS - Math.sin(f * 3.14) * 4));
    ctx.lineTo(w2sx((a.x0 + (a.x1 - a.x0) * f2) * TS), w2sy((a.y0 + (a.y1 - a.y0) * f2) * TS - Math.sin(f2 * 3.14) * 4)); ctx.stroke();
  }
  // rings
  for (let i = FX.rings.length - 1; i >= 0; i--) {
    const r = FX.rings[i]; if (step) r.life--;
    if (r.life <= 0) { FX.rings.splice(i, 1); continue; }
    ctx.globalAlpha = r.life / r.max; ctx.strokeStyle = r.col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(w2sx(r.x * TS), w2sy(r.y * TS), (1 - r.life / r.max) * r.r * TS * z, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // meteors
  for (const m of G.meteors) {
    const f = m.t / m.max, gx = w2sx((m.x + .5) * TS), gy = w2sy((m.y + .5) * TS);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(gx, gy, (1 - f) * m.r * TS * z * .8 + 2, (1 - f) * m.r * TS * z * .5 + 1, 0, 0, 6.283); ctx.fill();
    const mx = gx + f * 130 * Math.max(1, z * .6), my = gy - f * 300 * Math.max(1, z * .6), s = Math.max(3, 3 * z);
    for (let k = 5; k >= 0; k--) { ctx.fillStyle = ['#fff', '#ffe14a', '#ffb02e', '#f2641e', '#c9371a', '#7a2a1a'][k]; const o = k * s * .9; ctx.fillRect(mx + o * .42 - s * (1 - k * .1) / 2, my - o - s / 2, s * (1.6 - k * .2), s * (1.6 - k * .2)); }
  }
  // tornadoes
  for (const t of G.tornadoes) {
    const gx = w2sx(t.x * TS), gy = w2sy(t.y * TS);
    for (let k = 0; k < 8; k++) {
      const w = (3 + k * 1.6) * z, off = Math.sin(fr / 4 + k * .9) * z * (1 + k * .3);
      ctx.fillStyle = k & 1 ? 'rgba(170,170,180,.85)' : 'rgba(120,120,132,.85)';
      ctx.fillRect(gx - w / 2 + off, gy - (k + 1) * 2.4 * z, w, 2.4 * z);
    }
  }
  // lightning
  for (let i = FX.bolts.length - 1; i >= 0; i--) {
    const b = FX.bolts[i]; b.life--;
    if (b.life <= 0) { FX.bolts.splice(i, 1); continue; }
    ctx.strokeStyle = 'rgba(160,200,255,.6)'; ctx.lineWidth = Math.max(4, 3 * z);
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath(); for (let k = 0; k < b.pts.length; k++) { const p = b.pts[k]; if (k) ctx.lineTo(w2sx(p[0]), w2sy(p[1])); else ctx.moveTo(w2sx(p[0]), w2sy(p[1])); } ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, z);
    }
  }
}

function drawLabels(ctx, z, tx0, ty0, tx1, ty1) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineJoin = 'round';
  for (const v of G.villages.values()) {
    if (v.x < tx0 - 6 || v.x > tx1 + 6 || v.y < ty0 - 2 || v.y > ty1 + 6) continue;
    const k = G.kingdoms.get(v.kid); if (!k) continue;
    const cap = k.cap === v.id;
    if (!cap && z < 1.3) continue;
    const sx = w2sx((v.x + .5) * TS), sy = w2sy(v.y * TS) - 5 * z - 2;
    const name = cap && z < 1.3 ? k.name : v.name, fs = cap ? 13 : 11;
    ctx.font = (cap ? '700 ' : '600 ') + fs + 'px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    const tw = ctx.measureText(name).width + (cap ? 18 : 8);
    ctx.fillStyle = 'rgba(12,16,28,.72)'; ctx.fillRect(sx - tw / 2, sy - fs - 5, tw, fs + 6);
    ctx.fillStyle = KCOLORS[k.color]; ctx.fillRect(sx - tw / 2, sy - fs - 5, 3, fs + 6);
    ctx.fillStyle = '#fff'; ctx.fillText((cap ? '★ ' : '') + name, sx + 1, sy);
    if (v.id === RD.selVid) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(sx - tw / 2 - 1, sy - fs - 6, tw + 2, fs + 8); }
    if (v.underAttack && (RD.frame >> 4) & 1) { ctx.font = '13px system-ui'; ctx.fillText('⚔️', sx, sy - fs - 6); }
  }
}

function drawMinimap(mctx, mw, mh) {
  if (RD.miniVer !== G.terrVer || G.tick - RD.miniTick > 150 || RD.miniOwner !== RD.ownerVer) { rebuildMinimap(); RD.miniOwner = RD.ownerVer; }
  mctx.imageSmoothingEnabled = false;
  mctx.clearRect(0, 0, mw, mh);
  mctx.drawImage(RD.mcan, 0, 0, mw, mh);
  const sx = mw / (G.W * TS), sy = mh / (G.H * TS);
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5;
  mctx.strokeRect(s2wx(0) * sx, s2wy(0) * sy, RD.w / RD.cam.z * sx, RD.h / RD.cam.z * sy);
}
