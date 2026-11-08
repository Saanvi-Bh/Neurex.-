/* call.js
   Places a REAL phone call to the emergency contact through a Twilio Function
   (see /twilio/call.js and the README for the 15-minute setup).
   The phone number itself is stored in Twilio, never in this code. */
window.SS = window.SS || {};
(function (SS) {
  "use strict";
  const C = { state: "idle", detail: "", at: 0 };
  const listeners = [];
  const emit = () => listeners.forEach((f) => f(C));
  SS.caller = {
    state: C,
    on(f) { listeners.push(f); },
    configured() { const c = SS.store.data.calling || {}; return !!(c.url && c.key); },
    async call(message) {
      const cfg = SS.store.data.calling || {};
      if (!cfg.url || !cfg.key) { C.state = "not-set"; C.detail = "Automatic calling isn't set up yet (Settings)."; emit(); return false; }
      C.state = "calling"; C.detail = "Placing the call…"; C.at = Date.now(); emit();
      try {
        const res = await fetch(cfg.url, { method: "POST", body: new URLSearchParams({ key: cfg.key, message: message.slice(0, 300) }) });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) { C.state = "placed"; C.detail = "Call placed. Their phone is ringing."; }
        else { C.state = "failed"; C.detail = data.error ? `Call failed: ${data.error}` : `Call failed (error ${res.status}).`; }
      } catch (e) { C.state = "failed"; C.detail = "Call failed: couldn't reach the calling service."; }
      emit();
      return C.state === "placed";
    },
    reset() { C.state = "idle"; C.detail = ""; emit(); },
  };
})(window.SS);
