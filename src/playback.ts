// The one place that knows whether speech is running. Everything else reads the
// status from here and subscribes to changes.
//
// Speech is one utterance per sentence, with the utterance cut straight from the
// block's `text`, so a boundary event maps back with one addition. Pausing
// cancels the utterance and restarts from the current word, because pause() isn't
// reliable on every platform. Every restart goes through speakFromPosition().

import { getLanguage } from "./document-language.js";
import { followSentence, followWord, startFollowing } from "./follow.js";
import {
  clearHighlights,
  clearWord,
  paintSentence,
  paintWord,
} from "./highlight.js";
import { getSpeechPreference } from "./state.js";
import {
  sentenceOfWord,
  wordAtOffset,
  type BlockIndex,
  type SentenceEntry,
} from "./tokenize.js";
import {
  currentVoice,
  recordWordPositions,
  reportsWordPositions,
  voicesReady,
} from "./voices.js";

export type PlaybackStatus = "idle" | "playing" | "paused";

/** A word in the current index. */
export interface WordPosition {
  blockIndex: number;
  wordIndex: number;
}

/** A stretch of text to speak and then stop, for Hear and Read this paragraph. */
export interface SpeechRange {
  from: WordPosition;
  to: WordPosition;
  /** Hear leaves the page where it is, since its text is already on screen. */
  follow: boolean;
}

interface Position {
  blockIndex: number;
  sentenceIndex: number;
  wordIndex: number;
}

interface Located {
  block: BlockIndex;
  sentence: SentenceEntry;
}

type Listener = () => void;

const WATCHDOG_INTERVAL_MS = 500;
/** Remote voices can be slow to start, so this has to allow for that. */
const START_TIMEOUT_MS = 5000;
const CHARACTERS_PER_SECOND = 14;
const QUIET_TICKS_BEFORE_ADVANCING = 2;
const WORD_REPORT_WAIT_MS = 1200;
const WORD_REPORT_WAIT_MAX_MS = 4000;

const START: Position = { blockIndex: 0, sentenceIndex: 0, wordIndex: 0 };

const listeners = new Set<Listener>();

let blocks: BlockIndex[] = [];
let position: Position = START;
let status: PlaybackStatus = "idle";
let speechFailed = false;
let range: SpeechRange | null = null;
// Where a session under way had got to when a range interrupted it.
let placeBeforeRange: Position | null = null;

// Bumped by every start and stop. An utterance's events carry the number it
// started with, so a late event from a cancelled utterance can't move anything.
let generation = 0;
let startRetried = false;
let watchdog = 0;
let wordReportTimer = 0;
// Held so Chrome can't garbage-collect a speaking utterance and lose its events.
let activeUtterance: SpeechSynthesisUtterance | null = null;

export function initPlayback(): void {
  // Speech outlives its page, so clear anything left by a reload or a closed tab.
  speechSynthesis.cancel();
  window.addEventListener("pagehide", () => speechSynthesis.cancel());
}

/**
 * Swaps in a newly built word index. The old one's elements are about to leave
 * the page, so speech stops first and the session starts over (invariant 2).
 */
export function replaceBlocks(chapterBlocks: BlockIndex[]): void {
  speechFailed = false;
  finish();
  blocks = chapterBlocks;
}

export function getBlocks(): readonly BlockIndex[] {
  return blocks;
}

export function getStatus(): PlaybackStatus {
  return status;
}

/** The range being spoken. Compare it with `===` to tell whose it is. */
export function activeRange(): SpeechRange | null {
  return range;
}

/**
 * Speaks a range and stops at its end. A session already under way picks up
 * again afterwards, paused at the place it had reached.
 */
export async function playRange(next: SpeechRange): Promise<void> {
  await voicesReady();
  const start = positionOf(next.from);
  if (start === null || currentVoice() === null) {
    return;
  }
  if (range === null && status !== "idle") {
    placeBeforeRange = position;
  }
  range = next;
  position = start;
  speechFailed = false;
  if (next.follow) {
    startFollowing();
  }
  setStatus("playing");
  speakFromPosition();
}

/** Stops a range early, as if it had reached its end. */
export function stopRange(): void {
  if (range !== null) {
    endRange();
  }
}

function positionOf({ blockIndex, wordIndex }: WordPosition): Position | null {
  const sentences = blocks[blockIndex]?.sentences ?? [];
  const sentenceIndex = sentenceOfWord(sentences, wordIndex);
  return sentenceIndex === -1 ? null : { blockIndex, sentenceIndex, wordIndex };
}

function endRange(): void {
  const place = placeBeforeRange;
  if (place === null) {
    finish();
    return;
  }
  silence();
  range = null;
  placeBeforeRange = null;
  position = place;
  clearHighlights();
  paintPosition();
  setStatus("paused");
}

/** Seeking or stepping is the reader taking over, so the range and its way back are dropped. */
function leaveRange(): void {
  range = null;
  placeBeforeRange = null;
}

function isAtRangeEnd(): boolean {
  return (
    range !== null &&
    position.blockIndex === range.to.blockIndex &&
    position.sentenceIndex === positionOf(range.to)?.sentenceIndex
  );
}

export function didSpeechFail(): boolean {
  return speechFailed;
}

export function subscribePlayback(listener: Listener): void {
  listeners.add(listener);
}

export async function play(): Promise<void> {
  await voicesReady();
  if (status === "playing" || currentVoice() === null) {
    return;
  }
  speechFailed = false;
  startFollowing();
  setStatus("playing");
  speakFromPosition();
}

export function pause(): void {
  if (status === "playing") {
    silence();
    setStatus("paused");
  }
}

export function togglePlayback(): void {
  if (status === "playing") {
    pause();
  } else {
    void play();
  }
}

/** Seeks to a word. Does nothing from idle, so a stray click can't start speech. */
export function seekToWord(blockId: string, wordIndex: number): void {
  if (status === "idle") {
    return;
  }
  const blockIndex = blocks.findIndex((block) => block.blockId === blockId);
  const block = blocks[blockIndex];
  if (block === undefined) {
    return;
  }
  const sentenceIndex = sentenceOfWord(block.sentences, wordIndex);
  if (sentenceIndex !== -1) {
    leaveRange();
    startFollowing();
    moveTo({ blockIndex, sentenceIndex, wordIndex });
  }
}

/** Moves one sentence either way, across blocks. Stays put at either end. */
export function stepSentence(direction: -1 | 1): void {
  if (status === "idle") {
    return;
  }
  const next = neighbouringSentence(direction);
  if (next !== null) {
    leaveRange();
    startFollowing();
    moveTo(next);
  }
}

/** Applies a changed speed or voice, which needs a new utterance to take effect. */
export function speechSettingsChanged(): void {
  if (status === "playing") {
    speakFromPosition();
  }
  notify();
}

/** Scrolls back to the reading position and resumes following. */
export function returnToPosition(): void {
  startFollowing();
  followPosition();
}

function neighbouringSentence(direction: -1 | 1): Position | null {
  const { blockIndex, sentenceIndex } = position;
  const sameBlock = sentenceIndex + direction;
  if (blocks[blockIndex]?.sentences[sameBlock] !== undefined) {
    return startOfSentence(blockIndex, sameBlock);
  }
  const nextBlock = blockIndex + direction;
  const block = blocks[nextBlock];
  if (block === undefined) {
    return null;
  }
  return startOfSentence(
    nextBlock,
    direction === 1 ? 0 : block.sentences.length - 1,
  );
}

function startOfSentence(blockIndex: number, sentenceIndex: number): Position {
  const wordIndex = blocks[blockIndex]?.sentences[sentenceIndex]?.firstWord ?? 0;
  return { blockIndex, sentenceIndex, wordIndex };
}

function moveTo(next: Position): void {
  position = next;
  if (status === "playing") {
    speakFromPosition();
  } else {
    paintPosition();
    followPosition();
  }
}

function locatePosition(): Located | null {
  const block = blocks[position.blockIndex];
  const sentence = block?.sentences[position.sentenceIndex];
  return block !== undefined && sentence !== undefined ? { block, sentence } : null;
}

function speakFromPosition(): void {
  const voice = currentVoice();
  const located = locatePosition();
  if (voice === null || located === null) {
    finish();
    return;
  }
  const { block, sentence } = located;

  // The sentence's own start keeps an opening quote, which a word's start wouldn't.
  const resumeWord =
    position.wordIndex > sentence.firstWord ? block.words[position.wordIndex] : undefined;
  const from = resumeWord?.start ?? sentence.start;
  const raw = block.text.slice(from, spokenEnd(located));
  // charIndex counts from the start of the utterance, so this maps it back.
  const base = from + (raw.length - raw.trimStart().length);
  const spoken = raw.trim();

  silence();
  const started = generation;
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = getSpeechPreference(getLanguage()).rate;
  activeUtterance = utterance;

  let hasStarted = false;
  let reportedWord = false;
  const isCurrent = (): boolean => started === generation;

  utterance.addEventListener("start", () => {
    if (isCurrent()) {
      hasStarted = true;
      startRetried = false;
      awaitWordReports(voice, utterance.rate, isCurrent);
    }
  });
  utterance.addEventListener("boundary", (event) => {
    if (isCurrent() && event.name === "word") {
      reportedWord = true;
      handleWordBoundary(voice, located, base + event.charIndex);
    }
  });
  utterance.addEventListener("end", () => {
    if (isCurrent()) {
      // A short sentence can end before the wait in awaitWordReports() runs out.
      if (!reportedWord) {
        markNoWordPositions(voice);
      }
      advance();
    }
  });
  utterance.addEventListener("error", (event) => {
    // cancel() raises these itself, on purpose.
    if (isCurrent() && event.error !== "interrupted" && event.error !== "canceled") {
      console.warn("Speech failed.", event.error);
      failSpeech();
    }
  });

  paintPosition();
  followPosition();

  // cancel() and speak() back to back can drop the new utterance, so the queue
  // gets a moment to empty first.
  window.setTimeout(() => {
    if (isCurrent()) {
      speechSynthesis.speak(utterance);
    }
  }, 0);

  startWatchdog(spoken.length, utterance.rate, () => hasStarted);
}

/**
 * Where this utterance stops: a range's last word, or else the sentence's end.
 * A range that reaches its sentence's last word keeps the closing punctuation,
 * because that's what gives the voice its falling tone.
 */
function spokenEnd({ block, sentence }: Located): number {
  const last =
    range !== null && isAtRangeEnd() && range.to.wordIndex < sentence.lastWord
      ? block.words[range.to.wordIndex]
      : undefined;
  return last?.end ?? sentence.end;
}

function handleWordBoundary(
  voice: SpeechSynthesisVoice,
  { block, sentence }: Located,
  offset: number,
): void {
  window.clearTimeout(wordReportTimer);
  recordWordPositions(voice, true);

  // A voice can report a position in the space before a word, or just past the
  // end of the sentence.
  const found = wordAtOffset(block.words, offset);
  position = {
    ...position,
    wordIndex: Math.min(sentence.lastWord, Math.max(sentence.firstWord, found)),
  };
  paintPosition();
  followPosition();
}

/** A voice that stays silent about words past this wait gets the sentence band alone. */
function awaitWordReports(
  voice: SpeechSynthesisVoice,
  rate: number,
  isCurrent: () => boolean,
): void {
  window.clearTimeout(wordReportTimer);
  const wait = Math.min(WORD_REPORT_WAIT_MAX_MS, WORD_REPORT_WAIT_MS / rate);
  wordReportTimer = window.setTimeout(() => {
    if (isCurrent()) {
      markNoWordPositions(voice);
    }
  }, wait);
}

function markNoWordPositions(voice: SpeechSynthesisVoice): void {
  // One slow start doesn't undo what a voice has already shown it can do.
  if (reportsWordPositions(voice) !== true) {
    recordWordPositions(voice, false);
    clearWord();
  }
}

function advance(): void {
  if (isAtRangeEnd()) {
    endRange();
    return;
  }
  const next = neighbouringSentence(1);
  if (next === null) {
    finish();
    return;
  }
  position = next;
  speakFromPosition();
}

function finish(): void {
  silence();
  leaveRange();
  position = START;
  clearHighlights();
  setStatus("idle");
}

function failSpeech(): void {
  silence();
  speechFailed = true;
  setStatus("paused");
}

/** Stops speech and invalidates every event and timer belonging to it. */
function silence(): void {
  generation += 1;
  window.clearInterval(watchdog);
  window.clearTimeout(wordReportTimer);
  speechSynthesis.cancel();
}

/**
 * An engine can go quiet without telling us: speak() never makes a sound, the
 * audio ends with no `end` event, or it stalls while still claiming to speak.
 * Any of those would leave the highlight stuck.
 */
function startWatchdog(
  characters: number,
  rate: number,
  hasStarted: () => boolean,
): void {
  const startedAt = performance.now();
  const allowedMs = ((characters / CHARACTERS_PER_SECOND) * 1000 * 3) / rate + 2000;
  let quietTicks = 0;

  watchdog = window.setInterval(() => {
    const elapsed = performance.now() - startedAt;
    if (!hasStarted()) {
      if (elapsed > START_TIMEOUT_MS) {
        retryOrFail();
      }
      return;
    }
    quietTicks = speechSynthesis.speaking ? 0 : quietTicks + 1;
    if (quietTicks >= QUIET_TICKS_BEFORE_ADVANCING || elapsed > allowedMs) {
      console.warn("Speech went quiet without finishing, so moving on.");
      advance();
    }
  }, WATCHDOG_INTERVAL_MS);
}

function retryOrFail(): void {
  if (startRetried) {
    startRetried = false;
    console.warn("Speech didn't start after a retry.");
    failSpeech();
  } else {
    startRetried = true;
    speakFromPosition();
  }
}

function paintPosition(): void {
  const located = locatePosition();
  if (located === null) {
    return;
  }
  const { block } = located;
  const [firstWord, lastWord] = wordsToBand(located);
  const first = block.words[firstWord];
  const last = block.words[lastWord];
  if (first !== undefined && last !== undefined) {
    paintSentence(first.element, last.element);
  }

  // Only a voice that has actually reported a word gets a word highlight. Until
  // then, or for a voice that never does, the sentence band is the honest answer.
  const word = block.words[position.wordIndex];
  if (word !== undefined && voiceReportsWords()) {
    paintWord(word.element);
  } else {
    clearWord();
  }
}

/** The sentence, cut down to a range's ends, so the band marks only what gets spoken. */
function wordsToBand({ sentence }: Located): [number, number] {
  if (range === null) {
    return [sentence.firstWord, sentence.lastWord];
  }
  const { from, to } = range;
  const { blockIndex } = position;
  return [
    from.blockIndex === blockIndex
      ? Math.max(sentence.firstWord, from.wordIndex)
      : sentence.firstWord,
    to.blockIndex === blockIndex ? Math.min(sentence.lastWord, to.wordIndex) : sentence.lastWord,
  ];
}

function followPosition(): void {
  const located = locatePosition();
  if (located === null || range?.follow === false) {
    return;
  }
  const { block, sentence } = located;
  const word = block.words[position.wordIndex];
  const first = block.words[sentence.firstWord];
  const last = block.words[sentence.lastWord];
  if (word !== undefined && voiceReportsWords()) {
    followWord(word.element);
  } else if (first !== undefined && last !== undefined) {
    followSentence(first.element, last.element);
  }
}

function voiceReportsWords(): boolean {
  const voice = currentVoice();
  return voice !== null && reportsWordPositions(voice) === true;
}

function setStatus(next: PlaybackStatus): void {
  status = next;
  notify();
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}
