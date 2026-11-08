import { mountModeSwitch, requireElement } from "./controls.js";
import { mountDrawer } from "./drawer.js";
import { renderChapter } from "./render.js";
import { SAMPLE_DOCUMENT } from "./sample.js";
import { loadSettings, subscribe, type Scheme, type Settings } from "./state.js";

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
let currentScheme: Scheme = "auto";

await start();

async function start(): Promise<void> {
  try {
    await loadSettings();
    subscribe(applySettings);
    systemDark.addEventListener("change", applyCurrentScheme);
    mountModeSwitch();
    mountDrawer();
    showDocument();
    // The page stays hidden until here, so saved settings and fonts can't make
    // the text jump after it first appears.
    await document.fonts.ready;
  } finally {
    document.documentElement.dataset["ready"] = "true";
  }
}

function applySettings(settings: Settings): void {
  const root = document.documentElement;
  root.dataset["mode"] = settings.mode;
  root.dataset["font"] = settings.font;
  root.dataset["lineSpacing"] = settings.lineSpacing;
  root.style.setProperty("--text-size", `${settings.textSize}px`);
  currentScheme = settings.scheme;
  applyCurrentScheme();
}

function applyCurrentScheme(): void {
  document.documentElement.dataset["scheme"] = resolveScheme(currentScheme);
}

function resolveScheme(scheme: Scheme): Exclude<Scheme, "auto"> {
  if (scheme !== "auto") {
    return scheme;
  }
  return systemDark.matches ? "dark" : "light";
}

function showDocument(): void {
  const chapter = SAMPLE_DOCUMENT.chapters[0];
  if (chapter === undefined) {
    return;
  }
  const reader = requireElement("reader");
  if (SAMPLE_DOCUMENT.language !== null) {
    reader.lang = SAMPLE_DOCUMENT.language;
  }
  document.title = SAMPLE_DOCUMENT.title;
  renderChapter(SAMPLE_DOCUMENT, chapter, reader);
  // Starts layout, which starts loading the fonts document.fonts.ready waits for.
  reader.getBoundingClientRect();
}
