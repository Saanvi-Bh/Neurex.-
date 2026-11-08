/* escalation.js
   The emergency ladder. This is the only place that decides who gets called and when.

   STAGES
     idle      nothing wrong
     watch     a warning sign started (weak coughing, or breathing stopped)
     ask       the sign lasted long enough -> band buzzes, phone asks "Are you OK?" for 15 s
     contact   no reply -> call the emergency contact (Maya); 90 s timer starts
     hold      90 s passed but there are NOT enough grounds for 911 -> keep alerting Maya, no 911
     ems       911 (in demo mode it is NEVER dialled; the screen shows what would be sent)
     resolved  he said he's OK, or Maya confirmed she is with him, or the signs stopped

   VALID GROUNDS FOR 911 (all checked at the 90 s mark)
     1. weak, ineffective coughing for 20+ s        (MedlinePlus choking danger sign)
     2. breathing stopped for 10+ s                 (needs the breath sensor; simulated in the demo)
     3. no reply to "Are you OK?" within 15 s
     4. the helper has NOT confirmed "I'm with him" within 90 s
   911 is called only if #4 is true AND at least 2 of #1-#3 are true
   AND a warning sign is still happening. One glitchy reading can never call 911. */
window.SS = window.SS || {};
(function (SS) {
  "use strict";
  const listeners = [];
  const S = {
    stage: "idle", t: 0, stageT: 0,
    signs: { weakCough: false, apnea: false },
    weakCoughSec: 0, apneaSec: 0, quietSec: 0,
    noReply: false, helperConfirmed: false, manual: false,
    alert: null, lastResolved: null,
  };
  const cfg = () => SS.store.data.settings;
  const emit = () => listeners.forEach((f) => f(S));

  function log(note) {
    if (!S.alert) return;
    S.alert.log.push({ at: Math.round(S.t * 10) / 10, stage: S.stage, note });
    SS.store.updateAlert(S.alert);
  }
  function go(stage, note) { S.stage = stage; S.stageT = 0; log(note); emit(); }
  function grounds() {
    const c = cfg();
    return {
      weakCough: S.weakCoughSec >= c.weakCoughSec,
      apnea: S.apneaSec >= c.apneaSec,
      noReply: S.noReply,
      helperConfirmed: S.helperConfirmed,
    };
  }
  function startAlert(why) {
    S.t = 0; S.weakCoughSec = 0; S.apneaSec = 0; S.quietSec = 0; S.noReply = false; S.helperConfirmed = false;
    S.alert = SS.store.addAlert({ id: "a" + Date.now(), start: Date.now(), source: "live-demo", kind: "emergency", outcome: "open", summary: "", grounds: {}, log: [] });
    S.stage = "watch"; S.stageT = 0; log(why); emit();
  }
  function finish(outcome, summary) {
    if (S.alert) { S.alert.outcome = outcome; S.alert.summary = summary; S.alert.grounds = grounds(); S.alert.end = Date.now(); SS.store.updateAlert(S.alert); }
    S.lastResolved = { outcome, summary, at: Date.now() };
    go("resolved", summary);
  }

  SS.esc = {
    state: S,
    on(f) { listeners.push(f); },
    grounds,
    setSigns(signs) { S.signs = signs; },

    tick(dt) {
      const c = cfg();
      const active = S.signs.weakCough || S.signs.apnea;
      if (S.stage === "idle" || S.stage === "resolved") {
        if (active && S.stage === "idle") startAlert(S.signs.apnea ? "Breathing stopped" : "Weak coughing started");
        return;
      }
      S.t += dt; S.stageT += dt;
      if (S.signs.weakCough) S.weakCoughSec += dt;
      if (S.signs.apnea) S.apneaSec += dt;
      S.quietSec = active ? 0 : S.quietSec + dt;

      if (S.stage === "watch") {
        if (S.weakCoughSec >= c.weakCoughSec || S.apneaSec >= c.apneaSec) {
          go("ask", S.apneaSec >= c.apneaSec ? `Breathing stopped ${c.apneaSec}+ s: asking "Are you OK?"` : `Weak coughing ${c.weakCoughSec}+ s: asking "Are you OK?"`);
        } else if (S.quietSec >= 5) finish("cleared", "Warning signs stopped on their own. No calls made.");
      } else if (S.stage === "ask") {
        if (S.stageT >= c.okPromptSec) {
          S.noReply = true;
          if (c.immediate911OnApnea && S.apneaSec >= c.apneaSec) { go("ems", "No reply and breathing stopped: calling 911 and Maya together"); SS.app && SS.app.onEms(); SS.app && SS.app.onContact(); }
          else { go("contact", `No reply in ${c.okPromptSec} s: calling ${SS.store.data.contact.name}`); SS.app && SS.app.onContact(); }
        }
      } else if (S.stage === "contact") {
        if (S.stageT >= c.helperWaitSec) {
          const g = grounds();
          const n = [g.weakCough, g.apnea, g.noReply].filter(Boolean).length;
          if (!g.helperConfirmed && n >= 2 && active) { go("ems", `${c.helperWaitSec} s passed, helper not confirmed, ${n} grounds met: calling 911`); SS.app && SS.app.onEms(); }
          else go("hold", `${c.helperWaitSec} s passed but only ${n} ground(s) met: not calling 911, still alerting ${SS.store.data.contact.name}`);
        }
      } else if (S.stage === "hold") {
        const g = grounds();
        const n = [g.weakCough, g.apnea, g.noReply].filter(Boolean).length;
        if (!g.helperConfirmed && n >= 2 && active) { go("ems", `Grounds now met (${n}): calling 911`); SS.app && SS.app.onEms(); }
        else if (S.quietSec >= 10 && !S.manual) finish("cleared", "Warning signs stopped. 911 not needed.");
      }
    },

    // ---- actions from the screens ----
    patientOK() {
      if (["watch", "ask", "contact", "hold"].includes(S.stage)) {
        const name = SS.store.data.contact.name;
        finish("patient-ok", S.stage === "ask" || S.stage === "watch"
          ? `Tapped "I'm OK" after ${Math.round(S.stageT)} s. No calls made.`
          : `Tapped "I'm OK" after ${name} was alerted. 911 not called.`);
      }
    },
    helperConfirm() {
      const name = SS.store.data.contact.name;
      if (["contact", "hold"].includes(S.stage)) {
        S.helperConfirmed = true;
        finish("helper", `${name} confirmed she was there after ${Math.round(S.stageT)} s. 911 not needed.`);
      } else if (S.stage === "ems") {
        S.helperConfirmed = true; log(`${name} arrived. 911 already on the way.`);
        if (S.alert) { S.alert.outcome = "ems"; S.alert.summary = `911 called (demo) after the ${cfg().helperWaitSec} s limit. ${name} arrived afterwards.`; S.alert.grounds = grounds(); SS.store.updateAlert(S.alert); }
        emit();
      }
    },
    manualHelp() {
      if (S.stage === "idle" || S.stage === "resolved") { startAlert('"I need help" pressed'); }
      S.manual = true; S.noReply = true;
      go("contact", `He asked for help: calling ${SS.store.data.contact.name}`);
      SS.app && SS.app.onContact();
    },
    manual911() {
      if (S.stage === "idle" || S.stage === "resolved") startAlert("911 pressed by hand");
      go("ems", "911 pressed by hand");
      if (S.alert) { S.alert.outcome = "ems"; S.alert.summary = "911 pressed by hand (demo: not dialled)."; SS.store.updateAlert(S.alert); }
      SS.app && SS.app.onEms();
    },
    closeEms() {
      if (S.stage === "ems") {
        if (S.alert && S.alert.outcome === "open") { S.alert.outcome = "ems"; S.alert.summary = `911 called (demo): ${describeGrounds()}.`; S.alert.grounds = grounds(); SS.store.updateAlert(S.alert); }
        S.stage = "idle"; S.alert = null; emit();
      }
    },
    dismiss() { if (S.stage === "resolved") { S.stage = "idle"; S.alert = null; emit(); } },
    reset() { Object.assign(S, { stage: "idle", t: 0, stageT: 0, weakCoughSec: 0, apneaSec: 0, quietSec: 0, noReply: false, helperConfirmed: false, manual: false, alert: null }); emit(); },
  };
  function describeGrounds() {
    const g = grounds(), c = cfg(), out = [];
    if (g.weakCough) out.push(`weak coughing ${c.weakCoughSec}+ s`);
    if (g.apnea) out.push(`breathing stopped ${c.apneaSec}+ s`);
    if (g.noReply) out.push(`no reply to "Are you OK?"`);
    if (!g.helperConfirmed) out.push(`helper not confirmed in ${c.helperWaitSec} s`);
    return out.join(", ");
  }
  SS.esc.describeGrounds = describeGrounds;
})(window.SS);
