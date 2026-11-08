/* store.js
   Saves everything on this phone (browser localStorage).
   This is the stand-in for the backend database: every function here
   matches an API endpoint the backend will provide later (see README). */
window.SS = window.SS || {};
(function (SS) {
  "use strict";
  const KEY = "neurex-v3";
  const DAY = 86400000;

  // small repeatable random generator, so the demo history is the same every time
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // Demo history: 6 past days x 3 meals, stored as per-meal summaries only (no raw signals).
  function demoHistory(now) {
    const r = rng(74);
    const meals = [];
    const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
    const slots = [["Breakfast", 8, 0], ["Lunch", 12, 30], ["Dinner", 18, 30]];
    for (let d = 6; d >= 1; d--) {
      const p = (6 - d) / 5; // 0 -> 1 across the week
      slots.forEach(([label, h, m], k) => {
        const start = today0.getTime() - d * DAY + (h * 60 + m) * 60000;
        const n = 120 + Math.floor(r() * 40); // ~8 swallows a minute over a 15-20 min meal
        const base = 0.04 + 0.08 * p + (r() - 0.5) * 0.02;
        const rate = Math.max(0.01, base * (label === "Dinner" ? 1.45 : label === "Breakfast" ? 0.7 : 0.9));
        const risky = Math.round(n * rate);
        meals.push({
          id: "h" + d + k, label, start, end: start + (15 + Math.floor(r() * 6)) * 60000,
          source: "demo-history", swallows: n, risky, watch: Math.round(n * 0.05), cues: Math.min(risky, 2 + Math.floor(r() * 3)),
          avgStrength: +(0.84 - 0.14 * p + (r() - 0.5) * 0.04).toFixed(2),
          avgDuration: +(0.76 + 0.2 * p + (r() - 0.5) * 0.04).toFixed(2),
          events: [],
        });
      });
    }
    return meals;
  }
  function demoAlerts(now) {
    const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
    const t1 = today0.getTime() - 5 * DAY + (18 * 60 + 41) * 60000;
    const t2 = today0.getTime() - 3 * DAY + (12 * 60 + 47) * 60000;
    return [
      { id: "a1", start: t1, source: "demo-history", kind: "emergency", outcome: "helper",
        summary: "Possible choking at dinner. Weak coughing 20 s, no reply. Maya was called and confirmed she was there after 41 s. 911 not needed.",
        grounds: { weakCough: true, apnea: false, noReply: true, helperConfirmed: true }, log: [] },
      { id: "a2", start: t2, source: "demo-history", kind: "emergency", outcome: "patient-ok",
        summary: "Weak coughing at lunch. Tapped \"I'm OK\" after 6 s. No calls made.",
        grounds: { weakCough: true, apnea: false, noReply: false, helperConfirmed: false }, log: [] },
    ];
  }
  function defaultData() {
    const now = Date.now();
    return {
      version: 3,
      patient: { name: "Dad", age: 74, condition: "Parkinson's disease, 9 years" },
      contact: { name: "Maya", relation: "Daughter", phone: "" },
      calling: { url: "", key: "" },
      settings: { weakCoughSec: 20, apneaSec: 10, okPromptSec: 15, helperWaitSec: 90, immediate911OnApnea: false, speed: 1, sound: true },
      meals: demoHistory(now),
      alerts: demoAlerts(now),
    };
  }

  SS.store = {
    data: null,
    load() {
      try { const raw = localStorage.getItem(KEY); this.data = raw ? JSON.parse(raw) : null; } catch (e) { this.data = null; }
      if (!this.data || this.data.version !== 3) { this.data = defaultData(); this.save(); }
      return this.data;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* private mode: keep in memory */ } },
    reset() { this.data = defaultData(); this.save(); },
    // API-shaped helpers (the backend will expose the same things)
    addMeal(meal) { this.data.meals.push(meal); this.save(); return meal; },
    updateMeal(meal) { this.save(); return meal; },
    addAlert(alert) { this.data.alerts.push(alert); this.save(); return alert; },
    updateAlert(alert) { this.save(); return alert; },
    setContact(c) { Object.assign(this.data.contact, c); this.save(); },
    setSettings(s) { Object.assign(this.data.settings, s); this.save(); },
    setCalling(c) { this.data.calling = Object.assign(this.data.calling || {}, c); this.save(); },
  };
})(window.SS);
