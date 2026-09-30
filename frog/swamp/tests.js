/*
 * Mechanics test cycle for the swamp test room.
 *
 * Every test resets the room, places the frog, feeds scripted input through
 * the real game step (SWAMP.test.run) and checks the outcome. Nothing is
 * mocked: these are the same physics, tongue and entity rules the player gets.
 *
 * Run from the page ("Run test cycle") or headless: node tools/test-swamp.js
 */
(function () {
  'use strict';
  const tests = [];
  const test = (group, name, fn) => tests.push({ group, name, fn });
  function expect(cond, msg) { if (!cond) throw new Error(msg); }
  const r0 = v => Math.round(v);

  // map landmarks (tile 16px, y is the ground line under the feet)
  const TS = 16;
  const BOARDWALK = { x: 300, y: 160 };   // upper boardwalk planks, row 10
  const GATE_YARD = { x: 1300, y: 192 };  // ground right of the bog pit
  const RIGHT_BANK = { x: 1050, y: 192 }; // pond's right bank
  const PIT_EDGE = { x: 1062, y: 192 };   // left lip of the bog pit
  const FLOOR = 240;                      // start-area floor

  const find = (kind, ch) => SWAMP.ents.find(e => e.kind === kind && (!ch || e.ch === ch));
  const npc = ch => SWAMP.ents.find(e => e.ch === ch);
  function track(h, seconds, held, until) {
    const P = SWAMP.P;
    let minY = P.y, maxY = P.y, maxVx = 0;
    const n = h.run(seconds, held, () => {
      minY = Math.min(minY, P.y); maxY = Math.max(maxY, P.y); maxVx = Math.max(maxVx, Math.abs(P.vx));
      return until ? until() : false;
    });
    return { minY, maxY, maxVx, steps: n };
  }
  function killBeetle() { const b = find('beetle'); b.alive = false; b.respawn = null; }

  // ---------------------------------------------------------------- room data
  test('Room', 'map rows are all the same width', () => {
    const w = new Set(window.SWAMP_ROOM.map.map(r => r.length));
    expect(w.size === 1, `row widths: ${[...w].join(', ')}`);
  });
  test('Room', 'every sign and NPC in the map has text', () => {
    const R = window.SWAMP_ROOM, chars = R.map.join('');
    for (const c of chars.match(/[1-9]/g) || []) expect(R.signs[c], `sign ${c} has no text`);
    for (const c of 'ETMN') if (chars.includes(c)) expect(R.npcs[c] && R.npcs[c].lines.length, `NPC ${c} has no lines`);
  });
  test('Room', 'station warps land on solid footing', (h) => {
    const warps = [...document.querySelectorAll('[data-warp]')].map(b => b.dataset.warp.split(',').map(Number));
    expect(warps.length >= 5, 'expected station buttons');
    for (const [tx, ty] of warps) {
      h.reset(); h.place(tx * TS + 8, ty * TS);
      h.run(0.5, []);
      expect(SWAMP.P.ground && !h.boxInSolid(), `warp ${tx},${ty} not standing (y ${r0(SWAMP.P.y)})`);
    }
    return `${warps.length} warps`;
  });
  test('Room', 'R reset works and does not freeze the frog', (h) => {
    const P = SWAMP.P;
    h.place(BOARDWALK.x, BOARDWALK.y); P.flies = 5; SWAMP.world.gateOpen = 1;
    SWAMP.press('restart'); h.run(1 / 120, []); SWAMP.release('restart');
    expect(P.flies === 0 && SWAMP.world.gateOpen === 0, 'room state not restored');
    const x0 = P.x; h.run(0.4, ['right']);
    expect(P.x > x0 + 20, `frog frozen after reset (moved ${r0(P.x - x0)}px)`);
  });

  // ---------------------------------------------------------------- movement
  test('Move', 'run reaches top speed quickly', (h) => {
    const P = SWAMP.P, T = SWAMP.TUNE;
    h.place(BOARDWALK.x, BOARDWALK.y); h.run(0.2, []);
    const steps = h.run(0.5, ['right'], () => P.vx >= T.run - 0.5);
    expect(steps / 120 <= 0.12, `took ${(steps / 120).toFixed(2)}s to reach ${T.run}px/s`);
    return `${T.run}px/s in ${(steps / 120).toFixed(2)}s`;
  });
  test('Move', 'turnaround and stop are snappy', (h) => {
    const P = SWAMP.P;
    h.place(BOARDWALK.x, BOARDWALK.y); h.run(0.2, []); h.run(0.3, ['right']);
    const turn = h.run(0.5, ['left'], () => P.vx < 0);
    expect(turn / 120 <= 0.08, `turnaround took ${(turn / 120).toFixed(2)}s`);
    h.run(0.3, ['left']);
    const stop = h.run(0.5, [], () => P.vx === 0);
    expect(stop / 120 <= 0.12, `stop took ${(stop / 120).toFixed(2)}s`);
  });
  test('Move', 'tap jump is short, held jump is full', (h) => {
    h.place(BOARDWALK.x, BOARDWALK.y); h.run(0.2, []);
    h.run(2 / 120, ['jump']);
    const tap = BOARDWALK.y - track(h, 0.8, []).minY;
    h.place(BOARDWALK.x, BOARDWALK.y); h.run(0.2, []);
    const full = BOARDWALK.y - track(h, 0.8, ['jump']).minY;
    expect(tap >= 12 && tap <= 30, `tap jump ${r0(tap)}px (want 12-30)`);
    expect(full >= 45 && full <= 62, `held jump ${r0(full)}px (want 45-62)`);
    return `tap ${r0(tap)}px, held ${r0(full)}px`;
  });
  test('Move', 'long-leg leap: hold Down, then jump', (h) => {
    h.place(BOARDWALK.x, BOARDWALK.y); h.run(0.2, []);
    h.run(0.35, ['down']);
    const hgt = BOARDWALK.y - track(h, 0.9, ['down', 'jump']).minY;
    expect(hgt >= 95, `leap only ${r0(hgt)}px`);
    return `${r0(hgt)}px`;
  });
  test('Move', 'coyote time: jump just after running off a ledge', (h) => {
    const P = SWAMP.P;
    h.place(415, 160, 1); h.run(0.2, []);
    h.run(1, ['right'], () => !P.ground);
    h.run(0.05, ['right']);
    h.run(1 / 120, ['right', 'jump']);
    expect(P.vy < -200, `no coyote jump (vy ${r0(P.vy)})`);
  });
  test('Move', 'jump buffer: press just before landing', (h) => {
    const P = SWAMP.P;
    h.place(BOARDWALK.x, 100);
    h.run(1, [], () => P.vy > 0 && P.y > BOARDWALK.y - 14);
    h.run(2 / 120, ['jump']);
    const rose = h.run(0.2, ['jump'], () => P.vy < -100);
    expect(rose < 24, 'buffered jump did not fire on landing');
  });
  test('Move', 'drop through a plank: tap Down + Jump', (h) => {
    const P = SWAMP.P;
    h.place(BOARDWALK.x, BOARDWALK.y); h.run(0.2, []);
    h.run(1 / 120, ['down']); h.run(1 / 120, ['down', 'jump']); h.run(0.4, []);
    expect(P.y > BOARDWALK.y + 10, `still on the plank (y ${r0(P.y)})`);
  });
  test('Move', 'air kick: one dash per jump, refreshed on landing', (h) => {
    const P = SWAMP.P, T = SWAMP.TUNE;
    h.place(BOARDWALK.x, 90, 1);
    h.run(0.05, []); h.tap('dash', ['right']);
    expect(Math.abs(P.vx - T.dash) < 1 && !P.canDash, `dash vx ${r0(P.vx)}`);
    h.run(0.2, []);
    h.tap('dash', ['left']);
    expect(P.dashT <= 0, 'second air dash was allowed');
    h.run(1.5, [], () => P.ground);
    h.run(2 / 120, []);
    expect(P.canDash, 'kick not refreshed on landing');
  });
  test('Move', 'jump right after a ground dash', (h) => {
    const P = SWAMP.P;
    h.place(BOARDWALK.x, BOARDWALK.y, 1); h.run(0.2, []);
    h.tap('dash', []); h.run(0.25, []);
    h.run(2 / 120, ['jump']);
    expect(P.vy < -200, 'jump blocked after a ground dash');
  });
  test('Move', 'sticky feet: cling and slide slowly', (h) => {
    const P = SWAMP.P, T = SWAMP.TUNE;
    h.place(30, 150, -1);
    h.run(0.4, ['left']);
    expect(P.wall === -1, 'did not cling to the wall');
    h.run(0.3, []);
    expect(P.wall === -1 && P.vy <= T.wallSlide + 0.5, `slide speed ${r0(P.vy)}`);
  });
  test('Move', 'wall jump kicks away and refreshes the air kick', (h) => {
    const P = SWAMP.P;
    h.place(30, 150, -1); h.run(0.4, ['left']);
    P.canDash = false;
    h.run(2 / 120, ['jump']);
    expect(P.vx > 100 && P.vy < -200 && P.canDash, `vx ${r0(P.vx)} vy ${r0(P.vy)} kick ${P.canDash}`);
  });
  test('Move', 'wall-jump climb to the top of the shaft', (h) => {
    const P = SWAMP.P;
    h.place(40, FLOOR, -1); h.run(0.2, []);
    let hold = 'left', t = 0, best = P.y, jumpT = -1;
    h.run(3 / 120, ['left', 'jump']);
    for (let i = 0; i < 120 * 10 && best > 55; i++) {
      t++;
      const held = [hold];
      if (P.wall && jumpT < 0) { jumpT = t; hold = P.wall < 0 ? 'right' : 'left'; }
      if (jumpT >= 0 && t - jumpT < 30) held.push('jump');
      else if (jumpT >= 0) jumpT = -1;
      h.run(1 / 120, held);
      best = Math.min(best, P.y);
    }
    expect(best <= 55, `climbed only to y ${r0(best)} (top is 48)`);
    return `reached y ${r0(best)}`;
  });

  // ---------------------------------------------------------------- water
  test('Water', 'fall in, float up to the surface', (h) => {
    const P = SWAMP.P;
    h.place(750, 200); h.run(1.5, []);
    expect(P.water === 'w' && P.surface, `water ${P.water} surface ${P.surface}`);
  });
  test('Water', 'dive with Down, surface hop with Jump', (h) => {
    const P = SWAMP.P;
    h.place(750, 200); h.run(1.2, []);
    const y0 = P.y; h.run(0.8, ['down']);
    expect(P.y > y0 + 30, 'dive did not go down');
    h.run(1.5, [], () => P.surface);
    h.run(2 / 120, ['jump']);
    const out = h.run(0.5, ['jump'], () => !P.water);
    expect(out < 60, 'surface hop did not leave the water');
  });
  test('Water', 'swim kick bursts forward', (h) => {
    const P = SWAMP.P, T = SWAMP.TUNE;
    h.place(750, 200, 1); h.run(1.2, []); h.run(0.4, ['down']);
    h.tap('dash', ['right']);
    expect(P.vx > T.swim + 40, `swim kick vx ${r0(P.vx)}`);
  });

  // ---------------------------------------------------------------- tongue: weight rule
  test('Tongue', 'fly (W0) is reeled in and eaten, heals a heart', (h) => {
    const P = SWAMP.P, f = find('fly');
    h.place(BOARDWALK.x, BOARDWALK.y, 1); h.run(0.2, []);
    f.x0 = P.x + 50; f.y0 = P.y - 16; P.hp = 2; h.run(1 / 120, []);
    h.tap('tongue'); h.run(0.5, []);
    expect(P.flies === 1 && !f.alive && P.hp === 3, `flies ${P.flies} hp ${P.hp}`);
  });
  test('Tongue', 'pebble (W1) goes into the throat sac', (h) => {
    const P = SWAMP.P;
    h.place(820, 300, 1); h.run(0.6, ['down']);
    h.tap('tongue', ['down']); h.run(0.6, ['down']);
    expect(P.sac && P.sac.kind === 'pebble', 'pebble not in the sac');
  });
  test('Tongue', 'spit forward: pebble flies and lands', (h) => {
    const P = SWAMP.P, p = find('pebble');
    h.place(BOARDWALK.x, BOARDWALK.y, 1); h.run(0.2, []);
    P.sac = p; p.alive = false;
    h.tap('tongue'); h.run(1.5, []);
    expect(!P.sac && p.alive && p.resting && p.x > P.x + 30, `pebble at ${r0(p.x)}`);
  });
  test('Tongue', 'spit up at the target drops the drawbridge', (h) => {
    const P = SWAMP.P, p = find('pebble');
    killBeetle(); SWAMP.world.gateOpen = 1;
    h.place(1432, 192, 1); h.run(0.2, []);
    P.sac = p; p.alive = false;
    h.tap('tongue', ['up']); h.run(1.5, []);
    expect(find('target').hit, 'target not hit');
    h.run(1, []);
    expect(SWAMP.world.bridge >= 1 && h.oneWay(88, 9), 'drawbridge not walkable');
  });
  test('Tongue', 'lily pad (W2) is dragged toward the frog', (h) => {
    const pads = SWAMP.ents.filter(e => e.kind === 'pad');
    const far = pads.reduce((a, b) => (b.x > a.x ? b : a));
    const x0 = far.x;
    h.place(RIGHT_BANK.x, RIGHT_BANK.y, -1); h.run(0.2, []);
    h.tap('tongue', ['down']); h.run(2.5, []);
    expect(far.x > x0 + 40, `pad moved ${r0(far.x - x0)}px`);
    return `moved ${r0(far.x - x0)}px`;
  });
  test('Tongue', 'never drags the pad you are standing on', (h) => {
    const P = SWAMP.P, pad = SWAMP.ents.find(e => e.kind === 'pad');
    h.place(pad.x, pad.y - 1, 1); h.run(0.3, []);
    expect(P.plat === pad, 'could not stand on the pad');
    const x0 = pad.x;
    h.tap('tongue', ['down']); h.run(1, []);
    expect(Math.abs(pad.x - x0) < 1.5, `own pad slid ${r0(pad.x - x0)}px`);
  });
  test('Tongue', 'beetle (W2): first lick flips it, second eats it', (h) => {
    const P = SWAMP.P, b = find('beetle');
    h.place(GATE_YARD.x, GATE_YARD.y, -1); b.x = GATE_YARD.x - 44; b.dir = -1; h.run(0.1, []);
    h.tap('tongue', ['down']); h.run(0.4, []);
    expect(b.stun > 0, 'beetle not flipped');
    h.run(0.3, [], () => SWAMP.tongue.state === 'none');
    h.tap('tongue', ['down']); h.run(0.6, []);
    expect(!b.alive && P.flies === 2 && P.hp === 3, `alive ${b.alive} flies ${P.flies} hp ${P.hp}`);
  });
  test('Tongue', 'dragonfly (W1) is eaten for three flies', (h) => {
    const P = SWAMP.P, d = find('dragonfly');
    killBeetle();
    h.place(GATE_YARD.x - 30, GATE_YARD.y, 1); h.run(0.1, []);
    d.x0 = P.x + 45; d.y0 = P.y - 40; h.run(1 / 120, []);
    h.tap('tongue', ['up']); h.run(0.6, []);
    expect(!d.alive && P.flies === 3, `flies ${P.flies}`);
  });
  test('Tongue', 'licking an NPC gets a reaction, not a pull', (h) => {
    const P = SWAMP.P, toad = npc('E'), x0 = toad.x;
    h.place(toad.x - 36, 160, 1); h.run(0.2, []);
    h.tap('tongue', ['down']); h.run(0.5, []);
    expect(toad.say && toad.x === x0 && P.flies === 0, 'no reaction or the toad moved');
  });
  test('Tongue', 'aim assist ignores targets behind walls', (h) => {
    const P = SWAMP.P, f = find('fly');
    h.place(40, FLOOR, 1); h.run(0.2, []);
    f.x0 = 110; f.y0 = 178; // behind the shaft pillar
    h.tap('tongue', ['up']);
    const t = SWAMP.tongue;
    expect(Math.abs(t.dx - Math.SQRT1_2) < 0.01 && Math.abs(t.dy + Math.SQRT1_2) < 0.01, 'tongue snapped through the pillar');
    h.run(0.5, []);
    expect(P.flies === 0, 'ate a fly through a wall');
  });

  // ---------------------------------------------------------------- tongue: heavy things
  test('Swing', 'tongue a ring: latch and swing without pumping', (h) => {
    const P = SWAMP.P, ring = SWAMP.ents.find(e => e.kind === 'ring' && e.ch === 'o');
    h.place(PIT_EDGE.x, PIT_EDGE.y, 1); h.run(0.2, []);
    h.tap('tongue', ['up']);
    h.run(0.4, [], () => SWAMP.tongue.state === 'swing');
    expect(SWAMP.tongue.state === 'swing', `state ${SWAMP.tongue.state}`);
    let crossed = false, embedded = false, lowest = 0;
    h.run(1.2, [], () => { if (P.x > ring.x + 10) crossed = true; if (h.boxInSolid()) embedded = true; lowest = Math.max(lowest, P.y); return false; });
    expect(crossed, 'swing did not carry the frog past the ring');
    expect(!embedded, 'rope pulled the frog into a wall');
    expect(lowest < 256 && P.hp === 3, `dipped to y ${r0(lowest)} (bog at 256)`);
  });
  test('Swing', 'Jump lets go with a boost, Tongue lets go plainly', (h) => {
    const P = SWAMP.P;
    for (const key of ['jump', 'tongue']) {
      h.reset(); h.place(PIT_EDGE.x, PIT_EDGE.y, 1); h.run(0.2, []);
      h.tap('tongue', ['up']); h.run(0.4, [], () => SWAMP.tongue.state === 'swing');
      h.run(0.6, []);
      const vx = P.vx;
      h.tap(key);
      expect(SWAMP.tongue.state === 'none', `${key} did not let go`);
      if (key === 'jump') expect(P.vy < -150 && Math.abs(P.vx) >= Math.abs(vx), `no boost (vy ${r0(P.vy)})`);
    }
  });
  test('Swing', 'cross the bog pit: swing, jump off on the upswing', (h) => {
    const P = SWAMP.P, ring = SWAMP.ents.find(e => e.kind === 'ring');
    killBeetle();
    h.place(PIT_EDGE.x, PIT_EDGE.y, 1); h.run(0.2, []);
    h.tap('tongue', ['up']);
    h.run(1.5, [], () => SWAMP.tongue.state === 'swing' && P.x > ring.x + 25 && P.vy < 0);
    h.tap('jump');
    h.run(2, ['right'], () => P.ground);
    expect(P.ground && P.x > 1236 && P.hp === 3, `ended at x ${r0(P.x)} ground ${P.ground} hp ${P.hp}`);
    return `landed at x ${r0(P.x)}`;
  });
  test('Swing', 'turtle (W5) pulls the frog aboard', (h) => {
    const P = SWAMP.P, m = npc('M');
    h.place(RIGHT_BANK.x - 16, RIGHT_BANK.y, -1); m.x = 950; m.target = null; h.run(0.1, []);
    h.tap('tongue', ['down']); h.run(1.2, []);
    expect(P.plat === m, 'frog did not land on the turtle');
  });
  test('Swing', 'a blocked zip lets go instead of hanging', (h) => {
    const P = SWAMP.P, ring = find('ring');
    h.place(40, FLOOR, 1); h.run(0.2, []);
    Object.assign(SWAMP.tongue, { state: 'zip', target: ring, zipT: 0 });
    h.run(1.2, []);
    expect(SWAMP.tongue.state !== 'zip', 'zip still hanging after 1.2s');
  });

  // ---------------------------------------------------------------- croak & talk
  test('Croak', 'croak rings the bellflower and opens the gate', (h) => {
    killBeetle();
    h.place(GATE_YARD.x, GATE_YARD.y, 1); h.run(0.2, []);
    h.tap('croak'); h.run(2.2, []);
    expect(find('bell').rung && !h.solid(86, 10), 'gate still shut');
  });
  test('Croak', 'croak calls Mossback over', (h) => {
    const m = npc('M');
    h.place(RIGHT_BANK.x, RIGHT_BANK.y, -1); m.x = 700; m.target = null; h.run(0.1, []);
    h.tap('croak'); h.run(0.6, []);
    expect(m.target != null, 'turtle did not hear');
    const x0 = m.x; h.run(3, []);
    expect(m.x > x0 + 50, `turtle moved ${r0(m.x - x0)}px`);
  });
  test('Croak', 'NPCs answer a croak', (h) => {
    const toad = npc('E');
    h.place(toad.x - 30, 160, 1); h.run(0.2, []);
    h.tap('croak'); h.run(0.6, []);
    expect(toad.say === window.SWAMP_ROOM.npcs.E.onCroak, `said "${toad.say}"`);
  });
  test('Talk', 'talk opens, advances and closes when you walk off', (h) => {
    const toad = npc('E');
    h.place(toad.x - 16, 160, 1); h.run(0.2, []);
    h.tap('talk');
    expect(h.dialog() && h.dialog().i === 0, 'dialogue did not open');
    h.tap('talk');
    expect(h.dialog().i === 1, 'dialogue did not advance');
    h.place(toad.x + 90, 160); h.run(0.1, []);
    expect(!h.dialog(), 'dialogue stayed open');
  });

  // ---------------------------------------------------------------- hazards & health
  test('Health', 'beetle contact hurts once, then brief invulnerability', (h) => {
    const P = SWAMP.P, b = find('beetle');
    h.place(GATE_YARD.x, GATE_YARD.y, -1); b.x = GATE_YARD.x; b.stun = 0;
    h.run(0.05, []);
    expect(P.hp === 2 && P.invuln > 0, `hp ${P.hp}`);
    b.x = P.x; h.run(0.3, []);
    expect(P.hp === 2, 'hurt again while invulnerable');
  });
  test('Health', 'bog hurts and sends you back to safe ground', (h) => {
    const P = SWAMP.P;
    h.place(PIT_EDGE.x - 20, PIT_EDGE.y); h.run(0.3, []);
    h.place(1150, 280); h.run(0.2, []);
    expect(P.hp === 2 && P.x < 1072 && P.y <= 192, `hp ${P.hp} at ${r0(P.x)},${r0(P.y)}`);
  });
  test('Health', 'checkpoint stump saves, dying returns you there', (h) => {
    const P = SWAMP.P, s = find('stump');
    h.place(s.x, FLOOR); h.run(0.2, []);
    expect(P.checkpoint.x === s.x, 'checkpoint not set');
    killBeetle();
    const b = find('beetle'); b.alive = true; b.stun = 0;
    h.place(GATE_YARD.x, GATE_YARD.y); P.hp = 1; b.x = P.x;
    h.run(0.1, []);
    expect(P.hp === 3 && Math.abs(P.x - s.x) < 2, `hp ${P.hp} at x ${r0(P.x)}`);
  });

  // ---------------------------------------------------------------- platforms
  test('Platform', 'lily pad sinks under the frog', (h) => {
    const P = SWAMP.P, pad = SWAMP.ents.find(e => e.kind === 'pad');
    h.place(pad.x, pad.y - 1); h.run(0.5, []);
    expect(P.plat === pad && pad.sink > 1, `sink ${pad.sink.toFixed(2)}`);
  });
  test('Platform', 'Mossback carries the frog', (h) => {
    const P = SWAMP.P, m = npc('M');
    m.x = 800; m.dir = 1; m.target = null;
    h.place(m.x, m.y - 7); h.run(0.2, []);
    expect(P.plat === m, 'not standing on the turtle');
    const x0 = m.x; h.run(1.5, []);
    expect(Math.abs(m.x - x0) > 10 && Math.abs(P.x - m.x) < 4, `turtle moved ${r0(m.x - x0)}, frog offset ${r0(P.x - m.x)}`);
  });

  // ---------------------------------------------------------------- animation coverage
  const EXPECTED_ANIMS = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'kick', 'wall', 'swim', 'tongue', 'tongue_up', 'croak', 'hurt'];

  function runAll() {
    const h = SWAMP.test;
    h.running = true;
    h.seen.clear();
    const results = [];
    for (const t of tests) {
      h.reset();
      const t0 = performance.now();
      try {
        const note = t.fn(h);
        results.push({ group: t.group, name: t.name, ok: true, note: note || '', ms: performance.now() - t0 });
      } catch (e) {
        results.push({ group: t.group, name: t.name, ok: false, note: e.message, ms: performance.now() - t0 });
      }
    }
    const missing = EXPECTED_ANIMS.filter(a => !h.seen.has(a));
    results.push({ group: 'Anim', name: 'every animation state was reached during the cycle', ok: !missing.length, note: missing.length ? 'never reached: ' + missing.join(', ') : EXPECTED_ANIMS.length + ' states', ms: 0 });
    h.reset();
    h.running = false;
    return results;
  }

  window.SWAMP_TESTS = { tests, runAll };
})();
