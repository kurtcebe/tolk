// Draws the store's small promo tile, 440 × 280: the library's aquarium in the
// light scheme, drawn by the extension's own aquarium.js, with Tolk's icon on it.
//
//   npx tsc && node tools/video/promo-tile.mjs [seed]
//
// Each fish's place comes from its date, so a different seed, a whole number,
// moves them all. It writes dist/store/promo-tile-<seed>.png.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attach, launchChrome, sleep } from "./cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EXTENSION = join(ROOT, "extension");
const OUT = join(ROOT, "dist/store");
const seed = Number.parseInt(process.argv[2] ?? "0", 10);
mkdirSync(OUT, { recursive: true });

// The tank is drawn 200 CSS pixels high, so the page is 440 × 280 shrunk by 1.4.
const SCALE = 1.4;
const WIDTH = 440 / SCALE;

// 22 reading days: mostly one Dutch book, a second Dutch book, some German and
// some articles, so there are several colours and two shapes.
const book = (n) => ({ kind: "book", bookId: `b${n}`, colour: n });
const articles = { kind: "articles" };
const days = [
  [book(0), null, 0], [book(0), articles, 0], [book(1), null, 1], [book(0), null, 0],
  [book(0), book(2), 0], [articles, null, 0], [book(2), null, 0], [book(2), book(0), 0],
  [book(1), null, 1], [book(2), null, 0], [book(2), articles, 0], [book(0), null, 0],
  [book(2), null, 0], [book(1), book(2), 1], [book(2), null, 0], [articles, book(2), 0],
  [book(2), null, 0], [book(0), null, 0], [book(2), book(0), 0], [book(1), null, 1],
  [book(2), null, 0], [book(2), articles, 0],
];
const tank = {
  fish: days.map(([head, tail, shape], i) => ({
    date: `2026-${String(1 + ((i + seed) % 12)).padStart(2, "0")}-${String(1 + ((i * 7 + seed * 3) % 28)).padStart(2, "0")}`,
    head,
    tail,
    stripes: null,
    split: tail === null ? 1 : 0.6,
    shape,
  })),
  streak: 4,
  growth: 30,
  wordsSaved: 0,
  finished: 2,
};

const page = `<!doctype html>
<html data-scheme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="/library.css">
<style>
  html, body { margin: 0; width: ${WIDTH}px; height: 200px; overflow: hidden; }
  canvas { display: block; width: ${WIDTH}px; height: 200px; }
  img { position: absolute; left: 18px; top: 18px; width: 58px; height: 58px;
        filter: drop-shadow(0 2px 6px rgb(15 40 60 / 0.25)); }
</style></head>
<body><canvas id="tank"></canvas><img src="/icons/icon.svg" alt="">
<script type="module">
  import { mountAquarium, setTank } from "/js/aquarium.js";
  mountAquarium(document.getElementById("tank"));
  setTank(${JSON.stringify(tank)});
  requestAnimationFrame(() => requestAnimationFrame(() => { document.title = "ready"; }));
</script></body></html>`;

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  if (path === "/") return response.writeHead(200, { "content-type": types[".html"] }).end(page);
  const file = join(EXTENSION, path);
  if (!file.startsWith(EXTENSION)) return response.writeHead(403).end();
  try {
    const body = readFileSync(file);
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));

const profile = mkdtempSync(join(tmpdir(), "tolk-tile-"));
const { child, cdp } = launchChrome(profile, ["--headless=new"]);
try {
  const { targetInfos } = await cdp.send("Target.getTargets");
  const tab = await attach(cdp, targetInfos.find((t) => t.type === "page").targetId);
  await tab.send("Page.enable");
  // Reduced motion draws the tank once, still, instead of animating it.
  await tab.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await tab.send("Emulation.setDeviceMetricsOverride", { width: Math.round(WIDTH), height: 200, deviceScaleFactor: SCALE, mobile: false });
  await tab.send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
  for (let tries = 0; tries < 50 && (await tab.evaluate("document.title")) !== "ready"; tries++) await sleep(100);
  await sleep(300);
  const { data } = await tab.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: WIDTH, height: 200, scale: 1 } });
  const file = join(OUT, `promo-tile-${seed}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  console.log(`Wrote ${file}`);
} finally {
  child.kill();
  server.close();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
