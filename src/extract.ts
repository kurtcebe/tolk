// Runs inside the reader's current tab. Chrome serialises extractArticle and runs
// it there, so it can only use what's inside it and the Readability global that
// background.ts injects first. Importing anything here would break it. It makes
// no AI calls, because the host page is hostile and its DOM isn't ours.

import type { RawArticle } from "./article-store.js";

/** Provided at runtime by extension/vendor/Readability.js. */
declare class Readability {
  constructor(document: Document, options?: { serializer?: (element: Element) => string });
  parse(): {
    title?: string | null;
    byline?: string | null;
    content?: string | null;
    textContent?: string | null;
  } | null;
}

/** Returns null when the page has no article worth reading. */
export function extractArticle(): RawArticle | null {
  // Inside the function, because a constant outside it wouldn't come along.
  // Readability will accept almost any page, so very little text means no article.
  const MIN_ARTICLE_CHARACTERS = 250;
  try {
    // Readability rewrites what it's given, and the original tab must stay as it was.
    const clone = document.cloneNode(true) as Document;
    // Styles and handlers are never used, and in the reader the page's CSP would
    // block and report them when the HTML is parsed. So they go here, on the clone.
    const serializer = (element: Element): string => {
      for (const style of element.querySelectorAll("style")) {
        style.remove();
      }
      for (const node of element.querySelectorAll("*")) {
        for (const name of node.getAttributeNames()) {
          if (name === "style" || name.startsWith("on")) {
            node.removeAttribute(name);
          }
        }
      }
      return element.innerHTML;
    };
    const parsed = new Readability(clone, { serializer }).parse();
    const content = parsed?.content ?? "";
    const length = parsed?.textContent?.trim().length ?? 0;
    if (content === "" || length < MIN_ARTICLE_CHARACTERS) {
      return null;
    }
    return { title: parsed?.title ?? "", byline: parsed?.byline ?? "", content };
  } catch (error) {
    console.warn("Tolk couldn't extract this page.", error);
    return null;
  }
}
