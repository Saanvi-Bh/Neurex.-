/* sound.js: the band's sounds, made live with the browser's Web Audio (no sound files).
   Normal swallows make no sound.
     watch    single ping      one warning sign (logged, no buzz)
     cough    two-note chime   coughed after a swallow
     risky    ping-ping + buzz the band buzzes on a risky swallow
     alarm    repeating beeps  "Are you OK?"
     ring     phone ringtone   calling the emergency contact
     siren    rising siren     911 step (demo, never dialled)
     clear    rising chime     help arrived / all clear
   Browsers only allow sound after a tap or click, so unlock() runs on the first click. */
window.SS = window.SS || {};
(function (SS) {
  "use strict";
  let ctx = null, master = null, loopName = null, loopTimer = null;
  const on = () => !SS.store || !SS.store.data || SS.store.data.settings.sound !== false;

  function unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
    } catch (e) { ctx = null; }
  }
  // one tone with a soft start and a decay, optionally sliding to f2
  function tone(o) {
    if (!ctx || !on()) return;
    const t0 = ctx.currentTime + (o.at || 0), dur = o.dur || 0.15, g = ctx.createGain(), osc = ctx.createOscillator();
    osc.type = o.type || "sine"; osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.linearRampToValueAtTime(o.f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.15, t0 + (o.attack || 0.008));
    if (o.hold) g.gain.setValueAtTime(o.gain || 0.15, t0 + dur - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master); osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  const SOUNDS = {
    watch: () => tone({ f: 990, dur: 0.16, gain: 0.08 }),
    cough: () => { tone({ f: 784, dur: 0.18, gain: 0.12 }); tone({ f: 587, at: 0.17, dur: 0.24, gain: 0.12 }); },
    risky: () => {
      tone({ f: 1175, dur: 0.16, gain: 0.2 }); tone({ f: 1175, at: 0.24, dur: 0.22, gain: 0.2 });
      tone({ f: 150, type: "square", dur: 0.18, gain: 0.05, hold: true }); tone({ f: 150, type: "square", at: 0.27, dur: 0.18, gain: 0.05, hold: true });
    },
    alarm: () => { [0, 0.2, 0.4].forEach((at) => tone({ f: 988, type: "triangle", at, dur: 0.13, gain: 0.2, hold: true })); },
    ring: () => { [0, 0.6].forEach((at) => { tone({ f: 400, at, dur: 0.4, gain: 0.09, hold: true }); tone({ f: 450, at, dur: 0.4, gain: 0.09, hold: true }); }); },
    siren: () => { tone({ f: 650, f2: 1250, type: "triangle", dur: 0.7, gain: 0.13, hold: true }); tone({ f: 1250, f2: 650, type: "triangle", at: 0.7, dur: 0.7, gain: 0.13, hold: true }); },
    clear: () => { [523, 659, 784].forEach((f, i) => tone({ f, at: i * 0.12, dur: 0.35, gain: 0.12 })); },
  };
  const PERIOD = { alarm: 1400, ring: 3000, siren: 1600 };

  SS.sound = {
    unlock,
    play(name) { if (SOUNDS[name]) SOUNDS[name](); },
    // keep one repeating sound going (or none) until it changes
    loop(name) {
      if (name === loopName) return;
      clearInterval(loopTimer); loopTimer = null; loopName = name;
      if (!name) return;
      SOUNDS[name](); loopTimer = setInterval(() => SOUNDS[name](), PERIOD[name]);
    },
    stopAll() { this.loop(null); },
  };
})(window.SS);
