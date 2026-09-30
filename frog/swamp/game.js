/*
 * Swamp test room engine.
 *
 * Signature mechanic, THE WEIGHT RULE: the tongue sticks to whatever it hits.
 * Anything lighter than the frog is reeled in (eaten, pocketed, or dragged
 * along the water); anything heavier reels the frog in instead. Tap the
 * tongue on something heavy to zip to it, hold it to swing.
 *
 * Needs ../frog.js, ../frog-anims.js and room.js loaded first.
 */
(function () {
  'use strict';
  const F = window.Frog, ROOM = window.SWAMP_ROOM;
  const A = F.buildAnims();
  const TS = ROOM.tile, VW = 384, VH = 216;
  const COLS = ROOM.map[0].length, ROWS = ROOM.map.length;
  const WW = COLS * TS, WH = ROWS * TS;

  // ---- tuning (all in px, px/s, px/s^2, s) ------------------------------
  const TUNE = {
    walk: 72, airAccel: 7, gravity: 720, maxFall: 420,
    hop: 235, leap: 365, chargeTime: 0.45, coyote: 0.08, jumpBuffer: 0.1,
    swim: 62, swimUp: 80, float: 70, surfaceHop: 310,
    tongueRange: 122, tongueSpeed: 620, reelSpeed: 700, aimAssistDeg: 32,
    zipSpeed: 330, swingPump: 260, reel: 80, ropeMin: 20, ropeMax: 130,
    padPull: 90, spit: 270,
    hurtKnock: 130, invuln: 1.2, maxHp: 3,
    croakRadius: 132,
  };
  const HALF_W = 5, BODY_H = 26;
  const FROG_W = ROOM.frogWeight;

  // ---- sprites ----------------------------------------------------------
  function toCanvas(px) {
    const c = document.createElement('canvas'); c.width = F.CELL_W; c.height = F.CELL_H;
    const id = new ImageData(F.CELL_W, F.CELL_H); F.toRGBA(px, id.data);
    c.getContext('2d').putImageData(id, 0, 0); return c;
  }
  for (const n in A) A[n].frames.forEach(f => { f.img = toCanvas(f.px); });
  // mouth position relative to the pivot, recovered from the strike frames
  const MOUTH = (() => {
    const f = A.tongue.frames.find(x => x.hit).tip, u = A.tongue_up.frames.find(x => x.hit).tip;
    return { fwd: [f[0] - 31 * Math.cos(0.02), f[1] - 31 * Math.sin(0.02)], up: [u[0] - 22 * Math.cos(-0.85), u[1] - 22 * Math.sin(-0.85)] };
  })();

  // ---- parse the room ---------------------------------------------------
  const ENTITY_CHARS = 'PSLCofpbyBXETMN123456789';
  const grid = [];
  const ents = [];
  let spawn = { x: 40, y: 200 };
  ROOM.map.forEach((row, ty) => {
    grid.push([]);
    for (let tx = 0; tx < COLS; tx++) {
      let c = row[tx];
      if (ENTITY_CHARS.includes(c)) {
        const l = row[tx - 1], r = row[tx + 1];
        const liquid = [l, r].find(ch => ch === 'w' || ch === 'm');
        makeEntity(c, tx, ty, !!liquid);
        c = liquid || '.';
      }
      grid[ty].push(c);
    }
  });
  // posts standing in water still hold water around them
  const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? '#' : grid[ty][tx]);
  const isLiquidTile = (tx, ty) => {
    const c = tileAt(tx, ty);
    if (c === 'w' || c === 'm') return c;
    if (c === '|') { const l = tileAt(tx - 1, ty); if (l === 'w' || l === 'm') return l; }
    return null;
  };

  const world = { gateOpen: 0, gateOpening: false, bridge: 0, bridgeDropping: false, time: 0 };

  function makeEntity(c, tx, ty, inLiquid) {
    const x = tx * TS + TS / 2, y = ty * TS + TS; // bottom-centre of the cell
    const e = { ch: c, x, y, x0: x, y0: y, tx, ty, alive: true, t: Math.random() * 10 };
    switch (c) {
      case 'P': spawn = { x, y }; return;
      case 'S': Object.assign(e, { kind: 'stump', r: 10 }); break;
      case 'L': Object.assign(e, { kind: 'pad', weight: 2, w: 28, y: ty * TS + 1, r: 12, sink: 0, platform: true }); break;
      case 'C': Object.assign(e, { kind: 'cattail', weight: Infinity, anchor: true, r: 7, base: ty * TS + (inLiquid ? 2 : TS), headY: ty * TS - (inLiquid ? 70 : 60) }); e.y = e.headY; break;
      case 'o': Object.assign(e, { kind: 'ring', weight: Infinity, anchor: true, r: 7, y: ty * TS + 4 }); break;
      case 'f': Object.assign(e, { kind: 'fly', weight: 0, r: 6, y: ty * TS + 8 }); break;
      case 'p': Object.assign(e, { kind: 'pebble', weight: 1, r: 6, y: ty * TS + TS - 2, vx: 0, vy: 0, resting: true }); break;
      case 'b': Object.assign(e, { kind: 'beetle', weight: 2, r: 8, dir: -1, stun: 0, enemy: true }); break;
      case 'y': Object.assign(e, { kind: 'dragonfly', weight: 1, r: 7, enemy: true, y: ty * TS + 8 }); break;
      case 'B': Object.assign(e, { kind: 'bell', r: 10, rung: false }); break;
      case 'X': Object.assign(e, { kind: 'target', r: 10, y: ty * TS + 8, hit: false }); break;
      case 'E': case 'T': case 'M': case 'N':
        Object.assign(e, { kind: 'npc', npc: ROOM.npcs[c], r: c === 'M' ? 16 : 10, say: null, sayT: 0 });
        if (c === 'T') { e.y = ty * TS + 8; e.weight = 1; }
        if (c === 'M') Object.assign(e, { weight: 5, w: 34, y: ty * TS + 1, platform: true, anchor: true, dir: 1, target: null });
        break;
      default:
        if (/[1-9]/.test(c)) Object.assign(e, { kind: 'sign', text: ROOM.signs[c] || '', r: 10 });
    }
    ents.push(e);
  }
  const byKind = k => ents.filter(e => e.kind === k);

  // horizontal extent of the water surface an entity floats on
  function waterSpan(e) {
    const ty = Math.floor((e.y + 2) / TS);
    let l = Math.floor(e.x / TS), r = l;
    while (isLiquidTile(l - 1, ty)) l--;
    while (isLiquidTile(r + 1, ty)) r++;
    return [l * TS, (r + 1) * TS];
  }
  byKind('pad').concat(byKind('npc').filter(n => n.ch === 'M')).forEach(e => { e.span = waterSpan(e); });

  // ---- tiles: solidity --------------------------------------------------
  function solid(tx, ty) {
    const c = tileAt(tx, ty);
    return c === '#' || (c === 'G' && world.gateOpen < 0.8);
  }
  function oneWay(tx, ty) {
    const c = tileAt(tx, ty);
    return c === '=' || (c === 'd' && world.bridge >= 1);
  }
  function liquidAt(px, py) { return isLiquidTile(Math.floor(px / TS), Math.floor(py / TS)); }
  function surfaceY(px, py) {
    let ty = Math.floor(py / TS);
    const tx = Math.floor(px / TS);
    while (isLiquidTile(tx, ty - 1)) ty--;
    return ty * TS;
  }

  // ---- the frog ---------------------------------------------------------
  const P = {
    x: spawn.x, y: spawn.y, vx: 0, vy: 0, dir: 1,
    ground: false, groundT: 0, plat: null, water: null, surface: false, leaping: false, drop: 0,
    charging: false, charge: 0, jumpBuf: 0,
    hp: TUNE.maxHp, flies: 0, sac: null, invuln: 0,
    lock: null, lockT: 0, anim: 'idle', ai: 0, at: 0,
    landT: 0, spitT: 0, checkpoint: { x: spawn.x, y: spawn.y }, safe: { x: spawn.x, y: spawn.y },
  };
  const tongue = { state: 'none', dx: 1, dy: 0, len: 0, target: null, carry: null, rope: 0, up: false, held: false };

  // ---- input ------------------------------------------------------------
  const keys = {}, pressed = {}, released = {};
  const MAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'jump', KeyZ: 'jump', KeyX: 'tongue', KeyJ: 'tongue', KeyK: 'tongue',
    KeyC: 'croak', KeyE: 'talk', KeyR: 'restart', KeyG: 'debug',
  };
  function press(k) { if (!keys[k]) pressed[k] = true; keys[k] = true; }
  function release(k) { if (keys[k]) released[k] = true; keys[k] = false; }

  // ---- messages (DOM overlay) ------------------------------------------
  const ui = {};
  let dialog = null; // { npc, i }
  let toastT = 0;

  function toast(msg, t) { ui.toast.textContent = msg; ui.toast.hidden = false; toastT = t || 2.2; }
  function say(e, text, t) { e.say = text; e.sayT = t || 2.2; }

  // ---- helpers ----------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  function mouth(up) {
    const m = up ? MOUTH.up : MOUTH.fwd;
    return [P.x + P.dir * m[0], P.y + m[1]];
  }
  function setLock(anim, t) { P.lock = anim; P.lockT = t; P.anim = anim; P.ai = 0; P.at = 0; }
  const animLen = n => A[n].frames.reduce((s, f) => s + f.ms, 0) / 1000;

  // ---- collision --------------------------------------------------------
  function moveX(dx) {
    P.x += dx;
    const top = P.y - BODY_H, bot = P.y - 0.01;
    const t0 = Math.floor(top / TS), t1 = Math.floor(bot / TS);
    if (dx > 0) {
      const tx = Math.floor((P.x + HALF_W) / TS);
      for (let ty = t0; ty <= t1; ty++) if (solid(tx, ty)) { P.x = tx * TS - HALF_W; P.vx = 0; break; }
    } else if (dx < 0) {
      const tx = Math.floor((P.x - HALF_W) / TS);
      for (let ty = t0; ty <= t1; ty++) if (solid(tx, ty)) { P.x = (tx + 1) * TS + HALF_W; P.vx = 0; break; }
    }
  }
  function moveY(dy) {
    const prevBot = P.y;
    P.y += dy;
    const l = Math.floor((P.x - HALF_W) / TS), r = Math.floor((P.x + HALF_W - 0.01) / TS);
    let landed = false;
    if (dy > 0) {
      const ty = Math.floor((P.y - 0.01) / TS);
      for (let tx = l; tx <= r; tx++) {
        if (solid(tx, ty) || (oneWay(tx, ty) && prevBot <= ty * TS + 0.5 && P.drop <= 0)) {
          P.y = ty * TS; landed = true; break;
        }
      }
      if (!landed && P.vy >= 0) {
        for (const e of ents) {
          if (!e.platform || !e.alive) continue;
          const top = platTop(e);
          if (prevBot <= top + 1 && P.y >= top && Math.abs(P.x - e.x) < e.w / 2 + 2) { P.y = top; landed = true; P.plat = e; break; }
        }
      }
    } else if (dy < 0) {
      const ty = Math.floor((P.y - BODY_H) / TS);
      for (let tx = l; tx <= r; tx++) if (solid(tx, ty)) { P.y = (ty + 1) * TS + BODY_H; P.vy = 0; break; }
    }
    return landed;
  }
  function platTop(e) { return e.ch === 'M' ? e.y - 7 : e.y - 1 + e.sink; }
  function groundBelow() {
    const l = Math.floor((P.x - HALF_W) / TS), r = Math.floor((P.x + HALF_W - 0.01) / TS), ty = Math.floor((P.y + 1) / TS);
    for (let tx = l; tx <= r; tx++) if (solid(tx, ty) || oneWay(tx, ty)) return true;
    if (P.plat && Math.abs(P.x - P.plat.x) < P.plat.w / 2 + 2 && Math.abs(P.y - platTop(P.plat)) < 2) return true;
    return false;
  }

  // ---- damage & respawn -------------------------------------------------
  function hurt(fromX, n) {
    if (P.invuln > 0) return;
    P.hp -= n || 1;
    P.invuln = TUNE.invuln;
    detachTongue();
    P.charging = false;
    if (P.hp <= 0) {
      P.hp = TUNE.maxHp; P.x = P.checkpoint.x; P.y = P.checkpoint.y; P.vx = P.vy = 0;
      toast('Croaked! Back to the stump.');
      setLock('hurt', animLen('hurt'));
      return;
    }
    const away = P.x < fromX ? -1 : 1;
    P.vx = away * TUNE.hurtKnock; P.vy = -170; P.ground = false; P.plat = null;
    setLock('hurt', animLen('hurt'));
  }

  // ---- tongue -----------------------------------------------------------
  const tongueables = () => ents.filter(e => e.alive && e.kind && ['pad', 'cattail', 'ring', 'fly', 'pebble', 'beetle', 'dragonfly', 'npc'].includes(e.kind) && !(e.kind === 'pebble' && e.flying));

  function fireTongue() {
    const inAir = !P.ground && !P.water;
    let up = keys.up, down = keys.down && !up;
    void inAir;
    let dx = up || down ? P.dir * Math.SQRT1_2 : P.dir, dy = up ? -Math.SQRT1_2 : down ? Math.SQRT1_2 : 0;
    const [mx, my] = mouth(up);
    // aim assist: snap to the closest target inside a cone around the aim
    let best = null, bestA = TUNE.aimAssistDeg * Math.PI / 180;
    for (const e of tongueables()) {
      const ex = e.x - mx, ey = e.y - my, d = Math.hypot(ex, ey);
      if (d > TUNE.tongueRange + e.r || d < 4) continue;
      const a = Math.acos(clamp((ex * dx + ey * dy) / d, -1, 1));
      if (a < bestA) { bestA = a; best = e; }
    }
    if (best) { const d = dist(best.x, best.y, mx, my); dx = (best.x - mx) / d; dy = (best.y - my) / d; if (dx * P.dir < 0) P.dir = -P.dir; }
    Object.assign(tongue, { state: 'out', dx, dy, len: 0, target: null, carry: null, up: dy < -0.3, held: true });
    P.anim = tongue.up ? 'tongue_up' : 'tongue';
  }

  function detachTongue() {
    if (tongue.carry && tongue.carry.kind === 'pebble') dropPebble(tongue.carry);
    tongue.state = 'none'; tongue.target = null; tongue.carry = null;
  }

  function tongueOrigin() { return mouth(tongue.up); }
  function tongueTip() {
    const [mx, my] = tongueOrigin();
    if (tongue.target && (tongue.state === 'swing' || tongue.state === 'zip')) return [tongue.target.x, tongue.target.y];
    if (tongue.state === 'drag' && tongue.target) return [tongue.target.x, tongue.target.y - 3];
    return [mx + tongue.dx * tongue.len, my + tongue.dy * tongue.len];
  }

  function onTongueHit(e) {
    const w = e.weight;
    if (e.kind === 'npc' && e.ch !== 'M') {
      say(e, e.ch === 'T' ? 'hey!! no licking!' : 'Excuse me.', 1.6);
      tongue.state = 'reel'; return;
    }
    if (e.kind === 'beetle' && e.stun <= 0) {
      // first lick flips it over and yanks it closer
      e.stun = 4; e.dir = P.x < e.x ? -1 : 1; e.vx = (P.x - e.x) * 2.2; e.vy = -140;
      tongue.state = 'reel'; return;
    }
    if (w < FROG_W) {
      if (e.kind === 'pad') { tongue.state = 'drag'; tongue.target = e; return; }
      tongue.state = 'reel'; tongue.carry = e; e.carried = true;
      if (e.kind === 'pebble') e.resting = false;
      return;
    }
    // heavier than the frog: the frog goes to it
    tongue.target = e;
    const [mx, my] = tongueOrigin();
    if (keys.tongue) { tongue.state = 'swing'; tongue.rope = clamp(dist(e.x, e.y, P.x, P.y - 14) - 12, TUNE.ropeMin, TUNE.ropeMax); }
    else tongue.state = 'zip';
    P.ground = false; P.plat = null; P.charging = false;
    P.leaping = true;
    if (e.kind === 'cattail') e.bend = P.x < e.x ? -3 : 3;
    void mx; void my;
  }

  function deliver(e) {
    e.carried = false;
    if (e.kind === 'fly') { e.alive = false; e.respawn = 6; P.flies++; P.hp = Math.min(TUNE.maxHp, P.hp + 1); burst(P.x + P.dir * 12, P.y - 24, '#ffd84a'); }
    else if (e.kind === 'dragonfly') { e.alive = false; e.respawn = 9; P.flies += 3; burst(P.x + P.dir * 12, P.y - 24, '#7fd6ff'); toast('Dragonfly! +3'); }
    else if (e.kind === 'beetle') { e.alive = false; e.respawn = 10; P.flies += 2; toast('Crunchy. +2'); }
    else if (e.kind === 'npc' && e.ch === 'T') { e.carried = false; }
    else if (e.kind === 'pebble') {
      if (P.sac) { dropPebble(e); return; }
      e.alive = false; P.sac = e; toast('Pebble in your throat sac. X spits it.');
    }
  }

  function dropPebble(e) {
    e.carried = false; e.alive = true; e.flying = true; e.resting = false;
    e.vx = 0; e.vy = 0;
  }

  function spit() {
    const e = P.sac; P.sac = null;
    const [mx, my] = mouth(keys.up);
    e.alive = true; e.flying = true; e.resting = false; e.x = mx; e.y = my;
    if (keys.up) { e.vx = P.dir * 190; e.vy = -235; } else { e.vx = P.dir * TUNE.spit; e.vy = -70; }
    P.spitT = 0.18; P.anim = keys.up ? 'tongue_up' : 'tongue';
  }

  function updateTongue(dt) {
    if (tongue.state === 'none') return;
    if (released.tongue) tongue.held = false;
    const [mx, my] = tongueOrigin();
    if (tongue.state === 'out') {
      tongue.len += TUNE.tongueSpeed * dt;
      const [tx, ty] = tongueTip();
      for (const e of tongueables()) {
        if (dist(tx, ty, e.x, e.y) < e.r) { onTongueHit(e); break; }
      }
      if (tongue.state === 'out' && (solid(Math.floor(tx / TS), Math.floor(ty / TS)) || tongue.len >= TUNE.tongueRange)) {
        tongue.state = 'reel';
        if (tongue.len < TUNE.tongueRange) burst(tx, ty, '#d9dccb');
      }
    } else if (tongue.state === 'reel') {
      tongue.len -= TUNE.reelSpeed * dt;
      if (tongue.carry) { const [tx, ty] = tongueTip(); tongue.carry.x = tx; tongue.carry.y = ty; }
      if (tongue.len <= 4) { if (tongue.carry) deliver(tongue.carry); tongue.state = 'none'; tongue.carry = null; }
    } else if (tongue.state === 'drag') {
      // pull the pad along the surface until it's next to the frog or blocked
      const pad = tongue.target;
      const want = P.x + P.dir * (pad.w / 2 + 6);
      const step = Math.sign(want - pad.x) * Math.min(Math.abs(want - pad.x), TUNE.padPull * dt);
      const moved = movePad(pad, step);
      tongue.len = dist(pad.x, pad.y, mx, my);
      if (!moved || Math.abs(want - pad.x) < 1 || released.tongue && tongue.len < 30) { tongue.state = 'reel'; tongue.dx = (pad.x - mx) / (tongue.len || 1); tongue.dy = (pad.y - my) / (tongue.len || 1); tongue.target = null; }
    } else if (tongue.state === 'zip') {
      const e = tongue.target;
      const d = dist(e.x, e.y + 14, P.x, P.y);
      if (pressed.tongue && d > 24) { tongue.state = 'swing'; tongue.rope = clamp(d, TUNE.ropeMin, TUNE.ropeMax); }
      else if (d < 16) {
        tongue.state = 'reel'; tongue.len = 10; tongue.target = null;
        P.vy = -150; P.vx = P.dir * 60;
      } else {
        P.vx = (e.x - P.x) / d * TUNE.zipSpeed; P.vy = (e.y + 14 - P.y) / d * TUNE.zipSpeed;
      }
    } else if (tongue.state === 'swing') {
      if (!keys.tongue) {
        // snap the tongue back at once so the next anchor can be grabbed mid-air
        tongue.state = 'none'; tongue.target = null; P.vy -= 40; return;
      }
      if (keys.up) tongue.rope = Math.max(TUNE.ropeMin, tongue.rope - TUNE.reel * dt);
      if (keys.down) tongue.rope = Math.min(TUNE.ropeMax, tongue.rope + TUNE.reel * dt);
    }
  }

  function movePad(pad, dx) {
    if (!dx) return true;
    let nx = clamp(pad.x + dx, pad.span[0] + pad.w / 2, pad.span[1] - pad.w / 2);
    for (const o of ents) {
      if (o === pad || !o.platform) continue;
      if (Math.abs(o.y - pad.y) > 8) continue;
      if (Math.abs(nx - o.x) < (o.w + pad.w) / 2) nx = pad.x;
    }
    const moved = Math.abs(nx - pad.x) > 0.001;
    if (P.plat === pad) P.x += nx - pad.x;
    pad.x = nx;
    return moved;
  }

  // ---- croak ------------------------------------------------------------
  let ring = null;
  function croak() {
    setLock('croak', animLen('croak'));
    ring = { x: P.x, y: P.y - 18, r: 0, fired: false, delay: 0.35 };
  }
  function croakHits() {
    const R = TUNE.croakRadius;
    for (const e of ents) {
      if (!e.alive || dist(e.x, e.y, ring.x, ring.y) > R) continue;
      if (e.kind === 'bell' && !e.rung) { e.rung = true; world.gateOpening = true; toast('The bellflower rings. Something opened.'); }
      if (e.kind === 'npc') {
        say(e, e.npc.onCroak, 2);
        if (e.ch === 'M') e.target = P.x;
      }
      if (e.kind === 'fly') e.scatter = 1.2;
    }
    // Mossback hears further than anyone
    const m = ents.find(e => e.ch === 'M');
    if (m && Math.abs(m.x - P.x) < R * 2.2 && Math.abs(m.y - P.y) < 80) { m.target = P.x; say(m, m.npc.onCroak, 2); }
  }

  // ---- talk -------------------------------------------------------------
  function nearestNpc() {
    let best = null, bd = 34;
    for (const e of ents) if (e.kind === 'npc' && e.alive) { const d = dist(e.x, e.y, P.x, P.y - 10); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function talk() {
    const n = nearestNpc();
    if (!n) return false;
    if (dialog && dialog.npc === n) dialog.i = (dialog.i + 1) % n.npc.lines.length;
    else dialog = { npc: n, i: 0 };
    showDialog();
    return true;
  }
  function showDialog() {
    if (!dialog) { ui.dialog.hidden = true; return; }
    ui.dialogName.textContent = dialog.npc.npc.name;
    ui.dialogText.textContent = dialog.npc.npc.lines[dialog.i];
    ui.dialogMore.textContent = `${dialog.i + 1}/${dialog.npc.npc.lines.length} · ↓ or E for more`;
    ui.dialog.hidden = false;
  }

  // ---- particles --------------------------------------------------------
  const parts = [];
  function burst(x, y, col, n) {
    for (let i = 0; i < (n || 6); i++) {
      const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 60;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, t: 0.35 + Math.random() * 0.2, col });
    }
  }
  function splash(x, y) {
    for (let i = 0; i < 8; i++) parts.push({ x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 70, vy: -60 - Math.random() * 80, t: 0.5, col: '#cfeff2', g: 1 });
  }

  // =======================================================================
  // update
  // =======================================================================
  function step(dt) {
    world.time += dt;
    if (pressed.restart) { restart(); return; }
    if (pressed.debug) { ui.debug.checked = !ui.debug.checked; }

    P.invuln = Math.max(0, P.invuln - dt);
    P.drop = Math.max(0, P.drop - dt);
    P.jumpBuf = pressed.jump ? TUNE.jumpBuffer : Math.max(0, P.jumpBuf - dt);
    P.spitT = Math.max(0, P.spitT - dt);
    P.landT = Math.max(0, P.landT - dt);
    const mx = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);

    // locked animations (croak, hurt) block most input
    if (P.lock) {
      P.lockT -= dt;
      if (P.lockT <= 0) P.lock = null;
    }
    const free = !P.lock;
    const swinging = tongue.state === 'swing' || tongue.state === 'zip';

    // talk
    if (free && (pressed.talk || (pressed.down && !keys.jump && P.ground)) && !P.charging) {
      if (!talk() && pressed.talk) dialog = null;
    }
    if (dialog && dist(dialog.npc.x, dialog.npc.y, P.x, P.y - 10) > 60) { dialog = null; }
    showDialog();

    // tongue / spit
    if (free && pressed.tongue && tongue.state === 'none' && !P.charging) {
      if (P.sac) spit(); else fireTongue();
    }
    updateTongue(dt);

    // croak
    if (free && pressed.croak && (P.ground || P.surface) && tongue.state === 'none') croak();
    if (ring) {
      ring.delay -= dt;
      if (ring.delay <= 0) {
        if (!ring.fired) { ring.fired = true; croakHits(); }
        ring.r += 260 * dt;
        if (ring.r > TUNE.croakRadius) ring = null;
      }
    }

    // ---- movement ----
    const water = liquidAt(P.x, P.y - 12);
    if (water === 'm') {
      splash(P.x, P.y - 12);
      P.x = P.safe.x; P.y = P.safe.y; P.vx = P.vy = 0;
      detachTongue();
      P.invuln = 0; hurt(P.x + P.dir, 1);
      P.vx = 0; P.vy = 0;
      toast('The bog bites. Swing across instead.');
      for (const k in pressed) delete pressed[k];
      for (const k in released) delete released[k];
      return;
    }
    if (water && !P.water && P.vy > 60) splash(P.x, surfaceY(P.x, P.y - 12));
    P.water = water;

    if (swinging) {
      stepSwing(dt, mx);
    } else if (P.water) {
      stepSwim(dt, mx, free);
    } else {
      stepLand(dt, mx, free);
    }

    // platforms carry the frog
    if (P.plat) {
      if (!groundBelow()) P.plat = null;
      else { if (P.plat.dx) P.x += P.plat.dx; P.y = platTop(P.plat); }
    }

    // safe ground for bog respawns
    if (P.ground && !P.plat) {
      const tx = Math.floor(P.x / TS), ty = Math.floor((P.y + 1) / TS);
      let nearBog = false;
      for (let i = -1; i <= 1; i++) for (let j = 0; j <= 4; j++) if (tileAt(tx + i, ty + j) === 'm') nearBog = true;
      if (!nearBog) P.safe = { x: P.x, y: P.y };
    }
    P.x = clamp(P.x, HALF_W, WW - HALF_W);

    updateEntities(dt);
    parts.forEach(p => { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += 400 * dt; });
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t <= 0) parts.splice(i, 1);
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) ui.toast.hidden = true; }

    pickAnim(dt, mx);
    for (const k in pressed) delete pressed[k];
    for (const k in released) delete released[k];
  }

  function stepLand(dt, mx, free) {
    const wasGround = P.ground;
    P.ground = groundBelow() && P.vy >= 0;
    if (P.ground) P.groundT = TUNE.coyote; else P.groundT = Math.max(0, P.groundT - dt);
    const canJump = P.groundT > 0 && !P.leaping;

    // charge jump: Space down starts the crouch, release launches
    if (free && P.jumpBuf > 0 && canJump && !P.charging && tongue.state === 'none') {
      if (keys.down && onOneWay()) { P.drop = 0.25; P.jumpBuf = 0; P.ground = false; P.y += 1; }
      else { P.charging = true; P.charge = 0; P.jumpBuf = 0; }
    }
    if (P.charging) {
      P.charge += dt;
      P.vx *= Math.pow(0.001, dt);
      if (!keys.jump || !free) {
        const k = clamp(P.charge / TUNE.chargeTime, 0, 1);
        const big = k > 0.25;
        P.vy = -(TUNE.hop + (TUNE.leap - TUNE.hop) * k);
        P.vx = mx * TUNE.walk * (big ? 1.3 : 1);
        if (mx) P.dir = mx;
        P.charging = false; P.ground = false; P.plat = null; P.leaping = true; P.groundT = 0;
        P.anim = 'jump'; P.ai = 2; P.at = 0;
        dust(P.x, P.y, big ? 2 : 1);
      }
    } else if (P.ground) {
      if (free && tongue.state !== 'drag') {
        P.vx = mx * TUNE.walk;
        if (mx) P.dir = mx;
      } else if (!free && P.lock !== 'hurt') P.vx = 0;
      else P.vx *= Math.pow(0.02, dt);
      if (tongue.state === 'out' || tongue.state === 'reel' || tongue.state === 'drag' || P.spitT > 0) P.vx = 0;
    } else {
      if (free && mx) { P.vx += (mx * TUNE.walk * 1.15 - P.vx) * Math.min(1, TUNE.airAccel * dt); }
    }

    if (!P.ground) P.vy = Math.min(TUNE.maxFall, P.vy + TUNE.gravity * dt);
    moveX(P.vx * dt);
    const fallV = P.vy;
    const landed = moveY(P.vy * dt);
    if (landed) {
      if (!wasGround && fallV > 280) { P.landT = 0.22; dust(P.x, P.y, 2); }
      P.vy = 0; P.ground = true; P.leaping = false;
    }
    if (!landed && P.vy >= 0 && !groundBelow()) P.plat = null;
  }

  function onOneWay() {
    const ty = Math.floor((P.y + 1) / TS);
    const l = Math.floor((P.x - HALF_W) / TS), r = Math.floor((P.x + HALF_W - 0.01) / TS);
    let any = false;
    for (let tx = l; tx <= r; tx++) { if (solid(tx, ty)) return false; if (oneWay(tx, ty)) any = true; }
    return any;
  }

  function stepSwim(dt, mx, free) {
    P.ground = false; P.plat = null; P.charging = false;
    const surf = surfaceY(P.x, P.y - 12);
    const floatY = surf + 15;
    const leaving = P.leaping && P.vy < 0;
    if (!leaving) P.leaping = false;
    if (free) {
      if (mx) P.dir = mx;
      P.vx += (mx * TUNE.swim - P.vx) * Math.min(1, 6 * dt);
      const want = keys.down ? TUNE.swimUp : keys.up ? -TUNE.swimUp : -TUNE.float;
      if (!leaving) P.vy += (want - P.vy) * Math.min(1, 5 * dt);
    }
    P.surface = !leaving && P.y <= floatY + 1;
    if (free && P.surface && P.jumpBuf > 0) {
      P.vy = -TUNE.surfaceHop; P.leaping = true; P.jumpBuf = 0; P.surface = false;
      splash(P.x, surf); P.anim = 'jump'; P.ai = 2; P.at = 0;
    }
    if (P.leaping) P.vy += TUNE.gravity * dt;
    moveX(P.vx * dt);
    moveY(P.vy * dt);
    if (!P.leaping && P.y < floatY) { P.y = floatY; if (P.vy < 0) P.vy = 0; }
  }

  function stepSwing(dt, mx) {
    const e = tongue.target;
    P.ground = false; P.plat = null;
    if (!e || !e.alive) { detachTongue(); return; }
    if (tongue.state === 'zip') {
      moveX(P.vx * dt); moveY(P.vy * dt);
      return;
    }
    // pendulum: gravity, pumping, then keep the frog on the rope's circle
    P.vy += TUNE.gravity * dt;
    const px = P.x, py = P.y - 14;
    let rx = px - e.x, ry = py - e.y;
    const d0 = Math.hypot(rx, ry) || 1;
    const tx = -ry / d0, ty = rx / d0; // tangent
    if (mx) { const s = tx < 0 ? -mx : mx; P.vx += tx * s * TUNE.swingPump * dt; P.vy += ty * s * TUNE.swingPump * dt; P.dir = mx; }
    P.vx *= Math.pow(0.85, dt);
    moveX(P.vx * dt); moveY(P.vy * dt);
    rx = P.x - e.x; ry = P.y - 14 - e.y;
    const d = Math.hypot(rx, ry) || 1;
    if (d > tongue.rope) {
      const nx = rx / d, ny = ry / d;
      P.x = e.x + nx * tongue.rope; P.y = e.y + 14 + ny * tongue.rope;
      const radial = P.vx * nx + P.vy * ny;
      if (radial > 0) { P.vx -= radial * nx; P.vy -= radial * ny; }
      moveX(0); moveY(0);
    }
    if (Math.abs(P.vx) > 20) P.dir = Math.sign(P.vx);
    if (pressed.jump) {
      tongue.state = 'none'; tongue.target = null;
      P.vy = Math.min(P.vy, 0) - 170; P.leaping = true;
    }
  }

  function dust(x, y, n) {
    for (let i = 0; i < n * 3; i++) parts.push({ x: x + (Math.random() - 0.5) * 14, y: y - 1, vx: (Math.random() - 0.5) * 50, vy: -10 - Math.random() * 20, t: 0.3, col: '#d9dccb' });
  }

  // ---- entities ---------------------------------------------------------
  function updateEntities(dt) {
    for (const e of ents) {
      e.t += dt;
      if (e.sayT > 0) { e.sayT -= dt; if (e.sayT <= 0) e.say = null; }
      if (!e.alive) {
        if (e.respawn != null) { e.respawn -= dt; if (e.respawn <= 0) { e.alive = true; e.respawn = null; e.x = e.x0; e.y = e.kind === 'fly' ? e.y0 - 8 : e.kind === 'dragonfly' ? e.y0 - 8 : e.y0; e.stun = 0; } }
        continue;
      }
      if (e.carried) continue;
      e.dx = 0;
      switch (e.kind) {
        case 'fly': {
          if (e.scatter > 0) e.scatter -= dt;
          const s = e.scatter > 0 ? 3 : 1;
          e.x = e.x0 + Math.sin(e.t * 1.3 * s) * 7 * s; e.y = e.y0 - 8 + Math.sin(e.t * 2.7 * s) * 3;
          break;
        }
        case 'dragonfly': {
          e.x = e.x0 + Math.sin(e.t * 0.9) * 34; e.y = e.y0 - 8 + Math.sin(e.t * 1.8) * 12;
          e.face = Math.cos(e.t * 0.9) >= 0 ? 1 : -1;
          if (touching(e)) hurt(e.x, 1);
          break;
        }
        case 'pad': {
          const on = P.plat === e;
          e.sink += ((on ? 2 : 0) - e.sink) * Math.min(1, 10 * dt);
          e.bob = Math.sin(e.t * 2) * 0.6;
          break;
        }
        case 'cattail': e.bend = (e.bend || 0) * Math.pow(0.1, dt); break;
        case 'beetle': stepBeetle(e, dt); break;
        case 'pebble': stepPebble(e, dt); break;
        case 'stump':
          if (Math.abs(P.x - e.x) < 12 && Math.abs(P.y - e.y) < 20 && P.checkpoint.x !== e.x) {
            P.checkpoint = { x: e.x, y: e.y }; P.hp = TUNE.maxHp; e.lit = 1; toast('Checkpoint. Health refilled.');
          }
          break;
        case 'sign': break;
        case 'npc':
          if (e.ch === 'T') { e.x = e.x0 + Math.sin(e.t * 0.7) * 30; e.y = e.y0 - 8 + Math.sin(e.t * 1.9) * 4; e.face = Math.cos(e.t * 0.7) >= 0 ? 1 : -1; }
          if (e.ch === 'M') stepTurtle(e, dt);
          break;
      }
    }
    if (world.gateOpening && world.gateOpen < 1) world.gateOpen = Math.min(1, world.gateOpen + dt * 0.8);
    if (world.bridgeDropping && world.bridge < 1) world.bridge = Math.min(1, world.bridge + dt * 1.5);
  }

  function touching(e) {
    return Math.abs(P.x - e.x) < HALF_W + e.r * 0.7 && e.y > P.y - BODY_H - 4 && e.y < P.y + 4;
  }

  function stepBeetle(e, dt) {
    if (e.stun > 0) {
      e.stun -= dt;
      e.vy = (e.vy || 0) + 600 * dt;
      e.x += (e.vx || 0) * dt; e.vx = (e.vx || 0) * Math.pow(0.05, dt);
      e.y += e.vy * dt;
      const ty = Math.floor(e.y / TS);
      if (solid(Math.floor(e.x / TS), ty)) { e.y = ty * TS; e.vy = 0; }
      return;
    }
    const nx = e.x + e.dir * 20 * dt;
    const ahead = Math.floor((nx + e.dir * 7) / TS), ty = Math.floor((e.y - 4) / TS);
    if (solid(ahead, ty) || !solid(ahead, ty + 1)) e.dir = -e.dir; else e.x = nx;
    if (touching(e)) hurt(e.x, 1);
  }

  function stepPebble(e, dt) {
    if (e.resting || !e.flying) return;
    const inWater = liquidAt(e.x, e.y);
    e.vy += (inWater ? 150 : 520) * dt;
    if (inWater) { e.vx *= Math.pow(0.1, dt); e.vy = Math.min(e.vy, 50); }
    const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
    if (inWater === 'm') { e.x = e.x0; e.y = e.y0; e.flying = false; e.resting = true; e.vx = e.vy = 0; toast('The bog swallowed the pebble. It washed back to the pond.'); return; }
    // target
    for (const t of byKind('target')) {
      if (!t.hit && dist(nx, ny, t.x, t.y) < t.r + 2) {
        t.hit = true; world.bridgeDropping = true; burst(t.x, t.y, '#ffd84a', 10);
        toast('Bullseye! The drawbridge drops.'); e.vx = -e.vx * 0.3;
      }
    }
    for (const b of byKind('beetle')) {
      if (b.alive && b.stun <= 0 && dist(nx, ny, b.x, b.y - 4) < 9) { b.stun = 4; b.vy = -120; b.vx = e.vx * 0.3; e.vx = -e.vx * 0.3; }
    }
    if (solid(Math.floor(nx / TS), Math.floor((e.y - 2) / TS))) e.vx = -e.vx * 0.3; else e.x = nx;
    const ftx = Math.floor(e.x / TS), fty = Math.floor(ny / TS);
    if (e.vy > 0 && (solid(ftx, fty) || (oneWay(ftx, fty) && e.y <= fty * TS + 0.5))) {
      e.y = fty * TS; e.vy = 0; e.vx = 0; e.flying = false; e.resting = true;
    } else if (e.vy < 0 && solid(ftx, Math.floor((ny - 4) / TS))) e.vy = 0;
    else e.y = ny;
    if (e.y > WH) { e.x = e.x0; e.y = e.y0; e.flying = false; e.resting = true; }
  }

  function stepTurtle(e, dt) {
    const [l, r] = e.span;
    let v;
    if (e.target != null) {
      const d = e.target - e.x;
      v = Math.sign(d) * Math.min(Math.abs(d) / dt, 34);
      if (Math.abs(d) < 2) e.target = null;
    } else {
      v = e.dir * 12;
    }
    let nx = clamp(e.x + v * dt, l + e.w / 2, r - e.w / 2);
    if (nx === l + e.w / 2 || nx === r - e.w / 2) { e.dir = -e.dir; if (e.target != null && Math.abs(e.target - nx) > 2) e.target = null; }
    for (const o of byKind('pad')) if (Math.abs(nx - o.x) < (o.w + e.w) / 2 && Math.abs(o.y - e.y) < 8) { nx = e.x; e.dir = Math.sign(e.x - o.x) || 1; e.target = null; }
    e.dx = nx - e.x;
    e.x = nx;
    if (e.dx) e.face = Math.sign(e.dx);
  }

  // ---- animation selection ---------------------------------------------
  function pickAnim(dt, mx) {
    let want, rate = 1, pin = null;
    const tongueBusy = tongue.state === 'out' || tongue.state === 'reel' || tongue.state === 'drag';
    if (P.lock) want = P.lock;
    else if (tongue.state === 'swing' || tongue.state === 'zip') { want = 'jump'; pin = 3; }
    else if (tongueBusy || P.spitT > 0) { want = tongue.up ? 'tongue_up' : 'tongue'; pin = 1; }
    else if (P.charging) { want = 'jump'; pin = P.charge > 0.12 ? 1 : 0; }
    else if (P.water && !P.leaping) {
      const moving = Math.abs(P.vx) > 8 || Math.abs(P.vy) > 30 || !P.surface;
      if (moving) { want = 'swim'; } else want = 'idle';
    } else if (!P.ground) {
      if (P.anim === 'jump' && P.vy < 0) want = 'jump';
      else want = 'fall';
    } else if (P.landT > 0) want = 'land';
    else if (Math.abs(P.vx) > 4) { want = 'walk'; rate = Math.abs(P.vx) / A.walk.speed; }
    else want = 'idle';

    if (want === 'swim') {
      // kick cycle from existing frames: legs trailing, then tucked
      P.anim = 'swim'; P.at += dt;
      P.frame = Math.floor(P.at / 0.16) % 2 ? A.jump.frames[3] : A.fall.frames[0];
      return;
    }
    if (want !== P.anim) { P.anim = want; P.ai = want === 'jump' ? 2 : 0; P.at = 0; }
    const fr = A[P.anim].frames;
    if (pin != null) { P.ai = pin; }
    else {
      P.at += dt * 1000 * rate;
      while (P.at >= fr[P.ai].ms) {
        P.at -= fr[P.ai].ms;
        if (P.ai < fr.length - 1) P.ai++;
        else if (A[P.anim].loop) P.ai = 0;
        else { P.at = 0; break; }
      }
    }
    P.frame = fr[Math.min(P.ai, fr.length - 1)];
  }

  // =======================================================================
  // drawing
  // =======================================================================
  const canvas = document.getElementById('swamp');
  const g = canvas.getContext('2d');
  canvas.width = VW; canvas.height = VH;
  const cam = { x: 0, y: 0 };

  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // parallax layers, drawn once
  const far = document.createElement('canvas'); far.width = WW * 0.35 + VW; far.height = VH;
  (function () {
    const b = far.getContext('2d');
    const sky = ['#88c3d4', '#9dcfda', '#b2dade', '#c5e3dc', '#d5eadb'];
    sky.forEach((c, i) => { b.fillStyle = c; b.fillRect(0, i * 26, far.width, 26); });
    b.fillStyle = '#dcefe0'; b.fillRect(0, 130, far.width, VH - 130);
    b.fillStyle = '#86b393';
    for (let x = 0; x < far.width; x++) { const h = 34 + Math.round(10 * Math.sin(x / 23) + 6 * Math.sin(x / 7.7)); b.fillRect(x, 150 - h, 1, h + 70); }
    b.fillStyle = '#6f9e7b';
    for (let x = 0; x < far.width; x++) { const h = 16 + Math.round(8 * Math.sin(x / 13 + 1) + 3 * Math.sin(x / 4.3)); b.fillRect(x, 160 - h, 1, h + 60); }
    // dead trees
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(rnd() * far.width), h = 40 + Math.floor(rnd() * 40);
      b.fillStyle = '#5c826a'; b.fillRect(x, 150 - h, 3, h);
      b.fillRect(x - 6, 150 - h + 10, 7, 1); b.fillRect(x + 3, 150 - h + 18, 8, 1);
    }
  })();

  const terrain = document.createElement('canvas'); terrain.width = WW; terrain.height = WH;
  (function paintTerrain() {
    const b = terrain.getContext('2d');
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const c = grid[ty][tx], x = tx * TS, y = ty * TS;
      if (c === '#') {
        const above = tileAt(tx, ty - 1);
        const wet = above === 'w' || above === 'm' || isLiquidTile(tx, ty - 1);
        b.fillStyle = wet ? '#4a3a24' : '#6b4a2e'; b.fillRect(x, y, TS, TS);
        b.fillStyle = wet ? '#3d301d' : '#5a3d24';
        for (let i = 0; i < 4; i++) b.fillRect(x + Math.floor(rnd() * 14), y + Math.floor(rnd() * 14), 2, 1);
        if (!solidChar(above) && above !== '=' && !wet) {
          b.fillStyle = '#6fbf4a'; b.fillRect(x, y, TS, 3);
          b.fillStyle = '#4d9a3a'; b.fillRect(x, y + 3, TS, 1);
          for (let i = 0; i < 5; i++) { b.fillStyle = '#6fbf4a'; b.fillRect(x + Math.floor(rnd() * 16), y - 1 - Math.floor(rnd() * 2), 1, 2); }
        }
        if (wet) { b.fillStyle = '#5b6b35'; b.fillRect(x, y, TS, 2); }
        // side edges
        if (!solidChar(tileAt(tx - 1, ty))) { b.fillStyle = '#4e3520'; b.fillRect(x, y, 1, TS); }
        if (!solidChar(tileAt(tx + 1, ty))) { b.fillStyle = '#4e3520'; b.fillRect(x + TS - 1, y, 1, TS); }
      } else if (c === '|') {
        b.fillStyle = '#5a3a1e'; b.fillRect(x + 6, y, 4, TS);
        b.fillStyle = '#7a5230'; b.fillRect(x + 6, y, 1, TS);
      } else if (c === '=') {
        b.fillStyle = '#8a5a2b'; b.fillRect(x, y, TS, 5);
        b.fillStyle = '#a8743d'; b.fillRect(x, y, TS, 1);
        b.fillStyle = '#5e3a1a'; b.fillRect(x, y + 5, TS, 1); b.fillRect(x + (tx % 2 ? 15 : 7), y, 1, 5);
        b.fillStyle = '#3d2a14'; b.fillRect(x + 2, y + 2, 1, 1); b.fillRect(x + 13, y + 2, 1, 1);
      } else if (c === '-') {
        b.fillStyle = '#4b3520'; b.fillRect(x, y + 6, TS, 4);
        b.fillStyle = '#65482b'; b.fillRect(x, y + 6, TS, 1);
        if (rnd() > 0.5) { b.fillStyle = '#5f8a4a'; b.fillRect(x + Math.floor(rnd() * 12), y + 10, 2, 3 + Math.floor(rnd() * 6)); }
      }
    }
  })();
  function solidChar(c) { return c === '#'; }

  function draw() {
    // camera follows with a little look-ahead, clamped to the room
    const lx = P.x + P.dir * 30 - VW / 2, ly = P.y - 30 - VH / 2;
    cam.x += (clamp(lx, 0, WW - VW) - cam.x) * 0.12;
    cam.y += (clamp(ly, 0, WH - VH) - cam.y) * 0.12;
    const cx = Math.round(cam.x), cy = Math.round(cam.y);

    g.drawImage(far, -Math.round(cx * 0.35), 0);
    g.save(); g.translate(-cx, -cy);

    // dynamic tiles behind everything else
    drawGate(); drawBridge();
    g.drawImage(terrain, 0, 0);
    for (const e of ents) if (e.kind === 'cattail') drawCattail(e);
    for (const e of ents) if (e.alive && e.kind !== 'cattail') drawEntity(e);
    drawTongue();
    drawFrog();
    for (const e of ents) if (e.alive && e.kind === 'pebble' && e.carried) drawEntity(e);
    drawWater();
    for (const p of parts) { g.fillStyle = p.col; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    if (ring && ring.fired) drawRing();
    if (ui.debug.checked) drawDebug();
    g.restore();
    placeBubbles(cx, cy);
    updateHud();
  }

  function drawFrog() {
    if (P.invuln > 0 && Math.floor(P.invuln * 12) % 2) return;
    const fr = P.frame || A.idle.frames[0];
    g.save();
    g.translate(Math.round(P.x), 0); g.scale(P.dir, 1);
    g.drawImage(fr.img, -F.ORIGIN_X, Math.round(P.y) - F.ORIGIN_Y);
    g.restore();
    if (P.charging) {
      const k = clamp(P.charge / TUNE.chargeTime, 0, 1);
      g.fillStyle = '#12301c'; g.fillRect(Math.round(P.x) - 9, Math.round(P.y) + 3, 18, 3);
      g.fillStyle = k >= 1 ? '#ffd84a' : '#a5e05a'; g.fillRect(Math.round(P.x) - 8, Math.round(P.y) + 4, Math.round(16 * k), 1);
    }
  }

  function drawTongue() {
    if (tongue.state === 'none') return;
    const [ox, oy] = tongueOrigin();
    const [tx, ty] = tongueTip();
    const d = Math.hypot(tx - ox, ty - oy);
    const n = Math.max(1, Math.ceil(d));
    const swing = tongue.state === 'swing';
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const sag = swing ? 0 : Math.sin(t * Math.PI) * (tongue.state === 'reel' ? 3 : 0);
      const x = Math.round(ox + (tx - ox) * t), y = Math.round(oy + (ty - oy) * t + sag);
      g.fillStyle = '#0e1a12'; g.fillRect(x - 1, y - 1, 3, 4);
    }
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const sag = swing ? 0 : Math.sin(t * Math.PI) * (tongue.state === 'reel' ? 3 : 0);
      const x = Math.round(ox + (tx - ox) * t), y = Math.round(oy + (ty - oy) * t + sag);
      g.fillStyle = '#ff5f7e'; g.fillRect(x, y, 1, 2);
      g.fillStyle = '#ffb3c1'; g.fillRect(x, y, 1, 1);
    }
    const x = Math.round(tx), y = Math.round(ty);
    g.fillStyle = '#0e1a12'; g.fillRect(x - 3, y - 2, 6, 5); g.fillRect(x - 2, y - 3, 4, 7);
    g.fillStyle = '#ff5f7e'; g.fillRect(x - 2, y - 2, 4, 4);
    g.fillStyle = '#ffb3c1'; g.fillRect(x - 2, y - 2, 2, 1);
    g.fillStyle = '#c12f4f'; g.fillRect(x - 1, y + 1, 3, 1);
  }

  function drawWater() {
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const l = isLiquidTile(tx, ty);
      if (!l) continue;
      const x = tx * TS, y = ty * TS;
      const top = !isLiquidTile(tx, ty - 1);
      if (l === 'w') {
        g.fillStyle = 'rgba(46,128,146,0.55)'; g.fillRect(x, y + (top ? 2 : 0), TS, TS - (top ? 2 : 0));
        if (top) {
          g.fillStyle = 'rgba(160,220,225,0.9)';
          const off = Math.floor(world.time * 6 + tx * 5) % TS;
          g.fillRect(x, y + 2, TS, 1);
          g.fillStyle = 'rgba(210,245,245,0.9)'; g.fillRect(x + off, y + 2, 3, 1);
        }
        if (ty === ROWS - 2 || tileAt(tx, ty + 1) === '#') { g.fillStyle = 'rgba(30,80,70,0.35)'; g.fillRect(x, y + TS - 3, TS, 3); }
      } else {
        g.fillStyle = 'rgba(64,58,24,0.88)'; g.fillRect(x, y + (top ? 2 : 0), TS, TS - (top ? 2 : 0));
        if (top) {
          g.fillStyle = '#7d7a2e'; g.fillRect(x, y + 2, TS, 1);
          const b = (world.time * 0.7 + tx * 0.37) % 1;
          if (b < 0.3) { g.fillStyle = '#9a9640'; g.fillRect(x + (tx * 7) % 13, y + 1 - Math.floor(b * 6), 2, 2); }
        }
      }
    }
  }

  function drawGate() {
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      if (grid[ty][tx] !== 'G') continue;
      const x = tx * TS, y = ty * TS - Math.round(world.gateOpen * 90);
      g.fillStyle = '#5e3a1a'; g.fillRect(x + 1, y, 14, TS);
      g.fillStyle = '#8a5a2b'; g.fillRect(x + 2, y, 3, TS); g.fillRect(x + 7, y, 3, TS); g.fillRect(x + 12, y, 2, TS);
      g.fillStyle = '#3d2a14'; g.fillRect(x + 1, y + 6, 14, 2);
    }
  }
  function drawBridge() {
    let i = 0;
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      if (grid[ty][tx] !== 'd') continue;
      const x = tx * TS, y = ty * TS;
      const shown = clamp(world.bridge * 5 - i, 0, 1); i++;
      if (shown <= 0) {
        if (ui.debug.checked) { g.strokeStyle = 'rgba(255,255,255,.4)'; g.strokeRect(x + 0.5, y + 0.5, TS - 1, 4); }
        continue;
      }
      const yy = y - Math.round((1 - shown) * 30);
      g.fillStyle = '#8a5a2b'; g.fillRect(x, yy, TS, 5);
      g.fillStyle = '#a8743d'; g.fillRect(x, yy, TS, 1);
      g.fillStyle = '#5e3a1a'; g.fillRect(x, yy + 5, TS, 1); g.fillRect(x + 7, yy, 1, 5);
    }
    // rope from the ledge
    if (world.bridge > 0) { g.fillStyle = '#c9a94a'; for (let k = 0; k < 18; k++) g.fillRect(91 * TS + 14 - k * 2, 7 * TS + k, 1, 1); }
  }

  function drawCattail(e) {
    const bend = e.bend || 0, sway = Math.sin(e.t * 1.4) * 1.2 + bend;
    const top = e.headY, bot = e.base;
    for (let y = top; y < bot; y++) {
      const k = (bot - y) / (bot - top);
      const x = Math.round(e.x0 + sway * k * k);
      g.fillStyle = '#3d6b3a'; g.fillRect(x, y, 1, 1);
      g.fillStyle = '#5b8f4a'; g.fillRect(x + 1, y, 1, 1);
    }
    // leaves
    g.fillStyle = '#4d7f45';
    for (let i = 0; i < 14; i++) { g.fillRect(e.x0 - 3 - Math.floor(i / 3), bot - 16 - i, 1, 1); g.fillRect(e.x0 + 3 + Math.floor(i / 4), bot - 12 - i, 1, 1); }
    const hx = Math.round(e.x0 + sway);
    e.x = hx + 1; e.y = top + 5;
    g.fillStyle = '#2e1d0e'; g.fillRect(hx - 2, top - 1, 6, 13);
    g.fillStyle = '#6b4424'; g.fillRect(hx - 1, top, 4, 11);
    g.fillStyle = '#8a5a2b'; g.fillRect(hx - 1, top + 1, 1, 8);
    g.fillStyle = '#5b8f4a'; g.fillRect(hx, top - 4, 1, 3);
  }

  function drawEntity(e) {
    const x = Math.round(e.x), y = Math.round(e.y), t = e.t;
    switch (e.kind) {
      case 'fly': {
        const flap = Math.floor(t * 16) % 2;
        g.fillStyle = '#e8f4f4'; g.fillRect(x - 2, y - 3 - flap, 2, 1 + flap); g.fillRect(x + 1, y - 3 - flap, 2, 1 + flap);
        g.fillStyle = '#1b1f22'; g.fillRect(x - 2, y - 1, 5, 2);
        g.fillStyle = '#b8323f'; g.fillRect(x + 2, y - 1, 1, 1);
        break;
      }
      case 'dragonfly': {
        const f = e.face || 1, flap = Math.floor(t * 20) % 2;
        g.fillStyle = 'rgba(220,245,255,.85)'; g.fillRect(x - 4, y - 3 - flap, 7, 1); g.fillRect(x - 3, y + 1 + flap, 6, 1);
        g.fillStyle = '#0e1a12'; g.fillRect(x - 8 * f - (f < 0 ? 0 : 0), y - 1, 1, 1);
        g.fillStyle = '#2a6fb0';
        for (let i = 0; i < 12; i++) g.fillRect(x - f * (6 - i), y, 1, 1);
        g.fillStyle = '#7fd6ff'; g.fillRect(x + f * 5, y - 1, 2, 2);
        g.fillStyle = '#0e1a12'; g.fillRect(x + f * 6, y - 1, 1, 1);
        break;
      }
      case 'pad': {
        const yy = Math.round(e.y + (e.bob || 0) + e.sink);
        const w = e.w;
        g.fillStyle = '#1f4a2a'; g.fillRect(x - w / 2, yy - 1, w, 4);
        g.fillStyle = '#3f8a3a'; g.fillRect(x - w / 2 + 1, yy - 2, w - 2, 3);
        g.fillStyle = '#6fbf4a'; g.fillRect(x - w / 2 + 3, yy - 2, w - 8, 1);
        g.fillStyle = 'rgba(46,128,146,1)'; g.fillRect(x + 3, yy - 2, 2, 3); // notch
        if (e.tx % 2) { g.fillStyle = '#f0a8c8'; g.fillRect(x - 7, yy - 5, 3, 3); g.fillStyle = '#fff2f6'; g.fillRect(x - 6, yy - 6, 1, 2); }
        break;
      }
      case 'ring': {
        g.fillStyle = '#6b5a3a'; for (let yy = 4 * TS + 10; yy < y - 4; yy++) g.fillRect(x, yy, 1, 1);
        g.fillStyle = '#0e1a12'; g.fillRect(x - 4, y - 4, 9, 9);
        g.fillStyle = '#c9a94a'; g.fillRect(x - 3, y - 3, 7, 7);
        g.fillStyle = '#0e1a12'; g.fillRect(x - 1, y - 1, 3, 3);
        g.fillStyle = '#f1e3a0'; g.fillRect(x - 3, y - 3, 2, 1);
        break;
      }
      case 'pebble': {
        g.fillStyle = '#0e1a12'; g.fillRect(x - 3, y - 4, 7, 5);
        g.fillStyle = '#9aa0a6'; g.fillRect(x - 2, y - 3, 5, 3);
        g.fillStyle = '#d0d6da'; g.fillRect(x - 2, y - 3, 2, 1);
        if (e.resting && !e.carried && Math.floor(t * 3) % 2) { g.fillStyle = '#ffffff'; g.fillRect(x + 2, y - 6, 1, 1); }
        break;
      }
      case 'beetle': {
        const flip = e.stun > 0;
        const yy = y - 4;
        g.fillStyle = '#0e1a12'; g.fillRect(x - 7, yy - 4, 14, 7);
        g.fillStyle = flip ? '#b8a07a' : '#2b3a66'; g.fillRect(x - 6, yy - 3, 12, 5);
        g.fillStyle = flip ? '#e0cfa8' : '#5a78c0'; g.fillRect(x - 5, yy - 3, 5, 1);
        g.fillStyle = '#0e1a12';
        const leg = Math.floor(t * 10) % 2;
        if (flip) for (let i = -4; i <= 4; i += 4) g.fillRect(x + i, yy - 6 - (leg ? 1 : 0), 1, 2);
        else { for (let i = -4; i <= 4; i += 4) g.fillRect(x + i + (leg ? 1 : 0), yy + 3, 1, 2); g.fillRect(x + e.dir * 7, yy - 1, 2, 2); }
        break;
      }
      case 'bell': {
        g.fillStyle = '#3d6b3a'; g.fillRect(x, y - 16, 1, 16);
        g.fillStyle = '#4d7f45'; g.fillRect(x - 3, y - 6, 3, 1); g.fillRect(x + 1, y - 9, 3, 1);
        const swing = e.rung ? Math.round(Math.sin(t * 8) * 1.5) : 0;
        g.fillStyle = '#0e1a12'; g.fillRect(x - 4 + swing, y - 22, 9, 8);
        g.fillStyle = e.rung ? '#ffd84a' : '#8b5bd6'; g.fillRect(x - 3 + swing, y - 21, 7, 6);
        g.fillStyle = e.rung ? '#fff3b0' : '#b995f0'; g.fillRect(x - 3 + swing, y - 21, 3, 1);
        g.fillStyle = '#0e1a12'; g.fillRect(x - 4 + swing, y - 15, 9, 1);
        if (e.rung && Math.floor(t * 4) % 2) { g.fillStyle = '#ffd84a'; g.fillRect(x - 7, y - 25, 1, 1); g.fillRect(x + 7, y - 23, 1, 1); }
        break;
      }
      case 'target': {
        g.fillStyle = '#0e1a12'; g.fillRect(x - 6, y - 6, 12, 12);
        g.fillStyle = e.hit ? '#6fbf4a' : '#f1e3a0'; g.fillRect(x - 5, y - 5, 10, 10);
        g.fillStyle = e.hit ? '#2f7a35' : '#d8385d'; g.fillRect(x - 3, y - 3, 6, 6);
        g.fillStyle = e.hit ? '#a5e05a' : '#f1e3a0'; g.fillRect(x - 1, y - 1, 2, 2);
        break;
      }
      case 'stump': {
        g.fillStyle = '#0e1a12'; g.fillRect(x - 8, y - 11, 16, 11);
        g.fillStyle = '#6b4424'; g.fillRect(x - 7, y - 10, 14, 10);
        g.fillStyle = '#c9a94a'; g.fillRect(x - 6, y - 10, 12, 3);
        g.fillStyle = '#8a5a2b'; g.fillRect(x - 3, y - 9, 6, 1);
        if (P.checkpoint.x === e.x) { g.fillStyle = Math.floor(t * 3) % 2 ? '#ffd84a' : '#fff3b0'; g.fillRect(x - 1, y - 15, 2, 2); g.fillRect(x - 4, y - 13, 1, 1); g.fillRect(x + 4, y - 14, 1, 1); }
        break;
      }
      case 'sign': {
        g.fillStyle = '#5a3a1e'; g.fillRect(x - 1, y - 12, 2, 12);
        g.fillStyle = '#0e1a12'; g.fillRect(x - 8, y - 20, 16, 10);
        g.fillStyle = '#c9975a'; g.fillRect(x - 7, y - 19, 14, 8);
        g.fillStyle = '#5a3a1e'; g.fillRect(x - 5, y - 17, 10, 1); g.fillRect(x - 5, y - 14, 7, 1);
        g.fillStyle = '#f1e3a0'; g.font = '6px monospace';
        break;
      }
      case 'npc': drawNpc(e); break;
    }
  }

  function drawNpc(e) {
    const x = Math.round(e.x), y = Math.round(e.y), t = e.t;
    const blink = Math.floor(t * 10) % 37 === 0;
    if (e.ch === 'E') { // Elder Toad: squat, warty, with a reed cane
      const b = Math.round(Math.sin(t * 2) * 0.6);
      g.fillStyle = '#0e1a12'; g.fillRect(x - 12, y - 14 + b, 24, 14 - b);
      g.fillStyle = '#7a6a3a'; g.fillRect(x - 11, y - 13 + b, 22, 13 - b);
      g.fillStyle = '#9a8a4a'; g.fillRect(x - 10, y - 13 + b, 14, 2);
      g.fillStyle = '#d9c78a'; g.fillRect(x - 6, y - 5, 14, 5);
      g.fillStyle = '#5a4a2a'; [[-8, -9], [-4, -11], [2, -10], [-9, -5]].forEach(([dx, dy]) => g.fillRect(x + dx, y + dy + b, 2, 1));
      // eyes
      g.fillStyle = '#0e1a12'; g.fillRect(x + 1, y - 18 + b, 6, 5); g.fillRect(x + 7, y - 17 + b, 5, 5);
      g.fillStyle = blink ? '#7a6a3a' : '#f1c84a'; g.fillRect(x + 2, y - 17 + b, 4, 3); g.fillRect(x + 8, y - 16 + b, 3, 3);
      if (!blink) { g.fillStyle = '#0e1a12'; g.fillRect(x + 3, y - 16 + b, 3, 1); g.fillRect(x + 8, y - 15 + b, 3, 1); }
      g.fillStyle = '#3d301d'; g.fillRect(x + 4, y - 8 + b, 8, 1);
      // cane
      g.fillStyle = '#8a5a2b'; g.fillRect(x + 14, y - 20, 1, 20); g.fillStyle = '#6b4424'; g.fillRect(x + 12, y - 21, 3, 2);
      g.fillStyle = '#0e1a12'; g.fillRect(x + 11, y - 9, 4, 2);
    } else if (e.ch === 'T') { // Tad: tadpole with a wiggling tail
      const f = e.face || 1, w = Math.round(Math.sin(t * 12) * 1.5);
      g.fillStyle = '#0e1a12'; g.fillRect(x - 3, y - 3, 7, 6);
      g.fillStyle = '#3b3b2a'; g.fillRect(x - 2, y - 2, 5, 4);
      for (let i = 1; i < 8; i++) { g.fillStyle = '#3b3b2a'; g.fillRect(x - f * (3 + i), y + Math.round(w * i / 7), 1, i < 5 ? 2 : 1); }
      g.fillStyle = '#f1e3a0'; g.fillRect(x + f * 1, y - 2, 1, 1);
      g.fillStyle = '#6a6a4a'; g.fillRect(x - 1, y - 2, 2, 1);
    } else if (e.ch === 'M') { // Mossback: a turtle whose shell is a moving platform
      const f = e.face || 1, p = Math.floor(t * 4) % 2;
      const top = Math.round(platTop(e));
      g.fillStyle = '#2a4a3a'; g.fillRect(x - f * 14 - 2, top + 8 + p, 5, 2); g.fillRect(x + f * 10 - 2, top + 8 + (1 - p), 5, 2);
      g.fillStyle = '#0e1a12'; g.fillRect(x - 17, top - 1, 34, 10); g.fillRect(x - 14, top - 3, 28, 3);
      g.fillStyle = '#5a6a3a'; g.fillRect(x - 16, top, 32, 8);
      g.fillStyle = '#7a8a4a'; g.fillRect(x - 13, top - 2, 26, 3);
      g.fillStyle = '#3d4a28'; for (let i = -12; i <= 12; i += 8) g.fillRect(x + i, top + 1, 1, 6);
      g.fillStyle = '#6fbf4a'; [[-10, -3], [-3, -3], [6, -2], [11, 0]].forEach(([dx, dy]) => g.fillRect(x + dx, top + dy, 3, 1));
      // head
      g.fillStyle = '#0e1a12'; g.fillRect(x + f * 17 - 3, top + 1, 8, 6);
      g.fillStyle = '#8a9a5a'; g.fillRect(x + f * 17 - 2, top + 2, 6, 4);
      g.fillStyle = '#0e1a12'; g.fillRect(x + f * 19 - (f < 0 ? 1 : 0), top + 3, 1, 1);
    } else if (e.ch === 'N') { // Newt
      const f = -1, flick = Math.floor(t * 2) % 4 === 0;
      g.fillStyle = '#0e1a12'; g.fillRect(x - 9, y - 6, 18, 5);
      g.fillStyle = '#e07a2a'; g.fillRect(x - 8, y - 5, 16, 3);
      g.fillStyle = '#f0a050'; g.fillRect(x - 8, y - 5, 16, 1);
      g.fillStyle = '#0e1a12'; [-5, -1, 3].forEach(dx => g.fillRect(x + dx, y - 4, 1, 1));
      g.fillStyle = '#e07a2a'; for (let i = 0; i < 6; i++) g.fillRect(x - f * (9 + i), y - 4 + (i > 3 ? 1 : 0), 1, 1);
      g.fillStyle = '#0e1a12'; g.fillRect(x + f * 8, y - 6, 1, 1);
      g.fillRect(x - 6, y - 1, 1, 1); g.fillRect(x + 5, y - 1, 1, 1);
      if (flick) { g.fillStyle = '#ff5f7e'; g.fillRect(x + f * 10, y - 4, 2, 1); }
    }
  }

  function drawRing() {
    const r = ring.r;
    g.fillStyle = 'rgba(241,227,160,.9)';
    for (let a = 0; a < 48; a++) {
      if (a % 3 === 2) continue;
      const t = a / 48 * Math.PI * 2;
      g.fillRect(Math.round(ring.x + Math.cos(t) * r), Math.round(ring.y + Math.sin(t) * r * 0.8), 1, 1);
    }
  }

  function drawDebug() {
    g.font = '6px monospace';
    for (const e of ents) {
      if (!e.alive) continue;
      if (e.weight != null) {
        const heavy = e.weight >= FROG_W;
        g.strokeStyle = heavy ? 'rgba(255,95,126,.9)' : 'rgba(165,224,90,.9)';
        g.strokeRect(Math.round(e.x - e.r) + 0.5, Math.round(e.y - e.r) + 0.5, e.r * 2, e.r * 2);
        g.fillStyle = '#ffffff';
        g.fillText(e.weight === Infinity ? 'W∞' : 'W' + e.weight, Math.round(e.x - e.r), Math.round(e.y - e.r - 2));
      }
    }
    g.strokeStyle = 'rgba(255,255,255,.8)';
    g.strokeRect(Math.round(P.x - HALF_W) + 0.5, Math.round(P.y - BODY_H) + 0.5, HALF_W * 2, BODY_H);
    const [mx, my] = mouth(keys.up);
    g.strokeStyle = 'rgba(255,255,255,.18)';
    g.beginPath(); g.arc(mx, my, TUNE.tongueRange, 0, Math.PI * 2); g.stroke();
    if (tongue.state === 'swing' && tongue.target) {
      g.strokeStyle = 'rgba(255,216,74,.5)';
      g.beginPath(); g.arc(tongue.target.x, tongue.target.y + 14, tongue.rope, 0, Math.PI * 2); g.stroke();
    }
  }

  // speech bubbles + sign text sit in the DOM over the canvas
  function placeBubbles(cx, cy) {
    const bubbles = [];
    for (const e of ents) {
      if (!e.alive) continue;
      if (e.say) bubbles.push({ x: e.x, y: e.y - (e.ch === 'M' ? 16 : 24), text: e.say });
    }
    const sign = ents.find(e => e.kind === 'sign' && Math.abs(P.x - e.x) < 14 && Math.abs(P.y - e.y) < 24);
    ui.sign.hidden = !sign;
    if (sign) ui.sign.textContent = sign.text;
    const near = !dialog && nearestNpc();
    if (near && !near.say && (P.ground || P.surface)) bubbles.push({ x: near.x, y: near.y - (near.ch === 'M' ? 16 : 24), text: '↓ talk', hint: true });
    ui.bubbles.innerHTML = bubbles.map(b => {
      const left = ((b.x - cx) / VW * 100).toFixed(2), top = ((b.y - cy) / VH * 100).toFixed(2);
      return `<div class="bubble${b.hint ? ' hint' : ''}" style="left:${left}%;top:${top}%">${b.text}</div>`;
    }).join('');
  }

  function updateHud() {
    let hearts = '';
    for (let i = 0; i < TUNE.maxHp; i++) hearts += `<i class="${i < P.hp ? 'on' : ''}"></i>`;
    ui.hearts.innerHTML = hearts;
    ui.flies.textContent = P.flies;
    ui.sac.textContent = P.sac ? 'pebble' : 'empty';
    ui.sac.parentElement.classList.toggle('full', !!P.sac);
    if (ui.debug.checked) {
      ui.readout.hidden = false;
      ui.readout.textContent =
        `x ${P.x.toFixed(0)} y ${P.y.toFixed(0)}  vx ${P.vx.toFixed(0)} vy ${P.vy.toFixed(0)}\n` +
        `${P.ground ? 'ground' : P.water ? (P.surface ? 'surface' : 'swim') : 'air'}  anim ${P.anim}  tongue ${tongue.state}` +
        (P.charging ? `  charge ${(P.charge / TUNE.chargeTime * 100).toFixed(0)}%` : '') +
        (tongue.state === 'swing' ? `  rope ${tongue.rope.toFixed(0)}` : '');
    } else ui.readout.hidden = true;
  }

  // ---- lifecycle --------------------------------------------------------
  function restart() {
    Object.assign(P, { x: spawn.x, y: spawn.y, vx: 0, vy: 0, dir: 1, hp: TUNE.maxHp, flies: 0, sac: null, lock: null, charging: false, invuln: 0, checkpoint: { x: spawn.x, y: spawn.y }, safe: { x: spawn.x, y: spawn.y } });
    detachTongue();
    world.gateOpen = 0; world.gateOpening = false; world.bridge = 0; world.bridgeDropping = false;
    for (const e of ents) {
      e.alive = true; e.x = e.x0; e.respawn = null; e.carried = false; e.say = null;
      if (e.kind === 'pad' || e.ch === 'M') { e.x = e.x0; e.target = null; }
      if (e.kind === 'pebble') { e.x = e.x0; e.y = e.y0 - 2; e.resting = true; e.flying = false; }
      if (e.kind === 'bell') e.rung = false;
      if (e.kind === 'target') e.hit = false;
      if (e.kind === 'beetle') { e.stun = 0; e.y = e.y0; }
    }
    dialog = null;
    toast('Room reset.');
  }

  function init() {
    ['toast', 'dialog', 'dialogName', 'dialogText', 'dialogMore', 'sign', 'bubbles', 'hearts', 'flies', 'sac', 'readout'].forEach(id => { ui[id] = document.getElementById(id); });
    ui.debug = document.getElementById('debugToggle');
    ui.slow = document.getElementById('slowToggle');
    const stage = document.getElementById('stage');

    const fit = () => {
      const avail = stage.parentElement.clientWidth;
      const s = Math.floor(avail / VW);
      stage.style.width = s >= 2 ? s * VW + 'px' : '100%';
    };
    window.addEventListener('resize', fit); fit();

    window.addEventListener('keydown', e => {
      const k = MAP[e.code]; if (!k) return;
      if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) && document.activeElement.type !== 'checkbox') return;
      e.preventDefault(); press(k);
    });
    window.addEventListener('keyup', e => { const k = MAP[e.code]; if (k) release(k); });
    window.addEventListener('blur', () => { for (const k in keys) release(k); });

    document.querySelectorAll('[data-key]').forEach(b => {
      const k = b.dataset.key;
      b.addEventListener('pointerdown', ev => { ev.preventDefault(); b.setPointerCapture(ev.pointerId); press(k); b.classList.add('down'); });
      const up = () => { release(k); b.classList.remove('down'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    });
    document.getElementById('restartBtn').addEventListener('click', restart);
    document.querySelectorAll('[data-warp]').forEach(b => b.addEventListener('click', () => {
      const [tx, ty] = b.dataset.warp.split(',').map(Number);
      P.x = tx * TS + 8; P.y = ty * TS; P.vx = P.vy = 0; detachTongue(); P.leaping = false;
      cam.x = clamp(P.x - VW / 2, 0, WW - VW); cam.y = clamp(P.y - VH / 2, 0, WH - VH);
    }));

    let last = performance.now(), acc = 0;
    const STEP = 1 / 120;
    function frame(now) {
      let dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (ui.slow.checked) dt *= 0.3;
      acc += dt;
      while (acc >= STEP) { step(STEP); acc -= STEP; }
      draw();
      requestAnimationFrame(frame);
    }
    cam.x = clamp(P.x - VW / 2, 0, WW - VW); cam.y = clamp(P.y - VH / 2, 0, WH - VH);
    requestAnimationFrame(frame);
    const touchOnly = window.matchMedia && matchMedia('(hover: none), (pointer: coarse)').matches;
    toast(touchOnly ? 'Use the pad below. Hold Jump to leap, hold Tongue to swing.' : 'Arrows move · Space jump (hold to leap) · X tongue · C croak', 4);
  }

  // test hooks for scripted checks
  window.SWAMP = { P, tongue, world, ents, press, release, TUNE };
  init();
})();
