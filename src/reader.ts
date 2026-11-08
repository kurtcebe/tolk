import { mountAppearance } from "./appearance.js";
import { mountModeSwitch, requireElement } from "./controls.js";
import { mountDrawer } from "./drawer.js";
import { mountHighlights } from "./highlight.js";
import { initPlayback } from "./playback.js";
import { mountPlayer } from "./player.js";
import { renderChapter } from "./render.js";
import { SAMPLE_DOCUMENT } from "./sample.js";
import { mountShortcuts } from "./shortcuts.js";
import { loadSettings } from "./state.js";
import { indexChapter } from "./tokenize.js";

await start();

async function start(): Promise<void> {
  try {
    await loadSettings();
    mountAppearance();
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
  mountReadAlong(reader);
  // Starts layout, which starts loading the fonts document.fonts.ready waits for.
  reader.getBoundingClientRect();
}

function mountReadAlong(reader: HTMLElement): void {
  const { language } = SAMPLE_DOCUMENT;
  initPlayback(indexChapter(reader, language), language);
  mountHighlights();
  mountPlayer(language);
  mountShortcuts();
}
