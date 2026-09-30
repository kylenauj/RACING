#!/usr/bin/env node
// Headless run of the swamp mechanics test cycle.
//   node frog/tools/test-swamp.js
// Needs Playwright (npm i -D playwright, or a global install). Exits 1 on failure.
'use strict';
const path = require('path');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through */ }
  try {
    const root = require('child_process').execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  } catch (e) {
    console.error('Playwright not found. Install it with: npm i -D playwright');
    process.exit(2);
  }
}

(async () => {
  const { chromium } = loadPlaywright();
  const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const browser = await chromium.launch(opts);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = 'file://' + path.resolve(__dirname, '..', 'swamp', 'index.html');
  await page.goto(url);
  await page.waitForFunction(() => window.SWAMP_TESTS && window.SWAMP);
  const results = await page.evaluate(() => window.SWAMP_TESTS.runAll());
  await browser.close();

  let group = '';
  for (const r of results) {
    if (r.group !== group) { group = r.group; console.log('\n' + group); }
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? '  (' + r.note + ')' : ''}`);
  }
  const failed = results.filter(r => !r.ok).length;
  if (errors.length) console.log('\nPage errors:\n  ' + errors.join('\n  '));
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed || errors.length ? 1 : 0);
})();
