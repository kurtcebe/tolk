// The one place that talks to Chrome's built-in AI APIs (invariant 3). Each check
// is made for one capability and language pair, and is never carried across page
// loads, because Chrome can evict a model when disk space runs low.
//
// `unavailable` and `downloadable` are normal answers, so nothing here throws for
// them. A download only starts from a click (invariant 6).

import { readStub, runStubDownload } from "./capability-stub.js";
import { isOneOf } from "./state.js";

const STATES = ["unavailable", "downloadable", "downloading", "available"] as const;
/** Without a monitor there's no progress event, so another tab's download is polled. */
const DOWNLOADING_POLL_MS = 2000;

export type CapabilityState = (typeof STATES)[number];

export interface LanguagePair {
  sourceLanguage: string;
  targetLanguage: string;
}

export interface CapabilityStatus {
  state: CapabilityState | "checking";
  /** A fraction from 0 to 1. Null when a download is running but gives no progress. */
  progress: number | null;
  /** The last download failed. The state says what can be done next. */
  failed: boolean;
}

type ProgressListener = (fraction: number) => void;

/** What a tracker follows: how to ask about a capability and how to fetch it. */
interface CapabilityTarget {
  check(): Promise<CapabilityState>;
  download(onProgress: ProgressListener): Promise<void>;
}

export interface CapabilityTracker {
  status(): CapabilityStatus;
  subscribe(listener: () => void): void;
  track(target: CapabilityTarget): Promise<void>;
  clear(): void;
  /** Call this only from a click. */
  download(): Promise<void>;
}

// Stubbed downloads that finished on this page, so the state moves on to ready.
const stubDownloads = new Set<string>();

function normaliseState(raw: unknown, name: string): CapabilityState {
  if (isOneOf(STATES, raw)) {
    return raw;
  }
  console.warn(`${name} reported an unexpected availability.`, raw);
  return "unavailable";
}

async function askAvailability(name: string, ask: () => Promise<unknown>): Promise<CapabilityState> {
  try {
    return normaliseState(await ask(), name);
  } catch (error) {
    console.warn(`Couldn't check ${name}.`, error);
    return "unavailable";
  }
}

function watchProgress(onProgress: ProgressListener): CreateMonitorCallback {
  return (monitor) => {
    monitor.addEventListener("downloadprogress", (event) => onProgress(event.loaded));
  };
}

// The awaited stub read comes before create(), but a click's activation lasts
// for seconds, so create() still counts as coming from that click.

export function translationTarget(pair: LanguagePair): CapabilityTarget {
  const stubKey = `translator:${pair.sourceLanguage}:${pair.targetLanguage}`;
  return {
    async check() {
      const stub = await readStub();
      if (stub.translator !== undefined) {
        return stubDownloads.has(stubKey) ? "available" : stub.translator;
      }
      return askAvailability("Translator", async () =>
        "Translator" in self ? Translator.availability(pair) : "unavailable",
      );
    },
    async download(onProgress) {
      const stub = await readStub();
      if (stub.translator !== undefined) {
        await runStubDownload(stub, onProgress);
        stubDownloads.add(stubKey);
        return;
      }
      const translator = await Translator.create({ ...pair, monitor: watchProgress(onProgress) });
      translator.destroy();
    },
  };
}

export function detectionTarget(): CapabilityTarget {
  const stubKey = "detector";
  return {
    async check() {
      const stub = await readStub();
      if (stub.detector !== undefined) {
        return stubDownloads.has(stubKey) ? "available" : stub.detector;
      }
      return askAvailability("LanguageDetector", async () =>
        "LanguageDetector" in self ? LanguageDetector.availability() : "unavailable",
      );
    },
    async download(onProgress) {
      const stub = await readStub();
      if (stub.detector !== undefined) {
        await runStubDownload(stub, onProgress);
        stubDownloads.add(stubKey);
        return;
      }
      const detector = await LanguageDetector.create({ monitor: watchProgress(onProgress) });
      detector.destroy();
    },
  };
}

/**
 * Runs detection. Only call this once a detection tracker reports `available`.
 * The results are model output, so the caller has to check them.
 */
export async function detectLanguages(text: string): Promise<readonly LanguageDetectionResult[]> {
  const { detection } = await readStub();
  if (detection !== undefined) {
    return [{ detectedLanguage: detection.language, confidence: detection.confidence }];
  }
  const detector = await LanguageDetector.create();
  try {
    return await detector.detect(text);
  } finally {
    detector.destroy();
  }
}

/** Follows one capability through its states, so the UI only has to subscribe. */
export function createTracker(): CapabilityTracker {
  const listeners = new Set<() => void>();
  let status: CapabilityStatus = { state: "checking", progress: null, failed: false };
  let target: CapabilityTarget | null = null;
  // Bumped when the target changes or a download starts, so a late answer about
  // an older language pair can't overwrite a newer one.
  let generation = 0;
  let pollTimer = 0;

  const setStatus = (next: CapabilityStatus): void => {
    status = next;
    for (const listener of listeners) {
      listener();
    }
  };

  const startOver = (): number => {
    window.clearTimeout(pollTimer);
    generation += 1;
    return generation;
  };

  const check = async (started: number, failed: boolean): Promise<void> => {
    if (target === null) {
      return;
    }
    const state = await target.check();
    if (started !== generation) {
      return;
    }
    setStatus({ state, progress: null, failed });
    if (state === "downloading") {
      pollTimer = window.setTimeout(() => void check(started, false), DOWNLOADING_POLL_MS);
    }
  };

  return {
    status: () => status,
    subscribe: (listener) => {
      listeners.add(listener);
    },
    track: async (next) => {
      const started = startOver();
      target = next;
      setStatus({ state: "checking", progress: null, failed: false });
      await check(started, false);
    },
    clear: () => {
      startOver();
      target = null;
      setStatus({ state: "checking", progress: null, failed: false });
    },
    download: async () => {
      // Enforced here as well as by which buttons get drawn, so no caller can
      // reach create() without the latest check saying a download is needed.
      if (target === null || status.state !== "downloadable") {
        return;
      }
      const started = startOver();
      const downloading = (progress: number | null): void => {
        if (started === generation) {
          setStatus({ state: "downloading", progress, failed: false });
        }
      };
      downloading(0);
      try {
        await target.download(downloading);
        if (started === generation) {
          setStatus({ state: "available", progress: null, failed: false });
        }
      } catch (error) {
        console.warn("A model download failed.", error);
        await check(started, true);
      }
    },
  };
}
