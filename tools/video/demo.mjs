// Writes the files for filming the introduction by hand into dist/video/demo/:
// the three demo books as EPUBs, and seed-history.js, which fills a recording
// profile's library with 30 days of reading and a dozen saved words.
//
//   node tools/video/demo.mjs
//
// The covers are drawn by a headless Chrome from cards.mjs, in a throwaway
// profile. Every text is original, from content.mjs.

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { coverHtml } from "./cards.mjs";
import { attach, launchChrome, sleep } from "./cdp.mjs";
import { BOOKS } from "./content.mjs";
import { writeEpub } from "./epub.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const EXTENSION = join(ROOT, "extension");
const OUT = join(ROOT, "dist/video/demo");
mkdirSync(OUT, { recursive: true });

const site = mkdtempSync(join(tmpdir(), "tolk-demo-site-"));
const types = { ".html": "text/html; charset=utf-8", ".woff2": "font/woff2" };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const file = path.startsWith("/fonts/") ? join(EXTENSION, path) : join(site, path);
  if (!file.startsWith(EXTENSION) && !file.startsWith(site)) return response.writeHead(403).end();
  try {
    const body = readFileSync(file);
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;

const profile = mkdtempSync(join(tmpdir(), "tolk-demo-"));
const { child, cdp } = launchChrome(profile, ["--headless=new"]);
try {
  const { targetInfos } = await cdp.send("Target.getTargets");
  const page = await attach(cdp, targetInfos.find((t) => t.type === "page").targetId);
  await page.send("Page.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 600, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const book of BOOKS) {
    const name = `cover-${book.file}.html`;
    writeFileSync(join(site, name), coverHtml(book));
    const loaded = cdp.waitFor("Page.loadEventFired", (_, sessionId) => sessionId === page.sessionId);
    await page.send("Page.navigate", { url: `${base}/${name}` });
    await loaded;
    await page.evaluate(`document.fonts.ready.then(() => true)`);
    await sleep(100);
    const { data } = await page.send("Page.captureScreenshot", { format: "png" });
    writeEpub(join(OUT, book.file), book, Buffer.from(data, "base64"));
    console.log(`Wrote ${book.file}`);
  }
} finally {
  child.kill();
  server.close();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  rmSync(site, { recursive: true, force: true });
}

copyFileSync(join(HERE, "seed-history.js"), join(OUT, "seed-history.js"));
console.log(`Wrote seed-history.js. Everything is in ${OUT}`);
