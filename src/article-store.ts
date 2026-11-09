// Hands an extracted article from the service worker to the reader tab. Session
// storage stays in memory and isn't synced, and a live page isn't kept: it lasts
// until its reader tab closes or the browser quits, and a reload still works.

/** What extraction returns. Every field comes from a hostile page and is untrusted. */
export interface RawArticle {
  title: string;
  byline: string;
  content: string;
}

export interface StoredArticle extends RawArticle {
  /** The address of the tab it came from, as Chrome reported it. */
  url: string;
}

const articleKey = (id: string): string => `article:${id}`;
const readerTabKey = (tabId: number): string => `reader-tab:${tabId}`;

/** Extraction results cross a boundary, so they're checked at runtime. */
export function parseRawArticle(value: unknown): RawArticle | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { title, byline, content } = value as Record<string, unknown>;
  if (typeof title !== "string" || typeof byline !== "string" || typeof content !== "string") {
    return null;
  }
  return { title, byline, content };
}

export async function saveArticle(id: string, article: StoredArticle): Promise<void> {
  await chrome.storage.session.set({ [articleKey(id)]: article });
}

export async function linkArticleToTab(id: string, tabId: number): Promise<void> {
  await chrome.storage.session.set({ [readerTabKey(tabId)]: id });
}

/** Returns null when the article has gone, such as after a browser restart. */
export async function loadArticle(id: string): Promise<StoredArticle | null> {
  const key = articleKey(id);
  const stored: Record<string, unknown> = await chrome.storage.session.get(key);
  const value = stored[key];
  const article = parseRawArticle(value);
  const url = (value as { url?: unknown } | undefined)?.url;
  return article === null || typeof url !== "string" ? null : { ...article, url };
}

export async function forgetArticleInTab(tabId: number): Promise<void> {
  const key = readerTabKey(tabId);
  const stored: Record<string, unknown> = await chrome.storage.session.get(key);
  const id = stored[key];
  if (typeof id === "string") {
    await chrome.storage.session.remove([key, articleKey(id)]);
  }
}
