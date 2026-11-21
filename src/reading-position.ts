// A book's reading position: which word the reader had reached. It's stored by word
// rather than by pixels, so it still means the same place at another text size or
// window width.

import type { Book, BookPosition } from "./book-store.js";
import { updateBook } from "./book-store.js";
import { getChapterIndex, subscribeChapter } from "./chapter-view.js";
import type { TolkDocument } from "./document.js";
import { jumpTo } from "./follow.js";
import { recordFinish } from "./history-store.js";
import {
  activeRange,
  getBlocks,
  getCurrentWord,
  getStatus,
  setIdleStart,
  type WordPosition,
} from "./playback.js";

const SCROLL_SAVE_DELAY_MS = 800;
const PLAYBACK_SAVE_INTERVAL_MS = 5000;
/** Where a restored word sits below the top of the window. */
const RESTORE_OFFSET_PX = 24;

export function startingChapterIndex(document_: TolkDocument, book: Book): number {
  const id = book.position?.chapterId;
  const index = document_.chapters.findIndex((chapter) => chapter.id === id);
  return Math.max(0, index);
}

/** Puts the saved word at the top of the window. A position that no longer exists is ignored. */
export function restorePosition(position: BookPosition | null): void {
  history.scrollRestoration = "manual";
  if (position === null) {
    return;
  }
  const block = getBlocks().find((candidate) => candidate.blockId === position.blockId);
  const word = block?.words[position.wordIndex]?.element;
  if (word !== undefined) {
    jumpTo(window.scrollY + word.getBoundingClientRect().top - RESTORE_OFFSET_PX);
  }
}

/** Starts saving the position, and makes Play from idle start where the reader is. */
export function trackPosition(document_: TolkDocument, bookId: string): void {
  setIdleStart(firstSentenceOnScreen);
  const lengths = document_.chapters.map((chapter) => chapterLength(chapter.blocks));
  let lastSaved = "";
  let finished = false;

  const save = async (): Promise<void> => {
    const place = currentPlace();
    const chapter = document_.chapters[getChapterIndex()];
    const block = place === null ? undefined : getBlocks()[place.blockIndex];
    if (place === null || chapter === undefined || block === undefined) {
      return;
    }
    if (!finished && hasReachedEnd(document_, place.blockIndex)) {
      finished = true;
      void markFinished(bookId);
    }
    const position = { chapterId: chapter.id, blockId: block.blockId, wordIndex: place.wordIndex };
    const key = JSON.stringify(position);
    if (key === lastSaved) {
      return;
    }
    lastSaved = key;
    await persist(bookId, position, progressAt(document_, lengths, block.blockId));
  };
  const saveLater = (): void => void save();

  let scrollTimer = 0;
  window.addEventListener("scroll", () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(saveLater, SCROLL_SAVE_DELAY_MS);
  });
  window.setInterval(saveLater, PLAYBACK_SAVE_INTERVAL_MS);
  // A last try, which a closing tab may not give time to finish. The timers above
  // are what limit how much can be lost.
  window.addEventListener("pagehide", saveLater);
  document.addEventListener("visibilitychange", saveLater);
  subscribeChapter(saveLater);
  saveLater();
  saveBeforeLeaving(save);
}

/**
 * A save has to read the book before writing it, and a page that's navigating away
 * doesn't get that long. So these links wait for it, while a modified click still
 * opens a new tab as usual and leaves this page where it is.
 */
function saveBeforeLeaving(save: () => Promise<void>): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".library-link")) {
    link.addEventListener("click", (event) => {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        void leaveFor(link.href, save);
      }
    });
  }
}

async function leaveFor(address: string, save: () => Promise<void>): Promise<void> {
  await save();
  location.href = address;
}

async function persist(bookId: string, position: BookPosition, progress: number): Promise<void> {
  try {
    await updateBook(bookId, { position, progress, lastReadAt: Date.now() });
  } catch (error) {
    // Reading carries on, and the next save tries again.
    console.warn("Couldn't save the reading position.", error);
  }
}

/** Speech is where a listener is, and otherwise it's the top of the window. Hear isn't either. */
function currentPlace(): WordPosition | null {
  if (activeRange() !== null) {
    return null;
  }
  return getStatus() === "idle" ? firstWordOnScreen() : getCurrentWord();
}

function firstWordOnScreen(): WordPosition | null {
  for (const [blockIndex, block] of getBlocks().entries()) {
    const last = block.words.at(-1);
    if (last !== undefined && last.element.getBoundingClientRect().top >= 0) {
      const wordIndex = block.words.findIndex(
        (word) => word.element.getBoundingClientRect().top >= 0,
      );
      return { blockIndex, wordIndex };
    }
  }
  return null;
}

/**
 * The first sentence that starts on screen. If a long sentence fills the whole
 * window, it's that one, which is also what's left when nothing else starts below it.
 */
function firstSentenceOnScreen(): WordPosition | null {
  const place = firstWordOnScreen();
  const block = place === null ? undefined : getBlocks()[place.blockIndex];
  if (place === null || block === undefined) {
    return null;
  }
  const sentence =
    block.sentences.find((candidate) => candidate.firstWord >= place.wordIndex) ??
    block.sentences.find((candidate) => candidate.lastWord >= place.wordIndex);
  return { blockIndex: place.blockIndex, wordIndex: sentence?.firstWord ?? place.wordIndex };
}

function chapterLength(blocks: readonly { html: string }[]): number {
  return blocks.reduce((total, block) => total + block.html.length, 0);
}

/** A rough share of the book's text. Reaching the last words of the last chapter counts as all of it. */
function progressAt(
  document_: TolkDocument,
  lengths: readonly number[],
  blockId: string,
): number {
  const index = getChapterIndex();
  if (index === document_.chapters.length - 1 && isLastWordOnScreen()) {
    return 1;
  }
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const before = lengths.slice(0, index).reduce((sum, length) => sum + length, 0);
  const blocks = document_.chapters[index]?.blocks ?? [];
  const blockAt = blocks.findIndex((block) => block.id === blockId);
  const within = chapterLength(blocks.slice(0, Math.max(0, blockAt)));
  return total === 0 ? 0 : (before + within) / total;
}

/** The last block of the last chapter is where the reader is, or has come into view. */
function hasReachedEnd(document_: TolkDocument, blockIndex: number): boolean {
  if (getChapterIndex() !== document_.chapters.length - 1) {
    return false;
  }
  const blocks = getBlocks();
  const first = blocks.at(-1)?.words[0]?.element;
  return (
    blockIndex === blocks.length - 1 ||
    (first !== undefined && first.getBoundingClientRect().top < window.innerHeight)
  );
}

/** A finish is history, so the store keeps only the first one for each book. */
async function markFinished(bookId: string): Promise<void> {
  try {
    await recordFinish(bookId, new Date());
  } catch (error) {
    console.warn("Couldn't record finishing the book.", error);
  }
}

function isLastWordOnScreen(): boolean {
  const last = getBlocks().at(-1)?.words.at(-1)?.element;
  return last !== undefined && last.getBoundingClientRect().top < window.innerHeight;
}
