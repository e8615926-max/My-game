'use strict';
/* ===== World state, generation, tile operations, regions, pathfinding ===== */
let G = null;

const WORLD_SIZES = { small: [160, 120, 1500], medium: [256, 192, 2600], large: [352, 264, 3800], huge: [448, 336, 5000] };

function newState(W, H, seed, maxUnits) {
  const N = W * H;
  G = {
    W, H, seed, name: 'World', tick: 0, maxUnits: maxUnits || 2000,
    terr: new Uint8Array(N), feat: new Uint8Array(N), amt: new Uint8Array(N), fire: new Uint8Array(N),
    owner: new Int16Array(N), bldAt: new Int32Array(N), region: new Uint16Array(N),
    regionDirty: true, regionTick: -999, ownerDirty: true, terrVer: 0,
    units: [], unitById: new Map(), nextId: 1,
    villages: new Map(), kingdoms: new Map(), blds: new Map(), rel: {},
    log: [], fires: [], lavas: [], meteors: [], tornadoes: [], rains: [], volcanoes: [],
    stats: { births: 0, deaths: 0, wars: 0, fallen: 0 },
    dirty: [], dirtyFlag: new Uint8Array(N), quake: 0, usedColors: 0
  };
  initPath(N);
  initGrid();
  return G;
}

const inb = (x, y) => x >= 0 && y >= 0 && x < G.W && y < G.H;

function markDirty(i) {
  if (!G.dirtyFlag[i]) { G.dirtyFlag[i] = 1; G.dirty.push(i); }
}
function markDirtyAround(x, y) {
  const W = G.W, H = G.H;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H) markDirty(ny * W + nx);
  }
}
/** Change terrain of a tile, keeping features/buildings consistent. */
function setTerr(x, y, t, keepFeat) {
  if (!inb(x, y)) return;
  const i = y * G.W + x, old = G.terr[i];
  if (old === t) return;
  if (WALK[old] !== WALK[t] || WATER[old] !== WATER[t]) G.regionDirty = true;
  G.terr[i] = t;
  if (!keepFeat) { G.feat[i] = 0; G.amt[i] = 0; }
  if (t === T_FOREST || t === T_TAIGA) { G.feat[i] = 0; G.amt[i] = 4; }
  if (!BUILDOK[t] && G.bldAt[i]) destroyBuilding(G.blds.get(G.bldAt[i]), true);
  if (!FLAM[t] && !G.bldAt[i]) G.fire[i] = 0;
  if (t === T_LAVA) { if (!G.amt[i]) G.amt[i] = 2; G.lavas.push(i); }
  G.terrVer++;
  markDirtyAround(x, y);
}
function setFeat(x, y, f, a) {
  if (!inb(x, y)) return;
  const i = y * G.W + x;
  G.feat[i] = f; G.amt[i] = a || 0; markDirty(i);
}

/* ----- World generation ----- */
function generateWorld(sizeKey, seed, populate) {
  const sz = WORLD_SIZES[sizeKey] || WORLD_SIZES.medium;
  const W = sz[0], H = sz[1], N = W * H;
  newState(W, H, seed, sz[2]);
  G.size = sizeKey;
  const r = mulberry32(seed);
  G.name = worldName(r);
  const el = new Float32Array(N);
  const md = Math.min(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let e = fbm(x / 46, y / 46, seed, 5) * .62 + fbm(x / 120, y / 120, seed + 7, 2) * .5;
    const edge = clamp(Math.min(x, W - 1 - x, y, H - 1 - y) / (md * .16), 0, 1);
    const s = edge * edge * (3 - 2 * edge);
    e = e * (.4 + .6 * s) - (1 - s) * .3;
    // ridged mountains
    const rg = 1 - Math.abs(fbm(x / 34, y / 34, seed + 211, 3) - .5) * 2;
    e += rg * rg * rg * .12;
    el[y * W + x] = e;
  }
  const sorted = Float32Array.from(el).sort();
  const pc = p => sorted[Math.min(N - 1, (p * N) | 0)];
  const pDeep = pc(.36), pOcean = pc(.52), pSea = pc(.565), pSand = pc(.59), pHill = pc(.9), pMount = pc(.945), pPeak = pc(.982);
  const terr = G.terr;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, e = el[i];
    let t;
    if (e < pDeep) t = T_DEEP;
    else if (e < pOcean) t = T_OCEAN;
    else if (e < pSea) t = T_SHALLOW;
    else {
      let m = (fbm(x / 40, y / 40, seed + 31, 4) - .5) * 2.3 + .5;
      let tmp = 1 - Math.abs(y / H - .5) * 2 + (fbm(x / 60, y / 60, seed + 57, 3) - .5) * .55 - (e - pSea) * 1.2;
      const cold = tmp < .2, hot = tmp > .68 && m < .47;
      if (e > pPeak) t = T_PEAK;
      else if (e > pMount) t = T_MOUNT;
      else if (e > pHill) t = T_HILL;
      else if (cold) t = (m > .52 && hash2(x, y, seed) < .75) ? T_TAIGA : T_SNOW;
      else if (hot) t = T_DESERT;
      else if (e < pSand) t = T_SAND;
      else if (m > .58) t = hash2(x, y, seed) < .85 ? T_FOREST : T_GRASS;
      else t = hash2(x, y, seed) < (m - .3) * .25 ? T_FOREST : T_GRASS;
      if (fbm(x / 14, y / 14, seed + 99, 2) > .76 && t !== T_MOUNT && t !== T_PEAK) t = T_SHALLOW; // lakes
    }
    terr[i] = t;
  }
  // rivers
  const nr = Math.max(4, (N / 2600) | 0);
  for (let k = 0; k < nr; k++) {
    let x = 0, y = 0, ok = false;
    for (let tr = 0; tr < 80 && !ok; tr++) { x = (r() * W) | 0; y = (r() * H) | 0; ok = el[y * W + x] > pHill; }
    if (!ok) continue;
    const seen = new Set();
    for (let st = 0; st < 500; st++) {
      const i = y * W + x;
      if (WATER[terr[i]] && st > 2) break;
      seen.add(i);
      if (st > 1) terr[i] = T_SHALLOW;
      let bx = -1, by = -1, be = 1e9;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy || (dx && dy)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(ny * W + nx)) continue;
        const ne = el[ny * W + nx] + r() * .012;
        if (ne < be) { be = ne; bx = nx; by = ny; }
      }
      if (bx < 0) break;
      if (be > el[i] + .03) { // local minimum → small lake
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
          if (dx * dx + dy * dy <= 4 && inb(x + dx, y + dy)) terr[(y + dy) * W + x + dx] = T_SHALLOW;
        break;
      }
      x = bx; y = by;
    }
  }
  // resources
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = terr[i], h = hash2(x, y, seed + 500);
    if (t === T_FOREST || t === T_TAIGA) G.amt[i] = 4;
    else if (t === T_HILL) {
      if (h < .09) { G.feat[i] = F_STONE; G.amt[i] = 30; }
    } else if (t === T_GRASS) {
      if (h < .022) { G.feat[i] = F_BERRY; G.amt[i] = 3; }
      else if (h < .034) { G.feat[i] = F_STONE; G.amt[i] = 30; }
    } else if (t === T_DESERT || t === T_SNOW) {
      if (h < .012) { G.feat[i] = F_STONE; G.amt[i] = 30; }
      else if (h < .017) { G.feat[i] = F_GOLD; G.amt[i] = 12; }
      else if (h < .024) { G.feat[i] = F_ORE; G.amt[i] = 20; }
    }
  }
  // ore veins: copper, iron, coal, gold and gems cluster in the highlands
  const veinTypes = [F_COPPER, F_COPPER, F_COPPER, F_ORE, F_ORE, F_ORE, F_COAL, F_COAL, F_COAL, F_GOLD, F_GEM];
  const nv = Math.max(12, (N / 330) | 0);
  for (let k = 0; k < nv; k++) {
    let x = (r() * W) | 0, y = (r() * H) | 0, ok = false;
    for (let tr = 0; tr < 40 && !ok; tr++) {
      x = (r() * W) | 0; y = (r() * H) | 0; const t = terr[y * W + x];
      ok = t === T_HILL || (tr > 25 && (t === T_GRASS || t === T_DESERT || t === T_SNOW) && el[y * W + x] > pSand);
    }
    if (!ok) continue;
    const f = veinTypes[(r() * veinTypes.length) | 0], len = 3 + ((r() * 6) | 0);
    for (let s = 0; s < len; s++) {
      if (!inb(x, y)) break;
      const i = y * W + x, t = terr[i];
      if (WALK[t] && t !== T_FOREST && t !== T_TAIGA && t !== T_SAND) { G.feat[i] = f; G.amt[i] = FEAT_AMT[f]; }
      x += ((r() * 3) | 0) - 1; y += ((r() * 3) | 0) - 1;
    }
  }
  computeRegions();
  if (populate) seedLife(r);
  recomputeOwners();
  return G;
}

function habitatScore(x, y, race) {
  let s = 0, water = 0, wood = 0;
  const W = G.W;
  for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
    const nx = x + dx, ny = y + dy;
    if (!inb(nx, ny)) continue;
    const t = G.terr[ny * W + nx];
    if (WATER[t]) { water++; continue; }
    let f = FERT[t];
    if (t === T_FOREST || t === T_TAIGA) wood++;
    if (race === K_ELF && (t === T_FOREST || t === T_TAIGA)) f = 1.4;
    if (race === K_ORC && (t === T_DESERT || t === T_ASH)) f = .9;
    if (race === K_DWARF && (t === T_HILL)) f = 1.5;
    if (race === K_DWARF && (t === T_MOUNT || t === T_PEAK || t === T_SNOW)) f = .7;
    if (race === K_HUMAN && t === T_GRASS) f = 1.2;
    s += f;
  }
  return s + Math.min(water, 8) * .4 - Math.max(0, water - 14) * 1.2 - (wood < 3 ? 7 : 0);
}

function seedLife(r) {
  const W = G.W, H = G.H, N = W * H;
  const per = G.size === 'small' ? 1 : G.size === 'medium' ? 2 : G.size === 'large' ? 3 : 4;
  const spots = [];
  for (let race = 0; race < 4; race++) for (let k = 0; k < per; k++) {
    let best = null, bs = -1;
    for (let tr = 0; tr < 140; tr++) {
      const x = 6 + ((r() * (W - 12)) | 0), y = 6 + ((r() * (H - 12)) | 0);
      const t = G.terr[y * W + x];
      if (!BUILDOK[t] || t === T_FOREST || t === T_TAIGA) continue;
      let near = false;
      for (const s of spots) if (Math.abs(s[0] - x) + Math.abs(s[1] - y) < 34) { near = true; break; }
      if (near) continue;
      const sc = habitatScore(x, y, race) + r() * 2;
      if (sc > bs) { bs = sc; best = [x, y]; }
    }
    if (!best || bs < 12) continue;
    spots.push(best);
    const v = foundVillage(best[0], best[1], race, 0, null, true);
    for (let n = 0; n < 7; n++) {
      const u = spawnUnit(race, best[0] + .5 + rr(-1.5, 1.5), best[1] + .5 + rr(-1.5, 1.5));
      if (!u) continue;
      u.age = (KIND[race].mature + rr(1, 14)) * YEAR;
      u.vid = v.id; u.kid = v.kid;
    }
  }
  let land = 0; for (let i = 0; i < N; i++) if (WALK[G.terr[i]]) land++;
  for (const kind of ANIMAL_KINDS) {
    const cnt = land / KIND[kind].cap * (KIND[kind].pred ? .7 : .55);
    for (let n = 0; n < cnt; n++) for (let tr = 0; tr < 12; tr++) {
      const x = (r() * W) | 0, y = (r() * H) | 0;
      if (habitatOK(kind, G.terr[y * W + x])) {
        const g = KIND[kind].herd ? 2 + ((r() * 3) | 0) : 1; n += g - 1;
        for (let m = 0; m < g; m++) { const u = spawnUnit(kind, x + .5 + (r() - .5) * 3, y + .5 + (r() - .5) * 3); if (u) u.age = rr(0, KIND[kind].life[0] * .6) * YEAR; }
        break;
      }
    }
  }
}

/* ----- Regions (connected walkable land) ----- */
let _stack = null;
function computeRegions() {
  const W = G.W, H = G.H, N = W * H, terr = G.terr, reg = G.region;
  reg.fill(0);
  if (!_stack || _stack.length < N) _stack = new Int32Array(N);
  let id = 0;
  for (let s = 0; s < N; s++) {
    if (reg[s] || !WALK[terr[s]]) continue;
    id++; if (id > 65000) id = 65000;
    let sp = 0; _stack[sp++] = s; reg[s] = id;
    while (sp) {
      const i = _stack[--sp], x = i % W;
      if (x > 0 && !reg[i - 1] && WALK[terr[i - 1]]) { reg[i - 1] = id; _stack[sp++] = i - 1; }
      if (x < W - 1 && !reg[i + 1] && WALK[terr[i + 1]]) { reg[i + 1] = id; _stack[sp++] = i + 1; }
      if (i >= W && !reg[i - W] && WALK[terr[i - W]]) { reg[i - W] = id; _stack[sp++] = i - W; }
      if (i < N - W && !reg[i + W] && WALK[terr[i + W]]) { reg[i + W] = id; _stack[sp++] = i + W; }
    }
  }
  G.regionDirty = false; G.regionTick = G.tick;
}

/* ----- A* pathfinding with node budget ----- */
let PF = null;
function initPath(N) {
  PF = { g: new Float32Array(N), from: new Int32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), cur: 0, hi: new Int32Array(90000), hf: new Float32Array(90000), calls: 0 };
}
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DY8 = [0, 0, 1, -1, 1, -1, 1, -1];
/** mode 0 = land only, 1 = amphibious (boats). Returns reversed array of tile indices (pop() = next step) or null. */
function findPath(sx, sy, tx, ty, mode) {
  const W = G.W, H = G.H, terr = G.terr;
  if (!inb(tx, ty) || !inb(sx, sy)) return null;
  const si = sy * W + sx, ti = ty * W + tx;
  if (si === ti) return [];
  const tt = terr[ti];
  if (!(WALK[tt] || (mode && WATER[tt]))) return null;
  PF.calls++;
  const cur = ++PF.cur, g = PF.g, from = PF.from, stamp = PF.stamp, closed = PF.closed, hi = PF.hi, hf = PF.hf;
  let hn = 0, budget = mode ? 9000 : 2200;
  const heur = (i) => { const dx = Math.abs(i % W - tx), dy = Math.abs(((i / W) | 0) - ty); return (dx > dy ? dx + dy * .414 : dy + dx * .414); };
  g[si] = 0; stamp[si] = cur; from[si] = -1;
  hi[0] = si; hf[0] = heur(si); hn = 1;
  let best = si, bestH = hf[0], found = false;
  while (hn > 0) {
    // pop min
    const ci = hi[0]; hn--;
    if (hn > 0) {
      const li = hi[hn], lf = hf[hn]; let p = 0;
      for (; ;) {
        let c = p * 2 + 1; if (c >= hn) break;
        if (c + 1 < hn && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        hi[p] = hi[c]; hf[p] = hf[c]; p = c;
      }
      hi[p] = li; hf[p] = lf;
    }
    if (closed[ci] === cur) continue;
    closed[ci] = cur;
    if (ci === ti) { found = true; break; }
    if (--budget <= 0) break;
    const cx = ci % W, cy = (ci / W) | 0, cg = g[ci];
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX8[d], ny = cy + DY8[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (closed[ni] === cur) continue;
      const nt = terr[ni];
      if (!(WALK[nt] || (mode && WATER[nt]))) continue;
      if (d > 3) { // no corner cutting
        const a = terr[cy * W + nx], b = terr[ny * W + cx];
        if (!(WALK[a] || (mode && WATER[a])) || !(WALK[b] || (mode && WATER[b]))) continue;
      }
      const ng = cg + (d > 3 ? 1.414 : 1) / MOVE[nt];
      if (stamp[ni] === cur && g[ni] <= ng) continue;
      g[ni] = ng; stamp[ni] = cur; from[ni] = ci;
      const h = heur(ni);
      if (h < bestH) { bestH = h; best = ni; }
      if (hn >= 89990) continue;
      let p = hn++; const f = ng + h;
      while (p > 0) { const q = (p - 1) >> 1; if (hf[q] <= f) break; hi[p] = hi[q]; hf[p] = hf[q]; p = q; }
      hi[p] = ni; hf[p] = f;
    }
  }
  let e = found ? ti : best;
  if (e === si) return null;
  const path = [];
  while (e !== si && e >= 0) { path.push(e); e = from[e]; }
  return path;
}

/* ----- Spatial grid of units ----- */
const GC = 8;
let GRID = null, GW = 0, GH = 0;
function initGrid() {
  GW = Math.ceil(G.W / GC); GH = Math.ceil(G.H / GC);
  GRID = new Array(GW * GH);
  for (let i = 0; i < GRID.length; i++) GRID[i] = [];
}
function rebuildGrid() {
  for (let i = 0; i < GRID.length; i++) GRID[i].length = 0;
  const us = G.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i]; if (u.dead) continue;
    const cx = clamp((u.x / GC) | 0, 0, GW - 1), cy = clamp((u.y / GC) | 0, 0, GH - 1);
    GRID[cy * GW + cx].push(u);
  }
}
/** Call fn(u, d2) for each living unit within radius r of (x,y). */
function forUnitsNear(x, y, r, fn) {
  const x0 = clamp(((x - r) / GC) | 0, 0, GW - 1), x1 = clamp(((x + r) / GC) | 0, 0, GW - 1);
  const y0 = clamp(((y - r) / GC) | 0, 0, GH - 1), y1 = clamp(((y + r) / GC) | 0, 0, GH - 1);
  const r2 = r * r;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const c = GRID[cy * GW + cx];
    for (let i = 0; i < c.length; i++) {
      const u = c[i]; if (u.dead) continue;
      const dx = u.x - x, dy = u.y - y, d2 = dx * dx + dy * dy;
      if (d2 <= r2) fn(u, d2);
    }
  }
}

/* ----- Event log ----- */
function logEvent(key, args, x, y, cat) {
  G.log.push({ t: G.tick, k: key, a: args || [], x: x == null ? -1 : x, y: y == null ? -1 : y, c: cat || 'info' });
  if (G.log.length > 250) G.log.splice(0, G.log.length - 250);
  G.logVer = (G.logVer || 0) + 1;
}

/* ----- Transient visual effects (render-only, DOM-free) ----- */
const FX = { parts: [], bolts: [], arrows: [], rings: [] };
function fxPart(x, y, vx, vy, life, col, size, grav) {
  if (FX.parts.length > 900) return;
  FX.parts.push({ x, y, vx, vy, life, max: life, col, size: size || 1, grav: grav || 0 });
}
function fxBurst(x, y, n, cols, sp, life) {
  for (let i = 0; i < n; i++) { const a = rnd() * 6.283, s = rnd() * sp; fxPart(x, y, Math.cos(a) * s, Math.sin(a) * s, life * rr(.5, 1), pick(cols), rnd() < .3 ? 2 : 1); }
}
function fxSmoke(x, y, n) { for (let i = 0; i < n; i++) fxPart(x + rr(-.3, .3), y + rr(-.3, .3), rr(-.01, .01), rr(-.04, -.015), rr(30, 70), pick(['#444', '#555', '#333', '#666']), 2); }
function fxBolt(x, y) {
  const pts = []; let px = x * TS + rr(-30, 30), py = y * TS - 160;
  const steps = 9;
  for (let i = 0; i <= steps; i++) { const f = i / steps; pts.push([px + (x * TS - px) * f + (i < steps ? rr(-6, 6) : 0), py + (y * TS - py) * f]); }
  FX.bolts.push({ pts, life: 9 });
}
function fxArrow(x0, y0, x1, y1, col) { if (FX.arrows.length < 200) FX.arrows.push({ x0, y0, x1, y1, life: 6, col: col || '#eee' }); }
function fxRing(x, y, r, col) { FX.rings.push({ x, y, r, life: 16, max: 16, col: col || '#fff' }); }
