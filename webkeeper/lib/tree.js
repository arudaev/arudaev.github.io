// tree.js – trees grown, not drawn. A tree is a short recursive rule: a trunk splits into
// branches, each split shorter and thinner, leaning to the light; then the crown is laid on
// as overlapping rings of loose glyphs around the twigs, layer by layer – the dark core first,
// then the middle, then a light, ragged edge. Any seed gives a tree; a fix here reaches all.
//
//   const tree = WK_TREE.grow(seed, { kind: 'oak', height: 16 });   // height in rows
//   WK_TREE.draw(W, tree, x, y, t, { gust: 0..1, night: false });     // x, y: the foot, in px
//   WK_TREE.paint(cv, tree, c, foot, { leaf, girth });                // with the brushes (lib/brushes.js)
//
// paint() lays the same tree into a brush canvas: bark along every thick segment (tapering, its
// letters by the segment's round), twigs as turned strokes, foliage clumps on the twig ends sorted
// dark core first, lit edge last, and the crown's shadow on the ground. Every cell keeps how far up
// the tree it is, so the canvas bakes it bending from the foot up, once per wind step.
//
// Geometry is in "units" of one row (ch): x and y alike, so a ring is round on screen.
// A glyph in the list: { x, y (units, up is negative), chr, col, size, ang, h (0 at the
// foot, 1 at the top: how much it sways), layer (0 wood, 1 core, 2 middle, 3 edge, 4 bloom),
// ph (its own flutter phase) }.
(function () {
  const { P, hash } = Webkeeper;

  // the kinds: how tall, how wide, how it splits, how full the crown is
  const KINDS = {
    oak:       { trunk: 0.34, split: [2, 3], spread: 0.62, shrink: 0.72, depth: 5, lean: 0, up: 0.10, crown: 1.0, width: 1.0 },
    tall:      { trunk: 0.42, split: [2, 2], spread: 0.36, shrink: 0.74, depth: 5, lean: 0, up: 0.22, crown: 0.95, width: 0.7 },
    wide:      { trunk: 0.26, split: [2, 3], spread: 0.86, shrink: 0.74, depth: 5, lean: 0, up: 0.02, crown: 1.05, width: 1.2 },
    young:     { trunk: 0.40, split: [2, 2], spread: 0.55, shrink: 0.70, depth: 4, lean: 0, up: 0.12, crown: 0.9, width: 0.5 },
    old:       { trunk: 0.28, split: [2, 3], spread: 0.78, shrink: 0.70, depth: 5, lean: 0, up: -0.04, crown: 0.85, width: 1.5, gnarl: 0.35, gaps: 0.35 },
    windswept: { trunk: 0.32, split: [2, 3], spread: 0.55, shrink: 0.72, depth: 5, lean: 0.55, up: 0.04, crown: 0.9, width: 0.9 },
    blossom:   { trunk: 0.33, split: [2, 3], spread: 0.66, shrink: 0.72, depth: 5, lean: 0, up: 0.08, crown: 0.95, width: 0.9, bloom: 0.16 },
  };

  // wood: the glyph follows the segment's direction on screen
  function woodChr(dx, dy) {
    const a = Math.atan2(dx, -dy);            // 0 = straight up, + = leaning right
    const aa = Math.abs(a);
    if (aa < 0.32) return '|';
    if (aa > 1.25) return '_';
    return a > 0 ? '/' : '\\';
  }

  // grow twice: once to measure how tall this seed's branches reach, then again with the trunk
  // scaled so the crown's top lands at the asked height – every seed fits its slot
  function grow(seed, opt = {}) {
    const H = opt.height || 16;
    const probe = growAt(seed, opt, 1);
    return growAt(seed, opt, (H * 0.8) / Math.max(1, probe.tipTop));
  }
  function growAt(seed, opt, trunkScale) {
    const K = { ...KINDS[opt.kind || 'oak'], ...(opt.tweak || {}) };
    const H = opt.height || 16;              // rows, foot to crown top (roughly)
    let n = 0;
    const R = () => hash(seed, n++, 911);
    const glyphs = [], tips = [], segs = [];
    // the trunk and branches
    function branch(x, y, ang, len, depth, w) {
      // a slightly bent segment, drawn as a few short straight pieces
      const pieces = 3;
      let px = x, py = y, a = ang;
      for (let i = 0; i < pieces; i++) {
        a += (R() - 0.5) * (0.18 + (K.gnarl || 0)) + K.lean * 0.06 * (1 - depth / K.depth);
        const l = len / pieces, nx = px + Math.sin(a) * l, ny = py - Math.cos(a) * l;
        segs.push({ x0: px, y0: py, x1: nx, y1: ny, w, d: depth });
        // glyphs along it, one every half column; thick wood gets two edges and a dim middle
        const steps = Math.max(1, Math.round(l / 0.5)), chr = woodChr(nx - px, ny - py);
        for (let s = 0; s < steps; s++) {
          const f = (s + 0.5) / steps, gx = px + (nx - px) * f, gy = py + (ny - py) * f;
          if (w > 0.7) {
            // thick wood: a glyph every half column across it – the moonlit edge, bark texture
            // inside, the shadowed edge – so a trunk has body instead of two thin lines
            const across = Math.max(2, Math.round(w / 0.5) + 1);
            for (let j = 0; j < across; j++) {
              const f2 = j / (across - 1) - 0.5, ox = Math.cos(a) * w * f2, oy = Math.sin(a) * w * f2;
              const edge = j === 0 || j === across - 1;
              glyphs.push({ x: gx + ox, y: gy + oy, chr: edge ? chr : (R() < 0.5 ? ':' : chr === '|' ? '!' : chr), col: j === 0 ? 'wood' : 'woodDark', size: 1, ang: 0, layer: 0 });
            }
          } else {
            glyphs.push({ x: gx, y: gy, chr, col: depth > 2 ? 'woodDark' : 'wood', size: w < 0.35 ? 0.85 : 1, ang: 0, layer: 0 });
          }
        }
        px = nx; py = ny;
      }
      if (depth >= K.depth || len < 0.9) { tips.push({ x: px, y: py, d: depth }); return; }
      // twigs along the upper branches also carry leaves
      if (depth >= 2) tips.push({ x: px, y: py, d: depth, inner: true });
      const kids = K.split[0] + (R() < 0.5 ? 0 : K.split[1] - K.split[0]);
      for (let k = 0; k < kids; k++) {
        const side = kids === 1 ? 0 : (k / (kids - 1)) * 2 - 1;
        const na = a * (1 - K.up) + side * K.spread * (0.7 + R() * 0.6) + (R() - 0.5) * 0.25 + K.lean * 0.12;
        branch(px, py, na, len * K.shrink * (0.85 + R() * 0.3), depth + 1, Math.max(0.2, w * 0.62));
      }
    }
    const trunk = H * K.trunk * trunkScale, w0 = 0.6 + K.width * 0.7;
    branch(0, 0, K.lean * 0.25 + (R() - 0.5) * 0.08, trunk, 0, w0);
    // roots: a short flare either side of the foot
    glyphs.push({ x: -w0 / 2 - 0.45, y: -0.1, chr: '_', col: 'woodDark', size: 1, ang: 0, layer: 0 });
    glyphs.push({ x: w0 / 2 + 0.45, y: -0.1, chr: '_', col: 'wood', size: 1, ang: 0, layer: 0 });
    glyphs.push({ x: -w0 / 2 - 0.2, y: -0.35, chr: '/', col: 'woodDark', size: 1, ang: 0, layer: 0 });
    glyphs.push({ x: w0 / 2 + 0.2, y: -0.35, chr: '\\', col: 'wood', size: 1, ang: 0, layer: 0 });

    // the crown: rings of glyphs round every tip, three layers. Each tip gets a blob whose
    // size grows with how far out it is; the blobs overlap into one irregular crown.
    let top = 0, minX = 0, maxX = 0;
    for (const t of tips) { top = Math.min(top, t.y); minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x); }
    const cx = (minX + maxX) / 2, cy = top + (H * K.crown) * 0.18;
    const LAYERS = [
      { layer: 1, r: 0.9, density: 1.1, chrs: '%#@&8', col: 'leafCore' },
      { layer: 2, r: 1.2, density: 0.55, chrs: '*o8%&', col: 'leafMid' },
      { layer: 3, r: 1.3, density: 0, chrs: ",.';`*", col: 'leafEdge' },   // the rim: a ring, not a fill
    ];
    const blobR = (0.7 + H * 0.065) * K.crown;   // small trees keep full clumps
    for (const L of LAYERS) for (const tip of tips) {
      if (tip.inner && (L.layer === 3 || R() < 0.5)) continue;
      if (K.gaps && R() < K.gaps * 0.6) continue;
      // low tips get small clumps, so the crown doesn't sag to the ground
      const lowness = Math.max(0, Math.min(1, (tip.y + H * 0.45) / (H * 0.25)));
      const r = blobR * L.r * (tip.inner ? 0.7 : 1) * (0.7 + R() * 0.6) * (1 - lowness * 0.6);
      // the core and middle fill their disc; the rim is a ring of glyphs round its edge, so each
      // clump of leaves reads as a round shape and the crown as clumps, not as noise
      const rim = L.layer === 3;
      const count = rim ? Math.round(r * Math.PI * 2 * 0.9) : Math.round(r * r * Math.PI * L.density);
      for (let i = 0; i < count; i++) {
        const th = rim ? (i / count) * Math.PI * 2 + R() * 0.3 : R() * Math.PI * 2;
        const rr = rim ? r * (0.82 + R() * 0.22) : r * Math.pow(R(), L.layer === 1 ? 0.8 : 0.55);
        let x = tip.x + Math.cos(th) * rr, y = tip.y + Math.sin(th) * rr * 0.78 - r * 0.25;
        if (y > -0.8) continue;                 // never below the first fork's height
        // moonlight from the upper left: the light side gets the light glyphs, the far side
        // stays dark, so the crown has a shape instead of a flat fill
        const lightness = ((cx - x) * 0.6 + (cy - y) * 0.9) / (H * 0.5) + (R() - 0.5) * 0.5;
        let layer = L.layer;
        if (layer === 2 && lightness < -0.2) layer = 1;
        if (layer === 2 && lightness > 0.9) layer = 3;
        if (layer === 3 && lightness < -0.1) layer = 2;     // the rim is only bright on the lit side
        const chrs = layer === L.layer ? L.chrs : LAYERS[layer - 1].chrs;
        glyphs.push({
          x, y, chr: chrs[Math.floor(R() * chrs.length)], col: LAYERS[layer - 1].col,
          size: layer === 3 ? 0.75 + R() * 0.3 : 0.8 + R() * 0.3, ang: (R() - 0.5) * 0.9, layer,
        });
      }
      // blossom: a few flowers on the outside of the crown
      if (K.bloom && L.layer === 3) for (let i = 0; i < r * r * K.bloom * 3; i++) {
        const th = R() * Math.PI * 2, rr = r * Math.sqrt(R());
        const y = tip.y + Math.sin(th) * rr * 0.78 - r * 0.25;
        if (y > -0.8) continue;
        glyphs.push({ x: tip.x + Math.cos(th) * rr, y, chr: R() < 0.6 ? '*' : 'o', col: R() < 0.55 ? 'bloomA' : 'bloomB', size: 0.95, ang: 0, layer: 4 });
      }
    }
    // the clumps for the brushes: one on each twig end, smaller low down and on the inner twigs
    let m2 = 0; const R2 = () => hash(seed, m2++, 977);
    const clumps = [];
    for (const tip of tips) {
      if (tip.inner && R2() < 0.45) continue;
      if (K.gaps && R2() < K.gaps * 0.5) continue;
      const lowness = Math.max(0, Math.min(1, (tip.y + H * 0.45) / (H * 0.25)));
      const r = blobR * (tip.inner ? 0.75 : 1) * (0.75 + R2() * 0.5) * (1 - lowness * 0.6), y = tip.y - r * 0.2;
      if (y > -1) continue;
      clumps.push({ x: tip.x, y, r, inner: !!tip.inner });
    }
    let kx0 = 1e9, kx1 = -1e9, ky0 = 1e9, ky1 = -1e9;
    for (const q of clumps) { kx0 = Math.min(kx0, q.x - q.r); kx1 = Math.max(kx1, q.x + q.r); ky0 = Math.min(ky0, q.y - q.r * 0.8); ky1 = Math.max(ky1, q.y + q.r * 0.8); }
    const crown = clumps.length ? { cx: (kx0 + kx1) / 2, cy: (ky0 + ky1) / 2, rx: (kx1 - kx0) / 2, ry: (ky1 - ky0) / 2 } : { cx: 0, cy: -H * 0.7, rx: 2, ry: 2 };
    // how high each glyph sits (for the sway), and its own flutter phase
    let maxH = 0.01;
    for (const g of glyphs) maxH = Math.max(maxH, -g.y);
    for (const g of glyphs) { g.h = Math.max(0, -g.y / maxH); g.ph = hash(seed, Math.round(g.x * 31), Math.round(g.y * 17)) * Math.PI * 2; }
    // draw order: core, wood, middle, edge, bloom – the core sits behind the branches, the
    // rest in front, so branches show through the gaps of the crown
    const order = { 1: 0, 0: 1, 2: 2, 3: 3, 4: 4 };
    glyphs.sort((a, b) => order[a.layer] - order[b.layer]);
    return { seed, kind: opt.kind || 'oak', glyphs, segs, clumps, crown, w0, bloom: K.bloom || 0, height: maxH, tipTop: -top, width: Math.max(maxX - minX + blobR * 3, w0 * 3) };
  }

  const COLS = {
    day:   { wood: P.beigeDim, woodDark: P.tealUp, leafCore: P.phosphorDeep, leafMid: P.phosphorDim, leafEdge: P.phosphor, bloomA: P.red, bloomB: P.beige },
    night: { wood: P.tealUp, woodDark: P.ocean, leafCore: P.ocean, leafMid: P.tealUp, leafEdge: P.tealHi, bloomA: P.redDim, bloomB: P.beigeDim },
  };

  // draw a grown tree with its foot at (x, y) px. It sways from the foot up: the trunk barely,
  // the crown's edge most. The wind is periodic in 4 s, so a recording loops cleanly.
  // A tree is drawn once per sway step (eight steps over the 4 s loop, two gust strengths) into a
  // small image of its own, and stamped after that: thousands of turned glyphs a frame made every
  // card with trees too slow for a design system page. Stepped sway is the look anyway.
  const STEPS = 8;
  function draw(W, tree, x, y, t, o = {}) {
    const step = Math.floor((((t % 4) + 4) % 4) / 4 * STEPS), gl = (o.gust || 0) > 0.5 ? 1 : 0;
    const key = [step, gl, o.night ? 1 : 0, o.scale || 1, W.ch, W.dpr].join('|');
    tree.cache = tree.cache || new Map();
    let img = tree.cache.get(key);
    if (!img) {
      // the tree's extent in px, with room for the sway
      const u = W.ch * (o.scale || 1);
      let x0 = 0, x1 = 0, y0 = 0;
      for (const g of tree.glyphs) { x0 = Math.min(x0, g.x); x1 = Math.max(x1, g.x); y0 = Math.min(y0, g.y); }
      const pad = 3 * u, w = (x1 - x0) * u + 2 * pad, h = -y0 * u + 2 * pad;
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(w * W.dpr); cv.height = Math.ceil(h * W.dpr);
      const ox = -x0 * u + pad, oy = -y0 * u + pad;
      // a stand-in screen that draws into the image instead of the card
      const off = Object.assign(Object.create(W), { g: cv.getContext('2d') });
      off.loose = (gx, gy, chr, col, ang = 0, size = W.ch) => {
        const c = off.g, k = Math.cos(ang) * W.dpr, s2 = Math.sin(ang) * W.dpr;
        c.setTransform(k, s2, -s2, k, gx * W.dpr, gy * W.dpr);
        c.font = `${Math.round(size)}px VT323, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = col; c.fillText(chr, 0, 0);
      };
      drawLive(off, tree, ox, oy, (step + 0.5) / STEPS * 4, { ...o, gust: gl ? 1 : 0 });
      img = { cv, ox, oy, w, h };
      if (document.fonts.check('16px VT323')) tree.cache.set(key, img);
    }
    W.reset();
    W.g.drawImage(img.cv, x - img.ox, y - img.oy, img.w, img.h);
  }
  function drawLive(W, tree, x, y, t, o = {}) {
    const u = W.ch * (o.scale || 1), C = COLS[o.night ? 'night' : 'day'];
    const TAU = Math.PI * 2, gust = o.gust || 0;
    const sway = Math.sin(TAU * t / 4 + tree.seed) * 0.32 + Math.sin(TAU * 2 * t / 4 + tree.seed * 3) * 0.1 + gust * 1.2;
    for (const gl of tree.glyphs) {
      const bend = sway * Math.pow(gl.h, 1.6);
      const flutter = gl.layer >= 2 ? Math.sin(TAU * 2 * t / 4 + gl.ph) * (0.05 + gust * 0.25) : 0;
      const gx = x + (gl.x + bend + flutter) * u, gy = y + (gl.y + Math.abs(bend) * 0.08 * gl.h) * u;
      // wood is drawn upright and only leans as a whole; leaves tilt with the wind
      const ang = gl.layer === 0 ? 0 : gl.ang + bend * 0.25 + flutter * 2;
      W.loose(gx, gy, gl.chr, C[gl.col], ang, W.ch * gl.size * (o.scale || 1));
    }
  }

  // ── the same tree, painted with the brushes into a WK_BRUSH canvas. c, foot: its foot, in the
  // canvas's cells; a unit of the tree is one row (two columns)
  function paint(cv, tree, c, foot, o = {}) { const g = paintG(cv, tree, c, foot, o); while (!g.next().done); return tree; }
  // the same, yielding every few strokes (step 3 r2: the world paints the area ahead in slices of a few ms)
  function* paintG(cv, tree, c, foot, o = {}) {
    let n = 0;
    const girth = o.girth ?? 1.7, leaf = o.leaf ?? 1, H = tree.height || 1;
    const X = (x) => c + x * 2, Y = (y) => foot + y, swayX = (c + 0.5) * cv.cw;
    const sway = (y) => Math.pow(Math.max(0, Math.min(1, -y / H)), 1.6);
    for (const s of tree.segs) {
      const w = s.w * girth, line = [[X(s.x0), Y(s.y0)], [X(s.x1), Y(s.y1)]], sw = sway((s.y0 + s.y1) / 2);
      if (w >= 0.8) cv.paint('bark', { line, width: w, sway: sw, swayX, edge: 0.5, rough: 0.6 });
      else cv.paint('twig', { line, width: 0.8, sway: sw, swayX, edge: 0.4, rough: 0 });
      if (++n % 5 === 0) yield;
    }
    // roots: a short flare either side of the foot
    const rw = tree.w0 * girth;
    for (const s of [-1, 1]) cv.paint('bark', { line: [[X(s * rw * 0.95), Y(0.4)], [X(s * rw * 0.2), Y(-0.9)]], width: 0.9, edge: 0.5, rough: 0 });
    if (leaf > 0) {
      const K = tree.crown, crown = [X(K.cx), Y(K.cy), K.rx * 2, K.ry];
      const lightness = (q) => (K.cx - q.x) * 0.6 + (K.cy - q.y) * 0.9 - (q.inner ? 2 : 0);
      const list = tree.clumps.slice().sort((a, b) => lightness(a) - lightness(b));
      for (let z = 0; z < list.length; z++) { const q = list[z]; cv.paint('foliage', { disc: [X(q.x), Y(q.y), q.r * 2, q.r * 0.8], crown, z, dim: q.inner ? 0.35 : 0, sway: Math.max(0.05, sway(q.y)), swayX, bloom: tree.bloom * 1.6, edge: 0.8 }, leaf); if (z % 3 === 2) yield; }
      // the crown's shadow lies on the ground to the lower right, away from the moon
      if (o.shade !== false) cv.shadeAdd({ x: cv.x + (X(K.cx) + K.rx * 1.1) * cv.cw, y: cv.y + (foot + 0.8) * cv.ch, rx: K.rx * 1.25 * cv.ch, ry: cv.ch * (1.4 + K.ry * 0.12) });
    }
    return tree;
  }

  window.WK_TREE = { KINDS, grow, draw, drawLive, paint, paintG };
})();
