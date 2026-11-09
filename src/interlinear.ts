// Interlinear lines: an L1 line under each L2 sentence, inside the block.
//
// The word index stays valid throughout, which is why this doesn't go through
// retokenizing (invariant 2). It holds element references and offsets into the
// block's `text`, and adding a line changes neither: no L2 text changes, no word
// span is touched, and at most a text node between words is split in two. A line
// must never be tokenized, since that would turn the translation into words, and
// a chapter rebuild starts from the source blocks, so nothing ever sees one.

import type { BlockIndex } from "./tokenize.js";

const LINE_CLASS = "interlinear";
const NOT_THE_TEXT = `.${LINE_CLASS}, .margin-tools`;
const FAILED_SENTENCE = "Couldn't translate this sentence.";

/**
 * Adds one line per sentence, all at once, so the text below moves a single time.
 * A null translation is a sentence that failed, which says so in its place.
 * `translations` holds one entry per sentence, in order.
 */
export function showLines(
  element: HTMLElement,
  block: BlockIndex,
  translations: readonly (string | null)[],
  language: string,
): void {
  // Last to first, so that splitting a text node can't shift a later boundary.
  for (let index = block.sentences.length - 1; index >= 0; index -= 1) {
    const sentence = block.sentences[index];
    const translation = translations[index];
    if (sentence !== undefined && translation !== undefined) {
      placeLine(element, sentence.end, createLine(translation, language));
    }
  }
  reportDrift(element, block);
}

/** Removes the lines. The L2 is exactly as it was. */
export function removeLines(element: HTMLElement): void {
  for (const line of element.querySelectorAll(`:scope > .${LINE_CLASS}`)) {
    line.remove();
  }
}

function createLine(translation: string | null, language: string): HTMLElement {
  const line = document.createElement("span");
  line.className = LINE_CLASS;
  if (translation === null) {
    line.classList.add("interlinear-failed");
    line.lang = "en";
    line.textContent = FAILED_SENTENCE;
  } else {
    line.lang = language;
    line.dir = "auto";
    // Model output, so only ever text (invariant 4).
    line.textContent = translation;
  }
  return line;
}

/**
 * Inserts a line at an offset in the block's text. A boundary inside an inline
 * element such as <em> can't hold a block-level line without breaking that
 * element apart, so the line goes straight after it. In the rare case of two
 * sentences ending inside one <em>, their lines stack there, still in order.
 */
function placeLine(element: HTMLElement, offset: number, line: HTMLElement): void {
  let passed = 0;
  for (const node of textAndBreaks(element)) {
    const length = node instanceof Text ? node.length : 1;
    if (offset <= passed + length) {
      insertInside(element, node, offset - passed, line);
      return;
    }
    passed += length;
  }
  element.append(line);
}

function insertInside(element: HTMLElement, node: Node, offset: number, line: HTMLElement): void {
  const top = topLevelChild(element, node);
  if (top !== node) {
    top.after(line);
  } else if (node instanceof Text && offset < node.length) {
    node.splitText(offset).before(line);
  } else {
    top.after(line);
  }
}

function topLevelChild(element: HTMLElement, node: Node): ChildNode {
  let current = node;
  while (current.parentNode !== element && current.parentNode !== null) {
    current = current.parentNode;
  }
  if (!(current instanceof CharacterData || current instanceof Element)) {
    throw new Error("A block's child should be text or an element");
  }
  return current;
}

/** The same nodes the tokenizer walked, in the same order, without our additions. */
function textAndBreaks(element: HTMLElement): Node[] {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) =>
        node instanceof Element && node.matches(NOT_THE_TEXT)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    },
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

/** A drifted index shows no other symptom, so this checks the risky step every time. */
function reportDrift(element: HTMLElement, block: BlockIndex): void {
  const rebuilt = textAndBreaks(element)
    .map((node) => (node instanceof Text ? node.data : "\n"))
    .join("");
  if (rebuilt !== block.text) {
    console.error(`Interlinear lines changed the text of block ${block.blockId}.`);
  }
}
