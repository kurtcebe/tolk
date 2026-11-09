import {
  forgetArticleInTab,
  linkArticleToTab,
  parseRawArticle,
  type RawArticle,
  saveArticle,
} from "./article-store.js";
import { extractArticle } from "./extract.js";
import type { LibraryNote } from "./library-notes.js";

const LIBRARY_MENU_ITEM = "open-library";

// Listeners are added straight away, because Chrome starts this worker to deliver
// an event and only sends it to listeners that exist by then.
chrome.action.onClicked.addListener((tab) => void openReaderFor(tab));
chrome.tabs.onRemoved.addListener((tabId) => void forgetArticleInTab(tabId));
// Chrome keeps menu items between restarts, so they're only made on install or update.
chrome.runtime.onInstalled.addListener(() => void createLibraryMenuItem());
chrome.contextMenus.onClicked.addListener(({ menuItemId }, tab) => {
  if (menuItemId === LIBRARY_MENU_ITEM) {
    void openExtensionTab("library.html", tab);
  }
});

async function createLibraryMenuItem(): Promise<void> {
  // An update keeps the old item, and creating the same ID twice is an error.
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: LIBRARY_MENU_ITEM,
    title: "Open library",
    contexts: ["action"],
  });
}

async function openReaderFor(source: chrome.tabs.Tab): Promise<void> {
  const extraction = source.id === undefined ? "blocked" : await extract(source.id);
  if (typeof extraction === "string") {
    await openExtensionTab(`library.html?note=${extraction}`, source);
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
    await openExtensionTab("library.html?note=failed", source);
    return;
  }
  const tab = await openExtensionTab(`reader.html?article=${id}`, source);
  if (tab.id !== undefined) {
    await linkArticleToTab(id, tab.id);
  }
}

/**
 * activeTab lets this run after a click on the icon or the shortcut, on the
 * current page only. Chrome refuses its own pages, the Web Store and the like.
 */
async function extract(tabId: number): Promise<RawArticle | LibraryNote> {
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

async function openExtensionTab(
  page: string,
  source: chrome.tabs.Tab | undefined,
): Promise<chrome.tabs.Tab> {
  const url = chrome.runtime.getURL(page);
  return source === undefined
    ? await chrome.tabs.create({ url })
    : await chrome.tabs.create({ url, index: source.index + 1, openerTabId: source.id });
}
