// Every source becomes a TolkDocument, and nothing downstream knows where the
// text came from. It isn't called Document because that would shadow the
// browser's own Document type.

export type BlockType = "heading" | "paragraph" | "quote";

export interface Block {
  id: string;
  type: BlockType;
  /** Inline content. Untrusted: it only reaches the page through render.ts. */
  html: string;
}

export interface Chapter {
  id: string;
  title: string;
  blocks: Block[];
}

export type DocumentSource = { kind: "sample" };

export interface TolkDocument {
  id: string;
  source: DocumentSource;
  title: string;
  author: string | null;
  /** The text's language as a BCP 47 tag, or null when it isn't known yet. */
  language: string | null;
  chapters: Chapter[];
}
