// Keyboard shortcuts and click-to-seek. Both only act while the player is
// visible, so a hidden player can't start talking or move the reading position.

import { requireElement } from "./controls.js";
import { seekToWord, stepSentence } from "./playback.js";
import { handlePlayClick, isPlayerVisible, nudgeSpeed } from "./player.js";

/** Long enough to tell a single click from the first half of a double-click. */
const DOUBLE_CLICK_WAIT_MS = 250;

let pendingSeek = 0;

export function mountShortcuts(): void {
  document.addEventListener("keydown", handleKeydown);
  requireElement("reader").addEventListener("click", handleReaderClick);
}

function handleKeydown(event: KeyboardEvent): void {
  if (
    !isPlayerVisible() ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    isField(event.target)
  ) {
    return;
  }
  const action = actionFor(event);
  if (action !== null) {
    event.preventDefault();
    action();
  }
}

function actionFor(event: KeyboardEvent): (() => void) | null {
  switch (event.key) {
    case " ":
      // A focused button or link already acts on Space by itself.
      return isActivatable(event.target) ? null : () => void handlePlayClick();
    case "ArrowLeft":
      return () => stepSentence(-1);
    case "ArrowRight":
      return () => stepSentence(1);
    case "[":
      return () => nudgeSpeed(-1);
    case "]":
      return () => nudgeSpeed(1);
    default:
      return null;
  }
}

/** Includes radios and the slider, where the arrow keys already mean something. */
function isField(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("input, select, textarea, [contenteditable]") !== null
  );
}

function isActivatable(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a[href]") !== null;
}

function handleReaderClick(event: MouseEvent): void {
  window.clearTimeout(pendingSeek);
  // The second click of a double-click is selecting a word, not seeking.
  if (event.detail !== 1 || !isPlayerVisible() || !(event.target instanceof Element)) {
    return;
  }
  const word = event.target.closest<HTMLElement>(".w");
  const block = word?.closest<HTMLElement>("[data-block-id]");
  // A click on a word inside a link follows the link.
  if (!word || !block || word.closest("a") !== null) {
    return;
  }
  const wordIndex = Number(word.dataset["w"]);
  const blockId = block.dataset["blockId"] ?? "";

  pendingSeek = window.setTimeout(() => {
    // A drag leaves a selection behind. It's checked here, after the wait, so a
    // click that merely ended a selection doesn't seek.
    if (window.getSelection()?.isCollapsed !== false) {
      seekToWord(blockId, wordIndex);
    }
  }, DOUBLE_CLICK_WAIT_MS);
}
