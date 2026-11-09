// Every source becomes a TolkDocument, and nothing downstream knows where the
// text came from. It isn't called Document because that would shadow the
// browser's own Document type.

export type BlockType = "heading" | "paragraph" | "quote" | "list-item" | "image";

export interface BlockImage {
  /** Where the image sits in its source. Never an address that gets loaded directly. */
  path: string;
  alt: string;
}

export interface Block {
  id: string;
  type: BlockType;
  /** Inline content. Untrusted: it only reaches the page through render.ts. */
  html: string;
  /** A list item's bullet or number. Drawn in CSS, so it's never read aloud or indexed. */
  marker?: string;
  /** Set on an image block, which has no text and so never joins the word index. */
  image?: BlockImage;
}

export interface Chapter {
  id: string;
  title: string;
  blocks: Block[];
}

export type DocumentSource =
  | { kind: "sample" }
  | { kind: "page"; url: string }
  | { kind: "book"; bookId: string };

export interface TolkDocument {
  id: string;
  source: DocumentSource;
  title: string;
  author: string | null;
  /** The text's language as a BCP 47 tag, or null when it isn't known yet. */
  language: string | null;
  chapters: Chapter[];
  /** Gets an image from the source's own files. Only a book has any. */
  loadImage?: (path: string) => Promise<Blob | null>;
}
