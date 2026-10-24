"""Renders tools/links/share-card.html to images/share-card.png (1200x630), the
picture WhatsApp shows with a shared portal link. Needs the local preview server
(launch config "parents-education", http://localhost:8161) for the fonts."""
import os
import subprocess
import tempfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

with tempfile.TemporaryDirectory() as tmp:
    raw = os.path.join(tmp, "card.png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                    f"--user-data-dir={tmp}/profile", "--window-size=1200,630", "--force-device-scale-factor=1",
                    "--virtual-time-budget=4000", f"--screenshot={raw}",
                    "http://localhost:8161/tools/links/share-card.html"], check=True, capture_output=True)
    out = os.path.join(ROOT, "images", "share-card.png")
    Image.open(raw).convert("RGB").crop((0, 0, 1200, 630)).quantize(colors=128).save(out, optimize=True)
    print(f"images/share-card.png: {os.path.getsize(out) // 1024} KB")
