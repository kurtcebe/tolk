// The EPUB source adapter: its one job is producing a TolkDocument. Each chapter
// file is rebuilt into a clean inert document on the way in, keeping only element
// names and a few attributes, so scripts, event handlers, forms, styles and remote
// references never get past here (invariants 4 and 6). render.ts then applies its
// own allowlist when a block reaches the page.

import { contentToBlocks, PLACED_IMAGE, withoutRepeatedTitle } from "./article-blocks.js";
import type { Block, Chapter } from "./document.js";
import {
  byName,
  EpubError,
  parseContent,
  readEpub,
  readText,
  resolveHref,
  squeeze,
  type ContentsEntry,
  type Epub,
  type SpineItem,
} from "./epub.js";

const CONTENT_TYPES = new Set(["application/xhtml+xml", "text/html", "application/xml"]);
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

/** Removed along with their contents. Anything else unknown keeps its text. */
const DROPPED = new Set([
  "audio", "button", "canvas", "embed", "form", "head", "iframe", "input", "link", "math",
  "meta", "noscript", "object", "script", "select", "style", "template", "textarea", "title",
  "video",
]);

const PAGE_BREAK = /\bpagebreak\b/;
const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

export interface BookContents {
  title: string;
  author: string | null;
  cover: Blob | null;
  chapters: Chapter[];
  loadImage: (path: string) => Promise<Blob | null>;
}

/** Throws EpubError with what the library should tell the reader. */
export async function openBook(file: Blob, fallbackTitle: string): Promise<BookContents> {
  const epub = await readEpub(file, fallbackTitle);
  const chapters = await readChapters(epub);
  if (chapters.length === 0) {
    throw new EpubError("invalid", "This book has nothing readable in it.");
  }
  const loadImage = (path: string): Promise<Blob | null> => readImage(epub, path);
  return {
    title: epub.title,
    author: epub.author,
    cover: epub.coverPath === null ? null : await loadImage(epub.coverPath),
    chapters,
    loadImage,
  };
}

async function readImage(epub: Epub, path: string): Promise<Blob | null> {
  const type = imageType(epub, path);
  if (type === null || !epub.archive.has(path)) {
    return null;
  }
  try {
    return new Blob([await epub.archive.read(path)], { type });
  } catch (error) {
    console.warn(`Tolk couldn't read the image ${path}.`, error);
    return null;
  }
}

/** Only image types are served, whatever a book says a file is. */
function imageType(epub: Epub, path: string): string | null {
  const declared = epub.manifest.get(path)?.mediaType;
  if (declared !== undefined && Object.values(IMAGE_TYPES).includes(declared)) {
    return declared;
  }
  return IMAGE_TYPES[path.split(".").at(-1)?.toLowerCase() ?? ""] ?? null;
}

async function readChapters(epub: Epub): Promise<Chapter[]> {
  const listed = new Set(epub.contents.map((entry) => entry.path));
  const chapters: Chapter[] = [];
  for (const [index, item] of epub.spine.entries()) {
    if (isReadable(item, listed) && epub.archive.has(item.path)) {
      const entries = epub.contents.filter((entry) => entry.path === item.path);
      chapters.push(...(await readSpineItem(epub, item, index, entries)));
    }
  }
  return chapters;
}

/** A part outside the reading order only counts if the book's own contents list it. */
function isReadable(item: SpineItem, listed: ReadonlySet<string>): boolean {
  return CONTENT_TYPES.has(item.mediaType) && (item.isLinear || listed.has(item.path));
}

/** A broken file costs that chapter and not the whole book. */
async function readSpineItem(
  epub: Epub,
  item: SpineItem,
  spineIndex: number,
  entries: readonly ContentsEntry[],
): Promise<Chapter[]> {
  try {
    const parsed = parseContent(await readText(epub.archive, item.path));
    const body = sanitisedBody(parsed, item.path);
    return splitIntoPieces(body, entries).flatMap((piece, pieceIndex) =>
      toChapter(piece, `c${spineIndex}-${pieceIndex}`),
    );
  } catch (error) {
    console.warn(`Tolk couldn't read ${item.path}.`, error);
    return [];
  }
}

interface Piece {
  content: Element;
  title: string;
}

/**
 * Some books keep several chapters in one file, with contents entries pointing inside
 * it. A Range clones just the part between two anchors and closes any wrappers it
 * cuts through, so every piece stays well formed and no text is lost or repeated.
 */
function splitIntoPieces(body: HTMLElement, entries: readonly ContentsEntry[]): Piece[] {
  const wholeFileTitle = entries.find((entry) => entry.fragment === null)?.title ?? "";
  const anchors = findAnchors(body, entries);
  if (anchors.length === 0) {
    return [{ content: body, title: wholeFileTitle }];
  }
  const pieces: Piece[] = [];
  const cut = (title: string, from: Element | null, to: Element | null): void => {
    const range = body.ownerDocument.createRange();
    range.selectNodeContents(body);
    if (from !== null) {
      range.setStartBefore(from);
    }
    if (to !== null) {
      range.setEndBefore(to);
    }
    const holder = body.ownerDocument.createElement("div");
    holder.append(range.cloneContents());
    pieces.push({ content: holder, title });
  };
  cut(wholeFileTitle, null, anchors[0]?.element ?? null);
  for (const [index, { element, title }] of anchors.entries()) {
    cut(title, element, anchors[index + 1]?.element ?? null);
  }
  return pieces;
}

function findAnchors(
  body: HTMLElement,
  entries: readonly ContentsEntry[],
): { element: Element; title: string }[] {
  const seen = new Set<Element>();
  const anchors: { element: Element; title: string }[] = [];
  for (const { fragment, title } of entries) {
    const target = fragment === null ? null : body.querySelector(`[id="${CSS.escape(fragment)}"]`);
    const element = target === null ? null : headingStart(target);
    if (element !== null && !seen.has(element)) {
      seen.add(element);
      anchors.push({ element, title });
    }
  }
  // The contents list can be in any order. The text's order is what counts.
  return anchors.sort((first, second) =>
    first.element.compareDocumentPosition(second.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
}

/**
 * Where a chapter starts, if this anchor starts one. Contents lists can also point at
 * printed page numbers and illustrations, and those mustn't cut the text up, so an
 * anchor only counts when it's on a heading or directly leads into one.
 */
function headingStart(target: Element): Element | null {
  const inside = target.closest(HEADING_SELECTOR);
  if (inside !== null) {
    return inside;
  }
  // An empty anchor marks whatever comes straight after it.
  const holder = (target.textContent ?? "").trim() === "" ? target.nextElementSibling : target;
  const heading = holder?.matches(HEADING_SELECTOR) ? holder : holder?.querySelector(HEADING_SELECTOR);
  if (holder === null || holder === undefined || heading === null || heading === undefined) {
    return null;
  }
  const text = (holder.textContent ?? "").trimStart();
  return text.startsWith((heading.textContent ?? "").trim()) ? target : null;
}

/** Returns nothing for a part with no text or images, such as a blank or a wrapper page. */
function toChapter(piece: Piece, id: string): Chapter[] {
  const blocks = contentToBlocks(piece.content);
  if (blocks.length === 0) {
    return [];
  }
  const title = piece.title || firstHeadingText(blocks);
  return [
    {
      id,
      title,
      blocks: withoutRepeatedTitle(blocks, title).map((block, index) => ({
        ...block,
        id: `${id}-b${index}`,
      })),
    },
  ];
}

function firstHeadingText(blocks: readonly Block[]): string {
  const first = blocks.find((block) => block.type !== "image");
  return first?.type === "heading"
    ? squeeze(new DOMParser().parseFromString(first.html, "text/html").body.textContent)
    : "";
}

/**
 * Copies a chapter's body into a new inert HTML document. Whichever parser the file
 * went through, the copy has plain HTML elements and only the attributes listed here.
 */
function sanitisedBody(parsed: Document, path: string): HTMLElement {
  const clean = document.implementation.createHTMLDocument("");
  const source = byName(parsed, "body")[0];
  if (source !== undefined) {
    copyChildren(source, clean.body, path);
  }
  return clean.body;
}

function copyChildren(source: Element, target: Element, path: string): void {
  const owner = target.ownerDocument;
  for (const child of source.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      target.append(owner.createTextNode(child.textContent ?? ""));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      copyElement(child as Element, target, path);
    }
  }
}

function copyElement(source: Element, target: Element, path: string): void {
  const tag = source.localName.toLowerCase();
  const owner = target.ownerDocument;
  if (tag === "img") {
    appendImage(source.getAttribute("src"), source.getAttribute("alt"), target, path);
  } else if (tag === "svg") {
    // A common way to wrap a full-page picture. An SVG's own drawing isn't kept.
    const image = byName(source, "image")[0];
    appendImage(
      image?.getAttribute("href") ?? image?.getAttribute("xlink:href") ?? null,
      null,
      target,
      path,
    );
  } else if (!DROPPED.has(tag) && !isPageBreak(source)) {
    const copy = createCopy(tag, owner);
    if (copy === null) {
      copyChildren(source, target, path);
      return;
    }
    copyAttributes(source, copy, tag);
    copyChildren(source, copy, path);
    target.append(copy);
  }
}

/** A printed page number isn't part of the text, and shouldn't be read aloud. */
function isPageBreak(element: Element): boolean {
  const type = element.getAttribute("epub:type") ?? element.getAttribute("role") ?? "";
  return PAGE_BREAK.test(type);
}

/** A name from the file might not be valid here. Its text still gets kept. */
function createCopy(tag: string, owner: Document): HTMLElement | null {
  try {
    return owner.createElement(tag);
  } catch {
    return null;
  }
}

function copyAttributes(source: Element, copy: HTMLElement, tag: string): void {
  const id = source.getAttribute("id");
  if (id !== null) {
    copy.id = id;
  }
  const href = source.getAttribute("href");
  if (tag === "a" && href !== null) {
    copy.setAttribute("href", href);
  }
  const start = source.getAttribute("start");
  if (tag === "ol" && start !== null) {
    copy.setAttribute("start", start);
  }
}

/**
 * Only a path inside the book survives. A remote or data address resolves to null
 * and is dropped here, and the page's own policy would refuse it anyway.
 */
function appendImage(
  src: string | null,
  alt: string | null,
  target: Element,
  path: string,
): void {
  const resolved = src === null ? null : resolveHref(path, src);
  if (resolved === null) {
    return;
  }
  const placed = target.ownerDocument.createElement(PLACED_IMAGE);
  placed.setAttribute("data-path", resolved.path);
  placed.setAttribute("data-alt", alt ?? "");
  target.append(placed);
}
