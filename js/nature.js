'use strict';
/* ===== Nature, disasters, world events and the main simulation tick ===== */

function inRain(x, y) { for (const r of G.rains) if (Math.abs(r.x - x) <= r.r && Math.abs(r.y - y) <= r.r) return true; return false; }
function ignite(x, y, force) {
  if (!inb(x, y)) return false;
  const i = y * G.W + x, t = G.terr[i];
  if (G.fire[i]) return false;
  if (!(FLAM[t] > 0 || G.bldAt[i] || (force && WALK[t] && t !== T_SNOW && t !== T_SAND))) return false;
  if (G.rains.length && inRain(x, y)) return false;
  G.fire[i] = 22 + ri(26); G.fires.push(i);
  return true;
}
function tickFire() {
  const fs = G.fires, W = G.W, H = G.H;
  for (let j = fs.length - 1; j >= 0; j--) {
    const i = fs[j]; let f = G.fire[i];
    if (!f) { fs[j] = fs[fs.length - 1]; fs.pop(); continue; }
    f--; G.fire[i] = f;
    const x = i % W, y = (i / W) | 0, t = G.terr[i];
    if (rnd() < .12) fxPart(x + rnd(), y + rnd() * .5, rr(-.01, .01), rr(-.05, -.02), rr(20, 50), '#444', 2);
    const bid = G.bldAt[i];
    if (bid) { const b = G.blds.get(bid); if (b) { b.hp -= 5; if (b.hp <= 0) destroyBuilding(b); } }
    const d = ri(4), nx = x + DX8[d], ny = y + DY8[d];
    if (nx >= 0 && ny >= 0 && nx < W && ny < H) {
      const ni = ny * W + nx;
      if (!G.fire[ni]) { let p = FLAM[G.terr[ni]] * .42; if (G.bldAt[ni]) p = Math.max(p, .03); if (p && rnd() < p) ignite(nx, ny); }
    }
    if (f === 0) {
      if (t === T_FOREST || t === T_TAIGA) setTerr(x, y, T_ASH);
      else if (t === T_GRASS && rnd() < .6) setTerr(x, y, T_ASH, true);
      fs[j] = fs[fs.length - 1]; fs.pop();
    }
  }
}
function tickLava() {
  const ls = G.lavas, W = G.W, H = G.H;
  for (let j = ls.length - 1; j >= 0; j--) {
    const i = ls[j];
    if (G.terr[i] !== T_LAVA) { ls[j] = ls[ls.length - 1]; ls.pop(); continue; }
    const x = i % W, y = (i / W) | 0, a = G.amt[i];
    const d = ri(4), nx = x + DX8[d], ny = y + DY8[d];
    if (nx >= 0 && ny >= 0 && nx < W && ny < H) {
      const ni = ny * W + nx, nt = G.terr[ni];
      if (nt !== T_LAVA) {
        if (a > 1 && rnd() < .3 && nt !== T_MOUNT && nt !== T_PEAK) {
          if (WATER[nt]) { setTerr(nx, ny, T_HILL); fxSmoke(nx + .5, ny + .5, 3); }
          else { setTerr(nx, ny, T_LAVA); G.amt[ni] = a - 1; }
        } else ignite(nx, ny);
      }
    }
    if (rnd() < .035) { setTerr(x, y, rnd() < .6 ? T_HILL : T_ASH); ls[j] = ls[ls.length - 1]; ls.pop(); }
  }
}

function nearBuilding(x, y) {
  const W = G.W;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inb(x + dx, y + dy) && G.bldAt[(y + dy) * W + x + dx]) return true;
  return false;
}
function tickNature() {
  const W = G.W, H = G.H, N = W * H, terr = G.terr, n = Math.max(8, (N / 1000) | 0);
  for (let s = 0; s < n; s++) {
    const i = ri(N), t = terr[i];
    if (t === T_FOREST || t === T_TAIGA) {
      if (G.amt[i] < 4) G.amt[i]++;
      if (rnd() < (t === T_FOREST ? .05 : .025)) {
        const d = ri(4), x = (i % W) + DX8[d], y = ((i / W) | 0) + DY8[d];
        if (inb(x, y)) { const ni = y * W + x, nt = terr[ni]; if (((t === T_FOREST && nt === T_GRASS) || (t === T_TAIGA && nt === T_SNOW)) && !G.bldAt[ni] && !G.feat[ni] && !nearBuilding(x, y)) { setTerr(x, y, t); G.amt[ni] = 2; } }
      }
    } else if (t === T_ASH) { if (rnd() < .12 && !G.fire[i]) setTerr(i % W, (i / W) | 0, T_GRASS, true); }
    else if (t === T_GRASS) {
      if (G.feat[i] === F_BERRY) { if (G.amt[i] < 3) { G.amt[i] = 3; markDirty(i); } }
      else if (!G.feat[i] && !G.bldAt[i] && rnd() < .004) setFeat(i % W, (i / W) | 0, F_BERRY, 3);
    }
  }
}

/* ----- Disasters & powers primitives ----- */
function strikeLightning(x, y) {
  fxBolt(x + .5, y + .5); G.flash = 5;
  forUnitsNear(x + .5, y + .5, 1.6, u => damage(u, rr(60, 130), null));
  const b = G.blds.get(G.bldAt[y * G.W + x]); if (b) { b.hp -= 50; if (b.hp <= 0) destroyBuilding(b); }
  ignite(x, y, true);
  fxBurst(x + .5, y + .5, 14, ['#fff', '#ffa', '#9cf'], .12, 16);
}
function explode(x, y, r, dmg, lavaCore) {
  const W = G.W;
  for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue;
    const d = Math.hypot(dx, dy), i = ny * W + nx, t = G.terr[i];
    if (d <= r) {
      const b = G.blds.get(G.bldAt[i]); if (b) destroyBuilding(b);
      if (WATER[t]) continue;
      if (lavaCore && d <= r * .4) { setTerr(nx, ny, T_LAVA); G.amt[i] = 1; }
      else if (t === T_PEAK) setTerr(nx, ny, T_MOUNT);
      else if (t === T_MOUNT) setTerr(nx, ny, T_HILL);
      else if (t !== T_LAVA) setTerr(nx, ny, T_ASH);
    } else if (d <= r + 1.5 && rnd() < .5) ignite(nx, ny);
  }
  forUnitsNear(x + .5, y + .5, r + 1.5, (u, d2) => damage(u, dmg * (1 - Math.sqrt(d2) / (r + 2.5)), null));
  fxBurst(x + .5, y + .5, 40, ['#fa3', '#f62', '#fe6', '#555', '#fff'], .22, 34);
  fxRing(x + .5, y + .5, r + 2, '#fec');
  fxSmoke(x + .5, y + .5, 10);
  G.quake = Math.max(G.quake, 6 + r * 3);
}
function dropMeteor(x, y, delay) { G.meteors.push({ x, y, t: delay == null ? 45 : delay, max: delay == null ? 45 : delay, r: 2 + ri(3) }); }
function earthquake(x, y, R) {
  const W = G.W;
  G.quake = Math.max(G.quake, 50);
  for (const b of [...G.blds.values()]) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d <= R) { b.hp -= b.mhp * rr(.25, 1.1) * (1 - d / (R * 1.3)); if (b.hp <= 0) destroyBuilding(b); }
  }
  forUnitsNear(x + .5, y + .5, R, u => { if (!KIND[u.kind].fly) damage(u, rr(4, 30), null); });
  for (let c = 0; c < 4; c++) {
    let cx = x, cy = y, a = rnd() * 6.283;
    for (let s = 0; s < R; s++) {
      a += rr(-.5, .5); cx += Math.cos(a); cy += Math.sin(a);
      const tx = Math.round(cx), ty = Math.round(cy); if (!inb(tx, ty)) break;
      const t = G.terr[ty * W + tx];
      if (WATER[t]) continue;
      if (t === T_PEAK || t === T_MOUNT) setTerr(tx, ty, T_HILL);
      else if (rnd() < .12) { setTerr(tx, ty, T_LAVA); G.amt[ty * W + tx] = 1; }
      else { const b = G.blds.get(G.bldAt[ty * W + tx]); if (b) destroyBuilding(b); setTerr(tx, ty, T_ASH); }
      fxSmoke(tx + .5, ty + .5, 1);
    }
  }
}
function spawnTornado(x, y) { G.tornadoes.push({ x: x + .5, y: y + .5, a: rnd() * 6.283, life: 600 }); }
function startVolcano(x, y) {
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const d = Math.hypot(dx, dy), nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue;
    if (d < 1.5) { setTerr(nx, ny, T_LAVA); G.amt[ny * G.W + nx] = 6; }
    else if (d < 2.6 && rnd() < .8) setTerr(nx, ny, d < 2 ? T_PEAK : T_MOUNT);
  }
  G.volcanoes.push({ x, y, life: 420 });
  G.quake = Math.max(G.quake, 25);
}
function addRain(x, y, r, life, storm) {
  for (const rn of G.rains) if (!rn.storm === !storm && Math.abs(rn.x - x) < 3 && Math.abs(rn.y - y) < 3) { rn.x = x; rn.y = y; rn.life = Math.max(rn.life, life); rn.r = r; return rn; }
  const rn = { x, y, r, life, storm: storm ? 1 : 0, vx: storm ? rr(-.03, .03) : 0, vy: storm ? rr(-.02, .02) : 0 };
  G.rains.push(rn); return rn;
}
function rainEffect(x, y) {
  if (!inb(x, y)) return;
  const i = y * G.W + x, t = G.terr[i];
  if (G.fire[i]) { G.fire[i] = 0; fxSmoke(x + .5, y + .5, 1); }
  if (t === T_ASH && rnd() < .3) setTerr(x, y, T_GRASS, true);
  else if (t === T_LAVA) setTerr(x, y, T_HILL);
  else if (t === T_DESERT && rnd() < .03) setTerr(x, y, T_GRASS, true);
  else if (t === T_GRASS && !G.bldAt[i] && !G.feat[i]) { const r = rnd(); if (r < .012) setFeat(x, y, F_BERRY, 3); else if (r < .02 && !G.owner[i]) setTerr(x, y, T_FOREST); }
  const b = G.blds.get(G.bldAt[i]); if (b && b.type === B_FARM && b.grow < 100) b.grow = Math.min(100, b.grow + 25);
}

function tickSky() {
  const tick = G.tick, W = G.W, H = G.H;
  // meteors
  for (let j = G.meteors.length - 1; j >= 0; j--) {
    const m = G.meteors[j];
    if (--m.t <= 0) { explode(m.x, m.y, m.r, 320, true); G.meteors.splice(j, 1); }
  }
  // rain
  for (let j = G.rains.length - 1; j >= 0; j--) {
    const r = G.rains[j];
    r.x += r.vx; r.y += r.vy;
    if (--r.life <= 0 || !inb(r.x | 0, r.y | 0)) { G.rains.splice(j, 1); continue; }
    if (tick % 3 === 0) {
      const n = Math.max(2, (r.r * r.r / 5) | 0);
      for (let s = 0; s < n; s++) rainEffect((r.x + rr(-r.r, r.r)) | 0, (r.y + rr(-r.r, r.r)) | 0);
      if (r.storm && rnd() < .035) { const x = (r.x + rr(-r.r, r.r)) | 0, y = (r.y + rr(-r.r, r.r)) | 0; if (inb(x, y)) strikeLightning(x, y); }
    }
  }
  // tornadoes
  for (let j = G.tornadoes.length - 1; j >= 0; j--) {
    const t = G.tornadoes[j];
    t.a += rr(-.25, .25); t.x = clamp(t.x + Math.cos(t.a) * .07, 1, W - 2); t.y = clamp(t.y + Math.sin(t.a) * .07, 1, H - 2);
    if (--t.life <= 0) { G.tornadoes.splice(j, 1); continue; }
    if (tick % 3 === 0) {
      forUnitsNear(t.x, t.y, 2.2, u => {
        damage(u, 7, null); if (u.dead) return;
        u.x = clamp(u.x + rr(-1.6, 1.6), .5, W - .5); u.y = clamp(u.y + rr(-1.6, 1.6), .5, H - .5); u.path = null;
        if (u.st !== ST_FIGHT) u.st = ST_IDLE;
      });
      const x = (t.x + rr(-1.5, 1.5)) | 0, y = (t.y + rr(-1.5, 1.5)) | 0;
      if (inb(x, y)) {
        const i = y * W + x, tt = G.terr[i];
        if (tt === T_FOREST) setTerr(x, y, T_GRASS); else if (tt === T_TAIGA) setTerr(x, y, T_SNOW);
        const b = G.blds.get(G.bldAt[i]); if (b) { b.hp -= 45; if (b.hp <= 0) destroyBuilding(b); }
        fxPart(t.x, t.y, rr(-.1, .1), rr(-.12, -.04), 30, pick(['#876', '#585', '#ccc']), 2);
      }
    }
  }
  // volcanoes
  for (let j = G.volcanoes.length - 1; j >= 0; j--) {
    const v = G.volcanoes[j];
    if (--v.life <= 0) { G.volcanoes.splice(j, 1); continue; }
    if (tick % 12 === 0) {
      const i = v.y * W + v.x;
      if (G.terr[i] !== T_LAVA) setTerr(v.x, v.y, T_LAVA);
      G.amt[i] = 7;
      const a = rnd() * 6.283, d = rr(2, 5.5), x = Math.round(v.x + Math.cos(a) * d), y = Math.round(v.y + Math.sin(a) * d);
      if (inb(x, y) && !WATER[G.terr[y * W + x]] && rnd() < .7) { setTerr(x, y, T_LAVA); G.amt[y * W + x] = 3; }
      fxBurst(v.x + .5, v.y + .5, 8, ['#fa3', '#f62', '#fe6'], .16, 30);
      fxSmoke(v.x + .5, v.y + .5, 3);
    }
  }
}

/* ----- Random world events ----- */
function randomLand(test) {
  for (let n = 0; n < 60; n++) { const x = ri(G.W), y = ri(G.H), t = G.terr[y * G.W + x]; if (test ? test(t) : WALK[t]) return [x, y]; }
  return null;
}
function spawnRaid(v, n) {
  for (let s = 0; s < n; s++) {
    const a = rnd() * 6.283, d = v.radius + 2, x = Math.round(v.x + Math.cos(a) * d), y = Math.round(v.y + Math.sin(a) * d);
    if (inb(x, y) && WALK[G.terr[y * G.W + x]]) spawnUnit(K_SKEL, x + .5, y + .5);
  }
}
function worldEvents() {
  const r = rnd(), vs = [...G.villages.values()], dis = G.opts.disasters;
  // keep the wilderness alive: predators return from beyond the map's edge
  if (G.count && G.caps) {
    if (G.count[K_WOLF] < G.caps[K_WOLF] * .3 && rnd() < .3) { const p = randomLand(t => t === T_FOREST || t === T_TAIGA); if (p && !G.owner[p[1] * G.W + p[0]]) for (let n = 0; n < 3; n++) spawnUnit(K_WOLF, p[0] + .5, p[1] + .5); }
    if (G.count[K_BEAR] < G.caps[K_BEAR] * .3 && rnd() < .2) { const p = randomLand(t => t === T_FOREST || t === T_TAIGA || t === T_HILL); if (p && !G.owner[p[1] * G.W + p[0]]) spawnUnit(K_BEAR, p[0] + .5, p[1] + .5); }
  }
  if (r < .12) { const p = randomLand(); if (p) { addRain(p[0], p[1], 8 + ri(4), 700 + ri(500), true); logEvent('ev.storm', [], p[0], p[1], 'nature'); } }
  else if (r < .16) { const big = vs.filter(v => v.pop >= 20); if (big.length && dis) { const v = pick(big); for (let n = 0; n < 3; n++) { const u = pick(v.members); if (u) u.sick = 700; } logEvent('ev.plague', [v.name], v.x, v.y, 'bad'); } }
  else if (r < .22) { if (vs.length) { const v = pick(vs); v.stock[0] += v.pop * 4 + 10; logEvent('ev.harvest', [v.name], v.x, v.y, 'good'); } }
  else if (r < .26) {
    const cs = G.units.filter(u => u.kind < 4 && u.vid && isAdult(u) && !u.hero && u.age < u.life * .6);
    if (cs.length) { const u = pick(cs); u.hero = 1; u.mhp *= 2; u.hp = u.mhp; logEvent('ev.hero', [u.name, (G.villages.get(u.vid) || {}).name || '?'], u.x | 0, u.y | 0, 'good'); }
  }
  else if (r < .30) { const big = vs.filter(v => v.pop >= 12); if (big.length && dis && (G.count ? G.count[K_SKEL] : 0) < 30) { const v = pick(big); spawnRaid(v, 3 + ri(Math.min(8, 2 + v.pop / 8))); logEvent('ev.raid', [v.name], v.x, v.y, 'bad'); } }
  else if (r < .31) { if (dis && G.tick > YEAR * 25 && G.count && !G.count[K_DRAGON]) { const p = randomLand(t => t === T_MOUNT || t === T_PEAK) || randomLand(); if (p) { spawnUnit(K_DRAGON, p[0] + .5, p[1] + .5); logEvent('ev.dragon', [], p[0], p[1], 'bad'); } } }
  else if (r < .325) { if (dis) { const p = randomLand(); if (p) { dropMeteor(p[0], p[1]); logEvent('ev.meteor', [], p[0], p[1], 'bad'); } } }
  else if (r < .335) { if (dis) { const p = randomLand(); if (p) { earthquake(p[0], p[1], 9); logEvent('ev.quake', [], p[0], p[1], 'bad'); } } }
  else if (r < .34) { if (dis) { const p = randomLand(t => t === T_MOUNT || t === T_PEAK); if (p) { startVolcano(p[0], p[1]); logEvent('ev.volcano', [], p[0], p[1], 'bad'); } } }
  else if (r < .42) {
    if (G.count && G.count[K_SHEEP] < G.caps[K_SHEEP] * .4) { const p = randomLand(t => t === T_GRASS); if (p) { for (let n = 0; n < 6; n++) spawnUnit(K_SHEEP, p[0] + .5 + rr(-2, 2), p[1] + .5 + rr(-2, 2)); logEvent('ev.herd', [], p[0], p[1], 'nature'); } }
    if (G.count && G.count[K_RABBIT] < G.caps[K_RABBIT] * .3) { const p = randomLand(t => t === T_GRASS); if (p) for (let n = 0; n < 5; n++) spawnUnit(K_RABBIT, p[0] + .5 + rr(-2, 2), p[1] + .5 + rr(-2, 2)); }
    if (G.count && G.count[K_WOLF] < 2 && rnd() < .5) { const p = randomLand(t => t === T_FOREST || t === T_TAIGA); if (p) for (let n = 0; n < 3; n++) spawnUnit(K_WOLF, p[0] + .5, p[1] + .5); }
  }
}

/* ----- Territory ----- */
function recomputeOwners() {
  const W = G.W, H = G.H, own = G.owner, terr = G.terr;
  own.fill(0);
  const vs = [...G.villages.values()].sort((a, b) => a.founded - b.founded);
  for (const v of vs) v.radius = clamp(Math.floor(5 + Math.sqrt(v.nb) * 1.5), 5, 18);
  // claim in rings so neighbours split contested land fairly
  for (const v of vs) {
    const R = v.radius, R2 = R * R + R;
    for (let dy = -R; dy <= R; dy++) {
      const y = v.y + dy; if (y < 0 || y >= H) continue;
      for (let dx = -R; dx <= R; dx++) {
        const x = v.x + dx; if (x < 0 || x >= W) continue;
        const d2 = dx * dx + dy * dy; if (d2 > R2) continue;
        const i = y * W + x;
        if (terr[i] === T_DEEP) continue;
        const o = own[i];
        if (o) { const ov = G.villages.get(o); const od = (ov.x - x) * (ov.x - x) + (ov.y - y) * (ov.y - y); if (od <= d2) continue; }
        own[i] = v.id;
      }
    }
  }
  G.ownerDirty = false; G.ownerVer = (G.ownerVer || 0) + 1;
}

/* ----- Main tick ----- */
function simTick() {
  const tick = ++G.tick;
  PF.calls = 0;
  if (G.regionDirty && tick - G.regionTick > 15) computeRegions();
  if (tick % 4 === 0) rebuildGrid();
  if (tick % 15 === 0) census();
  tickUnits();
  for (const v of G.villages.values()) if ((tick + v.upd) % 30 === 0) updateVillage(v);
  if (tick % 60 === 0) for (const k of [...G.kingdoms.values()]) if (G.kingdoms.has(k.id)) updateKingdom(k);
  if (tick % 90 === 0) diplomacy();
  if (tick % 3 === 0) tickFire();
  if (tick % 6 === 0) tickLava();
  tickNature();
  tickSky();
  if (tick % 300 === 0) worldEvents();
  if ((G.ownerDirty && tick % 20 === 0) || tick % 600 === 0) recomputeOwners();
  if (G.quake > 0) G.quake--;
  if (G.flash > 0) G.flash--;
}
/** Prepare derived state after generation or load. */
function primeWorld() {
  if (!G.opts) G.opts = { disasters: true };
  computeRegions(); rebuildGrid();
  for (const v of G.villages.values()) { if (!v.members) v.members = []; if (!v.farmIds) v.farmIds = []; recountVillage(v); }
  census(); recomputeOwners();
}
