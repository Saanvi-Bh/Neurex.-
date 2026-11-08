/* Twilio Function: /call
   Rings the emergency contact and reads out the Neurex alert.

   Environment variables (Twilio Console > Functions > your service > Settings > Environment Variables):
     ALERT_TO     the emergency contact's phone number, e.g. +15135550142 (must be verified on a trial account)
     TWILIO_FROM  your Twilio phone number, e.g. +15135550199
     DEMO_KEY     any secret word; the app sends it so strangers can't trigger calls
   Also keep "Add my Twilio Credentials (ACCOUNT_SID) and (AUTH_TOKEN) to ENV" ticked.
   Set this function's visibility to Public. */
exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader("Access-Control-Allow-Origin", "*");
  response.appendHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.appendHeader("Access-Control-Allow-Headers", "Content-Type");
  response.appendHeader("Content-Type", "application/json");

  if (!event.key || event.key !== context.DEMO_KEY) {
    response.setStatusCode(401);
    response.setBody({ ok: false, error: "wrong key" });
    return callback(null, response);
  }
  const clean = (s) => String(s || "").replace(/[<>&"']/g, " ").slice(0, 300);
  const message = clean(event.message) || "Neurex alert. Possible choking. No response. Please go to him now.";
  const twiml = `<Response><Say voice="alice">${message}</Say><Pause length="1"/><Say voice="alice">${message}</Say></Response>`;
  try {
    const call = await context.getTwilioClient().calls.create({ to: context.ALERT_TO, from: context.TWILIO_FROM, twiml });
    response.setBody({ ok: true, sid: call.sid });
  } catch (err) {
    response.setStatusCode(500);
    response.setBody({ ok: false, error: err.message });
  }
  return callback(null, response);
};
