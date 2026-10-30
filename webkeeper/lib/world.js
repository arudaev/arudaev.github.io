// world.js – one meadow (design/couch-games/09-SCREENS.md, 05-WORLD.md). Rooms 0.2–0.7 are areas of one continuous meadow: their place
// files are joined at their edges, each with its rims of trees and hedges, and past the page's edge the night below
// with the far pages. The picture takes its window's shape; a big cell is 8 × 16 css px, scaled by whole numbers so the
// view keeps 36–60 rows; the camera follows Harold. The areas next to Harold's are built, prepared and baked in slices
// of a few ms while he walks – no slide, no "the page loads". The key art is the title and the first area.
//   const G = WK_WORLD.create({ canvas, base, css: [w, h], dpr, budget, shot: { area, title }, bench, areas })
//   (areas: other place files than chapter 0's – the lab's)
//   window.__frame(t) (shot mode): the world replayed from 0 to t, the area's demo script walking Harold
//   G.bench(opt) → per-frame bake and draw times while Harold walks from 0.2 to 0.6
(function () {
  const { P, hash } = Webkeeper, B = WK_BRUSH, PL = WK_PLACE, L = WK_LAYERS, RM = WK_ROOM;
  const AC = 160, AR = 45, AW = AC * 8, PAD = 48, TOUCH = 3, DT = 1 / 60;
  const AREAS = ['0.2-landing', '0.3-quack', '0.4-ditch', '0.5-keep-out', '0.6-yard', '0.6i-page', '0.7-hermit', '0.1-couch'];
  // where an area lies in the strip, in area widths: its place in the list, unless it stands apart – the couch (the
  // prologue) is two widths west of the landing, past the dark, so the meadow never shows it and the list's numbers
  // (saves, ?shot=) stay as they were
  const SLOT = { '0.1-couch': -2 };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const STAR = [L.mix('ink', 'ocean', 0.8), P.ocean, L.mix('ocean', 'tealUp', 0.6), P.tealUp, L.mix('tealUp', 'tealHi', 0.5)];
  const LEAF = [L.mix('phosphorDeep', 'tealUp', 0.5), L.mix('phosphorDim', 'tealHi', 0.35), L.mix('phosphorDeep', 'beigeDim', 0.4)];
  const SOIL = B.T5.soil;
  const CONTROLS = ['arrows · wasd · stick · drag left: walk', 'space · j · A · tap right: quack, push', 'shift · k · B: switch to malifex', 'esc · start · [=]: the menu'];

  function create(cfg = {}) {
    const base = cfg.base || '../../', canvas = cfg.canvas, q = new URLSearchParams(location.search);
    const SHOT = cfg.shot || null, budget = cfg.budget ?? 6, showMs = q.has('ms');
    // the visitor number on the menu: Voyager's own (it sends it on the couch, and keeps the last one on this device);
    // on its own page, before any visit to the sea, there's no number to show – none is made up
    function seenVisitor() { try { return +localStorage.getItem('v56k.visitor') || 0; } catch (e) { return 0; } }
    // a reload while playing goes straight back into the game: this tab remembers it was playing – on the couch too,
    // where Voyager puts the game's own page in the address bar (src/ui/WorldHud.tsx), so the reload lands here
    const PLAYING = 'webkeeper.playing', alone = !(window.WK_HOST && WK_HOST.hosted());
    const playing = (on) => { try { if (on) sessionStorage.setItem(PLAYING, '1'); else sessionStorage.removeItem(PLAYING); } catch (e) { /* storage off */ } };
    let wasPlaying = false, saidPlaying = false;
    try { wasPlaying = alone && !cfg.bench && sessionStorage.getItem(PLAYING) === '1'; } catch (e) { /* storage off */ }
    // ?off=sky,ground,behind,play,water,front,air,light,ui – leave layers out of the picture, to see (and measure, with
    // scripts/motion) what each one does; the debug panel switches them too (G.off)
    const OFF = new Set((q.get('off') || '').split(',').filter(Boolean));
    const V = { cssW: 0, cssH: 0, s: 1, dpr: 1, k: 1, w: 0, h: 0, bdpr: 1 };
    const areas = [], cam = { x: 0, y: 0 }, bound = { x0: 0, y0: 0, x1: 0, y1: 0 };
    // the GPU draws every mark every frame (lib/marks.js); without WebGL2 the world falls back to baked wind poses
    let GLR = null; try { GLR = window.WK_GL && !cfg.noGL ? WK_GL.create() : null; } catch (e) { console.warn('marks on the GPU: ' + e.message); GLR = null; }
    const GL = () => !!(GLR && GLR.ok);
    let Wm = null, U = null, Um = null, Fb = null, Ab = null, phase = 0, loaded = false, err = null, cur = null, T = 0, DEADLINE = 0;
    let mode = SHOT && !SHOT.title ? 'play' : 'title', liftT = -9, startT = -9, sel = 0, showControls = false, hintW = null, nameW = null;
    let idle = 0, attract = null, visitors = seenVisitor(), lastHum = -7, mewNext = false, mewBy = 0, stats = { bake: 0, draw: 0, miss: 0 };
    let lastStep = -1, lastActs = -1, lastRings = -1, forceU = true, ready = false;

    // ── the view: css size, the whole-number zoom, device pixels per world px, the size in world px
    // the player's own zoom (the menu's `zoom`, or Voyager's settings on the couch): the usual view or a step or two
    // further out, kept on the device under the key Voyager's settings write too (the page is on Voyager's origin)
    const ZOOMS = [1, 0.75, 0.5];
    let zoomK = (() => { try { const z = +localStorage.getItem('v56k.wk.zoom'); return ZOOMS.includes(z) ? z : 1; } catch (e) { return 1; } })();
    function setZoom(z) { if (!ZOOMS.includes(z)) return; zoomK = z; try { localStorage.setItem('v56k.wk.zoom', String(z)); } catch (e) { /* storage blocked: this visit only */ } }
    const zoomName = () => 'zoom: ' + zoomK + 'x';
    function fitBox() { return mode !== 'title' && cur && cur.place && cur.place.fit; }
    function fitKey() { const f = fitBox(); return f ? f.join() : ''; }
    function size() {
      const w = cfg.css ? cfg.css[0] : innerWidth, h = cfg.css ? cfg.css[1] : innerHeight, dev = cfg.dpr || Math.min(2, devicePixelRatio || 1);
      if (!w || !h) return false;   // a window not laid out yet (an iframe loading): no zero-size buffers; frame() tries again
      let best = 1, bd = 1e9;
      for (let s = 1; s <= 4; s++) { const rows = h / (16 * s); if (s > 1 && w / (8 * s) < 44) break; const d = rows < 36 ? 36 - rows : rows > 60 ? rows - 60 : 0; if (d < bd - 1e-9) { bd = d; best = s; } }
      best *= zoomK;
      // a room that's one picture (the party) is shown whole where that costs at most a fifth of the zoom (a desktop, or
      // a phone zoomed out to 0.5x): its `fit` box in cells sets the zoom while it's played. A phone at its usual zoom
      // would see it at half size, too small to read, so it plays the room like chapter 0 instead – the camera with
      // Harold and whoever's speaking
      const fit = fitBox(), fz = fit ? Math.min(best, w / ((fit[2] - fit[0]) * 8), h / ((fit[3] - fit[1]) * 16)) : 0, whole = !!fit && fz >= best * 0.8;
      if (whole) best = fz;
      if (cfg.zoom) best = cfg.zoom;
      Object.assign(V, { cssW: w, cssH: h, s: best, dpr: dev, k: dev * best, w: w / best, h: h / best, fit: fitKey(), zk: zoomK, whole });
      V.bdpr = Math.min(V.k, Math.max(1, best) * (w * h < 450000 ? 1.5 : 1));
      canvas.style.cssText = `display:block;width:${w}px;height:${h}px;aspect-ratio:auto;touch-action:none`;
      if (!Wm) Wm = Webkeeper.screen(canvas, { cell: 16, w: V.w, h: V.h, dpr: V.k, fixed: true }); else Wm.resize(V.w, V.h, V.k);
      const bw = V.w + 2 * PAD, bh = V.h + 2 * PAD, mk = (X) => { if (X) { X.resize(bw, bh, V.k); return X; } return Webkeeper.screen(document.createElement('canvas'), { cell: 16, w: bw, h: bh, dpr: V.k, fixed: true }); };
      U = mk(U); Um = mk(Um); Fb = mk(Fb); Ab = mk(Ab);
      B.MEM.budget = Math.min(48e6, (V.w + 640) * (V.h + 400) * V.bdpr * V.bdpr * 14);
      for (const A of areas) if (A.sc) for (const cv of A.sc.layers()) cv.setBakeDpr(V.bdpr);
      forceU = true;
      return true;
    }
    // the window's size is checked every frame too – an iframe can load at 0 × 0 and grow without a resize event
    const sized = () => { const w = cfg.css ? cfg.css[0] : innerWidth, h = cfg.css ? cfg.css[1] : innerHeight; return w && h && w === V.cssW && h === V.cssH && V.fit === fitKey() && V.zk === zoomK && Wm; };
    if (!cfg.css) addEventListener('resize', size);
    size();

    // ── the areas: the place files, joined at their edges
    const lampsOf = (p) => [...((p.light && p.light.pools) || []).map((pl) => ({ x: (pl.at[0] + 0.5) * 8, y: (pl.at[1] + 0.5) * 16, rad: pl.rad || 300, k: pl.k ?? 0.9 })),
      ...(p.things || []).filter((t) => t.thing === 'lamp').map((t) => ({ x: (t.foot[0] + 0.5) * 8, y: (t.foot[1] + 1) * 16 - 4, rad: t.rad || 320, k: 0.95 }))];
    const nearLamps = (A) => { const out = []; for (const N of areas) if (Math.abs(N.slot - A.slot) === 1) for (const l of lampsOf(N.place)) { const x = l.x + N.ox - A.ox; if (x > -l.rad && x < AW + l.rad) out.push({ ...l, x }); } return out; };
    const treesOf = (p) => [...(p.mid || []), ...(p.front || [])].filter((op) => op.stamp === 'tree').map((op) => { const h = op.h || 10; return { x: (op.at[0] + 0.5) * 8, y: (op.at[1] + 1) * 16 - h * 16 * 0.75, rx: h * 8 * 0.7, ry: h * 16 * 0.18, drop: h * 16 * 0.7, seed: op.seed || 1 }; });
    const castOf = (p) => ['harold', ...new Set((p.actors || []).map((a) => a.who).filter((w) => w !== 'harold'))];
    (async () => {
      try {
        // a place can lay itself out differently on an upright screen (`tall`; none does at present)
        const upright = V.h > V.w, names = cfg.areas || AREAS, files = (await Promise.all(names.map((n) => PL.load(base + 'places/' + n + '.json')))).map((p) => (p.tall && upright ? { ...p, ...p.tall } : p));
        files.forEach((p, i) => areas.push({ i, slot: SLOT[names[i]] ?? i, name: names[i], place: p, ox: (SLOT[names[i]] ?? i) * AW, oy: 0, E: p.extent || [0, 0, AC, AR], sc: null, sim: null, job: null, ready: false, prints: [], last: new Map(), trees: treesOf(p), S: null, rec: null }));
        bound.x0 = Math.min(...areas.map((A) => A.ox + A.E[0] * 8)); bound.x1 = Math.max(...areas.map((A) => A.ox + A.E[2] * 8));
        bound.y0 = Math.min(...areas.map((A) => A.E[1] * 16)); bound.y1 = Math.max(...areas.map((A) => A.E[3] * 16));
        cur = areas[SHOT ? SHOT.area || 0 : 0];
        loaded = true;
      } catch (e) { err = String(e.message || e); }
    })();

    // ── building an area in slices: build (one op a slice), prepare each layer, turn its tiles, the cast, then play
    const left = () => Math.max(0.5, DEADLINE - performance.now());
    function* areaJob(A) {
      const opt = { world: { ox: A.ox, oy: A.oy, poses: 12, posesBand: 12, bdpr: V.bdpr, gl: GL() }, extent: A.E, overhang: 24, lamps: nearLamps(A) };
      const g = PL.buildG(A.place, opt); let r;
      while (!(r = g.next()).done) yield 'build';
      const sc = r.value;
      for (const cv of sc.layers()) while (!cv.prepare(Wm, left())) yield 'prep';
      if (GL()) {
        A.glh = {}; A.marks = 0;   // (an area built again counts its marks again, not on top of the last build's)
        for (const L of ['G', 'M', 'F']) { const cv = sc[L]; if (!cv) continue; while (!cv.glBuild(GLR.glyph, left())) yield 'gl'; A.glh[L] = GLR.upload(cv.glData()); cv.dropMarks(); A.marks = (A.marks || 0) + cv.glData().n; yield 'gl'; }
      }
      for (const cv of sc.becomeCanvases()) { while (!cv.prepare(Wm)) yield 'prep'; while (cv.bakeOne(Wm, 6)) yield 'bake'; }
      L.farImage(Wm, sc); yield 'bake';
      for (const [who, pose, fl, f] of WK_ACTORS.pending(castOf(A.place), Wm)) { WK_ACTORS.sprite(Wm, who, pose, fl, f); yield 'cast'; }
      A.sc = sc; A.sim = makeSim(A); A.S = A.sim.state(); A.ready = true;
      if (A.mem) { A.sim.restore(A.mem); A.met = true; A.sim.leave(); }   // built again: as it was left
      A.rec.wall = performance.now() - A.rec.t0;
    }
    function runJob(A, deadline) {
      if (!A.job) { A.job = areaJob(A); A.rec = { name: A.place.place + ' ' + A.place.name, build: 0, prep: 0, gl: 0, warm: 0, bake: 0, cast: 0, slices: 0, worst: 0, t0: performance.now() }; }
      DEADLINE = deadline; const t0 = performance.now();
      while (!A.ready && performance.now() < deadline) { const a = performance.now(), n = A.job.next(); if (n.done) break; const d = performance.now() - a; A.rec[n.value] += d; if (d > 12) (A.rec.long || (A.rec.long = [])).push(n.value + ' ' + Math.round(d)); }
      const d = performance.now() - t0; A.rec.slices++; A.rec.worst = Math.max(A.rec.worst, d);
    }
    function makeSim(A) {
      const demo = !!SHOT && (SHOT.area || 0) === A.i && !SHOT.title && !SHOT.still;
      const sim = RM.sim(A.sc, { world: true, demo, wind: (x, y) => B.windW(x + A.ox, y + A.oy, T) });
      if (A !== cur) sim.leave();
      return sim;
    }

    // ── input: keys, a gamepad, touch (drag the left half to walk; A and B bottom right; the menu top right)
    const keys = new Set(); let stick = null, tapA = false, tapB = false, touchUI = false, padWas = {}, hits = [], holdA = false, held = false;
    // the title is the key art and PLAY, nothing else; the rest lives in the menu (esc, start, [=])
    const items = () => (mode === 'menu' ? ['continue', 'controls', zoomName(), 'save code', 'load code', 'restart: prologue', window.WK_HOST && WK_HOST.hosted() ? 'sit back' : 'back to voyager'] : ['play']);
    function choose(i) {
      const it = items()[i];
      // (the A that chose is still held as the game starts – PLAY, continue, a new night, a loaded code: holdA keeps it
      // from quacking until it's let go)
      holdA = true;
      if (it === 'play' || it === 'continue') { if (mode === 'title') { mode = 'lift'; liftT = T; startT = T; attract = null; resume = true; if (window.WK_HOST) WK_HOST.fullscreen(); } else mode = 'play'; showControls = false; }
      else if (it === 'save code') { const code = SAVE.code(), shown = () => hint('save code: ' + code, 8); try { navigator.clipboard.writeText(code).then(() => hint('save code copied – paste it into "load code" on any device', 4), shown); } catch (e) { shown(); } }
      else if (it === 'load code') { const code = prompt('paste a webkeeper save code'); if (code && SAVE.load(code)) { mode = 'play'; talk = null; scene = null; card = null; hint('loaded – welcome back', 2.6); } else if (code) hint('that code doesn\'t look like a save', 2.6); }
      else if (it === 'controls') showControls = !showControls;
      else if (it === zoomName()) setZoom(ZOOMS[(ZOOMS.indexOf(zoomK) + 1) % ZOOMS.length]);   // 1x → 0.75x → 0.5x → 1x
      else if (it === 'restart: prologue') { G.newNight(); mode = 'play'; }
      // sitting back is Voyager's (lib/host.js tells the couch); played on its own there's no couch to sit back on
      // on its own page: back to Voyager, the portfolio round it (the save stays; this tab forgets it was playing)
      else if (it === 'back to voyager') { saidPlaying = false; playing(false); location.href = '/'; }
      else if (it === 'sit back') { if (window.WK_HOST && WK_HOST.hosted()) WK_HOST.send('sit-back'); else { G.title(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } }   // on its own (the lab, ?debug): back to the title
    }
    const inMenu = () => mode === 'title' || mode === 'menu';
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase(); idle = 0;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (inMenu()) {
        const N = items().length;
        if (k === 'arrowup' || k === 'w') sel = (sel + N - 1) % N; else if (k === 'arrowdown' || k === 's') sel = (sel + 1) % N;
        else if (k === 'enter' || k === ' ' || k === 'j') choose(sel); else if (k === 'escape' && mode === 'menu') mode = 'play';
        return;
      }
      // on the couch the menu is Voyager's (one menu for the game and the couch: src/ui/CouchGame.tsx)
      if (k === 'escape' || k === 'p') { if (window.WK_HOST && WK_HOST.hosted()) { keys.clear(); WK_HOST.send('menu'); } else { mode = 'menu'; sel = 0; } return; }
      // a key held down since it chose in the menu repeats into the game: not a walk or a quack until it's pressed again
      if (e.repeat && !keys.has(k)) return;
      keys.add(k);
      // a tap shorter than a frame still counts (a slow frame, a quick thumb)
      if (k === ' ' || k === 'j') tapA = true; else if (k === 'shift' || k === 'k') tapB = true;
    });
    addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    // the window losing focus (another tab, Voyager's own menu round the frame) never sends the keyup: nothing stays held
    addEventListener('blur', () => { keys.clear(); stick = null; });
    const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / V.s, y: (e.clientY - r.top) / V.s }; };
    canvas.addEventListener('pointerdown', (e) => {
      const p = local(e); idle = 0; if (e.pointerType !== 'mouse') touchUI = true;
      if (inMenu()) { const h = hits.find((b) => p.y >= b.y0 && p.y < b.y1); if (h) { sel = h.i; choose(h.i); } else if (mode === 'title') choose(0); return; }
      if (p.x > V.w - 48 && p.y < 40) { if (window.WK_HOST && WK_HOST.hosted()) WK_HOST.send('menu'); else { mode = 'menu'; sel = 0; } return; }
      if (p.x < V.w / 2) stick = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y };
      else { const P2 = pads(); if (Math.hypot(p.x - P2.B[0], p.y - P2.B[1]) < P2.r * 1.3) tapB = true; else tapA = true; }
    });
    canvas.addEventListener('pointermove', (e) => { if (stick && e.pointerId === stick.id) { const p = local(e); stick.x = p.x; stick.y = p.y; } });
    // (a touch the browser takes over – a scroll, a system gesture – ends in pointercancel, not pointerup)
    const lift = (e) => { if (stick && e.pointerId === stick.id) stick = null; };
    addEventListener('pointerup', lift); addEventListener('pointercancel', lift);
    // A and B on a phone: both on the arc the right thumb sweeps from where it rests (the screen's bottom-right corner),
    // about a third of the short side out – A higher, B lower and further in, like a handheld's pair – in css px turned
    // into world px. Anywhere else on the right half is A too, so a thumb that misses still quacks.
    function pads() {
      const k = 1 / V.s, R = clamp(Math.min(V.cssW, V.cssH) * 0.32, 104, 168), up = window.WK_HOST && WK_HOST.hosted() ? 32 : 0;   // above the couch's controls bar
      const at = (deg) => [V.w - R * Math.cos(deg * Math.PI / 180) * k, V.h - (R * Math.sin(deg * Math.PI / 180) + up) * k];
      return { A: at(58), B: at(22), r: 26 * k };
    }
    function input() {
      let x = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
      let y = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0);
      let a = keys.has(' ') || keys.has('j') || tapA, b = keys.has('shift') || keys.has('k') || tapB;
      const ext = window.WK_HOST && WK_HOST.pad;
      if (ext) { if (Math.abs(ext.x) + Math.abs(ext.y) > 0.1) { x = ext.x; y = ext.y; } a = a || ext.a; b = b || ext.b; }
      if (stick) { const dx = stick.x - stick.x0, dy = (stick.y - stick.y0) * 1.8, d = Math.hypot(dx, dy); if (d > 6) { x = dx / Math.max(d, 36); y = dy / Math.max(d, 36); } }
      const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
      if (gp) {
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, bt = (i) => gp.buttons[i] && gp.buttons[i].pressed;
        if (Math.hypot(ax, ay) > 0.22) { x = ax; y = ay; }
        if (bt(14)) x = -1; if (bt(15)) x = 1; if (bt(12)) y = -1; if (bt(13)) y = 1;
        a = a || bt(0); b = b || bt(1);
        const st = bt(9);
        if (inMenu()) { const N = items().length; if (bt(12) && !padWas.u) sel = (sel + N - 1) % N; if (bt(13) && !padWas.d) sel = (sel + 1) % N; if ((bt(0) || st) && !padWas.a) choose(sel); }
        else if (st && !padWas.s) { if (window.WK_HOST && WK_HOST.hosted()) WK_HOST.send('menu'); else { mode = 'menu'; sel = 0; } }
        padWas = { u: bt(12), d: bt(13), a: bt(0) || st, s: st };
        if (Math.abs(x) + Math.abs(y) > 0 || a || b) idle = 0;
      }
      if (holdA) { if (a) a = false; else holdA = false; }
      return { x, y, a, b };
    }
    const hint = (text, dur = 2.6) => { hintW = { text, till: T + dur }; };

    // ── the save: kept on this device (localStorage), and as a code to carry to another device. Where Harold is, and
    // every area's memory (its flags, scenes played, letters moved, words become, the cast: lib/room.js snapshot());
    // PLAY on the title carries on from it. An area unloaded keeps its memory on itself (A.mem) until it's built again
    let resume = false, savedAt = 0, wantArea = -1;
    const SAVE = {
      // v2: the prologue came (27 October) – saves from before it start a new night. Another list of areas (the lab)
      // keeps its own, so playing it never overwrites the chapter's
      key: 'webkeeper.save.v2' + (cfg.areas ? '.' + cfg.areas.join('+') : ''),
      data() {
        if (!cur || !cur.sim) return null;
        const h = cur.sim.st().h, mem = {};
        for (const A of areas) { const m = memOf(A); if (m) mem[A.place.place] = m; }
        return { v: 2, area: cur.i, place: cur.place.place, c: +h.c.toFixed(1), r: +h.r.toFixed(1), at: Date.now(), mem };
      },
      code() { const d = SAVE.data(); return d ? 'WK2-' + btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/=+$/, '') : ''; },
      // (a title's walk-about isn't a save)
      // (not while PLAY is still carrying on from the save: Harold isn't where the save is yet)
      write() { const d = SAVE.data(); if (!d || SHOT || resume || mode === 'title' || mode === 'lift' || (cur && cur.place.place === '0.1')) return; SAVE.store(d); },
      // kept here too: where storage is blocked (a private window, a sandboxed frame) a save – a loaded code's
      // included – lasts as long as the page, instead of being read back as missing and starting a new night
      kept: null,
      store(d) { SAVE.kept = d; try { localStorage.setItem(SAVE.key, JSON.stringify(d)); } catch (e) { /* private window */ } },
      clear() { SAVE.kept = null; try { localStorage.removeItem(SAVE.key); } catch (e) { /* private window */ } },
      areaOf(d) { const i = d && d.place ? areas.findIndex((A) => A.place.place === d.place) : d ? d.area : -1; return i >= 0 && areas[i] ? i : -1; },
      // a save these areas can't carry on from (the lab's, written here before it had its own key) is no save: PLAY
      // starts a new night instead of doing nothing
      read() { let d = SAVE.kept; if (!d) try { d = JSON.parse(localStorage.getItem(SAVE.key) || 'null'); } catch (e) { /* private window */ } return d && (d.v === 1 || d.v === 2) && SAVE.areaOf(d) >= 0 ? d : null; },
      // every area's memory back (built ones at once, the rest when they're built), then Harold where he was
      apply(d) {
        const i = SAVE.areaOf(d); if (!d || (d.v !== 1 && d.v !== 2) || i < 0) return false;
        for (const A of areas) {
          const m = d.mem && d.mem[A.place.place];
          // an area the save doesn't remember comes back as a new night has it, not as this page left it (a code from
          // another device came back mixed with this one's play). A v1 save remembers no area: it only moves Harold
          if (!m) { if (d.mem) { A.mem = null; A.done = null; A.met = false; if (A.sim) { A.sim.reset(); if (A !== cur) A.sim.leave(); } } continue; }
          A.mem = m; A.done = new Set(m.done || []);
          if (A.sim) { A.sim.reset(); A.sim.restore(m); A.met = true; if (A !== cur) A.sim.leave(); }
        }
        return G.put(i, d.c, d.r);
      },
      // a code from another device: kept as this device's save, then carried on from like PLAY does, once its area
      // is built (it may be far from here)
      load(code) {
        try {
          const d = JSON.parse(decodeURIComponent(escape(atob(String(code).trim().replace(/^WK[12]-/, '')))));
          if (!d || (d.v !== 1 && d.v !== 2) || SAVE.areaOf(d) < 0) return false;
          SAVE.store(d); resume = true; return true;
        } catch (e) { return false; }
      },
    };
    // an area's memory: live from its sim, or kept from when it was unloaded; with the scenes it has played
    function memOf(A) {
      const m = A.sim ? A.sim.snapshot() : A.mem; if (!m) return null;
      return { ...m, done: [...(A.done || [])] };
    }
    // every few seconds of play, and whenever the page is put away
    addEventListener('pagehide', () => SAVE.write());
    document.addEventListener('visibilitychange', () => { if (document.hidden) SAVE.write(); });

    // ── stepping: harold's area and its neighbours, in steps of at most 1/60 s; a seam hands him on
    const near = (A) => A.ready && (A === cur || Math.abs(A.slot - cur.slot) <= 1);
    function stepAll(dt, inp) {
      const n = Math.max(1, Math.ceil(dt / DT - 1e-6)), h = dt / n;
      for (let k = 0; k < n; k++) {
        T += h;
        for (const A of areas) if (near(A)) A.sim.step(h, A === cur ? inp : null);
        const c = cur.sim.cross; if (c) cross(c);
        if (cur.sim.exit) door();
      }
      tapA = tapB = false;
      for (const A of areas) if (near(A)) A.S = A.sim.state();
      feet();
    }
    function cross(c) {
      const dir = c.side === 'east' ? 1 : c.side === 'west' ? -1 : 0, N = dir ? areas.find((X) => X.slot === cur.slot + dir) : null, h = cur.sim.st().h;
      cur.sim.st().cross = null;
      if (!N || !N.ready) return;
      const nc = c.c - dir * AC;
      if (!N.sim.walkable(nc, c.r)) return;
      if (!N.met && (N.place.events || []).length) N.sim.reset();
      N.met = true; N.sim.take(nc, c.r, h.flip); Object.assign(N.sim.st().h, { moving: h.moving, vx: h.vx, vy: h.vy });
      cur.sim.leave(); cur = N; nameW = { text: N.place.place + ' · ' + N.place.name, till: T + 3 };
    }
    // a door leads into the area it names (0.6's page door into 0.7, the hermit's): Harold comes in by that area's way
    // back, and an area with a story (events by its clock) starts it the first time he arrives
    function door() {
      const e = cur.sim.exit; cur.sim.clearExit();
      const h = cur.sim.st().h, N = areas.find((A) => A.place.place === e.to);
      if (!N || !N.ready) { h.gone = false; h.r += 1.4; hint(N ? 'the door is opening…' : e.to + ' – not built yet', 1.6); return; }
      // in by its way back to here: a door's `arrive` cell, or the middle of an edge
      const back = (N.place.exits || []).find((x) => x.to === cur.place.place && (x.rows || x.arrive));
      if (!N.met && (N.place.events || []).length) N.sim.reset();
      N.met = true;
      const start = (N.place.actors || []).find((a) => a.who === 'harold');
      if (e.land) N.sim.take(e.land[0], e.land[1], true);   // a way in with its own landing spot (the TV: the meadow's plop)
      else if (back && back.arrive) N.sim.take(back.arrive[0], back.arrive[1], true);
      else if (back) N.sim.take(back.edge === 'east' ? AC - 3 : 2, (back.rows[0] + back.rows[1]) / 2, back.edge !== 'east');
      else N.sim.take(start ? start.at[0] : 2, start ? start.at[1] : 30, true);   // no way back here (the TV): his landing spot
      cur.sim.leave(); cur = N; arrived = N; nameW = { text: N.place.place + ' · ' + N.place.name, till: T + 3 }; moveCam(0, true);
    }
    // whoever walks parts the grass (a radius of 3.5 big columns, loose for about a second, every frame) and leaves
    // prints where the ground is soil
    let ghost = false;   // the bench moves Harold by hand; he still counts as walking
    function walkers(A) { const S = A.S, out = []; if (!S) return out; if (!S.harold.gone) out.push(['harold', ghost ? { ...S.harold, moving: true } : S.harold, 'harold']); (S.cast || []).forEach((a, j) => { if (!a.gone && a.moving) out.push([a.who + j, a, a.who]); }); return out; }
    // which way a walker goes across the screen, -1 (west) to 1 (east); 0 walking straight up or down
    const heading = (a) => { const l = Math.hypot(a.vx || 0, a.vy || 0); return l ? (a.vx || 0) / l : (a.flip ? 1 : -1) * 0.5; };
    function feet() {
      for (const A of areas) if (near(A)) for (const [id, a, who] of walkers(A)) {
        if (!a.moving) continue;
        for (const N of areas) {
          if (!N.ready || Math.abs(N.slot - A.slot) > 1) continue;
          const bx = a.x + A.ox - N.ox; if (bx < N.E[0] * 8 - 48 || bx > N.E[2] * 8 + 48) continue;
          for (const cv of [N.sc.G, N.sc.F]) if (cv) cv.touch((bx - cv.x) / cv.cw, (a.y - 6 - cv.y) / cv.ch, T, (TOUCH * 8) / cv.cw, heading(a));
        }
        const gap = who === 'bug' ? 11 : who === 'harold' ? 13 : 17, l = A.last.get(id);
        if (l && Math.hypot(a.x - l.x, (a.y - l.y) * 1.8) < gap) continue;
        const side = l ? -l.side : 1; A.last.set(id, { x: a.x, y: a.y, side });
        const G = A.sc.G, [c, r] = G.cellAt(a.x, a.y - 4), soil = G.weight('soil', c, r) + G.weight('dug', c, r);
        if (soil > 0.35) { A.prints.push({ x: a.x + side * 3, y: a.y - 3, who, t: T, flip: a.flip }); if (A.prints.length > 260) A.prints.shift(); }
      }
    }

    // ── the camera: Harold, a little ahead of him; on the title, the key art's framing
    // (as malifex, the camera follows him)
    function hero() { const st = cur.sim.st(), m = st.as === 'malifex' && st.cast.find((a) => a.who === 'malifex' && !a.gone), h = m || st.h; return { x: cur.ox + (h.c + 0.5) * 8, y: cur.oy + (h.r + 0.5) * 16 - 8, vx: h.vx || 0, vy: h.vy || 0 }; }
    function clampCam(x, y) {
      const mx = V.w * 0.3, my = V.h * 0.3;
      let x0 = bound.x0 - mx + V.w / 2, x1 = bound.x1 + mx - V.w / 2, y0 = bound.y0 - my + V.h / 2, y1 = bound.y1 + my - V.h / 2;
      return { x: x0 > x1 ? (bound.x0 + bound.x1) / 2 : clamp(x, x0, x1), y: y0 > y1 ? (bound.y0 + bound.y1) / 2 : clamp(y, y0, y1) };
    }
    let lookAt = null;   // { who, till }: a scene's someone to look at
    function lookPos() {
      if (!lookAt || T > lookAt.till || !cur || !cur.sim) return null;
      const a = cur.sim.st().cast.find((x) => !x.gone && (x.id === lookAt.who || x.who === lookAt.who));
      return a ? { x: cur.ox + (a.c + 0.5) * 8, y: cur.oy + (a.r + 0.5) * 16 - 16 } : null;
    }
    function speakerAt() {
      if (!talk || !cur || !cur.sim) return null;
      const who = talk.lines[talk.i].who, a = cur.sim.st().cast.find((x) => !x.gone && (x.id === who || x.who === who));
      return a ? { x: cur.ox + (a.c + 0.5) * 8, y: cur.oy + (a.r + 0.5) * 16 - 16 } : null;
    }
    function camTarget() {
      const hp = hero();
      if (mode === 'title' || (mode === 'menu' && startT < 0)) {
        const edge = bound.y0; let top = edge - V.h * 0.18;
        if (hp.y > top + V.h * 0.74) top = hp.y - V.h * 0.74;
        return clampCam(hp.x + V.w * 0.14, top + V.h / 2);
      }
      // in a talk, the camera leans two thirds of the way to whoever is speaking, so they're nearer the middle with
      // Harold still on screen; in a scene, to whoever just appeared or started dancing, for a few seconds. On a narrow
      // screen that may not be enough: then it goes as far as it takes to have them in view, and above the talk box
      const sp = speakerAt() || lookPos(), fr = V.whole && cur.place.frame;
      const box = talk ? (window.WK_HOST && WK_HOST.hosted() ? 10 : 8) * 16 : 0, mx = V.w / 2 - 48, top = V.h / 2 - 56, bot = Math.max(0, V.h / 2 - 40 - box);
      const inView = (p, c) => Math.abs(p.x - c.x) < mx && p.y - c.y > -top && p.y - c.y < bot;
      // a room that's one picture (the party: the TV, the table and everyone round it), shown whole, is framed as one:
      // the camera holds on its middle (the place's `frame`, [c, r]) and only moves when Harold would walk out of view –
      // in a talk too, since whoever's talking is already in view; when they aren't (behind the talk box), it slides
      // only as far as it takes to show them
      const frameAt = () => { const fx = cur.ox + (fr[0] + 0.5) * 8, fy = cur.oy + (fr[1] + 0.5) * 16, fmx = Math.max(0, V.w / 2 - 72), fmy = Math.max(0, V.h / 2 - 72); return clampCam(clamp(fx, hp.x - fmx, hp.x + fmx), clamp(fy, hp.y - fmy, hp.y + fmy)); };
      if (fr) { const c = frameAt(); return sp && !inView(sp, c) ? clampCam(clamp(c.x, sp.x - mx, sp.x + mx), clamp(c.y, sp.y - bot, sp.y + top)) : c; }
      if (sp) {
        const lean = talk ? 2 / 3 : 1 / 2;
        const x = clamp(hp.x + (sp.x - hp.x) * lean, sp.x - mx, sp.x + mx), y = clamp(hp.y + (sp.y - hp.y) * lean, sp.y - bot, sp.y + top);
        return clampCam(x, y);
      }
      return clampCam(hp.x + clamp(hp.vx * 0.32, -V.w * 0.12, V.w * 0.12), hp.y + clamp(hp.vy * 0.2, -V.h * 0.1, V.h * 0.1));
    }
    function moveCam(dt, snap) {
      const t = camTarget();
      if (snap) { cam.x = t.x; cam.y = t.y; return; }
      const k = 1 - Math.exp(-dt * (T - startT < 1.4 ? 2.6 : 7));
      cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k;
    }

    // ── the title's own clock: the attract loop (Bug tumbling out over the landing, one visitor more), Mishka humming
    let fresh = null;   // no save on this device: PLAY starts a new night on the couch, so it's built behind the title
    function titleTick(dt) {
      const A0 = areas[0]; if (!A0.ready) return;
      if (mode === 'title' && !SHOT) { if (fresh === null) fresh = !SAVE.read(); const cA = fresh && areas.find((A) => A.place.place === '0.1'); if (cA && !cA.ready) wantArea = cA.i; }
      if (mode === 'title') {
        idle += dt;
        if (!attract && idle > 6) attract = { t0: T, bug: false };
        if (attract) {
          const a = T - attract.t0;
          if (a > 3.3 && !attract.bug) {
            attract.bug = true;
            const s0 = { c: (cam.x + V.w * 0.36 - A0.ox) / 8, r: Math.max(-7, (cam.y - V.h * 0.34) / 16) }, h = A0.sim.st().h;
            A0.sim.fire({ do: 'appear', who: 'bug', route: [[s0.c, s0.r], [s0.c - 7, s0.r + 4], [h.c + 18, h.r + 2.4], [h.c + 48, h.r + 1], [134, 29.4], [168, 29]], speed: 36 });
            const b = A0.sim.st().cast.find((x) => x.id === 'bug'); if (b) { b.skid = A0.sim.t - 0.7; b.c = s0.c; b.r = s0.r; }
            A0.sim.say('yip!', 'bug', 1.2);
          }
          if (a > 7.5) { attract = null; idle = 0; if (visitors) visitors++; }
        }
      }
      // Mishka hums every 9 s (wherever Harold is with him); about one hum in five ends in a tiny mew on its own, and
      // the hum after a quack's ring reaches him always does (lib/room.js sets st.mewNext) – that hum comes a little
      // sooner, within 2.5 s, so it answers the quack
      const hummer = (A) => A && A.sim && A.sim.st().cast.find((x) => x.who === 'mishka' && !x.gone);
      function hum(A, meow) {
        lastHum = T; mewNext = false;
        if (window.WK_BEAR) WK_BEAR.hum(A.sim.t, meow); else A.sim.say('hm hm hmm...', 'mishka', 2.2);
        if (!window.WK_SOUND) return;
        // heard as well as seen: louder the nearer Harold is to him; the mew as the last note ends
        const st0 = A.sim.st(), m = hummer(A), d = m ? Math.hypot(st0.h.c - m.c, (st0.h.r - m.r) * 2) : 0;
        WK_SOUND.hum(1 - d / 90);
        if (meow) setTimeout(() => WK_SOUND.meow(), 1750);
      }
      if (cur && cur.sim && mode !== 'menu' && hummer(cur)) {   // (behind the title too, as ever)
        const st1 = cur.sim.st();
        if (st1.mewNext) { st1.mewNext = false; mewNext = true; mewBy = Math.min(lastHum + 9, T + 2.5); }
        if (T - lastHum > 9 || (mewNext && T >= mewBy)) hum(cur, mewNext || (!talk && mode === 'play' && hash(Math.floor(T), 7, 77) < 0.2));
      }
    }

    // ── drawing. Three buffers a little bigger than the view, drawn at the world's step (twelve a second) or at once
    // when a foot or a ring makes a new patch live: U (the night, the holes, the ground, prints, what stands behind),
    // Fb (what stands in front), Ab (mist, fireflies, leaves). Between, a frame stamps them where the camera is now
    // and draws the play layer, the light and the ui live.
    const visible = (c) => areas.filter((A) => A.ready && A.ox + (A.E[0] - 24) * 8 < c.x + V.w / 2 + PAD && A.ox + (A.E[2] + 24) * 8 > c.x - V.w / 2 - PAD);
    const setOff = (X, A, c, pad) => { X.ox = Math.round(((A ? A.ox : 0) - c.x + V.w / 2 + pad) * V.k); X.oy = Math.round(((A ? A.oy : 0) - c.y + V.h / 2 + pad) * V.k); X.reset(); };
    const viewOf = (A, c, m = PAD) => [c.x - V.w / 2 - m - A.ox, c.y - V.h / 2 - m - A.oy, c.x + V.w / 2 + m - A.ox, c.y + V.h / 2 + m - A.oy];
    function ringsFor(N) {
      const out = [];
      for (const A of areas) if (A.S && Math.abs(A.slot - N.slot) <= 1) for (const R of A.S.rings) out.push({ x: R.x + A.ox - N.ox, y: R.y, t0: R.t0 - A.sim.t + T, reach: R.reach, speed: R.speed });
      return out;
    }
    const clearX = (X) => { X.g.setTransform(1, 0, 0, 1, 0, 0); X.g.clearRect(0, 0, X.canvas.width, X.canvas.height); };
    // the night past the page's edge: stars (they drift at half the camera's speed), the far pages, the moon
    const FAR = [[-560, -470, 30, 9, ['welcome to my page', 'under construction', 'sign my guestbook']], [380, -560, 26, 8, ['my links', 'cool sites', 'webring: next >']],
      [1500, -500, 34, 10, ['you are visitor 000004', 'best viewed in netscape', 'last updated 1996']], [2700, -540, 28, 8, ['<marquee>', 'my cat', 'email me']],
      [3800, -480, 30, 9, ['the hermit\'s page', '...hi.', 'visitors 000017']], [-640, 1060, 32, 9, ['frames version', 'no frames version']],
      [900, 1120, 28, 8, ['404', 'not found', 'the page moved']], [2200, 1080, 34, 9, ['the old web', 'harold kept a copy']], [4300, 1100, 26, 8, ['ring of pages', '< prev  next >']]];
    let farCv = null;
    function farPage(X, f) {
      // drawn at the view's scale, and again when it changes (a zoom, another screen) so it never draws blurry
      if (!farCv || farCv.k !== V.k) { farCv = new Map(); farCv.k = V.k; }
      let cv = farCv.get(f);
      if (!cv) {
        const [, , cw, rw, lines] = f, d = V.k; cv = document.createElement('canvas'); cv.width = Math.ceil(cw * 6 * d) + 12; cv.height = Math.ceil(rw * 12 * d) + 12;
        const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
        for (let j = 0; j <= rw; j++) for (let i = 0; i <= cw; i++) { const ex = i === 0 || i === cw, ey = j === 0 || j === rw, ch = ex && ey ? '+' : ey ? '-' : ex ? '|' : ''; if (ch) X.looseOn(g, (i + 0.5) * 6, (j + 0.5) * 12, ch, L.mix('ink', 'tealUp', 0.42), 0, 12, d); }
        lines.forEach((s, j) => { for (let i = 0; i < s.length && i < cw - 3; i++) if (s[i] !== ' ') X.looseOn(g, (i + 2.5) * 6, (j * 2 + 2.5) * 12, s[i], L.mix('ocean', 'tealUp', 0.35), 0, 12, d); });
        cv.w = cv.width / d; cv.h = cv.height / d; farCv.set(f, cv);
      }
      X.g.drawImage(cv, f[0], f[1], cv.w, cv.h);
    }
    function night(X, c) {
      setOff(X, null, c, PAD);
      const g = X.g, x0 = c.x - V.w / 2 - PAD, y0 = c.y - V.h / 2 - PAD, x1 = x0 + V.w + 2 * PAD, y1 = y0 + V.h + 2 * PAD;
      const inside = bound.x0 + 20 < x0 && bound.x1 - 20 > x1 && bound.y0 + 28 < y0 && bound.y1 - 28 > y1;
      if (inside) return;
      g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.rect(bound.x0 + 20, bound.y0 + 28, bound.x1 - bound.x0 - 40, bound.y1 - bound.y0 - 56); g.clip('evenodd');
      const st = Math.floor(T * 3), sx = c.x * 0.5, sy = c.y * 0.5;
      for (let j = Math.floor((y0 - sy) / 24); j <= Math.ceil((y1 - sy) / 24); j++) for (let i = Math.floor((x0 - sx) / 24); i <= Math.ceil((x1 - sx) / 24); i++) {
        const h = hash(i, j, 7); if (h > 0.07) continue;
        const u = hash(i, j, 8), tw = (st + Math.floor(u * 12)) % 12 === 0;
        X.loose(Math.round(i * 24 + u * 24 + sx), Math.round(j * 24 + hash(j, i, 9) * 24 + sy), tw ? '+' : h < 0.012 ? '*' : '.', STAR[1 + Math.floor(u * 3.99) + (tw ? 1 : 0)] || STAR[4], 0, 12);
      }
      for (const f of FAR) if (f[0] < x1 && f[0] + f[2] * 6 > x0 && f[1] < y1 && f[1] + f[3] * 12 > y0) farPage(X, f);
      X.loose(150, -204, 'O', P.beige, 0, 64); X.loose(142, -210, '.', P.beigeDim, 0, 24); X.loose(157, -198, '.', P.beigeDim, 0, 20);
      g.restore(); X.reset();
    }
    function deep(X, A, v) {
      const hp = A.sc.G.holes(); if (!hp) return;
      const g = X.g; g.save(); g.clip(hp);
      if (A.sc.D) A.sc.D.drawTiles(X, T, { view: v });
      X.reset(); L.deepWords(X, A.sc, T); L.farPages(X, A.sc);
      g.restore(); X.reset();
    }
    function prints(X, A) {
      const g = X.g;
      A.prints = A.prints.filter((p) => T - p.t < 45);
      for (const p of A.prints) {
        const age = T - p.t, col = age < 22 ? SOIL[3] : age < 34 ? SOIL[2] : SOIL[1], x = Math.round(p.x), y = Math.round(p.y);
        g.fillStyle = P.ink; g.fillRect(x - 4, y - 3, 8, 6);
        if (p.who === 'harold') X.loose(x, y, 'v', col, 0, 12);
        else if (p.who === 'bug') { X.loose(x, y + 1, 'o', col, 0, 9); X.loose(x - 3, y - 3, '.', col, 0, 10); X.loose(x + 3, y - 3, '.', col, 0, 10); }
        else X.loose(x, y, p.who === 'mishka' ? 'o' : ':', col, 0, 11);
      }
    }
    // leaves come loose in a gust, spin down and lie a while (each tree a few, by the wind at its crown)
    function leaves(X, A) {
      for (const tr of A.trees) for (let k = 0; k < 4; k++) {
        const per = 5 + hash(tr.seed, k, 1) * 4, ph = hash(tr.seed, k, 2) * per, n = Math.floor((T + ph) / per), t0 = n * per - ph, a = T - t0;
        if (a > 5.5) continue;
        const w0 = B.windW(A.ox + tr.x, tr.y, t0); if (w0 < 0.36) continue;
        const ux = tr.x + (hash(tr.seed, k, n) - 0.5) * tr.rx * 2, uy = tr.y + (hash(n, k, tr.seed) - 0.5) * tr.ry * 2, D = 2.6, f = Math.min(a, D);
        const x = ux + f * (28 + 80 * w0) + Math.sin(f * 4 + k) * 6, y = uy + (f / D) * tr.drop;
        X.loose(Math.round(x), Math.round(y), a < D ? ",'`~"[(Math.floor(T * 12) + k) % 4] : ',', a < D ? LEAF[k % 2] : LEAF[2], 0, 12);
      }
    }
    // U: the night, the holes, the ground and its prints · Um: what stands behind · Fb: what stands in front · Ab: the air
    function renderU(c) {
      U.cam = { x: c.x, y: c.y }; U.clear();
      night(U, c);
      let miss = 0;
      for (const A of visible(c)) {
        setOff(U, A, c, PAD); const v = viewOf(A, c);
        deep(U, A, v);
        miss += Math.max(0, A.sc.G.drawTiles(U, T, { view: v, rings: ringsFor(A), sync: !!SHOT }));
        U.reset(); prints(U, A);
      }
      stats.missG = miss;
    }
    // a patch of U and Fb round each walker (where a foot just made a new patch of grass live): drawn again in place
    function patch() {
      const rects = [];
      for (const A of visible(U.cam)) for (const [, a] of walkers(A)) if (a.moving) rects.push([A, a.x - 64, a.y - 56, a.x + 64, a.y + 28]);
      for (const [X, isU] of [[U, true], [Fb, false]]) {
        const c = X.cam, g = X.g;
        for (const [A, x0, y0, x1, y1] of rects) {
          setOff(X, A, c, PAD); g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
          if (isU) { g.fillStyle = P.ink; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
          else g.clearRect(x0, y0, x1 - x0, y1 - y0);
          for (const N of visible(c)) {
            const cv = isU ? N.sc.G : N.sc.F; if (!cv) continue;
            setOff(X, N, c, PAD); const dx = A.ox - N.ox, v = [x0 + dx, y0, x1 + dx, y1];
            if (isU) deep(X, N, v);
            cv.drawTiles(X, T, { view: v, rings: ringsFor(N) });
            if (isU) { X.reset(); prints(X, N); }
          }
          g.restore(); X.reset();
        }
      }
    }
    function renderM(c) {
      clearX(Um); Um.cam = { x: c.x, y: c.y }; let miss = 0;
      for (const A of visible(c)) if (A.sc.M) { setOff(Um, A, c, PAD); miss += Math.max(0, A.sc.M.drawTiles(Um, T, { view: viewOf(A, c), rings: ringsFor(A), sync: !!SHOT })); }
      stats.missM = miss;
    }
    function renderF(c) {
      clearX(Fb); Fb.cam = { x: c.x, y: c.y }; let miss = 0;
      for (const A of visible(c)) if (A.sc.F) { setOff(Fb, A, c, PAD); miss += Math.max(0, A.sc.F.drawTiles(Fb, T, { view: viewOf(A, c), rings: ringsFor(A), sync: !!SHOT })); }
      stats.missF = miss;
    }
    function renderA(c) {
      clearX(Ab); Ab.cam = { x: c.x, y: c.y };
      for (const A of visible(c)) {
        setOff(Ab, A, c, PAD);
        A.sc.G.drawAir(Ab, T); if (A.sc.M) A.sc.M.drawAir(Ab, T);
        Ab.reset(); L.fireflies(Ab, A.sc, T); leaves(Ab, A);
      }
    }
    const stamp = (X) => { const g = Wm.g; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(X.canvas, Math.round((X.cam.x - cam.x - PAD) * V.k), Math.round((X.cam.y - cam.y - PAD) * V.k)); };
    // the world steps twelve times a second; its four buffers are drawn on four frames in a row (the ground first), and
    // the ground (and what stands in front) again at once when a foot or a ring makes a new patch of it live
    // the GPU path: the ground, what stands behind and what stands in front are drawn every frame, every mark where the
    // wind and the feet put it now; U (the night, the holes, the water) still steps twelve times a second underneath
    function renderU0(c) {
      U.cam = { x: c.x, y: c.y }; U.clear(); night(U, c);
      for (const A of visible(c)) { setOff(U, A, c, PAD); const v = viewOf(A, c); deep(U, A, v); A.sc.G.drawLive(U, T, { view: v, rings: ringsFor(A) }); }
    }
    // the lights the GPU marks are lit by: every lamp in view (a slow flicker) and the lighthouse's lantern and beam,
    // stepped six times a second like the beam's own dashes (lib/layers.js beam)
    function lightsNow(vis) {
      const out = []; let beam = null;
      // a word that became a light (LAMP, POST) lights the marks round it too, once it has stood up
      for (const A of vis) if (A.S) for (const b of A.S.becomes || []) {
        const d = PL.bookOf(b.text), gl = d && d.glow && b.age > 0.6 && d.glow(b.text.length); if (!gl) continue;
        out.push([A.ox + (b.at[0] + gl.at[0] + 0.5) * 8, A.oy + (b.at[1] + gl.at[1] + 0.5) * 16, gl.rad, 0.94 + 0.06 * Math.sin(T * 6 + b.at[0])]);
      }
      for (const A of vis) for (const th of A.place.things || []) {
        if (th.thing === 'lamp') { const fl = 0.92 + 0.08 * Math.sin(T * 7 + th.foot[0]) * Math.sin(T * 2.3); out.push([A.ox + (th.foot[0] + 0.5) * 8, A.oy + (th.foot[1] - 2) * 16, th.rad || 230, fl]); }
        else if (th.thing === 'lighthouse') {
          const cx = A.ox + (th.foot[0] + 0.5) * 8, o = A.oy + (th.foot[1] + 1) * 16 - 284, st = Math.floor(A.sim ? A.sim.t * 6 : T * 6);
          out.push([cx, o + 92, 150, 0.9]);
          beam = [cx - 2, o + 90, st * (Math.PI * 2 / 90) + 0.6, 0.95];
        }
      }
      return { out, beam };
    }
    // ── water mirrors what stands over it: the lamps, the trees, the lighthouse, Harold. Each column of a pool takes the
    // picture just above its surface, turned over, in bands of 4 px that step aside with the ripples, sunk into teal and
    // added on (so the water's own dashes stay), fading with depth. A pool's columns come from the ground's wet cells.
    function pools(A) {
      if (A.pools !== undefined) return A.pools;
      const F = A.sc && A.sc.G.fields(); if (!F) return null;
      const out = [];
      for (let c = 0; c < F.cols; c++) for (let r = 0; r < F.rows;) {
        if (!F.wet[r * F.cols + c]) { r++; continue; }
        const r0 = r; while (r < F.rows && F.wet[r * F.cols + c]) r++;
        const x = F.ox + c * F.cw, y = F.oy + r0 * F.ch, h = (r - r0) * F.ch, q = out[out.length - 1];
        if (q && q.y === y && q.h === h && Math.abs(q.x + q.w - x) < 0.01) q.w += F.cw; else out.push({ x, y, w: F.cw, h });
      }
      return (A.pools = out.length ? out : null);
    }
    const RF = document.createElement('canvas'), rfg = RF.getContext('2d');
    function reflect(vis) {
      const g = Wm.g, k = V.k, W0 = Wm.canvas.width, H0 = Wm.canvas.height, sx = (V.w / 2 - cam.x) * k, sy = (V.h / 2 - cam.y) * k;
      const st = Math.floor(T * 8), hb = Math.max(2, Math.round(4 * k));
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      for (const A of vis) {
        const Q = pools(A); if (!Q) continue;
        for (const q of Q) {
          const dx = Math.round((A.ox + q.x) * k + sx), dy = Math.round((A.oy + q.y) * k + sy), dw = Math.ceil(q.w * k), dh = Math.ceil(q.h * k);
          if (dx > W0 || dx + dw < 0 || dy > H0 || dy + dh < 0 || dy - dh < 0) continue;
          if (RF.width < dw + 8) RF.width = dw + 8; if (RF.height < dh) RF.height = dh;
          rfg.globalCompositeOperation = 'copy'; rfg.drawImage(Wm.canvas, dx - 4, dy - dh, dw + 8, dh, 0, 0, dw + 8, dh);
          rfg.globalCompositeOperation = 'multiply'; rfg.drawImage(RF, 0, 0, dw + 8, dh, 0, 0, dw + 8, dh);   // squared: the dim grass falls away, the lamp and Harold stay
          rfg.fillStyle = REFL; rfg.fillRect(0, 0, dw + 8, dh);
          g.globalCompositeOperation = 'lighter';
          for (let j = 0, b = 0; j < dh; j += hb, b++) {
            const h = Math.min(hb, dh - j), u = j / dh;
            if ((b + st) % 5 === 0 && u > 0.2) continue;   // a gap: the ripple between two bands
            const off = Math.round(Math.sin(st * 0.9 + b * 1.7 + q.x * 0.05) * (1 + u * 2)) * Math.max(1, Math.round(k));
            g.globalAlpha = 0.95 * (1 - u * 0.6);
            // the band j..j+h below the surface shows the band just as far above it, turned over
            g.save(); g.translate(0, 2 * dy + 2 * j + h); g.scale(1, -1);
            g.drawImage(RF, 4 - off, dh - j - h, dw, h, dx, dy + j, dw, h);
            g.restore();
          }
        }
      }
      g.restore(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    const REFL = L.mix('tealHi', 'beige', 0.25);
    // ── wading: in the water Harold's feet make rings that spread over it, a splash going in, and a waterline at his legs
    const WADE = { rings: [], wet: false, last: -9, drops: [] };
    function wetAt(A, x, y) { const F = A && A.sc && A.sc.G.fields(); if (!F) return false; const c = Math.floor((x - F.ox) / F.cw), r = Math.floor((y - F.oy) / F.ch); return c >= 0 && r >= 0 && c < F.cols && r < F.rows && !!F.wet[r * F.cols + c]; }
    function wade() {
      if (!cur || !cur.S || mode === 'title' || mode === 'lift') { WADE.wet = false; return; }
      const h = hero(), fx = h.x - cur.ox, fy = h.y + 8 - cur.oy, wet = wetAt(cur, fx, fy), moving = Math.hypot(h.vx, h.vy) > 4;
      if (wet && !WADE.wet) for (let k = 0; k < 7; k++) WADE.drops.push({ x: h.x, y: h.y + 8, vx: (hash(k, Math.floor(T * 10), 3) - 0.5) * 70, vz: 60 + hash(k, 2, Math.floor(T * 10)) * 50, t0: T });
      if (wet && T - WADE.last > (moving ? 0.32 : 1.4)) { WADE.last = T; WADE.rings.push({ A: cur, x: fx, y: fy, t0: T, big: !moving }); }
      WADE.wet = wet;
    }
    function wadeDraw() {
      const RC = [P.tealHi, L.mix('tealHi', 'tealUp', 0.5), P.tealUp];
      if (WADE.wet) {
        // the waterline: Harold stands in it to the knees (drawn first, so the rings spread over it)
        const h = hero(), x = Math.round(h.x), y = Math.round(h.y + 13), sh = Math.floor(T * 6) % 2;
        setOff(Wm, null, cam, 0);
        Wm.g.fillStyle = L.mix('ink', 'ocean', 0.75); Wm.g.fillRect(x - 14, y - 3, 28, 8);
        for (let i = -1; i <= 1; i++) Wm.loose(x + i * 8, y + (i + sh) % 2, i === sh - 1 ? '=' : '~', P.tealHi, 0, 12);
      }
      WADE.rings = WADE.rings.filter((R) => T - R.t0 < 1.3 && R.A.sc);
      for (const R of WADE.rings) {
        const a = T - R.t0, rx = Math.floor(a * 8) * (R.big ? 8 : 6) + 18, ry = rx / 2.2, n = Math.max(8, Math.round(rx / 3)), col = RC[Math.min(2, Math.floor(a / 0.45))];
        setOff(Wm, R.A, cam, 0);
        for (let i = 0; i < n; i++) { const th = (i / n) * Math.PI * 2, x = R.x + Math.cos(th) * rx, y = R.y + 5 + Math.sin(th) * ry; if (wetAt(R.A, x, y)) Wm.loose(Math.round(x), Math.round(y), Math.abs(Math.sin(th)) > 0.7 ? '-' : '~', col, 0, 12); }
      }
      WADE.drops = WADE.drops.filter((d) => T - d.t0 < 0.55);
      setOff(Wm, null, cam, 0);
      for (const d of WADE.drops) { const a = T - d.t0, z = Math.max(0, d.vz * a - 300 * a * a); Wm.loose(Math.round(d.x + d.vx * a), Math.round(d.y - z), z > 8 ? "'" : '.', P.tealHi, 0, 12); }
    }
    let LIT = { out: [], beam: null };
    function glLayer(L, vis) {
      GLR.begin(Wm.canvas.width, Wm.canvas.height, V.w, V.h, T, LIT.out, LIT.beam);
      let n = 0;
      for (const A of vis) { const h = A.glh && A.glh[L]; if (!h) continue; n += GLR.draw(h, A.sc[L], { world: [A.ox, A.oy], off: [A.ox - (cam.x - V.w / 2), A.oy - (cam.y - V.h / 2)], rings: ringsFor(A), view: viewOf(A, cam, 64) }); }
      if (n) { const g = Wm.g; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(GLR.canvas, 0, 0); Wm.reset(); }
      return n;
    }
    function renderGL(sync) {
      // the sky, the water and the ground's live parts are drawn every frame (they stepped at 12 a second, which read
      // as stuck next to the GPU's grass – scripts/motion/probe.py)
      const step = Math.floor(T * 60), vis = visible(cam), g = Wm.g;
      const PT = stats.parts || (stats.parts = {}), tk = (k, t0) => { PT[k] = (PT[k] || 0) + performance.now() - t0; return performance.now(); };
      let t0 = performance.now();
      const on = (k) => !OFF.has(k) && !G.off.has(k);
      LIT = on('light') ? lightsNow(vis) : { out: [], beam: null };
      if (sync || forceU || !U.cam || Math.max(Math.abs(U.cam.x - cam.x), Math.abs(U.cam.y - cam.y)) > PAD * 0.75 || step !== lastStep) { renderU0(cam); lastStep = step; forceU = false; }
      if (on('sky')) stamp(U); else Wm.clear();
      t0 = tk('night+water', t0);
      let n = on('ground') ? glLayer('G', vis) : 0;
      for (const A of vis) { setOff(Wm, A, cam, 0); prints(Wm, A); }
      if (on('behind')) n += glLayer('M', vis);
      t0 = tk('ground+behind', t0);
      if (on('play')) {
        const its = [];
        for (const A of vis) if (A.S) for (const it of L.playItems(Wm, A.sc, A.S, A.sim.t)) its.push({ feet: it.feet + A.oy, A, f: it.f });
        its.sort((a, b) => a.feet - b.feet);
        for (const it of its) { setOff(Wm, it.A, cam, 0); it.f(); }
        for (const A of vis) if (A.S) { setOff(Wm, A, cam, 0); L.sayings(Wm, A.S); }
      }
      if (on('water')) reflect(vis);
      t0 = tk('play', t0);
      if (on('front')) {
        g.save(); g.setTransform(V.k, 0, 0, V.k, Math.round((V.w / 2 - cam.x) * V.k), Math.round((V.h / 2 - cam.y) * V.k)); g.beginPath();
        g.rect(cam.x - V.w, cam.y - V.h, V.w * 2, V.h * 2);
        for (const A of vis) if (A.S) for (const [c, r] of L.revealCells(A.S)) g.rect(A.ox + c * 8, A.oy + r * 16, 8, 16);
        g.clip('evenodd'); n += glLayer('F', vis); g.restore();
      }
      if (on('air')) for (const A of vis) { setOff(Wm, A, cam, 0); A.sc.G.drawAir(Wm, T); if (A.sc.M) A.sc.M.drawAir(Wm, T); Wm.reset(); L.fireflies(Wm, A.sc, T); leaves(Wm, A); }
      t0 = tk('front+air', t0);
      if (on('light')) for (const A of vis) if (A.S) { setOff(Wm, A, cam, 0); L.light(Wm, A.sc, A.S, A.sim.t); }
      if (on('water')) { wade(); wadeDraw(); }
      if (on('ui')) ui();
      tk('light+ui', t0); PT.n = (PT.n || 0) + 1;
      stats.marks = n; stats.miss = 0;
    }
    function render(sync) {
      if (GL()) { renderGL(sync); return; }
      stats.t0 = performance.now();
      const step = Math.floor(T * 12), vis = visible(cam);
      let acts = 0, rn = 0; for (const A of vis) { acts += A.sc.G.acts + (A.sc.F ? A.sc.F.acts : 0); rn += A.S ? A.S.rings.length : 0; }
      const off = (X) => !X.cam || Math.max(Math.abs(X.cam.x - cam.x), Math.abs(X.cam.y - cam.y)) > PAD * 0.75;
      if (sync || forceU || [U, Um, Fb, Ab].some(off)) { renderU(cam); renderM(cam); renderF(cam); renderA(cam); phase = 0; forceU = false; lastStep = step; lastActs = acts; lastRings = rn; }
      else if (step !== lastStep) { lastStep = step; lastActs = acts; lastRings = rn; renderU(cam); phase = 1; }
      else if (rn !== lastRings) { lastActs = acts; lastRings = rn; renderU(cam); renderF(cam); }
      else if (acts !== lastActs) { lastActs = acts; patch(); }
      else if (phase === 1) { renderM(cam); phase = 2; }
      else if (phase === 2) { renderF(cam); phase = 3; }
      else if (phase === 3) { renderA(cam); phase = 0; }
      stats.miss = (stats.missG || 0) + (stats.missM || 0) + (stats.missF || 0);
      const g = Wm.g, PT = stats.parts || (stats.parts = {}), tk = (k, t0) => { PT[k] = (PT[k] || 0) + performance.now() - t0; return performance.now(); };
      let t0 = tk('buffers', stats.t0 || performance.now());
      stamp(U); stamp(Um);
      // the play layer of every area in view, sorted together by the feet
      const its = [];
      for (const A of vis) if (A.S) for (const it of L.playItems(Wm, A.sc, A.S, A.sim.t)) its.push({ feet: it.feet + A.oy, A, f: it.f });
      its.sort((a, b) => a.feet - b.feet);
      for (const it of its) { setOff(Wm, it.A, cam, 0); it.f(); }
      for (const A of vis) if (A.S) { setOff(Wm, A, cam, 0); L.sayings(Wm, A.S); }
      t0 = tk('play', t0);
      // what stands in front, thinned round whoever it covers
      g.save(); g.setTransform(V.k, 0, 0, V.k, Math.round((V.w / 2 - cam.x) * V.k), Math.round((V.h / 2 - cam.y) * V.k)); g.beginPath();
      g.rect(cam.x - V.w, cam.y - V.h, V.w * 2, V.h * 2);
      for (const A of vis) if (A.S) for (const [c, r] of L.revealCells(A.S)) g.rect(A.ox + c * 8, A.oy + r * 16, 8, 16);
      g.clip('evenodd'); stamp(Fb); g.restore();
      stamp(Ab);
      t0 = tk('front+air', t0);
      for (const A of vis) if (A.S) { setOff(Wm, A, cam, 0); L.light(Wm, A.sc, A.S, A.sim.t); }
      ui();
      tk('light+ui', t0); PT.n = (PT.n || 0) + 1;
    }

    // ── the ui: the title (the key art's), the menu (Webkeeper's own homepage), hints, the touch controls
    const inkText = (c, r, s, col, italic) => { Wm.ink(c - 1, r, s.length + 2, 1); if (italic) Wm.textI(c, r, s, col); else Wm.text(c, r, s, col); };
    const centre = (r, s, col, italic) => inkText(Math.round(V.w / 16 - s.length / 2), r, s, col, italic);
    // ── where to go, as Voyager's course line ("course: the ribcage ↖"): the area's next thing – a word to spell where it
    // belongs, then the way on (a door, an edge; Bug, while he has what the way on needs). Shown top left with an arrow
    // in eight steps from Harold, and at the view's edge when it's off screen.
    // ── talking (06-CAST.md, the book): A near someone with lines (an actor's `talk` in the place file) opens a box at
    // the bottom instead of quacking; A shows the whole line, then the next. Harold speaks; Mishka answers in hums, with
    // a dim line for what he means. The first talk is `first`; after it, each talk is the next of `again`, where
    // {dir} and {goal} are the course line's: he nods the way to go.
    let talk = null, talkHold = false, aPrev = false;
    // ── scenes (the book's scripts: design/couch-games/book). A place's `scenes` each start once, by a trigger –
    //   on: 'arrive' (Harold comes in by a door, or a new night starts here) · { press: box } (A next to it) ·
    //   { enter: box } (he walks into it) · { flag: f } (a word became f, or a scene set it) · { quacks: n }
    //   (needs / unless: a flag) – and play step by step:
    //   say (the box at the bottom; A goes on) · bubble (a line over a head) · wait (s) · do (an event for the room,
    //   lib/room.js fire) · think (Harold's mind: words in the dark) · hint · set (a flag) · sound · title (a title card).
    //   While one plays Harold stands still, unless the scene is `free`.
    let scene = null, card = null, thinkW = null, arrived = null;
    // a scene's press: cells, or a thing's id (the couch's remote) – a few cells round where that thing stands in this
    // layout, so an upright couch moves it with the thing
    const pressBox = (on, p = cur.place) => { if (typeof on.press !== 'string') return on.press; const th = (p.things || []).find((x) => x.id === on.press); return th ? [th.foot[0] - 4, th.foot[1] - 1, th.foot[0] + 5, th.foot[1] + 3] : [-99, -99, -99, -99]; };
    const inBoxH = (h, [c0, r0, c1, r1], k = 0) => h.c > c0 - k && h.c < c1 + k && h.r > r0 - k / 2 && h.r < r1 + k / 2;
    function sceneFor(pressed) {
      if (!cur || !cur.sim) return null;
      const st = cur.sim.st(), h = st.h, done = cur.done || (cur.done = new Set());
      if (h.gone && cur.place.place !== '0.1') return null;
      for (const def of cur.place.scenes || []) {
        if (done.has(def.id) || (def.needs && !st.flags[def.needs]) || (def.unless && st.flags[def.unless])) continue;
        const on = def.on || {};
        const hit = on === 'arrive' ? arrived === cur : on.press ? pressed && inBoxH(h, pressBox(on), 6) : on.enter ? inBoxH(h, on.enter) : on.flag ? !!st.flags[on.flag] : on.quacks ? (st.quacks || 0) >= on.quacks : false;
        if (hit) return def;
      }
      return null;
    }
    // the press spot Harold is next to, for the hint row: "A: look"
    function pressSpot() {
      if (!cur || !cur.sim || scene) return null;
      const st = cur.sim.st(), done = cur.done || new Set();
      return (cur.place.scenes || []).find((d) => d.on && d.on.press && !done.has(d.id) && !(d.needs && !st.flags[d.needs]) && !(d.unless && st.flags[d.unless]) && inBoxH(st.h, pressBox(d.on), 6)) || null;
    }
    function playScene(def) { if (def.once !== false) cur.done.add(def.id); scene = { A: cur, def, i: 0, t0: T }; }
    function sceneStep() {
      // a scene of an area Harold has left (a free one, still playing as he went through a door) ends here, before the
      // new area's arrival is looked for – it used to clear the arrival and only then be dropped
      if (scene && scene.A !== cur) scene = null;
      if (!scene) { const d = sceneFor(false); if (d) playScene(d); }
      if (arrived === cur) arrived = null;
      for (let guard = 0; scene && guard < 24; guard++) {
        if (talk || card) return;
        const S2 = scene, step = S2.def.steps[S2.i], A = S2.A;
        if (!step || A !== cur) { scene = null; return; }
        const next = () => { S2.i++; S2.t0 = T; };
        if (step.say) { talk = { lines: [{ who: step.say, name: step.name, text: step.text, means: step.means }], i: 0, t0: T, scene: true }; line(); next(); return; }
        if (step.wait != null) { if (T - S2.t0 >= step.wait) { next(); continue; } return; }
        if (step.bubble) A.sim.say(step.text, step.bubble, step.for || 2.2);
        if (step.do) { A.sim.fire(step.do); if (step.do.who && /^(appear|dance|walk|poof|blush|show)$/.test(step.do.do)) lookAt = { who: step.do.who, till: T + Math.min(step.do.for || 3, 4.5) }; }
        if (step.think) thinkW = { A, words: step.think };
        if (step.hint) hint(step.hint, step.for || 3);
        if (step.set) A.sim.st().flags[step.set] = true;
        if (step.sound && window.WK_SOUND && WK_SOUND[step.sound]) WK_SOUND[step.sound]();
        if (step.title) card = { lines: step.title, voice: step.voice, t0: T };
        next();
      }
    }
    // Harold's mind: the area's own words (its `think`), or what a scene last thought, float in the dark past the
    // page's edge – below it, above it, beside it – wherever the view shows the void, swaying slowly, never over the play
    function thoughts() {
      const ws = thinkW && thinkW.A === cur ? thinkW.words : (cur && cur.place.think) || [];
      if (!ws.length || !cur) return;
      const sx = (x) => x - cam.x + V.w / 2, sy = (y) => y - cam.y + V.h / 2;
      const top = sy(cur.oy + cur.E[1] * 16), bot = sy(cur.oy + cur.E[3] * 16), left = sx(cur.ox + cur.E[0] * 8), right = sx(cur.ox + cur.E[2] * 8);
      const word = (w, x, y, k) => { for (let i = 0; i < w.length; i++) if (w[i] !== ' ') Wm.loose(Math.round(x + i * 8), Math.round(y), w[i], k % 2 ? P.beigeDim : P.tealHi, 0, 16); };
      // each word has its own place across the view and sways there slowly, so a narrow screen shows them all too
      const sway = (w, k) => { const wpx = w.length * 8, room = Math.max(0, V.w - wpx - 24); return 12 + room * hash(k, 6, 19) + Math.sin(T * 0.35 + k * 2.1) * Math.min(14, room / 6); };
      // below the page, or else above it: rows of words, the first row nearest the edge
      let shown = false;
      for (const [edge, dir] of [[bot, 1], [top, -1]]) {
        if (shown || (dir > 0 ? edge > V.h - 40 : edge < 40)) continue;
        shown = true;
        ws.forEach((w, k) => { const y = edge + dir * (22 + (k % 3) * 26) + Math.sin(T * 0.5 + k) * 2; if (y > 10 && y < V.h - 10) word(w, sway(w, k), y, k); });
      }
      // beside it (when there's no void above or below in view): the words stacked in the gap, rising slowly
      if (!shown) for (const [edge, dir] of [[left, -1], [right, 1]]) {
        const room = dir > 0 ? V.w - edge : edge; if (room < 90) continue;
        ws.forEach((w, k) => {
          const span = V.h + 60, y = V.h + 20 - ((T * 6 + k * (span / ws.length)) % span), wpx = w.length * 8;
          const x = dir > 0 ? edge + 16 + Math.max(0, (room - 32 - wpx) * hash(k, 8, 29)) : edge - 16 - wpx - Math.max(0, (room - 32 - wpx) * hash(k, 8, 29));
          if (x > 4 && x + wpx < V.w - 4) word(w, x, y, k);
        });
      }
    }
    // a title card: a held frame of text, and a voice from somewhere in the web; A goes on
    function titleCard(rows, cols) {
      Wm.ink(0, 0, cols + 1, rows + 1);
      const r0 = Math.round(rows / 2) - 2;
      card.lines.forEach((s2, j) => centre(r0 + j * 2, s2, j === 0 ? P.phosphor : P.beige));
      if (card.voice && T - card.t0 > 1.4) centre(r0 + card.lines.length * 2 + 2, card.voice, P.beigeDim, true);
      if (T - card.t0 > 2.4 && Math.floor(T * 2) % 2) centre(rows - 3, ' A ', P.beigeDim);
    }
    const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
    function talker() {
      if (!cur || !cur.sim) return null;
      const st = cur.sim.st(), h = st.h; if (st.as !== 'harold' || h.gone) return null;
      // the nearest one with lines, within reach (two can stand close: the unis either side of Malifex)
      let best = null, bd = 8;
      for (const a of st.cast) {
        if (a.gone) continue;
        const def = (cur.place.actors || []).find((x) => (x.id || x.who) === a.id && x.talk), d = Math.hypot(a.c - h.c, (a.r - h.r) * 2);
        if (def && d < bd) { best = { a, def }; bd = d; }
      }
      return best;
    }
    function openTalk(t) {
      const n = (t.def.talked = (t.def.talked || 0) + 1), T2 = t.def.talk, again = T2.again || [];
      let lines = n === 1 || !again.length ? T2.first : again[(n - 2) % again.length];
      const g = goal(), hp = hero(), dir = g ? COMPASS[((Math.round(Math.atan2((g.y - hp.y) * 2, g.x - hp.x) / (Math.PI / 4)) % 8) + 8) % 8] : 'nowhere in particular';
      const fill = (x) => x && x.replace('{dir}', dir).replace('{goal}', g ? g.say || g.what : 'nothing to do but sit a while');
      lines = lines.map((l) => ({ ...l, text: fill(l.text), means: fill(l.means) }));
      talk = { lines, i: 0, t0: T, who: t.a };
      line();
    }
    function line() {
      const l = talk.lines[talk.i]; talk.t0 = T; talk.page = 0; talk.pageChars = undefined;
      if (l.who === 'mishka') { if (window.WK_BEAR) WK_BEAR.hum(cur.sim.t); if (window.WK_SOUND) WK_SOUND.hum(1); }
    }
    // Mishka has the last word: a small meow at the end of every talk with him
    function mew() { if (cur && cur.sim) cur.sim.say('=^.^=', 'mishka', 1.4); if (window.WK_SOUND) setTimeout(() => WK_SOUND.meow(), 250); mewNext = false; }
    const shown = () => Math.floor((T - talk.t0) * 45);
    // takes the input's A while a talk is open (and until it's let go after one), so the sim never quacks for it
    function talkInput(inp) {
      if (!inp) return inp;
      const press = inp.a && !aPrev; aPrev = !!inp.a;
      const still = { x: 0, y: 0, a: false, b: false };
      if (card) { if (press && T - card.t0 > 1.2) { card = null; talkHold = true; } return still; }
      if (talk) {
        if (press) { if (shown() < (talk.pageChars ?? Infinity)) talk.t0 = -1e9; else if ((talk.page || 0) + 1 < (talk.pages || 1)) { talk.page = (talk.page || 0) + 1; talk.t0 = T; } else if (++talk.i >= talk.lines.length) { const by = talk.who && talk.who.who; if (by === 'mishka') mew(); else if (by === 'malifex') cur.sim.fire({ do: 'perceive', who: talk.who.id }); talk = null; talkHold = true; } else line(); }
        return still;
      }
      if (scene && !scene.def.free) return still;
      if (talkHold) { if (!inp.a) talkHold = false; return { ...inp, a: false }; }
      // a press starts its scene even over a free one (Harold's remarks as he walks in)
      if (press && (!scene || scene.def.free)) { const d = sceneFor(true); if (d) { playScene(d); return still; } }
      if (press) { const t = talker(); if (t) { openTalk(t); return still; } }
      return inp;
    }
    function talkBox(rows, cols) {
      const w = Math.min(cols - 4, 64), c0 = Math.round(cols / 2 - w / 2), lift = window.WK_HOST && WK_HOST.hosted() ? 2 : 0, r1 = rows - 2 - lift, r0 = r1 - 5;
      const l = talk.lines[talk.i], n = shown(), wrap = (txt) => { const out = []; let ln = ''; for (const wd of txt.split(' ')) { if ((ln + ' ' + wd).trim().length > w - 4) { out.push(ln); ln = wd; } else ln = (ln + ' ' + wd).trim(); } if (ln) out.push(ln); return out; };
      Wm.ink(c0, r0, w + 1, r1 - r0 + 1); Wm.box(c0, r0, c0 + w, r1, P.beigeDim);
      const name = l.name || l.who;
      Wm.text(c0 + 2, r0, ' ' + name + ' ', l.who === 'mishka' ? P.brown : l.who === 'harold' ? P.yellow : P.beige);
      // ' / ' breaks a line (Mishka's songs); four lines fit, and a longer one (a song on a narrow phone) goes on over
      // pages, A turning each – nothing is cut off
      const rowsOf = [...l.text.split(' / ').flatMap(wrap).map((t) => ({ t })), ...(l.means ? wrap(l.means).map((t) => ({ t, dim: true })) : [])];
      talk.pages = Math.max(1, Math.ceil(rowsOf.length / 4)); const page = Math.min(talk.page || 0, talk.pages - 1), vis = rowsOf.slice(page * 4, page * 4 + 4);
      talk.pageChars = vis.reduce((a, x) => a + x.t.length, 0); let k = n;
      vis.forEach((x, j) => { (x.dim ? Wm.textI : Wm.text).call(Wm, c0 + 2, r0 + 1 + j, x.t.slice(0, Math.max(0, k)), x.dim ? P.beigeDim : P.beige); k -= x.t.length; });
      if (k >= 0 && Math.floor(T * 2) % 2) Wm.text(c0 + w - 4, r1, page + 1 < talk.pages ? ' ▼ ' : ' A ', P.beige);
    }
    function goal() {
      if (!cur || !cur.S) return null;
      const p = cur.place, fl = cur.S.flags || {}, at = (c, r, what) => ({ x: cur.ox + (c + 0.5) * 8, y: cur.oy + (r + 0.5) * 16, what });
      for (const s of p.solve || []) { const tx = PL.solveText(p, s); if (tx && !fl[tx.toLowerCase()]) { const n = tx.length / 2 - 0.5; return { ...at(s.at[0] + (s.dir === 'col' ? 0 : n), s.at[1] + (s.dir === 'col' ? n : 0), 'spell ' + tx), say: 'where ' + tx + ' wants spelling' }; } }
      // a scene waiting for a press that's the area's next thing (the couch's TV: start the countdown)
      const ps = (p.scenes || []).find((d) => d.goal && d.on && (d.on.press || d.on.enter) && !(cur.done && cur.done.has(d.id)) && !(d.unless && fl[d.unless]));
      if (ps) { const [c0, r0, c1, r1] = ps.on.press ? pressBox(ps.on) : ps.on.enter; return { ...at((c0 + c1) / 2, (r0 + r1) / 2, ps.label || 'look'), say: ps.label }; }
      const ons = (p.exits || []).filter((e) => e.way === 'on'), open = ons.filter((e) => !e.needs || fl[e.needs]), gated = !open.length && ons.find((e) => e.needs);
      const dig = gated && cur.sim && cur.sim.st().letters.find((l) => l.digit && l.state !== 'gone');
      if (dig) return { x: cur.ox + dig.x, y: cur.oy + dig.y, what: 'pick up the ' + dig.ch, say: 'the ' + dig.ch + ' bug dropped' };
      if (gated) { const b = (cur.S.cast || []).find((a) => a.who === 'bug' && !a.gone); return b ? { x: cur.ox + b.x, y: cur.oy + b.y - 8, what: 'quack ahead of bug', say: 'after bug' } : null; }
      const on = open.find((e) => e.cells) || open[0]; if (!on) return null;
      if (!areas.some((A) => A.place.place === on.to)) return null;   // the way on leads to a place not built yet (chapter 1): nowhere to point
      if (on.cells) return { ...at((on.cells[0] + on.cells[2]) / 2 - 0.5, (on.cells[1] + on.cells[3]) / 2, on.label || 'the door'), say: on.label || 'to the door' };
      const [a, b] = on.rows || [20, 30];
      const way = on.edge === 'east' ? at(AC - 1, (a + b) / 2, 'on, east') : on.edge === 'west' ? at(0, (a + b) / 2, 'on, west') : null;
      return way && { ...way, say: 'the way on' };
    }
    const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
    function course(row) {
      const g = goal(); if (!g) return;
      const hp = hero(), dx = g.x - hp.x, dy = (g.y - hp.y) * 2, d = Math.hypot(dx, dy) / 8;
      const arrow = d < 4 ? '·' : ARROWS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
      inkText(1, row, 'next: ' + g.what + ' ' + arrow, P.tealHi);
      const sx = g.x - cam.x + V.w / 2, sy = g.y - cam.y + V.h / 2, m = 24;
      if (sx > m && sx < V.w - m && sy > m && sy < V.h - m) return;
      // off screen: an arrow at the edge, where the line from the middle of the view to the goal leaves it
      const ox = sx - V.w / 2, oy = sy - V.h / 2, k = Math.min((V.w / 2 - m) / Math.abs(ox || 1e-6), (V.h / 2 - m) / Math.abs(oy || 1e-6));
      if (Math.floor(T * 2) % 2) Wm.loose(Math.round(V.w / 2 + ox * k), Math.round(V.h / 2 + oy * k), ARROWS[((Math.round(Math.atan2(oy, ox) / (Math.PI / 4)) % 8) + 8) % 8], P.tealHi, 0, 16);
    }
    function menuList(r0, list) {
      hits = [];
      list.forEach((it, i) => {
        const on = i === sel, s = on ? (it === 'start' ? (Math.floor(T * 2) % 2 ? '> START <' : '  START  ') : '> ' + it + ' <') : it;
        centre(r0 + i * 2, s, on ? (it === 'start' ? P.phosphor : P.beige) : P.beigeDim);
        hits.push({ i, y0: (r0 + i * 2 - 0.6) * 16, y1: (r0 + i * 2 + 1.6) * 16 });
      });
      if (showControls) CONTROLS.forEach((s, j) => centre(r0 + list.length * 2 + 1 + j, s, P.tealHi));
    }
    function ui() {
      const g = Wm.g; Wm.ox = 0; Wm.oy = 0; Wm.reset();
      const rows = Math.floor(V.h / 16), cols = Math.floor(V.w / 8);
      if (mode === 'title' || mode === 'lift') {
        const lift = mode === 'lift' ? Math.min(6, Math.floor((T - liftT) * 10)) / 6 : 0;
        if (lift >= 1) mode = startT >= 0 ? 'play' : mode;
        const fs = Math.max(40, Math.min(128, Math.floor((V.w * 0.92) / 4.7))), y0 = Math.round(V.h * 0.05 - lift * V.h * 0.6);
        g.textAlign = 'center'; g.textBaseline = 'top'; g.font = fs + 'px VT323, monospace'; g.lineJoin = 'round';
        g.lineWidth = Math.max(6, fs * 0.08); g.strokeStyle = P.ink; g.strokeText('WEBKEEPER', V.w / 2, y0 + fs * 0.05);
        g.fillStyle = P.phosphorDeep; g.fillText('WEBKEEPER', V.w / 2, y0 + fs * 0.05);
        g.fillStyle = P.phosphor; g.fillText('WEBKEEPER', V.w / 2, y0);
        Wm.reset();
        const r1 = Math.round((y0 + fs * 0.98) / 16);
        if (r1 > 0) { centre(r1, 'harold kept a copy.', P.beige); centre(r1 + 1, '· temporary internet files ·', P.beigeDim); }
        if (!lift) menuList(Math.max(r1 + 3, rows - 6), items());
      }
      if (mode === 'menu') {
        const w = Math.min(cols - 4, 44), c0 = Math.round(cols / 2 - w / 2), r0 = Math.max(1, Math.round(rows / 2 - 9)), h = items().length * 2 + 4 + (showControls ? 5 : 0);
        Wm.ink(c0, r0, w + 1, h + 1); Wm.box(c0, r0, c0 + w, r0 + h, P.beigeDim);
        centre(r0 + 1, 'webkeeper · harold\'s copy', P.phosphor); centre(r0 + 2, 'temporary internet files', P.beigeDim);
        menuList(r0 + 4, items());
        if (visitors) centre(r0 + h - 1, 'you are visitor ' + String(visitors).padStart(6, '0'), P.tealUp);
      }
      if (mode === 'play') {
        const hs = (cur && cur.S && cur.S.hint) || (hintW && hintW.till > T ? hintW.text : null);
        // on the couch Voyager's controls bar runs along the bottom: hints stand above it
        thoughts();
        const hr = rows - (window.WK_HOST && WK_HOST.hosted() ? 4 : 2);
        if (talk) talkBox(rows, cols);
        else if (hs) centre(hr, hs, P.beigeDim, true);
        else { const t = talker(), ps = pressSpot(); if (ps) centre(hr, 'A: ' + (ps.label || 'look'), P.beige); else if (t) centre(hr, 'A: talk to ' + (t.def.id || t.def.who), P.beige); }
        if (nameW && nameW.till > T) inkText(1, 0, nameW.text, P.beigeDim);
        if (cur && cur.S && cur.S.as === 'malifex') inkText(1, 1, 'as malifex', P.phosphor);
        course(cur && cur.S && cur.S.as === 'malifex' ? 2 : nameW && nameW.till > T ? 1 : 0);
        if (touchUI) {
          if (stick) { Wm.loose(stick.x0, stick.y0, 'O', P.tealUp, 0, 48); Wm.loose(stick.x, stick.y, 'o', P.beige, 0, 24); }
          const P2 = pads();
          for (const [n, [x, y], col] of [['A', P2.A, P.beige], ['B', P2.B, P.beigeDim]]) {
            for (let j = 0; j < 16; j++) { const a = (j / 16) * Math.PI * 2; Wm.loose(Math.round(x + Math.cos(a) * P2.r), Math.round(y + Math.sin(a) * P2.r), 'o', col, 0, 12); }
            Wm.loose(Math.round(x), Math.round(y), n, col, 0, 24);
          } if (!(window.WK_HOST && WK_HOST.hosted())) inkText(cols - 4, 0, '[=]', P.beigeDim);
        }
        if (card) titleCard(rows, cols);
      } else if (hintW && hintW.till > T) centre(rows - 1, hintW.text, P.beigeDim, true);
      if (showMs) { const s = 'bake ' + stats.bake.toFixed(1) + ' · draw ' + stats.draw.toFixed(1) + ' ms · ' + V.s + 'x · ' + cols + ' x ' + rows; inkText(cols - s.length - 1, rows - 1, s, P.beigeDim); }
    }

    // ── one frame: input, the world's step, the camera, baking within the budget, drawing
    const fontOk = () => Wm.fontReady() && document.fonts.check('16px VT323') && document.fonts.check('12px VT323');
    // an area three or more behind is let go (its marks, its tiles), so the heap stays the size of the view's neighbourhood;
    // it is built again if Harold walks back
    function unload() {
      for (const A of areas) if (A.ready && Math.abs(A.slot - cur.slot) > 2 && A.i !== wantArea && !SHOT) {
        if (A.met) A.mem = memOf(A);   // what happened here stays: lib/room.js snapshot()
        for (const cv of A.sc.layers()) cv.free();
        if (A.glh) { for (const h of Object.values(A.glh)) GLR.free(h); A.glh = null; }
        A.sc = null; A.sim = null; A.S = null; A.ready = false; A.job = null; A.prints = []; A.last.clear(); A.pools = undefined;
      }
    }
    function bake(deadline) {
      unload();
      // the areas round Harold, and the one a save is waiting to carry on in
      const want = areas.filter((A) => !A.ready && (Math.abs(A.slot - cur.slot) <= 2 || A.i === wantArea)).sort((a, b) => (b.i === wantArea) - (a.i === wantArea) || Math.abs(a.slot - cur.slot) - Math.abs(b.slot - cur.slot));
      for (const A of visible(cam)) for (const cv of A.sc.layers()) if (cv.bare(viewOf(A, cam))) cv.bakeSome(Wm, Math.min(deadline, performance.now() + budget * 0.5), viewOf(A, cam), T, 0);
      for (const A of want) { runJob(A, Math.min(deadline, performance.now() + budget * (A.slot === cur.slot + 1 || A.i === wantArea ? 0.8 : 0.5))); if (performance.now() >= deadline) return; }
      for (const A of visible(cam)) for (const cv of A.sc.layers()) if (cv.bakeSome(Wm, deadline, viewOf(A, cam), T)) return;
    }
    // loading: plain ink (the title's own words come with the title); an error is said
    function loading() { Wm.clear(); Wm.reset(); if (err) centre(Math.floor(V.h / 32), 'could not load the meadow – ' + err, P.red); }
    function frame(dt) {
      if (!sized() && !size()) return;
      if (!loaded || !fontOk()) { loading(); return; }
      B.MEM.frame++;
      const b0 = performance.now();
      if (!ready) {
        runJob(areas[0], performance.now() + 30);
        if (!areas[0].ready) { loading(); return; }
        moveCam(0, true); render(true); ready = true; window.__wkReady = true;
        // reloaded while playing on its own page: straight back in, as PLAY would (no title to press through)
        if (wasPlaying && !SHOT && mode === 'title') choose(0);
      }
      if (mode === 'play') {
        if (!SHOT && !cfg.bench && !saidPlaying) { saidPlaying = true; playing(true); }
        // PLAY on the title carries on from this device's save, once its area is built
        // a new night (no save) starts on the couch, the prologue, once it's built (it's built while the title shows)
        if (resume) {
          const d = SAVE.read(), couch = areas.find((A) => A.place.place === '0.1');
          if (!d && couch && !SHOT) { if (couch.ready) { G.put(couch.i, ...couch.place.actors.find((a) => a.who === 'harold').at); arrived = couch; resume = false; wantArea = -1; } else wantArea = couch.i; }
          else { const di = SAVE.areaOf(d); if (di < 0) { resume = false; wantArea = -1; } else if (areas[di].ready) { SAVE.apply(d); resume = false; wantArea = -1; } else wantArea = di; }
        }
        // (scenes wait while PLAY carries on: the area Harold stands in now isn't the one he's going to)
        if (!resume) sceneStep();
        if (T - savedAt > 5) { savedAt = T; SAVE.write(); }
      }
      if (mode !== 'menu') {
        const inp = mode === 'play' ? talkInput(input()) : mode === 'lift' ? input() : (input(), null);
        if (window.WK_SOUND) WK_SOUND.play = mode === 'play';
        stepAll(dt, inp);
        titleTick(dt);
      } else input();   // (the world waits; a gamepad still moves through the menu and chooses)
      moveCam(dt, false);
      bake(performance.now() + budget);
      const b1 = performance.now();
      render(false);
      const b2 = performance.now();
      stats.bake = stats.bake * 0.9 + (b1 - b0) * 0.1; stats.draw = stats.draw * 0.9 + (b2 - b1) * 0.1;
      return { bake: b1 - b0, draw: b2 - b1 };
    }

    // ── shots: the world replayed from 0 to t (the GIFs), deterministic
    let shotInit = false;
    function shotTo(t) {
      if (!sized() && !size()) return false;
      if (!loaded || !fontOk()) return false;
      const need = areas.filter((A) => Math.abs(A.slot - areas[SHOT.area || 0].slot) <= 1);
      for (const A of need) if (!A.ready) runJob(A, Infinity);
      if (!shotInit || t < T - 1e-6) {
        T = 0; cur = areas[SHOT.area || 0];
        for (const A of need) { A.sim.reset(); if (A !== cur) A.sim.leave(); A.prints = []; A.last.clear(); A.S = A.sim.state(); }
        attract = null; idle = 0; shotInit = true; moveCam(0, true);
      }
      while (T < t - 1e-9) { const d = Math.min(DT, t - T); stepAll(d, null); if (mode === 'title') titleTick(d); moveCam(d, false); }
      B.MEM.frame++; render(true);
      return true;
    }
    if (SHOT) {
      window.__frame = shotTo;
      // build the areas a shot needs in slices (a capture step has a time limit): true once all are ready
      window.__prep = (ms = 3000) => {
        if (!loaded || !fontOk()) return false;
        const end = performance.now() + ms;
        for (const A of areas) if (Math.abs(A.slot - areas[SHOT.area || 0].slot) <= 1 && !A.ready) { runJob(A, end); if (!A.ready) return false; }
        return true;
      };
    }

    // ── the bench: Harold walks the path from 0.2 to the doorstep of 0.6 at his speed (through the puzzles, as if solved),
    // a frame every 1/60 s of world time; every frame's bake and draw are timed apart
    async function bench(o = {}) {
      const mc = new MessageChannel(), qq = [], tick = () => new Promise((r) => { qq.push(r); mc.port2.postMessage(0); });
      mc.port1.onmessage = () => { const r = qq.shift(); if (r) r(); };
      while (!loaded || !fontOk()) await tick();
      const w0 = performance.now(); while (performance.now() - w0 < 400) await tick();
      const t0 = performance.now(); let first = 0;
      while (!ready) { await tick(); frame(DT); if (ready) first = performance.now() - t0; }
      mode = 'play'; startT = -9; ghost = true;
      const route = o.route || [[34, 29], [158, 29], [318, 29], [478, 27.4], [560, 30], [620, 30.4], [718, 26]], out = [];
      let seg = 0, u = 0, stall = 0;
      const pos = () => { const a = route[seg], b = route[seg + 1], f = u; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
      while (seg < route.length - 1) {
        await tick();
        const a = route[seg], b = route[seg + 1], len = Math.hypot((b[0] - a[0]) / 22, (b[1] - a[1]) / 11);
        const [c, r] = pos(), ai = clamp(Math.floor(c / AC), 0, areas.length - 1), A = areas[ai];
        if (!A.ready) { stall++; } else {
          u += DT / len; if (u >= 1) { u = 0; seg++; }
          if (A !== cur) { cur.sim.leave(); cur = A; }
          A.sim.take(c - ai * AC, r, true); Object.assign(A.sim.st().h, { moving: true, vx: 176, vy: 0 });
        }
        const f = frame(DT); out.push({ t: T, c, area: ai, bake: f ? f.bake : 0, draw: f ? f.draw : 0, stall: !A.ready, mem: B.MEM.px, miss: stats.miss, marks: stats.marks || 0 });
        if (o.onFrame) o.onFrame(out.length, out[out.length - 1]);
      }
      const res = { gpu: GL(), marks: areas.map((A) => A.marks || 0), parts: stats.parts, reused: B.MEM.reused, first, frames: out, areas: areas.map((A) => A.rec), stall, mem: B.MEM.px, baked: B.MEM.baked, evicted: B.MEM.evicted, view: { ...V } };
      window.__wkWorldBench = res; return res;
    }

    // what the debug panel and the host reach in for: the view, the areas, the clock, the mode, and moving Harold
    const G = {
      V, cam, areas, get T() { return T; }, get mode() { return mode; }, set mode(m) { mode = m; sel = 0; }, frame, render, bench, get cur() { return cur; }, stats,
      get ready() { return ready; }, get loaded() { return loaded; }, get err() { return err; }, get gl() { return GL(); }, budget,
      paused: false, steps: 0, speed: 1, onFrame: () => {}, off: new Set(),
      /** the clock held (Voyager's menu is open, lib/host.js); let go, the A that closed the menu isn't a quack */
      get held() { return held; }, set held(v) { if (held && !v) holdA = true; held = !!v; },
      /** the player's zoom: 1, 0.75 or 0.5 (Voyager's settings on the couch, lib/host.js) */
      get zoom() { return zoomK; }, set zoom(z) { setZoom(+z); },
      menu() { if (mode === 'play') { mode = 'menu'; sel = 0; } },
      start() { if (!ready) return; if (mode === 'title') choose(0); else if (mode === 'menu') { mode = 'play'; holdA = true; } },
      title() { mode = 'title'; sel = 0; idle = 0; attract = null; showControls = false; if (saidPlaying) { saidPlaying = false; playing(false); } },
      saveCode() { return SAVE.code(); },
      /** start again from the couch: the save gone, every area as it was (words unspelled, scenes unplayed) */
      newNight() {
        SAVE.clear();
        for (const A of areas) {
          A.done = null; A.met = false; A.mem = null; if (A.sim) A.sim.reset(); if (A !== cur && A.sim) A.sim.leave();
          for (const a of A.place.actors || []) delete a.talked;   // everyone says their first lines again
        }
        talk = null; scene = null; card = null; thinkW = null; fresh = true;
        const couch = areas.find((A) => A.place.place === '0.1');
        if (couch && couch.ready) { G.put(couch.i, ...couch.place.actors.find((a) => a.who === 'harold').at); arrived = couch; }
        else if (couch) { wantArea = couch.i; resume = true; }
      },
      loadCode(code) { const ok = SAVE.load(code); if (ok) { mode = 'play'; talk = null; scene = null; card = null; } return ok; },
      /** on the couch the title counts Voyager's real visitors (lib/host.js) */
      set visitors(n) { visitors = n; },
      /** Harold to big cell (c, r) of area i, if it's built */
      put(i, c, r) { const A = areas[i]; if (!A || !A.ready) return false; if (!A.met && (A.place.events || []).length) A.sim.reset(); A.met = true; if (A !== cur) { cur.sim.leave(); cur = A; } A.sim.take(c, r, false); if (mode === 'title') { mode = 'play'; startT = -9; } moveCam(0, true); return true; },
      /** build area i ahead of the others (the debug panel's jump to an area not built yet) */
      want(i) { if (areas[i] && !areas[i].ready) wantArea = i; },
      walkable(i, c, r) { const A = areas[i]; return !!(A && A.ready && A.sim.walkable(c, r)); },
      hero,
      /** the scene that's playing (its id and step), and the title card if one is up */
      get scene() { return scene && { id: scene.def.id, i: scene.i, n: scene.def.steps.length }; }, get card() { return card && card.lines; },
      /** where the course line points: what's next to do */
      get goal() { const g = goal(); return g && g.what; },
      /** the talk that's open, if any: who's speaking, which line of how many */
      get talk() { return talk && { i: talk.i, n: talk.lines.length, who: talk.lines[talk.i].who, text: talk.lines[talk.i].text, pages: talk.pages || 1, page: talk.page || 0 }; },
      /** wading, for the debug panel and the checks: rings on the water, drops, wet or not */
      get wade() { return { wet: WADE.wet, rings: WADE.rings.length, drops: WADE.drops.length }; },
    };
    window.__wkWorld = G;
    if (!SHOT && !cfg.bench) {
      let last = performance.now();
      // the debug panel (lib/debug.js) can hold the clock, step it one frame at a time or run it slower or faster
      const loop = (now) => {
        requestAnimationFrame(loop);
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        if (!Webkeeper.visible() || G.held) return;
        if (G.paused) { if (G.steps > 0) { G.steps--; G.onFrame(frame(1 / 60), 1 / 60); } return; }
        G.onFrame(frame(dt * G.speed), dt);
      };
      requestAnimationFrame(loop);
    }
    return G;
  }

  window.WK_WORLD = { create, AREAS };
})();
