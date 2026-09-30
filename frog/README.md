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
  `idle`, `walk`, `jump`, `fall`, `land`, `tongue`, `tongue_up`, `croak`,
  `hurt`. Tongue strike frames are flagged `hit` and carry the tip position.
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
- Heavier things pull you: cattails, rings, Mossback the turtle. Tap to zip,
  hold X to swing, Up/Down to reel.

Supporting frog verbs: charge jump (hold Space: long legs crouch and leap),
swimming and diving, croak (rings bellflowers, calls the turtle ferry, NPCs
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

Stations, left to right: long-leg jumps → boardwalk and flies (Elder Toad) →
pond with lily pads, a pebble on the bottom, Tad and Mossback → bog pit swing
→ bellflower gate and pebble target → Newt at the finish.

Controls: arrows move, Space hop (hold to leap), X tongue (hold to swing,
Up/Down + X to aim), C croak, Down or E talk, Down + Space drop through
planks, G hitboxes and weights, R reset.
