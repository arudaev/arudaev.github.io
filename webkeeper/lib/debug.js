// Webkeeper's debug panel: ?debug on the page, or the menu's "debug" row (index.html loads this file only then), or on the couch in Voyager
// with ?debug in the address. It shows what the game is doing as you play, on the device you play on – a phone
// included – so slowness and bugs are measured where they happen, not guessed from a desktop:
//   · frames: frames a second, and each frame's bake and draw time (median, p90, worst over the last 4 s), a graph
//     with the 60 and 30 a second lines, and how many frames took longer than 33 ms
//   · the world: mode, clock, area, Harold's cell, the view in big cells, the zoom, device pixels, GPU marks or not,
//     baked memory
//   · the areas: built or not, how long each took, its worst slice, and what's in it (trees, bushes, water,
//     reeds, flowers, lamps, light pools, fireflies) counted from its place file
//   · the clock: pause, one frame, slower and faster
//   · Harold: to the start of any area
//   · overlays: the big-cell grid, where Harold can walk (and, with streams, where a letter can't be left), the area seams
//   · a picture of the canvas, and a report (everything above as JSON) to copy or save
//   · errors and warnings, as they happen
// ` (backquote) folds the panel away and back. Nothing here changes the game unless you press something.
(() => {
  const P = { ink: '#0A1416', phosphor: '#33FF66', beige: '#D4C8A8', red: '#E63946', yellow: '#FFD23F', dim: '#7d8a80' };
  const N = 240;
  const kitOf = (p) => {
    const ops = [...(p.ground || []), ...(p.mid || []), ...(p.front || [])], k = (o) => o.brush || o.stamp || o.thing || o.op;
    const n = (pred) => ops.filter(pred).length;
    return {
      trees: n((o) => k(o) === 'tree'), bushes: n((o) => k(o) === 'bush'), hedges: n((o) => k(o) === 'hedge'),
      water: n((o) => ['water', 'ditch', 'pond', 'stream', 'puddle'].includes(k(o))), reeds: n((o) => k(o) === 'reeds'),
      flowers: n((o) => ['flowers', 'daisies'].includes(k(o))), moss: n((o) => k(o) === 'moss'),
      lamps: (p.things || []).filter((t) => t.thing === 'lamp').length, pools: ((p.light && p.light.pools) || []).length,
      ambient: p.light ? p.light.ambient : null, fireflies: (p.air && p.air.fireflies) || 0,
    };
  };
  const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

  function attach(W) {
    const css = document.createElement('style');
    css.textContent = `
      .wkd{position:fixed;left:6px;top:6px;z-index:9;width:min(380px,calc(100vw - 12px));max-height:calc(100vh - 12px);overflow:auto;
        background:${P.ink}ee;color:${P.beige};border:2px solid ${P.phosphor};font:16px/1 VT323,monospace;padding:6px 8px;box-shadow:4px 4px 0 #000;-webkit-font-smoothing:none}
      .wkd[data-fold=true]{width:auto;max-height:none} .wkd[data-fold=true] .wkd-body{display:none}
      .wkd h4{margin:6px 0 2px;font:inherit;color:${P.phosphor}} .wkd b{color:${P.yellow};font-weight:normal} .wkd .bad{color:${P.red}} .wkd .dim{color:${P.dim}}
      .wkd button{font:inherit;background:${P.ink};color:${P.beige};border:1px solid ${P.beige};margin:2px 2px 0 0;padding:1px 5px;cursor:pointer;border-radius:0}
      .wkd button:hover,.wkd button[aria-pressed=true]{background:${P.phosphor};color:${P.ink};border-color:${P.phosphor}}
      .wkd table{border-collapse:collapse;width:100%} .wkd td{padding:0 4px 0 0;white-space:nowrap}
      .wkd pre{margin:2px 0;white-space:pre-wrap;font:inherit;max-height:96px;overflow:auto}
      .wkd-ov{position:fixed;left:0;top:0;pointer-events:none;z-index:8;image-rendering:pixelated}`;
    document.head.appendChild(css);
    const box = document.createElement('div');
    box.className = 'wkd';
    box.innerHTML = `<div><b>webkeeper · debug</b> <button data-k="fold">[ – ]</button> <span class="wkd-fps"></span></div><div class="wkd-body">
      <canvas class="wkd-graph" width="${N}" height="48" style="width:100%;height:48px;display:block;margin-top:4px;image-rendering:pixelated"></canvas>
      <div class="wkd-frames"></div>
      <h4>the clock</h4><div><button data-k="pause">[ pause ]</button><button data-k="step">[ one frame ]</button>
        <button data-k="speed" data-v="0.25">¼×</button><button data-k="speed" data-v="0.5">½×</button><button data-k="speed" data-v="1">1×</button><button data-k="speed" data-v="2">2×</button><button data-k="speed" data-v="4">4×</button></div>
      <h4>the world</h4><div class="wkd-world"></div>
      <h4>the areas</h4><div class="wkd-areas"></div>
      <h4>overlays</h4><div><button data-k="ov" data-v="grid">[ grid ]</button><button data-k="ov" data-v="walk">[ walkable ]</button><button data-k="ov" data-v="seams">[ seams ]</button><button data-k="ov" data-v="hero">[ harold ]</button></div>
      <h4>save</h4><div><button data-k="shot">[ picture ]</button><button data-k="report">[ copy report ]</button><button data-k="save">[ save report ]</button></div>
      <h4>errors</h4><pre class="wkd-err dim">none yet</pre></div>`;
    document.body.appendChild(box);
    const $ = (s) => box.querySelector(s);
    // ?debug=fold starts folded (the headless check takes its pictures that way), and so does a phone: open, the panel
    // covers its whole screen
    if (new URLSearchParams(location.search).get('debug') === 'fold' || Math.min(innerWidth, innerHeight) < 600) { box.dataset.fold = true; $('[data-k=fold]').textContent = '[ + ]'; }
    const ov = document.createElement('canvas');
    ov.className = 'wkd-ov';
    document.body.appendChild(ov);

    // ── what happened: every frame's times, every error
    const F = [], errs = [];
    let fps = 0, n = 0, t0 = performance.now();
    const prev = W.onFrame;
    W.onFrame = (f, dt) => {
      prev(f, dt);
      n++;
      if (f) { F.push({ bake: f.bake, draw: f.draw, at: performance.now() }); if (F.length > N) F.shift(); }
    };
    const err = (s) => { errs.push(new Date().toISOString().slice(11, 19) + ' ' + s); if (errs.length > 40) errs.shift(); };
    addEventListener('error', (e) => err('error: ' + e.message + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '')));
    addEventListener('unhandledrejection', (e) => err('promise: ' + (e.reason && e.reason.message || e.reason)));
    const warn = console.warn.bind(console);
    console.warn = (...a) => { err('warn: ' + a.join(' ')); warn(...a); };

    const ovs = new Set();
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = b.dataset.k, v = b.dataset.v;
      if (k === 'fold') { const f = box.dataset.fold !== 'true'; box.dataset.fold = f; b.textContent = f ? '[ + ]' : '[ – ]'; }
      else if (k === 'pause') { W.paused = !W.paused; }
      else if (k === 'step') { W.paused = true; W.steps++; }
      else if (k === 'speed') W.speed = +v;
      else if (k === 'ov') { if (ovs.has(v)) ovs.delete(v); else ovs.add(v); }
      else if (k === 'area') { if (performance.now() - downAt > 800) go(+v); }
      else if (k === 'shot') shot();
      else if (k === 'report') navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(report(), null, 1)).then(() => err('report copied'), () => err('could not copy – use save'));
      else if (k === 'save') save(new Blob([JSON.stringify(report(), null, 1)], { type: 'application/json' }), 'webkeeper-report.json');
      e.preventDefault();
    });
    addEventListener('keydown', (e) => { if (e.key === '`') { $('[data-k=fold]').click(); e.preventDefault(); } });

    // an area that isn't built yet is built first (the world puts it ahead of the rest), and Harold goes once it is
    let pending = -1, downAt = -1e9;
    function go(i) {
      const A = W.areas[i]; if (!A) return;
      const h = (A.place.actors || []).find((a) => a.who === 'harold'), at = h ? h.at : [20, 30];
      if (W.put(i, at[0], at[1])) { pending = -1; return; }
      if (pending !== i) err('building ' + A.name + ' – Harold goes there when it is ready');
      pending = i; if (W.want) W.want(i);
    }
    // the areas table is written four times a second, so a press that spans a rewrite never became a click
    // (the ditch's button "didn't work"): the area buttons act on the press itself
    box.addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-k=area]'); if (!b) return; downAt = performance.now(); go(+b.dataset.v); });
    function save(blob, name) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    function shot() {
      const cv = document.getElementById('c');
      // the canvas is drawn every frame, so draw one now and copy it before the browser clears it
      W.render(true);
      cv.toBlob((b) => b && save(b, 'webkeeper-' + (W.cur ? W.cur.name : 'title') + '-' + Math.round(W.V.cssW) + 'x' + Math.round(W.V.cssH) + '.png'));
    }
    function frames() {
      const b = F.map((f) => f.bake), d = F.map((f) => f.draw), t = F.map((f) => f.bake + f.draw);
      return { n: F.length, fps, total: { p50: pct(t, 0.5), p90: pct(t, 0.9), worst: Math.max(0, ...t) }, bake: { p50: pct(b, 0.5), p90: pct(b, 0.9), worst: Math.max(0, ...b) },
        draw: { p50: pct(d, 0.5), p90: pct(d, 0.9), worst: Math.max(0, ...d) }, over33: t.filter((x) => x > 33).length };
    }
    function world() {
      const V = W.V, h = W.ready && W.cur ? W.cur.sim.st().h : null;
      return { mode: W.mode, T: +W.T.toFixed(2), area: W.cur ? W.cur.name : null, harold: h ? [+h.c.toFixed(1), +h.r.toFixed(1)] : null,
        view: { css: [V.cssW, V.cssH], cells: [Math.round(V.w / 8), Math.round(V.h / 16)], zoom: V.s, devicePx: V.k, bakeDpr: V.bdpr },
        gpu: W.gl, budgetMs: W.budget, memMB: window.WK_BRUSH ? +(WK_BRUSH.MEM.px * 4 / 1e6).toFixed(1) : null };
    }
    function areas() {
      return W.areas.map((A) => ({ i: A.i, name: A.name, ready: A.ready, building: !!A.job && !A.ready, ms: A.rec ? Math.round(A.rec.wall || 0) : null,
        worstSlice: A.rec ? Math.round(A.rec.worst) : null, slices: A.rec ? A.rec.slices : null, long: A.rec && A.rec.long ? A.rec.long.slice(0, 4) : [], marks: A.marks || 0, kit: kitOf(A.place) }));
    }
    function report() {
      return { at: new Date().toISOString(), page: location.href, ua: navigator.userAgent, screen: [screen.width, screen.height, devicePixelRatio],
        frames: frames(), world: world(), areas: areas(), errors: errs.slice() };
    }

    // ── the panel, four times a second; the overlays every frame they're on
    const ms = (x) => (x > 33 ? `<span class="bad">${x.toFixed(1)}</span>` : x > 16.7 ? `<b>${x.toFixed(1)}</b>` : x.toFixed(1));
    const g = $('.wkd-graph').getContext('2d');
    // written only when it changed, so a button isn't replaced under a finger
    const html = (q, h) => { const el = $(q); if (el._h !== h) { el._h = h; el.innerHTML = h; } };
    setInterval(() => {
      const now = performance.now(); fps = Math.round((n * 1000) / (now - t0)); n = 0; t0 = now;
      for (const b of box.querySelectorAll('[data-k=pause]')) { b.setAttribute('aria-pressed', W.paused); b.textContent = W.paused ? '[ play ]' : '[ pause ]'; }
      for (const b of box.querySelectorAll('[data-k=speed]')) b.setAttribute('aria-pressed', +b.dataset.v === W.speed);
      for (const b of box.querySelectorAll('[data-k=ov]')) b.setAttribute('aria-pressed', ovs.has(b.dataset.v));
      // folded, the header still says where Harold is: the area, and his column and row in it
      const w0 = world();
      $('.wkd-fps').innerHTML = `${fps < 30 ? `<span class="bad">${fps}</span>` : fps} fps · ${w0.area || '–'} · ${w0.harold ? w0.harold.join(', ') : '–'}`;
      const fr = frames();
      $('.wkd-frames').innerHTML = `<table><tr class="dim"><td></td><td>median</td><td>p90</td><td>worst</td></tr>
        <tr><td>frame</td><td>${ms(fr.total.p50)}</td><td>${ms(fr.total.p90)}</td><td>${ms(fr.total.worst)}</td></tr>
        <tr><td>bake</td><td>${ms(fr.bake.p50)}</td><td>${ms(fr.bake.p90)}</td><td>${ms(fr.bake.worst)}</td></tr>
        <tr><td>draw</td><td>${ms(fr.draw.p50)}</td><td>${ms(fr.draw.p90)}</td><td>${ms(fr.draw.worst)}</td></tr></table>
        <span class="dim">ms, last ${fr.n} frames · ${fr.over33 ? `<span class="bad">${fr.over33} over 33 ms</span>` : 'none over 33 ms'}</span>`;
      const w = world();
      $('.wkd-world').innerHTML = `${w.mode} · t ${w.T} s · ${w.area || '–'} · harold ${w.harold ? w.harold.join(', ') : '–'}<br>
        view ${w.view.cells[0]} × ${w.view.cells[1]} cells · ${w.view.css[0]} × ${w.view.css[1]} css · zoom ${w.view.zoom}× · ${w.view.devicePx} device px a world px<br>
        marks on the ${w.gpu ? 'GPU' : '<b>CPU (no WebGL2)</b>'} · baked ${w.memMB} MB · budget ${w.budgetMs} ms${W.err ? `<br><span class="bad">${W.err}</span>` : ''}`;
      if (pending >= 0) go(pending);
      html('.wkd-areas', '<table>' + areas().map((a) => `<tr><td><button data-k="area" data-v="${a.i}">${a.name}</button></td>
        <td>${a.ready ? `built ${a.ms} ms` : a.building ? '<b>building</b>' : '<span class="dim">not built</span>'}${a.worstSlice > 12 ? ` · <span class="bad">slice ${a.worstSlice}</span>` : ''}</td></tr>
        <tr class="dim"><td colspan="2">${a.kit.trees} trees · ${a.kit.bushes} bushes · ${a.kit.water} water · ${a.kit.reeds} reeds · ${a.kit.flowers} flowers · ${a.kit.lamps} lamps · ${a.kit.pools} pools · ${a.kit.fireflies} fireflies · light ${a.kit.ambient}</td></tr>`).join('') + '</table>');
      $('.wkd-err').textContent = errs.length ? errs.slice(-12).join('\n') : 'none yet';
      $('.wkd-err').className = 'wkd-err ' + (errs.some((e) => / error:| promise:/.test(e)) ? 'bad' : 'dim');
      // the graph: total frame time, a column a frame; lines at 16.7 and 33 ms
      g.fillStyle = P.ink; g.fillRect(0, 0, N, 48);
      F.forEach((f, i) => { const t = f.bake + f.draw, h = Math.min(48, (t / 50) * 48); g.fillStyle = t > 33 ? P.red : t > 16.7 ? P.yellow : P.phosphor; g.fillRect(i, 48 - h, 1, h); });
      g.fillStyle = P.beige; g.fillRect(0, 48 - (16.7 / 50) * 48, N, 1); g.fillStyle = P.red; g.fillRect(0, 48 - (33 / 50) * 48, N, 1);
    }, 250);

    (function draw() {
      requestAnimationFrame(draw);
      const V = W.V, x = ov.getContext('2d');
      if (ov.width !== Math.round(V.cssW) || ov.height !== Math.round(V.cssH)) { ov.width = Math.round(V.cssW); ov.height = Math.round(V.cssH); ov.style.width = V.cssW + 'px'; ov.style.height = V.cssH + 'px'; }
      x.clearRect(0, 0, ov.width, ov.height);
      if (!ovs.size || !W.ready) return;
      const s = V.s, cx = W.cam.x - V.w / 2, cy = W.cam.y - V.h / 2, X = (wx) => (wx - cx) * s, Y = (wy) => (wy - cy) * s;
      if (ovs.has('grid')) {
        x.fillStyle = 'rgba(51,255,102,0.18)';
        for (let wx = Math.floor(cx / 8) * 8; wx < cx + V.w; wx += 8) x.fillRect(Math.round(X(wx)), 0, 1, ov.height);
        for (let wy = Math.floor(cy / 16) * 16; wy < cy + V.h; wy += 16) x.fillRect(0, Math.round(Y(wy)), ov.width, 1);
      }
      if (ovs.has('walk')) {
        x.fillStyle = 'rgba(255,210,63,0.22)';
        for (const A of W.areas) {
          if (!A.ready) continue;
          for (let wy = Math.floor(cy / 16) * 16; wy < cy + V.h; wy += 16) for (let wx = Math.floor(cx / 8) * 8; wx < cx + V.w; wx += 8) {
            const c = (wx - A.ox) / 8, r = (wy - A.oy) / 16;
            if (c < A.E[0] || c >= A.E[2]) continue;
            if (!W.walkable(A.i, c, r)) continue;
            // (rooms with streams) ground a letter can't be left on – it could never be pushed into water from there – in red
            const dead = A.sim && A.sim.live && !A.sim.live(c, r);
            if (dead) x.fillStyle = 'rgba(230,57,70,0.35)';
            x.fillRect(X(wx), Y(wy), 8 * s, 16 * s);
            if (dead) x.fillStyle = 'rgba(255,210,63,0.22)';
          }
        }
      }
      if (ovs.has('seams')) {
        x.font = 16 + 'px VT323'; x.fillStyle = P.red;
        for (const A of W.areas) { x.fillRect(Math.round(X(A.ox)), 0, 2, ov.height); x.fillText(A.name, X(A.ox) + 4, 16); }
      }
      if (ovs.has('hero') && W.cur) {
        const h = W.hero(); x.strokeStyle = P.yellow; x.lineWidth = 2; x.strokeRect(X(h.x) - 8 * s, Y(h.y) - 12 * s, 16 * s, 24 * s);
        x.fillStyle = P.yellow; x.font = '16px VT323'; const c = W.cur.sim.st().h; x.fillText(`${c.c.toFixed(1)}, ${c.r.toFixed(1)}`, X(h.x) + 10 * s, Y(h.y) - 12 * s);
        // what the game counts as Harold: his feet's cells – one, or two side by side in rooms where letters move a cell at a
        // time (walls, pushes and exits are decided there, not by the
        // sprite), and the grass his walk parts round it
        const [fc, fr, fw] = W.cur.sim.feet ? W.cur.sim.feet() : [Math.round(c.c), Math.round(c.r), 1]; x.strokeStyle = P.phosphor; x.strokeRect(X(W.cur.ox + fc * 8), Y(W.cur.oy + fr * 16), 8 * fw * s, 16 * s);
        if (W.touch) { x.strokeStyle = P.dim; x.beginPath(); x.ellipse(X(h.x), Y(h.y + 2), W.touch * 8 * s, (W.touch * 8 * s) / 1.8 * 2, 0, 0, Math.PI * 2); x.stroke(); }
      }
    })();
    window.WK_DEBUG.report = report;
  }
  // the couch's menu switches the panel (lib/host.js): shown or hidden, overlays and all
  function show(on) { WK_DEBUG.on = !!on; for (const el of document.querySelectorAll('.wkd, .wkd-ov')) el.style.display = on ? '' : 'none'; }
  window.WK_DEBUG = { attach, show, on: true };
})();
