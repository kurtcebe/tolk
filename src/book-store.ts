// The one owner of stored books. A book's file and its details sit in separate
// stores, so listing the library or saving a reading position never touches the
// file. This has its own database, so adding books couldn't put saved words at risk.

import { committed, settled } from "./idb.js";
import { isRecord } from "./state.js";

const DATABASE = "tolk-books";
const DATABASE_VERSION = 1;
const BOOKS = "books";
const FILES = "files";
const CHANNEL = "tolk-books";

/** Where a reader is, by word rather than pixels, so it survives a new text size or window. */
export interface BookPosition {
  chapterId: string;
  blockId: string;
  wordIndex: number;
}

export interface Book {
  id: string;
  title: string;
  author: string | null;
  cover: Blob | null;
  addedAt: number;
  /** Null until it's first opened, which is what makes the library say "New". */
  position: BookPosition | null;
  /** From 0 to 1. */
  progress: number;
  lastReadAt: number | null;
  /** A language the reader chose for this book, which beats detection. */
  chosenLanguage: string | null;
}

export type BookChange = Partial<
  Pick<Book, "position" | "progress" | "lastReadAt" | "chosenLanguage">
>;

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;
let opening: Promise<IDBDatabase> | null = null;

/** Hears changes made in this page and in other tabs. */
export function subscribeBooks(listener: () => void): void {
  if (channel === null) {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener("message", notify);
  }
  listeners.add(listener);
}

export async function listBooks(): Promise<Book[]> {
  const database = await openDatabase();
  const stored: unknown[] = await settled(
    database.transaction(BOOKS).objectStore(BOOKS).getAll(),
  );
  return stored.flatMap((entry) => parseBook(entry) ?? []);
}

export async function getBook(id: string): Promise<Book | null> {
  const database = await openDatabase();
  const stored: unknown = await settled(
    database.transaction(BOOKS).objectStore(BOOKS).get(id),
  );
  return parseBook(stored);
}

export async function getBookFile(id: string): Promise<Blob | null> {
  const database = await openDatabase();
  const stored: unknown = await settled(
    database.transaction(FILES).objectStore(FILES).get(id),
  );
  const file = isRecord(stored) ? stored["file"] : null;
  return file instanceof Blob ? file : null;
}

export async function addBook(book: Book, file: Blob): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([BOOKS, FILES], "readwrite");
  transaction.objectStore(BOOKS).put(book);
  transaction.objectStore(FILES).put({ id: book.id, file });
  await committed(transaction);
  changed();
}

export async function deleteBook(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([BOOKS, FILES], "readwrite");
  transaction.objectStore(BOOKS).delete(id);
  transaction.objectStore(FILES).delete(id);
  await committed(transaction);
  changed();
}

/** Does nothing if the book has gone, so a reader still open can't bring it back. */
export async function updateBook(id: string, change: BookChange): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(BOOKS, "readwrite");
  const store = transaction.objectStore(BOOKS);
  const book = parseBook(await settled(store.get(id)));
  if (book !== null) {
    store.put({ ...book, ...change });
  }
  await committed(transaction);
  changed();
}

function changed(): void {
  channel?.postMessage("changed");
  notify();
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  opening ??= open().catch((error: unknown) => {
    opening = null;
    throw error;
  });
  return opening;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(BOOKS, { keyPath: "id" });
      request.result.createObjectStore(FILES, { keyPath: "id" });
    });
    request.addEventListener("error", () => reject(request.error));
    request.addEventListener("success", () => {
      const database = request.result;
      // A later version in another tab has to be able to upgrade.
      database.addEventListener("versionchange", () => {
        database.close();
        opening = null;
      });
      resolve(database);
    });
  });
}

/** Storage is a boundary, so what comes back is checked and anything malformed is skipped. */
function parseBook(stored: unknown): Book | null {
  if (!isRecord(stored)) {
    return null;
  }
  const { id, title, author, cover, addedAt, position, progress, lastReadAt, chosenLanguage } =
    stored;
  if (typeof id !== "string" || typeof title !== "string" || typeof addedAt !== "number") {
    return null;
  }
  return {
    id,
    title,
    author: typeof author === "string" ? author : null,
    cover: cover instanceof Blob ? cover : null,
    addedAt,
    position: parsePosition(position),
    progress: typeof progress === "number" ? Math.min(1, Math.max(0, progress)) : 0,
    lastReadAt: typeof lastReadAt === "number" ? lastReadAt : null,
    chosenLanguage: typeof chosenLanguage === "string" ? chosenLanguage : null,
  };
}

function parsePosition(stored: unknown): BookPosition | null {
  if (!isRecord(stored)) {
    return null;
  }
  const { chapterId, blockId, wordIndex } = stored;
  return typeof chapterId === "string" && typeof blockId === "string" && typeof wordIndex === "number"
    ? { chapterId, blockId, wordIndex }
    : null;
}
