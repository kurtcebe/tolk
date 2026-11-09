// Saved words as a TSV for Anki. See docs.ankiweb.net/importing/text-files.html.
// The headers need Anki 2.1.54 or later, and `#html:false` keeps a `<` in the text
// from being read as markup.

import type { SavedWord } from "./saved-words-store.js";

const HEADERS = ["#separator:tab", "#html:false", "#columns:Word\tTranslation\tSentence\tSource"];

export function toAnkiTsv(words: readonly SavedWord[]): string {
  const rows = words.map(({ word, translation, sentence, source }) =>
    [word, translation, sentence, source.title].map(toField).join("\t"),
  );
  return `${[...HEADERS, ...rows].join("\n")}\n`;
}

/**
 * A tab or line break would start a new field or note, so they become spaces.
 * Anki reads a field starting with `"` as quoted, and a line starting with `#` as
 * a comment, so those are quoted, with each `"` inside doubled.
 */
function toField(value: string): string {
  const flat = value.replace(/[\t\r\n]+/g, " ").trim();
  return flat.includes('"') || flat.startsWith("#") ? `"${flat.replaceAll('"', '""')}"` : flat;
}
