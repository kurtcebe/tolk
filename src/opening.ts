// Decides what this reader tab shows, from its address. The address only carries
// an ID or a reason, so a page's text never ends up in the URL.

import { articleToBlocks } from "./article-blocks.js";
import { loadArticle, type StoredArticle } from "./article-store.js";
import { requireElement } from "./controls.js";
import type { TolkDocument } from "./document.js";
import { SAMPLE_DOCUMENT } from "./sample.js";

const NOTES = {
  blocked: "Chrome doesn't let extensions read this page.",
  "no-article": "Tolk couldn't find an article on this page.",
  failed: "Tolk couldn't open this article.",
  gone: "This article is no longer open. Go back to the page and click the Tolk icon.",
} as const;

export type OpeningNote = keyof typeof NOTES;

export type Opening =
  | { kind: "document"; document: TolkDocument }
  | { kind: "note"; note: OpeningNote };

export async function resolveOpening(): Promise<Opening> {
  const params = new URLSearchParams(location.search);
  if (params.has("sample")) {
    return { kind: "document", document: SAMPLE_DOCUMENT };
  }
  const id = params.get("article");
  if (id !== null) {
    return await openArticle(id);
  }
  const note = params.get("note");
  return { kind: "note", note: note !== null && note in NOTES ? (note as OpeningNote) : "no-article" };
}

async function openArticle(id: string): Promise<Opening> {
  try {
    const article = await loadArticle(id);
    if (article === null) {
      return { kind: "note", note: "gone" };
    }
    const document = articleToDocument(id, article);
    return document.chapters[0]?.blocks.length === 0
      ? { kind: "note", note: "no-article" }
      : { kind: "document", document };
  } catch (error) {
    console.warn("Tolk couldn't load this article.", error);
    return { kind: "note", note: "failed" };
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
  const sample = document.createElement("a");
  sample.href = "reader.html?sample";
  sample.textContent = "Read the sample text";
  message.append(" ", sample);
}
