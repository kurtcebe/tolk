// The sentence band and word wash. The Custom Highlight API only paints, so it
// can't reflow the text (invariant 5), and a range also covers the gaps between
// words, which a class on each span wouldn't.

const sentenceHighlight = new Highlight();
const wordHighlight = new Highlight();

// The word wash has to paint over the sentence band.
sentenceHighlight.priority = 0;
wordHighlight.priority = 1;

export function mountHighlights(): void {
  CSS.highlights.set("tolk-sentence", sentenceHighlight);
  CSS.highlights.set("tolk-word", wordHighlight);
}

export function paintSentence(first: HTMLElement, last: HTMLElement): void {
  paint(sentenceHighlight, first, last);
}

export function paintWord(word: HTMLElement): void {
  paint(wordHighlight, word, word);
}

export function clearWord(): void {
  wordHighlight.clear();
}

export function clearHighlights(): void {
  sentenceHighlight.clear();
  wordHighlight.clear();
}

function paint(highlight: Highlight, first: HTMLElement, last: HTMLElement): void {
  const range = new Range();
  range.setStartBefore(first);
  range.setEndAfter(last);
  highlight.clear();
  highlight.add(range);
}
