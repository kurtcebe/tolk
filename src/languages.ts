// Language tags and their names. This knows nothing about the reader's own
// settings or the document, so anything can use it.

// Chrome's Translator list, from developer.chrome.com/docs/ai/translator-api,
// checked 2026-11-09. Chrome has no call that returns it and says it can change.
// It only decides what the dropdowns offer. Whether a pair works is still asked
// per pair (invariant 3).
export const TRANSLATION_LANGUAGES = [
  "ar", "bg", "bn", "cs", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi",
  "hr", "hu", "id", "it", "ja", "kn", "ko", "lt", "mr", "nl", "no", "pl", "pt",
  "ro", "ru", "sk", "sl", "sv", "ta", "te", "th", "tr", "uk", "vi", "zh", "zh-Hant",
] as const;

export type TranslationLanguage = (typeof TRANSLATION_LANGUAGES)[number];

const FALLBACK_LANGUAGE: TranslationLanguage = "en";
const TRADITIONAL_CHINESE = /-(hant|tw|hk|mo)(-|$)/;

const names = new Intl.DisplayNames(["en"], { type: "language" });

/** The English name, because the interface is in English. */
export function languageName(tag: string): string {
  try {
    return names.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

export function isValidLanguageTag(tag: string): boolean {
  try {
    Intl.getCanonicalLocales(tag);
    return true;
  } catch {
    return false;
  }
}

/** "nl-BE" and "nl" share voices. Norwegian voices are tagged "nb", but Chrome's translation code is "no". */
export function primarySubtag(tag: string | null): string | null {
  const primary = tag?.split(/[-_]/)[0]?.toLowerCase() ?? null;
  return primary === "nb" || primary === "nn" ? "no" : primary;
}

/** Whether two tags mean the same language to a reader, so "en-GB" matches "en". */
export function sameLanguage(first: string, second: string): boolean {
  return comparisonKey(first) === comparisonKey(second);
}

function comparisonKey(tag: string): string | null {
  return closestTranslationLanguage(tag) ?? primarySubtag(tag);
}

function closestTranslationLanguage(tag: string): TranslationLanguage | null {
  const primary = primarySubtag(tag);
  if (primary === "zh") {
    return TRADITIONAL_CHINESE.test(tag.toLowerCase()) ? "zh-Hant" : "zh";
  }
  return TRANSLATION_LANGUAGES.find((language) => language === primary) ?? null;
}

/** What the first-run card pre-fills. */
export function browserLanguage(): TranslationLanguage {
  return closestTranslationLanguage(navigator.language) ?? FALLBACK_LANGUAGE;
}

/** Fills a dropdown with the languages sorted by name, plus any extra tags. */
export function languageOptions(extra: readonly string[] = []): HTMLOptionElement[] {
  const tags = new Set<string>([...TRANSLATION_LANGUAGES, ...extra]);
  return [...tags]
    .map((tag) => new Option(languageName(tag), tag))
    .sort((first, second) => first.text.localeCompare(second.text, "en"));
}
