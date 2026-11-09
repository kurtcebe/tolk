// The one owner of saved words. They live in IndexedDB so they stay on this
// machine, and this keeps a copy in memory so the UI can read them straight away.
// Other tabs hear about changes over a BroadcastChannel, which stays in the browser.

import { languageKey } from "./languages.js";
import { isRecord } from "./state.js";

const DATABASE = "tolk";
const DATABASE_VERSION = 1;
const STORE = "savedWords";
const CHANNEL = "tolk-saved-words";

export interface SavedSource {
  title: string;
  /** A live page's address. Words saved from elsewhere don't have one. */
  url?: string;
}

export interface SavedWord {
  id: string;
  word: string;
  /** Blank when translation wasn't available at the time. */
  translation: string;
  sentence: string;
  source: SavedSource;
  /** L2, as a language tag. */
  language: string;
  savedAt: number;
}

const listeners = new Set<() => void>();
const channel = new BroadcastChannel(CHANNEL);

let words: readonly SavedWord[] = [];
let opening: Promise<IDBDatabase> | null = null;
let loadFailed = false;

export async function loadSavedWords(): Promise<void> {
  channel.addEventListener("message", () => void refresh());
  await refresh();
}

export function getSavedWords(): readonly SavedWord[] {
  return words;
}

export function didSavedWordsFail(): boolean {
  return loadFailed;
}

export function subscribeSavedWords(listener: () => void): void {
  listeners.add(listener);
}

/** A word counts as saved once per language, whichever sentence it was saved from. */
export function findSavedWord(word: string, language: string): SavedWord | undefined {
  const key = wordKey(word, language);
  return words.find((saved) => wordKey(saved.word, saved.language) === key);
}

/** Resolves to false if the word couldn't be stored, so the caller can say so. */
export async function putSavedWord(word: SavedWord): Promise<boolean> {
  const written = await write((store) => store.put(word));
  if (written) {
    words = [...words.filter((saved) => saved.id !== word.id), word];
    changed();
  }
  return written;
}

export async function deleteSavedWord(id: string): Promise<boolean> {
  const written = await write((store) => store.delete(id));
  if (written) {
    words = words.filter((saved) => saved.id !== id);
    changed();
  }
  return written;
}

function wordKey(word: string, language: string): string {
  return `${languageKey(language)}:${word.toLocaleLowerCase(language)}`;
}

function changed(): void {
  channel.postMessage("changed");
  notify();
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

async function refresh(): Promise<void> {
  try {
    const database = await openDatabase();
    const store = database.transaction(STORE).objectStore(STORE);
    const stored: unknown[] = await settled(store.getAll());
    words = stored.flatMap((entry) => parseSavedWord(entry) ?? []);
    loadFailed = false;
  } catch (error) {
    console.warn("Couldn't load saved words.", error);
    loadFailed = true;
  }
  notify();
}

/** Waits for the transaction to commit, so "saved" is true even if the browser closes next. */
async function write(change: (store: IDBObjectStore) => IDBRequest): Promise<boolean> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(STORE, "readwrite");
    change(transaction.objectStore(STORE));
    await committed(transaction);
    return true;
  } catch (error) {
    console.warn("Couldn't update saved words.", error);
    return false;
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
      request.result.createObjectStore(STORE, { keyPath: "id" });
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

// `<T>` makes this generic: whatever type the request produces is what the
// promise resolves to, without writing one version of this per type.
function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => reject(transaction.error));
    transaction.addEventListener("abort", () => reject(transaction.error));
  });
}

/** Storage is a boundary, so what comes back is checked and anything malformed is skipped. */
function parseSavedWord(stored: unknown): SavedWord | null {
  if (!isRecord(stored) || !isRecord(stored["source"])) {
    return null;
  }
  const { id, word, translation, sentence, language, savedAt } = stored;
  const title = stored["source"]["title"];
  if (
    typeof id !== "string" ||
    typeof word !== "string" ||
    typeof translation !== "string" ||
    typeof sentence !== "string" ||
    typeof language !== "string" ||
    typeof savedAt !== "number" ||
    typeof title !== "string"
  ) {
    return null;
  }
  const url = stored["source"]["url"];
  const source: SavedSource = typeof url === "string" ? { title, url } : { title };
  return { id, word, translation, sentence, language, savedAt, source };
}
