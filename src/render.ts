import type { Block, BlockType, Chapter, TolkDocument } from "./document.js";

const BLOCK_TAGS: Record<BlockType, keyof HTMLElementTagNameMap> = {
  heading: "h2",
  paragraph: "p",
  quote: "blockquote",
};

const INLINE_TAGS = new Set(["em", "i", "strong", "b", "sub", "sup", "br"]);

// Removed along with their contents. Any other unknown element is unwrapped, so
// its text stays readable.
const DROPPED_TAGS = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "textarea",
  "select",
]);

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Renders one chapter. Block HTML is parsed in an inert document, where scripts
 * don't run and images don't load, and is rebuilt node by node from an
 * allowlist. Nothing from it is ever assigned through innerHTML.
 */
export function renderChapter(
  document_: TolkDocument,
  chapter: Chapter,
  container: HTMLElement,
): void {
  const title = document.createElement("h1");
  title.textContent = chapter.title;
  // The title gets read aloud, so it's indexed like a block. The byline isn't.
  title.dataset["blockId"] = `${chapter.id}:title`;
  container.append(title);

  if (document_.author !== null) {
    const byline = document.createElement("p");
    byline.className = "byline";
    byline.textContent = document_.author;
    container.append(byline);
  }

  for (const block of chapter.blocks) {
    container.append(renderBlock(block));
  }
}

function renderBlock(block: Block): HTMLElement {
  const element = document.createElement(BLOCK_TAGS[block.type]);
  element.dataset["blockId"] = block.id;
  const parsed = new DOMParser().parseFromString(block.html, "text/html");
  appendAllowedChildren(parsed.body, element);
  return element;
}

function appendAllowedChildren(source: Node, target: Node): void {
  for (const child of source.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(child.textContent ?? ""));
    } else if (child instanceof Element) {
      appendAllowedElement(child, target);
    }
  }
}

function appendAllowedElement(source: Element, target: Node): void {
  const tag = source.localName;
  if (DROPPED_TAGS.has(tag)) {
    return;
  }

  const copy = createAllowedCopy(source, tag);
  if (copy === null) {
    appendAllowedChildren(source, target);
    return;
  }

  appendAllowedChildren(source, copy);
  target.appendChild(copy);
}

function createAllowedCopy(source: Element, tag: string): HTMLElement | null {
  if (INLINE_TAGS.has(tag)) {
    return document.createElement(tag);
  }
  return tag === "a" ? createSafeLink(source) : null;
}

/** Returns null for a relative or non-web link, whose text is then kept as plain text. */
function createSafeLink(source: Element): HTMLAnchorElement | null {
  const url = URL.parse(source.getAttribute("href") ?? "");
  if (url === null || !SAFE_LINK_PROTOCOLS.has(url.protocol)) {
    return null;
  }
  const link = document.createElement("a");
  link.href = url.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}
