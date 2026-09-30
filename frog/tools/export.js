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
