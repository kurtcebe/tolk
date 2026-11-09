// Gets a chapter's images ready before the chapter appears. Knowing each one's size
// up front reserves its space, so nothing moves as images arrive and a restored
// reading position stays put. A blob address points at memory in this browser, and
// the images themselves only ever come from the book's own file (invariant 6).

import type { Chapter, TolkDocument } from "./document.js";

export interface PreparedImage {
  url: string;
  width: number;
  height: number;
}

/** Kept for the page's life, because a language change rebuilds a chapter with the same images. */
const prepared = new Map<string, PreparedImage | null>();

export async function prepareChapterImages(source: TolkDocument, chapter: Chapter): Promise<void> {
  const load = source.loadImage;
  if (load === undefined) {
    return;
  }
  const paths = chapter.blocks.flatMap((block) => block.image?.path ?? []);
  await Promise.all(
    [...new Set(paths)]
      .filter((path) => !prepared.has(path))
      .map(async (path) => prepared.set(path, await prepareImage(await load(path)))),
  );
}

/** Null when the image is missing or broken, which leaves it out of the chapter. */
export function preparedImage(path: string): PreparedImage | null {
  return prepared.get(path) ?? null;
}

async function prepareImage(blob: Blob | null): Promise<PreparedImage | null> {
  if (blob === null) {
    return null;
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return { url, width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    console.warn("A book image couldn't be decoded.", error);
    URL.revokeObjectURL(url);
    return null;
  }
}
