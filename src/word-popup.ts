// The popup for a selected word or phrase: its translation, Hear and Save. It's
// an overlay, placed in page coordinates so it scrolls along with its text, and
// it never moves the text (invariant 5). Selecting never starts a download.

import { requireElement } from "./controls.js";
import {
  getLanguage,
  getOwnLanguage,
  getTranslationPair,
  hasTranslationPair,
  isDetecting,
  subscribeLanguage,
  translationStatus,
} from "./document-language.js";
import { openLanguageChooser } from "./language-status.js";
import { languageName } from "./languages.js";
import { activeRange, stopRange, subscribePlayback } from "./playback.js";
import { speakRange } from "./player.js";
import {
  deleteSavedWord,
  findSavedWord,
  putSavedWord,
  subscribeSavedWords,
  type SavedSource,
  type SavedWord,
} from "./saved-words-store.js";
import { readSelection, type SelectedText } from "./selection.js";
import { translateSelection } from "./translation.js";
import { areVoicesLoaded, availableVoices, subscribeVoices } from "./voices.js";

/** Enough for a whole sentence. Longer selections can still be translated and heard. */
const MAX_SAVED_WORDS = 20;
const GAP_PX = 8;
const EDGE_PX = 16;
/** After a mouse release, long enough for a click to have collapsed the selection. */
const AFTER_POINTER_MS = 50;
/** Keyboard selection moves a word at a time, so it waits for a pause. */
const AFTER_KEYBOARD_MS = 300;
const POINTER_ECHO_MS = 200;
const SAVE_FAILED = "Couldn't save this word.";

type Translation =
  | { kind: "none" }
  | { kind: "pending" }
  | { kind: "done"; text: string }
  | { kind: "failed" };

interface Popup {
  selected: SelectedText;
  translation: Translation;
  pairKey: string | null;
  request: AbortController | null;
  /** Saved before its translation arrived, so the result still needs adding. */
  awaitingTranslation: SavedWord | null;
  saveFailed: boolean;
}

let source: SavedSource = { title: "" };
let popup: Popup | null = null;
/** Bumped by every open, close and new request, so a late result can't land in a newer one. */
let generation = 0;
let pointerIsDown = false;
let lastPointerUp = -Infinity;
let settleTimer = 0;
/** A selection the reader dismissed, which shouldn't reopen until it changes. */
let dismissedKey: string | null = null;

export function mountWordPopup(documentSource: SavedSource): void {
  source = documentSource;
  document.addEventListener("selectionchange", handleSelectionChange);
  document.addEventListener("pointerdown", handlePointerDown, { capture: true });
  document.addEventListener("pointerup", handlePointerUp, { capture: true });
  document.addEventListener("keydown", handleKeydown, { capture: true });
  window.addEventListener("resize", place);

  const element = requireElement("word-popup");
  // Keeps the selection when clicking in here, which would otherwise dismiss the popup.
  element.addEventListener("mousedown", (event) => event.preventDefault());
  requireElement("popup-hear").addEventListener("click", handleHearClick);
  requireElement("popup-save").addEventListener("click", () => void handleSaveClick());

  translationStatus.subscribe(handleAvailabilityChange);
  subscribeLanguage(handleAvailabilityChange);
  subscribeVoices(render);
  subscribeSavedWords(render);
  subscribePlayback(render);
}

// Following the selection

function handleSelectionChange(): void {
  window.clearTimeout(settleTimer);
  // Any collapse ends a dismissal, so selecting the same word again reopens it,
  // however quickly it happens.
  if (window.getSelection()?.isCollapsed !== false) {
    dismissedKey = null;
  }
  if (!pointerIsDown) {
    // The browser announces a mouse selection just after the release, so that
    // still counts as the mouse, which doesn't need the keyboard's longer wait.
    const fromPointer = performance.now() - lastPointerUp < POINTER_ECHO_MS;
    settleTimer = window.setTimeout(settle, fromPointer ? AFTER_POINTER_MS : AFTER_KEYBOARD_MS);
    const selected = readSelection(requireElement("reader"));
    if (popup !== null && selected?.key !== popup.selected.key) {
      closePopup();
    }
  }
}

function settle(): void {
  const selected = readSelection(requireElement("reader"));
  if (selected === null) {
    dismissedKey = null;
    closePopup();
  } else if (selected.key !== popup?.selected.key && selected.key !== dismissedKey) {
    dismissedKey = null;
    openPopup(selected);
  }
}

function handlePointerDown(event: PointerEvent): void {
  pointerIsDown = true;
  window.clearTimeout(settleTimer);
  const inside = event.target instanceof Node && requireElement("word-popup").contains(event.target);
  if (popup !== null && !inside) {
    dismiss();
  } else if (event.target instanceof Node && requireElement("reader").contains(event.target)) {
    // Pressing in the text starts a new selection, even of the same words. The
    // browser can merge a fast double-click's events, hiding the collapse between.
    dismissedKey = null;
  }
}

function handlePointerUp(): void {
  pointerIsDown = false;
  lastPointerUp = performance.now();
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(settle, AFTER_POINTER_MS);
}

function handleKeydown(event: KeyboardEvent): void {
  if (popup === null) {
    return;
  }
  const element = requireElement("word-popup");
  if (event.key === "Escape") {
    // Stops it here, so Escape closes the popup first and the drawer on the next press.
    event.stopImmediatePropagation();
    dismiss();
  } else if (event.key === "Tab" && !element.contains(document.activeElement)) {
    // The popup isn't next to its text in the page, so Tab is brought here.
    const first = element.querySelector<HTMLElement>("button:not([hidden]), a[href]");
    if (first !== null) {
      event.preventDefault();
      first.focus();
    }
  }
}

function dismiss(): void {
  dismissedKey = popup?.selected.key ?? null;
  closePopup();
}

function openPopup(selected: SelectedText): void {
  closePopup();
  popup = {
    selected,
    translation: { kind: "none" },
    pairKey: pairKey(),
    request: null,
    awaitingTranslation: null,
    saveFailed: false,
  };
  requireElement("word-popup").hidden = false;
  startTranslating();
  render();
}

function closePopup(): void {
  generation += 1;
  if (popup === null) {
    return;
  }
  // A word saved before its translation arrived still gets the result.
  if (popup.awaitingTranslation === null) {
    popup.request?.abort();
  }
  popup = null;
  const element = requireElement("word-popup");
  if (element.contains(document.activeElement)) {
    requireElement("reader").focus({ preventScroll: true });
  }
  element.hidden = true;
}

// Translation

function pairKey(): string | null {
  const pair = getTranslationPair();
  return pair === null ? null : `${pair.sourceLanguage}:${pair.targetLanguage}`;
}

function handleAvailabilityChange(): void {
  if (popup === null) {
    return;
  }
  const key = pairKey();
  if (key !== popup.pairKey) {
    // The reader's language changed, so anything shown is for the wrong one.
    generation += 1;
    popup.request?.abort();
    popup.request = null;
    popup.pairKey = key;
    popup.translation = { kind: "none" };
  }
  startTranslating();
  render();
}

/** Only ever translates once the pair is available, and never starts a download. */
function startTranslating(): void {
  const language = getLanguage();
  if (
    popup === null ||
    language === null ||
    popup.translation.kind !== "none" ||
    !hasTranslationPair() ||
    translationStatus.status().state !== "available"
  ) {
    return;
  }
  generation += 1;
  const request = new AbortController();
  popup.request = request;
  popup.translation = { kind: "pending" };
  void finishTranslating(popup, popup.selected.text, language, request.signal, generation);
}

async function finishTranslating(
  owner: Popup,
  text: string,
  language: string,
  signal: AbortSignal,
  started: number,
): Promise<void> {
  const outcome = await translateSelection(text, language, signal);
  if (outcome.ok && owner.awaitingTranslation !== null) {
    await putSavedWord({ ...owner.awaitingTranslation, translation: outcome.text });
  }
  owner.awaitingTranslation = null;
  if (started !== generation || popup !== owner) {
    return;
  }
  owner.request = null;
  owner.translation = outcome.ok ? { kind: "done", text: outcome.text } : { kind: "failed" };
  render();
}

function retryTranslation(): void {
  if (popup !== null) {
    popup.translation = { kind: "none" };
    startTranslating();
    render();
  }
}

// Hear

function handleHearClick(): void {
  if (popup === null) {
    return;
  }
  if (activeRange() === popup.selected.range) {
    stopRange();
  } else {
    void speakRange(popup.selected.range);
  }
}

// Save

function savedEntry(): SavedWord | undefined {
  const language = getLanguage();
  return popup === null || language === null
    ? undefined
    : findSavedWord(popup.selected.text, language);
}

async function handleSaveClick(): Promise<void> {
  const language = getLanguage();
  const owner = popup;
  if (owner === null || language === null) {
    return;
  }
  const existing = savedEntry();
  owner.saveFailed = false;
  if (existing !== undefined) {
    owner.awaitingTranslation = null;
    owner.saveFailed = !(await deleteSavedWord(existing.id));
  } else {
    const { translation, selected } = owner;
    const entry: SavedWord = {
      id: crypto.randomUUID(),
      word: selected.text,
      translation: translation.kind === "done" ? translation.text : "",
      sentence: selected.sentence,
      source,
      language,
      savedAt: Date.now(),
    };
    if (translation.kind === "pending") {
      owner.awaitingTranslation = entry;
    }
    owner.saveFailed = !(await putSavedWord(entry));
  }
  render();
}

// Showing it

function render(): void {
  if (popup === null) {
    return;
  }
  const language = getLanguage();
  const text = requireElement("popup-text");
  text.textContent = popup.selected.text;
  text.lang = language ?? "";

  renderTranslation(popup, language);
  renderHear(popup, language);
  renderSave(popup);
  renderNote(popup);
  place();
}

function renderTranslation(current: Popup, language: string | null): void {
  const area = requireElement("popup-translation");
  const pair = getTranslationPair();
  area.hidden = language !== null && pair === null;
  area.lang = "en";
  area.removeAttribute("dir");
  if (language === null) {
    area.replaceChildren(...unknownLanguageContent());
    return;
  }
  if (pair === null) {
    area.replaceChildren();
    return;
  }
  const from = languageName(language);
  const to = languageName(getOwnLanguage());
  const { state, progress, failed } = translationStatus.status();
  switch (state) {
    case "checking":
      area.replaceChildren("Checking…");
      return;
    case "unavailable":
      area.replaceChildren(`Translation from ${from} to ${to} isn't available on this device.`);
      return;
    case "downloading":
      area.replaceChildren(
        progress === null ? "Downloading…" : `Downloading ${Math.round(progress * 100)}%`,
      );
      return;
    case "downloadable":
      area.replaceChildren(
        ...(failed
          ? ["Download didn't finish. ", linkButton("Try again", startDownload)]
          : [linkButton(`Download ${from} to ${to}`, startDownload)]),
      );
      return;
    case "available":
      renderResult(area, current.translation);
  }
}

function renderResult(area: HTMLElement, translation: Translation): void {
  if (translation.kind === "done") {
    area.lang = getOwnLanguage();
    area.dir = "auto";
    // Model output, so only ever text (invariant 4).
    area.textContent = translation.text;
  } else if (translation.kind === "failed") {
    area.replaceChildren("Couldn't translate this. ", linkButton("Try again", retryTranslation));
  } else {
    area.replaceChildren("Translating…");
  }
}

function unknownLanguageContent(): (Node | string)[] {
  return isDetecting()
    ? ["Checking…"]
    : ["Choose the text's language to translate. ", linkButton("Choose", openLanguageChooser)];
}

function startDownload(): void {
  void translationStatus.download();
}

function linkButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link-button";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function renderHear(current: Popup, language: string | null): void {
  const hear = requireElement("popup-hear");
  const noVoices = areVoicesLoaded() && availableVoices().length === 0;
  hear.hidden = language === null || noVoices;
  requireElement("popup-hear-label").textContent =
    activeRange() === current.selected.range ? "Stop" : "Hear";
}

function renderSave(current: Popup): void {
  const save = requireElement("popup-save");
  const { isInOneBlock, wordCount } = current.selected;
  save.hidden = !hasTranslationPair() || !isInOneBlock || wordCount > MAX_SAVED_WORDS;
  const isSaved = savedEntry() !== undefined;
  save.setAttribute("aria-pressed", String(isSaved));
  save.setAttribute("aria-label", isSaved ? "Remove from saved words" : "Save this word");
}

// A remote voice is named where it's chosen and in the player, not here.
function renderNote(current: Popup): void {
  const note = requireElement("popup-note");
  note.textContent = current.saveFailed ? SAVE_FAILED : "";
  note.hidden = !current.saveFailed;
}

/** Below the selection, or above it if it would otherwise run off the window. */
function place(): void {
  const selection = window.getSelection();
  if (popup === null || selection === null || selection.rangeCount === 0) {
    return;
  }
  const rects = [...selection.getRangeAt(0).getClientRects()].filter((rect) => rect.width > 0);
  const firstRect = rects[0];
  const lastRect = rects.at(-1);
  if (firstRect === undefined || lastRect === undefined) {
    return;
  }
  const element = requireElement("word-popup");
  const { width, height } = element.getBoundingClientRect();
  const fitsBelow = lastRect.bottom + GAP_PX + height <= window.innerHeight - EDGE_PX;
  const fitsAbove = firstRect.top - GAP_PX - height >= EDGE_PX;
  const below = fitsBelow || !fitsAbove;
  const anchor = below ? lastRect : firstRect;
  const top = below ? anchor.bottom + GAP_PX : anchor.top - GAP_PX - height;
  const widest = document.documentElement.clientWidth - width - EDGE_PX;
  const left = Math.max(EDGE_PX, Math.min(anchor.left, widest));
  element.style.top = `${top + window.scrollY}px`;
  element.style.left = `${left + window.scrollX}px`;
}
