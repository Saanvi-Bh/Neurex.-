/* engine.js
   DEMO BAND. Simulates the four sensors in the Neurex pod until the real band is connected:
     vib   vibration sensor (accelerometer over the cricoid)   feels the swallow
     br    breath mic                                           breathing out (+) / in (-), breath-hold, coughs
     lift  voice-box lift (bioimpedance)                        how high and how early the voice box rises
     emg   swallow muscles (sEMG under the chin)                how hard the swallow muscles push
   Nothing happens on its own: every swallow is triggered by a button (presenter panel),
   or by "Play the demo", which runs the story from the video (3 safe swallows, 1 risky, then choking).

   Each swallow is checked for five warning signs, plus coughing:
     breathed IN right after        (breath mic)        ~93% of healthy swallows are followed by breathing OUT
     breath-hold longer than 1.2 s  (mic + vibration)   normal is ~0.7 s
     another swallow within 2 s     (vibration)         gulping
     weak or late voice-box lift    (bioimpedance)      the airway may not seal in time
     weak swallow muscles           (sEMG)
   2+ signs = risky (silent if there is no cough). 1 sign = watch (logged quietly). 0 = safe.
   The band buzzes only for a risky swallow, at most once every 3 minutes. */
window.SS = window.SS || {};
(function (SS) {
  "use strict";
  const FS = 100, KEEP = 13;
  let seed = 20261108;
  function rnd() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function gauss() { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const jit = (x, f = 0.06) => x * (1 + (rnd() * 2 - 1) * f);
  const COOLDOWN = 180;

  function mk(o = {}) {
    return { vib: jit(o.vib ?? 1, 0.08), lift: jit(o.lift ?? 1, 0.05), delay: (o.delay ?? 0.05) + (rnd() - 0.5) * 0.04, emg: jit(o.emg ?? 1, 0.07), vdur: jit(0.62, 0.08) };
  }
  const SCEN = {
    safe: { label: "Safe sip", plan: () => [{ k: "apnea", d: jit(0.72, 0.08), sw: mk() }, { k: "exhale", d: jit(1.3, 0.1) }] },
    breathin: { label: "Breathes in after", plan: () => [{ k: "apnea", d: jit(0.78, 0.08), sw: mk() }, { k: "inhale", d: jit(1.4, 0.1) }] },
    silent: { label: "Silent risky pattern", plan: () => [{ k: "apnea", d: jit(1.55, 0.05), sw: mk({ vib: 0.8, lift: 0.45, delay: 0.38, emg: 0.5 }) }, { k: "inhale", d: 1.5 }] },
    cough: { label: "Coughs after sip", plan: () => [{ k: "apnea", d: 0.82, sw: mk({ lift: 0.8, delay: 0.3 }) }, { k: "inhale", d: 0.45 }, { k: "cough", d: 1.3 }, { k: "inhale", d: 1.3 }] },
    fast: { label: "Gulping", plan: () => [{ k: "apnea", d: 0.7, sw: mk() }, { k: "exhale", d: 0.35 }, { k: "apnea", d: 0.72, sw: mk({ vib: 0.9, lift: 0.85, delay: 0.1, emg: 0.9 }) }, { k: "inhale", d: 1.3 }] },
    tired: { label: "Tired, weak swallow", plan: () => [{ k: "apnea", d: jit(1.35, 0.04), sw: mk({ vib: 0.55, lift: 0.5, delay: 0.12, emg: 0.5 }) }, { k: "exhale", d: 1.2 }] },
  };

  // "Play the demo": the story from the Neurex video.
  // 3 safe swallows -> 1 silent risky swallow (band buzzes) -> food went the wrong way: weak coughing starts.
  // From there the emergency rules take over (Are you OK? -> automatic call -> 90 s countdown).
  const DEMO = [
    { scen: "safe", bolus: "bite", chew: 2.4, wait: 0.5, asap: true }, // first swallow about 3 s after Start a meal
    { scen: "safe", bolus: "sip", wait: 1.5 },
    { scen: "safe", bolus: "bite", chew: 3.5, wait: 1 },
    { scen: "silent", bolus: "sip", wait: 1.5 },
    { choke: true, wait: 3 },
  ];
  const E = {
    t: 0, sampT: 0, segs: [], sws: [], queue: [], busyUntil: 0, planEnd: 0, chews: [], auto: false, demo: false,
    buf: { vib: [], br: [], lift: [], emg: [] }, bufStart: 0,
    meal: null, swCount: 0, scenario: null, signs: { weakCough: false, apnea: false },
    now: null, lastCueAt: -1e9,
  };

  /* ---------- breathing segments ---------- */
  function ensureSegs(t) {
    if (!E.segs.length) E.segs.push({ s: 0, e: 1.4, full: 1.4, kind: "inhale", a: 0.95 });
    let last = E.segs[E.segs.length - 1];
    while (last.e < t) {
      const kind = last.kind === "inhale" ? "exhale" : "inhale";
      const d = kind === "inhale" ? jit(1.45, 0.1) : jit(2.25, 0.1);
      last = { s: last.e, e: last.e + d, full: last.e + d, kind, a: kind === "inhale" ? jit(0.95, 0.08) : jit(0.8, 0.08) };
      E.segs.push(last);
    }
  }
  function segAt(t) { for (let i = E.segs.length - 1; i >= 0; i--) { const g = E.segs[i]; if (t >= g.s && t < g.e) return g; } return null; }
  function insertPlan(ts, item) {
    const plan = SCEN[item.scen].plan(), fat = item.fat ?? 1;
    E.segs = E.segs.filter((g) => g.s < ts);
    const last = E.segs[E.segs.length - 1];
    if (last && last.e > ts) last.e = ts;
    let t = ts;
    plan.forEach((p, i) => {
      E.segs.push({ s: t, e: t + p.d, full: t + p.d, kind: p.k, a: p.k === "inhale" ? jit(0.95, 0.08) : jit(0.8, 0.08) });
      if (p.sw) {
        const sw = p.sw;
        Object.assign(sw, { id: ++E.swCount, ts: t, apnea: p.d, scen: item.scen, bolus: item.bolus || "sip", at: Date.now(), mealT: (E.meal.simSec || 0) + (t - E.t), done: false });
        sw.vib *= fat; sw.lift *= fat; sw.emg *= fat;
        sw.post = plan[i + 1] ? plan[i + 1].k : "exhale";
        sw.coughAfter = plan.slice(i + 1).some((q) => q.k === "cough");
        const prev = E.meal.events[E.meal.events.length - 1];
        sw.gap = prev ? t - prev.ts : Infinity;
        sw.analyzeAt = t + p.d + 2.6;
        E.sws.push(sw); E.meal.events.push(sw);
      }
      t += p.d;
    });
    E.busyUntil = t + 0.4; E.planEnd = t + 0.4;
  }
  function pump() {
    if (!E.queue.length || E.t < E.busyUntil) return;
    const item = E.queue[0];
    if (item.readyAt == null) item.readyAt = E.t + (item.wait || 0);
    if (E.t < item.readyAt) return;
    if (item.choke) { E.queue.shift(); E.auto = false; E.scenario = { t: 0 }; return; }
    if (item.chew && !item.chewed) { item.chewed = true; E.chews.push({ s: E.t, e: E.t + item.chew }); E.busyUntil = E.t + item.chew; return; }
    ensureSegs(E.t + 4);
    const t0 = E.t + 0.15, g = segAt(t0); if (!g) return;
    let ts = null;
    if (item.asap || (g.kind === "exhale" && g.e - t0 > 0.45 && t0 - g.s > 0.25)) ts = t0;
    else if (g.kind === "inhale") ts = g.e + 0.35;
    if (ts == null) return;
    insertPlan(ts, E.queue.shift());
  }

  /* ---------- judging (same checks as the Neurex simulator) ---------- */
  function judge(sw) {
    const liftWeak = sw.lift < 0.68, liftLate = sw.delay > 0.25, emgWeak = sw.emg < 0.68, fast = sw.gap < 2.0, longHold = sw.apnea > 1.2, inhale = sw.post === "inhale";
    const checks = [
      { key: "post", name: "Breathing right after", sensor: "breath mic", bad: inhale, val: inhale ? "Breathed in" : "Breathed out", note: inhale ? "Air rushing in can pull leftover food toward the lungs." : "Safe order: out, swallow, out." },
      { key: "hold", name: "Breath hold", sensor: "mic + vibration", bad: longHold, val: sw.apnea.toFixed(2) + " s", note: longHold ? "Much longer than the usual 0.7 s." : "Normal length." },
      { key: "pace", name: "Time since last swallow", sensor: "vibration", bad: fast, val: isFinite(sw.gap) ? sw.gap.toFixed(1) + " s" : "First of meal", note: fast ? "Swallowed again before breathing out." : "Enough time between swallows." },
      { key: "lift", name: "Voice box lift", sensor: "bioimpedance", bad: liftWeak || liftLate, val: liftWeak && liftLate ? "Weak and late" : liftWeak ? `Weak (${Math.round(sw.lift * 100)}%)` : liftLate ? `Late (+${Math.round(sw.delay * 1000)} ms)` : "Strong, on time", note: liftWeak || liftLate ? "The airway may not seal in time." : "Airway sealing normally." },
      { key: "emg", name: "Swallow muscles", sensor: "sEMG", bad: emgWeak, val: emgWeak ? `Weak (${Math.round(sw.emg * 100)}%)` : "Usual strength", note: emgWeak ? "A weaker push than usual." : "Normal push." },
      { key: "cough", name: "Cough within 3 s", sensor: "breath mic", cough: sw.coughAfter, val: sw.coughAfter ? "Coughed" : "No cough", note: sw.coughAfter ? "Something went the wrong way and the body reacted." : "Nothing set off a cough." },
    ];
    const signs = checks.filter((c) => c.bad && c.key !== "cough");
    let level, label;
    if (sw.coughAfter) { level = "cough"; label = "Coughed after swallow"; }
    else if (signs.length >= 2) { level = "risky"; label = "Risky swallow"; }
    else if (signs.length === 1) { level = "watch"; label = "Watch: one sign"; }
    else { level = "safe"; label = "Safe swallow"; }
    return { checks, signs, level, label, sensors: new Set(signs.map((c) => c.sensor)).size };
  }
  function cueFor(v) {
    const has = (k) => v.signs.some((c) => c.key === k);
    if (has("pace")) return { title: "Slow down", body: "One sip at a time. Breathe out before the next one." };
    if (has("post")) return { title: "Pause and clear your throat", body: "Breathe out, clear your throat, then swallow again before the next sip." };
    return { title: "Swallow hard, then again", body: "Push hard when you swallow, then do a second dry swallow." };
  }
  function analyze(sw) {
    const v = judge(sw); sw.v = v; sw.done = true; sw.action = v.level === "watch" ? "Logged, no buzz (one sign)" : "Counted";
    sw.label = v.level; sw.strength = +sw.lift.toFixed(2); sw.duration = +sw.apnea.toFixed(2);
    const m = E.meal; if (!m) return;
    m.swallows = m.events.filter((e) => e.done).length;
    m.risky = m.events.filter((e) => e.done && e.label === "risky").length;
    m.watch = m.events.filter((e) => e.done && e.label === "watch").length;
    m.coughs = m.events.filter((e) => e.done && e.label === "cough").length;
    const done = m.events.filter((e) => e.done);
    m.avgStrength = +(done.reduce((a, e) => a + e.lift, 0) / done.length).toFixed(2);
    m.avgDuration = +(done.reduce((a, e) => a + e.apnea, 0) / done.length).toFixed(2);
    let feed = null;
    if (v.level === "risky") {
      const canBuzz = E.t - E.lastCueAt >= COOLDOWN, cue = cueFor(v);
      sw.cue = canBuzz; sw.action = canBuzz ? `Band buzzed: ${cue.title.toLowerCase()}` : "Logged quietly (band buzzed in the last 3 min)";
      if (canBuzz) { E.lastCueAt = E.t; m.cues = (m.cues || 0) + 1; SS.app && SS.app.buzz([180, 90, 180]); }
      E.now = { kind: "risky", title: canBuzz ? cue.title : "Risky swallow, logged quietly", body: canBuzz ? cue.body : "The band already buzzed in the last 3 minutes, so it stayed quiet.", until: E.t + 9 };
      feed = { kind: "risky", title: canBuzz ? `Band buzzed: ${cue.title.toLowerCase()}` : "Risky swallow (logged quietly)", body: `${v.signs.length} signs agree: ${v.signs.map((c) => c.name.toLowerCase()).join(", ")}. No cough.` };
      SS.store.addAlert({ id: "c" + Date.now(), start: Date.now(), source: "live-demo", kind: "cue", outcome: canBuzz ? "buzzed" : "logged", summary: `Risky swallow during ${m.label.toLowerCase()}: ${v.signs.map((c) => c.name.toLowerCase()).join(", ")}, no cough. ${canBuzz ? "Band buzzed once." : "Logged quietly."}` });
    } else if (v.level === "cough") {
      sw.action = "Tip on phone: sit up, let the cough finish";
      E.now = { kind: "cough", title: "Coughed after a sip", body: "Sit up straight and let the cough finish. Wait before the next sip.", until: E.t + 9 };
      feed = { kind: "cough", title: "Coughed after a sip", body: "Sit up straight and let the cough finish. Wait before the next sip." };
    } else if (v.level === "watch") {
      feed = { kind: "watch", title: "One warning sign (logged)", body: `${v.signs[0].name}: ${v.signs[0].val.toLowerCase()}. No buzz for a single sign.` };
    }
    if (feed) { feed.at = Date.now(); m.feed = m.feed || []; m.feed.unshift(feed); }
    SS.store.updateMeal(m);
    SS.app && SS.app.onSwallow(sw);
  }

  /* ---------- signals ---------- */
  function sample(t) {
    const g = segAt(t);
    let br = 0;
    if (E.signs.apnea) br = 0;
    else if (g) {
      if (g.kind === "inhale" || g.kind === "exhale") {
        const u = (t - g.s) / (g.full - g.s);
        let v = g.a * Math.sin(Math.PI * Math.min(1, u));
        if (g.e < g.full) v *= Math.min(1, (g.e - t) / 0.15);
        br = g.kind === "inhale" ? -v : v * 0.9;
      } else if (g.kind === "cough") {
        for (const o of [0.08, 0.5, 0.92]) { const x = t - g.s - o; if (x >= 0 && x < 0.35) br += 1.75 * Math.exp(-x / 0.07) * (1 - Math.exp(-x / 0.012)); }
      }
    }
    if (E.signs.weakCough) { const ph = t % 1.4; if (ph < 0.3) br = 0.55 * Math.exp(-ph / 0.08) * (1 - Math.exp(-ph / 0.015)); }
    br += 0.025 * gauss();
    let vib = 0.035 * gauss(), lift = 0.012 * gauss() + 0.01 * Math.sin(t * 0.7), emg = 0.04 * gauss();
    for (let i = E.sws.length - 1; i >= 0; i--) {
      const w = E.sws[i], x = t - w.ts;
      if (x > 3) break;
      if (x > -0.02 && x < w.vdur) { const u = (x + 0.02) / (w.vdur + 0.02); vib += w.vib * Math.pow(Math.sin(Math.PI * u), 2) * (0.8 * gauss() + 0.35 * Math.sin(2 * Math.PI * 9 * t)); }
      const lx = x - w.delay, ld = 0.78;
      if (lx > 0 && lx < ld) lift += w.lift * Math.pow(Math.sin((Math.PI * lx) / ld), 1.6);
      const ex = x + 0.12, ed = Math.min(w.apnea + 0.1, 0.9);
      if (ex > 0 && ex < ed) emg += w.emg * Math.sin((Math.PI * ex) / ed) * 0.8 * gauss();
    }
    if (g && g.kind === "cough") for (const o of [0.08, 0.5, 0.92]) { const x = t - g.s - o; if (x >= 0 && x < 0.25) vib += 2.0 * Math.exp(-x / 0.06) * gauss(); }
    if (E.signs.weakCough) { const ph = t % 1.4; if (ph < 0.18) vib += 0.6 * Math.exp(-ph / 0.05) * gauss(); }
    for (const c of E.chews) if (t >= c.s && t < c.e) {
      const b = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 1.5 * (t - c.s))), 6);
      vib += b * (0.22 + 0.12 * gauss()); emg += b * 0.22 * gauss(); lift += b * 0.04;
    }
    const B = E.buf;
    B.vib.push(vib); B.br.push(br); B.lift.push(lift); B.emg.push(emg);
    const max = KEEP * FS;
    if (B.vib.length > max) { const n = B.vib.length - max; for (const k in B) B[k].splice(0, n); E.bufStart += n / FS; }
  }

  SS.engine = {
    E, FS, KEEP, SCEN,
    startMeal(lbl) {
      if (E.meal) return E.meal;
      const h = new Date().getHours();
      const label = lbl || (h < 11 ? "Breakfast" : h < 16 ? "Lunch" : "Dinner");
      E.meal = SS.store.addMeal({ id: "m" + Date.now(), label, start: Date.now(), end: null, source: "live-demo", swallows: 0, risky: 0, watch: 0, coughs: 0, cues: 0, simSec: 0, avgStrength: null, avgDuration: null, events: [], feed: [] });
      E.now = null; E.lastCueAt = -1e9; // the 3-minute buzz limit starts fresh each meal
      return E.meal;
    },
    endMeal() {
      if (!E.meal) return null;
      E.queue = []; E.auto = false; E.chews = E.chews.filter((c) => c.e < E.t);
      E.meal.events = E.meal.events.filter((e) => e.done);
      E.meal.end = Date.now(); SS.store.updateMeal(E.meal);
      const m = E.meal; E.meal = null; this.stopScenario(); E.now = null;
      return m;
    },
    swallow(scen) { if (!E.meal) this.startMeal(); E.queue.push({ scen, bolus: scen === "tired" ? "bite" : "sip" }); },
    playDemo() { if (E.meal) this.endMeal(); this.stopScenario(); this.startMeal("Dinner"); E.queue = DEMO.map((d) => Object.assign({}, d)); E.auto = true; E.demo = true; },
    stopDemo() { E.queue = []; E.auto = false; E.demo = false; E.chews = E.chews.filter((c) => c.e < E.t); this.stopScenario(); },
    startChoking() { if (!E.meal) this.startMeal(); E.queue.push({ scen: "silent" }); E.scenario = { t: -2.5 }; },
    stopScenario() { E.scenario = null; E.signs = { weakCough: false, apnea: false }; },
    // dt moves the signals (always real time); sdt moves the scripted emergency (sped up by the presenter's timer speed)
    tick(dt, sdt = dt) {
      E.t += dt;
      if (E.meal) E.meal.simSec = (E.meal.simSec || 0) + dt;
      pump();
      ensureSegs(E.t + 0.3);
      // scripted choking: weak coughing from 2 s after the swallow, coughing fades and breathing stops from 45 s
      if (E.scenario) { const s = (E.scenario.t += sdt); E.signs = { weakCough: s >= 2 && s < 46, apnea: s >= 45 }; }
      while (E.sampT + 1 / FS <= E.t) { E.sampT += 1 / FS; sample(E.sampT); }
      for (const sw of E.sws) if (!sw.done && E.t >= sw.analyzeAt) analyze(sw);
      const cut = E.t - KEEP - 4;
      if (E.segs.length > 60) E.segs = E.segs.filter((g) => g.e > cut);
      if (E.sws.length > 40) E.sws = E.sws.filter((s) => s.ts > cut);
      if (E.chews.length > 10) E.chews = E.chews.filter((c) => c.e > cut);
    },
  };
  // pre-fill a few seconds of quiet breathing so the graph is never empty
  for (let i = 0; i < 6 * 30; i++) SS.engine.tick(1 / 30);
})(window.SS);
