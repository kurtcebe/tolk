// The word index, which is the source of truth for read-along (invariant 1).
// `text` and the word offsets come out of a single walk over the same nodes, so
// they can't disagree about non-breaking spaces, soft hyphens or whitespace.

export interface WordEntry {
  start: number;
  end: number;
  element: HTMLElement;
}

export interface SentenceEntry {
  start: number;
  end: number;
  firstWord: number;
  lastWord: number;
}

export interface BlockIndex {
  blockId: string;
  /** The string behind every utterance. Never normalised. */
  text: string;
  words: WordEntry[];
  sentences: SentenceEntry[];
}

/**
 * Wraps every word in the container's blocks and returns their indexes in
 * reading order. Blocks with no words, which can't be spoken, are left out.
 */
export function indexChapter(
  container: ParentNode,
  language: string | null,
): BlockIndex[] {
  const locale = language ?? undefined;
  const wordSegmenter = new Intl.Segmenter(locale, { granularity: "word" });
  const sentenceSegmenter = new Intl.Segmenter(locale, {
    granularity: "sentence",
  });

  const blocks: BlockIndex[] = [];
  for (const element of container.querySelectorAll<HTMLElement>(
    "[data-block-id]",
  )) {
    const block = indexBlock(element, wordSegmenter, sentenceSegmenter);
    if (block.words.length > 0) {
      blocks.push(block);
    }
  }
  reportMisalignment(blocks);
  return blocks;
}

function indexBlock(
  element: HTMLElement,
  wordSegmenter: Intl.Segmenter,
  sentenceSegmenter: Intl.Segmenter,
): BlockIndex {
  const words: WordEntry[] = [];
  let text = "";

  // Collected first, because wrapping words replaces the nodes being walked.
  for (const node of collectTextAndBreaks(element)) {
    if (node instanceof Text) {
      wrapWords(node, text.length, words, wordSegmenter);
      text += node.data;
    } else {
      // A <br> has no text of its own, but without this the words on either
      // side of it would run together when spoken.
      text += "\n";
    }
  }

  return {
    blockId: element.dataset["blockId"] ?? "",
    text,
    words,
    sentences: segmentSentences(text, words, sentenceSegmenter),
  };
}

function collectTextAndBreaks(element: HTMLElement): Node[] {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  const nodes: Node[] = [];
  while (walker.nextNode() !== null) {
    const node = walker.currentNode;
    if (node instanceof Text || node instanceof HTMLBRElement) {
      nodes.push(node);
    }
  }
  return nodes;
}

/** Replaces one text node with its words in spans and the text between them. */
function wrapWords(
  node: Text,
  base: number,
  words: WordEntry[],
  segmenter: Intl.Segmenter,
): void {
  const data = node.data;
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const segment of segmenter.segment(data)) {
    if (segment.isWordLike !== true) {
      continue;
    }
    fragment.append(data.slice(cursor, segment.index));

    const span = document.createElement("span");
    span.className = "w";
    span.dataset["w"] = String(words.length);
    span.textContent = segment.segment;
    fragment.append(span);

    cursor = segment.index + segment.segment.length;
    words.push({ start: base + segment.index, end: base + cursor, element: span });
  }

  if (cursor > 0) {
    fragment.append(data.slice(cursor));
    node.replaceWith(fragment);
  }
}

function segmentSentences(
  text: string,
  words: WordEntry[],
  segmenter: Intl.Segmenter,
): SentenceEntry[] {
  const sentences: SentenceEntry[] = [];
  let nextWord = 0;

  // Intl.Segmenter forces a break after any line feed, which would split
  // line-wrapped book text mid-sentence. A space has the same length, so the
  // offsets it returns still fit `text`.
  for (const segment of segmenter.segment(text.replaceAll("\n", " "))) {
    const start = segment.index;
    const end = start + segment.segment.length;
    const firstWord = nextWord;

    while ((words[nextWord]?.start ?? Infinity) < end) {
      nextWord += 1;
    }

    if (nextWord > firstWord) {
      sentences.push({ start, end, firstWord, lastWord: nextWord - 1 });
    } else {
      // Only punctuation, such as a stray closing quote. It can't be spoken on
      // its own, so it joins the sentence before it.
      const previous = sentences.at(-1);
      if (previous !== undefined) {
        previous.end = end;
      }
    }
  }
  return sentences;
}

/** The word containing or just before an offset in `text`, or -1 if there's none. */
export function wordAtOffset(words: WordEntry[], offset: number): number {
  let low = 0;
  let high = words.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const start = words[middle]?.start ?? Infinity;
    if (start <= offset) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** The index of the sentence holding a word, or -1 if there's none. */
export function sentenceOfWord(
  sentences: SentenceEntry[],
  wordIndex: number,
): number {
  let low = 0;
  let high = sentences.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const sentence = sentences[middle];
    if (sentence === undefined || wordIndex < sentence.firstWord) {
      high = middle - 1;
    } else if (wordIndex > sentence.lastWord) {
      low = middle + 1;
    } else {
      return middle;
    }
  }
  return -1;
}

/**
 * A drifted index puts the highlight one word off with nothing else looking
 * wrong, so it's checked on every load. It reports rather than throws, because
 * a reader that won't open is worse than a wrong highlight.
 */
function reportMisalignment(blocks: BlockIndex[]): void {
  for (const block of blocks) {
    for (const [index, word] of block.words.entries()) {
      const expected = block.text.slice(word.start, word.end);
      if (expected !== word.element.textContent) {
        console.error(
          `Word index is misaligned in block ${block.blockId} at word ${index}.`,
          { expected, found: word.element.textContent },
        );
        break;
      }
    }
  }
}
