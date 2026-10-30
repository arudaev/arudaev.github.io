// brushes.js – the painter's brushes. Round 2 rebuilt them on the eight rules in STUDY.md:
//   1 light first: one light field (moon, lamps, cast shadows) in steps decides every tint
//   2 a solid's letter is its form (a height and a facing per cell), picked once from a ramp
//     measured in VT323; the light only tints it
//   3 ground cover is small turned strokes combed by one flow field, not text
//   4 ink is the darkest tone: shade is fewer, dimmer marks      5 every solid cell sits on ink
//   6 small marks for texture; big letters only for what you read or play with (the cards' job)
//   7 shadows, reflections and the sky in the water are faked as shapes
//   8 bake each wind step once, stamp it after; only what a ring or a touch disturbs is live
// Round 3 (archive/PLAN.md §3): trees are grown by cards/world/tree.js and painted here (each cell keeps
// its sway, so a crown bends from the foot up); built stone is a ruin of uneven blocks in shape
// marks; mist lightens what lies under it; water is calm and mirrors its bank; soil catches the
// moon (pebbles with shadows, ruts, paw prints, tufts at its edge); the grass follows a meadow
// map; and every wind step is baked up front, so a card never bakes again after its first loop.
//
//   const cv = WK_BRUSH.canvas({ x, y, cols, rows, cell: 12, tier: '56K', detail: 'near', seed });
//   cv.paint('grass', { rect: [c0, r0, c1, r1] });   { disc: [c, r, rx, ry] }   { fn: (x, y) => inside, bbox }
//   cv.paint('bark', { line: [[c, r], [c, r]], width: 1.4, sway: 0..1 });         arrays of shapes too
//   cv.light({ ambient, lamps: [{ x, y, rad }], actors: [{ x, y, rx, ry, push }], shade: [{ x, y, rx, ry }], glades: [{ x }] });
//   cv.shadeAdd({ x, y, rx, ry } | { fn, bbox })   a cast shadow that stays (a crown's, a wall's)
//   cv.stamp('paw', c, r)                          a print pressed into the soil
//   cv.draw(W, t, { rings: [{ x, y, t0 }], touch: (c, r, t) => age, touchRegion: (t) => [x0, y0, x1, y1], steps: 6 });
//   WK_BRUSH.ruin(cv, { c0, c1, foot, h, arch: { c, w, h }, door: { c, w, h }, pillars: [{ c, w, h, broken }], seed })
//   WK_BRUSH.paws(cv, [[c, r], …])                 a trail of paw prints along a line
// Step 2 (lib/layers.js, lib/place.js): the 'ditch' brush opens the page (cv.holes() is a clip path of the open
// cells); cv.fog(fn) lays the scene's fog mask; cv.draw(W, t, { air: false }) leaves the air to cv.drawAir(W, t);
// cv.fields() and cv.amt(px, py) let a debugger show the light, shade, mist, holes and what is loose.
// Shapes are in the patch's own cells (a column is half a row); lamps, actors, rings and glades
// are in stage px. The same seed paints the same patch; painting twice thickens it up to 1.6×.
(function () {
  const { P, hash } = Webkeeper;
  const TAU = Math.PI * 2, W1 = TAU / 4;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mixC = new Map();
  const mix = (a, b, k) => {
    const key = a + b + k; let m = mixC.get(key);
    if (!m) { const A = hex(P[a] || a), B = hex(P[b] || b); m = '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); mixC.set(key, m); }
    return m;
  };
  const hstr = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return (h >>> 0) % 9973; };
  const vnoise = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };

  // ── the wind, in stage px: a slow sway, and one gust a loop rolling left to right (periodic in 4 s)
  const gustPx = (x, t) => { const f = ((((t % 4) + 4) % 4) / 4) * 1780 - 250, d = x - f; return d > -260 && d < 0 ? Math.sin((1 + d / 260) * Math.PI) : 0; };
  const windA = (x, y, t) => gustPx(x, t) * 0.55 + Math.sin((t / 4) * TAU + x / 210) * 0.07 + Math.sin((t / 2) * TAU + x / 90 + y / 70) * 0.025;
  const wind = (c, r, t) => windA(c * 8, r * 16, t) * 2;   // the old field's call, in stage cells
  // the world's wind (world px): the same field lib/marks.js computes per mark on the GPU – the sketch's rolling waves
  // (two slow sines travelling east, the near one bent by a slower one) and a long gust front every 7.9 s. One coherent
  // field: the meadow moves in waves, never blade by blade.
  const windW = (x, y, t) => {
    const c = x / 8, r = y / 16;
    const w = Math.sin(c * 0.09 - t * 1.3 + Math.sin(r * 0.2 + t * 0.4)) * 0.6 + Math.sin(c * 0.023 - t * 0.55) * 0.55;
    const g = Math.max(0, Math.sin(((x - y * 0.3) / 1040 - t / 7.9) * TAU));
    return w * 0.42 + g * g * 0.22 + 0.12;
  };
  // tile images of every canvas in tile mode share one memory budget (in device pixels); the least recently drawn go first
  const MEM = { list: [], px: 0, budget: 40e6, frame: 0, baked: 0, evicted: 0, pool: new Map(), reused: 0 };
  // dropped tile canvases are kept for the next tile of the same size (the ground's tiles all are): no churn for the collector
  const poolPut = (cv) => { const k = cv.width + 'x' + cv.height, a = MEM.pool.get(k) || []; if (a.length < 64) { a.push(cv); MEM.pool.set(k, a); } else cv.width = cv.height = 0; };
  const poolGet = (w, h) => { const a = MEM.pool.get(w + 'x' + h); if (a && a.length) { MEM.reused++; return a.pop(); } const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
  function memAdd(im) { MEM.list.push(im); MEM.px += im.px; MEM.baked++; if (MEM.px > MEM.budget) memTrim(); }
  function memTrim() {
    const keep = MEM.frame - 40; MEM.list.sort((a, b) => a.u - b.u); let i = 0;
    while (MEM.px > MEM.budget * 0.85 && i < MEM.list.length && MEM.list[i].u < keep) { const im = MEM.list[i++]; MEM.px -= im.px; if (im.T.im[im.p] === im) im.T.im[im.p] = null; poolPut(im.cv); MEM.evicted++; }
    MEM.list = MEM.list.slice(i);
  }
  const memDrop = (ims) => { const set = new Set(ims); MEM.list = MEM.list.filter((im) => { if (!set.has(im)) return true; MEM.px -= im.px; poolPut(im.cv); return false; }); };

  // ── the moon: up and to the left. Cast shadows fall the other way, along the ground
  const MOON = (() => { const v = [-0.55, -0.62, 0.56], n = Math.hypot(...v); return v.map((a) => a / n); })();
  const SHADOW = [0.9, 0.55];
  const step = (l) => (l < 0.2 ? 0 : l < 0.34 ? 1 : l < 0.55 ? 2 : l < 0.8 ? 3 : 4);

  // ── the bandwidth tiers: the texture's cell, colour or greens, strokes or the grid
  const TIERS = [
    { name: '14.4K', cell: 24, color: false, loose: false, sp: 1, ramp: 2, note: 'grid · 2 greens' },
    { name: '28.8K', cell: 18, color: false, loose: false, sp: 1, ramp: 3, note: 'grid · 3 greens' },
    { name: '33.6K', cell: 14, color: true, loose: true, sp: 1.4, ramp: 4, note: 'strokes · 4 tints' },
    { name: '56K', cell: 12, color: true, loose: true, sp: 1, ramp: 6, note: 'all of it' },
  ];
  const TIER = Object.fromEntries(TIERS.map((t) => [t.name, t]));
  // ── one level of detail: one budget by distance for every brush (cards/brushes/detail.html)
  const DETAIL = {
    near: { name: 'near', sp: 1, ramp: 6, marks: 3 },
    mid: { name: 'mid', sp: 1.4, ramp: 4, marks: 2 },
    far: { name: 'far', sp: 1, ramp: 2, marks: 1, grid: true },
  };

  // ── letters by the ink they put down, measured in VT323 itself, then cut into bands
  const inkOf = new Map();
  let mcv = null;
  function ink(ch) {
    let v = inkOf.get(ch);
    if (v != null) return v;
    if (!mcv) { mcv = document.createElement('canvas'); mcv.width = mcv.height = 24; }
    const g = mcv.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, 24, 24); g.font = '16px VT323'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(ch, 12, 12);
    const d = g.getImageData(0, 0, 24, 24).data; v = 0; for (let i = 3; i < d.length; i += 4) v += d[i];
    inkOf.set(ch, v);
    return v;
  }
  const rampC = new Map();
  function ramp(cands, bands = 9) {
    const key = cands + '|' + bands; let R = rampC.get(key);
    if (R) return R;
    const out = [...new Set(cands)].map((ch) => [ch, ink(ch)]).sort((a, b) => a[1] - b[1]);
    const n = Math.min(bands, out.length); R = [];
    for (let b = 0; b < n; b++) R.push(out.slice(Math.floor(b * out.length / n), Math.floor((b + 1) * out.length / n)).map((o) => o[0]));
    rampC.set(key, R);
    return R;
  }

  // ── strokes: a glyph turned to an angle, drawn once per angle step, colour and size, then stamped
  const ASTEP = 0.08, cidMap = new Map(), cids = [];
  const cid = (ch, col) => { const k = ch + col; let v = cidMap.get(k); if (v == null) { v = cids.length; cids.push({ ch, col, m: new Map() }); cidMap.set(k, v); } return v; };
  // a frame makes at most TURN.cap new turned tiles while live (the first touch through grass at new angles made 26–43 ms
  // frames); past that, the nearest angle already made stands in for a frame or two
  const TURN = { cap: Infinity, made: 0, frame: -1 };
  function turnedId(id, ang, size, dpr) {
    const e = cids[id], ai = Math.round(ang / ASTEP), sz = Math.round(size), dk = (dpr > 1.25 ? (dpr > 1.75 ? 2 : 1) : 0), key = (ai + 512) * 4096 + sz * 4 + dk;
    let t = e.m.get(key);
    if (!t && TURN.made >= TURN.cap) for (let d = 1; d < 6 && !t; d++) t = e.m.get((ai + d + 512) * 4096 + sz * 4 + dk) || e.m.get((ai - d + 512) * 4096 + sz * 4 + dk);
    if (!t) TURN.made++;
    if (!t) {
      const d = Math.ceil(sz * 1.4 * dpr), cv = document.createElement('canvas'); cv.width = cv.height = d;
      const g = cv.getContext('2d'); g.translate(d / 2, d / 2); g.rotate(ai * ASTEP);
      g.font = `${Math.round(sz * dpr)}px VT323`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = e.col; g.fillText(e.ch, 0, 0);
      t = { cv, d: d / dpr }; if (settledAt) e.m.set(key, t);
    }
    return t;
  }
  const turned = (ch, ang, col, size, dpr) => turnedId(cid(ch, col), ang, size, dpr);
  // mist's streaks: a run of dashes drawn once per length, colour and size, then stamped
  const stC = new Map();
  function streak(chr, n, col, size, dpr) {
    const key = chr + n + col + size + '|' + dpr; let t = stC.get(key);
    if (!t) {
      const gap = size * 0.45, w = Math.ceil((n * gap + size * 0.4) * dpr), h = Math.ceil(size * 1.1 * dpr), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.font = `${Math.round(size * dpr)}px VT323`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col;
      for (let k = 0; k < n; k++) g.fillText(chr, (size * 0.2 + gap * (k + 0.5)) * dpr, h / 2);
      t = { cv, w: w / dpr, h: h / dpr }; if (settledAt) stC.set(key, t);
    }
    return t;
  }

  // ── tints: mixes of the palette only, dark to light. Five steps for cover, six for solids
  const T5 = {
    grass: [mix('ink', 'phosphorDeep', 0.75), P.phosphorDeep, mix('phosphorDeep', 'tealUp', 0.45), mix('phosphorDim', 'tealHi', 0.4), mix('phosphorDim', 'beige', 0.5)],
    tall: [mix('ink', 'phosphorDeep', 0.6), mix('ink', 'phosphorDeep', 0.9), mix('phosphorDeep', 'tealUp', 0.3), mix('phosphorDeep', 'tealHi', 0.45), mix('phosphorDim', 'beige', 0.35)],
    dry: [mix('ink', 'beigeDim', 0.3), mix('ink', 'beigeDim', 0.55), mix('tealUp', 'beigeDim', 0.7), P.beigeDim, mix('beigeDim', 'beige', 0.6)],
    reeds: [mix('ink', 'tealUp', 0.45), mix('phosphorDeep', 'tealUp', 0.5), P.tealUp, mix('tealUp', 'tealHi', 0.5), mix('tealHi', 'beige', 0.4)],
    moss: [mix('ink', 'phosphorDeep', 0.8), mix('phosphorDeep', 'phosphorDim', 0.3), mix('phosphorDeep', 'phosphorDim', 0.65), mix('phosphorDim', 'tealHi', 0.35), mix('phosphorDim', 'beige', 0.35)],
    fur: [mix('ink', 'beigeDim', 0.28), mix('ink', 'beigeDim', 0.5), mix('tealUp', 'beigeDim', 0.6), mix('beigeDim', 'beige', 0.25), mix('beigeDim', 'beige', 0.7)],
    // bare ground lies flat under the moon: it is lighter than the grass round it
    soil: [mix('ink', 'beigeDim', 0.36), mix('ink', 'beigeDim', 0.58), mix('tealUp', 'beigeDim', 0.72), mix('beigeDim', 'beige', 0.25), mix('beigeDim', 'beige', 0.65)],
    dug: [mix('ink', 'beigeDim', 0.2), mix('ink', 'beigeDim', 0.34), mix('ink', 'beigeDim', 0.5), mix('ocean', 'beigeDim', 0.65), mix('beigeDim', 'beige', 0.3)],
    dew: [P.inkUp, mix('ink', 'beigeDim', 0.5), P.beigeDim, mix('beigeDim', 'beige', 0.5), P.beige],
    red: [P.inkUp, mix('ink', 'redDim', 0.7), P.redDim, mix('redDim', 'red', 0.6), P.red],
    bone: [P.inkUp, mix('ink', 'beigeDim', 0.6), P.beigeDim, mix('beigeDim', 'beige', 0.6), P.beige],
    blue: [P.inkUp, mix('ink', 'tealUp', 0.7), P.tealUp, mix('tealUp', 'tealHi', 0.6), P.tealHi],
    pebble: [mix('ink', 'ocean', 0.7), P.ocean, mix('ocean', 'tealUp', 0.6), mix('tealUp', 'tealHi', 0.5), mix('tealHi', 'beige', 0.45)],
    bark: [mix('ink', 'beigeDim', 0.3), mix('ink', 'beigeDim', 0.5), mix('beigeDim', 'redDim', 0.3), mix('beigeDim', 'beige', 0.2), mix('beigeDim', 'beige', 0.55)],
    water: [mix('ink', 'ocean', 0.7), P.ocean, mix('ocean', 'tealUp', 0.65), P.tealUp, mix('tealUp', 'tealHi', 0.6)],
    // mist is pale: teal lifted toward bone
    mist: [mix('tealUp', 'tealHi', 0.45), P.tealHi, mix('tealHi', 'beigeDim', 0.45), mix('tealHi', 'beige', 0.45), mix('tealHi', 'beige', 0.72)],
    cloud: [mix('ink', 'ocean', 0.6), P.ocean, mix('ocean', 'tealUp', 0.5), mix('tealUp', 'beigeDim', 0.4), P.beigeDim],
    star: [mix('ink', 'tealUp', 0.6), P.tealUp, P.beigeDim, mix('beigeDim', 'beige', 0.6), P.beige],
    light: [mix('ink', 'tealUp', 0.5), P.tealUp, P.tealHi, mix('tealHi', 'beige', 0.6), P.beige],
  };
  // each material in its own hue, so water, ground, leaves and things read apart from the grass (blue-green) at a
  // glance: wood is beige warmed with red, stone a grey between beige and the sea, leaves an olive green, water teal
  const WOOD = mix('beigeDim', 'redDim', 0.3), STONE = mix('beigeDim', 'ocean', 0.35);
  const T6 = {
    stone: [mix('ink', STONE, 0.45), mix('ink', STONE, 0.75), STONE, mix(STONE, 'beigeDim', 0.6), mix('beigeDim', 'beige', 0.45), P.beige],
    brick: [mix('ink', 'beigeDim', 0.3), mix('ocean', 'beigeDim', 0.45), mix('ocean', 'beigeDim', 0.75), P.beigeDim, mix('beigeDim', 'beige', 0.5), P.beige],
    pillar: [mix('ink', 'beigeDim', 0.35), mix('tealUp', 'beigeDim', 0.6), P.beigeDim, mix('beigeDim', 'beige', 0.45), mix('beigeDim', 'beige', 0.8), P.beige],
    bark: [mix('ink', WOOD, 0.45), mix('ink', WOOD, 0.75), WOOD, mix(WOOD, 'beigeDim', 0.5), mix('beigeDim', 'beige', 0.3), mix('beigeDim', 'beige', 0.65)],
    leaf: [mix('ink', 'phosphorDeep', 0.7), mix('phosphorDeep', 'yellowDim', 0.25), mix('phosphorDim', 'yellowDim', 0.3), mix('phosphorDim', 'yellowDim', 0.5), mix('yellowDim', 'beige', 0.35), mix('yellowDim', 'beige', 0.65)],
    moon: [mix('ink', 'beigeDim', 0.5), P.beigeDim, mix('beigeDim', 'beige', 0.4), mix('beigeDim', 'beige', 0.7), P.beige, P.beige],
  };
  const WBODY = [mix('ink', 'ocean', 0.8), mix('ocean', 'tealUp', 0.35)];   // the water's body; its surface row
  const MOSSY = (T) => T.map((c) => mix(c, 'phosphorDeep', 0.55));
  // mist lifts what lies under it toward this pale teal, in steps; the ink under solids lifts less
  const MISTC = mix('tealHi', 'beigeDim', 0.3), LIFT = [0, 0.2, 0.36, 0.52], LIFTI = [0, 0.08, 0.15, 0.23];

  // ── the brushes, as data. kind: cover (strokes) · grit · dots · solid · clump · twig · water · air · stars · light · groove
  const KIND = {
    cover: { motion: 'V3', glyph: '|', sp: 5, size: [15, 18], jitter: 0.22, comb: 1, flow: [170, 130], wind: 1, edge: 2, keep: [0.38, 0.62, 0.8, 1, 1], segs: 1, lift: 5 },
    grit: { motion: 'V3', glyphs: ".,'`.-", keep: 0.6, toss: 1, edge: 1.5, pebble: 0.03, per: 2, gsize: [8, 12], tufts: 0.1, lift: 1 },
    dots: { motion: 'V3', density: 0.1, size: 14, lift: 8, edge: 2, toss: 1 },
    solid: { motion: 'V1', edge: 1, moss: 0.55, form: 'dome' },
    clump: { motion: 'V3', size: [10, 12], sway: 4, edge: 1.2 },
    twig: { motion: 'V3', size: 12, sway: 3, edge: 0.5 },
    water: { motion: 'V2', edge: 0.8 },
    air: { motion: 'V2', edge: 3, density: 0.12, drift: 60 },
    stars: { motion: 'V1', edge: 3, density: 0.05 },
    light: { motion: 'V2', edge: 5, emits: 0.6 },
    groove: { motion: 'V1', edge: 0.8 },   // marks nothing itself: it changes the brushes under it
  };
  const BRUSHES = {};
  const brush = (name, def) => (BRUSHES[name] = { name, label: name, ragged: 1.2, ...KIND[def.kind], ...def, id: hstr(name) });
  const STONE_L = ".,'`:;-=+*^!|ilrcszvunxoaeqpdbwkhQ0O8&%$#@WMBNH";

  // ground cover – strokes, combed. grass follows the meadow's map (short, long, trampled, bare)
  brush('grass', { kind: 'cover', label: 'grass', tints: T5.grass, dew: 0.03, vary: true });
  // step 3: the room's ground cover – short, dim, sparse, barely moving; the meadow proper (grass, tall) comes in patches in the light
  brush('short', { kind: 'cover', label: 'short', glyph: "'", tints: [mix('ink', 'phosphorDeep', 0.5), mix('ink', 'phosphorDeep', 0.75), P.phosphorDeep, mix('phosphorDeep', 'tealUp', 0.35), mix('phosphorDeep', 'tealHi', 0.45)], sp: 6, size: [9, 11], jitter: 0.7, comb: 0.5, wind: 0.3, lift: 1, keep: [0.22, 0.45, 0.7, 0.9, 1] });
  brush('tall', { kind: 'cover', label: 'tall', tints: T5.tall, sp: 6, size: [15, 17], segs: 2, wind: 1.3 });
  brush('dry', { kind: 'cover', label: 'dry', tints: T5.dry, sp: 5.5, size: [12, 15], jitter: 0.55, comb: 0.6, wind: 1.1 });
  brush('reeds', { kind: 'cover', label: 'reeds', tints: T5.reeds, sp: 10, size: [16, 18], segs: 3, jitter: 0.06, comb: 0.3, wind: 0.6, tip: ':', tipTint: P.beigeDim, wet: true });
  brush('moss', { kind: 'cover', label: 'moss', glyph: "'", tints: T5.moss, sp: 3.4, size: [9, 11], jitter: 2.6, comb: 0, wind: 0.1, over: true, lift: 1, keep: [0.5, 0.75, 0.9, 1, 1] });
  brush('fur', { kind: 'cover', label: 'fur', glyph: "'", tints: T5.fur, sp: 3, size: [10, 12], jitter: 0.12, comb: 1.8, flow: [60, 50], wind: 0.25, lift: 2 });
  // flowers and pebbles – points over the ground
  brush('flowers', { kind: 'dots', glyphs: '*o*', hues: [T5.red, T5.bone, T5.blue], density: 0.07, size: 14, lift: 9, with: [['grass', 0.85]] });
  // step 3 r2: a second kind – daisies, pale stars in drifts (the flowers brush mixes red, bone and blue)
  brush('daisies', { kind: 'dots', glyphs: '*.*', hues: [T5.bone], density: 0.11, size: 12, lift: 6, with: [['grass', 0.85]] });
  brush('scree', { kind: 'dots', glyphs: 'o.,o', hues: [T5.pebble], density: 0.45, size: 11, lift: 2 });
  // soil – loose grains that catch the moon, pebbles with their shadows, tufts growing in at the edge
  brush('soil', { kind: 'grit', tints: T5.soil, keep: 0.7, lift: 1 });
  brush('dug', { kind: 'grit', tints: T5.dug, glyphs: ":;%o&;:,.", keep: 0.95, pebble: 0.08, toss: 1.5, tufts: 0.02, lift: 0, gsize: [10, 13] });
  // grooves – they mark nothing of their own: ruts in the soil, trampled ways and bare patches in the meadow
  brush('rut', { kind: 'groove', label: 'ruts' });
  brush('trample', { kind: 'groove', label: 'trampled' });
  brush('bare', { kind: 'groove', label: 'bare' });
  // a ditch dug through the page (step 2): its cells are open – the layers below show through – and
  // its rim is a wall of dug earth on ink, lit where it faces the moon (the east wall), dim where it doesn't
  brush('ditch', { kind: 'groove', label: 'ditch', hole: true });
  // solids – letters by form, on ink
  brush('stone', { kind: 'solid', letters: STONE_L, tints: T6.stone, form: 'dome', floor: 0.34 });
  // step 3: natural stone gets the ruin's treatment – a few big facets on ink, each read by its shape mark
  // (= - _ for a top turned up to the moon, / \ ( ) for the rims, | for a face), letters only for weathering
  brush('rock', { kind: 'solid', letters: ".,:;", tints: T6.stone, form: 'rock', facetMarks: true, moss: 0.4, jit: 0.08, weather: 0.1, floor: 0.34 });
  // built stone: blocks of uneven width in shape marks – [ ] for the ends, = - _ for the tops by the
  // light, | for tall blocks – and letters only for weathering; joints are ink with moss in them
  brush('brick', { kind: 'solid', letters: ".,:;%&#", tints: T6.brick, form: 'block', shapeMarks: true, moss: 0.3, jit: 0.1, weather: 0.26, jointMoss: 0.18 });
  // wood laid as boards (step 3: a bridge's deck): the brick's blocks in shape marks, in bark's tints, no moss
  // its face is boards' grain (= and -), not the brick's weathering, in pale wood – a deck you can play with reads over the dark
  brush('plank', { kind: 'solid', letters: ".,:;", tints: [mix('ocean', 'beigeDim', 0.6), P.beigeDim, mix('beigeDim', 'beige', 0.35), mix('beigeDim', 'beige', 0.65), P.beige, P.beige], form: 'block', shapeMarks: true, face: true, moss: 0, jit: 0.05, weather: 0, jointMoss: 0, shadowless: true });
  brush('pillar', { kind: 'solid', letters: ".:;!|[]#", tints: T6.pillar, form: 'pillar', moss: 0.25 });
  brush('bark', { kind: 'solid', letters: ".,:;!|()[]", lettersH: ".,:-_=+#", tints: T6.bark, form: 'trunk', follow: true, moss: 0.2, floor: 0.42 });   // floor: wood is never darker than this, so a trunk in shade still reads as wood   // lettersH: for wood lying down
  brush('moon', { kind: 'solid', letters: STONE_L, tints: T6.moon, form: 'dome', facing: [0.25, -0.1, 0.96], moss: 0, shadowless: true });
  // foliage – clumps of small letters, dark where they turn from the moon, on ink; twigs – turned strokes
  brush('foliage', { kind: 'clump', letters: ".,'`:;*oaecsuvwmn&%@8Q0O", tints: T6.leaf });
  brush('twig', { kind: 'twig', tints: T5.bark, follow: true, size: 12, keep: 0.7 });
  // water, air, sky, light – live, never still
  brush('water', { kind: 'water', tints: T5.water });
  brush('mist', { kind: 'air', glyphs: '-', tints: T5.mist, density: 1, drift: 70, far: true, veil: 0.3, lifts: true });   // lifts: lightens what lies under it
  brush('cloud', { kind: 'air', glyphs: "--_-'", tints: T5.cloud, density: 1.1, drift: 26, lift: 2 });
  brush('stars', { kind: 'stars', tints: T5.star, density: 0.05 });
  // the night below the page (step 2, layer 0): fewer, dimmer, teal – far down, never mistaken for a flower
  brush('deep', { kind: 'stars', tints: [mix('ink', 'ocean', 0.8), P.ocean, mix('ocean', 'tealUp', 0.6), P.tealUp, mix('tealUp', 'tealHi', 0.5)], density: 0.06 });
  brush('light', { kind: 'light', label: 'glow', emits: 0.65, motes: 0.012, tints: T5.light });
  brush('beam', { kind: 'light', emits: 0.55, follow: true, marks: 0.3, tints: T5.light });

  // VT323 must have been drawable for a moment before anything is measured, turned or baked: a tile
  // drawn in the fallback font would be kept for good
  let settledAt = 0;
  const fontsSettled = (W) => {
    if (!W.fontReady() || !document.fonts.check('12px VT323')) return false;
    if (!settledAt) settledAt = performance.now();
    return performance.now() - settledAt > 250;
  };
  // every bake is counted, so a timing check can see that none happen after the first loop
  const bakeCount = () => { window.__wkBakes = (window.__wkBakes || 0) + 1; };

  // ── a patch to paint on ─────────────────────────────────────────────────────────────────
  const ORDER = ['grit', 'cover', 'dots', 'solid', 'over', 'twig', 'folInk', 'fol'];
  const CHK = 32;   // live chunks, in px: small, so a passing ring redraws little more than it touches
  function canvas(opt = {}) {
    const tier = typeof opt.tier === 'object' ? opt.tier : TIER[opt.tier || '56K'];
    const det = typeof opt.detail === 'object' ? opt.detail : DETAIL[opt.detail || 'near'];
    const cell = opt.cell || tier.cell;
    const C = { x: opt.x || 0, y: opt.y || 0, cell, cw: Math.round(cell / 2), ch: cell, seed: opt.seed || 1, tier, detail: det };
    const cw = C.cw, ch = C.ch;
    // the world: opt.wind 'world' (windW, at the canvas's world offset wx, wy) and opt.poses – tile mode: marks bucketed
    // into tiles of 128 × 96 px, each baked in the wind poses it needs (opt.band: poses by column, for trees bending whole)
    const WIND = opt.wind === 'world' ? windW : windA, WX = opt.wx || 0, WY = opt.wy || 0, wA = (x, y, t) => WIND(WX + x, WY + y, t);
    const POSES = opt.poses || 0, BAND = !!opt.band;
    let BDPR = opt.bdpr || 1;
    C.cols = opt.cols ?? Math.floor((opt.w || 320) / cw); C.rows = opt.rows ?? Math.floor((opt.h || 160) / ch);
    C.w = C.cols * cw; C.h = C.rows * ch;
    const cols = C.cols, rows = C.rows, N = cols * rows;
    const grid = !tier.loose || !!det.grid;
    const spK = (det.sp || 1) * (tier.sp || 1) * cell / 12, sizeK = cell / 12;
    C.k = 12 / cell;   // cells per 12 px cell: lets a smaller tier paint the same shapes
    const rampN = Math.min(det.ramp, tier.ramp);
    const eS = 12 / cell;
    const layers = new Map(), touchT = new Float32Array(N).fill(-99), touchRG = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) touchRG[i * 2] = -99;
    let tr0 = 1e9, tr1 = -1;
    const ccols = Math.ceil(C.w / CHK), crows = Math.ceil(C.h / CHK), chunkT = new Float32Array(ccols * crows).fill(-99);
    let gen = 0, prepGen = -1, S = null, LS = { ambient: 0.34, lamps: [], actors: [], shade: [], glades: [] }, XS = [], ST = [];
    const frames = new Map();
    let W = null, bakedAll = false, FOG = null, FOGO = {};

    function layer(nm) {
      let L = layers.get(nm);
      if (!L) {
        const b = BRUSHES[nm];
        L = { b, a: new Float32Array(N) };
        if (b.kind === 'solid' || b.kind === 'clump') { L.H = new Float32Array(N); L.NX = new Float32Array(N).fill(NaN); L.NY = new Float32Array(N).fill(NaN); L.J = new Uint8Array(N); }
        if (b.follow) L.D = new Float32Array(N).fill(NaN);
        layers.set(nm, L);
      }
      return L;
    }
    // how far inside a shape a point is, in rows (and for a line: its signed distance and direction)
    const G = { m: 0, e: 0, sd: 0, dir: 0 };
    function measure(sh, x, y) {
      const R = sh.rect || sh.block;
      if (R) { const [c0, r0, c1, r1] = R; G.m = Math.min((x - c0) * 0.5, (c1 - x) * 0.5, y - r0, r1 - y); return; }
      if (sh.disc) { const [cc, rr, rx, ry] = sh.disc; G.e = Math.hypot((x - cc) / rx, (y - rr) / ry); G.m = (1 - G.e) * Math.min(rx * 0.5, ry); return; }
      if (sh.line) {
        const pts = sh.line; let best = 1e9;
        for (let k = 0; k < pts.length - 1; k++) {
          const ax = pts[k][0] * 0.5, ay = pts[k][1], bx = pts[k + 1][0] * 0.5, by = pts[k + 1][1], px = x * 0.5, py = y;
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, f = clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1);
          const qx = px - ax - dx * f, qy = py - ay - dy * f, d = Math.hypot(qx, qy);
          if (d < best) {
            best = d; let a = Math.atan2(dx, -dy); if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
            G.dir = a; G.sd = (Math.cos(a) * qx + Math.sin(a) * qy) >= 0 ? d : -d;
          }
        }
        G.m = (sh.width || 1) / 2 - best; return;
      }
      G.m = sh.fn ? sh.fn(x, y) : -99;
    }
    const maxIn = (sh) => { const R = sh.rect || sh.block; return R ? Math.min((R[2] - R[0]) * 0.25, (R[3] - R[1]) * 0.5) : sh.disc ? Math.min(sh.disc[2] * 0.5, sh.disc[3]) : sh.line ? (sh.width || 1) / 2 : sh.M || 2; };
    // the cells a shape can touch, so painting a twig doesn't visit the whole patch
    function bounds(sh, pr) {
      let b; const R = sh.rect || sh.block;
      if (R) b = [R[0] - 2 * pr, R[1] - pr, R[2] + 2 * pr, R[3] + pr];
      else if (sh.disc) { const [cc, rr, rx, ry] = sh.disc; b = [cc - rx - 2 * pr, rr - ry - pr, cc + rx + 2 * pr, rr + ry + pr]; }
      else if (sh.line) { let a = 1e9, e = 1e9, f = -1e9, d = -1e9; for (const [x, y] of sh.line) { a = Math.min(a, x); e = Math.min(e, y); f = Math.max(f, x); d = Math.max(d, y); } const w = (sh.width || 1) / 2 + pr; b = [a - 2 * w, e - w, f + 2 * w, d + w]; }
      else b = sh.bbox || [0, 0, cols, rows];
      return [Math.max(0, Math.floor(b[0])), Math.max(0, Math.floor(b[1])), Math.min(cols - 1, Math.ceil(b[2])), Math.min(rows - 1, Math.ceil(b[3]))];
    }

    // the form of a solid at a cell: a height in px, and a facing (NaN: work it out from the heights)
    function form(b, sh, c, r, M) {
      const x = (c + 0.5) * cw, y = (r + 0.5) * ch;
      switch (b.form) {
        case 'dome': {
          if (sh.disc) { const ry = sh.disc[3]; return { h: (Math.sqrt(Math.max(0, 1 - G.e * G.e * 0.9)) + (vnoise(x / 26, y / 18, C.seed + 1) - 0.5) * 0.32) * ry * ch * 1.1, nx: NaN, ny: NaN }; }
          const Mc = Math.min(M, 3), u = clamp(G.m / Mc, 0, 1);
          return { h: (Math.sqrt(1 - (1 - u) * (1 - u)) + (vnoise(x / 26, y / 18, C.seed + 1) - 0.5) * 0.32) * Mc * ch * 1.1, nx: NaN, ny: NaN };
        }
        case 'block': {
          // a block of built stone: its ends, its top turned up to the moon, its face below.
          // codes: 1 joint (ink) · 2 top · 3 [ · 4 ] · 5 6 | (a tall block's lower ends) · 7 face · 8 / 9 \ (an arch's ring)
          if (sh.core) return { h: 1, nx: 0, ny: 0, code: 1 };
          if (sh.arch) {
            const [ax, ay] = sh.arch, th = Math.atan2((c + 0.5 - ax) * 0.5, -(r + 0.5 - ay)), at = Math.abs(th);
            return { h: 7, nx: Math.sin(th) * 0.55, ny: -Math.cos(th) * 0.55, code: at < 0.42 ? 2 : at > 1.22 ? (th < 0 ? 3 : 4) : th < 0 ? 8 : 9 };
          }
          const B = sh.block || sh.rect, k = c - Math.floor(B[0]), wc = Math.round(B[2] - B[0]), top = r <= Math.floor(B[1]);
          const tilt = (hash(Math.round(B[0]), Math.round(B[1]), C.seed + 3) - 0.5) * 0.5, end = k <= 0 ? 3 : k >= wc - 1 ? 4 : 0;
          return { h: 6 + (sh.z || 0), nx: tilt + (end === 3 ? -0.45 : end === 4 ? 0.35 : 0), ny: top ? -0.55 : 0.25, code: end ? (top ? end : end + 2) : top ? 2 : 7 };
        }
        case 'rock': {
          // a boulder in facets: the cell belongs to the nearest facet seed; where two seeds are nearly as near, a joint (ink)
          const [cc, rr, rx, ry] = sh.disc || [c, r, 2, 1], F = sh.facets || [[cc, rr]];
          let d1 = 1e9, d2 = 1e9, k1 = 0;
          for (let k = 0; k < F.length; k++) { const d = Math.hypot((c + 0.5 - F[k][0]) * 0.5, r + 0.5 - F[k][1]); if (d < d1) { d2 = d1; d1 = d; k1 = k; } else if (d < d2) d2 = d; }
          const ex = (c + 0.5 - cc) / rx, ey = (r + 0.5 - rr) / ry, e = Math.min(1, Math.hypot(ex, ey));
          if (F.length > 1 && d2 - d1 < 0.42) return { h: (1 - e * 0.5) * ry * ch, nx: 0, ny: 0, code: 1 };
          const fx = (F[k1][0] - cc) / rx, fy = (F[k1][1] - rr) / ry;
          let nx = fx * 0.75 + ex * 0.4, ny = fy * 0.75 + ey * 0.45 - 0.18; const nn = Math.hypot(nx, ny); if (nn > 0.92) { nx *= 0.92 / nn; ny *= 0.92 / nn; }
          return { h: Math.sqrt(Math.max(0, 1 - e * e * 0.85)) * ry * ch * 1.2 + 2, nx, ny, code: 0 };
        }
        case 'pillar': {
          const [c0, r0, c1, r1] = sh.rect || [c - 2, r - 4, c + 2, r + 4], cx = (c0 + c1) / 2, hw = Math.max(1, (c1 - c0) / 2), u = clamp((c + 0.5 - cx) / hw, -1, 1);
          if (r < r0 + 1.5) return { h: hw * cw, nx: u * 0.5, ny: -0.75 };
          if (r > r1 - 1.5) return { h: hw * cw, nx: u * 0.6, ny: -0.35 };
          return { h: Math.sqrt(1 - u * u) * hw * cw, nx: u * 0.85 + (c % 2 ? 0.18 : -0.18), ny: -0.08 };
        }
        case 'trunk': {
          const hw = (sh.width || 1) / 2, u = clamp(G.sd / hw, -1, 1), a = G.dir;
          const along = c * 0.5 * Math.sin(a) - r * Math.cos(a), across = c * 0.5 * Math.cos(a) + r * Math.sin(a);
          const grain = (vnoise(across * 3, along * 0.4, C.seed + 5) - 0.5) * 0.5;
          return { h: Math.sqrt(1 - u * u) * hw * ch, nx: Math.cos(a) * u * 0.9 + grain, ny: Math.sin(a) * u * 0.9 };
        }
        case 'clump': default: {
          if (!sh.disc) return { h: 1, nx: 0, ny: 0 };
          const [cc, rr, rx, ry] = sh.disc, ex = (c + 0.5 - cc) / rx, ey = (r + 0.5 - rr) / ry;
          let nx = ex * 0.85, ny = ey * 0.85;
          // in a crown, each clump is round and the crown as a whole turns to the moon
          if (sh.crown) {
            const [kc, kr, krx, kry] = sh.crown, kx = clamp((c + 0.5 - kc) / krx, -1.2, 1.2), ky = clamp((r + 0.5 - kr) / kry, -1.2, 1.2);
            nx = ex * 0.5 + kx * 0.55; ny = ey * 0.5 + ky * 0.55 + (sh.dim || 0);
          }
          const nn = Math.hypot(nx, ny); if (nn > 0.95) { nx *= 0.95 / nn; ny *= 0.95 / nn; }
          return { h: (Math.sqrt(Math.max(0, 1 - ex * ex - ey * ey)) + 1) * ry * ch + (sh.z || 0) * 1000, nx, ny };
        }
      }
    }

    C.paint = (name, shape, amt = 1) => {
      if (Array.isArray(shape)) { shape.forEach((s) => C.paint(name, s, amt)); return C; }
      const names = name === '*' ? [...layers.keys()] : [name];
      for (const nm of names) {
        const b = BRUSHES[nm];
        if (!b) throw new Error('no brush ' + nm);
        const L = layer(nm);
        const edge = Math.max(0.3, shape.edge ?? b.edge) * eS, rough = shape.rough ?? b.ragged, ns = (shape.seed || 0) + C.seed * 7, M = maxIn(shape);
        const bb = bounds(shape, edge * (1.5 + Math.abs(rough)) + 1);
        if (shape.band) { bb[1] = Math.max(bb[1], shape.band[0]); bb[3] = Math.min(bb[3], shape.band[1] - 1); if (bb[1] > bb[3]) continue; }   // step 3 r2: paint a shape a band of rows at a time
        if (shape.sway && !L.SW) { L.SW = new Float32Array(N); L.SX = new Float32Array(N); }
        if (shape.bloom && !L.BL) L.BL = new Float32Array(N);
        const sx = shape.swayX ?? 0;
        for (let r = bb[1]; r <= bb[3]; r++) for (let c = bb[0]; c <= bb[2]; c++) {
          measure(shape, c + 0.5, r + 0.5);
          let m = G.m;
          if (m < -edge * 1.5) continue;
          m += (vnoise(c * 0.3, r * 0.6, ns) - 0.5) * edge * rough;
          const w = clamp(0.5 + m / edge, 0, 1);
          if (w <= 0) continue;
          const i = r * cols + c;
          L.a[i] = clamp(L.a[i] + w * amt, 0, 2);
          if (amt > 0 && w > 0.2) {
            if (L.D) L.D[i] = G.dir;
            if (L.H) {
              const f = form(b, shape, c, r, M);
              if (f.h >= L.H[i]) {
                L.H[i] = f.h; L.NX[i] = f.nx; L.NY[i] = f.ny; L.J[i] = f.code ?? 0;
                if (L.SW) { L.SW[i] = shape.sway || 0; L.SX[i] = sx; }
                if (L.BL) L.BL[i] = shape.bloom || 0;
              }
            } else if (L.SW && shape.sway > L.SW[i]) { L.SW[i] = shape.sway; L.SX[i] = sx; }
          }
        }
        if (b.with && name !== '*' && !shape.alone) for (const [n2, k] of b.with) C.paint(n2, shape, amt * k);
      }
      gen++;
      return C;
    };
    // the scene's fog mask (lib/layers.js): fn(X, Y, wet, hole) in stage px → a density, added to any mist brush
    // (o.ink: lift the ink behind solids too – off by default, it reads as pale blocks; o.streaks: how many, 0.45)
    C.fog = (fn, o = {}) => { FOG = fn; FOGO = o; gen++; return C; };
    C.clear = () => { layers.clear(); XS = []; ST = []; gen++; return C; };
    C.light = (spec) => { LS = { ...LS, ...spec }; gen++; return C; };
    C.shadeAdd = (e) => { XS.push(e); gen++; return C; };
    C.stamp = (kind, c, r) => { ST.push({ kind, c, r }); gen++; return C; };
    C.has = (name) => layers.has(name);
    C.weight = (name, c, r) => { const L = layers.get(name); return L && c >= 0 && r >= 0 && c < cols && r < rows ? L.a[r * cols + c] : 0; };
    // a walker brushing through: the blades under it lean the way it goes (and aside, walking up or down the screen), all
    // the way in its inner half and less out to its edge, and spring back behind it – a path through the grass, not a disc
    // cleared round it (a touch leaned every blade in its reach all the way, and the walker carried a ring of parted
    // grass about). The lean is kept signed in touchRG (its size: how hard); a weaker brush doesn't undo a stronger one
    C.touch = (c, r, t, rad = 3, hx = 0) => {
      for (let rr = Math.floor(r - rad / 1.8); rr <= r + rad / 1.8; rr++) for (let cc = Math.floor(c - rad); cc <= c + rad; cc++) {
        const d = Math.hypot(cc - c, (rr - r) * 1.8) / rad;
        if (cc >= 0 && rr >= 0 && cc < cols && rr < rows && d <= 1) {
          const i = rr * cols + cc, s = Math.min(1, (1 - d) * 2), was = Math.abs(touchRG[i * 2 + 1]) * (1 - springAt(t - touchRG[i * 2]));
          if (s < was) continue;
          touchT[i] = t; touchRG[i * 2] = t; touchRG[i * 2 + 1] = Math.max(-1, Math.min(1, hx * 0.85 + (cc >= c ? 1 : -1) * (1 - Math.abs(hx)) * 0.7)) * s;
          if (rr < tr0) tr0 = rr; if (rr + 1 > tr1) tr1 = rr + 1;
          const k = Math.floor((rr * ch) / CHK) * ccols + Math.floor((cc * cw) / CHK);
          if (t - chunkT[k] > 1.15) C.acts++;   // a chunk that wasn't live becomes live: the world redraws at once
          chunkT[k] = t;
        }
      }
    };
    C.acts = 0;
    C.cellAt = (px, py) => [Math.floor((px - C.x) / cw), Math.floor((py - C.y) / ch)];
    C.contains = (px, py) => px >= C.x && py >= C.y && px < C.x + C.w && py < C.y + C.h;

    // ── tints through the budget and the tier: capped steps, or the greens of the slow lines
    const MONO2 = [P.phosphorDim, P.phosphor], MONO3 = [mix('ink', 'phosphorDeep', 0.8), P.phosphorDim, P.phosphor];
    function tint(T, idx) {
      const n = T.length; idx = clamp(Math.round(idx), 0, n - 1);
      const m = Math.min(rampN, n);
      if (m < n) idx = Math.round(Math.round(idx * (m - 1) / (n - 1)) * (n - 1) / (m - 1));
      if (tier.color) return T[idx];
      const M = rampN <= 2 ? MONO2 : MONO3;
      return idx === 0 ? mix('ink', 'phosphorDeep', 0.6) : M[Math.min(M.length - 1, Math.floor(idx / n * M.length))];
    }
    // mist lightens: everything under it is lifted toward the pale teal, one of three steps
    const LM = [null, new Map(), new Map(), new Map()];
    const lift = (col, i) => { const k = S.mist[i]; if (!k || !tier.color) return col; let v = LM[k].get(col); if (!v) { v = mix(col, MISTC, LIFT[k]); LM[k].set(col, v); } return v; };
    const tintAt = (T, idx, i) => lift(tint(T, idx), i);
    // the ink behind a solid (a rock's body, the dark of a crown) is ink: lifted by mist only when a fog asks for it
    // (o.ink) – lifted by default it read as pale grey blocks once the GPU drew the fills solid
    const inkAt = (i) => (S.mist[i] && tier.color && FOG && FOGO.ink ? mix('ink', MISTC, LIFTI[S.mist[i]]) : P.ink);

    // ── prepare: light, solids, shadows, then every mark, once per paint
    // step 3 r2: prepare in slices – prepG() yields at row boundaries once the slice's time (DEAD) is up
    let DEAD = Infinity, PG = null;
    const slow = () => performance.now() > DEAD;
    function prep() { DEAD = Infinity; PG = null; const it = prepG(); while (!it.next().done); }
    function* prepG() {
      const myGen = gen; frames.clear(); bakedAll = false; if (TILES) { memDrop(TILES.flatMap((T) => T.im.filter(Boolean))); TILES = null; } WG = null;
      window.__wkPreps = (window.__wkPreps || 0) + 1;
      const list = [...layers.values()], solids = list.filter((L) => L.b.kind === 'solid');
      S = { solid: new Int16Array(N).fill(-1), sh: new Uint8Array(N), L: new Float32Array(N), ch: new Array(N), lit: new Float32Array(N), T: new Array(N), wet: new Uint8Array(N),
        fol: new Array(N), folLit: new Float32Array(N), cov: new Uint8Array(N), mist: new Uint8Array(N), hole: new Uint8Array(N), lip: new Uint8Array(N), holePath: null,
        items: Object.fromEntries(ORDER.map((k) => [k, []])), chunks: [], water: [], air: [], stars: [], marks: [] };
      const lampsL = LS.lamps.map((l) => ({ x: l.x - C.x, y: l.y - C.y, rad: l.rad || 300, k: l.k ?? 0.95 }));
      const lampK = (x, y, l) => Math.max(0, 1 - Math.hypot(x - l.x, (y - l.y) * 1.5) / l.rad);
      const isSolid = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && S.solid[r * cols + c] >= 0;
      // 1 · which solid owns each cell (ragged at the edge)
      for (let i = 0; i < N; i++) {
        if (i % cols === 0 && slow()) yield; let best = -1, bw = 0;
        solids.forEach((L, k) => { if (L.a[i] > bw) { bw = L.a[i]; best = k; } });
        if (best >= 0 && bw > 0.5 + (hash(i % cols, (i / cols) | 0, 77) - 0.5) * 0.5) S.solid[i] = best;
      }
      // 1b · ditches: open cells (1) and their walls (2); the open cells become a clip path for the layers below
      const ditchL = layers.get('ditch');
      if (ditchL) {
        for (let i = 0; i < N; i++) if (S.solid[i] < 0 && ditchL.a[i] > 0.5) S.hole[i] = 1;
        const H0 = S.hole.slice(), out = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !H0[r * cols + c];
        for (let i = 0; i < N; i++) if (H0[i]) { const c = i % cols, r = (i / cols) | 0; if (out(c - 1, r) || out(c + 1, r) || out(c, r - 1)) S.hole[i] = 2; }
        const hp = new Path2D();
        for (let r = 0; r < rows; r++) { let a = -1; for (let c = 0; c <= cols; c++) { const o = c < cols && S.hole[r * cols + c] === 1; if (o && a < 0) a = c; if (!o && a >= 0) { hp.rect(C.x + a * cw, C.y + r * ch, (c - a) * cw, ch); a = -1; } } }
        S.holePath = hp;
      }
      // 2 · cast shadows: every solid cell slides its height away from the moon, along the ground;
      //     then the shadows that were laid on by hand (a crown's, a wall's, harold's)
      for (let i = 0; i < N; i++) {
        if (i % cols === 0 && slow()) yield; const k = S.solid[i]; if (k < 0) continue;
        const L = solids[k]; if (L.b.shadowless) continue;
        const h = L.H[i]; if (h < 3) continue;
        const c = i % cols, r = (i / cols) | 0, x = (c + 0.5) * cw, y = (r + 0.5) * ch, n = Math.min(50, Math.ceil(h * 1.3 / 4));
        for (let s = 1; s <= n; s++) {
          const cc = Math.floor((x + SHADOW[0] * s * 4) / cw), rr = Math.floor((y + SHADOW[1] * s * 4) / ch);
          if (cc >= 0 && rr >= 0 && cc < cols && rr < rows && S.solid[rr * cols + cc] < 0) S.sh[rr * cols + cc] = 1;
        }
      }
      for (const e of [...LS.shade, ...XS]) {
        if (slow()) yield;
        if (e.fn) {
          const bb = e.bbox || [0, 0, cols, rows];
          for (let r = Math.max(0, Math.floor(bb[1])); r < Math.min(rows, bb[3]); r++) for (let c = Math.max(0, Math.floor(bb[0])); c < Math.min(cols, bb[2]); c++) if (e.fn(c + 0.5, r + 0.5)) S.sh[r * cols + c] = 1;
          continue;
        }
        const ca = Math.max(0, Math.floor((e.x - e.rx - C.x) / cw)), cb = Math.min(cols - 1, Math.ceil((e.x + e.rx - C.x) / cw));
        const ra = Math.max(0, Math.floor((e.y - e.ry - C.y) / ch)), rb = Math.min(rows - 1, Math.ceil((e.y + e.ry - C.y) / ch));
        for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) {
          const x = C.x + (c + 0.5) * cw, y = C.y + (r + 0.5) * ch;
          if (((x - e.x) / e.rx) ** 2 + ((y - e.y) / e.ry) ** 2 < 1 + (hash(c, r, 79) - 0.5) * 0.35) S.sh[r * cols + c] = 1;
        }
      }
      // 3 · the light field: moonlight that shadows take away, the lamps' pools, and light brushes
      const emit = list.filter((L) => L.b.kind === 'light');
      for (let i = 0; i < N; i++) {
        if (i % cols === 0 && slow()) yield; const c = i % cols, r = (i / cols) | 0, x = (c + 0.5) * cw, y = (r + 0.5) * ch;
        let l = LS.ambient * (1 - 0.75 * S.sh[i]);
        for (const lp of lampsL) l += 0.95 * lp.k * Math.pow(lampK(x, y, lp), 1.3);
        for (const L of emit) l += Math.min(1, L.a[i]) * L.b.emits;
        S.L[i] = l;
      }
      // step 3: the moon lights solids as much as the night's moonlight allows (1 at the brush cards' 0.34) – in a room's
      // low moon the trees and stones go dim and the pools of light are the big lights
      const MK = clamp(LS.ambient / 0.34, 0.3, 1) ** 0.8;
      const facing = (nx, ny, F) => { const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny)), n = Math.hypot(nx, ny, nz); return Math.max(0, (nx * F[0] + ny * F[1] + nz * F[2]) / n); };
      const lampFace = (nx, ny, x, y) => {
        let s = 0;
        for (const lp of lampsL) {
          const k = lampK(x, y, lp); if (!k) continue;
          const v = [lp.x - x, lp.y - 80 - y, 90], vn = Math.hypot(...v), nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny)), n = Math.hypot(nx, ny, nz);
          s += Math.max(0, (nx * v[0] + ny * v[1] + nz * v[2]) / (vn * n)) * k * 1.6;
        }
        return s;
      };
      const push = (layerName, it) => {
        const k = Math.floor(clamp(it.y, 0, C.h - 1) / CHK) * ccols + Math.floor(clamp(it.x, 0, C.w - 1) / CHK);
        S.items[layerName].push(it);
        const ck = S.chunks[k] || (S.chunks[k] = Object.fromEntries(ORDER.map((n) => [n, []])));
        ck[layerName].push(it);
      };
      // water: which cells, and how deep under their column's surface
      for (const L of list.filter((L) => L.b.kind === 'water')) for (let c = 0; c < cols; c++) {
        if (slow()) yield;
        let run = 0;
        for (let r = 0; r < rows; r++) {
          const i = r * cols + c, inW = S.solid[i] < 0 && L.a[i] > 0.3 + (hash(c, r, 31) - 0.5) * 0.3;
          run = inW ? run + 1 : 0;
          if (inW) { S.wet[i] = 1; S.water.push({ i, c, r, x: (c + 0.5) * cw, y: (r + 0.5) * ch, d: run - 1, b: L.b }); const q = S.wbox || (S.wbox = [1e9, 1e9, -1e9, -1e9]); q[0] = Math.min(q[0], c * cw); q[1] = Math.min(q[1], r * ch); q[2] = Math.max(q[2], (c + 1) * cw); q[3] = Math.max(q[3], (r + 1) * ch); }
        }
      }
      // mist: banks drawn out sideways, thicker far (the top of the patch) and low over water
      const mists = list.filter((L) => L.b.lifts);
      if (mists.length || FOG) for (let i = 0; i < N; i++) {
        if (i % cols === 0 && slow()) yield; 
        const c = i % cols, r = (i / cols) | 0, X = C.x + (c + 0.5) * cw, Y = C.y + (r + 0.5) * ch; let m = FOG ? FOG(X, Y, S.wet[i], S.hole[i]) : 0;
        for (const L of mists) {
          const w = Math.min(1, L.a[i]); if (w < 0.02) continue;
          const bank = 0.42 + clamp((vnoise(X / 300, Y / 30, 31) - 0.25) * 2.2, 0, 1) * 0.42 + vnoise(X / 70, Y / 13, 32) * 0.24;
          m += w * bank * (L.b.far ? 0.45 + 0.95 * (1 - r / rows) : 1) * (S.wet[i] ? 1.5 : 1);
        }
        S.mist[i] = m < 0.17 ? 0 : m < 0.38 ? 1 : m < 0.62 ? 2 : 3;
      }
      const mossL = layers.get('moss');
      // 4 · the solids' letters: chosen here, once, by facing the moon; the tint carries all the light
      const shapeMark = (b, code, v, c, r) => {
        switch (code) {
          case 1: return '';
          case 2: return v > 0.52 ? '=' : v > 0.24 ? '-' : '_';
          case 3: return '['; case 4: return ']';
          case 5: case 6: return '|';
          case 8: return '/'; case 9: return '\\';
          default: {
            if (b.face) return v > 0.3 ? '=' : '-';
            if (hash(c, r, b.id + 7) >= b.weather) return '_';
            const R = ramp(b.letters, 5), band = R[Math.min(R.length - 1, Math.floor(v * R.length))];
            return band[Math.floor(hash(r, c, b.id + 8) * band.length)];
          }
        }
      };
      const facetMark = (b, code, nx, ny, v, c, r) => {
        if (code === 1) return '';
        if (hash(c, r, b.id + 7) < b.weather) { const R = ramp(b.letters, 3), band = R[Math.min(R.length - 1, Math.floor(v * R.length))]; return band[Math.floor(hash(r, c, b.id + 8) * band.length)]; }
        if (ny < -0.28 && Math.abs(nx) < 0.5) return v > 0.5 ? '=' : v > 0.26 ? '-' : '_';
        if (nx < -0.42) return ny < 0.2 ? '/' : '(';
        if (nx > 0.42) return ny < 0.2 ? '\\' : ')';
        return ny > 0.18 ? (v > 0.22 ? '|' : ':') : v > 0.45 ? '=' : '-';
      };
      for (let i = 0; i < N; i++) {
        if (i % cols === 0 && slow()) yield; const k = S.solid[i]; if (k < 0) continue;
        const L = solids[k], b = L.b, c = i % cols, r = (i / cols) | 0, x = (c + 0.5) * cw, y = (r + 0.5) * ch;
        let nx = L.NX[i], ny = L.NY[i];
        if (isNaN(nx)) {
          const Hh = (cc, rr) => L.H[clamp(rr, 0, rows - 1) * cols + clamp(cc, 0, cols - 1)];
          nx = -(Hh(c + 1, r) - Hh(c - 1, r)) / (2 * cw); ny = -(Hh(c, r + 1) - Hh(c, r - 1)) / (2 * ch);
          const n = Math.hypot(nx, ny, 1); nx /= n; ny /= n;
        }
        const moon = facing(nx, ny, b.facing || MOON);
        const v = clamp(moon * 1.05 - 0.12 + (hash(c, r, b.id) - 0.5) * (b.jit ?? 0.12), 0, 0.999);
        const edge = !isSolid(c, r + 1) || !isSolid(c + 1, r) || !isSolid(c - 1, r);
        const mossy = (edge && ny > 0.1 && hash(c, r, 11) < b.moss) || (mossL && mossL.a[i] > 0.35 && hash(c, r, 12) < mossL.a[i]);
        let chr;
        if (b.facetMarks) chr = facetMark(b, L.J[i], nx, ny, v, c, r);
        else if (b.shapeMarks) chr = shapeMark(b, L.J[i], v, c, r);
        else {
          const R = ramp(b.lettersH && L.D && Math.abs(L.D[i]) > 0.8 ? b.lettersH : b.letters);
          const band = R[Math.min(R.length - 1, 1 + Math.floor(v * (R.length - 1)))];
          chr = band[Math.floor(hash(r, c, b.id + 3) * band.length)];
        }
        const lit = b.facing ? 0.2 + moon * 0.9 : 0.12 * MK + moon * 0.85 * MK + lampFace(nx, ny, x, y) - 0.25 * S.sh[i];
        const T = mossy ? (b.mossT || (b.mossT = MOSSY(b.tints))) : b.tints;
        S.ch[i] = chr; S.lit[i] = lit; S.T[i] = T;
        const jm = !chr && (mossy || hash(c, r, 19) < (b.jointMoss ?? 0.2) * (mossL ? 1 + mossL.a[i] : 1));
        push('solid', { x, y, c, r, i, ch: chr, joint: !chr, ink: inkAt(i), sw: L.SW ? L.SW[i] : 0, sx: L.SX ? L.SX[i] : 0,
          c0: tintAt(T, Math.max(lit, b.floor || 0) * 5.2, i), c1: tintAt(T, (Math.max(lit, b.floor || 0) + 0.35) * 5.2, i),
          moss: jm ? (hash(c, r, 20) < 0.5 ? ',' : "'") : '', mc: jm ? tintAt(T5.moss, step(S.L[i]) + 1, i) : '' });
      }
      // the ditch's walls: dug earth on ink. East wall faces the moon (lit), west wall turns away, the far wall's face is seen
      if (ditchL) for (let i = 0; i < N; i++) {
        if (i % cols === 0 && slow()) yield;
        if (S.hole[i] !== 2) continue;
        const c = i % cols, r = (i / cols) | 0, st = step(S.L[i]), u = hash(c, r, 88);
        const oc = (cc, rr) => cc >= 0 && rr >= 0 && cc < cols && rr < rows && !S.hole[rr * cols + cc];
        const east = oc(c + 1, r), west = oc(c - 1, r), far = oc(c, r - 1);
        // step 3: a dark cut – only the wall that faces the moon is lit; the others are mostly ink
        if (!east && u < (far ? 0.35 : 0.6)) { push('solid', { x: (c + 0.5) * cw, y: (r + 0.5) * ch, c, r, i, ch: '', joint: true, ink: inkAt(i), sw: 0, sx: 0, c0: '', c1: '', moss: '', mc: '' }); continue; }
        const chr = east ? (u < 0.45 ? '|' : u < 0.75 ? '!' : ':') : west ? (u < 0.8 ? '.' : ':') : far ? (u < 0.7 ? '-' : '_') : '.';
        const ti = east ? st + 3 : far ? st : st - 1;
        push('solid', { x: (c + 0.5) * cw, y: (r + 0.5) * ch, c, r, i, ch: chr, joint: false, ink: inkAt(i), sw: 0, sx: 0, c0: tintAt(T5.dug, ti, i), c1: tintAt(T5.dug, ti + 1, i), moss: '', mc: '' });
      }
      // the cut's lips: the ground's edge is drawn as a line on ink – bright along the far rim and where the moon
      // reaches over the west bank onto the east wall, dimmer along the near and west rims
      if (ditchL) for (let i = 0; i < N; i++) {
        if (i % cols === 0 && slow()) yield;
        if (S.hole[i] || S.solid[i] >= 0) continue;
        const c = i % cols, r = (i / cols) | 0, hl = (cc, rr) => cc >= 0 && rr >= 0 && cc < cols && rr < rows && S.hole[rr * cols + cc];
        const below = hl(c, r + 1), above = hl(c, r - 1), left = hl(c - 1, r), right = hl(c + 1, r);
        if (!below && !above && !left && !right) continue;
        S.lip[i] = 1;
        const st = step(S.L[i]), chr = below ? '_' : left ? '|' : right ? ':' : '-', ti = below ? st + 3 : left ? st + 2 : st + 1;
        push('solid', { x: (c + 0.5) * cw, y: (r + 0.5) * ch, c, r, i, ch: chr, joint: false, ink: inkAt(i), sw: 0, sx: 0, c0: tintAt(T5.dug, ti, i), c1: tintAt(T5.dug, ti + 1, i), moss: '', mc: '' });
      }
      // ground cover: one stroke, ready to stamp (its turned tiles by tint, one per segment)
      const coverItem = (layerName, b, px, py, i, a0, ti, size, segs, sgn, wk) => {
        const ids = (rg) => { const o = []; for (let j = 0; j < segs; j++) o.push(cid(b.glyph, tintAt(b.tints, ti + rg - (segs - 1 - j) * 0.6, i))); return o; };
        const c = Math.floor(px / cw), r = Math.floor(py / ch);
        const gch = b.glyph === "'" ? "'" : Math.abs(a0) > 1 ? '-' : a0 > 0.3 ? '/' : a0 < -0.3 ? '\\' : '|';
        push(layerName, { x: grid ? (c + 0.5) * cw : px, y: grid ? (r + 0.5) * ch : py, i, b, a: a0, gch: grid ? gch : '', ti, segs, wk,
          ids0: ids(0), ids1: ids(1), c0: tintAt(b.tints, ti, i), c1: tintAt(b.tints, ti + 1, i), size, sgn, wt: -1, wa: 0 });
      };
      // grit: soil. Pebbles first (each with its shadow: a gap in the grains to its lower right),
      // then the grains themselves, loose, lighter than the grass; ruts and paw prints are pressed in
      const grits = list.filter((L) => L.b.kind === 'grit');
      const rutL = layers.get('rut');
      const stamps = ST.map((s) => ({ ...s, x: (s.c + 0.5) * cw, y: (s.r + 0.5) * ch }));
      const pressed = (x, y) => { for (const s of stamps) if (Math.hypot(x - s.x, (y - s.y) * 1.3) < 11 * sizeK) return true; return false; };
      if (grits.length) {
        const noG = new Uint8Array(N), gOf = new Array(N), gW = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          if (i % cols === 0 && slow()) yield; if (S.solid[i] >= 0 || S.wet[i] || S.hole[i] || S.lip[i]) continue;
          let G2 = null, gw = 0; for (const L of grits) if (L.a[i] > gw) { gw = L.a[i]; G2 = L; }
          if (G2 && gw > 0.05) { gOf[i] = G2.b; gW[i] = gw; }
        }
        const gItem = (x, y, i, b, chr, ti, sz, ang, u) => push('grit', { x, y, i, b, ch: chr, sz, ang, u, c0: tintAt(b.tints, ti, i), c1: tintAt(b.tints, ti + 1, i) });
        for (let i = 0; i < N; i++) {
          if (i % cols === 0 && slow()) yield; const b = gOf[i]; if (!b) continue;
          const c = i % cols, r = (i / cols) | 0;
          if (hash(c, r, 14) >= b.pebble * Math.min(1, gW[i]) * (grid ? 0.5 : 1)) continue;
          const st = step(S.L[i]), u = hash(r, c, 15), x = grid ? (c + 0.5) * cw : (c + 0.3 + u * 0.4) * cw, y = (r + 0.5) * ch, big = u < 0.25;
          noG[i] = 1; if (c + 1 < cols) noG[i + 1] = 1;
          push('dots', { x, y, i, ch: big ? 'O' : 'o', lift: 0, toss: 0.6, u, size: (big ? 12 : 10) * sizeK, c0: tintAt(T5.pebble, st + 1, i), c1: tintAt(T5.pebble, st + 2, i) });
          if (!grid) push('dots', { x: x - 1.6 * sizeK, y: y - 2.6 * sizeK, i, ch: "'", lift: 0, toss: 0.6, u, size: 8 * sizeK, c0: tintAt(T5.pebble, st + 3, i), c1: tintAt(T5.pebble, 4, i) });
        }
        for (let i = 0; i < N; i++) {
          if (i % cols === 0 && slow()) yield; const b = gOf[i]; if (!b) continue;
          const c = i % cols, r = (i / cols) | 0, gw = Math.min(1, gW[i]), st = step(S.L[i]);
          const rw = rutL ? rutL.a[i] : 0;
          if (rw > 0.5) { if (hash(c, r, 16) < 0.1) gItem((c + 0.5) * cw, (r + 0.5) * ch, i, b, '.', st - 1, 9 * sizeK, 0, 0.5); continue; }
          if (rw > 0.08) {   // the rut's lips: the upper one catches the moon, the lower one is dim
            const up = r + 1 < rows && rutL.a[i + cols] > rw, n = grid ? 1 : 3;
            for (let k = 0; k < n; k++) gItem(grid ? (c + 0.5) * cw : (c + (k + 0.5) / n) * cw, (r + (up ? 0.7 : 0.3)) * ch, i, b, up ? '_' : '-', up ? st + (b.lift || 0) + 1 : st, 12 * sizeK, 0, 0.5);
            continue;
          }
          if (noG[i] && !grid) continue;
          const n = b.keep * gw * (grid ? 1 : b.per) * [0.45, 0.65, 0.85, 1, 1][st];
          let cnt = Math.floor(n); if (hash(c, r, 12) < n - cnt) cnt++;
          if (grid) cnt = Math.min(1, cnt);
          for (let k = 0; k < cnt; k++) {
            const u = hash(r + k * 13, c, 13), x = grid ? (c + 0.5) * cw : (c + hash(c + k * 7, r, 18)) * cw, y = grid ? (r + 0.5) * ch : (r + hash(c, r + k * 5, 19)) * ch;
            if (stamps.length && pressed(x, y)) continue;
            const chr = b.glyphs[Math.floor(hash(c + k, r, 14) * b.glyphs.length)];
            const sz = grid ? ch : (b.gsize[0] + hash(c, r + k, 20) * (b.gsize[1] - b.gsize[0])) * sizeK;
            gItem(x, y, i, b, chr, st + (b.lift || 0) + (u > 0.85 ? 1 : 0) - (u < 0.12 ? 1 : 0), sz, grid ? 0 : (hash(k, c, r) - 0.5) * 0.5, u);
          }
          // the ragged edge: tufts grow in where the soil thins out into the grass
          if (!grid && b.tufts && gW[i] < 0.85 && gW[i] > 0.15 && hash(c, r, 17) < b.tufts) {
            const gb = BRUSHES.grass, x = (c + 0.5) * cw, y = (r + 0.8) * ch;
            for (let k = -1; k <= 1; k++) coverItem('cover', gb, x + k * 1.5 * sizeK, y, i, k * 0.42 + (hash(c, r, 21) - 0.5) * 0.3, clamp(st + (k ? 0 : 1), 0, 4), Math.round((k ? 10 : 13) * sizeK), 1, k || 1, 1);
          }
        }
        // paw prints: the grains are gone round them; the print is a dim pad and three toes
        for (const s of stamps) {
          if (S.hole[clamp(Math.floor(s.r), 0, rows - 1) * cols + clamp(Math.floor(s.c), 0, cols - 1)]) continue;
          const i = clamp(Math.floor(s.r), 0, rows - 1) * cols + clamp(Math.floor(s.c), 0, cols - 1), st = step(S.L[i]), k = sizeK;
          const pt = (dx, dy, chr, sz) => push('dots', { x: s.x + dx * k, y: s.y + dy * k, i, ch: chr, lift: 0, toss: 0.3, u: 0.5, size: sz * k, c0: tintAt(T5.soil, st + 2, i), c1: tintAt(T5.soil, st + 3, i) });
          pt(0, 1.5, 'o', 11); pt(-4, -3.6, '.', 12); pt(0, -5.6, '.', 12); pt(4, -3.6, '.', 12);
        }
      }
      // ground cover: strokes on a jittered sub-grid, the brush picked by dithered weight
      const covers = list.filter((L) => L.b.kind === 'cover');
      const actorsL = LS.actors.map((a) => ({ x: a.x - C.x, y: a.y - C.y, rx: a.rx || 34, ry: a.ry || 26, push: a.push ?? 46 }));
      const clearAt = (x, y) => actorsL.some((a) => ((x - a.x) / a.rx) ** 2 + ((y - a.y) / a.ry) ** 2 < 1);
      const pushAt = (x, y) => { let p = 0; for (const a of actorsL) { const d = Math.hypot(x - a.x, (y - a.y) * 1.6); if (d < a.push + a.rx) p += Math.sign(x - a.x || 1) * (1 - d / (a.push + a.rx)) * 0.9; } return p; };
      const KEEP = [0.38, 0.62, 0.8, 1, 1];
      const veils = list.filter((L) => L.b.veil);
      const veilAt = (i) => { let v = 0; for (const L of veils) v += Math.min(1, L.a[i]) * L.b.veil * (L.b.far ? 0.3 + 1.2 * (1 - ((i / cols) | 0) / rows) : 1); return Math.min(0.85, v); };
      const trampleL = layers.get('trample'), bareL = layers.get('bare');
      if (covers.length) {
        const sp = 4 * spK, nb = [], vary = covers.some((L) => L.b.vary);
        const sample = (px, py, gx, gy) => {
          const c = Math.floor(px / cw), r = Math.floor(py / ch);
          if (c < 0 || r < 0 || c >= cols || r >= rows) return;
          const i = r * cols + c, solid = S.solid[i] >= 0;
          if (S.hole[i] || S.lip[i] || clearAt(px, py)) return;
          const X = WX + C.x + px, Y = WY + C.y + py;
          const vl = veils.length ? veilAt(i) : 0;
          const st = Math.max(0, step(S.L[i] + (hash(gx, gy, 3) - 0.5) * 0.1) - (vl > 0.45 ? 1 : 0));
          // the meadow's map: bare patches, short and long grass, trampled ways (and what was painted on it)
          let bare = 0, lenV = 0.5, trV = 0;
          if (vary) {
            bare = vnoise(X / 130, Y / 64, 23) * 0.75 + vnoise(X / 36, Y / 22, 24) * 0.35 + (bareL ? bareL.a[i] * 0.7 : 0);
            lenV = vnoise(X / 170, Y / 84, 21);
            trV = vnoise(X / 96, Y / 52, 25) * 0.8 + vnoise(X / 30, Y / 20, 26) * 0.25 + (trampleL ? trampleL.a[i] * 0.8 : 0);
          }
          const bareK = bare > 0.78 ? 0.03 : bare > 0.68 ? 0.25 : bare > 0.6 ? 0.6 : 1;
          let tot = 0; nb.length = 0;
          for (const L of covers) {
            const w = L.a[i]; if (w < 0.01) continue;
            const b = L.b; if ((solid && !b.over) || (S.wet[i] && !b.wet)) continue;
            const n = Math.min(w, 1.6) * (grid ? 1 : (4 / b.sp) ** 2) * (b.keep || KEEP)[st] * (b.vary ? bareK : 1);
            tot += n; nb.push(L, n);
          }
          if (!tot) return;
          // bare ground shows through: a few grains catching the moon
          if (vary && bareK < 0.3 && !grid && !solid && hash(gx, gy, 27) < 0.3) {
            const sb = BRUSHES.soil;
            push('grit', { x: px, y: py, i, b: sb, ch: hash(gx, gy, 28) < 0.5 ? '.' : ',', sz: 9 * sizeK, ang: 0, u: 0.5, c0: tintAt(sb.tints, st + 1, i), c1: tintAt(sb.tints, st + 2, i) });
          }
          tot *= 1 - vl * 0.5;
          if (grid) tot = Math.min(1, tot);
          let cnt = Math.floor(tot); if (hash(gx, gy, 4) < tot - cnt) cnt++;
          for (let k = 0; k < cnt; k++) {
            let u = hash(gx + k * 17, gy, 8) * tot, L = nb[0];
            for (let j = 0; j < nb.length; j += 2) { u -= nb[j + 1]; L = nb[j]; if (u <= 0) break; }
            const b = L.b, h1 = hash(gx + k, gy, 5), tj = hash(gx, gy + k, 7);
            const comb = ((vnoise(X / b.flow[0], Y / b.flow[1], 2) - 0.5) * 1.5 + (vnoise(X / 40, Y / 40, 3) - 0.5) * 0.35) * b.comb;
            S.cov[i] = 1;
            let ti = clamp(st + (tj < 0.22 ? -1 : tj > 0.9 ? 1 : 0), 0, 4), a0 = comb + pushAt(px, py) + (h1 - 0.5) * b.jitter;
            let size = (hash(gx, gy + k, 6) < 0.6 ? b.size[0] : b.size[1]) * sizeK, segs = b.segs, wk = 1;
            if (b.vary) {
              if (trV > 0.7) { a0 = (a0 >= 0 ? 1 : -1) * (1.1 + h1 * 0.3); size *= 0.85; segs = 1; ti = Math.max(0, ti - 1); wk = 0.25; }   // trampled: lying flat, one way
              else if (lenV < 0.4) { size *= 0.7; segs = 1; }
              else if (lenV > 0.62) { size *= 1.12; segs = 2; }
            }
            coverItem(solid ? 'over' : 'cover', b, px, py, i, a0, ti, Math.round(size), segs, h1 < 0.5 ? -1 : 1, wk);
            if (b.dew && !grid && hash(gx, gy, 9 + k) < b.dew) push('dots', { x: px, y: py, i, ch: '.', size: 14 * sizeK, lift: 8 * sizeK, toss: 1, u: h1, c0: tintAt(T5.dew, st, i), c1: tintAt(T5.dew, st + 1, i) });
          }
        };
        if (grid) { for (let r = 0; r < rows; r++) { if (slow()) yield; for (let c = 0; c < cols; c++) sample((c + 0.5) * cw, (r + 0.5) * ch, c, r); } }
        else {
          let gy = 0;
          for (let y = sp / 2; y < C.h + sp; y += sp, gy++) { if (slow()) yield; let gx = 0; for (let x = sp / 2; x < C.w; x += sp, gx++) sample(x + (hash(gx, gy, 1) - 0.5) * sp * 1.6, y + (hash(gx, gy, 2) - 0.5) * sp * 1.6, gx + C.seed * 999, gy); }
        }
      }
      // dots: flowers, pebbles
      for (const L of list.filter((L) => L.b.kind === 'dots')) {
        const b = L.b;
        for (let i = 0; i < N; i++) {
          if (i % cols === 0 && slow()) yield; const w = L.a[i]; if (w < 0.02 || S.solid[i] >= 0 || S.wet[i] || S.hole[i]) continue;
          const c = i % cols, r = (i / cols) | 0, st = step(S.L[i]), n = b.density * Math.min(w, 1.6) * [0.35, 0.6, 0.85, 1, 1][st] * (grid ? 2 : 1);
          let cnt = Math.floor(n); if (hash(c, r, b.id) < n - cnt) cnt++;
          for (let k = 0; k < cnt; k++) {
            const u = hash(c + k * 7, r, b.id + 1), x = grid ? (c + 0.5) * cw : (c + u) * cw, y = grid ? (r + 0.5) * ch : (r + hash(r, c + k, b.id + 2)) * ch;
            const T = b.hues[Math.floor(hash(r + k, c, b.id + 4) * b.hues.length)];
            push('dots', { x, y, i, ch: b.glyphs[Math.floor(hash(c, r + k, b.id + 3) * b.glyphs.length)], size: b.size * sizeK, lift: b.lift * sizeK, toss: b.toss, u, c0: tintAt(T, st, i), c1: tintAt(T, st + 1, i) });
          }
        }
      }
      // twigs: turned strokes along their line
      for (const L of list.filter((L) => L.b.kind === 'twig')) for (let i = 0; i < N; i++) {
        if (i % cols === 0 && slow()) yield; 
        if (L.a[i] < 0.4 || S.solid[i] >= 0) continue;
        const c = i % cols, r = (i / cols) | 0;
        if (hash(c, r, 39) > (L.b.keep ?? 1)) continue;
        push('twig', { x: (c + 0.5) * cw, y: (r + 0.5) * ch, i, b: L.b, a: isNaN(L.D[i]) ? 0 : L.D[i], c0: tintAt(L.b.tints, step(S.L[i]) + 2, i), sw: L.SW ? L.SW[i] : 0, sx: L.SX ? L.SX[i] : 0 });
      }
      // foliage: clumps on ink, small letters by facing, lit by the moon and the lamps; blossom on some crowns
      for (const L of list.filter((L) => L.b.kind === 'clump')) {
        const b = L.b, R = ramp(b.letters), marks = grid ? 1 : det.marks;
        for (let i = 0; i < N; i++) {
          if (i % cols === 0 && slow()) yield; const c = i % cols, r = (i / cols) | 0;
          if (L.a[i] < 0.45 + (hash(c, r, 41) - 0.5) * 0.4) continue;
          const x = (c + 0.5) * cw, y = (r + 0.5) * ch, nx = isNaN(L.NX[i]) ? 0 : L.NX[i], ny = isNaN(L.NY[i]) ? 0 : L.NY[i];
          const moon = facing(nx, ny, MOON), lit = (0.2 + moon * 0.85) * MK + lampFace(nx, ny, x, y) * 0.8 + (S.L[i] - LS.ambient) * 0.3;
          const sw = L.SW ? L.SW[i] : 0, sx = L.SX ? L.SX[i] : 0, bl = L.BL ? L.BL[i] : 0;
          // ink only inside the crown, so its edge is letters against the night, not a stepped block
          const inner = [i - 1, i + 1, i - cols, i + cols].every((j) => j >= 0 && j < N && L.a[j] > 0.5);
          if (inner) push('folInk', { x, y, c, r, i, b, sw, sx, ink: inkAt(i) });
          for (let k = 0; k < marks; k++) {
            // the letter is the form: dense in the heart of a clump, sparse at its edge (the old crowns'
            // dark core and ragged rim); the tint is the light, so the lit rim is sparse and bright
            const u = hash(c * 3 + k, r, 42), v = clamp(1.05 - Math.hypot(nx, ny) * 0.95 - moon * 0.2 + (hash(c, r + k, 43) - 0.5) * 0.3, 0, 0.999);
            const band = R[Math.min(R.length - 1, 1 + Math.floor(v * (R.length - 1)))];
            const bloom = bl && moon > 0.35 && hash(c, r + k, 47) < bl;
            const chr = bloom ? (hash(r, c, 49) < 0.6 ? '*' : 'o') : band[Math.floor(hash(r, c + k, 44) * band.length)];
            const T = bloom ? (hash(r, c, 48) < 0.55 ? T5.red : T5.bone) : b.tints, nT = T.length - 0.8, lk = lit + (hash(c, r, 46 + k) - 0.5) * 0.15;
            if (!k) { S.fol[i] = chr; S.folLit[i] = lit; }
            push('fol', { x: grid ? x : x + (u - 0.5) * cw * 1.3, y: grid ? y : y + (hash(r + k, c, 45) - 0.5) * ch * 0.9, i, b, ch: chr, sw, sx,
              size: grid ? ch : (k ? b.size[0] : b.size[1]) * sizeK, ang: grid ? 0 : (u - 0.5) * 0.6, c0: tintAt(T, lk * nT, i), c1: tintAt(T, (lk + 0.3) * nT, i) });
          }
        }
      }
      // live layers' cells: air, stars, light marks
      // mist's own marks: pale streaks lying along the banks, more where the bank is thick (from a mist brush or the fog mask)
      const streaks = (b, L) => {
          for (let i = 0; i < N && S.air.length < 1100; i++) {
            const m = S.mist[i]; if (!m || (L && L.a[i] < 0.05 && !FOG)) continue;
            const c = i % cols, r = (i / cols) | 0, n = b.density * [0, 0.1, 0.22, 0.4][m] * (grid ? 0.7 : 1) * (L ? 1 : FOGO.streaks ?? 0.3);
            if (hash(c, r, b.id) >= n) continue;
            S.air.push({ w: m, x: (c + hash(c, r, 51)) * cw, y: (r + hash(r, c, 52)) * ch, i, b, ph: hash(c, r, 53), spd: hash(r, c, 54) < 0.6 ? 1 : 2, n: 2 + Math.floor(hash(c, r, 56) * (m + 2)), ch: m === 3 && hash(c, r, 57) < 0.3 ? '=' : '-' });
          }
      };
      if (FOG && !mists.length) streaks(BRUSHES.mist, null);
      for (const L of list) {
        if (slow()) yield;
        const b = L.b;
        if (b.kind === 'air' && b.lifts) streaks(b, L);
        else if (b.kind === 'air') for (let i = 0; i < N; i++) {
          const w = L.a[i]; if (w < 0.02) continue;
          const c = i % cols, r = (i / cols) | 0, n = b.density * Math.min(w, 1.6) * (b.far ? 0.25 + 1.3 * (1 - r / rows) : 1);
          let cnt = Math.floor(n); if (hash(c, r, b.id) < n - cnt) cnt++;
          for (let k = 0; k < cnt; k++) S.air.push({ w, x: (c + hash(c, r + k, 51)) * cw, y: (r + hash(r, c + k, 52)) * ch, i, b, ph: hash(c + k, r, 53), spd: hash(r, c, 54) < 0.5 ? 1 : 2, ch: b.glyphs[Math.floor(hash(c, r, 55 + k) * b.glyphs.length)] });
        }
        if (b.kind === 'stars') for (let i = 0; i < N; i++) {
          const c = i % cols, r = (i / cols) | 0;
          if (L.a[i] < 0.02 || hash(c, r, 61) > b.density * Math.min(L.a[i], 1.6) * (grid ? 3 : 1)) continue;
          const u = hash(r, c, 62);
          S.stars.push({ x: (c + 0.5) * cw, y: (r + 0.5) * ch, ch: u < 0.7 ? '.' : u < 0.92 ? '+' : '*', ti: 1 + Math.floor(hash(c, r, 63) * 3.99), ph: hash(c, r, 64), T: b.tints });
        }
        if (b.kind === 'light') for (let i = 0; i < N; i++) {
          const c = i % cols, r = (i / cols) | 0, w = L.a[i];
          if (b.follow ? w < 0.6 || hash(c, r, 71) > b.marks : w < 0.5 || hash(c, r, 72) > b.motes) continue;
          S.marks.push({ x: (c + 0.5) * cw, y: (r + 0.5) * ch, c, i, b, a: L.D ? L.D[i] : 0, w, ph: hash(c, r, 73) });
        }
      }
      if (POSES) yield* makeTiles();
      prepGen = myGen;
    }

    // ── the live field: what a ring or a touch does to a cell right now
    // how far a touched blade has sprung back, age seconds on (marks.js: the same curve)
    function springAt(age) { const x = Math.max(0, Math.min(1, (age - 0.45) / 1.35)); return age < 0 ? 1 : x * x * (3 - 2 * x); }
    let RINGS = [], OPT = {}, NOW = 0;
    function amtAt(i, x, y) {
      let age = NOW - touchT[i], k = Math.abs(touchRG[i * 2 + 1]) || 1;
      for (const g of RINGS) { const d = Math.hypot(C.x + x - g.x, (C.y + y - g.y) * 1.8); if (d <= g.reach) { const a = NOW - g.t0 - d / g.speed; if (a >= 0 && a < age) { age = a; k = 1; } } }
      if (OPT.touch) age = Math.min(age, OPT.touch(i % cols, (i / cols) | 0, NOW));
      return (age < 0 ? 0 : age < 0.55 ? 1 : age < 0.8 ? 0.6 : age < 1.1 ? 0.3 : 0) * k;   // step 3 r2: loose for about a second
    }
    function ringAt(x, y) {
      for (const g of RINGS) { const a = NOW - g.t0; if (a < 0 || a * g.speed > g.reach + 26) continue; const d = Math.hypot(C.x + x - g.x, (C.y + y - g.y) * 1.8); if (Math.abs(d - a * g.speed) < 26) return 1; }
      return 0;
    }

    // a tree bends from its foot up: every cell of it moves with the wind at the tree's foot, by its sway
    let PA = null, PO = null, PX = 0, PY = 0;
    const pa = (it) => (PO != null ? PO : PA[it.tk]);   // tile mode: each tile's wind now (PA), and the screen's offset for live marks drawn turned
    const treeDx = (it, tb) => (PA ? pa(it) * 15 * sizeK : (wA(C.x + it.sx, C.y, tb) * 1.5 + Math.sin((tb / 4) * TAU + (C.x + it.sx) / 300) * 0.16) * 11 * sizeK);
    const wv = (it, tb) => (PA ? pa(it) : wA(C.x + it.x, C.y + it.y, tb));
    // every mark keeps its two tiles (lit by a ring or not), so a live chunk builds no strings
    // (a ring's lit tiles are made as it first passes, at most TURN.cap a frame with the turned ones; past that, unlit for a frame)
    const tl = (it, rg, chr, size) => (rg && (it.t1 || TURN.made < TURN.cap) ? it.t1 || (TURN.made++, it.t1 = W.tile(chr, it.c1, size)) : it.t0 || (it.t0 = W.tile(chr, it.c0, size)));
    const put = (g, t, x, y, ang, dpr) => {
      if (ang) { const c = Math.cos(ang) * dpr, s2 = Math.sin(ang) * dpr; g.setTransform(c, s2, -s2, c, x * dpr + PX, y * dpr + PY); g.drawImage(t.cv, -t.w / 2, -t.h / 2, t.w, t.h); g.setTransform(dpr, 0, 0, dpr, PX, PY); }
      else g.drawImage(t.cv, x - t.w / 2, y - t.h / 2, t.w, t.h);
    };
    // ── drawing the marks of the baked layers (live: with rings and touch)
    function drawLists(g, X0, Y0, lists, tb, live, dpr, cdpr) {
      for (const it of lists.grit) {
        const amt = live ? amtAt(it.i, it.x, it.y) : 0, rg = live ? ringAt(it.x, it.y) : 0;
        put(g, tl(it, rg, it.ch, it.sz), X0 + it.x, Y0 + it.y - amt * it.b.toss * 8 * it.u, (it.ang || 0) + (amt ? (it.u - 0.5) * 2.4 * amt : 0), cdpr);
      }
      const strokes = (arr) => {
        for (const it of arr) {
          const b = it.b, amt = live ? amtAt(it.i, it.x, it.y) : 0, rg = live ? ringAt(it.x, it.y) : 0;
          if (PA) it.wa = pa(it) * b.wind * it.wk; else if (it.wt !== tb) { it.wt = tb; it.wa = wA(C.x + it.x, C.y + it.y, tb) * b.wind * it.wk; }
          const a = it.a + it.wa + (amt ? amt * 0.55 * (RINGS.length ? Math.sign(C.x + it.x - RINGS[0].x) || 1 : it.sgn) : 0);
          if (grid) { put(g, tl(it, rg, it.gch, ch), X0 + it.x, Y0 + it.y, 0, cdpr); continue; }
          let px = X0 + it.x, py = Y0 + it.y - b.lift * sizeK - amt * 3;
          const Lp = it.size * 0.55, ids = rg ? it.ids1 : it.ids0;
          for (let j = 0; j < it.segs; j++) {
            const aj = a * (1 + 0.45 * j), tl = turnedId(ids[j], aj, it.size, dpr);
            g.drawImage(tl.cv, px - tl.d / 2, py - tl.d / 2, tl.d, tl.d);
            if (j < it.segs - 1) { px += Math.sin(aj) * Lp; py -= Math.cos(aj) * Lp; }
          }
          if (b.tip) W.looseOn(g, px + Math.sin(a * 2) * Lp * 0.7, py - Math.cos(a * 2) * Lp * 0.7, b.tip, b.tipTint, 0, it.size * 0.75, cdpr);
        }
      };
      strokes(lists.cover);
      for (const it of lists.dots) {
        const amt = live ? amtAt(it.i, it.x, it.y) : 0, rg = live ? ringAt(it.x, it.y) : 0;
        put(g, tl(it, rg, it.ch, it.size), X0 + it.x, Y0 + it.y - it.lift - amt * it.toss * 7 * (0.4 + it.u), 0, cdpr);
      }
      let ink = null;
      for (const it of lists.solid) {
        const dx = it.sw && !grid ? Math.round(treeDx(it, tb) * it.sw) : 0;
        if (it.ink !== ink) { ink = it.ink; g.fillStyle = ink; } g.fillRect(X0 + it.c * cw + dx, Y0 + it.r * ch, cw, ch);
        if (it.joint) { if (it.moss) put(g, it.tm || (it.tm = W.tile(it.moss, it.mc, ch * 0.85)), X0 + it.x + dx, Y0 + it.y, 0, cdpr); continue; }
        const rg = live ? ringAt(it.x, it.y) : 0;
        put(g, tl(it, rg, it.ch, ch), X0 + it.x + dx, Y0 + it.y, 0, cdpr);
      }
      strokes(lists.over);
      for (const it of lists.twig) {
        const a = it.a + wv(it, tb) * 0.35, tl = turned('|', a, it.c0, it.b.size * sizeK, dpr);
        const dx = grid ? 0 : it.sw ? treeDx(it, tb) * it.sw : wv(it, tb) * it.b.sway;
        g.drawImage(tl.cv, X0 + it.x + dx - tl.d / 2, Y0 + it.y - tl.d / 2, tl.d, tl.d);
      }
      for (const it of lists.folInk) {
        const dx = grid ? 0 : Math.round(it.sw ? treeDx(it, tb) * it.sw : wv(it, tb) * it.b.sway);
        if (it.ink !== ink) { ink = it.ink; g.fillStyle = ink; } g.fillRect(X0 + it.c * cw + dx, Y0 + it.r * ch, cw, ch);
      }
      for (const it of lists.fol) {
        const rg = live ? ringAt(it.x, it.y) : 0, dx = grid ? 0 : it.sw ? treeDx(it, tb) * it.sw : wv(it, tb) * it.b.sway;
        put(g, tl(it, rg, it.ch, it.size), X0 + it.x + dx, Y0 + it.y, it.ang, cdpr);
      }
    }

    // ── water: calm, so the bank can be read on it. The bank is mirrored about each column's surface
    // a step darker; every fourth row is a ripple row that breaks the mirror sideways (the rows step
    // down one a second); the moon and the lamps lie on it as columns of dashes
    function drawWater(g, t, X0 = C.x, Y0 = C.y, cdpr = W.dpr) {
      const glades = (LS.glades || []).map((q) => ({ x: q.x - C.x, k: q.k ?? 1 }));
      const sh = Math.floor((((t % 4) + 4) % 4)), live = RINGS.length || OPT.touch;
      // the water's own body: dark teal, not the night's ink, so a pool reads as water under the grass that grows in it
      g.fillStyle = WBODY[0];
      for (const it of S.water) if (it.d > 0) g.fillRect(X0 + it.x - cw / 2, Y0 + it.y - ch / 2, cw, ch);
      g.fillStyle = WBODY[1];
      for (const it of S.water) if (it.d === 0) g.fillRect(X0 + it.x - cw / 2, Y0 + it.y - ch / 2, cw, ch);
      for (const it of S.water) {
        const { c, r, d, i } = it, st = step(S.L[i]), amt = live ? amtAt(i, it.x, it.y) : 0;
        const v = Math.sin(c * 0.45 + t * W1 * 2 + r * 2.3) + Math.sin(c * 0.17 - t * W1 + r * 1.7);
        const ripple = d > 0 && (((((d - sh) % 4) + 4) % 4) === 0 || amt > 0);
        const x = X0 + it.x, y = Y0 + it.y - (ripple ? Math.round(v * 0.5) : 0) - amt * 3;
        let glade = 0;
        for (const q of glades) {
          const hw = (2.4 + Math.min(d, 16) * 0.45) * q.k * cw, dx = Math.abs(it.x - q.x + (ripple ? (v > 0 ? cw : -cw) : 0));
          if (dx < hw && (ripple || (d + sh) % 2 === 0)) glade = Math.max(glade, dx < hw * 0.4 ? 2 : 1);
        }
        if (glade) { W.looseOn(g, x, y, glade === 2 ? '=' : '-', lift(glade === 2 ? P.beige : P.beigeDim, i), 0, ch, cdpr); continue; }
        const mr = r - 2 * d - 1;
        if (mr >= 0 && (!ripple || hash(c, r + sh, 82) > 0.4)) {
          const mi = mr * cols + clamp(c + (ripple ? (v > 0 ? 1 : -1) : 0), 0, cols - 1);
          if (S.solid[mi] >= 0 && S.ch[mi]) { W.looseOn(g, x, y, S.ch[mi], lift(tint(S.T[mi], S.lit[mi] * 5.2 - 1.3), i), 0, ch, cdpr); continue; }
          if (S.fol[mi]) { W.looseOn(g, x, y, S.fol[mi], lift(tint(T6.leaf, S.folLit[mi] * 5.2 - 1.3), i), 0, ch, cdpr); continue; }
          if (S.cov[mi] && d < 4 && hash(c, r, 81) < 0.55) { W.looseOn(g, x, y, '|', lift(tint(T5.grass, st - 1), i), 0, ch, cdpr); continue; }
        }
        if (d === 0) { W.looseOn(g, x, y, v > 0.8 ? '=' : '-', lift(tint(it.b.tints, st + 2 + (amt ? 1 : 0)), i), 0, ch, cdpr); continue; }
        if (ripple) { if (v > 0.2 && hash(c, r + sh, 84) < 0.7) W.looseOn(g, x, y, v > 1.1 ? '=' : '-', lift(tint(it.b.tints, clamp(st + 1 + (v > 1.1 ? 1 : 0) - (d > 8 ? 1 : 0), 0, 4) + (amt ? 1 : 0)), i), 0, ch, cdpr); continue; }
        // between them, the night sky lies on it: a few dim dashes, fewer deep down
        if (hash(c, r, 83) < 0.2 - Math.min(d, 12) * 0.01) W.looseOn(g, x, y, hash(c, r, 85) < 0.7 ? '-' : '.', lift(tint(it.b.tints, st + (d < 3 ? 1 : 0)), i), 0, ch, cdpr);
      }
    }
    // the live layers keep their tiles on each mark (two states each), so a frame builds no strings
    const tileOn = (m, k, make) => m[k] || (m[k] = make());
    function drawSky(g, t) {
      for (const s of S.stars) {
        const tw = (Math.floor(t * 3) + Math.floor(s.ph * 12)) % 12 === 0;
        const tl = tw ? tileOn(s, 't1', () => W.tile(s.ch === '.' ? '+' : '.', tint(s.T, s.ti + 1), ch)) : tileOn(s, 't0', () => W.tile(s.ch, tint(s.T, s.ti), ch));
        g.drawImage(tl.cv, C.x + s.x - tl.w / 2, C.y + s.y - tl.h / 2, tl.w, tl.h);
      }
      for (const m of S.air) if (m.b.name === 'cloud') air(g, t, m);
    }
    function air(g, t, m) {
      const f = ((t / 4) * m.spd + m.ph) % 1;
      if (m.b.lifts) {
        // a streak drifts along its bank, brightest mid-way, in and out in steps
        if (f < 0.06 || f > 0.94) return;
        const x = C.x + m.x + (f - 0.5) * m.b.drift + wA(C.x + m.x, C.y + m.y, t) * 12, y = C.y + m.y;
        const mid = f > 0.25 && f < 0.75 ? 1 : 0;
        const tl = tileOn(m, 't' + mid, () => streak(m.ch, m.n, tint(m.b.tints, clamp(m.w - 1 + mid + (step(S.L[m.i]) > 2 ? 1 : 0), 0, 4)), Math.round(ch * (m.w > 1 ? 1 : 0.85)), W.dpr));
        g.drawImage(tl.cv, Math.round(x - tl.w / 2), Math.round(y - tl.h / 2), tl.w, tl.h);
        return;
      }
      if (f < 0.12 || f > 0.88) return;   // sparse marks that drift in, across and out
      const x = C.x + m.x + (f - 0.5) * m.b.drift + wA(C.x + m.x, C.y + m.y, t) * 10, y = C.y + m.y + Math.sin(f * TAU) * 2, mid = f > 0.3 && f < 0.7 ? 1 : 0;
      const tl = tileOn(m, 't' + mid, () => W.tile(m.ch, tint(m.b.tints, step(S.L[m.i]) + (m.b.lift || 0) + mid - (Math.min(m.w, 1) < 0.6 ? 1 : 0)), ch));
      g.drawImage(tl.cv, Math.round(x - tl.w / 2), Math.round(y - tl.h / 2), tl.w, tl.h);
    }
    function drawAir(g, t) {
      for (const m of S.air) if (m.b.name !== 'cloud') air(g, t, m);
      for (const m of S.marks) {
        if (m.b.follow) {
          if ((m.c + Math.floor(t * 8)) % 6 === 0) continue;   // the beam breaks in steps, outward
          W.looseOn(g, C.x + m.x, C.y + m.y, m.w > 0.9 ? '=' : '-', tint(m.b.tints, m.w > 0.9 ? 4 : 3), (isNaN(m.a) ? Math.PI / 2 : m.a) - Math.PI / 2, ch);
        } else {
          const f = ((t / 4) + m.ph) % 1;
          W.looseOn(g, C.x + m.x, C.y + m.y - f * 18, '.', tint(m.b.tints, f < 0.5 ? 3 : 2), 0, ch);
        }
      }
    }

    // ── bake one wind step of the still layers into an image (and the water's 24 steps)
    function baked(st, tb) {
      let f = frames.get(st);
      if (f) return f;
      const dpr = Math.min(1.5, W.dpr), pad = 24, w = C.w + 2 * pad, h = C.h + 2 * pad;
      const cv = document.createElement('canvas'); cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawLists(g, pad, pad, S.items, tb, false, Math.max(1, W.dpr), dpr);
      f = { cv, w, h, pad };
      frames.set(st, f); bakeCount();
      return f;
    }
    function waterFrame(ws) {
      const key = 'w' + ws; let wf = frames.get(key);
      if (wf) return wf;
      const dpr = Math.min(1.5, W.dpr), pad = 12, w = C.w + 2 * pad, h = C.h + 2 * pad;
      const cv = document.createElement('canvas'); cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
      const g2 = cv.getContext('2d'); g2.setTransform(dpr, 0, 0, dpr, 0, 0);
      const R0 = RINGS, O0 = OPT; RINGS = []; OPT = {};
      drawWater(g2, ((ws + 0.5) / 24) * 4, pad, pad, dpr);
      RINGS = R0; OPT = O0;
      wf = { cv, w, h, pad }; frames.set(key, wf); bakeCount();
      return wf;
    }
    // every step is baked in the first loop, one or two a frame, whether it has been shown yet or not:
    // after that the card only stamps
    function bakeAhead(steps) {
      if (bakedAll || steps === 1) return;
      let n = 0;
      for (let s = 0; s < steps && n < 1; s++) if (!frames.has(s)) { baked(s, ((s + 0.5) / steps) * 4); n++; }
      if (S.water.length) for (let s = 0; s < 24 && n < 2; s++) if (!frames.has('w' + s)) { waterFrame(s); n++; }
      if (!n) { bakedAll = true; warm(); }
    }
    // the tiles a ring lights (each mark's second state), made once after baking so the first ring doesn't make them
    function warm() {
      for (const k of ['grit', 'dots', 'solid', 'fol']) for (const it of S.items[k]) { if (it.joint) continue; const sz = k === 'grit' ? it.sz : k === 'solid' ? ch : it.size; if (it.ch && it.c1) tl(it, 1, it.ch, sz); }
    }
    // ── tile mode (step 3 r2, the world): every mark is bucketed into a tile of 128 × 96 px (a tree's marks by its foot's
    // column, so a tree bends whole); a tile is baked once per wind pose it needs and stamped in the pose the wind gives it
    // now – the wind is a field in space and time, never a loop, and memory follows the view, not the loop
    let TILES = null, WG = null;
    const TW = BAND ? 64 : 128, TH = 96, AMIN = -0.1, AMAX = 0.64;
    const quant = (A) => clamp(Math.round(((A - AMIN) / (AMAX - AMIN)) * (POSES - 1)), 0, POSES - 1);
    const poseA = (p) => AMIN + (p * (AMAX - AMIN)) / (POSES - 1);
    function* makeTiles() {
      let nY = 0;
      const TC = Math.ceil(C.w / TW) + 2, TR = Math.ceil(C.h / TH) + 2, map = new Map(); TILES = [];
      for (const k of ORDER) for (const it of S.items[k]) {
        if (++nY % 4000 === 0 && slow()) yield;
        const kx = it.sw ? it.sx : it.x, tx = clamp(Math.floor(kx / TW) + 1, 0, TC - 1), ty = clamp(Math.floor(it.y / TH) + 1, 0, TR - 1), key = ty * TC + tx;
        let T = map.get(key);
        if (!T) { T = { k: TILES.length, tx, ty, lists: Object.fromEntries(ORDER.map((n) => [n, []])), bb: [1e9, 1e9, -1e9, -1e9], cx: (tx - 0.5) * TW, cy: (ty - 0.5) * TH, im: new Array(POSES).fill(null), n: 0 }; map.set(key, T); TILES.push(T); }
        T.lists[k].push(it); it.tk = T.k; T.n++;
        const m = it.sw ? 18 : 2, b = T.bb;
        if (it.x - 20 - m < b[0]) b[0] = it.x - 20 - m; if (it.x + 20 + m > b[2]) b[2] = it.x + 20 + m;
        if (it.y - 36 < b[1]) b[1] = it.y - 36; if (it.y + 14 > b[3]) b[3] = it.y + 14;
      }
      for (const T of TILES) { T.bb = [Math.floor(T.bb[0]), Math.floor(T.bb[1]), Math.ceil(T.bb[2]), Math.ceil(T.bb[3])]; }
      if (!BAND) {
        // the ground (not bending whole): a tile is exactly its rect, so tiles never overdraw; every mark that reaches into it
        // is drawn into it, in its pose (a stroke over a seam bends where the seam is)
        for (const T of TILES) { T.bb = [(T.tx - 1) * TW, (T.ty - 1) * TH, T.tx * TW, T.ty * TH]; T.own = T.lists; T.lists = Object.fromEntries(ORDER.map((n) => [n, []])); }
        for (const k of ORDER) for (const T0 of TILES) for (const it of T0.own[k]) {
          if (++nY % 4000 === 0 && slow()) yield;
          const x0 = Math.floor((it.x - 22) / TW) + 1, x1 = Math.floor((it.x + 22) / TW) + 1, y0 = Math.floor((it.y - 36) / TH) + 1, y1 = Math.floor((it.y + 14) / TH) + 1;
          for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { const T = tx === T0.tx && ty === T0.ty ? T0 : map.get(ty * TC + tx); if (T) T.lists[k].push(it); }
        }
        for (const T of TILES) T.own = null;
      }
      PA = new Float32Array(TILES.length);
    }
    const poseNow = (T, t) => quant(BAND ? wA(C.x + T.cx, 0, t) : wA(C.x + T.cx, C.y + T.cy, t));
    function tileImg(T, p) {
      const d = BDPR, b = T.bb, w = b[2] - b[0], h = b[3] - b[1];
      const cv = poolGet(Math.ceil(w * d), Math.ceil(h * d));
      const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.setTransform(d, 0, 0, d, 0, 0);
      const px = PX, py = PY; PO = poseA(p); PX = PY = 0;
      g.save(); if (!BAND) { g.beginPath(); g.rect(0, 0, w, h); g.clip(); }
      drawLists(g, -b[0], -b[1], T.lists, 0, false, d, d);
      g.restore();
      PO = null; PX = px; PY = py;
      const im = { cv, w, h, T, p, u: MEM.frame, px: cv.width * cv.height };
      T.im[p] = im; memAdd(im); bakeCount();
      return im;
    }
    const nearest = (T, p) => { for (let d = 1; d < POSES; d++) { if (p - d >= 0 && T.im[p - d]) return T.im[p - d]; if (p + d < POSES && T.im[p + d]) return T.im[p + d]; } return null; };
    const inView = (b, v, m) => !(C.x + b[2] < v[0] - m || C.x + b[0] > v[2] + m || C.y + b[3] < v[1] - m || C.y + b[1] > v[3] + m);
    const ALLV = [-1e9, -1e9, 1e9, 1e9];
    function liveChunks(t, v) {
      const act = [];
      for (let k = 0; k < ccols * crows; k++) {
        if (!S.chunks[k]) continue;
        const x0 = (k % ccols) * CHK, y0 = Math.floor(k / ccols) * CHK, x1 = x0 + CHK, y1 = y0 + CHK;
        if (C.x + x1 < v[0] || C.x + x0 > v[2] || C.y + y1 < v[1] || C.y + y0 > v[3]) continue;
        let on = t - chunkT[k] < 1.15;
        for (const rg of RINGS) {
          if (on) break;
          const a = t - rg.t0; if (a < 0 || a * rg.speed > rg.reach + rg.speed * 1.15) continue;
          const rx = rg.x - C.x, ry = rg.y - C.y, front = a * rg.speed;
          const dmin = Math.hypot(Math.max(0, x0 - rx, rx - x1), Math.max(0, y0 - ry, ry - y1) * 1.8), dmax = Math.hypot(Math.max(Math.abs(x0 - rx), Math.abs(x1 - rx)), Math.max(Math.abs(y0 - ry), Math.abs(y1 - ry)) * 1.8);
          if (dmin <= Math.min(front + 26, rg.reach) && dmax >= front - rg.speed * 1.15 - 26) on = true;
        }
        if (on) act.push(k);
      }
      return act;
    }
    // draw what of this canvas lies in the view (stage px of its scene): water live, every tile in its pose, the chunks
    // a ring or a foot is passing through live. o.sync bakes any pose it lacks now (shots); otherwise the nearest baked
    // pose stands in and C.bakeSome() fills it in. Returns how many tiles stood in.
    C.drawTiles = (Wscreen, t, o = {}) => {
      W = Wscreen; if (!TILES || prepGen !== gen) return -1;
      NOW = t; OPT = o;
      RINGS = (o.rings || []).map((g) => ({ x: g.x, y: g.y, t0: g.t0, reach: g.reach || 150, speed: g.speed || 208 }));
      const v = o.view || ALLV, g = W.g, tb = Math.floor(t * 12) / 12;
      W.reset();
      if (S.stars.length) drawSky(g, t);
      if (S.water.length && inView(S.wbox, v, 40)) drawWater(g, t);
      const draws = []; let miss = 0;
      for (const T of TILES) {
        if (!inView(T.bb, v, 0)) continue;
        const p = poseNow(T, tb); PA[T.k] = poseA(p);
        let im = T.im[p];
        if (!im && o.sync) im = tileImg(T, p);
        if (!im) { im = nearest(T, p); miss++; }
        if (im) { im.u = MEM.frame; draws.push(im); }
      }
      const act = liveChunks(t, v);
      if (act.length) {
        g.save(); g.beginPath(); g.rect(v[0] - 64, v[1] - 64, v[2] - v[0] + 128, v[3] - v[1] + 128);
        for (const k of act) g.rect(C.x + (k % ccols) * CHK, C.y + Math.floor(k / ccols) * CHK, CHK, CHK);
        g.clip('evenodd');
      }
      for (const im of draws) g.drawImage(im.cv, C.x + im.T.bb[0], C.y + im.T.bb[1], im.w, im.h);
      if (act.length) {
        g.restore(); PX = W.ox || 0; PY = W.oy || 0;
        if (TURN.frame !== MEM.frame) { TURN.frame = MEM.frame; TURN.made = 0; }
        TURN.cap = 40;
        // the marks of the still patches round a live one reach into it (a stroke leans over, a grain sits on the edge):
        // drawn first, still, inside the live patches only – else a seam of ink shows where the live patch begins
        const on = new Set(act), edge = new Set();
        for (const k of act) for (const n of [k - ccols - 1, k - ccols, k - ccols + 1, k - 1, k + 1, k + ccols - 1, k + ccols, k + ccols + 1]) if (n >= 0 && S.chunks[n] && !on.has(n)) edge.add(n);
        if (edge.size) {
          g.save(); W.reset(); g.beginPath(); for (const k of act) g.rect(C.x + (k % ccols) * CHK, C.y + Math.floor(k / ccols) * CHK, CHK, CHK); g.clip();
          for (const n of edge) drawLists(g, C.x, C.y, S.chunks[n], tb, false, BDPR, W.dpr);
          g.restore();
        }
        for (const k of act) drawLists(g, C.x, C.y, S.chunks[k], tb, true, BDPR, W.dpr);
        TURN.cap = Infinity;   // turned tiles at the bake's scale: live marks match the baked
        PX = PY = 0; W.reset();
      }
      return miss;
    };
    // bake poses ahead until the deadline: first each tile in view in the pose it needs now, then its neighbours' poses,
    // then every pose of the tiles in view, then the poses round the wind now of the tiles within o.margin of it.
    // Returns true while more remains.
    C.bakeSome = (Wscreen, deadline, v, t, margin = 320) => {
      W = Wscreen; if (!TILES || prepGen !== gen) return false;
      const tb = Math.floor(t * 12) / 12, inV = [], nearV = [];
      for (const T of TILES) { if (inView(T.bb, v, 0)) inV.push(T); else if (inView(T.bb, v, margin)) nearV.push(T); }
      const passes = [[inV, [0]], [nearV, [0]], [inV, [1, -1]], [nearV, [1, -1]], [inV, [2, -2, 3, -3]]];
      for (const [list, ds] of passes) for (const T of list) {
        if (ds[0] !== 0 && MEM.px > MEM.budget * 0.8) return false;   // the poses the wind may need later, only while memory allows
        const p = poseNow(T, tb);
        for (const d of ds) { const q = p + d; if (q < 0 || q >= POSES || T.im[q]) continue; if (performance.now() > deadline) return true; tileImg(T, q); }
      }
      return false;
    };
    // the turned tiles every stroke can reach – its comb, any pose, and a foot or a ring on it – made while baking, so
    // the first touch through grass that hasn't moved yet makes none (the 26–43 ms first-touch spikes)
    function* warmG() {
      const ranges = new Map(); let n = 0;
      for (const k of ['cover', 'over']) for (const it of S.items[k]) {
        if (++n % 1500 === 0 && slow()) yield;
        const wk = (it.wk ?? 1) * it.b.wind, lo0 = it.a + Math.min(AMIN * wk, AMAX * wk) - 0.62, hi0 = it.a + Math.max(AMIN * wk, AMAX * wk) + 0.62;
        for (let j = 0; j < it.segs; j++) {
          const m = 1 + 0.45 * j, a = Math.floor(Math.min(lo0 * m, hi0 * m) / ASTEP), z = Math.ceil(Math.max(lo0 * m, hi0 * m) / ASTEP);
          for (const id of [it.ids0[j], it.ids1[j]]) { const key = id * 64 + it.size, r = ranges.get(key); if (!r) ranges.set(key, [id, it.size, a, z]); else { if (a < r[2]) r[2] = a; if (z > r[3]) r[3] = z; } }
        }
      }
      for (const [, [id, size, a, z]] of ranges) { for (let ai = a; ai <= z; ai++) turnedId(id, ai * ASTEP, size, BDPR); if (slow()) yield; }
      warm();
    }
    C.warm = (Wscreen, budget = 1e9) => {
      W = Wscreen; if (!S || prepGen !== gen) return false;
      if (WG === true) return true;
      if (!WG) WG = warmG();
      DEAD = performance.now() + budget; const done = WG.next().done; DEAD = Infinity;
      if (done) WG = true;
      return done;
    };
    // let a canvas go: its tile images back to the pool, its marks and fields to the collector
    C.free = () => { GLD = null; GLG = null; if (TILES) memDrop(TILES.flatMap((T) => T.im.filter(Boolean))); TILES = null; S = null; PG = null; WG = null; layers.clear(); frames.clear(); prepGen = -1; };
    C.warmRing = (Wscreen) => { W = Wscreen; if (S && prepGen === gen) warm(); };
    C.bare = (v) => { if (!TILES) return 0; let n = 0; for (const T of TILES) if (inView(T.bb, v, 0) && !T.im.some(Boolean)) n++; return n; };
    C.touchGL = () => { if (tr1 < 0) return null; const r = { data: touchRG, r0: tr0, r1: tr1 }; tr0 = 1e9; tr1 = -1; return r; };
    C.drawLive = (Wscreen, t, o = {}) => {
      W = Wscreen; if (!S || prepGen !== gen) return;
      NOW = t; OPT = {}; RINGS = (o.rings || []).map((g) => ({ x: g.x, y: g.y, t0: g.t0, reach: g.reach || 150, speed: g.speed || 208 }));
      const v = o.view || ALLV; W.reset();
      if (S.stars.length) drawSky(W.g, t);
      if (S.water.length && inView(S.wbox, v, 40)) drawWater(W.g, t);
    };
    // every mark as an instance (lib/marks.js): sorted by kind (the paint order), then into 256-px bands so a view draws
    // only its own. 22 floats a mark: x y ang size · uv · kind wind sway treeSway · footX seg segLen lift · toss u side h · rgba rgba
    let GLG = null, GLD = null;
    const GBAND = 256, hexC = new Map();
    const rgb = (h) => { let v = hexC.get(h); if (!v) { const A = hex(h || '#000000'); v = [A[0], A[1], A[2], 255]; hexC.set(h, v); } return v; };
    function* glG(glyph) {
      const nb = Math.ceil(C.w / GBAND) + 3, kinds = [];
      let cap = 32768, buf = new ArrayBuffer(cap * 88), F = new Float32Array(buf), B8 = new Uint8Array(buf), n = 0, cnt = 0;
      const put = (kind, x, y, ang, size, uv, k, sway, sw, sx, j, L, lift, toss, u, side, h, c0, c1) => {
        if (n >= cap) { cap *= 2; const nbf = new ArrayBuffer(cap * 88); new Uint8Array(nbf).set(B8); buf = nbf; F = new Float32Array(buf); B8 = new Uint8Array(buf); }
        const o = n * 22; F[o] = x; F[o + 1] = y; F[o + 2] = ang; F[o + 3] = size; F[o + 4] = uv[0]; F[o + 5] = uv[1]; F[o + 6] = uv[2]; F[o + 7] = uv[3];
        F[o + 8] = kind; F[o + 9] = k; F[o + 10] = sway; F[o + 11] = sw; F[o + 12] = sx; F[o + 13] = j; F[o + 14] = L; F[o + 15] = lift; F[o + 16] = toss; F[o + 17] = u; F[o + 18] = side; F[o + 19] = h;
        const p = n * 88 + 80, a = rgb(c0), b = rgb(c1 || c0); B8[p] = a[0]; B8[p + 1] = a[1]; B8[p + 2] = a[2]; B8[p + 3] = 255; B8[p + 4] = b[0]; B8[p + 5] = b[1]; B8[p + 6] = b[2]; B8[p + 7] = 255;
        n++;
      };
      const band = (it) => clamp(Math.floor((it.sw ? it.sx : it.x) / GBAND) + 1, 0, nb - 1), uOf = (it) => hash(Math.round(it.x * 7), Math.round(it.y * 7), 5);
      for (const kn of ORDER) {
        // a counting sort by band (a comparison sort of 40 000 marks was one 30 ms slice)
        const src = S.items[kn], bnd = new Uint16Array(src.length), cntB = new Uint32Array(nb + 1);
        for (let q = 0; q < src.length; q++) { bnd[q] = band(src[q]); cntB[bnd[q] + 1]++; if (q % 8000 === 7999 && slow()) yield; }
        for (let q = 0; q < nb; q++) cntB[q + 1] += cntB[q];
        const list = new Array(src.length), at = cntB.slice(); for (let q = 0; q < src.length; q++) list[at[bnd[q]]++] = src[q];
        const starts = new Array(nb + 1).fill(0);
        let bi = 0; starts[0] = n;
        for (const it of list) {
          if (++cnt % 2500 === 0 && slow()) yield;
          const bb = band(it); while (bi < bb) { bi++; starts[bi] = n; }
          const sw = it.sw || 0, sx = it.sx || 0;
          if (kn === 'grit') put(4, it.x, it.y, it.ang || 0, it.sz, glyph(it.ch, it.sz), 0, 0, 0, 0, 0, 0, 0, it.b.toss || 0, it.u, 1, 0, it.c0, it.c1);
          else if (kn === 'cover' || kn === 'over') {
            const b = it.b, L = it.size * 0.55, u = uOf(it), k = b.wind * it.wk, lift = b.lift * sizeK;
            for (let j = 0; j < it.segs; j++) put(1, it.x, it.y, it.a, it.size, glyph(b.glyph, it.size), k, 0, 0, 0, j, L, lift, 0, u, it.sgn, 0, cids[it.ids0[j]].col, cids[it.ids1[j]].col);
            if (b.tip) put(5, it.x, it.y, it.a, it.size * 0.75, glyph(b.tip, it.size * 0.75), k, 0, 0, 0, it.segs, L, lift, 0, u, it.sgn, 0, b.tipTint, b.tipTint);
          } else if (kn === 'dots') put(0, it.x, it.y, 0, it.size, glyph(it.ch, it.size), 0, 0, 0, 0, 0, 0, it.lift || 0, it.toss || 0, it.u, 1, 0, it.c0, it.c1);
          else if (kn === 'solid') {
            const sway = sw ? 0 : 0;
            put(2, it.c * cw + cw / 2, it.r * ch + ch / 2, 0, cw, glyph(' ', 1), 0, sway, sw, sx, 0, 0, 0, 0, 0, 1, ch, it.ink, it.ink);
            if (it.joint) { if (it.moss) put(0, it.x, it.y, 0, ch * 0.85, glyph(it.moss, ch * 0.85), 0, 0, sw, sx, 0, 0, 0, 0, 0, 1, 0, it.mc, it.mc); }
            else put(0, it.x, it.y, 0, ch, glyph(it.ch, ch), 0, 0, sw, sx, 0, 0, 0, 0, 0, 1, 0, it.c0, it.c1);
          } else if (kn === 'twig') put(3, it.x, it.y, it.a, it.b.size * sizeK, glyph('|', it.b.size * sizeK), 0, sw ? 0 : it.b.sway, sw, sx, 0, 0, 0, 0, 0, 1, 0, it.c0, it.c0);
          else if (kn === 'folInk') put(2, it.c * cw + cw / 2, it.r * ch + ch / 2, 0, cw, glyph(' ', 1), 0, sw ? 0 : it.b.sway, sw, sx, 0, 0, 0, 0, 0, 1, ch, it.ink, it.ink);
          else if (kn === 'fol') put(0, it.x, it.y, it.ang || 0, it.size, glyph(it.ch, it.size), 0, sw ? 0 : it.b.sway, sw, sx, 0, 0, 0, 0, uOf(it), 1, 0, it.c0, it.c1);
        }
        while (bi < nb) { bi++; starts[bi] = n; }
        kinds.push(starts);
      }
      GLD = { buf, n, kinds, nb, band: GBAND, cols, rows, touch: touchRG };
    }
    // build the instances in slices of `budget` ms; true once done (C.glData() then holds them). glyph(ch, size) → uv
    C.glBuild = (glyph, budget = 1e9) => {
      if (GLD) return true; if (!S || prepGen !== gen) return false;
      if (!GLG) GLG = glG(glyph);
      DEAD = performance.now() + budget; const r = GLG.next(); DEAD = Infinity;
      if (r.done) { GLG = null; return true; }
      return false;
    };
    C.glData = () => GLD;
    // the marks live on the GPU now: the CPU's copies (and their chunk lists) can go
    C.dropMarks = () => { if (S) { S.items = Object.fromEntries(ORDER.map((k) => [k, []])); S.chunks = []; } if (GLD) GLD.buf = null; };
    C.tileStats = () => { if (!TILES) return null; let ims = 0, px = 0; for (const T of TILES) for (const im of T.im) if (im) { ims++; px += im.px; } return { tiles: TILES.length, images: ims, px, poses: POSES }; };
    C.setBakeDpr = (d) => { BDPR = d; };
    C.draw = (Wscreen, t, o = {}) => {
      W = Wscreen;
      if (!fontsSettled(W)) return;
      if (prepGen !== gen) prep();
      NOW = t; OPT = o;
      RINGS = (o.rings || []).map((g) => ({ x: g.x, y: g.y, t0: g.t0, reach: g.reach || 150, speed: g.speed || 208 }));
      const steps = o.steps ?? 6, tm = ((t % 4) + 4) % 4, st = steps === 1 ? 0 : Math.floor((tm / 4) * steps), tb = steps === 1 ? o.at || 0 : ((st + 0.5) / steps) * 4;
      W.reset();
      const g = W.g;
      drawSky(g, t);
      if (S.water.length) {
        // live only while a touch or a ring is actually on the water
        const q = S.wbox, near = (rg) => Math.hypot(Math.max(0, C.x + q[0] - rg.x, rg.x - C.x - q[2]), Math.max(0, C.y + q[1] - rg.y, rg.y - C.y - q[3]) * 1.8) <= rg.reach;
        const live = OPT.touch || RINGS.some((rg) => t - rg.t0 >= 0 && t - rg.t0 < 1.2 && near(rg));
        if (live) drawWater(g, t);
        else { const wf = waterFrame(Math.floor((tm / 4) * 24) % 24); g.drawImage(wf.cv, C.x - wf.pad, C.y - wf.pad, wf.w, wf.h); }
      }
      const f = baked(st, tb);
      // the chunks a ring or a touch is passing through are drawn live; the rest is stamped
      const act = [];
      if (steps !== 1) for (let k = 0; k < ccols * crows; k++) {
        if (!S.chunks[k]) continue;
        const x0 = (k % ccols) * CHK, y0 = Math.floor(k / ccols) * CHK, x1 = x0 + CHK, y1 = y0 + CHK;
        let on = t - chunkT[k] < 1.15;
        for (const rg of RINGS) {
          if (on) break;
          const a = t - rg.t0; if (a < 0 || a * rg.speed > rg.reach + rg.speed * 1.15) continue;
          const rx = rg.x - C.x, ry = rg.y - C.y, front = a * rg.speed;
          const dmin = Math.hypot(Math.max(0, x0 - rx, rx - x1), Math.max(0, y0 - ry, ry - y1) * 1.8), dmax = Math.hypot(Math.max(Math.abs(x0 - rx), Math.abs(x1 - rx)), Math.max(Math.abs(y0 - ry), Math.abs(y1 - ry)) * 1.8);
          if (dmin <= Math.min(front + 26, rg.reach) && dmax >= front - rg.speed * 1.15 - 26) on = true;
        }
        if (!on && o.touchRegion) { const q = o.touchRegion(t); if (q && q[0] - C.x < x1 && q[2] - C.x > x0 && q[1] - C.y < y1 && q[3] - C.y > y0) on = true; }
        if (on) act.push(k);
      }
      if (act.length) {
        g.save(); g.beginPath(); g.rect(C.x - f.pad, C.y - f.pad, f.w, f.h);
        for (const k of act) g.rect(C.x + (k % ccols) * CHK, C.y + Math.floor(k / ccols) * CHK, CHK, CHK);
        g.clip('evenodd');
        g.drawImage(f.cv, C.x - f.pad, C.y - f.pad, f.w, f.h);
        g.restore();
        PX = W.ox || 0; PY = W.oy || 0;
        for (const k of act) drawLists(g, C.x, C.y, S.chunks[k], tb, true, W.dpr, W.dpr);
        PX = PY = 0;
      } else g.drawImage(f.cv, C.x - f.pad, C.y - f.pad, f.w, f.h);
      if (o.air !== false) drawAir(g, t);
      bakeAhead(steps);
    };
    // the air marks on their own, for a stack that draws them in its own layer (lib/layers.js: 6 air)
    C.drawAir = (Wscreen, t) => { if (!S || prepGen !== gen) return; W = Wscreen; W.reset(); drawAir(W.g, t); };
    C.ready = () => !!S && prepGen === gen;
    // the fields as prepared (texture cells): light, shade, mist steps, holes (1 open, 2 wall), solids, water
    C.fields = () => (S && prepGen === gen ? { L: S.L, sh: S.sh, mist: S.mist, hole: S.hole, solid: S.solid, wet: S.wet, cols, rows, cw, ch, ox: C.x, oy: C.y } : null);
    C.holes = () => (S && prepGen === gen ? S.holePath : null);
    // how loose the texture is at a stage point right now (the last draw's rings and touches): 0, 0.3, 0.6 or 1
    C.amt = (px, py) => { if (!S) return 0; const c = Math.floor((px - C.x) / cw), r = Math.floor((py - C.y) / ch); return c < 0 || r < 0 || c >= cols || r >= rows ? 0 : amtAt(r * cols + c, px - C.x, py - C.y); };
    C.baked = () => bakedAll;
    // step 3: baking on its own, so a room can be baked while another slides out – prepare() lays out every mark
    // (the slow part, once per paint), bakeOne() bakes the next wind step (and water step); true while more remain
    // step 3 r2: prepare(W, budget) prepares in slices of `budget` ms (false until done); without one, all at once
    C.prepare = (Wscreen, budget) => {
      W = Wscreen; if (!fontsSettled(W)) return false; if (prepGen === gen) return true;
      if (budget == null) { prep(); return true; }
      if (!PG) PG = prepG();
      DEAD = performance.now() + budget; const r = PG.next(); DEAD = Infinity;
      if (r.done) PG = null;
      return prepGen === gen;
    };
    C.bakeOne = (Wscreen, steps = 6) => { W = Wscreen; if (!S || prepGen !== gen) return true; if (!bakedAll) bakeAhead(steps); return !bakedAll; };
    C.stats = () => (S ? { strokes: S.items.cover.length + S.items.over.length, solids: S.items.solid.length, leaves: S.items.fol.length, water: S.water.length, air: S.air.length } : null);
    return C;
  }

  // a crown or a bush: n overlapping clumps scattered in an ellipse (in cells)
  function clumps(cx, cy, rx, ry, n, size = 2, seed = 1) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = hash(i, seed, 3) * TAU, d = Math.sqrt(hash(seed, i, 4)), k = 0.7 + hash(i, i + seed, 5) * 0.6;
      out.push({ disc: [cx + Math.cos(a) * d * rx, cy + Math.sin(a) * d * ry, size * 2 * k, size * k] });
    }
    // the lowest clumps first, so the upper ones (nearer the moon) are painted over them
    return out.sort((p, q) => q.disc[1] - p.disc[1]);
  }

  // ── a ruin: stone people built, read by its silhouette. Courses of blocks of uneven width (the
  // two lowest courses tall, of big blocks), a top broken by whole blocks and lower at the ends and
  // at one breach, an arch on two jambs, a doorway under a lintel, pillars (one broken), blocks
  // fallen at the foot, scree under the breach, moss along the base and in the joints.
  // In the canvas's cells; o.k scales the sizes for another tier (cv.k does it by default).
  function ruin(cv, o) {
    const k = o.k ?? cv.k, { c0, c1, foot, h } = o, seed = o.seed || 1, span = c1 - c0;
    let n = 0; const rnd = () => hash(seed, n++, 401);
    const breach = o.breach ?? c0 + span * (0.3 + rnd() * 0.4), bw = o.breachW ?? span * 0.14;
    const topAt = (x) => {
      const u = (x - c0) / span, ends = Math.pow(Math.abs(u - 0.5) * 2, 2.6) * h * 0.62, br = Math.max(0, 1 - Math.abs(x - breach) / bw) * h * 0.5;
      return foot - h + ends + br + vnoise(x / (6 * k), seed, 3) * h * 0.22;
    };
    const A = o.arch && { c: o.arch.c, rr: o.arch.w / 4, ys: foot + 1 - o.arch.h + o.arch.w / 4 };
    const inArch = (x, y) => A && Math.abs((x - A.c) * 0.5) < A.rr && y < foot + 1 && (y > A.ys || Math.hypot((x - A.c) * 0.5, y - A.ys) < A.rr);
    const inRing = (x, y) => { if (!A || y > A.ys + 0.3) return false; const d = Math.hypot((x - A.c) * 0.5, y - A.ys); return d >= A.rr && d < A.rr + 1.3 * k; };
    const D = o.door && { c0: o.door.c - o.door.w / 2, c1: o.door.c + o.door.w / 2, top: foot + 1 - o.door.h };
    const inDoor = (x, y) => D && x >= D.c0 && x < D.c1 && y >= D.top && y < foot + 1;
    const inLintel = (x, y) => D && y >= D.top - 1 && y < D.top && x >= D.c0 - 2 * k && x < D.c1 + 2 * k;
    const open = (x, y) => inArch(x, y) || inRing(x, y) || inDoor(x, y) || inLintel(x, y);
    const bbox = [c0 - 6, foot - h - 3, c1 + 6, foot + 2];
    const blocks = [];
    let rBot = foot, course = 0;
    while (rBot > foot - h - 1) {
      const tall = course < (o.base ?? 2) ? 2 : 1, rTop = rBot - tall + 1;
      let c = c0 - Math.floor(rnd() * 4 * k);
      while (c < c1) {
        const w = Math.max(2, Math.round(((tall === 2 ? 6 : 3) + rnd() * 6) * k));
        const a = Math.max(c, c0), b = Math.min(c + w, c1);
        if (b - a >= 2 && rTop + 0.5 >= topAt((a + b) / 2) && rnd() > 0.04) {
          let s = a;   // cut round the openings: the block splits into the runs of cells that are left
          for (let x = a; x <= b; x++) {
            if (x === b || open(x + 0.5, rTop + 0.5) || open(x + 0.5, rBot + 0.5)) { if (x - s >= 2) blocks.push({ block: [s, rTop, x, rBot + 1] }); s = x + 1; }
          }
        }
        c += w + (rnd() < 0.22 ? 1 : 0);   // now and then a gap: a joint of ink and moss
      }
      rBot = rTop - 1; course++;
    }
    if (D) blocks.push({ block: [Math.round(D.c0 - 2 * k), D.top - 1, Math.round(D.c1 + 2 * k), D.top], z: 1 });   // the lintel
    for (let j = 0; j < (o.fallen ?? 4); j++) {
      const w = Math.round((3 + rnd() * 4) * k), c = Math.round(c0 - 5 * k + rnd() * (span + 10 * k)), r = Math.round(foot + 1 + rnd() * 2.2 * k);
      blocks.push({ block: [c, r, c + w, r + 1], z: 2 });
    }
    for (const b of blocks) cv.paint('brick', { ...b, edge: 0.3, rough: 0 });
    // the wall's mass behind the blocks, up to the highest block in each column: ink, moss in the joints
    const colTop = new Map();
    for (const { block: [a, t, b2], z } of blocks) if (!z) for (let x = a; x < b2; x++) colTop.set(x, Math.min(colTop.get(x) ?? 1e9, t));
    cv.paint('brick', { fn: (x, y) => { const t = Math.min(colTop.get(Math.floor(x)) ?? 1e9, colTop.get(Math.floor(x) - 1) ?? 1e9, colTop.get(Math.floor(x) + 1) ?? 1e9); return x >= c0 && x < c1 && y >= t && y < foot + 1 && !open(x, y) ? 1 : -9; }, core: true, bbox, edge: 0.3, rough: 0 });
    if (A) cv.paint('brick', { fn: (x, y) => (inRing(x, y) ? 1 : -9), arch: [A.c, A.ys], bbox, edge: 0.3, rough: 0 });
    for (const p of o.pillars || []) {
      const top = foot + 1 - p.h, half = p.w / 2;
      cv.paint('pillar', { rect: [p.c - half, top, p.c + half, foot + 1], edge: 0.4 });
      if (p.broken) cv.paint('pillar', { disc: [p.c + half * (rnd() < 0.5 ? -0.7 : 0.7), top, p.w * 0.8, 1.2 * k + p.broken], edge: 0.4, rough: 1.6 }, -2);
      if (p.drum) cv.paint('brick', { block: [Math.round(p.c + half + 2 * k), foot, Math.round(p.c + half + 2 * k + p.w * 1.6), foot + 1], z: 2, edge: 0.3, rough: 0 });
    }
    cv.paint('moss', { line: [[c0 - 3 * k, foot + 0.6], [c1 + 3 * k, foot + 0.6]], width: 1.8 * k, edge: 1.5 }, 0.9);
    cv.paint('moss', { disc: [breach, topAt(breach) + 1.2, bw * 0.8, 1.6 * k] }, 0.8);
    cv.paint('scree', { disc: [breach + 3 * k, foot + 1.5 * k, bw * 1.1, 1.4 * k] }, 0.8);
    // the wall's own shadow on the ground in front of it, and the dark behind the openings
    cv.shadeAdd({ x: cv.x + ((c0 + c1) / 2 + span * 0.08) * cv.cw, y: cv.y + (foot + 1.8 * k) * cv.ch, rx: span * cv.cw * 0.56, ry: cv.ch * 1.4 * k });
    if (A || D) cv.shadeAdd({ fn: (x, y) => inArch(x, y) || inDoor(x, y), bbox });
    return { topAt, blocks };
  }

  // a trail of paw prints along a line, left and right in turn, every `gap` rows
  function paws(cv, pts, gap = 2.4) {
    let carry = 0, side = 1;
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], dx = (bx - ax) * 0.5, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      let s = carry;
      for (; s < L; s += gap) { const f = s / L; cv.stamp('paw', ax + (bx - ax) * f + nx * side * 1.1, ay + (by - ay) * f + ny * side * 0.55); side = -side; }
      carry = s - L;
    }
  }

  window.WK_BRUSH = { TURN, BRUSHES, TIERS, TIER, DETAIL, T5, T6, MOON, canvas, clumps, ruin, paws, wind, windA, windW, MEM, gust: gustPx, vnoise, mix, step, ramp, ready: fontsSettled };
})();
