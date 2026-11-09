// Reads an EPUB's structure: where its parts are, what order they go in and whether
// they can be read. Everything in the file is untrusted. It's only ever parsed in an
// inert DOMParser document, where scripts don't run and nothing loads.

import { openZip, ZipError, type ZipArchive } from "./zip.js";

export type EpubProblem = "drm" | "invalid";

/** Carries which message the library should show. */
export class EpubError extends Error {
  readonly problem: EpubProblem;

  constructor(problem: EpubProblem, message: string) {
    super(message);
    this.problem = problem;
  }
}

export interface ManifestItem {
  path: string;
  mediaType: string;
  properties: string[];
}

export interface SpineItem {
  path: string;
  mediaType: string;
  /** False for parts outside the main reading order, such as notes shown on demand. */
  isLinear: boolean;
}

export interface ContentsEntry {
  path: string;
  fragment: string | null;
  title: string;
}

export interface Epub {
  archive: ZipArchive;
  title: string;
  author: string | null;
  coverPath: string | null;
  manifest: ReadonlyMap<string, ManifestItem>;
  spine: SpineItem[];
  contents: ContentsEntry[];
}

const CONTAINER_PATH = "META-INF/container.xml";
const ENCRYPTION_PATH = "META-INF/encryption.xml";
const NCX_TYPE = "application/x-dtbncx+xml";
const FONT_FILE = /\.(?:otf|ttf|woff2?|odttf)$/i;

/** Self-closed in XHTML, but in HTML these would swallow everything after them as their text. */
const SELF_CLOSED_RAW_TEXT = /<(title|script|style|textarea|noscript|iframe|xmp)\b([^>]*)\/>/gi;

export async function readEpub(file: Blob, fallbackTitle: string): Promise<Epub> {
  try {
    const archive = await openZip(file);
    await rejectIfProtected(archive);
    const packagePath = await findPackagePath(archive);
    return await readPackage(archive, packagePath, fallbackTitle);
  } catch (error) {
    if (error instanceof ZipError) {
      throw new EpubError("invalid", error.message);
    }
    throw error;
  }
}

/**
 * encryption.xml is also how harmless font obfuscation is declared, and Tolk never
 * uses a book's fonts. So what decides this is what's encrypted: anything besides a
 * font means the book's text can't be read.
 */
async function rejectIfProtected(archive: ZipArchive): Promise<void> {
  if (!archive.has(ENCRYPTION_PATH)) {
    return;
  }
  const xml = parseXml(await readText(archive, ENCRYPTION_PATH));
  if (xml === null) {
    throw new EpubError("drm", "encryption.xml can't be read, so nothing can be ruled out.");
  }
  for (const encrypted of byName(xml, "EncryptedData")) {
    const target = byName(encrypted, "CipherReference")[0]?.getAttribute("URI") ?? "";
    if (!FONT_FILE.test(target)) {
      throw new EpubError("drm", `${target || "A part of this book"} is encrypted.`);
    }
  }
}

async function findPackagePath(archive: ZipArchive): Promise<string> {
  if (!archive.has(CONTAINER_PATH)) {
    throw new EpubError("invalid", "There's no container.xml.");
  }
  const xml = requireXml(await readText(archive, CONTAINER_PATH), CONTAINER_PATH);
  for (const rootfile of byName(xml, "rootfile")) {
    const path = rootfile.getAttribute("full-path");
    if (path !== null && archive.has(path)) {
      return path;
    }
  }
  throw new EpubError("invalid", "The container points to no package file.");
}

async function readPackage(
  archive: ZipArchive,
  packagePath: string,
  fallbackTitle: string,
): Promise<Epub> {
  const xml = requireXml(await readText(archive, packagePath), packagePath);
  const manifestById = readManifest(xml, packagePath);
  const spineElement = byName(xml, "spine")[0];
  const spine = readSpine(spineElement, manifestById);
  if (spine.length === 0) {
    throw new EpubError("invalid", "The package lists nothing to read.");
  }
  const metadata = byName(xml, "metadata")[0];
  const creators = byName(metadata, "creator").flatMap((creator) => squeeze(creator.textContent) || []);
  const manifest = new Map([...manifestById.values()].map((item) => [item.path, item]));
  return {
    archive,
    title: squeeze(byName(metadata, "title")[0]?.textContent) || fallbackTitle,
    author: creators.length > 0 ? creators.join(", ") : null,
    coverPath: findCover(metadata, manifestById),
    manifest,
    spine,
    contents: await readContents(archive, spineElement, manifestById),
  };
}

function readManifest(xml: XMLDocument, packagePath: string): Map<string, ManifestItem> {
  const items = new Map<string, ManifestItem>();
  for (const item of byName(xml, "item")) {
    const id = item.getAttribute("id");
    // A remote resource resolves to null here, so nothing can ever ask for it.
    const target = resolveHref(packagePath, item.getAttribute("href") ?? "");
    if (id !== null && target !== null) {
      items.set(id, {
        path: target.path,
        mediaType: (item.getAttribute("media-type") ?? "").toLowerCase(),
        properties: (item.getAttribute("properties") ?? "").split(/\s+/),
      });
    }
  }
  return items;
}

function readSpine(
  spine: Element | undefined,
  manifest: ReadonlyMap<string, ManifestItem>,
): SpineItem[] {
  return byName(spine, "itemref").flatMap((reference) => {
    const item = manifest.get(reference.getAttribute("idref") ?? "");
    return item === undefined
      ? []
      : {
          path: item.path,
          mediaType: item.mediaType,
          isLinear: reference.getAttribute("linear") !== "no",
        };
  });
}

/** EPUB 3 marks its cover in the manifest, EPUB 2 in a meta tag, and some only by name. */
function findCover(
  metadata: Element | undefined,
  manifest: ReadonlyMap<string, ManifestItem>,
): string | null {
  const items = [...manifest.entries()];
  const marked = items.find(([, item]) => item.properties.includes("cover-image"))?.[1];
  const meta = byName(metadata, "meta").find((element) => element.getAttribute("name") === "cover");
  const named = manifest.get(meta?.getAttribute("content") ?? "");
  const guessed = items.find(
    ([id, item]) => item.mediaType.startsWith("image/") && /cover/i.test(`${id} ${item.path}`),
  )?.[1];
  const cover = marked ?? named ?? guessed;
  return cover?.mediaType.startsWith("image/") === true ? cover.path : null;
}

/** A book can read without its contents list, so a broken one isn't a failure. */
async function readContents(
  archive: ZipArchive,
  spine: Element | undefined,
  manifest: ReadonlyMap<string, ManifestItem>,
): Promise<ContentsEntry[]> {
  const items = [...manifest.values()];
  const nav = items.find((item) => item.properties.includes("nav"));
  const ncx =
    manifest.get(spine?.getAttribute("toc") ?? "") ??
    items.find((item) => item.mediaType === NCX_TYPE);
  try {
    if (nav !== undefined && archive.has(nav.path)) {
      const entries = readNav(parseContent(await readText(archive, nav.path)), nav.path);
      if (entries.length > 0) {
        return entries;
      }
    }
    if (ncx !== undefined && archive.has(ncx.path)) {
      return readNcx(requireXml(await readText(archive, ncx.path), ncx.path), ncx.path);
    }
  } catch (error) {
    console.warn("Tolk couldn't read this book's contents list.", error);
  }
  return [];
}

function readNav(document_: Document, navPath: string): ContentsEntry[] {
  const navs = byName(document_, "nav");
  const toc = navs.find((nav) => (nav.getAttribute("epub:type") ?? "").includes("toc")) ?? navs[0];
  return byName(toc, "a").flatMap((link) =>
    toEntry(navPath, link.getAttribute("href"), link.textContent || link.getAttribute("title")),
  );
}

function readNcx(xml: XMLDocument, ncxPath: string): ContentsEntry[] {
  return byName(xml, "navPoint").flatMap((point) => {
    const label = byName(byName(point, "navLabel")[0], "text")[0]?.textContent;
    return toEntry(ncxPath, byName(point, "content")[0]?.getAttribute("src"), label);
  });
}

function toEntry(
  basePath: string,
  href: string | null | undefined,
  title: string | null | undefined,
): ContentsEntry[] {
  const target = resolveHref(basePath, href ?? "");
  return target === null ? [] : [{ ...target, title: squeeze(title) }];
}

/**
 * Resolves a reference against the file it appears in. Returns null for anything
 * with a scheme or host, because a remote reference is never followed (invariant 6).
 */
export function resolveHref(
  basePath: string,
  href: string,
): { path: string; fragment: string | null } | null {
  if (href === "" || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
    return null;
  }
  const [withoutFragment = "", fragment] = href.split("#", 2);
  const relative = decoded(withoutFragment.split("?", 1)[0] ?? "");
  const segments = relative.startsWith("/") ? [] : basePath.split("/").slice(0, -1);
  for (const segment of relative.split("/")) {
    if (segment === "..") {
      segments.pop();
    } else if (segment !== "." && segment !== "") {
      segments.push(segment);
    }
  }
  return {
    // A bare "#note" points into the file it's in.
    path: segments.length > 0 ? segments.join("/") : basePath,
    fragment: fragment === undefined || fragment === "" ? null : decoded(fragment),
  };
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export async function readText(archive: ZipArchive, path: string): Promise<string> {
  return decodeText(await archive.read(path));
}

/**
 * DOMParser takes a string, so a file's declared encoding has to be honoured before
 * it gets there. Older books are often Latin-1, which UTF-8 would turn into � marks.
 */
function decodeText(bytes: Uint8Array<ArrayBuffer>): string {
  const [first, second] = bytes;
  if (first === 0xff && second === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (first === 0xfe && second === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  const start = new TextDecoder("latin1").decode(bytes.subarray(0, 256));
  const declared =
    /<\?xml[^>]*encoding\s*=\s*["']([\w.-]+)["']/i.exec(start)?.[1] ??
    /<meta[^>]*charset\s*=\s*["']?([\w.-]+)/i.exec(start)?.[1];
  if (declared !== undefined && !/^utf-?8$/i.test(declared)) {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      console.warn(`Tolk doesn't know the encoding ${declared}, so it's trying UTF-8.`);
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function parseXml(text: string): XMLDocument | null {
  const parsed = new DOMParser().parseFromString(text, "application/xml");
  return parsed.querySelector("parsererror") === null ? parsed : null;
}

function requireXml(text: string, path: string): XMLDocument {
  const xml = parseXml(text);
  if (xml === null) {
    throw new EpubError("invalid", `${path} isn't valid XML.`);
  }
  return xml;
}

/**
 * Parses a chapter file. XHTML is strict and real books often break its rules, for
 * example with `&nbsp;` and no doctype, so anything it refuses goes through the
 * forgiving HTML parser instead of losing the chapter.
 */
export function parseContent(text: string): Document {
  const strict = new DOMParser().parseFromString(text, "application/xhtml+xml");
  if (strict.querySelector("parsererror") === null) {
    return strict;
  }
  return new DOMParser().parseFromString(
    text.replace(SELF_CLOSED_RAW_TEXT, "<$1$2></$1>"),
    "text/html",
  );
}

/** Finds elements by local name, so it doesn't matter which namespace prefix a file uses. */
export function byName(parent: ParentNode | undefined, name: string): Element[] {
  if (parent === undefined) {
    return [];
  }
  return [...(parent as Element | Document).getElementsByTagNameNS("*", name)];
}

export function squeeze(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}
