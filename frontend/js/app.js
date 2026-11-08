/* app.js: Neurex app. Two tabs: Live (the person wearing the band) and Graphs (family and doctors).
   SS.engine = demo band (4 sensors), SS.esc = emergency rules, SS.caller = real phone call via Twilio. */
window.SS = window.SS || {};
(function (SS) {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const H = SS.charts.esc;
  const D = () => SS.store.data;
  const DAY = 86400000;
  const fmtClock = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const fmtShortDay = (ms) => new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
  const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const telOf = (n) => "tel:" + String(n).replace(/[^\d+]/g, "");

  const ICON = {
    ok: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 2l11 19H1z" fill="currentColor"/><path d="M12 9v5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.4" fill="#fff"/></svg>',
    none: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    buzz: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 8v8M21 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    cough: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 8h10M4 12h8M6 16h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z M5 19l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plate: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.6a1 1 0 01-.25 1z" fill="currentColor"/></svg>',
  };
  const LBL = { safe: ["good", "Safe swallow"], watch: ["warn", "One sign"], risky: ["risk", "Risky swallow"], cough: ["amber", "Coughed after"] };
  const pill = (cls, text) => `<span class="pill ${cls}">${cls === "good" ? ICON.ok : cls === "muted" ? ICON.none : ICON.warn}${H(text)}</span>`;

  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._h); toast._h = setTimeout(() => (t.hidden = true), 2600); }
  function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* not supported */ } }
  function keyed(el, key, html) { if (el.dataset.k !== key) { el.innerHTML = html(); el.dataset.k = key; } }
  function bind(name, value) { $$(`[data-bind="${name}"]`).forEach((n) => { if (n.textContent !== String(value)) n.textContent = value; }); }

  /* ---------- hooks used by the engine and the emergency rules ---------- */
  function alertMessage() {
    const g = SS.esc.grounds(), c = D().settings, p = D().patient.name, parts = [];
    if (g.weakCough) parts.push(`weak coughing for over ${c.weakCoughSec} seconds`);
    if (g.apnea) parts.push(`breathing stopped for over ${c.apneaSec} seconds`);
    if (g.noReply) parts.push("no answer when asked if he is OK");
    return `Neurex emergency alert. ${p} may be choking. The band detected ${parts.join(", and ") || "a call for help"}. Please go to him now. If you cannot reach him, call 911.`;
  }
  let buzzUntil = -1, flashUntil = -1, flashKind = "";
  SS.app = {
    // the band buzzes: vibrate the phone (if it can) and show "Band buzzing" over the graph
    buzz(p) { buzz(p); buzzUntil = SS.engine.E.t + 1.8; },
    // a swallow was judged: flash the graph in its colour
    onSwallow(sw) {
      if (sw.label !== "safe") { flashKind = sw.label; flashUntil = SS.engine.E.t + 1.4; }
      // sounds: normal swallows are silent; double ping + buzz when the band buzzes on a risky swallow
      if (sw.label !== "safe") SS.sound.play(sw.label === "risky" ? (sw.cue ? "risky" : "watch") : sw.label === "cough" ? "cough" : "watch");
    },
    onContact() {
      SS.app.buzz([400, 150, 400, 150, 400]);
      if (SS.caller.configured()) SS.caller.call(alertMessage());
      else { SS.caller.state.state = "not-set"; SS.caller.state.detail = "Automatic calling isn't set up, so this call is simulated. Add the Twilio link in Settings to ring a real phone."; }
    },
    onEms() { buzz([800, 200, 800]); },
  };

  /* ---------- tabs ---------- */
  const TABS = ["live", "graphs"];
  let tab = "live";
  function route() {
    const h = location.hash.slice(1);
    tab = TABS.includes(h) ? h : "live";
    TABS.forEach((v) => { $("#view-" + v).hidden = v !== tab; $(`.tabbar a[data-v="${v}"]`).setAttribute("aria-current", v === tab ? "page" : "false"); });
    if (tab === "graphs") renderGraphs(true);
    window.scrollTo(0, 0);
  }

  /* ---------- live tab ---------- */
  function renderContact() {
    const c = D().contact, auto = SS.caller.configured();
    $("#contactCard").innerHTML = `
      <div class="row between"><span class="eyebrow">Emergency contact</span><button class="link" data-act="settings">Edit</button></div>
      <div class="contact-row"><span class="avatar">${H(c.name.slice(0, 1).toUpperCase())}</span>
        <div class="grow"><b>${H(c.name)}</b><small>${H(c.relation)}</small></div>
        <span class="pill ${auto ? "good" : "muted"}">${auto ? ICON.ok : ICON.none}${auto ? "Auto-call on" : "Auto-call off"}</span></div>
      <p class="fine">If you may be choking and don't answer, ${H(c.name)} gets an automatic phone call. If she doesn't confirm within ${D().settings.helperWaitSec} seconds, 911 is next.</p>`;
  }
  function nowState() {
    const E = SS.engine.E, S = SS.esc.state, c = D().settings;
    if (["ask", "contact", "hold", "ems"].includes(S.stage)) return { k: "emerg", cls: "risk", icon: ICON.warn, title: "Emergency in progress", body: "Follow the steps on screen." };
    if (S.stage === "watch") return { k: "watch" + Math.floor(S.weakCoughSec + S.apneaSec), cls: "amber", icon: ICON.cough, title: S.signs.apnea ? "Breathing has stopped" : "Weak coughing", body: S.signs.apnea ? `Stopped for ${Math.floor(S.apneaSec)} s. We'll check on you at ${c.apneaSec} s.` : `${Math.floor(S.weakCoughSec)} s so far. We'll check on you at ${c.weakCoughSec} s.` };
    if (E.now && E.t < E.now.until) return { k: "now" + E.now.title + E.now.until, cls: E.now.kind === "cough" ? "amber" : "risk", icon: E.now.kind === "cough" ? ICON.cough : ICON.buzz, title: E.now.title, body: E.now.body };
    if (E.meal) {
      const pending = E.meal.events.some((e) => !e.done);
      return pending ? { k: "check", cls: "calm", icon: ICON.leaf, title: "Checking that swallow", body: "Four sensors are comparing it with your usual swallow." }
        : { k: "eat", cls: "calm", icon: ICON.leaf, title: "Eating normally", body: "Every swallow is checked. The band only buzzes if one looks risky." };
    }
    return { k: "idle", cls: "calm", icon: ICON.plate, title: "Ready when you are", body: "Tap Start a meal before you eat. The band listens only during meals." };
  }
  function updateLive() {
    const E = SS.engine.E, m = E.meal;
    bind("swallows", m ? m.swallows : 0); bind("risky", m ? m.risky : 0); bind("cues", m ? m.cues || 0 : 0);
    $("#livePill").classList.toggle("on", !!m);
    const lt = m ? `${m.label} · live` : "Ready"; if ($("#liveText").textContent !== lt) $("#liveText").textContent = lt;
    const btn = $("#mealBtn"), lbl = m ? `End ${m.label.toLowerCase()}` : "Start a meal";
    if (btn.textContent !== lbl) btn.textContent = lbl;
    btn.classList.toggle("primary", !m);
    const st = nowState();
    keyed($("#nowCard"), st.k, () => `<span class="now-ic">${st.icon}</span><div><h3>${H(st.title)}</h3><p>${H(st.body)}</p></div>`);
    $("#nowCard").className = "now o2 " + st.cls;
    const feed = m ? m.feed || [] : [];
    keyed($("#feed"), (m ? m.id : "none") + feed.length, () => feed.length
      ? feed.map((f) => `<li class="${f.kind}"><i></i><div><b>${H(f.title)}<span class="tm">${fmtClock(f.at)}</span></b><p>${H(f.body)}</p></div></li>`).join("")
      : `<li class="empty">${m ? "Nothing to report. Safe swallows are counted quietly." : "Start a meal to see what the band notices."}</li>`);
    bind("feedCount", feed.length ? `${feed.length} item${feed.length > 1 ? "s" : ""}` : "");
  }

  /* ---------- live graph (4 sensors) and the last swallow's checks ---------- */
  function checksHtml(v) {
    return v.checks.map((c) => {
      const bad = c.key === "cough" ? c.cough : c.bad;
      let note = c.note;
      if (c.key === "cough" && !c.cough && v.level === "risky") note = "No cough even though signs agree. This is the silent kind.";
      return `<li class="${bad ? (c.key === "cough" ? "cough" : "bad") : ""}">${bad ? ICON.warn : ICON.ok}<div><b>${H(c.name)}<span class="sens">${H(c.sensor)}</span></b><span class="val">${H(c.val)}</span><small>${H(note)}</small></div></li>`;
    }).join("");
  }
  function summaryOf(sw) {
    const v = sw.v;
    if (v.level === "risky") return `<b>${v.signs.length} warning signs agree and there was no cough.</b> ${sw.cue === false ? "The band already buzzed in the last 3 minutes, so this one was logged quietly." : "The band buzzed once and the phone showed what to do."}`;
    if (v.level === "cough") return "<b>He coughed right after.</b> The body noticed, so it's logged with a tip on the phone.";
    if (v.level === "watch") return `<b>Only one warning sign</b> (${H(v.signs[0].name.toLowerCase())}). Logged quietly, no buzz.`;
    return "<b>Every check looks normal.</b> Counted quietly.";
  }
  function renderVerdict() {
    const E = SS.engine.E, src = E.meal ? E.meal.events : E.sws, el = $("#verdict");
    const pend = src.filter((s) => !s.done && E.t >= s.ts).slice(-1)[0];
    if (pend) {
      keyed(el, "p" + pend.id, () => `<div class="row between"><div><span class="eyebrow">Checking now</span><h3>Swallow ${pend.id} <small>(${H(pend.bolus || "sip")})</small></h3></div><span class="pill pending">${ICON.leaf}Checking…</span></div>
        <p class="sub">Comparing all four sensors with his usual swallow, and waiting 3 seconds for a cough.</p><div class="progress"><div id="vProg"></div></div>`);
      const pr = Math.min(1, (E.t - pend.ts) / (pend.analyzeAt - pend.ts)), bar = $("#vProg"); if (bar) bar.style.width = (pr * 100).toFixed(1) + "%";
      return;
    }
    const sw = src.filter((s) => s.done).slice(-1)[0];
    keyed(el, sw ? "s" + sw.id + "-" + sw.at : (E.meal ? "m" : "none") + (E.chews.some((c) => E.t >= c.s && E.t < c.e) ? "c" : ""), () => {
      if (!sw) return E.chews.some((c) => E.t >= c.s && E.t < c.e) ? `<span class="eyebrow">Chewing</span><p class="sub">Chewing shows as small rhythmic bumps. The band waits for the swallow.</p>`
        : `<span class="eyebrow">Last swallow</span><p class="sub">${E.meal ? "Waiting for the next swallow." : "Tap Start a meal. Each swallow is checked here by all four sensors."}</p>`;
      return `<div class="row between"><div><span class="eyebrow">Last swallow</span><h3>Swallow ${sw.id} <small>(${H(sw.bolus || "sip")})</small></h3></div>${pill(...LBL[sw.label])}</div>
        <p class="sub">${summaryOf(sw)}</p><ul class="checks">${checksHtml(sw.v)}</ul>`;
    });
  }
  function updateGraphChrome() {
    const E = SS.engine.E, S = SS.esc.state;
    const buzzing = E.t < buzzUntil || S.stage === "ask";
    const st = $("#bandStat"), txt = buzzing ? (S.stage === "ask" ? "Band buzzing: are you OK?" : "Band buzzing") : E.signs.apnea ? "Breathing stopped" : E.signs.weakCough ? "Weak coughing" : E.meal ? "Band listening" : "Band quiet";
    st.className = "bandstat" + (buzzing ? " on" : E.signs.apnea || E.signs.weakCough ? " alarm" : E.meal ? " live" : "");
    if ($("#bandText").textContent !== txt) $("#bandText").textContent = txt;
    const ck = E.meal ? mmss(E.meal.simSec || 0) : "0:00"; if ($("#clock").textContent !== ck) $("#clock").textContent = ck;
    const card = $("#graphCard"), fk = E.t < flashUntil ? flashKind : "";
    if (card.dataset.flash !== fk) { card.dataset.flash = fk; }
    const wl = `4 sensors, last ${SS.strip.win || 10} seconds. ${HOVER ? "Hover" : "Tap"} a shaded swallow for its result.`; if ($("#winLabel").textContent !== wl) $("#winLabel").textContent = wl;
  }
  // hover (or tap) a shaded swallow on the graph to see its result
  const HOVER = window.matchMedia && matchMedia("(hover: hover)").matches;
  function bindGraphTip() {
    const cv = $("#strip"), tip = $("#tip");
    const show = (e) => {
      const sw = SS.strip.hit(e.clientX);
      if (!sw) { tip.hidden = true; return; }
      tip.innerHTML = sw.done ? `<b>Swallow ${sw.id} (${H(sw.bolus || "sip")}): ${LBL[sw.label][1]}</b><br>${sw.v.signs.length ? H(sw.v.signs.map((c) => c.name.toLowerCase()).join(", ")) : "no warning signs"}${sw.coughAfter ? "<br>coughed after" : ""}<br>breath hold ${sw.apnea.toFixed(2)} s` : `<b>Swallow ${sw.id}</b><br>still checking…`;
      tip.hidden = false;
      const r = tip.getBoundingClientRect(); let x = e.clientX + 14, y = e.clientY + 14;
      if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14; if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    };
    cv.addEventListener("mousemove", show);
    cv.addEventListener("click", show);
    cv.addEventListener("mouseleave", () => (tip.hidden = true));
  }
  // during an emergency the same live graph moves onto the emergency screen, so you can watch the coughing and breathing
  let graphIn = "home";
  function placeGraph(where) {
    if (graphIn === where) return;
    (where === "sos" ? $("#sosGraph") : $("#graphHome")).appendChild($("#graphWrap"));
    graphIn = where; SS.strip.resize();
  }
  function updateDemoBtn() { const b = $("#demoBtn"), l = SS.engine.E.demo ? "Stop the demo" : "Play the demo"; if (b.textContent !== l) b.textContent = l; }

  /* ---------- the story demo: which step are we on? ---------- */
  function demoStep() {
    const E = SS.engine.E, S = SS.esc.state, name = D().contact.name;
    const ev = E.meal ? E.meal.events : [], doneSafe = ev.filter((e) => e.done && e.label === "safe").length;
    if (S.stage === "ems") return [6, "Help didn't confirm in time: 911 (demo, never dialled)"];
    if (S.stage === "resolved") return [6, S.lastResolved && S.lastResolved.outcome === "helper" ? `Help arrived: ${name} is with him` : "He's OK"];
    if (S.stage === "contact" || S.stage === "hold") return [5, S.helperConfirmed ? `${name} is there` : `Calling ${name} automatically · 911 if she doesn't confirm in ${D().settings.helperWaitSec} s`];
    if (S.stage === "ask") return [4, `"Are you OK?" He can't answer`];
    if (S.stage === "watch" || E.scenario) return [3, "Food went the wrong way: weak coughing that isn't clearing"];
    if (ev.length >= 4) return [2, "Risky swallow: 2+ warning signs, no cough. The band buzzes"];
    return [1, `Eating normally: safe swallow ${Math.min(3, doneSafe + (ev.some((e) => !e.done) ? 1 : 0)) || 1} of 3`];
  }
  function renderDemoBar() {
    const E = SS.engine.E, on = E.demo, sp = D().settings.speed;
    $$(".demobar").forEach((el) => {
      el.hidden = !on; if (!on) return;
      const [n, txt] = demoStep();
      const hint = n === 5 && !SS.esc.state.helperConfirmed ? `<span class="dhint">When ${H(D().contact.name)} gets there, tap "${H(D().contact.name)} is here with me" to stop the countdown.</span>` : "";
      keyed(el, n + txt + sp + hint, () => `<div class="dsegs">${[1, 2, 3, 4, 5, 6].map((i) => `<i class="${i < n ? "done" : i === n ? "cur" : ""}"></i>`).join("")}</div>
        <div class="dtext"><b>Step ${n} of 6</b><span>${H(txt)}</span>${sp > 1 ? `<span class="speedtag">timers ${sp}×</span>` : ""}</div>${hint}`);
    });
  }

  /* ---------- swallow log (every swallow, to look back on and document) ---------- */
  const SIGN = { post: "breathed in", hold: "long hold", pace: "gulping", emg: "weak muscles" };
  const signText = (v) => v.signs.length ? v.signs.map((c) => c.key === "lift" ? (c.val.startsWith("Weak and") ? "weak, late lift" : c.val.startsWith("Weak") ? "weak lift" : "late lift") : SIGN[c.key]).join(", ") : "none";
  function logTable(evs) {
    if (!evs.length) return `<p class="fine">No swallows yet. Tap Start a meal.</p>`;
    return `<table><thead><tr><th class="num">#</th><th>Time</th><th>Sip or bite</th><th>Breathing</th><th class="num">Breath hold</th><th>Signs flagged</th><th>Result</th><th>What happened</th></tr></thead><tbody>${evs.slice().reverse().map((e) => `<tr><td class="num">${e.id}</td><td class="mono">${mmss(e.mealT || 0)}</td><td>${H(e.bolus || "sip")}</td><td>${e.post === "inhale" ? "out, swallow, <b>in</b>" : "out, swallow, out"}</td><td class="num">${e.apnea.toFixed(2)} s</td><td>${H(signText(e.v))}</td><td>${pill(...LBL[e.label])}</td><td>${H(e.action || "")}</td></tr>`).join("")}</tbody></table>`;
  }
  function lastLiveMeal() { return SS.engine.E.meal || D().meals.filter((m) => m.source === "live-demo" && m.events && m.events.length).slice(-1)[0] || null; }
  function renderSwLog() {
    const m = lastLiveMeal(), evs = m ? m.events.filter((e) => e.done) : [];
    keyed($("#swLogBody"), (m ? m.id : "none") + evs.length, () => logTable(evs));
    const t = evs.length ? `${evs.length} swallow${evs.length > 1 ? "s" : ""}, ${evs.filter((e) => e.label === "risky").length} risky${SS.engine.E.meal ? " this meal" : ` (${m.label.toLowerCase()})`}` : "Every swallow this meal, to look back on later";
    if ($("#swLogCount").textContent !== t) $("#swLogCount").textContent = t;
  }

  /* ---------- Maya's phone during the emergency (the call is part of the demo) ---------- */
  function renderMayaPhone() {
    const S = SS.esc.state, C = SS.caller.state, el = $("#mayaPhone"), name = H(D().contact.name);
    const show = ["contact", "hold", "ems"].includes(S.stage);
    el.hidden = !show; if (!show) return;
    keyed(el, [S.stage, C.state, S.helperConfirmed].join("|"), () => {
      const real = C.state === "placed" || C.state === "calling", st = S.helperConfirmed ? "here" : C.state === "failed" ? "failed" : "ringing";
      const line = S.helperConfirmed ? `${name} confirmed: "I'm here with him."` : C.state === "placed" ? "Real phone call placed through Twilio. Her phone is ringing now." : C.state === "calling" ? "Placing a real phone call…" : C.state === "failed" ? H(C.detail) : "Simulated call. Set up Twilio in Settings to ring a real phone.";
      return `<span class="eyebrow">${name}'s phone</span><div class="mscreen ${st}">
        <div class="mtop">${ICON.phone}<div><small>${S.helperConfirmed ? "Call ended" : "Incoming call"}</small><b>Neurex alert</b></div>${st === "ringing" ? '<span class="mring"></span>' : ""}</div>
        <p class="mmsg">"${H(alertMessage())}"</p>
        <p class="mstate">${line}</p></div>`;
    });
  }

  /* ---------- emergency screen ---------- */
  function groundsList() {
    const g = SS.esc.grounds(), c = D().settings, name = H(D().contact.name);
    const row = (on, txt, sub) => `<li class="${on ? "on" : ""}">${on ? ICON.ok : ICON.none}<div><b>${txt}</b>${sub ? `<small>${sub}</small>` : ""}</div></li>`;
    const n = [g.weakCough, g.apnea, g.noReply].filter(Boolean).length;
    return `<ul class="grounds">${row(g.weakCough, `Weak coughing for ${c.weakCoughSec}+ s`, "vibration sensor + breath mic")}${row(g.apnea, `Breathing stopped for ${c.apneaSec}+ s`, "breath mic")}${row(g.noReply, `No answer to "Are you OK?"`, `${c.okPromptSec} s to reply`)}${row(!g.helperConfirmed, `${name} hasn't confirmed she's there`, `checked at ${c.helperWaitSec} s`)}</ul>
      <p class="fine">911 needs the last line plus at least 2 of the first 3. Right now: <b>${n} of 3</b>.</p>`;
  }
  function callStatus() {
    const C = SS.caller.state, name = H(D().contact.name);
    const map = { calling: ["calling", `Calling ${name}…`], placed: ["placed", `${name}'s phone is ringing`], failed: ["failed", "The call didn't go through"], "not-set": ["sim", `Simulated call to ${name}`], dialer: ["placed", "Dialler opened"], idle: ["calling", `Calling ${name}…`] };
    const [cls, title] = map[C.state] || map.idle;
    return `<div class="callbox ${cls}">${ICON.phone}<div><b>${title}</b><small>${H(C.detail || "Automatic call with a spoken alert.")}</small></div></div>`;
  }
  function updateOverlay() {
    const S = SS.esc.state, c = D().settings, name = H(D().contact.name), box = $("#sos");
    const show = ["ask", "contact", "hold", "ems", "resolved"].includes(S.stage);
    box.hidden = !show; document.body.classList.toggle("locked", show);
    placeGraph(show && S.stage !== "resolved" ? "sos" : "home");
    if (!show) return;
    const g = SS.esc.grounds();
    box.className = "sos " + S.stage;
    renderMayaPhone();
    keyed($("#sosBody"), [S.stage, g.weakCough, g.apnea, g.noReply, g.helperConfirmed, SS.caller.state.state, SS.engine.E.demo].join("|"), () => {
      if (S.stage === "ask") return `
          <span class="eyebrow light">Neurex</span><h2>Are you OK?</h2>
          <p class="why">${S.apneaSec >= c.apneaSec ? "Your breathing seems to have stopped." : "There's weak coughing that isn't clearing."}</p>
          <div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="ring-bg"/><circle cx="60" cy="60" r="52" class="ring-fg" data-ring="1" stroke-dasharray="326.7" stroke-dashoffset="0"/></svg><b data-bind="cd">15</b></div>
          <button class="btn big ok" data-act="imok">I'm OK</button><button class="btn big danger" data-act="help">I need help</button>
          <p class="fine light">If you don't answer, ${name} gets an automatic call.</p>`;
      if (S.stage === "contact" || S.stage === "hold") return `
          <span class="eyebrow light">Emergency</span><h2>Getting help</h2>
          ${callStatus()}
          ${S.stage === "contact" ? `<div class="ring big"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="ring-bg"/><circle cx="60" cy="60" r="52" class="ring-fg" data-ring="1" stroke-dasharray="326.7" stroke-dashoffset="0"/></svg><b><span data-bind="cd">1:30</span><small>until 911</small></b></div>`
            : `<div class="cd911">${S.manual && !(g.weakCough || g.apnea) ? `<b>911 not called automatically.</b> The band isn't picking up choking signs, so only ${name} is being alerted. Tap "Call 911 now" if you need it.` : `<b>911 not called</b>: not enough warning signs yet. Still alerting ${name}.`}</div>`}
          <button class="btn big ok" data-act="helper">${name} is here with me</button>
          <div class="row gap"><button class="btn ghost light grow" data-act="imok">I'm OK now</button>${D().contact.phone ? `<a class="btn ghost light grow" href="${H(telOf(D().contact.phone))}">Call ${name}</a>` : ""}<button class="btn ghost light grow" data-act="call911">Call 911 now</button></div>
          <div class="panel">${groundsList()}</div>`;
      if (S.stage === "ems") return `
          <span class="badge-demo">DEMO MODE · 911 NOT DIALLED</span><h2>Calling 911</h2>
          <p class="why">${name} was called and didn't confirm in ${c.helperWaitSec} seconds.</p>
          <div class="panel"><span class="eyebrow">What 911 would be told</span>
            <p class="script">"Automated alert from Neurex. ${H(D().patient.age)}-year-old man with ${H(D().patient.condition)}, possible choking at home. Detected: ${H(SS.esc.describeGrounds())}."</p>
            <span class="eyebrow">Timeline</span><ol class="timeline">${(S.alert ? S.alert.log : []).map((l) => `<li><span class="mono">+${mmss(l.at)}</span>${H(l.note)}</li>`).join("")}</ol></div>
          ${g.helperConfirmed ? `<p class="fine light">${name} is there now. Help is still on the way.</p>` : `<button class="btn big ok" data-act="helper">${name} is here now</button>`}
          <button class="btn big ghost light" data-act="closeems">Close demo</button>`;
      return `<span class="eyebrow light">All clear</span>
          <h2>${S.lastResolved && S.lastResolved.outcome === "helper" ? `${name} is with you` : "You're OK"}</h2>
          <p class="why">${H(S.lastResolved ? S.lastResolved.summary : "")}</p><p class="fine light">Saved to the Graphs tab.</p>
          <button class="btn big ok" data-act="dismiss">Done</button>`;
    });
    const ring = $('[data-ring="1"]');
    if (S.stage === "ask") { const left = c.okPromptSec - S.stageT; bind("cd", Math.max(0, Math.ceil(left))); if (ring) ring.setAttribute("stroke-dashoffset", (326.7 * (1 - Math.max(0, left) / c.okPromptSec)).toFixed(1)); }
    if (S.stage === "contact") { const left = c.helperWaitSec - S.stageT; bind("cd", mmss(left)); if (ring) ring.setAttribute("stroke-dashoffset", (326.7 * (1 - Math.max(0, left) / c.helperWaitSec)).toFixed(1)); }
  }

  /* ---------- graphs tab ---------- */
  const MIN_DAY = 30; // a day needs at least 30 swallows before its percentage is charted
  function weekRows() {
    const t0 = today0(), rows = [];
    for (let d = 6; d >= 0; d--) {
      const a = t0 - d * DAY, b = a + DAY;
      const meals = D().meals.filter((m) => m.start >= a && m.start < b && m.swallows > 0);
      const sw = meals.reduce((s, m) => s + m.swallows, 0), rk = meals.reduce((s, m) => s + m.risky, 0);
      const st = sw ? meals.reduce((s, m) => s + (m.avgStrength || 0) * m.swallows, 0) / sw : null;
      rows.push({ day: a, label: d === 0 ? "Today" : fmtShortDay(a), meals: meals.length, swallows: sw, risky: rk, pct: sw ? (100 * rk) / sw : null, strength: st, enough: sw >= MIN_DAY });
    }
    return rows;
  }
  function reportText() {
    const rows = weekRows(), p = D().patient;
    const sw = rows.reduce((s, r) => s + r.swallows, 0), rk = rows.reduce((s, r) => s + r.risky, 0), meals = rows.reduce((s, r) => s + r.meals, 0);
    const em = D().alerts.filter((a) => a.kind === "emergency" && a.start >= today0() - 6 * DAY);
    const first = rows.find((r) => r.enough), last = rows.slice().reverse().find((r) => r.enough);
    return [`Neurex report: ${p.name}, ${p.age}, ${p.condition}`, `Period: ${fmtShortDay(today0() - 6 * DAY)} to ${fmtShortDay(Date.now())}`,
      `Meals tracked: ${meals}. Swallows: ${sw}. Risky swallows: ${rk} (${sw ? ((100 * rk) / sw).toFixed(1) : 0}%).`,
      first && last && first !== last ? `Risky share went from ${first.pct.toFixed(1)}% (${first.label}) to ${last.pct.toFixed(1)}% (${last.label}).` : "",
      `Choking alerts: ${em.length}.`, `Neurex flags risk. It does not diagnose. Consider a swallow test (FEES or videofluoroscopy) if the trend is rising.`].filter(Boolean).join("\n");
  }
  let gKey = "";
  function renderGraphs(force) {
    if (tab !== "graphs") return;
    const key = D().meals.length + "|" + D().alerts.length + D().alerts.map((a) => a.outcome).join("") + "|" + $("#view-graphs").clientWidth + "|" + D().meals.reduce((s, m) => s + m.swallows, 0) + "|" + (SS.engine.E.meal ? SS.engine.E.meal.events.filter((e) => e.done).length : -1);
    if (!force && key === gKey) return; gKey = key;
    const rows = weekRows(), p = D().patient;
    const sw = rows.reduce((s, r) => s + r.swallows, 0), rk = rows.reduce((s, r) => s + r.risky, 0);
    const em = D().alerts.filter((a) => a.kind === "emergency");
    $("#gHead").innerHTML = `<div><span class="eyebrow">For family and the care team</span><h2>${H(p.name)}, ${H(p.age)}</h2><p class="sub">${H(p.condition)} · last 7 days</p></div><span class="tag">past days are demo history</span>`;
    $("#gKpi").innerHTML = `<div><b>${rows.reduce((s, r) => s + r.meals, 0)}</b><span>meals tracked</span></div><div><b>${sw.toLocaleString()}</b><span>swallows</span></div><div><b>${sw ? ((100 * rk) / sw).toFixed(1) : 0}%</b><span>risky</span></div><div><b>${em.length}</b><span>choking alerts</span></div>`;
    const top = Math.max(0, ...rows.filter((r) => r.enough).map((r) => r.pct));
    const mx = top > 15 ? Math.ceil(top / 5) * 5 : 16, tks = mx > 16 ? [0, 5, 10, 15, mx].filter((v, i, a) => a.indexOf(v) === i) : [0, 5, 10, 15];
    const few = (r) => `<b>${r.label}</b><br>${r.swallows ? `Only ${r.swallows} swallow${r.swallows > 1 ? "s" : ""} so far. A day is charted after ${MIN_DAY}.` : "No meals yet."}`;
    SS.charts.bars($("#gRisky"), { values: rows.map((r) => (r.enough ? r.pct : null)), labels: rows.map((r) => r.label), max: mx, ticks: tks, fmtTick: (v) => v + "%", every: $("#gRisky").clientWidth < 520 ? 2 : 1, ref: 10, refLabel: "10% check", aria: "Risky swallows per day", hl: (i) => rows[i].pct >= 10,
      tip: (i) => rows[i].enough ? `<b>${rows[i].label}</b><br>${rows[i].meals} meals, ${rows[i].swallows} swallows<br>${rows[i].risky} risky (${rows[i].pct.toFixed(1)}%)` : few(rows[i]) });
    const td = rows[rows.length - 1];
    $("#gRiskyNote").textContent = td.enough ? "" : td.swallows ? `Today: ${td.swallows} swallow${td.swallows > 1 ? "s" : ""} so far, ${td.risky} risky. Today's bar appears after ${MIN_DAY} swallows, so a few swallows can't make the trend look worse than it is.` : "Today: no meals tracked yet.";
    SS.charts.line($("#gStrength"), { values: rows.map((r) => (r.enough && r.strength != null ? r.strength * 100 : null)), labels: rows.map((r) => r.label), lo: 40, hi: 100, ticks: [40, 70, 100], fmtTick: (v) => v + "%", every: 2, fmt: (v) => v.toFixed(0) + "%", aria: "Voice box lift strength per day",
      tip: (i) => rows[i].enough && rows[i].strength != null ? `<b>${rows[i].label}</b><br>${(rows[i].strength * 100).toFixed(0)}% of his usual lift` : few(rows[i]) });
    const meals7 = D().meals.filter((m) => m.start >= today0() - 6 * DAY && m.swallows > 0);
    SS.charts.hbars($("#gMeal"), ["Breakfast", "Lunch", "Dinner"].map((l) => { const ms = meals7.filter((m) => m.label === l), s = ms.reduce((a, m) => a + m.swallows, 0), r = ms.reduce((a, m) => a + m.risky, 0); return [l, s ? (100 * r) / s : 0, `<b>${l}</b><br>${s} swallows, ${r} risky`]; }), 20);
    const al = D().alerts.slice().sort((a, b) => b.start - a.start).slice(0, 25);
    const oc = (a) => a.kind === "cue" ? (a.outcome === "buzzed" ? pill("warn", "Buzzed") : pill("muted", "Logged")) : ({ helper: pill("good", "Helper came"), "patient-ok": pill("good", "He was OK"), cleared: pill("good", "Cleared"), ems: pill("risk", "911 (demo)"), open: pill("warn", "Open") }[a.outcome] || pill("muted", a.outcome));
    $("#gAlerts").innerHTML = al.length ? `<ul class="alist">${al.map((a) => `<li><div class="ahead"><b>${a.kind === "cue" ? "Risky swallow" : "Choking alert"}</b>${oc(a)}<span class="mono">${fmtShortDay(a.start)}, ${fmtClock(a.start)}</span></div><p>${H(a.summary || "In progress…")}${a.source === "demo-history" ? ' <span class="tag">demo history</span>' : ""}</p></li>`).join("")}</ul>` : `<p class="fine">No alerts yet.</p>`;
    const lm = lastLiveMeal(), evs = lm ? lm.events.filter((e) => e.done) : [];
    $("#gLog").innerHTML = logTable(evs);
    $("#gLogSub").textContent = lm ? `${lm.label}, ${fmtShortDay(lm.start)} at ${fmtClock(lm.start)}${SS.engine.E.meal === lm ? " (still going)" : ""}. Every swallow, newest first. Download CSV to keep a copy.` : "Every swallow of the latest meal, newest first.";
    $("#gReport").textContent = reportText();
  }
  async function shareReport() { const text = reportText(); try { if (navigator.share) { await navigator.share({ title: "Neurex report", text }); return; } } catch (e) { if (e && e.name === "AbortError") return; } copyReport(); }
  async function copyReport() { try { await navigator.clipboard.writeText(reportText()); toast("Report copied"); } catch (e) { const r = document.createRange(); r.selectNodeContents($("#gReport")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Report selected. Copy it from the screen."); } }
  function exportCsv() {
    const rows = [["type", "time", "meal", "swallows", "risky", "band_buzzes", "swallow_no", "sip_or_bite", "breathing_after", "breath_hold_s", "signs_flagged", "result", "outcome", "summary", "source"]];
    D().meals.filter((m) => m.swallows).forEach((m) => {
      rows.push(["meal", new Date(m.start).toISOString(), m.label, m.swallows, m.risky, m.cues || 0, "", "", "", "", "", "", "", "", m.source]);
      (m.events || []).filter((e) => e.done && e.v).forEach((e) => rows.push(["swallow", new Date(e.at).toISOString(), m.label, "", "", "", e.id, e.bolus || "sip", e.post === "inhale" ? "in" : "out", e.apnea.toFixed(2), signText(e.v), LBL[e.label][1], "", e.action || "", m.source]));
    });
    D().alerts.forEach((a) => rows.push([a.kind === "cue" ? "risky_swallow_alert" : "choking_alert", new Date(a.start).toISOString(), "", "", "", "", "", "", "", "", "", "", a.outcome, a.summary, a.source]));
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    try { const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = "neurex-report.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); toast("Report downloaded"); }
    catch (e) { toast("Downloads are blocked here. Use Copy instead."); }
  }

  /* ---------- meal summary ---------- */
  function showMealSummary(m) {
    if (!m || !m.swallows) { toast("Meal saved"); return; }
    const tips = [];
    if (m.risky + (m.coughs || 0) > 0) tips.push(["Brush your teeth and tongue now", "Fewer mouth germs means less harm if anything went down the wrong way."]);
    tips.push(["Stay sitting upright for 30 minutes", "It helps food go down the right way after eating."]);
    if (m.risky >= 3) tips.push(["Mention this meal to your speech therapist", `${m.risky} risky swallows is more than usual.`]);
    $("#sheet").hidden = false;
    $("#sheetBody").innerHTML = `<span class="eyebrow">Meal summary</span><h2>${H(m.label)} done</h2>
      <div class="stats3"><div><b>${m.swallows}</b><span>swallows</span></div><div><b>${m.risky}</b><span>risky</span></div><div><b>${m.cues || 0}</b><span>band cues</span></div></div>
      <span class="eyebrow">What to do now</span><ul class="tips">${tips.map((t) => `<li>${ICON.ok}<div><b>${H(t[0])}</b><small>${H(t[1])}</small></div></li>`).join("")}</ul>
      <div class="row gap"><button class="btn primary grow" data-act="closeSheet">Done</button><a class="btn" href="#graphs" data-act="closeSheet">See graphs</a></div>`;
  }

  /* ---------- settings ---------- */
  function openSettings() {
    const c = D().contact, s = D().settings, k = D().calling || {};
    $("#sheet").hidden = false;
    $("#sheetBody").innerHTML = `<h2>Settings</h2>
      <span class="eyebrow">Emergency contact</span>
      <label for="cName">Name</label><input id="cName" value="${H(c.name)}" autocomplete="off">
      <label for="cRel">Relationship</label><input id="cRel" value="${H(c.relation)}" autocomplete="off">
      <label for="cPhone">Phone number (for the manual Call button)</label><input id="cPhone" type="tel" inputmode="tel" placeholder="+1 513 555 0142" value="${H(c.phone)}">
      <span class="eyebrow">Automatic calling (Twilio)</span>
      <label for="kUrl">Calling service link</label><input id="kUrl" placeholder="https://neurex-1234.twil.io/call" value="${H(k.url || "")}" autocomplete="off">
      <label for="kKey">Secret word</label><input id="kKey" placeholder="the DEMO_KEY you set in Twilio" value="${H(k.key || "")}" autocomplete="off">
      <p class="fine">The number that gets called is saved in Twilio, not in this app. See the README for the 15-minute setup.</p>
      <div class="row gap"><button class="btn" data-act="testCall">Send a test call</button><span class="fine" id="testState"></span></div>
      <span class="eyebrow">Safety rules</span>
      <ul class="rules"><li>Weak coughing ${s.weakCoughSec} s, or breathing stopped ${s.apneaSec} s → the band buzzes and asks "Are you OK?"</li><li>No answer in ${s.okPromptSec} s (2+ signs) → automatic call to ${H(c.name)}</li><li>${H(c.name)} doesn't confirm within ${s.helperWaitSec} s, and 2+ signs are still there → 911</li><li>A risky swallow alone never calls anyone. The band buzzes at most once every 3 minutes.</li></ul>
      <span class="eyebrow">Timer speed for presenting</span>
      <div class="seg">${[1, 2, 3].map((v) => `<button type="button" data-speed="${v}" aria-pressed="${s.speed === v}">${v === 1 ? "1× (real)" : v + "×"}</button>`).join("")}</div>
      <p class="fine">Speeds up only the 20 s, 15 s and 90 s emergency timers so a pitch stays short. Real use is 1×.</p>
      <label class="switch"><input type="checkbox" id="imm911" ${s.immediate911OnApnea ? "checked" : ""}><span>Call 911 straight away if breathing has stopped and there's no answer</span></label>
      <div class="row gap"><button class="btn primary grow" data-act="saveSettings">Save</button><button class="btn" data-act="closeSheet">Cancel</button></div>
      <hr><div id="resetBox"><button class="btn ghost danger-text" data-act="askReset">Reset demo data</button></div>`;
  }
  function saveSettings(silent) {
    SS.store.setContact({ name: $("#cName").value.trim() || "Maya", relation: $("#cRel").value.trim() || "Emergency contact", phone: $("#cPhone").value.trim() });
    SS.store.setCalling({ url: $("#kUrl").value.trim(), key: $("#kKey").value.trim() });
    SS.store.setSettings({ immediate911OnApnea: $("#imm911").checked });
    renderContact();
    if (!silent) { $("#sheet").hidden = true; toast("Saved"); }
  }

  /* ---------- clock ---------- */
  let lastT = performance.now();
  function tick(realDt) {
    const dt = realDt * (D().settings.speed || 1); // timer speed only speeds up the emergency timers, not the sensor graph
    if (dt > 0) { SS.engine.tick(realDt, dt); SS.esc.setSigns(SS.engine.E.signs); SS.esc.tick(dt); }
    const st = SS.esc.state.stage;
    SS.sound.loop(st === "ask" ? "alarm" : (st === "contact" || st === "hold") && !SS.esc.state.helperConfirmed ? "ring" : st === "ems" && !SS.esc.state.helperConfirmed ? "siren" : null);
    updateLive(); updateOverlay(); updateGraphChrome(); renderVerdict(); updateDemoBtn(); renderDemoBar(); renderSwLog(); renderGraphs(false);
  }
  setInterval(() => { const now = performance.now(); const real = Math.min(0.5, (now - lastT) / 1000); lastT = now; tick(real); }, 100);
  (function frame() { SS.strip.draw(); requestAnimationFrame(frame); })();

  /* ---------- presenter ---------- */
  function updateDemo() { const s = D().settings.speed; $$("[data-speed]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.speed === s))); }
  function skip() {
    const S = SS.esc.state, c = D().settings;
    const jump = S.stage === "watch" ? Math.max(0, c.weakCoughSec - S.weakCoughSec) + 0.3 : S.stage === "ask" ? c.okPromptSec - S.stageT : S.stage === "contact" ? c.helperWaitSec - S.stageT - 3 : 3;
    for (let i = 0; i < Math.ceil(jump * 10) + 1; i++) { SS.engine.tick(0.1); SS.esc.setSigns(SS.engine.E.signs); SS.esc.tick(0.1); }
  }

  /* ---------- events ---------- */
  function updateSoundBtn() { const on = D().settings.sound !== false, b = $("#soundBtn"); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? "Sound on" : "Sound off"); b.classList.toggle("muted", !on); }
  document.addEventListener("click", async (e) => {
    SS.sound.unlock(); // browsers only allow sound after a click
    if ($("#demo").classList.contains("open") && !e.target.closest("#demo")) $("#demo").classList.remove("open");
    const sp = e.target.closest("[data-speed]"); if (sp) { SS.store.setSettings({ speed: +sp.dataset.speed }); updateDemo(); return; }
    const sc = e.target.closest("[data-scen]"); if (sc) { SS.engine.swallow(sc.dataset.scen); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const E = SS.engine;
    switch (b.dataset.act) {
      // Start a meal runs the whole story: 3 safe swallows, 1 risky, choking, "Are you OK?", automatic call, help arrives
      case "meal": if (E.E.meal) { if (E.E.demo) E.stopDemo(); showMealSummary(E.endMeal()); updateDemoBtn(); } else { SS.esc.reset(); SS.caller.reset(); E.playDemo(); } break;
      case "imok": SS.esc.patientOK(); E.stopScenario(); break;
      case "help": SS.esc.manualHelp(); break;
      case "helper": SS.esc.helperConfirm(); if (SS.esc.state.stage === "resolved") E.stopScenario(); break;
      case "call911": SS.esc.manual911(); break;
      case "closeems": SS.esc.closeEms(); E.stopScenario(); SS.caller.reset(); E.E.demo = false; break;
      case "dismiss": SS.esc.dismiss(); SS.caller.reset(); if (E.E.demo) E.E.demo = false; break;
      case "settings": openSettings(); break;
      case "sound": SS.store.setSettings({ sound: D().settings.sound === false }); updateSoundBtn(); if (D().settings.sound) SS.sound.play("watch"); else SS.sound.stopAll(); break;
      case "closeSheet": $("#sheet").hidden = true; break;
      case "saveSettings": saveSettings(); break;
      case "testCall": { saveSettings(true); const st = $("#testState"); st.textContent = "Calling…"; const ok = await SS.caller.call(`This is a Neurex test call for ${D().contact.name}. Automatic calling works.`); st.textContent = ok ? "Test call placed. Your phone should ring." : SS.caller.state.detail; SS.caller.reset(); break; }
      case "askReset": $("#resetBox").innerHTML = `<p class="fine">This clears meals, alerts, the contact and calling settings on this device.</p><div class="row gap"><button class="btn danger" data-act="doReset">Yes, reset</button><button class="btn" data-act="noReset">Keep data</button></div>`; break;
      case "noReset": $("#resetBox").innerHTML = `<button class="btn ghost danger-text" data-act="askReset">Reset demo data</button>`; break;
      case "doReset": E.endMeal(); SS.esc.reset(); SS.store.reset(); $("#sheet").hidden = true; renderContact(); gKey = ""; toast("Demo data reset"); break;
      case "share": shareReport(); break;
      case "copy": copyReport(); break;
      case "export": exportCsv(); break;
      case "demo": $("#demo").classList.toggle("open"); break;
      case "dDemo":
        if (E.E.demo) { E.stopDemo(); SS.esc.reset(); SS.caller.reset(); }
        else { SS.esc.reset(); SS.caller.reset(); E.playDemo(); $("#demo").classList.remove("open"); if (location.hash !== "#live" && location.hash) location.hash = "#live"; }
        updateDemoBtn(); break;
      case "dStart": if (!E.E.meal) E.startMeal(); break;
      case "dEnd": if (E.E.meal) { if (E.E.demo) E.stopDemo(); showMealSummary(E.endMeal()); updateDemoBtn(); } break;
      case "dChoke": if (SS.esc.state.stage !== "idle") SS.esc.reset(); SS.caller.reset(); if (E.E.demo || E.E.auto) E.stopDemo(); E.startChoking(); $("#demo").classList.remove("open"); break;
      case "dSkip": skip(); break;
      default: break;
    }
  });
  let lastStage = "idle";
  SS.esc.on((S) => {
    if (S.stage === "resolved" && SS.engine.E.scenario) SS.engine.stopScenario();
    if (S.stage === "resolved" && lastStage !== "resolved") { SS.sound.loop(null); SS.sound.play("clear"); }
    lastStage = S.stage;
  });
  SS.caller.on(() => { /* overlay re-renders from its key */ });
  window.addEventListener("hashchange", route);
  window.addEventListener("resize", () => { gKey = ""; SS.strip.resize(); });
  SS.strip.init($("#strip")); bindGraphTip();

  SS.store.load();
  renderContact(); updateDemo(); updateSoundBtn(); route();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { /* optional */ });
})(window.SS);
