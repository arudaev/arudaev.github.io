// marks.js – the texture's marks on the GPU (step 3 r2, round 2). Every mark of a canvas in the world – grass strokes,
// grains, flowers, stones' and bark's letters, leaves, their ink – is one instance of a glyph quad; the vertex shader
// works out where it is *every frame*: the wind (two gust fields crossing the meadow, drifting patches of stronger and
// weaker air so each patch moves its own way, a flutter of its own for every blade), a tree bending whole from its
// foot, feet and quack rings parting the grass and letting it settle back over about a second. Nothing is baked per
// pose, so nothing waits for a bake and nothing stands still; the CPU only sends a few numbers a frame.
//   const R = WK_GL.create()                     R.ok – false without WebGL2 (the world falls back to baked tiles)
//   R.glyph(ch, size) → uv                       a glyph's place in the atlas (white VT323, drawn once)
//   R.upload(data) → handle · R.free(handle)     a canvas's marks (cv.glData) as an instance buffer and its touch field
//   R.begin(wPx, hPx, viewW, viewH, t) · R.draw(handle, cv, { world, off, rings, view })   one pass into R.canvas
(function () {
  const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 q;
layout(location=1) in vec4 a0;   // x y ang size
layout(location=2) in vec4 a1;   // uv
layout(location=3) in vec4 a2;   // kind, wind (rad), sway (px), tree sway
layout(location=4) in vec4 a3;   // tree foot x, segment, segment length, lift
layout(location=5) in vec4 a4;   // toss, u, side, rect height
layout(location=6) in vec4 c0;
layout(location=7) in vec4 c1;
uniform vec2 uOrg, uWorld, uOff, uView, uCell;
uniform float uT;
uniform int uNR;
uniform float uXray;
uniform vec4 uL[8];
uniform int uLN;
uniform vec4 uBeam;
uniform vec4 uR[6];
uniform float uRS[6];
uniform highp sampler2D uTouch;
out vec2 vUV;
out vec4 vC;
out float vSolid;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
// the wind, in world px. The sketch's rolling waves (design/couch-games/sketch, 25 October – the meadow that flowed):
// two slow sine waves travelling east across the field, the near one bent by a slower one, and a long gust front
// passing every 7.9 s that leans the whole field a little further. One field for every blade, so the meadow moves
// as waves, never blade by blade (fine noise and a per-blade flutter made it boil: churn 12 a second against the
// sketch's 1 – scripts/motion/probe.py).
float wind(vec2 p, float t) {
  float c = p.x / 8., r = p.y / 16.;
  float w = sin(c * 0.09 - t * 1.3 + sin(r * 0.2 + t * 0.4)) * 0.6 + sin(c * 0.023 - t * 0.55) * 0.55;
  float g = max(sin(((p.x - p.y * 0.3) / 1040. - t / 7.9) * 6.2831853), 0.);
  return w * 0.42 + g * g * 0.22 + 0.12;
}
// how the meadow moves (scripts/motion/probe.py measured them against the sketch: churn about 1 a second, coherence 0.3+)
const float COMB = 0.5, SWAY = 2.1, SHEEN = 1.6, MINSTIFF = 0.45, TREE = 2.4, LEAF = 2.2, PART = 0.9;
void main() {
  int kind = int(a2.x + 0.5);
  vec2 root = a0.xy, scene = uOrg + root, wp = scene + uWorld;
  ivec2 ts = textureSize(uTouch, 0);
  ivec2 tc = clamp(ivec2(floor(root / uCell)), ivec2(0), ts - 1);
  vec2 td = texelFetch(uTouch, tc, 0).xy;
  // a foot's touch keeps its lean signed, its size how hard (brushes.js C.touch); a ring's is all the way
  float age = uT - td.x, dir = td.y != 0. ? td.y : a4.z, lit = 0., ring = 0.;
  for (int i = 0; i < 6; i++) {
    if (i >= uNR) break;
    vec4 R = uR[i]; float sp = uRS[i], a = uT - R.z;
    if (a < 0. || a * sp > R.w + 26.) continue;
    float d = length(vec2(scene.x - R.x, (scene.y - R.y) * 1.8));
    if (abs(d - a * sp) < 26.) lit = 1.;
    if (d <= R.w) { float ra = a - d / sp; if (ra >= 0. && ra < age) { age = ra; dir = scene.x >= R.x ? 1. : -1.; ring = 1.; } }
  }
  // parted by a foot or a ring, it springs back over about 1.8 s; a ring tosses what it passes up, a foot only leans
  // the blades it brushes (and kicks a little grit)
  float amt = age < 0. ? 0. : 1. - smoothstep(0.45, 1.8, age), push = amt * (ring > 0. ? 1. : min(abs(dir), 1.) * 0.4);
  float u = a4.y, ang = a0.z, size = a0.w, dx = 0.;
  vec2 pos = root, hf = vec2(size * 0.55, size * 0.625);
  // a tree sways as one, from its foot; a bush's or a crown's leaves shift with the same wind
  if (a2.w > 0.) dx = wind(vec2(uWorld.x + uOrg.x + a3.x, uWorld.y + uOrg.y), uT) * 14. * a2.w * TREE;
  else if (a2.z != 0.) dx = wind(wp, uT) * a2.z * LEAF;
  if (kind == 1 || kind == 5) {
    // a blade stands up out of its comb (the painted lean, softened) and the one wind leans it – far enough to see,
    // each by its own stiffness (a2.y); no flutter of its own, so the field moves as waves
    // every blade moves: the short grass and moss (stiffness 0.1–0.3) used to stand frozen next to the tall
    float a = ang * COMB + wind(wp, uT) * max(a2.y, MINSTIFF) * SWAY + amt * PART * dir;
    pos.y -= a3.w + amt * 5. * ring;
    int j = int(a3.y + 0.5); float L = a3.z;
    // a blade bends from its root: each segment's middle is half a segment on from where the one before it ends
    for (int i = 0; i < 3; i++) { if (i >= j) break; float ai = a * (1. + 0.45 * float(i)); pos += L * vec2(sin(ai), -cos(ai)); }
    float aj = a * (1. + 0.45 * float(j));
    if (kind == 5) { pos += vec2(sin(a * 2.), -cos(a * 2.)) * L * 0.7; ang = 0.; } else { pos += vec2(sin(aj), -cos(aj)) * L * 0.5; ang = aj; }
  } else if (kind == 2) { hf = vec2(a0.w, a4.w) * 0.5; ang = 0.; }
  else if (kind == 3) { ang += wind(wp, uT) * 0.6; }
  else if (kind == 4) { pos.y -= push * a4.x * 8. * u; ang += push * (u - 0.5) * 2.4; }
  else {
    pos.y -= a3.w + push * a4.x * 7. * (0.4 + u);
    if (a3.w > 3.) { float w = wind(wp, uT); pos.x += w * 5.; ang += w * 0.45; }   // a flower nods with the grass it stands in
    if (a2.z != 0. || a2.w > 0.) ang += wind(wp, uT) * 0.35;   // a leaf turns with the same wind as its tree
  }
  pos.x += dx;
  float c = cos(ang), s = sin(ang);
  vec2 o = q * 2. * hf; o = vec2(c * o.x - s * o.y, s * o.x + c * o.y);
  vec2 v = uOrg + pos + o + uOff;
  gl_Position = vec4(v.x / uView.x * 2. - 1., 1. - v.y / uView.y * 2., 0., 1.);
  vUV = mix(a1.xy, a1.zw, q + 0.5);
  vC = lit > 0.5 ? c1 : c0;
  // ink fills (a rock's or a wall's body, the dark behind a crown) are whole cells, not glyphs: drawn solid, so nothing
  // behind them shows through (they were drawn through a blank glyph's alpha – and vanished)
  vSolid = kind == 2 ? 1. : 0.;
  // a gust shows as a light sheen passing over the grass and the leaves (the sketch's sheen): the wave you can see,
  // moving across the field, where each blade only leans
  // (not the fills: a trunk's dark body sways with its tree, and in the sheen it turned into a grey column)
  if (kind != 2 && (kind == 1 || kind == 5 || kind == 3 || a3.w > 3. || a2.z != 0. || a2.w > 0.)) {
    float sh = smoothstep(0.4, 0.68, wind(wp, uT)) * SHEEN;
    vC = vec4(min(vC.rgb * (1. + 0.6 * sh) + 0.05 * sh, vec3(1.)), vC.a);
  }
  // the lamps and the lighthouse: a pool of warm light in three hard steps round each lamp, and the beam lighting what
  // it sweeps over – everything standing in it (grass, leaves, stone) warms and brightens
  float glow = 0.;
  for (int i = 0; i < 8; i++) {
    if (i >= uLN) break;
    vec4 L = uL[i]; float k = 1. - length(vec2(wp.x - L.x, (wp.y - L.y) * 1.7)) / L.z;
    if (k > 0.) glow = max(glow, (k > 0.62 ? 1. : k > 0.3 ? 0.62 : 0.3) * L.w);
  }
  if (uBeam.w > 0.) {
    vec2 dv = wp - uBeam.xy; dv.y /= 0.62; float dist = length(dv);
    float da = abs(mod(atan(dv.y, dv.x) - uBeam.z + 3.14159265, 6.2831853) - 3.14159265);
    if (dist > 30. && dist < 760. && da < 0.1) glow = max(glow, (da < 0.04 ? 1. : 0.62) * (1. - dist / 900.) * uBeam.w);
  }
  // a fill (the dark body behind a trunk's or a rock's letters) only warms a little: lit like a glyph it turned into
  // pale grey blocks, and the body has to stay a body
  if (glow > 0.) vC = kind == 2 ? vec4(mix(vC.rgb, vec3(0.2, 0.16, 0.1), glow * 0.45), vC.a)
                                : vec4(min(mix(vC.rgb, vec3(0.86, 0.8, 0.62), glow * 0.62) + glow * 0.14, vec3(1.)), vC.a);
  // x-ray (?xray, or the debug panel): every mark in its kind's colour, bright as far as the wind can move it –
  // a mark the wind can't reach shows dark, whatever it looks like normally
  if (uXray > 0.5) {
    vec3 kc = kind == 1 ? vec3(0.2, 1., 0.4) : kind == 5 ? vec3(0.2, 0.8, 1.) : kind == 3 ? vec3(1., 0.8, 0.2) : kind == 2 ? vec3(0.6, 0.6, 0.6) : kind == 4 ? vec3(1., 0.3, 0.3) : vec3(1., 0.4, 1.);
    float reach = kind == 1 || kind == 5 ? max(a2.y, MINSTIFF) * SWAY : a2.w > 0. ? a2.w * TREE : a2.z != 0. ? 0.6 * LEAF : kind == 3 ? 0.6 : a3.w > 3. ? 0.45 : 0.;
    vC = vec4(kc * (0.15 + 0.85 * clamp(reach, 0., 1.)), 1.);
  }
}`;
  const FS = `#version 300 es
precision mediump float;
uniform sampler2D uAtlas;
in vec2 vUV;
in vec4 vC;
in float vSolid;
out vec4 o;
void main() { float a = (vSolid > 0.5 ? 1. : texture(uAtlas, vUV).a) * vC.a; if (a < 0.004) discard; o = vec4(vC.rgb * a, a); }`;
  const STRIDE = 88;

  function create() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) return { ok: false };
    // the atlas: every glyph once, white, at twice its size (the colour is the mark's). Its 2D copy is kept, so a lost
    // context gets the same atlas back and every mark's uv still points at its glyph
    const AS = 2048, RS = 2, acv = document.createElement('canvas'); acv.width = AS; acv.height = AS;
    const ag = acv.getContext('2d'); ag.fillStyle = '#fff'; ag.fillRect(0, 0, 8, 8);
    let prog, U, quad, atlas;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    // the program, the quad and the atlas texture: once, and again when the browser gives a lost context back
    function init() {
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      U = {}; for (const n of ['uOrg', 'uWorld', 'uOff', 'uView', 'uCell', 'uT', 'uNR', 'uR', 'uRS', 'uTouch', 'uAtlas', 'uXray', 'uL', 'uLN', 'uBeam']) U[n] = gl.getUniformLocation(prog, n);
      quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
      atlas = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, atlas);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, AS, AS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
    }
    init();
    const cells = new Map(), WHITE = [3 / AS, 3 / AS, 5 / AS, 5 / AS];
    let sx = 10, sy = 0, shH = 10, d0 = 0, d1 = 10;
    function glyph(ch, size) {
      const px = Math.max(4, Math.round(size * RS)), key = ch + '|' + px;
      let c = cells.get(key); if (c) return c;
      const w = Math.ceil(px * 1.1) + 2, h = Math.ceil(px * 1.25) + 2;
      if (sx + w > AS) { sx = 0; sy += shH; shH = 0; }
      if (sy + h > AS) return WHITE;
      ag.font = px + 'px VT323, monospace'; ag.textAlign = 'center'; ag.textBaseline = 'middle'; ag.fillStyle = '#fff';
      ag.fillText(ch, sx + w / 2, sy + h / 2);
      c = [(sx + 1) / AS, (sy + 1) / AS, (sx + w - 1) / AS, (sy + h - 1) / AS];
      d0 = Math.min(d0, sy); d1 = Math.max(d1, sy + h);
      sx += w; shH = Math.max(shH, h); cells.set(key, c);
      return c;
    }
    function flushAtlas() {
      if (d1 <= d0) return;
      const im = ag.getImageData(0, d0, AS, d1 - d0);
      gl.bindTexture(gl.TEXTURE_2D, atlas); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, d0, AS, d1 - d0, gl.RGBA, gl.UNSIGNED_BYTE, im.data);
      d0 = AS; d1 = 0;
    }
    // a canvas's marks: its instance buffer and its touch field, made again from the same data after a lost context
    function bind(h) {
      const data = h.data, vao = gl.createVertexArray(), vb = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, h.bytes, gl.STATIC_DRAW);
      for (let l = 1; l <= 7; l++) { gl.enableVertexAttribArray(l); gl.vertexAttribDivisor(l, 1); }
      gl.bindVertexArray(null);
      const tt = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tt);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, data.cols, data.rows, 0, gl.RG, gl.FLOAT, data.touch);
      for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
      Object.assign(h, { vao, vb, tt });
    }
    const live = new Set();
    // the bytes are kept (an exact copy, about 7 MB for an area's meadow): the canvas lets its own go once they're up
    // (cv.dropMarks), and a lost context needs them again
    function upload(data) { const h = { data, bytes: new Uint8Array(data.buf, 0, data.n * STRIDE).slice() }; bind(h); live.add(h); return h; }
    const free = (h) => { if (!h) return; live.delete(h); h.bytes = null; gl.deleteBuffer(h.vb); gl.deleteVertexArray(h.vao); gl.deleteTexture(h.tt); };
    // a lost context (the GPU reset, or the browser taking it back under memory pressure) blanked the meadow for good:
    // only the 2D layers were left – the sky, the pools. Asking to keep it (preventDefault) lets the browser give it
    // back, and then everything on it is made again from what's still here: the atlas's 2D copy, each canvas's marks
    let lost = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { init(); for (const h of live) bind(h); d0 = 0; d1 = AS; lost = false; });
    let VW = 1, VH = 1, TT = 0, XRAY = new URLSearchParams(location.search).has('xray') ? 1 : 0;
    // the lights (lib/world.js): lamps and the lighthouse's lantern as [x, y, radius, strength] in world px, and the beam
    // [x, y, angle, strength]
    const LB = new Float32Array(32); let LN = 0; const BEAM = [0, 0, 0, 0];
    function begin(wPx, hPx, vw, vh, t, lights, beam) {
      if (canvas.width !== wPx || canvas.height !== hPx) { canvas.width = wPx; canvas.height = hPx; }
      VW = vw; VH = vh; TT = t;
      LN = Math.min(8, (lights || []).length); for (let i = 0; i < LN; i++) LB.set(lights[i], i * 4);
      if (beam) { BEAM[0] = beam[0]; BEAM[1] = beam[1]; BEAM[2] = beam[2]; BEAM[3] = beam[3]; } else BEAM[3] = 0;
      gl.viewport(0, 0, wPx, hPx); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog); flushAtlas();
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.uniform1i(U.uAtlas, 0); gl.uniform1i(U.uTouch, 1);
    }
    const RR = new Float32Array(24), RSP = new Float32Array(6);
    function draw(h, cv, o) {
      const D = h.data, g = gl;
      g.bindVertexArray(h.vao);
      g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, h.tt);
      const tg = cv.touchGL(); if (tg) g.texSubImage2D(g.TEXTURE_2D, 0, 0, tg.r0, D.cols, tg.r1 - tg.r0, g.RG, g.FLOAT, tg.data.subarray(tg.r0 * D.cols * 2, tg.r1 * D.cols * 2));
      g.uniform2f(U.uOrg, cv.x, cv.y); g.uniform2f(U.uWorld, o.world[0], o.world[1]); g.uniform2f(U.uOff, o.off[0], o.off[1]);
      g.uniform2f(U.uView, VW, VH); g.uniform2f(U.uCell, cv.cw, cv.ch); g.uniform1f(U.uT, TT); g.uniform1f(U.uXray, XRAY);
      g.uniform4fv(U.uL, LB); g.uniform1i(U.uLN, LN); g.uniform4f(U.uBeam, BEAM[0], BEAM[1], BEAM[2], BEAM[3]);
      const rs = (o.rings || []).slice(0, 6);
      rs.forEach((r, i) => { RR[i * 4] = r.x; RR[i * 4 + 1] = r.y; RR[i * 4 + 2] = r.t0; RR[i * 4 + 3] = r.reach || 150; RSP[i] = r.speed || 208; });
      g.uniform1i(U.uNR, rs.length); g.uniform4fv(U.uR, RR); g.uniform1fv(U.uRS, RSP);
      g.bindBuffer(g.ARRAY_BUFFER, h.vb);
      const v = o.view, B = D.band, nb = D.nb, b0 = v ? Math.max(0, Math.floor((v[0] - cv.x) / B)) : 0, b1 = v ? Math.min(nb - 1, Math.floor((v[2] - cv.x) / B) + 2) : nb - 1;   // (band i holds x in [(i - 1) B, i B): one band of slack each side for sway and overhang)
      let n = 0;
      for (const K of D.kinds) {
        const s0 = K[b0], s1 = K[b1 + 1]; if (s1 <= s0) continue;
        const base = s0 * STRIDE;
        for (let l = 0; l < 5; l++) g.vertexAttribPointer(1 + l, 4, g.FLOAT, false, STRIDE, base + l * 16);
        g.vertexAttribPointer(6, 4, g.UNSIGNED_BYTE, true, STRIDE, base + 80); g.vertexAttribPointer(7, 4, g.UNSIGNED_BYTE, true, STRIDE, base + 84);
        g.drawArraysInstanced(g.TRIANGLE_STRIP, 0, 4, s1 - s0); n += s1 - s0;
      }
      g.bindVertexArray(null);
      return n;
    }
    return { ok: true, gl, canvas, glyph, upload, free, begin, draw, flushAtlas, STRIDE, xray(on) { XRAY = on ? 1 : 0; }, get lost() { return lost; } };
  }
  window.WK_GL = { create, STRIDE };
})();
