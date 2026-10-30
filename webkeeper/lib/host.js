// Webkeeper inside Voyager. On the couch, Voyager loads this page in a frame over its own glass (src/ui/CouchGame.tsx)
// and the two talk in messages, same origin only:
//   to Voyager:   { webkeeper: 'ready' }      the title is drawn – the TV can show it
//                 { webkeeper: 'mode', mode }  title · lift · play · menu, as they change
//                 { webkeeper: 'sit-back' }    "sit back" was chosen in the menu
//   from Voyager: { voyager: 'pad', pad }      the deck's stick and buttons ({ x, y, a, b }), or null – not sent today
//                 { voyager: 'menu' }          open the menu (Voyager's own menu button) – not sent today
//                 { voyager: 'start' }         start from the title, or close the menu
//                 { voyager: 'title' }         back to the title (Harold sat back)
//                 { voyager: 'visitor', n }    Voyager's visitor number, for the title's counter
//                 { voyager: 'hold', on }      hold the clock (Voyager's menu is open)
//                 { voyager: 'debug', on }     show or hide the debug panel (loaded the first time)
//                 { voyager: 'sound', on }     Voyager's sound setting: the game's sound on or off (lib/sound.js)
//                 { voyager: 'zoom', z }       Voyager's zoom setting: 1, 0.75 or 0.5 (lib/world.js)
//                 { voyager: 'save-code' }     → { webkeeper: 'save-code', code }
//                 { voyager: 'load-code', code } → { webkeeper: 'loaded', ok }
//                 { voyager: 'new-night' }     start again from the couch (the prologue)
//   to Voyager, too: { webkeeper: 'menu' }     Esc, Start or the menu corner pressed in the game
// Played on its own, none of this happens and the page is the whole game.
(() => {
  const hosted = () => window.parent !== window;
  const H = {
    world: null,
    /** the host's pad, merged into the game's input (lib/world.js input()) */
    pad: null,
    hosted,
    /** PLAY pressed in the frame: the game is played full screen – asked for here, in the press, when the page
     *  around it isn't full screen already (Voyager asks itself when START is pressed on its side) */
    fullscreen() {
      if (!hosted()) return;
      // the whole page goes full screen, not this frame: a full-screen frame hides Voyager's [ menu ] and controls
      // bar, which sit beside it (the press counts for the page too, it's the same origin)
      // (Voyager's own full screen: the page's, with Esc kept for the game – src/lib/couchGame.ts)
      try { if (parent.__couchGame) { parent.__couchGame.enterFullscreen(); return; } } catch (e) { /* not our parent */ }
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    },
    send(type, data) {
      if (hosted()) parent.postMessage({ webkeeper: type, ...data }, location.origin);
    },
    attach(world) {
      H.world = world;
      let said = false, mode = null;
      setInterval(() => {
        if (!said && world.ready) { said = true; H.send('ready'); }
        if (world.mode !== mode) { mode = world.mode; H.send('mode', { mode }); }
      }, 100);
    },
  };
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || (hosted() && e.source !== parent) || !e.data || !e.data.voyager || !H.world) return;
    const m = e.data, W = H.world;
    if (m.voyager === 'pad') H.pad = m.pad;
    else if (m.voyager === 'menu') W.menu();
    else if (m.voyager === 'start') W.start();
    else if (m.voyager === 'title') W.title();
    else if (m.voyager === 'visitor' && m.n > 0) W.visitors = m.n;
    else if (m.voyager === 'hold') W.held = !!m.on;
    else if (m.voyager === 'save-code') H.send('save-code', { code: W.saveCode() });
    else if (m.voyager === 'load-code') H.send('loaded', { ok: W.loadCode(m.code) });
    else if (m.voyager === 'new-night') W.newNight();
    else if (m.voyager === 'sound') { if (window.WK_SOUND) WK_SOUND.on = !!m.on; }
    else if (m.voyager === 'zoom') W.zoom = m.z;
    else if (m.voyager === 'debug') {
      if (window.WK_DEBUG) WK_DEBUG.show(!!m.on);
      else if (m.on) { const sc = document.createElement('script'); sc.src = 'lib/debug.js'; sc.onload = () => WK_DEBUG.attach(W); document.body.appendChild(sc); }
    }
  });
  window.WK_HOST = H;
})();
