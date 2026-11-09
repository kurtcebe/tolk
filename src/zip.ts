// A small zip reader, enough for an EPUB. It reads the archive's central directory
// and unpacks one file at a time with the browser's own DecompressionStream, so
// nothing has to be vendored. Every number in a zip comes from the file and is
// untrusted, so offsets are bounds-checked and unpacking counts what it really gets.

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const END_RECORD_SIZE = 22;
const DIRECTORY_ENTRY_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const MAX_COMMENT_SIZE = 0xffff;
/** Zip64 stores its real values elsewhere. An EPUB has no reason to be that large. */
const ZIP64_MARKER = 0xffffffff;
const ENCRYPTED_FLAG = 1;
const STORED = 0;
const DEFLATED = 8;

/** A small file can unpack to something enormous, so both of these are capped. */
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;

export class ZipError extends Error {}

interface ZipEntry {
  method: number;
  isEncrypted: boolean;
  compressedSize: number;
  headerOffset: number;
}

export interface ZipArchive {
  has(path: string): boolean;
  /** Throws ZipError if the file is missing, damaged or too large. */
  read(path: string): Promise<Uint8Array<ArrayBuffer>>;
}

export async function openZip(file: Blob): Promise<ZipArchive> {
  const entries = await readDirectory(file);
  let unpackedBytes = 0;
  return {
    has: (path) => entries.has(path),
    read: async (path) => {
      const entry = entries.get(path);
      if (entry === undefined) {
        throw new ZipError(`The archive has no ${path}.`);
      }
      const bytes = await readEntry(file, entry, MAX_ARCHIVE_BYTES - unpackedBytes);
      unpackedBytes += bytes.length;
      return bytes;
    },
  };
}

async function readDirectory(file: Blob): Promise<Map<string, ZipEntry>> {
  const tailStart = Math.max(0, file.size - END_RECORD_SIZE - MAX_COMMENT_SIZE);
  const tail = new DataView(await file.slice(tailStart).arrayBuffer());
  const end = findEndRecord(tail);
  const count = tail.getUint16(end + 10, true);
  const size = tail.getUint32(end + 12, true);
  const offset = tail.getUint32(end + 16, true);
  if (size === ZIP64_MARKER || offset === ZIP64_MARKER || offset + size > file.size) {
    throw new ZipError("The archive's directory is out of range.");
  }

  const directory = new DataView(await file.slice(offset, offset + size).arrayBuffer());
  const names = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    if (
      cursor + DIRECTORY_ENTRY_SIZE > directory.byteLength ||
      directory.getUint32(cursor, true) !== DIRECTORY_ENTRY
    ) {
      throw new ZipError("The archive's directory is damaged.");
    }
    const nameLength = directory.getUint16(cursor + 28, true);
    const extraLength = directory.getUint16(cursor + 30, true);
    const commentLength = directory.getUint16(cursor + 32, true);
    const nameStart = cursor + DIRECTORY_ENTRY_SIZE;
    const name = names.decode(
      new Uint8Array(directory.buffer, nameStart, Math.min(nameLength, directory.byteLength - nameStart)),
    );
    entries.set(name, {
      method: directory.getUint16(cursor + 10, true),
      isEncrypted: (directory.getUint16(cursor + 8, true) & ENCRYPTED_FLAG) !== 0,
      compressedSize: directory.getUint32(cursor + 20, true),
      headerOffset: directory.getUint32(cursor + 42, true),
    });
    cursor = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Searches backwards, because the record can be followed by a comment. */
function findEndRecord(tail: DataView): number {
  for (let offset = tail.byteLength - END_RECORD_SIZE; offset >= 0; offset -= 1) {
    if (tail.getUint32(offset, true) === END_OF_DIRECTORY) {
      return offset;
    }
  }
  throw new ZipError("This isn't a zip archive.");
}

async function readEntry(
  file: Blob,
  entry: ZipEntry,
  bytesLeft: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (entry.isEncrypted) {
    throw new ZipError("This file in the archive is password-protected.");
  }
  if (entry.compressedSize === ZIP64_MARKER || entry.headerOffset === ZIP64_MARKER) {
    throw new ZipError("This file in the archive is out of range.");
  }
  const header = new DataView(
    await file.slice(entry.headerOffset, entry.headerOffset + LOCAL_HEADER_SIZE).arrayBuffer(),
  );
  if (header.byteLength < LOCAL_HEADER_SIZE || header.getUint32(0, true) !== LOCAL_HEADER) {
    throw new ZipError("A file in the archive is damaged.");
  }
  // The local header's lengths can differ from the directory's, so these are the ones to use.
  const start =
    entry.headerOffset + LOCAL_HEADER_SIZE + header.getUint16(26, true) + header.getUint16(28, true);
  const end = start + entry.compressedSize;
  if (end > file.size) {
    throw new ZipError("A file in the archive runs past its end.");
  }

  const limit = Math.min(MAX_FILE_BYTES, bytesLeft);
  const packed = file.slice(start, end);
  if (entry.method === STORED) {
    if (packed.size > limit) {
      throw new ZipError("A file in the archive is too large.");
    }
    return new Uint8Array(await packed.arrayBuffer());
  }
  if (entry.method === DEFLATED) {
    return await inflate(packed, limit);
  }
  throw new ZipError("A file in the archive uses an unknown compression method.");
}

/** Counts while unpacking, because the size a zip declares can't be trusted. */
async function inflate(packed: Blob, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = packed.stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        throw new ZipError("A file in the archive is too large.");
      }
      chunks.push(value);
    }
  } catch (error) {
    throw error instanceof ZipError ? error : new ZipError("A file in the archive is damaged.");
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
