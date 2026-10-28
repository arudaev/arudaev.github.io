// uniclones.js – the UNIClones: two small unicorns in mortarboard caps (the horn comes up through
// the board, a tassel hangs off it) and burgundy blazers. Like everyone, first a sprite you could
// type – 4 rows × 9 cells – then the same come loose for close-ups. The rainbow comes out of the
// horn, six stacked bands in blocky steps. Loaded after cast.js and friends.js.
(function () {
  const C = WK_CAST, F = WK_FRIENDS, P = C.P, loop4 = C.loop4;
  const UNI = ['   ,=/=  ', ' ,_/o >  ', ' (####)  ', '  "  "   '];
  const UNI_MAP = ['   rdbd  ', ' bbbbbb  ', ' uuuuuu  ', '  d  d   '];
  // mirror a sprite to face the other way
  const SWAP = { '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<', '[': ']', ']': '[', '{': '}', '}': '{' };
  const flip = (rows) => { const w = Math.max(...rows.map((r) => r.length)); return rows.map((r) => [...r.padEnd(w)].reverse().map((c) => SWAP[c] || c).join('')); };
  const flipMap = (map) => { const w = Math.max(...map.map((r) => r.length)); return map.map((r) => [...r.padEnd(w)].reverse().join('')); };
  // one unicorn: feet centred on (x, y) px. o.left faces left; o.talk opens the muzzle in steps
  function uniclone(W, x, y, t, o = {}) {
    const rows = UNI.slice();
    if (o.talk && Math.floor(loop4(t) * 8) % 2) rows[1] = ' ,_/o D  ';
    F.sprite(W, x, y, o.left ? flip(rows) : rows, o.left ? flipMap(UNI_MAP) : UNI_MAP, { s: o.s || 1 });
  }
  // where the horn's tip is, in px, for a unicorn drawn at (x, y)
  function hornTip(W, x, y, o = {}) {
    const s = o.s || 1, w = 9, col = o.left ? w - 1 - 5 : 5;
    const left = s === 1 ? Math.round(x / W.cw - w / 2) * W.cw : x - w * W.cw * s / 2;
    return [left + (col + (o.left ? 0 : 1)) * W.cw * s, y - 4 * W.ch * s];
  }
  // the rainbow out of the horn: six stacked bands, stepping up and down every four cells,
  // flying out over 0.8 s, holding, then breaking up cell by cell. age in seconds; dir 1 or -1
  function rainbow(W, tipX, tipY, age, maxCols = 26, dir = 1) {
    if (age < 0 || age >= 3) return;
    const reach = Math.min(age / 0.8, 1) * maxCols, fade = age > 2.2 ? 1 - (age - 2.2) / 0.8 : 1;
    const c0 = Math.round(tipX / W.cw), r0 = Math.round(tipY / W.ch) - 3;
    for (let k = 0; k <= reach; k++) {
      const step = Math.floor(k / 4) % 2, c = c0 + k * dir;
      W.RAINBOW.forEach((col, band) => {
        if (fade < 1 && Webkeeper.hash(c, band, 9) > fade) return;
        const r = r0 + band + step;
        W.ink(c, r); W.put(c, r, '█', col);
      });
    }
  }
  // up close, facing left (towards Harold): the cap and horn, the long face, the blazer
  const CLOSE = [
    "          \\            ",
    "      ======\\======,   ",
    "         \\_______/  |   ",
    "      _.-'       '. *   ",
    "    .'   (o)       \\    ",
    "   <  ,             |   ",
    "    '-'.___.-.      /   ",
    "             (##########)",
    "              \"  \"  \"  \" ",
  ];
  const CLOSE_MAP = F.paint(CLOSE, 'bddbbbbud', {}, { 1: { '\\': 'b', ',': 'r' }, 2: { '|': 'r' }, 3: { '*': 'r' }, 4: { o: 'b' } });
  function close(W, x, y, t, o = {}) {
    const rows = CLOSE.slice();
    if (o.talk) rows[5] = '   <  o             |   ';
    F.loose(W, x, y, rows, CLOSE_MAP, { s: o.s || 3, seed: 21, oy: C.breathe(t) });
  }
  // they take turns: one says something, the other corrects him
  const BANTER = [
    ['i am the original.', 'technically, we both are.'],
    ['the rainbow comes out of the horn.', 'the front of the horn.'],
  ];
  window.WK_UNICLONES = { UNI, UNI_MAP, flip, uniclone, hornTip, rainbow, close, BANTER };
})();
