// Counts active reading time and words read in the reader, and adds them to the
// day's totals in history-store.ts. Time counts while the tab is visible and the
// reader did something in the last minute, or while speech plays. Only totals
// are kept, never what was read.

import { getChapterIndex, subscribeChapter } from "./chapter-view.js";
import { getLanguage, subscribeLanguage } from "./document-language.js";
import { addToDay, localDate } from "./history-store.js";
import { languageKey } from "./languages.js";
import { getBlocks, getCurrentWord, getStatus } from "./playback.js";

const TICK_MS = 1000;
const ACTIVE_FOR_MS = 60_000;
const SAVE_EVERY_TICKS = 30;
const LOOK_EVERY_TICKS = 5;
const SCROLL_SETTLE_MS = 300;

interface Pending {
  date: string;
  language: string;
  seconds: number;
  words: number;
}

/** Each word once per open document, by chapter, block and word. */
const seen = new Set<string>();

let bookId: string | null = null;
let pending: Pending | null = null;
let lastActive = 0;
let ticker = 0;
let ticks = 0;
let saving: Promise<void> = Promise.resolve();

/** `bookId` is null for a live article. */
export function trackReadingHistory(book: string | null): void {
  bookId = book;
  lastActive = Date.now();

  let scrollTimer = 0;
  window.addEventListener("scroll", () => {
    markActive();
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(lookAtScreen, SCROLL_SETTLE_MS);
  });
  document.addEventListener("selectionchange", markActive);
  subscribeChapter(() => {
    markActive();
    lookAtScreen();
  });
  // Time read so far belongs to the language it was read in.
  subscribeLanguage(() => void save());

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopTicking();
      void save();
    } else {
      startTicking();
    }
  });
  window.addEventListener("pagehide", () => void save());
  if (!document.hidden) {
    startTicking();
  }
}

function markActive(): void {
  lastActive = Date.now();
}

function startTicking(): void {
  window.clearInterval(ticker);
  ticker = window.setInterval(tick, TICK_MS);
}

function stopTicking(): void {
  window.clearInterval(ticker);
  ticker = 0;
}

function tick(): void {
  ticks += 1;
  const speaking = getStatus() === "playing";
  if (speaking || Date.now() - lastActive <= ACTIVE_FOR_MS) {
    const counting = pendingNow();
    if (counting !== null) {
      counting.seconds += 1;
      if (speaking) {
        countSpokenSentence();
      }
      if (ticks % LOOK_EVERY_TICKS === 0) {
        lookAtScreen();
      }
    }
  }
  if (ticks % SAVE_EVERY_TICKS === 0) {
    void save();
  }
}

/** The totals being built for today in the text's language, or null while it's Unknown. */
function pendingNow(): Pending | null {
  const tag = getLanguage();
  if (tag === null) {
    return null;
  }
  const date = localDate(new Date());
  const language = languageKey(tag);
  if (pending !== null && (pending.date !== date || pending.language !== language)) {
    // Past midnight, or a language change the listener hasn't saved yet.
    void save();
  }
  pending ??= { date, language, seconds: 0, words: 0 };
  return pending;
}

/** Words on screen join the count, while time is counting. */
function lookAtScreen(): void {
  if (getStatus() !== "playing" && Date.now() - lastActive > ACTIVE_FOR_MS) {
    return;
  }
  const counting = pendingNow();
  if (counting === null) {
    return;
  }
  const chapter = getChapterIndex();
  const bottom = window.innerHeight;
  for (const block of getBlocks()) {
    const first = block.words[0]?.element.getBoundingClientRect();
    const last = block.words.at(-1)?.element.getBoundingClientRect();
    if (first === undefined || last === undefined || last.bottom < 0) {
      continue;
    }
    if (first.top > bottom) {
      break;
    }
    for (const [index, word] of block.words.entries()) {
      const rect = word.element.getBoundingClientRect();
      if (rect.bottom >= 0 && rect.top <= bottom) {
        count(counting, `${chapter}:${block.blockId}:${index}`);
      }
    }
  }
}

/**
 * Speech doesn't announce each word to listeners, so a tick counts the whole
 * sentence being spoken. A tick a second catches all but the shortest ones.
 */
function countSpokenSentence(): void {
  const counting = pendingNow();
  const { blockIndex, wordIndex } = getCurrentWord();
  const block = getBlocks()[blockIndex];
  const sentence = block?.sentences.find(
    ({ firstWord, lastWord }) => firstWord <= wordIndex && wordIndex <= lastWord,
  );
  if (counting === null || block === undefined || sentence === undefined) {
    return;
  }
  const chapter = getChapterIndex();
  for (let index = sentence.firstWord; index <= sentence.lastWord; index += 1) {
    count(counting, `${chapter}:${block.blockId}:${index}`);
  }
}

function count(counting: Pending, key: string): void {
  if (!seen.has(key)) {
    seen.add(key);
    counting.words += 1;
  }
}

/** Saves run one after another, so two can't read the same day and both add to it. */
function save(): Promise<void> {
  const toSave = pending;
  pending = null;
  if (toSave !== null && (toSave.seconds > 0 || toSave.words > 0)) {
    saving = writeAfter(saving, toSave);
  }
  return saving;
}

async function writeAfter(previous: Promise<void>, totals: Pending): Promise<void> {
  await previous;
  await write(totals);
}

async function write(totals: Pending): Promise<void> {
  try {
    await addToDay({ ...totals, bookId });
  } catch (error) {
    // Reading carries on. The time is lost, which is better than counting it twice.
    console.warn("Couldn't save reading history.", error);
  }
}
