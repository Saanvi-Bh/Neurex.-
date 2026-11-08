"""Neurex backend: serves the trained swallow detector.

Run:   uvicorn server:app --port 8000
POST /predict   {"samples": [[x, y, z], ...], "calibration": [[x, y, z], ...]}
                samples: one second of accelerometer data at 100 samples/s
                calibration: about 3 seconds of the same person sitting still (sent once per meal, like the ESP32's calibration)
                -> {"swallow_probability": 0.93, "is_swallow": true}
GET  /health    -> model info and its tested accuracy
"""
import json, math
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from features import window_features, quiet_scale

import os
MODEL = json.load(open(os.environ.get("NEUREX_MODEL", os.path.join(os.path.dirname(os.path.abspath(__file__)), "model.json"))))
app = FastAPI(title="Neurex backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class Window(BaseModel):
    samples: list[list[float]]
    calibration: list[list[float]]

def score(samples, calibration):
    acc, cal = np.asarray(samples, float), np.asarray(calibration, float)
    if acc.ndim != 2 or acc.shape[1] != 3 or len(acc) < 20 or cal.ndim != 2 or cal.shape[1] != 3 or len(cal) < 100:
        raise HTTPException(400, "send ~1 s of [x, y, z] samples and ~3 s of still calibration")
    acc = (acc - np.median(cal, 0)) / quiet_scale(cal)
    z = (window_features(acc) - np.array(MODEL["mean"])) / np.array(MODEL["scale"])
    return 1 / (1 + math.exp(-(float(z @ np.array(MODEL["coef"])) + MODEL["intercept"])))

@app.post("/predict")
def predict(w: Window):
    p = score(w.samples, w.calibration)
    return {"swallow_probability": round(p, 3), "is_swallow": p > 0.5}

@app.get("/health")
def health():
    return {k: MODEL[k] for k in ("type", "trained_on", "cv_auc", "cv_sensitivity", "cv_precision")}
