"""Downloads the University of Pittsburgh swallowing dataset into data/ (about 1.4 GB).
Source: https://zenodo.org/records/4539695 (CC BY 4.0). Run: python download_data.py"""
import os, sys, urllib.request, zipfile

FILES = {"labels": "https://zenodo.org/records/4539695/files/labels.zip?download=1",
         "signals": "https://zenodo.org/records/4539695/files/signals.zip?download=1"}
HERE = os.path.dirname(os.path.abspath(__file__))

def progress(blocks, size, total):
    if total > 0:
        sys.stdout.write(f"\r  {min(100, blocks * size * 100 // total)}%"); sys.stdout.flush()

for name, url in FILES.items():
    zpath = os.path.join(HERE, "data", name + ".zip")
    out = os.path.join(HERE, "data", name)
    if os.path.isdir(out) and os.listdir(out):
        print(f"{name}: already there, skipping"); continue
    print(f"Downloading {name}...")
    urllib.request.urlretrieve(url, zpath, progress); print()
    print(f"Unzipping {name}...")
    with zipfile.ZipFile(zpath) as z: z.extractall(out)
    os.remove(zpath)
print("Done. Now run: python train.py --data data --limit 200")
