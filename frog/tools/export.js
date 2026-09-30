#!/usr/bin/env node
// Writes the frog's PNGs into frog/sprites/.
//   node frog/tools/export.js
'use strict';
const fs = require('fs');
const path = require('path');
const Frog = require('../frog.js');
const { encodePNG, upscale } = require('./png.js');

const OUT = path.join(__dirname, '..', 'sprites');
fs.mkdirSync(OUT, { recursive: true });
const W = Frog.CELL_W, H = Frog.CELL_H;

function write(name, w, h, rgba) {
  fs.writeFileSync(path.join(OUT, name), encodePNG(w, h, rgba));
  console.log('wrote sprites/' + name, w + 'x' + h);
}

// character reference: neutral pose, 1x and 4x
const neutral = Frog.toRGBA(Frog.renderPose({}).px);
write('frog-character.png', W, H, neutral);
write('frog-character@4x.png', W * 4, H * 4, upscale(W, H, neutral, 4));

// animation sheet: one row per animation, one 72x48 cell per frame,
// plus a JSON atlas with durations, loop flags, pivot and tongue hitboxes
require('../frog-anims.js');
const anims = Frog.buildAnims();
const names = Object.keys(anims);
const cols = Math.max(...names.map(n => anims[n].frames.length));
const SW = cols * W, SH = names.length * H;
const sheet = new Uint8ClampedArray(SW * SH * 4);
const atlas = {
  meta: {
    image: 'frog-sheet.png', size: { w: SW, h: SH }, cell: { w: W, h: H },
    pivot: { x: Frog.ORIGIN_X, y: Frog.ORIGIN_Y }, facing: 'right',
    hitboxes: 'tongue tip, in pixels relative to the pivot (x right, y down)',
    palette: Frog.PALETTE.slice(1),
  },
  animations: {},
};
names.forEach((name, row) => {
  const a = anims[name];
  atlas.animations[name] = {
    loop: a.loop,
    speed: a.speed || undefined,
    frames: a.frames.map((f, col) => {
      Frog.toRGBA(f.px, sheet, SW, col * W, row * H);
      const fr = { x: col * W, y: row * H, w: W, h: H, duration: f.ms };
      if (f.hit && f.tip) fr.hitbox = { x: Math.round(f.tip[0] - 3), y: Math.round(f.tip[1] - 3), w: 6, h: 6 };
      return fr;
    }),
  };
});
write('frog-sheet.png', SW, SH, sheet);
write('frog-sheet@4x.png', SW * 4, SH * 4, upscale(SW, SH, sheet, 4));
fs.writeFileSync(path.join(OUT, 'frog-sheet.json'), JSON.stringify(atlas, null, 1) + '\n');
console.log('wrote sprites/frog-sheet.json', names.join(', '));
