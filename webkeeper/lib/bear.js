// Mishka, as the sketch drew him (design/couch-games/sketch, 25 October – the one Alexander loves): a small 3D bear
// written in characters. Every half-size cell casts a ray at him and keeps what it hit, and his fur is drawn like the
// loose grass: a stroke per cell, leaning the way his surface faces, so his edge is soft instead of outlined. Button
// eyes close to ^ ^ while he hums; five notes rise from him; he bobs a pixel or two on each note, moved as one piece.
// Replaces the flat grid sprite (lib/actors.js) for him in the world: lib/layers.js asks here first.
//   WK_BEAR.draw(W, x, y, t)   feet at (x, y) in the screen's px, t the area's clock
//   WK_BEAR.hum(t)             start a hum at time t
(() => {
  const P = Webkeeper.P, hash = Webkeeper.hash;
  const MATS = [null, null, null, null,
    { ramp: ' .,;%&', dim: P.brownDim, lit: P.brown },   // 4 fur: milk-chocolate, his own brown
    { ramp: ' .-oO', dim: P.beigeDim, lit: P.beige },    // 5 suede: muzzle, inside the ears, foot pads
    { ramp: '', dim: P.ink, lit: P.ink },                // 6 eyes (buttons, drawn on top)
    { ramp: ' .:#@', dim: P.beigeDim, lit: P.beige }];   // 7 nose
  const ell = (x, y, z, cx, cy, cz, rx, ry, rz) => {
    const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz, k0 = Math.hypot(a, b, c), k1 = Math.hypot(a / rx, b / ry, c / rz);
    return k0 * (k0 - 1) / k1;
  };
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const S = { humT: -99, bob: 0, shut: 0 };
  let hitMat = 0;
  // after the real Mishka: sitting slumped, long legs out in front with suede pads, long floppy arms, a big round
  // head with a big suede muzzle and round ears
  function bear(x, y, z) {
    y += 0.2 - S.bob;
    const body = ell(x, y, z, 0, -0.05, 0, 0.6, 0.78, 0.56);
    const legs = Math.min(ell(x, y, z, 0.55, -0.72, 0.3, 0.62, 0.26, 0.26), ell(x, y, z, 0.55, -0.72, -0.3, 0.62, 0.26, 0.26));
    const pads = Math.min(ell(x, y, z, 1.14, -0.7, 0.3, 0.07, 0.24, 0.22), ell(x, y, z, 1.14, -0.7, -0.3, 0.07, 0.24, 0.22));
    const arms = Math.min(ell(x, y, z, 0.26, 0.05, 0.58, 0.22, 0.5, 0.22), ell(x, y, z, 0.26, 0.05, -0.58, 0.22, 0.5, 0.22));
    const head = ell(x, y, z, 0.05, 1.22, 0, 0.7, 0.66, 0.68);
    const ears = Math.min(ell(x, y, z, -0.05, 1.86, 0.5, 0.25, 0.25, 0.13), ell(x, y, z, -0.05, 1.86, -0.5, 0.25, 0.25, 0.13));
    const inner = Math.min(ell(x, y, z, 0.05, 1.85, 0.5, 0.07, 0.17, 0.1), ell(x, y, z, 0.05, 1.85, -0.5, 0.07, 0.17, 0.1));
    const muzzle = ell(x, y, z, 0.6, 1.02, 0, 0.32, 0.3, 0.36);
    const nose = ell(x, y, z, 0.91, 1.08, 0, 0.06, 0.13, 0.17);
    const eyes = Math.min(ell(x, y, z, 0.6, 1.42, 0.27, 0.11, 0.11, 0.1), ell(x, y, z, 0.6, 1.42, -0.27, 0.11, 0.11, 0.1));
    let d = smin(smin(smin(body, head, 0.15), Math.min(arms, legs), 0.1), ears, 0.06); hitMat = 4;
    const suede = Math.min(muzzle, pads, inner);
    if (suede < d) { d = suede; hitMat = 5; }
    if (nose < d) { d = nose; hitMat = 7; }
    if (eyes < d) { d = eyes; hitMat = 6; }
    return d;
  }
  // nc × nr cells round (cx, cy): per cell [material, light, nx, ny, depth] – the sketch's renderFigure
  function render(cx, cy, nc, nr, scale, yaw, pitch, fill, fcw, fch) {
    const out = new Float32Array(nc * nr * 5), cp = Math.cos(pitch), sp = Math.sin(pitch), ca = Math.cos(yaw), sa = Math.sin(yaw);
    const toObj = (x, y, z) => { const y1 = y * cp - z * sp, z1 = y * sp + z * cp; return [x * ca + z1 * sa, y1, -x * sa + z1 * ca]; };
    const toCam = (x, y, z) => { const x1 = x * ca - z * sa, z1 = x * sa + z * ca; return [x1, y * cp + z1 * sp, -y * sp + z1 * cp]; };
    const L = (() => { const l = [-0.45, 0.55, -0.75], n = Math.hypot(...l); return l.map((v) => v / n); })();   // moonlight, upper left
    const [dx, dy, dz] = toObj(0, 0, 1), c0 = Math.round(cx / fcw - nc / 2), r0 = Math.round(cy / fch - nr / 2);
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
      const u = ((c0 + c + 0.5) * fcw - cx) / scale, v = -((r0 + r + 0.5) * fch - cy) / scale;
      const [ox, oy, oz] = toObj(u, v, -4);
      let s = 0, hit = false;
      for (let i = 0; i < 64 && s < 8; i++) { const d = bear(ox + dx * s, oy + dy * s, oz + dz * s); if (d < 0.004) { hit = true; break; } s += d; }
      if (!hit) continue;
      const px = ox + dx * s, py = oy + dy * s, pz = oz + dz * s;
      bear(px, py, pz); const m = hitMat, e = 0.01;
      const n = toCam(bear(px + e, py, pz) - bear(px - e, py, pz), bear(px, py + e, pz) - bear(px, py - e, pz), bear(px, py, pz + e) - bear(px, py, pz - e));
      const nl = Math.hypot(...n) || 1, k = (r * nc + c) * 5;
      out[k] = m; out[k + 1] = fill + (1 - fill) * Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / nl);
      out[k + 2] = n[0] / nl; out[k + 3] = n[1] / nl; out[k + 4] = s;
    }
    return { out, c0, r0, nc, nr, fcw, fch };
  }
  // his face, paws and feet: too small to come out of the cells, so placed on top as whole glyphs where his model puts
  // them – button eyes (^ ^ while he hums), a pale cream nose, a little o of a mouth when he sings, pads
  const FACE = [
    { p: [0.7, 1.44, 0.27], of: [0.05, 1.22, 0], chr: () => (S.shut ? '^' : 'o'), size: 1 },
    { p: [0.7, 1.44, -0.27], of: [0.05, 1.22, 0], chr: () => (S.shut ? '^' : 'o'), size: 1 },
    { p: [0.98, 1.1, 0], of: [0.05, 1.22, 0], chr: () => 'v', size: 1.1 },
    { p: [0.86, 0.76, 0], of: [0.05, 1.22, 0], chr: (h) => (h ? 'o' : ''), size: 0.8 },   // a little lower than the sketch's, so it doesn't run into the nose
    { p: [0.42, -0.36, 0.62], of: [0, 0, 0], chr: () => 'o', size: 0.9 },
    { p: [0.42, -0.36, -0.62], of: [0, 0, 0], chr: () => 'o', size: 0.9 },
    { p: [1.2, -0.7, 0.3], of: [0, 0, 0], chr: () => 'O', size: 1 },
    { p: [1.2, -0.7, -0.3], of: [0, 0, 0], chr: () => 'O', size: 1 },
  ];
  // the hum: five notes, one every 0.35 s
  const HUM = 5, NOTE = 0.35;
  const cache = new Map();
  // his size in the world: about twice Harold's height, in half-size cells so he keeps his ears, eyes and muzzle
  const CW = 8, CH = 16, SCALE = CH * 1.8, FCW = CW / 2, FCH = CH / 2, YAW = -1.45, PITCH = 0.12;
  const NC = Math.ceil(3.2 * SCALE / FCW), NR = Math.ceil(4.6 * SCALE / FCH);
  function draw(W, x, y, t, o = {}) {
    const a = t - S.humT, humming = a >= 0 && a < HUM * NOTE + 0.3;
    const since = a % NOTE, beat = a >= 0 && a <= HUM * NOTE && since < 0.18 ? 1 - since / 0.18 : 0;
    S.shut = humming || ((t % 4) + 4) % 4 < 0.12 ? 1 : 0;   // eyes shut while he hums, and a slow blink
    S.bob = 0;
    const oy = -Math.round(beat * 2);
    // the figure in its own frame, centred on (0, 0); cached – it only changes when he's posed differently
    const key = 'b';
    let f = cache.get(key);
    if (!f) { f = render(0, 0, NC, NR, SCALE, YAW, PITCH, 0.4, FCW, FCH); cache.set(key, f); }
    const cx = x, cy = y - 1.16 * SCALE + oy, g = W.g;
    W.reset();
    const at = (c, r) => (c < 0 || r < 0 || c >= f.nc || r >= f.nr ? 0 : f.out[(r * f.nc + c) * 5]);
    const X = (c) => cx + (f.c0 + c) * FCW, Y = (r) => cy + (f.r0 + r) * FCH;
    // an ink undercoat under all of him, so nothing shows through; the fur's fringe is drawn past it
    g.fillStyle = P.ink;
    for (let r = 0; r < f.nr; r++) for (let c = 0; c < f.nc; c++) if (at(c, r)) g.fillRect(Math.round(X(c)) - 1, Math.round(Y(r)) - 1, FCW + 2, FCH + 2);
    // the sketch's small Mishka, drawn soft (design/couch-games/sketch drawFur): every other fur cell inside gets a
    // round glyph, the edge is a gentle fringe, and the suede is a fine pale stipple – fewer glyphs read as plush, more
    // as a hedgehog, and the face drawn on top stands out
    for (let r = 0; r < f.nr; r++) for (let c = 0; c < f.nc; c++) {
      const k = (r * f.nc + c) * 5, m = f.out[k];
      if (!m || m === 6 || m === 7) continue;
      const edge = !at(c - 1, r) || !at(c + 1, r) || !at(c, r - 1) || !at(c, r + 1);
      if (m === 4 && !edge && (c + r) % 2) continue;
      const b = f.out[k + 1], nx = f.out[k + 2], ny = f.out[k + 3];
      const h = hash(f.c0 + c, f.r0 + r);
      let px = X(c) + FCW * (0.5 + (h - 0.5) * 0.5), py = Y(r) + FCH * (0.5 + (hash(f.r0 + r, f.c0 + c) - 0.5) * 0.4);
      if (edge) { px += nx * FCW * 0.15; py -= ny * FCH * 0.1; }
      const mat = MATS[m], col = b > 0.45 ? mat.lit : mat.dim, ang = Math.atan2(nx, ny);
      if (edge && m === 4) { W.loose(px, py, b > 0.5 ? ',' : '.', col, ang * 0.4, FCH * 1.3); continue; }
      const ramp = m === 4 ? ' .:oo' : ' ..';
      const chr = ramp[Math.max(1, Math.min(ramp.length - 1, Math.floor(b * ramp.length)))];
      W.loose(px, py, chr, col, 0, FCH * 1.3);
    }
    // the face on top
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH), ca = Math.cos(YAW), sa = Math.sin(YAW);
    const toCam = ([px, py, pz]) => { py -= 0.2; const x1 = px * ca - pz * sa, z1 = px * sa + pz * ca; return [x1, py * cp + z1 * sp, -py * sp + z1 * cp]; };
    // all the ink dots first, then the glyphs: one feature's dot never hides another's glyph (the nose under the
    // singing mouth)
    const shown = [];
    for (const fe of FACE) {
      const chr = fe.chr(humming); if (!chr) continue;
      const [fx, fy, fz] = toCam(fe.p), [, , zc] = toCam(fe.of);
      if (fz > zc) continue;   // round the far side, out of sight
      shown.push({ px: cx + fx * SCALE, py: cy - fy * SCALE, chr, size: fe.size });
    }
    g.fillStyle = P.ink;
    for (const q of shown) g.fillRect(q.px - CW * 0.45, q.py - CH * 0.4, CW * 0.9, CH * 0.8);
    for (const q of shown) W.loose(q.px, q.py, q.chr, P.beige, 0, CH * q.size);
    // the notes, rising and drifting off
    for (let i = 0; i < HUM; i++) {
      const age = t - (S.humT + i * NOTE);
      if (age < 0 || age > 1.8) continue;
      const nx = cx + SCALE * 0.8 + Math.sin(age * 3 + i) * CW * 1.2 + age * CW * 2, ny = cy - SCALE * 1.9 - age * CH * 2.4;
      const col = age < 0.6 ? P.beige : age < 1.2 ? P.beigeDim : P.tealUp;
      // now and then, alone, the last note of a hum is a small cat face instead (book/00-the-bible.md: his meow)
      if (S.meow && i === HUM - 1) { const m = '=^.^='; for (let j = 0; j < m.length; j++) W.loose(nx + (j - 2) * CW * 0.9, ny, m[j], col, 0, CH * 1.1); }
      else W.loose(nx, ny, i % 2 ? '♫' : '♪', col, 0, CH * 1.4);
    }
    W.reset();
  }
  window.WK_BEAR = { draw, hum(t, meow = false) { S.humT = t; S.meow = meow; }, get humming() { return S.humT; } };
})();
