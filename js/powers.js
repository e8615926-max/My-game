'use strict';
/* ===== God powers ===== */
function brushTiles(cx, cy, r, fn) {
  const r2 = r * r + r * .8;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r2) continue;
    const x = cx + dx, y = cy + dy;
    if (inb(x, y)) fn(x, y, y * G.W + x);
  }
}
function paintTerr(t) { return (x, y, r) => brushTiles(x, y, r, (tx, ty) => setTerr(tx, ty, t)); }
function spawnPower(kind) {
  return (x, y) => {
    const t = G.terr[y * G.W + x], k = KIND[kind];
    if (!k.fly && !WALK[t] && !(k.civ && WATER[t])) return 't.landonly';
    if (G.units.length >= G.maxUnits + 500) return 't.limit';
    const u = spawnUnit(kind, x + .5 + rr(-.3, .3), y + .5 + rr(-.3, .3));
    if (!u) return 't.limit';
    u.age = k.civ ? (k.mature + rr(1, 12)) * YEAR : rr(1, k.life[0] * .4) * YEAR;
    fxBurst(u.x, u.y, 6, ['#fff', '#fe9', '#9df'], .05, 18);
  };
}
function featPower(f, amt) {
  return (x, y, r) => {
    let placed = 0;
    brushTiles(x, y, r, (tx, ty, i) => {
      const t = G.terr[i];
      if (!WALK[t] || t === T_FOREST || t === T_TAIGA || G.bldAt[i] || G.feat[i]) return;
      if (f === F_BERRY && t !== T_GRASS) return;
      if ((tx === x && ty === y) || rnd() < .12) { setFeat(tx, ty, f, amt); placed++; }
    });
    if (placed) fxBurst(x + .5, y + .5, 5, ['#fff', '#fe9'], .05, 16);
  };
}
function kingdomAt(x, y) {
  const o = G.owner[y * G.W + x]; if (!o) return null;
  const v = G.villages.get(o); return v ? G.kingdoms.get(v.kid) : null;
}
const POWERS = [
  // terrain
  { id: 'erase', cat: 'terrain', icon: '🕳️', type: 'paint', desc: 'd.erase', fn: paintTerr(T_DEEP) },
  { id: 'water', cat: 'terrain', icon: '🌊', type: 'paint', fn: paintTerr(T_OCEAN) },
  { id: 'shallow', cat: 'terrain', icon: '💧', type: 'paint', fn: paintTerr(T_SHALLOW) },
  { id: 'sand', cat: 'terrain', icon: '🏖️', type: 'paint', fn: paintTerr(T_SAND) },
  { id: 'grass', cat: 'terrain', icon: '🌿', type: 'paint', fn: paintTerr(T_GRASS) },
  { id: 'forest', cat: 'terrain', icon: '🌳', type: 'paint', fn: paintTerr(T_FOREST) },
  { id: 'desert', cat: 'terrain', icon: '🏜️', type: 'paint', fn: paintTerr(T_DESERT) },
  { id: 'snow', cat: 'terrain', icon: '❄️', type: 'paint', fn: paintTerr(T_SNOW) },
  { id: 'taiga', cat: 'terrain', icon: '🌲', type: 'paint', fn: paintTerr(T_TAIGA) },
  { id: 'hill', cat: 'terrain', icon: '⛰️', type: 'paint', fn: paintTerr(T_HILL) },
  { id: 'mount', cat: 'terrain', icon: '🏔️', type: 'paint', fn: paintTerr(T_MOUNT) },
  { id: 'peak', cat: 'terrain', icon: '🗻', type: 'paint', fn: paintTerr(T_PEAK) },
  // nature
  { id: 'rain', cat: 'nature', icon: '🌧️', type: 'spray', gap: 1, hold: 1, desc: 'd.rain', fn: (x, y, r) => { addRain(x, y, r + 2, 100, false); } },
  { id: 'seeds', cat: 'nature', icon: '🌱', type: 'paint', desc: 'd.seeds', fn: (x, y, r) => brushTiles(x, y, r, (tx, ty, i) => { const t = G.terr[i]; if (G.bldAt[i] || rnd() > .55) return; if (t === T_GRASS || t === T_ASH) setTerr(tx, ty, T_FOREST); else if (t === T_SNOW) setTerr(tx, ty, T_TAIGA); }) },
  { id: 'bloom', cat: 'nature', icon: '🌼', type: 'paint', desc: 'd.bloom', fn: (x, y, r) => brushTiles(x, y, r, (tx, ty, i) => { const t = G.terr[i]; if (t === T_DESERT || t === T_ASH || t === T_SAND || t === T_SNOW) setTerr(tx, ty, T_GRASS, true); else if (t === T_LAVA) setTerr(tx, ty, T_HILL); }) },
  { id: 'berry', cat: 'nature', icon: '🍓', type: 'spray', gap: 1.5, fn: featPower(F_BERRY, 3) },
  { id: 'stone', cat: 'nature', icon: '🪨', type: 'spray', gap: 1.5, fn: featPower(F_STONE, 30) },
  { id: 'ore', cat: 'nature', icon: '⛏️', type: 'spray', gap: 1.5, fn: featPower(F_ORE, 20) },
  { id: 'gold', cat: 'nature', icon: '🪙', type: 'spray', gap: 1.5, fn: featPower(F_GOLD, 12) },
  // creatures
  { id: 'human', cat: 'life', icon: '🧑', type: 'spray', gap: 1.3, nobrush: 1, desc: 'd.spawn', fn: spawnPower(K_HUMAN) },
  { id: 'elf', cat: 'life', icon: '🧝', type: 'spray', gap: 1.3, nobrush: 1, desc: 'd.spawn', fn: spawnPower(K_ELF) },
  { id: 'orc', cat: 'life', icon: '👹', type: 'spray', gap: 1.3, nobrush: 1, desc: 'd.spawn', fn: spawnPower(K_ORC) },
  { id: 'dwarf', cat: 'life', icon: '🧔', type: 'spray', gap: 1.3, nobrush: 1, desc: 'd.spawn', fn: spawnPower(K_DWARF) },
  { id: 'sheep', cat: 'life', icon: '🐑', type: 'spray', gap: 1.3, nobrush: 1, desc: 'd.spawn', fn: spawnPower(K_SHEEP) },
  { id: 'rabbit', cat: 'life', icon: '🐇', type: 'spray', gap: 1.3, nobrush: 1, desc: 'd.spawn', fn: spawnPower(K_RABBIT) },
  { id: 'wolf', cat: 'life', icon: '🐺', type: 'spray', gap: 1.6, nobrush: 1, desc: 'd.spawn', fn: spawnPower(K_WOLF) },
  { id: 'bear', cat: 'life', icon: '🐻', type: 'spray', gap: 2, nobrush: 1, desc: 'd.spawn', fn: spawnPower(K_BEAR) },
  { id: 'skeleton', cat: 'life', icon: '💀', type: 'spray', gap: 1.6, nobrush: 1, desc: 'd.spawn', fn: spawnPower(K_SKEL) },
  { id: 'dragon', cat: 'life', icon: '🐉', type: 'tap', nobrush: 1, desc: 'd.tap', fn: spawnPower(K_DRAGON) },
  // disasters
  { id: 'lightning', cat: 'disaster', icon: '⚡', type: 'spray', gap: 2, nobrush: 1, desc: 'd.tap', fn: (x, y) => strikeLightning(x, y) },
  { id: 'fire', cat: 'disaster', icon: '🔥', type: 'paint', fn: (x, y, r) => brushTiles(x, y, r, (tx, ty) => ignite(tx, ty, true)) },
  { id: 'storm', cat: 'disaster', icon: '⛈️', type: 'tap', desc: 'd.tap', fn: (x, y, r) => { addRain(x, y, r + 6, 900, true); } },
  { id: 'meteor', cat: 'disaster', icon: '☄️', type: 'tap', nobrush: 1, desc: 'd.tap', fn: (x, y) => dropMeteor(x, y) },
  { id: 'shower', cat: 'disaster', icon: '🌠', type: 'tap', nobrush: 1, desc: 'd.tap', fn: (x, y) => { for (let n = 0; n < 10; n++) { const a = rnd() * 6.283, d = rr(0, 13); const mx = Math.round(x + Math.cos(a) * d), my = Math.round(y + Math.sin(a) * d); if (inb(mx, my)) { const dl = 30 + n * 16 + ri(12); G.meteors.push({ x: mx, y: my, t: dl, max: dl, r: 1 + ri(3) }); } } } },
  { id: 'quake', cat: 'disaster', icon: '💢', type: 'tap', desc: 'd.tap', fn: (x, y, r) => earthquake(x, y, 6 + r * 2) },
  { id: 'tornado', cat: 'disaster', icon: '🌪️', type: 'tap', nobrush: 1, desc: 'd.tap', fn: (x, y) => spawnTornado(x, y) },
  { id: 'volcano', cat: 'disaster', icon: '🌋', type: 'tap', nobrush: 1, desc: 'd.tap', fn: (x, y) => { if (WATER[G.terr[y * G.W + x]]) return 't.landonly'; startVolcano(x, y); } },
  { id: 'bomb', cat: 'disaster', icon: '💣', type: 'tap', desc: 'd.tap', fn: (x, y, r) => explode(x, y, Math.max(2, r + 1), 220, false) },
  { id: 'lava', cat: 'disaster', icon: '♨️', type: 'paint', fn: (x, y, r) => brushTiles(x, y, r, (tx, ty, i) => { setTerr(tx, ty, T_LAVA); G.amt[i] = 3; }) },
  { id: 'plague', cat: 'disaster', icon: '🦠', type: 'paint', desc: 'd.plague', fn: (x, y, r) => forUnitsNear(x + .5, y + .5, r + 1, u => { if (!KIND[u.kind].monster && !u.sick) { u.sick = 700; u.imm = 0; } }) },
  // miracles
  { id: 'bless', cat: 'divine', icon: '✨', type: 'paint', desc: 'd.bless', fn: (x, y, r) => { forUnitsNear(x + .5, y + .5, r + 1, u => { u.hp = u.mhp; u.sick = 0; u.bless = 900; }); if (rnd() < .5) fxBurst(x + .5, y + .5, 4, ['#fff7b0', '#fff'], .08, 22); } },
  { id: 'reaper', cat: 'divine', icon: '☠️', type: 'paint', desc: 'd.reaper', fn: (x, y, r) => forUnitsNear(x + .5, y + .5, r + .8, u => kill(u, null)) },
  { id: 'demolish', cat: 'divine', icon: '🔨', type: 'paint', desc: 'd.demolish', fn: (x, y, r) => brushTiles(x, y, r, (tx, ty, i) => { const b = G.blds.get(G.bldAt[i]); if (b) destroyBuilding(b); }) },
  { id: 'gift', cat: 'divine', icon: '🎁', type: 'tap', nobrush: 1, desc: 'd.gift', fn: (x, y) => {
    const v = G.villages.get(G.owner[y * G.W + x]); if (!v) return 't.novillage';
    v.stock[0] += 80; v.stock[1] += 50; v.stock[2] += 35; v.stock[3] += 10; v.stock[4] += 12;
    fxBurst(v.x + .5, v.y + .5, 20, ['#fd4', '#fff', '#8f8'], .12, 30); return ['t.gift', v.name];
  } },
  { id: 'hero', cat: 'divine', icon: '🦸', type: 'tap', nobrush: 1, desc: 'd.hero', fn: (x, y) => {
    let best = null, bd = 9; forUnitsNear(x + .5, y + .5, 2.5, (u, d2) => { if (d2 < bd && !u.hero) { bd = d2; best = u; } });
    if (!best) return 't.nounit';
    best.hero = 1; best.mhp *= 2; best.hp = best.mhp; fxBurst(best.x, best.y, 16, ['#ffd23c', '#fff'], .1, 28);
    return ['t.hero', best.name || T('kind.' + KIND[best.kind].key)];
  } },
  { id: 'peace', cat: 'divine', icon: '🕊️', type: 'tap', nobrush: 1, desc: 'd.peace', fn: (x, y) => {
    const k = kingdomAt(x, y); if (!k) return 't.nokingdom';
    for (const id of Object.keys(k.war)) makePeace(k.id, +id);
    for (const o of G.kingdoms.values()) if (o !== k) { const r = getRel(k.id, o.id); if (r) { r.op = Math.min(100, r.op + 45); r.since = G.tick; } }
    return ['t.peace', k.name];
  } },
  { id: 'war', cat: 'divine', icon: '⚔️', type: 'tap', nobrush: 1, desc: 'd.war', fn: (x, y) => {
    const k = kingdomAt(x, y); if (!k) return 't.nokingdom';
    const cv = G.villages.get(k.cap); let best = null, bd = 1e9;
    for (const v of G.villages.values()) { if (v.kid === k.id || k.war[v.kid]) continue; const d = Math.hypot(v.x - cv.x, v.y - cv.y); if (d < bd) { bd = d; best = v; } }
    if (!best) return 't.noneighbor';
    const o = G.kingdoms.get(best.kid);
    if (k.ally[o.id]) setRel(k.id, o.id, REL_PEACE);
    declareWar(k.id, o.id);
    return ['t.war', k.name, o.name];
  } }
];
const POWER_CATS = [['terrain', '🌍'], ['nature', '🌿'], ['life', '🐾'], ['disaster', '🔥'], ['divine', '✨']];
