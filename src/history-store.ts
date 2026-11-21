// The one owner of reading history: daily totals per language, never what was read.
// It has its own database, so clearing it can't touch books or saved words, and it
// stays on this machine like they do.

import { committed, settled } from "./idb.js";
import { isRecord } from "./state.js";

const DATABASE = "tolk-history";
const DATABASE_VERSION = 3;
const STORE = "days";
/** Books finished, by book ID. A finish belongs to reading history, so it outlives the book. */
const FINISHED = "finished";
/** Each book's aquarium colour, by book ID. Like a finish, it outlives the book. */
const COLOURS = "colours";
/** Each language's fish shape, by language key. */
const SHAPES = "shapes";

/** How many book colours there are. After that many books, they repeat. */
export const BOOK_COLOURS = 8;
/** How many fish shapes there are. */
export const FISH_SHAPES = 3;
const MINUTE = 60;
/** A fourth language looks back this many days, its fish's day included. */
const SHAPE_LOOKBACK_DAYS = 30;

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

/** Book colours and language shapes, each an index into the palette or the shapes. */
export interface Identities {
  colours: Map<string, number>;
  shapes: Map<string, number>;
}

interface StoredColour {
  bookId: string;
  colour: number;
}

interface StoredShape {
  language: string;
  shape: number;
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

/**
 * The one place book colours and language shapes are given out. It walks every day
 * from the oldest and fills in what's missing, so the answer doesn't depend on when
 * it runs, and history from before these stores existed gets them too. One
 * transaction, so two library tabs can't hand out the same colour twice.
 */
export async function assignIdentities(): Promise<Identities> {
  const database = await openDatabase();
  const transaction = database.transaction([STORE, COLOURS, SHAPES], "readwrite");
  const colourStore = transaction.objectStore(COLOURS);
  const shapeStore = transaction.objectStore(SHAPES);
  const storedDays: unknown[] = await settled(transaction.objectStore(STORE).getAll());
  const storedColours: unknown[] = await settled(colourStore.getAll());
  const storedShapes: unknown[] = await settled(shapeStore.getAll());

  const identities: Identities = {
    colours: new Map(storedColours.flatMap((entry) => parseColour(entry) ?? []).map((entry) => [entry.bookId, entry.colour])),
    shapes: new Map(storedShapes.flatMap((entry) => parseShape(entry) ?? []).map((entry) => [entry.language, entry.shape])),
  };
  const days = storedDays.flatMap((entry) => parseDay(entry) ?? []);
  for (const [bookId, colour] of newColours(days, identities.colours)) {
    identities.colours.set(bookId, colour);
    colourStore.put({ bookId, colour } satisfies StoredColour);
  }
  for (const [language, shape] of newShapes(days, identities.shapes)) {
    identities.shapes.set(language, shape);
    shapeStore.put({ language, shape } satisfies StoredShape);
  }
  await committed(transaction);
  return identities;
}

/**
 * Books in the order they were first read, each taking the next colour. Within a
 * day, the book read longest goes first. The colours given out so far count as
 * used, including those of books since removed.
 */
function newColours(days: readonly DayTotals[], colours: ReadonlyMap<string, number>): Map<string, number> {
  const added = new Map<string, number>();
  let next = colours.size;
  for (const [, onDay] of byDate(days)) {
    const seconds = new Map<string, number>();
    for (const entry of onDay) {
      for (const [bookId, bookSeconds] of Object.entries(entry.books)) {
        seconds.set(bookId, (seconds.get(bookId) ?? 0) + bookSeconds);
      }
    }
    const read = [...seconds.entries()]
      .filter(([, bookSeconds]) => bookSeconds > 0)
      .sort(([firstId, first], [secondId, second]) => second - first || firstId.localeCompare(secondId));
    for (const [bookId] of read) {
      if (!colours.has(bookId) && !added.has(bookId)) {
        added.set(bookId, next % BOOK_COLOURS);
        next += 1;
      }
    }
  }
  return added;
}

/**
 * A language gets a shape on the first reading day it was read longest. The first
 * three take one each. A later one takes the shape of whichever language with a
 * shape was read least in the 30 days up to that day.
 */
function newShapes(days: readonly DayTotals[], shapes: ReadonlyMap<string, number>): Map<string, number> {
  const all = new Map(shapes);
  const added = new Map<string, number>();
  for (const [date, onDay] of byDate(days)) {
    const language = longestLanguage(onDay);
    if (language === null || all.has(language)) {
      continue;
    }
    const shape = all.size < FISH_SHAPES ? unusedShape(all) : leastReadShape(days, all, date);
    all.set(language, shape);
    added.set(language, shape);
  }
  return added;
}

/** The language read longest on a reading day, or null for a day under a minute. */
export function longestLanguage(onDay: readonly DayTotals[]): string | null {
  const total = onDay.reduce((sum, entry) => sum + entry.seconds, 0);
  if (total < MINUTE) {
    return null;
  }
  const seconds = new Map<string, number>();
  for (const entry of onDay) {
    seconds.set(entry.language, (seconds.get(entry.language) ?? 0) + entry.seconds);
  }
  const [longest] = [...seconds.entries()].sort(
    ([firstLanguage, first], [secondLanguage, second]) => second - first || firstLanguage.localeCompare(secondLanguage),
  );
  return longest?.[0] ?? null;
}

function unusedShape(shapes: ReadonlyMap<string, number>): number {
  const used = new Set(shapes.values());
  for (let shape = 0; shape < FISH_SHAPES; shape += 1) {
    if (!used.has(shape)) {
      return shape;
    }
  }
  return 0;
}

/** Ties go to the language that got its shape first, so the answer is always the same. */
function leastReadShape(days: readonly DayTotals[], shapes: ReadonlyMap<string, number>, date: string): number {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const from = localDate(new Date(year, month - 1, day - (SHAPE_LOOKBACK_DAYS - 1)));
  const seconds = new Map<string, number>([...shapes.keys()].map((language) => [language, 0]));
  for (const entry of days) {
    if (entry.date >= from && entry.date <= date && seconds.has(entry.language)) {
      seconds.set(entry.language, (seconds.get(entry.language) ?? 0) + entry.seconds);
    }
  }
  let least: string | null = null;
  for (const [language, languageSeconds] of seconds) {
    if (least === null || languageSeconds < (seconds.get(least) ?? 0)) {
      least = language;
    }
  }
  return least === null ? 0 : (shapes.get(least) ?? 0);
}

/** Days grouped by date, oldest first. */
function byDate(days: readonly DayTotals[]): [string, DayTotals[]][] {
  const grouped = new Map<string, DayTotals[]>();
  for (const entry of days) {
    grouped.set(entry.date, [...(grouped.get(entry.date) ?? []), entry]);
  }
  return [...grouped.entries()].sort(([first], [second]) => first.localeCompare(second));
}

export async function clearHistory(): Promise<void> {
  const database = await openDatabase();
  const stores = [STORE, FINISHED, COLOURS, SHAPES];
  const transaction = database.transaction(stores, "readwrite");
  for (const store of stores) {
    transaction.objectStore(store).clear();
  }
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
    // Earlier versions had fewer stores, so an upgrade adds what's missing.
    request.addEventListener("upgradeneeded", () => {
      const names = request.result.objectStoreNames;
      if (!names.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: ["date", "language"] });
      }
      if (!names.contains(FINISHED)) {
        request.result.createObjectStore(FINISHED, { keyPath: "bookId" });
      }
      if (!names.contains(COLOURS)) {
        request.result.createObjectStore(COLOURS, { keyPath: "bookId" });
      }
      if (!names.contains(SHAPES)) {
        request.result.createObjectStore(SHAPES, { keyPath: "language" });
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

function parseColour(stored: unknown): StoredColour | null {
  if (!isRecord(stored)) {
    return null;
  }
  const { bookId, colour } = stored;
  return typeof bookId === "string" && isIndex(colour, BOOK_COLOURS) ? { bookId, colour } : null;
}

function parseShape(stored: unknown): StoredShape | null {
  if (!isRecord(stored)) {
    return null;
  }
  const { language, shape } = stored;
  return typeof language === "string" && isIndex(shape, FISH_SHAPES) ? { language, shape } : null;
}

function isIndex(value: unknown, count: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < count;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
