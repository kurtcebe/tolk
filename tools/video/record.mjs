// Records Tolk's introduction video in a real Chrome window.
//
//   npm run build && node tools/video/record.mjs
//
// It starts Chrome with a new, empty profile, loads extension/ unpacked, sets
// the profile up with demo books and 30 days of reading history, films each
// shot from the tab's own frames, and logs when every sentence is spoken.
// assemble.mjs then adds the voice and captions and writes the MP4.
//
// Only Chrome's translation packs are copied from your own profile, so the
// demo doesn't wait for a download. Nothing else of yours is read or touched.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captionHtml, closingCardHtml, coverHtml, titleCardHtml } from "./cards.mjs";
import { attach, launchChrome, sleep } from "./cdp.mjs";
import { ARTICLE, BOOKS, SAVED_WORDS } from "./content.mjs";
import { writeEpub } from "./epub.mjs";
import { SHOTS, TITLE_CARD, CLOSING_CARD } from "./shots.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EXTENSION = join(ROOT, "extension");
const OUT = join(ROOT, "dist/video");
const WORK = join(OUT, "work");
const SITE = join(WORK, "site");
const FRAMES = join(WORK, "frames");
const WIDTH = 1280;
/** The library is filmed at this zoom, so the aquarium and the covers fit together. */
const ZOOM = 0.8;
const HEIGHT = 800;

rmSync(WORK, { recursive: true, force: true });
for (const dir of [SITE, FRAMES, join(WORK, "books"), join(WORK, "images")]) {
  mkdirSync(dir, { recursive: true });
}
if (!existsSync(join(EXTENSION, "js/reader.js"))) {
  throw new Error("Build the extension first: npm run build");
}

// A local server for the demo article and the card images. Nothing leaves the machine.

const TYPES = { ".html": "text/html; charset=utf-8", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const file = path.startsWith("/fonts/") || path.startsWith("/icons/")
    ? join(EXTENSION, path)
    : join(SITE, path === "/" ? "index.html" : path);
  if (!file.startsWith(EXTENSION) && !file.startsWith(SITE)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = readFileSync(file);
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const SERVER = `http://127.0.0.1:${server.address().port}`;

writeFileSync(join(SITE, "article.html"), articleHtml());

// Chrome, with a throwaway profile that only borrows the translation packs.

let extensionId = "";
const profile = mkdtempSync(join(tmpdir(), "tolk-video-"));
const translateKit = join(homedir(), "Library/Application Support/Google/Chrome/TranslateKit");
if (existsSync(translateKit)) {
  cpSync(translateKit, join(profile, "TranslateKit"), { recursive: true });
}
const { child, cdp } = launchChrome(profile, [`--window-size=${WIDTH},${HEIGHT + 120}`, "--window-position=40,40"]);
const cleanUp = async () => {
  const exited = new Promise((done) => child.once("exit", done));
  child.kill();
  await Promise.race([exited, sleep(5000)]);
  server.close();
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    console.warn(`Couldn't delete the temporary profile at ${profile}`);
  }
};
process.on("SIGINT", async () => {
  await cleanUp();
  process.exit(1);
});

try {
  await cdp.send("Target.setDiscoverTargets", { discover: true });
  ({ id: extensionId } = await cdp.send("Extensions.loadUnpacked", { path: EXTENSION }));
  const extensionUrl = (page) => `chrome-extension://${extensionId}/${page}`;
  const tab = await firstPage();
  await fitViewport(tab);

  console.log("Rendering covers and cards");
  const images = await renderImages(tab);
  for (const book of BOOKS) {
    writeEpub(join(WORK, "books", book.file), book, readFileSync(images.covers[book.file]));
  }

  console.log("Setting up the profile");
  await setUpProfile(tab, extensionUrl);

  console.log("Filming");
  const film = await filmShots(tab, extensionUrl);

  writeFileSync(
    join(WORK, "timeline.json"),
    JSON.stringify({ width: WIDTH, height: HEIGHT, images, ...film }, null, 2),
  );
  console.log(`Recorded ${film.frames.length} frames. Now run: node tools/video/assemble.mjs`);
} finally {
  await cleanUp();
}

// Pages

async function firstPage() {
  const { targetInfos } = await cdp.send("Target.getTargets");
  const target = targetInfos.find((t) => t.type === "page");
  return await preparePage(target.targetId);
}

async function preparePage(targetId) {
  const page = await attach(cdp, targetId);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "no-preference" },
    ],
  });
  page.mouse = { x: WIDTH / 2, y: HEIGHT / 2 };
  cdp.on(({ method, params, sessionId }) => {
    if (sessionId === page.sessionId && method === "Runtime.consoleAPICalled" && (params.type === "warning" || params.type === "error")) {
      console.log("  page:", params.args.map((a) => a.value ?? a.description).join(" "));
    }
  });
  return page;
}

/** Sizes the window so the page itself is exactly 1280 × 800. */
async function fitViewport(page) {
  const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget", { targetId: page.targetId });
  const { w, h } = await page.evaluate(`({ w: innerWidth, h: innerHeight })`);
  await cdp.send("Browser.setWindowBounds", {
    windowId,
    bounds: { width: bounds.width + WIDTH - w, height: bounds.height + HEIGHT - h },
  });
  await sleep(500);
  const after = await page.evaluate(`({ w: innerWidth, h: innerHeight })`);
  if (after.w !== WIDTH || after.h !== HEIGHT) {
    throw new Error(`The page is ${after.w} × ${after.h}, not ${WIDTH} × ${HEIGHT}. Is the screen big enough?`);
  }
}

async function navigate(page, url) {
  const loaded = cdp.waitFor("Page.loadEventFired", (_, sessionId) => sessionId === page.sessionId);
  await page.send("Page.navigate", { url });
  await loaded;
}

async function waitUntil(page, expression, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await page.evaluate(expression).catch(() => false)) {
      return;
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

// Images

async function renderImages(page) {
  const images = { covers: {}, captions: {} };
  const shoot = async (name, html, width, height, transparent = false) => {
    writeFileSync(join(SITE, `${name}.html`), html);
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    if (transparent) {
      await page.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    }
    await navigate(page, `${SERVER}/${name}.html`);
    await page.evaluate(`document.fonts.ready.then(() => true)`);
    await sleep(100);
    const { data } = await page.send("Page.captureScreenshot", { format: "png" });
    await page.send("Emulation.setDefaultBackgroundColorOverride", {});
    const file = join(WORK, "images", `${name}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  };
  for (const book of BOOKS) {
    images.covers[book.file] = await shoot(`cover-${book.file}`, coverHtml(book), 600, 900);
  }
  images.title = await shoot("title", titleCardHtml(TITLE_CARD.heading, TITLE_CARD.line), WIDTH, HEIGHT);
  images.closing = await shoot("closing", closingCardHtml(CLOSING_CARD.heading, CLOSING_CARD.line), WIDTH, HEIGHT);
  for (const shot of SHOTS) {
    if (shot.caption) {
      images.captions[shot.name] = await shoot(`caption-${shot.name}`, captionHtml(shot.caption), WIDTH, 110, true);
    }
  }
  await page.send("Emulation.clearDeviceMetricsOverride");
  return images;
}

// The profile

async function setUpProfile(page, extensionUrl) {
  await navigate(page, extensionUrl("library.html"));
  await waitUntil(page, `document.getElementById("import-input") !== null`);

  // Settings, as the reader would save them, and the local Dutch voice.
  await page.evaluate(`(async () => {
    const state = await import("./js/state.js");
    await state.loadSettings();
    state.updateSettings({ ownLanguage: "en", scheme: "light", mode: "learner" });
    state.updateSpeechPreference("nl", { rate: 0.85 });
    const findXander = () => speechSynthesis.getVoices().find((voice) => voice.name.startsWith("Xander") && voice.localService);
    for (let i = 0; i < 50 && !findXander(); i++) await new Promise((done) => setTimeout(done, 100));
    const xander = findXander();
    if (!xander) throw new Error("The Dutch voice Xander isn't installed");
    state.saveVoiceChoice("nl", xander.voiceURI);
    await new Promise((done) => setTimeout(done, 500));
    return true;
  })()`);

  // Chrome's translation and detection, created once from a click-like gesture,
  // so the reader finds them ready instead of offering a download.
  await page.evaluate(`(async () => {
    let translator = null;
    for (let i = 0; i < 30 && translator === null; i++) {
      translator = await Translator.create({ sourceLanguage: "nl", targetLanguage: "en", monitor() {} }).catch((e) => { console.warn("translator", e.name, e.message, navigator.userActivation.isActive); return null; });
      if (translator === null) await new Promise((done) => setTimeout(done, 1000));
    }
    if (translator === null) throw new Error("Chrome couldn't make a Dutch to English translator");
    await translator.translate("De fiets.");
    const detector = await LanguageDetector.create();
    await detector.detect("Dit is een zin.");
    return true;
  })()`);

  // The books, through the library's own file input.
  const { root } = await page.send("DOM.getDocument");
  const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#import-input" });
  await page.send("DOM.setFileInputFiles", {
    nodeId,
    files: BOOKS.map((book) => join(WORK, "books", book.file)),
  });
  await waitUntil(page, `(async () => (await (await import("./js/book-store.js")).listBooks()).length === ${BOOKS.length})()`);

  const books = await page.evaluate(`(async () => {
    const store = await import("./js/book-store.js");
    return (await store.listBooks()).map((book) => ({ id: book.id, title: book.title }));
  })()`);
  const idOf = (file) => books.find((b) => b.title === BOOKS.find((x) => x.file === file).title).id;
  const garden = idOf("de-tuin-van-oma.epub");
  const amsterdam = idOf("een-jaar-in-amsterdam.epub");
  const lighthouse = idOf("der-leuchtturm.epub");

  // Open each book once, so it has a place like a book that's been read.
  for (const id of [garden, amsterdam, lighthouse]) {
    await navigate(page, extensionUrl(`reader.html?book=${id}`));
    await waitUntil(page, `document.querySelector("[data-w]") !== null`);
    await sleep(1500);
  }
  await navigate(page, extensionUrl("library.html"));

  await page.evaluate(`(async () => {
    const history = await import("./js/history-store.js");
    const books = await import("./js/book-store.js");
    const words = await import("./js/saved-words-store.js");
    ${seedHistoryScript({ garden, amsterdam, lighthouse })}
    return true;
  })()`);

  // A first-run card would cover the opening shot, and it's already answered.
  await navigate(page, "about:blank");
}

/** 30 days of plausible reading, written through the extension's own history store. */
function seedHistoryScript({ garden, amsterdam, lighthouse }) {
  const days = [];
  const skip = new Set([4, 9, 16, 17, 23, 27]);
  for (let ago = 29; ago >= 1; ago--) {
    if (skip.has(ago)) continue;
    const vary = ((ago * 37) % 11) / 10; // 0 to 1, the same every run
    if (ago % 7 === 3) {
      days.push([ago, "de", 600 + Math.round(vary * 600), lighthouse]);
      continue;
    }
    const book = ago >= 15 ? garden : amsterdam;
    days.push([ago, "nl", 900 + Math.round(vary * 1200), book]);
    if (ago % 4 === 0) days.push([ago, "nl", 300 + Math.round(vary * 300), null]);
    if (ago % 5 === 1 && ago < 15) days.push([ago, "nl", 420, garden]);
  }
  const finishAgo = 15;
  const savedWords = SAVED_WORDS.map(([word, translation, sentence], i) => ({
    id: `demo-${i}`,
    word,
    translation,
    sentence,
    source: { title: i < 5 || i === 11 ? "De tuin van oma" : "Een jaar in Amsterdam", bookId: i < 5 || i === 11 ? garden : amsterdam },
    language: "nl",
    agoDays: 1 + (i % 12),
  }));
  return `
    const dateAgo = (ago, hour = 20) => { const d = new Date(); d.setDate(d.getDate() - ago); d.setHours(hour, 0, 0, 0); return d; };
    for (const [ago, language, seconds, bookId] of ${JSON.stringify(days)}) {
      await history.addToDay({ date: history.localDate(dateAgo(ago)), language, seconds, words: Math.round(seconds * 1.6), bookId });
    }
    await history.recordFinish(${JSON.stringify(garden)}, dateAgo(${finishAgo}));
    await history.assignIdentities();
    const now = Date.now();
    await books.updateBook(${JSON.stringify(garden)}, { progress: 1, lastReadAt: dateAgo(${finishAgo}).getTime() });
    await books.updateBook(${JSON.stringify(amsterdam)}, { progress: 0.46, lastReadAt: now - 86400000 });
    await books.updateBook(${JSON.stringify(lighthouse)}, { progress: 0.31, lastReadAt: dateAgo(3).getTime() });
    await words.loadSavedWords();
    for (const { agoDays, ...word } of ${JSON.stringify(savedWords)}) {
      await words.putSavedWord({ ...word, savedAt: dateAgo(agoDays).getTime() });
    }
  `;
}

// Filming

async function filmShots(firstTab, extensionUrl) {
  const frames = [];
  const shots = [];
  let filming = null;
  let frameNumber = 0;

  cdp.on(({ method, params, sessionId }) => {
    if (method !== "Page.screencastFrame") return;
    void cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }, sessionId);
    if (filming === null || sessionId !== filming.sessionId) return;
    const file = join(FRAMES, `${String(++frameNumber).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(params.data, "base64"));
    frames.push({ file, t: params.metadata.timestamp });
  });

  const film = async (page) => {
    if (filming !== null) {
      await filming.send("Page.stopScreencast").catch(() => {});
    }
    filming = page;
    await page.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: WIDTH, maxHeight: HEIGHT });
    // A screencast only sends frames when something changes, so nudge one out.
    await page.evaluate(`document.documentElement.style.setProperty("--demo-tick", "1"), true`);
  };
  const shot = (name) => {
    shots.push({ name, t: Date.now() / 1000 });
    console.log(`  ${name}`);
  };

  // The article, on an ordinary web page.
  await navigate(firstTab, `${SERVER}/article.html`);
  await installCursor(firstTab);
  await film(firstTab);
  await sleep(800);
  shot("open");
  await sleep(1200);
  await moveTo(firstTab, WIDTH - 60, 40, 900);
  await sleep(1200);

  // The toolbar click, as Chrome runs it.
  const tabs = await cdp.send("Target.getTargets", { filter: [{ type: "tab" }] });
  const opened = cdp.waitFor("Target.targetCreated", (p) => p.targetInfo.url.includes("reader.html"));
  await cdp.send("Extensions.triggerAction", { id: extensionId, targetId: tabs.targetInfos.find((t) => t.url.endsWith("/article.html")).targetId });
  const reader = await preparePage((await opened).params.targetInfo.targetId);
  await waitUntil(reader, `document.querySelector("#reader [data-w]") !== null`);
  await film(reader);
  await installCursor(reader, firstTab.mouse);
  await instrumentSpeech(reader);
  await waitUntil(reader, `document.getElementById("translation-status")?.textContent === "Ready"`, 30000);
  await sleep(1800);

  // Read-along.
  shot("read-along");
  await clickOn(reader, "#player-play");
  await moveTo(reader, WIDTH - 140, HEIGHT - 220, 800);
  await sleep(11000);

  shot("slower");
  const slider = await centreOf(reader, "#speed-slider");
  await moveTo(reader, slider.x, slider.y, 700);
  for (let i = 0; i < 3; i++) {
    await press(reader, "[", "BracketLeft", 219);
    await sleep(700);
  }
  await sleep(5000);
  await clickOn(reader, "#player-play");
  await sleep(900);

  // A word.
  shot("word");
  const word = await wordPosition(reader, 1, "verkeerslichten");
  await moveTo(reader, word.x, word.y, 900);
  await sleep(300);
  await click(reader, word.x, word.y, 2);
  await waitUntil(reader, `(document.getElementById("popup-translation")?.textContent ?? "").trim().length > 0`);
  await sleep(1600);
  await clickOn(reader, "#popup-save");
  await sleep(2200);
  await moveTo(reader, 1120, 620, 700);
  await click(reader, 1120, 620);
  await sleep(800);

  // A paragraph.
  shot("paragraph");
  await reader.evaluate(`document.querySelectorAll("#reader p[data-block-id]")[2].scrollIntoView({ block: "start", behavior: "smooth" }), true`);
  await sleep(900);
  await reader.evaluate(`window.scrollBy({ top: -120, behavior: "smooth" }), true`);
  await sleep(700);
  const paragraph = await centreOf(reader, "#reader p[data-block-id]", 2);
  await moveTo(reader, paragraph.x - 120, paragraph.y, 700);
  await sleep(500);
  const translate = await translateButtonFor(reader, 2);
  await moveTo(reader, translate.x, translate.y, 700);
  await click(reader, translate.x, translate.y);
  await waitUntil(reader, `document.querySelector(".interlinear, [class*=interlinear]") !== null`, 20000);
  await sleep(5000);

  // The library.
  shot("library");
  await clickOn(reader, 'a[href="library.html"][aria-label="Your books"]');
  const library = await preparePage(await waitForTarget((t) => t.type === "page" && t.url.includes("library.html")));
  await waitUntil(library, `document.querySelectorAll(".book-card").length === ${BOOKS.length}`);
  // Like the reader pressing Cmd and minus, so the tank and the covers fit on one screen.
  await library.evaluate(`document.documentElement.style.zoom = "${ZOOM}", true`);
  await installCursor(library, reader.mouse);
  await film(library);
  await sleep(600);
  await smoothScroll(library, `document.getElementById("library-grid")`, 1000);
  await sleep(3500);

  shot("aquarium");
  await smoothScroll(library, `document.getElementById("aquarium-tank")`, 1000);
  await sleep(4500);

  shot("book-fish");
  const card = await centreOf(library, ".book-card:nth-child(1) .book-cover");
  await moveTo(library, card.x, card.y, 1000);
  await sleep(4000);
  await moveTo(library, card.x + 200, card.y - 60, 600);

  shot("day-fish");
  const day = await library.evaluate(`(() => {
    const date = String(new Date(Date.now() - 8 * 86400000).getDate());
    const button = [...document.querySelectorAll(".history-day-button")].find((b) => b.textContent.trim() === date && !b.disabled);
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  await moveTo(library, day.x, day.y, 1000);
  await sleep(4500);

  shot("end");
  await sleep(400);
  await library.send("Page.stopScreencast");
  const speech = await reader.evaluate(`window.__demoSpeech ?? []`).catch(() => []);
  return { frames, shots, speech, end: Date.now() / 1000 };
}

async function waitForTarget(test, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const { targetInfos } = await cdp.send("Target.getTargets");
    const found = targetInfos.find(test);
    if (found) return found.targetId;
    await sleep(100);
  }
  throw new Error("Timed out waiting for a new tab");
}

/** Keeps a log of every utterance, so the voice can be matched to the picture. */
async function instrumentSpeech(page) {
  await page.evaluate(`(() => {
    if (window.__demoSpeech) return true;
    window.__demoSpeech = [];
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (utterance) => {
      const record = { text: utterance.text, rate: utterance.rate, voice: utterance.voice?.name ?? null,
        start: null, end: null, outcome: null, boundaries: [] };
      window.__demoSpeech.push(record);
      utterance.addEventListener("start", () => { record.start = Date.now() / 1000; });
      utterance.addEventListener("boundary", (event) => { if (event.name === "word") record.boundaries.push([Date.now() / 1000, event.charIndex]); });
      utterance.addEventListener("end", () => { record.end = Date.now() / 1000; record.outcome ??= "end"; });
      utterance.addEventListener("error", (event) => { record.end = Date.now() / 1000; record.outcome = event.error; });
      speak(utterance);
    };
    return true;
  })()`);
}

// The pointer. Chrome's frames don't include it, so the page gets a drawn one
// that follows every real mouse event the script sends.

async function installCursor(page, from = page.mouse) {
  page.mouse = { ...from };
  await page.evaluate(`(() => {
    if (document.getElementById("demo-cursor")) return true;
    const ns = "http://www.w3.org/2000/svg";
    const holder = document.createElement("div");
    holder.id = "demo-cursor";
    holder.setAttribute("popover", "manual");
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "26");
    svg.setAttribute("height", "26");
    svg.style.display = "block";
    holder.append(svg);
    Object.assign(holder.style, { position: "fixed", inset: "auto", left: "0", top: "0", margin: "0", padding: "0",
      border: "0", background: "transparent", overflow: "visible", pointerEvents: "none", zIndex: "2147483647" });
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M4 2.5 L4 19 L8.6 14.8 L11.6 21.5 L14.3 20.3 L11.4 13.8 L17.6 13.6 Z");
    path.setAttribute("fill", "#1b1a17");
    path.setAttribute("stroke", "#ffffff");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    document.documentElement.append(holder);
    window.__demoCursor = (x, y) => {
      // The pointer lives inside the page, so it's drawn smaller if the page is zoomed.
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      holder.style.transform = "translate(" + (x / zoom - 4) + "px," + (y / zoom - 2.5) + "px) scale(" + 1 / zoom + ")";
      holder.style.transformOrigin = "0 0";
    };
    window.__demoCursorTop = () => {
      if (holder.matches(":popover-open")) holder.hidePopover();
      holder.showPopover();
    };
    window.__demoCursorTop();
    return true;
  })()`);
  await page.evaluate(`__demoCursor(${page.mouse.x}, ${page.mouse.y}), true`);
}

async function moveTo(page, x, y, ms = 700) {
  await page.evaluate(`__demoCursorTop(), true`);
  const from = page.mouse;
  const steps = Math.max(2, Math.round(ms / 24));
  for (let i = 1; i <= steps; i++) {
    const p = i / steps;
    const ease = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    const px = from.x + (x - from.x) * ease;
    const py = from.y + (y - from.y) * ease;
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: px, y: py });
    await page.evaluate(`__demoCursor(${px}, ${py}), true`);
    await sleep(14);
  }
  page.mouse = { x, y };
}

async function click(page, x, y, clickCount = 1) {
  for (let n = 1; n <= clickCount; n++) {
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: n });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: n });
    await sleep(60);
  }
  await page.evaluate(`__demoCursorTop(), true`).catch(() => {});
}

async function clickOn(page, selector) {
  const { x, y } = await centreOf(page, selector);
  await moveTo(page, x, y, 800);
  await sleep(200);
  await click(page, x, y);
}

async function press(page, key, code, keyCode) {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, text: key.length === 1 ? key : undefined });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
}

async function centreOf(page, selector, index = 0) {
  const rect = await page.evaluate(`(() => {
    const found = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => e.getClientRects().length > 0);
    const element = found[Math.min(${index}, found.length - 1)];
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (rect === null) {
    throw new Error(`Nothing on screen matches ${selector}`);
  }
  return rect;
}

/** The middle of `word` in the reader's `block`-th paragraph (0-based). */
async function wordPosition(page, block, word) {
  const rect = await page.evaluate(`(() => {
    const words = [...document.querySelectorAll("#reader p[data-block-id]")][${block}]?.querySelectorAll("[data-w]") ?? [];
    const element = [...words].find((w) => w.textContent.replace(/[^\\p{L}]/gu, "") === ${JSON.stringify(word)});
    if (!element) return null;
    element.scrollIntoView({ block: "center", behavior: "instant" });
    const r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (rect === null) {
    throw new Error(`The word "${word}" isn't on the page`);
  }
  return rect;
}

/** The Translate button in the margin of the reader's `block`-th paragraph. */
async function translateButtonFor(page, block) {
  const expression = `(() => {
    const paragraph = document.querySelectorAll("#reader p[data-block-id]")[${block}];
    const button = paragraph?.querySelector(".tool-translate") ?? paragraph?.parentElement?.querySelector(".tool-translate");
    if (!button || button.getClientRects().length === 0) return null;
    const r = button.getBoundingClientRect();
    return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  })()`;
  await waitUntil(page, `${expression} !== null`, 5000);
  return await page.evaluate(expression);
}

async function smoothScroll(page, elementExpression, ms) {
  await page.evaluate(`(async () => {
    const element = ${elementExpression};
    const target = Math.max(0, Math.min(element.getBoundingClientRect().top + scrollY - 40, document.documentElement.scrollHeight - innerHeight));
    const start = scrollY;
    const began = performance.now();
    await new Promise((done) => {
      const step = (now) => {
        const p = Math.min(1, (now - began) / ${ms});
        const ease = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
        scrollTo(0, start + (target - start) * ease);
        p < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
    return true;
  })()`);
}

// The demo article

function articleHtml() {
  const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>${escape(ARTICLE.title)}</title>
<style>
  body { margin: 0; font: 18px/1.6 Georgia, serif; color: #222; background: #fff; }
  header.site { background: #12355b; color: #fff; padding: 18px 40px; font: 600 22px/1 system-ui, sans-serif; letter-spacing: 0.02em; }
  nav.site { background: #eef2f6; padding: 10px 40px; font: 15px system-ui, sans-serif; color: #345; }
  nav.site span { margin-right: 26px; }
  .layout { display: grid; grid-template-columns: 1fr 300px; gap: 48px; max-width: 1100px; margin: 32px auto; padding: 0 40px; }
  aside { font: 15px/1.5 system-ui, sans-serif; color: #456; }
  aside .box { background: #f4f6f8; padding: 18px; margin-bottom: 18px; border-radius: 6px; }
  h1 { font: 700 38px/1.15 system-ui, sans-serif; margin: 0 0 10px; }
  .byline { font: 14px system-ui, sans-serif; color: #667; margin-bottom: 22px; }
</style>
</head>
<body>
<header class="site">Stadsnieuws</header>
<nav class="site"><span>Nieuws</span><span>Stad</span><span>Verkeer</span><span>Cultuur</span><span>Sport</span></nav>
<div class="layout">
<article>
<h1>${escape(ARTICLE.title)}</h1>
<p class="byline">${escape(ARTICLE.byline)}</p>
${ARTICLE.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("\n")}
</article>
<aside>
<div class="box"><strong>Meest gelezen</strong><br>Nieuwe brug over het kanaal<br>Markt verhuist naar het plein<br>Zomerfestival begint vrijdag</div>
<div class="box"><strong>Het weer</strong><br>Wisselend bewolkt, 14 graden</div>
</aside>
</div>
</body>
</html>`;
}
