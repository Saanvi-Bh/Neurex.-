# Neurex

**A meal-time neck band that catches silent choking in Parkinson's and calls for help in severe cases.**

MakeUC 2026 · Team: Sahana Gopinathan & Saanvi Bhutani

**Live app:** https://saanvi-bh.github.io/Neurex/ · **Video:** https://youtu.be/eUWsSaOVezo

---

## The problem

Many people with Parkinson's have trouble swallowing. Food or drink can slip into the windpipe with **no cough** (*silent aspiration*), so nobody notices. This can lead to choking or pneumonia. 

## How Neurex works

A soft band is worn only at meals. A small pod sits on the front of the neck.

| Part | What it does |
|---|---|
| **Vibration sensor** (accelerometer) | Feels each swallow through the skin, including a slow or weak voice box lift |
| **Breath mic** | Hears whether air rushes **in** right after the swallow |
| **Cough check** | Listens for 3 seconds: did the body cough to clear it? |
| **ESP32 (the brain)** | Combines the 3 signs. When they agree, the swallow is risky |
| **Haptic motor** | Buzzes a silent warning on the neck |
| **Phone app** | Shows what to do, calls the emergency contact if needed, and keeps the record for family and doctors |

**Our prototype:** an ESP32 with a Grove 3-axis accelerometer, which records swallows from the neck. The breath mic and haptic motor are the next parts to add.

## Try the app

Open the live link and tap **Start a meal**. The full story plays on its own, the same as in our video:

| Step | What happens |
|---|---|
| 1 | 3 normal swallows. The live graph shows each one and every check passes |
| 2 | A risky swallow with no cough. The warning signs agree, the band buzzes, and the phone says "Pause and clear your throat" |
| 3 | The food went the wrong way: weak coughing that doesn't clear |
| 4 | The phone asks **"Are you OK?"** He can't answer |
| 5 | The app **automatically phones the emergency contact** (in the demo, his daughter Maya) and starts a **90-second countdown** to 911 |
| 6 | Maya arrives and taps "Maya is here with me." If nobody confirms, the app shows what 911 would be told (never actually dialled in the demo) |

The **Graphs** tab is for family and the care team. It shows risky swallows per day, swallow strength over the week, the riskiest meal, every alert and how it ended, a swallow-by-swallow log, a shareable report and a CSV download.

## When it calls for help

All of the call rules live in one file, `frontend/js/escalation.js`, so every decision can be explained.

1. **Warning sign:** weak, ineffective coughing for **20 s**, or breathing stopped for **10 s**.
2. **Check:** the band buzzes and the phone asks **"Are you OK?"** for **15 s**.
3. **No answer:** the emergency contact is called automatically.
4. **911 after 90 s**, only if **all** of these are true:
   - the contact hasn't confirmed they're there
   - at least **2 of 3** danger signs are met: weak coughing, breathing stopped, no answer
   - a sign is **still** happening

A single glitchy reading can never call 911. A risky swallow on its own only buzzes the band and goes into the report.

**Why these numbers:** MedlinePlus lists weak, ineffective coughing and trouble breathing as choking danger signs, and warns that brain damage can begin in as little as 4 minutes without oxygen. Our rules reach 911 in about 2 minutes. ([MedlinePlus: Choking, adult](https://medlineplus.gov/ency/article/000049.htm))

## What's in this repo

| Path | What it is |
|---|---|
| `frontend/` | The app: plain HTML, CSS and JavaScript, no build step |
| `frontend/js/engine.js` | Simulated band: makes the sensor signals and checks each swallow |
| `frontend/js/escalation.js` | The emergency rules |
| `frontend/js/strip.js` | The live sensor graph |
| `frontend/js/call.js` + `twilio/call.js` | The automatic phone call |
| `frontend/js/sound.js` | Warning sounds, alarm, ringtone (made with Web Audio, no files) |
| `frontend/js/store.js` | Saves history on the device |
| `index.html` | Sends visitors straight to the app |

## Run it yourself

- **Online:** in this repo go to **Settings → Pages**, choose branch `main` and folder `/ (root)`, then save.
- **On a laptop:** run `python3 -m http.server 8000` inside `frontend/`, then open `http://localhost:8000`.

### Real phone calls 

The phone number that gets called is kept in Twilio

1. Sign up at [twilio.com/try-twilio](https://www.twilio.com/try-twilio) and verify the number that should be called.
2. Get a free Twilio number.
3. Go to **Functions and Assets → Services**, create a service and add a function at `/call`. Set it to **Public** and paste in `twilio/call.js`.
4. Add these environment variables:
   - `ALERT_TO`: the number to call
   - `TWILIO_FROM`: your Twilio number
   - `DEMO_KEY`: any secret word
5. Click **Deploy All**.
6. In the app's **Settings**, paste the function URL and secret word, then tap **Send a test call**.

On a trial account, the person answering has to press a key before the alert plays.

## What's next
- Add the breath mic and haptic motor to the band
- Tune the band to each person's usual swallow, using their clinical swallow test

---

Neurex flags risk and helps people get tested sooner. It does not diagnose.
