/*
 * Base animations for the long-legged frog.
 *
 * Each animation is a list of frames { pose, ms } plus flags:
 *   loop  - true for cycles (idle, walk, fall)
 *   hit   - on a frame, the tongue tip is an active hitbox
 *   speed - px/s the game should move the frog so the feet don't slide
 *
 * Poses are partial: they're merged over Frog.BASE_POSE by renderPose.
 * Load after frog.js (browser) or require() it (node).
 */
(function (root) {
  'use strict';
  const Frog = typeof module !== 'undefined' && module.exports ? require('./frog.js') : root.Frog;
  const B = Frog.BASE_POSE;
  const TAU = Math.PI * 2;
  const r1 = v => Math.round(v * 10) / 10;

  // ---- idle: breathing with a throat pulse, one blink ------------------
  function idle() {
    const bob = [0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0];
    const throat = [0, 0.2, 0.45, 0.6, 0.45, 0.2, 0, 0, 0, 0, 0, 0];
    const eyes = { 9: 'half', 10: 'closed' };
    return bob.map((b, i) => ({
      ms: 120,
      pose: {
        body: { y: B.body.y + b, sy: 1 - b * 0.02 },
        throat: throat[i],
        eye: eyes[i] || 'open',
        arms: { near: { y: B.arms.near.y - b }, far: { y: B.arms.far.y - b } },
      },
    }));
  }

  // ---- walk: long-legged stride, 8 frames ------------------------------
  // Each foot spends half the cycle planted (sliding back under the body)
  // and half swinging forward with a high knee lift.
  const STRIDE = 6.5;          // half stride, px
  const WALK_MS = 90;
  function footAt(ph, cx) {
    ph = ((ph % 1) + 1) % 1;
    if (ph < 0.5) {
      const t = ph / 0.5;
      return { x: r1(cx + STRIDE - 2 * STRIDE * t), y: -1.3, a: 0 };
    }
    const t = (ph - 0.5) / 0.5;
    const lift = Math.sin(t * Math.PI);
    return { x: r1(cx - STRIDE + 2 * STRIDE * t), y: r1(-1.3 - 6 * lift), a: r1(0.9 * lift - 0.15 * t) };
  }
  function walk() {
    const frames = [];
    for (let i = 0; i < 8; i++) {
      const p = i / 8;
      const bob = Math.round(Math.cos(p * TAU * 2) * 1.2); // low at each foot plant
      const sway = Math.sin(p * TAU);
      frames.push({
        ms: WALK_MS,
        pose: {
          body: { x: B.body.x + 1, y: B.body.y + 1 + bob, rot: r1(B.body.rot - 0.06 + 0.04 * Math.cos(p * TAU * 2)) },
          legs: { near: footAt(p, -3), far: footAt(p + 0.5, 0) },
          arms: {
            near: { x: r1(2.4 - 2.2 * sway), y: r1(5.2 - Math.abs(sway)) },
            far: { x: r1(2.4 + 2.2 * sway), y: r1(5.0 - Math.abs(sway)) },
          },
        },
      });
    }
    return frames;
  }

  // ---- jump: anticipation, launch, rising ------------------------------
  const CROUCH = {
    body: { y: -16, rot: -0.1, sx: 1.12, sy: 0.88 },
    eye: 'focus',
    arms: { near: { x: 3.2, y: 3 }, far: { x: 3, y: 2.8 } },
  };
  function jump() {
    return [
      { ms: 70, pose: Frog.mergePose(CROUCH, { body: { y: -18, sx: 1.06, sy: 0.94 } }) },
      { ms: 90, pose: CROUCH },
      {
        ms: 70, pose: {
          body: { x: 3, y: -25, rot: -0.5, sx: 0.94, sy: 1.08 },
          legs: { near: { x: -11, y: -8, a: 1.7 }, far: { x: -8, y: -8.5, a: 1.6 } },
          arms: { near: { x: 4.5, y: 1.5, a: 0.3 }, far: { x: 4.5, y: 1, a: 0.3 } },
          fx: [{ type: 'dust', x: -10, y: -1.5, r: 2 }, { type: 'dust', x: -3, y: -1.5, r: 1.6 }],
        },
      },
      {
        ms: 110, pose: {
          body: { x: 3, y: -26, rot: -0.38 },
          legs: { near: { x: -14, y: -9, a: 2.5 }, far: { x: -11, y: -10.5, a: 2.4 } },
          arms: { near: { x: 5, y: 2, a: 0.4 }, far: { x: 5, y: 1.5, a: 0.4 } },
          fx: [{ type: 'dust', x: -12, y: -2, r: 1.3 }],
        },
      },
    ];
  }

  // ---- fall: legs reach down for the landing, arms flail ---------------
  function fall() {
    const base = {
      body: { y: -24, rot: -0.12 },
      eye: 'down',
      legs: { near: { x: -5, y: -1.5, a: 0.55 }, far: { x: 1.5, y: -2, a: 0.5 } },
    };
    return [
      { ms: 110, pose: Frog.mergePose(base, { arms: { near: { x: 5.5, y: 0.5, a: -0.2 }, far: { x: 5, y: 2.5, a: 0.3 } } }) },
      { ms: 110, pose: Frog.mergePose(base, { body: { y: -25 }, arms: { near: { x: 5, y: 2.5, a: 0.3 }, far: { x: 5.5, y: 0.5, a: -0.2 } } }) },
    ];
  }

  // ---- land: squash, then settle ---------------------------------------
  function land() {
    return [
      {
        ms: 70, pose: {
          body: { y: -15, rot: -0.05, sx: 1.18, sy: 0.84 },
          eye: 'closed',
          legs: { near: { x: -9, y: -1.3, a: 0 }, far: { x: 3, y: -1.3, a: 0 } },
          arms: { near: { x: 4, y: 2.5 }, far: { x: 4, y: 2.3 } },
          fx: [{ type: 'dust', x: -14, y: -1.8, r: 2.2 }, { type: 'dust', x: 13, y: -1.8, r: 2.2 }],
        },
      },
      {
        ms: 90, pose: {
          body: { y: -19, rot: -0.15, sx: 1.07, sy: 0.94 },
          eye: 'half',
          legs: { near: { x: -8, y: -1.3, a: 0 }, far: { x: 2, y: -1.3, a: 0 } },
          fx: [{ type: 'dust', x: -16, y: -2.5, r: 1.3 }, { type: 'dust', x: 15, y: -2.5, r: 1.3 }],
        },
      },
      { ms: 100, pose: { body: { y: B.body.y + 1 } } },
    ];
  }

  // ---- tongue attack ---------------------------------------------------
  // wind up, open, shoot (3 frames), stick, retract (2 frames), close.
  function tongue(opt) {
    const up = opt && opt.up;
    const ang = up ? -0.85 : 0.02;
    const reach = up ? 22 : 31;
    const lean = up ? -0.62 : -0.14;       // body tilt while the tongue is out
    const eye = up ? 'up' : 'focus';
    const strike = (len, extra) => Frog.mergePose({
      body: { x: 3, y: -23, rot: lean },
      eye, jaw: 0.62,
      legs: { near: { x: -8, y: -1.3 }, far: { x: 2, y: -1.3 } },
      arms: { near: { x: 1, y: 5.5 }, far: { x: 1.5, y: 5.2 } },
      tongue: { len, ang, sag: 0, tip: 2.6 },
    }, extra || {});
    return [
      {
        ms: 100, pose: {
          body: { x: 0, y: -22, rot: up ? -0.45 : -0.36 },
          eye, jaw: 0.12,
          legs: { near: { x: -7, y: -1.3 }, far: { x: 1, y: -1.3 } },
          arms: { near: { x: 0, y: 4.5 }, far: { x: 0.5, y: 4.3 } },
        },
      },
      { ms: 50, pose: Frog.mergePose(strike(0), { tongue: null }) },
      { ms: 35, pose: strike(Math.round(reach * 0.35), { tongue: { tip: 1.8 } }) },
      { ms: 35, pose: strike(Math.round(reach * 0.72), { fx: [{ type: 'speed', atTip: true, x: -6, y: -3, len: 6 }, { type: 'speed', atTip: true, x: -9, y: 3, len: 5 }] }) },
      { ms: 60, hit: true, pose: strike(reach, { fx: [{ type: 'spark', atTip: true, r: 4 }] }) },
      { ms: 80, hit: true, pose: strike(reach, { tongue: { tip: 2.9 }, fx: [{ type: 'ring', atTip: true, r: 5 }] }) },
      { ms: 50, pose: strike(Math.round(reach * 0.62), { jaw: 0.55, tongue: { sag: 2.5, tip: 2.3 } }) },
      { ms: 50, pose: strike(Math.round(reach * 0.25), { jaw: 0.5, tongue: { sag: 1, tip: 2 } }) },
      {
        ms: 80, pose: {
          body: { x: 1, y: -22, rot: -0.28 }, eye: 'half', jaw: 0, throat: 0.5,
          legs: { near: { x: -7.5, y: -1.3 }, far: { x: 1.5, y: -1.3 } },
        },
      },
      { ms: 110, pose: { throat: 0.2 } },
    ];
  }

  // ---- croak: the throat sac inflates and pops -------------------------
  function croak() {
    const t = [0, 0.4, 0.9, 1.4, 1.8, 1.8, 1.2, 0.5];
    return t.map((v, i) => ({
      ms: i === 4 || i === 5 ? 160 : 90,
      pose: {
        body: { y: B.body.y - (v > 1 ? 1 : 0), rot: B.body.rot - v * 0.05 },
        throat: v,
        eye: v > 1.5 ? 'closed' : v > 0.8 ? 'half' : 'open',
      },
    }));
  }

  // ---- hurt: flash, knocked back, recover ------------------------------
  function hurt() {
    const knocked = {
      body: { x: -2, y: -22, rot: -0.6 },
      eye: 'shut', jaw: 0.3,
      legs: { near: { x: -6, y: -1.3, a: -0.2 }, far: { x: 3.5, y: -2.5, a: 0.4 } },
      arms: { near: { x: 5.5, y: 1, a: -0.3 }, far: { x: 5, y: -0.5, a: -0.5 } },
    };
    return [
      { ms: 60, pose: Frog.mergePose(knocked, { flash: true }) },
      { ms: 90, pose: Frog.mergePose(knocked, { fx: [{ type: 'star', x: -4, y: -38 }, { type: 'star', x: 6, y: -41 }] }) },
      {
        ms: 110, pose: Frog.mergePose(knocked, {
          body: { x: -1, y: -23, rot: -0.45 }, jaw: 0.1, eye: 'half',
          arms: { near: { x: 2, y: 3, a: 0.2 }, far: { x: 2.5, y: 3, a: 0.2 } },
          fx: [{ type: 'star', x: 0, y: -40 }, { type: 'star', x: 10, y: -38 }],
        }),
      },
      { ms: 110, pose: { body: { x: 0.5, y: -23, rot: -0.3 }, eye: 'half' } },
    ];
  }

  const ANIMS = {
    idle: { loop: true, frames: idle() },
    walk: { loop: true, speed: Math.round((2 * STRIDE) / (4 * WALK_MS / 1000)), frames: walk() },
    jump: { loop: false, frames: jump() },
    fall: { loop: true, frames: fall() },
    land: { loop: false, frames: land() },
    tongue: { loop: false, frames: tongue() },
    tongue_up: { loop: false, frames: tongue({ up: true }) },
    croak: { loop: false, frames: croak() },
    hurt: { loop: false, frames: hurt() },
  };

  // Render every frame once. Returns { name: { loop, speed, frames: [{ px, ms, hit, tip }] } }
  function buildAnims() {
    const out = {};
    for (const name in ANIMS) {
      const a = ANIMS[name];
      out[name] = {
        loop: a.loop, speed: a.speed || 0,
        frames: a.frames.map(f => {
          const r = Frog.renderPose(f.pose);
          return { px: r.px, ms: f.ms, hit: !!f.hit, tip: r.tip };
        }),
      };
    }
    return out;
  }

  Frog.ANIMS = ANIMS;
  Frog.buildAnims = buildAnims;
  if (typeof module !== 'undefined' && module.exports) module.exports = Frog;
})(typeof window !== 'undefined' ? window : this);
