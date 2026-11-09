// The one owner of the two languages' current values: L2, the language being
// read, and L1, the reader's own. A reader's choice always beats detection, so a
// detection that finishes late can't overwrite an override.
//
// An override lasts until the page closes, except for a book, which saves its own.

import {
  createTracker,
  detectionTarget,
  detectLanguages,
  translationTarget,
  type LanguagePair,
} from "./capabilities.js";
import { pickLanguage } from "./detect.js";
import { browserLanguage, sameLanguage } from "./languages.js";
import { getSettings, subscribe } from "./state.js";

export type LanguageOrigin = "detected" | "chosen";

const listeners = new Set<() => void>();

export const detectionStatus = createTracker();
export const translationStatus = createTracker();

let detected: string | null = null;
let chosen: string | null = null;
let sample = "";
let detection: Promise<void> | null = null;
let detectionRunning = false;
let translationPairKey: string | null = null;

/** The language of the text, or null when it's Unknown. */
export function getLanguage(): string | null {
  return chosen ?? detected;
}

/** The reader's own choice for this text, or null when detection decides. */
export function getChosenLanguage(): string | null {
  return chosen;
}

/** A choice saved with a book, set before anything is built or subscribed. */
export function restoreChosenLanguage(language: string | null): void {
  chosen = language;
}

export function getDetectedLanguage(): string | null {
  return detected;
}

export function getLanguageOrigin(): LanguageOrigin | null {
  if (chosen !== null) {
    return "chosen";
  }
  return detected !== null ? "detected" : null;
}

export function isDetecting(): boolean {
  return detectionRunning || detectionStatus.status().state === "checking";
}

/** False when L2 is Unknown or equals L1, which leaves nothing to translate. */
export function hasTranslationPair(): boolean {
  return translationPairKey !== null;
}

/** What to translate from and to, or null when L2 is Unknown or equals L1. */
export function getTranslationPair(): LanguagePair | null {
  const sourceLanguage = getLanguage();
  const targetLanguage = getOwnLanguage();
  return sourceLanguage !== null && !sameLanguage(sourceLanguage, targetLanguage)
    ? { sourceLanguage, targetLanguage }
    : null;
}

/** L1. Until first run is finished, the card's pre-filled language applies. */
export function getOwnLanguage(): string {
  return getSettings().ownLanguage ?? browserLanguage();
}

export function subscribeLanguage(listener: () => void): void {
  listeners.add(listener);
}

export function chooseLanguage(language: string): void {
  chosen = language;
  languageChanged();
}

export function useDetectedLanguage(): void {
  chosen = null;
  languageChanged();
}

/** Resolves once this load's detection has answered or can't go further by itself. */
export async function startLanguages(text: string): Promise<void> {
  sample = text;
  subscribe(refreshTranslation);
  detectionStatus.subscribe(() => {
    void detectIfReady();
    notify();
  });
  await detectionStatus.track(detectionTarget());
  await detectIfReady();
}

/** Also runs when a download finishes, since that makes the detector available. */
function detectIfReady(): Promise<void> {
  if (detectionStatus.status().state !== "available" || sample === "") {
    return Promise.resolve();
  }
  detection ??= runDetection();
  return detection;
}

async function runDetection(): Promise<void> {
  detectionRunning = true;
  notify();
  try {
    detected = pickLanguage(await detectLanguages(sample));
  } catch (error) {
    console.warn("Language detection failed.", error);
  } finally {
    detectionRunning = false;
    languageChanged();
  }
}

function languageChanged(): void {
  refreshTranslation();
  notify();
}

/** Checks the current pair. Translation has no pair when L2 is Unknown or equals L1. */
function refreshTranslation(): void {
  const pair = getTranslationPair();
  const key = pair !== null ? `${pair.sourceLanguage}:${pair.targetLanguage}` : null;
  if (key === translationPairKey) {
    return;
  }
  translationPairKey = key;
  if (pair !== null) {
    void translationStatus.track(translationTarget(pair));
  } else {
    translationStatus.clear();
  }
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}
