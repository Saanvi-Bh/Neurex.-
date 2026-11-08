# Neurex

A meal-time neck band that catches **silent aspiration** in people with Parkinson's. That's when food or drink goes into the windpipe with no cough. If the person starts choking and can't answer, the app **calls their emergency contact automatically** and counts down to 911.

> **Demo status:** the app runs on simulated sensor readings. Our hardware (ESP32 + accelerometer) is shown separately and isn't connected to the app yet. 911 is **never** dialled.

## Try it

Open the app and tap **Start a meal**. The whole story plays on its own:

| Step | What happens | What you see and hear |
|---|---|---|
| 1 | 3 safe swallows (bite, sip, bite) | Live 4-sensor graph, green swallow bands, all 6 checks pass, no sound (normal swallows stay quiet) |
| 2 | A silent risky swallow | Red band, 4 warning signs agree with no cough, band buzzes ("Pause and clear your throat"), double ping + buzz |
| 3 | Food went the wrong way | Weak coughing on the graph that doesn't clear |
| 4 | "Are you OK?" | Full-screen check with a 15 s countdown and a repeating alarm. He can't answer |
| 5 | Automatic call to the emergency contact | Real phone call through Twilio (or a clearly marked simulated call), phone ringtone, 90 s countdown to 911 |
| 6 | Help arrives | Tap "Maya is here with me" to stop the countdown and play the all-clear chime. If no one taps it, the 911 screen shows what 911 would be told (never dialled) |

The **Graphs** tab is for family and the care team. It has risky swallows per day, voice box lift trend, riskiest meal, every alert and how it ended, a swallow-by-swallow log, a shareable report and a CSV download.

## What's in this repo

| Folder | What it is | Status |
|---|---|---|
| `frontend/` | The app. Plain HTML, CSS and JavaScript, no build step. Opens from a link and can be added to a phone's home screen. | Working |
| `twilio/` | A small Twilio Function that places the real phone call. | Working |
| `backend/` | Server, database and a swallow model trained on the University of Pittsburgh swallowing dataset. | Next |
| `hardware/` | ESP32 + accelerometer code and wiring. | Next |

### Frontend files

| File | What it does |
|---|---|
| `index.html` | The screens: Live tab, Graphs tab, emergency screen, settings |
| `css/styles.css` | Calm light theme |
| `js/engine.js` | Demo band. Simulates the 4 sensors and checks each swallow for warning signs |
| `js/strip.js` | The live 4-sensor graph |
| `js/escalation.js` | The emergency rules. The only place that decides who gets called and when |
| `js/call.js` | Asks the Twilio Function to ring the emergency contact |
| `js/sound.js` | Warning pings, buzz, alarm, ringtone, siren and chime, made with Web Audio (no sound files). Normal swallows are silent |
| `js/store.js` | Saves meals and alerts on the device. Stands in for the backend database |
| `js/charts.js` | Small SVG charts for the Graphs tab |
| `js/app.js` | Connects everything to the screens |

## How a swallow is checked

The band can't see food going into the airway. It looks for warning signs that research links to aspiration, and it only acts when **2 or more agree**.

| Check | Sensor | Warning sign |
|---|---|---|
| Breathing right after | breath mic | Breathed **in** right after swallowing (about 93% of healthy swallows are followed by breathing out) |
| Breath hold | mic + vibration | Longer than 1.2 s (normal is about 0.7 s) |
| Time since last swallow | vibration | Another swallow within 2 s (gulping) |
| Voice box lift | bioimpedance | Weak or late |
| Swallow muscles | sEMG | Weaker than usual |
| Cough within 3 s | breath mic | Coughed: the body noticed |

- **0 signs:** safe, counted quietly.
- **1 sign:** logged only, no buzz.
- **2+ signs, no cough:** risky and silent. The band buzzes, at most once every 3 minutes, so it doesn't interrupt every bite.
- **Cough:** logged, with a tip on the phone.

The cut-offs are examples. The real band would learn each person's usual swallow during their clinical swallow test.

## The emergency rules (`frontend/js/escalation.js`)

1. **Warning sign:** weak, ineffective coughing for **20 s**, or breathing stopped for **10 s**.
2. **Ask:** the band buzzes and the phone asks **"Are you OK?"** for **15 s**.
3. **No reply:** the emergency contact is called automatically.
4. **911 after 90 s**, but only if **all** of these are true:
   - the contact has **not** confirmed they're there
   - at least **2 of 3** grounds are met: weak coughing 20+ s, breathing stopped 10+ s, no reply to "Are you OK?"
   - a warning sign is **still** happening

One glitchy reading can never call 911. A risky swallow on its own never calls anyone.

Why these numbers: MedlinePlus lists weak, ineffective coughing and trouble breathing as danger signs of choking. It says brain damage can begin in as little as 4 minutes without oxygen, so the whole ladder reaches 911 in about 2 minutes.

## Run it

**Online with GitHub Pages:** in this repo go to **Settings → Pages**, choose branch **main** and folder **/ (root)**, then save. After a minute the app is live at `https://<your-username>.github.io/<repo-name>/`.

**Online with Netlify:** go to [app.netlify.com/drop](https://app.netlify.com/drop) and drag the `frontend` folder onto the page.

**On a laptop:** open a terminal in `frontend/`, run `python3 -m http.server 8000`, then open `http://localhost:8000`.

On a phone, open the link and choose **Add to Home Screen**.

## Automatic calling setup (Twilio, about 15 minutes)

The phone number that gets called is stored in Twilio, **never in this code**.

1. Sign up at [twilio.com/try-twilio](https://www.twilio.com/try-twilio) and verify the phone number that should be called. A free trial can only call verified numbers.
2. Get your free Twilio phone number from the console.
3. Go to **Functions and Assets → Services**, create a service and add a function at the path `/call`. Set its visibility to **Public** and paste in `twilio/call.js`.
4. Under **Environment Variables** add:
   - `ALERT_TO`: the emergency contact's number, e.g. `+15135550142`
   - `TWILIO_FROM`: your Twilio number
   - `DEMO_KEY`: any secret word
5. Keep "Add my Twilio Credentials to ENV" ticked. Click **Deploy All** and copy the function's URL.
6. In the app, open **Settings** (gear icon), paste the URL and the secret word, then tap **Send a test call**.

On a trial account, Twilio plays a short trial message first and asks the person answering to press a key before the alert is read out.

## Settings

- **Emergency contact:** name, relationship and phone number. The number is used for the manual "Call" button.
- **Timer speed for presenting:** 1× (real), 2× or 3×. Speeds up only the 20 s, 15 s and 90 s emergency timers. A "timers 3×" tag shows on screen whenever it's not 1×.
- **Sound:** the speaker button in the header mutes or unmutes.
- **Presenter controls** (single swallows, choking only, skip ahead) are hidden. To bring them back, remove `hidden` from `<div id="demo">` in `frontend/index.html`.

## What's real and what's simulated

| Part | Real | Simulated |
|---|---|---|
| Screens, swallow checks, emergency rules, saving data on the device | ✓ | |
| Phone call to the emergency contact (with Twilio set up) | ✓ | |
| 911 call | | ✓ never dialled; shows what would be sent |
| Sensor readings | | ✓ `frontend/js/engine.js`, shaped like published swallow recordings |
| The past 6 days in Graphs | | ✓ marked "demo history" |

## Sources

- Choking danger signs and timing: MedlinePlus, *Choking, adult or child over 1 year*. https://medlineplus.gov/ency/article/000049.htm
- Breathing around a swallow (92.7% breathe out, swallow, breathe out; about 0.7 s breath hold): *Journal of Speech, Language, and Hearing Research*, 2020.
- People with Parkinson's breathe in after swallowing more often: Gross et al., 2008, University of Pittsburgh.
- Swallow model (planned): Khalifa, Donohue, Coyle and Sejdić, *Swallowing High Resolution Cervical Auscultation Signals*, University of Pittsburgh, Zenodo 2021, CC BY 4.0. https://zenodo.org/records/4539695

Neurex flags risk and helps get people tested sooner. It does not diagnose.
