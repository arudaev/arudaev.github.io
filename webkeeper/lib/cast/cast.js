// cast.js – the cast of Webkeeper, drawn with lib/webkeeper.js. Every card in cards/cast uses it.
//   <script src="../../lib/webkeeper.js"></script><script src="cast.js"></script>
//   const C = WK_CAST; C.harold(W, x, y, t); C.malifex(W, x, y, t, { s: 1, look: -1, talk: false });
// The friends and Bug are in friends.js, the UNIClones in uniclones.js, Mishka in mishka.js.
// A figure is drawn with its feet centred on (x, y) in pixels. Units inside a figure are cells:
// x in columns, y in rows, up is negative – a row is twice as tall as a column is wide.
// Every idle loops in 4 s (t % 4), so a 48-frame GIF loops cleanly. Motion is stepped.
(function () {
  const { P, RAINBOW, hash } = Webkeeper;
  const TAU = Math.PI * 2;
  const loop4 = (t) => ((t % 4) + 4) % 4;
  // points round an ellipse, in cell units
  const arc = (cx, cy, rx, ry, a0 = 0, a1 = TAU, n = 14) =>
    Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
  const blink = (t, at) => { const l = loop4(t); return l >= at && l < at + 0.17; };
  // the whole figure moves a pixel or two as one piece, in steps – never re-drawn, so nothing shimmers
  const breathe = (t, phase = 0, px = 1) => (Math.sin(TAU * loop4(t) / 2 + phase) > 0.3 ? -px : 0);

  // ── drawing ────────────────────────────────────────────────────────────────────────
  // in loose lines: an ink silhouette (fill), then each stroke as loose dashes laid along it at
  // its angle, close enough to read as one line; dots are single glyphs (eyes, a horn tip).
  // o.s scales, o.flip mirrors, o.fill === false skips the ink silhouette.
  function lineFigure(W, fig, ox, oy, o = {}) {
    const { g, cw, ch } = W, s = o.s ?? 1, fx = o.flip ? -1 : 1;
    const X = (x) => ox + x * fx * s * cw, Y = (y) => oy + y * s * ch;
    W.reset();
    if (o.fill !== false && fig.fill) {
      g.fillStyle = P.ink; g.beginPath();
      fig.fill.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
      g.closePath(); g.fill();
    }
    const k = Math.min(1.6, Math.max(0.8, Math.sqrt(s))), size = ch * 1.15 * k;
    for (const st of fig.strokes || []) for (let i = 0; i < st.p.length - 1; i++) {
      const ax = X(st.p[i][0]), ay = Y(st.p[i][1]), bx = X(st.p[i + 1][0]), by = Y(st.p[i + 1][1]);
      const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / (cw * 0.42 * (st.gap || 1)))), ang = st.chr && st.chr !== '-' ? 0 : Math.atan2(by - ay, bx - ax);
      for (let j = 0; j <= n; j++) W.loose(ax + (bx - ax) * j / n, ay + (by - ay) * j / n, st.chr || '-', st.col, ang, size * (st.size || 1));
    }
    for (const d of fig.dots || []) W.loose(X(d.x), Y(d.y), d.chr, d.col, 0, ch * (d.size || 1) * k);
  }
  const inside = (poly, x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  // soft loose: a shape filled with small loose glyphs on half cells, lit from the upper left
  // like the moon – lighter glyphs where the light falls. The plush way to fill.
  function softFill(W, poly, ox, oy, o = {}) {
    const { cw, ch } = W, s = o.s ?? 1, fx = o.flip ? -1 : 1, ramp = o.ramp || '.:;', holes = o.holes || [], step = o.step || 0.5;
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) {
      if (!inside(poly, x, y) || holes.some((h) => inside(h, x, y))) continue;
      const h = hash(Math.round(x * 8 + 999), Math.round(y * 8 + 999), o.seed || 0);
      const light = 0.55 - (x - x0) / (x1 - x0 || 1) * 0.35 - (y - y0) / (y1 - y0 || 1) * 0.35 + (h - 0.5) * 0.5;
      const chr = ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor((light + 0.15) * ramp.length)))];
      if (chr === ' ') continue;
      const px = ox + (x + (h - 0.5) * 0.3 * step * 2) * fx * s * cw, py = oy + (y + (hash(Math.round(y * 8), Math.round(x * 8), 3) - 0.5) * 0.2) * s * ch;
      W.loose(px, py, chr, light > 0.45 ? o.lit : o.dim, 0, ch * (o.size || 0.9) * Math.min(1.5, Math.max(0.8, Math.sqrt(s))));
    }
  }
  // a grid sprite, scaled: its bottom row's foot on (x, y) in px, centred. At s = 1 it is exactly
  // a grid sprite; bigger, each glyph grows with it (for close-ups). Ink under every glyph.
  function sprite(W, x, y, lines, colOf, s = 1) {
    const { g, cw, ch } = W, w = Math.max(...lines.map((l) => l.length));
    const gw = cw * s, gh = ch * s, x0 = Math.round(x / cw - w / 2) * cw + (s === 1 ? 0 : 0), y0 = y - lines.length * gh;
    const left = s === 1 ? x0 : x - w * gw / 2;
    W.reset();
    lines.forEach((l, i) => { for (let j = 0; j < l.length; j++) if (l[j] !== ' ') {
      g.fillStyle = P.ink; g.fillRect(left + j * gw, y0 + i * gh, gw, gh);
    } });
    lines.forEach((l, i) => { for (let j = 0; j < l.length; j++) if (l[j] !== ' ') {
      W.loose(left + (j + 0.5) * gw, y0 + (i + 0.5) * gh, l[j], colOf(l[j], i, j), 0, gh);
    } });
  }
  const shiftFig = (fig, fn) => ({
    fill: fig.fill && fig.fill.map(fn), strokes: (fig.strokes || []).map((st) => ({ ...st, p: st.p.map(fn) })),
    dots: (fig.dots || []).map((d) => { const [x, y] = fn([d.x, d.y]); return { ...d, x, y }; }),
  });
  // turn a figure about its feet by a small angle (a sway), in cell units with the row aspect
  const swayFig = (fig, a) => shiftFig(fig, ([x, y]) => [x * Math.cos(a) - y * 2 * Math.sin(a), (x / 2) * Math.sin(a) + y * Math.cos(a)]);
  // italic text centred on px (x, y) – a voice, a thought
  function sayAt(W, x, y, str, col) { W.textI(Math.round(x / W.cw - str.length / 2), Math.round(y / W.ch), str, col); }

  // ── Harold (the grid sprite is his look – decided) ─────────────────────────────────
  const HAROLD_GRID = { idle: ['   _  ', ' >(.)__', '  (___/'], blink: ['   _  ', ' >(-)__', '  (___/'] };
  function harold(W, x, y, t, o = {}) {
    const lines = blink(t, o.blinkAt ?? 3.0) ? HAROLD_GRID.blink : HAROLD_GRID.idle;
    sprite(W, x + W.cw * 0.5, y, lines, (c) => (c === '>' ? P.red : P.yellow), o.s || 1);
  }
  // the back of Harold's head for the dialogue close-up: big, low left, cut by the frame; his
  // cheek bulging on the right and the tip of his beak pointing into the picture. (x0, y1) is
  // the panel's lower-left corner in px; s scales it to the panel.
  function haroldBack(W, x0, y1, t, s = 1) {
    const oy = y1 + breathe(t, 0.5);
    const head = arc(9, -9, 11, 6, 0, TAU, 22);
    const cheek = arc(17.5, -7, 3.6, 2.4, -Math.PI * 0.55, Math.PI * 0.45, 8);
    lineFigure(W, { fill: head, strokes: [
      { col: P.yellow, p: head }, { col: P.yellow, p: cheek },
      { col: P.red, p: [[20.6, -8.2], [24.4, -8.9], [21.0, -7.3]] },
      { col: P.yellowDim, p: [[7, -14.6], [8.5, -16.4], [9.6, -15.1]] },
    ] }, x0, oy, { s });
    softFill(W, head, x0, oy, { s, ramp: '   .:', lit: P.yellowDim, dim: P.yellowDim, size: 0.8, step: 0.6 });
    const body = arc(4, 4, 26, 9, Math.PI, TAU, 18);
    lineFigure(W, { fill: [...body, [31, 5], [-23, 5]], strokes: [
      { col: P.yellow, p: body }, { col: P.yellowDim, p: [[10, -1.5], [19, -2.6], [25, -1.2]] },
    ] }, x0, oy, { s });
  }

  // ── Lord Malifex (loose lines – decided) ─────────────────────────────────────────────
  const MALIFEX_LINES = {
    fill: [[-3.8, 0], [-3.4, -3], [-3, -4.5], [-2.6, -6.5], [-1.2, -7.7], [-0.4, -8.3], [0.6, -7.6], [2.4, -6.4], [3, -4.5], [3.4, -3], [3.8, 0]],
    strokes: [
      { col: P.beigeDim, p: [[-3, -4.5], [-2.6, -6.5], [-1.2, -7.7], [-0.4, -8.3], [0.6, -7.6], [2.4, -6.4], [3, -4.5]] },
      { col: P.beigeDim, p: [[-1.7, -4.7], [-1.5, -6], [0, -6.7], [1.5, -6], [1.7, -4.7]] },
      { col: P.beigeDim, p: [[-3, -4.5], [-3.4, -3], [-3.8, 0], [3.8, 0], [3.4, -3], [3, -4.5]] },
      { col: P.beigeDim, p: [[0, -4.5], [0, 0]] },
      { col: P.beigeDim, p: [[-3.2, -3.3], [-1.6, -1.7], [-0.4, -1.9]] },
      { col: P.beigeDim, p: [[3.2, -3.3], [1.6, -1.7], [0.4, -1.9]] },
    ],
    dots: [{ x: -0.6, y: -5.5, chr: 'o', col: P.phosphor }, { x: 0.6, y: -5.5, chr: 'o', col: P.phosphor }],
  };
  function malifex(W, x, y, t, o = {}) {
    const l = loop4(t), sway = Math.round(Math.sin(TAU * l / 4) * 2) * 0.12;
    const glow = o.talk ? P.phosphor : [P.phosphor, P.phosphor, P.phosphorDim, P.phosphorDeep][Math.floor(l * 2) % 4];
    const fig = shiftFig(MALIFEX_LINES, ([px, py]) => (py < -4.5 ? [px + sway * (-py - 4.5), py] : [px, py]));
    fig.dots = fig.dots.map((d) => ({ ...d, x: d.x + (o.look || 0) * 0.3, y: d.y + (o.look ? 0.25 : 0), col: blink(t, 1.5) ? P.ink : glow }));
    lineFigure(W, fig, x, y + breathe(t, 2) * (o.s || 1), { s: o.s || 1 });
  }

  // ── Malifex as the cat (loose lines, like the hood): a round ginger cat, one paw up, after the photo he sent. His hat
  // is the top of his own hood, the very same lines at the very same height, set on a floppy brim; the cat is drawn
  // under it, so both forms stand as tall. His eyes stay the hood's green; the ginger is the bible's one orange
  // (book/00-the-bible.md); nothing filled in but the ink behind
  const GINGER = '#F28C28';
  const HOOD_TOP = MALIFEX_LINES.strokes.slice(0, 2).map((st) => ({ ...st }));   // the hood's point and its opening
  const MALICAT_LINES = (() => {
    const body = arc(0, -1.35, 4.0, 1.45, -0.35 * Math.PI, 1.35 * Math.PI, 26), head = arc(0, -3.4, 2.7, 1.05, -0.1 * Math.PI, 1.1 * Math.PI, 18);
    const brim = [[-4.2, -4.1], [-3.3, -4.42], [-1.6, -4.52], [0, -4.5], [1.6, -4.52], [3.3, -4.42], [4.2, -4.1]];
    return {
      fill: [[-3.8, -0.3], [-4.1, -1.4], [-3.4, -2.4], [-4.3, -4.0], ...MALIFEX_LINES.strokes[0].p, [4.3, -4.0], [3.4, -2.4], [4.4, -3.3], [5.1, -3.0], [4.1, -1.4], [3.8, -0.3], [0, 0.05]],
      strokes: [
        { col: GINGER, p: body }, { col: GINGER, p: head },
        { col: GINGER, p: [[-2.6, -3.9], [-2.3, -4.4]] }, { col: GINGER, p: [[2.6, -3.9], [2.3, -4.4]] },
        { col: GINGER, p: [[-3.2, -2.1], [-3.7, -1.2], [-3.3, -0.75]] },
        { col: GINGER, p: [[3.1, -2.2], [4.4, -3.0]] },
        { col: P.beigeDim, p: [[-1.5, -3.2], [-3.4, -3.4]] }, { col: P.beigeDim, p: [[-1.5, -3.0], [-3.4, -2.8]] },
        { col: P.beigeDim, p: [[1.5, -3.2], [3.4, -3.4]] }, { col: P.beigeDim, p: [[1.5, -3.0], [3.4, -2.8]] },
        // the mouth: a wide ω under the nose, as in the photo
        { col: P.beigeDim, p: arc(-0.55, -3.02, 0.55, 0.22, 0, Math.PI, 6) }, { col: P.beigeDim, p: arc(0.55, -3.02, 0.55, 0.22, 0, Math.PI, 6) },
        { col: P.redDim, p: [[-1.9, -2.5], [0, -2.36], [1.9, -2.5]] },
        { col: P.beigeDim, p: brim }, ...HOOD_TOP,
      ],
      dots: [{ x: -0.95, y: -3.65, chr: 'o', col: P.phosphor }, { x: 0.95, y: -3.65, chr: 'o', col: P.phosphor },
        { x: 0, y: -3.25, chr: 'v', col: P.redDim, size: 0.8 }, { x: 0, y: -2.15, chr: 'o', col: P.beige, size: 0.8 },
        { x: 4.7, y: -3.15, chr: 'o', col: GINGER, size: 0.9 }, { x: -3.1, y: -0.65, chr: 'o', col: GINGER, size: 0.9 }],
    };
  })();
  function malicat(W, x, y, t, o = {}) {
    const l = loop4(t), sway = Math.round(Math.sin(TAU * l / 4) * 2) * 0.12, wave = [0, -0.12, 0, 0.12][Math.floor(l)];
    // the hat sways exactly as the hood does; the raised paw waves
    const fig = shiftFig(MALICAT_LINES, ([px, py]) => (py < -4.5 ? [px + sway * (-py - 4.5), py] : px > 4 ? [px, py + wave] : [px, py]));
    fig.dots = fig.dots.map((d) => (d.col === P.phosphor ? { ...d, col: blink(t, 2.5) ? P.ink : P.phosphor } : d));
    lineFigure(W, fig, x, y + breathe(t, 2) * (o.s || 1), { s: o.s || 1, flip: o.flip });
  }

  // ── the dialogue close-up ─────────────────────────────────────────────────────────────
  // Over Harold's shoulder: his head big at the lower left, cut by the frame; the speaker mid-frame,
  // bigger than in the field, facing him and so facing us. The line types into a box, then holds.
  function panel(W, c0, r0, c1, r1, t, o) {
    const { g, cw, ch } = W, l = loop4(t);
    W.reset();
    g.fillStyle = P.ink; g.fillRect(c0 * cw, r0 * ch, (c1 - c0 + 1) * cw, (r1 - r0 + 1) * ch);
    g.save(); g.beginPath(); g.rect((c0 + 1) * cw, (r0 + 1) * ch, (c1 - c0 - 1) * cw, (r1 - r0 - 1) * ch); g.clip();
    // the night behind them: a few stars, the meadow's far edge
    const hz = r0 + Math.round((r1 - r0) * 0.55);
    for (let r = r0 + 1; r < r1; r++) for (let c = c0 + 1; c < c1; c++) {
      const h = hash(c, r, 41);
      if (r < hz && h > 0.985) W.put(c, r, h > 0.995 ? '*' : '.', P.beigeDim);
      if (r >= hz && h > 0.8) W.put(c, r, r === hz ? (h > 0.9 ? ',' : '.') : h > 0.95 ? '|' : "'", r - hz > 4 && h > 0.9 ? P.phosphorDim : P.phosphorDeep);
    }
    const typed = o.line.length, shown = Math.min(typed, Math.floor(l * 14)), talk = shown < typed && Math.floor(l * 8) % 2 === 1;
    o.speaker(talk);
    const hs = o.hs || 1;
    haroldBack(W, (c0 + 1) * cw, (r1 + 1) * ch, t, hs);
    W.reset();
    // the line
    const br = r1 - 4, bc0 = c0 + Math.round((c1 - c0) * 0.36), bc1 = c1 - 2, wid = bc1 - bc0 - 3;
    g.fillStyle = P.ink; g.fillRect(bc0 * cw, br * ch, (bc1 - bc0 + 1) * cw, 4 * ch);
    W.box(bc0, br, bc1, br + 3, P.phosphorDim);
    W.text(bc0 + 2, br, ` ${o.name} `, P.beige);
    W.textI(bc0 + 2, br + 1, o.line.slice(0, Math.min(shown, wid)), P.beige);
    if (shown > wid) W.textI(bc0 + 2, br + 2, o.line.slice(wid, shown), P.beige);
    if (shown >= typed && Math.floor(l * 2) % 2) W.put(bc1 - 2, br + 2, '▼', P.beigeDim);
    g.restore(); W.reset();
    W.box(c0, r0, c1, r1, P.phosphorDim);
    if (o.title) W.text(c0 + 2, r0, ` ${o.title} `, P.beige);
  }

  window.WK_CAST = { P, RAINBOW, TAU, loop4, arc, blink, breathe, lineFigure, softFill, sprite, shiftFig, swayFig, sayAt,
    harold, haroldBack, malifex, MALIFEX_LINES, malicat, panel };
})();
