// Draws the YouTube thumbnail, 1280 × 720: Tolk's name and line, a crop of the
// read-along screenshot, and the library's aquarium along the bottom, drawn by
// the extension's own aquarium.js in the light scheme.
//
//   npx tsc && node tools/video/thumbnail.mjs
//
// It needs docs/images/read-along.png, and writes dist/video/thumbnail.png.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attach, launchChrome, sleep } from "./cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EXTENSION = join(ROOT, "extension");
const SHOT = join(ROOT, "docs/images/read-along.png");
const OUT = join(ROOT, "dist/video");
mkdirSync(OUT, { recursive: true });

// Reading days for the tank: two Dutch books, a German one and some articles.
const book = (n) => ({ kind: "book", bookId: `b${n}`, colour: n });
const articles = { kind: "articles" };
const days = [
  [book(0), null, 0], [book(2), articles, 0], [book(1), null, 1], [book(0), book(2), 0],
  [articles, null, 0], [book(2), null, 0], [book(2), book(0), 0], [book(1), null, 1],
  [book(2), null, 0], [book(0), null, 0], [book(2), articles, 0], [book(1), book(2), 1],
  [book(2), null, 0], [articles, book(2), 0], [book(0), null, 0], [book(2), null, 0],
  [book(2), book(0), 0], [book(1), null, 1], [book(2), null, 0], [book(0), articles, 0],
  [book(2), null, 0], [book(2), null, 0], [book(0), null, 0], [book(1), null, 1],
];
const tank = {
  fish: days.map(([head, tail, shape], i) => ({
    date: `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + ((i * 7) % 28)).padStart(2, "0")}`,
    head,
    tail,
    stripes: null,
    split: tail === null ? 1 : 0.6,
    shape,
  })),
  streak: 4,
  growth: 30,
  wordsSaved: 0,
  finished: 3,
};

const page = `<!doctype html>
<html data-scheme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="/library.css">
<style>
  @font-face { font-family: "Literata"; font-weight: 200 900; src: url("/fonts/literata-latin-standard-normal.woff2") format("woff2"); }
  @font-face { font-family: "Instrument Sans"; font-weight: 400 700; src: url("/fonts/instrument-sans-latin-wght-normal.woff2") format("woff2"); }
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: #fbf8f1; color: #25231e; }
  .name { position: absolute; left: 72px; top: 92px; width: 520px; }
  .name img { width: 104px; height: 104px; display: block; }
  h1 { margin: 22px 0 14px; font: 650 136px/0.95 "Literata", serif; letter-spacing: -0.01em; }
  p { margin: 0; font: 500 40px/1.2 "Instrument Sans", sans-serif; color: #1f4e79; }
  .shot { position: absolute; left: 640px; top: 72px; width: 576px; height: 360px; overflow: hidden;
          border-radius: 18px; box-shadow: 0 18px 44px rgb(20 40 60 / 0.28); }
  .shot img { position: absolute; left: -96px; top: -206px; width: 1280px; }
  canvas { position: absolute; left: 0; bottom: 0; width: 1280px; height: 200px; }
</style></head>
<body>
<canvas id="tank"></canvas>
<div class="name"><img src="/icons/icon.svg" alt=""><h1>Tolk</h1><p>Read in the language<br>you're learning</p></div>
<div class="shot"><img src="/shot.png" alt=""></div>
<script type="module">
  import { mountAquarium, setTank } from "/js/aquarium.js";
  mountAquarium(document.getElementById("tank"));
  setTank(${JSON.stringify(tank)});
  await document.fonts.ready;
  requestAnimationFrame(() => requestAnimationFrame(() => { document.title = "ready"; }));
</script></body></html>`;

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  if (path === "/") return response.writeHead(200, { "content-type": types[".html"] }).end(page);
  const file = path === "/shot.png" ? SHOT : join(EXTENSION, path);
  if (file !== SHOT && !file.startsWith(EXTENSION)) return response.writeHead(403).end();
  try {
    const body = readFileSync(file);
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));

const profile = mkdtempSync(join(tmpdir(), "tolk-thumb-"));
const { child, cdp } = launchChrome(profile, ["--headless=new"]);
try {
  const { targetInfos } = await cdp.send("Target.getTargets");
  const tab = await attach(cdp, targetInfos.find((t) => t.type === "page").targetId);
  await tab.send("Page.enable");
  // Reduced motion draws the tank once, still, instead of animating it.
  await tab.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await tab.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await tab.send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
  for (let tries = 0; tries < 50 && (await tab.evaluate("document.title")) !== "ready"; tries++) await sleep(100);
  await sleep(300);
  const { data } = await tab.send("Page.captureScreenshot", { format: "png" });
  const file = join(OUT, "thumbnail.png");
  writeFileSync(file, Buffer.from(data, "base64"));
  console.log(`Wrote ${file}`);
} finally {
  child.kill();
  server.close();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
