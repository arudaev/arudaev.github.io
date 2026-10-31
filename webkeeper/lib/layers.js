// layers.js – the stack a room is drawn in (07-LOOK.md, the layers), under the one camera 07-LOOK.md sets: from above at a
// slant, a room of one screen. Back to front:
//   0 sky    the night below the page – stars, drifting old-web words – seen through holes and past its edges
//   1 far    other pages far below, dim, on the small grid
//   2 ground the page's surface: grass, soil, the path, water, low stones, the walls of a ditch
//   3 mid    what stands behind the walk area: trees, bushes, ruins (nobody walks behind them)
//   4 play   harold, the cast, bug, signs, lamps, pages, loose letters, words that became things – sorted by their feet
//   5 front  tall grass and leaves nearer than anyone, thinned round whoever they cover (the reveal mask)
//   6 air    mist (the fog mask's streaks), rain, fireflies, pollen
//   7 light  what light does live: the quack ring, a word flashing as it becomes, moths at a lamp
//   8 ui     the status line, the outline on the one target, dialogue
// Ground before mid: seen from above, what stands is drawn over the ground it stands on (in PLAN's side view mid came
// first). The light field, the shadows and the fog are baked into the brushes' tints; this file draws the stack and
// the debugger's overlays. A scene comes from lib/place.js.
//   WK_LAYERS.draw(W, scene, t, { on: [9 × bool], state, cache })   one frame (state: lib/room.js; cache: stamp 0–3 between steps)
//   WK_LAYERS.overlay(W, scene, state, t, name)                 a field or a mask, over the frame
//   WK_LAYERS.fogField(spec) → (X, Y, wet, hole) → density      the fog mask, in stage px
(function () {
  const { P, hash } = Webkeeper, D = WK_DECISIONS;
  // tints of the palette (as lib/brushes.js mixes them; this file loads without the brushes too)
  const mix = (a, b, k) => { const A = P[a] || a, B = P[b] || b; return '#' + [1, 3, 5].map((i) => Math.round(parseInt(A.slice(i, i + 2), 16) * (1 - k) + parseInt(B.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join(''); };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const LAYERS = [
    { key: 'sky', short: 'stars and words, through the holes', what: 'the night below the page, through holes and past its edges', sits: 'V1 / V2', parallax: 0.1 },
    { key: 'far', short: 'a page far below', what: 'other pages far below, on the small grid', sits: 'V1', parallax: 0.3 },
    { key: 'ground', short: 'grass, soil, the path, the ditch', what: 'grass, soil, the path, low stones, the ditch\'s walls', sits: 'V1 / V3', parallax: 1 },
    { key: 'mid', short: 'trees and bushes, behind', what: 'trees, bushes, ruins – behind the walk area', sits: 'V3', parallax: 1 },
    { key: 'play', short: 'harold, the sign, the lamp', what: 'harold, signs, the lamp, loose letters – by their feet', sits: 'V1 / V2', parallax: 1 },
    { key: 'front', short: 'tall grass and leaves in front', what: 'tall grass and leaves nearer than anyone', sits: 'V3', parallax: 1.1 },
    { key: 'air', short: 'mist in the ditch, fireflies', what: 'mist, rain, fireflies', sits: 'V2', parallax: 1.1 },
    { key: 'light', short: 'the ring, moths at the lamp', what: 'the ring, a word flashing, moths at the lamp', sits: 'V2', parallax: 1 },
    { key: 'ui', short: 'the status line', what: 'the status line, the outline on the target', sits: 'V1', parallax: 0 },
  ];
  const FIELDS = ['wind', 'light', 'touch'], MASKS = ['reveal', 'fog', 'shadow', 'water', 'walk'];

  // ── the fog mask: thicker far (up the screen), pooled in hollows, half again over water; in banks drawn out sideways
  // (ox, oy: the scene's world offset in px – the banks' noise runs on across the seams between areas)
  function fogField(f, ox = 0, oy = 0) {
    const far = f.far ?? 0, banks = f.banks ?? 0.5, hol = f.hollows || [], vn = WK_BRUSH.vnoise;
    const inside = (h, c, r) => {
      let m = -9;
      if (h.disc) { const [cc, rr, rx, ry] = h.disc, e = Math.hypot((c - cc) / rx, (r - rr) / ry); m = (1 - e) * Math.min(rx * 0.5, ry); }
      else if (h.rect) { const [a, b, c1, d] = h.rect; m = Math.min((c - a) * 0.5, (c1 - c) * 0.5, r - b, d - r); }
      else if (h.line) {
        let best = 1e9; const p = h.line;
        for (let k = 0; k < p.length - 1; k++) {
          const ax = p[k][0] * 0.5, ay = p[k][1], dx = p[k + 1][0] * 0.5 - ax, dy = p[k + 1][1] - ay, L = dx * dx + dy * dy || 1;
          const u = clamp(((c * 0.5 - ax) * dx + (r - ay) * dy) / L, 0, 1); best = Math.min(best, Math.hypot(c * 0.5 - ax - dx * u, r - ay - dy * u));
        }
        m = (h.width || 1) / 2 - best;
      }
      return clamp(0.5 + m / 2, 0, 1);
    };
    return (X, Y, wet) => {
      const d = clamp(1 - Y / 720, 0, 1), bank = 0.6 + (vn((X + ox) / 260, (Y + oy) / 40, 31) - 0.45) * 1.4 * banks + (vn((X + ox) / 70, (Y + oy) / 14, 32) - 0.5) * 0.3;
      let m = far * d * d * 1.4;
      for (const h of hol) m += (h.k ?? 1) * inside(h, X / 8, Y / 16);
      return Math.max(0, m * bank * (wet ? 1.4 : 1));
    };
  }

  // ── layer 0 and 1: drawn under the holes' clip
  const DEEP = mix('ink', 'tealUp', 0.55), FAR = mix('ink', 'tealUp', 0.42), FARL = mix('ocean', 'tealUp', 0.35);
  function deepWords(W, sc, t) {
    const d = sc.place.deep || {}, cv = sc.D; if (!cv || !d.words) return;
    d.words.forEach((w, k) => {
      const y = cv.y + 8 + hash(k, 3, 91) * (cv.h - 16), x = ((hash(k, 4, 92) * 1400 + t * (5 + k * 2)) % 1460) - 90;
      for (let i = 0; i < w.length; i++) if (w[i] !== ' ') W.loose(Math.round(x + i * 6), Math.round(y), w[i], DEEP, 0, 12);
    });
  }
  function farImage(W, sc) {
    // (made again when the screen's scale changes – a zoom in – so it never draws blurry)
    const pages = (sc.place.deep || {}).pages; if (!pages || (sc._far && sc._far.dpr === W.dpr) || !W.fontReady()) return sc._far;
    const cv = document.createElement('canvas'), dpr = W.dpr; cv.width = 1280 * dpr; cv.height = 720 * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const pg of pages) {
      const [c0, r0, c1, r1] = pg.at || pg, x0 = c0 * 8, y0 = r0 * 16, nx = Math.round((c1 - c0) * 8 / 6), ny = Math.round((r1 - r0) * 16 / 12);
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const edgeX = i === 0 || i === nx, edgeY = j === 0 || j === ny, ch = edgeX && edgeY ? '+' : edgeY ? '-' : edgeX ? '|' : '';
        if (ch) W.looseOn(g, x0 + (i + 0.5) * 6, y0 + (j + 0.5) * 12, ch, FAR, 0, 12, dpr);
      }
      // its words, small and far down: an old page's text, readable if you look
      (pg.lines || []).forEach((s, j) => { for (let i = 0; i < s.length && i < nx - 3; i++) if (s[i] !== ' ') W.looseOn(g, x0 + (i + 2.5) * 6, y0 + (j + 1.5) * 12, s[i], FARL, 0, 12, dpr); });
    }
    window.__wkBakes = (window.__wkBakes || 0) + 1;
    cv.dpr = W.dpr; return (sc._far = cv);
  }
  function farPages(W, sc) { const cv = farImage(W, sc); if (cv) W.g.drawImage(cv, 0, 0, 1280, 720); }

  // ── layer 4: play
  const inkBox = (W, x, y, w = 9, h = 16) => { W.g.fillStyle = P.ink; W.g.fillRect(Math.round(x - w / 2), Math.round(y - h / 2), w, h); };
  // a big letter: 16 px with a gap of ink round it. Loose ones ride a little above the ground, a dark mark under them
  const HID = mix('ink', 'phosphorDeep', 0.55);
  function italicAt(W, x, y, ch, col) {
    const t = W.tile(ch, col, 16), d = W.dpr; W.g.setTransform(d, 0, -0.24 * d, d, (x + 0.24 * 8) * d + (W.ox || 0), y * d + (W.oy || 0)); W.g.drawImage(t.cv, -t.w / 2, -t.h / 2, t.w, t.h); W.reset();
  }
  function letter(W, l, col) {
    const y = l.y - (l.z || 0);
    if (l.hidden) { if (l.reveal) { inkBox(W, l.x, y, 10, 17); W.loose(Math.round(l.x), Math.round(y), l.ch, l.reveal > 1 ? P.phosphor : P.phosphorDim, 0, 16); } else W.loose(Math.round(l.x), Math.round(y), l.ch, HID, 0, 16); return; }
    if (l.voice) { inkBox(W, l.x + 2, y, 11, 17); italicAt(W, Math.round(l.x), Math.round(y), l.ch, col || P.beige); return; }
    if (l.z > 2) { W.g.fillStyle = P.ink; W.g.fillRect(Math.round(l.x - 4), Math.round(l.y + 5), 9, 3); }
    inkBox(W, l.x, y, 10, 17); W.loose(Math.round(l.x), Math.round(y), l.ch, col || (l.aim ? P.phosphor : l.ok ? P.phosphorDim : l.state === 'loose' ? P.beige : l.wall ? P.redDim : P.beige), l.ang || 0, 16);
  }
  function shadowUnder(W, x, y, w) {
    const g = W.g; g.fillStyle = P.ink; const x0 = Math.round(x - w * 0.35), y0 = Math.round(y);
    g.fillRect(x0 + 8, y0, w - 16, 7); g.fillRect(x0 + 2, y0 + 1, 6, 4); g.fillRect(x0 + w - 8, y0 + 2, 6, 4);
  }
  // harold and the cast: baked sprites with their gap of ink (lib/actors.js); without it, harold's grid sprite live
  // Harold and the cast move in whole cells (8 × 16 px), like a text-mode game: the world flows, the figures hop.
  // Their real position stays smooth underneath (walking, touching the grass); only the drawing is snapped.
  const onGrid = (a) => ({ ...a, x: Math.round(a.x / 8) * 8, y: Math.round(a.y / 16) * 16 });
  function actor(W, who, a0, t) {
    const a = onGrid(a0);
    // Mishka is the sketch's bear (lib/bear.js), not a grid sprite
    if (who === 'mishka' && window.WK_BEAR) { WK_BEAR.draw(W, a.x, a.y, t, { eats: a0.eats && [(a0.eats[0] + 0.5) * 8 - a0.x, (a0.eats[1] + 1) * 16 - a0.y] }); return; }
    // a poof (Malifex into the cat and back): a burst of stars round him for half a second
    if (a0.poofT != null && t - a0.poofT >= 0 && t - a0.poofT < 0.5) { const k = (t - a0.poofT) / 0.5; for (let j = 0; j < 10; j++) { const an = (j / 10) * Math.PI * 2 + j; W.loose(Math.round(a.x + Math.cos(an) * (10 + 34 * k)), Math.round(a.y - 30 + Math.sin(an) * (8 + 22 * k)), k < 0.5 ? '*' : '.', P.beige, 0, 14); } }
    if (window.WK_ACTORS) {
      WK_ACTORS.draw(W, who, a.x, a.y, { pose: a.pose || (a.moving ? 'walk' : 'idle'), flip: a.flip, t: a.moving ? t * 2 : t });
      // what's in Bug's mouth: the slice of pizza he took off the table (a crust, cheese, a spot of tomato)
      if (a0.hold === 'slice') { const x = a.x + (a.flip ? 22 : -22), y = a.y - 30; inkBox(W, x, y, 12, 16); W.loose(x, y, '▼', P.beige, 0, 15); W.loose(x, y - 3, '.', P.red, 0, 14); }
      if (who === 'friend:lex' && a0.eats) lexEats(W, a, a0, t);
      return;
    }
    if (who !== 'harold') return;
    const lines = a.flip ? ['  _   ', '__(.)< ', '\\___)  '] : Webkeeper.HAROLD;
    W.reset(); shadowUnder(W, a.x, a.y, 52);
    lines.forEach((l, k) => { for (let j = 0; j < l.length; j++) if (l[j] !== ' ') {
      const x = Math.round(a.x + (j - 3) * 8), y = Math.round(a.y - (3 - k) * 16 + 8);
      inkBox(W, x, y, 8, 16); W.loose(x, y, l[j], l[j] === '>' || l[j] === '<' ? P.red : P.yellow, 0, 16);
    } });
  }
  function sign(W, th) {
    const [c0, r0, c1, r1] = th.board, [fc, fr] = th.foot;
    W.ink(c0, r0, c1 - c0 + 1, r1 - r0 + 1); W.box(c0, r0, c1, r1, P.beigeDim);
    W.ink(fc, r1); W.put(fc, r1, '┬', P.beigeDim);
    for (let r = r1 + 1; r <= fr; r++) { W.ink(fc, r); W.put(fc, r, '│', P.beigeDim); }
  }
  function lamp(W, th) {
    const [c, foot] = th.foot, head = foot - 4;
    W.ink(c - 1, head - 1, 3, 2); W.put(c, head - 1, '_', P.beigeDim); W.text(c - 1, head, '(o)', P.beigeDim); W.put(c, head, 'o', P.beige);   // the flame, the brightest beige: duck yellow is Harold's alone (07-LOOK)
    for (let r = head + 1; r <= foot; r++) { W.ink(c, r); W.put(c, r, '|', P.beigeDim); }
  }
  const inHole = (th, c, r) => (th.holes || []).some(([a, b, e, f]) => c >= a && c <= e && r >= b && r <= f);
  // a page of the old web, standing in the meadow like a house: its frame, its lines, a door at its foot
  function page(W, th, S, t) {
    const [c0, r0, c1, r1] = th.box, open = S.open && S.open.has(th.id), dr = th.door;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (!inHole(th, c, r)) W.ink(c, r);
    for (let c = c0 + 1; c < c1; c++) { if (!inHole(th, c, r0)) W.put(c, r0, '─', P.beigeDim); if (!inHole(th, c, r1)) W.put(c, r1, c === c0 + 1 || c === c1 - 1 ? '─' : '▀', P.beigeDim); }
    for (let r = r0 + 1; r < r1; r++) { if (!inHole(th, c0, r)) W.put(c0, r, '│', P.beigeDim); if (!inHole(th, c1, r)) W.put(c1, r, '│', P.beigeDim); }
    W.put(c0, r0, '┌', P.beigeDim); W.put(c1, r0, '┐', P.beigeDim); W.put(c0, r1, '└', P.beigeDim); W.put(c1, r1, '┘', P.beigeDim);
    (th.lines || []).forEach((s, j) => {
      const r = r0 + 2 + j, c = Math.round((c0 + c1) / 2 - s.length / 2), col = s.startsWith('#') ? P.beige : j === 0 ? P.beige : P.beigeDim, txt = s.replace(/^#/, '');
      for (let i = 0; i < txt.length; i++) if (txt[i] !== ' ' && !inHole(th, c + i, r)) W.put(c + i, r, txt[i], col);
    });
    // the holes Bug dug through it: a ragged rim of torn letters
    for (const [a, b, e, f] of th.holes || []) for (let r = b - 1; r <= f + 1; r++) for (let c = a - 1; c <= e + 1; c++) if (!inHole(th, c, r) && c >= c0 && c <= c1 && r >= r0 && r <= r1 && hash(c, r, 7) < 0.55) W.put(c, r, hash(c, r, 8) < 0.5 ? ',' : "'", P.beigeDim);
    if (dr) {
      const [a, e] = dr, top = r1 - 3;
      for (let c = a - 1; c <= e + 1; c++) W.put(c, top, c === a - 1 ? '┌' : c === e + 1 ? '┐' : '─', P.beige);
      for (let r = top + 1; r <= r1; r++) { W.ink(a - 1, r); W.put(a - 1, r, '│', P.beige); W.ink(e + 1, r); W.put(e + 1, r, '│', P.beige); }
      for (let r = top + 1; r <= r1; r++) for (let c = a; c <= e; c++) { W.ink(c, r); if (!open) W.put(c, r, '▒', P.beigeDim); }
      if (!open) W.put(e - 1, top + 2, 'o', P.beige);
    }
  }
  // the couch's TV, showing the counter
  function tv(W, th, S, t) {
    const [c0, r0, c1, r1] = th.box;
    W.ink(c0, r0, c1 - c0 + 1, r1 - r0 + 1); W.box(c0, r0, c1, r1, P.beigeDim); W.box(c0 + 1, r0 + 1, c1 - 1, r1 - 2, P.tealUp);
    const s = S.counter || th.screen || '', jam = S.jam && Math.floor(t * 8) % 3 === 0, cc = Math.round((c0 + c1) / 2 - s.length / 2), rr = Math.round((r0 + r1 - 2) / 2);
    W.text(cc, rr, s, jam ? P.red : P.beige);
    if (S.jam) for (let c = c0 + 2; c < c1 - 1; c++) if (hash(c, Math.floor(t * 12), 3) < 0.18) W.put(c, rr + 2, '-', P.tealUp);
    W.text(c0 + 2, r1 - 1, '23:59', P.beigeDim); W.put(c1 - 3, r1 - 1, 'o', S.jam ? P.red : P.phosphorDim);
  }
  function couch(W, th) {
    const [c0, r0, c1, r1] = th.box;
    W.ink(c0, r0, c1 - c0 + 1, r1 - r0 + 1);
    for (let c = c0 + 1; c < c1; c++) { W.put(c, r0, '▄', P.burgundy); for (let r = r0 + 1; r < r1 - 1; r++) W.put(c, r, r === r0 + 1 ? '▓' : (c - c0) % Math.max(4, Math.round((c1 - c0) / (th.seats || 3))) === 0 ? '│' : '▒', r === r0 + 1 ? P.burgundy : P.redDim); W.put(c, r1 - 1, '▀', P.redDim); }
    for (let r = r0; r < r1; r++) { W.put(c0, r, r === r0 ? '▄' : '█', P.burgundy); W.put(c1, r, r === r0 ? '▄' : '█', P.burgundy); }
    // the double-decker's ladder, from the top deck down to the floor beside it
    if (th.ladder) for (let r = r0 - 1; r <= r1 + th.ladder; r++) { W.ink(c1 + 1, r, 3, 1); W.put(c1 + 1, r, '|', P.beigeDim); W.put(c1 + 3, r, '|', P.beigeDim); if ((r - r0) % 2 === 0) W.put(c1 + 2, r, '=', P.beigeDim); }
  }
  // step 3 r2: Voyager's lighthouse on its hill (the key art's, letter by letter – it's Harold's mind): a tower in four
  // bands, bone and red, narrowing up; iron windows; a gallery with a rail; the lantern room; a red cap; the keeper's
  // cottage at its foot. The letter comes from the form, the colour from the band and the light; every solid sits on ink.
  // Its feet are th.foot; its beam turns in the light layer.
  const LHD = '@#8&%', LHM = 'dbpqw', LHT = ':;-.';
  function lhSolid(W, x, y, lit, col, dim, k) { const set = lit > 0.62 ? LHD : lit > 0.32 ? LHM : LHT; W.g.fillStyle = P.ink; W.g.fillRect(x - 3, y - 5, 6, 10); W.loose(x, y, set[Math.floor(hash(x, y, k) * set.length)], lit > 0.32 ? col : dim, 0, 12); }
  const lhAt = (th) => ({ cx: (th.foot[0] + 0.5) * 8, o: (th.foot[1] + 1) * 16 - 284 });
  function lighthouse(W, th) {
    const { cx, o } = lhAt(th), top = 122 + o, base = 266 + o, hw = (y) => 13 + ((y - top) / (base - top)) * 9, g = W.g;
    for (let y = base; y <= 280 + o; y += 10) for (let x = cx - 26; x <= cx + 26; x += 6) lhSolid(W, x, y, 0.75 - (0.5 * (x - cx)) / 26, P.beige, P.beigeDim, 1);
    for (let y = top; y < base; y += 10) {
      const band = Math.floor((base - y) / ((base - top) / 4)), red = band % 2 === 1, w = hw(y);
      for (let x = cx - w; x <= cx + w; x += 6) { const u = (x - cx) / w; lhSolid(W, Math.round(x), y, 0.72 - 0.55 * u - 0.12 * u * u, red ? P.red : P.beige, red ? P.redDim : P.beigeDim, 2); }
    }
    for (const [y0, u] of [[160, -0.3], [196, 0.35], [232, -0.1]]) { const y = y0 + o, x = Math.round(cx + u * hw(y)); g.fillStyle = P.ink; g.fillRect(x - 4, y - 6, 8, 12); W.loose(x, y, '#', P.tealUp, 0, 12); }
    g.fillStyle = P.ink; g.fillRect(cx - 6, base - 18, 12, 18); W.loose(cx, base - 8, 'n', P.tealUp, 0, 14);
    for (let x = cx - 22; x <= cx + 22; x += 6) { g.fillStyle = P.ink; g.fillRect(x - 3, 108 + o, 6, 12); W.loose(x, 114 + o, '=', P.tealHi, 0, 12); }
    for (let x = cx - 20; x <= cx + 20; x += 8) W.loose(x, 104 + o, '|', P.tealUp, 0, 10);
    g.fillStyle = P.ink; g.fillRect(cx - 12, 82 + o, 24, 22);
    for (let y = 88; y <= 100; y += 8) for (let x = cx - 9; x <= cx + 9; x += 6) W.loose(x, y + o, '#', P.beige, 0, 12);
    for (const dx of [-6, 6]) W.loose(cx + dx, 94 + o, '|', P.tealUp, 0, 16);
    for (let r = 0; r < 3; r++) {
      const y = 76 - r * 8 + o, w = 15 - r * 5;
      g.fillStyle = P.ink; g.fillRect(cx - w - 3, y - 5, 2 * w + 6, 10);
      W.loose(cx - w, y, '/', P.red, 0, 12); W.loose(cx + w, y, '\\', P.redDim, 0, 12);
      for (let x = cx - w + 6; x < cx + w; x += 6) W.loose(x, y, x < cx ? '#' : '=', x < cx ? P.red : P.redDim, 0, 12);
    }
    W.loose(cx, 52 + o, 'o', P.beigeDim, 0, 12); W.loose(cx, 42 + o, '|', P.beigeDim, 0, 12);
    const kx = cx - 60;
    for (let y = 266; y <= 282; y += 8) for (let x = kx - 14; x <= kx + 14; x += 6) lhSolid(W, x, y + o, 0.7 - (0.4 * (x - kx)) / 14, P.beige, P.beigeDim, 3);
    for (let r = 0; r < 2; r++) { const y = 256 - r * 8 + o, w = 18 - r * 8; g.fillStyle = P.ink; g.fillRect(kx - w - 3, y - 5, 2 * w + 6, 10); for (let x = kx - w; x <= kx + w; x += 6) W.loose(x, y, x === kx - w ? '/' : x >= kx + w - 2 ? '\\' : '=', x < kx ? P.red : P.redDim, 0, 12); }
    g.fillStyle = P.ink; g.fillRect(kx - 4, 268 + o, 8, 10); W.loose(kx, 273 + o, '#', P.yellowDim, 0, 10);
  }
  // the beam: a few rays of dashes turning slowly round the lantern, stepped six times a second (the middle light)
  function beam(W, th, t) {
    const { cx, o } = lhAt(th), st = Math.floor(t * 6), a0 = st * (Math.PI * 2 / 90) + 0.6, x0 = cx - 2, y0 = 90 + o;
    for (const [da, ch, col, step] of [[0, '=', P.beige, 15], [-0.05, '-', P.beigeDim, 18], [0.05, '-', P.beigeDim, 18]]) {
      const a = a0 + da;
      for (let d = 28; d < 560; d += step) {
        if ((Math.floor(d / step) + st) % 7 === 0) continue;
        if (d > 360 && hash(Math.floor(d), st, 3) < (d - 360) / 260) continue;
        W.loose(Math.round(x0 + Math.cos(a) * d), Math.round(y0 + Math.sin(a) * d * 0.62), ch, d < 260 ? col : P.tealHi, a - Math.PI, 16);
      }
    }
  }
  // the TV's remote, on the little table in front of the TV, drawn in pixels like an item in an old game: a black
  // handset (beige rim) pointing at the TV, the red power button at its top, rows of buttons, the round pad below.
  // Until it's picked up it asks to be: the power button blinks and a ring of dots runs round it in steps, three lit of
  // eight, like a cursor waiting on it (phosphor, the machine's colour: the room's floor is beige dots); once the
  // countdown has started it's just a remote
  const REMOTE = [
    '.rrrrrr.',
    'rkkkkkkr',
    'rkkPPkkr',
    'rkkkkkkr',
    'rkbkbkbr',
    'rkkkkkkr',
    'rkbkbkbr',
    'rkkkkkkr',
    'rkbkbkbr',
    'rkkkkkkr',
    'rkkddkkr',
    'rkdkkdkr',
    'rkkddkkr',
    'rkkkkkkr',
    'rkkkkkkr',
    '.rrrrrr.',
  ];
  function remote(W, th, S, t) {
    const [c, r] = th.foot, waiting = !(S.flags && S.flags.pulled) && !S.counter, on = Math.floor(t * 2.5) % 2 === 0, g = W.g;
    const x0 = Math.round((c + 0.5) * 8 - 8), y0 = (r + 1) * 16 - 32, col = { r: P.beige, k: P.ink, b: P.beigeDim, d: P.tealUp, P: waiting && !on ? P.redDim : P.red };
    REMOTE.forEach((row, y) => [...row].forEach((ch, x) => { if (col[ch]) { g.fillStyle = col[ch]; g.fillRect(x0 + x * 2, y0 + y * 2, 2, 2); } }));
    if (!waiting) return;
    const n = 8, st = Math.floor(t * 8), cx = x0 + 8, cy = y0 + 16;
    for (let k = 0; k < n; k++) {
      const d = (st - k + n * 4) % n; if (d > 2) continue;
      const a = (k / n) * Math.PI * 2;
      W.loose(Math.round(cx + Math.cos(a) * 24), Math.round(cy + Math.sin(a) * 22), d === 0 ? '*' : d === 1 ? '+' : '.', d === 0 ? P.phosphor : P.phosphorDim, 0, 14);
    }
  }
  // a low table in front of the TV, the remote on it (on the row above: the top is the upper half of its first row, so
  // the remote sits on it): its top, its red apron, two legs
  function table(W, th) {
    const [c0, r0, c1, r1] = th.box;
    W.ink(c0, r0, c1 - c0 + 1, r1 - r0 + 1);
    for (let c = c0; c <= c1; c++) W.put(c, r0, '▀', P.beigeDim);
    for (let c = c0 + 2; c <= c1 - 2; c++) W.put(c, r0, '▄', P.burgundy);
    for (let r = r0 + 1; r <= r1; r++) { W.put(c0 + 1, r, '│', P.beigeDim); W.put(c1 - 1, r, '│', P.beigeDim); }
  }
  // ── the party (0.1, 28 October): one couch facing the TV and four beanbags, in a half circle round a big round
  // coffee table of snacks, the console by the remote. Seen from above at a slant like everything else, with the TV
  // at the top: the couch's back is the side nearest us, so it's drawn over its sitters' feet, and a beanbag's front
  // lip over whoever sank into it (a thing's `over`: the row its second half is sorted at, after the cast)
  function sofa(W, th, S, t, part) {
    const [c0, r0, c1, r1] = th.box, ro = th.over, seats = th.seats || 4, s0 = c0 + 3, s1 = c1 - 3;
    const arm = (a, top, bot) => { for (let r = top; r <= bot; r++) { W.ink(a, r, 3, 1); W.put(a, r, r === r0 ? '▄' : '▐', P.burgundy); W.put(a + 1, r, r === r0 ? '▄' : '█', P.burgundy); W.put(a + 2, r, r === r0 ? '▄' : '▌', P.burgundy); } };
    if (part !== 'over') {
      W.ink(c0, r0, c1 - c0 + 1, ro - r0);
      // the seat: cushions side by side, their far edge toward the table, a dark seam between each
      const w = (s1 - s0 + 1) / seats;
      for (let c = s0; c <= s1; c++) {
        const seam = c > s0 && Math.floor((c - s0) / w) !== Math.floor((c - 1 - s0) / w);
        // (the fabric is sparse stitches on the dark, so the ink round whoever sits on it doesn't cut holes in it)
        W.put(c, r0, seam ? '▄' : '▄', seam ? P.burgundy : P.redDim);
        for (let r = r0 + 1; r < ro; r++) W.put(c, r, seam ? '│' : hash(c, r, 21) < 0.5 ? ':' : '.', seam ? P.burgundy : P.redDim);
      }
      arm(c0, r0, ro - 1); arm(c1 - 2, r0, ro - 1);
      return;
    }
    // the back: a rolled top, then the back itself, buttoned
    W.ink(c0, ro, c1 - c0 + 1, r1 - ro + 1);
    for (let c = c0; c <= c1; c++) for (let r = ro; r <= r1; r++) W.put(c, r, r === ro ? '▄' : r === r1 ? '▀' : '█', r === r1 ? P.redDim : P.burgundy);
    for (let c = s0 + 2; c < s1; c += 5) if (r1 - ro >= 2) W.put(c, ro + 1, '•', P.redDim);
    arm(c0, ro, r1 - 1); arm(c1 - 2, ro, r1 - 1);
  }
  // a beanbag: a squashed round sack in one of the room's tints, lit from the upper left like everything soft, a dent
  // where someone sank in; `over`, only its front lip, drawn over their feet
  const BAG = { teal: [P.tealHi, P.tealUp], red: [P.burgundy, P.redDim], beige: [P.beige, P.beigeDim], green: [P.phosphorDim, P.phosphorDeep] };
  function beanbag(W, th, S, t, part) {
    const [c, r] = th.foot, [rx, ry] = th.size || [6.5, 1.6], [lit, dim] = BAG[th.col] || BAG.teal;
    const cx = (c + 0.5) * 8, cy = (r + 0.6) * 16, g = W.g, front = part === 'over';
    for (let y = -ry; y <= ry + 0.01; y += 0.5) for (let x = -rx; x <= rx + 0.01; x += 0.5) {
      const d = (x / rx) ** 2 + (y / ry) ** 2; if (d > 1) continue;
      if (front && y < ry * 0.25) continue;
      const px = cx + x * 8, py = cy + y * 16;
      g.fillStyle = P.ink; g.fillRect(Math.round(px - 3), Math.round(py - 5), 6, 9);
      const edge = d > 0.72, dent = !edge && Math.abs(x) < rx * 0.55 && y < ry * 0.3;
      const light = 0.62 - 0.35 * x / rx - 0.3 * y / ry + (hash(Math.round(x * 2) + c * 7, Math.round(y * 2) + r * 5, 3) - 0.5) * 0.35;
      const chr = edge ? (y > 0 ? (x < 0 ? '(' : x > 0 ? ')' : '_') : '.') : dent ? (light > 0.5 ? '.' : ' ') : light > 0.62 ? 'o' : light > 0.36 ? ':' : '.';
      if (chr !== ' ') W.loose(px, py, chr, light > 0.45 ? lit : dim, 0, 13);
    }
  }
  // the coffee table: round, wooden, crowded, and its snacks drawn the three ways a glyph sits (07-LOOK): what was
  // made sits on the grid (V1: the pizza box, the cans, the bowls, the tub); what's piled is small loose marks, turned,
  // lit from the upper left – dense where the light falls, sparse where it doesn't (V2: popcorn, nachos, the pizza's
  // toppings, crisps); and all of it settles (V3): it jostles when someone passes close, a quack's ring reaches it or
  // Bug runs by, and comes back to rest. Pterodactyl's tower of crisps wobbles if you so much as breathe on it. Bug
  // takes a slice of the pizza on his way back into the TV (the flag `slice`)
  const SN = { b: P.beige, d: P.beigeDim, r: P.red, R: P.redDim, g: P.phosphorDim, G: P.phosphorDeep, t: P.tealHi, T: P.tealUp };
  // how stirred a spot on the table is (0 at rest, 1 shaken): Harold close by, Bug running past, a ring passing over
  function stir(S, t, x, y) {
    let k = 0;
    const near = (ax, ay, rad) => { const d = Math.hypot(ax - x, (ay - y) * 1.8); if (d < rad) k = Math.max(k, 1 - d / rad); };
    if (S.harold && !S.harold.gone) near(S.harold.x, S.harold.y - 12, S.harold.moving ? 64 : 40);
    for (const a of S.cast || []) if (!a.gone && a.moving) near(a.x, a.y - 8, 80);
    for (const R of S.rings || []) { const f = (t - R.t0) * R.speed, d = Math.hypot(R.x - x, (R.y - y) * 1.8); if (Math.abs(d - f) < 28 && f < R.reach + 30) k = Math.max(k, 1 - Math.abs(d - f) / 28); }
    return k;
  }
  // a small loose mark that settles: at rest on its spot, shaken loose by k (a turn and a hop, stepped twelve a second)
  function crumb(W, x, y, ch, col, size, k, t, seed, ang = 0) {
    const st = Math.floor(t * 12), j = k > 0.02 ? k : 0;
    const dx = j * (hash(seed, st, 31) - 0.5) * 6, dy = j * (hash(seed, st, 32) - 0.8) * 5, da = j * (hash(seed, st, 33) - 0.5) * 1.2;
    W.loose(x + dx, y + dy, ch, col, ang + da, size);
  }
  // a pile of small marks in a dome (rx, ry px) over (x, y): the letter from how much light the spot gets
  function pile(W, x, y, rx, ry, n, ramp, lit, dim, size, k, t, seed, turn = 0.6) {
    for (let i = 0; i < n; i++) {
      const u = hash(i, seed, 41) * 2 - 1, v = -Math.sqrt(hash(i, seed, 42));   // the upper half, thicker at the bottom
      if (u * u + v * v > 1) continue;
      const light = 0.62 - 0.32 * u + 0.28 * v + (hash(i, seed, 43) - 0.5) * 0.4, ch = ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(light * ramp.length)))];
      crumb(W, x + u * rx, y + v * ry, ch, light > 0.5 ? lit : dim, size, k, t, seed * 97 + i, (hash(i, seed, 44) - 0.5) * turn);
    }
  }
  const inkDisc = (W, x, y, rx, ry) => { W.g.fillStyle = P.ink; W.g.beginPath(); W.g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); W.g.fill(); };
  // the rim of a round thing in small marks: brighter toward the light
  function rim(W, x, y, rx, ry, n, size, lit, dim) {
    for (let a = 0; a < n; a++) { const an = (a / n) * Math.PI * 2, c = Math.cos(an), s = Math.sin(an); W.loose(x + c * rx, y + s * ry, Math.abs(c) > 0.85 ? (c < 0 ? '(' : ')') : s > 0 ? '_' : '-', c < 0.2 && s < 0.4 ? lit : dim, 0, size); }
  }
  function snacks(W, th, S, t) {
    const [c0, r0, c1, r1] = th.box, cx = (c0 + c1 + 1) / 2 * 8, cy = (r0 + r1 + 1) / 2 * 16, rx = (c1 - c0 + 1) / 2 * 8, ry = (r1 - r0 + 1) / 2 * 16, g = W.g;
    // the table: its top, and its edge toward us (the table's thickness)
    g.fillStyle = P.ink; g.beginPath(); g.ellipse(cx, cy + 6, rx + 6, ry + 8, 0, 0, Math.PI * 2); g.fill();
    for (let a = 0; a < 64; a++) {
      const an = (a / 64) * Math.PI * 2, x = cx + Math.cos(an) * rx, y = cy + Math.sin(an) * ry;
      W.loose(x, y, Math.abs(Math.cos(an)) > 0.8 ? (Math.cos(an) < 0 ? '(' : ')') : Math.sin(an) > 0 ? '_' : '-', Math.sin(an) > 0 ? P.beige : P.beigeDim, 0, 14);
      if (Math.sin(an) > 0.2 && a % 2 === 0) W.loose(x, y + 9, '▀', P.beigeDim, 0, 12);
    }
    for (let k = 0; k < 40; k++) { const u = hash(k, 1, 4) * 2 - 1, v = hash(k, 2, 4) * 2 - 1; if (u * u + v * v < 0.8) W.loose(cx + u * rx * 0.9, cy + v * ry * 0.8, '-', mix('ink', 'beigeDim', 0.45), 0, 12); }
    const at = (dx, dy) => [cx + dx * rx / 116, cy + dy * ry / 40];   // offsets are laid out for the wide table (116 × 40 px half-sizes)

    // popcorn: a striped paper tub on the grid, a heap of popped kernels spilling over it, a few on the table
    { const [x, y] = at(-80, 8), k = stir(S, t, x, y);
      inkDisc(W, x, y - 12, 26, 26);
      for (let j = 0; j < 4; j++) for (let r = 0; r < 2; r++) W.loose(x + (j - 1.5) * 8, y + r * 12 - 2, '█', j % 2 ? (r ? P.beigeDim : P.beige) : (r ? P.redDim : P.red), 0, 14);
      pile(W, x, y - 9, 22, 20, 70, '.ooOO', P.beige, P.beigeDim, 14, k, t, 3, 0.8);
      for (let i = 0; i < 4; i++) crumb(W, x + 22 + i * 7, y + 14 + (i % 2) * 5, i % 2 ? 'o' : 'O', P.beigeDim, 11, k, t, 300 + i); }
    // nachos: a big plate, chips fanned round a bowl of salsa in the middle, cheese dripped over, jalapeños
    { const [x, y] = at(-24, -6), k = stir(S, t, x, y);
      inkDisc(W, x, y, 38, 14); rim(W, x, y, 35, 11, 24, 11, P.beigeDim, mix('ink', 'beigeDim', 0.6));
      for (let i = 0; i < 16; i++) {
        const an = (i / 16) * Math.PI * 2 + hash(i, 5, 50) * 0.3, rr = 0.55 + hash(i, 5, 51) * 0.35, u = Math.cos(an) * rr, v = Math.sin(an) * rr, lt = 0.62 - 0.3 * u - 0.3 * v;
        crumb(W, x + u * 30, y + v * 9 - 1, '▲', lt > 0.5 ? P.beige : P.beigeDim, 16, k, t, 500 + i, an + Math.PI / 2 + (hash(i, 5, 53) - 0.5));
      }
      inkDisc(W, x, y - 1, 10, 6); rim(W, x, y - 1, 8, 4, 10, 10, P.beigeDim, P.beigeDim);
      for (let j = 0; j < 5; j++) crumb(W, x - 4 + (j % 3) * 4, y - 2 + Math.floor(j / 3) * 3, j % 2 ? ':' : 'o', j < 3 ? P.red : P.redDim, 12, k * 0.3, t, 510 + j);
      for (let i = 0; i < 6; i++) crumb(W, x - 26 + i * 10, y - 6 + (i % 2) * 9, '.', P.beige, 13, k, t, 520 + i);
      crumb(W, x + 18, y - 6, 'o', P.phosphorDim, 10, k, t, 530); crumb(W, x - 20, y + 5, 'o', P.phosphorDim, 10, k, t, 531); crumb(W, x + 24, y + 6, 'o', P.phosphorDim, 10, k, t, 532); }
    // two more dips: guacamole and cheese, each a small bowl on the grid, its dip a dab of marks
    [[-46, 24, P.phosphorDim, P.phosphorDeep], [-10, 26, P.beige, P.beigeDim]].forEach(([dx, dy, lit, dim], i) => {
      const [x, y] = at(dx, dy), k = stir(S, t, x, y);
      inkDisc(W, x, y, 13, 8); rim(W, x, y, 11, 5.5, 12, 11, P.beigeDim, mix('ink', 'beigeDim', 0.6));
      for (let j = 0; j < 7; j++) crumb(W, x - 6 + (j % 4) * 4, y - 2 + Math.floor(j / 4) * 4, j % 3 ? ':' : 'o', j < 4 ? lit : dim, 12, k * 0.3, t, 600 + i * 10 + j);
    });
    // the pizza: an open box on the grid, the pie a disc of marks – crust round the edge, cheese, pepperoni – cut in six
    { const [x, y] = at(44, 2), k = stir(S, t, x, y), took = S.flags && S.flags.slice, bw = 44, bh = 22;
      g.fillStyle = P.ink; g.fillRect(x - bw - 4, y - bh - 4, bw * 2 + 8, bh * 2 + 8);
      for (let j = -bw + 8; j <= bw - 8; j += 8) { W.loose(x + j, y - bh, '─', P.beigeDim, 0, 14); W.loose(x + j, y + bh, '─', P.beigeDim, 0, 14); }
      for (const sx of [-1, 1]) { for (const dy of [-10, 0, 10]) W.loose(x + sx * bw, y + dy, '│', P.beigeDim, 0, 14); W.loose(x + sx * bw, y - bh, sx < 0 ? '┌' : '┐', P.beigeDim, 0, 14); W.loose(x + sx * bw, y + bh, sx < 0 ? '└' : '┘', P.beigeDim, 0, 14); }
      const R = 36, Ry = 17, gone = (an) => took && an > -Math.PI / 3 && an < 0;
      for (let i = 0; i < 40; i++) { const an = (i / 40) * Math.PI * 2 - Math.PI; if (gone(an + 0.05)) continue; crumb(W, x + Math.cos(an) * R, y + Math.sin(an) * Ry, 'o', Math.cos(an) < 0.3 && Math.sin(an) < 0.4 ? P.beige : P.beigeDim, 13, k * 0.4, t, 700 + i); }
      for (let i = 0; i < 200; i++) {
        const u = hash(i, 7, 71) * 2 - 1, v = hash(i, 7, 72) * 2 - 1; if (u * u + v * v > 0.72) continue;
        const an = Math.atan2(v, u); if (gone(an)) continue;
        if (Math.abs(Math.sin(an * 3)) < 0.1 && u * u + v * v > 0.04) continue;   // the cuts
        const pep = hash(i, 7, 73) < 0.12, lt = 0.6 - 0.3 * u - 0.3 * v + (hash(i, 7, 75) - 0.5) * 0.3;
        crumb(W, x + u * R, y + v * Ry, pep ? 'O' : lt > 0.62 ? '%' : lt > 0.4 ? ':' : '.', pep ? P.red : lt > 0.45 ? P.beige : P.beigeDim, pep ? 14 : 12, k * 0.4, t, 740 + i);
      }
      // where the slice was: the box's bottom, a smear of sauce
      if (took) { W.loose(x + 18, y - 7, '.', P.redDim, 0, 12); W.loose(x + 24, y - 3, ',', P.redDim, 0, 12); W.loose(x + 12, y - 10, '.', P.beigeDim, 0, 12); } }
    // Pterodactyl's tower of crisps ("don't breathe on it"): crisps stacked crosswise, swaying more the higher
    { const [x, y] = at(100, -8), k = stir(S, t, x, y), sway = Math.sin(Math.floor(t * 12) / 12 * 9) * k * 4;
      inkDisc(W, x, y - 14, 11, 20);
      for (let j = 0; j < 6; j++) W.loose(x + (j % 2 ? 2 : -2) + sway * j / 3, y - j * 6, j % 2 ? '=' : '-', j % 3 === 0 ? P.beige : P.beigeDim, (j % 2 ? 0.25 : -0.25) + sway * 0.05 * j, 14);
      W.loose(x + sway * 2, y - 36, '^', P.beige, 0, 13); }
    // drinks on the grid: cans (a pull tab, a coloured body, a light edge) and a bottle of something green
    for (const [dx, dy, col, lit] of [[88, 26, P.red, P.beige], [-108, 12, P.tealUp, P.tealHi]]) {
      const [x, y] = at(dx, dy); inkDisc(W, x, y - 8, 9, 16);
      W.loose(x, y - 15, '.', P.beigeDim, 0, 13); W.loose(x, y - 7, '█', col, 0, 14); W.loose(x, y + 2, '█', col, 0, 14); W.loose(x - 2, y - 7, '▌', lit, 0, 14);
    }
    { const [x, y] = at(106, 18); inkDisc(W, x, y - 12, 8, 20); W.loose(x, y - 27, '.', P.red, 0, 13); W.loose(x, y - 21, '|', P.phosphorDim, 0, 12); for (const dy of [-10, 0]) W.loose(x, y + dy, '█', P.phosphorDeep, 0, 14); W.loose(x - 2, y - 10, '▌', P.phosphorDim, 0, 14); }
    { const [x, y] = at(-60, 30); inkDisc(W, x, y - 2, 7, 9); W.loose(x, y - 2, 'U', P.beige, 0, 16); }
  }
  // Lex helps himself from the popcorn tub on the table: every few seconds his tongue shoots across – red, in steps
  // – and comes back with a kernel on the end (his `eats`: the tub, in cells)
  function lexEats(W, a, a0, t) {
    const e = (((t + 2.1) % 4.5) + 4.5) % 4.5; if (e > 0.6) return;
    const mx = a.x + 40, my = a.y - 24, tx = (a0.eats[0] + 0.5) * 8, ty = (a0.eats[1] + 1) * 16 - 14;
    const k = e < 0.25 ? e / 0.25 : 1 - (e - 0.25) / 0.35, n = Math.max(1, Math.round(Math.hypot(tx - mx, ty - my) * k / 6));
    for (let i = 1; i <= n; i++) { const f = (i / n) * k; inkBox(W, mx + (tx - mx) * f, my + (ty - my) * f, 7, 9); W.loose(mx + (tx - mx) * f, my + (ty - my) * f, i === n ? 'o' : '=', i === n && e >= 0.25 ? P.beige : P.red, Math.atan2(ty - my, tx - mx), 12); }
  }
  // the crisps, in their bowl on the couch's cushion next to Mishka – keeping a seat. A made thing on the grid (a teal
  // bowl, lit on its left) heaped with crisps as small loose marks, curled and turned every which way; Mishka reaches
  // over for one every few seconds (lib/bear.js), and the heap settles again when anyone sits down by it
  function crisps(W, th, S, t) {
    const [c, r] = th.foot, x = (c + 0.5) * 8, y = (r + 1) * 16 - 6, k = stir(S, t, x, y);
    inkDisc(W, x, y - 8, 28, 17);
    for (let i = 0; i < 60; i++) {
      const u = hash(i, 9, 61) * 2 - 1, v = -Math.sqrt(hash(i, 9, 62)); if (u * u + v * v > 1) continue;
      const lt = 0.62 - 0.32 * u + 0.25 * v + (hash(i, 9, 63) - 0.5) * 0.35;
      crumb(W, x + u * 20, y - 5 + v * 12, lt > 0.62 ? 'C' : lt > 0.38 ? 'c' : '.', lt > 0.5 ? P.beige : P.beigeDim, 14, k, t, 900 + i, (hash(i, 9, 64) - 0.5) * 1.6);
    }
    ['\\', '_', '_', '_', '_', '/'].forEach((ch, j) => W.loose(x + (j - 2.5) * 8, y + 4, ch, j < 2 ? P.tealHi : P.tealUp, 0, 16));
    for (let i = 0; i < 3; i++) crumb(W, x - 30 + i * 5, y + 8 + (i % 2) * 3, '.', P.beigeDim, 11, k, t, 960 + i);
  }
  // the console, on the floor beside the TV, in pixels like the remote: a grey box with a round lid and a red light,
  // a pad on its cord
  const CONSOLE = [
    '.dddddddddddddd.',
    'dkkkkkkkkkkkkkkd',
    'dkk..bbbb..kkkkd',
    'dk..bkkkkb..kkkd',
    'dk..bkkkkb..kRkd',
    'dkk..bbbb..kkkkd',
    'dkkkkkkkkkkkkkkd',
    '.dddddddddddddd.',
    '................',
    '..c.............',
    '...c..dddd.dddd.',
    '....cdkdkddkrkdd',
    '.....ddkddddkddd',
    '......ddd...ddd.',
  ];
  function konsole(W, th) {
    const [c, r] = th.foot, x0 = Math.round((c + 0.5) * 8 - 16), y0 = (r + 1) * 16 - 28, g = W.g, col = { d: P.beigeDim, k: P.inkUp, b: P.beige, R: P.red, r: P.redDim, c: P.tealUp };
    g.fillStyle = P.ink; g.fillRect(x0 - 2, y0 - 2, 36, 32);
    CONSOLE.forEach((row, y) => [...row].forEach((ch, x) => { if (col[ch]) { g.fillStyle = col[ch]; g.fillRect(x0 + x * 2, y0 + y * 2, 2, 2); } }));
  }
  const THINGS = { sign, lamp, page, tv, couch, lighthouse, remote, table, sofa, beanbag, snacks, crisps, console: konsole };
  // step 3 r2: what doesn't move is drawn once into an image (per state: a door open or shut) and stamped, so a page of
  // a thousand cells costs one drawImage a frame. The box is in stage px of the scene.
  const STILL = {
    sign: (th) => [th.board[0] * 8 - 16, th.board[1] * 16 - 16, th.board[2] * 8 + 24, (th.foot[1] + 1) * 16 + 8],
    lamp: (th) => [th.foot[0] * 8 - 24, (th.foot[1] - 6) * 16, th.foot[0] * 8 + 32, (th.foot[1] + 1) * 16 + 8],
    page: (th) => [th.box[0] * 8 - 16, th.box[1] * 16 - 16, th.box[2] * 8 + 24, th.box[3] * 16 + 32],
    lighthouse: (th) => { const { cx, o } = lhAt(th); return [cx - 100, o + 30, cx + 40, o + 292]; },
  };
  function stillThing(W, sc, th, S, t) {
    const open = S.open && S.open.has(th.id) ? 1 : 0, cache = sc._still || (sc._still = new Map()), key = th.id + '|' + open + '|' + W.dpr;
    let im = cache.get(key);
    if (!im) {
      if (!W.fontReady()) return;
      const [x0, y0, x1, y1] = STILL[th.thing](th), X = Webkeeper.screen(document.createElement('canvas'), { cell: 16, w: x1 - x0, h: y1 - y0, dpr: W.dpr, fixed: true });
      X.ox = -x0 * W.dpr; X.oy = -y0 * W.dpr; X.reset();
      THINGS[th.thing](X, th, S, t);
      im = { cv: X.canvas, x0, y0, w: x1 - x0, h: y1 - y0 }; cache.set(key, im);
    }
    W.reset(); W.g.drawImage(im.cv, im.x0, im.y0, im.w, im.h);
  }
  // a word that became a thing (place.js's word book), drawn from its own canvas; the letters flash first (layer 7)
  // a word that stands up as a lamp (LAMP, POST) is drawn as the meadow's own lamps are, so it reads as one at once;
  // the rest are their word book drawing
  const lampOf = (B) => { const d = WK_PLACE.bookOf(B.text); return d && d.draws === 'lamp' ? { foot: [Math.round(B.at[0] + B.text.length / 2 - 0.5), B.at[1]] } : null; };
  function become(W, B, t) { if (!B.thing || B.age < 0.9) return; const lp = lampOf(B); if (lp) lamp(W, lp); else B.thing.cv.draw(W, t, { air: false }); }
  const norm = (S) => {
    if (!S.becomes) S.becomes = S.become ? [S.become] : [];
    if (!S.rings) S.rings = S.ring ? [S.ring] : [];
    return S;
  };
  // the play layer's items, each with its feet (stage px of the scene) – the world sorts several scenes' together
  function playItems(W, sc, S, t, items = []) {
    for (const B of S.becomes) if (!B.thing || B.thing.lies) items.push({ feet: -1e9, f: () => become(W, B, t) });
    if (S.letters.some((l) => l.rail && l.state !== 'word')) items.push({ feet: -1e9 + 1, f: () => tracks(W, S) });
    // a stream's marks (lib/room.js): an x on the water where each letter of the word waiting there will lock in
    if ((S.marks || []).length) items.push({ feet: -1e9 + 2, f: () => { for (const m of S.marks) { inkBox(W, m.x, m.y, 9, 16); W.loose(m.x, m.y, 'x', P.beigeDim, 0, 16); } } });
    for (const th of sc.things) items.push({ feet: (th.foot[1] + 1) * 16, f: () => (STILL[th.thing] ? stillThing(W, sc, th, S, t) : (THINGS[th.thing] || (() => 0))(W, th, S, t)) });
    // a thing with a near half (the couch's back, a beanbag's lip) sorts that half again, after whoever sits in it
    for (const th of sc.things) if (th.over != null && THINGS[th.thing]) items.push({ feet: (th.over + 1) * 16, f: () => THINGS[th.thing](W, th, S, t, 'over') });
    for (const B of S.becomes) if (B.thing && !B.thing.lies) items.push({ feet: B.thing.feet, f: () => become(W, B, t) });
    // (cells rooms) the two cells under his feet, bracketed: those are Harold, as far as walls and pushes go
    if (!S.harold.gone && S.harold.feet) { const [fc, fr] = S.harold.feet; items.push({ feet: S.harold.y - 0.5, f: () => { W.g.fillStyle = P.beigeDim; W.g.fillRect(fc * 8, (fr + 1) * 16, 16, 1); W.g.fillRect(fc * 8, (fr + 1) * 16 - 3, 1, 3); W.g.fillRect(fc * 8 + 15, (fr + 1) * 16 - 3, 1, 3); } }); }
    if (!S.harold.gone) items.push({ feet: S.harold.y, f: () => actor(W, 'harold', S.harold, t) });
    for (const a of S.cast || []) if (!a.gone) items.push({ feet: a.y, f: () => actor(W, a.who, a, t) });
    const onFeet = {}; for (const th of sc.things) onFeet[th.id] = (th.foot[1] + 1) * 16 + 1;
    // (a letter in a station's line – a voice – is drawn over it, not hidden under its ink)
    const said = new Set(); for (const l of S.letters) if (l.voice && l.state !== 'gone') for (const dx of [-8, 0, 8]) said.add(Math.floor((l.x + dx) / 8) + ',' + Math.floor(l.y / 16));
    for (const l of S.letters) if (l.state !== 'word' && l.state !== 'gone') items.push({ feet: l.voice ? 1e6 : said.has(Math.floor(l.x / 8) + ',' + Math.floor(l.y / 16)) ? 1e6 + 1 : l.on && l.state === 'settled' && onFeet[l.on] ? onFeet[l.on] : l.y + 8, f: () => letter(W, l) });
    return items;
  }
  // a letter's track on the ground (lib/room.js rails): dim dots where it can go, a + where it belongs; gone once
  // the word has become its thing
  const TRACK = mix('ink', 'beigeDim', 0.55);
  function tracks(W, S) {
    for (const l of S.letters) {
      if (!l.rail || l.state === 'word' || l.state === 'gone') continue;
      const n = l.rail.length;
      for (let k = 0; k < n; k++) { const [c, r] = l.rail[k]; if (k === n - 1) { inkBox(W, (c + 0.5) * 8, (r + 0.5) * 16, 9, 16); W.loose((c + 0.5) * 8, (r + 0.5) * 16, '+', P.beigeDim, 0, 16); } else W.loose((c + 0.5) * 8, (r + 0.5) * 16 + 3, '.', TRACK, 0, 16); }
    }
  }
  function play(W, sc, S, t) {
    W.reset();
    const items = playItems(W, sc, S, t);
    items.sort((a, b) => a.feet - b.feet);
    for (const it of items) { W.reset(); it.f(); }
    sayings(W, S);
  }
  function sayings(W, S) {
    for (const s of S.say || []) {
      const x = Math.round(s.x / 8 - s.text.length / 2), r = Math.round(s.y / 16);
      W.ink(x - 1, r, s.text.length + 2, 1); W.textI(x, r, s.text, s.col || P.beige);
    }
  }

  // ── layer 5: the reveal mask – the front thins out round whoever it covers
  function revealCells(S) {
    const out = [], who = [S.harold, ...(S.cast || [])].filter((a) => a && !a.gone);
    // the front layer is cut away round each figure, by the figure's own size (Mishka, the sketch's bear, is twice
    // Harold's height: the front grass used to cross his middle) – just round the figure, so it reads as standing in
    // the grass, its blades leaning off him (his feet touch them, brushes.js C.touch), not as a hole carried about
    // (it was twice Harold's size, a clear oval round him wherever he walked)
    const SZ = { mishka: [56, 62, 52], malifex: [44, 64, 56] };
    for (const h of who) {
      const [rx, ry, up] = SZ[h.who] || [28, 26, 20], cx = h.x, cy = h.y - up;
      for (let r = Math.floor((cy - ry - 4) / 16); r <= Math.ceil((cy + ry + 4) / 16); r++) for (let c = Math.floor((cx - rx - 4) / 8); c <= Math.ceil((cx + rx + 4) / 8); c++) {
        const d = Math.hypot((c * 8 + 4 - cx) / rx, (r * 16 + 8 - cy) / ry);
        if (d < 0.8 || (d < 1.1 && (c + r) % 2)) out.push([c, r, d >= 0.8]);
      }
    }
    return out;
  }

  // ── layer 6: fireflies
  const FLY = [P.phosphor, P.phosphorDim];
  function fireflies(W, sc, t) {
    const n = (sc.place.air || {}).fireflies || 0, area = ((sc.place.walk || {}).area || [[0, 0, 160, 45]])[0];
    for (let k = 0; k < n; k++) {
      if ((Math.floor(t * 3) + k * 5) % 7 >= 3) continue;
      const x0 = (area[0] + hash(k, 1, 95) * (area[2] - area[0])) * 8, y0 = (area[1] + hash(k, 2, 95) * (area[3] - area[1])) * 16;
      const x = Math.round(x0 + Math.sin(t * 0.6 + k) * 22), y = Math.round(y0 + Math.cos(t * 0.45 + k * 2) * 10);
      W.loose(x, y, (Math.floor(t * 3) + k) % 3 ? '.' : "'", FLY[(Math.floor(t * 3) + k) % 7 === 0 ? 1 : 0], 0, 16);
    }
  }

  // ── layer 7: light
  // the quack ring on the ground: an ellipse 1.8 times as wide as tall (the camera), big o's near, small far out
  function ring(W, R, t) {
    const front = (t - R.t0) * R.speed; if (front < 0 || front > R.reach) return;
    const rx = front, ry = front / D.camera.ground, n = Math.max(8, Math.round((Math.PI * (rx + ry)) / 9));
    for (let a = 0; a < n; a++) { const th = (a / n) * Math.PI * 2; W.loose(Math.round(R.x + Math.cos(th) * rx), Math.round(R.y + Math.sin(th) * ry), front < 60 ? 'O' : 'o', front > R.reach * 0.8 ? P.beigeDim : P.beige, 0, 16); }
  }
  const FLASH = [P.phosphor, P.phosphorDim, mix('phosphorDim', 'beige', 0.6)];
  function light(W, sc, S, t) {
    for (const R of S.rings) ring(W, R, t);
    // a word settling into what it says: its letters flash in three steps, then the thing is there
    for (const B of S.becomes) if (B.age < 0.9) { const col = FLASH[Math.min(2, Math.floor(B.age / 0.3))]; for (const l of B.letters || []) letter(W, { ...l, z: 0, ang: 0, state: 'settled' }, col); }
    for (const th of sc.things) if (th.thing === 'lighthouse') beam(W, th, t);
    for (const th of [...sc.things, ...S.becomes.filter((B) => B.age >= 0.9).map(lampOf).filter(Boolean).map((q) => ({ thing: 'lamp', ...q }))]) if (th.thing === 'lamp') {
      const [c, foot] = th.foot, x = (c + 0.5) * 8, y = (foot - 4.5) * 16;
      for (let k = 0; k < 2; k++) { const a = Math.floor(t * 12) * 0.9 + k * Math.PI + k; W.loose(Math.round(x + Math.cos(a) * 16), Math.round(y + Math.sin(a * 1.3) * 9), k ? ',' : "'", P.beigeDim, 0, 12); }
      // a halo round the flame, in two stepped rings that turn slowly, so a lamp is seen from across the meadow
      const hy = (foot - 3.5) * 16, sp = Math.floor(t * 4) * 0.21;
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2 + (k % 2 ? sp : -sp), rr = k % 2 ? 15 : 24; W.loose(Math.round(x + Math.cos(a) * rr), Math.round(hy + Math.sin(a) * rr * 0.55), k % 2 ? '.' : "'", k % 3 ? P.yellowDim : P.beige, 0, 12); }
    }
  }

  // ── layer 8: ui
  function corners(W, c0, r0, c1, r1) { for (const [c, r, ch] of [[c0 - 1, r0 - 1, '┌'], [c1 + 1, r0 - 1, '┐'], [c0 - 1, r1 + 1, '└'], [c1 + 1, r1 + 1, '┘']]) { W.ink(c, r); W.put(c, r, ch, P.beige); } }
  function ui(W, sc, S) {
    const s = sc.place.place + ' · ' + sc.place.name + (S.as === 'malifex' ? ' · as malifex' : '');
    W.ink(1, 0, s.length + 2, 1); W.text(2, 0, s, S.as === 'malifex' ? P.phosphor : P.beigeDim);
    const o = S.outline;
    if (o) { const th = typeof o === 'string' ? sc.things.find((x) => x.id === o) : null, bx = th ? th.board || th.box : o.box; if (bx) corners(W, ...bx); }
    if (S.hint) { const h = S.hint; W.ink(80 - Math.ceil(h.length / 2) - 1, 43, h.length + 2, 1); W.textI(80 - Math.ceil(h.length / 2), 43, h, P.beigeDim); }
  }

  // ── one frame. o.cache: layers 0–3 and the air are drawn into images once a step (twelve a second) and stamped in
  // between, so harold can move smoothly over a world whose marks step
  const ALL = LAYERS.map(() => true);
  const offs = new WeakMap();
  function off(W) { let o = offs.get(W); if (!o) { const mk = () => Webkeeper.screen(document.createElement('canvas'), { cell: 16 }); o = { U: mk(), M: mk(), A: mk(), key: '', due: 0 }; offs.set(W, o); } return o; }
  function deepLayers(W, sc, t, on) {
    const g = W.g, hp = sc.G.holes();
    if (hp && (on[0] || on[1])) {
      W.reset(); g.save(); g.clip(hp);
      if (on[0] && sc.D) { sc.D.draw(W, t, { air: false }); W.reset(); deepWords(W, sc, t); }
      if (on[1]) { W.reset(); farPages(W, sc); }
      g.restore();
    }
  }
  function underLayers(W, sc, S, t, on, rings) {
    deepLayers(W, sc, t, on);
    if (on[2]) sc.G.draw(W, t, { rings, air: false });
    if (on[3] && sc.M) sc.M.draw(W, t, { air: false });
  }
  const clearScr = (X) => { X.reset(); X.g.setTransform(1, 0, 0, 1, 0, 0); X.g.clearRect(0, 0, X.canvas.width, X.canvas.height); X.reset(); };
  function draw(W, sc, t, o = {}) {
    const on = o.on || ALL, S = norm(o.state || sc.at(t)), g = W.g;
    const rings = S.rings.map((R) => ({ x: R.x, y: R.y, t0: R.t0, reach: R.reach, speed: R.speed }));
    // walking: the feet of whoever moves loosen the texture they pass (once a step)
    const fr = Math.floor(t * 12);
    if (sc._touched !== fr && sc.place.touch !== false) {
      sc._touched = fr;
      for (const a of [S.harold, ...(S.cast || [])]) if (a && a.moving && !a.gone) {
        const c = (a.x / 8 - 0.5) * sc.k, r = (a.y / 16 - 0.4) * sc.k;
        const v = Math.hypot(a.vx || 0, a.vy || 0), hx = v ? (a.vx || 0) / v : 0;   // vx, vy in px a second
        sc.G.touch(c, r, t, 1.6 * sc.k, hx); if (sc.F) sc.F.touch(c, r - sc.F.y / sc.cell, t, 1.6 * sc.k, hx);
      }
    }
    if (o.cache) {
      const C = off(W), key = fr + '|' + on.join('') + '|' + (sc.place.place || '');
      // a step of the world, spread over three frames so no one frame does it all: the ground (with its live rings and
      // paws) now, the night below and what stands behind on the next frame, the air on the one after
      if (C.key !== key) { C.key = key; C.U.clear(); deepLayers(C.U, sc, t, on); if (on[2]) sc.G.draw(C.U, t, { rings, air: false }); C.due = 2; C.t = t; }
      else if (C.due === 2) { C.due = 1; clearScr(C.M); if (on[3] && sc.M) sc.M.draw(C.M, C.t, { air: false }); }
      else if (C.due === 1) { C.due = 0; clearScr(C.A); if (on[6]) { sc.G.drawAir(C.A, C.t); if (sc.M) sc.M.drawAir(C.A, C.t); C.A.reset(); fireflies(C.A, sc, C.t); } }
      W.reset(); g.drawImage(C.U.canvas, 0, 0, 1280, 720); g.drawImage(C.M.canvas, 0, 0, 1280, 720);
      if (on[4]) play(W, sc, S, t);
      if (on[5] && sc.F) front(W, sc, S, t, rings);
      W.reset(); if (on[6]) g.drawImage(C.A.canvas, 0, 0, 1280, 720);
    } else {
      W.clear();
      underLayers(W, sc, S, t, on, rings);
      if (on[4]) play(W, sc, S, t);
      if (on[5] && sc.F) front(W, sc, S, t, rings);
      if (on[6]) { sc.G.drawAir(W, t); if (sc.M) sc.M.drawAir(W, t); W.reset(); fireflies(W, sc, t); }
    }
    W.reset();
    if (on[7]) light(W, sc, S, t);
    if (on[8]) ui(W, sc, S);
    return S;
  }
  function front(W, sc, S, t, rings) {
    const g = W.g;
    W.reset(); g.save(); g.beginPath(); g.rect(-40, -40, 1360, 800);
    for (const [c, r] of revealCells(S)) g.rect(c * 8, r * 16, 8, 16);
    g.clip('evenodd'); sc.F.draw(W, t, { rings, air: false }); g.restore();
  }

  // ── the debugger's overlays: fields (wind, light, touch) and masks (reveal, fog, shadow, water, walk)
  function bake(W, fn) {
    const cv = document.createElement('canvas'), dpr = W.dpr; cv.width = 1280 * dpr; cv.height = 720 * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    fn((x, y, ch, col) => W.looseOn(g, x, y, ch, col, 0, 16, dpr), g);
    return cv;
  }
  // the texture field under a big cell: the largest value among the small cells it covers
  const under = (F, arr, c, r) => {
    let v = 0; const ox = F.ox || 0, oy = F.oy || 0, x0 = Math.floor((c * 8 - ox) / F.cw), x1 = Math.floor(((c + 1) * 8 - 0.01 - ox) / F.cw), y0 = Math.floor((r * 16 - oy) / F.ch), y1 = Math.floor(((r + 1) * 16 - 0.01 - oy) / F.ch);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && y < F.rows && x < F.cols) v = Math.max(v, arr[y * F.cols + x]);
    return v;
  };
  const LCOL = [mix('ink', 'tealUp', 0.6), P.tealUp, P.tealHi, P.beigeDim, P.beige];
  const MISTC = [null, mix('tealUp', 'tealHi', 0.5), P.tealHi, mix('tealHi', 'beige', 0.6)];
  function overlay(W, sc, S, t, name) {
    const F = sc.G.fields(); if (!F) return;
    const ov = sc._ov || (sc._ov = {}), g = W.g, { cols, rows } = WK_PLACE.ROOM;
    W.reset();
    const stamp = (key, fn) => { if (!ov[key]) ov[key] = bake(W, fn); g.drawImage(ov[key], 0, 0, 1280, 720); };
    switch (name) {
      case 'light': stamp('light', (put) => { for (let r = 1; r < rows - 1; r++) for (let c = 0; c < cols; c += 2) { const st = WK_BRUSH.step(under(F, F.L, c, r)); put(c * 8 + 8, r * 16 + 8, String(st), LCOL[st]); } }); break;
      case 'fog': stamp('fog', (put) => { for (let r = 1; r < rows - 1; r++) for (let c = 0; c < cols; c++) { const m = under(F, F.mist, c, r); if (m) put(c * 8 + 4, r * 16 + 8, '.:='[m - 1], MISTC[m]); } }); break;
      case 'shadow': stamp('shadow', (put) => { for (let r = 1; r < rows - 1; r++) for (let c = 0; c < cols; c++) if (under(F, F.sh, c, r) && (c + r) % 2) put(c * 8 + 4, r * 16 + 8, '/', P.beigeDim); }); break;
      case 'water': stamp('water', (put) => { let n = 0; for (let r = 1; r < rows - 1; r++) for (let c = 0; c < cols; c++) if (under(F, F.wet, c, r)) { n++; put(c * 8 + 4, r * 16 + 8, '=', P.tealHi); } if (!n) { const s = 'no water in this room'; for (let i = 0; i < s.length; i++) put(80 * 8 - s.length * 4 + i * 8 + 4, 22 * 16 + 8, s[i], P.tealHi); } }); break;
      case 'walk': {
        const key = 'walk' + (S.walkState ? S.walkState.becomes.length + '' + S.walkState.open.size : S.solved ? 1 : 0);
        stamp(key, (put) => {
          const wg = sc.walk(S.walkState || !!S.solved);
          for (let r = 1; r < rows - 1; r++) for (let c = 0; c < cols; c++) if (!wg[r * cols + c] && (c + r) % 2 === 0) put(c * 8 + 4, r * 16 + 8, 'x', P.redDim);
          for (const e of sc.place.exits || []) for (const [c, r] of WK_PLACE.exitCells(e)) put(c * 8 + 4, r * 16 + 8, e.edge === 'west' ? '<' : e.edge === 'east' ? '>' : e.edge === 'north' ? '^' : 'v', P.phosphor);
        });
        break;
      }
      case 'wind':
        for (let r = 3; r < rows - 1; r += 4) for (let c = 4; c < cols; c += 10) {
          const a = WK_BRUSH.windA(c * 8, r * 16, t), m = Math.abs(a), s = m < 0.06 ? '.' : m < 0.25 ? '-' : m < 0.5 ? '->' : '=>>';
          for (let i = 0; i < s.length; i++) { W.ink(c + i, r); W.put(c + i, r, a < -0.06 ? (s[i] === '>' ? '<' : s[i]) : s[i], m < 0.25 ? P.phosphorDim : P.phosphor); }
        }
        break;
      case 'touch':
        for (let r = 1; r < rows - 1; r++) for (let c = 0; c < cols; c += 2) { const a = sc.G.amt(c * 8 + 8, r * 16 + 8); if (a) { W.ink(c, r); W.put(c, r, a > 0.9 ? 'O' : 'o', a > 0.9 ? P.phosphor : P.phosphorDim); } }
        break;
      case 'reveal':
        if (sc.F) for (const [c, r, edge] of revealCells(S)) if (edge) W.put(c, r, ':', P.phosphor);
        break;
    }
  }

  window.WK_LAYERS = { LAYERS, FIELDS, MASKS, fogField, draw, overlay, revealCells, THINGS, letter, actor, off, farImage,
    playItems, play, sayings, light, ring, fireflies, deepLayers, deepWords, farPages, norm, mix };
})();
