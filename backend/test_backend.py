"""Quick check that the whole backend works, without downloading the real dataset.

Makes a small set of FAKE recordings in the same format as the Pittsburgh dataset
(4 columns at 4 kHz: mic, A-P, S-I, M-L, plus swallow start/end labels),
trains on them, starts the API, and asks it about one swallow and one quiet second.

Run: python test_backend.py
The accuracy printed here is on fake data, so it only proves the pipeline runs. It is not a result.
"""
import os, json, shutil, subprocess, sys, tempfile
import numpy as np

tmp = tempfile.mkdtemp(prefix="neurex_test_")
rng = np.random.default_rng(1)
os.makedirs(f"{tmp}/signals"); os.makedirs(f"{tmp}/labels")
for p in range(10):
    for r in range(2):
        x = rng.normal(0, 0.05, (4000 * 15, 4)); frames = []
        for s in rng.choice(np.arange(2, 12), 3, replace=False):
            a, b = int(s * 4000), int(s * 4000 + 3200); t = np.arange(b - a) / 4000
            x[a:b, 1:4] += (np.sin(np.pi * t / 0.8) * np.sin(2 * np.pi * 12 * t))[:, None] * rng.normal(0, 0.6, (b - a, 3))
            frames.append((a * 60 // 4000, b * 60 // 4000))
        np.savetxt(f"{tmp}/signals/p{p}_{r}.csv", x, delimiter=",", fmt="%.4f")
        np.savetxt(f"{tmp}/labels/p{p}_{r}.csv", np.array(frames), delimiter=",", fmt="%d")

print("1) Training on fake recordings...")
subprocess.run([sys.executable, "train.py", "--data", tmp, "--out", f"{tmp}/model.json"], check=True)

print("2) Asking the API...")
os.environ["NEUREX_MODEL"] = f"{tmp}/model.json"   # use the fake model only for this test; never saved here
from fastapi.testclient import TestClient
import server
c = TestClient(server.app)
cal = rng.normal(0, 0.05, (300, 3)).tolist(); t = np.arange(100) / 100
swallow = ((np.sin(np.pi * t) * np.sin(2 * np.pi * 12 * t))[:, None] * rng.normal(0, 0.6, (100, 3)) + rng.normal(0, 0.05, (100, 3))).tolist()
quiet = rng.normal(0, 0.05, (100, 3)).tolist()
print("   swallow window ->", c.post("/predict", json={"samples": swallow, "calibration": cal}).json())
print("   quiet window   ->", c.post("/predict", json={"samples": quiet, "calibration": cal}).json())
shutil.rmtree(tmp)
print("Backend pipeline works. Now train on the real data: python download_data.py && python train.py --data data --limit 200")
