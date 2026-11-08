"""Train the Neurex swallow detector on the University of Pittsburgh swallowing dataset.

Dataset: Khalifa, Donohue, Coyle & Sejdic, "Swallowing High Resolution Cervical Auscultation Signals",
Zenodo 2021, https://zenodo.org/records/4539695 (CC BY 4.0). 248 patients, 3,144 swallows.
Each signal file has 4 columns sampled at 4 kHz: microphone, A-P, S-I, M-L accelerometer.
Each label file gives swallow onset and offset as video frame numbers (60 fps): sample = frame * 4000 / 60.

What this trains: a SWALLOW DETECTOR (is this 1-second window a swallow?), using only the 3 accelerometer
axes, slowed down to 100 samples/s so it matches the Neurex band. The dataset has no risky/safe labels,
so it cannot train a risk model.

Usage:
  1. Download signals.zip and labels.zip from the Zenodo page and unzip them into data/signals and data/labels.
     Signal and label files are matched by file name.
  2. pip install -r requirements.txt
  3. python train.py --data data            (all recordings)
     python train.py --data data --limit 200 (quick run on the first 200 recordings, a few minutes)
Output: model.json (used by server.py, and small enough for the app to load) and a printed accuracy report.
"""
import argparse, glob, json, os, re
import numpy as np
from scipy import signal as sg
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import GroupKFold
from sklearn.metrics import roc_auc_score, recall_score, precision_score
from features import window_features, quiet_scale, FEATURE_NAMES, FS, WIN

RAW_FS, VIDEO_FPS, HOP = 4000, 60, 0.25

def load_table(path):
    """Read a numeric table from .csv / .txt / .npy / .mat."""
    if path.endswith(".npy"):
        return np.load(path)
    if path.endswith(".mat"):
        from scipy.io import loadmat
        m = loadmat(path)
        return max((v for k, v in m.items() if not k.startswith("__") and hasattr(v, "shape")), key=lambda v: v.size)
    with open(path) as f:
        txt = f.read()
    rows = [list(map(float, re.findall(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?", line))) for line in txt.splitlines()]
    rows = [r for r in rows if r]
    width = max(set(map(len, rows)), key=[len(r) for r in rows].count)
    return np.array([r for r in rows if len(r) == width])

def swallows_in_samples(label_path):
    """Return a list of (start, end) sample indices at 100 Hz."""
    lab = np.atleast_2d(load_table(label_path))
    pairs = lab[:, -2:] if lab.shape[1] >= 2 else lab.reshape(-1, 2)
    return [(int(a * RAW_FS / VIDEO_FPS * FS / RAW_FS), int(b * RAW_FS / VIDEO_FPS * FS / RAW_FS)) for a, b in pairs if b > a]

def recording_windows(sig_path, lab_path):
    raw = load_table(sig_path)
    acc = raw[:, 1:4]                                      # drop the microphone, keep A-P, S-I, M-L
    acc = sg.resample_poly(acc, FS, RAW_FS, axis=0)        # 4 kHz -> 100 Hz, like the band
    acc = (acc - np.median(acc, 0)) / quiet_scale(acc)    # scale by this person's quiet level (most of a recording is not swallowing)
    sw = swallows_in_samples(lab_path)
    n, w, h = len(acc), int(WIN * FS), int(HOP * FS)
    X, y = [], []
    for s in range(0, n - w, h):
        e = s + w
        overlap = max((min(e, b) - max(s, a) for a, b in sw), default=0)
        X.append(window_features(acc[s:e])); y.append(1 if overlap >= 0.5 * w else 0)
    return X, y

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--data", default="data"); ap.add_argument("--out", default="model.json")
    ap.add_argument("--limit", type=int, default=0, help="only use the first N recordings (quick run)")
    args = ap.parse_args()
    sigs = sorted(glob.glob(os.path.join(args.data, "signals", "**", "*.*"), recursive=True))
    labs = {os.path.splitext(os.path.basename(p))[0]: p for p in glob.glob(os.path.join(args.data, "labels", "**", "*.*"), recursive=True)}
    X, y, groups = [], [], []
    if args.limit: sigs = sigs[:args.limit]
    for p in sigs:
        key = os.path.splitext(os.path.basename(p))[0]
        if key not in labs: continue
        try:
            Xi, yi = recording_windows(p, labs[key])
        except Exception as e:
            print("skipped", p, e); continue
        X += Xi; y += yi; groups += [key.split("_")[0]] * len(yi)   # group by patient so test patients are never seen in training
    X, y, groups = np.array(X), np.array(y), np.array(groups)
    print(f"{len(set(groups))} patients, {len(y)} windows, {y.mean():.1%} contain a swallow")

    aucs, sens, prec = [], [], []
    for tr, te in GroupKFold(n_splits=5).split(X, y, groups):
        sc = StandardScaler().fit(X[tr]); clf = LogisticRegression(max_iter=2000, class_weight="balanced").fit(sc.transform(X[tr]), y[tr])
        p = clf.predict_proba(sc.transform(X[te]))[:, 1]
        aucs.append(roc_auc_score(y[te], p)); sens.append(recall_score(y[te], p > 0.5)); prec.append(precision_score(y[te], p > 0.5, zero_division=0))
    print(f"Tested on unseen patients (5-fold): AUC {np.mean(aucs):.3f}, sensitivity {np.mean(sens):.1%}, precision {np.mean(prec):.1%}")

    sc = StandardScaler().fit(X); clf = LogisticRegression(max_iter=2000, class_weight="balanced").fit(sc.transform(X), y)
    model = {"type": "logistic_swallow_detector", "fs": FS, "window_s": WIN, "features": FEATURE_NAMES,
             "mean": sc.mean_.tolist(), "scale": sc.scale_.tolist(), "coef": clf.coef_[0].tolist(), "intercept": float(clf.intercept_[0]),
             "cv_auc": float(np.mean(aucs)), "cv_sensitivity": float(np.mean(sens)), "cv_precision": float(np.mean(prec)),
             "trained_on": "University of Pittsburgh HRCA dataset, Zenodo 4539695 (CC BY 4.0)"}
    json.dump(model, open(args.out, "w"), indent=1)
    print("saved", args.out)

if __name__ == "__main__":
    main()
