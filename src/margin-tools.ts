// One paragraph's tools: Translate and Read this paragraph. They sit in the left
// margin, out of the text's flow (invariant 5), and collapse into one overflow
// control when the margin is too small. Book mode hides them with CSS.
//
// They're added to each block after it's been indexed, and a chapter rebuild
// starts again from the source blocks, so the tokenizer never sees them. Their
// labels live in attributes, so the block's text doesn't change either.

import { requireElement } from "./controls.js";
import {
  getLanguage,
  getOwnLanguage,
  getTranslationPair,
  subscribeLanguage,
  translationStatus,
} from "./document-language.js";
import { removeLines, showLines } from "./interlinear.js";
import { activeRange, stopRange, subscribePlayback, type SpeechRange } from "./playback.js";
import { speakRange } from "./player.js";
import { cleanText } from "./selection.js";
import { subscribe } from "./state.js";
import type { BlockIndex } from "./tokenize.js";
import { translate, type TranslationOutcome } from "./translation.js";
import { areVoicesLoaded, availableVoices, subscribeVoices } from "./voices.js";

/** A 32 px button, an 8 px gap to the text and the 16 px page gutter. */
const MARGIN_NEEDED_PX = 56;
const TOOL_BLOCKS = new Set(["p", "blockquote"]);
const TRANSLATE_FAILED = "Couldn't translate this paragraph.";
const DOWNLOAD_FAILED = "Download didn't finish.";

type ToolState = "idle" | "working" | "downloading";

interface Paragraph {
  element: HTMLElement;
  block: BlockIndex;
  tools: HTMLElement;
  translateButton: HTMLButtonElement;
  readButton: HTMLButtonElement;
  overflowButton: HTMLButtonElement;
  range: SpeechRange;
  linesOpen: boolean;
  /** The request in flight. A result from any other is stale, so it's dropped. */
  request: AbortController | null;
  waitingForDownload: boolean;
}

let paragraphs: Paragraph[] = [];
let openNote: HTMLElement | null = null;
let openOverflow: Paragraph | null = null;
let shownPair: string | null = null;

export function mountMarginTools(): void {
  translationStatus.subscribe(handleTranslationStatus);
  subscribeLanguage(renderAvailability);
  subscribeVoices(renderAvailability);
  subscribePlayback(renderReadButtons);
  window.addEventListener("resize", updateDock);
  subscribe(updateDock);
  document.addEventListener("pointerdown", handlePointerDown, { capture: true });
  document.addEventListener("keydown", handleEscape, { capture: true });
  renderAvailability();
}

/** Adds tools to a newly built chapter, which may not be in the page yet. */
export function attachMarginTools(blocks: readonly BlockIndex[]): void {
  for (const paragraph of paragraphs) {
    paragraph.request?.abort();
  }
  openNote = null;
  openOverflow = null;
  paragraphs = blocks.flatMap((block, blockIndex) => createParagraph(block, blockIndex) ?? []);
}

function createParagraph(block: BlockIndex, blockIndex: number): Paragraph | null {
  const element = block.words[0]?.element.closest<HTMLElement>("[data-block-id]");
  if (element === null || element === undefined || !TOOL_BLOCKS.has(element.localName)) {
    return null;
  }
  const tools = cloneTools();
  const paragraph: Paragraph = {
    element,
    block,
    tools,
    translateButton: requireButton(tools, ".tool-translate"),
    readButton: requireButton(tools, ".tool-read"),
    overflowButton: requireButton(tools, ".tool-overflow"),
    range: {
      from: { blockIndex, wordIndex: 0 },
      to: { blockIndex, wordIndex: block.words.length - 1 },
      follow: true,
    },
    linesOpen: false,
    request: null,
    waitingForDownload: false,
  };
  paragraph.translateButton.addEventListener("click", () => {
    closeOverflow();
    handleTranslateClick(paragraph);
  });
  paragraph.readButton.addEventListener("click", () => {
    closeOverflow();
    handleReadClick(paragraph);
  });
  paragraph.overflowButton.addEventListener("click", () => toggleOverflow(paragraph));
  element.prepend(tools);
  return paragraph;
}

function cloneTools(): HTMLElement {
  const template = requireElement("margin-tools-template");
  const tools =
    template instanceof HTMLTemplateElement ? template.content.firstElementChild : null;
  const copy = tools?.cloneNode(true);
  if (!(copy instanceof HTMLElement)) {
    throw new Error("reader.html's #margin-tools-template must hold one element");
  }
  removeWhitespaceText(copy);
  return copy;
}

/**
 * The template's indentation would otherwise become part of the block's text,
 * and language detection reads that text.
 */
function removeWhitespaceText(element: HTMLElement): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const whitespace: Node[] = [];
  while (walker.nextNode() !== null) {
    whitespace.push(walker.currentNode);
  }
  for (const node of whitespace) {
    node.parentNode?.removeChild(node);
  }
}

function requireButton(parent: HTMLElement, selector: string): HTMLButtonElement {
  const button = parent.querySelector(selector);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`The margin tools are missing ${selector}`);
  }
  return button;
}

// Read this paragraph

function handleReadClick(paragraph: Paragraph): void {
  if (activeRange() === paragraph.range) {
    stopRange();
  } else {
    void speakRange(paragraph.range);
  }
}

function renderReadButtons(): void {
  const active = activeRange();
  for (const { readButton, range } of paragraphs) {
    readButton.setAttribute("aria-pressed", String(active === range));
  }
}

// Translate

function handleTranslateClick(paragraph: Paragraph): void {
  closeNote();
  if (paragraph.linesOpen) {
    removeLines(paragraph.element);
    paragraph.linesOpen = false;
    paragraph.translateButton.setAttribute("aria-pressed", "false");
    return;
  }
  if (paragraph.request !== null || paragraph.waitingForDownload) {
    cancel(paragraph);
    return;
  }
  requestTranslation(paragraph);
}

/** Runs from a click, so it may start a download. */
function requestTranslation(paragraph: Paragraph): void {
  const { state } = translationStatus.status();
  if (state === "available") {
    void translateParagraph(paragraph);
  } else if (state === "downloadable" || state === "downloading") {
    paragraph.waitingForDownload = true;
    setToolState(paragraph, "downloading", null);
    if (state === "downloadable") {
      void translationStatus.download();
    }
  }
}

async function translateParagraph(paragraph: Paragraph): Promise<void> {
  const request = new AbortController();
  paragraph.request = request;
  setToolState(paragraph, "working", null);

  const { block } = paragraph;
  const language = getOwnLanguage();
  const outcomes = await Promise.all(
    block.sentences.map(({ start, end }) =>
      translate(cleanText(block.text.slice(start, end)), "paragraph", request.signal),
    ),
  );
  if (paragraph.request !== request) {
    return;
  }
  paragraph.request = null;
  setToolState(paragraph, "idle", null);

  if (outcomes.every((outcome) => !outcome.ok)) {
    showNote(paragraph, TRANSLATE_FAILED);
    return;
  }
  showLines(paragraph.element, block, outcomes.map(toLine), language);
  paragraph.linesOpen = true;
  paragraph.translateButton.setAttribute("aria-pressed", "true");
}

function toLine(outcome: TranslationOutcome): string | null {
  return outcome.ok ? outcome.text : null;
}

function cancel(paragraph: Paragraph): void {
  paragraph.request?.abort();
  paragraph.request = null;
  paragraph.waitingForDownload = false;
  setToolState(paragraph, "idle", null);
}

function handleTranslationStatus(): void {
  const pair = getTranslationPair();
  const pairKey = pair === null ? null : `${pair.sourceLanguage}:${pair.targetLanguage}`;
  if (pairKey !== shownPair) {
    // What's already showing is still a correct translation, so it stays. Only
    // requests in flight are for a language the reader no longer wants.
    shownPair = pairKey;
    paragraphs.forEach(cancel);
  }
  const { state, progress, failed } = translationStatus.status();
  for (const paragraph of paragraphs) {
    if (paragraph.waitingForDownload) {
      continueAfterDownload(paragraph, state, progress, failed);
    }
  }
  renderAvailability();
}

function continueAfterDownload(
  paragraph: Paragraph,
  state: string,
  progress: number | null,
  failed: boolean,
): void {
  if (state === "downloading") {
    setToolState(paragraph, "downloading", progress);
    return;
  }
  if (state === "checking") {
    return;
  }
  paragraph.waitingForDownload = false;
  setToolState(paragraph, "idle", null);
  if (state === "available") {
    void translateParagraph(paragraph);
  } else if (failed) {
    showNote(paragraph, DOWNLOAD_FAILED);
  }
}

function setToolState(paragraph: Paragraph, state: ToolState, progress: number | null): void {
  const { translateButton, tools } = paragraph;
  translateButton.dataset["state"] = state;
  translateButton.style.setProperty("--progress", String(progress ?? 0));
  // Stays on screen while it's busy, so the reader can see it working.
  tools.toggleAttribute("data-active", state !== "idle" || tools.contains(openNote));
}

// A note beside the tools, so a failure never moves the text.

function showNote(paragraph: Paragraph, message: string): void {
  closeNote();
  const note = document.createElement("span");
  note.className = "tool-note";
  note.setAttribute("role", "status");

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "link-button";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => {
    closeNote();
    requestTranslation(paragraph);
  });

  note.append(`${message} `, retry);
  paragraph.tools.append(note);
  paragraph.tools.toggleAttribute("data-active", true);
  openNote = note;
}

function closeNote(): void {
  const tools = openNote?.closest<HTMLElement>(".margin-tools");
  openNote?.remove();
  openNote = null;
  if (tools !== null && tools !== undefined) {
    const isBusy = tools.querySelector('[data-state="working"], [data-state="downloading"]');
    tools.toggleAttribute("data-active", isBusy !== null);
  }
}

// Which tools exist, and where they go

function renderAvailability(): void {
  const root = document.documentElement;
  const { state } = translationStatus.status();
  const canTranslate =
    getTranslationPair() !== null && state !== "checking" && state !== "unavailable";
  const noVoices = areVoicesLoaded() && availableVoices().length === 0;
  const canRead = getLanguage() !== null && !noVoices;
  root.toggleAttribute("data-no-translate-tool", !canTranslate);
  root.toggleAttribute("data-no-read-tool", !canRead);
  root.toggleAttribute("data-no-tools", !canTranslate && !canRead);
}

/** The column scales with the text, so the room in the margin depends on both. */
function updateDock(): void {
  const fits = requireElement("reader").getBoundingClientRect().left >= MARGIN_NEEDED_PX;
  document.documentElement.dataset["toolsDock"] = fits ? "margin" : "overflow";
}

function toggleOverflow(paragraph: Paragraph): void {
  const wasOpen = openOverflow === paragraph;
  closeOverflow();
  if (!wasOpen) {
    openOverflow = paragraph;
    paragraph.tools.toggleAttribute("data-open", true);
    paragraph.overflowButton.setAttribute("aria-expanded", "true");
  }
}

function closeOverflow(): void {
  openOverflow?.tools.removeAttribute("data-open");
  openOverflow?.overflowButton.setAttribute("aria-expanded", "false");
  openOverflow = null;
}

function handlePointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Node)) {
    return;
  }
  if (openOverflow !== null && !openOverflow.tools.contains(event.target)) {
    closeOverflow();
  }
  if (openNote !== null && !openNote.contains(event.target)) {
    closeNote();
  }
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape" || (openOverflow === null && openNote === null)) {
    return;
  }
  event.stopImmediatePropagation();
  openOverflow?.overflowButton.focus();
  closeOverflow();
  closeNote();
}
