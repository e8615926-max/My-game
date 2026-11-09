'use strict';
/* ===== Save / load ===== */
function b64enc(u8) { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
function b64dec(str) { const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function rleEnc(a) { const out = []; let i = 0; const n = a.length; while (i < n) { const v = a[i]; let c = 1; while (i + c < n && a[i + c] === v && c < 255) c++; out.push(c, v); i += c; } return b64enc(Uint8Array.from(out)); }
function rleDec(str, target) { const d = b64dec(str); let p = 0; for (let i = 0; i < d.length; i += 2) { const c = d[i], v = d[i + 1]; target.fill(v, p, p + c); p += c; } }
const UF = ['id', 'kind', 'x', 'y', 'hp', 'mhp', 'age', 'life', 'dir', 'st', 'role', 'vid', 'kid', 'tk', 'tt', 'tid', 'cr', 'ca', 'wt', 'name', 'sex', 'kills', 'kids', 'hg', 'sick', 'imm', 'hero', 'bless', 'guard', 'rest', 'nom'];
function serializeWorld() {
  const r2 = v => typeof v === 'number' && v % 1 ? Math.round(v * 100) / 100 : v;
  return JSON.stringify({
    v: 1, W: G.W, H: G.H, seed: G.seed, name: G.name, size: G.size, tick: G.tick, maxUnits: G.maxUnits,
    nextId: G.nextId, nextVid: G.nextVid || 0, nextKid: G.nextKid || 0, nextBid: G.nextBid || 0, opts: G.opts, stats: G.stats,
    terr: rleEnc(G.terr), feat: rleEnc(G.feat), amt: rleEnc(G.amt), fire: rleEnc(G.fire),
    units: G.units.filter(u => !u.dead).map(u => UF.map(f => r2(u[f]))),
    villages: [...G.villages.values()].map(v => { const o = Object.assign({}, v); delete o.members; o.stock = v.stock.map(r2); return o; }),
    kingdoms: [...G.kingdoms.values()], blds: [...G.blds.values()].map(b => Object.assign({}, b, { hp: r2(b.hp) })),
    rel: G.rel, log: G.log.slice(-120), rains: G.rains, tornadoes: G.tornadoes, meteors: G.meteors, volcanoes: G.volcanoes
  });
}
function deserializeWorld(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  if (!d || d.v !== 1 || !d.W || !d.H || d.W * d.H > 400000) throw new Error('bad save');
  newState(d.W, d.H, d.seed, d.maxUnits);
  G.name = d.name; G.size = d.size; G.tick = d.tick; G.nextId = d.nextId; G.nextVid = d.nextVid; G.nextKid = d.nextKid; G.nextBid = d.nextBid;
  G.opts = d.opts || { disasters: true }; G.stats = d.stats || G.stats;
  rleDec(d.terr, G.terr); rleDec(d.feat, G.feat); rleDec(d.amt, G.amt); rleDec(d.fire, G.fire);
  for (let i = 0; i < G.terr.length; i++) { if (G.fire[i]) G.fires.push(i); if (G.terr[i] === T_LAVA) G.lavas.push(i); }
  for (const a of d.units) {
    const u = {}; UF.forEach((f, i) => u[f] = a[i]);
    u.path = null; u.mode = 0; u.next = G.tick + 1 + ri(12); u.hit = -99; u.ox = rr(-.28, .28); u.oy = rr(-.28, .28);
    G.units.push(u); G.unitById.set(u.id, u);
  }
  for (const b of d.blds) { G.blds.set(b.id, b); G.bldAt[b.y * G.W + b.x] = b.id; }
  for (const k of d.kingdoms) G.kingdoms.set(k.id, k);
  for (const v of d.villages) { v.members = []; v.farmIds = []; G.villages.set(v.id, v); }
  G.rel = d.rel || {}; G.log = d.log || []; G.rains = d.rains || []; G.tornadoes = d.tornadoes || []; G.meteors = d.meteors || []; G.volcanoes = d.volcanoes || [];
  primeWorld();
}
function saveMeta() { return { name: G.name, year: (G.tick / YEAR) | 0, pop: G.civCount || 0, kd: G.kingdoms.size, date: Date.now(), size: G.size }; }
function saveToSlot(slot) {
  try {
    localStorage.setItem('ws_save_' + slot, serializeWorld());
    localStorage.setItem('ws_meta_' + slot, JSON.stringify(saveMeta()));
    return true;
  } catch (e) { return false; }
}
function slotMeta(slot) { try { return JSON.parse(localStorage.getItem('ws_meta_' + slot) || 'null'); } catch (e) { return null; } }
function loadFromSlot(slot) {
  let s = null; try { s = localStorage.getItem('ws_save_' + slot); } catch (e) { }
  if (!s) return false;
  const backup = G;
  try { deserializeWorld(s); return true; } catch (e) { console.error(e); G = backup; if (G) { initPath(G.W * G.H); initGrid(); rebuildGrid(); } return false; }
}
