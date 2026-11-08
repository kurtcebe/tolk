// Keep-in-view scrolling. The text stays still while the highlight moves down
// the screen, then the page scrolls once to bring it back up. Any manual scroll
// stops following straight away.

const TRIGGER_LINE = 2 / 3;
const TARGET_LINE = 1 / 4;
/** How low a long sentence's last word can sit, clear of the player. */
const SENTENCE_LIMIT = 0.8;
const SCROLL_SETTLE_MS = 3000;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

type Listener = () => void;

let following = true;
let scrollingOurselves = false;
let settleTimer = 0;
let listener: Listener = () => {};

export function mountFollow(onChange: Listener): void {
  listener = onChange;
  window.addEventListener("wheel", stopFollowing, { passive: true });
  window.addEventListener("touchmove", stopFollowing, { passive: true });
  window.addEventListener("scrollend", finishOurScroll);
  window.addEventListener("scroll", () => {
    if (!scrollingOurselves) {
      stopFollowing();
    }
  });
}

export function isFollowing(): boolean {
  return following;
}

export function startFollowing(): void {
  setFollowing(true);
}

/** Follows the current word, once a voice is reporting them. */
export function followWord(word: HTMLElement): void {
  if (following && !scrollingOurselves && isOutsideReadingArea(word)) {
    scrollToReadingLine(word);
  }
}

/** Follows a whole sentence, for a voice that reports no word positions. */
export function followSentence(first: HTMLElement, last: HTMLElement): void {
  if (!following || scrollingOurselves) {
    return;
  }
  const lastBottom = last.getBoundingClientRect().bottom;
  if (isOutsideReadingArea(first) || lastBottom > window.innerHeight * SENTENCE_LIMIT) {
    scrollToReadingLine(first);
  }
}

function isOutsideReadingArea(element: HTMLElement): boolean {
  const { top, bottom } = element.getBoundingClientRect();
  return top < 0 || bottom > window.innerHeight * TRIGGER_LINE;
}

function scrollToReadingLine(element: HTMLElement): void {
  const target =
    window.scrollY +
    element.getBoundingClientRect().top -
    window.innerHeight * TARGET_LINE;
  const maximum = document.documentElement.scrollHeight - window.innerHeight;
  const clamped = Math.max(0, Math.min(target, maximum));

  // A scroll that goes nowhere never fires scrollend, so it can't be waited for.
  if (Math.abs(clamped - window.scrollY) < 1) {
    return;
  }

  scrollingOurselves = true;
  // A safety net in case the browser cuts the scroll short without a scrollend.
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(finishOurScroll, SCROLL_SETTLE_MS);
  window.scrollTo({
    top: clamped,
    behavior: reducedMotion.matches ? "instant" : "smooth",
  });
}

function finishOurScroll(): void {
  window.clearTimeout(settleTimer);
  scrollingOurselves = false;
}

function stopFollowing(): void {
  // The reader's own scroll takes over from any scroll of ours still running.
  finishOurScroll();
  setFollowing(false);
}

function setFollowing(value: boolean): void {
  if (following !== value) {
    following = value;
    listener();
  }
}
