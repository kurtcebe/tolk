// Choosing what to detect and deciding whether to believe the answer. Nothing
// here reads a page's `lang` tag, which often describes the site, not the text.

import { isValidLanguageTag } from "./languages.js";

/** A few hundred words, because detection is unreliable on short samples. */
const SAMPLE_CHARACTERS = 2000;
const MIN_SAMPLE_CHARACTERS = 20;
/** Below this the reader sees Unknown. Tested text scored 0.99, and one word 0.27. */
const CONFIDENCE_FLOOR = 0.7;
const UNDETERMINED = "und";

/**
 * The body text from a rendered chapter. The title is left out because it's
 * short, and can be in a different language. Returns "" when too little remains
 * to be worth asking about.
 */
export function detectionSample(container: ParentNode): string {
  let sample = "";
  for (const block of container.querySelectorAll("[data-block-id]:not(h1)")) {
    if (sample.length >= SAMPLE_CHARACTERS) {
      break;
    }
    // A soft hyphen in the middle of a word makes it look like two.
    sample += `${(block.textContent ?? "").replaceAll("­", "")} `;
  }
  const trimmed = sample.trim().slice(0, SAMPLE_CHARACTERS);
  return trimmed.length >= MIN_SAMPLE_CHARACTERS ? trimmed : "";
}

/** The detector's top answer if it's usable, or else null, which means Unknown. */
export function pickLanguage(results: readonly LanguageDetectionResult[]): string | null {
  const best = results[0];
  const language = best?.detectedLanguage;
  const confidence = best?.confidence;
  if (
    typeof language !== "string" ||
    typeof confidence !== "number" ||
    language === UNDETERMINED ||
    confidence < CONFIDENCE_FLOOR ||
    !isValidLanguageTag(language)
  ) {
    return null;
  }
  return language;
}
