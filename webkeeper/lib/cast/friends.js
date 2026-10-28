// friends.js – the friends and Bug, after the rule in brief/GAME.md ("## The cast"): every
// character is what their name already says, drawn first as a tiny grid sprite you could type –
// like Harold's >(.)__ – at most 4 rows × 9 cells, one colour of their own, one prop, one gag.
// Up close they come loose: the same idea in more glyphs, each a little off its cell.
// Loaded after cast.js. Every idle loops in 4 s.
(function () {
  const C = WK_CAST, P = C.P, { hash } = Webkeeper, loop4 = C.loop4;
  // the colour key for a sprite's colour map: one letter per cell
  const KEY = { y: P.yellow, r: P.red, R: P.redDim, b: P.beige, d: P.beigeDim, t: P.tealHi, T: P.tealUp, g: P.phosphor, G: P.phosphorDim, u: P.burgundy };
  // Lex's colours: the palette's tints, one per sound
  const LEX_TINTS = [P.phosphor, P.tealHi, P.red, P.beige, P.phosphorDim, P.redDim];

  // a sprite at grid size: rows of text + a colour map of the same shape. (x, y): its feet, centred,
  // in px. At s = 1 it sits exactly on the grid; o.dx[] shifts single rows by px (a sway);
  // o.tint replaces the letter L in the map.
  function sprite(W, x, y, rows, cmap, o = {}) {
    const s = o.s || 1, gw = W.cw * s, gh = W.ch * s, w = Math.max(...rows.map((r) => r.length));
    const left = s === 1 ? Math.round(x / W.cw - w / 2) * W.cw : x - w * gw / 2, top = y - rows.length * gh;
    W.reset();
    rows.forEach((row, i) => { for (let j = 0; j < row.length; j++) if (row[j] !== ' ') {
      W.g.fillStyle = P.ink; W.g.fillRect(left + j * gw + ((o.dx || [])[i] || 0), top + i * gh, gw, gh);
    } });
    rows.forEach((row, i) => { for (let j = 0; j < row.length; j++) if (row[j] !== ' ') {
      const k = (cmap[i] || '')[j] || 'b', col = k === 'L' ? o.tint : KEY[k] || P.beige;
      if (s === 1) { W.reset(); W.g.fillStyle = col; W.g.fillText(row[j], left + j * gw + ((o.dx || [])[i] || 0), top + i * gh); }
      else W.loose(left + (j + 0.5) * gw + ((o.dx || [])[i] || 0), top + (i + 0.5) * gh, row[j], col, 0, gh);
    } });
    W.reset();
  }
  // the same art come loose, for close-ups: every glyph a little off its cell and a little turned,
  // the same every frame (so nothing shimmers); the whole figure bobs as one piece
  function loose(W, x, y, rows, cmap, o = {}) {
    const s = o.s || 3, gw = W.cw * s, gh = W.ch * s, w = Math.max(...rows.map((r) => r.length));
    const left = x - w * gw / 2, top = y - rows.length * gh + (o.oy || 0);
    W.reset(); W.g.fillStyle = P.ink;
    rows.forEach((row, i) => { for (let j = 0; j < row.length; j++) if (row[j] !== ' ') W.g.fillRect(left + j * gw - 2, top + i * gh - 2, gw + 4, gh + 4); });
    rows.forEach((row, i) => { for (let j = 0; j < row.length; j++) if (row[j] !== ' ') {
      const h1 = hash(i * 31 + j, o.seed || 1, 5), h2 = hash(j * 17 + i, o.seed || 1, 6);
      const k = (cmap[i] || '')[j] || 'b', col = k === 'L' ? o.tint : KEY[k] || P.beige;
      W.loose(left + (j + 0.5 + (h1 - 0.5) * 0.3) * gw, top + (i + 0.5 + (h2 - 0.5) * 0.18) * gh, row[j], col, (h1 - 0.5) * 0.16, gh * (0.92 + h2 * 0.16));
    } });
    W.reset();
  }
  // a colour map from one letter per row, with per-glyph exceptions: paint(rows, 'tdd', { o: 'b' })
  const paint = (rows, rowKeys, glyphKeys = {}, rowGlyphKeys = {}) => rows.map((row, i) =>
    [...row].map((ch) => ((rowGlyphKeys[i] || {})[ch] || glyphKeys[ch] || rowKeys[i] || rowKeys[rowKeys.length - 1])).join(''));
  const say = (W, x, y, str, col = P.beige) => C.sayAt(W, x, y, str, col);
  const talking = (t) => Math.floor(loop4(t) * 8) % 2 === 1;

  // ── in the room: line figures (28 October) ─────────────────────────────────────────
  // In the room the friends are drawn like Lord Malifex and his cat: outlines of their key shapes in loose lines,
  // the ink behind them, nothing filled in – so each reads at a glance as what their name says. The typed sprites
  // above stay for the dialogue close-ups. Units are cells (cast.js): x in columns, y in rows, up negative; feet at 0.
  const { arc, lineFigure, shiftFig } = C;
  const PI = Math.PI;
  const line = (col, ...p) => ({ col, p });
  const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
  const figure = (W, fig, x, y, o = {}) => lineFigure(W, fig, x, y, { s: o.s || 1, flip: o.flip });

  // Sid: a sloth hanging from a link's underline by both hooked arms, round and sleepy, a dark mask round his
  // eyes and a red tuft – beige dim, his own grey-brown
  const SID_ARM = [[-0.95, -3.0], [-1.8, -3.8], [-2.25, -4.75], [-2.15, -5.2], [-1.75, -5.45], [-1.45, -5.2]];
  const SID_FIG = {
    fill: [[-2.6, -5.5], [2.6, -5.5], [2.15, -2.7], [2.0, -0.6], [0.9, 0.05], [-0.9, 0.05], [-2.0, -0.6], [-2.15, -2.7]],
    strokes: [
      line(P.tealHi, [-3.8, -5.25], [3.8, -5.25]),
      line(P.beigeDim, ...SID_ARM), line(P.beigeDim, ...mirror(SID_ARM)),
      line(P.beigeDim, ...arc(0, -2.75, 1.45, 0.78, 0, 2 * PI, 18)),
      line(P.beigeDim, ...arc(0, -1.15, 1.8, 1.15, -0.2 * PI, 1.2 * PI, 16)),
      line(P.beige, ...arc(-0.55, -2.8, 0.5, 0.24, 0, 2 * PI, 8)), line(P.beige, ...arc(0.55, -2.8, 0.5, 0.24, 0, 2 * PI, 8)),
      line(P.beigeDim, ...arc(0, -2.4, 0.35, 0.12, 0.1 * PI, 0.9 * PI, 5)),
      line(P.red, [-0.3, -3.5], [-0.15, -3.95]), line(P.red, [0.15, -3.5], [0.35, -3.9]),
      line(P.beigeDim, [-0.8, -0.1], [-1.05, 0.15], [-0.75, 0.25]), line(P.beigeDim, [0.8, -0.1], [1.05, 0.15], [0.75, 0.25]),
    ],
    dots: [{ x: -0.55, y: -2.8, chr: '-', col: P.beige, size: 0.8 }, { x: 0.55, y: -2.8, chr: '-', col: P.beige, size: 0.8 }],
  };
  function sidFig(W, x, y, t, o) {
    const l = loop4(t), shut = l >= 1.2 && l < 2.4, swing = [0, 1, 2, 1, 0, -1, -2, -1][Math.floor(l * 2) % 8] * 0.08;
    // he swings from the bar: everything under it moves, more the lower it is
    const fig = shiftFig(SID_FIG, ([px, py]) => (py > -5.2 ? [px + swing * (5.2 + py), py] : [px, py]));
    if (!shut) fig.dots = fig.dots.map((d) => ({ ...d, chr: 'o', size: 0.6 }));
    figure(W, fig, x, y, o);
  }

  // Swift: a swift – long scythe wings swept back, a forked tail – in a folded paper hat with an eye on it
  const SWIFT_WING = [[-0.8, -2.3], [-2.4, -2.95], [-4.2, -2.75], [-5.6, -2.0], [-4.0, -2.05], [-2.4, -1.8], [-0.8, -1.45]];
  const SWIFT_FIG = {
    fill: [[-5.6, -2.0], [-2.4, -3.0], [-1.1, -3.35], [0, -4.7], [1.1, -3.35], [2.4, -3.0], [5.6, -2.0], [0.8, -1.2], [0.75, 0.05], [-0.75, 0.05], [-0.8, -1.2]],
    strokes: [
      line(P.tealHi, ...SWIFT_WING), line(P.tealHi, ...mirror(SWIFT_WING)),
      line(P.tealHi, ...arc(0, -1.85, 0.85, 0.9, -0.15 * PI, 1.15 * PI, 10)),
      line(P.tealHi, ...arc(0, -2.95, 0.72, 0.42, 0, 2 * PI, 12)),
      line(P.tealHi, [-0.35, -0.95], [-0.95, -0.2], [0, -0.6], [0.95, -0.2], [0.35, -0.95]),
      line(P.beige, [-1.25, -3.3], [0, -4.65], [1.25, -3.3], [-1.25, -3.3]),
      line(P.beigeDim, [-0.7, -3.55], [0.7, -3.55]),
    ],
    dots: [{ x: 0, y: -3.95, chr: 'o', col: P.beigeDim, size: 0.55 }, { x: -0.28, y: -3.0, chr: '.', col: P.beige, size: 0.8 },
      { x: 0.28, y: -3.0, chr: '.', col: P.beige, size: 0.8 }, { x: 0, y: -2.7, chr: 'v', col: P.beige, size: 0.6 }],
  };
  function swiftFig(W, x, y, t, o) {
    // the wingtips flick on the beat
    const up = Math.floor(loop4(t) * 2) % 2 ? -0.35 : 0;
    figure(W, shiftFig(SWIFT_FIG, ([px, py]) => (Math.abs(px) > 2.6 ? [px, py + up * (Math.abs(px) - 2.6) / 3] : [px, py])), x, y, o);
  }

  // Lex: a chameleon on a branch, side on – an arched back, a casque, a turret eye that rolls, a tail curled into a
  // spiral, feet round the branch – in the colour of whatever he's hearing
  const LEX_BODY = [
    [[-2.6, -0.9], [-2.3, -1.9], [-1.0, -2.55], [0.6, -2.65], [1.8, -2.35]],
    [[1.8, -2.35], [2.2, -2.95], [2.7, -2.4], [3.45, -1.85], [3.7, -1.4], [2.9, -1.0], [2.2, -1.15]], [[3.7, -1.4], [3.0, -1.3]],
    [[-2.45, -0.8], [-0.6, -0.6], [1.2, -0.78], [2.2, -1.15]],
    [[-2.6, -0.9], [-3.4, -0.7], [-4.1, -1.1], [-4.3, -1.9], [-3.9, -2.4], [-3.3, -2.3], [-3.1, -1.8], [-3.4, -1.5], [-3.7, -1.75]],
    [[1.2, -0.78], [1.5, -0.3], [1.3, 0]], [[0.4, -0.65], [0.2, -0.3], [0.45, 0]],
    [[-1.2, -0.66], [-1.4, -0.3], [-1.15, 0]], [[-2.0, -0.78], [-2.2, -0.3], [-1.95, 0]],
  ];
  const LEX_FILL = [[-4.0, -2.45], [-2.3, -2.0], [-1.0, -2.6], [0.6, -2.7], [2.2, -3.0], [3.75, -1.4], [2.9, -0.95], [1.5, 0], [-2.2, 0], [-4.35, -1.0]];
  function lexFig(W, x, y, t, o) {
    const tint = lexTint(t), roll = [[0, 0], [-0.12, 0], [0, -0.07], [0.12, 0], [0, 0.07], [0, 0]][Math.floor(loop4(t) * 1.5) % 6];
    const strokes = [line(P.beigeDim, [-4.4, 0.02], [4.4, 0.02]), line(P.beigeDim, [2.9, 0.02], [3.5, -0.4]), ...LEX_BODY.map((p) => line(tint, ...p)),
      line(tint, ...arc(2.6, -1.95, 0.4, 0.25, 0, 2 * PI, 10))];
    if (lexTongue(t)) strokes.push(line(P.red, [3.6, -1.45], [5.3, -1.6]));
    const dots = [{ x: 2.6 + roll[0], y: -1.95 + roll[1], chr: '.', col: P.beige, size: 0.9 }];
    if (lexTongue(t)) dots.push({ x: 5.4, y: -1.6, chr: 'o', col: P.red, size: 0.7 });
    figure(W, { fill: LEX_FILL, strokes, dots }, x, y, o);
  }

  // Currywurst: a sausage cut in slices, lying in a paper tray, sauce on top, a headset over the end slice – the one
  // with the sleepy face – and the mic at his mouth; his can beside the tray
  const CURRY_FIG = {
    fill: [[-3.7, -1.0], [-3.3, -2.15], [1.4, -2.15], [1.6, -2.6], [3.1, -2.6], [3.3, -1.0], [3.3, 0], [-3.3, 0]],
    strokes: [
      line(P.beige, [-3.7, -1.0], [-3.25, 0], [3.25, 0], [3.7, -1.0]), line(P.beigeDim, [-3.7, -1.0], [3.7, -1.0]),
      line(P.red, ...arc(-2.6, -1.5, 0.5, 0.5, 0.5 * PI, 1.5 * PI, 6)), line(P.red, [-2.6, -2.0], [1.9, -2.0]),
      line(P.red, ...arc(2.05, -1.5, 0.65, 0.5, -0.5 * PI, 0.5 * PI, 7)),
      line(P.redDim, [-1.6, -2.0], [-1.8, -1.1]), line(P.redDim, [-0.4, -2.0], [-0.6, -1.1]), line(P.redDim, [0.8, -2.0], [0.6, -1.1]),
      line(P.tealHi, ...arc(2.05, -1.95, 0.8, 0.55, PI, 2 * PI, 8)), line(P.tealHi, [1.25, -1.95], [1.25, -1.45]), line(P.tealHi, [2.85, -1.95], [2.85, -1.45]),
      line(P.tealHi, [2.85, -1.5], [3.3, -1.15], [2.75, -1.05]),
    ],
    dots: [{ x: -2.0, y: -2.2, chr: ':', col: P.burgundy, size: 0.7 }, { x: -0.95, y: -2.25, chr: '.', col: P.burgundy, size: 0.8 },
      { x: 0.2, y: -2.2, chr: ':', col: P.burgundy, size: 0.7 }, { x: 1.85, y: -1.6, chr: '-', col: P.beige, size: 0.6 },
      { x: 2.35, y: -1.6, chr: '-', col: P.beige, size: 0.6 }, { x: 2.7, y: -1.05, chr: 'o', col: P.tealHi, size: 0.5 }],
  };
  const CAN_FIG = { fill: [[4.1, 0], [4.1, -1.15], [4.95, -1.15], [4.95, 0]], strokes: [line(P.red, [4.1, 0], [4.1, -1.1], [4.95, -1.1], [4.95, 0], [4.1, 0]), line(P.beigeDim, [4.15, -0.75], [4.9, -0.75])], dots: [{ x: 4.5, y: -1.2, chr: '.', col: P.beige, size: 0.7 }] };
  function curryFig(W, x, y, t, o) {
    const ph = o.talk ? 'awake' : curryPhase(t), fig = shiftFig(CURRY_FIG, ([px, py]) => [px, py + (ph === 'pop' ? -0.2 : 0)]);
    if (ph !== 'asleep') fig.dots = fig.dots.map((d) => (d.chr === '-' ? { ...d, chr: ph === 'pop' ? 'O' : 'o', size: 0.55 } : d));
    figure(W, fig, x, y, o);
    figure(W, CAN_FIG, x, y, o);
  }

  // Pterodactyl: wings spread – the membrane scalloped between her fingers – a long crest back, a longer beak, a
  // pencil behind her ear and a rolled blueprint in her feet
  const PTERO_WING = [[-0.5, -2.25], [-2.6, -3.05], [-4.6, -2.3], [-3.6, -1.95], [-3.1, -1.55], [-2.2, -1.85], [-1.6, -1.35], [-0.6, -1.45]];
  const PTERO_FIG = {
    fill: [[-4.6, -2.3], [-2.6, -3.1], [-2.5, -4.0], [0.7, -4.4], [3.3, -3.3], [0.5, -2.9], [4.6, -2.3], [0.7, -1.2], [1.1, 0.05], [-1.1, 0.05], [-0.7, -1.2]],
    strokes: [
      line(P.burgundy, ...PTERO_WING), line(P.burgundy, ...mirror(PTERO_WING)),
      line(P.burgundy, ...arc(0, -1.8, 0.7, 0.68, 0, 2 * PI, 12)), line(P.burgundy, [0, -2.45], [0, -3.0]),
      line(P.burgundy, ...arc(0, -3.35, 0.55, 0.36, 0, 2 * PI, 10)), line(P.burgundy, [-0.4, -3.55], [-2.4, -3.95], [-0.5, -3.25]),
      line(P.beige, [0.5, -3.5], [3.3, -3.3], [0.5, -3.15]),
      line(P.yellow, [-0.15, -3.8], [0.7, -4.35]),
      line(P.burgundy, [-0.3, -1.15], [-0.4, -0.35]), line(P.burgundy, [0.3, -1.15], [0.4, -0.35]),
      line(P.tealHi, [-1.1, -0.2], [1.1, -0.2]),
    ],
    dots: [{ x: 0.15, y: -3.4, chr: 'o', col: P.beige, size: 0.55 }, { x: 0.75, y: -4.4, chr: '.', col: P.beigeDim, size: 0.8 },
      { x: -1.15, y: -0.2, chr: 'o', col: P.tealHi, size: 0.6 }, { x: 1.15, y: -0.2, chr: 'o', col: P.tealHi, size: 0.6 }],
  };
  function pteroFig(W, x, y, t, o) {
    // laughing, she throws her head back: the beak tips up
    const up = laughing(t, o) ? -0.25 : 0;
    figure(W, shiftFig(PTERO_FIG, ([px, py]) => (py < -2.9 && px > 0.4 ? [px, py + up * (px - 0.4)] : [px, py])), x, y, o);
  }

  // Pilot: a paper dart side on – the wing's long triangle, the keel folded under – with goggles on its nose
  const PILOT_FIG = {
    fill: [[3.2, -1.4], [-3.0, -2.65], [-2.4, -1.5], [-3.0, -0.9], [-1.4, -0.55]],
    strokes: [
      line(P.beige, [3.2, -1.4], [-3.0, -2.6], [-2.4, -1.5], [3.2, -1.4]),
      line(P.beige, [-2.4, -1.5], [-3.0, -0.9], [3.2, -1.4]), line(P.beigeDim, [-2.4, -1.5], [-1.4, -0.6], [3.2, -1.4]),
      line(P.tealHi, ...arc(2.05, -1.62, 0.28, 0.17, 0, 2 * PI, 8)), line(P.tealHi, ...arc(1.45, -1.72, 0.28, 0.17, 0, 2 * PI, 8)),
      line(P.tealUp, [0.9, -1.85], [1.17, -1.75]),
    ],
    dots: [],
  };
  function pilotFig(W, x, y, o) { figure(W, PILOT_FIG, x, y, o); }

  // ── Sid – a sloth, hanging from a hyperlink like a branch ─────────────────────────
  // the way sloths hang in every picture book: hooked claws over the link's underline, long arms
  // up, the body hanging below, a sleepy face the right way up with the dark mask round his eyes,
  // a red tuft on top. Gag: protects the last of anything; blinks once a minute.
  const SID = ['___________', ' J  ,,,  L ', '  \\(=-.-=)/', '   (    )  ', '    "  "   '];
  const SID_MAP = ['ttttttttttt', ' d  rrr  d ', '  ddRbdbRdd', '   dddddd  ', '    d  d   '];
  const SID_CLOSE = [
    '     the last page      ',
    '________________________',
    '    J              L    ',
    '     \\\\   ,,,,,,  //     ',
    '      \\\\ (=- . -=)//     ',
    '        (        )      ',
    '        (        )      ',
    '         ""    ""       ',
  ];
  const SID_CLOSE_MAP = paint(SID_CLOSE, 'ttddddddd', { J: 'd', L: 'd' }, { 3: { ',': 'r' }, 4: { '=': 'R', '-': 'b', '.': 'b' } });
  const sid = {
    name: 'sid', pron: 'he', key: 'beige dim, a dark eye mask, a red tuft', prop: 'a hyperlink to hang from', gag: 'blinks once a minute',
    rows: SID, line: 'this is the last page. so we keep it.',
    sprite(W, x, y, t, o = {}) {
      sidFig(W, x, y, t, o);
    },
    close(W, x, y, t, o = {}) {
      const l = loop4(t), rows = SID_CLOSE.slice();
      if (l >= 1.2 && l < 2.4) rows[4] = '      \\\\ (=_ . _=)//     ';
      if (o.talk) rows[5] = '        (   o    )      ';
      loose(W, x, y, rows, SID_CLOSE_MAP, { s: o.s, seed: 11, oy: C.breathe(t) });
    },
  };

  // ── Swift – a swift (the bird), in a paper boat hat folded from printed lyrics ──────
  // long scythe wings, wider than he is, swept back; a forked tail; on his head the hat, with an
  // eye doodled on its front. Gag: knows every word, sings all of them. Idle: sings, wings flick.
  const SWIFT = ['    /\\     ', '   /o=\\    ', "_.-(o>)-._ ", " `-._V_.-' ", '    \\/     '];
  const SWIFT_MAP = ['    bb     ', '   bbdb    ', 'ttttbdtttt ', ' ttttttttt ', '    tt     '];
  const SWIFT_CLOSE = [
    '             /\\              ',
    '            /<o>\\            ',
    '           /=-=-=\\           ',
    "__..--''-._(  o  )_.-''--..__",
    " `''--..___\\  <  /___..--''` ",
    '            \\___/            ',
    '             \\/              ',
  ];
  const SWIFT_CLOSE_MAP = paint(SWIFT_CLOSE, 'bbdttttt', { o: 'b', '<': 'd' }, { 1: { '<': 'b', '>': 'b' }, 2: { '/': 'b', '\\': 'b' } });
  const swiftNotes = (W, x, y, t, s) => {
    const l = loop4(t);
    for (let i = 0; i < 3; i++) {
      const age = (l + i * 1.33) % 4;
      if (age > 2) continue;
      W.loose(x + (4 + age * 1.5 + Math.sin(age * 4 + i) * 0.5) * W.cw * s, y - (5 + age * 1.8) * W.ch * s, i % 2 ? '♫' : '♪', age < 1.2 ? P.beige : P.beigeDim, 0, W.ch * 1.1 * Math.sqrt(s));
    }
  };
  const swift = {
    name: 'swift', pron: 'he', key: 'teal hi', prop: 'a paper hat folded from song lyrics', gag: 'sings every word',
    rows: SWIFT, line: 'wait – i know this one. every word.',
    sprite(W, x, y, t, o = {}) {
      swiftFig(W, x, y, t, o);
      if (!o.quiet) swiftNotes(W, x, y, t, o.s || 1);
    },
    close(W, x, y, t, o = {}) {
      const rows = SWIFT_CLOSE.slice();
      if (Math.floor(loop4(t) * 2) % 2) { rows[3] = "  ''--.._(  o  )_..--''    "; rows[4] = "  ,--''__\\  <  /__''--,    "; }
      if (o.talk) rows[4] = rows[4].replace('<', 'o');
      loose(W, x, y, rows, SWIFT_CLOSE_MAP, { s: o.s, seed: 12, oy: C.breathe(t) });
    },
  };

  // ── Lex – a chameleon on a branch ───────────────────────────────────────────────────
  // the side profile everyone knows: an arched back, a casque on his head, a bulging turret eye,
  // feet gripping the branch, a tail curled into a spiral; his colour follows every sound, in
  // steps. Gag: the most confused in the room. Idle: the eye rolls, the tongue flicks out, '?'.
  const LEX = ['    __/^\\  ', " .-'  (o) \\", '/        _>', '\\(@)\\_/\\_/ ', '==========='];
  const LEX_MAP = ['    LLLLL  ', ' LLL  LbL L', 'LLLLLLLLLLL', 'LLLLLLLLLL ', 'ddddddddddd'];
  const EYE = ['o', '<', '^', '>', 'v', 'o'];
  const lexEye = (t) => EYE[Math.floor(loop4(t) * 1.5) % EYE.length];
  const lexTint = (t) => LEX_TINTS[Math.floor(loop4(t) * 2) % LEX_TINTS.length];
  const lexTongue = (t) => { const l = loop4(t); return l >= 2.6 && l < 3.1; };
  const LEX_CLOSE = [
    '           /^\\__          ',
    "        .-' (o)  '-.      ",
    "      .'            '.    ",
    '     <_               \\   ',
    "      \\_/\\___/\\__/(@)  |   ",
    "                  '--'    ",
    '==========================',
  ];
  const LEX_CLOSE_MAP = paint(LEX_CLOSE, 'LLLLLLd', {}, { 1: { o: 'b' } });
  const lex = {
    name: 'lex', pron: 'he', key: 'whatever he hears', prop: 'a branch', gag: 'his eye rolls, his tongue flicks',
    rows: LEX, line: 'you sound… teal? is that bad?',
    sprite(W, x, y, t, o = {}) {
      lexFig(W, x, y, t, o);
      if (!o.quiet && Math.floor(loop4(t) * 1.5) % 3 === 0) say(W, x + 3 * W.cw * (o.s || 1), y - 6.5 * W.ch * (o.s || 1), '?');
    },
    close(W, x, y, t, o = {}) {
      const rows = LEX_CLOSE.slice(), map = LEX_CLOSE_MAP.slice();
      rows[1] = `        .-' (${lexEye(t)})  '-.      `;
      if (lexTongue(t) || o.talk) { rows[3] = 'o====<_               \\   '; map[3] = 'rrrrr' + map[3].slice(5); }
      loose(W, x, y, rows, map, { s: o.s, seed: 13, tint: lexTint(t), oy: C.breathe(t) });
    },
  };

  // ── Currywurst – a sausage cut in slices, in a paper tray, wearing a headset ────────
  // red slices under a blanket of sauce dots, the end slice with a sleepy face between the
  // headset's ear cups, the mic at his mouth; a beige tray; a can beside him. Gag: asleep till
  // the energy drink pops. Idle: snores 'z' – then the can pops and he jolts awake.
  const CURRY = ['    .---.  ', '(O:O[-.-]=o', ' \\_______/ '];
  const CURRY_MAP = ['    ttttt  ', 'rrRrtbbbttb', ' bbbbbbbbb '];
  const CAN = ['[=]'], CAN_MAP = ['rbr'];
  const CURRY_CLOSE = [
    '              .-------.     ',
    '  . : . : .  /         \\    ',
    ' (O : O : O [  - . -  ]==o  ',
    '  \\______________________/  ',
  ];
  const CURRY_CLOSE_MAP = paint(CURRY_CLOSE, 'tRrb', { O: 'r', ':': 'R', '[': 't', ']': 't', '=': 't', '-': 'b', '.': 'b' }, { 1: { '/': 't', '\\': 't' }, 2: { o: 'b' } });
  const curryPhase = (t) => { const l = loop4(t); return l < 2.6 ? 'asleep' : l < 3.0 ? 'pop' : 'awake'; };
  const currywurst = {
    name: 'currywurst', pron: 'he', key: 'red', prop: 'a headset, and an energy can', gag: 'asleep till the can pops',
    rows: CURRY, line: "five more minutes. then i'll save the world.",
    sprite(W, x, y, t, o = {}) {
      const s = o.s || 1, ph = o.talk ? 'awake' : curryPhase(t);
      curryFig(W, x, y, t, o);
      if (o.quiet) return;
      if (ph === 'asleep') { const a = loop4(t) % 1.3; say(W, x + (3 + a * 2) * W.cw * s, y - (3.5 + a * 2) * W.ch * s, a < 0.65 ? 'z' : 'Z', P.beigeDim); }
      else say(W, x + 6 * W.cw * s, y - 2.5 * W.ch * s, ph === 'pop' ? 'psst!' : '!', P.beige);
    },
    close(W, x, y, t, o = {}) {
      const ph = o.talk ? 'awake' : curryPhase(t), rows = CURRY_CLOSE.slice();
      if (ph === 'pop') rows[2] = ' (O : O : O [  O . O  ]==o  ';
      else if (ph === 'awake') rows[2] = ` (O : O : O [  o ${o.talk && Math.floor(loop4(t) * 8) % 2 ? 'o' : '.'} o  ]==o  `;
      loose(W, x, y + (ph === 'pop' ? -4 : 0), rows, CURRY_CLOSE_MAP, { s: o.s, seed: 14, oy: C.breathe(t) });
      if (ph === 'asleep' && !o.quiet) say(W, x + 6 * W.cw * o.s, y - 5.5 * W.ch * o.s, 'z z', P.beigeDim);
    },
  };

  // ── Pterodactyl – a small pterodactyl with a pencil behind her ear ──────────────────
  // a long crest and a longer beak, membrane wings stretched between her fingers, a rolled
  // blueprint in her feet; she's an architect. Gag: laughs like a seagull – the HA's turn into gulls.
  const PTERO = ['     ____/ ', '<====(o)/  ', ' /\\ / \\ /\\ ', '/  V   V  \\', '    [=]    '];
  const PTERO_MAP = ['     RRRRr ', 'ddddRbRR   ', ' RR R R RR ', 'R  R   R  R', '    tTt    '];
  const PTERO_CLOSE = [
    '                ________/    ',
    ' <===========(  o  )/        ',
    '              \\___/          ',
    '   /\\     /\\   |   /\\     /\\ ',
    '  /  \\   /  \\  "  /  \\   /  \\',
    ' /    \\_/    \\   /    \\_/    \\',
    '            [=====]          ',
  ];
  const PTERO_CLOSE_MAP = paint(PTERO_CLOSE, 'RdRRRRt', { o: 'b', '<': 'd', '=': 'd' }, { 0: { '/': 'r' }, 1: { '(': 'R', ')': 'R', '/': 'R' }, 4: { '"': 'd' }, 6: { '[': 't', ']': 't', '=': 'T' } });
  const laughing = (t, o) => !o.quiet && !o.talk && loop4(t) >= 1.0 && loop4(t) < 2.4;
  const pterodactyl = {
    name: 'pterodactyl', pron: 'she', key: 'red dim', prop: 'a pencil behind her ear, a rolled blueprint', gag: 'laughs like a seagull',
    rows: PTERO, line: 'the bridge is wrong. HA – i love it.',
    sprite(W, x, y, t, o = {}) {
      const s = o.s || 1, l = loop4(t), laugh = laughing(t, o);
      pteroFig(W, x, y, t, o);
      if (laugh) for (let i = 0; i < 3; i++) {
        const age = l - 1.0 - i * 0.35;
        if (age < 0) continue;
        const hx = x + (2 + i * 1.5 + age * 2) * W.cw * s, hy = y - (6 + age * 3) * W.ch * s;
        if (age < 0.7) say(W, hx, hy, 'HA'); else W.loose(hx, hy, 'v', P.beigeDim, 0, W.ch * Math.sqrt(s));
      }
    },
    close(W, x, y, t, o = {}) {
      const rows = PTERO_CLOSE.slice();
      if (o.talk) rows[1] = ' <=====<=====(  o  )/        ';
      loose(W, x, y, rows, PTERO_CLOSE_MAP, { s: o.s, seed: 15, oy: C.breathe(t) });
    },
  };

  // ── Pilot – a paper airplane with tiny goggles on its nose ──────────────────────────
  // folded beige paper, teal goggles at the tip. Gag: draws as she flies – her trail is a pencil
  // line. Idle: she loops, and the dotted trail draws a little duck.
  const PILOT = ['\\`-.__   ', ' >===oo> ', "/_.-'    "];
  const PILOT_MAP = ['bbbbbb   ', ' dbbbttb ', 'bbbbb    '];
  // the duck her trail draws, in cells round her anchor: a head, a beak, a back and a tail
  const DUCK_PATH = (() => {
    const p = [];
    for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.9 + i / 10 * Math.PI * 2; p.push([-1 + Math.cos(a) * 1.6, -5 + Math.sin(a) * 0.9]); }   // head
    p.push([1.2, -4.6], [0.6, -4.4], [0.4, -4.2]);                                                                                                // beak
    for (let i = 0; i <= 12; i++) { const a = Math.PI * 1.05 - i / 12 * Math.PI * 1.1; p.push([-1 + Math.cos(a) * 4, -2.2 - Math.sin(a) * -1.4]); } // body
    p.push([-5.6, -3.2], [-4.8, -3.0]);                                                                                                            // tail
    return p;
  })();
  const pilot = {
    name: 'pilot', pron: 'she', key: 'beige paper', prop: 'goggles on her nose', gag: 'her trail is a pencil line',
    rows: PILOT, line: "hold still, harold. you're my best drawing.",
    sprite(W, x, y, t, o = {}) {
      const s = o.s || 1;
      if (o.quiet) { pilotFig(W, x, y, o); return; }
      const l = loop4(t), n = Math.floor(l / 3.4 * DUCK_PATH.length);
      // the trail: dots along the duck so far
      for (let i = 0; i < Math.min(n, DUCK_PATH.length); i++) W.loose(x + DUCK_PATH[i][0] * W.cw * s * 1.1, y + DUCK_PATH[i][1] * W.ch * s * 0.9, '.', P.beigeDim, 0, W.ch * s);
      const at = DUCK_PATH[Math.min(n, DUCK_PATH.length - 1)];
      pilotFig(W, x + at[0] * W.cw * s * 1.1 + 3 * W.cw * s, y + at[1] * W.ch * s * 0.9 + 1.5 * W.ch * s, o);
    },
    close(W, x, y, t, o = {}) {
      const rows = [
        '              _.-\'/   ',
        '         _.-\'    /    ',
        '  <(oo)=========<     ',
        '         \'-._    \\    ',
        '              \'-._\\   ',
      ];
      if (o.talk) rows[2] = '  <(oo)====o====<     ';
      loose(W, x, y, rows, paint(rows, 'bbdbb', { o: 't', '(': 't', ')': 't' }), { s: o.s, seed: 16, oy: C.breathe(t) });
    },
  };

  // ── Bug – a husky pup made of zeros ─────────────────────────────────────────────────
  // pointed ears, two blue eyes, a pale face mask and a darker back, a curled tail. Our own pup,
  // nobody's likeness. States: scared (ears flat, tail tucked, shaking), called ("bug bug bug":
  // ears up, tail wagging), digging (glyph dirt flying), howling (head up, aWOO).
  const BUG = {
    calm: { rows: [' ^_^   ', '(0 0)  ', '(000)@ ', ' "  "  '], map: [' dbd   ', 'bt tb  ', 'dddddd ', ' b  b  '] },
    scared: { rows: [' -_-   ', '(o o)  ', '(000)  ', ' "  "  '], map: [' dbd   ', 'bt tb  ', 'ddddd  ', ' b  b  '] },
    called: { rows: [' ^_^   ', '(0u0)  ', '(000)@ ', ' "  "  '], map: [' dbd   ', 'btrtb  ', 'dddddd ', ' b  b  '] },
    dig: { rows: ['    _@ ', ' ^(000)', '(0 0)" ', '  ""   '], map: ['    dd ', ' dddddd', 'bt tbb ', '  bb   '] },
    howl: { rows: ['  ^ ^  ', ' (- -) ', '(000)o ', ' "  "  '], map: ['  d d  ', ' bb bb ', 'ddddd  ', ' b  b  '] },
  };
  BUG.howl.rows = ['   ^^  ', '  (-o) ', '(000)@ ', ' "  "  ']; BUG.howl.map = ['   dd  ', '  bbbb ', 'dddddd ', ' b  b  '];
  function bug(W, x, y, t, state = 'calm', o = {}) {
    const s = o.s || 1, l = loop4(t), B = BUG[state], rows = B.rows.slice();
    let dx = 0;
    if (state === 'scared') dx = Math.floor(l * 12) % 2 ? 1 : -1;   // shaking
    if (state === 'called') { rows[1] = '(0u0)  '; rows[2] = Math.floor(l * 4) % 2 ? '(000)@ ' : '(000)Q '; }   // tongue out, the tail wags
    sprite(W, x + dx * s, y, rows, B.map, { s });
    if (o.quiet) return;
    if (state === 'called') say(W, x + 1 * W.cw * s, y - 5 * W.ch * s, ['bug', 'bug bug', 'bug bug bug', ''][Math.floor(l) % 4], P.beige);
    if (state === 'howl') say(W, x + 2 * W.cw * s, y - (5 + Math.floor(l * 2) % 2) * W.ch * s, 'aWOO', P.beige);
    if (state === 'dig') for (let i = 0; i < 6; i++) {
      const age = (l * 1.5 + i / 6) % 1;
      W.loose(x + (-2 - age * 5) * W.cw * s, y - (1 + Math.sin(age * Math.PI) * 3) * W.ch * s, '.,:\'`.'[i], P.beigeDim, 0, W.ch * Math.sqrt(s));
    }
  }
  // up close he must read as a husky, not a cat: wide-set triangle ears, a pale mask with dark
  // eyebrow marks, blue eyes, a longer muzzle with a dark nose and an open mouth, a thick ruff
  const BUG_CLOSE = [
    "   /\\              /\\   ",
    "  /##\\____________/##\\  ",
    " |    '.   ||   .'    | ",
    " |    (0)  ||  (0)    | ",
    "  \\       .-''-.     /  ",
    "   '.    /  ▼▼  \\   .'   ",
    "     '--|  \\__/  |--'    ",
    "        |   UU   |       ",
    "  ((((((('------')))))))  ",
    "      (0000000000)@      ",
  ];
  // white mask, dark ears and forehead stripe, blue eyes, a dark nose, a red tongue, a grey ruff
  const BUG_CLOSE_MAP = BUG_CLOSE.map((row, i) => [...row].map((ch) => {
    if (ch === '0') return i === 3 ? 't' : 'd';
    if (ch === '#') return 'R';
    if (ch === '▼') return 'R';
    if (ch === 'U') return 'r';
    if (ch === '|' && i < 4 && row.indexOf('||') >= 0 && row.indexOf(ch) !== row.lastIndexOf(ch)) return 'd';
    if (i <= 1 || i >= 8 || ch === '@') return 'd';
    if (i === 8 && "'-".includes(ch)) return 'b';
    return 'b';
  }).join(''));
  function bugClose(W, x, y, t, o = {}) {
    const rows = BUG_CLOSE.slice();
    if (o.talk) rows[6] = "     '--|  \\/\\/  |--'    ";
    if (Math.floor(loop4(t) * 4) % 2) rows[9] = '      (0000000000)Q      ';
    loose(W, x, y, rows, BUG_CLOSE_MAP, { s: o.s, seed: 17, oy: C.breathe(t) });
  }

  window.WK_FRIENDS = { KEY, sprite, loose, paint, FRIENDS: { sid, swift, lex, currywurst, pterodactyl, pilot }, ORDER: ['sid', 'swift', 'lex', 'currywurst', 'pterodactyl', 'pilot'], bug, BUG, bugClose };
})();
