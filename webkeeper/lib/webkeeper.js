// webkeeper.js – the shared core every card in this design system draws with.
// The same rules as the game (brief/LOOK.md): a grid of VT323 glyphs on ink; built things sit
// in cells, living things come loose and settle back. One file, no build; a card does:
//   <script src="../lib/webkeeper.js"></script>
//   const W = Webkeeper.screen(canvas, { cell: 18 });   // cw = cell / 2, ch = cell
//   W.loop((t, dt) => { W.clear(); ... });
(function () {
  // Voyager's palette and its tints; Mishka's brown and the rainbow only where named
  const P = {
    ink: '#0A1416', ocean: '#0E3B43', phosphor: '#33FF66', beige: '#D4C8A8',
    red: '#E63946', yellow: '#FFD23F',
    inkUp: '#132326', tealUp: '#1F6E78', tealHi: '#4FA3A0', phosphorDim: '#1C8F3D',
    phosphorDeep: '#0F4A22', beigeDim: '#8A8270', yellowDim: '#B8962C', redDim: '#8C2A33',
    burgundy: '#A23A44',
    brown: '#A0683F', brownDim: '#5E3C25',            // Mishka only
  };
  const RAINBOW = ['#E63946', '#F28C28', '#FFE14D', '#33FF66', '#3F7FE0', '#8E44AD'];   // the rainbow only

  // a well-mixed hash in 32-bit integer maths: the same field on every load
  const hash = (x, y = 0, z = 0) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  // a seeded random stream, for generators: rand(seed)() → 0..1
  const rand = (seed) => { let s = seed | 0; return () => hash(s++, seed, 7); };
  // rolling gusts across the field
  const wind = (x, y, t) => Math.sin(x * 0.09 - t * 1.3 + Math.sin(y * 0.2 + t * 0.4)) * 0.6 + Math.sin(x * 0.023 - t * 0.55) * 0.55;

  const HAROLD = ['   _  ', ' >(.)__', '  (___/'];   // 7 × 3 cells: the unit of every size

  // Every card draws on a fixed stage, 1280 × 720, and the page scales it to whatever width it's
  // shown at (the Design System pane, a full window, a phone) keeping 16:9 – so a card looks the
  // same everywhere and never lays itself out for a tiny preview strip.
  const STAGE = { w: 1280, h: 720 };
  const STAGE_CSS = 'html,body{margin:0;background:#0A1416;overflow:hidden;touch-action:none}'
    + 'canvas{display:block;width:100%;height:auto;aspect-ratio:16/9}';
  function screen(canvas, opt = {}) {
    if (!document.getElementById('wk-stage')) {
      const st = document.createElement('style'); st.id = 'wk-stage'; st.textContent = STAGE_CSS; document.head.appendChild(st);
    }
    const g = canvas.getContext('2d');
    // opt.w / opt.h: a stage of another size (the world's buffers); opt.dpr: a fixed scale (device pixels per stage px,
    // the world's whole-number zoom included); S.ox / S.oy: a device-pixel offset every reset() applies (the camera)
    const S = { g, P, RAINBOW, canvas, cell: opt.cell || 18, cw: 0, ch: 0, cols: 0, rows: 0, W: 0, H: 0, dpr: 1, t: 0, ox: 0, oy: 0 };
    function resize() {
      S.dpr = opt.dpr || Math.min(2, devicePixelRatio || 1);
      S.W = opt.w || STAGE.w; S.H = opt.h || STAGE.h;
      canvas.width = S.W * S.dpr; canvas.height = S.H * S.dpr;
      S.ch = S.cell; S.cw = Math.round(S.cell / 2);
      S.cols = Math.floor(S.W / S.cw); S.rows = Math.floor(S.H / S.ch);
      reset();
    }
    function reset() {
      g.setTransform(S.dpr, 0, 0, S.dpr, S.ox, S.oy);
      g.textAlign = 'left'; g.textBaseline = 'top';
      g.font = `${S.ch}px VT323, monospace`;
    }
    S.reset = reset;
    S.resize = (w, h, dpr) => { opt.w = w; opt.h = h; if (dpr) opt.dpr = dpr; resize(); };
    // a pointer event → stage pixels, however big the canvas is shown
    S.toLocal = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * STAGE.w / r.width, y: (e.clientY - r.top) * STAGE.h / r.height }; };
    S.clear = (col = P.ink) => { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = col; g.fillRect(0, 0, canvas.width, canvas.height); reset(); };
    // a glyph in a cell – for built things
    S.put = (c, r, chr, col) => { g.fillStyle = col; g.fillText(chr, c * S.cw, r * S.ch); };
    S.text = (c, r, str, col) => { for (let k = 0; k < str.length; k++) if (str[k] !== ' ') S.put(c + k, r, str[k], col); };
    // italic: voices and thoughts
    S.textI = (c, r, str, col) => {
      for (let k = 0; k < str.length; k++) {
        g.setTransform(S.dpr, 0, -0.24 * S.dpr, S.dpr, ((c + k) * S.cw + 0.24 * S.ch) * S.dpr + S.ox, r * S.ch * S.dpr + S.oy);
        g.fillStyle = col; g.fillText(str[k], 0, 0);
      }
      reset();
    };
    // a loose glyph: anywhere, any angle, any size – for living things. x, y are its centre in px
    // Each glyph is drawn once per colour and size into a small atlas tile, then stamped: setting
    // the font and drawing text for thousands of loose glyphs a frame was what made cards slow
    const atlas = new Map();
    const tile = (chr, col, size) => {
      const key = chr + '|' + col + '|' + size + '|' + S.dpr;   // (the screen's scale too: a zoom change makes new tiles, not blurry old ones)
      let t = atlas.get(key);
      if (!t) {
        const px = Math.ceil(size * S.dpr), w = Math.ceil(px * 1.1), h = Math.ceil(px * 1.25);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const x = cv.getContext('2d');
        x.font = `${px}px VT323, monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = col; x.fillText(chr, w / 2, h / 2);
        t = { cv, w: w / S.dpr, h: h / S.dpr };
        if (fontReady) atlas.set(key, t);   // don't keep tiles drawn before VT323 arrived
      }
      return t;
    };
    let fontReady = false;
    document.fonts.load('16px VT323').then(() => { fontReady = true; atlas.clear(); });
    // looseOn stamps the same atlas tile into any context scaled by dpr (brushes cache patches with it)
    // (dpr: the scale that context is drawn at, if it isn't the screen's – a baked image's, say)
    S.looseOn = (ctx, x, y, chr, col, ang = 0, size = S.ch, dpr = S.dpr) => {
      const t = tile(chr, col, Math.round(size));
      if (ang) { const ox = ctx === g ? S.ox : 0, oy = ctx === g ? S.oy : 0, c = Math.cos(ang) * dpr, s = Math.sin(ang) * dpr; ctx.setTransform(c, s, -s, c, x * dpr + ox, y * dpr + oy); ctx.drawImage(t.cv, -t.w / 2, -t.h / 2, t.w, t.h); ctx.setTransform(dpr, 0, 0, dpr, ox, oy); }
      else ctx.drawImage(t.cv, x - t.w / 2, y - t.h / 2, t.w, t.h);
    };
    S.loose = (x, y, chr, col, ang = 0, size = S.ch) => S.looseOn(g, x, y, chr, col, ang, size);
    S.tile = (chr, col, size = S.ch) => tile(chr, col, Math.round(size));   // { cv, w, h }: stamp it yourself
    S.fontReady = () => fontReady;
    S.ink = (c, r, w = 1, h = 1) => { g.fillStyle = P.ink; g.fillRect(c * S.cw, r * S.ch, w * S.cw, h * S.ch); };
    // Harold at true size: his feet on row r, his middle on column c
    S.harold = (c, r, flip = false) => {
      const lines = flip ? ['  _   ', '__(.)< ', '\\___)  '] : HAROLD;
      lines.forEach((l, k) => { for (let j = 0; j < l.length; j++) if (l[j] !== ' ') {
        const cc = Math.round(c) - 3 + j, rr = Math.round(r) - 2 + k;
        S.ink(cc, rr); S.put(cc, rr, l[j], l[j] === '>' || l[j] === '<' ? P.red : P.yellow);
      } });
    };
    // a ring of o's on a true ellipse, spreading from (c, r) over its age in seconds
    S.ring = (c, r, age, col = P.beige, speed = 26, life = 2.2) => {
      const front = age * speed;
      if (age < 0 || age > life) return -1;
      const R = front * S.cw, ry = front * S.ch / 1.8, n = Math.max(8, Math.round((Math.PI * (R + ry)) / (S.cw * 1.1)));
      for (let a = 0; a < n; a++) {
        const th = (a / n) * Math.PI * 2;
        S.loose((c + 0.5) * S.cw + Math.cos(th) * R, (r + 0.5) * S.ch + Math.sin(th) * ry, front < 8 ? 'O' : 'o', col);
      }
      return front;   // the ring's radius in columns, for "is this cell inside it"
    };
    // a box of box-drawing glyphs, for built frames
    S.box = (c0, r0, c1, r1, col) => {
      for (let c = c0 + 1; c < c1; c++) { S.put(c, r0, '─', col); S.put(c, r1, '─', col); }
      for (let r = r0 + 1; r < r1; r++) { S.put(c0, r, '│', col); S.put(c1, r, '│', col); }
      S.put(c0, r0, '┌', col); S.put(c1, r0, '┐', col); S.put(c0, r1, '└', col); S.put(c1, r1, '┘', col);
    };
    // a caption under a thing, centred
    S.label = (c, r, str, col = P.beigeDim) => S.text(Math.round(c - str.length / 2), r, str, col);
    // the loop: t in seconds; ?shot freezes it at ?t= for screenshots
    S.loop = (fn) => {
      const q = new URLSearchParams(location.search);
      // (the preview host can add its own t= to the address, so the last number given wins)
      if (q.has('shot')) { const tv = [...q.getAll('t'), ...q.getAll('at')].map(Number).filter(Number.isFinite); S.t = tv.length ? tv[tv.length - 1] : 0; fn(S.t, 0); let n = 0; const iv = setInterval(() => { fn(S.t, 0); if (++n > 20) clearInterval(iv); }, 200); /* until VT323 has loaded and the card has baked */ window.__frame = (t) => { if (Number.isFinite(+t)) S.t = +t; fn(S.t, 1 / 12); }; return; }
      // ?bench: once VT323 is in, draw three loops of 48 frames, each after yielding to the browser (so the last
      // frame's drawing is flushed, as between real frames), and time each;
      // window.__wkBench = [{ mean, max, bakes }] per loop (bakes: images baked during that loop – after
      // the first loop it should be 0). cards/brushes/timing.html reads it
      if (q.has('bench')) {
        // each frame yields to the browser first (as a real frame would), so its drawing is flushed
        const yieldNow = () => new Promise((r) => setTimeout(r, 0));
        const run3 = async () => {
          const out = [];
          for (let L = 0; L < 3; L++) {
            const ms = [], b0 = window.__wkBakes || 0, p0 = window.__wkPreps || 0;
            for (let f = 0; f < 48; f++) { await yieldNow(); S.t = L * 4 + (f + 0.5) / 12; const a = performance.now(); fn(S.t, 1 / 12); ms.push(performance.now() - a); }
            const mx = Math.max(...ms), p90 = ms.slice().sort((a, b) => a - b)[43];
            out.push({ mean: ms.reduce((p, v) => p + v, 0) / ms.length, max: mx, p90, at: (ms.indexOf(mx) + 0.5) / 12, bakes: (window.__wkBakes || 0) - b0, preps: (window.__wkPreps || 0) - p0 });
          }
          window.__wkBench = out;
        };
        const wait = () => { if (!fontReady || !document.fonts.check('12px VT323')) { setTimeout(wait, 100); return; } fn(0, 0); setTimeout(run3, 450); };
        wait();
        return;
      }
      // every frame is timed: window.__wkMs is the running average in ms, ?ms shows it on the card
      const showMs = q.has('ms'); let avg = 0;
      const run = (t, dt) => {
        const a = performance.now(); fn(t, dt); const d = performance.now() - a;
        avg = avg ? avg * 0.92 + d * 0.08 : d; window.__wkMs = avg;
        // the last loop's frames (48 at twelve a second): their mean and worst, once the bakes are done
        (S.ms || (S.ms = [])).push(d); if (S.ms.length > 48) S.ms.shift();
        window.__wkLoop = { mean: S.ms.reduce((p, q) => p + q, 0) / S.ms.length, max: Math.max(...S.ms) };
        if (showMs) { const s = ` ${avg.toFixed(1)} ms `; reset(); g.fillStyle = P.ink; g.fillRect(S.W - s.length * S.cw, S.H - S.ch, s.length * S.cw, S.ch); S.text(S.cols - s.length, S.rows - 1, s, P.beige); }
      };
      // motion is stepped anyway, so twelve frames a second is enough – and nothing is drawn
      // while the card is off-screen or the tab is hidden (a design system page shows many at once)
      let last = performance.now(), acc = 0;
      const step = (now) => {
        const dt = Math.min(0.25, (now - last) / 1000); last = now;
        if (Webkeeper.visible()) {
          acc += dt;
          if (acc >= 1 / 12) { S.t += acc; run(S.t, acc); acc = 0; }
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!opt.fixed) addEventListener('resize', resize);
    resize();
    return S;
  }

  // Settle: one number per cell – when it was last disturbed. A cell is loose for 0.4 s after
  // that, then steps back onto the grid (amt 1 → 0.6 → 0.3 → 0). Grass, water and light use it.
  function settleField(cols, rows) {
    const T = new Float32Array(cols * rows).fill(-99);
    return {
      touch(c, r, t) { if (c >= 0 && r >= 0 && c < cols && r < rows) T[r * cols + c] = t; },
      amt(c, r, t) { const a = t - T[r * cols + c]; return a < 0 ? 0 : a < 0.4 ? 1 : a < 0.7 ? 0.6 : a < 1 ? 0.3 : 0; },
    };
  }

  // is this card on screen? (an observer on the whole document; true until it reports)
  let onScreen = true;
  if ('IntersectionObserver' in window) {
    const watch = () => new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; }).observe(document.documentElement);
    if (document.documentElement) watch();
  }
  const visible = () => onScreen && !document.hidden;

  window.Webkeeper = { visible, STAGE, P, RAINBOW, hash, rand, wind, HAROLD, screen, settleField };
})();
