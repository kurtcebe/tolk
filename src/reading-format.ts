// How reading time and word counts read, the same in the library and the reader.

const MINUTE = 60;

/** The UI is in British English, so numbers read "4,120" and dates "12 November". */
export const UI_LOCALE = "en-GB";

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / MINUTE);
  if (minutes === 0) {
    return seconds === 0 ? "nothing read" : "under a minute";
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${minutes} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function formatWords(count: number): string {
  return `${count.toLocaleString(UI_LOCALE)} ${count === 1 ? "word" : "words"}`;
}
