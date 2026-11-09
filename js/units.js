'use strict';
/* ===== Creatures: spawning, movement, AI ===== */
const PF_BUDGET = 40;

function spawnUnit(kind, x, y) {
  if (G.units.length >= G.maxUnits + 600) return null;
  const k = KIND[kind];
  x = clamp(x, .1, G.W - .1); y = clamp(y, .1, G.H - .1);
  const u = {
    id: G.nextId++, kind, x, y, hp: k.hp, mhp: k.hp, age: 0, life: rr(k.life[0], k.life[1]) * YEAR,
    dir: rnd() < .5 ? 1 : -1, st: ST_IDLE, role: RL_WORKER, vid: 0, kid: 0, tk: 0, tt: -1, tid: 0, cr: 0, ca: 0, wt: 0,
    next: G.tick + 1 + ri(20), path: null, mode: 0, name: k.civ ? unitName(kind) : '', sex: ri(2), kills: 0, kids: 0,
    hg: 0, sick: 0, imm: 0, hero: 0, bless: 0, guard: 0, rest: 0, nom: 0, hit: -99,
    ox: rr(-.28, .28), oy: rr(-.28, .28)
  };
  G.units.push(u); G.unitById.set(u.id, u);
  return u;
}
const isAdult = u => u.age >= (KIND[u.kind].mature || 1) * YEAR;
const udist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function resetTask(u) { u.tk = 0; u.tt = -1; u.tid = 0; u.st = ST_IDLE; u.path = null; u.wt = 0; }
function isWar(a, b) { const k = G.kingdoms.get(a); return !!(k && k.war[b]); }

function hostile(u, o) {
  if (u === o) return false;
  const ku = KIND[u.kind], ko = KIND[o.kind];
  if (ko.monster) return !ku.monster;
  if (ku.monster) return true;
  if (ku.civ) {
    if (ko.civ) return u.kid !== 0 && o.kid !== 0 && u.kid !== o.kid && isWar(u.kid, o.kid);
    if (ko.pred) return o.st === ST_FIGHT;
  }
  return false;
}
function findEnemy(u, r) {
  let best = null, bd = 1e9;
  forUnitsNear(u.x, u.y, r, (o, d2) => { if (d2 < bd && hostile(u, o)) { bd = d2; best = o; } });
  return best;
}

/* ----- Movement ----- */
function passable(t, mode) { return WALK[t] === 1 || (mode && WATER[t] === 1) || mode === 2; }
function moveTo(u, tx, ty) {
  const sx = u.x | 0, sy = u.y | 0;
  if (sx === tx && sy === ty) { u.path = null; return true; }
  if (!inb(tx, ty)) return false;
  if (PF.calls >= PF_BUDGET) return false;
  const W = G.W, rs = G.region[sy * W + sx], rt = G.region[ty * W + tx];
  let mode = 0;
  if (rs !== rt || !rs) { if (!KIND[u.kind].civ && rs) return false; mode = 1; }
  const p = findPath(sx, sy, tx, ty, mode);
  if (!p || !p.length) return false;
  u.path = p; u.mode = mode;
  return true;
}
function linePath(u, tx, ty) {
  const W = G.W, terr = G.terr;
  let x = u.x | 0, y = u.y | 0, n = 0;
  const ok = (a, b) => a >= 0 && b >= 0 && a < W && b < G.H && WALK[terr[b * W + a]] === 1;
  const pts = [];
  while ((x !== tx || y !== ty) && n++ < 26) {
    const sx = Math.sign(tx - x), sy = Math.sign(ty - y);
    let nx = x + sx, ny = y + sy;
    if (!ok(nx, ny) || (sx && sy && (!ok(nx, y) || !ok(x, ny)))) {
      if (sx && ok(nx, y)) ny = y; else if (sy && ok(x, ny)) nx = x; else break;
    }
    x = nx; y = ny; pts.push(y * W + x);
  }
  if (!pts.length) { u.path = null; return false; }
  pts.reverse(); u.path = pts; u.mode = 0;
  return true;
}
function wander(u, cx, cy, r) {
  for (let n = 0; n < 4; n++) {
    const tx = cx + ri(2 * r + 1) - r, ty = cy + ri(2 * r + 1) - r;
    if (!inb(tx, ty) || !WALK[G.terr[ty * G.W + tx]]) continue;
    if (linePath(u, tx, ty)) { u.st = ST_WANDER; return true; }
  }
  return false;
}
/** Force-move to the nearest walkable tile (used when terrain changed under a unit). */
function escapeTo(u) {
  const W = G.W, x = u.x | 0, y = u.y | 0;
  for (let r = 1; r <= 9; r++) for (let n = 0; n < r * 8; n++) {
    const a = n / (r * 8) * 6.283, nx = Math.round(x + Math.cos(a) * r), ny = Math.round(y + Math.sin(a) * r);
    if (inb(nx, ny) && WALK[G.terr[ny * W + nx]]) {
      if (r <= 2) { u.path = [ny * W + nx]; u.mode = 2; return true; }
      if (KIND[u.kind].civ || !G.region[y * W + x]) { const p = PF.calls < PF_BUDGET ? findPath(x, y, nx, ny, 1) : null; if (p && p.length) { u.path = p; u.mode = 1; return true; } }
      u.path = [ny * W + nx]; u.mode = 2; return true;
    }
  }
  return false;
}
function stepUnit(u, k) {
  const W = G.W, p = u.path, ni = p[p.length - 1];
  const nt = G.terr[ni];
  if (!passable(nt, u.mode)) { u.path = null; if (u.st !== ST_FIGHT && u.st !== ST_HUNT) u.st = ST_IDLE; u.next = Math.min(u.next, G.tick + 2); return; }
  const nx = (ni % W) + .5, ny = ((ni / W) | 0) + .5, dx = nx - u.x, dy = ny - u.y, d = Math.sqrt(dx * dx + dy * dy);
  const ct = G.terr[(u.y | 0) * W + (u.x | 0)];
  let sp = k.spd * (MOVE[ct] || .5);
  if (u.bless > 0) sp *= 1.3;
  if (u.age < (k.mature || 0) * YEAR) sp *= .8;
  if (dx > .02) u.dir = 1; else if (dx < -.02) u.dir = -1;
  if (d <= sp) {
    u.x = nx; u.y = ny; p.pop();
    if (!p.length) { u.path = null; onArrive(u); }
  } else { u.x += dx / d * sp; u.y += dy / d * sp; }
}

/* ----- Damage / death ----- */
function damage(u, amt, att) {
  if (u.dead) return;
  u.hp -= amt; u.hit = G.tick;
  if (u.hp <= 0) { kill(u, att); return; }
  if (att && !att.dead && u.st !== ST_FIGHT) {
    const k = KIND[u.kind];
    if (k.prey) { fleeFrom(u, att.x, att.y); }
    else if (isAdult(u)) { u.st = ST_FIGHT; u.tid = att.id; u.path = null; u.next = Math.min(u.next, G.tick + 2); }
  }
}
function fleeFrom(u, fx, fy) {
  const dx = u.x - fx, dy = u.y - fy, d = Math.hypot(dx, dy) || 1;
  linePath(u, clamp((u.x + dx / d * 6) | 0, 0, G.W - 1), clamp((u.y + dy / d * 6) | 0, 0, G.H - 1));
  u.st = ST_FLEE;
}
function kill(u, att) {
  if (u.dead) return;
  u.dead = true; u.hp = 0; G.deadCount = (G.deadCount || 0) + 1; G.stats.deaths++;
  fxBurst(u.x, u.y, 5, ['#ddd', '#aaa', '#fff'], .04, 18);
  if (att && !att.dead) {
    att.kills++;
    const ka = KIND[att.kind], ku = KIND[u.kind];
    if (ka.civ && att.tk === TK_HUNT && att.tid === u.id) { att.cr = R_FOOD; att.ca = ku.food || 3; att.tk = 0; att.st = ST_IDLE; att.next = G.tick + 1; }
    if (ka.pred) att.hg = 0;
    if (ka.civ && ku.civ && att.kid && u.kid && att.kid !== u.kid) { const r = getRel(att.kid, u.kid); if (r) r.exh += 1; }
    if (u.kind === K_DRAGON) logEvent('ev.dragonslain', [att.name || '@kind.' + ka.key], u.x | 0, u.y | 0, 'good');
  }
}

/* ----- Arrival / work ----- */
function onArrive(u) {
  switch (u.st) {
    case ST_GO: startWork(u); break;
    case ST_RETURN: u.next = G.tick + 1; break;
    case ST_HUNT: case ST_FIGHT: u.next = G.tick; break;
    default: u.st = ST_IDLE;
  }
}
const WORK_TIME = [0, 50, 60, 70, 80, 30, 40, 70, 0, 30, 1, 1];
function startWork(u) {
  const W = G.W;
  if (u.tt >= 0) {
    const tx = u.tt % W, ty = (u.tt / W) | 0;
    if (Math.abs((u.x | 0) - tx) > 1 || Math.abs((u.y | 0) - ty) > 1) { // partial path → continue
      if (!moveTo(u, tx, ty)) { u.st = ST_IDLE; u.tk = 0; }
      return;
    }
  }
  if (u.tk === TK_SETTLE) { doSettle(u); return; }
  if (u.tk === TK_TRADE) { doTrade(u); return; }
  if (u.tk === TK_BUILD) { const b = G.blds.get(u.tid); if (!b || b.built) { resetTask(u); return; } }
  u.st = ST_WORK; u.wt = WORK_TIME[u.tk] || 30;
}
function finishWork(u) {
  const W = G.W, i = u.tt, k = KIND[u.kind];
  const v = G.villages.get(u.vid);
  let res = -1, amt = 0;
  if (i < 0) { resetTask(u); return; }
  const x = i % W, y = (i / W) | 0, t = G.terr[i], f = G.feat[i];
  switch (u.tk) {
    case TK_BUILD: {
      const b = G.blds.get(u.tid);
      if (b && !b.built) {
        b.prog += 34; b.hp = Math.min(b.mhp, b.hp + b.mhp * .25);
        if (b.prog >= 100) { b.built = true; b.hp = b.mhp; if (v) recountVillage(v); fxBurst(b.x + .5, b.y + .5, 6, ['#fff', '#fe8'], .05, 20); }
        else { u.wt = WORK_TIME[TK_BUILD]; return; }
      }
      resetTask(u); u.next = G.tick + 1; return;
    }
    case TK_CHOP:
      if (t === T_FOREST || t === T_TAIGA) {
        res = R_WOOD; amt = 5;
        if (u.kind !== K_ELF || rnd() < .5) { if (G.amt[i] > 1) G.amt[i]--; else setTerr(x, y, t === T_TAIGA ? T_SNOW : T_GRASS); }
      } break;
    case TK_STONE:
      if (f === F_STONE) { res = R_STONE; amt = u.kind === K_DWARF ? 6 : 4; if (--G.amt[i] <= 0) setFeat(x, y, 0, 0); }
      else if (t === T_HILL) { res = R_STONE; amt = u.kind === K_DWARF ? 4 : 2; }
      break;
    case TK_ORE: if (f === F_ORE) { res = R_ORE; amt = u.kind === K_DWARF ? 5 : 3; if (--G.amt[i] <= 0) setFeat(x, y, 0, 0); } break;
    case TK_GOLD: if (f === F_GOLD) { res = R_GOLD; amt = u.kind === K_DWARF ? 3 : 2; if (--G.amt[i] <= 0) setFeat(x, y, 0, 0); } break;
    case TK_BERRY: if (f === F_BERRY && G.amt[i] > 0) { res = R_FOOD; amt = u.kind === K_ELF ? 7 : 5; G.amt[i] = 0; markDirty(i); } break;
    case TK_FARM: { const b = G.blds.get(u.tid); if (b && b.grow >= 100) { b.grow = 0; res = R_FOOD; amt = Math.round(10 * Math.max(.6, FERT[t])); } break; }
    case TK_FISH: res = R_FOOD; amt = u.kind === K_HUMAN ? 5 : 4; break;
  }
  u.tk = 0; u.tt = -1; u.tid = 0; u.st = ST_IDLE; u.next = G.tick + 1;
  if (res >= 0) { u.cr = res; u.ca = amt; }
}
function deposit(u, v) {
  if (u.ca > 0) { v.stock[u.cr] += u.ca; u.ca = 0; }
  if (u.role === RL_TRADER) u.role = RL_WORKER;
  u.st = ST_IDLE;
}

/* ----- Thinking ----- */
function think(u) {
  const k = KIND[u.kind], tick = G.tick, W = G.W;
  u.next = tick + 10 + ri(6);
  if (u.age > u.life) { kill(u, null); return; }
  const ti = (u.y | 0) * W + (u.x | 0), t = G.terr[ti];
  if (!k.fly) {
    if (G.fire[ti]) { damage(u, 9, null); if (u.dead) return; if (!u.path) wander(u, u.x | 0, u.y | 0, 3); }
    if (t === T_LAVA) { damage(u, 45, null); if (u.dead) return; }
    if (t === T_MOUNT || t === T_PEAK || t === T_LAVA) { if (!u.path) escapeTo(u); return; }
    if (WATER[t] && !k.civ) {
      damage(u, k.hp * .1 + 1, null); if (u.dead) return;
      if (!u.path) escapeTo(u);
      return;
    }
  }
  if (u.sick > 0) {
    u.sick -= 12; damage(u, 1.2, null); if (u.dead) return;
    if (u.sick <= 0) { u.sick = 0; u.imm = 1; }
    else if (rnd() < .07) forUnitsNear(u.x, u.y, 1.6, o => { if (!o.sick && !o.imm && !KIND[o.kind].monster && rnd() < .5) o.sick = 700; });
  } else if (u.hp < u.mhp && u.st !== ST_FIGHT) u.hp = Math.min(u.mhp, u.hp + (u.bless > 0 ? 5 : 1));
  if (u.bless > 0) u.bless -= 12;
  if (k.civ) thinkCiv(u, k, t);
  else if (k.animal) thinkAnimal(u, k);
  else if (u.kind === K_DRAGON) thinkDragon(u, k);
  else { // skeletons and other walking monsters
    const en = findEnemy(u, 8);
    if (en) fight(u, en, k, udist(u, en));
    else { u.st = ST_IDLE; if (!u.path) wander(u, u.x | 0, u.y | 0, 6); u.next = tick + 20 + ri(20); }
  }
}

function fight(u, en, k, d) {
  u.st = ST_FIGHT; u.tid = en.id;
  const range = k.range + (en.kind === K_DRAGON ? 1.6 : 0);
  if (d <= range) {
    u.path = null;
    let dmg = k.dmg * (.7 + rnd() * .6);
    if (u.hero) dmg *= 2;
    if (u.role === RL_SOLDIER || u.role === RL_KING) { dmg *= 1.35; const v = G.villages.get(u.vid); if (v && v.has[B_SMITHY]) dmg *= 1.25; }
    if (u.bless > 0) dmg *= 1.2;
    if (en.x > u.x) u.dir = 1; else u.dir = -1;
    if (k.range > 2) fxArrow(u.x, u.y - .3, en.x, en.y - .3, '#f4f0d0');
    else fxPart(en.x, en.y - .3, rr(-.03, .03), -.03, 8, '#fff', 1);
    damage(en, dmg, u);
    u.next = G.tick + 13 + ri(5);
  } else {
    if (!u.path || rnd() < .4) { if (!moveTo(u, en.x | 0, en.y | 0)) linePath(u, en.x | 0, en.y | 0); }
    u.st = ST_FIGHT;
    u.next = G.tick + 7;
  }
}

function thinkCiv(u, k, t) {
  const tick = G.tick, W = G.W;
  let v = u.vid ? G.villages.get(u.vid) : null;
  if (u.vid && !v) { u.vid = 0; u.role = RL_WORKER; resetTask(u); }
  if (v && u.kid !== v.kid) u.kid = v.kid;
  if (u.kid && !G.kingdoms.has(u.kid)) u.kid = 0;
  if (!isAdult(u)) {
    if (WATER[t] && !u.path) { if (v) moveTo(u, v.x, v.y); else escapeTo(u); }
    else if (!u.path) { if (v) wander(u, v.x, v.y, 3); else wander(u, u.x | 0, u.y | 0, 3); }
    u.next = tick + 30 + ri(50);
    return;
  }
  const soldier = u.role === RL_SOLDIER || u.role === RL_KING || u.hero;
  // civilians only look for enemies when there is something to fear (keeps big cities cheap)
  const kd = u.kid ? G.kingdoms.get(u.kid) : null;
  const en = (soldier || !v || (kd && kd.warCount) || (G.count && (G.count[K_SKEL] || G.count[K_DRAGON])) || u.st === ST_FIGHT) ? findEnemy(u, soldier ? 7 : 4) : null;
  if (en) {
    const d = udist(u, en);
    if (soldier || d < 2.2 || !v || k.range > 2) { fight(u, en, k, d); return; }
    if (u.st !== ST_FLEE || !u.path) { u.st = ST_FLEE; if (!moveTo(u, v.x, v.y)) fleeFrom(u, en.x, en.y); }
    return;
  }
  if (u.st === ST_FIGHT || u.st === ST_FLEE) { u.st = ST_IDLE; u.tid = 0; if (u.tk === TK_HUNT) u.tk = 0; }
  if (u.st === ST_HUNT) { huntStep(u, k); return; }
  if (WATER[t] && !u.path) { if (!(v && moveTo(u, v.x, v.y))) escapeTo(u); if (u.path) return; }
  if (u.path || u.st === ST_WORK) return;
  if (u.st === ST_GO) { // lost path while travelling to a job
    if (u.tt >= 0 && moveTo(u, u.tt % W, (u.tt / W) | 0)) return;
    resetTask(u);
  }
  if (!v) { nomadThink(u, k); return; }
  if (u.ca > 0 || u.st === ST_RETURN) {
    if (Math.abs(u.x - v.x - .5) < 1.6 && Math.abs(u.y - v.y - .5) < 1.6) { deposit(u, v); }
    else { u.st = ST_RETURN; if (!moveTo(u, v.x, v.y)) u.next = tick + 4 + ri(6); return; }
  }
  switch (u.role) {
    case RL_KING:
      if (Math.abs(u.x - v.x) + Math.abs(u.y - v.y) > 8) moveTo(u, v.x, v.y); else wander(u, v.x, v.y, 2);
      u.st = ST_WANDER; u.next = tick + 25 + ri(30); break;
    case RL_SOLDIER: soldierThink(u, v); break;
    case RL_SETTLER: case RL_TRADER: u.role = RL_WORKER; // task was lost → back to work
    // fallthrough
    default: workerThink(u, v, k);
  }
}

function soldierThink(u, v) {
  if (v.atk && !u.guard) {
    const tv = G.villages.get(v.atk);
    if (tv && isWar(v.kid, tv.kid)) {
      const d = Math.hypot(u.x - tv.x - .5, u.y - tv.y - .5);
      if (d > 3.5) { if (!moveTo(u, tv.x, tv.y)) u.next = G.tick + 5 + ri(8); else u.st = ST_WANDER; }
      else wander(u, tv.x, tv.y, 3);
      return;
    }
  }
  const d = Math.abs(u.x - v.x) + Math.abs(u.y - v.y);
  if (d > v.radius + 6) { if (moveTo(u, v.x, v.y)) u.st = ST_WANDER; }
  else wander(u, v.x, v.y, Math.min(v.radius, 7));
  u.next = G.tick + 14 + ri(10);
}

function setTask(u, tk, tt, tid) { u.tk = tk; u.tt = tt; u.tid = tid || 0; }
function goTask(u) {
  const W = G.W, tx = u.tt % W, ty = (u.tt / W) | 0;
  if ((u.x | 0) === tx && (u.y | 0) === ty) { u.st = ST_GO; startWork(u); return true; }
  if (moveTo(u, tx, ty)) { u.st = ST_GO; return true; }
  u.tk = 0; u.tt = -1; u.tid = 0; return false;
}

function workerThink(u, v, k) {
  const s = v.stock, pop = v.pop, W = G.W;
  if (v.sites > 0 && rnd() < .7) {
    for (let n = v.bids.length - 1; n >= 0; n--) {
      const b = G.blds.get(v.bids[n]);
      if (b && !b.built && !G.fire[b.y * W + b.x]) { setTask(u, TK_BUILD, b.y * W + b.x, b.id); if (goTask(u)) return; break; }
    }
  }
  const fNeed = pop * 6 + 12;
  let wF = s[0] < fNeed ? 3.2 * (1 - s[0] / fNeed) + .35 : .15;
  let wW = s[1] < 10 ? 2 : s[1] < 30 + pop * 1.5 ? 1 : .1;
  let wS = pop >= 7 ? (s[2] < 25 + pop ? .8 : .06) : .08;
  let wO = pop >= 16 ? (s[3] < 15 ? .4 : .03) : 0;
  let wG = pop >= 12 ? (s[4] < 40 ? .22 : .03) : 0;
  if (u.kind === K_DWARF) { wS *= 1.6; wO *= 2; wG *= 2; }
  // full storehouses: nothing more to gather
  const lim = 150 + pop * 12;
  if (s[0] > lim * 2) wF = 0; if (s[1] > lim) wW = 0; if (s[2] > lim) wS = 0; if (s[3] > lim * .5) wO = 0; if (s[4] > lim) wG = 0;
  if (wF + wW + wS + wO + wG <= 0) { wander(u, v.x, v.y, Math.min(v.radius, 6)); u.next = G.tick + 40 + ri(60); return; }
  let r = rnd() * (wF + wW + wS + wO + wG), res;
  if ((r -= wF) < 0) res = R_FOOD; else if ((r -= wW) < 0) res = R_WOOD; else if ((r -= wS) < 0) res = R_STONE; else if ((r -= wO) < 0) res = R_ORE; else res = R_GOLD;
  if (findTask(u, v, res, 1) || findTask(u, v, res, 2.4) || (res === R_WOOD && findTask(u, v, res, 4.5))) return;
  if (res !== R_FOOD && findTask(u, v, R_FOOD, 1)) return;
  wander(u, v.x, v.y, Math.min(v.radius, 6));
  u.next = G.tick + 20 + ri(30);
}

function findTask(u, v, res, scale) {
  const W = G.W, R = Math.round((v.radius + 7) * scale), ureg = G.region[(u.y | 0) * W + (u.x | 0)];
  let best = -1, bd = 1e9, bk = 0, bid = 0;
  if (res === R_FOOD) {
    const fs = v.farmIds;
    if (fs) for (let n = 0; n < fs.length; n++) {
      const b = G.blds.get(fs[n]);
      if (b && b.built && b.grow >= 100 && b.res < G.tick) {
        const d = (b.x - u.x) * (b.x - u.x) + (b.y - u.y) * (b.y - u.y);
        if (d < bd) { bd = d; best = b.y * W + b.x; bk = TK_FARM; bid = b.id; }
      }
    }
    if (best >= 0) { const b = G.blds.get(bid); b.res = G.tick + 500; setTask(u, TK_FARM, best, bid); if (goTask(u)) return true; b.res = 0; return false; }
    if (rnd() < .25) { // hunt
      let prey = null, pd = 100;
      forUnitsNear(u.x, u.y, 9, (o, d2) => { if (KIND[o.kind].prey && d2 < pd) { pd = d2; prey = o; } });
      if (prey) { u.tk = TK_HUNT; u.tid = prey.id; u.st = ST_HUNT; u.wt = 0; u.next = G.tick + 1; return true; }
    }
  }
  const sp = v.spot ? v.spot[res] : -1;
  for (let n = 0; n < 30; n++) {
    let x, y;
    if (sp >= 0 && n < 14) { x = (sp % W) + ri(9) - 4; y = ((sp / W) | 0) + ri(9) - 4; }
    else { x = v.x + ri(2 * R + 1) - R; y = v.y + ri(2 * R + 1) - R; }
    if (!inb(x, y)) continue;
    const i = y * W + x, t = G.terr[i], f = G.feat[i];
    let tk = 0, si = i;
    if (res === R_FOOD) {
      if (f === F_BERRY && G.amt[i] > 0) tk = TK_BERRY;
      else if (t === T_SHALLOW || t === T_OCEAN) {
        for (let d = 0; d < 4; d++) { const nx = x + DX8[d], ny = y + DY8[d]; if (inb(nx, ny) && WALK[G.terr[ny * W + nx]]) { si = ny * W + nx; tk = TK_FISH; break; } }
      }
    } else if (res === R_WOOD) { if (t === T_FOREST || t === T_TAIGA) tk = TK_CHOP; }
    else if (res === R_STONE) { if (f === F_STONE) tk = TK_STONE; else if (t === T_HILL && !f && n > 12 && !G.bldAt[i]) tk = TK_STONE; }
    else if (res === R_ORE) { if (f === F_ORE) tk = TK_ORE; }
    else if (f === F_GOLD) tk = TK_GOLD;
    if (!tk || G.region[si] !== ureg || G.fire[si]) continue;
    const o = G.owner[si];
    if (o && o !== v.id) { const ov = G.villages.get(o); if (ov && ov.kid !== v.kid) continue; }
    const dx = x - v.x, dy = y - v.y, d = dx * dx + dy * dy + rnd() * 20 + (tk === TK_FISH ? 30 : 0);
    if (d < bd) { bd = d; best = si; bk = tk; }
  }
  if (best < 0) { if (sp >= 0 && scale > 2) v.spot[res] = -1; return false; }
  if (!v.spot) v.spot = [-1, -1, -1, -1, -1];
  if (bk !== TK_FISH || sp < 0) v.spot[res] = best;
  setTask(u, bk, best, 0);
  return goTask(u);
}

function huntStep(u, k) {
  const prey = G.unitById.get(u.tid);
  u.wt++;
  if (!prey || prey.dead || u.wt > 40 || udist(u, prey) > 16) { resetTask(u); return; }
  const d = udist(u, prey);
  if (d <= Math.max(1.4, k.range)) {
    u.path = null;
    if (k.range > 2) fxArrow(u.x, u.y - .3, prey.x, prey.y - .2, '#f4f0d0');
    u.dir = prey.x > u.x ? 1 : -1;
    damage(prey, k.dmg * 1.6, u);
    u.next = G.tick + 10;
  } else {
    if (!linePath(u, prey.x | 0, prey.y | 0)) moveTo(u, prey.x | 0, prey.y | 0);
    u.st = ST_HUNT; u.next = G.tick + 6;
  }
}

function canFoundAt(x, y, race, loose) {
  if (!inb(x, y) || x < 3 || y < 3 || x > G.W - 4 || y > G.H - 4) return false;
  const i = y * G.W + x;
  if (!BUILDOK[G.terr[i]] || G.bldAt[i] || G.owner[i]) return false;
  for (const v of G.villages.values()) if (Math.abs(v.x - x) < 13 && Math.abs(v.y - y) < 13) return false;
  return habitatScore(x, y, race) > (loose ? 3 : 10);
}
function nomadThink(u, k) {
  let bv = null, bd = 16 * 16;
  for (const v of G.villages.values()) {
    if (v.race !== u.kind || v.pop >= 50) continue;
    if (u.kid && u.kid !== v.kid) continue;
    const dx = v.x - u.x, dy = v.y - u.y, d = dx * dx + dy * dy;
    if (d < bd && G.region[v.y * G.W + v.x] === G.region[(u.y | 0) * G.W + (u.x | 0)]) { bd = d; bv = v; }
  }
  if (bv) { u.vid = bv.id; u.kid = bv.kid; u.nom = 0; resetTask(u); return; }
  u.nom++;
  const x = u.x | 0, y = u.y | 0;
  if (u.nom > 3 && canFoundAt(x, y, u.kind, u.nom > 30)) { foundVillage(x, y, u.kind, u.kid, u, false); u.nom = 0; return; }
  wander(u, x, y, 7);
  u.next = G.tick + 25 + ri(25);
}

/* ----- Animals ----- */
function thinkAnimal(u, k) {
  const tick = G.tick;
  u.next = tick + 24 + ri(30);
  const cnt = G.count ? G.count[u.kind] : 0, cap = G.caps ? G.caps[u.kind] : 50;
  if (k.prey) {
    let th = null;
    forUnitsNear(u.x, u.y, 3.5, o => { const ko = KIND[o.kind]; if (ko.pred || ko.monster || (o.tk === TK_HUNT && o.tid === u.id)) th = o; });
    if (th) { fleeFrom(u, th.x, th.y); u.next = tick + 12; return; }
    if (u.age > 1.5 * YEAR && cnt < cap && rnd() < (u.kind === K_RABBIT ? .05 : .035)) {
      let near = 0; forUnitsNear(u.x, u.y, 5, o => { if (o.kind === u.kind) near++; });
      if (near < 7) spawnUnit(u.kind, u.x, u.y);
    }
    if (!u.path && rnd() < .6) wander(u, u.x | 0, u.y | 0, 4);
    return;
  }
  u.hg++;
  if (u.st === ST_FIGHT) {
    const o = G.unitById.get(u.tid);
    if (o && !o.dead && udist(u, o) < 11) {
      const d = udist(u, o);
      if (d <= k.range) { u.path = null; u.dir = o.x > u.x ? 1 : -1; fxPart(o.x, o.y - .3, 0, -.03, 8, '#fff', 1); damage(o, k.dmg * rr(.7, 1.3), u); u.next = tick + 14; }
      else { if (!linePath(u, o.x | 0, o.y | 0)) moveTo(u, o.x | 0, o.y | 0); u.st = ST_FIGHT; u.next = tick + 7; }
      return;
    }
    u.st = ST_IDLE; u.tid = 0;
  }
  if (u.hg > 10) {
    let prey = null, pd = 1e9;
    const wantCiv = u.hg > 35 || (u.kind === K_BEAR && rnd() < .2);
    forUnitsNear(u.x, u.y, 12, (o, d2) => { const ko = KIND[o.kind]; if ((ko.prey || (wantCiv && ko.civ)) && d2 < pd) { pd = d2; prey = o; } });
    if (prey) { u.st = ST_FIGHT; u.tid = prey.id; u.next = tick + 2; return; }
  }
  if (u.hg > 150) { damage(u, 8, null); if (u.dead) return; }
  if (u.hg < 70 && u.age > 3 * YEAR && cnt < cap && rnd() < .045) spawnUnit(u.kind, u.x, u.y);
  if (!u.path) wander(u, u.x | 0, u.y | 0, 6);
}

/* ----- Dragon ----- */
function thinkDragon(u, k) {
  const W = G.W, tick = G.tick;
  u.next = tick + 8;
  if (u.rest > 0) { u.rest -= 8; return; }
  if (u.tt < 0) {
    const vs = [...G.villages.values()];
    if (u.wt >= 3 || !vs.length) { // retreat & rest
      u.wt = 0; u.tk = 1;
      u.tt = ri(G.H) * W + ri(W);
    } else { const v = pick(vs); u.tk = 0; u.tt = clamp(v.y + ri(7) - 3, 0, G.H - 1) * W + clamp(v.x + ri(7) - 3, 0, W - 1); }
  }
  const tx = (u.tt % W) + .5, ty = ((u.tt / W) | 0) + .5;
  if (Math.hypot(tx - u.x, ty - u.y) < 1.5) {
    if (u.tk === 1) { u.rest = 500 + ri(900); u.tt = -1; return; }
    for (let n = 0; n < 5; n++) ignite((tx | 0) + ri(5) - 2, (ty | 0) + ri(5) - 2, true);
    forUnitsNear(tx, ty, 2.6, o => { if (o !== u) damage(o, k.dmg * rr(.5, 1), u); });
    fxBurst(tx, ty, 24, ['#fa3', '#f62', '#fe6'], .12, 24);
    u.wt++; u.tt = -1; u.next = tick + 40;
  }
}
function flyStep(u, k) {
  if (u.tt < 0 || u.rest > 0) return;
  const W = G.W, tx = (u.tt % W) + .5, ty = ((u.tt / W) | 0) + .5, dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d < .2) return;
  u.x += dx / d * k.spd; u.y += dy / d * k.spd;
  if (dx > .02) u.dir = 1; else if (dx < -.02) u.dir = -1;
}

function tickUnits() {
  const us = G.units, tick = G.tick;
  for (let i = 0, n = us.length; i < n; i++) {
    const u = us[i];
    if (u.dead) continue;
    u.age++;
    const k = KIND[u.kind];
    if (k.fly) flyStep(u, k);
    else if (u.path) stepUnit(u, k);
    else if (u.st === ST_WORK) { if (--u.wt <= 0) finishWork(u); }
    if (tick >= u.next && !u.dead) think(u);
  }
  if (G.deadCount) {
    let w = 0;
    for (let i = 0; i < us.length; i++) { const u = us[i]; if (u.dead) G.unitById.delete(u.id); else us[w++] = u; }
    us.length = w; G.deadCount = 0;
  }
}
