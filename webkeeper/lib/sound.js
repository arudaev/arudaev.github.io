// sound.js – Webkeeper's sound, all synthesized (no files), like Voyager's lib/sound.
//
//   WK_SOUND.letter(ch)        a letter hops or settles: a soft wooden tock, pitched by its letter
//   WK_SOUND.word(text)        a word becomes its thing: its letters as a little tune, then a chord
//   WK_SOUND.quack()           Harold's quack (Voyager's: a nasal sawtooth that drops, pulsed twice)
//   WK_SOUND.yip()             Bug, quacked head on: a puppy's yip, up and down
//   WK_SOUND.meow(pitch)       a real cat's shy mew, one of two 8-bit samples (sounds/mew-1.wav, mew-2.wav): Mishka at the end of a hum (quacked at, or now and then on his own)
//   WK_SOUND.poof()            Malifex turning back from the cat
//   WK_SOUND.wizard()          the cat's spell: a robot voice's ba-la-la-la-la, gliding up and down
//   WK_SOUND.solved()          a puzzle solved (a scene's sound): the theme's first bar
//   WK_SOUND.theme()           Harold's theme: an 8-bar adventure march of our own, on NES-style voices (Patch dances to it)
//   WK_SOUND.hum(near)         Mishka hums: five notes, hummed (near: 0..1, how close Harold is)
//   WK_SOUND.on = false        mute (Voyager's sound setting on the couch: lib/host.js)
//   WK_SOUND.play = false      the effects wait (the title); Mishka's hum still plays
//
// Letters are notes on a pentatonic scale (A = C4, then D E G A, C5…, two octaves round), so any order of letters
// sounds pleasant and a word is a tune of its own: spelling is hearing.
(() => {
  const S = { ctx: null, master: null, on: true, play: true, last: 0, n: 0 };
  const PENTA = [0, 2, 4, 7, 9];
  const freqOf = (ch) => {
    const i = (String(ch).toUpperCase().charCodeAt(0) - 65 + 260) % 10;   // A..J, K..T, U..Z round two octaves
    return 261.63 * Math.pow(2, (PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12);
  };
  function ctx() {
    if (S.ctx) return S.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    S.ctx = new AC();
    S.master = S.ctx.createGain(); S.master.gain.value = 0.7; S.master.connect(S.ctx.destination);
    return S.ctx;
  }
  // browsers start sound only after a gesture: the first key or touch in the game wakes it
  const wake = () => { const c = ctx(); if (c && c.state === 'suspended') c.resume(); loadMew(); };
  for (const ev of ['keydown', 'pointerdown', 'touchstart']) addEventListener(ev, wake, { passive: true });
  const ready = () => S.on && ctx() && S.ctx.state === 'running';
  const fx = () => S.play && ready();   // the effects only while playing: the title's walk-about stays quiet

  // one voice: an oscillator through a low-pass, with an envelope (attack, decay), from now + at
  function voice(type, f0, f1, dur, vol, at = 0, o = {}) {
    const c = S.ctx, t = c.currentTime + at;
    const osc = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    osc.type = type; osc.frequency.setValueAtTime(f0, t); if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (o.vib) { const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = o.vib; lg.gain.value = f0 * 0.006; lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + 0.1); }
    lp.type = 'lowpass'; lp.frequency.value = o.lp || 2400; lp.Q.value = o.q || 0.7;
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp); lp.connect(g); g.connect(S.master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  // a short burst of filtered noise: the knock of wood
  function knock(f, vol, at = 0) {
    const c = S.ctx, t = c.currentTime + at, n = Math.floor(c.sampleRate * 0.03);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = f * 4; bp.Q.value = 3; g.gain.value = vol;
    src.connect(bp); bp.connect(g); g.connect(S.master); src.start(t);
  }

  // the NES's own voices: a pulse wave of a given duty (12.5 %, 25 %, 50 % – thin to round), its volume in the
  // chip's 16 steps, set once a frame (1/60 s) as it decays; vib: a vibrato that starts late, as NES leads did
  const PULSES = new Map();
  function pulseWave(duty) {
    if (!PULSES.has(duty)) {
      const N = 48, re = new Float32Array(N), im = new Float32Array(N);
      for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      PULSES.set(duty, S.ctx.createPeriodicWave(re, im, { disableNormalization: false }));
    }
    return PULSES.get(duty);
  }
  function chip(kind, f, dur, vol, at, o = {}) {
    const c = S.ctx, t = c.currentTime + at, osc = c.createOscillator(), g = c.createGain();
    if (kind === 'tri') osc.type = 'triangle'; else osc.setPeriodicWave(pulseWave(kind));
    osc.frequency.setValueAtTime(f, t);
    if (o.vib) for (let k = 0, fr = Math.round(dur * 60); k < fr; k++) if (k > 9) osc.frequency.setValueAtTime(f * (1 + Math.sin(k * 0.9) * 0.008), t + k / 60);
    if (o.wob) for (let k = 0, fr = Math.round(dur * 60); k <= fr; k++) osc.frequency.setValueAtTime(f * (1 + Math.sin(k * 1.3) * o.wob), t + k / 60);   // a fast wobble from the start
    const fr = Math.max(1, Math.round(dur * 60)), decay = o.decay ?? 0.5;
    for (let k = 0; k <= fr; k++) g.gain.setValueAtTime((Math.round(15 * (1 - (decay * k) / fr)) / 15) * vol, t + k / 60);
    g.gain.setValueAtTime(0, t + dur);
    osc.connect(g); g.connect(S.master); osc.start(t); osc.stop(t + dur + 0.02);
  }

  // the cat's spell, made once: a robot's ba-la-la-la-la – 0.95 s at 8 kHz, 8 bits. A buzz through two resonances held on
  // an "a", its pitch climbing from low to high and back in hard semitone steps (a robot's glide), and seven syllables:
  // each "l" a quick dip of the voice and of the first resonance. Built here, after the gesture, not from any recording
  let SPELL = null;
  function spellSample() {
    if (SPELL) return SPELL;
    const fs = 8000, n = Math.floor(fs * 0.95), buf = S.ctx.createBuffer(1, n, fs), d = buf.getChannelData(0);
    const res = () => ({ y1: 0, y2: 0 }), r1 = res(), r2 = res(), r3 = res();
    const step = (r, x, f, bw) => { const q = Math.exp(-Math.PI * bw / fs), b1 = 2 * q * Math.cos(2 * Math.PI * f / fs), b2 = -q * q, y = (1 - q) * x + b1 * r.y1 + b2 * r.y2; r.y2 = r.y1; r.y1 = y; return y; };
    let ph = 0, peak = 0;
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      // low on the ba, up from 120 Hz to 300 Hz by 0.68 s, back down to 120 Hz by 0.92 s; held in semitone steps
      const glide = t < 0.12 ? 120 : t < 0.68 ? 120 * Math.pow(2.5, (t - 0.12) / 0.56) : 300 * Math.pow(0.4, Math.min(1, (t - 0.68) / 0.24));
      const f0 = 120 * Math.pow(2, Math.round(12 * Math.log2(glide / 120)) / 12);
      ph = (ph + f0 / fs) % 1;
      const x = 1 - 2 * ph;   // the buzz
      // seven syllables, the first (ba) a little longer; the l: a dip at each start
      const syl = t < 0.16 ? t / 0.16 : ((t - 0.16) % 0.115) / 0.115, l = Math.min(1, syl / 0.28);
      const env = Math.min(1, t / 0.03) * Math.min(1, (0.95 - t) / 0.1) * (0.25 + 0.75 * l);
      const f1 = 350 + 450 * l;   // "l" to "a"
      d[i] = env * (0.12 * x + step(r1, x, f1, 110) * 1.0 + step(r2, x, 1300, 150) * 1.0 + step(r3, x, 2600, 240) * 0.55);
      peak = Math.max(peak, Math.abs(d[i]));
    }
    for (let i = 0; i < n; i++) d[i] = Math.round((d[i] / peak) * 127) / 127;
    return (SPELL = buf);
  }

  // the mews: a real cat's, from a recording made free for anyone (CC0) by Kerzoven ("Cat purr & meow", OpenGameArt) –
  // its two mews, a high quick one and a lower, longer one, each cut out (300 Hz – 3.8 kHz, so no thumps) and kept the
  // way old games kept their few real sounds: 8 bits at 8 kHz, 2 KB each (sounds/mew-1.wav, mew-2.wav). Fetched once,
  // when the sound first wakes; each mew picks one
  const MEW_URLS = ['mew-1', 'mew-2'].map((f) => new URL('../sounds/' + f + '.wav', document.currentScript ? document.currentScript.src : location.href).href);
  const MEWS = []; let mewAsked = false;
  function loadMew() {
    if (mewAsked || !S.ctx) return; mewAsked = true;
    for (const u of MEW_URLS) fetch(u).then((r) => r.arrayBuffer()).then((ab) => S.ctx.decodeAudioData(ab)).then((buf) => MEWS.push(buf)).catch(() => {});
  }

  // the NES band (the theme's): MEL is [semitones from C5, quavers] for pulse 1; HALF the chord of each half bar, which
  // pulse 2 rolls, the triangle bounces and the drums keep time under – as long as the chords last
  function nes(MEL, HALF) {
    if (!fx()) return;
    const n = (k) => 523.25 * Math.pow(2, k / 12), q = 0.2, L = 0.4;   // C5 + semitones; a quaver at 150 bpm; L: its level
    let at = 0;
    for (const [k, d] of MEL) { chip(0.25, n(k), q * d * 0.92, 0.07 * L, at, { vib: d >= 3, decay: d >= 3 ? 0.45 : 0.6 }); at += q * d; }
    // the chords, rolled a note every two frames
    const CH = { C: [-12, -8, -5], F: [-7, -3, 0], G: [-5, -1, 2], Am: [-3, 0, 4], Dm: [-10, -7, -3] };
    HALF.forEach((ch, h) => { const tones = CH[ch]; for (let k = 0; k < 24; k++) chip(0.125, n(tones[k % 3]), 1 / 30, 0.022 * L, h * q * 4 + k / 30, { decay: 0 }); });
    // the bass: a quaver each, root then its octave
    const ROOT = { C: -24, F: -19, G: -17, Am: -15, Dm: -22 };
    HALF.forEach((ch, h) => { for (let k = 0; k < 4; k++) chip('tri', n(ROOT[ch] + (k % 2 ? 12 : 0)), q * 0.85, 0.12 * L, h * q * 4 + k * q, { decay: 0.2 }); });
    // the drums: a hat on every quaver, a kick on one and three, a snare on two and four
    for (let i = 0; i < HALF.length * 4; i++) { knock(2400, 0.018 * L, i * q); if (i % 4 === 0) knock(160, 0.1 * L, i * q); if (i % 4 === 2) { knock(700, 0.07 * L, i * q); knock(1300, 0.04 * L, i * q + 0.02); } }
  }

  const W = {
    get on() { return S.on; }, set on(v) { S.on = !!v; },
    set play(v) { S.play = !!v; },
    letter(ch) {
      if (!fx() || !/[a-z]/i.test(ch)) return;
      // many letters settling at once (a wall loosened) make a patter, not a roar: at most a dozen a second
      const now = performance.now(); if (now - S.last < 80) return; S.last = now;
      const f = freqOf(ch);
      voice('triangle', f, f * 0.99, 0.22, 0.16, 0, { lp: 1800 });
      voice('sine', f * 2, f * 2, 0.08, 0.05);
      knock(f, 0.05);
    },
    word(text) {
      if (!fx()) return;
      const ls = [...String(text)].filter((c) => /[a-z]/i.test(c));
      ls.forEach((c, i) => voice('triangle', freqOf(c), freqOf(c), 0.3, 0.14, i * 0.11, { lp: 2000 }));
      // then the chord the word makes: its notes together, soft and long, an octave apart from the tune
      const t0 = ls.length * 0.11 + 0.05, fs = [...new Set(ls.map(freqOf))];
      fs.forEach((f) => voice('sine', f / 2, f / 2, 1.6, 0.07, t0, { attack: 0.08 }));
      voice('sine', fs[0] / 4, fs[0] / 4, 1.8, 0.06, t0, { attack: 0.1 });
    },
    quack() {
      if (!fx()) return;
      const p = 1 + (Math.random() - 0.5) * 0.12;
      voice('sawtooth', 620 * p, 300 * p, 0.09, 0.22, 0, { lp: 1800, q: 4 });
      voice('square', 540 * p, 240 * p, 0.12, 0.14, 0.07, { lp: 1500, q: 4 });
    },
    yip() {
      if (!fx()) return;
      voice('square', 880, 1320, 0.06, 0.08, 0, { lp: 3000 });
      voice('square', 1250, 700, 0.1, 0.07, 0.06, { lp: 2600 });
    },
    // a small shy mew: one of the cat's two (MEWS above), a little higher or lower each time
    meow(pitch = 1) {
      if (!fx()) return;
      loadMew(); if (!MEWS.length) return;
      const src = S.ctx.createBufferSource(), g = S.ctx.createGain();
      src.buffer = MEWS[Math.floor(Math.random() * MEWS.length)]; src.playbackRate.value = pitch * (1 + (Math.random() - 0.5) * 0.08);
      g.gain.value = 0.32; src.connect(g); g.connect(S.master); src.start();
    },
    poof() {
      if (!fx()) return;
      knock(180, 0.18); knock(320, 0.12, 0.04); knock(520, 0.08, 0.09);
      voice('triangle', 900, 300, 0.25, 0.06, 0, { lp: 1800 });
    },
    // the cat's spell, after a certain robot's fist bump: a robot voice's ba-la-la-la-la (spellSample above)
    wizard() {
      if (!fx()) return;
      const src = S.ctx.createBufferSource(), g = S.ctx.createGain();
      src.buffer = spellSample(); g.gain.value = 0.3; src.connect(g); g.connect(S.master); src.start();
    },
    // Harold's theme, our own, as an NES would play it: eight bars at 150 bpm. Pulse 1 (25 %) has the tune – a fanfare
    // up the C chord, a hook that climbs and lands on G, an answer that dips into A minor and back, a last climb home –
    // with a late vibrato on held notes; pulse 2 (12.5 %) rolls each chord as a fast arpeggio under it; the triangle
    // bounces root and octave; the noise channel keeps a hat on every quaver and a snare on two and four. 12.8 s – the
    // whole of it only where it's the point (the page's theme.mid, Patch dancing to it)
    theme() {
      nes([
        [-5, 1], [0, 1], [4, 1], [7, 3], [4, 1], [7, 1],      [9, 2], [7, 1], [4, 1], [5, 2], [2, 2],
        [-5, 1], [0, 1], [4, 1], [7, 3], [9, 1], [12, 1],     [11, 2], [9, 1], [7, 1], [7, 4],
        [9, 1], [9, 1], [12, 2], [9, 1], [7, 1], [4, 2],      [5, 1], [5, 1], [9, 2], [5, 1], [4, 1], [2, 2],
        [4, 1], [7, 1], [12, 1], [7, 1], [14, 2], [12, 1], [11, 1], [12, 3], [7, 1], [0, 4]],
      ['C', 'C', 'F', 'G', 'C', 'C', 'G', 'G', 'Am', 'Am', 'Dm', 'F', 'C', 'C', 'G', 'C']);
    },
    // a puzzle solved (a bridge spelled, a door opened): the theme's first bar, landing on the high C – 2.4 s, so it
    // says "done" and gets out of the way (the whole theme after every puzzle was too much)
    solved() {
      nes([[-5, 1], [0, 1], [4, 1], [7, 3], [4, 1], [7, 1], [12, 4]], ['C', 'C', 'C']);
    },
    // Mishka's hum: five hummed notes a beat apart (the bear's NOTE, 0.35 s) – a closed-mouth "mm": a soft triangle
    // with its octave below, a slow vibrato, everything above the voice cut away
    hum(near = 1) {
      if (!ready()) return;
      const TUNES = [['E', 'G', 'A', 'G', 'E'], ['C', 'E', 'G', 'E', 'D'], ['G', 'A', 'G', 'E', 'C']];
      const tune = TUNES[S.n++ % TUNES.length], v = 0.05 + 0.13 * Math.max(0, Math.min(1, near));
      const NOTE = { C: 196, D: 220, E: 246.9, G: 293.7, A: 329.6 };
      tune.forEach((k, i) => {
        const f = NOTE[k], last = i === tune.length - 1;
        voice('triangle', f, f, last ? 0.7 : 0.38, v, i * 0.35, { lp: 650, attack: 0.06, vib: 5 });
        voice('sine', f / 2, f / 2, last ? 0.7 : 0.38, v * 0.6, i * 0.35, { lp: 500, attack: 0.06 });
      });
    },
  };
  window.WK_SOUND = W;
})();
