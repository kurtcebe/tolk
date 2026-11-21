// What the aquarium shows, worked out from reading history: a fish per reading day
// in the last 30, the streak, how grown the plants are, and the counts under the
// tank. It only does arithmetic, so the drawing in aquarium.ts never reads storage.

import { localDate, type DayTotals } from "./history-store.js";
import { UI_LOCALE } from "./reading-format.js";

/** How many days the tank looks back over, today included. */
export const TANK_DAYS = 30;
const MINUTE = 60;
/** Plant growth is counted in days, and these are where a stage starts. */
const STAGES = [0, 3, 7, 14, 30];
const FULL_GROWTH = 30;

export interface TankFish {
  /** The day it stands for, which also names it, so it keeps its place and layer. */
  date: string;
  seconds: number;
  bookSeconds: number;
  articleSeconds: number;
}

export interface Tank {
  fish: TankFish[];
  streak: number;
  /** 0 to 30, in days of growth. */
  growth: number;
  wordsSaved: number;
  finished: number;
}

/** A day's time, added up across languages. */
interface DaySum {
  seconds: number;
  bookSeconds: number;
  articleSeconds: number;
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
  today: Date,
  wordsSaved: number,
  finished: number,
): Tank {
  const sums = sumByDate(days);
  const isReadingDay = (date: string): boolean => (sums.get(date)?.seconds ?? 0) >= MINUTE;
  const todayDate = localDate(today);
  const start = localDate(tankStart(today));

  const fish: TankFish[] = [];
  for (const [date, sum] of [...sums.entries()].sort(([first], [second]) => first.localeCompare(second))) {
    if (date >= start && date <= todayDate && isReadingDay(date)) {
      fish.push({ date, ...sum });
    }
  }

  const first = [...sums.keys()].sort()[0] ?? todayDate;
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

function sumByDate(days: readonly DayTotals[]): Map<string, DaySum> {
  const sums = new Map<string, DaySum>();
  for (const entry of days) {
    const sum = sums.get(entry.date) ?? { seconds: 0, bookSeconds: 0, articleSeconds: 0 };
    sum.seconds += entry.seconds;
    sum.articleSeconds += entry.articleSeconds;
    for (const seconds of Object.values(entry.books)) {
      sum.bookSeconds += seconds;
    }
    sums.set(entry.date, sum);
  }
  return sums;
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
