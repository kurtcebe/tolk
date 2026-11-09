// Reads what a reader has selected through the word index (invariant 1), so a
// selection always means whole indexed words and can be handed straight to
// playback. The DOM's own selection text would include any interlinear lines.

import { getBlocks, type SpeechRange, type WordPosition } from "./playback.js";
import type { BlockIndex, WordEntry } from "./tokenize.js";

export interface SelectedText {
  /** Same words in the same places gives the same key, however they were selected. */
  key: string;
  text: string;
  wordCount: number;
  /** The sentences holding the text, or "" when it runs across blocks. */
  sentence: string;
  isInOneBlock: boolean;
  range: SpeechRange;
}

/** A shared way to tidy text copied out of the index. The index's own text is never changed. */
export function cleanText(text: string): string {
  return text.replaceAll("­", "").replace(/\s+/g, " ").trim();
}

/** The selected words, or null when no indexed word in the reader is selected. */
export function readSelection(reader: HTMLElement): SelectedText | null {
  const selection = window.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (
    !reader.contains(range.startContainer) ||
    !reader.contains(range.endContainer)
  ) {
    return null;
  }
  const from = firstWordIn(range);
  const to = from === null ? null : lastWordIn(range);
  return from === null || to === null ? null : describe(from, to);
}

function firstWordIn(range: Range): WordPosition | null {
  const blocks = getBlocks();
  for (const [blockIndex, block] of blocks.entries()) {
    const wordIndex = block.words.findIndex((word) => overlaps(word, range));
    if (wordIndex !== -1) {
      return { blockIndex, wordIndex };
    }
  }
  return null;
}

function lastWordIn(range: Range): WordPosition | null {
  const blocks = getBlocks();
  for (let blockIndex = blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
    const words = blocks[blockIndex]?.words ?? [];
    const wordIndex = words.findLastIndex((word) => overlaps(word, range));
    if (wordIndex !== -1) {
      return { blockIndex, wordIndex };
    }
  }
  return null;
}

/** Strict, so a selection that only touches a word's edge doesn't count it. */
function overlaps(word: WordEntry, range: Range): boolean {
  const wordRange = document.createRange();
  wordRange.selectNodeContents(word.element);
  return (
    wordRange.compareBoundaryPoints(Range.END_TO_START, range) < 0 &&
    wordRange.compareBoundaryPoints(Range.START_TO_END, range) > 0
  );
}

function describe(from: WordPosition, to: WordPosition): SelectedText | null {
  const blocks = getBlocks();
  const pieces: string[] = [];
  let wordCount = 0;
  for (let blockIndex = from.blockIndex; blockIndex <= to.blockIndex; blockIndex += 1) {
    const block = blocks[blockIndex];
    if (block === undefined) {
      return null;
    }
    const first = blockIndex === from.blockIndex ? from.wordIndex : 0;
    const last = blockIndex === to.blockIndex ? to.wordIndex : block.words.length - 1;
    pieces.push(textBetween(block, first, last));
    wordCount += last - first + 1;
  }
  const isInOneBlock = from.blockIndex === to.blockIndex;
  const block = blocks[from.blockIndex];
  return {
    key: `${from.blockIndex}:${from.wordIndex}-${to.blockIndex}:${to.wordIndex}`,
    text: cleanText(pieces.join(" ")),
    wordCount,
    sentence: isInOneBlock && block !== undefined ? sentencesAround(block, from, to) : "",
    isInOneBlock,
    range: { from, to, follow: false },
  };
}

function textBetween(block: BlockIndex, firstWord: number, lastWord: number): string {
  const start = block.words[firstWord]?.start ?? 0;
  const end = block.words[lastWord]?.end ?? start;
  return block.text.slice(start, end);
}

function sentencesAround(block: BlockIndex, from: WordPosition, to: WordPosition): string {
  const held = block.sentences.filter(
    (sentence) => sentence.lastWord >= from.wordIndex && sentence.firstWord <= to.wordIndex,
  );
  const start = held[0]?.start ?? 0;
  const end = held.at(-1)?.end ?? block.text.length;
  return cleanText(block.text.slice(start, end));
}
