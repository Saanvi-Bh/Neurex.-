# Data (not stored in this repo)

This folder is filled by `python download_data.py`. The data is 1.4 GB, which is too large for GitHub.

**Source:** Khalifa, Donohue, Coyle & Sejdić, *Swallowing High Resolution Cervical Auscultation Signals*, University of Pittsburgh, Zenodo 2021. https://zenodo.org/records/4539695 · DOI 10.5281/zenodo.4539695 · License CC BY 4.0

**Contents:**
- 248 patients with swallowing problems, 3,144 swallows.
- Signals: 3-axis accelerometer on the skin over the cricoid cartilage (front-back, up-down, side-to-side) plus a microphone, sampled at 4 kHz.
- Labels: the start and end of each swallow, timed from synced videofluoroscopy (X-ray video) at 60 frames per second.

After downloading you'll have `data/signals/` and `data/labels/`.
