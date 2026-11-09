// Turns Readability's or a book's HTML into blocks. That HTML has no fixed shape:
// nested divs, bare text beside paragraphs, paragraphs inside list items. Nothing
// readable may be lost or repeated, so every text node ends up in exactly one
// block. The HTML is untrusted and is only parsed here, in an inert document.
// render.ts rebuilds each block from an allowlist when it reaches the page.

import type { Block, BlockType } from "./document.js";

/** What a book's images become before this runs. It splits a paragraph, like any block. */
export const PLACED_IMAGE = "tolk-image";

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const BLOCK_LEVEL_TAGS = [
  "address", "article", "aside", "blockquote", "caption", "center", "dd", "details",
  "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2",
  "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre",
  "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
  PLACED_IMAGE,
];
const BLOCK_LEVEL = new Set(BLOCK_LEVEL_TAGS);
const BLOCK_LEVEL_SELECTOR = BLOCK_LEVEL_TAGS.join(",");

/** Nothing inside these is reading text. */
const SKIPPED = new Set([
  "audio", "canvas", "embed", "hr", "iframe", "img", "math", "noscript", "object",
  "picture", "script", "select", "style", "svg", "template", "textarea", "video",
]);

const CELL_SEPARATOR = " · ";

/** How text found in the current container is shown. A list item's marker is used once. */
interface Context {
  type: BlockType;
  marker?: string | undefined;
}

export function articleToBlocks(content: string, title: string): Block[] {
  const parsed = new DOMParser().parseFromString(content, "text/html");
  // A page's own markup could use the book-only tag, and it must not make an image.
  for (const placed of parsed.body.querySelectorAll(PLACED_IMAGE)) {
    placed.remove();
  }
  return withoutRepeatedTitle(contentToBlocks(parsed.body), title);
}

/** Blocks from an element in an inert document. */
export function contentToBlocks(content: Element): Block[] {
  const blocks: Block[] = [];
  const add: AddBlock = (block) => {
    blocks.push({ id: `b${blocks.length + 1}`, ...block });
  };
  walk(content, { type: "paragraph" }, add, content.ownerDocument);
  return blocks;
}

type AddBlock = (block: Omit<Block, "id">) => void;

function walk(container: Element, context: Context, add: AddBlock, owner: Document): void {
  let run: Node[] = [];
  const flushRun = (): void => {
    const holder = owner.createElement("div");
    holder.append(...run);
    run = [];
    addText(holder, context, add);
  };

  // A copy, because moving nodes into a holder changes the live list.
  for (const child of [...container.childNodes]) {
    if (!isElement(child)) {
      if (child.nodeType === Node.TEXT_NODE) {
        run.push(child);
      }
    } else if (SKIPPED.has(child.localName)) {
      continue;
    } else if (isBlockLevel(child) || child.querySelector(BLOCK_LEVEL_SELECTOR) !== null) {
      flushRun();
      walkBlock(child, context, add, owner);
    } else {
      run.push(child);
    }
  }
  flushRun();
}

function walkBlock(element: Element, context: Context, add: AddBlock, owner: Document): void {
  const tag = element.localName;
  if (tag === PLACED_IMAGE) {
    add({
      type: "image",
      html: "",
      image: {
        path: element.getAttribute("data-path") ?? "",
        alt: element.getAttribute("data-alt") ?? "",
      },
    });
  } else if (HEADINGS.has(tag) && element.querySelector(BLOCK_LEVEL_SELECTOR) === null) {
    addText(element, { type: "heading" }, add);
  } else if (HEADINGS.has(tag) && element.querySelector(PLACED_IMAGE) !== null) {
    // A book's chapter heading can hold a picture, and its words are still a heading.
    walk(element, { type: "heading" }, add, owner);
  } else if (tag === "blockquote") {
    walk(element, { type: "quote" }, add, owner);
  } else if (tag === "li") {
    walk(element, { type: "list-item", marker: listMarker(element) }, add, owner);
  } else if (tag === "tr" && !hasBlockInCells(element)) {
    addRow(element, add);
  } else {
    walk(element, context, add, owner);
  }
}

function addText(element: Element, context: Context, add: AddBlock): void {
  if ((element.textContent ?? "").trim() === "") {
    return;
  }
  // Read-only serialising, in the inert document. render.ts is what rebuilds it.
  add({ type: context.type, html: element.getHTML(), marker: context.marker });
  context.marker = undefined;
}

function addRow(row: Element, add: AddBlock): void {
  const cells = [...row.children].filter((cell) => (cell.textContent ?? "").trim() !== "");
  if (cells.length > 0) {
    add({ type: "paragraph", html: cells.map((cell) => cell.getHTML()).join(CELL_SEPARATOR) });
  }
}

function hasBlockInCells(row: Element): boolean {
  return [...row.children].some((cell) => cell.querySelector(BLOCK_LEVEL_SELECTOR) !== null);
}

function listMarker(item: Element): string {
  const list = item.parentElement;
  if (list?.localName !== "ol") {
    return "•";
  }
  const start = Number.parseInt(list.getAttribute("start") ?? "1", 10);
  const items = [...list.children].filter((child) => child.localName === "li");
  return `${(Number.isNaN(start) ? 1 : start) + items.indexOf(item)}.`;
}

function isBlockLevel(element: Element): boolean {
  return BLOCK_LEVEL.has(element.localName);
}

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

/** The chapter title is already shown and read aloud, so a matching first heading would repeat it. */
export function withoutRepeatedTitle(blocks: Block[], title: string): Block[] {
  // A picture can come first, in a book's chapter heading.
  const first = blocks.find((block) => block.type !== "image");
  if (first?.type !== "heading") {
    return blocks;
  }
  const text = new DOMParser().parseFromString(first.html, "text/html").body.textContent ?? "";
  return squeeze(text) === squeeze(title) ? blocks.filter((block) => block !== first) : blocks;
}

function squeeze(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim().toLowerCase();
}
