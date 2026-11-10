'use strict';
/* ===== Civilisations: villages, kingdoms, diplomacy, war, trade ===== */

/* ----- Relations ----- */
const REL_PEACE = 0, REL_WAR = 1, REL_ALLY = 2;
const relKey = (a, b) => a < b ? a + '_' + b : b + '_' + a;
function getRel(a, b) {
  if (a === b) return null;
  const ka = G.kingdoms.get(a), kb = G.kingdoms.get(b);
  if (!ka || !kb) return null;
  const key = relKey(a, b);
  let r = G.rel[key];
  if (!r) r = G.rel[key] = { op: RACE_AFF[ka.race][kb.race] * .6 + rr(-15, 15), st: REL_PEACE, since: G.tick, trade: 0, exh: 0 };
  return r;
}
function setRel(a, b, st) {
  const r = getRel(a, b); if (!r || r.st === st) return r;
  const ka = G.kingdoms.get(a), kb = G.kingdoms.get(b);
  r.st = st; r.since = G.tick; r.exh = 0;
  delete ka.war[b]; delete kb.war[a]; delete ka.ally[b]; delete kb.ally[a];
  if (st === REL_WAR) { ka.war[b] = 1; kb.war[a] = 1; r.trade = 0; G.stats.wars++; }
  if (st === REL_ALLY) { ka.ally[b] = 1; kb.ally[a] = 1; }
  return r;
}
function declareWar(a, b, quiet) {
  const ka = G.kingdoms.get(a), kb = G.kingdoms.get(b);
  if (!ka || !kb || a === b || ka.war[b]) return;
  const r = setRel(a, b, REL_WAR); r.op = Math.min(r.op, -50);
  const cv = G.villages.get(ka.cap);
  if (!quiet) logEvent('ev.war', [ka.name, kb.name], cv ? cv.x : -1, cv ? cv.y : -1, 'war');
  // allies of the defender join
  for (const id in kb.ally) {
    const al = +id, kal = G.kingdoms.get(al);
    if (!kal || al === a || kal.war[a]) continue;
    const ra = getRel(al, a);
    if (ra && ra.st !== REL_ALLY && ra.op < 35) { setRel(al, a, REL_WAR); ra.op = Math.min(ra.op, -40); logEvent('ev.joinwar', [kal.name, kb.name, ka.name], -1, -1, 'war'); }
  }
}
function makePeace(a, b) {
  const ka = G.kingdoms.get(a), kb = G.kingdoms.get(b);
  if (!ka || !kb || !ka.war[b]) return;
  const r = setRel(a, b, REL_PEACE); r.op = Math.max(r.op, -15);
  for (const v of G.villages.values()) if (v.atk) { const tv = G.villages.get(v.atk); if (!tv || !isWar(v.kid, tv.kid)) v.atk = 0; }
  logEvent('ev.peace', [ka.name, kb.name], -1, -1, 'good');
}

/* ----- Kingdoms ----- */
function createKingdom(race, v) {
  const id = G.nextKid = (G.nextKid || 0) + 1;
  const used = new Array(KCOLORS.length).fill(0);
  for (const k of G.kingdoms.values()) used[k.color]++;
  let color = 0, best = 1e9; const off = ri(KCOLORS.length);
  for (let c = 0; c < KCOLORS.length; c++) { const cc = (c + off) % KCOLORS.length; if (used[cc] < best) { best = used[cc]; color = cc; } }
  const k = {
    id, name: placeName(race), race, color, cap: v.id, kingId: 0, kingName: '', vids: [], war: {}, ally: {}, founded: G.tick,
    aggr: clamp(KIND[race].aggr + rr(-.2, .2), 0, 1), pop: 0, sold: 0, peak: 0, unrest: 0, warCount: 0
  };
  G.kingdoms.set(id, k);
  return k;
}
function removeKingdom(k, byName) {
  if (!G.kingdoms.has(k.id)) return;
  G.kingdoms.delete(k.id);
  for (const o of G.kingdoms.values()) { delete o.war[k.id]; delete o.ally[k.id]; delete G.rel[relKey(o.id, k.id)]; }
  for (const u of G.units) if (u.kid === k.id) { u.kid = 0; if (u.role === RL_KING || u.role === RL_SOLDIER) u.role = RL_WORKER; }
  G.stats.fallen++;
  logEvent(byName ? 'ev.conquered' : 'ev.fall', [k.name, byName || ''], -1, -1, 'bad');
}
function kingdomTitle(k) { return k.pop >= 150 || k.vids.length >= 6 ? 'empire' : k.pop >= 25 ? 'kingdom' : 'tribe'; }

/* ----- Villages & buildings ----- */
function foundVillage(x, y, race, kid, founder, silent) {
  const id = G.nextVid = (G.nextVid || 0) + 1;
  const v = {
    id, name: placeName(race), kid: 0, race, x, y, founded: G.tick, stock: [36, 24, 0, 0, 0, 0, 0, 0], arms: 0, tools: 0, miss: 0, pop: 0, adults: 0, soldiers: 0,
    cap: 5, sites: 0, atk: 0, atkUntil: 0, lastAtk: -9999, siege: 0, radius: 6, lvl: 0, starve: 0, lastSettler: G.tick, lastTrade: G.tick,
    bids: [], farmIds: [], nb: 0, farms: 0, has: new Array(BLD.length).fill(0), upd: ri(30), cons: 0, empty: 0, members: []
  };
  G.villages.set(id, v);
  let k = kid ? G.kingdoms.get(kid) : null, fresh = false;
  if (!k) { k = createKingdom(race, v); fresh = true; }
  v.kid = k.id; k.vids.push(id);
  placeBuilding(v, B_HALL, x, y, true);
  if (founder) { founder.vid = id; founder.kid = k.id; founder.role = RL_WORKER; resetTask(founder); }
  G.ownerDirty = true;
  if (!silent) {
    if (fresh) logEvent('ev.found', ['@races.' + KIND[race].key, v.name, k.name], x, y, 'good');
    else logEvent('ev.settle', [k.name, v.name], x, y, 'good');
  }
  return v;
}
function placeBuilding(v, type, x, y, built) {
  const W = G.W, i = y * W + x, t = G.terr[i];
  if (t === T_FOREST) setTerr(x, y, T_GRASS); else if (t === T_TAIGA) setTerr(x, y, T_SNOW);
  G.feat[i] = 0; G.amt[i] = 0; markDirty(i);
  const id = G.nextBid = (G.nextBid || 0) + 1, mhp = BLD[type].hp;
  const b = { id, type, x, y, vid: v.id, hp: built ? mhp : mhp * .25, mhp, built: !!built, prog: 0, lvl: 0, grow: ri(60), res: 0 };
  G.blds.set(id, b); G.bldAt[i] = id; v.bids.push(id);
  recountVillage(v);
  return b;
}
function destroyBuilding(b, silent) {
  if (!b || !G.blds.has(b.id)) return;
  G.blds.delete(b.id);
  const i = b.y * G.W + b.x;
  if (G.bldAt[i] === b.id) G.bldAt[i] = 0;
  if (!silent) { fxBurst(b.x + .5, b.y + .5, 10, ['#864', '#555', '#a86'], .07, 26); fxSmoke(b.x + .5, b.y + .5, 4); }
  const v = G.villages.get(b.vid);
  if (v) recountVillage(v);
}
function recountVillage(v) {
  const keep = []; v.farmIds.length = 0;
  let cap = 0, farms = 0, sites = 0; const has = new Array(BLD.length).fill(0);
  for (const id of v.bids) {
    const b = G.blds.get(id); if (!b) continue;
    keep.push(id);
    if (!b.built) { sites++; continue; }
    has[b.type]++;
    if (b.type === B_HALL) cap += 5; else if (b.type === B_HOUSE) cap += 4 + b.lvl * 2; else if (b.type === B_FARM) { farms++; v.farmIds.push(id); }
  }
  const onb = v.nb;
  v.bids = keep; v.cap = cap; v.farms = farms; v.sites = sites; v.has = has; v.nb = keep.length;
  if (Math.floor(Math.sqrt(onb || 0) * 1.5) !== Math.floor(Math.sqrt(v.nb) * 1.5)) G.ownerDirty = true;
}
function removeVillage(v, log) {
  if (!G.villages.has(v.id)) return;
  for (const id of v.bids.slice()) destroyBuilding(G.blds.get(id), true);
  G.villages.delete(v.id);
  for (const u of G.units) if (u.vid === v.id) { u.vid = 0; u.role = RL_WORKER; resetTask(u); }
  const k = G.kingdoms.get(v.kid);
  if (log) logEvent('ev.ruin', [v.name], v.x, v.y, 'bad');
  if (k) { k.vids = k.vids.filter(id => id !== v.id); if (!k.vids.length) removeKingdom(k); else if (k.cap === v.id) k.cap = k.vids[0]; }
  G.ownerDirty = true;
}
function villageLevel(v) { return v.pop >= 60 ? 3 : v.pop >= 25 ? 2 : v.pop >= 10 ? 1 : 0; }

function siteOK(v, x, y, farm) {
  if (!inb(x, y) || x < 1 || y < 1 || x > G.W - 2 || y > G.H - 2) return false;
  const W = G.W, i = y * W + x, t = G.terr[i];
  if (!BUILDOK[t] || G.bldAt[i] || G.fire[i]) return false;
  if (farm && (t === T_FOREST || t === T_TAIGA)) return false;
  const o = G.owner[i]; if (o && o !== v.id) return false;
  if (G.region[i] !== G.region[v.y * W + v.x]) return false;
  if (farm) return Math.abs(x - v.x) > 1 || Math.abs(y - v.y) > 1;
  return ((x - v.x) & 1) === 0 && ((y - v.y) & 1) === 0;
}
function chooseSite(v, type) {
  const farm = type === B_FARM, W = G.W;
  if (type === B_DOCK) { // must touch water
    for (let n = 0; n < 90; n++) {
      const R = v.radius, x = v.x + ri(2 * R + 1) - R, y = v.y + ri(2 * R + 1) - R;
      if (!siteOK(v, x, y, true)) continue;
      for (let d = 0; d < 4; d++) { const nx = x + DX8[d], ny = y + DY8[d]; if (inb(nx, ny) && WATER[G.terr[ny * W + nx]]) return [x, y]; }
    }
    return null;
  }
  if (type === B_MINE && v.spot) { // next to a deposit
    for (const r of [R_ORE, R_COPPER, R_COAL, R_GOLD, R_GEM, R_STONE]) {
      const sp = v.spot[r]; if (sp == null || sp < 0) continue;
      for (let n = 0; n < 14; n++) { const x = (sp % W) + ri(5) - 2, y = ((sp / W) | 0) + ri(5) - 2; if (siteOK(v, x, y, true) && !G.feat[y * W + x]) return [x, y]; }
    }
  }
  if (farm && v.farmIds.length && rnd() < .75) {
    for (let n = 0; n < 12; n++) {
      const b = G.blds.get(pick(v.farmIds)); if (!b) continue;
      const d = ri(4), x = b.x + DX8[d], y = b.y + DY8[d];
      if (siteOK(v, x, y, true) && !(((x - v.x) & 1) === 0 && ((y - v.y) & 1) === 0 && Math.hypot(x - v.x, y - v.y) < 5)) return [x, y];
    }
  }
  const R0 = farm ? 3 + Math.sqrt(v.nb) : 2 + Math.sqrt(v.nb) * .9;
  for (let n = 0; n < 50; n++) {
    const R = Math.min(v.radius, R0 + n * .12);
    let x = v.x + Math.round(rr(-R, R)), y = v.y + Math.round(rr(-R, R));
    if (!farm) { x = v.x + (((x - v.x) >> 1) << 1); y = v.y + (((y - v.y) >> 1) << 1); }
    else if (((x - v.x) & 1) === 0 && ((y - v.y) & 1) === 0) continue;
    if (siteOK(v, x, y, farm)) return [x, y];
  }
  return null;
}
function canAfford(v, type) { const c = BLD[type].cost; for (let r = 1; r < 5; r++) if (v.stock[r] < c[r]) return false; return true; }
function planBuild(v, k) {
  if (v.sites >= (v.pop < 12 ? 1 : 2)) return;
  const pop = v.pop, h = v.has;
  let want = -1;
  const farmNeed = Math.min(44, Math.ceil(pop / 2.4) + 1);
  if (v.farms < 2 || (v.farms < farmNeed && v.stock[0] < pop * 5)) want = B_FARM;
  else if (v.cap < pop + 3) want = B_HOUSE;
  else if (v.farms < farmNeed) want = B_FARM;
  else if (pop >= 7 && !h[B_SAWMILL] && v.spot && v.spot[R_WOOD] >= 0) want = B_SAWMILL;
  else if (pop >= 8 && !h[B_DOCK] && !(v.noDock > G.tick)) want = B_DOCK;
  else if (pop >= 9 && !h[B_MINE] && v.spot && v.spot.some((s, r) => r >= 2 && s >= 0)) want = B_MINE;
  else if (pop >= 10 && !h[B_BARRACKS]) want = B_BARRACKS;
  else if (pop >= 15 && !h[B_MARKET]) want = B_MARKET;
  else if (pop >= 12 && !h[B_TOWER]) want = B_TOWER;
  else if (pop >= 22 && !h[B_SMITHY]) want = B_SMITHY;
  else if (pop >= 30 && !h[B_TEMPLE]) want = B_TEMPLE;
  else if (k.warCount && h[B_TOWER] < 1 + pop / 25) want = B_TOWER;
  else if (v.lvl >= 1 && v.stock[1] >= 12 && v.stock[2] >= 10) { // upgrade a house
    for (const id of v.bids) {
      const b = G.blds.get(id);
      if (b && b.built && b.type === B_HOUSE && b.lvl < v.lvl) { b.lvl++; b.mhp += 60; b.hp = b.mhp; v.stock[1] -= 8; v.stock[2] -= 8; recountVillage(v); return; }
    }
    if (v.cap < pop + 6) want = B_HOUSE;
  }
  if (want < 0 || !canAfford(v, want)) { if (want !== B_HOUSE && want !== B_FARM && v.cap < pop + 2 && canAfford(v, B_HOUSE)) want = B_HOUSE; else return; }
  const s = chooseSite(v, want); if (!s) { if (want === B_DOCK) v.noDock = G.tick + 4000; return; }
  const c = BLD[want].cost; for (let r = 1; r < 5; r++) v.stock[r] -= c[r];
  placeBuilding(v, want, s[0], s[1], false);
}

function findSettleSpot(v) {
  const W = G.W; let best = null, bs = -1e9;
  const far = rnd() < .2;
  for (let n = 0; n < 60; n++) {
    const a = rnd() * 6.283, d = far ? rr(40, 100) : rr(15, 38);
    const x = Math.round(v.x + Math.cos(a) * d), y = Math.round(v.y + Math.sin(a) * d);
    if (!inb(x, y)) continue;
    const t = G.terr[y * W + x];
    if (t === T_FOREST || t === T_TAIGA) continue;
    if (!canFoundAt(x, y, v.race, false)) continue;
    const sc = habitatScore(x, y, v.race) - d * .12 + (G.region[y * W + x] === G.region[v.y * W + v.x] ? 4 : 0);
    if (sc > bs) { bs = sc; best = [x, y]; }
  }
  return bs > 12 ? best : null;
}
function doSettle(u) {
  const W = G.W, x = u.tt % W, y = (u.tt / W) | 0, ov = G.villages.get(u.vid);
  u.role = RL_WORKER;
  if (!canFoundAt(x, y, u.kind, true)) { resetTask(u); return; }
  const nv = foundVillage(x, y, u.kind, u.kid, u, false);
  if (ov) {
    let moved = 0;
    for (const m of ov.members) { if (moved >= 4) break; if (m !== u && !m.dead && m.vid === ov.id && m.role === RL_WORKER && isAdult(m) && rnd() < .5) { m.vid = nv.id; resetTask(m); moved++; } }
  }
}
function doTrade(u) {
  const v = G.villages.get(u.vid), pv = G.villages.get(u.tid);
  u.tk = 0; u.tt = -1;
  if (!v || !pv || isWar(v.kid, pv.kid)) { u.role = RL_WORKER; resetTask(u); return; }
  let give = 1, get = 1, gb = -1e9, tb = -1e9;
  for (let r = 0; r < NRES; r++) { if (r === R_GOLD) continue; const a = v.stock[r] - pv.stock[r]; if (a > gb) { gb = a; give = r; } if (-a > tb) { tb = -a; get = r; } }
  const g1 = Math.min(10, v.stock[give] | 0); v.stock[give] -= g1; pv.stock[give] += g1;
  const g2 = Math.min(10, pv.stock[get] | 0); pv.stock[get] -= g2; v.stock[get] += g2;
  pv.stock[R_GOLD] += 4;
  u.cr = R_GOLD; u.ca = 6; u.st = ST_RETURN; u.tid = 0;
  fxBurst(pv.x + .5, pv.y + .5, 6, ['#fd4', '#fff'], .05, 22);
  if (v.kid !== pv.kid) { const r = getRel(v.kid, pv.kid); if (r) r.op = Math.min(100, r.op + 1.5); }
}

function captureVillage(v, nkid) {
  const ok = G.kingdoms.get(v.kid), nk = G.kingdoms.get(nkid);
  if (!nk) return;
  logEvent('ev.capture', [nk.name, v.name, ok ? ok.name : ''], v.x, v.y, 'war');
  v.kid = nk.id; v.siege = 0; v.atk = 0; nk.vids.push(v.id);
  for (const u of G.units) if (u.vid === v.id) { u.kid = nk.id; if (u.role !== RL_WORKER) { u.role = RL_WORKER; resetTask(u); } }
  for (const o of G.villages.values()) if (o.atk === v.id) o.atk = 0;
  if (v.bids.length > 1) { const b = G.blds.get(v.bids[1 + ri(v.bids.length - 1)]); if (b) ignite(b.x, b.y, true); }
  if (ok) {
    const r = getRel(ok.id, nk.id); if (r) r.exh += 12;
    ok.vids = ok.vids.filter(id => id !== v.id);
    if (!ok.vids.length) removeKingdom(ok, nk.name); else if (ok.cap === v.id) ok.cap = ok.vids[0];
  }
  G.ownerDirty = true;
}

function updateVillage(v) {
  const k = G.kingdoms.get(v.kid), tick = G.tick, W = G.W;
  if (!k) { removeVillage(v, true); return; }
  const m = v.members;
  if (v.pop === 0) { if (++v.empty > 12) removeVillage(v, true); return; }
  v.empty = 0;
  // town hall
  if (!v.has[B_HALL]) {
    let done = false;
    for (let r = 0; r <= 8 && !done; r++) for (let n = 0; n < Math.max(1, r * 8) && !done; n++) {
      const a = n / Math.max(1, r * 8) * 6.283, x = Math.round(v.x + Math.cos(a) * r), y = Math.round(v.y + Math.sin(a) * r);
      if (!inb(x, y)) continue; const i = y * W + x;
      if (BUILDOK[G.terr[i]] && !G.bldAt[i] && !G.fire[i]) { v.x = x; v.y = y; placeBuilding(v, B_HALL, x, y, true).hp = 120; done = true; G.ownerDirty = true; }
    }
    if (!done) { removeVillage(v, true); return; }
  }
  // economy cycle: famine check and workshops turning raw materials into goods
  if (++v.cons >= 4) {
    v.cons = 0;
    const s = v.stock;
    if (s[0] < v.pop && s[R_GOLD] >= 5 && v.has[B_MARKET]) { s[R_GOLD] -= 5; s[0] += 18; } // import food
    if (v.miss > 0) { v.starve++; if (v.starve === 3 && tick - (v.lastFamine || -9999) > 2400) { v.lastFamine = tick; logEvent('ev.famine', [v.name], v.x, v.y, 'bad'); } }
    else v.starve = 0;
    v.miss = 0;
    if (v.has[B_SMITHY] && s[R_ORE] >= 2 && s[R_COAL] >= 1 && v.arms < v.soldiers * 3 + 6) { s[R_ORE] -= 2; s[R_COAL] -= 1; v.arms += 2; }
    v.arms = Math.max(0, v.arms - v.soldiers * .04);
    if (s[R_COPPER] >= 1 && v.tools < v.pop) { s[R_COPPER] -= 1; v.tools += 4; }
    v.tools = Math.max(0, v.tools - v.pop * .03);
    if (v.has[B_MARKET] && s[R_GEM] >= 1) { s[R_GEM] -= 1; s[R_GOLD] += 5; }
    s[R_STONE] += v.has[B_MINE]; s[0] += v.has[B_DOCK] * 2;
    if (v.has[B_SAWMILL]) { // foresters replant
      const R = v.radius + 3, x = v.x + ri(2 * R + 1) - R, y = v.y + ri(2 * R + 1) - R;
      if (inb(x, y)) { const i = y * W + x; if (G.terr[i] === T_GRASS && !G.bldAt[i] && !G.feat[i] && !nearBuilding(x, y)) { setTerr(x, y, T_FOREST); G.amt[i] = 2; } }
    }
  }
  // farms grow
  for (const id of v.farmIds) { const b = G.blds.get(id); if (b && b.grow < 100) b.grow = Math.min(100, b.grow + 10); }
  // roles
  let want = v.has[B_BARRACKS] ? .2 : (v.pop >= 8 ? .1 : 0);
  if (k.warCount) want += .14;
  if (v.race === K_ORC) want += .07;
  want = Math.floor(v.adults * want);
  if (v.soldiers < want) {
    for (let n = 0; n < 6; n++) { const u = pick(m); if (u && !u.dead && u.role === RL_WORKER && isAdult(u) && u.ca === 0 && u.st !== ST_WORK) { u.role = RL_SOLDIER; u.guard = rnd() < .35 ? 1 : 0; resetTask(u); v.soldiers++; break; } }
  } else if (v.soldiers > want + 1) {
    for (let n = 0; n < 6; n++) { const u = pick(m); if (u && u.role === RL_SOLDIER) { u.role = RL_WORKER; resetTask(u); v.soldiers--; break; } }
  }
  planBuild(v, k);
  // births
  if (G.civCount < G.maxUnits && v.pop < v.cap && v.adults >= 2 && v.stock[0] > v.pop * 2 + 8 && !v.starve) {
    if (rnd() < .34 * KIND[v.race].fert * (v.has[B_TEMPLE] ? 1.2 : 1)) {
      let mother = null;
      for (let n = 0; n < 5 && !mother; n++) { const c = pick(m); if (c && !c.dead && isAdult(c) && c.age < c.life * .8) mother = c; }
      if (mother) {
        let bx = v.x, by = v.y;
        for (let n = 0; n < 4; n++) { const b = G.blds.get(pick(v.bids)); if (b && b.built && b.type === B_HOUSE) { bx = b.x; by = b.y; break; } }
        const baby = spawnUnit(mother.kind, bx + .5, by + .5);
        if (baby) { baby.ate = tick; baby.vid = v.id; baby.kid = v.kid; mother.kids++; v.stock[0] -= 3; G.stats.births++; G.civCount++; }
      }
    }
  }
  // settlers
  if (v.pop >= 14 && v.adults >= 8 && tick - v.lastSettler > 1300 && v.stock[0] > 50 && v.stock[1] > 25 && k.vids.length < 14 && rnd() < .3) {
    v.lastSettler = tick - 900;
    const spot = findSettleSpot(v);
    if (spot) for (let n = 0; n < 8; n++) {
      const u = pick(m);
      if (u && !u.dead && u.role === RL_WORKER && isAdult(u) && u.ca === 0) {
        resetTask(u); u.role = RL_SETTLER; setTask(u, TK_SETTLE, spot[1] * W + spot[0], 0);
        if (goTask(u)) { v.stock[0] -= 25; v.stock[1] -= 15; v.lastSettler = tick; } else u.role = RL_WORKER;
        break;
      }
    }
  }
  // trade caravans
  if (v.has[B_MARKET] && tick - v.lastTrade > 500 && rnd() < .3) {
    v.lastTrade = tick;
    let pv = null, pd = 90 * 90;
    for (const o of G.villages.values()) {
      if (o === v || !o.has[B_MARKET]) continue;
      if (o.kid !== v.kid) { const r = getRel(v.kid, o.kid); if (!r || !r.trade) continue; }
      const d = (o.x - v.x) * (o.x - v.x) + (o.y - v.y) * (o.y - v.y);
      if (d < pd * (.5 + rnd())) { pd = d; pv = o; }
    }
    if (pv) for (let n = 0; n < 8; n++) {
      const u = pick(m);
      if (u && !u.dead && u.role === RL_WORKER && isAdult(u) && u.ca === 0 && u.st !== ST_WORK) {
        resetTask(u); u.role = RL_TRADER; setTask(u, TK_TRADE, pv.y * W + pv.x, pv.id);
        if (!goTask(u)) u.role = RL_WORKER;
        break;
      }
    }
  }
  // siege & towers
  let att = 0, attK = 0, def = 0, target = null;
  forUnitsNear(v.x + .5, v.y + .5, 7, (o, d2) => {
    const ko = KIND[o.kind];
    if (ko.monster) { if (!target) target = o; return; }
    if (!ko.civ || !o.kid) return;
    if (o.kid === v.kid) { if (o.role === RL_SOLDIER || o.role === RL_KING) def++; }
    else if (isWar(o.kid, v.kid) && isAdult(o)) { att++; attK = o.kid; target = o; }
  });
  if (target && v.has[B_TOWER]) {
    for (const id of v.bids) {
      const b = G.blds.get(id);
      if (b && b.built && b.type === B_TOWER && Math.hypot(b.x - target.x, b.y - target.y) < 8) { fxArrow(b.x + .5, b.y, target.x, target.y - .3, '#ffd'); damage(target, 26, null); if (target.dead) break; }
    }
  }
  if (att >= 2 && att > def * 2) { if (++v.siege >= 3) { captureVillage(v, attK); return; } } else v.siege = 0;
  v.underAttack = att > 0 ? 1 : 0;
  // level
  const lvl = villageLevel(v);
  if (lvl > v.lvl && lvl >= 2) logEvent('ev.grow', [v.name, '@vlvl.' + lvl], v.x, v.y, 'good');
  v.lvl = lvl;
}

/** Recount populations (run every few ticks). */
function census() {
  for (const v of G.villages.values()) { v.members.length = 0; v.adults = 0; v.soldiers = 0; }
  const cnt = new Array(KIND.length).fill(0);
  let civ = 0;
  for (const u of G.units) {
    if (u.dead) continue;
    cnt[u.kind]++;
    if (u.kind < 4) civ++;
    if (!u.vid) continue;
    const v = G.villages.get(u.vid); if (!v) continue;
    v.members.push(u);
    if (isAdult(u)) v.adults++;
    if (u.role === RL_SOLDIER) v.soldiers++;
  }
  for (const v of G.villages.values()) v.pop = v.members.length;
  G.count = cnt; G.civCount = civ;
  if (!G.caps || G.capsVer !== G.regionTick) {
    let land = 0; const terr = G.terr; for (let i = 0; i < terr.length; i++) if (WALK[terr[i]]) land++;
    G.caps = KIND.map(k => k.cap ? land / k.cap : 0); G.capsVer = G.regionTick;
  }
}

function updateKingdom(k) {
  const tick = G.tick;
  k.vids = k.vids.filter(id => G.villages.has(id));
  if (!k.vids.length) { removeKingdom(k); return; }
  if (!G.villages.has(k.cap)) k.cap = k.vids[0];
  let pop = 0, sold = 0;
  for (const id of k.vids) { const v = G.villages.get(id); pop += v.pop; sold += v.soldiers; }
  k.pop = pop; k.sold = sold; if (pop > k.peak) k.peak = pop;
  const cv = G.villages.get(k.cap);
  // ruler
  const king = G.unitById.get(k.kingId);
  if (!king || king.dead || king.kid !== k.id) {
    if (k.kingId && k.kingName) { logEvent('ev.kingdead', [k.kingName, k.name], cv.x, cv.y, 'bad'); k.unrest = tick + 900; }
    k.kingId = 0;
    let cand = null;
    for (const id of [k.cap, ...k.vids]) {
      const v = G.villages.get(id); if (!v) continue;
      for (const u of v.members) if (!u.dead && isAdult(u) && u.age < u.life * .75 && (!cand || u.kills > cand.kills || (u.hero && !cand.hero))) cand = u;
      if (cand) break;
    }
    if (cand) {
      cand.role = RL_KING; cand.vid = k.cap; resetTask(cand); cand.mhp = Math.round(cand.mhp * 1.5); cand.hp = cand.mhp;
      const first = !k.kingName;
      k.kingId = cand.id; k.kingName = cand.name;
      k.aggr = clamp(KIND[k.race].aggr + rr(-.25, .25), 0, 1);
      if (!first) logEvent('ev.crown', [cand.name, k.name], cv.x, cv.y, 'info');
    }
  } else if (king.vid !== k.cap) { king.vid = k.cap; resetTask(king); }
  // war operations
  let wc = 0; for (const id in k.war) wc++;
  k.warCount = wc;
  for (const id of k.vids) {
    const v = G.villages.get(id);
    if (v.atk) { const tv = G.villages.get(v.atk); if (!tv || tick > v.atkUntil || !isWar(k.id, tv.kid) || v.soldiers < 1) v.atk = 0; }
    if (wc && !v.atk && v.soldiers >= 3 && tick - v.lastAtk > 800) {
      let tv = null, td = 120 * 120;
      for (const o of G.villages.values()) {
        if (!k.war[o.kid]) continue;
        const d = (o.x - v.x) * (o.x - v.x) + (o.y - v.y) * (o.y - v.y);
        if (d < td) { td = d; tv = o; }
      }
      if (tv) { v.atk = tv.id; v.atkUntil = tick + 2800; v.lastAtk = tick; logEvent('ev.attack', [v.name, tv.name], tv.x, tv.y, 'war'); }
    }
  }
  // rebellion
  if (k.vids.length >= 3 && rnd() < .003 * (k.vids.length - 2) * (k.unrest > tick ? 4 : 1) * (wc ? 2 : 1)) {
    let rv = null, rd = 0;
    for (const id of k.vids) { const v = G.villages.get(id); if (id === k.cap || v.pop < 6) continue; const d = Math.hypot(v.x - cv.x, v.y - cv.y); if (d > rd) { rd = d; rv = v; } }
    if (rv) {
      const nk = createKingdom(rv.race, rv);
      k.vids = k.vids.filter(id => id !== rv.id); nk.vids.push(rv.id); rv.kid = nk.id; rv.atk = 0;
      for (const u of rv.members) u.kid = nk.id;
      logEvent('ev.rebel', [rv.name, nk.name, k.name], rv.x, rv.y, 'war');
      declareWar(nk.id, k.id, true);
      G.ownerDirty = true;
    }
  }
}

function diplomacy() {
  const ks = [...G.kingdoms.values()], tick = G.tick;
  // nearest-village distance cache
  const vs = [...G.villages.values()];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = ks[i], b = ks[j];
    if (!G.kingdoms.has(a.id) || !G.kingdoms.has(b.id)) continue;
    const r = getRel(a.id, b.id); if (!r) continue;
    let dist = 1e9;
    for (const va of vs) if (va.kid === a.id) for (const vb of vs) if (vb.kid === b.id) { const d = Math.abs(va.x - vb.x) + Math.abs(va.y - vb.y); if (d < dist) dist = d; }
    let target = RACE_AFF[a.race][b.race];
    if (dist < 34) target -= 22; else if (dist > 90) target += 8;
    if (r.trade) target += 20;
    target -= (a.aggr + b.aggr) * 18;
    let common = false; for (const id in a.war) if (b.war[id]) common = true;
    if (common) target += 28;
    if (a.pop > b.pop * 2.5 || b.pop > a.pop * 2.5) target -= 10;
    if (r.st === REL_ALLY) target += 15;
    r.op = clamp(r.op + (target - r.op) * .035 + rr(-3, 3), -100, 100);
    if (r.st === REL_PEACE) {
      const canWar = a.warCount < 2 && b.warCount < 2 && dist < 130 && tick - r.since > 1900 && a.pop >= 8 && b.pop >= 8;
      if (r.op < -38 && canWar && rnd() < .03 + (a.aggr + b.aggr) * .05) {
        const agg = (a.aggr * a.sold + rnd() * 3 > b.aggr * b.sold + rnd() * 3) ? a : b, def = agg === a ? b : a;
        declareWar(agg.id, def.id);
      } else if (r.op > 55 && tick - r.since > 900 && rnd() < .25) {
        setRel(a.id, b.id, REL_ALLY); logEvent('ev.ally', [a.name, b.name], -1, -1, 'good');
      }
      const hasM = k => k.vids.some(id => { const v = G.villages.get(id); return v && v.has[B_MARKET]; });
      if (!r.trade && r.op > 5 && dist < 110 && hasM(a) && hasM(b)) { r.trade = 1; logEvent('ev.trade', [a.name, b.name], -1, -1, 'good'); }
      else if (r.trade && r.op < -20) r.trade = 0;
    } else if (r.st === REL_ALLY) {
      if (r.op < 18) { setRel(a.id, b.id, REL_PEACE); logEvent('ev.allybreak', [a.name, b.name], -1, -1, 'info'); }
    } else { // war
      r.exh += .5;
      const dur = tick - r.since;
      if (dur > 1500 && (rnd() < .012 + r.exh * .0016 || a.pop < 4 || b.pop < 4)) makePeace(a.id, b.id);
    }
  }
}
