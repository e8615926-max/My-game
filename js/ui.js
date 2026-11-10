'use strict';
/* ===== UI, input, main loop ===== */
const $ = id => document.getElementById(id);
const UI = { speed: 1, lastSpeed: 1, tool: null, brush: 2, cat: null, stack: [], toastT: 0, logSeen: 0, keys: {}, newSize: 'medium', lastAuto: 0 };
const OPTS = { lang: (navigator.language || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en', territory: true, names: true, minimap: true, autosave: true };
function loadOpts() { try { Object.assign(OPTS, JSON.parse(localStorage.getItem('ws_opts') || '{}')); } catch (e) { } applyOpts(); }
function saveOpts() { try { localStorage.setItem('ws_opts', JSON.stringify(OPTS)); } catch (e) { } }
function applyOpts() {
  LNG = OPTS.lang; document.documentElement.lang = LNG; document.title = T('app.title');
  RD.showTerritory = OPTS.territory; RD.showNames = OPTS.names; RD.miniVer = -1;
  $('minimap').style.display = OPTS.minimap ? '' : 'none';
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isWide = () => window.innerWidth >= 820;

/* ----- Toast ----- */
let toastJump = null;
function toast(text, cat, x, y) {
  const el = $('toast'); el.textContent = text; el.className = 'show ' + (cat || '');
  toastJump = x >= 0 ? [x, y] : null; UI.toastT = performance.now() + 4200;
}
function jumpTo(x, y, zoom) { const c = RD.cam; c.x = (x + .5) * TS; c.y = (y + .5) * TS; c.vx = c.vy = 0; if (zoom && c.tz < zoom) c.tz = zoom; RD.follow = false; }

/* ----- Speed ----- */
function setSpeed(s) {
  if (s > 0) UI.lastSpeed = s;
  UI.speed = s;
  document.querySelectorAll('#speeds button').forEach(b => { b.classList.toggle('on', +b.dataset.speed === s); b.title = T('speed.' + b.dataset.speed); });
}

/* ----- Tools ----- */
function buildTabs() {
  const el = $('tabs');
  let h = `<button data-cat="hand" class="${!UI.cat ? 'on' : ''}">✋<span>${T('tool.hand')}</span></button>`;
  for (const [c, ic] of POWER_CATS) h += `<button data-cat="${c}" class="${UI.cat === c ? 'on' : ''}">${ic}<span>${T('cat.' + c)}</span></button>`;
  el.innerHTML = h;
}
function buildPowers() {
  const el = $('powers');
  if (!UI.cat) { el.innerHTML = ''; return; }
  el.innerHTML = POWERS.filter(p => p.cat === UI.cat).map(p => `<button class="pw${UI.tool === p ? ' on' : ''}" data-pw="${p.id}"><i>${p.icon}</i><span>${T('p.' + p.id)}</span></button>`).join('');
}
function updateToolInfo() {
  const p = UI.tool;
  $('toolname').textContent = p ? p.icon + ' ' + T('p.' + p.id) : '✋ ' + T('tool.hand');
  $('tooldesc').textContent = p ? T(p.desc || (p.type === 'paint' ? 'd.paint' : 'd.tap')) : T('hint.hand');
  $('brushwrap').classList.toggle('off', !p || !!p.nobrush);
  $('brushlabel').textContent = T('brush');
  $('brushval').textContent = UI.brush;
  $('view').classList.toggle('tool', !!p);
  if (!p) RD.cursor = null;
}
function setCat(c) {
  if (c === 'hand') { UI.cat = null; UI.tool = null; }
  else { UI.cat = c; if (!UI.tool || UI.tool.cat !== c) UI.tool = null; }
  buildTabs(); buildPowers(); updateToolInfo();
}
function setTool(id) {
  const p = POWERS.find(q => q.id === id);
  UI.tool = UI.tool === p ? null : p;
  buildPowers(); updateToolInfo();
}

/* ----- Applying powers ----- */
function usePower(p, tx, ty) {
  if (!inb(tx, ty)) return;
  const res = p.fn(tx, ty, p.nobrush ? 0 : UI.brush);
  if (res) { if (Array.isArray(res)) toast(T(res[0], ...res.slice(1)), 'good'); else toast(T(res), 'bad'); }
}
const stroke = { on: false, lx: 0, ly: 0, t: 0, id: -1 };
function strokeStart(wx, wy) {
  const p = UI.tool, tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
  stroke.on = p.type !== 'tap'; stroke.lx = tx; stroke.ly = ty; stroke.t = performance.now();
  usePower(p, tx, ty);
}
function strokeMove(wx, wy) {
  const p = UI.tool; if (!p || !stroke.on) return;
  const tx = Math.floor(wx / TS), ty = Math.floor(wy / TS), dx = tx - stroke.lx, dy = ty - stroke.ly, d = Math.hypot(dx, dy);
  const gap = p.type === 'paint' ? Math.max(1, UI.brush * .6) : (p.gap || 1.5);
  if (d < gap) return;
  const n = Math.min(60, Math.floor(d / gap));
  for (let k = 1; k <= n; k++) usePower(p, Math.round(stroke.lx + dx * k / (d / gap)), Math.round(stroke.ly + dy * k / (d / gap)));
  stroke.lx = Math.round(stroke.lx + dx * n / (d / gap)); stroke.ly = Math.round(stroke.ly + dy * n / (d / gap)); stroke.t = performance.now();
}

/* ----- Selection ----- */
function selectAt(wx, wy) {
  const ux = wx / TS, uy = wy / TS, r = Math.max(1.3, 18 / (RD.cam.z * TS));
  let best = null, bd = r * r;
  for (const u of G.units) { if (u.dead) continue; const dx = u.x + u.ox - ux, dy = u.y + u.oy - .4 - uy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = u; } }
  // on phones the sheet covers the lower half: slide the map so the selection stays visible
  const reveal = (x, y) => { if (!isWide() && w2sy(y * TS) > RD.h * .34) { RD.cam.y = y * TS + RD.h * .27 / RD.cam.z; RD.cam.x = x * TS; RD.cam.vx = RD.cam.vy = 0; } };
  if (best) { RD.selId = best.id; RD.selVid = 0; UI.stack = []; openPanel('unit', best.id); reveal(best.x, best.y); return; }
  const tx = Math.floor(ux), ty = Math.floor(uy);
  if (inb(tx, ty)) {
    const i = ty * G.W + tx, b = G.blds.get(G.bldAt[i]), v = G.villages.get(b ? b.vid : G.owner[i]);
    if (v) { RD.selVid = v.id; RD.selId = 0; UI.stack = []; openPanel('village', v.id); reveal(v.x + .5, v.y + .5); return; }
  }
  RD.selId = 0; RD.selVid = 0; RD.follow = false;
  if (UI.stack.length && ['unit', 'village'].includes(UI.stack[UI.stack.length - 1].type)) closePanel();
}

/* ----- Pointer input ----- */
function initInput() {
  const cv = $('view'), ptrs = new Map();
  let pinch = null, panning = false, vel = [0, 0, 0], pendT = 0, tapPending = false;
  const pos = e => [e.clientX, e.clientY];
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch (err) { }
    const [x, y] = pos(e);
    ptrs.set(e.pointerId, { x, y, sx: x, sy: y, t: performance.now(), moved: false, btn: e.button });
    RD.cam.vx = RD.cam.vy = 0; RD.anchor = null;
    if (ptrs.size === 2) {
      stroke.on = false; stroke.id = -1; panning = false; tapPending = false; clearTimeout(pendT); pendT = 0; RD.cursor = null;
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: RD.cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      a.moved = b.moved = true;
    } else if (ptrs.size === 1) {
      if (UI.tool && e.button === 0) {
        stroke.id = e.pointerId; setCursor(x, y);
        // on touch, wait a moment so a two-finger gesture does not fire the power
        if (e.pointerType === 'mouse') strokeStart(s2wx(x), s2wy(y));
        else if (UI.tool.type === 'tap') tapPending = true;
        else { const id = e.pointerId; pendT = setTimeout(() => { pendT = 0; const p = ptrs.get(id); if (p && ptrs.size === 1 && UI.tool) strokeStart(s2wx(p.x), s2wy(p.y)); }, 90); }
      }
      else { panning = true; vel = [0, 0, performance.now()]; if (e.button !== 0 || !UI.tool) RD.follow = false; }
    }
  });
  function setCursor(x, y) { const p = UI.tool; RD.cursor = p ? { x: Math.floor(s2wx(x) / TS), y: Math.floor(s2wy(y) / TS), r: p.nobrush ? 0 : UI.brush } : null; }
  cv.addEventListener('pointermove', e => {
    const [x, y] = pos(e), p = ptrs.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse') setCursor(x, y); return; }
    const dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y;
    if (Math.hypot(x - p.sx, y - p.sy) > 8) p.moved = true;
    if (ptrs.size >= 2 && pinch) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, c = RD.cam;
      const wx = s2wx(pinch.mx), wy = s2wy(pinch.my);
      c.z = c.tz = clamp(pinch.z * d / pinch.d, minZoom(), 7);
      c.x = wx - (mx - RD.w / 2) / c.z; c.y = wy - (my - RD.h / 2) / c.z;
      pinch.mx = mx; pinch.my = my;
    } else if (stroke.id === e.pointerId) { if (stroke.on) strokeMove(s2wx(x), s2wy(y)); setCursor(x, y); }
    else if (panning && p.moved) {
      const c = RD.cam; c.x -= dx / c.z; c.y -= dy / c.z;
      const now = performance.now(), dt = Math.max(1, now - vel[2]);
      vel = [vel[0] * .6 + (-dx / c.z) / dt * 400, vel[1] * .6 + (-dy / c.z) / dt * 400, now];
    }
  });
  const up = e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (stroke.id === e.pointerId && UI.tool && e.type === 'pointerup' && (tapPending ? !p.moved : pendT)) { clearTimeout(pendT); strokeStart(s2wx(p.x), s2wy(p.y)); }
    if (stroke.id === e.pointerId) { clearTimeout(pendT); pendT = 0; tapPending = false; }
    if (stroke.id === e.pointerId) { stroke.on = false; stroke.id = -1; if (e.pointerType !== 'mouse') RD.cursor = null; }
    if (ptrs.size === 0) {
      if (panning && !p.moved && performance.now() - p.t < 500 && p.btn === 0 && !UI.tool) selectAt(s2wx(p.x), s2wy(p.y));
      else if (panning && p.moved && performance.now() - vel[2] < 80) { RD.cam.vx = vel[0]; RD.cam.vy = vel[1]; }
      panning = false;
    } else if (ptrs.size === 1) { panning = true; vel = [0, 0, performance.now()]; }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptrs.size) RD.cursor = null; });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const c = RD.cam, f = Math.exp(-e.deltaY * (e.deltaMode ? .05 : .0016));
    RD.anchor = { sx: e.clientX, sy: e.clientY, wx: s2wx(e.clientX), wy: s2wy(e.clientY) };
    c.tz = clamp(c.tz * f, minZoom(), 7);
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    UI.keys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); setSpeed(UI.speed ? 0 : UI.lastSpeed); }
    else if (e.code === 'Digit1') setSpeed(1); else if (e.code === 'Digit2') setSpeed(3); else if (e.code === 'Digit3') setSpeed(10);
    else if (e.code === 'Escape') { if (!$('panel').hidden) closePanel(); else setCat('hand'); }
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') { RD.anchor = null; RD.cam.tz *= 1.3; }
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') { RD.anchor = null; RD.cam.tz /= 1.3; }
  });
  window.addEventListener('keyup', e => { UI.keys[e.code] = false; });
  window.addEventListener('blur', () => { UI.keys = {}; });
  window.addEventListener('resize', () => { resizeRenderer(); clampCam(); });
  // minimap navigation
  const mm = $('minimap'); let mdown = false;
  const mgo = e => { const r = mm.getBoundingClientRect(); RD.cam.x = clamp((e.clientX - r.left) / r.width, 0, 1) * G.W * TS; RD.cam.y = clamp((e.clientY - r.top) / r.height, 0, 1) * G.H * TS; RD.follow = false; RD.cam.vx = RD.cam.vy = 0; };
  mm.addEventListener('pointerdown', e => { mdown = true; try { mm.setPointerCapture(e.pointerId); } catch (err) { } mgo(e); });
  mm.addEventListener('pointermove', e => { if (mdown) mgo(e); });
  mm.addEventListener('pointerup', () => mdown = false); mm.addEventListener('pointercancel', () => mdown = false);
}

/* ----- Panels ----- */
function openPanel(type, id, keep) {
  if (!keep) { const top = UI.stack[UI.stack.length - 1]; if (!top || top.type !== type || top.id !== id) UI.stack.push({ type, id }); }
  $('panel').hidden = false;
  renderPanel(true);
}
function closePanel() { UI.stack = []; $('panel').hidden = true; }
function yearOf(t) { return (t / YEAR) | 0; }
function unitStatus(u) {
  const k = KIND[u.kind];
  if (u.rest > 0) return T('task.rest');
  if (u.st === ST_WORK && (u.tk === TK_EAT || u.tk === TK_REST)) return T('task.' + TASK_KEYS[u.tk]);
  if (k.fly) return T('task.fly');
  if (u.st === ST_FIGHT) return T('task.fight');
  if (u.st === ST_FLEE) return T('task.flee');
  if (u.st === ST_HUNT) return T('task.hunt');
  if (k.civ && WATER[G.terr[(u.y | 0) * G.W + (u.x | 0)]]) return T('task.sail');
  if (u.ca > 0 || u.st === ST_RETURN) return T('task.return');
  if (u.tk) return T('task.' + TASK_KEYS[u.tk]);
  if (u.role === RL_SOLDIER) { const v = G.villages.get(u.vid); return T(v && v.atk && !u.guard ? 'task.march' : 'task.patrol'); }
  return T(u.path ? 'task.wander' : 'task.none');
}
function kvh(pairs) { return '<div class="kv">' + pairs.map(p => `<div><small>${p[0]}</small><b>${p[1]}</b></div>`).join('') + '</div>'; }
function kRow(k) {
  const cv = G.villages.get(k.cap);
  let wars = 0; for (const i in k.war) wars++;
  return `<button class="row" data-act="kingdom" data-id="${k.id}"><span class="flag" style="background:${KCOLORS[k.color]}"></span><span class="grow"><b>${esc(k.name)}</b><small>${KIND[k.race].icon} ${T('title.' + kingdomTitle(k))} · ${T('races.' + KIND[k.race].key)}${cv ? ' · ★ ' + esc(cv.name) : ''}</small></span><span>${wars ? '⚔️ ' : ''}👥 <b>${k.pop}</b></span></button>`;
}
const PANELS = {
  kingdoms() {
    const ks = [...G.kingdoms.values()].sort((a, b) => b.pop - a.pop);
    return [T('kingdoms') + ' · ' + ks.length, ks.length ? ks.map(kRow).join('') : `<p class="help">${T('ui.nokingdoms')}</p>`];
  },
  kingdom(id) {
    const k = G.kingdoms.get(id); if (!k) return null;
    const king = G.unitById.get(k.kingId), cv = G.villages.get(k.cap);
    const tot = new Array(NRES).fill(0); const vs = k.vids.map(i => G.villages.get(i)).filter(Boolean);
    for (const v of vs) for (let r = 0; r < NRES; r++) tot[r] += v.stock[r] || 0;
    let h = `<div class="uhead"><span class="flag" style="background:${KCOLORS[k.color]};height:44px;width:20px"></span><div><b style="font-size:17px">${esc(k.name)}</b><br><small class="dim">${KIND[k.race].icon} ${T('title.' + kingdomTitle(k))} · ${T('races.' + KIND[k.race].key)}</small></div></div>`;
    h += kvh([[T('pop'), '👥 ' + k.pop], [T('ui.army'), '⚔️ ' + k.sold], [T('ui.villages'), '🏘️ ' + vs.length], [T('ui.founded'), T('year', yearOf(k.founded))], [T('ui.peakpop'), k.peak]]);
    if (king) h += `<button class="row" data-act="unit" data-id="${king.id}"><span style="font-size:22px">👑</span><span class="grow"><b>${esc(king.name)}</b><small>${T('ui.ruler')} · ${T('ui.years', yearOf(king.age))}</small></span><span>›</span></button>`;
    h += `<h4>${T('ui.resources')}</h4>` + kvh(tot.map((v, r) => [T('res.' + RES_KEYS[r]), RES_ICON[r] + ' ' + (v | 0)]));
    h += `<h4>${T('ui.villages')}</h4>` + vs.sort((a, b) => b.pop - a.pop).map(v => `<button class="row" data-act="village" data-id="${v.id}"><span style="font-size:18px">${v.id === k.cap ? '★' : '🏠'}</span><span class="grow"><b>${esc(v.name)}</b><small>${T('vlvl.' + v.lvl)}${v.underAttack ? ' · ' + T('ui.underattack') : ''}</small></span><span>👥 <b>${v.pop}</b></span></button>`).join('');
    const others = [...G.kingdoms.values()].filter(o => o !== k);
    if (others.length) {
      h += `<h4>${T('ui.relations')}</h4>`;
      h += others.map(o => { const r = getRel(k.id, o.id); return [o, r]; }).sort((a, b) => (b[1].st === REL_WAR) - (a[1].st === REL_WAR) || b[1].op - a[1].op).map(([o, r]) => {
        const st = r.st === REL_WAR ? `<span class="tag war">⚔️ ${T('ui.war')}</span>` : r.st === REL_ALLY ? `<span class="tag ally">🤝 ${T('ui.ally')}</span>` : `<span class="tag">${T('ui.peace')}</span>`;
        const w = Math.abs(r.op) / 2, bar = r.op >= 0 ? `left:50%;width:${w}%;background:var(--good)` : `right:50%;width:${w}%;background:var(--bad)`;
        return `<button class="row" data-act="kingdom" data-id="${o.id}"><span class="flag" style="background:${KCOLORS[o.color]};height:22px"></span><span class="grow"><b>${esc(o.name)}</b></span><span class="rel">${r.trade ? '<span class="tag gold">🪙</span>' : ''}${st}<span class="op"><i style="${bar}"></i></span></span></button>`;
      }).join('');
    }
    return [k.name, h, cv ? [cv.x, cv.y] : null];
  },
  village(id) {
    const v = G.villages.get(id); if (!v) return null;
    const k = G.kingdoms.get(v.kid);
    let h = '';
    if (k) h += `<button class="row" data-act="kingdom" data-id="${k.id}"><span class="flag" style="background:${KCOLORS[k.color]}"></span><span class="grow"><b>${esc(k.name)}</b><small>${T('ui.kingdom')}${k.cap === v.id ? ' · ★ ' + T('ui.capital') : ''}</small></span><span>›</span></button>`;
    let tags = '';
    if (v.underAttack) tags += `<span class="tag war">⚔️ ${T('ui.underattack')}</span>`;
    if (v.starve) tags += `<span class="tag bad">${T('ui.starving')}</span>`;
    if (v.atk) { const tv = G.villages.get(v.atk); if (tv) tags += `<span class="tag war">${T('ui.attacking', esc(tv.name))}</span>`; }
    if (tags) h += '<div>' + tags + '</div>';
    h += kvh([[T('pop'), '👥 ' + v.pop + ' / ' + v.cap], [T('ui.army'), '⚔️ ' + v.soldiers], [T('ui.race'), KIND[v.race].icon + ' ' + T('races.' + KIND[v.race].key)], [T('ui.founded'), T('year', yearOf(v.founded))]]);
    h += `<h4>${T('ui.resources')}</h4>` + kvh(v.stock.map((s, r) => [T('res.' + RES_KEYS[r]), RES_ICON[r] + ' ' + (s | 0)]));
    h += `<h4>${T('ui.goods')}</h4>` + kvh([[T('ui.tools'), '🛠️ ' + Math.round(v.tools || 0)], [T('ui.arms'), '🗡️ ' + Math.round(v.arms || 0)]]);
    h += `<h4>${T('ui.buildings')}</h4>` + kvh(BLD.map((b, t) => [T('bld.' + b.key), v.has[t]]).filter(p => p[1] > 0));
    return [v.name + ' · ' + T('vlvl.' + v.lvl), h, [v.x, v.y]];
  },
  unit(id) {
    const u = G.unitById.get(id); if (!u || u.dead) return null;
    const k = KIND[u.kind], v = G.villages.get(u.vid), kd = G.kingdoms.get(u.kid);
    const role = !k.civ ? '' : !isAdult(u) ? T('role.child') : !v ? T('role.nomad') : T('role.' + ROLE_KEYS[u.role]);
    let h = `<div class="uhead"><span class="ico">${u.role === RL_KING && k.civ ? '👑' : k.icon}</span><div><b style="font-size:17px">${esc(u.name || T('kind.' + k.key))}</b><br><small class="dim">${T('kind.' + k.key)}${role ? ' · ' + role : ''}</small></div></div>`;
    let tags = '';
    if (u.hero) tags += `<span class="tag gold">★ ${T('ui.hero')}</span>`;
    if (u.sick > 0) tags += `<span class="tag bad">🦠 ${T('ui.sick')}</span>`;
    if (u.bless > 0) tags += `<span class="tag ally">✨ ${T('ui.blessed')}</span>`;
    if (tags) h += '<div>' + tags + '</div>';
    const hp = clamp(u.hp / u.mhp, 0, 1);
    h += `<small class="dim">${T('ui.health')}: ${Math.ceil(u.hp)} / ${Math.round(u.mhp)}</small><div class="bar"><i style="width:${hp * 100}%;background:${hp > .5 ? 'var(--good)' : hp > .25 ? 'var(--acc)' : 'var(--bad)'}"></i></div>`;
    if (k.civ && v) {
      const full = clamp(1 - (G.tick - u.ate) / 420, 0, 1), en = clamp(1 - (G.tick - u.slept) / 1300, 0, 1);
      h += `<div style="display:flex;gap:10px"><div style="flex:1"><small class="dim">🍖 ${T('ui.hunger')}</small><div class="bar"><i style="width:${full * 100}%;background:${full > .3 ? '#e8a86a' : 'var(--bad)'}"></i></div></div><div style="flex:1"><small class="dim">💤 ${T('ui.energy')}</small><div class="bar"><i style="width:${en * 100}%;background:${en > .25 ? 'var(--nat)' : 'var(--bad)'}"></i></div></div></div>`;
    }
    const kv = [[T('ui.age'), T('ui.years', yearOf(u.age)) + (k.civ ? ' ' + T('ui.sex.' + u.sex) : '')], [T('ui.doing'), unitStatus(u)], [T('ui.kills'), u.kills]];
    if (k.civ && v && isAdult(u) && u.role === RL_WORKER && u.job >= 0) kv.push([T('ui.job'), T('job.' + JOB_KEYS[u.job])]);
    if (k.civ) { kv.push([T('ui.kids'), u.kids]); kv.push([T('ui.carry'), u.ca > 0 ? RES_ICON[u.cr] + ' ' + u.ca : T('ui.none')]); }
    h += kvh(kv);
    if (v) h += `<button class="row" data-act="village" data-id="${v.id}"><span style="font-size:18px">🏠</span><span class="grow"><b>${esc(v.name)}</b><small>${T('ui.home')}${kd ? ' · ' + esc(kd.name) : ''}</small></span><span>›</span></button>`;
    h += `<div class="btns"><button class="btn sm${RD.follow && RD.selId === u.id ? ' pri' : ''}" data-act="follow" data-id="${u.id}">🎥 ${T(RD.follow && RD.selId === u.id ? 'ui.unfollow' : 'ui.follow')}</button></div>`;
    return [u.name || T('kind.' + k.key), h];
  },
  history() {
    const l = G.log;
    if (!l.length) return [T('history'), `<p class="help">${T('ui.noevents')}</p>`];
    let h = '';
    for (let i = l.length - 1; i >= Math.max(0, l.length - 120); i--) { const e = l[i]; h += `<button class="ev ${e.c}" ${e.x >= 0 ? `data-act="jump" data-x="${e.x}" data-y="${e.y}"` : ''}><small>${T('year', yearOf(e.t))}</small><span>${esc(TE(e))}</span></button>`; }
    return [T('history'), h];
  },
  stats() {
    const c = G.count || [];
    let h = kvh([[T('ui.world'), esc(G.name)], [T('year', yearOf(G.tick)), G.W + '×' + G.H], [T('pop'), '👥 ' + (G.civCount || 0)], [T('kingdoms'), '🏰 ' + G.kingdoms.size], [T('ui.villages'), '🏘️ ' + G.villages.size]]);
    h += `<h4>${T('ui.creatures')}</h4>` + kvh(KIND.map((k, i) => [T('kind.' + k.key), k.icon + ' ' + (c[i] || 0)]));
    h += `<h4>${T('ui.stats')}</h4>` + kvh([[T('ui.births'), G.stats.births], [T('ui.deaths'), G.stats.deaths], [T('ui.wars'), G.stats.wars], [T('ui.fallen'), G.stats.fallen]]);
    return [T('ui.stats'), h];
  },
  menu() {
    const chk = (key, label, on) => `<label class="field"><span>${label}</span><input type="checkbox" data-opt="${key}" ${on ? 'checked' : ''}></label>`;
    let h = `<div class="btns"><button class="btn pri" data-act="open" data-id="newworld">🌍 ${T('m.new')}</button><button class="btn" data-act="open" data-id="saves">💾 ${T('m.save')} / ${T('m.load')}</button><button class="btn" data-act="open" data-id="stats">📊 ${T('ui.stats')}</button></div>`;
    h += `<h4>${T('m.lang')}</h4><div class="seg"><button data-act="lang" data-id="ru" class="${LNG === 'ru' ? 'on' : ''}">Русский</button><button data-act="lang" data-id="en" class="${LNG === 'en' ? 'on' : ''}">English</button></div>`;
    h += `<h4>${T('m.settings')}</h4>` + chk('territory', T('m.territory'), OPTS.territory) + chk('names', T('m.names'), OPTS.names) + chk('minimap', T('m.minimap'), OPTS.minimap) + chk('disasters', T('m.disasters'), G.opts.disasters) + chk('autosave', T('m.autosave'), OPTS.autosave);
    h += `<h4>${T('m.help')}</h4><p class="help">${T('m.helptext')}</p>`;
    return [T('menu'), h];
  },
  newworld() {
    let h = `<h4>${T('m.size')}</h4><div class="seg">` + Object.keys(WORLD_SIZES).map(s => `<button data-act="size" data-id="${s}" class="${UI.newSize === s ? 'on' : ''}">${T('size.' + s)}<br><small>${WORLD_SIZES[s][0]}×${WORLD_SIZES[s][1]}</small></button>`).join('') + '</div>';
    h += `<label class="field"><span>${T('m.seed')}</span><input id="seedIn" type="number" inputmode="numeric" value="${UI.newSeed || ((Math.random() * 1e6) | 0)}"></label>`;
    h += `<label class="field"><span>${T('m.populate')}</span><input id="popIn" type="checkbox" ${UI.newPop === false ? '' : 'checked'}></label>`;
    h += `<div class="btns"><button class="btn pri" data-act="create">✨ ${T('m.create')}</button></div>`;
    return [T('m.new'), h];
  },
  saves() {
    const row = (slot, label, canSave) => {
      const m = slotMeta(slot);
      const info = m ? `${esc(m.name)} · ${T('year', m.year)} · 👥 ${m.pop} · ${new Date(m.date).toLocaleString(LNG)}` : T('m.empty');
      return `<div class="row"><span class="grow"><b>${label}</b><small>${info}</small></span>${canSave ? `<button class="btn sm" data-act="save" data-id="${slot}">${T('m.save')}</button>` : ''}${m ? `<button class="btn sm pri" data-act="load" data-id="${slot}">${T('m.load')}</button>` : ''}</div>`;
    };
    let h = row('1', T('m.slot', 1), true) + row('2', T('m.slot', 2), true) + row('3', T('m.slot', 3), true) + row('auto', T('m.auto'), false);
    h += `<div class="btns"><button class="btn" data-act="export">⬇️ ${T('m.export')}</button><button class="btn" data-act="import">⬆️ ${T('m.import')}</button></div>`;
    return [T('m.save') + ' / ' + T('m.load'), h];
  }
};
const LIVE = { kingdoms: 1, kingdom: 1, village: 1, unit: 1, history: 1, stats: 1 };
let panelSig = '';
function renderPanel(force) {
  const top = UI.stack[UI.stack.length - 1];
  if (!top) { $('panel').hidden = true; return; }
  if (!force && !LIVE[top.type]) return;
  const res = PANELS[top.type](top.id);
  if (!res) { UI.stack.pop(); if (UI.stack.length) renderPanel(true); else closePanel(); return; }
  if (res[1] === panelSig && !force) return;
  panelSig = res[1];
  const body = $('panelBody'), st = body.scrollTop;
  $('panelTitle').textContent = res[0];
  $('panelBack').hidden = UI.stack.length < 2;
  body.innerHTML = res[1];
  body.scrollTop = force ? 0 : st;
}
function initPanels() {
  $('panelClose').onclick = closePanel;
  $('panelBack').onclick = () => { UI.stack.pop(); renderPanel(true); };
  $('panelBody').addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act, id = el.dataset.id;
    switch (act) {
      case 'kingdom': openPanel('kingdom', +id); { const k = G.kingdoms.get(+id), cv = k && G.villages.get(k.cap); if (cv && isWide()) jumpTo(cv.x, cv.y); } break;
      case 'village': { const v = G.villages.get(+id); if (v) { RD.selVid = v.id; jumpTo(v.x, v.y, 1.6); openPanel('village', +id); } break; }
      case 'unit': { const u = G.unitById.get(+id); if (u) { RD.selId = u.id; jumpTo(u.x | 0, u.y | 0, 2.5); openPanel('unit', +id); } break; }
      case 'jump': jumpTo(+el.dataset.x, +el.dataset.y, 2); if (!isWide()) closePanel(); break;
      case 'follow': { RD.follow = !(RD.follow && RD.selId === +id); RD.selId = +id; if (RD.follow && RD.cam.tz < 2.5) RD.cam.tz = 2.5; renderPanel(true); if (RD.follow && !isWide()) closePanel(); break; }
      case 'open': openPanel(id); break;
      case 'lang': OPTS.lang = id; saveOpts(); applyOpts(); buildTabs(); buildPowers(); updateToolInfo(); setSpeed(UI.speed); updateHUD(true); renderPanel(true); break;
      case 'size': UI.newSeed = +($('seedIn') || {}).value || 0; UI.newPop = ($('popIn') || {}).checked; UI.newSize = id; renderPanel(true); break;
      case 'create': { const seed = (+$('seedIn').value | 0) || ((Math.random() * 1e6) | 0); UI.newPop = $('popIn').checked; UI.newSeed = 0; closePanel(); createWorld(UI.newSize, seed, UI.newPop); break; }
      case 'save': if (saveToSlot(id)) toast(T('t.saved'), 'good'); else toast(T('t.savefail'), 'bad'); renderPanel(true); break;
      case 'load': if (loadFromSlot(id)) { afterWorldChange(); closePanel(); toast(T('t.loaded'), 'good'); } else toast(T('t.loadfail'), 'bad'); break;
      case 'export': exportWorld(); break;
      case 'import': $('fileIn').click(); break;
    }
  });
  $('panelBody').addEventListener('change', e => {
    const key = e.target.dataset && e.target.dataset.opt; if (!key) return;
    if (key === 'disasters') G.opts.disasters = e.target.checked; else { OPTS[key] = e.target.checked; saveOpts(); applyOpts(); }
  });
  $('fileIn').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { const backup = G; try { deserializeWorld(rd.result); afterWorldChange(); closePanel(); toast(T('t.loaded'), 'good'); } catch (err) { G = backup; initPath(G.W * G.H); initGrid(); rebuildGrid(); toast(T('t.loadfail'), 'bad'); } };
    rd.readAsText(f); e.target.value = '';
  });
}
function exportWorld() {
  const blob = new Blob([serializeWorld()], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = G.name + '-year' + yearOf(G.tick) + '.json';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(T('t.exported'), 'good');
}

/* ----- World lifecycle ----- */
function afterWorldChange() {
  attachWorld(); FX.parts.length = 0; FX.bolts.length = 0; FX.arrows.length = 0; FX.rings.length = 0;
  UI.logSeen = G.logVer || 0; UI.stack = []; $('panel').hidden = true; acc = 0;
  updateHUD(true);
}
function createWorld(size, seed, populate) {
  toast(T('t.generating'), '');
  setTimeout(() => {
    generateWorld(size, seed, populate); primeWorld();
    logEvent('ev.newworld', [G.name], -1, -1, 'good');
    afterWorldChange();
    toast(T('ev.newworld', G.name), 'good');
  }, 30);
}

/* ----- HUD ----- */
let hudT = 0;
function updateHUD(force) {
  const now = performance.now();
  if (!force && now - hudT < 300) return;
  hudT = now;
  if (UI.speed === 0) census();
  $('wname').textContent = G.name; $('wyear').textContent = T('year', yearOf(G.tick));
  $('spop').textContent = G.civCount || 0; $('skd').textContent = G.kingdoms.size;
  if (!$('panel').hidden) renderPanel(false);
  if ((G.logVer || 0) !== UI.logSeen) { UI.logSeen = G.logVer; const e = G.log[G.log.length - 1]; if (e) toast(TE(e), e.c, e.x, e.y); }
  if (UI.toastT && now > UI.toastT) { $('toast').classList.remove('show'); UI.toastT = 0; }
  if (OPTS.minimap) { const mm = $('minimap'); drawMinimap(mm.getContext('2d'), mm.width, mm.height); }
  if (OPTS.autosave && now - UI.lastAuto > 90000) { UI.lastAuto = now; saveToSlot('auto'); }
}

/* ----- Main loop ----- */
let lastT = 0, acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.1, (now - lastT) / 1000 || 0); lastT = now;
  if (!G) return;
  if (UI.speed > 0) {
    acc += dt * TPS * UI.speed;
    const t0 = performance.now(); let n = 0;
    while (acc >= 1 && n < 60) { simTick(); acc -= 1; n++; if (performance.now() - t0 > 13) { acc = Math.min(acc, 2); break; } }
  }
  // keyboard pan
  const k = UI.keys, c = RD.cam, sp = 520 / c.z * dt;
  if (k.KeyA || k.ArrowLeft) { c.x -= sp; RD.follow = false; } if (k.KeyD || k.ArrowRight) { c.x += sp; RD.follow = false; }
  if (k.KeyW || k.ArrowUp) { c.y -= sp; RD.follow = false; } if (k.KeyS || k.ArrowDown) { c.y += sp; RD.follow = false; }
  // hold-to-repeat powers (rain etc.)
  if (stroke.on && UI.tool && UI.tool.hold && now - stroke.t > 140) { stroke.t = now; usePower(UI.tool, stroke.lx, stroke.ly); }
  // wheel zoom keeps the point under the cursor fixed
  const a = RD.anchor;
  if (a) { const z0 = c.z; c.z += (c.tz - c.z) * Math.min(1, dt * 14); if (Math.abs(c.tz - c.z) < .002) { c.z = c.tz; RD.anchor = null; } c.x = a.wx - (a.sx - RD.w / 2) / c.z; c.y = a.wy - (a.sy - RD.h / 2) / c.z; }
  render(dt, UI.speed === 0);
  updateHUD(false);
}

window.addEventListener('load', () => {
  initRenderer($('view'));
  loadOpts();
  buildTabs(); buildPowers(); updateToolInfo(); setSpeed(1);
  $('tabs').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) setCat(b.dataset.cat); });
  $('powers').addEventListener('click', e => { const b = e.target.closest('[data-pw]'); if (b) setTool(b.dataset.pw); });
  $('speeds').addEventListener('click', e => { const b = e.target.closest('[data-speed]'); if (b) setSpeed(+b.dataset.speed); });
  $('brush').addEventListener('input', e => { UI.brush = +e.target.value; $('brushval').textContent = UI.brush; });
  const tog = type => () => { const top = UI.stack[UI.stack.length - 1]; if (!$('panel').hidden && top && top.type === type) closePanel(); else { UI.stack = []; openPanel(type); } };
  $('btnMenu').onclick = tog('menu'); $('btnKd').onclick = tog('kingdoms'); $('btnHist').onclick = tog('history'); $('btnPop').onclick = tog('stats');
  $('toast').onclick = () => { if (toastJump) jumpTo(toastJump[0], toastJump[1], 2); $('toast').classList.remove('show'); };
  initInput(); initPanels();
  if (loadFromSlot('auto')) afterWorldChange();
  else { generateWorld('medium', (Math.random() * 1e6) | 0, true); primeWorld(); logEvent('ev.newworld', [G.name], -1, -1, 'good'); afterWorldChange(); }
  UI.lastAuto = performance.now();
  const autosave = () => { if (OPTS.autosave && G) saveToSlot('auto'); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); else lastT = performance.now(); });
  window.addEventListener('pagehide', autosave);
  requestAnimationFrame(frame);
});
