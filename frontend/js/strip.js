/* strip.js: the live 4-sensor graph (a scrolling strip chart, like a hospital monitor). */
window.SS = window.SS || {};
(function (SS) {
  "use strict";
  const LANES = [
    { key: "vib", short: "Vibration", name: "Throat vibration", tag: "VIBRATION SENSOR", tok: "--ch-vib", lo: -2.6, hi: 2.6 },
    { key: "br", short: "Breathing", name: "Breathing", tag: "BREATH MIC · OUT ↑ IN ↓", tok: "--ch-br", lo: -1.9, hi: 1.9 },
    { key: "lift", short: "Voice box", name: "Voice box lift", tag: "BIOIMPEDANCE", tok: "--ch-lift", lo: -0.2, hi: 1.25 },
    { key: "emg", short: "Muscles", name: "Swallow muscles", tag: "sEMG · UNDER CHIN", tok: "--ch-emg", lo: -2.3, hi: 2.3 },
  ];
  const STAT = { safe: ["--good-soft", "--good"], watch: ["--warn-soft", "--warn"], risky: ["--risk-soft", "--risk"], cough: ["--amber-soft", "--amber"] };
  const AX = 24;
  let ctx, cv, W = 0, H = 0, laneH = 64, WIN = 10, T = {};
  function tokens() {
    const cs = getComputedStyle(document.documentElement);
    ["--surface", "--surface2", "--ink", "--ink2", "--muted", "--line", "--grid", "--primary", "--primary-soft", "--good", "--good-soft", "--warn", "--warn-soft", "--risk", "--risk-soft", "--amber", "--amber-soft", "--ch-vib", "--ch-br", "--ch-lift", "--ch-emg"].forEach((k) => (T[k] = cs.getPropertyValue(k).trim()));
  }
  function resize() {
    const r = cv.parentElement.getBoundingClientRect(); if (!r.width) return false;
    const dpr = window.devicePixelRatio || 1;
    W = r.width; laneH = W < 520 ? 62 : 64; H = AX + 4 * laneH + 4; WIN = W < 520 ? 6 : 10;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function yOf(L, v, li) { const top = AX + li * laneH + 8, h = laneH - 14, c = Math.max(L.lo, Math.min(L.hi, v)); return top + (1 - (c - L.lo) / (L.hi - L.lo)) * h; }
  function draw() {
    const E = SS.engine.E;
    if (!cv.offsetParent) return; // hidden (other tab)
    if (!W && !resize()) return;
    const xOf = (t) => W * (1 - (E.t - t) / WIN), t0 = E.t - WIN;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = T["--surface"]; ctx.fillRect(0, 0, W, H);
    const live = E.sws.filter((sw) => !(sw.ts + sw.apnea < t0 - 0.5 || sw.ts > E.t));
    live.forEach((sw) => {
      const x0 = xOf(sw.ts - 0.08), x1 = Math.min(W, xOf(Math.min(E.t, sw.ts + sw.apnea + 0.05)));
      const st = sw.done ? STAT[sw.label] : ["--primary-soft", "--primary"];
      ctx.fillStyle = T[st[0]]; ctx.fillRect(x0, AX, x1 - x0, H - AX);
      ctx.fillStyle = T[st[1]]; ctx.fillRect(x0, AX, x1 - x0, 2);
    });
    for (let i = 0; i < 4; i++) { ctx.fillStyle = T["--line"]; ctx.fillRect(0, AX + i * laneH, W, 1); ctx.fillStyle = T["--grid"]; ctx.fillRect(0, Math.round(yOf(LANES[i], 0, i)), W, 1); }
    const chipX = live.map((sw) => xOf(sw.ts - 0.08));
    ctx.font = "11px 'IBM Plex Mono', monospace"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
    for (let k = Math.floor(t0); k <= Math.ceil(E.t); k++) {
      const x = Math.round(xOf(k)); if (x < 0 || x > W) continue;
      ctx.fillStyle = T["--grid"]; ctx.fillRect(x, AX, 1, H - AX);
      if (k % 2 === 0 && x > 18 && x < W - 30 && !chipX.some((cx) => x > cx - 20 && x < cx + 70)) { ctx.fillStyle = T["--muted"]; ctx.fillText(-Math.round(E.t - k) + "s", x, AX - 6); }
    }
    ctx.textAlign = "left";
    const B = E.buf, n = B.vib.length, FS = SS.engine.FS, iStart = Math.max(0, Math.floor((t0 - E.bufStart) * FS) - 1);
    LANES.forEach((L, li) => {
      ctx.save(); ctx.beginPath(); ctx.rect(0, AX + li * laneH + 1, W, laneH - 1); ctx.clip();
      ctx.strokeStyle = T[L.tok]; ctx.lineWidth = L.key === "br" || L.key === "lift" ? 2 : 1.2; ctx.lineJoin = "round"; ctx.beginPath();
      for (let i = iStart; i < n; i++) { const x = xOf(E.bufStart + i / FS), y = yOf(L, B[L.key][i], li); i === iStart ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke(); ctx.restore();
    });
    // annotations: breath hold and breathing direction after each swallow
    live.forEach((sw) => {
      const end = sw.ts + sw.apnea; if (end > E.t) return;
      const hx0 = xOf(sw.ts), hx1 = xOf(end), hy = yOf(LANES[1], 0, 1) - 12;
      ctx.strokeStyle = T["--ink2"]; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx0, hy + 4); ctx.lineTo(hx0, hy); ctx.lineTo(hx1, hy); ctx.lineTo(hx1, hy + 4); ctx.stroke();
      ctx.fillStyle = T["--ink2"]; ctx.font = "10.5px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillText("hold " + sw.apnea.toFixed(2) + "s", (hx0 + hx1) / 2, hy - 7); ctx.textAlign = "left";
      if (E.t > end + 0.25) {
        const inh = sw.post === "inhale", yb = AX + laneH, ax = xOf(end + 0.12), ay = inh ? yb + laneH - 14 : yb + 28;
        ctx.fillStyle = inh ? T["--risk"] : T["--good"]; ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = T["--ink"]; ctx.font = "600 11.5px Nunito, sans-serif";
        const txt = inh ? "breathed in" : "breathed out", tw = ctx.measureText(txt).width;
        ctx.fillText(txt, ax + 8 + tw > W - 6 ? ax - 8 - tw : ax + 8, ay);
      }
    });
    // chewing (bites): small rhythmic bursts on vibration and muscles
    ctx.font = "600 11px Nunito, sans-serif"; ctx.fillStyle = T["--muted"]; ctx.textBaseline = "middle";
    E.chews.forEach((c) => { if (c.e < t0 || c.s > E.t) return; const lim = W < 520 ? 80 : 150, x = Math.max(xOf(c.s), lim); if (x < W - 50 && xOf(c.e) > lim) ctx.fillText("chewing", x + 4, AX + laneH - 10); });
    if (E.signs.weakCough || E.signs.apnea) { ctx.font = "700 12px Nunito, sans-serif"; ctx.fillStyle = T["--risk"]; ctx.fillText(E.signs.apnea ? "breathing stopped" : "weak coughing", W - 130, AX + laneH + 16); }
    // lane labels (short ones on phones so they hide less of the signal)
    if (W < 520) {
      LANES.forEach((L, li) => {
        const ly = AX + li * laneH + 4, nm = L.short;
        ctx.font = "700 11px Nunito, sans-serif"; const w1 = ctx.measureText(nm).width;
        ctx.globalAlpha = 0.9; ctx.fillStyle = T["--surface"]; rr(3, ly, w1 + 12, 17, 5); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = T[L.tok]; ctx.fillRect(3, ly + 2, 3, 13);
        ctx.textBaseline = "middle"; ctx.fillStyle = T["--ink"]; ctx.fillText(nm, 9, ly + 9);
      });
    } else LANES.forEach((L, li) => {
      const ly = AX + li * laneH + 6;
      ctx.font = "700 12px Nunito, sans-serif"; const w1 = ctx.measureText(L.name).width;
      ctx.font = "10px 'IBM Plex Mono', monospace"; const w2 = ctx.measureText(L.tag).width;
      ctx.globalAlpha = 0.92; ctx.fillStyle = T["--surface"]; rr(4, ly, Math.max(w1, w2) + 14, 30, 6); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = T[L.tok]; ctx.fillRect(4, ly + 3, 3, 24);
      ctx.textBaseline = "top"; ctx.fillStyle = T["--ink"]; ctx.font = "700 12px Nunito, sans-serif"; ctx.fillText(L.name, 12, ly + 3);
      ctx.fillStyle = T["--muted"]; ctx.font = "10px 'IBM Plex Mono', monospace"; ctx.fillText(L.tag, 12, ly + 17);
    });
    // swallow chips
    live.forEach((sw) => {
      const x0 = xOf(sw.ts - 0.08), st = sw.done ? STAT[sw.label] : ["--primary-soft", "--primary"];
      ctx.font = "600 11px 'IBM Plex Mono', monospace"; ctx.textBaseline = "middle";
      const lab = "S" + sw.id + (sw.done ? { safe: " ✓", watch: " !", risky: " !!", cough: " cough" }[sw.label] : " …"), tw = ctx.measureText(lab).width + 10;
      ctx.fillStyle = T[st[1]]; rr(x0, 3, tw, 17, 4); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillText(lab, x0 + 5, 11.5);
    });
    ctx.fillStyle = T["--primary"]; ctx.fillRect(W - 2, AX, 2, H - AX);
  }
  // which swallow is under a mouse/finger position (for the hover tip)
  function hit(clientX) {
    if (!cv || !W) return null;
    const E = SS.engine.E, r = cv.getBoundingClientRect(), x = clientX - r.left, t = E.t - WIN * (1 - x / W);
    return E.sws.find((sw) => t >= sw.ts - 0.15 && t <= sw.ts + sw.apnea + 0.15) || null;
  }
  SS.strip = {
    init(canvas) { cv = canvas; ctx = cv.getContext("2d"); tokens(); W = 0; },
    resize() { W = 0; },
    draw() { if (cv) draw(); },
    hit,
    get win() { return WIN; },
  };
})(window.SS);
