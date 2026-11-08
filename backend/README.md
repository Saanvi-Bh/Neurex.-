# Neurex backend: swallow detector

The app's demo runs on simulated signals. This backend is how Neurex learns to recognise a **real swallow** from a neck accelerometer, using clinical recordings.

## How it fits

```
ESP32 + accelerometer on the neck  ──USB/Bluetooth──▶  phone app  ──1 s of [x,y,z]──▶  backend /predict
        (hardware/)                                    (frontend/)                       (this folder)
                                                                                              │
                         University of Pittsburgh dataset ──▶ train.py ──▶ model.json ────────┘
```

## Status

| Part | File | Status |
|---|---|---|
| Download the dataset | `download_data.py` | Ready |
| Turn 1 s of movement into 15 measurements | `features.py` | Ready |
| Train and test on patients the model never saw | `train.py` | Ready, pipeline tested |
| API the app calls | `server.py` | Ready |
| Self-test with fake data (no download needed) | `test_backend.py` | Ready |
| Trained model on the real dataset | `model.json` | Next (needs the 1.4 GB download) |
| Connect the app and ESP32 to the API | `frontend/`, `hardware/` | Next |

## The data

**Source:** University of Pittsburgh swallowing dataset (Khalifa, Donohue, Coyle & Sejdić, Zenodo 2021, [records/4539695](https://zenodo.org/records/4539695), CC BY 4.0).
- 248 patients and 3,144 swallows.
- Signals: a 3-axis accelerometer on the front of the neck (over the cricoid) plus a microphone, sampled at 4 kHz.
- Labels: the start and end of every swallow, timed from X-ray swallow video.
- It isn't stored here because it's 1.4 GB. See `data/README.md`.

## How the model learns

1. Keep the 3 accelerometer axes and slow them from 4,000 to 100 samples a second, the same as our ESP32.
2. Scale each recording by the person's quiet level, so loud and quiet sensors are comparable.
3. Cut the recordings into 1-second windows and label each one *swallow* or *not*, using the X-ray timings.
4. Measure 15 features per window: movement size, peaks, jerkiness, and how the energy splits across frequency bands.
5. Train a logistic regression and test it with 5-fold cross-validation **split by patient**, so the test patients are never seen during training.
6. Save `model.json`. It's small enough for the server, the app, or even the ESP32 to use.

**Limit:** the dataset marks *when* swallows happen, not whether they were risky. This model detects swallows. A risk model needs aspiration-labelled data, which is our next step with clinical partners.

## Run it

```
pip install -r requirements.txt
python test_backend.py                        # 1 minute: proves the pipeline works on fake data
python download_data.py                       # downloads the real dataset (1.4 GB)
python train.py --data data --limit 200       # quick training (drop --limit to use all)
uvicorn server:app --port 8000                # API at http://localhost:8000/docs
```

## API

`POST /predict`
```json
{ "samples": [[x, y, z], ...],      // 1 s at 100 samples/s
  "calibration": [[x, y, z], ...] } // ~3 s of sitting still, once per meal
```
→ `{ "swallow_probability": 0.93, "is_swallow": true }`

`GET /health` returns the model info and its tested accuracy.
