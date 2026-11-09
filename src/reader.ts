import { mountAppearance } from "./appearance.js";
import { mountModeSwitch, requireElement } from "./controls.js";
import { detectionSample } from "./detect.js";
import type { TolkDocument } from "./document.js";
import { getLanguage, startLanguages, subscribeLanguage } from "./document-language.js";
import { mountDrawer } from "./drawer.js";
import { mountFirstRun } from "./first-run.js";
import { mountHighlights } from "./highlight.js";
import { mountLanguageStatus } from "./language-status.js";
import { attachMarginTools, mountMarginTools } from "./margin-tools.js";
import { resolveOpening, showNote } from "./opening.js";
import { initPlayback, replaceBlocks } from "./playback.js";
import { mountPlayer } from "./player.js";
import { renderChapter } from "./render.js";
import { mountSavedMarks, repaintSavedMarks } from "./saved-marks.js";
import { mountSavedWords } from "./saved-words.js";
import { loadSavedWords, type SavedSource } from "./saved-words-store.js";
import { mountShortcuts } from "./shortcuts.js";
import { loadSettings } from "./state.js";
import { indexChapter } from "./tokenize.js";
import { loadVoices, refreshVoices } from "./voices.js";
import { mountWordPopup } from "./word-popup.js";

/** How long the page stays hidden for detection. Reading matters more than knowing the language. */
const DETECTION_WAIT_MS = 1500;

await start();

async function start(): Promise<void> {
  try {
    await loadSettings();
    mountAppearance();
    const opening = await resolveOpening();
    if (opening.kind === "note") {
      showNote(opening.note);
      return;
    }
    mountModeSwitch();
    mountDrawer();
    showDocument(opening.document);
    await waitForDetection(opening.document);
    // The page stays hidden until here, so saved settings, fonts and the text's
    // language can't make the text jump after it first appears.
    await document.fonts.ready;
  } finally {
    document.documentElement.dataset["ready"] = "true";
  }
  mountFirstRun();
}

function showDocument(source: TolkDocument): void {
  const reader = requireElement("reader");
  initPlayback();
  mountHighlights();
  showChapter(source, reader);
  document.title = source.title;
  loadVoices();
  mountLanguageStatus();
  mountPlayer();
  mountShortcuts();
  mountMarginTools();
  mountWordPopup(savedSourceOf(source));
  mountSavedWords();
  mountSavedMarks();
  // Not awaited, because a slow database mustn't hold up the text. Underlines
  // only paint, so them arriving later can't move anything.
  void loadSavedWords();
  // Starts layout, which starts loading the fonts document.fonts.ready waits for.
  reader.getBoundingClientRect();
}

function savedSourceOf(source: TolkDocument): SavedSource {
  return source.source.kind === "page"
    ? { title: source.title, url: source.source.url }
    : { title: source.title };
}

/**
 * Builds the chapter for the current language, and is the only way the language
 * reaches the tokenizer. Tokenizing assumes bare text, so it always starts again
 * from the source blocks, because running it over existing word spans would nest
 * them. The new chapter is complete before the swap, which happens in one step,
 * so the page never collapses and the scroll position holds.
 */
function showChapter(source: TolkDocument, reader: HTMLElement): void {
  const chapter = source.chapters[0];
  if (chapter === undefined) {
    return;
  }
  const language = getLanguage();
  const fresh = new DocumentFragment();
  renderChapter(source, chapter, fresh);
  const blocks = indexChapter(fresh, language);

  replaceBlocks(blocks);
  attachMarginTools(blocks);
  reader.replaceChildren(fresh);
  repaintSavedMarks();
  // The one allowed exception to invariant 5: `lang` lets the font draw the
  // language's letters correctly, which re-wraps some lines for Turkish.
  if (language === null) {
    reader.removeAttribute("lang");
  } else {
    reader.lang = language;
  }
  refreshVoices();
}

async function waitForDetection(source: TolkDocument): Promise<void> {
  const reader = requireElement("reader");
  let shown = getLanguage();
  subscribeLanguage(() => {
    const language = getLanguage();
    if (language !== shown) {
      shown = language;
      showChapter(source, reader);
    }
  });
  await Promise.race([
    startLanguages(detectionSample(reader)),
    new Promise((resolve) => window.setTimeout(resolve, DETECTION_WAIT_MS)),
  ]);
}
