// Which voices exist for the document's language, which one to use, and what
// each has shown it can do. A local voice is the default. A remote voice sends
// text to Google, so it's only ever used after a reader picks it (invariant 6).

import { readStub, type StubbedVoices } from "./capability-stub.js";
import { getLanguage } from "./document-language.js";
import { primarySubtag } from "./languages.js";
import { getVoiceChoice, saveVoiceChoice } from "./state.js";

const VOICE_LIST_TIMEOUT_MS = 2000;

type Listener = () => void;

const listeners = new Set<Listener>();

let voices: SpeechSynthesisVoice[] = [];
let ready: Promise<void> = Promise.resolve();
let loaded = false;
let stubbedVoices: StubbedVoices | undefined;

// By voiceURI, for this session. A voice is measured rather than trusted: this
// is only known once it has spoken.
const wordReports = new Map<string, boolean>();

export function loadVoices(): void {
  speechSynthesis.addEventListener("voiceschanged", refreshVoices);
  ready = waitForVoiceList();
}

export function subscribeVoices(listener: Listener): void {
  listeners.add(listener);
}

/** Resolves once the voice list is in, so speech can't start with the wrong voice. */
export function voicesReady(): Promise<void> {
  return ready;
}

/** Whether "no voices" can be believed yet, rather than the list still being on its way. */
export function areVoicesLoaded(): boolean {
  return loaded;
}

async function waitForVoiceList(): Promise<void> {
  stubbedVoices = (await readStub()).voices;
  if (speechSynthesis.getVoices().length === 0) {
    // Chrome fills the list in later, and it stays empty on a machine with no voices.
    await new Promise<void>((resolve) => {
      speechSynthesis.addEventListener("voiceschanged", () => resolve(), { once: true });
      window.setTimeout(resolve, VOICE_LIST_TIMEOUT_MS);
    });
  }
  loaded = true;
  refreshVoices();
}

/** Rebuilds the list for the current language. An Unknown language has no voices. */
export function refreshVoices(): void {
  const key = primarySubtag(getLanguage());
  voices = speechSynthesis
    .getVoices()
    .filter((voice) => key !== null && primarySubtag(voice.lang) === key && passesStub(voice));
  notify();
}

function passesStub(voice: SpeechSynthesisVoice): boolean {
  switch (stubbedVoices) {
    case undefined:
      return true;
    case "none":
      return false;
    case "local":
      return voice.localService;
    case "remote":
      return !voice.localService;
  }
}

export function availableVoices(): readonly SpeechSynthesisVoice[] {
  return voices;
}

/**
 * The saved choice if it still exists, or else the first local voice. Returns
 * null when only remote voices exist, because those have to be picked.
 */
export function currentVoice(): SpeechSynthesisVoice | null {
  const saved = getVoiceChoice(getLanguage());
  const chosen = voices.find((voice) => voice.voiceURI === saved);
  return chosen ?? voices.find((voice) => voice.localService) ?? null;
}

export function pickVoice(voiceURI: string): void {
  saveVoiceChoice(getLanguage(), voiceURI);
}

export function reportsWordPositions(voice: SpeechSynthesisVoice): boolean | undefined {
  return wordReports.get(voice.voiceURI);
}

export function recordWordPositions(voice: SpeechSynthesisVoice, reports: boolean): void {
  if (wordReports.get(voice.voiceURI) !== reports) {
    wordReports.set(voice.voiceURI, reports);
    notify();
  }
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}
