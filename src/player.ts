// The floating player: transport, speed and voice. It only shows state owned
// elsewhere, and sits in fixed overlays so it can't move the text (invariant 5).

import { requireElement } from "./controls.js";
import { getLanguage, isDetecting, subscribeLanguage } from "./document-language.js";
import { isFollowing, mountFollow } from "./follow.js";
import { openLanguageChooser } from "./language-status.js";
import { languageName } from "./languages.js";
import {
  activeRange,
  didSpeechFail,
  getStatus,
  pause,
  play,
  playRange,
  returnToPosition,
  speechSettingsChanged,
  stepSentence,
  subscribePlayback,
  togglePlayback,
  type SpeechRange,
} from "./playback.js";
import {
  getSettings,
  getSpeechPreference,
  MAX_RATE,
  MIN_RATE,
  subscribe,
  updateSpeechPreference,
} from "./state.js";
import {
  areVoicesLoaded,
  availableVoices,
  currentVoice,
  pickVoice,
  reportsWordPositions,
  subscribeVoices,
  voicesReady,
} from "./voices.js";

const REMOTE_NOTE = "This voice sends the text to Google to be spoken.";
const SENTENCE_ONLY_NOTE = "Only the sentence is highlighted.";
const FAILED_NOTE = "This voice stopped responding. Press Play to try again.";

// The slider runs from -100 to 100 with normal speed at 0. Local voices don't
// change at all across roughly rate 0.95 to 1.02, so that whole zone snaps to
// normal and the label can't say "slower" while the voice sounds the same.
const SNAP_BELOW = -5;
const SNAP_ABOVE = 2;
const NUDGE_STEP = 5;

/** The docked panel's 208 px width, its 16 px from the window edge, and a 16 px gap to the text. */
const MARGIN_NEEDED_PX = 240;

/** Book mode's player is called up by hand. Learner's is always visible. */
let openInBook = false;
/** Set when Play is what opened the picker, so picking a voice starts speech. */
let playAfterPick = false;
/** The same, for a range: what to speak once a voice has been picked. */
let rangeAfterPick: SpeechRange | null = null;

export function mountPlayer(): void {
  mountFollow(renderPlayer);
  mountTransport();
  mountSpeed();
  mountVoicePicker();
  mountVisibility();
  mountDock();
  subscribePlayback(renderPlayer);
  subscribeLanguage(renderPlayer);
  subscribeVoices(() => {
    renderVoicePicker();
    renderPlayer();
  });
  renderPlayer();
}

export function isPlayerVisible(): boolean {
  return getSettings().mode === "learner" || openInBook;
}

function mountTransport(): void {
  requireElement("player-play").addEventListener("click", () => void handlePlayClick());
  requireElement("player-previous").addEventListener("click", () => stepSentence(-1));
  requireElement("player-next").addEventListener("click", () => stepSentence(1));
  requireElement("back-to-position").addEventListener("click", returnToPosition);
  requireElement("player-close").addEventListener("click", () => setOpenInBook(false));
  requireElement("read-aloud-button").addEventListener("click", () => {
    // Opens without starting, so nothing talks unexpectedly.
    setOpenInBook(!openInBook);
  });
}

/** Also what Space does. Remote-only languages offer the voice rather than speaking. */
export async function handlePlayClick(): Promise<void> {
  await voicesReady();
  if (currentVoice() === null && availableVoices().length > 0) {
    playAfterPick = true;
    requireElement("voice-picker").showPopover();
    return;
  }
  togglePlayback();
}

/**
 * Speaks a range, for Hear and Read this paragraph. Like Play, a language with
 * only remote voices offers one rather than speaking. In Book mode that opens the
 * player too, since the picker belongs to it and its note says the text leaves.
 */
export async function speakRange(range: SpeechRange): Promise<void> {
  await voicesReady();
  if (currentVoice() === null && availableVoices().length > 0) {
    rangeAfterPick = range;
    if (!isPlayerVisible()) {
      setOpenInBook(true);
    }
    requireElement("voice-picker").showPopover();
    return;
  }
  await playRange(range);
}

function setOpenInBook(open: boolean): void {
  openInBook = open;
  if (!open) {
    pause();
  }
  renderPlayer();
}

function mountVisibility(): void {
  let previousMode = getSettings().mode;
  subscribe(({ mode }) => {
    if (mode === previousMode) {
      return;
    }
    previousMode = mode;
    openInBook = false;
    if (mode === "book") {
      pause();
    }
    renderPlayer();
  });
}

/** The column scales with the text, so the room in the margin depends on both. */
function mountDock(): void {
  window.addEventListener("resize", updateDock);
  subscribe(updateDock);
}

function updateDock(): void {
  const root = document.documentElement;
  const columnRight = requireElement("reader").getBoundingClientRect().right;
  const fits = root.clientWidth - columnRight >= MARGIN_NEEDED_PX;
  root.dataset["playerDock"] = fits ? "margin" : "bottom";
}

function renderPlayer(): void {
  // There's nothing to read aloud with until the text has a language.
  const unknown = getLanguage() === null;
  const noVoices = areVoicesLoaded() && availableVoices().length === 0;
  const isBook = getSettings().mode === "book";

  requireElement("player").hidden = !isPlayerVisible();
  requireElement("player-bar").hidden = unknown || noVoices;

  const readAloud = requireElement("read-aloud-button");
  readAloud.hidden = !isBook || unknown || noVoices;
  readAloud.setAttribute("aria-expanded", String(openInBook));
  requireElement("player-close").hidden = !isBook;

  const status = getStatus();
  const playButton = requireElement("player-play");
  playButton.dataset["playing"] = String(status === "playing");
  playButton.setAttribute("aria-label", status === "playing" ? "Pause" : "Play");
  for (const id of ["player-previous", "player-next"]) {
    requireElement(id).setAttribute("aria-disabled", String(status === "idle"));
  }

  // Hear doesn't move the page, so there's no reading position to go back to.
  requireElement("back-to-position").hidden =
    status === "idle" || isFollowing() || activeRange()?.follow === false;
  renderVoiceButton();
  renderNote(noVoices);
  renderSpeed();
}

function renderVoiceButton(): void {
  const voice = currentVoice();
  requireElement("voice-name").textContent = voice?.name ?? "Choose a voice";
  requireElement("voice-kind").textContent =
    voice === null ? "" : voice.localService ? "Local" : "Remote";
}

function renderNote(noVoices: boolean): void {
  const note = requireElement("player-note");
  const language = getLanguage();
  if (language === null) {
    renderUnknownNote(note);
    return;
  }
  if (noVoices) {
    note.replaceChildren(`No voice for ${languageName(language)} on this device. `, addVoiceLink());
    note.hidden = false;
    return;
  }
  const text = noteForVoice();
  note.textContent = text;
  note.hidden = text === "";
}

function renderUnknownNote(note: HTMLElement): void {
  note.hidden = isDetecting();
  if (note.hidden || note.querySelector("button") !== null) {
    return;
  }
  const choose = document.createElement("button");
  choose.type = "button";
  choose.className = "link-button";
  choose.textContent = "Choose";
  choose.addEventListener("click", openLanguageChooser);
  note.replaceChildren("Choose the text's language to read aloud. ", choose);
}

function addVoiceLink(): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = "help.html#voices";
  link.target = "_blank";
  link.textContent = "How to add a voice";
  return link;
}

function noteForVoice(): string {
  if (didSpeechFail()) {
    return FAILED_NOTE;
  }
  const voice = currentVoice();
  if (voice === null || voice.localService) {
    return voice !== null && reportsWordPositions(voice) === false ? SENTENCE_ONLY_NOTE : "";
  }
  return reportsWordPositions(voice) === false
    ? `${REMOTE_NOTE} ${SENTENCE_ONLY_NOTE}`
    : REMOTE_NOTE;
}

// Voice picker

function mountVoicePicker(): void {
  requireElement("voice-picker").addEventListener("toggle", (event) => {
    if (event instanceof ToggleEvent && event.newState === "closed") {
      playAfterPick = false;
      rangeAfterPick = null;
    }
  });
}

function renderVoicePicker(): void {
  const list = requireElement("voice-list");
  const selected = currentVoice();
  list.replaceChildren(
    ...availableVoices().map((voice) => renderVoiceOption(voice, voice === selected)),
  );
  // Only remote voices means nothing plays until a reader accepts this.
  requireElement("voice-picker-note").hidden =
    selected !== null || availableVoices().length === 0;
}

function renderVoiceOption(voice: SpeechSynthesisVoice, checked: boolean): HTMLElement {
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "voice";
  input.value = voice.voiceURI;
  input.checked = checked;
  input.addEventListener("change", () => handleVoicePicked(voice.voiceURI));

  const name = document.createElement("span");
  name.className = "voice-option-name";
  name.textContent = voice.name;

  const detail = document.createElement("span");
  detail.className = "voice-option-detail";
  detail.textContent = describeVoice(voice);

  const text = document.createElement("span");
  text.className = "voice-option-text";
  text.append(name, detail);

  const label = document.createElement("label");
  label.className = "voice-option";
  label.append(input, text);
  return label;
}

function describeVoice(voice: SpeechSynthesisVoice): string {
  const kind = voice.localService ? "Local" : "Remote, sends text to Google";
  return reportsWordPositions(voice) === false ? `${kind}. Highlights the sentence only` : kind;
}

function handleVoicePicked(voiceURI: string): void {
  const shouldPlay = playAfterPick;
  const pendingRange = rangeAfterPick;
  pickVoice(voiceURI);
  requireElement("voice-picker").hidePopover();
  renderVoicePicker();
  speechSettingsChanged();
  if (pendingRange !== null) {
    void playRange(pendingRange);
  } else if (shouldPlay) {
    void play();
  }
}

// Speed

function mountSpeed(): void {
  const slider = speedSlider();
  // Dragging only updates the label. Each committed value restarts the sentence
  // and writes to synced storage, so that waits for the release.
  slider.addEventListener("input", () => {
    slider.value = String(snap(Number(slider.value)));
    renderSpeedLabel(Number(slider.value));
  });
  slider.addEventListener("change", () => commitPosition(Number(slider.value)));
  // The arrow keys are handled here because a 1-step move would snap straight
  // back to normal, leaving a keyboard user unable to leave it.
  slider.addEventListener("keydown", (event) => {
    const direction = arrowDirection(event.key);
    if (direction !== null) {
      event.preventDefault();
      nudgeBy(direction, 1);
    }
  });
  requireElement("speed-reset").addEventListener("click", () => commitPosition(0));
}

function arrowDirection(key: string): -1 | 1 | null {
  if (key === "ArrowLeft" || key === "ArrowDown") {
    return -1;
  }
  return key === "ArrowRight" || key === "ArrowUp" ? 1 : null;
}

/** One step slower or faster, for the `[` and `]` keys. */
export function nudgeSpeed(direction: -1 | 1): void {
  nudgeBy(direction, NUDGE_STEP);
}

function nudgeBy(direction: -1 | 1, step: number): void {
  const current = Number(speedSlider().value);
  let next = snap(current + direction * step);
  if (next === current && current === 0) {
    // Still inside the snap zone, so jump to its edge.
    next = direction === -1 ? SNAP_BELOW - 1 : SNAP_ABOVE + 1;
  }
  commitPosition(Math.max(-100, Math.min(100, next)));
}

function commitPosition(sliderPosition: number): void {
  updateSpeechPreference(getLanguage(), { rate: positionToRate(sliderPosition) });
  renderSpeed();
  speechSettingsChanged();
}

function renderSpeed(): void {
  const sliderPosition = rateToPosition(getSpeechPreference(getLanguage()).rate);
  speedSlider().value = String(sliderPosition);
  renderSpeedLabel(sliderPosition);
}

function renderSpeedLabel(sliderPosition: number): void {
  const label = speedLabel(sliderPosition);
  requireElement("speed-label").textContent = label;
  speedSlider().setAttribute("aria-valuetext", label);
  requireElement("speed-reset").hidden = sliderPosition === 0;
}

function speedLabel(sliderPosition: number): string {
  if (sliderPosition === 0) {
    return "Normal speed";
  }
  return sliderPosition < 0 ? "Slower than normal" : "Faster than normal";
}

function snap(sliderPosition: number): number {
  return sliderPosition >= SNAP_BELOW && sliderPosition <= SNAP_ABOVE ? 0 : sliderPosition;
}

/** Each half of the slider has its own scale, so normal can sit at the centre. */
function positionToRate(sliderPosition: number): number {
  const range = sliderPosition < 0 ? 1 - MIN_RATE : MAX_RATE - 1;
  return Math.round((1 + (sliderPosition / 100) * range) * 100) / 100;
}

function rateToPosition(rate: number): number {
  const range = rate < 1 ? 1 - MIN_RATE : MAX_RATE - 1;
  return snap(Math.round(((rate - 1) / range) * 100));
}

function speedSlider(): HTMLInputElement {
  const slider = requireElement("speed-slider");
  if (!(slider instanceof HTMLInputElement)) {
    throw new Error("reader.html's #speed-slider must be an input");
  }
  return slider;
}
