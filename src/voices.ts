// Which voices exist for the document's language, which one to use, and what
// each has shown it can do. A local voice is the default. A remote voice sends
// text to Google, so it's only ever used after a reader picks it (invariant 6).

import { getVoiceChoice, saveVoiceChoice } from "./state.js";

const VOICE_LIST_TIMEOUT_MS = 2000;

type Listener = () => void;

let language: string | null = null;
let voices: SpeechSynthesisVoice[] = [];
let listener: Listener = () => {};
let ready: Promise<void> = Promise.resolve();

// By voiceURI, for this session. A voice is measured rather than trusted: this
// is only known once it has spoken.
const wordReports = new Map<string, boolean>();

export function loadVoices(documentLanguage: string | null, onChange: Listener): void {
  language = documentLanguage;
  listener = onChange;
  speechSynthesis.addEventListener("voiceschanged", refreshVoices);
  ready = waitForVoiceList();
}

/** Resolves once the voice list is in, so speech can't start with the wrong voice. */
export function voicesReady(): Promise<void> {
  return ready;
}

async function waitForVoiceList(): Promise<void> {
  if (speechSynthesis.getVoices().length === 0) {
    // Chrome fills the list in later, and it stays empty on a machine with no voices.
    await new Promise<void>((resolve) => {
      speechSynthesis.addEventListener("voiceschanged", () => resolve(), { once: true });
      window.setTimeout(resolve, VOICE_LIST_TIMEOUT_MS);
    });
  }
  refreshVoices();
}

function refreshVoices(): void {
  const key = primarySubtag(language);
  voices = speechSynthesis
    .getVoices()
    .filter((voice) => key !== null && primarySubtag(voice.lang) === key);
  listener();
}

function primarySubtag(tag: string | null): string | null {
  return tag?.split(/[-_]/)[0]?.toLowerCase() ?? null;
}

export function availableVoices(): readonly SpeechSynthesisVoice[] {
  return voices;
}

/**
 * The saved choice if it still exists, or else the first local voice. Returns
 * null when only remote voices exist, because those have to be picked.
 */
export function currentVoice(): SpeechSynthesisVoice | null {
  const saved = getVoiceChoice(language);
  const chosen = voices.find((voice) => voice.voiceURI === saved);
  return chosen ?? voices.find((voice) => voice.localService) ?? null;
}

export function pickVoice(voiceURI: string): void {
  saveVoiceChoice(language, voiceURI);
}

export function reportsWordPositions(voice: SpeechSynthesisVoice): boolean | undefined {
  return wordReports.get(voice.voiceURI);
}

export function recordWordPositions(voice: SpeechSynthesisVoice, reports: boolean): void {
  if (wordReports.get(voice.voiceURI) !== reports) {
    wordReports.set(voice.voiceURI, reports);
    listener();
  }
}
