/*
 * Swamp test room: data only. Edit the map and the text here; the engine
 * (game.js) reads everything from window.SWAMP_ROOM.
 *
 * One character = one 16x16 tile. Rows must all be the same width.
 *
 * Tiles
 *   #  mud (solid)             =  boardwalk plank (one-way: land on it, drop through with Down+Jump)
 *   w  pond water (swim)       |  boardwalk post (scenery)
 *   m  bog (hurts, sends you back to the last safe ground)
 *   -  overhanging branch (scenery)
 *   G  gate (solid until a bellflower is croaked at)
 *   d  drawbridge plank (appears when the target is hit)
 *
 * Things (the tile under them becomes air, or water if they sit in water)
 *   P  frog start              S  checkpoint stump
 *   L  lily pad (weight 2)     C  cattail, anchor at its head (heavy)
 *   o  hanging ring (heavy)    f  fly (weight 0, eaten)
 *   p  pebble (weight 1, goes in the throat sac, spit it back out)
 *   b  shell beetle (weight 2, enemy)   y  dragonfly (weight 1, enemy)
 *   B  bellflower (croak at it)          X  target (spit a pebble at it)
 *   E  Elder Toad   T  Tad the tadpole   M  Mossback the turtle ferry (weight 5)
 *   N  Newt         1-9  signs (text below)
 */
window.SWAMP_ROOM = {
  name: 'Mechanics Test Marsh',
  tile: 16,
  frogWeight: 3,
  map: [
    '#..............................................................................................#',
    '#..............................................................................................#',
    '#..............................................................................................#',
    '#..............................................................................................#',
    '#.................................................................-----------..................#',
    '#....................................................................o....o..................N.#',
    '#........................f..........................................................y.G.....####',
    '#............................f........................................................G.....####',
    '#.....................................................................................G....X####',
    '#...................2..E........f.............f.......................................G.dddd####',
    '#............####==========.............f.............................................G.....####',
    '#............####.|...|...|......3...............................4.............b..B...G.5...####',
    '#............####.|...|...|========............................####..........###################',
    '#.........##.####.|...|...|...|...|wCwLwwwwwLwwwwwMwwwwwwLwwwCw####..........###################',
    '#..P.S.1..##.####.|...|...|...|...|wwwwwwwwwwwwwwwwwwwwwwwwwwww####..........###################',
    '#################w|www|www|www|www|wwwwwwwwwwwwwwwwwwwwwwwwwwww####..........###################',
    '#################w|www|www|www|www|wwwwwwTwwwwwwwwwwwwwwwwwwwww####mmmmmCmmmm###################',
    '###################################wwwwwwwwwwwwwwwwwwwwwwwwwwww####mmmmmmmmmm###################',
    '###################################wwwwwwwwwwwwwwwwwwpwwwwwwwww####mmmmmmmmmm###################',
    '################################################################################################',
  ],
  signs: {
    1: 'LONG LEGS: tap Space to hop. Hold Space to crouch, then let go for a big leap.',
    2: 'THE WEIGHT RULE: X shoots your tongue. Lighter things come to you. Heavier things pull you to them.',
    3: 'POND: Pull the far lily pad over to make a bridge. The pebble on the bottom goes in your throat sac.',
    4: 'BOG PIT: tongue a ring and HOLD X to swing. Up/Down reels in and out. Let go at the top of the arc.',
    5: 'TARGET: with a pebble in your sac, Up+X spits it upward. Hit the target to drop the drawbridge.',
  },
  npcs: {
    E: {
      name: 'Elder Toad',
      lines: [
        'Hrrm. Long legs, short patience. I know the type.',
        'Your tongue is a question: who is heavier? Flies lose that argument. Cattails win it.',
        'Hold the tongue on something heavy and you will swing like a bell rope.',
        'Croak at me if you want. I am too old to croak back.',
      ],
      onCroak: 'HRRMMMP.',
    },
    T: {
      name: 'Tad',
      lines: [
        'blub! you can swim?? hold Up or Down in the water!',
        'the shiny pebble is down there. tongue it and it goes in your cheek!',
        'Mossback gives rides if you croak loud enough.',
      ],
      onCroak: 'blub blub!!',
    },
    M: {
      name: 'Mossback',
      lines: [
        '...slow... is... still... moving...',
        'Croak... and I... will come... to you.',
      ],
      onCroak: '...coming...',
    },
    N: {
      name: 'Newt',
      lines: [
        'You made it through the whole marsh. Tongue, legs, lungs: all working.',
        'This is where the real swamp starts. Nobody has built it yet.',
      ],
      onCroak: 'Nice pipes.',
    },
  },
};
