// Why the toolbar icon landed on the library instead of an article. Only a reason
// travels in the address, never anything from the page.

export const LIBRARY_NOTES = {
  blocked: "Chrome doesn't let extensions read this page.",
  "no-article": "Tolk couldn't find an article on this page.",
  failed: "Tolk couldn't open this article.",
} as const;

export type LibraryNote = keyof typeof LIBRARY_NOTES;

export function isLibraryNote(value: string): value is LibraryNote {
  return Object.hasOwn(LIBRARY_NOTES, value);
}
