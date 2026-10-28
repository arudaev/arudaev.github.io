// Mishka in the world: the knitted bear from the key art (design/couch-games/06-CAST.md#mishka, decided 28 October) –
// lib/cast/mishka.js in its 'felt' style, at the key art's size, about twice Harold's height. This file keeps his
// hum: when it started and whether it ends in a mew. lib/layers.js draws him through here instead of a grid sprite.
// (Until 28 October this file drew the sketch's bear, fur as strokes in half-size cells.)
//   WK_BEAR.draw(W, x, y, t)   feet at (x, y) in the screen's px, t the area's clock
//   WK_BEAR.hum(t, meow)       start a hum at time t (meow: its last note a small cat face)
(() => {
  const S = { humT: -99, meow: false };
  // the hum lasts five notes of 0.35 s and its notes take 1.8 s to rise away (lib/cast/mishka.js)
  const HUM_END = 5 * 0.35 + 1.8, SCALE = 16 * 2.3;
  function draw(W, x, y, t) {
    if (!window.WK_MISHKA) return;
    const a = t - S.humT;
    WK_MISHKA.mishka(W, x, y, t, { style: 'felt', scale: SCALE, hum: a >= 0 && a < HUM_END ? a : -1, meow: S.meow });
  }
  window.WK_BEAR = { draw, hum(t, meow = false) { S.humT = t; S.meow = meow; }, get humming() { return S.humT; } };
})();
