// Bake the big-catch gold outlines from the game's own sprites.
//   node tools/bake-outlines.cjs [port]
// Writes assets/fx/outline/*.png, map.json, outline.SOURCE.md,
// and lists those files in sw.js.

const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "/tmp/pw/node_modules/playwright-core");

const PORT = process.argv[2] || "8091";
const CHROME = process.env.CHROME || "/usr/local/bin/google-chrome";
const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "assets", "fx", "outline");

const SHIPS = ["drone", "shuttle", "freighter", "cruiser", "capital"];
const LOOKS = {
  junk: 10, meteor: 12, comet: 6, moon: 12,
  star: 12, system: 8, nebula: 10, cluster: 6, galaxy: 10
};

function specs() {
  const out = [];
  for (const ship of SHIPS) {
    for (const wreck of [0, 1]) {
      for (let look = 0; look < 8; look++) {
        out.push({ type: "craft", ship, wreck, look, variant: 0, seed: 1, color: "#8f9bb0" });
      }
    }
  }
  for (const [type, n] of Object.entries(LOOKS)) {
    for (let look = 0; look < n; look++) {
      out.push({ type, ship: "", wreck: 0, look, variant: 0, seed: 1, color: "#b7a4d4" });
    }
  }
  for (let look = 0; look < 30; look++) {
    for (let variant = 0; variant < 4; variant++) {
      out.push({ type: "planet", ship: "", wreck: 0, look, variant, seed: 1, color: "#c4a574" });
    }
  }
  // One canonical neutron. Its jets do not vary; the glow is a disc and a ring.
  out.push({ type: "neutron", ship: "", wreck: 0, look: 0, variant: 0, seed: 1, color: "#d0dcff" });
  return out;
}

async function bakeBatch(page, batch) {
  return page.evaluate(async (batch) => {
    const art = await import("/js/art.js");
    const quality = await import("/js/art/quality.js");
    const outlines = await import("/js/core/BigCatchOutline.js");
    quality.setArtQuality("high");
    const built = [];
    for (const spec of batch) {
      art.beginArtFrame();
      const e = {
        type: spec.type, ship: spec.ship, wreck: !!spec.wreck, look: spec.look,
        variant: spec.variant, seed: spec.seed, color: spec.color, radius: 10, bands: null
      };
      const sp = art.spriteFor(e, 72);
      const src = sp.c;
      const pad = Math.max(8, Math.round(src.width * 0.07));
      const w = src.width + pad * 2, h = src.height + pad * 2;
      const stamp = document.createElement("canvas");
      stamp.width = w; stamp.height = h;
      const g = stamp.getContext("2d");
      const steps = 16, rad = Math.max(2, pad * 0.38);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        g.drawImage(src, pad + Math.cos(a) * rad, pad + Math.sin(a) * rad);
      }
      g.globalCompositeOperation = "source-in";
      g.fillStyle = "rgb(255, 214, 140)";
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "destination-out";
      g.drawImage(src, pad, pad);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const o = c.getContext("2d");
      o.filter = "blur(" + Math.max(1.2, pad * 0.16).toFixed(2) + "px)";
      o.drawImage(stamp, 0, 0);
      built.push({
        id: outlines.outlineId(e),
        srcW: src.width,
        srcH: src.height,
        png: c.toDataURL("image/png")
      });
    }
    return built;
  }, batch);
}

function writeSw(files) {
  const sw = path.join(ROOT, "sw.js");
  let text = fs.readFileSync(sw, "utf8");
  const lines = ["  // outline-assets"];
  for (const f of files) lines.push("  \"./assets/fx/outline/" + f + "\",");
  const block = lines.join("\n");
  if (!text.includes("  // outline-assets\n")) throw new Error("sw.js is missing the outline-assets marker");
  text = text.replace(/  \/\/ outline-assets\n(?:  "\.\/assets\/fx\/outline\/[^"]+",\n)*/g, block + "\n");
  fs.writeFileSync(sw, text);
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(180000);
  await page.goto(`http://127.0.0.1:${PORT}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh, { timeout: 20000 });
  const all = specs();
  const map = {};
  const names = [];
  for (let i = 0; i < all.length; i += 12) {
    const part = await bakeBatch(page, all.slice(i, i + 12));
    for (const row of part) {
      const file = row.id + ".png";
      fs.writeFileSync(path.join(DIR, file), Buffer.from(row.png.split(",")[1], "base64"));
      map[row.id] = { file, srcW: row.srcW, srcH: row.srcH };
      names.push(file);
    }
    console.log("baked", Math.min(i + 12, all.length), "/", all.length);
  }
  await browser.close();
  names.sort();
  const ordered = {};
  for (const id of Object.keys(map).sort()) ordered[id] = map[id];
  fs.writeFileSync(path.join(DIR, "map.json"), JSON.stringify(ordered, null, 2) + "\n");
  const source = [
    "# Big-catch outlines",
    "",
    "These PNGs are the gold edge drawn behind a big catch. They were baked by",
    "`node tools/bake-outlines.cjs`, which loads the game, asks `spriteFor` for",
    "each bounded look, and runs the approved edge once: a 16-stamp dilate of",
    "the sprite alpha, a gold `source-in` fill, the interior punched out with",
    "`destination-out`, then a small blur. That work happens here, not in play.",
    "",
    "The id is the silhouette, not the colour:",
    "",
    "- Ships: `craft-<class>-<wreck 0 or 1>-<look 0-7>` for drone, shuttle,",
    "  freighter, cruiser and capital. Galaxy light only tints the rim, so it",
    "  is not part of the id. Wrecks are separate because the damage punches",
    "  holes in the alpha.",
    "- Other big-catch types: `<type>-<look>-<variant>`. Planets use all 4",
    "  variants because rings change the shape. The other types use variant 0.",
    "- A neutron is one file, `neutron.png` in the map as `neutron`. Its shape",
    "  is a disc and a tilted ring. It does not grow new limbs per seed.",
    "",
    "Looks come from the same counts the game uses (`SHIP_LOOKS` is 8, and the",
    "look table in `js/art/sprites.js`). `map.json` records each file and the",
    "sprite width the edge was built around, so play can scale it.",
    "",
    "Count: " + names.length + " outlines.",
    ""
  ].join("\n");
  fs.writeFileSync(path.join(DIR, "outline.SOURCE.md"), source);
  writeSw(["map.json", ...names]);
  console.log("wrote", names.length, "outlines");
}

main();
