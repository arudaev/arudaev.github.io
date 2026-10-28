// place.js – a room written as data (PLAN.md step 2, SCOPE.md §7.2). A place file is plain JSON in places/;
// Claude Design and the game load the same file. WK_PLACE.load(url) → place; WK_PLACE.build(place, { tier })
// paints it into the layers' canvases (lib/brushes.js) and returns a scene that lib/layers.js draws and lib/room.js
// plays; WK_PLACE.check(scene) says whether the room is sound.
//
// Every coordinate is in the room's big grid: 160 × 45 cells of 8 × 16 px (lib/decisions.js), columns first,
// fractions allowed. A column is half a row, so a disc's rx is in columns and its ry in rows; a line's width is in
// rows. The texture is painted at the tier's cell (12 px at 56K) – the file never changes with the tier.
//
//   place, name, chapter, idea, learn      the room's number and name, its one idea, what the player learns
//   seed                                   the same seed paints the same room
//   light   { ambient, pools: [{ at, rad }] }   moonlight, low; one or two pools of light (lamps add their own)
//   wind    { toward: 'east' | 'south' …, k, area: [c0, r0, c1, r1] }   what carries loose letters (and bends the grass)
//   fog     { far, banks, hollows: [shape + k], streaks }   the fog mask: thicker far (up the screen) and in hollows
//   deep    { stars, words: [..], pages: [{ at, lines }] }   the night below the page, seen through holes
//   ground  [op]   layer 2 – short cover, the meadow's patches, soil, the path, the ditch, low rocks, prints
//   mid     [op]   layer 3 – trees, bushes, hedges, ruins: standing behind the walk area
//   front   [op]   layer 5 – tall grass and leaves nearer than anyone
//     an op is a brush:  { brush, rect | disc | line (+ width), amt, edge, rough, seed }
//       brush is any of WK_BRUSH.BRUSHES, or 'clear' (takes the ground cover out); 'ditch' opens the page
//     or a stamp:        { stamp: 'tree', kind, seed, at: [c, foot], h }  · { stamp: 'bush', at, r: [rx, ry], seed }
//                        { stamp: 'rock', at, r, seed, moss } (natural stone, in facets; 'stone' is the same)
//                        { stamp: 'hedge', line, r: [rx, ry], seed } · { stamp: 'ruin', c0, c1, foot, h, arch, door, seed }
//                        { stamp: 'paws', line, gap }
//   things  [{ id, thing, foot: [c, r], … }]   built things in layer 4, sorted by their feet:
//            sign { board } · lamp { rad } · page { box, lines, door: [c0, c1], holes: [[c0, r0, c1, r1]], opens } ·
//            tv { box, screen } · couch { box, seats }
//   words   [{ id, text, at: [c, r], dir: 'row' | 'col', on, cells, lying, wall, voice, hidden }]   big letters:
//            on a thing (on), settled on the grid, lying loose in the grass (lying), a wall (wall), a voice (voice:
//            italic, nobody's to place) or written in the background's colour (hidden: malifex reads it).
//            rails: [[[c, r], …], …] one track a letter, its waypoints after the letter's own cell (straight runs):
//            the letter sits on the ground, a push along the track moves it one cell, nothing else moves it
//   actors  [{ who, at: [c, feet row], face, pose, route, speed, says }]   harold, and the cast
//   bug     { here, route, speed, drops, note }    where Bug ran; in a chase, his loop and what he drops
//   events  [{ at, do: 'say' | 'pull' | 'counter' | 'bug', … }]   what happens on its own, by the room's clock
//   exits   [{ edge, rows | cols: [a, b] } | { cells: [c0, r0, c1, r1], press }, + to, way: 'back' | 'on', open, needs ]
//   walk    { area: [[c0, r0, c1, r1], ..] }   where feet can go; holes and footprints are taken out of it
//   solve   [{ word, at: [c, r], dir }]   where the letters must settle – the checks walk the room with it
//   air     { fireflies }
//   demo    { loop, script: [{ go: [c, r] } | { wait } | { a } | { b } | { aWhen: 'bugAhead' }] }   the room played by itself
(function () {
  const B = WK_BRUSH, { hash } = Webkeeper, D = WK_DECISIONS;
  const ROOM = D.camera.room;
  // the word book, so far: what a word does when its letters settle in a row or a column, and what it is then.
  // settled(n, dir) → { box, ops, lies, walk, block, opens }: brush ops in big cells relative to the word's first letter
  // (dir 'row': along is columns; 'col': along is rows). lies: it lies on the ground (drawn under the play layer);
  // walk / block: cells it makes walkable or shuts, relative too. The letters show only while they are loose.
  const flipOps = (ops) => ops.map((o) => { const s = (p) => [p[1] * 2, p[0] / 2], q = { ...o };
    if (o.line) q.line = o.line.map(s); if (o.rect) { const [a, b, c, d] = o.rect; q.rect = [b * 2, a / 2, d * 2, c / 2]; } if (o.disc) { const [a, b, c, d] = o.disc; q.disc = [b * 2, a / 2, d * 2, c / 2]; } return q; });
  const WORDS = {
    BRIDGE: { does: 'holds you up', settled: (n, dir) => {
      if (dir === 'col') {
        const ops = [];
        for (let y = -0.4; y <= n - 0.4; y += 0.75) ops.push({ brush: 'bark', line: [[-2.6, y], [3.6, y]], width: 0.34 });
        ops.push({ brush: 'bark', line: [[-3.2, -0.9], [-3.2, n]], width: 0.5 }, { brush: 'bark', line: [[4.2, -0.9], [4.2, n]], width: 0.5 });
        for (const [x, y] of [[-3.6, -1.5], [3.8, -1.5], [-3.6, n - 0.6], [3.8, n - 0.6]]) ops.push({ brush: 'pillar', rect: [x, y, x + 1.2, y + 1.5] });
        return { box: [-4, -2, 5, n + 1], ops, lies: true, walk: [-2, -1, 3, n] };
      }
      // a boardwalk: long boards lying along the way (wood lying down reads = - _), a cross-beam at each end, a post at
      // each corner; lit by its own small pool, so it is the brightest thing over the cut
      const ops = [];
      // three rows of boards, each row cut into boards of uneven length, staggered like a real deck
      [-1.5, -0.5, 0.5].forEach((y, k) => { let x = -1.6; const cuts = [[0.45, 0.8, 1], [0.3, 0.65, 1], [0.55, 1]][k]; for (const f of cuts) { const x1 = -1.6 + (n + 2.2) * f; ops.push({ brush: 'plank', block: [x, y, x1 - 0.1, y + 0.94], edge: 0.1, rough: 0 }); x = x1; } });
      for (const x of [-2.1, n + 0.9]) ops.push({ brush: 'plank', block: [x, -1.7, x + 1.2, 1.6], edge: 0.1, rough: 0 });
      for (const [x, y] of [[-3.2, -2.4], [n + 1.4, -2.4], [-3.2, 1.0], [n + 1.4, 1.0]]) ops.push({ brush: 'pillar', rect: [x, y, x + 1.2, y + 1.4] });
      ops.light = { at: [n / 2, -0.5], rad: 230 };
      return { box: [-3, -2.4, n + 2.2, 2.6], ops, lies: true, walk: [-1, -1, n, 1] };
    } },
    ENTER: { does: 'opens the door it lies in front of', opens: true, settled: (n) => ({ box: [-2, -1, n + 2, 2], lies: true,
      ops: [{ brush: 'brick', rect: [-1.5, -0.3, n + 0.5, 1.2] }, { brush: 'moss', rect: [-1.5, 0.6, n + 0.5, 1.3], amt: 0.5 }] }) },
    LAMP: { does: 'lights the dark', draws: 'lamp', glow: (n) => ({ at: [n / 2 - 0.5, -4], rad: 240 }), settled: (n) => ({ box: [-3, -6, n + 3, 1.5], lies: false,
      ops: [{ brush: 'pillar', rect: [n / 2 - 0.9, -4.2, n / 2 + 0.7, 0.8] }, { brush: 'light', disc: [n / 2, -4.6, 5, 2.2], amt: 0.9 }, { brush: 'light', disc: [n / 2, 0.5, 9, 2.4], amt: 0.5 }] }) },
    WIND: { does: 'blows loose things its way', settled: (n, dir) => { const ops = [{ brush: 'dry', rect: [-1, -0.6, n + 1, 1.2], amt: 0.8 }, { brush: 'cloud', line: [[-1, 0], [n + 3, -0.6]], width: 1.4 }]; return { box: [-2, -2, n + 4, 2], lies: true, ops: dir === 'col' ? flipOps(ops) : ops }; } },
    DOOR: { does: 'opens a wall', settled: (n) => ({ box: [-3, -6, n + 3, 2], lies: false, ruin: { c0: -2.5, c1: n + 1.5, foot: 1, h: 5, door: { c: n / 2 - 0.5, w: n, h: 3.5 } }, ops: [] }) },
    RAIN: { does: 'fills a dry channel', settled: (n, dir) => { const ops = [{ brush: 'water', rect: [-0.8, -0.7, n + 0.2, 1.1] }, { brush: 'reeds', rect: [-1.6, -0.9, -0.6, 1.2], amt: 0.7 }]; return { box: [-2, -1.5, n + 1, 1.8], lies: true, ops: dir === 'col' ? flipOps(ops) : ops }; } },
    BOAT: { does: 'floats', settled: (n) => ({ box: [-3, -4, n + 3, 1.6], lies: true,
      ops: [{ brush: 'bark', line: [[-1, 0.2], [n, 0.2]], width: 1.1 }, { brush: 'bark', line: [[-2, -0.6], [-1, 0.2]], width: 0.5 }, { brush: 'bark', line: [[n, 0.2], [n + 1, -0.6]], width: 0.5 }, { brush: 'twig', line: [[n / 2, 0], [n / 2, -3.2]], width: 0.5 }] }) },
    QUACK: { does: 'quacks back – the first toy', settled: (n) => ({ box: [-3, -2, n + 3, 2.4], lies: true,
      ops: [0, 1, 2, 3, 4, 5].map((k) => { const a = (k / 6) * Math.PI * 2; return { rock: [n / 2 + Math.cos(a) * (n / 2 + 1.2), 0.2 + Math.sin(a) * 1.4, 1.3, 0.6], seed: 30 + k }; }) }) },
    // STOP and POST are the same four letters (PUZZLES.md, puzzle 5): a STOP wall shuts a way until it's loosened, and
    // its letters pushed into POST stand up as a lamp post. STOP settled anywhere but home is a low brick barrier.
    STOP: { does: 'shuts a way until it is loosened', wall: true, settled: (n) => ({ box: [-2, -2, n + 2, 1.6], lies: false, block: [0, 0, n, 1],
      ops: [{ brush: 'brick', rect: [-0.5, -0.7, n + 0.5, 1] }, { brush: 'moss', rect: [-0.5, 0.4, n + 0.5, 1.1], amt: 0.4 }] }) },
    POST: { does: 'stands up as a lamp post and lights the way', draws: 'lamp', glow: (n) => ({ at: [n / 2 - 0.5, -4], rad: 260 }), settled: (n) => ({ box: [-3, -7, n + 3, 1.5], lies: false, block: [n / 2 - 1, 0, n / 2 + 1, 1],
      ops: [{ brush: 'pillar', rect: [n / 2 - 0.6, -4.8, n / 2 + 0.4, 0.8] }, { brush: 'plank', block: [n / 2 - 1.4, -5.6, n / 2 + 1.2, -4.8], edge: 0.1, rough: 0 }, { brush: 'light', disc: [n / 2, -5.2, 4, 1.8], amt: 0.95 }, { brush: 'light', disc: [n / 2, 0.5, 9, 2.4], amt: 0.55 }] }) },
    'KEEP OUT': { does: 'shuts a way – Bug wrote it, and it stands until it is loosened', wall: true, settled: (n) => ({ box: [-2, -2, n + 2, 1.6], lies: false, block: [0, 0, n, 1],
      ops: [{ brush: 'foliage', clumps: [n / 2, -0.4, n / 2 + 1, 1.2] }, { brush: 'dry', rect: [-1, 0, n + 1, 1.2], amt: 0.6 }] }) },
  };
  const COVER = ['grass', 'short', 'tall', 'dry', 'fur', 'moss', 'flowers', 'reeds'];
  const STAMPS = ['tree', 'bush', 'stone', 'rock', 'hedge', 'ruin', 'paws'];
  const bookOf = (text) => WORDS[text];
  // a solve entry names its word, or spells it out (step 3 r2: 0.6 has two letters on the doorstep already, so its word
  // is ENTER though only T E R lie in the grass)
  const solveText = (p, s) => s.text || ((p.words || []).find((x) => x.id === s.word) || {}).text;

  async function load(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status + ' ' + url);
    const p = await r.json(); p.__url = url; return p;
  }

  // ── a shape from the room's grid into a canvas's own cells (k: texture cells per big cell; c0, r0: the canvas's
  // first column and row in texture cells)
  function conv(op, k, r0, c0 = 0) {
    const o = {};
    if (op.rect) o.rect = [op.rect[0] * k - c0, op.rect[1] * k - r0, op.rect[2] * k - c0, op.rect[3] * k - r0];
    if (op.block) o.block = [op.block[0] * k - c0, op.block[1] * k - r0, op.block[2] * k - c0, op.block[3] * k - r0];
    if (op.disc) o.disc = [op.disc[0] * k - c0, op.disc[1] * k - r0, op.disc[2] * k, op.disc[3] * k];
    if (op.line) { o.line = op.line.map(([c, r]) => [c * k - c0, r * k - r0]); o.width = (op.width || 1) * k; }
    if (op.edge != null) o.edge = op.edge * 4 / 3;   // written in big rows; the brushes take edges in 12 px rows
    if (op.rough != null) o.rough = op.rough;
    if (op.seed != null) o.seed = op.seed;
    return o;
  }
  // a boulder's facets: two to five seeds inside it, from its seed
  function facets(C, R, rx, ry, seed) {
    const n = Math.max(2, Math.min(5, Math.round(rx * 0.32) + 1)), out = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + hash(seed, i, 3) * 1.2, d = 0.25 + hash(seed, i, 4) * 0.45; out.push([C + Math.cos(a) * rx * d, R + Math.sin(a) * ry * d - ry * 0.1]); }
    return out;
  }
  // the texture rows a converted shape can touch (with room for its edge)
  function texRows(sh) {
    if (sh.rect || sh.block) { const R = sh.rect || sh.block; return [Math.floor(R[1]) - 6, Math.ceil(R[3]) + 6]; }
    if (sh.disc) return [Math.floor(sh.disc[1] - sh.disc[3]) - 6, Math.ceil(sh.disc[1] + sh.disc[3]) + 6];
    if (sh.line) { const ys = sh.line.map((q) => q[1]), w = (sh.width || 1) / 2 + 6; return [Math.floor(Math.min(...ys) - w), Math.ceil(Math.max(...ys) + w)]; }
    return [-9999, 9999];
  }
  function rockAt(cv, C, R, rx, ry, seed, moss) {
    cv.paint('rock', { disc: [C, R, rx, ry], rough: 1.6, seed, facets: facets(C, R, rx, ry, seed || 1) });
    if (moss) cv.paint('moss', { disc: [C - rx * 0.2, R + ry * 0.35, rx * 0.7, ry * 0.45], seed: (seed || 1) + 1 }, moss);
  }
  // the rows an op covers, in big rows (to size the mid and front canvases)
  function rowsOf(op) {
    if (op.rect) return [op.rect[1], op.rect[3]];
    if (op.disc) return [op.disc[1] - op.disc[3], op.disc[1] + op.disc[3]];
    if (op.line) { const ys = op.line.map((p) => p[1]), w = (op.width || (op.r || [0, 2])[1] * 2) / 2 + 2; return [Math.min(...ys) - w, Math.max(...ys) + w]; }
    if (op.stamp === 'tree') return [op.at[1] - (op.h || 10) * 1.15 - 3, op.at[1] + 3];
    if (op.stamp === 'ruin') return [op.foot - op.h - 3, op.foot + 4];
    if (op.at) { const ry = (op.r || [4, 2])[1]; return [op.at[1] - ry * 2, op.at[1] + ry * 2]; }
    return [0, ROOM.rows];
  }

  // opt (step 3 r2, the world): extent [c0, r0, c1, r1] – the big cells the canvases cover (the room and its rims; the
  // walk grid stays the room's 160 × 45); overhang – columns the standing layers reach past it (a crown over the seam);
  // world { ox, oy, poses, bdpr } – tile mode, the world's wind at the scene's world offset (px); lamps – lights from
  // the areas next door (stage px of this scene), so a pool near the seam lights both sides
  function build(place, opt = {}) { const g = buildG(place, opt); let r; while (!(r = g.next()).done); return r.value; }
  // the same, one op a slice (step 3 r2: the world builds the area ahead while you walk)
  function* buildG(place, opt = {}) {
    const T = B.TIER[opt.tier] || B.TIER['56K'], cell = T.cell, k = 16 / cell, kk = 12 / cell, ch = cell, cw = cell / 2;
    const E = opt.extent || place.extent || [0, 0, ROOM.cols, ROOM.rows], seed = place.seed || 1, Wo = opt.world;
    const X0 = Math.floor((E[0] * 8) / cw), X1 = Math.ceil((E[2] * 8) / cw), RA = Math.floor(E[1] * k), RB = Math.ceil(E[3] * k), ov = Math.round(((opt.overhang || 0) * 8) / cw);
    // (Wo.gl: the marks are drawn on the GPU – lib/marks.js – so the canvases bake no tiles)
    const tw = (s, band) => (Wo ? { wind: 'world', wx: Wo.ox || 0, wy: Wo.oy || 0, poses: Wo.gl ? 0 : band ? Wo.posesBand || 8 : Wo.poses || 12, band, bdpr: Wo.bdpr || 1 } : {});
    const mk = (a, b, s, wide, band) => B.canvas({ x: (wide ? X0 - ov : X0) * cw, y: a * ch, cols: (wide ? X1 + ov : X1) - (wide ? X0 - ov : X0), rows: Math.max(1, b - a), cell, tier: T.name, seed: seed + s, ...tw(s, band) });
    const span = (ops, pad) => { if (!ops || !ops.length) return null; let a = 1e9, b = -1e9; for (const op of ops) { const [y0, y1] = rowsOf(op); a = Math.min(a, y0); b = Math.max(b, y1); } return [Math.max(RA, Math.floor((a - pad) * k)), Math.min(RB, Math.ceil((b + pad) * k))]; };
    const G = mk(RA, RB, 0);
    const ms = span(place.mid, 2), M = ms && mk(RA, ms[1], 11, true, true);   // starts at the ground's first row: its cells are the ground's
    const fs = span(place.front, 2), F = fs && mk(fs[0], fs[1], 23, true, true);
    const holeOps = (place.ground || []).filter((op) => op.brush === 'ditch');
    const ds = span(holeOps, 1), Dp = ds && mk(ds[0], ds[1], 31);
    const r0Of = (cv) => Math.round(cv.y / ch), c0Of = (cv) => Math.round(cv.x / cw);
    // a tree or a ruin painted into the mid layer lays its shadow on the ground
    const shadeTo = (cv) => (cv === G ? G : Object.assign(Object.create(cv), { shadeAdd: (e) => { G.shadeAdd(e); cv.shadeAdd(e); return cv; } }));
    const feet = [];   // footprints, in big cells: [c0, r0, c1, r1] – not walkable
    const doors = [];  // cells shut until a word opens them: { id, cells: [c0, r0, c1, r1] }
    const unknown = [];
    function run(cv, op) { const g = runG(cv, op); while (!g.next().done); }
    function* runG(cv, op) {
      const r0 = r0Of(cv), x0 = c0Of(cv);
      if (op.brush) {
        if (op.brush !== 'clear' && !B.BRUSHES[op.brush]) { unknown.push(op.brush); return; }
        const sh = conv(op, k, r0, x0), amt = op.amt ?? 1, [ya, yb] = texRows(sh);
        // painted a band of 10 rows at a time, so no slice of the build is long
        for (let y = ya; y < yb; y += 10) {
          const s2 = { ...sh, band: [y, y + 10] };
          if (op.brush === 'clear') { for (const n of COVER) if (cv.has(n)) cv.paint(n, s2, -1.4 * amt); }
          else cv.paint(op.brush, s2, amt);
          yield;
        }
        return;
      }
      if (!STAMPS.includes(op.stamp)) { unknown.push(op.stamp); return; }
      const [c, r] = op.at || [0, 0], C = c * k - x0, Rr = r * k - r0, [rx, ry] = op.r || [4, 1.5];
      switch (op.stamp) {
        case 'tree': {
          const t = WK_TREE.grow(op.seed || 700, { kind: op.kind || 'oak', height: (op.h || 10) * k }); yield;
          const gd = { disc: [c * k - c0Of(G), r * k - r0Of(G), 7 * kk, 1.6 * kk] }; G.paint('grass', gd, -0.5); G.paint('short', gd, 0.6); G.paint('moss', { disc: [gd.disc[0] - 2, gd.disc[1] + 0.6, 5 * kk, 1.1 * kk] }, 0.45);
          yield* WK_TREE.paintG(shadeTo(cv), t, C, Rr, { leaf: op.leaf, girth: op.girth });
          feet.push([c - 2, r - 1, c + 3, r + 1]);
          break;
        }
        case 'bush': {
          for (const q of B.clumps(C, Rr, rx * k, ry * k, Math.round(6 + rx * k * 0.5), 1.5 * kk, op.seed || 1)) { cv.paint('foliage', q); yield; }
          if (cv !== F) { G.shadeAdd({ x: (c + rx * 0.3) * 8, y: (r + ry * 0.7) * 16, rx: rx * 8 * 0.9, ry: ry * 9 }); feet.push([c - rx * 0.7, r - ry * 0.4, c + rx * 0.7, r + ry * 0.6]); }
          break;
        }
        case 'hedge': {
          // bushes along a line, close enough to be one hedge; nothing passes it
          const pts = op.line, step = ry * 1.3;
          for (let s = 0; s < pts.length - 1; s++) {
            const [a, b] = pts[s], [e, f] = pts[s + 1], L = Math.hypot((e - a) / 2, f - b), n = Math.max(1, Math.round(L / step));
            for (let j = 0; j <= n; j++) {
              const u = j / n, hc = a + (e - a) * u, hr = b + (f - b) * u, sd = (op.seed || 1) + s * 31 + j;
              cv.paint('foliage', B.clumps(hc * k - x0, hr * k - r0, rx * k * (0.85 + hash(sd, 1, 9) * 0.3), ry * k, Math.round(5 + rx * k * 0.5), 1.4 * kk, sd)); yield;
              if (cv !== F) G.shadeAdd({ x: (hc + rx * 0.3) * 8, y: (hr + ry * 0.7) * 16, rx: rx * 8, ry: ry * 9 });
              feet.push([hc - rx * 0.8, hr - ry * 0.6, hc + rx * 0.8, hr + ry * 0.7]);
            }
          }
          break;
        }
        case 'stone': case 'rock':
          rockAt(cv, C, Rr, rx * k, ry * k, op.seed || 1, op.moss);
          feet.push([c - rx * 0.85, r - ry * 0.6, c + rx * 0.85, r + ry * 0.8]);
          break;
        case 'ruin': {
          const s = (v) => v && { c: v.c * k, w: v.w * k, h: v.h * k };
          B.ruin(shadeTo(cv), { c0: op.c0 * k - x0, c1: op.c1 * k - x0, foot: op.foot * k - r0, h: op.h * k, arch: s(op.arch), door: s(op.door), breach: op.breach && op.breach * k, breachW: op.breachW && op.breachW * k, seed: op.seed, fallen: op.fallen });
          feet.push([op.c0, op.foot - 1, op.c1, op.foot + 1]);
          break;
        }
        case 'paws': B.paws(cv, op.line.map(([a, b]) => [a * k - x0, b * k - r0]), (op.gap || 1.8) * k); break;
      }
    }
    // one op a slice, and the big ones (trees, bushes, hedges) a few strokes a slice; window.__wkOps records the slowest pieces
    function* timed(cv, op) { const g = runG(cv, op); let t0 = performance.now(), worst = 0; while (!g.next().done) { const d = performance.now() - t0; if (d > worst) worst = d; yield; t0 = performance.now(); } worst = Math.max(worst, performance.now() - t0); if (window.__wkOps) window.__wkOps.push([op.stamp || op.brush, op.kind || '', Math.round(worst * 10) / 10]); }
    for (const op of place.ground || []) { yield* timed(G, op); yield; }
    if (M) for (const op of place.mid) { yield* timed(M, op); yield; }
    if (F) for (const op of place.front) { yield* timed(F, op); yield; }
    // the night below the page: stars over the holes' rows
    if (Dp) Dp.paint('deep', { rect: [-4, -4, Dp.cols + 4, Dp.rows + 4], edge: 0.5 }, (place.deep && place.deep.stars) ?? 1);
    // light: the moon (low), the pools, the lamps among the things, and the built things' own shadows on the ground
    const things = place.things || [], lamps = [], shade = [];
    for (const l of opt.lamps || []) lamps.push(l);
    for (const pl of (place.light && place.light.pools) || []) lamps.push({ x: (pl.at[0] + 0.5) * 8, y: (pl.at[1] + 0.5) * 16, rad: pl.rad || 300, k: pl.k ?? 0.9 });
    for (const th of things) {
      const [c, r] = th.foot, x = (c + 0.5) * 8, y = (r + 1) * 16;
      if (th.thing === 'lamp') lamps.push({ x, y: y - 4, rad: th.rad || 320 });
      if (th.glow) lamps.push({ x: (th.glow.at[0] + 0.5) * 8, y: (th.glow.at[1] + 0.5) * 16, rad: th.glow.rad || 300, k: th.glow.k ?? 0.9 });
      if (th.box) {
        const [c0, r0, c1, r1] = th.box, dr = th.door;
        shade.push({ x: (c0 + c1) / 2 * 8 + 24, y: (r1 + 1.4) * 16, rx: (c1 - c0) * 4 + 8, ry: 18 });
        if (dr) { feet.push([c0, r0, dr[0], r1 + 1], [dr[1] + 1, r0, c1 + 1, r1 + 1], [dr[0], r0, dr[1] + 1, r1 - 2]); doors.push({ id: th.id, cells: [dr[0], r1 - 2, dr[1] + 1, r1 + 1], opens: th.opens }); }
        else feet.push([c0, r0, c1 + 1, r1 + 1]);
      } else { shade.push({ x: x + 9, y: y + 2, rx: 13, ry: 5 }); feet.push([c, r, c + 1, r + 1]); }
    }
    const LS = { ambient: (place.light && place.light.ambient) ?? 0.22, lamps, glades: [] };
    G.light({ ...LS, shade });
    for (const cv of [M, F, Dp]) if (cv) cv.light(LS);
    // the fog mask: one field for the scene; the mid layer takes more of it (fog hides the far first), the front none
    if (place.fog && window.WK_LAYERS) { const f = WK_LAYERS.fogField(place.fog, Wo ? Wo.ox || 0 : 0, Wo ? Wo.oy || 0 : 0); G.fog(f, { streaks: place.fog.streaks ?? 0.22 }); if (M) M.fog((X, Y, w, h) => f(X, Y, w, h) * 1.1, { streaks: 0.1 }); }

    const sc = { place, tier: T, k, cell, G, M, F, D: Dp, LS, things, extent: E, ox: Wo ? Wo.ox || 0 : 0, oy: Wo ? Wo.oy || 0 : 0, words: place.words || [], feet, doors, unknown, lamps,
      ready: () => [G, M, F, Dp].every((cv) => !cv || cv.ready()), things2: {} };
    sc.walk = (state) => walkGrid(sc, state);
    sc.thing = (text, at, dir) => thingFor(sc, text, at, dir);
    // the words the room is solved with get their things built now, so becoming bakes nothing
    for (const s of place.solve || []) { const tx = solveText(place, s); if (tx) sc.thing(tx, s.at, s.dir || 'row'); }
    sc.canvases = () => [G, M, F, Dp, ...Object.values(sc.things2).map((x) => x && x.cv)].filter(Boolean);
    sc.layers = () => [G, M, F, Dp].filter(Boolean);
    sc.becomeCanvases = () => Object.values(sc.things2).map((x) => x && x.cv).filter(Boolean);
    return sc;
  }

  // ── a word that became a thing: a small canvas painted with the word book's drawing, lit like the room
  function thingFor(sc, text, at, dir = 'row') {
    const key = text + '@' + at.join(',') + dir;
    if (key in sc.things2) return sc.things2[key];
    const def = bookOf(text), n = text.length;
    if (!def || !def.settled) return (sc.things2[key] = null);
    const d = def.settled(n, dir), [a0, b0, a1, b1] = d.box, T = sc.tier, cell = T.cell, k = 16 / cell;
    const c0 = Math.floor(at[0] + a0) - 1, r0 = Math.floor(at[1] + b0) - 1, c1 = Math.ceil(at[0] + a1) + 1, r1 = Math.ceil(at[1] + b1) + 1;
    const cv = B.canvas({ x: c0 * 8, y: r0 * 16, cols: Math.ceil((c1 - c0) * k), rows: Math.ceil((r1 - r0) * k), cell, tier: T.name, seed: (sc.place.seed || 1) + 71 });
    const rel = (op) => { const q = { ...op }; const s = ([c, r]) => [c + at[0] - c0, r + at[1] - r0];
      if (op.line) q.line = op.line.map(s); if (op.rect) { const [x0, y0] = s(op.rect), [x1, y1] = s(op.rect.slice(2)); q.rect = [x0, y0, x1, y1]; }
      if (op.block) { const [x0, y0] = s(op.block), [x1, y1] = s(op.block.slice(2)); q.block = [x0, y0, x1, y1]; }
      if (op.disc) { const [x, y] = s(op.disc); q.disc = [x, y, op.disc[2], op.disc[3]]; } return q; };
    for (const op0 of d.ops) {
      if (op0.rock) { const [x, y, rx, ry] = op0.rock; rockAt(cv, (x + at[0] - c0) * k, (y + at[1] - r0) * k, rx * k, ry * k, op0.seed, 0.3); continue; }
      if (op0.clumps) { const [x, y, rx, ry] = op0.clumps; cv.paint('foliage', B.clumps((x + at[0] - c0) * k, (y + at[1] - r0) * k, rx * k, ry * k, Math.round(5 + rx * k * 0.5), 1.4, 5)); continue; }
      const op = rel(op0);
      cv.paint(op.brush, conv(op, k, 0, 0), op.amt ?? 1);
    }
    if (d.ruin) { const R = d.ruin; B.ruin(cv, { c0: (R.c0 + at[0] - c0) * k, c1: (R.c1 + at[0] - c0) * k, foot: (R.foot + at[1] - r0) * k, h: R.h * k, door: { c: (R.door.c + at[0] - c0) * k, w: R.door.w * k, h: R.door.h * k }, seed: 5 }); }
    const own = d.ops.light ? [{ x: (at[0] + d.ops.light.at[0] + 0.5) * 8, y: (at[1] + d.ops.light.at[1] + 0.5) * 16, rad: d.ops.light.rad, k: 0.9 }] : [];
    // a word become a thing is something you play with: it is lit as by the brush cards' moon, never lost in the room's dark
    cv.light({ ...sc.LS, ambient: Math.max(0.34, sc.LS.ambient), lamps: [...sc.LS.lamps, ...own] });
    return (sc.things2[key] = { cv, text, at, dir, lies: d.lies, feet: (at[1] + b1) * 16, walk: d.walk, block: d.block });
  }

  // ── where feet can go, in big cells: the walk area, less the holes and every footprint; words that became things
  // add theirs (a bridge's deck) and doors open. state: true (the room solved), false, or { becomes: [{ text, at, dir }], open }
  const solveList = (p) => (p.solve || []).map((s) => { const tx = solveText(p, s); return tx && { text: tx, at: s.at, dir: s.dir || 'row' }; }).filter(Boolean);
  function walkGrid(sc, state) {
    const { cols, rows } = ROOM, g = new Uint8Array(cols * rows), p = sc.place, F = sc.G.fields();
    const all = state === true, becomes = all ? solveList(p) : (state && state.becomes) || [];
    const open = all ? new Set(sc.doors.map((d) => d.id)) : (state && state.open) || new Set();
    const fill = (c0, r0, c1, r1, v) => { for (let r = Math.max(0, Math.floor(r0)); r < Math.min(rows, Math.ceil(r1)); r++) for (let c = Math.max(0, Math.floor(c0)); c < Math.min(cols, Math.ceil(c1)); c++) g[r * cols + c] = v; };
    for (const [c0, r0, c1, r1] of (p.walk && p.walk.area) || [[0, 0, cols, rows]]) fill(c0, r0, c1, r1, 1);
    // (step 3 r2: water is not walkable; the canvas may start above or left of the room – its rims)
    if (F) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!g[r * cols + c]) continue;
      const ox = sc.G.x, oy = sc.G.y, x0 = Math.floor((c * 8 - ox) / F.cw), x1 = Math.floor(((c + 1) * 8 - 0.01 - ox) / F.cw), y0 = Math.floor((r * 16 - oy) / F.ch), y1 = Math.floor(((r + 1) * 16 - 0.01 - oy) / F.ch);
      for (let y = y0; y <= y1 && g[r * cols + c]; y++) for (let x = x0; x <= x1; x++) if (y >= 0 && x >= 0 && y < F.rows && x < F.cols && (F.hole[y * F.cols + x] || F.wet[y * F.cols + x])) { g[r * cols + c] = 0; break; }
    }
    for (const [c0, r0, c1, r1] of sc.feet) fill(c0, r0, c1, r1, 0);
    // unsolved, a wall of letters stands where it was written (in play, the letters themselves block: lib/room.js)
    if (state === false) for (const w of p.words || []) if (w.wall) [...w.text].forEach((ch, j) => { if (ch !== ' ') { const c = w.at[0] + (w.dir === 'col' ? 0 : j), r = w.at[1] + (w.dir === 'col' ? j : 0); if (c >= 0 && r >= 0 && c < cols && r < rows) g[r * cols + c] = 0; } });
    for (const d of sc.doors) fill(...d.cells, open.has(d.id) ? 1 : 0);
    for (const b of becomes) {
      const def = bookOf(b.text); if (!def || !def.settled) continue;
      const s = def.settled(b.text.length, b.dir || 'row'), [c, r] = b.at;
      if (s.walk) fill(c + s.walk[0], r + s.walk[1], c + s.walk[2] + 1, r + s.walk[3] + 1, 1);
      if (s.block) fill(c + s.block[0], r + s.block[1], c + s.block[2], r + s.block[3], 0);
    }
    return g;
  }
  function flood(g, starts) {
    const { cols } = ROOM, seen = new Uint8Array(g.length), st = [];
    for (const [c, r] of starts) { const i = Math.round(r) * cols + Math.round(c); if (g[i]) { seen[i] = 1; st.push(i); } }
    while (st.length) { const i = st.pop(), c = i % cols; for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) if (j >= 0 && j < g.length && g[j] && !seen[j]) { seen[j] = 1; st.push(j); } }
    return seen;
  }
  const exitCells = (e) => {
    const out = [], { cols, rows } = ROOM;
    if (e.cells) { const [c0, r0, c1, r1] = e.cells; for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) out.push([c, r]); return out; }
    const [a, b] = e.rows || e.cols || [0, 0];
    for (let v = a; v <= b; v++) out.push(e.edge === 'west' ? [0, v] : e.edge === 'east' ? [cols - 1, v] : e.edge === 'north' ? [v, 0] : [v, rows - 1]);
    return out;
  };

  // ── the checks: is the room sound? (needs the ground prepared: sc.ready())
  function check(sc) {
    const p = sc.place, out = [], add = (ok, msg, warn) => out.push({ ok: !!ok, msg, warn: !ok && !!warn });
    const { cols, rows } = ROOM, inside = ([c, r]) => c >= 0 && r >= 0 && c < cols && r < rows;
    add(p.place && p.name && p.idea, 'names its number, its name and its one idea');
    add(!sc.unknown.length, sc.unknown.length ? 'unknown brush or stamp: ' + [...new Set(sc.unknown)].join(', ') : 'every brush and stamp is known');
    const pts = [...(p.things || []).map((t) => t.foot), ...(p.words || []).map((w) => w.at || w.cells[0]), ...(p.actors || []).map((a) => a.at), ...(p.solve || []).map((s) => s.at)];
    add(pts.every(inside), 'everything it places is inside the room');
    const unknownWords = (p.words || []).filter((w) => !w.voice && !w.hidden && !bookOf(w.text)).map((w) => w.text);
    add(!unknownWords.length, unknownWords.length ? 'not in the word book: ' + unknownWords.join(', ') : 'its words are in the word book', true);
    const g0 = sc.walk(false), g1 = sc.walk(true);
    const exits = p.exits || [], back = exits.filter((e) => e.way !== 'on'), on = exits.filter((e) => e.way === 'on');
    const exitOk = exits.every((e) => e.press || exitCells(e).some(([c, r]) => (e.cells ? g1 : g0)[r * cols + c]));
    add(exits.length && exitOk, 'its exits sit on the edge (or a door), on ground you can walk');
    const hero = (p.actors || []).find((a) => a.who === 'harold'), start = hero ? [hero.at] : back.flatMap(exitCells);
    const reachOn = (g, list) => { const s = flood(g, start); return list.some((e) => exitCells(e).some(([c, r]) => s[r * cols + c])); };
    const walked = on.filter((e) => !e.open && !e.press && !e.needs), free = on.filter((e) => e.open), gated = on.filter((e) => e.press || e.needs);
    if (walked.length) { add(!reachOn(g0, walked), 'unsolved, the way on is shut'); add(reachOn(g1, walked), 'solved, the way on is open'); }
    if (free.length) add(reachOn(g0, free), 'the way on is open from the start – this room has nothing to solve');
    for (const e of gated) add(e.press ? true : reachOn(g0, [e]), 'the way on opens ' + (e.press ? 'when A is pressed at it' : '') + (e.needs ? (e.press ? ', ' : '') + 'once ' + e.needs : ''));
    if (back.length) add(back.every((e) => { const s = flood(g0, start); return exitCells(e).some(([c, r]) => s[r * cols + c]); }), 'the way back stays open');
    // nobody walks behind a tree: no walkable cell may lie above a mid thing's foot, within its width
    const behind = [];
    for (const op of p.mid || []) {
      if (!op.at || op.stamp === 'hedge') continue;
      const [c, r] = op.at, w = op.stamp === 'tree' ? (op.h || 10) * 0.9 : (op.r || [4])[0], h = op.stamp === 'tree' ? op.h || 10 : (op.r || [4, 2])[1] * 2;
      let n = 0; for (let y = Math.max(0, Math.floor(r - h)); y < Math.floor(r - 1); y++) for (let x = Math.max(0, Math.floor(c - w * 0.6)); x < Math.min(cols, Math.ceil(c + w * 0.6)); x++) n += g1[y * cols + x];
      if (n) behind.push((op.kind || op.stamp) + ' at ' + c);
    }
    add(!behind.length, behind.length ? 'walkable behind: ' + behind.join(', ') : 'tall things stand behind the walk area', true);
    const pools = ((p.light && p.light.pools) || []).length + (p.things || []).filter((t) => t.thing === 'lamp' || t.glow).length;
    const glades = [...(p.ground || []), ...(p.mid || [])].filter((op) => op.brush === 'light').length;
    add(pools + glades >= 2 && pools + glades <= 5, pools + ' pools and lamps, ' + glades + ' glades of light; between them the meadow is moonlit', true);
    return out;
  }

  window.WK_PLACE = { WORDS, ROOM, load, build, buildG, check, conv, exitCells, flood, solveList, solveText, bookOf };
})();
