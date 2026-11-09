// A hand-check aid that forces states this machine doesn't happen to be in. Set
// it from the reader page's DevTools console and reload, for example:
//
//   chrome.storage.local.set({ capabilityStub: { translator: "downloadable" } })
//   chrome.storage.local.remove("capabilityStub")
//
// It's read fresh on each check, so changing it during a poll takes effect, and
// it's ignored unless the extension is loaded unpacked. docs/chrome-ai-notes.md
// lists the values.

import { isOneOf, isRecord } from "./state.js";

const STUB_KEY = "capabilityStub";
const CAPABILITY_STATES = ["unavailable", "downloadable", "downloading", "available"] as const;
const VOICE_KINDS = ["local", "remote", "none"] as const;
const TRANSLATION_RESULTS = [
  "text",
  "empty",
  "echo",
  "runaway",
  "fails",
  "partial",
  "hangs",
] as const;
const RUNAWAY_REPEATS = 500;
const DOWNLOAD_STEPS = 10;
const DOWNLOAD_STEP_MS = 300;
const FAILS_AT_STEP = 5;

export type StubbedState = (typeof CAPABILITY_STATES)[number];
export type StubbedVoices = (typeof VOICE_KINDS)[number];
export type StubbedTranslationResult = (typeof TRANSLATION_RESULTS)[number];

let stubbedTranslations = 0;

export interface CapabilityStub {
  /** Replaces what the translator answers. */
  translationResult?: StubbedTranslationResult;
  /** Delays each stubbed translation, and ignores cancelling on purpose. */
  translationDelayMs?: number;
  translator?: StubbedState;
  detector?: StubbedState;
  /** Replaces what the detector answers. */
  detection?: { language: string; confidence: number };
  /** Makes a stubbed download stop halfway and fail. */
  downloadFails?: boolean;
  voices?: StubbedVoices;
}

export async function readStub(): Promise<CapabilityStub> {
  // A store install has an update_url. An unpacked one doesn't.
  if (chrome.runtime.getManifest().update_url !== undefined) {
    return {};
  }
  try {
    const stored: Record<string, unknown> = await chrome.storage.local.get(STUB_KEY);
    return parseStub(stored[STUB_KEY]);
  } catch {
    return {};
  }
}

/** Walks through progress like a real download, then finishes or fails. */
export async function runStubDownload(
  stub: CapabilityStub,
  onProgress: (fraction: number) => void,
): Promise<void> {
  for (let step = 1; step <= DOWNLOAD_STEPS; step += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, DOWNLOAD_STEP_MS));
    if (stub.downloadFails === true && step === FAILS_AT_STEP) {
      throw new Error("Stubbed download failure");
    }
    onProgress(step / DOWNLOAD_STEPS);
  }
}

/** Whether translating should use the stand-in below rather than Chrome's translator. */
export function stubsTranslation(stub: CapabilityStub): boolean {
  return (
    stub.translator !== undefined ||
    stub.translationResult !== undefined ||
    stub.translationDelayMs !== undefined
  );
}

/** Answers like a translator would, including the ways a real one can go wrong. */
export async function runStubTranslation(stub: CapabilityStub, text: string): Promise<unknown> {
  stubbedTranslations += 1;
  if (stub.translationDelayMs !== undefined) {
    await new Promise((resolve) => window.setTimeout(resolve, stub.translationDelayMs));
  }
  switch (stub.translationResult) {
    case "empty":
      return "";
    case "echo":
      return text;
    case "runaway":
      return "herhaling ".repeat(RUNAWAY_REPEATS);
    case "fails":
      throw new Error("Stubbed translation failure");
    case "partial":
      if (stubbedTranslations % 2 === 0) {
        throw new Error("Stubbed translation failure");
      }
      return `[stub] ${text}`;
    case "hangs":
      return new Promise(() => {});
    case "text":
    case undefined:
      return `[stub] ${text}`;
  }
}

function parseStub(stored: unknown): CapabilityStub {
  if (!isRecord(stored)) {
    return {};
  }
  const {
    translator,
    detector,
    detection,
    downloadFails,
    voices,
    translationResult,
    translationDelayMs,
  } = stored;
  const stub: CapabilityStub = { downloadFails: downloadFails === true };
  if (isOneOf(TRANSLATION_RESULTS, translationResult)) {
    stub.translationResult = translationResult;
  }
  if (typeof translationDelayMs === "number") {
    stub.translationDelayMs = translationDelayMs;
  }
  if (isOneOf(CAPABILITY_STATES, translator)) {
    stub.translator = translator;
  }
  if (isOneOf(CAPABILITY_STATES, detector)) {
    stub.detector = detector;
  }
  if (isOneOf(VOICE_KINDS, voices)) {
    stub.voices = voices;
  }
  const parsedDetection = parseDetection(detection);
  if (parsedDetection !== null) {
    stub.detection = parsedDetection;
  }
  return stub;
}

function parseDetection(stored: unknown): CapabilityStub["detection"] | null {
  if (!isRecord(stored)) {
    return null;
  }
  const { language, confidence } = stored;
  return typeof language === "string" && typeof confidence === "number"
    ? { language, confidence }
    : null;
}
