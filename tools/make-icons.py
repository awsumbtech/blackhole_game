# Writes icons/icon-192.png, icon-512.png, icon-maskable-512.png using tools/make-icons.html.
import base64, subprocess, time, os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); P = "47299"
srv = subprocess.Popen(["python3", "-m", "http.server", P, "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        pg.goto(f"http://127.0.0.1:{P}/tools/make-icons.html"); pg.wait_for_function("window.ready")
        for name, S, k in [("icon-512.png", 512, 0.16), ("icon-192.png", 192, 0.16), ("icon-maskable-512.png", 512, 0.12)]:
            d = pg.evaluate(f"icon({S},{k})").split(",", 1)[1]
            open(os.path.join(ROOT, "icons", name), "wb").write(base64.b64decode(d))
        b.close()
finally:
    srv.kill()
