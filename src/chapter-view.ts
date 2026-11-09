// Owns which chapter is on the page, and is the only way a chapter gets there.
// Tokenizing assumes bare text, so every path starts again from the source blocks,
// because running it over existing word spans would nest them. A new chapter is
// complete before the swap, which happens in one step, and the old word index is
// replaced in that same step (invariant 2).

import { prepareChapterImages } from "./chapter-images.js";
import { requireElement } from "./controls.js";
import type { Chapter, TolkDocument } from "./document.js";
import { getLanguage } from "./document-language.js";
import { jumpTo } from "./follow.js";
import { attachMarginTools } from "./margin-tools.js";
import { continueInBlocks, onChapterEnd, replaceBlocks } from "./playback.js";
import { renderChapter } from "./render.js";
import { repaintSavedMarks } from "./saved-marks.js";
import { indexChapter, type BlockIndex } from "./tokenize.js";
import { refreshVoices } from "./voices.js";

const FLASH_MS = 2000;

const listeners = new Set<() => void>();

let source: TolkDocument | null = null;
let chapterIndex = 0;
// Bumped by every change of chapter. A chapter still loading its images when a newer
// change comes along is abandoned.
let generation = 0;
let flashTimer = 0;

export async function startChapterView(document_: TolkDocument, startIndex: number): Promise<void> {
  source = document_;
  chapterIndex = startIndex;
  onChapterEnd(continueIntoNextChapter);
  const chapter = document_.chapters[startIndex];
  if (chapter !== undefined) {
    await prepareChapterImages(document_, chapter);
  }
  rebuildChapter();
}

export function getChapterIndex(): number {
  return chapterIndex;
}

export function getChapters(): readonly Chapter[] {
  return source?.chapters ?? [];
}

export function subscribeChapter(listener: () => void): void {
  listeners.add(listener);
}

/** Builds the current chapter again, after a language change. The scroll position holds. */
export function rebuildChapter(): void {
  generation += 1;
  const built = buildChapter();
  if (built !== null) {
    replaceBlocks(built.blocks);
    attachMarginTools(built.blocks);
    swapIn(built.page);
  }
}

/** For the reader moving by hand, from Contents or a chapter link. Speech stops. */
export async function goToChapter(index: number): Promise<void> {
  generation += 1;
  const started = generation;
  const chapter = source?.chapters[index];
  if (source === null || chapter === undefined) {
    return;
  }
  await prepareChapterImages(source, chapter);
  if (started !== generation) {
    return;
  }
  chapterIndex = index;
  const built = buildChapter();
  if (built !== null) {
    replaceBlocks(built.blocks);
    attachMarginTools(built.blocks);
    jumpTo(0);
    swapIn(built.page);
    notify();
  }
}

/** Tells playback whether there's more to read. If there is, this takes it from here. */
function continueIntoNextChapter(): boolean {
  const next = nextSpeakableChapter();
  if (next === null) {
    return false;
  }
  void continueInto(next);
  return true;
}

/** A chapter that's only a picture has nothing to say, so playback passes over it. */
function nextSpeakableChapter(): number | null {
  const chapters = source?.chapters ?? [];
  for (let index = chapterIndex + 1; index < chapters.length; index += 1) {
    const chapter = chapters[index];
    if (chapter !== undefined && hasWords(chapter)) {
      return index;
    }
  }
  return null;
}

function hasWords(chapter: Chapter): boolean {
  return chapter.title !== "" || chapter.blocks.some((block) => block.type !== "image");
}

async function continueInto(index: number): Promise<void> {
  generation += 1;
  const started = generation;
  const chapter = source?.chapters[index];
  if (source === null || chapter === undefined) {
    return;
  }
  await prepareChapterImages(source, chapter);
  if (started !== generation) {
    return;
  }
  chapterIndex = index;
  const built = buildChapter();
  if (built !== null) {
    attachMarginTools(built.blocks);
    jumpTo(0);
    continueInBlocks(built.blocks, () => swapIn(built.page));
    flashTitle(chapter.title);
    notify();
  }
}

function buildChapter(): { page: DocumentFragment; blocks: BlockIndex[] } | null {
  const chapter = source?.chapters[chapterIndex];
  if (source === null || chapter === undefined) {
    return null;
  }
  const page = new DocumentFragment();
  renderChapter(source, chapter, page);
  const blocks = indexChapter(page, getLanguage());
  // After indexing and with no block ID, so the tokenizer can't read these out.
  const links = renderChapterLinks();
  if (links !== null) {
    page.append(links);
  }
  return { page, blocks };
}

function swapIn(page: DocumentFragment): void {
  const reader = requireElement("reader");
  const language = getLanguage();
  reader.replaceChildren(page);
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

function renderChapterLinks(): HTMLElement | null {
  const chapterCount = source?.chapters.length ?? 0;
  if (chapterCount < 2) {
    return null;
  }
  const nav = document.createElement("nav");
  nav.className = "chapter-links";
  nav.lang = "en";
  nav.setAttribute("aria-label", "Chapters");
  if (chapterIndex > 0) {
    nav.append(renderChapterLink("Previous chapter", chapterIndex - 1));
  }
  if (chapterIndex < chapterCount - 1) {
    nav.append(renderChapterLink("Next chapter", chapterIndex + 1));
  }
  return nav;
}

function renderChapterLink(label: string, index: number): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link-button";
  button.textContent = label;
  button.addEventListener("click", () => void goToChapter(index));
  return button;
}

function flashTitle(title: string): void {
  const flash = requireElement("chapter-flash");
  window.clearTimeout(flashTimer);
  flash.textContent = title;
  flash.hidden = title === "";
  flashTimer = window.setTimeout(() => {
    flash.hidden = true;
  }, FLASH_MS);
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}
