/* charts.js: small SVG charts for the doctor view (no libraries needed). */
window.SS = window.SS || {};
(function (SS) {
  "use strict";
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  function tipBind(el) {
    const tip = document.getElementById("tip");
    el.onmousemove = (e) => {
      const h = e.target.closest("[data-tip]");
      if (!h) { tip.hidden = true; return; }
      tip.innerHTML = h.getAttribute("data-tip"); tip.hidden = false;
      const r = tip.getBoundingClientRect();
      let x = e.clientX + 14, y = e.clientY + 14;
      if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
      if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    };
    el.onmouseleave = () => { tip.hidden = true; };
  }
  function bars(el, o) {
    const w = el.clientWidth || 600, h = o.h || 210, pl = 40, pr = o.pr || 84, pt = 14, pb = 28;
    const iw = w - pl - pr, ih = h - pt - pb, max = o.max;
    const y = (v) => pt + ih * (1 - v / max), slot = iw / o.values.length, bw = Math.max(5, Math.min(24, slot * 0.58));
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(o.aria)}">`;
    o.ticks.forEach((v) => { s += `<line x1="${pl}" x2="${w - pr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${o.fmtTick ? o.fmtTick(v) : v}</text>`; });
    let hits = "";
    o.values.forEach((v, i) => {
      const cx = pl + slot * i + slot / 2;
      if (v != null) {
        const top = y(Math.min(v, max)), hh = y(0) - top, r = Math.min(4, bw / 2, hh);
        s += `<path d="M${cx - bw / 2},${y(0)}V${top + r}Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top}H${cx + bw / 2 - r}Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r}V${y(0)}Z" class="${o.hl && o.hl(i) ? "bar hl" : "bar"}"/>`;
      }
      { const ev = o.every || 1, n = o.values.length; if ((i % ev === 0 && n - 1 - i >= ev) || i === n - 1) s += `<text x="${cx}" y="${h - 8}" text-anchor="middle" class="ax">${esc(o.labels[i])}</text>`; }
      hits += `<rect class="hit" x="${pl + slot * i}" y="${pt}" width="${slot}" height="${ih}" data-tip="${esc(o.tip(i))}"/>`;
    });
    if (o.ref != null) s += `<line x1="${pl}" x2="${w - pr}" y1="${y(o.ref)}" y2="${y(o.ref)}" class="ref"/><text x="${w - pr + 6}" y="${y(o.ref) + 4}" class="refl">${esc(o.refLabel)}</text>`;
    s += hits + `</svg>`;
    el.innerHTML = s; tipBind(el);
  }
  function line(el, o) {
    const w = el.clientWidth || 600, h = o.h || 190, pl = 40, pr = o.pr || 70, pt = 16, pb = 28;
    const iw = w - pl - pr, ih = h - pt - pb;
    const y = (v) => pt + ih * (1 - (v - o.lo) / (o.hi - o.lo)), slot = iw / o.values.length;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(o.aria)}">`;
    o.ticks.forEach((v) => { s += `<line x1="${pl}" x2="${w - pr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${o.fmtTick ? o.fmtTick(v) : v}</text>`; });
    const pts = o.values.map((v, i) => (v == null ? null : [pl + slot * i + slot / 2, y(v)]));
    let d = "", started = false;
    pts.forEach((p) => { if (!p) { started = false; return; } d += (started ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); started = true; });
    s += `<path d="${d}" class="line"/>`;
    const lastI = pts.map((p, i) => (p ? i : -1)).filter((i) => i >= 0).pop();
    if (lastI != null) { const p = pts[lastI]; s += `<circle cx="${p[0]}" cy="${p[1]}" r="5" class="dot"/><text x="${p[0] + 9}" y="${p[1] + 4}" class="val">${esc(o.fmt(o.values[lastI]))}</text>`; }
    let hits = "";
    o.values.forEach((v, i) => {
      const cx = pl + slot * i + slot / 2;
      { const ev = o.every || 1, n = o.values.length; if ((i % ev === 0 && n - 1 - i >= ev) || i === n - 1) s += `<text x="${cx}" y="${h - 8}" text-anchor="middle" class="ax">${esc(o.labels[i])}</text>`; }
      hits += `<rect class="hit" x="${pl + slot * i}" y="${pt}" width="${slot}" height="${ih}" data-tip="${esc(o.tip(i))}"/>`;
    });
    s += hits + `</svg>`;
    el.innerHTML = s; tipBind(el);
  }
  function hbars(el, rows, max) {
    const w = el.clientWidth || 400, lw = 96, rw = 60, rowH = 34, h = rows.length * rowH + 4, iw = w - lw - rw;
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(rows.map((r) => r[0] + " " + r[1].toFixed(1) + "%").join(", "))}">`;
    rows.forEach((r, i) => {
      const y0 = i * rowH + 6, bh = 18, bw = Math.max(4, (iw * r[1]) / max);
      s += `<text x="0" y="${y0 + 13}" class="lbl">${esc(r[0])}</text><rect x="${lw}" y="${y0}" width="${iw}" height="${bh}" rx="4" class="track"/>`;
      s += `<path d="M${lw},${y0}H${lw + bw - 4}Q${lw + bw},${y0} ${lw + bw},${y0 + 4}V${y0 + bh - 4}Q${lw + bw},${y0 + bh} ${lw + bw - 4},${y0 + bh}H${lw}Z" class="bar"/>`;
      s += `<text x="${lw + iw + 8}" y="${y0 + 13}" class="val">${r[1].toFixed(1)}%</text>`;
      s += `<rect class="hit" x="0" y="${y0 - 6}" width="${w}" height="${rowH}" data-tip="${esc(r[2])}"/>`;
    });
    el.innerHTML = s + `</svg>`; tipBind(el);
  }
  SS.charts = { bars, line, hbars, esc };
})(window.SS);
