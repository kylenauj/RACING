# Longleg Frog

An 8-bit, long-legged frog with a sticky tongue, and a test room for the
metroidvania it's meant to star in. Plain HTML + JS, no build step: open the
HTML files in a browser.

| Open | What it is |
| --- | --- |
| `index.html` | Sprite viewer: playable pond demo, every animation, frame inspector, palette |
| `swamp/index.html` | **Mechanics Test Marsh**, the playable test room |

## The character

- `frog.js` is the rig. A pose (body position/tilt/squash, jaw, eye state,
  IK targets for four limbs, tongue, fx) is rasterised into a 72×48 cell with
  a 16-colour palette. Each part gets its own 1px outline, so frames look
  hand-drawn. Pivot is pixel (24, 45), on the ground under the frog.
- `frog-anims.js` defines the base animations as pose lists with frame times:
  `idle`, `walk`, `run`, `jump`, `fall`, `land`, `kick`, `wall`, `tongue`,
  `tongue_up`, `croak`, `hurt`. A global `POSTURE` in `frog.js` stands the
  torso upright while a neck joint keeps the head level. Tongue strike frames are flagged `hit` and carry the tip position.
- `node tools/export.js` writes `sprites/frog-sheet.png` (one row per
  animation) and `sprites/frog-sheet.json` (durations, loop flags, walk speed,
  tongue hitboxes relative to the pivot) for any engine.

## The signature mechanic: the Weight Rule

The tongue sticks to whatever it hits, and **the lighter side moves**. The
frog weighs 3.

- Lighter things come to you: flies (eaten, +1 heart), pebbles (stored in the
  throat sac, spat back out with X), dragonflies, flipped beetles.
- Equal-ish things get dragged: lily pads slide across the water, so you can
  build your own bridge.
- Heavier things pull you: cattails, rings, Mossback the turtle. Rings and cattails:
  the tongue latches on and you swing by yourself; Jump lets go with a boost.
  The turtle pulls you onto his shell.

Movement is built to be quick:

- **Run**: 128 px/s with hard acceleration and even harder turnarounds.
- **Jump**: fires the moment you press it; let go early for a short hop
  (about 1 tile), hold for a full jump (about 3 tiles), with extra hang time at the top.
- **Long-leg leap**: hold Down to crouch, then jump for a big leap (about 7 tiles).
- **Air kick** (Shift): one 8-direction dash per jump. Landing, grabbing a
  wall or grabbing something with the tongue gives it back.
- **Sticky feet**: push into a wall mid-air to cling and slide slowly; jump to
  kick off it. Chain wall jumps up shafts.
- Swim faster, with a swim kick (Shift). Tongue zips are faster.

Other frog verbs: croak (rings bellflowers, calls the turtle ferry, NPCs
answer).

Later areas can build on the one number. A swallowed stone makes the frog
heavier: it sinks, breaks rotten planks, and now drags things that used to
drag it. A gulped air bubble makes it lighter. Bosses can change weight
between phases.

## Test room

`swamp/room.js` is data only: an ASCII tile map (one character per 16×16
tile), sign text and NPC dialogue. The legend is at the top of the file. Edit
the map and reload. `swamp/game.js` is the engine; tuning numbers are in the
`TUNE` object at the top.

Stations, left to right: sticky-feet wall-jump shaft → long-leg jumps → boardwalk and flies (Elder Toad) →
pond with lily pads, a pebble on the bottom, Tad and Mossback → bog pit swing
→ bellflower gate and pebble target → Newt at the finish.

Controls: arrows run, Space jump (hold for height), hold Down then Space for
the long-leg leap, Shift air kick, push into walls to cling and Space to wall
jump, X tongue (Up/Down + X to aim; on a ring you swing, Jump lets go), C croak, Down or E talk,
tap Down + Space to drop through planks, G hitboxes and weights, R reset.

## Mechanics test cycle

`swamp/tests.js` drives the real game step with scripted input at a fixed
120 Hz and checks every mechanic: running, jumps (tap, held, long-leg leap,
coyote time, jump buffer), drop-through, air kick, wall cling and climb,
swimming, every weight class on the tongue, spitting, the target, swinging
across the bog pit, zipping onto the turtle, croak, talk, damage, bog,
checkpoints, moving platforms, warps and reset. It finishes by checking that
every animation state was reached.

Run it from the page (**Run test cycle** under the room) or headless:

    node frog/tools/test-swamp.js    # needs Playwright; exits 1 on any failure
