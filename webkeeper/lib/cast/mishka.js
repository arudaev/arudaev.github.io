// mishka.js – Mishka in soft fur, at any size. Loaded after cast.js.
// He is a small 3D bear (distance functions, the same model as the sketch's) ray-marched one
// ray per small cell; each cell becomes one round, soft glyph in his brown. His face – button
// eyes, a cream nose, a stitched mouth – and his pads are placed on top as whole glyphs, so
// they stay clear at every size. Nothing spiky: round glyphs only, and a soft fringe.
(function () {
  const C = WK_CAST, P = C.P, { hash } = Webkeeper;
  const ell = (x, y, z, cx, cy, cz, rx, ry, rz) => {
    const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz;
    const k0 = Math.hypot(a, b, c), k1 = Math.hypot(a / rx, b / ry, c / rz);
    return k0 * (k0 - 1) / k1;
  };
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  let hitMat = 0, bob = 0;
  // materials: 4 fur, 5 suede (muzzle, inner ears, pads), 6 eyes, 7 nose
  function bear(x, y, z) {
    y += 0.2 - bob;
    const body = ell(x, y, z, 0, -0.05, 0, 0.6, 0.78, 0.56);
    const legs = Math.min(ell(x, y, z, 0.55, -0.72, 0.3, 0.62, 0.26, 0.26), ell(x, y, z, 0.55, -0.72, -0.3, 0.62, 0.26, 0.26));
    const pads = Math.min(ell(x, y, z, 1.14, -0.7, 0.3, 0.07, 0.24, 0.22), ell(x, y, z, 1.14, -0.7, -0.3, 0.07, 0.24, 0.22));
    const arms = Math.min(ell(x, y, z, 0.26, 0.05, 0.58, 0.22, 0.5, 0.22), ell(x, y, z, 0.26, 0.05, -0.58, 0.22, 0.5, 0.22));
    const head = ell(x, y, z, 0.05, 1.22, 0, 0.7, 0.66, 0.68);
    const ears = Math.min(ell(x, y, z, -0.05, 1.86, 0.5, 0.25, 0.25, 0.13), ell(x, y, z, -0.05, 1.86, -0.5, 0.25, 0.25, 0.13));
    const inner = Math.min(ell(x, y, z, 0.05, 1.85, 0.5, 0.07, 0.17, 0.1), ell(x, y, z, 0.05, 1.85, -0.5, 0.07, 0.17, 0.1));
    const muzzle = ell(x, y, z, 0.6, 1.02, 0, 0.32, 0.3, 0.36);
    let d = smin(smin(smin(body, head, 0.15), Math.min(arms, legs), 0.1), ears, 0.06); hitMat = 4;
    const suede = Math.min(muzzle, pads, inner);
    if (suede < d) { d = suede; hitMat = 5; }
    return d;
  }
  // one ray per cell (fcw × fch px) round a centre (cx, cy): per cell [material, light, nx, ny]
  // the ray-march is the slow part, and its inputs only take a few values (he bobs in steps), so
  // each result is kept and reused
  const renders = new Map();
  function render(cx, cy, nc, nr, scale, yaw, pitch, fcw, fch, fill) {
    const key = [cx, cy, nc, nr, scale, yaw, pitch, fcw, fch, fill, bob].join('|');
    if (!renders.has(key)) { if (renders.size > 64) renders.clear(); renders.set(key, renderNow(cx, cy, nc, nr, scale, yaw, pitch, fcw, fch, fill)); }
    return renders.get(key);
  }
  function renderNow(cx, cy, nc, nr, scale, yaw, pitch, fcw, fch, fill) {
    const out = new Float32Array(nc * nr * 4);
    const cp = Math.cos(pitch), sp = Math.sin(pitch), ca = Math.cos(yaw), sa = Math.sin(yaw);
    const toObj = (x, y, z) => { const y1 = y * cp - z * sp, z1 = y * sp + z * cp; return [x * ca + z1 * sa, y1, -x * sa + z1 * ca]; };
    const toCam = (x, y, z) => { const x1 = x * ca - z * sa, z1 = x * sa + z * ca; return [x1, y * cp + z1 * sp, -y * sp + z1 * cp]; };
    const L = (() => { const l = [-0.45, 0.55, -0.75], n = Math.hypot(...l); return l.map((v) => v / n); })();
    const [dx, dy, dz] = toObj(0, 0, 1);
    const c0 = Math.round(cx / fcw - nc / 2), r0 = Math.round(cy / fch - nr / 2);
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
      const u = ((c0 + c + 0.5) * fcw - cx) / scale, v = -((r0 + r + 0.5) * fch - cy) / scale;
      const [ox, oy, oz] = toObj(u, v, -4);
      let s = 0, hit = false;
      for (let i = 0; i < 64 && s < 8; i++) { const d = bear(ox + dx * s, oy + dy * s, oz + dz * s); if (d < 0.004) { hit = true; break; } s += d; }
      if (!hit) continue;
      const px = ox + dx * s, py = oy + dy * s, pz = oz + dz * s;
      bear(px, py, pz); const m = hitMat, e = 0.01;
      const n = toCam(bear(px + e, py, pz) - bear(px - e, py, pz), bear(px, py + e, pz) - bear(px, py - e, pz), bear(px, py, pz + e) - bear(px, py, pz - e));
      const nl = Math.hypot(...n) || 1, k = (r * nc + c) * 4;
      out[k] = m; out[k + 1] = fill + (1 - fill) * Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / nl);
      out[k + 2] = n[0] / nl; out[k + 3] = n[1] / nl;
    }
    return { out, c0, r0, nc, nr, fcw, fch };
  }
  // the face and pads, as whole glyphs where the model puts them (bear coordinates)
  const FACE = [
    { p: [0.7, 1.44, 0.27], of: [0.05, 1.22, 0], k: 'eye' }, { p: [0.7, 1.44, -0.27], of: [0.05, 1.22, 0], k: 'eye' },
    { p: [0.98, 1.1, 0], of: [0.05, 1.22, 0], k: 'nose' }, { p: [0.9, 0.88, 0], of: [0.05, 1.22, 0], k: 'mouth' },
    { p: [0.42, -0.36, 0.62], of: [0, 0, 0], k: 'paw' }, { p: [0.42, -0.36, -0.62], of: [0, 0, 0], k: 'paw' },
    { p: [1.2, -0.7, 0.3], of: [0, 0, 0], k: 'foot' }, { p: [1.2, -0.7, -0.3], of: [0, 0, 0], k: 'foot' },
  ];
  function face(W, cx, cy, scale, yaw, pitch, st, sizeK) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch), ca = Math.cos(yaw), sa = Math.sin(yaw);
    const toCam = ([x, y, z]) => { y -= 0.2 - bob; const x1 = x * ca - z * sa, z1 = x * sa + z * ca; return [x1, y * cp + z1 * sp, -y * sp + z1 * cp]; };
    for (const f of FACE) {
      const chr = { eye: st.shut ? '^' : 'o', nose: 'v', mouth: st.humming ? 'o' : st.mouthIdle || '', paw: 'o', foot: 'O' }[f.k];
      if (!chr) continue;
      const [x, y, z] = toCam(f.p), [, , zc] = toCam(f.of);
      if (z > zc) continue;
      const px = cx + x * scale, py = cy - y * scale, size = W.ch * sizeK * (f.k === 'eye' ? 1.0 : f.k === 'nose' ? 1.1 : 0.9);
      W.g.fillStyle = P.ink; W.g.fillRect(px - size * 0.26, py - size * 0.24, size * 0.52, size * 0.48);
      W.loose(px, py, chr, f.k === 'nose' ? P.beige : P.beige, 0, size);
    }
  }
  // draw Mishka: feet centred on (x, y) px; o.scale px per bear unit; o.style: 'field' (the
  // sketch's soft fur), 'plush', 'felt' (the key art's, and the game's) or 'nap' (close-up variants);
  // o.yaw; o.hum (seconds since the hum began, or -1); o.meow: the hum's last note is a small cat face
  const HUM = 5, NOTE = 0.35;
  function mishka(W, x, y, t, o = {}) {
    const scale = o.scale || W.ch * 1.8, style = o.style || 'field', yaw = o.yaw ?? -1.45, pitch = 0.12;
    const hum = o.hum ?? -1, humming = hum >= 0 && hum < HUM * NOTE + 0.3;
    bob = humming && hum % NOTE < 0.18 ? 0.03 : 0;
    const shut = humming || C.blink(t, 2.0);
    const cx = x, cy = y - 1.16 * scale;
    // the fur's cell in px: half the grid's in the field; in a close-up a fixed size, so a big
    // Mishka gets more glyphs, not bigger ones – he stays soft instead of turning blocky
    const fcw = style === 'field' ? W.cw / 2 : { plush: 5, felt: 7, nap: 5 }[style] * (o.cellK || 1), fch = fcw * 2;
    // rendered round (0, 0) and moved to (cx, cy), so the kept render serves him wherever the camera puts him (in the
    // game he's drawn at a new screen position every frame), and his stitches don't shimmer as the view moves
    const f = render(0, 0, Math.ceil(3.2 * scale / fcw), Math.ceil(4.6 * scale / fch), scale, yaw, pitch, fcw, fch, style === 'field' ? 0.4 : 0.32);
    const { out, nc, nr, c0, r0 } = f, at = (c, r) => (c < 0 || r < 0 || c >= nc || r >= nr ? 0 : out[(r * nc + c) * 4]);
    // an ink undercoat, so nothing shows through him
    W.reset(); W.g.fillStyle = P.ink;
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) if (at(c, r)) W.g.fillRect(Math.round(cx + (c0 + c) * fcw) - 1, Math.round(cy + (r0 + r) * fch) - 1, fcw + 2, fch + 2);
    const gs = fch * ({ field: 1.3, plush: 1.25, felt: 1.15, nap: 1.2 }[style]);
    for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
      const k = (r * nc + c) * 4, m = out[k];
      if (!m) continue;
      const b = out[k + 1], nx = out[k + 2], ny = out[k + 3];
      const edge = !at(c - 1, r) || !at(c + 1, r) || !at(c, r - 1) || !at(c, r + 1);
      const h = hash(c0 + c, r0 + r, 77);
      let px = cx + (c0 + c + 0.5 + (h - 0.5) * 0.4) * fcw, py = cy + (r0 + r + 0.5 + (hash(r0 + r, c0 + c, 78) - 0.5) * 0.3) * fch;
      const fur = m === 4, lit = b > 0.45;
      let col = fur ? (lit ? P.brown : P.brownDim) : (lit ? P.beige : P.beigeDim), chr;
      if (style === 'field') {
        if (fur && !edge && (c + r) % 2) continue;
        if (edge) { px += nx * fcw * 0.15; py -= ny * fch * 0.1; }
        chr = edge && fur ? (b > 0.5 ? ',' : '.') : fur ? ' .:oo'[Math.max(1, Math.min(4, Math.floor(b * 5)))] : '.';
      } else if (style === 'plush') {
        // every fur cell a round glyph, light → bigger; a fringe of dots pushed out a little
        if (edge && fur) { px += nx * fcw * 0.35; py -= ny * fch * 0.25; chr = '.'; }
        else chr = fur ? ' .:oO'[Math.max(1, Math.min(4, Math.floor(b * 5)))] : (b > 0.5 ? 'o' : '.');
      } else if (style === 'felt') {
        // fewer, bigger, rounder glyphs on a checker – knitted, like a soft toy's felt
        if (fur && (c + r) % 2 && !edge) continue;
        chr = fur ? (b > 0.55 ? 'O' : b > 0.25 ? 'o' : '°') : 'o';
        if (edge && fur) chr = 'o';
      } else {
        // nap: a soft dotted outline round him, and a sparse nap of o's inside – the fur's
        // direction shown by the light, never by spikes
        if (fur && !edge && hash(c0 + c, r0 + r, 79) > 0.5 + b * 0.2) continue;
        chr = edge ? '·' : fur ? (b > 0.5 ? 'o' : '.') : (b > 0.5 ? ':' : '.');
        if (edge) col = P.brown;
      }
      if (chr === ' ') continue;
      W.loose(px, py, chr, col, 0, gs);
    }
    face(W, cx, cy, scale, yaw, pitch, { shut, humming, mouthIdle: style === 'field' ? '' : '-' }, style === 'field' ? 1 : Math.max(1, scale / (W.ch * 1.8) * 0.55));
    // the hum: a note per beat, rising, stepped in colour
    if (hum >= 0) for (let i = 0; i < HUM; i++) {
      const age = hum - i * NOTE;
      if (age < 0 || age > 1.8) continue;
      const k = scale / (W.ch * 1.8), nx = cx + scale * 0.8 + (Math.sin(age * 3 + i) * 1.2 + age * 2) * W.cw * Math.sqrt(k), ny = cy - scale * 1.9 - age * W.ch * 2.4 * Math.sqrt(k);
      const col = age < 0.6 ? P.beige : age < 1.2 ? P.beigeDim : P.tealUp;
      // now and then, alone, his last note is a small cat face (book/00-the-bible.md: his meow)
      if (o.meow && i === HUM - 1) { const m = '=^.^='; for (let j = 0; j < m.length; j++) W.loose(nx + (j - 2) * W.cw * 0.9, ny, m[j], col, 0, W.ch * 1.1); }
      else W.loose(nx, ny, i % 2 ? '♫' : '♪', col, 0, W.ch * 1.4 * Math.sqrt(k));
    }
    W.reset();
  }
  window.WK_MISHKA = { mishka };
})();
