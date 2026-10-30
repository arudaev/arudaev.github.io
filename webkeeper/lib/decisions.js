// decisions.js – what every card and the game follow (design/couch-games/07-LOOK.md, 09-SCREENS.md; first set 26 October). The tokens and decisions card
// (tokens/decisions.html) prints this; lib/place.js and lib/layers.js read the camera, the sizes and the motion
// from it. Where an older card disagrees, this file and 07-LOOK.md win.
(function () {
  const D = {
    date: '26 October',
    // ── the camera: one, from above at a slant, following Harold through joined areas
    camera: {
      view: 'from above, at a slant',
      room: { cols: 160, rows: 45, cw: 8, ch: 16 },         // the big grid: what you play with sits here
      texture: { cw: 6, ch: 12 },                          // the small marks' grid at 56K (213 × 60 a room)
      ground: 1.8,      // a circle on the ground is 1.8× as wide as tall on screen: a ring is an ellipse
      moon: [-0.55, -0.62],   // up and to the left; shadows fall down and to the right
      sort: 'feet',     // everything standing is drawn in order of where its feet are
      rules: [
        'the camera follows harold through joined areas; a puzzle area fits the smallest view',
        'the ground is seen at a slant: a ring on it is 1.8 times as wide as tall',
        'what stands rises up the screen; everything is sorted by its feet',
        'tall things stand behind the walk area – nobody walks behind a tree',
        'the moon is up and to the left; shadows fall down and to the right',
        'holes go through the page: the night below shows through them',
      ],
    },
    // ── the two sizes (07-LOOK.md: two sizes)
    sizes: {
      big: { px: 16, for: 'the cast, signs, loose letters, words, the status line – a gap of ink round each' },
      small: { px: 12, for: 'texture: grass, stone, soil, leaves, water, mist – it comes loose and settles, nobody picks it up' },
      tiers: [['14.4K', 24], ['28.8K', 18], ['33.6K', 14], ['56K', 12]],   // the texture's cell as friends come home; the big size never changes
    },
    type: {
      face: 'VT323',
      rules: ['every glyph is VT323 – never a system font in the world', 'things are upright; voices and thoughts are italic',
        'en dashes, never em dashes; no tilde (VT323 draws it like an N)', 'plain lowercase captions',
        'shade blocks only for built things and the ui, never for the world'],
    },
    // ── the palette: Voyager's six, tints mixed from them, and two sets kept for one thing each (keys of Webkeeper.P)
    palette: {
      six: [['ink', 'ink'], ['ocean', 'ocean'], ['phosphor', 'phosphor'], ['beige', 'beige'], ['red', 'signal red'], ['yellow', 'duck yellow']],
      tints: [['inkUp', 'ink up'], ['tealUp', 'teal up'], ['tealHi', 'teal hi'], ['phosphorDim', 'phosphor dim'], ['phosphorDeep', 'phosphor deep'],
        ['beigeDim', 'beige dim'], ['yellowDim', 'yellow dim'], ['redDim', 'red dim'], ['burgundy', 'burgundy']],
      named: [['brown', 'mishka'], ['brownDim', 'mishka shadow']],
      rules: ['harold is the only duck-yellow thing on screen', 'mishka\'s brown is for mishka; the rainbow\'s six for the rainbow',
        'tints are mixes of the six – never a new hue', 'ink is the darkest tone: shade is fewer, dimmer marks', 'flat colours: no blur, no glow, no smooth gradients'],
    },
    // ── controls (09-SCREENS.md: controls): one stick, two buttons, everywhere
    controls: {
      head: ['', 'move', 'A – quack', 'B – malifex', 'menu'],
      rows: [
        ['keyboard', 'arrows, wasd', 'space, j', 'shift, k', 'esc'],
        ['gamepad', 'stick, d-pad', 'a / cross', 'b / circle', 'start'],
        ['phone, tablet', 'drag, left half', 'big, right', 'small, right', 'corner'],
        ['in voyager', 'voyager\'s own keys, pad and touch stick, handed to the tv'],
      ],
      rules: ['the rings (planned): a ring wheel on a held A, or every ring always on – open', 'as malifex, A gives the nearest uniclone an order; B is harold again',
        'one target at a time: whatever A or a talk acts on is outlined first', 'the mouse and trackpad are for menus only',
        'nothing needs speed or precision; the game saves every 5 s and when the page is put away'],
    },
    // ── motion and the budget
    motion: {
      fps: 12, loop: 4, windSteps: 6,
      settle: [1, 0.6, 0.3, 0], settleAfter: 3,               // loose letters settle about three seconds after they come loose
      ring: { speed: 26, reach: 28 },                         // the quack: 26 columns a second, out to 28 columns (on the ground)
      // step 3 r2 (26 October, late): the living texture flows – every mark moved every frame on the GPU (lib/marks.js)
      grass: { fps: 'display', pivot: 'root', wind: 'the sketch\'s rolling waves and a gust front every 7.9 s, one field for every blade', flutter: 'none – the field moves as waves', sheen: 'a gust lightens what it passes', touch: { radius: 5, settle: 1.8, eased: true } },
      rules: ['the grass and everything that grows is never still and never steps: it moves every frame, each patch its own way',
        'feet and rings part it in the same frame; it settles back smoothly over about a second',
        'built things and letters keep their steps (twelve a second): the cut between what lives and what was made',
        'a card loops in four seconds; a room demo in eight', 'budget: 4 ms a frame on a mid-range phone; a slow device plays a tier lower'],
    },
  };
  window.WK_DECISIONS = D;
})();
