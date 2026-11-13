import { mountAppearance } from "./appearance.js";
import { updateBook, type Book } from "./book-store.js";
import { rebuildChapter, startChapterView } from "./chapter-view.js";
import { mountContents } from "./contents.js";
import { mountModeSwitch, requireElement } from "./controls.js";
import { bookDetectionSample, detectionSample } from "./detect.js";
import type { TolkDocument } from "./document.js";
import {
  getChosenLanguage,
  getLanguage,
  restoreChosenLanguage,
  startLanguages,
  subscribeLanguage,
} from "./document-language.js";
import { mountDrawer } from "./drawer.js";
import { mountFirstRun } from "./first-run.js";
import { mountHighlights } from "./highlight.js";
import { mountLanguageStatus } from "./language-status.js";
import { isValidLanguageTag } from "./languages.js";
import { mountMarginTools } from "./margin-tools.js";
import { resolveOpening, showNote } from "./opening.js";
import { initPlayback } from "./playback.js";
import { mountPlayer } from "./player.js";
import { trackReadingHistory } from "./reading-history.js";
import { restorePosition, startingChapterIndex, trackPosition } from "./reading-position.js";
import { mountRightMargin } from "./right-margin.js";
import { mountSavedMarks } from "./saved-marks.js";
import { mountSavedWords } from "./saved-words.js";
import { loadSavedWords, type SavedSource } from "./saved-words-store.js";
import { mountShortcuts } from "./shortcuts.js";
import { loadSettings } from "./state.js";
import { loadVoices } from "./voices.js";
import { mountWordPopup } from "./word-popup.js";

/** How long the page stays hidden for detection. Reading matters more than knowing the language. */
const DETECTION_WAIT_MS = 1500;

// A page Chrome restores from its back-forward cache would still think it was
// speaking. Starting again resumes a book at its saved position, with nothing talking.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    location.reload();
  }
});

await start();

async function start(): Promise<void> {
  let opened = false;
  try {
    await loadSettings();
    mountAppearance();
    const opening = await resolveOpening();
    if (opening.kind === "library") {
      location.replace(`library.html${opening.query}`);
      return;
    }
    if (opening.kind === "note") {
      showNote(opening.note);
      return;
    }
    opened = true;
    const { document: source, book } = opening;
    mountModeSwitch();
    mountDrawer();
    await showDocument(source, book);
    await waitForDetection(source);
    // The page stays hidden until here, so saved settings, fonts and the text's
    // language can't make the text jump after it first appears.
    await document.fonts.ready;
    if (book !== null) {
      // Last, because the position is a place in the finished layout.
      restorePosition(book.position);
      trackPosition(source, book.id);
      rememberLanguageChoice(book);
    }
  } finally {
    document.documentElement.dataset["ready"] = "true";
  }
  if (opened) {
    mountFirstRun();
  }
}

async function showDocument(source: TolkDocument, book: Book | null): Promise<void> {
  const reader = requireElement("reader");
  initPlayback();
  mountHighlights();
  const chosen = book?.chosenLanguage ?? null;
  if (chosen !== null && isValidLanguageTag(chosen)) {
    restoreChosenLanguage(chosen);
  }
  await startChapterView(source, book === null ? 0 : startingChapterIndex(source, book));
  document.title = source.title;
  loadVoices();
  mountLanguageStatus();
  mountRightMargin();
  mountPlayer();
  trackReadingHistory(book?.id ?? null);
  mountShortcuts();
  mountMarginTools();
  mountWordPopup(savedSourceOf(source));
  mountSavedWords();
  mountSavedMarks();
  if (book !== null) {
    mountContents();
    openLibraryInThisTab();
  }
  // Not awaited, because a slow database mustn't hold up the text. Underlines
  // only paint, so them arriving later can't move anything.
  void loadSavedWords();
  // Starts layout, which starts loading the fonts document.fonts.ready waits for.
  reader.getBoundingClientRect();
}

/**
 * Leaving a book for the library loses nothing, since clicking the book resumes it.
 * An article can't be opened again that way, so its links keep their new tab.
 */
function openLibraryInThisTab(): void {
  for (const link of document.querySelectorAll(".library-link")) {
    link.removeAttribute("target");
  }
}

function savedSourceOf(source: TolkDocument): SavedSource {
  switch (source.source.kind) {
    case "page":
      return { title: source.title, url: source.source.url };
    case "book":
      return { title: source.title, bookId: source.source.bookId };
    case "sample":
      return { title: source.title };
  }
}

async function waitForDetection(source: TolkDocument): Promise<void> {
  const reader = requireElement("reader");
  let shown = getLanguage();
  subscribeLanguage(() => {
    const language = getLanguage();
    if (language !== shown) {
      shown = language;
      rebuildChapter();
    }
  });
  const sample =
    source.source.kind === "book" ? bookDetectionSample(source.chapters) : detectionSample(reader);
  await Promise.race([
    startLanguages(sample),
    new Promise((resolve) => window.setTimeout(resolve, DETECTION_WAIT_MS)),
  ]);
}

/** A book keeps its override, unlike a page, because it gets opened again. */
function rememberLanguageChoice(book: Book): void {
  let saved = book.chosenLanguage;
  subscribeLanguage(() => {
    const chosen = getChosenLanguage();
    if (chosen !== saved) {
      saved = chosen;
      void saveLanguageChoice(book.id, chosen);
    }
  });
}

async function saveLanguageChoice(bookId: string, chosenLanguage: string | null): Promise<void> {
  try {
    await updateBook(bookId, { chosenLanguage });
  } catch (error) {
    console.warn("Couldn't save this book's language.", error);
  }
}
