import {
  forgetArticleInTab,
  linkArticleToTab,
  parseRawArticle,
  type RawArticle,
  saveArticle,
} from "./article-store.js";
import { extractArticle } from "./extract.js";
import type { OpeningNote } from "./opening.js";

// Listeners are added straight away, because Chrome starts this worker to deliver
// an event and only sends it to listeners that exist by then.
chrome.action.onClicked.addListener((tab) => void openReaderFor(tab));
chrome.tabs.onRemoved.addListener((tabId) => void forgetArticleInTab(tabId));

async function openReaderFor(source: chrome.tabs.Tab): Promise<void> {
  const extraction = source.id === undefined ? "blocked" : await extract(source.id);
  if (typeof extraction === "string") {
    await openReaderTab(source, `note=${extraction}`);
    return;
  }

  const id = crypto.randomUUID();
  const article = {
    ...extraction,
    title: extraction.title.trim() || source.title || "",
    url: source.url ?? "",
  };
  try {
    await saveArticle(id, article);
  } catch (error) {
    // Session storage has a size limit, which a huge page could reach.
    console.warn("Tolk couldn't keep this article.", error);
    await openReaderTab(source, "note=failed");
    return;
  }
  const tab = await openReaderTab(source, `article=${id}`);
  if (tab.id !== undefined) {
    await linkArticleToTab(id, tab.id);
  }
}

/**
 * activeTab lets this run after a click on the icon or the shortcut, on the
 * current page only. Chrome refuses its own pages, the Web Store and the like.
 */
async function extract(tabId: number): Promise<RawArticle | OpeningNote> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["vendor/Readability.js"],
    });
    const [main] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractArticle,
    });
    return parseRawArticle(main?.result) ?? "no-article";
  } catch (error) {
    console.warn("Tolk couldn't read this page.", error);
    return "blocked";
  }
}

async function openReaderTab(
  source: chrome.tabs.Tab,
  query: string,
): Promise<chrome.tabs.Tab> {
  return await chrome.tabs.create({
    url: chrome.runtime.getURL(`reader.html?${query}`),
    index: source.index + 1,
    openerTabId: source.id,
  });
}
