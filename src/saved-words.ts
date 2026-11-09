// The saved words drawer: the list by day, deleting with Undo, the language
// selector and the Anki export. Everything shown here comes from a page or a
// model, so it only ever goes in as text (invariant 4).

import { toAnkiTsv } from "./anki-export.js";
import { listBooks, subscribeBooks } from "./book-store.js";
import { requireElement, requireSelect } from "./controls.js";
import { getLanguage, subscribeLanguage } from "./document-language.js";
import { languageKey, languageName } from "./languages.js";
import {
  deleteSavedWord,
  didSavedWordsFail,
  getSavedWords,
  putSavedWord,
  subscribeSavedWords,
  type SavedWord,
} from "./saved-words-store.js";

const UNDO_MS = 6000;
const DAY_FORMAT = new Intl.DateTimeFormat("en", { dateStyle: "long" });

/** The language picked in the selector, by key. Null until a reader picks one. */
let pickedLanguage: string | null = null;
let undoTimer = 0;
let bookIds: ReadonlySet<string> = new Set();

export function mountSavedWords(): void {
  requireSelect("saved-language").addEventListener("change", () => {
    pickedLanguage = requireSelect("saved-language").value;
    render();
  });
  requireElement("saved-export").addEventListener("click", exportForAnki);
  subscribeSavedWords(render);
  subscribeLanguage(render);
  subscribeBooks(() => void refreshBookIds());
  void refreshBookIds();
  render();
}

function render(): void {
  const languages = savedLanguages();
  const language = shownLanguage(languages);
  renderLanguageSelector(languages, language);

  const words = wordsIn(language).sort((first, second) => second.savedAt - first.savedAt);
  requireElement("saved-list").replaceChildren(...renderDays(words));

  const empty = requireElement("saved-empty");
  empty.hidden = words.length > 0;
  empty.textContent = didSavedWordsFail()
    ? "Saved words couldn't be opened."
    : "Select a word and press its star to save it here.";
  requireElement("saved-export").hidden = words.length === 0;
}

/** One tag per language, keyed so that "nl" and "nl-BE" are the same list. */
function savedLanguages(): Map<string, string> {
  const languages = new Map<string, string>();
  for (const { language } of getSavedWords()) {
    languages.set(languageKey(language), language);
  }
  return languages;
}

function shownLanguage(languages: Map<string, string>): string | null {
  if (pickedLanguage !== null && languages.has(pickedLanguage)) {
    return pickedLanguage;
  }
  const current = getLanguage();
  const currentKey = current === null ? null : languageKey(current);
  if (currentKey !== null && languages.has(currentKey)) {
    return currentKey;
  }
  return languages.keys().next().value ?? null;
}

function wordsIn(language: string | null): SavedWord[] {
  return getSavedWords().filter((word) => languageKey(word.language) === language);
}

/** Only appears once there are words in two or more languages. */
function renderLanguageSelector(languages: Map<string, string>, shown: string | null): void {
  requireElement("saved-language-row").hidden = languages.size < 2;
  const select = requireSelect("saved-language");
  const options = [...languages].map(([key, tag]) => new Option(languageName(tag), key));
  select.replaceChildren(...options);
  select.value = shown ?? "";
}

function renderDays(words: readonly SavedWord[]): HTMLElement[] {
  const elements: HTMLElement[] = [];
  let day = "";
  for (const word of words) {
    const thisDay = DAY_FORMAT.format(word.savedAt);
    if (thisDay !== day) {
      day = thisDay;
      const heading = document.createElement("h3");
      heading.className = "saved-day";
      heading.textContent = thisDay;
      elements.push(heading);
    }
    elements.push(renderEntry(word));
  }
  return elements;
}

function renderEntry(saved: SavedWord): HTMLElement {
  const entry = document.createElement("article");
  entry.className = "saved-entry";

  const word = textElement("saved-word", saved.word);
  word.lang = saved.language;
  entry.append(word, renderMenu(saved));

  if (saved.translation !== "") {
    const translation = textElement("saved-translation", saved.translation);
    translation.dir = "auto";
    entry.append(translation);
  }
  if (saved.sentence !== "") {
    const sentence = textElement("saved-sentence", saved.sentence);
    sentence.lang = saved.language;
    entry.append(sentence);
  }
  entry.append(renderSource(saved));
  return entry;
}

async function refreshBookIds(): Promise<void> {
  try {
    bookIds = new Set((await listBooks()).map((book) => book.id));
  } catch (error) {
    console.warn("Couldn't check which books are in the library.", error);
    bookIds = new Set();
  }
  render();
}

/** The address came from storage, so only a real web address becomes a link. */
function renderSource(saved: SavedWord): HTMLElement {
  const element = textElement("saved-source", saved.source.title);
  const { bookId } = saved.source;
  // A deleted book's words keep its title, with nothing left to link to.
  if (bookId !== undefined && bookIds.has(bookId)) {
    const link = document.createElement("a");
    link.href = `reader.html?book=${encodeURIComponent(bookId)}`;
    link.target = "_blank";
    link.textContent = saved.source.title;
    element.replaceChildren(link);
    return element;
  }
  const url = URL.parse(saved.source.url ?? "");
  if (url?.protocol === "http:" || url?.protocol === "https:") {
    const link = document.createElement("a");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = saved.source.title;
    element.replaceChildren(link);
  }
  return element;
}

function textElement(className: string, text: string): HTMLElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

function renderMenu(saved: SavedWord): DocumentFragment {
  const menu = document.createElement("div");
  menu.className = "saved-menu";
  menu.popover = "auto";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Delete";
  remove.addEventListener("click", () => {
    menu.hidePopover();
    void removeWord(saved);
  });
  menu.append(remove);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "saved-menu-button";
  button.setAttribute("aria-label", `More for ${saved.word}`);
  button.textContent = "⋯";
  button.popoverTargetElement = menu;
  menu.addEventListener("beforetoggle", () => {
    const { bottom, right } = button.getBoundingClientRect();
    menu.style.top = `${bottom + 4}px`;
    menu.style.right = `${document.documentElement.clientWidth - right}px`;
  });

  const fragment = document.createDocumentFragment();
  fragment.append(button, menu);
  return fragment;
}

/** Happens straight away, with a brief Undo. */
async function removeWord(saved: SavedWord): Promise<void> {
  if (await deleteSavedWord(saved.id)) {
    showUndo(saved);
  }
}

function showUndo(saved: SavedWord): void {
  const undo = requireElement("saved-undo");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link-button";
  button.textContent = "Undo";
  button.addEventListener("click", () => {
    hideUndo();
    void putSavedWord(saved);
  });
  undo.replaceChildren(`Deleted “${saved.word}”. `, button);
  undo.hidden = false;
  window.clearTimeout(undoTimer);
  undoTimer = window.setTimeout(hideUndo, UNDO_MS);
}

function hideUndo(): void {
  window.clearTimeout(undoTimer);
  requireElement("saved-undo").hidden = true;
}

/** A blob stays in the browser. The download is what puts it on disk. */
function exportForAnki(): void {
  const language = shownLanguage(savedLanguages());
  const words = wordsIn(language).sort((first, second) => first.savedAt - second.savedAt);
  const tag = words[0]?.language;
  if (tag === undefined) {
    return;
  }
  const blob = new Blob([toAnkiTsv(words)], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tolk-${languageName(tag).toLowerCase().replaceAll(" ", "-")}-${localDate()}.tsv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function localDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
