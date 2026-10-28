// room.js – a room you can play (SCOPE.md §2, §3, §7.5, step 3). A place file (lib/place.js) is built into the layers
// (lib/layers.js) and played: harold walks (smoothly – the world's marks step), the quack loosens every big letter its
// ring reaches, loose letters drift on the wind, fall into holes, get pushed and settle onto the grid about three
// seconds after they were last touched, and settled letters that spell a word in the word book become the thing.
// The cast moves by its own rules (Bug runs his loop and skids when a ring meets him head on), the room's events
// happen by its clock, and its exits lead on. Changing room, the next room is built and baked while this one slides out.
//   const sim = WK_ROOM.sim(scene, { demo })   sim.step(dt, input) · sim.state() → what lib/layers.js draws
//   WK_ROOM.attach(scene)                       scene.at(t): the room's demo, replayed deterministically (the compose card)
//   WK_ROOM.card({ rooms, script, base })        a playable card: loads the rooms, bakes, plays, changes rooms
//   WK_ROOM.bench(rooms, { base, onRoom })      bake time and draw time, separately, for every room (the timing card)
// Input: { x, y } the stick (−1…1), a (quack / act), b (switch to malifex) – held, so a press is its first step.
(function () {
  const D = WK_DECISIONS, PL = WK_PLACE, hash = Webkeeper.hash;
  const COLS = 160, ROWS = 45, GR = D.camera.ground;
  const RING = { speed: D.motion.ring.speed * 8, reach: D.motion.ring.reach * 8 };
  const SETTLE = D.motion.settleAfter, STEP3 = [0.6, 0.3, 0];
  const SPEED = 22, VS = 11;                   // step 3 r2: columns a second across, rows a second up and down (on screen, not scaled down)
  const DT = 1 / 60;
  const DIRS = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function sim(sc, o = {}) {
    const p = sc.place, demo = (o.script && p.demo && p.demo[o.script]) || p.demo || {}, words = p.words || [];
    let st, walkG, occ, holeG, wallG, script;
    const cellsOf = (w) => w.cells || [...w.text].map((_, j) => (w.dir === 'col' ? [w.at[0], w.at[1] + j] : [w.at[0] + j, w.at[1]]));
    const slots = [];
    for (const s of p.solve || []) { const tx = PL.solveText(p, s), w = tx && { text: tx }; if (w) [...w.text].forEach((ch, j) => { if (ch !== ' ') slots.push({ ch, c: s.at[0] + (s.dir === 'col' ? 0 : j), r: s.at[1] + (s.dir === 'col' ? j : 0), by: null }); }); }
    function reset() {
      const hero = (p.actors || []).find((a) => a.who === 'harold') || { at: [80, 30] };
      st = { t: 0, h: { who: 'harold', c: hero.at[0], r: hero.at[1], flip: hero.face !== 'west', moving: false, vx: 0, vy: 0, gone: false, still: 0 }, as: 'harold',
        letters: [], rings: [], becomes: [], cast: [], sayings: [], open: new Set(), flags: {}, fired: new Set(), exit: null, aWas: false, bWas: false, hint: '', hintTill: -1, counter: null, jam: false };
      for (const w of words) cellsOf(w).forEach(([c, r], j) => {
        const ch = w.text[j]; if (!ch || ch === ' ') return;
        st.letters.push({ ch, word: w.id, j, x: (c + 0.5) * 8, y: (r + 0.5) * 16, z: 0, vx: 0, vy: 0, vz: 0, home: [c, r], cell: [c, r],
          state: w.voice ? 'voice' : w.lying ? 'loose' : 'settled', still: !!w.lying, lying: !!w.lying, touched: -99, voice: !!w.voice, hidden: !!w.hidden, wall: !!w.wall, on: w.on, reveal: 0 });
        // a letter on a track (w.rails, one per letter): it sits on the ground, pushed it hops along its track and
        // nowhere else, and the quack doesn't scatter it (PUZZLES.md: the player decides where, not the physics)
        const rl = w.rails && w.rails[j];
        if (rl) { const L = st.letters[st.letters.length - 1]; L.rail = railCells([[c, r], ...rl]); L.ri = 0; L.state = 'settled'; L.still = L.lying = false; }
      });
      for (const a of p.actors || []) if (a.who !== 'harold') st.cast.push({ who: a.who, id: a.id || a.who, c: a.at[0], r: a.at[1], flip: a.face !== 'west', pose: a.pose || (a.who === 'bug' ? 'calm' : 'idle'),
        route: a.route, speed: a.speed || 0, u: 0, loop: a.loop !== false, gone: !!a.hidden, skid: -9, moving: false, vx: 0, vy: 0,
        steals: !!a.steals, den: a.den || a.at, job: 'home', rest: 0, carry: null, target: null, hold: a.hold || null, eats: a.eats || null, solid: a.solid || null });
      // a letter already settled in its place holds that place (0.6: E and N lie on the doorstep from the start)
      for (const s of slots) s.by = st.letters.find((l) => l.state === 'settled' && l.cell[0] === s.c && l.cell[1] === s.r && l.ch === s.ch) || null;
      walkG = null; occ = null; script = { i: 0, t0: 0, best: 1e9, since: 0 };
    }
    // a track's waypoints (straight runs along a row or a column) as the cells it passes, in order
    function railCells(pts) {
      const out = [pts[0].slice()];
      for (let k = 1; k < pts.length; k++) {
        let [c, r] = out[out.length - 1]; const [tc, tr] = pts[k];
        while (c !== tc || r !== tr) { if (c !== tc) c += Math.sign(tc - c); else r += Math.sign(tr - r); out.push([c, r]); }
      }
      return out;
    }
    // Harold walking into a letter on a track along it: after a short push it hops one cell that way (and on, while he
    // keeps pushing); against the track, or into anything, it doesn't move
    const PUSH_HOLD = 0.14, QUACK_HOPS = 2;   // a quack hops a letter on its track two cells on
    function pushRail(a, c, r, dx, dy) {
      if (a !== st.h) return;
      const l = occupancy().get(r * COLS + c); if (!l || !l.rail) return;
      if (st.t - (l.pushLast ?? -9) > 0.12) { l.pushT0 = st.t; l.pushed = false; }
      l.pushLast = st.t;   // held through a hop, the push carries on to the next cell without waiting again
      if (l.state !== 'settled') return;
      if (st.t - l.pushT0 < PUSH_HOLD && !l.pushed) return;
      // aim assist: any push moves it one cell on towards its place; only a push plainly back along the track (the
      // way it came) takes it back. Pushing up into a letter whose track first runs sideways still moves it on.
      const cur = l.rail[l.ri], back = l.rail[l.ri - 1];
      const backward = back && dx * (back[0] - cur[0]) + dy * (back[1] - cur[1]) > 0;
      if (railHop(l, backward ? l.ri - 1 : l.ri + 1)) l.pushed = true;
    }
    // a letter on a track hops to cell k of it, if that's free (not another letter, not Harold): a quick two-step hop
    function railHop(l, k) {
      const nx = l.rail[k]; if (!nx || l.state !== 'settled') return false;
      const o2 = occupancy().get(nx[1] * COLS + nx[0]); if (o2 && o2 !== l) return false;
      if (Math.round(st.h.c) === nx[0] && Math.round(st.h.r) === nx[1]) return false;
      for (const s of slots) if (s.by === l) s.by = null;
      const end = k === l.rail.length - 1 ? slots.find((s) => s.c === nx[0] && s.r === nx[1] && s.ch === l.ch && !s.by) : null;
      l.ri = k; settleAt(l, nx[0], nx[1], end || null); l.s0 = st.t - 0.22; l.touched = st.t;
      return true;
    }
    // ── the grids: where feet go (the place's, with words become and doors open), where letters can't go, the holes
    const walkState = () => ({ becomes: st.becomes.map((b) => ({ text: b.text, at: b.at, dir: b.dir })), open: st.open });
    const grid = () => walkG || (walkG = sc.walk(walkState()));
    function statics() {
      if (holeG) return;
      const F = sc.G.fields(); if (!F) return;
      holeG = new Uint8Array(COLS * ROWS); wallG = new Uint8Array(COLS * ROWS);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const tx = Math.floor(((c + 0.5) * 8 - sc.G.x) / F.cw), ty = Math.floor(((r + 0.5) * 16 - sc.G.y) / F.ch);
        if (tx >= 0 && ty >= 0 && ty < F.rows && tx < F.cols && F.hole[ty * F.cols + tx]) holeG[r * COLS + c] = 1;
      }
      for (const [c0, r0, c1, r1] of sc.feet) for (let r = Math.max(0, Math.floor(r0)); r < Math.min(ROWS, Math.ceil(r1)); r++) for (let c = Math.max(0, Math.floor(c0)); c < Math.min(COLS, Math.ceil(c1)); c++) wallG[r * COLS + c] = 1;
    }
    const holeAt = (c, r) => { statics(); return holeG && c >= 0 && r >= 0 && c < COLS && r < ROWS ? holeG[r * COLS + c] : 0; };
    const doorShut = (c, r) => sc.doors.some((d) => !st.open.has(d.id) && c >= d.cells[0] && c < d.cells[2] && r >= d.cells[1] && r < d.cells[3]);
    const wallAt = (x, y) => { statics(); const c = Math.floor(x / 8), r = Math.floor(y / 16); if (c < 0 || r < 1 || c >= COLS || r >= ROWS - 1) return true; return (wallG && wallG[r * COLS + c]) || doorShut(c, r); };
    const occupancy = () => { if (!occ) { occ = new Map(); for (const l of st.letters) if ((l.state === 'settled' || l.state === 'settling') && !l.voice && !l.hidden) occ.set(l.cell[1] * COLS + l.cell[0], l); } return occ; };
    const blocksFeet = (l) => l.state === 'settled' || l.state === 'settling';
    function walkable(c, r) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS || !grid()[r * COLS + c]) return false;
      // someone sitting (an actor's `solid`: [columns wide, rows tall] up from the feet) is walked round, not through
      for (const a of st.cast) if (a.solid && !a.gone && !a.pull && Math.abs(c - a.c) <= a.solid[0] / 2 && r <= Math.round(a.r) && r > a.r - a.solid[1]) return false;
      const l = occupancy().get(r * COLS + c); return !(l && blocksFeet(l));
    }
    const mal = () => st.cast.find((a) => a.who === 'malifex' && !a.gone);
    const say = (text, who, dur = 2.4) => st.sayings.push({ text, who, till: st.t + dur });
    const hint = (text, dur = 2.6) => { st.hint = text; st.hintTill = st.t + dur; };
    const exitOk = (e) => !e.needs || st.flags[e.needs];

    // the nearest walkable cell to (c, r), rows counting double (the camera's foreshortening); itself if it's open
    function openNear(c, r) {
      const c0 = Math.round(c), r0 = Math.round(r);
      if (walkable(c0, r0)) return [c, r];
      let best = null, bd = 1e9;
      for (let dr = -10; dr <= 10; dr++) for (let dc = -24; dc <= 24; dc++) {
        const d = Math.abs(dc) + Math.abs(dr) * 2; if (d >= bd || !walkable(c0 + dc, r0 + dr)) continue;
        bd = d; best = [c0 + dc, r0 + dr];
      }
      return best || [c, r];
    }
    // ── walking: smooth, decided by the feet's cell (one cell, not the sprite); an edge or a door with an exit leads on
    function move(a, dx, dy, dt) {
      const m = Math.hypot(dx, dy); a.moving = m > 0.15;
      if (!a.moving) { a.vx = a.vy = 0; return; }
      if (m > 1) { dx /= m; dy /= m; }
      if (Math.abs(dx) > 0.2) a.flip = dx > 0;
      a.head = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'w' : 'e') : (dy < 0 ? 'n' : 's');   // the way he's going, for a squad behind him
      const c0 = a.c, r0 = a.r, nc = a.c + dx * SPEED * dt, nr = a.r + dy * VS * dt;
      // inside something already (it shouldn't happen, but if it does): he can always walk out
      if (!walkable(Math.round(a.c), Math.round(a.r))) { a.c = nc; a.r = nr; a.vx = (a.c - c0) * 8 / dt; a.vy = (a.r - r0) * 16 / dt; return; }
      if (walkable(Math.round(nc), Math.round(a.r))) a.c = nc; else { edge(a, nc, a.r); if (Math.abs(dx) > 0.3) pushRail(a, Math.round(nc), Math.round(a.r), Math.sign(dx), 0); }
      if (walkable(Math.round(a.c), Math.round(nr))) a.r = nr; else { edge(a, a.c, nr); if (Math.abs(dy) > 0.3) pushRail(a, Math.round(a.c), Math.round(nr), 0, Math.sign(dy)); }
      a.vx = (a.c - c0) * 8 / dt; a.vy = (a.r - r0) * 16 / dt;
      if (a === st.h) for (const e of p.exits || []) if (e.cells && !e.press && exitOk(e)) { const [x0, y0, x1, y1] = e.cells, c = Math.round(a.c), r = Math.round(a.r); if (c >= x0 && c < x1 && r >= y0 && r < y1) st.exit = e; }
    }
    function edge(a, c, r) {
      if (a !== st.h) return;
      const ci = Math.round(c), ri = Math.round(r), side = ci < 0 ? 'west' : ci >= COLS ? 'east' : ri < 0 ? 'north' : ri >= ROWS ? 'south' : null;
      if (!side) return;
      // the world (step 3 r2): an edge is a seam to the area next door – it may be gated, otherwise the world takes him over
      if (o.world) { const ex = (p.exits || []).find((e) => e.edge === side && e.needs); if (ex && !exitOk(ex)) { hint(ex.wait || 'not yet'); return; } st.cross = { side, c, r }; return; }
      for (const e of p.exits || []) if (e.edge === side && exitOk(e)) { const [x0, x1] = e.rows || e.cols, v = e.rows ? Math.round(a.r) : Math.round(a.c); if (v >= x0 - 1 && v <= x1 + 1) st.exit = e; }
    }
    // ── A: a press exit in reach (the one target), an order as malifex, or the quack
    const nearBox = (a, [c0, r0, c1, r1], k) => a.c > c0 - k && a.c < c1 + k && a.r > r0 - k / 2 && a.r < r1 + k / 2;
    function act() {
      if (st.as === 'malifex') {
        const m = mal(), u = st.cast.filter((x) => x.who === 'uniclone').sort((x, y) => Math.hypot(x.c - m.c, x.r - m.r) - Math.hypot(y.c - m.c, y.r - m.r))[0];
        // the book: both of them take it, one word each (copy, paste) – and follow exactly as told
        if (u) { for (const x of st.cast) if (x.who === 'uniclone') x.order = 'follow'; say('...follow.', 'malifex', 1.4); say('copy.', u.id, 1.6); const v = st.cast.find((x) => x.who === 'uniclone' && x !== u); if (v) say('paste.', v.id, 1.8); } return;
      }
      for (const e of p.exits || []) if (e.press && nearBox(st.h, e.cells, 6)) { if (exitOk(e)) { st.exit = e; st.h.gone = true; } else hint(e.wait || 'not yet'); return; }
      if (st.rings.some((R) => st.t - R.t0 < 0.4)) return;
      st.rings.push({ x: (st.h.c + 0.5) * 8, y: (st.h.r + 1) * 16 - 20, t0: st.t, reach: RING.reach, speed: RING.speed, hit: new Set(), bug: false });
      st.quacks = (st.quacks || 0) + 1;   // scenes can wait for the first quack (book/02-chapter-0.md, QUACK)
      if (window.WK_SOUND && !o.demo) WK_SOUND.quack();
    }
    function toggle() {
      if (!mal()) { hint('malifex isn\'t here yet'); return; }
      st.as = st.as === 'malifex' ? 'harold' : 'malifex'; st.h.moving = false;
    }
    // ── letters
    function loosen(l, R, i) {
      // a quack at Bug's den sends what he hoarded home; a letter in his mouth comes only from a quack that meets him
      if (l.state === 'den') { giveBack(l); return; }
      if (l.state === 'carried' || l.state === 'flying') return;
      // a letter on a track isn't scattered: the quack hops it one cell on towards its place (STOP's wall opens a
      // step at a time; quacks and pushes together walk letters home)
      if (l.rail) { if (l.state === 'settled' && railHop(l, l.ri + 1)) l.more = QUACK_HOPS - 1; return; }
      if (l.voice || l.hidden || l.state === 'word' || l.state === 'gone') return;
      const d = Math.hypot(l.x - R.x, (l.y - R.y) * GR) || 1, h1 = hash(i, Math.floor(R.t0 * 10), 41), h2 = hash(i, 7, Math.floor(R.t0 * 10));
      if (l.state === 'settled' || l.state === 'settling') { for (const s of slots) if (s.by === l) s.by = null; occ = null; }
      l.state = 'loose'; l.still = false; l.touched = st.t; l.slot = null;
      l.vz = 80 + h1 * 40; l.vx += ((l.x - R.x) / d) * 14 + (h1 - 0.5) * (l.wall ? 70 : 16); l.vy += ((l.y - R.y) / d) * 6 + (h2 - 0.5) * (l.wall ? 40 : 8);
    }
    const slotFor = (l, rc, rr) => {
      let best = null, bd = 1e9;
      for (const s of slots) { if (s.ch !== l.ch || (s.by && s.by !== l)) continue; const dc = Math.abs(s.c + 0.5 - l.x / 8), dr = Math.abs(s.r + 0.5 - l.y / 16); if (dc <= rc && dr <= rr) { const d = dc + dr * 2; if (d < bd) { bd = d; best = s; } } }
      return best;
    };
    function freeCell(l) {
      const c0 = Math.floor(l.x / 8), r0 = Math.floor(l.y / 16), O = occupancy(), hc = Math.round(st.h.c), hr = Math.round(st.h.r);
      let best = null, bd = 1e9;
      for (let dr = -4; dr <= 4; dr++) for (let dc = -12; dc <= 12; dc++) {
        const c = c0 + dc, r = r0 + dr, d = Math.abs(dc) + Math.abs(dr) * 2.2; if (d >= bd) continue;
        if (c < 0 || r < 1 || c >= COLS || r >= ROWS - 1 || O.has(r * COLS + c) || wallAt((c + 0.5) * 8, (r + 0.5) * 16)) continue;
        if (!grid()[r * COLS + c] && !holeAt(c, r)) continue;   // never settles where Harold can't reach it
        if (Math.abs(c - hc) < 4 && Math.abs(r - hr) < 1.5) continue;
        if (slots.some((s) => s.c === c && s.r === r && s.ch !== l.ch)) continue;
        bd = d; best = [c, r];
      }
      return best || [c0, r0];
    }
    function settleAt(l, c, r, s) {
      l.state = 'settling'; l.cell = [c, r]; l.fx = l.x; l.fy = l.y; l.s0 = st.t; l.vx = l.vy = l.vz = 0; l.z = 0;
      if (s) s.by = l; occ = null;
    }
    function settle(l) {
      // a sign's letters hop and settle back onto the sign, if they haven't gone far
      if (l.on && Math.abs(l.x / 8 - 0.5 - l.home[0]) < 3.5 && Math.abs(l.y / 16 - 0.5 - l.home[1]) < 1.6 && !occupancy().has(l.home[1] * COLS + l.home[0])) { settleAt(l, l.home[0], l.home[1], null); return; }
      const s = slotFor(l, l.lying ? 6.5 : 3.2, l.lying ? 3.2 : 2); if (s) settleAt(l, s.c, s.r, s); else { const [c, r] = freeCell(l); settleAt(l, c, r, null); } }
    function stepLetter(l, i, dt, pushers) {
      if (l.state === 'settling') {
        const s = st.t - l.s0, tx = (l.cell[0] + 0.5) * 8, ty = (l.cell[1] + 0.5) * 16;
        if (s >= 0.45) { l.state = 'settled'; l.x = tx; l.y = ty; occ = null; walkG = null; if (window.WK_SOUND && !o.demo) WK_SOUND.letter(l.ch); if (l.more > 0) { l.more--; railHop(l, l.ri + 1); } return true; }
        const a = STEP3[Math.floor(s / 0.15)]; l.x = tx + (l.fx - tx) * a; l.y = ty + (l.fy - ty) * a; return false;
      }
      if (l.state === 'flying') {
        // back from Bug's den, in an arc, to its track (or near where it was taken)
        const tx = (l.to[0] + 0.5) * 8, ty = (l.to[1] + 0.5) * 16, dx = tx - l.x, dy = ty - l.y, d = Math.hypot(dx, dy);
        if (d < 4) { const to = l.rail ? railBack(l) : freeCell({ x: tx, y: ty }); if (l.rail) l.ri = to.k; settleAt(l, to[0] ?? to.c, to[1] ?? to.r, null); return false; }
        const v = Math.min(d / dt, 240); l.x += (dx / d) * v * dt; l.y += (dy / d) * v * dt; l.z = Math.min(16, d / 5); return false;
      }
      if (l.state === 'pulled') {
        const tx = (l.to[0] + 0.5) * 8, ty = (l.to[1] + 0.5) * 16, dx = tx - l.x, dy = ty - l.y, d = Math.hypot(dx, dy);
        if (d < 6) { l.state = 'gone'; return false; }
        const v = Math.min(260, 60 + (st.t - l.touched) * 160); l.x += (dx / d) * v * dt; l.y += (dy / d) * v * dt; l.z = Math.max(0, l.z - 30 * dt); return false;
      }
      if (l.state !== 'loose') return false;
      if (l.z > 0 || l.vz > 0) { l.vz -= 440 * dt; l.z = Math.max(0, l.z + l.vz * dt); if (l.z === 0) l.vz = 0; }
      const c = Math.floor(l.x / 8), r = Math.floor(l.y / 16), inH = holeAt(c, r) && l.z < 6;
      const w = p.wind;
      if (w && !inH && !l.still) {
        const A = w.area || [0, 0, COLS, ROWS], [dx, dy] = DIRS[w.toward] || [1, 0];
        if (c >= A[0] && c < A[2] && r >= A[1] && r < A[3]) { const k = (w.k ?? 1) * (36 + 130 * Math.max(0, (o.wind || WK_BRUSH.windA)(l.x, l.y, st.t))); l.vx += dx * k * dt; l.vy += dy * k * dt / GR; }
      }
      if (inH) {
        // fallen in: it drifts along the hole's floor to its place in the word, if that place is near and free
        if (!l.slot) l.slot = slotFor(l, 16, 9);
        if (l.slot) {
          const tx = (l.slot.c + 0.5) * 8, ty = (l.slot.r + 0.5) * 16, dx = tx - l.x, dy = ty - l.y, d = Math.hypot(dx, dy);
          if (d < 2) { settleAt(l, l.slot.c, l.slot.r, l.slot); return false; }
          const v = Math.min(80, d * 5); l.vx = (dx / d) * v; l.vy = (dy / d) * v; l.touched = st.t;
        } else { l.vx *= 0.9; l.vy *= 0.9; }
      }
      // pushed: whoever walks into it moves it on, and a little aside
      for (const a of pushers) {
        const ax = (a.c + 0.5) * 8, ay = (a.r + 0.5) * 16, dx = l.x - ax, dy = l.y - ay;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 11 && l.z < 8) {
          const d = Math.hypot(dx / 20, dy / 11) || 0.01;
          l.vx = a.vx * 1.1 + (dx / 20 / d) * 18; l.vy = a.vy * 1.1 + (dy / 11 / d) * 8;
          if (d < 1) { l.x = ax + (dx / d) * 1.0; l.y = ay + (dy / d) * 1.0; }
          l.touched = st.t; l.still = false; l.slot = null;
        }
      }
      if (!inH || !l.slot) { const f = Math.exp(-1.6 * dt); l.vx *= f; l.vy *= f; }
      let nx = l.x + l.vx * dt, ny = l.y + l.vy * dt;
      // a loose letter never goes where Harold can't follow (into a page, a rock, a hedge) – only into holes (the
      // ditch's trench is where BRIDGE settles); one that starts somewhere off the ground (a sign's board) may leave it
      const out = (x, y) => { const c = Math.floor(x / 8), r = Math.floor(y / 16); return c < 0 || r < 0 || c >= COLS || r >= ROWS || (!grid()[r * COLS + c] && !holeAt(c, r)); };
      const stop = (x, y) => wallAt(x, y) || (out(x, y) && !out(l.x, l.y));
      if (stop(nx, l.y)) { l.vx *= -0.3; nx = l.x; }
      if (stop(nx, ny)) { l.vy *= -0.3; ny = l.y; }
      l.x = nx; l.y = ny;
      if (!l.still && st.t - l.touched > SETTLE && Math.hypot(l.vx, l.vy) < 16 && l.z === 0) settle(l);
      return false;
    }
    // ── words: settled letters that spell one in a row or a column become the thing (not when they are back home)
    function words2() {
      const O = occupancy();
      for (const [K, def] of Object.entries(PL.WORDS)) {
        if (!def.settled) continue;
        for (const l of O.values()) {
          if (l.ch !== K[0] || l.state !== 'settled') continue;
          for (const dir of ['row', 'col']) {
            const ls = []; let ok = true;
            for (let j = 0; j < K.length && ok; j++) {
              const c = l.cell[0] + (dir === 'row' ? j : 0), r = l.cell[1] + (dir === 'col' ? j : 0), x = O.get(r * COLS + c);
              if (K[j] === ' ') { if (x) ok = false; } else if (!x || x.ch !== K[j] || x.state !== 'settled') ok = false; else ls.push(x);
            }
            if (!ok || ls.every((x) => x.cell[0] === x.home[0] && x.cell[1] === x.home[1])) continue;
            // letters on tracks spell only from their places at the tracks' ends (moving in step, STOP's letters
            // would spell STOP again one cell over and turn to brick)
            if (ls.some((x) => x.rail && x.ri !== x.rail.length - 1)) continue;
            becomeNow(K, def, ls, dir); return;
          }
        }
      }
    }
    function becomeNow(K, def, ls, dir) {
      const at = ls[0].cell.slice();
      for (const l of ls) l.state = 'word';
      if (window.WK_SOUND && !o.demo) WK_SOUND.word(K);
      st.becomes.push({ text: K, at, dir, t: st.t, thing: sc.thing(K, at, dir), letters: ls.map((l) => ({ ch: l.ch, x: (l.cell[0] + 0.5) * 8, y: (l.cell[1] + 0.5) * 16 })) });
      if (def.opens) { const d = sc.doors.filter((x) => x.opens === K || !x.opens).sort((a, b) => Math.abs((a.cells[0] + a.cells[2]) / 2 - at[0]) - Math.abs((b.cells[0] + b.cells[2]) / 2 - at[0]))[0]; if (d && Math.abs(d.cells[1] - at[1]) < 8) st.open.add(d.id); }
      st.flags.solved = true; st.flags[K.toLowerCase()] = true; occ = null; walkG = null;
    }
    // ── the cast: routes, skids, orders; bug's digit
    function along(route, u, loop) {
      const seg = []; let tot = 0;
      const n = loop ? route.length : route.length - 1;
      for (let i = 0; i < n; i++) { const a = route[i], b = route[(i + 1) % route.length], l = Math.hypot(b[0] - a[0], (b[1] - a[1]) * 3.6); seg.push(l); tot += l; }
      let s = loop ? ((u % tot) + tot) % tot : Math.min(u, tot);
      for (let i = 0; i < n; i++) { if (s <= seg[i] || i === n - 1) { const a = route[i], b = route[(i + 1) % route.length], f = seg[i] ? Math.min(1, s / seg[i]) : 1; return { c: a[0] + (b[0] - a[0]) * f, r: a[1] + (b[1] - a[1]) * f, end: !loop && u >= tot }; } s -= seg[i]; }
      return { c: route[0][0], r: route[0][1], end: true };
    }
    // Malifex, perceived (quacked at, or talked to): he blushes, goes up in a poof as the cat, and comes back – every
    // time, but not twice at once
    const BACK = ['...we don\'t talk about the cat.', '...that didn\'t happen.', '...stop perceiving me.', '...'];
    function perceive(a) {
      if (a.cat || a.perc > st.t || a.gone || a.hidden) return;
      a.blush = st.t + 1.4; a.perc = st.t + 4.4; a.poofAt = st.t + 1.1; a.backAt = st.t + 3.4;
    }
    function perceived(a) {
      const loud = window.WK_SOUND && !o.demo;
      if (a.poofAt && st.t >= a.poofAt) { a.poofAt = 0; a.cat = true; a.poofT = st.t; if (loud) WK_SOUND.wizard(); say('...meow.', a.id, 1.6); }
      if (a.backAt && st.t >= a.backAt) { a.backAt = 0; a.cat = false; a.poofT = st.t; if (loud) WK_SOUND.poof(); say(BACK[(a.backs = (a.backs || 0) + 1) % BACK.length], a.id, 2); }
    }
    // where the two who follow stand, by the way the leader is going: [columns, rows] from him
    const FORM = { w: [[6, -1.3], [6, 1.3]], e: [[-6, -1.3], [-6, 1.3]], n: [[-5, 1.8], [5, 1.8]], s: [[-5, -1.8], [5, -1.8]] };
    function stepCast(a, dt) {
      if (a.gone) return;
      if (a.steals) { thief(a, dt); return; }
      if (a.dance) {
        // Patch: she dances on the spot while the theme plays, then runs off (her `then` route) and is gone
        if (st.t < a.dance) { a.pose = 'dance'; a.moving = false; a.flip = Math.floor(st.t * 4) % 2 === 0; return; }
        a.dance = 0; if (a.thenRoute) { a.route = [[a.c, a.r], ...a.thenRoute]; a.speed = 40; a.u = 0; a.loop = false; a.vanish = true; a.thenRoute = null; } else { a.gone = true; return; }
      }
      if (a.pull) {
        const dx = a.pull[0] - a.c, dy = a.pull[1] - a.r, d = Math.hypot(dx, dy * 3.6);
        if (d < 1) { a.gone = true; return; }
        const v = Math.min(40, 8 + (st.t - a.pt) * 30) * dt; a.c += (dx / d) * v; a.r += (dy * 3.6 / d) * v / 3.6; a.moving = true; return;
      }
      if (a.route && a.speed) {
        if (st.t - a.skid < 1.5) { a.pose = 'scared'; a.moving = false; return; }
        const c0 = a.c; a.u += a.speed * dt; const q = along(a.route, a.u, a.loop); a.c = q.c; a.r = q.r;
        // passing what he grabs on his way (Bug and the pizza: { at, hold, set }), he takes it and runs on with it
        if (a.grab && Math.hypot(a.c - a.grab.at[0], (a.r - a.grab.at[1]) * 2) < 2.5) { a.hold = a.grab.hold || null; if (a.grab.set) st.flags[a.grab.set] = true; a.grab = null; }
        a.moving = true; a.pose = a.who === 'bug' ? 'run' : a.pose; if (Math.abs(a.c - c0) > 1e-4) a.flip = a.c > c0;
        a.vx = (a.c - c0) * 8 / dt; a.dir = [a.c - c0, 0];
        if (q.end && a.vanish) a.gone = true;
        if (q.end && a.stopAtEnd) { a.route = null; a.moving = false; a.pose = a.who === 'bug' ? 'calm' : 'idle'; }
        return;
      }
      if (a.order === 'follow') {
        // two in formation behind him, one each side of the way he's going (west: up and down to his east; north:
        // left and right below him), so they never walk into one spot. No bumping, just walking to their places
        const m = mal(); if (!m) return;
        const sq = st.cast.filter((x) => x.order === 'follow' && !x.gone), side = FORM[m.head || (m.flip ? 'e' : 'w')];
        const s0 = side[0], s1 = side[1], A = sq[0], B = sq[1] || A;
        const d2 = (x, s) => Math.hypot(m.c + s[0] - x.c, (m.r + s[1] - x.r) * 3.6);
        if (m.formT !== st.t) { m.formT = st.t; m.formX = sq.length > 1 && d2(A, s0) + d2(B, s1) > d2(A, s1) + d2(B, s0); }   // once a frame: who takes which side
        const mine = (a === A) !== !!m.formX ? s0 : s1;
        const dx = m.c + mine[0] - a.c, dy = m.r + mine[1] - a.r, d = Math.hypot(dx, dy * 3.6);
        a.moving = d > 0.8; if (a.moving) { const v = Math.min(d, SPEED * (d > 6 ? 1.1 : 0.8) * dt); a.c += (dx / d) * v; a.r += (dy * 3.6 / d) * v / 3.6; if (Math.abs(dx) > 0.3) a.flip = dx > 0; }
        else a.flip = m.flip;
      }
    }
    // ── Bug the thief (Kingdom's night, PUZZLES.md): a bug with a den (actor `steals`, `den`) waits there, and every few
    // seconds runs out for a letter left in the dark – out of every lamp's light (a lamp, a word that glows: the second
    // of the light's three steps, as lib/marks.js draws it) and with Harold not standing by it. He carries it home;
    // quacked head on he skids and drops it, and it hops back. A quack at the den sends home what he hoarded. Once his
    // den is lit he curls up and sleeps.
    const THIEF = { every: 4, speed: 26, guard: 7, reach: 70 };
    function lights() {
      const out = [];
      for (const th of p.things || []) if (th.thing === 'lamp') out.push([(th.foot[0] + 0.5) * 8, (th.foot[1] - 2) * 16, th.rad || 230]);
      for (const b of st.becomes) { const d = PL.bookOf(b.text), gl = d && d.glow && d.glow(b.text.length); if (gl) out.push([(b.at[0] + gl.at[0] + 0.5) * 8, (b.at[1] + gl.at[1] + 0.5) * 16, gl.rad]); }
      return out;
    }
    const litIn = (LS, x, y) => LS.some(([lx, ly, rad]) => Math.hypot(x - lx, (y - ly) * 1.7) < rad * 0.7);
    const stealable = (l) => l && !l.voice && !l.hidden && !l.wall && !l.digit && !l.on && (l.state === 'settled' || l.state === 'loose');
    const guarded = (l) => Math.hypot(l.x / 8 - 0.5 - st.h.c, (l.y / 16 - 0.5 - st.h.r) * 2) < THIEF.guard;
    // where a letter on a track goes back to: the cell it was taken from, or the nearest free one before it
    function railBack(l) {
      let k = Math.max(0, l.rail.findIndex(([c, r]) => c === l.from[0] && r === l.from[1]));
      const O = occupancy(), busy = ([c, r]) => (O.get(r * COLS + c) && O.get(r * COLS + c) !== l) || (Math.round(st.h.c) === c && Math.round(st.h.r) === r);
      while (k > 0 && busy(l.rail[k])) k--;
      const [c, r] = l.rail[k]; return { c, r, k };
    }
    function giveBack(l) {
      const to = l.rail ? railBack(l) : l.from;
      l.state = 'flying'; l.to = l.rail ? [to.c, to.r] : to; l.touched = st.t;
    }
    function steal(a, l) {
      for (const s of slots) if (s.by === l) s.by = null;
      l.from = l.cell.slice(); l.state = 'carried'; a.carry = l; a.target = null; a.job = 'back'; occ = null; walkG = null;
      say('!', a.id, 0.8); hint('bug took the ' + l.ch + ' – quack ahead of him', 3);
    }
    function hoard(a) {
      const l = a.carry, n = st.letters.filter((x) => x.state === 'den').length;
      a.carry = null; l.state = 'den'; l.z = 0;
      l.x = (a.den[0] + 0.5 + ((n % 4) - 1.5) * 1.3) * 8; l.y = (a.den[1] + 0.5 + Math.floor(n / 4) * 0.5) * 16;
      hint('the ' + l.ch + ' is in bug\'s den – quack there to get it back', 3.4);
    }
    function thief(a, dt) {
      const B = p.bug || {}, den = a.den, LS = lights();
      const run = (to, k = 1) => {
        const dx = to[0] - a.c, dy = (to[1] - a.r) * 3.6, d = Math.hypot(dx, dy); if (d < 0.6) return true;
        const v = Math.min(d, (B.speed || THIEF.speed) * k * dt); a.c += (dx / d) * v; a.r += (dy / d) * v / 3.6;
        if (Math.abs(dx) > 0.3) a.flip = dx > 0; a.moving = true; a.pose = 'run'; return false;
      };
      a.moving = false;
      if (a.carry) { const l = a.carry; l.x = (a.c + 0.5) * 8 + (a.flip ? 8 : -8); l.y = (a.r + 0.5) * 16 - 2; l.z = 6; }
      if (st.t - a.skid < 1.2) { a.pose = 'scared'; return; }
      if (litIn(LS, (den[0] + 0.5) * 8, (den[1] + 0.5) * 16)) {
        if (a.carry || a.job === 'go') { a.job = 'back'; a.target = null; }
        if (run(den, 0.6)) { if (a.carry) hoard(a); if (a.job !== 'sleep') { a.job = 'sleep'; say('zzz', a.id, 3); st.flags.asleep = true; } a.pose = 'calm'; }
        return;
      }
      if (a.job === 'go') {
        const l = a.target;
        if (!stealable(l) || litIn(LS, l.x, l.y) || guarded(l)) { a.target = null; a.job = 'back'; return; }
        if (run([l.x / 8 - 0.5, l.y / 16 - 0.5])) steal(a, l);
        return;
      }
      if (a.job === 'back') { if (run(den)) { if (a.carry) hoard(a); a.job = 'home'; a.rest = st.t; } return; }
      a.pose = 'calm'; a.job = 'home';
      if (st.t - a.rest < (B.every || THIEF.every)) return;
      a.rest = st.t;
      let best = null, bd = B.reach || THIEF.reach;
      for (const l of st.letters) { if (!stealable(l) || litIn(LS, l.x, l.y) || guarded(l)) continue; const d = Math.hypot(l.x / 8 - den[0], (l.y / 16 - den[1]) * 3.6); if (d < bd) { bd = d; best = l; } }
      if (best) { a.target = best; a.job = 'go'; }
    }
    // the digit Bug drops (p.bug.drops): a loose letter of no word, until Harold walks over it
    const digitAt = (ch, x, y) => ({ ch, word: 'digit', j: 0, x, y, z: 0, vx: 0, vy: 0, vz: 0, home: [-9, -9], cell: [0, 0], state: 'loose', touched: st.t, digit: true, reveal: 0 });
    const bugAhead = (b, k) => { const hx = st.h.c - b.c, hy = (st.h.r - b.r) * 3.6, d = Math.hypot(hx, hy), dir = b.flip ? 1 : -1; return d < k && hx * dir > 0; };
    // ── events by the room's clock
    function fire(ev) {
      switch (ev.do) {
        case 'say': say(ev.text, ev.who, ev.for || 2.4); break;
        case 'counter': st.counter = ev.text; st.jam = !!ev.jam; break;
        case 'flag': st.flags[ev.set] = true; break;
        // the book's scenes: who is there, who poofs into a cat, who blushes, who dances, who walks where
        case 'hide': case 'show': for (const a of st.cast) if (a.id === ev.who || a.who === ev.who) { a.gone = ev.do === 'hide'; if (ev.at) { a.c = ev.at[0]; a.r = ev.at[1]; } } break;
        case 'poof': for (const a of st.cast) if (a.id === ev.who) { a.cat = !a.cat; a.poofT = st.t; if (window.WK_SOUND && !o.demo) (a.cat ? WK_SOUND.wizard() : WK_SOUND.poof()); } break;
        case 'blush': for (const a of st.cast) if (a.id === ev.who) a.blush = st.t + (ev.for || 2.5); break;
        case 'perceive': for (const a of st.cast) if (a.id === ev.who) perceive(a); break;
        case 'dance': for (const a of st.cast) if (a.id === ev.who) { a.gone = false; if (ev.at) { a.c = ev.at[0]; a.r = ev.at[1]; } a.dance = st.t + (ev.for || 4); if (ev.then) { a.thenRoute = ev.then; } } break;
        case 'walk': for (const a of st.cast) if (a.id === ev.who) { a.route = [[a.c, a.r], ...ev.to]; a.speed = ev.speed || 22; a.u = 0; a.loop = false; a.vanish = !!ev.vanish; a.stopAtEnd = !ev.vanish; } break;
        case 'appear': { const a = st.cast.find((x) => x.id === ev.who); if (a) { a.gone = false; a.grab = ev.grab || null; if (ev.route) { a.route = ev.route; a.speed = ev.speed || 30; a.u = 0; a.loop = !!ev.loop; a.vanish = !ev.loop; } } break; }
        case 'pull':
          for (const l of st.letters) if ((ev.words || []).includes(l.word)) { l.state = 'pulled'; l.to = ev.to; l.touched = st.t + (hash(l.j, 3, 9) - 0.5) * 0.6; l.z = 4; }
          for (const a of st.cast) if ((ev.who || []).includes(a.id)) { a.pull = ev.to; a.pt = st.t; }
          if (ev.set) st.flags[ev.set] = true;
          break;
      }
    }
    // ── the demo: the room played by a script of walks, waits and presses
    function demoInput() {
      const S = demo.script || [], inp = { x: 0, y: 0, a: false, b: false }, next = () => { script.i++; script.t0 = st.t; script.best = 1e9; script.since = st.t; };
      for (let guard = 0; guard < 8 && script.i < S.length; guard++) {
        const s = S[script.i];
        if (s.wait != null) { if (st.t - script.t0 >= s.wait) { next(); continue; } return inp; }
        if (s.a || s.b) { inp.a = !!s.a; inp.b = !!s.b; next(); return inp; }
        if (s.until) { if (st.flags[s.until] || st.t - script.t0 > (s.giveUp || 12)) { next(); continue; } return inp; }
        if (s.aWhen) { const b = st.cast.find((x) => x.who === 'bug' && !x.gone); if (b && bugAhead(b, s.within || 30)) { inp.a = true; next(); } if (st.t - script.t0 > (s.giveUp || 6)) next(); return inp; }
        if (s.goTo) { const l = st.letters.find((x) => x.digit && x.state !== 'gone'); if (!l) { if (st.flags.digit || st.t - script.t0 > 4) next(); else return inp; continue; } s.go = null; s._to = [l.x / 8 - 0.5, l.y / 16 - 0.5]; }
        if (s.go || s._to) {
          const g2 = s.go || s._to, a = st.as === 'malifex' ? mal() : st.h, dx = g2[0] - a.c, dy = (g2[1] - a.r) * 3.6, d = Math.hypot(dx, dy);
          if (d < 0.5) { next(); continue; }
          if (d < script.best - 0.3) { script.best = d; script.since = st.t; } else if (st.t - script.since > 1.2) { next(); continue; }   // stuck: give up on it
          inp.x = dx / d; inp.y = dy / d; if (d < 2) { inp.x *= d / 2; inp.y *= d / 2; inp.x = Math.sign(inp.x) * Math.max(0.2, Math.abs(inp.x)); }
          return inp;
        }
        next();
      }
      return inp;
    }
    function step(dt, input) {
      st.t += dt;
      const inp = input || (o.demo ? demoInput() : { x: 0, y: 0 });
      for (let k = 0; k < (p.events || []).length; k++) if (!st.fired.has(k) && st.t >= p.events[k].at) { st.fired.add(k); fire(p.events[k]); }
      // played as Malifex when he goes (hidden, pulled, walked off): Harold again – A gave orders from no one (and threw
      // with two uniclones there), and B couldn't switch back without him
      if (st.as === 'malifex' && !mal()) st.as = 'harold';
      if (inp.b && !st.bWas) toggle();
      if (inp.a && !st.aWas) act();
      st.aWas = !!inp.a; st.bWas = !!inp.b;
      const M = mal(), who = st.as === 'malifex' && M ? M : st.h;
      if (!st.h.gone) move(who, inp.x || 0, inp.y || 0, dt);
      if (who !== st.h) st.h.moving = false;
      for (const a of st.cast) { perceived(a); if (a !== who) stepCast(a, dt); }
      // rings: everything they reach comes loose; Bug skids if one meets him head on
      for (const R of st.rings) {
        const front = Math.min((st.t - R.t0) * R.speed, R.reach); if ((st.t - R.t0) * R.speed > R.reach + 40) continue;
        st.letters.forEach((l, i) => { if (!R.hit.has(i) && Math.hypot(l.x - R.x, (l.y - R.y) * GR) <= front) { R.hit.add(i); loosen(l, R, i); } });
        for (const b of st.cast) if (b.who === 'bug' && !b.gone && !R.bug && (b.route || b.steals) && Math.hypot((b.c + 0.5) * 8 - R.x, ((b.r + 0.5) * 16 - R.y) * GR) <= front) {
          R.bug = true;
          if (b.steals && !b.carry && b.job !== 'go') continue;   // at home (or asleep): the quack is for his den
          if (bugAhead(b, 40)) {
            b.skid = st.t; say('yip!', b.id, 1.2); if (window.WK_SOUND && !o.demo) WK_SOUND.yip();
            if (b.steals) { const l = b.carry; b.carry = null; b.target = null; b.job = 'back'; if (l) { giveBack(l); hint('he dropped the ' + l.ch, 2); } continue; }
            if (p.bug && p.bug.drops && !st.flags.dropped) { st.flags.dropped = true; st.letters.push(Object.assign(digitAt(p.bug.drops, (b.c + 0.5) * 8, (b.r + 0.5) * 16), { z: 10, vx: (b.flip ? -1 : 1) * 24, vz: 90 })); hint('he dropped the counter\'s ' + p.bug.drops); }
          } else hint('too late – quack ahead of him');
        }
        // a quack that reaches Mishka: his next hum ends in a mew (lib/world.js reads st.mewNext)
        if (!R.mishka) for (const m of st.cast) if (m.who === 'mishka' && !m.gone && Math.hypot((m.c + 0.5) * 8 - R.x, ((m.r + 0.5) * 16 - R.y) * GR) <= front) { R.mishka = true; st.mewNext = true; }
        // a quack that reaches Malifex (once he's met Harold): perceived
        const M = mal(); if (M && st.flags.met && st.as !== 'malifex' && !R.mal && Math.hypot((M.c + 0.5) * 8 - R.x, ((M.r + 0.5) * 16 - R.y) * GR) <= front) { R.mal = true; perceive(M); }
      }
      st.rings = st.rings.filter((R) => st.t - R.t0 < 2.5);
      const pushers = [st.h, ...st.cast.filter((a) => a.moving && !a.gone && !a.pull)].filter((a) => a.moving && !a.gone);
      let settled = false;
      st.letters.forEach((l, i) => { if (stepLetter(l, i, dt, pushers)) settled = true; });
      if (settled) words2();
      // the digit: harold picks it up when he walks over it
      for (const l of st.letters) if (l.digit && l.state !== 'gone' && Math.abs(l.x - (st.h.c + 0.5) * 8) < 16 && Math.abs(l.y - (st.h.r + 0.5) * 16) < 12) { l.state = 'gone'; st.flags.digit = true; st.flags.solved = true; hint('the counter\'s ' + l.ch + ' – the way on is open'); }
      // malifex reads what is written in the background's colour, near him
      const m = mal();
      for (const l of st.letters) if (l.hidden) { const d = m && st.as === 'malifex' ? Math.hypot((l.x - (m.c + 0.5) * 8) / 8, (l.y - (m.r + 0.5) * 16) / 16 * 2.2) : 1e9; l.reveal = d < 14 ? 2 : d < 22 ? 1 : 0; if (l.reveal) st.flags.read = true; }
      st.sayings = st.sayings.filter((s) => s.till > st.t);
    }
    function outline() {
      if (st.as === 'malifex') return null;
      for (const e of p.exits || []) if (e.press && nearBox(st.h, e.cells, 6) && exitOk(e)) return e.target || null;
      let best = null, bd = RING.reach;
      for (const l of st.letters) if (l.on && (l.state === 'settled') && l.cell[0] === l.home[0] && l.cell[1] === l.home[1]) { const d = Math.hypot(l.x - (st.h.c + 0.5) * 8, (l.y - (st.h.r + 1) * 16 + 20) * GR); if (d < bd) { bd = d; best = l.on; } }
      return best;
    }
    function state() {
      const t = st.t, h = st.h, ft = Math.floor(t * 12) / 12;
      const pos = (a) => ({ x: (a.c + 0.5) * 8, y: (a.r + 1) * 16 });
      const sayings = st.sayings.map((s) => { const a = s.who === 'harold' ? h : st.cast.find((x) => x.id === s.who || x.who === s.who); const P2 = a ? pos(a) : { x: 640, y: 360 }; return { text: s.text, x: P2.x, y: P2.y - (a && a.who === 'malifex' ? 128 : 72) }; });
      return {
        t, harold: { ...pos(h), c: h.c, r: h.r, flip: h.flip, moving: h.moving, vx: h.vx, vy: h.vy, gone: h.gone, pose: h.moving ? 'walk' : 'idle' },
        cast: st.cast.map((a) => ({ who: a.cat ? 'malicat' : a.who, id: a.id, ...pos(a), flip: a.flip, pose: a.cat ? 'idle' : a.blush > t ? 'blush' : a.pose, moving: a.moving, vx: a.vx, vy: a.vy, gone: a.gone, poofT: a.poofT, hold: a.hold, eats: a.eats })),
        letters: st.letters.map((l) => ({ ch: l.ch, x: l.x, y: l.y, z: l.z, state: l.state, voice: l.voice, hidden: l.hidden, wall: l.wall, reveal: l.reveal, on: l.on, rail: l.rail, ri: l.ri,
          ang: l.state === 'loose' || l.state === 'pulled' ? Math.sin(ft * 6 + l.j * 1.7) * 0.32 * Math.min(1, Math.hypot(l.vx || 0, l.vy || 0) / 30 + (l.z > 0 ? 1 : 0.15)) : 0 })),
        rings: st.rings, becomes: st.becomes.map((b) => ({ ...b, age: t - b.t })), say: sayings, open: st.open, solved: !!st.flags.solved, as: st.as,
        hint: st.hintTill > t ? st.hint : null, outline: outline(), counter: st.counter, jam: st.jam, walkState: walkState(), exit: st.exit, flags: st.flags,
      };
    }
    reset();
    return { step, state, reset, get t() { return st.t; }, get exit() { return st.exit; }, clearExit() { st.exit = null; },
      // the world's hooks: is a cell walkable, fire an event now, take harold over from next door or hand him on
      walkable: (c, r) => walkable(Math.round(c), Math.round(r)), fire, say,
      // a save, a jump or the next area's seam may land him inside something solid (a rock's footprint): he goes to
      // the nearest cell he can stand on instead, so he's never stuck
      take(c, r, flip) { const [c2, r2] = openNear(c, r); st.h.c = c2; st.h.r = r2; st.h.flip = flip; st.h.gone = false; st.cross = null; },
      leave() { st.h.gone = true; st.h.moving = false; st.cross = null; },
      // what the area remembers when it's unloaded or saved: flags, open doors, every letter where it lies, the words
      // that became things, and the cast where they stand (lib/world.js keeps it on the area and in the save)
      snapshot() {
        return { flags: { ...st.flags }, open: [...st.open], quacks: st.quacks || 0,
          // only the letters that moved, so a save code stays short: [index, column, row, state, place on its track]
          letters: st.letters.filter((l) => !l.digit).map((l, k) => (l.cell[0] !== l.home[0] || l.cell[1] !== l.home[1] || l.state === 'word' || (l.rail && l.ri > 0)
            ? [k, l.cell[0], l.cell[1], l.state === 'den' || l.state === 'carried' || l.state === 'flying' ? 'settled' : l.state, l.rail ? l.ri : -1] : null)).filter(Boolean),
          becomes: st.becomes.map((b) => ({ text: b.text, at: b.at, dir: b.dir, letters: b.letters })),
          // the digit Bug dropped and Harold hasn't picked up yet: `dropped` alone, it would never come back
          digit: st.letters.filter((l) => l.digit && l.state !== 'gone').map((l) => [l.ch, Math.round(l.x), Math.round(l.y)])[0] || null,
          cast: st.cast.map((a) => ({ id: a.id, c: +a.c.toFixed(2), r: +a.r.toFixed(2), gone: !!a.gone, order: a.order || null, flip: !!a.flip, route: a.route || null, speed: a.speed || 0, loop: a.loop !== false, u: a.u || 0, cat: !!a.cat })) };
      },
      restore(m) {
        if (!m) return;
        Object.assign(st.flags, m.flags || {}); for (const id of m.open || []) st.open.add(id); st.quacks = m.quacks || 0;
        const base = st.letters.filter((l) => !l.digit);
        for (const [k, c, r, state, ri] of m.letters || []) {
          const l = base[k]; if (!l) continue;
          // a loose letter is put down where it lay, settled; one still in the air lands
          l.cell = [c, r]; l.x = (c + 0.5) * 8; l.y = (r + 0.5) * 16; l.z = 0; l.vx = l.vy = l.vz = 0;
          l.state = state === 'loose' || state === 'settling' ? 'settled' : state; if (l.rail && ri >= 0) l.ri = ri;
        }
        for (const b of m.becomes || []) st.becomes.push({ ...b, t: -99, thing: sc.thing(b.text, b.at, b.dir) });
        if (m.digit && !st.letters.some((l) => l.digit)) st.letters.push(digitAt(...m.digit));
        for (const s0 of m.cast || []) { const a = st.cast.find((x) => x.id === s0.id); if (a) Object.assign(a, { c: s0.c, r: s0.r, gone: s0.gone, order: s0.order || undefined, flip: s0.flip, route: s0.route, speed: s0.speed, loop: s0.loop, u: s0.u, cat: s0.cat }); }   // (Bug keeps running his loop)
        for (const s2 of slots) s2.by = st.letters.find((l) => l.state === 'settled' && l.cell[0] === s2.c && l.cell[1] === s2.r && l.ch === s2.ch) || null;
        occ = null; walkG = null;
      },
      get cross() { return st.cross; }, get here() { return !st.h.gone; },
      set demo(v) { o.demo = v; }, get demo() { return o.demo; }, loop: demo.loop || 8, enterAt(c, r, flip) { st.h.c = c; st.h.r = r; st.h.flip = flip; }, st: () => st };
  }

  // ── the compose card: the room's demo at any time t, replayed from its start (deterministic, so ?shot matches)
  function attach(sc, o = {}) {
    let S = null, tt = 0;
    const L = ((sc.place.demo || {}).loop) || 8;
    sc.at = (t) => {
      if (!sc.ready()) { if (!S) S = sim(sc, { demo: true }); return S.state(); }
      const lt = ((t % L) + L) % L;
      if (!S || S.pending === undefined || lt < tt - 1e-6) { S = sim(sc, { demo: true, script: o.script }); S.pending = 0; tt = 0; }
      while (tt < lt - 1e-9) { const d = Math.min(DT, lt - tt); S.step(d); tt += d; }
      return S.state();
    };
    return sc;
  }

  // ── bake a room in slices: build (paint every op), prepare each canvas, bake each wind step, bake the cast, the far page
  const castOf = (p) => ['harold', ...new Set((p.actors || []).map((a) => a.who).filter((w) => w !== 'harold'))];
  function* bakeSteps(W, place, tier) {
    let sc = null;
    yield ['build', () => { sc = PL.build(place, { tier }); }];
    for (const cv of sc.canvases()) yield ['prep', () => cv.prepare(W)];
    for (const cv of sc.canvases()) { let more = true; while (more) yield ['bake', () => { more = cv.bakeOne(W, 6); }]; }
    yield ['bake', () => { WK_LAYERS.farImage(W, sc); }];
    if (window.WK_ACTORS) for (const [who, pose, fl, f] of WK_ACTORS.pending(castOf(place), W)) yield ['cast', () => { WK_ACTORS.sprite(W, who, pose, fl, f); }];
    return sc;
  }
  function job(W, place, tier) {
    return { gen: bakeSteps(W, place, tier), task: null, done: false, sc: null, rec: { name: place.place + ' ' + place.name, build: 0, prep: 0, bake: 0, cast: 0, frames: 0, worst: 0, t0: performance.now(), wall: 0 } };
  }
  // run a job for up to `budget` ms of this frame; a task the font isn't ready for returns false and waits a frame
  function run(J, budget) {
    const t0 = performance.now();
    while (!J.done && performance.now() - t0 < budget) {
      if (!J.task) { const n = J.gen.next(); if (n.done) { J.done = true; J.sc = n.value; J.rec.wall = performance.now() - J.rec.t0; break; } J.task = n.value; }
      const [kind, fn] = J.task, a = performance.now(), r = fn();
      J.rec[kind] += performance.now() - a;
      if (r === false) break;
      J.task = null;
    }
    const d = performance.now() - t0; J.rec.frames++; J.rec.worst = Math.max(J.rec.worst, d);
    return J.done;
  }
  const ready = (W) => W.fontReady() && document.fonts.check('16px VT323') && document.fonts.check('12px VT323');

  // ── a playable card
  function card(cfg = {}) {
    const q = new URLSearchParams(location.search), base = cfg.base || '../../', tier = q.get('tier') || undefined;
    const W = Webkeeper.screen(document.getElementById('c'), { cell: 16 }), P = Webkeeper.P;
    const SHOT = q.has('shot'), names = q.get('room') ? [q.get('room')] : cfg.rooms, single = names.length === 1;
    const files = {}, stats = (window.__wkRoom = { rooms: [], draw: [] });
    let cur = null, J = null, tr = null, err = null, demoMode = !q.has('play'), loaded = false;
    WK_LAYERS.off(W);
    Promise.all(names.map((n) => PL.load(base + 'places/' + n + '.json').then((p) => { files[n] = p; }))).then(() => { loaded = true; }).catch((e) => { err = String(e.message || e); });
    const idxOf = (id) => names.findIndex((n) => n.startsWith(id + '-') || n === id);
    function begin(name, from) {
      J = job(W, files[name], tier); J.name = name; J.from = from;
    }
    function enter() {
      const sc = J.sc, s = sim(sc, { demo: demoMode, script: cfg.script });
      stats.rooms.push(J.rec);
      // walking in from a room next door: stand just inside the exit that leads back to it
      if (J.from && !demoMode) {
        const e = (sc.place.exits || []).find((x) => x.to === J.from.place) || null;
        if (e && e.edge) { const [a, b] = e.rows || e.cols, m = (a + b) / 2; s.enterAt(e.edge === 'west' ? 2 : e.edge === 'east' ? COLS - 3 : m, e.edge === 'north' ? 2 : e.edge === 'south' ? ROWS - 2 : m, e.edge === 'west'); }
      }
      cur = { name: J.name, sc, sim: s }; J = null; window.__wkCur = cur;
    }
    // ── input: keys, a gamepad-like touch stick on the left half, A and B on the right
    const keys = new Set(); let touch = null, tapA = false, tapB = false;
    const wake = () => { if (demoMode) { demoMode = false; if (cur) cur.sim.demo = false; } };
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase(); if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (k === 'r' && cur) { cur.sim.reset(); return; }
      keys.add(k); wake();
    });
    addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    W.canvas.addEventListener('pointerdown', (e) => {
      const p = W.toLocal(e); wake();
      if (p.x < 640) touch = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y };
      else if (p.y < 420) tapB = true; else tapA = true;
    });
    W.canvas.addEventListener('pointermove', (e) => { if (touch && e.pointerId === touch.id) { const p = W.toLocal(e); touch.x = p.x; touch.y = p.y; } });
    addEventListener('pointerup', (e) => { if (touch && e.pointerId === touch.id) touch = null; });
    function input() {
      let x = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
      let y = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0);
      if (touch) { const dx = touch.x - touch.x0, dy = (touch.y - touch.y0) * GR, d = Math.hypot(dx, dy); if (d > 10) { x = dx / Math.max(d, 50); y = dy / Math.max(d, 50); } }
      const a = keys.has(' ') || keys.has('j') || tapA, b = keys.has('shift') || keys.has('k') || tapB;
      return { x, y, a, b };
    }
    // ── the room change: this room slides out in eight steps while the next is built and baked; it slides in once baked
    function startChange(ex) {
      const i = names.indexOf(cur.name), id = ex && ex.to, k = id ? idxOf(id) : -1;
      const next = k >= 0 ? names[k] : names[(i + 1) % names.length];
      const snap = document.createElement('canvas'); snap.width = W.canvas.width; snap.height = W.canvas.height; snap.getContext('2d').drawImage(W.canvas, 0, 0);
      const dir = ex && ex.edge ? DIRS[ex.edge] : [1, 0];
      tr = { snap, dir, k: 0, acc: 0, phase: 'out', from: cur.sc.place };
      begin(next, cur.sc.place); cur = null;
    }
    const night = () => { W.clear(); for (let k = 0; k < 90; k++) { const h = hash(k, 2, 5); if (h < 0.5) W.loose(hash(k, 1, 5) * 1280, hash(k, 3, 5) * 720, h < 0.1 ? '+' : '.', P.tealUp, 0, 12); } };
    function drawChange(dt) {
      tr.acc += dt;
      while (tr.acc >= 1 / 12) { tr.acc -= 1 / 12; if (tr.phase === 'out') { tr.k++; if (tr.k >= 8) tr.phase = 'wait'; } else if (tr.phase === 'in') { tr.k--; if (tr.k <= 0) { tr = null; return; } } }
      if (tr.phase === 'wait' && J && J.done && !tr.into) {
        enter();
        const off = Webkeeper.screen(document.createElement('canvas'), { cell: 16 });
        WK_LAYERS.draw(off, cur.sc, 0, { state: cur.sim.state() });
        tr.into = off.canvas; tr.phase = 'in'; tr.k = 8; cur.hold = true;
      }
      night();
      const f = tr.phase === 'out' ? tr.k / 8 : tr.phase === 'in' ? tr.k / 8 : 1;
      W.reset();
      if (tr.phase === 'out') W.g.drawImage(tr.snap, -tr.dir[0] * 1280 * f, -tr.dir[1] * 720 * f, 1280, 720);
      if (tr.phase === 'in' && tr.into) W.g.drawImage(tr.into, tr.dir[0] * 1280 * f, tr.dir[1] * 720 * f, 1280, 720);
      if (tr.phase === 'wait') { const s = 'the page loads' + '.'.repeat(1 + (Math.floor(performance.now() / 300) % 3)); W.ink(80 - 9, 22, 20, 1); W.text(80 - 8, 22, s, P.beigeDim); }
    }
    function hud() {
      const s = demoMode ? ' demo · press a key or tap to play ' : ' arrows / drag: walk · space / tap right: quack · shift / tap top right: malifex · r: restart ';
      W.ink(Math.max(0, 80 - Math.ceil(s.length / 2)), 44, s.length, 1); W.text(Math.max(0, 80 - Math.ceil(s.length / 2)), 44, s, P.beigeDim);
      if (q.has('ms') && window.__wkMs) { const m = window.__wkMs.toFixed(1) + ' ms'; W.ink(158 - m.length, 0, m.length + 2, 1); W.text(159 - m.length, 0, m, P.beigeDim); }
    }
    let shotT = null;
    function frame(dt) {
      if (err) { W.clear(); W.text(2, 2, 'could not load the rooms – ' + err, P.red); return; }
      if (!loaded || !ready(W)) { W.clear(); W.text(2, 2, 'loading the rooms', P.beigeDim); return; }
      if (!cur && !J && !tr) begin(names[0], null);
      if (J && !J.done) run(J, SHOT ? 1e9 : tr ? 7 : 1e9);
      if (tr) { drawChange(dt); return; }
      if (!cur) { if (J && J.done) enter(); else { W.clear(); W.text(2, 2, 'baking ' + (J ? J.rec.name : ''), P.beigeDim); return; } }
      const s = cur.sim;
      if (SHOT) { const T = shotT ?? 0; if (Math.abs(s.t - T) > 1e-6) { if (s.t > T) s.reset(); while (s.t < T - 1e-9) s.step(Math.min(DT, T - s.t)); } window.__shotAt = s.t; }
      else {
        cur.acc = (cur.acc || 0) + dt;
        while (cur.acc >= DT) { s.step(DT, demoMode ? null : input()); cur.acc -= DT; tapA = false; tapB = false; }
      }
      const a = performance.now();
      WK_LAYERS.draw(W, cur.sc, s.t, { state: s.state(), cache: !SHOT });
      const d = performance.now() - a; stats.draw.push(d); if (stats.draw.length > 600) stats.draw.shift();
      window.__wkMs = window.__wkMs ? window.__wkMs * 0.95 + d * 0.05 : d;
      hud();
      if (SHOT) return;
      // the room's way on: change room; in a demo, when its loop is over
      if (s.exit) { if (single) s.clearExit(); else startChange(s.exit); return; }
      if (demoMode && s.t >= s.loop) { if (single) s.reset(); else startChange(null); }
    }
    if (SHOT) {
      // ?shot&t=: the preview host can replace a t= with its own, so ?at= is read too (the last number wins)
      const tv = [...q.getAll('t'), ...q.getAll('at')].map(Number).filter(Number.isFinite); shotT = tv.length ? tv[tv.length - 1] : 0;
      window.__frame = (t) => { if (Number.isFinite(+t)) shotT = +t; frame(0); return !!cur; };
      // until the room is baked, then replay its demo from the start to t (the ?shot&t= hook), and a few times more
      let n = 0;
      const iv = setInterval(() => { if (cur && cur.sc.ready()) { if (!n) cur.sim.reset(); frame(0); if (++n > 6) { clearInterval(iv); window.__ready = true; } } else frame(0); }, 150);
      return { W };
    }
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!Webkeeper.visible()) return;
      frame(dt);
    };
    requestAnimationFrame(loop);
    return { W, get room() { return cur; } };
  }

  // ── bake time and draw time, separately, for every room: build + prepare + bake in slices, then 8 s of play at
  // 60 frames a second (every fifth frame a step of the world: layers 0–3 and the air redrawn; the rest stamped)
  async function bench(W, names, o = {}) {
    const base = o.base || '../../', out = [], mc = new MessageChannel(), q = [];
    mc.port1.onmessage = () => { const r = q.shift(); if (r) r(); };
    // yield to the browser between frames by a message (timers are clamped in a hidden frame; messages are not)
    const tick = () => new Promise((r) => { q.push(r); mc.port2.postMessage(0); });
    WK_LAYERS.off(W);
    window.__wkBenchAt = 'font';
    while (!ready(W)) await tick();
    const w0 = performance.now(); while (performance.now() - w0 < 400) await tick();
    window.__wkBenchAt = 'loading';
    for (const n of names) {
      const place = await PL.load(base + 'places/' + n + '.json'), J = job(W, place, o.tier), slices = [];
      window.__wkBenchAt = n + ' loaded';
      while (!J.done) { await tick(); const w0 = J.rec.build + J.rec.prep + J.rec.bake + J.rec.cast, a = performance.now(); run(J, 7); const d = performance.now() - a; if (J.rec.build + J.rec.prep + J.rec.bake + J.rec.cast > w0 + 0.01) slices.push(d); window.__wkBenchAt = n + ' baking ' + slices.length; }
      // the room change draws the room's first frame before it slides in; so does the bench, before it times anything
      { const s0 = sim(J.sc, { demo: true }); WK_LAYERS.draw(W, J.sc, 0, { state: s0.state(), cache: true }); WK_LAYERS.draw(W, J.sc, 0.001, { state: s0.state(), cache: true }); }
      const sc = J.sc, s = sim(sc, { demo: true }), b0 = window.__wkBakes || 0, step = [], stamp = [];
      for (let f = 0; f < 480; f++) {
        await tick();
        s.step(DT);
        const a = performance.now(); WK_LAYERS.draw(W, sc, s.t, { state: s.state(), cache: true }); const d = performance.now() - a;
        (f % 5 === 0 ? step : stamp).push(d);
        if (o.onFrame) o.onFrame(n, f);
      }
      const all = [...step, ...stamp].sort((x, y) => x - y), pc = (arr, k) => { const a2 = arr.slice().sort((x, y) => x - y); return a2[Math.min(a2.length - 1, Math.floor(a2.length * k))]; };
      const mean = (arr) => arr.reduce((x, y) => x + y, 0) / arr.length;
      const r = { room: place.place, name: place.name, build: J.rec.build, prep: J.rec.prep, bake: J.rec.bake, cast: J.rec.cast, total: J.rec.build + J.rec.prep + J.rec.bake + J.rec.cast, worstSlice: Math.max(...slices), slices: slices.length,
        mean: mean(all), p90: pc(all, 0.9), worst: all[all.length - 1], stepMean: mean(step), stepWorst: Math.max(...step), stampMean: mean(stamp), bakesInPlay: (window.__wkBakes || 0) - b0, checks: (() => { const c = PL.check(sc); return c.filter((x) => x.ok).length + '/' + c.length; })() };
      out.push(r); if (o.onRoom) o.onRoom(r, out);
    }
    window.__wkRoomBench = out;
    return out;
  }

  window.WK_ROOM = { sim, attach, card, bench, job, run, SPEED, RING };
})();
