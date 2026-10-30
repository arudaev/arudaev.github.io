// actors.js – the cast in the world (06-CAST.md): Harold, Mishka, Bug and Malifex – and the UNIClones and the
// friends – seen from above at a slant, at their size on the room's big grid (8 × 16 px), drawn in big marks (16 px and
// up) while the world round them is small marks (12 px and finer). Each is baked once per pose and frame into an image
// with a gap of ink round it (the silhouette grown by 4 px) and its shadow on the ground, down and to the right.
//   WK_ACTORS.draw(W, who, x, y, { pose, flip, t })   x, y: the middle of the feet, in stage px; flip: faces east
//   WK_ACTORS.SIZE[who] = [cols, rows]                 the footprint on the ground, in big cells (for walking and pushing)
//   WK_ACTORS.ready(W)                                 true once VT323 is in (baking waits for it)
// who: 'harold' · 'mishka' · 'bug' · 'malifex' · 'uniclone' · 'friend:sid' … – needs lib/cast/{cast,friends,mishka,uniclones}.js
// for all but Harold. Poses: harold idle · walk; bug calm · run · scared · dig; mishka idle; malifex idle · talk; uniclone idle · talk.
(function () {
  const { P } = Webkeeper;
  const SIZE = { harold: [7, 1], mishka: [7, 1], bug: [7, 1], patch: [7, 1], malifex: [6, 1], malicat: [8, 1], uniclone: [9, 1], friend: [9, 1] };
  // a colour from outside Voyager's palette for one thing only (book/00-the-bible.md): Malifex's blush in the rainbow's
  // purple (the cat he poofs into is drawn with the hood in lib/cast/cast.js, in the rainbow's orange)
  const BLUSH = '#8E44AD';
  const GAP = 4;                        // the ink round every member of the cast, in px
  const FR = 4;                         // frames a pose has (one a second over the four-second loop)
  const cache = new Map();
  let scratch = null;
  const flipRow = (row, w) => [...row.padEnd(w)].reverse().map((ch) => ({ '(': ')', ')': '(', '/': '\\', '\\': '/', '<': '>', '>': '<', '[': ']', ']': '[' }[ch] || ch)).join('');
  const flipRows = (rows) => { const w = Math.max(...rows.map((r) => r.length)); return rows.map((r) => flipRow(r, w)); };

  // a grid sprite: rows of text and a colour per glyph, its feet centred on (x, y)
  function gridSprite(V, x, y, rows, colOf) {
    const w = Math.max(...rows.map((r) => r.length)), left = Math.round(x - (w * 8) / 2), top = y - rows.length * 16;
    rows.forEach((row, i) => { for (let j = 0; j < row.length; j++) if (row[j] !== ' ') V.loose(left + j * 8 + 4, top + i * 16 + 8, row[j], colOf(row[j], i, j), 0, 16); });
  }
  const HAROLD = { west: Webkeeper.HAROLD, east: ['  _   ', '__(.)< ', '\\___)  '] };
  // bug: his sprites face west; running, his legs swap every half second
  const BUGRUN = [[' ^_^   ', '(0 0)  ', '(000)@ ', ' "  "  '], [' ^_^   ', '(0 0)  ', '(000)@ ', '"  "   ']];
  function paint(V, who, pose, flip, f, ox, oy) {
    const t = f + 0.25;
    if (who === 'harold') {
      const rows = (flip ? HAROLD.east : HAROLD.west).slice();
      if (pose === 'blink' || f === 3) rows[1] = rows[1].replace('.', '-');
      gridSprite(V, ox + (flip ? -4 : 4), oy - (pose === 'walk' && f % 2 ? 1 : 0), rows, (ch) => (ch === '>' || ch === '<' ? P.red : P.yellow));
      return;
    }
    if (who === 'bug' || who === 'patch') {
      const F = window.WK_FRIENDS, B = F && F.BUG;
      const st = B && B[pose] ? B[pose] : B && B.calm;
      let rows = pose === 'run' ? BUGRUN[f % 2] : st.rows, map = (st || B.calm).map;
      // Patch, his sister, is made of ones; dancing, she bounces from paw to paw and her ears flick
      if (who === 'patch') {
        if (pose === 'dance') rows = f % 2 ? [' ^_^   ', '(1 1)/ ', '(111)@ ', '"   "  '] : ['\\^_^   ', '(1 1)  ', '(111)@ ', ' "  "  '];
        rows = rows.map((r) => r.replace(/0/g, '1'));
      }
      const R = flip ? flipRows(rows) : rows, M = flip ? flipRows(map) : map;
      gridSprite(V, ox, oy, R, (ch, i, j) => F.KEY[(M[i] || '')[j]] || P.beige);
      return;
    }
    if (who === 'mishka') {
      // in the world, Mishka is a grid sprite like the others (his felt close-up stays in mishka.js): a small bear, his brown only
      const rows = [' ()_() ', f === 2 ? ' (-.-) ' : ' (o.o) ', '(( : ))', ' (_)(_)'];
      gridSprite(V, ox, oy, flip ? flipRows(rows) : rows, (ch, i) => (i === 1 && (ch === 'o' || ch === '.' || ch === '-') ? P.beige : ch === ':' || i === 3 ? P.brownDim : P.brown));
      return;
    }
    if (who === 'malifex') {
      WK_CAST.malifex(V, ox, oy, t, { s: 0.72, talk: pose === 'talk', look: flip ? 1 : -1 });
      // >///< – two purple marks under his eyes when someone is nice to him
      if (pose === 'blush') { const s = 0.72, lk = flip ? 1 : -1, ey = oy - 4.75 * s * V.ch; for (const sx of [-1, 1]) { const ex = ox + (sx * 0.6 + lk * 0.3) * s * V.cw; for (const d of [-3, 0, 3]) V.loose(Math.round(ex + sx * 7 + d), Math.round(ey), '/', BLUSH, 0, 11); } }
      return;
    }
    if (who === 'malicat') { WK_CAST.malicat(V, ox, oy, t, { s: 0.72, flip: !flip }); return; }
    if (who === 'uniclone') { WK_UNICLONES.uniclone(V, ox, oy, t, { left: !flip, talk: pose === 'talk' }); return; }
    // a guest faces east as drawn; flip (east, the cast's default) keeps it, west mirrors the line figures; sitting,
    // the typed ones leave their branch or link behind
    if (who.startsWith('friend:')) { const fr = WK_FRIENDS.FRIENDS[who.slice(7)]; if (fr) fr.sprite(V, ox, oy, t, { flip: !flip, sit: pose === 'sit' }); }
  }
  // an offscreen screen with the same drawing calls as a card's (cast.js and friends.js draw through it)
  // sprites bake at the scale they're drawn at (the screen's px × the game's zoom, up to 4), so a zoomed-in game
  // isn't drawing blurry upscaled figures next to crisp letters
  const scaleOf = (W) => Math.min(4, Math.max(1, Math.ceil((W && W.dpr) || 1)));
  function scratchFor(W) {
    const d = scaleOf(W);
    if (!scratch || scratch.dpr !== d) scratch = Webkeeper.screen(document.createElement('canvas'), { cell: 16, w: 400, h: 300, fixed: true, dpr: d });   // small: a sprite bakes in ~1 ms
    return scratch;
  }
  const ready = (W) => W.fontReady() && document.fonts.check('16px VT323');
  function bake(W, who, pose, flip, f) {
    const V = scratchFor(W), dpr = V.dpr, ox = 200, oy = 262;
    V.reset(); V.g.setTransform(1, 0, 0, 1, 0, 0); V.g.clearRect(0, 0, V.canvas.width, V.canvas.height); V.reset();
    paint(V, who, pose, flip, f, ox, oy);
    // what it covers: scan a box round the feet for the figure's pixels
    const bw = 260, bh = 220, sx = ox - bw / 2, sy = oy - bh + 24;
    const src = V.g.getImageData(Math.round(sx * dpr), Math.round(sy * dpr), Math.round(bw * dpr), Math.round(bh * dpr)), d = src.data, w = src.width, h = src.height;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const pad = Math.ceil((GAP + 2) * dpr), cw = x1 - x0 + 1 + pad * 2, chh = y1 - y0 + 1 + pad * 2 + Math.ceil(10 * dpr);
    const fig = document.createElement('canvas'); fig.width = cw; fig.height = chh;
    fig.getContext('2d').putImageData(src, pad - x0, pad - y0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    // the gap of ink: the silhouette grown by GAP px in every direction, then the figure on top
    const out = document.createElement('canvas'); out.width = cw; out.height = chh;
    const og = out.getContext('2d'), r = GAP * dpr;
    for (let a = 0; a < 16; a++) og.drawImage(fig, Math.round(Math.cos((a / 16) * Math.PI * 2) * r), Math.round(Math.sin((a / 16) * Math.PI * 2) * r));
    og.drawImage(fig, 0, 0);
    og.globalCompositeOperation = 'source-in'; og.fillStyle = P.ink; og.fillRect(0, 0, cw, chh);
    og.globalCompositeOperation = 'source-over';
    // the shadow: a slid silhouette on the ground, down and to the right, ragged at its ends (faked as a shape)
    const feetY = (oy - sy) * dpr - y0 + pad, midX = (ox - sx) * dpr - x0 + pad, wpx = Math.min(cw - pad * 2, (SIZE[who.split(':')[0]] || [7])[0] * 8 * dpr + 10 * dpr);
    og.fillStyle = P.ink; og.fillRect(Math.round(midX - wpx * 0.4 + 6 * dpr), Math.round(feetY - 2 * dpr), Math.round(wpx * 0.85), Math.round(6 * dpr));
    og.fillRect(Math.round(midX - wpx * 0.4 + 2 * dpr), Math.round(feetY), Math.round(5 * dpr), Math.round(3 * dpr));
    og.drawImage(fig, 0, 0);
    return { cv: out, ox: midX / dpr, oy: feetY / dpr, w: cw / dpr, h: chh / dpr };
  }
  function sprite(W, who, pose = 'idle', flip = false, f = 0) {
    const key = who + '|' + pose + '|' + (flip ? 1 : 0) + '|' + f + '|' + scaleOf(W);
    let s = cache.get(key);
    if (s === undefined) { if (!ready(W)) return null; s = bake(W, who, pose, flip, f); cache.set(key, s); window.__wkBakes = (window.__wkBakes || 0) + 1; }
    return s;
  }
  // every pose of a cast, baked ahead (a room bakes its cast with its layers, so nothing bakes while it plays)
  const POSES = { harold: ['idle', 'walk'], bug: ['calm', 'run', 'scared', 'dig'], patch: ['calm', 'dance', 'run'], mishka: ['idle'], malifex: ['idle', 'talk', 'blush'], malicat: ['idle'], uniclone: ['idle', 'talk'] };
  // what is still to bake for a cast, one sprite per entry (a room bakes them one a slice)
  const posesOf = (who) => POSES[who] || (who.startsWith('friend:') ? ['idle', 'sit'] : ['idle']);
  function pending(list, W) { const d = scaleOf(W), out = []; for (const who of list) for (const pose of posesOf(who)) for (const fl of [false, true]) for (let f = 0; f < FR; f++) if (!cache.has(who + '|' + pose + '|' + (fl ? 1 : 0) + '|' + f + '|' + d)) out.push([who, pose, fl, f]); return out; }
  function prebake(W, list) {
    const POSES = { harold: ['idle', 'walk'], bug: ['calm', 'run', 'scared', 'dig'], mishka: ['idle'], malifex: ['idle', 'talk'], uniclone: ['idle', 'talk'] };
    let n = 0;
    for (const who of list) for (const pose of POSES[who] || ['idle']) for (const fl of [false, true]) for (let f = 0; f < FR; f++) if (!cache.has(who + '|' + pose + '|' + (fl ? 1 : 0) + '|' + f + '|' + scaleOf(W))) { sprite(W, who, pose, fl, f); n++; }
    return n;
  }
  function draw(W, who, x, y, o = {}) {
    const f = Math.floor((((o.t || 0) % 4) + 4) % 4) % FR;
    const s = sprite(W, who, o.pose || 'idle', !!o.flip, f);
    if (!s) return;
    W.reset(); W.g.drawImage(s.cv, Math.round(x - s.ox), Math.round(y - s.oy), s.w, s.h);
  }
  window.WK_ACTORS = { SIZE, GAP, draw, sprite, prebake, pending, ready };
})();
