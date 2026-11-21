import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { attach, launchChrome, sleep } from "./cdp.mjs";

const ext = resolve("extension");
const id = [...createHash("sha256").update(ext).digest("hex").slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
const server = createServer((q, r) => r.writeHead(200, { "content-type": "text/html" }).end("<title>Waarom fietst Nederland zo veel?</title><h1>Hallo</h1>"));
await new Promise((d) => server.listen(0, "127.0.0.1", d));
const profile = mkdtempSync(join(tmpdir(), "tolk-probe-"));
mkdirSync(join(profile, "Default"));
writeFileSync(join(profile, "Default/Preferences"), JSON.stringify({ extensions: { pinned_extensions: [id] }, browser: { theme: { color_scheme2: 1 } } }));
const { child, cdp } = launchChrome(profile, ["--window-size=1280,920", "--window-position=40,40", "--test-type"], "http://stadsnieuws.localhost:" + server.address().port + "/fietsen");
try {
  const loaded = await cdp.send("Extensions.loadUnpacked", { path: ext });
  console.log("predicted", id, "actual", loaded.id);
  const { targetInfos } = await cdp.send("Target.getTargets");
  const page = await attach(cdp, targetInfos.find((t) => t.type === "page").targetId);
  await sleep(1500);
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 600, y: 500, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 600, y: 500, button: "left", clickCount: 1 });
  await sleep(1000);
  const { bounds } = await cdp.send("Browser.getWindowForTarget", { targetId: page.targetId });
  const inner = await page.evaluate(`({ w: innerWidth, h: innerHeight })`);
  console.log(bounds, inner);
  execFileSync("screencapture", ["-x", `-R${bounds.left},${bounds.top},${bounds.width},${bounds.height - inner.h}`, process.argv[2]]);
} finally {
  child.kill();
  server.close();
}
