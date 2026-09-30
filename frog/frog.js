/*
 * Long-legged frog: an 8-bit pixel sprite built from a tiny rig.
 *
 * Every frame is rasterised from a pose (body position/tilt/squash, jaw,
 * eye state, IK targets for four limbs, tongue) into a fixed CELL_W x CELL_H
 * grid of palette indices. Each part is drawn into its own layer and gets its
 * own 1px outline before compositing, which gives the hard internal outlines
 * of hand-drawn 8-bit sprites.
 *
 * Coordinates: world units are pixels, x right, y down, origin on the ground
 * under the frog (cell pixel ORIGIN_X, ORIGIN_Y). The frog faces right.
 *
 * Works in the browser (window.Frog) and in node (module.exports).
 */
(function (root) {
  'use strict';

  const CELL_W = 72, CELL_H = 48, ORIGIN_X = 24, ORIGIN_Y = 45;

  // ---- palette ---------------------------------------------------------
  // index 0 is transparent. Kept small on purpose: one green ramp, one belly
  // ramp, one tongue ramp, plus eye/fx colours.
  const PALETTE = [
    null,       // 0  transparent
    '#0e1a12',  // 1  outline / pupil
    '#1d4a2a',  // 2  green 0 (shadow, spots, stripes)
    '#2f7a35',  // 3  green 1
    '#57b043',  // 4  green 2
    '#a5e05a',  // 5  green 3 (highlight)
    '#c9a94a',  // 6  belly shade
    '#f1e3a0',  // 7  belly
    '#fbfbf1',  // 8  eye white / flash
    '#6a1426',  // 9  mouth
    '#c12f4f',  // 10 tongue dark
    '#ff5f7e',  // 11 tongue
    '#ffb3c1',  // 12 tongue light
    '#ffd84a',  // 13 spark
    '#12301c',  // 14 far-side shadow
    '#d9dccb',  // 15 dust
    '#a3a894',  // 16 dust shade
  ];
  const C = {
    O: 1, G0: 2, G1: 3, G2: 4, G3: 5, B0: 6, B1: 7, W: 8, M: 9,
    T0: 10, T1: 11, T2: 12, FX: 13, FAR: 14, D0: 15, D1: 16,
  };
  // far-side limbs are one step darker
  const FAR_MAP = { 2: 14, 3: 2, 4: 3, 5: 4, 6: 6, 7: 6 };

  // ---- rig dimensions (body-local units, before squash/stretch) ---------
  const RIG = {
    torso: { x: 0, y: 0, rx: 8.5, ry: 6.5 },
    head: { x: 7.5, y: -3.8, rx: 7.5, ry: 5 },
    mouthCorner: { x: 3.8, y: -2.4 },
    lipAngle: 0.1,
    eye: { x: 8.2, y: -8, r: 4 },
    tympanum: { x: 3.2, y: -5.2 },
    nostril: { x: 13, y: -5.2 },
    throat: { x: 8.5, y: 1.2 },
    spots: [[-3.2, -4, 1.7], [-6.8, -0.6, 1.4], [1.2, -5.2, 1.1]],
    hipNear: { x: -5.5, y: 4 }, hipFar: { x: -2.5, y: 3.5 },
    shoulderNear: { x: 5, y: 3.2 }, shoulderFar: { x: 6.5, y: 2.2 },
    thigh: 11, shin: 13, foot: 8,
    upperArm: 4.5, foreArm: 4.5,
  };

  const LIGHT = (function () { const v = [-0.45, -0.8, 0.55], m = Math.hypot(...v); return v.map(a => a / m); })();

  // ---- eye sprites (6x6, drawn unrotated at the eye centre) -------------
  const EYES = {
    open: [
      '.oooo.',
      'owwwwo',
      'owwkko',
      'owwkko',
      'owwwwo',
      '.oooo.'],
    half: [
      '.oooo.',
      'o4444o',
      'oooooo',
      'owwkko',
      'owwwwo',
      '.oooo.'],
    closed: [
      '.oooo.',
      'o4444o',
      'o3333o',
      'oooooo',
      'o4444o',
      '.oooo.'],
    focus: [
      '.oooo.',
      'o44ooo',
      'owwwko',
      'owwwko',
      'owwwwo',
      '.oooo.'],
    up: [
      '.oooo.',
      'owwkko',
      'owwkko',
      'owwwwo',
      'owwwwo',
      '.oooo.'],
    down: [
      '.oooo.',
      'owwwwo',
      'owwwwo',
      'owwkko',
      'owwkko',
      '.oooo.'],
    shut: [
      '.oooo.',
      'okk44o',
      'o44kko',
      'okk44o',
      'o4444o',
      '.oooo.'],
  };
  const EYE_KEY = { '.': 0, o: C.O, k: C.O, w: C.W, '3': C.G1, '4': C.G2 };

  // ---- small math -------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function rot(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }

  function band(d) { return d > 0.82 ? C.G3 : d > 0.42 ? C.G2 : d > 0.0 ? C.G1 : C.G0; }
  function light(nx, ny) {
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    return nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
  }

  // ---- layers -----------------------------------------------------------
  function Layer() { this.px = new Uint8Array(CELL_W * CELL_H); }
  Layer.prototype.get = function (x, y) {
    return x < 0 || y < 0 || x >= CELL_W || y >= CELL_H ? 0 : this.px[y * CELL_W + x];
  };
  Layer.prototype.set = function (x, y, c) {
    if (x >= 0 && y >= 0 && x < CELL_W && y < CELL_H) this.px[y * CELL_W + x] = c;
  };
  // run fn(worldX, worldY) for each pixel centre in a world-space box
  Layer.prototype.scan = function (x0, y0, x1, y1, fn) {
    const i0 = Math.max(0, Math.floor(x0 + ORIGIN_X)), i1 = Math.min(CELL_W - 1, Math.ceil(x1 + ORIGIN_X));
    const j0 = Math.max(0, Math.floor(y0 + ORIGIN_Y)), j1 = Math.min(CELL_H - 1, Math.ceil(y1 + ORIGIN_Y));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = fn(i + 0.5 - ORIGIN_X, j + 0.5 - ORIGIN_Y);
      if (c) this.px[j * CELL_W + i] = c;
    }
  };
  Layer.prototype.outline = function (color) {
    const src = this.px.slice();
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      if (src[y * CELL_W + x]) continue;
      const n = (x > 0 && src[y * CELL_W + x - 1]) || (x < CELL_W - 1 && src[y * CELL_W + x + 1]) ||
        (y > 0 && src[(y - 1) * CELL_W + x]) || (y < CELL_H - 1 && src[(y + 1) * CELL_W + x]);
      if (n) this.px[y * CELL_W + x] = color;
    }
    return this;
  };
  Layer.prototype.remap = function (map) {
    for (let i = 0; i < this.px.length; i++) if (map[this.px[i]] != null) this.px[i] = map[this.px[i]];
    return this;
  };
  Layer.prototype.over = function (src) {
    for (let i = 0; i < this.px.length; i++) if (src.px[i]) this.px[i] = src.px[i];
    return this;
  };
  Layer.prototype.stamp = function (rows, key, wx, wy) {
    const h = rows.length, w = rows[0].length;
    const x0 = Math.round(wx + ORIGIN_X - w / 2), y0 = Math.round(wy + ORIGIN_Y - h / 2);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = key[rows[j][i]];
      if (c) this.set(x0 + i, y0 + j, c);
    }
  };

  // ---- body frame -------------------------------------------------------
  function BodyFrame(p) {
    this.bx = p.x; this.by = p.y; this.a = p.rot; this.sx = p.sx; this.sy = p.sy;
  }
  BodyFrame.prototype.toWorld = function (lx, ly) {
    const r = rot(lx * this.sx, ly * this.sy, this.a);
    return [this.bx + r[0], this.by + r[1]];
  };
  BodyFrame.prototype.toLocal = function (wx, wy) {
    const r = rot(wx - this.bx, wy - this.by, -this.a);
    return [r[0] / this.sx, r[1] / this.sy];
  };

  // ---- parts ------------------------------------------------------------
  function ellUV(lx, ly, e) { return [(lx - e.x) / e.rx, (ly - e.y) / e.ry]; }
  function inEll(u, v) { return u * u + v * v <= 1; }

  function drawBody(pose, F) {
    const L = new Layer();
    const t = RIG.torso, h = RIG.head, mc = RIG.mouthCorner;
    const jaw = pose.jaw || 0;
    const lipDir = [Math.cos(RIG.lipAngle), Math.sin(RIG.lipAngle)];
    // >0 below the lip line
    const side = (x, y) => (x - mc.x) * -lipDir[1] + (y - mc.y) * lipDir[0];
    const green = (u, v, extra) => {
      const n = rot(u, v, F.a + (extra || 0));
      return band(light(n[0] * 0.9, n[1] * 0.9));
    };
    const throat = pose.throat || 0;

    L.scan(-ORIGIN_X, -ORIGIN_Y, CELL_W - ORIGIN_X, CELL_H - ORIGIN_Y, (wx, wy) => {
      const [lx, ly] = F.toLocal(wx, wy);
      // mouth wedge: sweep back onto the lip line and test against the head
      if (jaw > 0.01) {
        const ang = Math.atan2(ly - mc.y, lx - mc.x) - RIG.lipAngle;
        if (ang > 0 && ang < jaw) {
          const q = rotAround(lx, ly, mc, -ang);
          const [u, v] = ellUV(q[0], q[1], h);
          if (inEll(u, v)) {
            const d = Math.hypot(lx - mc.x, ly - mc.y);
            return d < 3 ? C.O : C.M;
          }
        }
      }
      // lower jaw: rotated copy of the head below the lip line
      {
        const q = rotAround(lx, ly, mc, -jaw);
        const [u, v] = ellUV(q[0], q[1], h);
        if (inEll(u, v) && side(q[0], q[1]) > 0 && q[0] >= mc.x) {
          if (v > 0.45 && u > -0.35) return C.B1;
          return green(u, v, jaw);
        }
      }
      // upper head
      {
        const [u, v] = ellUV(lx, ly, h);
        if (inEll(u, v) && (side(lx, ly) <= 0 || lx < mc.x)) {
          return green(u, v);
        }
      }
      // throat sac
      if (throat > 0) {
        const tr = 2.2 + throat * 2.2;
        const dx = (lx - RIG.throat.x) / (tr * 1.2), dy = (ly - RIG.throat.y - throat) / tr;
        if (dx * dx + dy * dy <= 1) return dy < -0.3 ? C.B0 : C.B1;
      }
      // torso
      {
        const [u, v] = ellUV(lx, ly, t);
        if (inEll(u, v)) {
          if (v > 0.38 && u > -0.55) return v > 0.8 || u < -0.35 ? C.B0 : C.B1;
          for (const s of RIG.spots) {
            if ((lx - s[0]) ** 2 + (ly - s[1]) ** 2 <= s[2] * s[2]) return C.G0;
          }
          return green(u, v);
        }
      }
      // eye bump
      {
        const e = RIG.eye, dx = lx - e.x, dy = ly - e.y;
        if (dx * dx + dy * dy <= e.r * e.r) return green(dx / e.r, dy / e.r);
      }
      return 0;
    });

    // closed-mouth line: jaw pixels directly under upper-head pixels
    if (jaw < 0.05) {
      const [ax, ay] = F.toWorld(mc.x - 0.6, mc.y + 0.9);
      const [bx, by] = F.toWorld(h.x + h.rx - 0.9, mc.y + (h.x + h.rx - mc.x) * Math.tan(RIG.lipAngle));
      line(L, ax, ay, bx, by, C.O);
    }
    // tympanum (ear drum) behind the eye, and a nostril
    {
      const [x, y] = F.toWorld(RIG.tympanum.x, RIG.tympanum.y);
      L.stamp(['.2.', '242', '.2.'], { '.': 0, '2': C.G0, '4': C.G1 }, x, y);
      const [nx, ny] = F.toWorld(RIG.nostril.x, RIG.nostril.y);
      L.set(Math.floor(nx + ORIGIN_X), Math.floor(ny + ORIGIN_Y), C.G0);
    }
    L.outline(C.O);
    // eye goes on after the outline so it keeps its own crisp ring
    const [ex, ey] = F.toWorld(RIG.eye.x, RIG.eye.y);
    L.stamp(EYES[pose.eye || 'open'], EYE_KEY, ex, ey);
    return L;
  }

  function rotAround(x, y, c, a) {
    const r = rot(x - c.x, y - c.y, a);
    return [c.x + r[0], c.y + r[1]];
  }

  function line(L, x0, y0, x1, y1, c) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      L.set(Math.floor(lerp(x0, x1, t) + ORIGIN_X), Math.floor(lerp(y0, y1, t) + ORIGIN_Y), c);
    }
  }

  // tapered capsule with side lighting and optional stripes
  function capsule(L, ax, ay, bx, by, ra, rb, opts) {
    opts = opts || {};
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-6, len = Math.sqrt(len2);
    const nx = -dy / len, ny = dx / len;
    const pad = Math.max(ra, rb) + 1;
    L.scan(Math.min(ax, bx) - pad, Math.min(ay, by) - pad, Math.max(ax, bx) + pad, Math.max(ay, by) + pad, (x, y) => {
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1);
      const px = ax + dx * t, py = ay + dy * t;
      const r = lerp(ra, rb, t);
      const ex = x - px, ey = y - py, d2 = ex * ex + ey * ey;
      if (d2 > r * r) return 0;
      if (opts.flat) return opts.flat;
      const s = (ex * nx + ey * ny) / r; // -1..1 across the limb
      let c = band(light(nx * s, ny * s));
      if (opts.stripes) for (const st of opts.stripes) {
        if (Math.abs(t * len - st * len) < 0.75 && c !== C.G0) c = c === C.G3 ? C.G1 : C.G0;
      }
      if (opts.pal) c = opts.pal(c, s);
      return c;
    });
  }

  function ik(ax, ay, tx, ty, l1, l2, bend) {
    const dx = tx - ax, dy = ty - ay;
    const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
    const a = Math.atan2(dy, dx);
    const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const ka = a - bend * A;
    const kx = ax + l1 * Math.cos(ka), ky = ay + l1 * Math.sin(ka);
    return { kx, ky, ex: ax + d * Math.cos(a), ey: ay + d * Math.sin(a) };
  }

  function drawLeg(F, hipLocal, leg) {
    const L = new Layer();
    const [hx, hy] = F.toWorld(hipLocal.x, hipLocal.y);
    const j = ik(hx, hy, leg.x, leg.y, RIG.thigh, RIG.shin, 1);
    const fa = leg.a || 0;
    const tx = j.ex + RIG.foot * Math.cos(fa), ty = j.ey + RIG.foot * Math.sin(fa);
    // foot + webbed toes first so the shin sits on top
    capsule(L, j.ex, j.ey, tx, ty, 1.3, 1.0);
    for (const s of [-0.45, 0, 0.45]) {
      const ta = fa + s;
      capsule(L, tx, ty, tx + 2.4 * Math.cos(ta), ty + 2.4 * Math.sin(ta), 0.9, 0.7, { flat: s === 0 ? C.G2 : C.G1 });
    }
    capsule(L, j.kx, j.ky, j.ex, j.ey, 1.4, 1.0, { stripes: [0.5] });
    capsule(L, hx, hy, j.kx, j.ky, 2.6, 1.5, { stripes: [0.6] });
    return L.outline(C.O);
  }

  function drawArm(F, shoulderLocal, arm) {
    const L = new Layer();
    const [sx, sy] = F.toWorld(shoulderLocal.x, shoulderLocal.y);
    const hx = sx + arm.x, hy = sy + arm.y;
    const j = ik(sx, sy, hx, hy, RIG.upperArm, RIG.foreArm, -1);
    const fa = arm.a != null ? arm.a : 0.2;
    for (const s of [-0.5, 0.5]) {
      const ta = fa + s;
      capsule(L, j.ex, j.ey, j.ex + 2.2 * Math.cos(ta), j.ey + 2.2 * Math.sin(ta), 0.8, 0.7, { flat: C.G2 });
    }
    capsule(L, j.kx, j.ky, j.ex, j.ey, 1.2, 1.0);
    capsule(L, sx, sy, j.kx, j.ky, 1.5, 1.2);
    return L.outline(C.O);
  }

  function drawTongue(F, pose) {
    const tg = pose.tongue;
    const L = new Layer();
    const [mx, my] = F.toWorld(RIG.mouthCorner.x + 2.5, RIG.mouthCorner.y + 0.8);
    const ang = tg.ang != null ? tg.ang : 0;
    const tx = mx + tg.len * Math.cos(ang), ty = my + tg.len * Math.sin(ang);
    const cx = (mx + tx) / 2 + (tg.sag || 0) * -Math.sin(ang) * 0, cy = (my + ty) / 2 + (tg.sag || 0);
    const tongueCol = (c, s) => (s < -0.35 ? C.T2 : s > 0.4 ? C.T0 : C.T1);
    const N = Math.max(2, Math.ceil(tg.len / 3));
    let px = mx, py = my;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const x = (1 - t) * (1 - t) * mx + 2 * (1 - t) * t * cx + t * t * tx;
      const y = (1 - t) * (1 - t) * my + 2 * (1 - t) * t * cy + t * t * ty;
      capsule(L, px, py, x, y, 1.3, 1.2, { pal: tongueCol });
      px = x; py = y;
    }
    const tipR = tg.tip != null ? tg.tip : 2.6;
    if (tipR > 0) {
      L.scan(tx - tipR - 1, ty - tipR - 1, tx + tipR + 1, ty + tipR + 1, (x, y) => {
        const u = (x - tx) / tipR, v = (y - ty) / tipR;
        if (u * u + v * v > 1) return 0;
        const d = light(u, v);
        return d > 0.75 ? C.T2 : d > 0.1 ? C.T1 : C.T0;
      });
    }
    L.outline(C.O);
    return { layer: L, tip: [tx, ty] };
  }

  // ---- fx ---------------------------------------------------------------
  function drawFx(fx, L, tip) {
    for (const f0 of fx) {
      const f = f0.atTip && tip ? Object.assign({}, f0, { x: tip[0] + (f0.x || 0), y: tip[1] + (f0.y || 0) }) : f0;
      const x = Math.round(f.x + ORIGIN_X), y = Math.round(f.y + ORIGIN_Y);
      if (f.type === 'spark') {
        const r = f.r || 3;
        for (let i = 1; i <= r; i++) {
          const c = i === r ? C.FX : C.W;
          L.set(x + i, y, c); L.set(x - i, y, c); L.set(x, y + i, c); L.set(x, y - i, c);
        }
        if (r > 2) { L.set(x + r, y - r, C.FX); L.set(x - r, y + r, C.FX); L.set(x + r, y + r, C.FX); L.set(x - r, y - r, C.FX); }
        L.set(x, y, C.W);
      } else if (f.type === 'ring') {
        const r = f.r || 4;
        for (let a = 0; a < 16; a++) {
          const t = a / 16 * Math.PI * 2;
          if (a % 2) continue;
          L.set(Math.round(x + r * Math.cos(t)), Math.round(y + r * Math.sin(t)), a % 4 ? C.FX : C.W);
        }
      } else if (f.type === 'dust') {
        const r = f.r || 2;
        const D = new Layer();
        D.scan(f.x - r - 1, f.y - r - 1, f.x + r + 1, f.y + r + 1, (wx, wy) => {
          const u = (wx - f.x) / r, v = (wy - f.y) / r;
          return u * u + v * v <= 1 ? (v > 0.2 || u > 0.4 ? C.D1 : C.D0) : 0;
        });
        L.over(D);
      } else if (f.type === 'star') { // stars for the dizzy hurt frame
        L.set(x, y, C.FX); L.set(x - 1, y, C.FX); L.set(x + 1, y, C.FX); L.set(x, y - 1, C.FX); L.set(x, y + 1, C.FX);
      } else if (f.type === 'speed') {
        for (let i = 0; i < (f.len || 5); i++) L.set(x - i, y, i % 3 === 2 ? 0 : C.D0);
      }
    }
  }

  // ---- pose -> frame ----------------------------------------------------
  const BASE_POSE = {
    body: { x: 1.5, y: -23, rot: -0.22, sx: 1, sy: 1 },
    eye: 'open', jaw: 0, throat: 0,
    legs: { near: { x: -7, y: -1.3, a: 0 }, far: { x: 1, y: -1.3, a: 0 } },
    arms: { near: { x: 2.8, y: 5.2, a: 0.25 }, far: { x: 2.4, y: 5.0, a: 0.25 } },
    tongue: null, fx: [], flash: false,
  };

  function mergePose(base, over) {
    const out = JSON.parse(JSON.stringify(base));
    (function m(dst, src) {
      for (const k in src) {
        if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') m(dst[k], src[k]);
        else dst[k] = src[k];
      }
    })(out, over || {});
    return out;
  }

  function renderPose(poseIn) {
    const pose = mergePose(BASE_POSE, poseIn);
    const F = new BodyFrame(pose.body);
    const out = new Layer();
    out.over(drawArm(F, RIG.shoulderFar, pose.arms.far).remap(FAR_MAP));
    out.over(drawLeg(F, RIG.hipFar, pose.legs.far).remap(FAR_MAP));
    out.over(drawBody(pose, F));
    out.over(drawLeg(F, RIG.hipNear, pose.legs.near));
    out.over(drawArm(F, RIG.shoulderNear, pose.arms.near));
    let tip = null;
    if (pose.tongue && pose.tongue.len > 0) {
      const t = drawTongue(F, pose);
      out.over(t.layer);
      tip = t.tip;
    }
    if (pose.flash) {
      for (let i = 0; i < out.px.length; i++) if (out.px[i] && out.px[i] !== C.O) out.px[i] = C.W;
    }
    if (pose.fx && pose.fx.length) drawFx(pose.fx, out, tip);
    return { px: out.px, tip };
  }

  // indices -> RGBA bytes
  function toRGBA(px, target, stride, ox, oy) {
    const rgb = PALETTE.map(h => h && [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
    stride = stride || CELL_W; ox = ox || 0; oy = oy || 0;
    target = target || new Uint8ClampedArray(CELL_W * CELL_H * 4);
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      const c = px[y * CELL_W + x];
      if (!c) continue;
      const o = ((oy + y) * stride + ox + x) * 4;
      target[o] = rgb[c][0]; target[o + 1] = rgb[c][1]; target[o + 2] = rgb[c][2]; target[o + 3] = 255;
    }
    return target;
  }

  const Frog = {
    CELL_W, CELL_H, ORIGIN_X, ORIGIN_Y, PALETTE, COLORS: C, RIG, BASE_POSE,
    renderPose, mergePose, toRGBA,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Frog;
  else root.Frog = Frog;
})(typeof window !== 'undefined' ? window : this);
