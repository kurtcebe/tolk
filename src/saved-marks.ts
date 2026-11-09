// The dotted underline on saved words in Learner mode. Matching is deliberately
// cautious, because a missed match costs little and a false one misleads: the
// same whole words in the same order, inside one sentence, in the same language.
// So `zin` doesn't match `zinnen`, and inflected forms aren't guessed at.

import { getLanguage, subscribeLanguage } from "./document-language.js";
import { paintSaved } from "./highlight.js";
import { languageKey } from "./languages.js";
import { getBlocks } from "./playback.js";
import { getSavedWords, subscribeSavedWords } from "./saved-words-store.js";
import { getSettings, subscribe } from "./state.js";
import type { BlockIndex, SentenceEntry } from "./tokenize.js";

type Span = readonly [HTMLElement, HTMLElement];

export function mountSavedMarks(): void {
  subscribeSavedWords(repaintSavedMarks);
  subscribeLanguage(repaintSavedMarks);
  subscribe(repaintSavedMarks);
}

/** Also called after a chapter rebuild, which replaces every word element. */
export function repaintSavedMarks(): void {
  const language = getLanguage();
  if (language === null || getSettings().mode !== "learner") {
    paintSaved([]);
    return;
  }
  const phrases = phrasesByFirstWord(language);
  paintSaved(phrases.size === 0 ? [] : findSpans(phrases, language));
}

/** Each saved word as its tokens, filed under its first token so lookups stay cheap. */
function phrasesByFirstWord(language: string): Map<string, string[][]> {
  const key = languageKey(language);
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  const phrases = new Map<string, string[][]>();
  for (const saved of getSavedWords()) {
    if (languageKey(saved.language) !== key) {
      continue;
    }
    const tokens = Array.from(segmenter.segment(saved.word))
      .filter((segment) => segment.isWordLike === true)
      .map((segment) => toToken(segment.segment, language));
    const first = tokens[0];
    if (first !== undefined) {
      phrases.set(first, [...(phrases.get(first) ?? []), tokens]);
    }
  }
  return phrases;
}

function toToken(text: string, language: string): string {
  return text.replaceAll("­", "").toLocaleLowerCase(language);
}

function findSpans(phrases: Map<string, string[][]>, language: string): Span[] {
  const spans: Span[] = [];
  for (const block of getBlocks()) {
    for (const sentence of block.sentences) {
      findInSentence(block, sentence, phrases, language, spans);
    }
  }
  return spans;
}

function findInSentence(
  block: BlockIndex,
  { firstWord, lastWord }: SentenceEntry,
  phrases: Map<string, string[][]>,
  language: string,
  spans: Span[],
): void {
  const tokenAt = (index: number): string | undefined => {
    const word = block.words[index];
    return word === undefined
      ? undefined
      : toToken(block.text.slice(word.start, word.end), language);
  };
  for (let start = firstWord; start <= lastWord; start += 1) {
    for (const tokens of phrases.get(tokenAt(start) ?? "") ?? []) {
      const end = start + tokens.length - 1;
      const first = block.words[start]?.element;
      const last = block.words[end]?.element;
      const matches =
        end <= lastWord && tokens.every((token, offset) => tokenAt(start + offset) === token);
      if (matches && first !== undefined && last !== undefined) {
        spans.push([first, last]);
      }
    }
  }
}
