// Turns text into checked translations. Chrome runs translations one at a time,
// so requests wait in a queue here and a popup goes ahead of a paragraph. Each
// request is gated again when its turn comes, because the language pair can
// change while it waits (invariant 3). Nothing is stored (see architecture.md).

import { openTranslator, type LanguagePair, type TranslatorSession } from "./capabilities.js";
import { getTranslationPair, translationStatus } from "./document-language.js";

/** Per request. A translation can hang without an error, and that mustn't block the queue. */
const TIMEOUT_MS = 30_000;
/** Below this, identical output can be correct, such as a name or a loanword. */
const ECHO_MIN_WORDS = 5;
const RUNAWAY_FACTOR = 10;
const RUNAWAY_ALLOWANCE = 200;

export type TranslationPriority = "popup" | "paragraph";

// A discriminated union: `ok` says which shape this is, and TypeScript only lets
// a caller read `text` after checking it.
export type TranslationOutcome = { ok: true; text: string } | { ok: false };

interface Job {
  text: string;
  pair: LanguagePair;
  priority: TranslationPriority;
  signal: AbortSignal;
  finish(outcome: TranslationOutcome): void;
}

const FAILED: TranslationOutcome = { ok: false };

const waiting: Job[] = [];
let draining = false;
let session: { key: string; opened: Promise<TranslatorSession> } | null = null;

/** Translates one piece of text in the current language pair. Never rejects. */
export function translate(
  text: string,
  priority: TranslationPriority,
  signal: AbortSignal,
): Promise<TranslationOutcome> {
  const pair = getTranslationPair();
  if (pair === null) {
    return Promise.resolve(FAILED);
  }
  return new Promise((finish) => {
    waiting.push({ text, pair, priority, signal, finish });
    void drain();
  });
}

/** Translates a selection of any length, a sentence at a time so it stays within quota. */
export async function translateSelection(
  text: string,
  language: string,
  signal: AbortSignal,
): Promise<TranslationOutcome> {
  const segmenter = new Intl.Segmenter(language, { granularity: "sentence" });
  const pieces = Array.from(segmenter.segment(text), ({ segment }) => segment.trim());
  const outcomes = await Promise.all(
    pieces.filter((piece) => piece !== "").map((piece) => translate(piece, "popup", signal)),
  );
  const translated: string[] = [];
  for (const outcome of outcomes) {
    if (!outcome.ok) {
      return FAILED;
    }
    translated.push(outcome.text);
  }
  return { ok: true, text: translated.join(" ") };
}

async function drain(): Promise<void> {
  if (draining) {
    return;
  }
  draining = true;
  try {
    let job = takeNext();
    while (job !== undefined) {
      job.finish(await run(job));
      job = takeNext();
    }
  } finally {
    draining = false;
  }
}

function takeNext(): Job | undefined {
  const popup = waiting.findIndex((job) => job.priority === "popup");
  return waiting.splice(popup === -1 ? 0 : popup, 1)[0];
}

async function run(job: Job): Promise<TranslationOutcome> {
  if (job.signal.aborted || !isStillAvailable(job.pair)) {
    return FAILED;
  }
  const signal = AbortSignal.any([job.signal, AbortSignal.timeout(TIMEOUT_MS)]);
  try {
    const translator = await untilAborted(sessionFor(job.pair), signal);
    const output = await untilAborted(translator.translate(job.text, signal), signal);
    return checkOutput(output, job.text);
  } catch (error) {
    if (!job.signal.aborted) {
      console.warn("A translation failed.", error);
    }
    return FAILED;
  }
}

function isStillAvailable(pair: LanguagePair): boolean {
  const current = getTranslationPair();
  return (
    translationStatus.status().state === "available" &&
    current?.sourceLanguage === pair.sourceLanguage &&
    current.targetLanguage === pair.targetLanguage
  );
}

/** One translator per language pair, opened when it's first needed. */
async function sessionFor(pair: LanguagePair): Promise<TranslatorSession> {
  const key = `${pair.sourceLanguage}:${pair.targetLanguage}`;
  if (session?.key !== key) {
    const previous = session;
    session = { key, opened: openTranslator(pair) };
    void closeSession(previous);
  }
  const current = session;
  try {
    return await current.opened;
  } catch (error) {
    // So the next request tries again instead of inheriting this failure.
    if (session === current) {
      session = null;
    }
    throw error;
  }
}

async function closeSession(old: { opened: Promise<TranslatorSession> } | null): Promise<void> {
  try {
    (await old?.opened)?.destroy();
  } catch {
    // It never opened, so there's nothing to close.
  }
}

/** Stops waiting as soon as the signal fires, even if the work underneath never answers. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      const stop = (): void => reject(signal.reason);
      if (signal.aborted) {
        stop();
      } else {
        signal.addEventListener("abort", stop, { once: true });
      }
    }),
  ]);
}

/** Catches output that's visibly broken. It can't tell whether a translation is any good. */
function checkOutput(output: unknown, input: string): TranslationOutcome {
  const problem = findProblem(output, input);
  if (typeof output === "string" && problem === null) {
    return { ok: true, text: output.trim() };
  }
  console.warn(`A translation was rejected: ${problem ?? "not text"}.`);
  return FAILED;
}

function findProblem(output: unknown, input: string): string | null {
  if (typeof output !== "string") {
    return "not text";
  }
  const trimmed = output.trim();
  if (trimmed === "") {
    return "empty";
  }
  if (trimmed.length > input.length * RUNAWAY_FACTOR + RUNAWAY_ALLOWANCE) {
    return "far longer than the input";
  }
  const isLong = input.trim().split(/\s+/).length >= ECHO_MIN_WORDS;
  return isLong && trimmed === input.trim() ? "identical to the input" : null;
}
