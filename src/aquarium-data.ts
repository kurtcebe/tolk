// What the aquarium shows, worked out from reading history: a fish per reading day
// in the last 30, its colours and shape, the streak, how grown the plants are, and
// the counts under the tank. It only does arithmetic, so the drawing in aquarium.ts
// never reads storage.

import { localDate, longestLanguage, type DayTotals, type Identities } from "./history-store.js";
import { UI_LOCALE } from "./reading-format.js";

/** How many days the tank looks back over, today included. */
export const TANK_DAYS = 30;
const MINUTE = 60;
/** Head and tail are each drawn at least this share of the fish's length. */
const LEAST_PART = 0.2;
/** Plant growth is counted in days, and these are where a stage starts. */
const STAGES = [0, 3, 7, 14, 30];
const FULL_GROWTH = 30;

/**
 * What a fish is coloured by. This is a union of two object types, told apart by
 * `kind`: checking `kind === "book"` lets TypeScript know `bookId` is there.
 */
export type Source = { kind: "book"; bookId: string; colour: number } | { kind: "articles" };

export interface TankFish {
  /** The day it stands for, which also names it, so it keeps its place and layer. */
  date: string;
  /** The day's largest source. */
  head: Source;
  /** The second largest, or null when there's only one. */
  tail: Source | null;
  /** The third largest, drawn as stripes, or null. */
  stripes: Source | null;
  /**
   * The head's share of the fish's length: its share of the head and tail's time,
   * kept between 20% and 80% so the tail always shows. 1 with no tail.
   */
  split: number;
  /** An index into the fish shapes, from the day's longest-read language. */
  shape: number;
}

export interface Tank {
  fish: TankFish[];
  streak: number;
  /** 0 to 30, in days of growth. */
  growth: number;
  wordsSaved: number;
  finished: number;
}

/** The first date the tank covers: 29 days before today. */
export function tankStart(today: Date): Date {
  return addDays(today, -(TANK_DAYS - 1));
}

/**
 * `days` is every record from the first date with history to today. Saved words
 * and finishes are counted by the caller, since they come from other stores.
 */
export function buildTank(
  days: readonly DayTotals[],
  identities: Identities,
  today: Date,
  wordsSaved: number,
  finished: number,
): Tank {
  const byDate = groupByDate(days);
  const seconds = new Map([...byDate].map(([date, onDay]) => [date, totalSeconds(onDay)]));
  const isReadingDay = (date: string): boolean => (seconds.get(date) ?? 0) >= MINUTE;
  const todayDate = localDate(today);
  const start = localDate(tankStart(today));

  const fish: TankFish[] = [];
  for (const [date, onDay] of [...byDate].sort(([first], [second]) => first.localeCompare(second))) {
    if (date >= start && date <= todayDate && isReadingDay(date)) {
      fish.push(fishFor(date, onDay, identities));
    }
  }

  const first = [...byDate.keys()].sort()[0] ?? todayDate;
  return {
    fish,
    streak: streakOf(isReadingDay, today),
    growth: growthOf(isReadingDay, first, today),
    wordsSaved,
    finished,
  };
}

/** Today extends the streak once it's a reading day, but doesn't break it before then. */
function streakOf(isReadingDay: (date: string) => boolean, today: Date): number {
  let offset = isReadingDay(localDate(today)) ? 0 : 1;
  let streak = 0;
  while (isReadingDay(localDate(addDays(today, -offset)))) {
    streak += 1;
    offset += 1;
  }
  return streak;
}

/**
 * Plants grow a day for each reading day, up to 30, and drop back a stage for each
 * whole day missed, so a missed day costs little. Today can only add, not take away.
 * Walking the whole history keeps the answer the same however often it's worked out.
 */
function growthOf(isReadingDay: (date: string) => boolean, first: string, today: Date): number {
  const [year = 0, month = 1, day = 1] = first.split("-").map(Number);
  const todayDate = localDate(today);
  let growth = 0;
  for (let when = new Date(year, month - 1, day); localDate(when) <= todayDate; when = addDays(when, 1)) {
    const date = localDate(when);
    if (isReadingDay(date)) {
      growth = Math.min(FULL_GROWTH, growth + 1);
    } else if (date !== todayDate) {
      growth = stageBelow(growth);
    }
  }
  return growth;
}

function stageBelow(growth: number): number {
  return STAGES.filter((stage) => stage < growth).at(-1) ?? 0;
}

/**
 * The day's three largest sources, each book on its own and articles together: the
 * head, the tail and the stripes. A source read for under a minute is left out,
 * unless that would leave nothing. A book or language without an identity yet falls
 * back to the first.
 */
function fishFor(date: string, onDay: readonly DayTotals[], identities: Identities): TankFish {
  const sources: [Source, number][] = [];
  let articleSeconds = 0;
  const bookSeconds = new Map<string, number>();
  for (const entry of onDay) {
    articleSeconds += entry.articleSeconds;
    for (const [bookId, seconds] of Object.entries(entry.books)) {
      bookSeconds.set(bookId, (bookSeconds.get(bookId) ?? 0) + seconds);
    }
  }
  for (const [bookId, seconds] of bookSeconds) {
    sources.push([{ kind: "book", bookId, colour: identities.colours.get(bookId) ?? 0 }, seconds]);
  }
  sources.push([{ kind: "articles" }, articleSeconds]);
  const ranked = sources
    .filter(([, seconds]) => seconds > 0)
    .sort(([first, firstSeconds], [second, secondSeconds]) => secondSeconds - firstSeconds || sourceKey(first).localeCompare(sourceKey(second)));
  const kept = ranked.filter(([, seconds]) => seconds >= MINUTE);
  const [head, tail, stripes] = kept.length > 0 ? kept : ranked.slice(0, 1);
  const language = longestLanguage(onDay);
  return {
    date,
    head: head?.[0] ?? { kind: "articles" },
    tail: tail?.[0] ?? null,
    stripes: stripes?.[0] ?? null,
    split:
      head === undefined || tail === undefined
        ? 1
        : Math.min(1 - LEAST_PART, Math.max(LEAST_PART, head[1] / (head[1] + tail[1]))),
    shape: language === null ? 0 : (identities.shapes.get(language) ?? 0),
  };
}

function sourceKey(source: Source): string {
  return source.kind === "book" ? `book:${source.bookId}` : "articles";
}

function groupByDate(days: readonly DayTotals[]): Map<string, DayTotals[]> {
  const grouped = new Map<string, DayTotals[]>();
  for (const entry of days) {
    grouped.set(entry.date, [...(grouped.get(entry.date) ?? []), entry]);
  }
  return grouped;
}

function totalSeconds(onDay: readonly DayTotals[]): number {
  return onDay.reduce((sum, entry) => sum + entry.seconds, 0);
}

/** Counting in calendar days, so a clock change doesn't skip or repeat one. */
function addDays(when: Date, days: number): Date {
  return new Date(when.getFullYear(), when.getMonth(), when.getDate() + days);
}

/** "18 fish · 5-day streak · 42 words saved · 2 books finished", leaving out zeros. */
export function countLine(tank: Tank): string {
  if (tank.fish.length === 0) {
    return "No fish yet. Read for a minute today to add one.";
  }
  const parts = [`${tank.fish.length} fish`];
  if (tank.streak > 0) {
    parts.push(`${tank.streak}-day streak`);
  }
  if (tank.wordsSaved > 0) {
    parts.push(`${count(tank.wordsSaved, "word")} saved`);
  }
  if (tank.finished > 0) {
    parts.push(`${count(tank.finished, "book")} finished`);
  }
  return parts.join(" · ");
}

function count(amount: number, noun: string): string {
  return `${amount.toLocaleString(UI_LOCALE)} ${amount === 1 ? noun : `${noun}s`}`;
}
