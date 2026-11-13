// "Your reading" in the library: a month calendar of reading time, the chosen day's
// totals per language, and the month's total. It only reads history-store.ts,
// apart from clearing. Book titles are the reader's own data, so they go in as text.

import { requireElement } from "./controls.js";
import { clearHistory, firstDate, localDate, readDays, type DayTotals } from "./history-store.js";
import { languageName } from "./languages.js";
import { formatDuration, formatWords, UI_LOCALE } from "./reading-format.js";
import { isRecord } from "./state.js";

const LEVELS = 3;
const MINUTE = 60;

/** A month as its first day, at local midnight. */
let shown = firstOfMonth(new Date());
let chosen = localDate(new Date());
let earliest: string | null = null;
let days: DayTotals[] = [];
let titleOf: (bookId: string) => string | null = () => null;

/** `bookTitle` names a book by ID, or returns null for one that's been deleted. */
export function mountReadingHistory(bookTitle: (bookId: string) => string | null): void {
  titleOf = bookTitle;
  requireElement("history-previous").addEventListener("click", () => moveMonth(-1));
  requireElement("history-next").addEventListener("click", () => moveMonth(1));
  requireElement("history-clear").addEventListener("click", () => confirmClear(true));
  requireElement("history-clear-cancel").addEventListener("click", () => confirmClear(false));
  requireElement("history-clear-confirm").addEventListener("click", () => void clear());
  // Reading in another tab adds to today, so coming back here shows it.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void refreshHistory();
    }
  });
  window.addEventListener("pageshow", () => void refreshHistory());
}

export async function refreshHistory(): Promise<void> {
  try {
    earliest = await firstDate();
    const from = localDate(shown);
    const to = localDate(new Date(shown.getFullYear(), shown.getMonth() + 1, 0));
    days = earliest === null ? [] : await readDays(from, to);
    if (chosen < from || chosen > to) {
      chosen = defaultDay(from, to);
    }
  } catch (error) {
    console.warn("Couldn't load reading history.", error);
    earliest = null;
    days = [];
  }
  renderHistory();
}

/** Book titles can change when books are added or deleted. */
export function renderHistory(): void {
  const section = requireElement("history");
  section.hidden = earliest === null;
  if (earliest === null) {
    return;
  }
  renderMonthControls();
  renderCalendar();
  renderChosenDay();
  renderMonthTotal();
}

function moveMonth(direction: -1 | 1): void {
  if (!canMove(direction)) {
    return;
  }
  shown = new Date(shown.getFullYear(), shown.getMonth() + direction, 1);
  void refreshHistory();
}

function canMove(direction: -1 | 1): boolean {
  const thisMonth = firstOfMonth(new Date());
  if (direction === 1) {
    return shown < thisMonth;
  }
  // Dates are YYYY-MM-DD, so the first of the earliest month is a string compare away.
  return earliest !== null && localDate(shown) > `${earliest.slice(0, 8)}01`;
}

function renderMonthControls(): void {
  requireElement("history-month-name").textContent = new Intl.DateTimeFormat(UI_LOCALE, {
    month: "long",
    year: "numeric",
  }).format(shown);
  const previous = requireElement("history-previous");
  const next = requireElement("history-next");
  if (!(previous instanceof HTMLButtonElement) || !(next instanceof HTMLButtonElement)) {
    return;
  }
  previous.disabled = !canMove(-1);
  next.disabled = !canMove(1);
  // With only one month of history there's nowhere to go, so the arrows step aside.
  requireElement("history-months").dataset["single"] = String(previous.disabled && next.disabled);
}

function renderCalendar(): void {
  const first = firstWeekday();
  const weekday = new Intl.DateTimeFormat(UI_LOCALE, { weekday: "narrow" });
  const longWeekday = new Intl.DateTimeFormat(UI_LOCALE, { weekday: "long" });
  const dayLabel = new Intl.DateTimeFormat(UI_LOCALE, { day: "numeric", month: "long" });

  const head = document.createElement("tr");
  // 2024-01-01 was a Monday, so this walks a week starting from the locale's first day.
  for (let offset = 0; offset < 7; offset += 1) {
    const sample = new Date(2024, 0, first + offset);
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = weekday.format(sample);
    cell.title = longWeekday.format(sample);
    head.append(cell);
  }

  const totals = secondsByDate();
  const busiest = Math.max(0, ...totals.values());
  const today = localDate(new Date());
  const year = shown.getFullYear();
  const month = shown.getMonth();
  const length = new Date(year, month + 1, 0).getDate();
  // How many blank cells come before the 1st, for this locale's first weekday.
  const lead = (new Date(year, month, 1).getDay() - (first % 7) + 7) % 7;

  const rows: HTMLTableRowElement[] = [];
  let row = document.createElement("tr");
  for (let blank = 0; blank < lead; blank += 1) {
    row.append(document.createElement("td"));
  }
  for (let dayNumber = 1; dayNumber <= length; dayNumber += 1) {
    const date = localDate(new Date(year, month, dayNumber));
    const seconds = totals.get(date) ?? 0;
    const cell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-day-button";
    button.textContent = String(dayNumber);
    button.dataset["level"] = String(level(seconds, busiest));
    button.setAttribute(
      "aria-label",
      `${dayLabel.format(new Date(year, month, dayNumber))}, ${formatDuration(seconds)}`,
    );
    button.setAttribute("aria-pressed", String(date === chosen));
    if (date === today) {
      button.setAttribute("aria-current", "date");
    }
    if (date > today) {
      button.disabled = true;
    }
    button.addEventListener("click", () => {
      chosen = date;
      renderCalendar();
      renderChosenDay();
      // The calendar was rebuilt, so focus goes back to the day just chosen.
      requireElement("history-calendar")
        .querySelector<HTMLElement>('[aria-pressed="true"]')
        ?.focus();
    });
    cell.append(button);
    row.append(cell);
    if (row.children.length === 7) {
      rows.push(row);
      row = document.createElement("tr");
    }
  }
  if (row.children.length > 0) {
    rows.push(row);
  }

  const table = requireElement("history-calendar");
  const thead = document.createElement("thead");
  thead.append(head);
  const tbody = document.createElement("tbody");
  tbody.append(...rows);
  table.replaceChildren(thead, tbody);
}

function renderChosenDay(): void {
  const [year = 0, month = 1, day = 1] = chosen.split("-").map(Number);
  requireElement("history-day-title").textContent = new Intl.DateTimeFormat(UI_LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(year, month - 1, day));

  const onDay = days.filter((entry) => entry.date === chosen && entry.seconds > 0);
  const list = requireElement("history-day-list");
  list.replaceChildren(
    ...onDay
      .sort((first, second) => second.seconds - first.seconds)
      .map((entry) => {
        const item = document.createElement("li");
        item.textContent = [
          languageName(entry.language),
          formatDuration(entry.seconds),
          formatWords(entry.words),
        ].join(" · ");
        return item;
      }),
  );
  requireElement("history-day-empty").hidden = onDay.length > 0;

  const read = readOnDay(onDay);
  const books = requireElement("history-day-books");
  books.textContent = read.length === 0 ? "" : `Read: ${read.join(", ")}`;
  books.hidden = read.length === 0;
}

/** Book titles, longest first, then "Articles" for live pages. Deleted books are left out. */
function readOnDay(onDay: readonly DayTotals[]): string[] {
  const bookSeconds = new Map<string, number>();
  let articleSeconds = 0;
  for (const entry of onDay) {
    articleSeconds += entry.articleSeconds;
    for (const [bookId, seconds] of Object.entries(entry.books)) {
      bookSeconds.set(bookId, (bookSeconds.get(bookId) ?? 0) + seconds);
    }
  }
  const titles = [...bookSeconds.entries()]
    .sort(([, first], [, second]) => second - first)
    .flatMap(([bookId]) => titleOf(bookId) ?? []);
  return articleSeconds > 0 ? [...titles, "Articles"] : titles;
}

function renderMonthTotal(): void {
  const seconds = days.reduce((sum, entry) => sum + entry.seconds, 0);
  const wordCount = days.reduce((sum, entry) => sum + entry.words, 0);
  const name = new Intl.DateTimeFormat(UI_LOCALE, { month: "long" }).format(shown);
  requireElement("history-month-total").textContent =
    seconds === 0 ? `Nothing read in ${name}.` : `${name} · ${formatDuration(seconds)} · ${formatWords(wordCount)}`;
}

function confirmClear(asking: boolean): void {
  requireElement("history-clear").hidden = asking;
  requireElement("history-clear-question").hidden = !asking;
  if (asking) {
    requireElement("history-clear-cancel").focus();
  } else {
    requireElement("history-clear").focus();
  }
}

async function clear(): Promise<void> {
  try {
    await clearHistory();
  } catch (error) {
    console.warn("Couldn't clear reading history.", error);
  }
  requireElement("history-clear").hidden = false;
  requireElement("history-clear-question").hidden = true;
  shown = firstOfMonth(new Date());
  chosen = localDate(new Date());
  await refreshHistory();
}

/** Today in this month, or else the month's last day with reading, or else its first. */
function defaultDay(from: string, to: string): string {
  const today = localDate(new Date());
  if (today >= from && today <= to) {
    return today;
  }
  const read = days.filter((entry) => entry.seconds > 0).map((entry) => entry.date);
  return read.sort().at(-1) ?? from;
}

function secondsByDate(): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of days) {
    totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.seconds);
  }
  return totals;
}

/** None under a minute, then three steps scaled to the month's busiest day. */
function level(seconds: number, busiest: number): number {
  if (seconds < MINUTE || busiest === 0) {
    return 0;
  }
  return Math.min(LEVELS, Math.max(1, Math.ceil((seconds / busiest) * LEVELS)));
}

function firstOfMonth(when: Date): Date {
  return new Date(when.getFullYear(), when.getMonth(), 1);
}

/**
 * The browser locale's first day of the week, 1 for Monday to 7 for Sunday.
 * `getWeekInfo` is newer than the TypeScript library this project targets, so it's
 * read as `unknown` and checked, and a locale without it starts on Monday.
 */
function firstWeekday(): number {
  const locale: unknown = new Intl.Locale(navigator.language);
  if (!isRecord(locale) || typeof locale["getWeekInfo"] !== "function") {
    return 1;
  }
  const info: unknown = Reflect.apply(locale["getWeekInfo"], locale, []);
  const firstDay = isRecord(info) ? info["firstDay"] : undefined;
  return typeof firstDay === "number" && firstDay >= 1 && firstDay <= 7 ? firstDay : 1;
}
