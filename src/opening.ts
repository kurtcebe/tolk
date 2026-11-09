// Decides what this reader tab shows, from its address. The address only carries
// an ID or a reason, so a page's text never ends up in the URL.

import { articleToBlocks } from "./article-blocks.js";
import { loadArticle, type StoredArticle } from "./article-store.js";
import { getBook, getBookFile, type Book } from "./book-store.js";
import { requireElement } from "./controls.js";
import type { TolkDocument } from "./document.js";
import { openBook } from "./epub-document.js";
import { isLibraryNote } from "./library-notes.js";
import { SAMPLE_DOCUMENT } from "./sample.js";

const NOTES = {
  gone: "This article is no longer open. Go back to the page and click the Tolk icon.",
  "book-gone": "This book is no longer in your library.",
  "book-failed": "This book couldn't be opened.",
} as const;

export type OpeningNote = keyof typeof NOTES;

export type Opening =
  | { kind: "document"; document: TolkDocument; book: Book | null }
  | { kind: "note"; note: OpeningNote }
  | { kind: "library"; query: string };

export async function resolveOpening(): Promise<Opening> {
  const params = new URLSearchParams(location.search);
  if (params.has("sample")) {
    return { kind: "document", document: SAMPLE_DOCUMENT, book: null };
  }
  const bookId = params.get("book");
  if (bookId !== null) {
    return await openStoredBook(bookId);
  }
  const id = params.get("article");
  if (id !== null) {
    return await openArticle(id);
  }
  // Nothing to read belongs in the library, including a tab left over from before it existed.
  const note = params.get("note");
  if (note === "gone") {
    return { kind: "note", note };
  }
  return { kind: "library", query: note !== null && isLibraryNote(note) ? `?note=${note}` : "" };
}

async function openStoredBook(id: string): Promise<Opening> {
  try {
    const [book, file] = await Promise.all([getBook(id), getBookFile(id)]);
    if (book === null || file === null) {
      return { kind: "note", note: "book-gone" };
    }
    const contents = await openBook(file, book.title);
    return {
      kind: "document",
      book,
      document: {
        id,
        source: { kind: "book", bookId: id },
        title: book.title,
        author: book.author,
        // Always detected from the text, like a page, unless the reader chose.
        language: null,
        chapters: contents.chapters,
        loadImage: contents.loadImage,
      },
    };
  } catch (error) {
    console.warn("Tolk couldn't open this book.", error);
    return { kind: "note", note: "book-failed" };
  }
}

async function openArticle(id: string): Promise<Opening> {
  try {
    const article = await loadArticle(id);
    if (article === null) {
      return { kind: "note", note: "gone" };
    }
    const document = articleToDocument(id, article);
    return document.chapters[0]?.blocks.length === 0
      ? { kind: "library", query: "?note=no-article" }
      : { kind: "document", document, book: null };
  } catch (error) {
    console.warn("Tolk couldn't load this article.", error);
    return { kind: "library", query: "?note=failed" };
  }
}

function articleToDocument(id: string, article: StoredArticle): TolkDocument {
  const title = article.title.trim() || (URL.parse(article.url)?.hostname ?? "");
  return {
    id,
    source: { kind: "page", url: article.url },
    title,
    author: article.byline.trim() || null,
    // Always detected from the text, never taken from the page's `lang` tag.
    language: null,
    chapters: [{ id, title, blocks: articleToBlocks(article.content, title) }],
  };
}

/** Takes the reader's place when there's nothing to read, with none of its tools. */
export function showNote(note: OpeningNote): void {
  document.documentElement.classList.add("no-document");
  const message = document.createElement("p");
  message.className = "opening-note";
  message.textContent = NOTES[note];
  requireElement("reader").replaceChildren(message);
  if (note === "gone") {
    return;
  }
  const library = document.createElement("a");
  library.href = "library.html";
  library.textContent = "Your books";
  message.append(" ", library);
}
