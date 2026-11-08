"""Features for one window of neck accelerometer data.
Shared by training (train.py) and the server (server.py) so both measure swallows the same way."""
import numpy as np

FS = 100          # samples per second, the same speed as the Neurex band (ESP32 + accelerometer)
WIN = 1.0         # window length in seconds
def quiet_scale(acc):
    """Typical size of quiet (non-swallow) movement on each axis: median absolute deviation."""
    acc = np.asarray(acc, float)
    return 1.4826 * np.median(np.abs(acc - np.median(acc, 0)), 0) + 1e-9

def window_features(acc):
    """acc: array (n, 3) of accelerometer readings (any units, already standardised per recording)."""
    acc = np.asarray(acc, float)
    acc = acc - acc.mean(axis=0)                       # remove posture / gravity
    mag = np.sqrt((acc ** 2).sum(axis=1))
    f = []
    for k in range(3):
        a = acc[:, k]
        f += [a.std(), np.abs(a).max(), (np.diff(np.sign(a)) != 0).mean(), np.abs(np.diff(a)).mean()]
    spec = np.abs(np.fft.rfft(mag - mag.mean())) ** 2
    freqs = np.fft.rfftfreq(len(mag), 1 / FS)
    total = spec.sum() + 1e-12
    for lo, hi in [(0, 3), (3, 10), (10, 25), (25, 50)]:
        f.append(spec[(freqs >= lo) & (freqs < hi)].sum() / total)
    f += [mag.std(), mag.max(), np.percentile(mag, 90)]
    return np.array(f)

FEATURE_NAMES = [f"{ax}_{m}" for ax in ("ap", "si", "ml") for m in ("std", "peak", "zero_cross", "jerk")] + \
                ["band_0_3hz", "band_3_10hz", "band_10_25hz", "band_25_50hz", "mag_std", "mag_peak", "mag_p90"]
