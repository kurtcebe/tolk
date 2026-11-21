// The library page: importing, listing, opening and deleting books. Everything shown
// comes from a book, so it only ever goes in as text (invariant 4).

import { mountAppearance } from "./appearance.js";
import { highlightBook } from "./aquarium.js";
import {
  addBook,
  deleteBook,
  listBooks,
  subscribeBooks,
  type Book,
} from "./book-store.js";
import { requireElement } from "./controls.js";
import { mountDrawerToggles } from "./drawer.js";
import { EpubError, type EpubProblem } from "./epub.js";
import { openBook } from "./epub-document.js";
import { bookColour, mountReadingHistory, refreshHistory, renderHistory } from "./library-history.js";
import { isLibraryNote, LIBRARY_NOTES } from "./library-notes.js";
import { mountSavedWords } from "./saved-words.js";
import { loadSavedWords } from "./saved-words-store.js";
import { loadSettings } from "./state.js";

const PROBLEM_MESSAGES: Readonly<Record<EpubProblem, string>> = {
  drm: "This book is copy-protected, so Tolk can't open it.",
  invalid: "This file couldn't be read as an EPUB.",
};
const SAVE_FAILED = "This book couldn't be saved in this browser.";
const LOAD_FAILED = "Your books couldn't be opened.";

/** A file being imported, or one that failed. These last only as long as the page. */
interface Import {
  id: string;
  name: string;
  message: string | null;
}

const coverUrls = new Map<string, string>();

let books: Book[] = [];
let imports: Import[] = [];
let confirmingDelete: string | null = null;
let loadFailed = false;

await start();

async function start(): Promise<void> {
  try {
    await loadSettings();
    mountAppearance();
    showNote();
    mountDrawerToggles();
    mountSavedWords();
    void loadSavedWords();
    mountImport();
    mountReadingHistory((bookId) => books.find((book) => book.id === bookId)?.title ?? null, render);
    subscribeBooks(() => void refresh());
    // Coming back from a book through the Back button doesn't reload this page.
    window.addEventListener("pageshow", () => void refresh());
    await refresh();
    await refreshHistory();
    await document.fonts.ready;
  } finally {
    document.documentElement.dataset["ready"] = "true";
  }
}

function showNote(): void {
  const reason = new URLSearchParams(location.search).get("note");
  const note = requireElement("library-note");
  if (reason !== null && isLibraryNote(reason)) {
    note.textContent = LIBRARY_NOTES[reason];
    note.hidden = false;
  }
}

async function refresh(): Promise<void> {
  try {
    books = await listBooks();
    loadFailed = false;
  } catch (error) {
    console.warn("Couldn't load the library.", error);
    loadFailed = true;
  }
  render();
}

// Importing

function mountImport(): void {
  const input = requireElement("import-input");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("library.html's #import-input must be an input");
  }
  for (const button of document.querySelectorAll(".import-button")) {
    button.addEventListener("click", () => input.click());
  }
  input.addEventListener("change", () => {
    void importFiles([...(input.files ?? [])]);
    // So choosing the same file again still counts as a change.
    input.value = "";
  });

  // Without these, Chrome would navigate away to a dropped file.
  const root = document.documentElement;
  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    root.toggleAttribute("data-dragging", true);
  });
  window.addEventListener("dragleave", (event) => {
    if (event.relatedTarget === null) {
      root.removeAttribute("data-dragging");
    }
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    root.removeAttribute("data-dragging");
    void importFiles([...(event.dataTransfer?.files ?? [])]);
  });
}

/** Every card appears straight away, then the files are read one at a time. */
async function importFiles(files: readonly File[]): Promise<void> {
  const started = files.map((file) => ({
    file,
    entry: { id: crypto.randomUUID(), name: file.name, message: null },
  }));
  imports = [...started.map(({ entry }) => entry), ...imports];
  render();
  for (const { file, entry } of started) {
    await importFile(file, entry);
  }
}

async function importFile(file: File, entry: Import): Promise<void> {
  try {
    const contents = await openBook(file, file.name.replace(/\.epub$/i, ""));
    await addBook(
      {
        id: entry.id,
        title: contents.title,
        author: contents.author,
        cover: contents.cover,
        addedAt: Date.now(),
        position: null,
        progress: 0,
        lastReadAt: null,
        chosenLanguage: null,
      },
      file,
    );
    imports = imports.filter((candidate) => candidate !== entry);
    await refresh();
  } catch (error) {
    console.warn(`Couldn't import ${file.name}.`, error);
    entry.message = messageFor(error);
    render();
  }
}

function messageFor(error: unknown): string {
  if (error instanceof EpubError) {
    return PROBLEM_MESSAGES[error.problem];
  }
  // Writing to the database is the step that fails in its own way.
  return error instanceof DOMException && error.name === "QuotaExceededError"
    ? SAVE_FAILED
    : PROBLEM_MESSAGES.invalid;
}

// Showing

function render(): void {
  const sorted = [...books].sort((first, second) => lastUsed(second) - lastUsed(first));
  const isEmpty = sorted.length === 0 && imports.length === 0;

  const failure = requireElement("library-failure");
  failure.hidden = !loadFailed;
  failure.textContent = LOAD_FAILED;
  requireElement("library-actions").hidden = isEmpty;
  requireElement("library-empty").hidden = !isEmpty || loadFailed;

  dropUnusedCovers();
  // A card that's replaced never gets its pointerleave, so the highlight ends here.
  // The next pointer move over a new card starts it again.
  highlightBook(null);
  requireElement("library-grid").replaceChildren(
    ...imports.map(renderImport),
    ...sorted.map(renderBook),
  );
  // The chosen day names the books read, which may just have changed.
  renderHistory();
}

function lastUsed(book: Book): number {
  return book.lastReadAt ?? book.addedAt;
}

function renderImport(entry: Import): HTMLElement {
  const card = document.createElement("article");
  card.className = "book-card";
  card.append(generatedCover(entry.name), textElement("book-title", entry.name));
  if (entry.message === null) {
    card.append(textElement("book-status", "Importing…"));
    return card;
  }
  const message = textElement("book-problem", entry.message);
  message.setAttribute("role", "alert");
  const remove = textButton("Remove", () => {
    imports = imports.filter((candidate) => candidate !== entry);
    render();
  });
  card.append(message, remove);
  return card;
}

function renderBook(book: Book): HTMLElement {
  const card = document.createElement("article");
  card.className = "book-card";

  const link = document.createElement("a");
  link.className = "book-link";
  link.href = `reader.html?book=${encodeURIComponent(book.id)}`;
  link.append(renderCover(book), textElement("book-title", book.title));
  if (book.author !== null) {
    link.append(textElement("book-author", book.author));
  }
  link.append(renderProgress(book));
  card.append(link);

  // A book that's been read has a colour: a dot on its cover, and its fish in the
  // aquarium stand out while the card is pointed at or focused.
  const colour = bookColour(book.id);
  if (colour !== null) {
    const dot = document.createElement("span");
    dot.className = "book-dot";
    dot.dataset["colour"] = String(colour + 1);
    card.append(dot);
    card.addEventListener("pointerenter", () => highlightBook(book.id));
    card.addEventListener("pointerleave", () => highlightBook(null));
    card.addEventListener("focusin", () => highlightBook(book.id));
    card.addEventListener("focusout", () => highlightBook(null));
  }

  if (confirmingDelete === book.id) {
    card.append(renderConfirmation(book));
  } else {
    card.append(...renderMenu(book));
  }
  return card;
}

function renderCover(book: Book): HTMLElement {
  if (book.cover === null) {
    return generatedCover(book.title);
  }
  let url = coverUrls.get(book.id);
  if (url === undefined) {
    url = URL.createObjectURL(book.cover);
    coverUrls.set(book.id, url);
  }
  const image = document.createElement("img");
  image.className = "book-cover";
  image.alt = "";
  image.src = url;
  image.addEventListener("error", () => image.replaceWith(generatedCover(book.title)));
  return image;
}

function dropUnusedCovers(): void {
  const present = new Set(books.map((book) => book.id));
  for (const [id, url] of coverUrls) {
    if (!present.has(id)) {
      URL.revokeObjectURL(url);
      coverUrls.delete(id);
    }
  }
}

function generatedCover(title: string): HTMLElement {
  const cover = document.createElement("div");
  cover.className = "book-cover book-cover-generated";
  cover.textContent = title;
  return cover;
}

function renderProgress(book: Book): HTMLElement {
  if (book.position === null) {
    return textElement("book-status", "New");
  }
  const row = document.createElement("div");
  row.className = "book-progress";
  const bar = document.createElement("progress");
  bar.max = 1;
  bar.value = book.progress;
  bar.setAttribute("aria-hidden", "true");
  row.append(bar, textElement("book-status", `${Math.round(book.progress * 100)}%`));
  return row;
}

function renderMenu(book: Book): HTMLElement[] {
  const menu = document.createElement("div");
  menu.className = "saved-menu";
  menu.popover = "auto";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Delete";
  remove.addEventListener("click", () => {
    menu.hidePopover();
    confirmingDelete = book.id;
    render();
  });
  menu.append(remove);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "book-menu-button";
  button.setAttribute("aria-label", `More for ${book.title}`);
  button.textContent = "⋯";
  button.popoverTargetElement = menu;
  menu.addEventListener("beforetoggle", () => {
    const { bottom, right } = button.getBoundingClientRect();
    menu.style.top = `${bottom + 4}px`;
    menu.style.right = `${document.documentElement.clientWidth - right}px`;
  });
  return [button, menu];
}

function renderConfirmation(book: Book): HTMLElement {
  const confirmation = document.createElement("div");
  confirmation.className = "book-confirm";
  confirmation.append(
    textElement("book-confirm-question", "Delete this book and your reading position?"),
    textButton("Delete", () => void removeBook(book.id)),
    textButton("Cancel", () => {
      confirmingDelete = null;
      render();
    }),
  );
  return confirmation;
}

async function removeBook(id: string): Promise<void> {
  confirmingDelete = null;
  try {
    await deleteBook(id);
  } catch (error) {
    console.warn("Couldn't delete this book.", error);
    render();
  }
}

function textElement(className: string, text: string): HTMLElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

function textButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}
