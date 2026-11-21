// The one owner of reading history: daily totals per language, never what was read.
// It has its own database, so clearing it can't touch books or saved words, and it
// stays on this machine like they do.

import { committed, settled } from "./idb.js";
import { isRecord } from "./state.js";

const DATABASE = "tolk-history";
const DATABASE_VERSION = 2;
const STORE = "days";
/** Books finished, by book ID. A finish belongs to reading history, so it outlives the book. */
const FINISHED = "finished";

export interface DayTotals {
  /** The computer's local date, as YYYY-MM-DD. */
  date: string;
  /** A language key, so "nl" and "nl-BE" add up together. */
  language: string;
  seconds: number;
  words: number;
  /** Seconds per book ID. `Record<K, V>` is an object used as a lookup table. */
  books: Record<string, number>;
  /** Seconds in live articles, which are pooled and never named. */
  articleSeconds: number;
}

/** What a reader page adds to a day since it last saved. */
export interface Addition {
  date: string;
  language: string;
  seconds: number;
  words: number;
  /** Null for a live article. */
  bookId: string | null;
}

export interface Finish {
  bookId: string;
  /** The local date it was finished, as YYYY-MM-DD. */
  date: string;
  /** When, in milliseconds, so finishes on the same day keep their order. */
  at: number;
}

let opening: Promise<IDBDatabase> | null = null;

/** The computer's own date, not UTC's, so a day ends at the reader's midnight. */
export function localDate(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

/** Reads and writes in one transaction, so two tabs reading at once can't lose time. */
export async function addToDay(addition: Addition): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  const stored: unknown = await settled(store.get([addition.date, addition.language]));
  store.put(added(parseDay(stored) ?? emptyDay(addition.date, addition.language), addition));
  await committed(transaction);
}

export async function readDay(date: string, language: string): Promise<DayTotals | null> {
  const database = await openDatabase();
  const store = database.transaction(STORE).objectStore(STORE);
  const stored: unknown = await settled(store.get([date, language]));
  return parseDay(stored);
}

/** Every language's totals from one date to another, both included. */
export async function readDays(from: string, to: string): Promise<DayTotals[]> {
  const database = await openDatabase();
  const store = database.transaction(STORE).objectStore(STORE);
  // Keys are [date, language], and an array sorts after any string, so this
  // upper bound takes in every language on the last date.
  const range = IDBKeyRange.bound([from], [to, []]);
  const stored: unknown[] = await settled(store.getAll(range));
  return stored.flatMap((entry) => parseDay(entry) ?? []);
}

/** The earliest date with history, or null when there's none. */
export async function firstDate(): Promise<string | null> {
  const database = await openDatabase();
  const store = database.transaction(STORE).objectStore(STORE);
  const cursor = await settled(store.openCursor());
  const day = parseDay(cursor?.value);
  return day?.date ?? null;
}

/** Only the first finish counts, so reading a book again doesn't count it twice. */
export async function recordFinish(bookId: string, when: Date): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(FINISHED, "readwrite");
  const store = transaction.objectStore(FINISHED);
  const stored: unknown = await settled(store.get(bookId));
  if (parseFinish(stored) === null) {
    const finish: Finish = { bookId, date: localDate(when), at: when.getTime() };
    store.put(finish);
  }
  await committed(transaction);
}

/** Every book ever finished, in the order they were finished. */
export async function readFinishes(): Promise<Finish[]> {
  const database = await openDatabase();
  const store = database.transaction(FINISHED).objectStore(FINISHED);
  const stored: unknown[] = await settled(store.getAll());
  return stored.flatMap((entry) => parseFinish(entry) ?? []).sort((first, second) => first.at - second.at);
}

export async function clearHistory(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([STORE, FINISHED], "readwrite");
  transaction.objectStore(STORE).clear();
  transaction.objectStore(FINISHED).clear();
  await committed(transaction);
}

function emptyDay(date: string, language: string): DayTotals {
  return { date, language, seconds: 0, words: 0, books: {}, articleSeconds: 0 };
}

function added(day: DayTotals, addition: Addition): DayTotals {
  const books = { ...day.books };
  let articleSeconds = day.articleSeconds;
  if (addition.bookId === null) {
    articleSeconds += addition.seconds;
  } else {
    books[addition.bookId] = (books[addition.bookId] ?? 0) + addition.seconds;
  }
  return {
    ...day,
    seconds: day.seconds + addition.seconds,
    words: day.words + addition.words,
    books,
    articleSeconds,
  };
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
    // Version 1 had only the days, so an upgrade from it adds what's missing.
    request.addEventListener("upgradeneeded", () => {
      const names = request.result.objectStoreNames;
      if (!names.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: ["date", "language"] });
      }
      if (!names.contains(FINISHED)) {
        request.result.createObjectStore(FINISHED, { keyPath: "bookId" });
      }
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
function parseDay(stored: unknown): DayTotals | null {
  if (!isRecord(stored) || !isRecord(stored["books"])) {
    return null;
  }
  const { date, language, seconds, words, articleSeconds } = stored;
  if (
    typeof date !== "string" ||
    typeof language !== "string" ||
    !isCount(seconds) ||
    !isCount(words) ||
    !isCount(articleSeconds)
  ) {
    return null;
  }
  const books: Record<string, number> = {};
  for (const [bookId, bookSeconds] of Object.entries(stored["books"])) {
    if (isCount(bookSeconds)) {
      books[bookId] = bookSeconds;
    }
  }
  return { date, language, seconds, words, books, articleSeconds };
}

function parseFinish(stored: unknown): Finish | null {
  if (!isRecord(stored)) {
    return null;
  }
  const { bookId, date, at } = stored;
  if (typeof bookId !== "string" || typeof date !== "string" || !isCount(at)) {
    return null;
  }
  return { bookId, date, at };
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
